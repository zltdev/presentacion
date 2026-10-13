import { useEffect, useMemo, useState } from 'react'
import { destination } from './destination.js'
import './app.css'

const api = (url, opts = {}) => fetch(url, {
  ...opts,
  headers: { 'content-type': 'application/json', ...opts.headers },
  body: opts.body && JSON.stringify(opts.body)
})

export default function App () {
  const [user, setUser] = useState(undefined) // undefined = cargando, null = sin sesión
  useEffect(() => {
    api('/api/me').then(r => r.ok ? r.json() : { user: null }).then(d => setUser(d.user))
  }, [])

  if (user === undefined) return null
  if (!user) return <Login />

  const admin = location.pathname.startsWith('/admin')
  if (!admin && user.role === 'editor') { location.replace('/admin'); return null }
  return (
    <div className='shell'>
      <header className='top'>
        <img src='/logo.webp' alt='ZLT' />
        <nav>
          {user.role !== 'editor' && <a href='/' className={admin ? '' : 'on'}>Presentar</a>}
          <a href='/admin' className={admin ? 'on' : ''}>Administrar</a>
        </nav>
        <span className='who'>{user.name}</span>
        <button className='link' onClick={() => api('/api/logout', { method: 'POST' }).then(() => location.assign('/'))}>Salir</button>
      </header>
      {admin ? <Admin user={user} /> : <Presentations />}
    </div>
  )
}

function Login () {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit (e) {
    e.preventDefault()
    const choice = e.nativeEvent.submitter?.value || 'presentar'
    const f = new FormData(e.currentTarget)
    setBusy(true); setErr('')
    const r = await api('/api/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } })
    const d = await r.json()
    setBusy(false)
    if (!r.ok) return setErr(d.error || 'No se pudo entrar.')
    location.assign(destination(d.user.role, choice, new URLSearchParams(location.search).get('next')))
  }
  return (
    <main className='login'>
      <img className='logo' src='/logo.webp' alt='ZLT' />
      <form className='card' onSubmit={submit}>
        <label htmlFor='email'>MAIL</label>
        <input id='email' name='email' type='email' autoComplete='username' required autoFocus />
        <label htmlFor='password'>CLAVE</label>
        <input id='password' name='password' type='password' autoComplete='current-password' required />
        <div className='actions'>
          <button type='submit' value='presentar' disabled={busy}>PRESENTAR</button>
          <button type='submit' value='admin' className='alt' disabled={busy}>ADMINISTRAR</button>
        </div>
        <p className='err' role='alert'>{err}</p>
      </form>
    </main>
  )
}

function Presentations () {
  const [list, setList] = useState([])
  useEffect(() => { api('/api/presentations').then(r => r.json()).then(setList) }, [])
  return (
    <main className='page'>
      <h1>Presentaciones</h1>
      <ul className='grid'>
        {list.map(p => (
          <li key={p.id}>
            <a href={`/p/${p.id}`}>
              <strong>{p.name}</strong>
              <span>{p.is_fixed ? 'La web original entera' : p.lang === 'en' ? 'English' : 'Español'}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

const json = r => r.json().then(d => { if (!r.ok) throw new Error(d.error || 'Error'); return d })

function Admin ({ user }) {
  const builder = user.role !== 'editor' // el editor solo corrige textos
  const [tab, setTab] = useState(builder ? 'pres' : 'txt')
  const [catalog, setCatalog] = useState(null)
  useEffect(() => { api('/api/catalog').then(json).then(setCatalog) }, [])
  return (
    <main className='page'>
      <h1>Administrar</h1>
      <div className='tabs'>
        {builder && <button className={tab === 'pres' ? 'on' : ''} onClick={() => setTab('pres')}>Presentaciones</button>}
        <button className={tab === 'txt' ? 'on' : ''} onClick={() => setTab('txt')}>Textos</button>
      </div>
      {!catalog ? <p className='muted'>Cargando…</p> : tab === 'pres' ? <Builder catalog={catalog} /> : <Texts catalog={catalog} />}
    </main>
  )
}

function Builder ({ catalog }) {
  const [list, setList] = useState([])
  const [p, setP] = useState(null) // presentación en edición
  const [msg, setMsg] = useState('')
  const load = () => api('/api/presentations').then(json).then(setList)
  useEffect(() => { load() }, [])

  const open = id => api(`/api/presentations/${id}`).then(json).then(d => { setP(d); setMsg('') })
  const fresh = () => { setP({ name: '', lang: 'es', sections: [], hidden: [] }); setMsg('') }
  const set = patch => setP(x => ({ ...x, ...patch }))
  const fail = e => setMsg(e.message)

  async function save (data = p) {
    // sin secciones el render muestra todo: eso es solo para la Web completa
    if (!data.sections.length) return setMsg('Elegí al menos una sección.')
    const body = { name: data.name, lang: data.lang, sections: data.sections, hidden: data.hidden }
    const r = data.id
      ? await api(`/api/presentations/${data.id}`, { method: 'PUT', body }).then(json)
      : await api('/api/presentations', { method: 'POST', body }).then(json)
    await load()
    await open(data.id || r.id)
    setMsg('Guardado.')
  }
  const duplicate = () => save({
    ...p,
    id: undefined,
    name: `Copia de ${p.name}`,
    sections: p.is_fixed ? catalog.sections.map(s => s.id) : p.sections
  }).catch(fail)
  async function remove () {
    if (!confirm(`¿Borrar "${p.name}"?`)) return
    try {
      await api(`/api/presentations/${p.id}`, { method: 'DELETE' }).then(json)
      setP(null)
      load()
    } catch (e) { fail(e) }
  }

  return (
    <div className='builder'>
      <aside>
        <button className='btn' onClick={fresh}>+ Nueva</button>
        <ul>
          {list.map(x => (
            <li key={x.id}><button className={p?.id === x.id ? 'on' : ''} onClick={() => open(x.id)}>{x.name}</button></li>
          ))}
        </ul>
      </aside>
      {!p ? <p className='muted'>Elegí una presentación o creá una nueva.</p> : (
        <section className='editor'>
          <div className='row'>
            <input aria-label='Nombre' placeholder='Nombre' value={p.name} disabled={p.is_fixed} onChange={e => set({ name: e.target.value })} />
            <select aria-label='Idioma' value={p.lang} disabled={p.is_fixed} onChange={e => set({ lang: e.target.value })}>
              <option value='es'>Español</option>
              <option value='en'>English</option>
            </select>
          </div>
          <div className='row'>
            {!p.is_fixed && <button className='btn' onClick={() => save().catch(fail)}>Guardar</button>}
            {p.id && <a className='btn alt' href={`/p/${p.id}`} target='_blank' rel='noreferrer'>Vista previa</a>}
            {p.id && <button className='btn alt' onClick={duplicate}>Duplicar</button>}
            {p.id && !p.is_fixed && <button className='btn danger' onClick={remove}>Borrar</button>}
            <span className='muted'>{msg}</span>
          </div>
          {p.is_fixed
            ? <p className='muted'>La Web completa muestra todo index.html y no se puede cambiar. Duplicala para armar una a partir de ella.</p>
            : <Sections catalog={catalog} p={p} set={set} />}
        </section>
      )}
    </div>
  )
}

function Sections ({ catalog, p, set }) {
  const byId = useMemo(() => new Map(catalog.sections.map(s => [s.id, s])), [catalog])
  const chosen = p.sections.filter(id => byId.has(id))
  const rest = catalog.sections.filter(s => !chosen.includes(s.id))
  const hidden = new Set(p.hidden)
  const move = (i, d) => {
    const a = [...chosen]
    ;[a[i], a[i + d]] = [a[i + d], a[i]]
    set({ sections: a })
  }
  const toggleEl = id => set({ hidden: hidden.has(id) ? p.hidden.filter(x => x !== id) : [...p.hidden, id] })
  const btn = fn => e => { e.preventDefault(); fn() } // que no abra/cierre el <details>

  return (
    <>
      <h2>En la presentación ({chosen.length})</h2>
      <ol className='secs'>
        {chosen.map((id, i) => {
          const s = byId.get(id)
          return (
            <li key={id}>
              <details>
                <summary>
                  <span className='t'>{s.title}</span>
                  <button title='Subir' disabled={!i} onClick={btn(() => move(i, -1))}>↑</button>
                  <button title='Bajar' disabled={i === chosen.length - 1} onClick={btn(() => move(i, 1))}>↓</button>
                  <button title='Quitar' onClick={btn(() => set({ sections: chosen.filter(x => x !== id) }))}>✕</button>
                </summary>
                {s.elements.length
                  ? (
                    <div className='els'>
                      {s.elements.map(e => (
                        <label key={e.id} className={hidden.has(e.id) ? 'off' : ''} title={hidden.has(e.id) ? 'Oculto' : 'Visible'}>
                          <input type='checkbox' checked={!hidden.has(e.id)} onChange={() => toggleEl(e.id)} />
                          {e.thumb ? <img src={`/api/thumb/${encodeURIComponent(e.id)}`} alt={e.label} loading='lazy' /> : <span>{e.label}</span>}
                        </label>
                      ))}
                    </div>
                    )
                  : <p className='muted pad'>Sin elementos para ocultar.</p>}
              </details>
            </li>
          )
        })}
      </ol>
      <h2>Agregar secciones</h2>
      <ul className='add'>
        {rest.map(s => <li key={s.id}><button onClick={() => set({ sections: [...chosen, s.id] })}>+ {s.title}</button></li>)}
      </ul>
    </>
  )
}

function Texts ({ catalog }) {
  const [ov, setOv] = useState({}) // "id|lang" -> texto corregido
  const [q, setQ] = useState('')
  const load = () => api('/api/texts').then(json).then(rows => setOv(Object.fromEntries(rows.map(r => [r.element_id + '|' + r.lang, r.text]))))
  useEffect(() => { load() }, [])
  const needle = q.trim().toLowerCase()
  const match = t => !needle || [t.es, t.en, ov[t.id + '|es'], ov[t.id + '|en']].some(x => x?.toLowerCase().includes(needle))

  return (
    <div className='texts'>
      <p className='muted'>Las correcciones se aplican en todas las presentaciones. La web base no se toca.</p>
      <input className='search' placeholder='Buscar texto…' value={q} onChange={e => setQ(e.target.value)} />
      {catalog.sections.map(s => {
        const ts = s.texts.filter(match)
        return ts.length > 0 && (
          // ponytail: son ~450 campos; plegados por sección y abiertos solo al buscar
          <details key={s.id + !!needle} open={!!needle}>
            <summary>{s.title} <span className='muted'>({ts.length})</span></summary>
            {ts.map(t => ['es', 'en'].map(lang => (
              <TextField key={t.id + lang} t={t} lang={lang} value={ov[t.id + '|' + lang]} reload={load} />
            )))}
          </details>
        )
      })}
    </div>
  )
}

function TextField ({ t, lang, value, reload }) {
  const current = value ?? t[lang]
  const [draft, setDraft] = useState(current)
  const [err, setErr] = useState('')
  useEffect(() => setDraft(current), [current])
  const url = `/api/texts/${encodeURIComponent(t.id)}/${lang}`
  const run = req => req.then(json).then(() => { setErr(''); return reload() }).catch(e => setErr(e.message))
  return (
    <div className={'tf' + (value != null ? ' changed' : '')}>
      <span className='lang'>{lang.toUpperCase()}</span>
      <textarea rows={Math.min(6, Math.ceil(draft.length / 90) || 1)} value={draft} onChange={e => setDraft(e.target.value)} />
      <div className='row'>
        {draft !== current && <button className='btn' onClick={() => run(api(url, { method: 'PUT', body: { text: draft } }))}>Guardar</button>}
        {value != null && <button className='btn alt' onClick={() => run(api(url, { method: 'DELETE' }))}>Volver al original</button>}
        {value != null && <span className='muted' title={t[lang]}>Corregido</span>}
        <span className='err'>{err}</span>
      </div>
    </div>
  )
}
