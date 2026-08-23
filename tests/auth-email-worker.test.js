import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleAuthEmailRequest,
} from '../workers/auth-email/src/index.js';

const serviceToken = 'service-token-that-is-at-least-32-characters-long';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const sendEndpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function createEnv(overrides = {}) {
  const providerCalls = [];
  const fetcher = async (url, init) => {
    providerCalls.push({ init, url });
    if (url === tokenEndpoint) {
      return Response.json({
        access_token: 'short-lived-gmail-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }
    if (url === sendEndpoint) {
      return Response.json({ id: 'test-message' });
    }
    return new Response(null, { status: 404 });
  };
  const env = {
    AUTH_EMAIL_FROM: 'l3dc.login@gmail.com',
    AUTH_EMAIL_SERVICE_TOKEN: serviceToken,
    AUTH_GMAIL_CLIENT_ID: '123456-example.apps.googleusercontent.com',
    AUTH_GMAIL_CLIENT_SECRET: 'google-client-secret-value',
    AUTH_GMAIL_REFRESH_TOKEN: 'google-refresh-token-value',
    AUTH_LOGIN_EMAIL: 'shared@example.com',
    ...overrides,
  };
  return {
    env,
    fetcher,
    providerCalls,
  };
}

function handle(request, env, fetcher) {
  return handleAuthEmailRequest(request, env, { fetcher });
}

function createRequest({
  body = { pin: '012345', requestRef: 'AB12CD' },
  contentType = 'application/json',
  method = 'POST',
  path = '/send',
  token = serviceToken,
} = {}) {
  const headers = new Headers();
  if (contentType) headers.set('Content-Type', contentType);
  if (token != null) headers.set('Authorization', `Bearer ${token}`);

  return new Request(`https://auth-email.internal${path}`, {
    body: method === 'GET' || method === 'HEAD'
      ? undefined
      : typeof body === 'string' ? body : JSON.stringify(body),
    headers,
    method,
  });
}

test('accepts only POST /send', async () => {
  const { env, fetcher, providerCalls } = createEnv();

  const wrongPath = await handle(
    createRequest({ path: '/send/extra' }),
    env,
    fetcher,
  );
  assert.equal(wrongPath.status, 404);

  const wrongMethod = await handle(
    createRequest({ method: 'GET' }),
    env,
    fetcher,
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('Allow'), 'POST');
  assert.equal(providerCalls.length, 0);
});

test('requires a configured, matching bearer service secret', async () => {
  const { env, fetcher, providerCalls } = createEnv();

  const missing = await handle(
    createRequest({ token: null }),
    env,
    fetcher,
  );
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('WWW-Authenticate'), 'Bearer');

  const wrong = await handle(
    createRequest({ token: 'wrong-service-token-that-is-still-long-enough' }),
    env,
    fetcher,
  );
  assert.equal(wrong.status, 401);

  const { env: missingSecretEnv, fetcher: missingSecretFetcher } = createEnv({
    AUTH_EMAIL_SERVICE_TOKEN: '',
  });
  const unavailable = await handle(
    createRequest(),
    missingSecretEnv,
    missingSecretFetcher,
  );
  assert.equal(unavailable.status, 503);

  const { env: whitespaceSecretEnv, fetcher: whitespaceSecretFetcher } = createEnv({
    AUTH_EMAIL_SERVICE_TOKEN: ' '.repeat(32),
  });
  const whitespaceUnavailable = await handle(
    createRequest(),
    whitespaceSecretEnv,
    whitespaceSecretFetcher,
  );
  assert.equal(whitespaceUnavailable.status, 503);

  const { env: missingGmailEnv, fetcher: missingGmailFetcher } = createEnv({
    AUTH_GMAIL_REFRESH_TOKEN: '',
  });
  const gmailUnavailable = await handle(
    createRequest(),
    missingGmailEnv,
    missingGmailFetcher,
  );
  assert.equal(gmailUnavailable.status, 503);
  assert.equal(providerCalls.length, 0);
});

test('validates the JSON media type, size, PIN, request reference, and exact keys', async () => {
  const { env, fetcher, providerCalls } = createEnv();

  const cases = [
    { request: createRequest({ contentType: 'text/plain' }), status: 415 },
    { request: createRequest({ body: '{bad json' }), status: 400 },
    { request: createRequest({ body: { pin: 123456, requestRef: 'AB12CD' } }), status: 400 },
    { request: createRequest({ body: { pin: '12345', requestRef: 'AB12CD' } }), status: 400 },
    { request: createRequest({ body: { pin: '123456', requestRef: 'abc123' } }), status: 400 },
    { request: createRequest({ body: { pin: '123456', requestRef: 'ABC' } }), status: 400 },
    { request: createRequest({ body: { pin: '123456', requestRef: 'ABCDEFGHIJKLMNOPQ' } }), status: 400 },
    {
      request: createRequest({
        body: {
          from: 'attacker@example.com',
          pin: '123456',
          requestRef: 'AB12CD',
        },
      }),
      status: 400,
    },
    {
      request: createRequest({
        body: {
          pin: '123456',
          requestRef: 'AB12CD',
          to: 'attacker@example.com',
        },
      }),
      status: 400,
    },
    {
      request: createRequest({ body: 'x'.repeat(1025) }),
      status: 413,
    },
  ];

  for (const entry of cases) {
    const response = await handle(entry.request, env, fetcher);
    assert.equal(response.status, entry.status);
  }
  assert.equal(providerCalls.length, 0);
});

test('sends with only the fixed server-side recipient and sender', async () => {
  const { env, fetcher, providerCalls } = createEnv();
  const pin = '012345';
  const requestRef = 'WEST42';

  const response = await handle(createRequest({
    body: { pin, requestRef },
  }), env, fetcher);
  const responseText = await response.text();

  assert.equal(response.status, 200);
  assert.equal(providerCalls.length, 2);
  assert.equal(providerCalls[0].url, tokenEndpoint);
  assert.equal(providerCalls[0].init.method, 'POST');
  assert.equal(providerCalls[0].init.body.get('client_id'), env.AUTH_GMAIL_CLIENT_ID);
  assert.equal(providerCalls[0].init.body.get('client_secret'), env.AUTH_GMAIL_CLIENT_SECRET);
  assert.equal(providerCalls[0].init.body.get('refresh_token'), env.AUTH_GMAIL_REFRESH_TOKEN);
  assert.equal(providerCalls[0].init.body.get('grant_type'), 'refresh_token');
  assert.equal(providerCalls[1].url, sendEndpoint);
  assert.equal(
    providerCalls[1].init.headers.Authorization,
    'Bearer short-lived-gmail-access-token',
  );
  const gmailPayload = JSON.parse(providerCalls[1].init.body);
  const mime = Buffer.from(gmailPayload.raw, 'base64url').toString('utf8');
  assert.match(mime, new RegExp(`From: L3 DC Template Login <${env.AUTH_EMAIL_FROM}>`));
  assert.match(mime, new RegExp(`To: ${env.AUTH_LOGIN_EMAIL}`));
  assert.match(mime, new RegExp(requestRef));
  assert.match(mime, new RegExp(pin));
  assert.doesNotMatch(responseText, new RegExp(pin));
  assert.deepEqual(JSON.parse(responseText), { ok: true });
});

test('never logs or returns a PIN when delivery fails', async () => {
  const pin = '654321';
  const calls = [];
  const originalConsole = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const { env } = createEnv();
  const fetcher = async (url) => {
    if (url === tokenEndpoint) {
      return Response.json({ access_token: 'short-lived-gmail-access-token' });
    }
    throw new Error(`delivery failed for PIN ${pin}`);
  };

  console.error = (...args) => calls.push(args);
  console.info = (...args) => calls.push(args);
  console.log = (...args) => calls.push(args);
  console.warn = (...args) => calls.push(args);

  try {
    const response = await handle(createRequest({
      body: { pin, requestRef: 'FAIL42' },
    }), env, fetcher);
    const responseText = await response.text();

    assert.equal(response.status, 502);
    assert.doesNotMatch(responseText, new RegExp(pin));
    assert.equal(calls.length, 0);
  } finally {
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
  }
});

test('fails closed when Google rejects the refresh token', async () => {
  const pin = '987654';
  const { env } = createEnv();
  const response = await handle(createRequest({
    body: { pin, requestRef: 'OAUTH7' },
  }), env, async (url) => {
    assert.equal(url, tokenEndpoint);
    return Response.json({
      error: 'invalid_grant',
      error_description: `rejected PIN ${pin}`,
    }, { status: 400 });
  });
  const responseText = await response.text();

  assert.equal(response.status, 502);
  assert.doesNotMatch(responseText, new RegExp(pin));
  assert.deepEqual(JSON.parse(responseText), {
    error: {
      code: 'DELIVERY_FAILED',
      message: 'Authentication email could not be delivered.',
    },
    ok: false,
  });
});
