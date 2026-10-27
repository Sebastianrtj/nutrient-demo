import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()], base: process.env.DEMO_BASE_PATH || '/',
  server: { host: '127.0.0.1', port: 8768, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8769' } },
  build: { target: 'es2022' }
});
