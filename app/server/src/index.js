import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { buildApp } from './app.js'
import { migrate } from './db/migrate.js'

const repo = p => fileURLToPath(new URL('../../../' + p, import.meta.url))

await migrate()
const app = buildApp({
  db: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  baseHtmlPath: process.env.BASE_HTML_PATH || repo('index.html'),
  brochuresDir: process.env.BROCHURES_DIR || repo('brochures'),
  webDist: process.env.WEB_DIST || repo('app/web/dist'),
  secureCookies: process.env.NODE_ENV === 'production',
  logger: true
})
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 })
