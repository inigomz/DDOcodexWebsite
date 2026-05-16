import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy Netlify Function calls to netlify dev during local development
      '/.netlify': {
        target: 'http://localhost:8888',
        changeOrigin: true
      }
    }
  }
});
