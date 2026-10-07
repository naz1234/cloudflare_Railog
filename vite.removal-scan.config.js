import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// Self-contained, exact public asset paths. Never expose the dashboard bundle.
export default defineConfig({
  publicDir: false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist/removal-scan-assets',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, './src/removal-scan-main.jsx'),
      formats: ['es'],
      fileName: () => 'removal-scan.js',
      cssFileName: 'removal-scan',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
