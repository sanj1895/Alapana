import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, Vite forwards /api/* to the Node functions the way Vercel
// does in production. The default suits `npm run dev:api`.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
})
