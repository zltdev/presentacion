import { test, expect, beforeAll, afterAll, inject } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { hashPassword } from '../src/auth.js'
import { migrate } from '../src/db/migrate.js'

const url = inject('databaseUrl')
let db, app
const PW = 'clave-de-prueba'

// HTML base mínimo: el render real se prueba en render.test.js
const base = join(mkdtempSync(join(tmpdir(), 'zlt-base-')), 'index.html')
writeFileSync(base, '<html><head><script src="/gate.js"></script></head><body><section id="hero">Hola</section></body></html>')

beforeAll(async () => {
  await migrate(url)
  db = new pg.Pool({ connectionString: url })
  for (const [email, role] of [['auth-admin@zlt.test', 'admin'], ['auth-ceo@zlt.test', 'presenter'], ['auth-editor@zlt.test', 'editor'], ['auth-lock@zlt.test', 'editor']]) {
    await db.query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $1, $2, $3) ON CONFLICT DO NOTHING', [email, role, await hashPassword(PW)])
  }
  app = buildApp({ db, baseHtmlPath: base, secureCookies: false })
})
afterAll(async () => { await app.close(); await db.end() })

async function loginAs (email, password = PW) {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password } })
  const c = res.cookies.find(c => c.name === 'zlt_session')
  return { res, cookie: c && `zlt_session=${c.value}`, raw: c }
}

test('sin sesión: /api/* da 401 y /p/:id redirige al login', async () => {
  expect((await app.inject('/api/me')).statusCode).toBe(401)
  expect((await app.inject('/api/presentations')).statusCode).toBe(401)
  const r = await app.inject('/p/1')
  expect(r.statusCode).toBe(302)
  expect(r.headers.location).toBe('/?next=%2Fp%2F1')
  expect((await app.inject('/api/health')).statusCode).toBe(200)
})

test('login correcto: cookie httpOnly, /api/me y presentación renderizada sin gate', async () => {
  const { res, cookie, raw } = await loginAs('AUTH-CEO@zlt.test')
  expect(res.statusCode).toBe(200)
  expect(raw).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })
  expect((await app.inject({ url: '/api/me', headers: { cookie } })).json().user.role).toBe('presenter')

  const list = (await app.inject({ url: '/api/presentations', headers: { cookie } })).json()
  const web = list.find(p => p.is_fixed)
  expect(web.name).toBe('Web completa')
  const page = await app.inject({ url: `/p/${web.id}`, headers: { cookie } })
  expect(page.statusCode).toBe(200)
  expect(page.body).toContain('id="hero"')
  expect(page.body).not.toContain('gate.js')
})

test('clave incorrecta: 401 y no hay cookie', async () => {
  const { res, raw } = await loginAs('auth-ceo@zlt.test', 'mal')
  expect(res.statusCode).toBe(401)
  expect(raw).toBeUndefined()
})

test('el editor no puede crear presentaciones (403); el presentador sí', async () => {
  const ed = await loginAs('auth-editor@zlt.test')
  const r = await app.inject({ method: 'POST', url: '/api/presentations', headers: { cookie: ed.cookie }, payload: { name: 'X' } })
  expect(r.statusCode).toBe(403)
  const ceo = await loginAs('auth-ceo@zlt.test')
  const ok = await app.inject({ method: 'POST', url: '/api/presentations', headers: { cookie: ceo.cookie }, payload: { name: 'Inversores', sections: ['hero'] } })
  expect(ok.statusCode).toBe(201)
})

test('tras 5 intentos fallidos se bloquea el login, aun con la clave correcta', async () => {
  for (let i = 0; i < 5; i++) await loginAs('auth-lock@zlt.test', 'mal')
  const { res } = await loginAs('auth-lock@zlt.test')
  expect(res.statusCode).toBe(429)
})

test('logout invalida la sesión', async () => {
  const { cookie } = await loginAs('auth-admin@zlt.test')
  await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie } })
  expect((await app.inject({ url: '/api/me', headers: { cookie } })).statusCode).toBe(401)
})

test('las claves se guardan solo como hash argon2id', async () => {
  const { rows } = await db.query("SELECT password_hash FROM users WHERE email LIKE 'auth-%'")
  for (const r of rows) {
    expect(r.password_hash).toMatch(/^\$argon2id\$/)
    expect(r.password_hash).not.toContain(PW)
  }
})
