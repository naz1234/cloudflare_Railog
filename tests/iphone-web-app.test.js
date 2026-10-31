import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAuthMiddleware } from '../functions/_middleware.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

for (const path of ['index.html', 'public/login.html']) {
  test(`${path} supports Home Screen app mode before or after login`, () => {
    const head = readSource(path).split('</head>')[0];
    assert.match(head, /<link rel="manifest" href="\/manifest\.json"\s*\/>/);
    assert.match(head, /<meta name="apple-mobile-web-app-capable" content="yes"\s*\/>/);
    assert.match(head, /<meta name="mobile-web-app-capable" content="yes"\s*\/>/);
    assert.match(head, /<meta name="apple-mobile-web-app-title" content="L3 Depot Controller Template"\s*\/>/);
    // Do not change viewport geometry or hide the website's own navigation.
    assert.match(head, /<meta name="viewport" content="width=device-width, initial-scale=1\.0"\s*\/>/);
  });
}

test('manifest has stable root identity and keeps login and workspace routes in standalone scope', () => {
  const manifest = JSON.parse(readSource('public/manifest.json'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.display_override, undefined, 'Do not opt into browser/minimal-ui chrome');
  const base = new URL('https://railog.example.com/manifest.json');
  for (const path of ['/login', '/login.html', '/#/pst-train-prep', '/#/insertion', '/#/depot-stabling']) {
    const target = new URL(path, base);
    const scope = new URL(manifest.scope, base);
    assert.equal(target.origin, scope.origin);
    assert.ok(target.pathname.startsWith(scope.pathname));
  }
});

test('login CSP permits only same-origin app metadata without weakening other login restrictions', async () => {
  const middleware = createAuthMiddleware({
    authorizeCustom: async () => { throw new Error('Public app metadata must not need a session'); },
  });
  for (const path of ['/login', '/login.html', '/manifest.json']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await middleware({
        data: {},
        env: { AUTH_MODE: 'custom_pin' },
        request: new Request(`https://railog.example.com${path}`, { method }),
        next: async () => new Response(method === 'HEAD' ? null : 'public asset'),
      });
      const directives = new Map(response.headers.get('content-security-policy').split(';')
        .map((part) => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
      assert.deepEqual(directives.get('manifest-src'), ["'self'"], `${method} ${path}`);
      assert.deepEqual(directives.get('default-src'), ["'none'"]);
      assert.deepEqual(directives.get('script-src'), ["'self'", 'https://challenges.cloudflare.com']);
      assert.deepEqual(directives.get('form-action'), ["'self'"]);
      assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
      assert.deepEqual(directives.get('base-uri'), ["'none'"]);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  }
});
