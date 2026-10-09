// Entorno local: Postgres embebido persistente en .devdb/ + server en http://localhost:3000
// Uso: npm run dev (antes: npm run build en app/web para tener el front)
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../.devdb', import.meta.url))
const fresh = !existsSync(dir)
const pg = new EmbeddedPostgres({ databaseDir: dir, port: 54320, user: 'dev', password: 'dev', persistent: true, onLog: () => {} })
if (fresh) await pg.initialise()
await pg.start()
if (fresh) await pg.createDatabase('zlt')
process.env.DATABASE_URL = 'postgres://dev:dev@localhost:54320/zlt'
process.on('SIGINT', async () => { await pg.stop(); process.exit(0) })

await import('./index.js')
console.log('\nApp local: http://localhost:3000  (usuarios: npm run create-user -- <email> <nombre> <rol>)\n')
