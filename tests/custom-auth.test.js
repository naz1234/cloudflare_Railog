import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  AUTH_MAX_PIN_ATTEMPTS,
  AUTH_MODES,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_TTL_SECONDS,
  CUSTOM_AUTH_SCHEMA_STATEMENTS,
  authorizeCustomSessionRequest,
  generateOpaqueToken,
  generateSecurePin,
  getAuthMode,
  getCustomAuthConfiguration,
  hashPin,
  hashSessionToken,
  maskEmail,
} from '../functions/lib/custom-auth.js';
import {
  getAuthEmailDeliveryConfiguration,
  sendAuthPin,
} from '../functions/lib/custom-auth-email.js';
import {
  AUTH_TURNSTILE_ACTION,
  verifyTurnstileToken,
} from '../functions/lib/custom-auth-turnstile.js';
import { createAuthConfigEndpoint } from '../functions/api/auth/config.js';
import { createLogoutEndpoint } from '../functions/api/auth/logout.js';
import { createRequestCodeEndpoint } from '../functions/api/auth/request-code.js';
import { createSessionEndpoint } from '../functions/api/auth/session.js';
import { createVerifyCodeEndpoint } from '../functions/api/auth/verify-code.js';

const origin = 'https://railog.example.com';
const nowMs = Date.UTC(2026, 7, 23, 12, 0, 0);

function makeEnv(overrides = {}) {
  return {
    AUTH_EMAIL_SERVICE: {
      async fetch() { return new Response(null, { status: 202 }); },
    },
    AUTH_EMAIL_SERVICE_TOKEN: 'test-email-service-token-with-32-characters',
    AUTH_HMAC_SECRET: 'test-hmac-secret-with-at-least-32-characters',
    AUTH_LOGIN_EMAIL: 'l3.dc@example.com',
    AUTH_MODE: AUTH_MODES.customPin,
    DB: { prepare() {} },
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_SITE_KEY: 'turnstile-site-key',
    ...overrides,
  };
}

function makeRequest(path, {
  body,
  cookie,
  ip = '203.0.113.10',
  method = 'POST',
  requestOrigin = origin,
} = {}) {
  const headers = new Headers();
  if (requestOrigin != null) headers.set('Origin', requestOrigin);
  if (ip) headers.set('CF-Connecting-IP', ip);
  if (cookie) headers.set('Cookie', cookie);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  return new Request(`${origin}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });
}

function createMemoryStore({ rateAllowed = true } = {}) {
  const challenges = new Map();
  const sessions = new Map();
  const rateCalls = [];
  const invalidatedChallenges = [];

  return {
    challenges,
    invalidatedChallenges,
    rateCalls,
    sessions,

    async consumeRateLimit(input) {
      rateCalls.push(input);
      const allowed = typeof rateAllowed === 'function'
        ? rateAllowed(input, rateCalls.length)
        : rateAllowed;
      return {
        allowed,
        count: allowed ? 1 : input.limit + 1,
        retryAfterSeconds: 37,
      };
    },

    async insertChallenge(challenge) {
      challenges.set(challenge.challengeId, {
        attempt_count: 0,
        challenge_id: challenge.challengeId,
        created_at: challenge.createdAt,
        expires_at: challenge.expiresAt,
        ip_hash: challenge.ipHash,
        max_attempts: challenge.maxAttempts,
        pin_hash: challenge.pinHash,
        used_at: null,
      });
    },

    async getChallenge(challengeId) {
      return challenges.get(challengeId) || null;
    },

    async recordFailedAttempt(challengeId, timestamp) {
      const challenge = challenges.get(challengeId);
      if (!challenge || challenge.used_at != null) return false;
      challenge.attempt_count += 1;
      if (challenge.attempt_count >= challenge.max_attempts) {
        challenge.used_at = timestamp;
      }
      return true;
    },

    async consumeChallenge(challengeId, pinHash, timestamp) {
      const challenge = challenges.get(challengeId);
      if (
        !challenge
        || challenge.used_at != null
        || challenge.pin_hash !== pinHash
        || challenge.expires_at <= timestamp
        || challenge.attempt_count >= challenge.max_attempts
      ) return false;
      challenge.used_at = timestamp;
      return true;
    },

    async invalidateChallenge(challengeId, timestamp) {
      invalidatedChallenges.push(challengeId);
      const challenge = challenges.get(challengeId);
      if (challenge && challenge.used_at == null) challenge.used_at = timestamp;
    },

    async insertSession(session) {
      sessions.set(session.tokenHash, {
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        revoked_at: null,
        token_hash: session.tokenHash,
      });
    },

    async getSession(tokenHash) {
      return sessions.get(tokenHash) || null;
    },

    async revokeSession(tokenHash, timestamp) {
      const session = sessions.get(tokenHash);
      if (session && session.revoked_at == null) session.revoked_at = timestamp;
    },

    async prune() {},
  };
}

function createContext(request, env = makeEnv()) {
  return { data: {}, env, request };
}

test('custom mode is opt-in and its configuration fails closed', () => {
  assert.equal(getAuthMode({}), AUTH_MODES.cloudflareAccess);
  assert.equal(getAuthMode({ AUTH_MODE: 'custom_pin' }), AUTH_MODES.customPin);
  assert.equal(getAuthMode({ AUTH_MODE: 'unexpected' }), '');

  const valid = getCustomAuthConfiguration(makeEnv());
  assert.equal(valid.valid, true);
  assert.equal(valid.loginEmail, 'l3.dc@example.com');

  const multiple = getCustomAuthConfiguration(makeEnv({
    AUTH_LOGIN_EMAIL: 'first@example.com,second@example.com',
  }));
  assert.equal(multiple.valid, false);
  assert.match(multiple.issues.join(' '), /exactly one valid email/);

  const missingSecurity = getCustomAuthConfiguration(makeEnv({
    AUTH_HMAC_SECRET: 'short',
    TURNSTILE_SECRET_KEY: '',
    TURNSTILE_SITE_KEY: '',
  }));
  assert.equal(missingSecurity.valid, false);
  assert.match(missingSecurity.issues.join(' '), /AUTH_HMAC_SECRET/);
  assert.match(missingSecurity.issues.join(' '), /TURNSTILE_SITE_KEY/);
  assert.match(missingSecurity.issues.join(' '), /TURNSTILE_SECRET_KEY/);

  const whitespaceSecret = getCustomAuthConfiguration(makeEnv({
    AUTH_HMAC_SECRET: ' '.repeat(32),
  }));
  assert.equal(whitespaceSecret.valid, false);
  assert.match(whitespaceSecret.issues.join(' '), /AUTH_HMAC_SECRET/);
});

test('PINs and opaque tokens use bounded secure formats and HMAC hashes', async () => {
  const pins = new Set(Array.from({ length: 100 }, () => generateSecurePin()));
  for (const pin of pins) assert.match(pin, /^\d{6}$/);
  assert.ok(pins.size > 90);

  const token = generateOpaqueToken(32);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);

  const pinHash = await hashPin({
    challengeId: 'challenge-one',
    hmacSecret: makeEnv().AUTH_HMAC_SECRET,
    pin: '123456',
  });
  assert.match(pinHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(pinHash, /123456/);
  assert.notEqual(pinHash, await hashPin({
    challengeId: 'challenge-two',
    hmacSecret: makeEnv().AUTH_HMAC_SECRET,
    pin: '123456',
  }));
});

test('schema and migration keep raw email and raw PIN data out of D1', async () => {
  const migration = await readFile(
    new URL('../migrations/0002_custom_auth.sql', import.meta.url),
    'utf8',
  );
  const runtimeSchema = CUSTOM_AUTH_SCHEMA_STATEMENTS.join(';\n');
  for (const sql of [migration, runtimeSchema]) {
    assert.doesNotMatch(sql, /\bemail\s+TEXT\b/i);
    assert.doesNotMatch(sql, /\bpin\s+TEXT\b/i);
    assert.match(sql, /pin_hash TEXT NOT NULL/i);
    assert.match(sql, /ip_hash TEXT NOT NULL/i);
    assert.match(sql, /token_hash TEXT PRIMARY KEY/i);
  }

  const normalizeSql = (value) => value
    .replaceAll(';', '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const normalizedMigration = normalizeSql(migration);
  for (const statement of CUSTOM_AUTH_SCHEMA_STATEMENTS) {
    assert.ok(normalizedMigration.includes(normalizeSql(statement)));
  }
});

test('private mailer service receives only PIN/reference and bearer authentication', async () => {
  let capturedRequest;
  const env = {
    AUTH_EMAIL_SERVICE: {
      async fetch(request) {
        capturedRequest = request;
        return new Response(null, { status: 202 });
      },
    },
    AUTH_EMAIL_SERVICE_TOKEN: 'private-service-token-with-32-characters',
  };

  await sendAuthPin({
    env,
    pin: '654321',
    requestRef: 'A1B2C3',
    to: 'must-not-cross-binding@example.com',
  });

  assert.equal(capturedRequest.url, 'https://auth-email.internal/send');
  assert.equal(
    capturedRequest.headers.get('Authorization'),
    'Bearer private-service-token-with-32-characters',
  );
  assert.deepEqual(await capturedRequest.json(), {
    pin: '654321',
    requestRef: 'A1B2C3',
  });

  await assert.rejects(sendAuthPin({
    env: { AUTH_EMAIL_SERVICE: env.AUTH_EMAIL_SERVICE },
    pin: '654321',
    requestRef: 'A1B2C3',
    to: 'example@example.com',
  }));

  await assert.rejects(sendAuthPin({
    env: {
      AUTH_EMAIL_SERVICE: { async fetch() { return undefined; } },
      AUTH_EMAIL_SERVICE_TOKEN: 's'.repeat(32),
    },
    pin: '654321',
    requestRef: 'A1B2C3',
  }));
});

test('email delivery readiness requires the private service binding', () => {
  const service = getAuthEmailDeliveryConfiguration({
    AUTH_EMAIL_SERVICE: { fetch() {} },
    AUTH_EMAIL_SERVICE_TOKEN: 's'.repeat(32),
  });
  assert.deepEqual(service, { issues: [], kind: 'service', valid: true });

  const shortServiceToken = getAuthEmailDeliveryConfiguration({
    AUTH_EMAIL_SERVICE: { fetch() {} },
    AUTH_EMAIL_SERVICE_TOKEN: 'short',
  });
  assert.equal(shortServiceToken.valid, false);

  const whitespaceServiceToken = getAuthEmailDeliveryConfiguration({
    AUTH_EMAIL_SERVICE: { fetch() {} },
    AUTH_EMAIL_SERVICE_TOKEN: ' '.repeat(32),
  });
  assert.equal(whitespaceServiceToken.valid, false);

  const directBypass = getAuthEmailDeliveryConfiguration({
    AUTH_EMAIL_FROM: 'auth@example.com',
    AUTH_EMAIL_SENDER: { send() {} },
  });
  assert.equal(directBypass.valid, false);
  assert.match(directBypass.issues.join(' '), /private AUTH_EMAIL_SERVICE binding/);
});

test('Turnstile verifier binds token to action, hostname, and remote IP', async () => {
  let submitted;
  const success = await verifyTurnstileToken({
    env: makeEnv(),
    fetcher: async (url, init) => {
      submitted = { init, url };
      return Response.json({
        action: AUTH_TURNSTILE_ACTION,
        hostname: 'railog.example.com',
        success: true,
      });
    },
    hostname: 'railog.example.com',
    remoteIp: '203.0.113.10',
    token: 'single-use-token',
  });
  assert.deepEqual(success, { success: true });
  assert.equal(submitted.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(submitted.init.body.get('remoteip'), '203.0.113.10');
  assert.equal(submitted.init.body.get('response'), 'single-use-token');

  const wrongAction = await verifyTurnstileToken({
    env: makeEnv(),
    fetcher: async () => Response.json({
      action: 'another-action',
      hostname: 'railog.example.com',
      success: true,
    }),
    hostname: 'railog.example.com',
    remoteIp: '203.0.113.10',
    token: 'another-token',
  });
  assert.deepEqual(wrongAction, { success: false, reason: 'invalid' });

  const wrongHostname = await verifyTurnstileToken({
    env: makeEnv(),
    fetcher: async () => Response.json({
      action: AUTH_TURNSTILE_ACTION,
      hostname: 'attacker.example.com',
      success: true,
    }),
    hostname: 'railog.example.com',
    remoteIp: '203.0.113.10',
    token: 'hostname-token',
  });
  assert.deepEqual(wrongHostname, { success: false, reason: 'invalid' });

  const providerUnavailable = await verifyTurnstileToken({
    env: makeEnv(),
    fetcher: async () => new Response(null, { status: 503 }),
    hostname: 'railog.example.com',
    remoteIp: '203.0.113.10',
    token: 'provider-token',
  });
  assert.deepEqual(providerUnavailable, { success: false, reason: 'unavailable' });

  const networkUnavailable = await verifyTurnstileToken({
    env: makeEnv(),
    fetcher: async () => { throw new Error('network failure'); },
    hostname: 'railog.example.com',
    remoteIp: '203.0.113.10',
    token: 'network-token',
  });
  assert.deepEqual(networkUnavailable, { success: false, reason: 'unavailable' });

  const configurationError = await verifyTurnstileToken({
    env: { TURNSTILE_SECRET_KEY: '   ' },
    hostname: 'railog.example.com',
    remoteIp: '203.0.113.10',
    token: 'configuration-token',
  });
  assert.deepEqual(configurationError, { success: false, reason: 'configuration_error' });
});

test('public auth config exposes only site key and masked shared address', async () => {
  const endpoint = createAuthConfigEndpoint({ logger: { error() {} } });
  const response = await endpoint(createContext(makeRequest('/api/auth/config', {
    method: 'GET',
    requestOrigin: null,
  })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    emailHint: 'l3.d***@example.com',
    siteKey: 'turnstile-site-key',
  });
});

test('code-issuing endpoints stay disabled while Cloudflare Access mode is active', async () => {
  const accessEnv = makeEnv({ AUTH_MODE: AUTH_MODES.cloudflareAccess });
  const configResponse = await createAuthConfigEndpoint()(createContext(
    makeRequest('/api/auth/config', { method: 'GET', requestOrigin: null }),
    accessEnv,
  ));
  const requestResponse = await createRequestCodeEndpoint()(createContext(
    makeRequest('/api/auth/request-code', { body: { turnstileToken: 'token' } }),
    accessEnv,
  ));
  const verifyResponse = await createVerifyCodeEndpoint()(createContext(
    makeRequest('/api/auth/verify-code', {
      body: { challengeId: generateOpaqueToken(24), code: '123456' },
    }),
    accessEnv,
  ));

  assert.equal(configResponse.status, 404);
  assert.equal(requestResponse.status, 404);
  assert.equal(verifyResponse.status, 404);
});

test('request-code stores only hashes and returns an opaque challenge/reference', async () => {
  const store = createMemoryStore();
  const deliveries = [];
  const endpoint = createRequestCodeEndpoint({
    createStore: () => store,
    now: () => nowMs,
    sendPin: async (delivery) => deliveries.push(delivery),
    verifyTurnstile: async () => ({ success: true }),
  });
  const response = await endpoint(createContext(makeRequest('/api/auth/request-code', {
    body: { turnstileToken: 'valid-token' },
  })));

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.challengeId, /^[A-Za-z0-9_-]{32}$/);
  assert.match(body.requestRef, /^[A-F0-9]{6}$/);
  assert.equal(body.expiresInSeconds, 300);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].requestRef, body.requestRef);

  const stored = store.challenges.get(body.challengeId);
  assert.ok(stored);
  assert.equal(Object.hasOwn(stored, 'email'), false);
  assert.equal(Object.hasOwn(stored, 'pin'), false);
  assert.notEqual(stored.pin_hash, deliveries[0].pin);
  assert.equal(stored.expires_at - stored.created_at, 300);
  assert.equal(stored.max_attempts, AUTH_MAX_PIN_ATTEMPTS);
});

test('request-code never accepts a browser-selected recipient', async () => {
  let turnstileCalls = 0;
  const endpoint = createRequestCodeEndpoint({
    createStore: () => createMemoryStore(),
    verifyTurnstile: async () => {
      turnstileCalls += 1;
      return { success: true };
    },
  });
  const response = await endpoint(createContext(makeRequest('/api/auth/request-code', {
    body: { email: 'attacker@example.com', turnstileToken: 'valid-token' },
  })));
  assert.equal(response.status, 400);
  assert.equal(turnstileCalls, 0);
});

test('request-code rejects invalid Turnstile and rate limits before delivery', async () => {
  let deliveries = 0;
  let storesCreatedForInvalidTurnstile = 0;
  const invalidTurnstile = createRequestCodeEndpoint({
    createStore: () => {
      storesCreatedForInvalidTurnstile += 1;
      return createMemoryStore();
    },
    sendPin: async () => { deliveries += 1; },
    verifyTurnstile: async () => ({ success: false, reason: 'invalid' }),
  });
  const invalidResponse = await invalidTurnstile(createContext(makeRequest(
    '/api/auth/request-code',
    { body: { turnstileToken: 'reused-token' } },
  )));
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, 'VERIFICATION_REQUIRED');
  assert.equal(storesCreatedForInvalidTurnstile, 0);

  const limited = createRequestCodeEndpoint({
    createStore: () => createMemoryStore({ rateAllowed: false }),
    sendPin: async () => { deliveries += 1; },
    verifyTurnstile: async () => ({ success: true }),
  });
  const limitedResponse = await limited(createContext(makeRequest(
    '/api/auth/request-code',
    { body: { turnstileToken: 'valid-token' } },
  )));
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get('Retry-After'), '37');
  assert.equal((await limitedResponse.json()).error.code, 'TOO_MANY_REQUESTS');
  assert.equal(deliveries, 0);
});

test('JSON auth endpoints reject non-JSON request bodies', async () => {
  const endpoint = createRequestCodeEndpoint();
  const request = new Request(`${origin}/api/auth/request-code`, {
    body: 'turnstileToken=token',
    headers: {
      'Content-Type': 'text/plain',
      Origin: origin,
    },
    method: 'POST',
  });
  const response = await endpoint(createContext(request));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
});

test('email delivery failure invalidates the challenge without logging the PIN', async () => {
  const store = createMemoryStore();
  const logMessages = [];
  let deliveredPin = '';
  const endpoint = createRequestCodeEndpoint({
    createStore: () => store,
    logger: { error: (...values) => logMessages.push(values.join(' ')) },
    sendPin: async ({ pin }) => {
      deliveredPin = pin;
      throw new Error(`provider failed for ${pin}`);
    },
    verifyTurnstile: async () => ({ success: true }),
  });
  const response = await endpoint(createContext(makeRequest('/api/auth/request-code', {
    body: { turnstileToken: 'valid-token' },
  })));
  assert.equal(response.status, 503);
  assert.equal(store.invalidatedChallenges.length, 1);
  assert.ok(deliveredPin);
  assert.doesNotMatch(logMessages.join(' '), new RegExp(deliveredPin));
});

test('parallel request challenges remain independent and both can verify', async () => {
  const store = createMemoryStore();
  const deliveries = [];
  const requestEndpoint = createRequestCodeEndpoint({
    createStore: () => store,
    now: () => nowMs,
    sendPin: async (delivery) => deliveries.push(delivery),
    verifyTurnstile: async () => ({ success: true }),
  });

  const firstResponse = await requestEndpoint(createContext(makeRequest(
    '/api/auth/request-code',
    { body: { turnstileToken: 'token-one' }, ip: '203.0.113.11' },
  )));
  const secondResponse = await requestEndpoint(createContext(makeRequest(
    '/api/auth/request-code',
    { body: { turnstileToken: 'token-two' }, ip: '203.0.113.12' },
  )));
  const first = await firstResponse.json();
  const second = await secondResponse.json();
  assert.notEqual(first.challengeId, second.challengeId);
  assert.notEqual(first.requestRef, second.requestRef);
  assert.equal(store.challenges.size, 2);

  const verifyEndpoint = createVerifyCodeEndpoint({
    createStore: () => store,
    now: () => nowMs + 1000,
  });
  const firstVerified = await verifyEndpoint(createContext(makeRequest(
    '/api/auth/verify-code',
    { body: { challengeId: first.challengeId, code: deliveries[0].pin } },
  )));
  const secondVerified = await verifyEndpoint(createContext(makeRequest(
    '/api/auth/verify-code',
    { body: { challengeId: second.challengeId, code: deliveries[1].pin } },
  )));
  assert.equal(firstVerified.status, 200);
  assert.equal(secondVerified.status, 200);
});

test('verify-code enforces attempts, one-time use, and a hashed session cookie', async () => {
  const store = createMemoryStore();
  let delivery;
  const requestEndpoint = createRequestCodeEndpoint({
    createStore: () => store,
    now: () => nowMs,
    sendPin: async (value) => { delivery = value; },
    verifyTurnstile: async () => ({ success: true }),
  });
  const requested = await requestEndpoint(createContext(makeRequest(
    '/api/auth/request-code',
    { body: { turnstileToken: 'valid-token' } },
  )));
  const requestBody = await requested.json();
  const verifyEndpoint = createVerifyCodeEndpoint({
    createStore: () => store,
    now: () => nowMs + 1000,
  });

  const wrong = await verifyEndpoint(createContext(makeRequest('/api/auth/verify-code', {
    body: { challengeId: requestBody.challengeId, code: '000000' },
  })));
  assert.equal(wrong.status, 401);
  assert.equal(store.challenges.get(requestBody.challengeId).attempt_count, 1);

  const verified = await verifyEndpoint(createContext(makeRequest('/api/auth/verify-code', {
    body: { challengeId: requestBody.challengeId, code: delivery.pin },
  })));
  assert.equal(verified.status, 200);
  const verifiedBody = await verified.json();
  assert.equal(verifiedBody.authenticated, true);
  assert.equal(verifiedBody.user.email, 'l3.d***@example.com');
  assert.equal(store.sessions.size, 1);
  const cookie = verified.headers.get('Set-Cookie');
  assert.match(cookie, new RegExp(`${AUTH_SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);

  const sessionToken = decodeURIComponent(
    cookie.match(new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`))[1],
  );
  const tokenHash = await hashSessionToken({
    hmacSecret: makeEnv().AUTH_HMAC_SECRET,
    token: sessionToken,
  });
  assert.ok(store.sessions.has(tokenHash));
  assert.equal(Object.hasOwn(store.sessions.get(tokenHash), 'email'), false);
  assert.equal(store.sessions.has(sessionToken), false);

  const replay = await verifyEndpoint(createContext(makeRequest('/api/auth/verify-code', {
    body: { challengeId: requestBody.challengeId, code: delivery.pin },
  })));
  assert.equal(replay.status, 401);
});

test('session authorization accepts only an active hashed D1 session', async () => {
  const env = makeEnv();
  const store = createMemoryStore();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = await hashSessionToken({
    hmacSecret: env.AUTH_HMAC_SECRET,
    token: rawToken,
  });
  store.sessions.set(tokenHash, {
    created_at: Math.floor(nowMs / 1000),
    expires_at: Math.floor(nowMs / 1000) + AUTH_SESSION_TTL_SECONDS,
    revoked_at: null,
    token_hash: tokenHash,
  });

  const authorized = await authorizeCustomSessionRequest({
    env,
    now: nowMs,
    request: makeRequest('/', {
      cookie: `${AUTH_SESSION_COOKIE}=${rawToken}`,
      method: 'GET',
      requestOrigin: null,
    }),
    store,
  });
  assert.equal(authorized.authorized, true);
  assert.equal(authorized.email, 'l3.dc@example.com');

  store.sessions.get(tokenHash).revoked_at = Math.floor(nowMs / 1000);
  const revoked = await authorizeCustomSessionRequest({
    env,
    now: nowMs,
    request: makeRequest('/', {
      cookie: `${AUTH_SESSION_COOKIE}=${rawToken}`,
      method: 'GET',
      requestOrigin: null,
    }),
    store,
  });
  assert.equal(revoked.authorized, false);
  assert.equal(revoked.reason, 'invalid_session');
});

test('session endpoint preserves Cloudflare Access mode during staged rollout', async () => {
  const endpoint = createSessionEndpoint();
  const context = createContext(makeRequest('/api/auth/session', {
    method: 'GET',
    requestOrigin: null,
  }), makeEnv({ AUTH_MODE: 'cloudflare_access' }));
  context.data.accessUser = { email: 'l3.dc@example.com' };
  const response = await endpoint(context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    expiresAt: null,
    ok: true,
    user: { email: 'l3.d***@example.com' },
  });
});

test('logout revokes the hashed session and clears the cookie', async () => {
  const env = makeEnv();
  const store = createMemoryStore();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = await hashSessionToken({
    hmacSecret: env.AUTH_HMAC_SECRET,
    token: rawToken,
  });
  store.sessions.set(tokenHash, {
    created_at: Math.floor(nowMs / 1000),
    expires_at: Math.floor(nowMs / 1000) + AUTH_SESSION_TTL_SECONDS,
    revoked_at: null,
    token_hash: tokenHash,
  });

  const endpoint = createLogoutEndpoint({
    createStore: () => store,
    now: () => nowMs,
  });
  const response = await endpoint(createContext(makeRequest('/api/auth/logout', {
    body: {},
    cookie: `${AUTH_SESSION_COOKIE}=${rawToken}`,
  }), env));
  assert.equal(response.status, 200);
  assert.equal(store.sessions.get(tokenHash).revoked_at, Math.floor(nowMs / 1000));
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('failed logout keeps the cookie so server-side revocation can be retried', async () => {
  const rawToken = generateOpaqueToken(32);
  const endpoint = createLogoutEndpoint({
    createStore: () => { throw new Error('D1 unavailable'); },
    logger: { error() {} },
    now: () => nowMs,
  });
  const response = await endpoint(createContext(makeRequest('/api/auth/logout', {
    body: {},
    cookie: `${AUTH_SESSION_COOKIE}=${rawToken}`,
  }), makeEnv()));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Set-Cookie'), null);
});

test('Cloudflare Access logout returns only the fixed provider logout path', async () => {
  const endpoint = createLogoutEndpoint();
  const response = await endpoint(createContext(makeRequest('/api/auth/logout', {
    body: {},
  }), makeEnv({ AUTH_MODE: 'cloudflare_access' })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: false,
    logoutUrl: '/cdn-cgi/access/logout',
    ok: true,
  });
});

test('auth POST endpoints reject cross-origin requests without touching state', async () => {
  let storeCreations = 0;
  const requestEndpoint = createRequestCodeEndpoint({
    createStore: () => {
      storeCreations += 1;
      return createMemoryStore();
    },
  });
  const response = await requestEndpoint(createContext(makeRequest(
    '/api/auth/request-code',
    {
      body: { turnstileToken: 'token' },
      requestOrigin: 'https://attacker.example.com',
    },
  )));
  assert.equal(response.status, 403);
  assert.equal(storeCreations, 0);
});

test('email masking never exposes the full local part', () => {
  assert.equal(maskEmail('l3.dc@example.com'), 'l3.d***@example.com');
  assert.equal(maskEmail('a@example.com'), 'a***@example.com');
});
