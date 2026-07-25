import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import pstHeaderPlugin from './build/pstHeaderPlugin.js'
import shunterNamePlugin from './build/shunterNamePlugin.js'
import manualArrivalTimePlugin from './build/manualArrivalTimePlugin.js'
import manualUnplannedSrPlugin from './build/manualUnplannedSrPlugin.js'
import requestGroupVisibilityPlugin from './build/requestGroupVisibilityPlugin.js'
import automaticExcelCompletedByPlugin from './build/automaticExcelCompletedByPlugin.js'
import hideWeekdayTidTimePlugin from './build/hideWeekdayTidTimePlugin.js'

// Cloudflare Pages build config.
// The original Base44 Vite plugin was removed and replaced with a normal Vite alias.
export default defineConfig({
  logLevel: 'error',
  plugins: [pstHeaderPlugin(), shunterNamePlugin(), manualArrivalTimePlugin(), manualUnplannedSrPlugin(), requestGroupVisibilityPlugin(), automaticExcelCompletedByPlugin(), hideWeekdayTidTimePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});