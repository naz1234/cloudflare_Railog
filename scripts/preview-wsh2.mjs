import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import path from 'node:path';
import { createWsh2LocalRuntime, root } from './wsh2-local-runtime.mjs';

const runtime = await createWsh2LocalRuntime({ persist: true });
const origin = 'http://127.0.0.1:4199';
const html = `<!doctype html><html lang="en" class="dark" data-app-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>AWP local preview</title></head><body><div id="root"></div><script type="module" src="/scripts/preview-wsh2.jsx"></script></body></html>`;
const server = await createServer({
  root, configFile: false, resolve: { alias: { '@': path.join(root, 'src') } },
  optimizeDeps: { entries: ['scripts/preview-wsh2.jsx'] },
  plugins: [{ name: 'wsh2-local-api', configureServer(vite) {
    vite.middlewares.use(async (incoming, outgoing, next) => {
      const url = new URL(incoming.url, origin);
      if (url.pathname === '/api/wsh2') {
        try {
          const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) });
          const response = await runtime.dispatchFetch(request.url, { method: request.method, headers: Object.fromEntries(request.headers), ...(!['GET', 'HEAD'].includes(request.method) ? { body: new Uint8Array(await request.arrayBuffer()) } : {}) });
          outgoing.writeHead(response.status, Object.fromEntries(response.headers));
          outgoing.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) { outgoing.writeHead(500, { 'Content-Type': 'application/json' }); outgoing.end(JSON.stringify({ error: error.message })); }
        return;
      }
      if (['/', '/wsh2-preview'].includes(url.pathname)) {
        outgoing.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:4199; object-src 'none'; base-uri 'self'" });
        outgoing.end(await vite.transformIndexHtml(url.pathname, html)); return;
      }
      if (url.pathname.startsWith('/api/')) { outgoing.writeHead(403); outgoing.end('Other APIs are disabled in this local preview.'); return; }
      next();
    });
  } }, react()], server: { host: '127.0.0.1', port: 4199, strictPort: true },
});
await server.listen();
console.log(`WSH2 local D1/R2 preview: ${origin}/wsh2-preview`);
async function stop() { await server.close(); await runtime.dispose(); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
