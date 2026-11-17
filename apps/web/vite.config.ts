import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API (BFF + domain) runs on http://localhost:3001. In dev we proxy /api and /auth to it
// so that cookies are same-origin (the browser never sees tokens).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
