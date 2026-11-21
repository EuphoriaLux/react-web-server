import { defineConfig } from 'vite'

// In development, /api goes to the local API (python3 server/api.py).
export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
