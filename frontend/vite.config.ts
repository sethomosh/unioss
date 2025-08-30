// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy /api/* → http://localhost:8000
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      // Proxy /snmp/* → http://localhost:8000
      '/snmp': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      // Additional proxies to avoid CORS preflight hitting backend directly
      '/discovery': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/alerts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/traffic': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true, // keep this in case traffic uses websockets
        rewrite: (path) => path,
      },
    }
  }
})
