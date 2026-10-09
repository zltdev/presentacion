import { useEffect, useState } from 'react'
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
      {admin ? <Admin /> : <Presentations />}
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

function Admin () {
  return (
    <main className='page'>
      <h1>Administrar</h1>
      <p className='muted'>Acá se van a armar las presentaciones y corregir textos (próximas tareas).</p>
    </main>
  )
}
