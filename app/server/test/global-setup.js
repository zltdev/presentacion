import EmbeddedPostgres from 'embedded-postgres'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Postgres real y descartable para los tests: sin Docker ni instalación local
export default async function ({ provide }) {
  const dir = mkdtempSync(join(tmpdir(), 'zlt-pg-'))
  const port = 54329
  const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'test', password: 'test', persistent: false, onLog: () => {} })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  provide('databaseUrl', `postgres://test:test@localhost:${port}/test`)
  return async () => {
    await pg.stop()
    rmSync(dir, { recursive: true, force: true })
  }
}
