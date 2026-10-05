import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createLoginPreviewServer } from '../scripts/preview-login.mjs';

const demoEmail = 'nazif.jaffar@flow-metro.com';
const demoToken = 'local-preview-verification-only';

async function startPreview(t) {
  let time = Date.now();
  const server = createLoginPreviewServer({ now: () => time });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    advance(seconds) { time += seconds * 1000; },
    get(path) { return fetch(`${origin}${path}`); },
    post(path, body, headers = {}) {
      return fetch(`${origin}${path}`, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    },
  };
}

async function requestCode(preview, email = demoEmail) {
  const response = await preview.post('/api/auth/request-code', { email, turnstileToken: demoToken });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('set-cookie'), null);
  return response.json();
}

test('preview serves actual login assets, injects local-only safety notice and stub, and blocks unrelated files', async (t) => {
  const preview = await startPreview(t);
  const response = await preview.get('/login');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  const html = await response.text();
  assert.match(html, /LOCAL PREVIEW/);
  assert.match(html, /No email is sent/);
  assert.match(html, /Test PIN: <code>284169<\/code>/);
  assert.match(html, /src="\/__preview\/turnstile\.js"/);
  assert.doesNotMatch(html, /https:\/\/challenges\.cloudflare\.com/);

  for (const asset of ['/auth/login.js', '/auth/login.css']) {
    const actual = await preview.get(asset);
    assert.equal(actual.status, 200);
    assert.equal(await actual.text(), await readFile(new URL(`../public${asset}`, import.meta.url), 'utf8'));
  }
  assert.equal((await preview.get('/favicon.png')).status, 200);
  assert.match(await (await preview.get('/__preview/turnstile.js')).text(), /window\.turnstile/);
  for (const path of ['/package.json', '/functions/api/auth/config.js', '/.env', '/auth/../../package.json', '/api/anything']) {
    assert.equal((await preview.get(path)).status, 404, path);
  }
});

test('preview matches auth contracts and consumes demo challenge without issuing a session or cookie', async (t) => {
  const preview = await startPreview(t);
  assert.deepEqual(await (await preview.get('/api/auth/config')).json(), { siteKey: 'local-preview-only' });
  const session = await preview.get('/api/auth/session');
  assert.equal(session.status, 401);
  assert.deepEqual(await session.json(), {
    ok: false, authenticated: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
  });
  const challenge = await requestCode(preview);
  assert.equal(challenge.ok, true);
  assert.equal(challenge.message, 'If this email is approved, a login code was sent.');
  assert.equal(challenge.expiresInSeconds, 300);
  assert.equal(challenge.resendAfterSeconds, 60);
  assert.equal(challenge.emailHint, 'nazi***@flow-metro.com');
  assert.match(challenge.challengeId, /^[A-Za-z0-9_-]{32}$/);
  assert.match(challenge.requestRef, /^[A-F0-9]{6}$/);
  const payload = { challengeId: challenge.challengeId, code: '284169' };
  const verified = await preview.post('/api/auth/verify-code', payload);
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get('set-cookie'), null);
  const data = await verified.json();
  assert.equal(data.ok, true);
  assert.equal(data.authenticated, true);
  assert.deepEqual(data.user, { email: 'nazi***@flow-metro.com', name: 'Nazif Jaffar' });
  assert.ok(Number.isFinite(Date.parse(data.expiresAt)));
  assert.equal((await preview.post('/api/auth/verify-code', payload)).status, 401);
  assert.equal((await preview.get('/api/auth/session')).status, 401);
  const completion = await (await preview.get('/')).text();
  assert.match(completion, /Local login test complete/);
  assert.match(completion, /href="\/login"/);
});

test('preview enforces 60-second resend cooldown and 300-second challenge expiry', async (t) => {
  const preview = await startPreview(t);
  const challenge = await requestCode(preview);
  const limited = await preview.post('/api/auth/request-code', { email: demoEmail, turnstileToken: demoToken });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await limited.json()).retryAfterSeconds, 60);
  preview.advance(60);
  const replacement = await requestCode(preview);
  assert.notEqual(replacement.challengeId, challenge.challengeId);
  preview.advance(240);
  assert.equal((await preview.post('/api/auth/verify-code', { challengeId: challenge.challengeId, code: '284169' })).status, 401);
  assert.equal((await preview.post('/api/auth/verify-code', { challengeId: replacement.challengeId, code: '284169' })).status, 200);
});

test('preview rejects invalid PINs, exhausted attempts, unknown and non-demo challenges', async (t) => {
  const preview = await startPreview(t);
  const challenge = await requestCode(preview);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await preview.post('/api/auth/verify-code', { challengeId: challenge.challengeId, code: '111111' })).status, 401);
  }
  assert.equal((await preview.post('/api/auth/verify-code', { challengeId: challenge.challengeId, code: '284169' })).status, 401);
  assert.equal((await preview.post('/api/auth/verify-code', { challengeId: 'x'.repeat(32), code: '284169' })).status, 401);
  const other = await requestCode(preview, 'not-approved@example.com');
  assert.equal((await preview.post('/api/auth/verify-code', { challengeId: other.challengeId, code: '284169' })).status, 401);
});

test('preview state is isolated between server instances', async (t) => {
  const first = await startPreview(t);
  const second = await startPreview(t);
  const challenge = await requestCode(first);
  assert.equal((await second.post('/api/auth/verify-code', { challengeId: challenge.challengeId, code: '284169' })).status, 401);
  assert.equal((await first.post('/api/auth/verify-code', { challengeId: challenge.challengeId, code: '284169' })).status, 200);
});

test('preview validates request shape, verification token, request origin, method and Host', async (t) => {
  const preview = await startPreview(t);
  const payload = { email: demoEmail, turnstileToken: demoToken };
  assert.equal((await preview.post('/api/auth/request-code', { ...payload, email: 'invalid' })).status, 400);
  assert.equal((await preview.post('/api/auth/request-code', { ...payload, secret: 'unused' })).status, 400);
  assert.equal((await preview.post('/api/auth/request-code', { ...payload, turnstileToken: 'invalid' })).status, 400);
  assert.equal((await preview.post('/api/auth/request-code', payload, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await preview.get('/api/auth/request-code')).status, 405);
  assert.equal((await preview.post('/api/auth/verify-code', { challengeId: 'bad', code: '123' })).status, 400);
  const badHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(preview.origin, { headers: { Host: 'example.com' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(badHostStatus, 403);
});
