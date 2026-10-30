// Loopback-only preview; uses production components with isolated sample records.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = '<!doctype html><html lang="en" class="dark" data-app-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PST — REQ slate theme (local samples)</title></head><body><div id="root"></div><script type="module" src="/scripts/preview-pst-slate.jsx"></script></body></html>';
const server = await createServer({
  root, configFile: false,
  resolve: { alias: [
    { find: /^.*(?:\/|^)base44Client(?:\.js)?$/, replacement: path.join(root, 'scripts/preview-compact-slate-api.js') },
    { find: '@', replacement: path.join(root, 'src') },
  ] },
  plugins: [{
    name: 'isolated-pst-slate', enforce: 'pre',
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/pages/DepotStabling.jsx')) return `${code}\nexport { PSTTabContent };`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        response.setHeader('Content-Security-Policy', "connect-src 'self' ws://127.0.0.1:4200; form-action 'none'");
        if (request.url === '/' || request.url === '/pst-slate-preview') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          response.end(await vite.transformIndexHtml('/pst-slate-preview', html));
        } else if (request.url.startsWith('/api/')) {
          response.writeHead(403, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Local samples only; production APIs are disabled.' }));
        } else next();
      });
    },
  }, react()],
  server: { host: '127.0.0.1', port: 4200, strictPort: true },
});
await server.listen();
console.log('PST slate preview: http://127.0.0.1:4200/pst-slate-preview');
