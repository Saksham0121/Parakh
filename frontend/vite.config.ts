import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep the charting library in its own long-lived cached chunk.
        manualChunks: (id) => (id.includes('klinecharts') ? 'charts' : id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api/market': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/backtests': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/indicators': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api/scanner': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3009',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
