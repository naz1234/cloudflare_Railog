import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import ttlFixPlugin from './build/ttlFixPlugin.js'
import pstHeaderPlugin from './build/pstHeaderPlugin.js'
import shunterNamePlugin from './build/shunterNamePlugin.js'
import manualArrivalTimePlugin from './build/manualArrivalTimePlugin.js'
import manualUnplannedSrPlugin from './build/manualUnplannedSrPlugin.js'

// Cloudflare Pages build config.
// The original Base44 Vite plugin was removed and replaced with a normal Vite alias.
export default defineConfig({
  logLevel: 'error',
  plugins: [ttlFixPlugin(), pstHeaderPlugin(), shunterNamePlugin(), manualArrivalTimePlugin(), manualUnplannedSrPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});