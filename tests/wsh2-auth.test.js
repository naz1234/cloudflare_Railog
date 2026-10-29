import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/wsh2.js';
import { createAuthMiddleware } from '../functions/_middleware.js';
import {
  AUTH_SESSION_COOKIE, authorizeCustomSessionRequest, generateOpaqueToken,
  getCodeOnlyAuthMember, getCustomAuthConfiguration, hashAuthEmail, hashSessionToken,
} from '../functions/lib/custom-auth.js';

const origin = 'https://railog.example';
const now = Date.UTC(2026, 9, 29, 12);

async function fixture(kind = 'code-only') {
  let storageReads = 0;
  const env = {
    AUTH_MODE: 'custom_pin', AUTH_ALLOWED_EMAILS: 'test.operator@flow-metro.com',
    AUTH_HMAC_SECRET: 'wsh2-test-only-secret-at-least-32-characters',
    AUTH_CODE_ONLY_PIN: '123456', TURNSTILE_SITE_KEY: 'test-site-key',
    TURNSTILE_SECRET_KEY: 'test-security-key', WSH2_FILES: {},
    DB: { prepare: (sql) => ({ sql }), batch: async () => { storageReads++; return [{ results: [] }, { results: [] }]; } },
  };
  const token = generateOpaqueToken(32);
  const tokenHash = await hashSessionToken({ hmacSecret: env.AUTH_HMAC_SECRET, token });
  const memberHash = kind === 'code-only'
    ? (await getCodeOnlyAuthMember(getCustomAuthConfiguration(env))).memberHash
    : await hashAuthEmail({ hmacSecret: env.AUTH_HMAC_SECRET, email: 'test.operator@flow-metro.com' });
  const session = { token_hash: tokenHash, email_hash: memberHash, expires_at: now / 1000 + 3600, revoked_at: null };
  const store = { getSession: async (hash) => hash === tokenHash ? session : null };
  const middleware = createAuthMiddleware({
    authorizeCustom: (input) => authorizeCustomSessionRequest({ ...input, store, now }),
  });
  async function call({ cookie = `${AUTH_SESSION_COOKIE}=${token}`, headers = {}, method = 'GET' } = {}) {
    const context = {
      env, data: {},
      request: new Request(`${origin}/api/wsh2`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } }),
    };
    context.next = () => onRequest(context);
    return { response: await middleware(context), data: context.data };
  }
  return { env, session, call, reads: () => storageReads };
}

test('WSH2 accepts a real verified code-only session with no email', async () => {
  const f = await fixture();
  const { response, data } = await f.call();
  assert.equal(response.status, 200);
  assert.equal(data.authUser.email, '');
  assert.equal(data.authUser.name, 'Code-only access');
  assert.match(data.authUser.memberHash, /^[a-f0-9]{64}$/);
  assert.deepEqual((await response.json()).rows, []);
  assert.equal(f.reads(), 1);
});

test('WSH2 continues to accept verified email sessions', async () => {
  const f = await fixture('email');
  const { response, data } = await f.call();
  assert.equal(response.status, 200);
  assert.equal(data.authUser.email, 'test.operator@flow-metro.com');
});

test('WSH2 continues to accept the verified Cloudflare Access identity', async () => {
  const f = await fixture();
  const context = { env: f.env, data: {}, request: new Request(`${origin}/api/wsh2`) };
  const middleware = createAuthMiddleware({
    resolveMode: () => 'cloudflare_access',
    authorizeAccess: async () => ({ authorized: true, email: 'test.operator@flow-metro.com', payload: { sub: 'test-subject' } }),
  });
  context.next = () => onRequest(context);
  assert.equal((await middleware(context)).status, 200);
});

test('WSH2 rejects expired, revoked, disabled or rotated code-only sessions before storage access', async () => {
  for (const state of ['expired', 'revoked', 'disabled', 'rotated']) {
    const f = await fixture();
    if (state === 'expired') f.session.expires_at = now / 1000;
    if (state === 'revoked') f.session.revoked_at = now / 1000;
    if (state === 'disabled') f.env.AUTH_CODE_ONLY_PIN = '';
    if (state === 'rotated') f.env.AUTH_CODE_ONLY_PIN = '654321';
    assert.equal((await f.call()).response.status, 401, state);
    assert.equal(f.reads(), 0, state);
  }
});

test('WSH2 does not trust forged identity headers, a missing cookie or an unrecognized session token', async () => {
  const f = await fixture();
  for (const cookie of ['', `${AUTH_SESSION_COOKIE}=${'unrecognized_'.repeat(4)}`]) {
    const { response } = await f.call({ cookie, headers: { 'X-User-Email': 'test.operator@flow-metro.com', 'X-Member-Hash': f.session.email_hash } });
    assert.equal(response.status, 401);
  }
  for (const authUser of [{}, { name: 'Code-only access' }, { memberHash: 'a'.repeat(64) }, { tokenHash: 'b'.repeat(64) }, { memberHash: 'invalid', tokenHash: 'b'.repeat(64) }]) {
    assert.equal((await onRequest({ request: new Request(`${origin}/api/wsh2`), env: f.env, data: { authUser } })).status, 401);
  }
  assert.equal(f.reads(), 0);
});

test('a verified code-only session still cannot submit a cross-site wash update or deletion', async () => {
  const f = await fixture();
  for (const method of ['PATCH', 'DELETE']) {
    const { response } = await f.call({ method, headers: { Origin: 'https://attacker.example' } });
    assert.equal(response.status, 403);
    assert.equal((await f.call({ method, cookie: '', headers: { Origin: origin } })).response.status, 401);
  }
  assert.equal(f.reads(), 0);
});
