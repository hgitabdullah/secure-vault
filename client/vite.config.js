import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express API so the app and API share
// one origin (cookies stay SameSite=Strict, no CORS needed in development).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:5100', changeOrigin: false } },
  },
  preview: { port: 5174 },
  optimizeDeps: { exclude: ['hash-wasm'] },
  build: { chunkSizeWarningLimit: 900 },
});
