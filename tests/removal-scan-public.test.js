import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createAuthMiddleware } from '../functions/_middleware.js';
import { isRemovalScanPublicRequest } from '../functions/lib/removal-scan-access.js';

const origin = 'https://rail.example';
const id = '343f2c88-f64e-42f8-846f-1ea7fc79d428';
const token = 'a'.repeat(64);
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('only the separate scanner HTML and its exact two assets are publicly readable', async () => {
  let authCalls = 0;
  const middleware = createAuthMiddleware({
    authorizeCustom: async () => { authCalls += 1; return { authorized: false, reason: 'missing_session', status: 401 }; },
  });
  for (const path of ['/removal-scan', '/removal-scan.html', '/removal-scan-assets/removal-scan.js', '/removal-scan-assets/removal-scan.css']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await middleware({ request: new Request(`${origin}${path}`, { method }), env: { AUTH_MODE: 'custom_pin' }, data: {}, next: async () => new Response(method === 'HEAD' ? null : 'scanner') });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
      assert.match(response.headers.get('Cache-Control'), /no-store/);
      assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
      assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /unsafe-inline|unsafe-eval|https:/);
      assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    }
  }
  assert.equal(authCalls, 0);
  for (const path of ['/assets/main.js', '/removal-scan-assets/extra.js', '/removal-scan-assets/removal-scan.js.map', '/removal-scan.html/extra', '/removal-scan/', '/removal-scan-assets/%72emoval-scan.js']) {
    const response = await middleware({ request: new Request(`${origin}${path}`), env: { AUTH_MODE: 'custom_pin' }, data: {}, next: async () => new Response('private') });
    assert.equal(response.status, 401, path);
  }
});

test('public API eligibility requires exact endpoint, valid token header, session ID and allowed method', () => {
  const request = (path = `/api/removal-scan?id=${id}`, headers = { 'X-Removal-Scan-Token': token }, method = 'GET') => new Request(`${origin}${path}`, { headers, method });
  for (const method of ['GET', 'POST', 'PATCH']) assert.equal(isRemovalScanPublicRequest(request(undefined, undefined, method)), true);
  for (const method of ['HEAD', 'PUT', 'DELETE', 'OPTIONS']) assert.equal(isRemovalScanPublicRequest(request(undefined, undefined, method)), false);
  assert.equal(isRemovalScanPublicRequest(request('/api/removal-scan')), false);
  assert.equal(isRemovalScanPublicRequest(request('/api/removal-scan?id=invalid')), false);
  assert.equal(isRemovalScanPublicRequest(request(`/api/removal-scan?id=${id}&token=${token}`, {})), false);
  assert.equal(isRemovalScanPublicRequest(request(undefined, { 'X-Removal-Scan-Token': 'short' })), false);
  assert.equal(isRemovalScanPublicRequest(request(`/api/removal-scan/extra?id=${id}`)), false);
  assert.equal(isRemovalScanPublicRequest(request(`/api/entities/TrainRem?id=${id}`)), false);
  assert.equal(isRemovalScanPublicRequest(request('/removal-scan', { Origin: origin }, 'POST')), false);
});

test('scanner bypass is scoped in both supported auth modes and fails closed for invalid configuration', async () => {
  for (const mode of ['custom_pin', 'cloudflare_access', 'disabled']) {
    let nextCalls = 0;
    const middleware = createAuthMiddleware({
      resolveMode: () => mode, logger: { error() {} },
      authorizeAccess: async () => { throw new Error('public scanner must not request staff login'); },
      authorizeCustom: async () => { throw new Error('public scanner must not request staff login'); },
    });
    const response = await middleware({ request: new Request(`${origin}/removal-scan`), data: {}, env: {}, next: async () => { nextCalls += 1; return new Response('scanner'); } });
    assert.equal(response.status, mode === 'disabled' ? 503 : 200);
    assert.equal(nextCalls, mode === 'disabled' ? 0 : 1);
  }
});

test('public scanner still rejects originless and cross-site mutations before reaching OCR', async () => {
  for (const mode of ['custom_pin', 'cloudflare_access']) {
    for (const headers of [{}, { Origin: 'https://evil.example' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }]) {
      let called = false;
      const middleware = createAuthMiddleware();
      const response = await middleware({ request: new Request(`${origin}/api/removal-scan?id=${id}`, { method: 'POST', headers: { ...headers, 'X-Removal-Scan-Token': token } }), env: { AUTH_MODE: mode }, data: {}, next: async () => { called = true; return new Response('unexpected'); } });
      assert.equal(response.status, 403);
      assert.equal(called, false);
    }
  }
});

test('phone entry is isolated from login and bundles to exact allowed public paths', async () => {
  const [html, entry, config, pkg, scanner, app] = await Promise.all([
    source('public/removal-scan.html'), source('src/removal-scan-main.jsx'), source('vite.removal-scan.config.js'), source('package.json'), source('src/components/depot/RemovalScan.jsx'), source('src/App.jsx'),
  ]);
  assert.match(html, /src="\/removal-scan-assets\/removal-scan\.js"/);
  assert.match(html, /href="\/removal-scan-assets\/removal-scan\.css"/);
  assert.doesNotMatch(html, /<script[^>]*>[^<]+<\/script>/);
  assert.doesNotMatch(entry, /import.*(?:AuthContext|ProtectedRoute|base44Client|App)/);
  assert.match(config, /outDir: 'dist\/removal-scan-assets'/);
  assert.match(config, /inlineDynamicImports: true/);
  assert.match(JSON.parse(pkg).scripts.build, /vite\.removal-scan\.config\.js/);
  assert.match(scanner, /'removal-scan#'/);
  assert.match(scanner, /No phone login needed/);
  assert.doesNotMatch(scanner, /Sign in on your phone if asked/);
  assert.match(app, /<Route element=\{<ProtectedRoute \/>\}>/);
});
