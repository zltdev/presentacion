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
    as[role] = (opts) => app.inject({ ...opts, headers: { ...opts.headers, cookie: `zlt_session=${r.cookies[0].value}` } })
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
  const saved = () => as.editor({ url: '/api/texts' }).then(r => r.json().filter(o => o.element_id === sec.texts[0].id))
  const before = await saved()
  const r = await as.editor({ method: 'POST', url: `/api/texts/${encodeURIComponent(sec.texts[0].id)}/en/preview`, payload: { text: 'Draft preview text' } })
  expect(r.statusCode).toBe(200)
  expect(r.body).toContain('Draft preview text')
  expect(r.body).toContain(`id="${sec.id}"`)
  expect(r.body).not.toContain(`id="${other.id}"`)
  expect(r.body).toMatch(/<html[^>]*lang="en"/)
  expect(await saved()).toEqual(before)
})

test('publicar: / muestra la publicada, una sola a la vez; el editor publica pero no arma; borrada vuelve a la Web completa', async () => {
  const cat = (await as.admin({ url: '/api/catalog' })).json()
  const [a, b] = cat.sections.slice(-2).map(s => s.id)
  const list = () => as.admin({ url: '/api/presentations' }).then(r => r.json())
  expect((await list()).filter(p => p.published).map(p => p.is_fixed)).toEqual([true]) // arranca la Web completa

  const { id } = (await as.presenter({ method: 'POST', url: '/api/presentations', payload: { name: 'Publicable', sections: [a] } })).json()
  expect((await as.editor({ method: 'PUT', url: `/api/presentations/${id}`, payload: { name: 'X', sections: [b] } })).statusCode).toBe(403)
  expect((await as.editor({ method: 'POST', url: `/api/presentations/${id}/publish` })).statusCode).toBe(200)
  expect((await list()).filter(p => p.published).map(p => p.id)).toEqual([id])
  const home = (await as.editor({ url: '/' })).body
  expect(home).toContain(`id="${a}"`)
  expect(home).not.toContain(`id="${b}"`)

  await as.presenter({ method: 'DELETE', url: `/api/presentations/${id}` })
  expect((await as.editor({ url: '/' })).body).toContain(`id="${b}"`) // Web completa
  expect((await as.editor({ method: 'POST', url: '/api/presentations/999999/publish' })).statusCode).toBe(404)
})

test('miniatura de sección: solo esa sección, en su idioma; ?thumb esconde el menú; inexistente da 404', async () => {
  const [s, other] = (await as.editor({ url: '/api/catalog' })).json().sections
  const r = await as.editor({ url: `/api/sections/${s.id}/preview?lang=en` })
  expect(r.statusCode).toBe(200)
  expect(r.body).toContain(`id="${s.id}"`)
  expect(r.body).not.toContain(`id="${other.id}"`)
  expect(r.body).toMatch(/<html[^>]*lang="en"/)
  expect(r.body).not.toContain('#hdr{display:none')
  expect((await as.editor({ url: `/api/sections/${s.id}/preview?thumb` })).body).toContain('#hdr{display:none')
  expect((await as.editor({ url: '/api/sections/nada/preview' })).statusCode).toBe(404)
})

test('avisos de cambios: lo guardado que ya no existe en index.html aparece y se puede limpiar', async () => {
  const cat = (await as.admin({ url: '/api/catalog' })).json()
  const sec = cat.sections.find(s => s.elements.length)
  const { id } = (await as.presenter({
    method: 'POST',
    url: '/api/presentations',
    payload: { name: 'Con huérfanos', sections: [sec.id, 'seccion-borrada'], hidden: [sec.elements[0].id, `${sec.id}:foto:00000bad`] }
  })).json()
  await db.query("INSERT INTO text_overrides (element_id, lang, text, original_hash) VALUES ('hero:txt:viejo', 'es', 'Texto viejo', 'x') ON CONFLICT DO NOTHING")

  const ch = (await as.editor({ url: '/api/changes' })).json()
  expect(ch.texts).toContainEqual(expect.objectContaining({ element_id: 'hero:txt:viejo', text: 'Texto viejo' }))
  const mine = ch.presentations.find(p => p.id === id)
  expect(mine).toMatchObject({ sections: ['seccion-borrada'], hidden: [`${sec.id}:foto:00000bad`] })

  expect((await as.editor({ method: 'POST', url: `/api/presentations/${id}/clean` })).statusCode).toBe(403)
  expect((await as.presenter({ method: 'POST', url: `/api/presentations/${id}/clean` })).statusCode).toBe(200)
  expect((await as.presenter({ url: `/api/presentations/${id}` })).json()).toMatchObject({ sections: [sec.id], hidden: [sec.elements[0].id] })
  expect((await as.editor({ url: '/api/changes' })).json().presentations.find(p => p.id === id)).toBeUndefined()
  await as.editor({ method: 'DELETE', url: '/api/texts/hero%3Atxt%3Aviejo/es' })
  await as.presenter({ method: 'DELETE', url: `/api/presentations/${id}` })
})

test('velocidad: las presentaciones no llevan base64 (las imágenes van aparte y cacheables) y viajan comprimidas', async () => {
  const web = (await as.admin({ url: '/api/presentations' })).json().find(p => p.is_fixed)
  const page = await as.admin({ url: `/p/${web.id}` })
  expect(page.body).not.toMatch(/data:image\/[\w+.-]+;base64,/)
  expect(page.body.length).toBeLessThan(1_000_000)
  const src = /\/api\/img\/[0-9a-f]{20}/.exec(page.body)?.[0]
  expect(src).toBeTruthy()
  const img = await as.admin({ url: src })
  expect(img.statusCode).toBe(200)
  expect(img.headers['content-type']).toMatch(/^image\//)
  expect(img.headers['cache-control']).toContain('immutable')
  expect(img.rawPayload.length).toBeGreaterThan(500)
  expect((await app.inject({ url: src })).statusCode).toBe(401) // sin sesión no se baja
  const gz = await as.admin({ url: `/p/${web.id}`, headers: { 'accept-encoding': 'br, gzip' } })
  expect(gz.headers['content-encoding']).toBe('br')
  expect(gz.rawPayload.length).toBeLessThan(page.rawPayload.length / 2)
})

test('PDF de una presentación: lo baja el presentador, no el editor; fotos para el PDF hasta 2 por sección', async () => {
  const cat = (await as.admin({ url: '/api/catalog' })).json()
  const sec = cat.sections.find(s => s.project)
  const [a, b, c] = sec.elements.filter(e => e.type === 'foto').map(e => e.id)
  const body = { name: 'Dossier á é', lang: 'es', sections: [sec.id], pdf_photos: [a, b] }
  expect((await as.presenter({ method: 'POST', url: '/api/presentations', payload: { ...body, pdf_photos: [a, b, c] } })).statusCode).toBe(400)
  const { id } = (await as.presenter({ method: 'POST', url: '/api/presentations', payload: body })).json()
  expect((await as.presenter({ url: `/api/presentations/${id}` })).json().pdf_photos).toEqual([a, b])

  expect((await as.editor({ url: `/api/presentations/${id}/pdf` })).statusCode).toBe(403)
  const r = await as.presenter({ url: `/api/presentations/${id}/pdf` })
  expect(r.statusCode).toBe(200)
  expect(r.headers['content-type']).toBe('application/pdf')
  expect(r.headers['content-disposition']).toContain('ZLT-Dossier-a-e.pdf')
  expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  expect((await as.presenter({ url: '/api/presentations/999999/pdf' })).statusCode).toBe(404)
  await as.presenter({ method: 'DELETE', url: `/api/presentations/${id}` })
}, 60000)
