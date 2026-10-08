import Fastify from 'fastify'

export function buildApp (opts = {}) {
  const app = Fastify(opts)
  // GIT_SHA lo inyecta el deploy (PJW-003)
  app.get('/api/health', async () => ({ ok: true, version: process.env.GIT_SHA || 'dev' }))
  return app
}
