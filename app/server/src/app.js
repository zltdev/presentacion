import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { COOKIE, cookieOptions, login, logout, requireRole, userForToken } from './auth.js'
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
    (await db.query('SELECT id, name, lang, is_fixed, updated_at FROM presentations ORDER BY is_fixed DESC, updated_at DESC')).rows)

  app.post('/api/presentations', { preHandler: requireRole('admin', 'presenter') }, async (req, reply) => {
    const { name, lang = 'es', sections = [], hidden = [] } = req.body || {}
    if (!name?.trim()) return reply.code(400).send({ error: 'Falta el nombre.' })
    const { rows: [p] } = await db.query(
      'INSERT INTO presentations (name, lang, sections, hidden, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name.trim(), lang, JSON.stringify(sections), JSON.stringify(hidden), req.user.id])
    return reply.code(201).send(p)
  })

  // Presentación renderizada. Sin sesión, al login (que vuelve acá después).
  // ponytail: cache en memoria por versión de presentación + textos; se invalida sola al cambiar algo
  let baseHtml = null
  const cache = new Map()
  app.get('/p/:id', async (req, reply) => {
    if (!req.user) return reply.redirect(`/?next=${encodeURIComponent(req.url)}`)
    const { rows: [p] } = await db.query('SELECT id, lang, sections, hidden, updated_at FROM presentations WHERE id = $1', [Number(req.params.id) || 0])
    if (!p) return reply.code(404).send('Presentación inexistente')
    const { rows: ov } = await db.query('SELECT element_id, lang, text, updated_at FROM text_overrides')
    const key = `${p.id}:${+p.updated_at}:${ov.map(o => o.element_id + o.lang + +o.updated_at).join('|')}`
    if (!cache.has(key)) {
      baseHtml ??= readFileSync(baseHtmlPath, 'utf8')
      const overrides = {}
      for (const o of ov) (overrides[o.element_id] ??= {})[o.lang] = o.text
      for (const k of cache.keys()) if (k.startsWith(p.id + ':')) cache.delete(k)
      cache.set(key, renderPresentation(baseHtml, { ...p, overrides }))
    }
    return reply.type('text/html; charset=utf-8').header('cache-control', 'private, no-store').send(cache.get(key))
  })

  // Brochures: públicos, igual que hoy en GitHub Pages
  if (brochuresDir && existsSync(brochuresDir)) {
    app.register(fastifyStatic, { root: brochuresDir, prefix: '/brochures/', decorateReply: false })
  }

  // Front (login, /, /admin). Las rutas del front devuelven index.html y el front decide qué mostrar.
  if (webDist && existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false })
    app.get('/admin', (req, reply) => reply.sendFile('index.html'))
  }

  return app
}
