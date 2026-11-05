import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, Vite forwards API calls the way Vercel does in production:
// /api/ai/* to the Go gateway and every other /api/* to the Node functions.
// Docker Compose points these at its containers; the defaults suit `npm run dev`.
const AI_GATEWAY_TARGET = process.env.AI_GATEWAY_TARGET || 'http://localhost:8080'
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // More specific prefix first: Vite uses the first match.
      '/api/ai': { target: AI_GATEWAY_TARGET, changeOrigin: true },
      '/api': { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
})
