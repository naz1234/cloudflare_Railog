// Build first, then run this script. Local fixtures only; no production/Azure calls.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createAuthMiddleware } from '../functions/_middleware.js';
import { createRemovalScanHandler } from '../functions/api/removal-scan.js';
import { memoryD1 } from '../tests/helpers/memory-d1.js';
import { trackingTableResult } from '../tests/fixtures/removal-tracking-table.js';

const origin = 'http://127.0.0.1:4194';
const env = { AUTH_MODE: 'custom_pin', DB: memoryD1(), AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://preview.invalid', AZURE_DOCUMENT_INTELLIGENCE_KEY: 'local-demo-only' };
const handler = createRemovalScanHandler({ readImage: async () => trackingTableResult() });
const middleware = createAuthMiddleware({ authorizeCustom: async () => ({ authorized: false, reason: 'missing_session', status: 401 }) });
const created = await handler({ env, data: { authUser: { email: 'local-preview@example.test' } }, request: new Request(`${origin}/api/removal-scan`, { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ target: { period: '7pm', timetable: 'Weekday (local fixture)', rows: [{ tid: '226', trainId: '42' }, { tid: '101', trainId: '34' }] } }) }) });
const session = await created.json();
if (!session.success) throw new Error('Unable to create local fixture session.');
const paths = new Map([
  ['/removal-scan', ['removal-scan.html', 'text/html; charset=utf-8']],
  ['/removal-scan.html', ['removal-scan.html', 'text/html; charset=utf-8']],
  ['/removal-scan-assets/removal-scan.js', ['removal-scan-assets/removal-scan.js', 'text/javascript; charset=utf-8']],
  ['/removal-scan-assets/removal-scan.css', ['removal-scan-assets/removal-scan.css', 'text/css; charset=utf-8']],
]);

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin);
    if (url.pathname === '/qr-test' && incoming.method === 'GET') {
      outgoing.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      outgoing.end(`<!doctype html><html><head><title>Anonymous QR — local fixture</title></head><body><h1>Local anonymous QR test</h1><p>This server always denies staff login and uses fixture OCR. No production data.</p><a href="/removal-scan#id=${session.id}&token=${session.token}">Open test QR upload</a></body></html>`);
      return;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of incoming) {
      bytes += chunk.length;
      if (bytes > 5 * 1024 * 1024) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const request = new Request(url, { method: incoming.method, headers: incoming.headers, body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks) });
    const context = { request, env, data: {} };
    context.next = async () => {
      if (url.pathname === '/api/removal-scan') return handler(context);
      const file = paths.get(url.pathname);
      if (!file) return new Response('Not found', { status: 404 });
      return new Response(incoming.method === 'HEAD' ? null : await readFile(new URL(`../dist/${file[0]}`, import.meta.url)), { headers: { 'Content-Type': file[1] } });
    };
    const result = await middleware(context);
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    outgoing.writeHead(500); outgoing.end('Local fixture server error. Build the scanner first.');
  }
}).listen(4194, '127.0.0.1', () => console.log(`Anonymous QR local test: ${origin}/qr-test (expires in 15 minutes)`));
