import { test, expect, beforeAll, afterAll, inject } from 'vitest'
import pg from 'pg'
import { migrate } from '../src/db/migrate.js'

const url = inject('databaseUrl')
let db
beforeAll(async () => {
  await migrate(url)
  db = new pg.Client({ connectionString: url })
  await db.connect()
})
afterAll(() => db.end())

test('las migraciones son idempotentes', async () => {
  expect(await migrate(url)).toEqual([])
})

test('presentación, override y envío con sus contactos', async () => {
  const { rows: [u] } = await db.query(
    "INSERT INTO users (email, name, role, password_hash) VALUES ('ceo@somoszlt.com', 'CEO', 'presenter', 'x') RETURNING id")
  const { rows: [p] } = await db.query(
    `INSERT INTO presentations (name, lang, sections, hidden, created_by)
     VALUES ('Inversores USA', 'en', '["hero","p-plazasusa"]', '["p-plazasusa:gslide:ab12"]', $1) RETURNING id`, [u.id])
  await db.query(
    "INSERT INTO text_overrides (element_id, lang, text, original_hash, updated_by) VALUES ('p-pivm:prose:cd34', 'es', 'Texto nuevo', 'cd34', $1)", [u.id])

  const { rows: [s] } = await db.query(
    "INSERT INTO sends (presentation_id, presentation_name, user_id, pdf_bytes, mode, status) VALUES ($1, 'Inversores USA', $2, 1000, 'attachment', 'sent') RETURNING id",
    [p.id, u.id])
  for (const email of ['a@cliente.com', 'b@cliente.com', 'a@cliente.com']) {
    const { rows: [c] } = await db.query(
      'INSERT INTO contacts (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id', [email])
    await db.query('INSERT INTO send_recipients (send_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.id, c.id])
  }

  expect((await db.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n).toBe(2)
  expect((await db.query('SELECT count(*)::int AS n FROM send_recipients WHERE send_id = $1', [s.id])).rows[0].n).toBe(2)

  // borrar la presentación no borra el historial de envíos
  await db.query('DELETE FROM presentations WHERE id = $1', [p.id])
  const { rows: [after] } = await db.query('SELECT presentation_id, presentation_name FROM sends WHERE id = $1', [s.id])
  expect(after).toEqual({ presentation_id: null, presentation_name: 'Inversores USA' })
})

test('las restricciones rechazan datos inválidos', async () => {
  await expect(db.query("INSERT INTO users (email, name, role, password_hash) VALUES ('x@y.com', 'X', 'superuser', 'x')")).rejects.toThrow()
  await expect(db.query("INSERT INTO contacts (email) VALUES ('Mayus@Cliente.com')")).rejects.toThrow()
  await expect(db.query("INSERT INTO presentations (name, lang) VALUES ('X', 'fr')")).rejects.toThrow()
  // la migración 002 ya crea "Web completa": no puede haber otra fija
  await expect(db.query("INSERT INTO presentations (name, is_fixed) VALUES ('Otra fija', true)")).rejects.toThrow()
})
