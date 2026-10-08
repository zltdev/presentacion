import { buildApp } from './app.js'
import { migrate } from './db/migrate.js'

if (process.env.DATABASE_URL) await migrate()
const app = buildApp({ logger: true })
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 })
