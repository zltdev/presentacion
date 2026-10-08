import { buildApp } from './app.js'

const app = buildApp({ logger: true })
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 })
