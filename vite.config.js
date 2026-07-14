import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import ttlFixPlugin from './build/ttlFixPlugin.js'

// Cloudflare Pages build config.
// The original Base44 Vite plugin was removed and replaced with a normal Vite alias.
export default defineConfig({
  logLevel: 'error',
  plugins: [ttlFixPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
