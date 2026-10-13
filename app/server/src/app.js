import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { COOKIE, cookieOptions, login, logout, requireRole, userForToken } from './auth.js'
import { buildCatalog, hash } from './catalog.js'
import { renderPresentation } from './render.js'

const PUBLIC_API = new Set(['/api/health', '/api/login'])

// opts: db (pg.Pool), baseHtmlPath (index.html), webDist (build de app/web), brochuresDir,
//       secureCookies (true en producción), trustProxy (detrás de Traefik), logger
export function buildApp ({ db, baseHtmlPath, webDist, brochuresDir, secureCookies = true, trustProxy = false, logger } = {}) {
  const app = Fastify({ logger, trustProxy })
  app.register(cookie)

  app.addHook('onRequest', async (req, reply) => {
    req.user = db ? await userForToken(db, req.cookies?.[COOKIE]) : null
    const path = req.url.split('?')[0]
    if (path.startsWith('/api/') && !PUBLIC_API.has(path) && !req.user) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })

  // GIT_SHA lo inyecta el deploy (PJW-003)
  app.get('/api/health', async () => ({ ok: true, version: process.env.GIT_SHA || 'dev' }))

  app.post('/api/login', async (req, reply) => {
    const { email, password } = req.body || {}
    const r = await login(db, email, password)
    if (r.error === 'locked') return reply.code(429).send({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' })
    if (r.error) return reply.code(401).send({ error: 'Mail o clave incorrectos.' })
    reply.setCookie(COOKIE, r.token, cookieOptions(secureCookies))
    return { user: r.user }
  })

  app.post('/api/logout', async (req, reply) => {
    await logout(db, req.cookies[COOKIE])
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/me', async req => ({ user: req.user }))

  app.get('/api/presentations', async () =>
    (await db.query('SELECT id, name, lang, is_fixed, published, updated_at FROM presentations ORDER BY is_fixed DESC, updated_at DESC')).rows)

  // Validación de lo que manda el admin. Devuelve el error o los campos limpios.
  const strings = a => Array.isArray(a) && a.every(x => typeof x === 'string')
  function presentationFields ({ name, lang = 'es', sections = [], hidden = [] } = {}) {
    if (typeof name !== 'string' || !name.trim()) return { error: 'Falta el nombre.' }
    if (!['es', 'en'].includes(lang) || !strings(sections) || !strings(hidden)) return { error: 'Datos inválidos.' }
    return { name: name.trim(), lang, sections: JSON.stringify(sections), hidden: JSON.stringify(hidden) }
  }
  const builder = requireRole('admin', 'presenter')
  // La "Web completa" no se edita ni se borra
  const editable = async (req, reply) => {
    const { rows: [p] } = await db.query('SELECT is_fixed FROM presentations WHERE id = $1', [Number(req.params.id) || 0])
    if (!p) return reply.code(404).send({ error: 'Presentación inexistente.' })
    if (p.is_fixed) return reply.code(403).send({ error: 'La Web completa no se puede cambiar.' })
  }

  app.post('/api/presentations', { preHandler: builder }, async (req, reply) => {
    const f = presentationFields(req.body)
    if (f.error) return reply.code(400).send(f)
    const { rows: [p] } = await db.query(
      'INSERT INTO presentations (name, lang, sections, hidden, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [f.name, f.lang, f.sections, f.hidden, req.user.id])
    return reply.code(201).send(p)
  })

  app.get('/api/presentations/:id', async (req, reply) => {
    const { rows: [p] } = await db.query('SELECT * FROM presentations WHERE id = $1', [Number(req.params.id) || 0])
    return p || reply.code(404).send({ error: 'Presentación inexistente.' })
  })

  app.put('/api/presentations/:id', { preHandler: [builder, editable] }, async (req, reply) => {
    const f = presentationFields(req.body)
    if (f.error) return reply.code(400).send(f)
    await db.query('UPDATE presentations SET name = $2, lang = $3, sections = $4, hidden = $5, updated_at = now() WHERE id = $1',
      [req.params.id, f.name, f.lang, f.sections, f.hidden])
    return { ok: true }
  })

  app.delete('/api/presentations/:id', { preHandler: [builder, editable] }, async req => {
    await db.query('DELETE FROM presentations WHERE id = $1', [req.params.id])
    return { ok: true }
  })

  // Publicar (PJW-017): / muestra la publicada. El editor también publica.
  app.post('/api/presentations/:id/publish', { preHandler: requireRole('admin', 'presenter', 'editor') }, async (req, reply) => {
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE presentations SET published = false WHERE published')
      const r = await client.query('UPDATE presentations SET published = true WHERE id = $1', [Number(req.params.id) || 0])
      if (!r.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Presentación inexistente.' }) }
      await client.query('COMMIT')
      return { ok: true }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally { client.release() }
  })

  // Catálogo de index.html para el admin. Las fotos van aparte (/api/thumb): son base64 pesados.
  let baseHtml = null
  let catalog = null
  const thumbs = new Map()
  function getCatalog () {
    if (catalog) return catalog
    baseHtml ??= readFileSync(baseHtmlPath, 'utf8')
    catalog = buildCatalog(baseHtml)
    for (const s of catalog.sections) {
      for (const e of s.elements) if (e.src) { thumbs.set(e.id, e.src); e.src = undefined; e.thumb = true }
    }
    return catalog
  }
  app.get('/api/catalog', async () => getCatalog())
  app.get('/api/thumb/:id', async (req, reply) => {
    getCatalog()
    const m = /^data:([^;]+);base64,(.*)$/s.exec(thumbs.get(req.params.id) || '')
    if (!m) return reply.code(404).send({ error: 'Sin miniatura.' })
    return reply.type(m[1]).header('cache-control', 'private, max-age=86400').send(Buffer.from(m[2], 'base64'))
  })

  // Avisos de cambios (PJW-011): lo guardado que ya no existe en el index.html actual.
  // Los IDs llevan el hash del contenido, así que un texto o foto que cambió en la web base
  // deja de existir con su ID viejo y aparece acá.
  app.get('/api/changes', async () => {
    const cat = getCatalog()
    const sections = new Set(cat.sections.map(s => s.id))
    const elements = new Set(cat.sections.flatMap(s => s.elements.map(e => e.id)))
    const texts = new Set(cat.sections.flatMap(s => s.texts.map(t => t.id)))
    const { rows: ov } = await db.query('SELECT element_id, lang, text FROM text_overrides ORDER BY element_id, lang')
    const { rows: pres } = await db.query('SELECT id, name, sections, hidden FROM presentations WHERE NOT is_fixed ORDER BY name')
    return {
      texts: ov.filter(o => !texts.has(o.element_id)),
      presentations: pres.map(p => ({
        id: p.id,
        name: p.name,
        sections: p.sections.filter(id => !sections.has(id)),
        hidden: p.hidden.filter(id => !elements.has(id) && sections.has(id.split(':')[0]))
      })).filter(p => p.sections.length || p.hidden.length)
    }
  })

  // Sacar de una presentación lo que ya no existe
  app.post('/api/presentations/:id/clean', { preHandler: builder }, async (req, reply) => {
    const cat = getCatalog()
    const sections = new Set(cat.sections.map(s => s.id))
    const elements = new Set(cat.sections.flatMap(s => s.elements.map(e => e.id)))
    const { rows: [p] } = await db.query('SELECT sections, hidden FROM presentations WHERE id = $1 AND NOT is_fixed', [Number(req.params.id) || 0])
    if (!p) return reply.code(404).send({ error: 'Presentación inexistente.' })
    await db.query('UPDATE presentations SET sections = $2, hidden = $3, updated_at = now() WHERE id = $1',
      [req.params.id, JSON.stringify(p.sections.filter(id => sections.has(id))), JSON.stringify(p.hidden.filter(id => elements.has(id)))])
    return { ok: true }
  })

  // Textos corregidos (PJW-009): globales, por elemento e idioma. Nunca tocan index.html.
  const textEditor = requireRole('admin', 'presenter', 'editor')
  app.get('/api/texts', async () =>
    (await db.query('SELECT element_id, lang, text, original_hash, updated_at FROM text_overrides')).rows)

  app.put('/api/texts/:id/:lang', { preHandler: textEditor }, async (req, reply) => {
    const { id, lang } = req.params
    const original = getCatalog().sections.flatMap(s => s.texts).find(t => t.id === id)?.[lang]
    const text = req.body?.text
    if (original == null) return reply.code(404).send({ error: 'Texto inexistente.' })
    if (typeof text !== 'string' || !text.trim()) return reply.code(400).send({ error: 'El texto no puede quedar vacío.' })
    await db.query(`INSERT INTO text_overrides (element_id, lang, text, original_hash, updated_by) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (element_id, lang) DO UPDATE SET text = $3, original_hash = $4, updated_by = $5, updated_at = now()`,
    [id, lang, text, hash(original), req.user.id])
    return { ok: true }
  })

  // Volver al original
  app.delete('/api/texts/:id/:lang', { preHandler: textEditor }, async req => {
    await db.query('DELETE FROM text_overrides WHERE element_id = $1 AND lang = $2', [req.params.id, req.params.lang])
    return { ok: true }
  })

  // Vista previa (PJW-016): la sección del texto con lo escrito, sin guardar nada
  app.post('/api/texts/:id/:lang/preview', { preHandler: textEditor }, async (req, reply) => {
    const { id, lang } = req.params
    const section = getCatalog().sections.find(s => s.texts.some(t => t.id === id))
    const text = req.body?.text
    if (!section || !['es', 'en'].includes(lang)) return reply.code(404).send({ error: 'Texto inexistente.' })
    if (typeof text !== 'string') return reply.code(400).send({ error: 'Falta el texto.' })
    const overrides = {}
    for (const o of (await db.query('SELECT element_id, lang, text FROM text_overrides')).rows) (overrides[o.element_id] ??= {})[o.lang] = o.text
    overrides[id] = { ...overrides[id], [lang]: text }
    const html = renderPresentation(baseHtml, { sections: [section.id], hidden: [], lang, overrides })
    return reply.type('text/html; charset=utf-8').header('cache-control', 'private, no-store').send(html)
  })

  // Una sección sola con los textos corregidos (PJW-018). Con ?thumb, sin menú ni scroll: la miniatura.
  // ponytail: de a un render por vez (cada uno parsea el index.html entero, ~200 MB) y en cache
  // hasta que cambie un texto: ~40 MB para las 27 secciones en los dos idiomas.
  const thumbCache = new Map()
  let thumbVersion = ''
  let thumbQueue = Promise.resolve()
  app.get('/api/sections/:id/preview', async (req, reply) => {
    const { id } = req.params
    const lang = req.query.lang === 'en' ? 'en' : 'es'
    if (!getCatalog().sections.some(s => s.id === id)) return reply.code(404).send({ error: 'Sección inexistente.' })
    const { rows: ov } = await db.query('SELECT element_id, lang, text, updated_at FROM text_overrides')
    const version = ov.map(o => o.element_id + o.lang + +o.updated_at).join('|')
    if (version !== thumbVersion) { thumbCache.clear(); thumbVersion = version }
    const key = id + ':' + lang
    if (!thumbCache.has(key)) {
      const overrides = {}
      for (const o of ov) (overrides[o.element_id] ??= {})[o.lang] = o.text
      const job = thumbQueue.then(() => thumbCache.get(key) ?? renderPresentation(baseHtml, { sections: [id], hidden: [], lang, overrides }))
      thumbQueue = job.catch(() => {})
      thumbCache.set(key, await job)
    }
    const html = thumbCache.get(key)
    return reply.type('text/html; charset=utf-8').header('cache-control', 'private, max-age=300')
      .send('thumb' in req.query ? html.replace('</head>', '<style>#hdr{display:none!important}html{overflow:hidden}</style></head>') : html)
  })

  // Presentación renderizada. Sin sesión, al login (que vuelve acá después).
  // ponytail: cache en memoria por versión de presentación + textos; se invalida sola al cambiar algo
  const cache = new Map()
  const COLS = 'SELECT id, lang, sections, hidden, updated_at FROM presentations'
  async function sendRendered (reply, p) {
    if (!p) return reply.code(404).send('Presentación inexistente')
    const { rows: ov } = await db.query('SELECT element_id, lang, text, updated_at FROM text_overrides')
    const key = `${p.id}:${+p.updated_at}:${ov.map(o => o.element_id + o.lang + +o.updated_at).join('|')}`
    if (!cache.has(key)) {
      baseHtml ??= readFileSync(baseHtmlPath, 'utf8')
      const overrides = {}
      for (const o of ov) (overrides[o.element_id] ??= {})[o.lang] = o.text
      for (const k of cache.keys()) if (k.startsWith(p.id + ':')) cache.delete(k)
      cache.set(key, renderPresentation(baseHtml, { ...p, overrides }))
      if (cache.size > 4) cache.delete(cache.keys().next().value) // ~27 MB cada una; el contenedor tiene 1 GB
    }
    return reply.type('text/html; charset=utf-8').header('cache-control', 'private, no-store').send(cache.get(key))
  }
  app.get('/p/:id', async (req, reply) => {
    if (!req.user) return reply.redirect(`/?next=${encodeURIComponent(req.url)}`)
    return sendRendered(reply, (await db.query(COLS + ' WHERE id = $1', [Number(req.params.id) || 0])).rows[0])
  })
  // / con sesión: la publicada (si se borró, la Web completa). Sin sesión: el login.
  app.get('/', async (req, reply) => {
    if (!req.user) return webDist && existsSync(webDist) ? reply.sendFile('index.html') : reply.code(404).send()
    return sendRendered(reply, (await db.query(COLS + ' ORDER BY published DESC, is_fixed DESC LIMIT 1')).rows[0])
  })

  // Brochures: públicos, igual que hoy en GitHub Pages
  if (brochuresDir && existsSync(brochuresDir)) {
    app.register(fastifyStatic, { root: brochuresDir, prefix: '/brochures/', decorateReply: false })
  }

  // Front (login, /presentar, /admin). Devuelven index.html y el front decide qué mostrar.
  if (webDist && existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false, index: false })
    app.get('/admin', (req, reply) => reply.sendFile('index.html'))
    app.get('/presentar', (req, reply) => reply.sendFile('index.html'))
  }

  return app
}
