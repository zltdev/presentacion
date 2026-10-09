import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000', '/p/': 'http://localhost:3000', '/brochures': 'http://localhost:3000' } }
})
