import { defineConfig } from 'vitest/config'

// testTimeout alto: los tests del catálogo parsean el index.html real (27 MB)
export default defineConfig({ test: { globalSetup: './test/global-setup.js', testTimeout: 60000 } })
