import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const DIR = fileURLToPath(new URL('../../migrations/', import.meta.url))

// Aplica migrations/*.sql en orden, cada una en su transacción. Las ya aplicadas se saltean.
export async function migrate (connectionString = process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('SELECT pg_advisory_lock(4004)') // dos deploys a la vez no migran dos veces
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name))
    const pending = (await readdir(DIR)).filter(f => f.endsWith('.sql') && !done.has(f)).sort()
    for (const f of pending) {
      await client.query('BEGIN')
      try {
        await client.query(await readFile(DIR + f, 'utf8'))
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`migración ${f}: ${err.message}`)
      }
    }
    return pending
  } finally {
    await client.end()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('aplicadas:', await migrate())
}
