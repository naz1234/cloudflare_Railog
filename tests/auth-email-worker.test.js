import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleAuthEmailRequest,
} from '../workers/auth-email/src/index.js';

const serviceToken = 'service-token-that-is-at-least-32-characters-long';

function createEnv(overrides = {}) {
  const sent = [];
  return {
    sent,
    env: {
      AUTH_EMAIL_FROM: 'no-reply@example.com',
      AUTH_EMAIL_SERVICE_TOKEN: serviceToken,
      AUTH_LOGIN_EMAIL: 'shared@example.com',
      EMAIL: {
        async send(message) {
          sent.push(message);
          return { messageId: 'test-message' };
        },
      },
      ...overrides,
    },
  };
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
  const { env, sent } = createEnv();

  const wrongPath = await handleAuthEmailRequest(
    createRequest({ path: '/send/extra' }),
    env,
  );
  assert.equal(wrongPath.status, 404);

  const wrongMethod = await handleAuthEmailRequest(
    createRequest({ method: 'GET' }),
    env,
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('Allow'), 'POST');
  assert.equal(sent.length, 0);
});

test('requires a configured, matching bearer service secret', async () => {
  const { env, sent } = createEnv();

  const missing = await handleAuthEmailRequest(
    createRequest({ token: null }),
    env,
  );
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('WWW-Authenticate'), 'Bearer');

  const wrong = await handleAuthEmailRequest(
    createRequest({ token: 'wrong-service-token-that-is-still-long-enough' }),
    env,
  );
  assert.equal(wrong.status, 401);

  const { env: missingSecretEnv } = createEnv({
    AUTH_EMAIL_SERVICE_TOKEN: '',
  });
  const unavailable = await handleAuthEmailRequest(
    createRequest(),
    missingSecretEnv,
  );
  assert.equal(unavailable.status, 503);

  const { env: whitespaceSecretEnv } = createEnv({
    AUTH_EMAIL_SERVICE_TOKEN: ' '.repeat(32),
  });
  const whitespaceUnavailable = await handleAuthEmailRequest(
    createRequest(),
    whitespaceSecretEnv,
  );
  assert.equal(whitespaceUnavailable.status, 503);
  assert.equal(sent.length, 0);
});

test('validates the JSON media type, size, PIN, request reference, and exact keys', async () => {
  const { env, sent } = createEnv();

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
    const response = await handleAuthEmailRequest(entry.request, env);
    assert.equal(response.status, entry.status);
  }
  assert.equal(sent.length, 0);
});

test('sends with only the fixed server-side recipient and sender', async () => {
  const { env, sent } = createEnv();
  const pin = '012345';
  const requestRef = 'WEST42';

  const response = await handleAuthEmailRequest(createRequest({
    body: { pin, requestRef },
  }), env);
  const responseText = await response.text();

  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, env.AUTH_EMAIL_FROM);
  assert.equal(sent[0].to, env.AUTH_LOGIN_EMAIL);
  assert.match(sent[0].subject, new RegExp(requestRef));
  assert.match(sent[0].text, new RegExp(pin));
  assert.match(sent[0].text, new RegExp(requestRef));
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
  const { env } = createEnv({
    EMAIL: {
      async send() {
        throw new Error(`delivery failed for PIN ${pin}`);
      },
    },
  });

  console.error = (...args) => calls.push(args);
  console.info = (...args) => calls.push(args);
  console.log = (...args) => calls.push(args);
  console.warn = (...args) => calls.push(args);

  try {
    const response = await handleAuthEmailRequest(createRequest({
      body: { pin, requestRef: 'FAIL42' },
    }), env);
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
