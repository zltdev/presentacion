import { test, expect, beforeAll, afterAll, inject } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { hashPassword } from '../src/auth.js'
import { hash } from '../src/catalog.js'
import { migrate } from '../src/db/migrate.js'

// Contra el index.html real: el admin trabaja sobre su catálogo
const base = fileURLToPath(new URL('../../../index.html', import.meta.url))
const url = inject('databaseUrl')
let db, app
const as = {}

beforeAll(async () => {
  await migrate(url)
  db = new pg.Pool({ connectionString: url })
  app = buildApp({ db, baseHtmlPath: base, secureCookies: false })
  for (const role of ['admin', 'presenter', 'editor']) {
    const email = `adm-${role}@zlt.test`
    await db.query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $1, $2, $3) ON CONFLICT DO NOTHING', [email, role, await hashPassword('x')])
    const r = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'x' } })
    as[role] = (opts) => app.inject({ ...opts, headers: { cookie: `zlt_session=${r.cookies[0].value}` } })
  }
})
afterAll(async () => { await app.close(); await db.end() })

test('el presentador arma, edita y borra; la vista previa refleja lo elegido', async () => {
  const cat = (await as.presenter({ url: '/api/catalog' })).json()
  const secs = cat.sections.filter(s => s.elements.some(e => e.type === 'foto')).slice(0, 4)
  expect(secs).toHaveLength(4)
  const foto = secs[0].elements.find(e => e.type === 'foto')
  expect(foto.thumb).toBe(true)
  expect(foto.src).toBeUndefined()
  const img = await as.presenter({ url: `/api/thumb/${encodeURIComponent(foto.id)}` })
  expect(img.statusCode).toBe(200)
  expect(img.headers['content-type']).toMatch(/^image\//)

  const body = { name: 'Inversores', lang: 'en', sections: secs.map(s => s.id).reverse(), hidden: [foto.id] }
  const { id } = (await as.presenter({ method: 'POST', url: '/api/presentations', payload: body })).json()
  expect((await as.presenter({ method: 'PUT', url: `/api/presentations/${id}`, payload: { ...body, name: 'Inversores 2' } })).statusCode).toBe(200)
  const saved = (await as.presenter({ url: `/api/presentations/${id}` })).json()
  expect(saved).toMatchObject({ ...body, name: 'Inversores 2' })

  const html = (await as.presenter({ url: `/p/${id}` })).body
  const order = secs.map(s => html.indexOf(`id="${s.id}"`))
  expect(order.every(i => i > 0)).toBe(true)
  expect([...order].sort((a, b) => b - a)).toEqual(order) // invertido
  expect(html).not.toContain(`id="${cat.sections.find(s => !body.sections.includes(s.id)).id}"`)

  expect((await as.presenter({ method: 'DELETE', url: `/api/presentations/${id}` })).statusCode).toBe(200)
  expect((await as.presenter({ url: `/api/presentations/${id}` })).statusCode).toBe(404)
})

test('la Web completa no se edita ni se borra; el editor no arma; datos inválidos dan 400', async () => {
  const web = (await as.admin({ url: '/api/presentations' })).json().find(p => p.is_fixed)
  expect((await as.admin({ method: 'DELETE', url: `/api/presentations/${web.id}` })).statusCode).toBe(403)
  expect((await as.admin({ method: 'PUT', url: `/api/presentations/${web.id}`, payload: { name: 'X' } })).statusCode).toBe(403)
  expect((await as.editor({ method: 'POST', url: '/api/presentations', payload: { name: 'X' } })).statusCode).toBe(403)
  expect((await as.admin({ method: 'POST', url: '/api/presentations', payload: { name: 'X', lang: 'fr' } })).statusCode).toBe(400)
  expect((await as.admin({ method: 'POST', url: '/api/presentations', payload: { name: 'X', sections: 'hero' } })).statusCode).toBe(400)
})

test('el editor corrige un texto: se ve en todas las presentaciones, index.html no cambia, y vuelve al original', async () => {
  const before = hash(readFileSync(base, 'utf8'))
  const t = (await as.editor({ url: '/api/catalog' })).json().sections.flatMap(s => s.texts).find(t => t.es.trim().length > 5)
  const web = (await as.editor({ url: '/api/presentations' })).json().find(p => p.is_fixed)
  const tid = encodeURIComponent(t.id)

  expect((await as.editor({ method: 'PUT', url: `/api/texts/${tid}/es`, payload: { text: 'Texto corregido por Conra' } })).statusCode).toBe(200)
  expect((await as.editor({ url: '/api/texts' })).json()).toContainEqual(expect.objectContaining({ element_id: t.id, lang: 'es', original_hash: hash(t.es) }))
  expect((await as.editor({ url: `/p/${web.id}` })).body).toContain('Texto corregido por Conra')
  expect(hash(readFileSync(base, 'utf8'))).toBe(before)

  expect((await as.editor({ method: 'PUT', url: `/api/texts/${tid}/es`, payload: { text: '  ' } })).statusCode).toBe(400)
  expect((await as.editor({ method: 'PUT', url: '/api/texts/nada/es', payload: { text: 'x' } })).statusCode).toBe(404)
  await as.editor({ method: 'DELETE', url: `/api/texts/${tid}/es` })
  expect((await as.editor({ url: `/p/${web.id}` })).body).not.toContain('Texto corregido por Conra')
})

test('vista previa de un texto: solo su sección, con lo escrito y en su idioma, sin guardar', async () => {
  const cat = (await as.editor({ url: '/api/catalog' })).json()
  const sec = cat.sections.find(s => s.texts.length)
  const other = cat.sections.find(s => s !== sec)
  const r = await as.editor({ method: 'POST', url: `/api/texts/${encodeURIComponent(sec.texts[0].id)}/en/preview`, payload: { text: 'Draft preview text' } })
  expect(r.statusCode).toBe(200)
  expect(r.body).toContain('Draft preview text')
  expect(r.body).toContain(`id="${sec.id}"`)
  expect(r.body).not.toContain(`id="${other.id}"`)
  expect(r.body).toMatch(/<html[^>]*lang="en"/)
  expect((await as.editor({ url: '/api/texts' })).json()).toEqual([])
})
