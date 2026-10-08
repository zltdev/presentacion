import { test, expect } from 'vitest'
import { buildApp } from '../src/app.js'

test('GET /api/health responde ok y la versión', async () => {
  process.env.GIT_SHA = 'abc123'
  const res = await buildApp().inject('/api/health')
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ ok: true, version: 'abc123' })
})
