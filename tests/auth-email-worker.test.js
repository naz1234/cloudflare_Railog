import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleAuthEmailRequest,
} from '../workers/auth-email/src/index.js';

const serviceToken = 'service-token-that-is-at-least-32-characters-long';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const sendEndpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const requestedRecipient = 'first.user@flow-metro.com';

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
    AUTH_ALLOWED_EMAILS: 'First.User@flow-metro.com, Second.User@flow-metro.com',
    ...overrides,
  };
  return {
    env,
    fetcher,
    providerCalls,
  };
}

const silentLogger = Object.freeze({ error() {} });

function handle(request, env, fetcher, logger = silentLogger) {
  return handleAuthEmailRequest(request, env, { fetcher, logger });
}

function createRequest({
  body = { pin: '012345', recipient: requestedRecipient, requestRef: 'AB12CD' },
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

  const { env: missingRecipientsEnv, fetcher: missingRecipientsFetcher } = createEnv({
    AUTH_ALLOWED_EMAILS: '',
  });
  const recipientsUnavailable = await handle(
    createRequest(),
    missingRecipientsEnv,
    missingRecipientsFetcher,
  );
  assert.equal(recipientsUnavailable.status, 503);

  const { env: invalidRecipientsEnv, fetcher: invalidRecipientsFetcher } = createEnv({
    AUTH_ALLOWED_EMAILS: 'First.User@example.com, not-an-email',
  });
  const invalidRecipientsUnavailable = await handle(
    createRequest(),
    invalidRecipientsEnv,
    invalidRecipientsFetcher,
  );
  assert.equal(invalidRecipientsUnavailable.status, 503);
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
          recipient: requestedRecipient,
          requestRef: 'AB12CD',
          to: 'attacker@example.com',
        },
      }),
      status: 400,
    },
    {
      request: createRequest({
        body: { pin: '123456', recipient: 'outsider@example.com', requestRef: 'AB12CD' },
      }),
      status: 400,
    },
    {
      request: createRequest({
        body: { pin: '123456', recipient: 42, requestRef: 'AB12CD' },
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

test('sends only to an allowlisted recipient using configured canonical casing', async () => {
  const { env, fetcher, providerCalls } = createEnv();
  const pin = '012345';
  const requestRef = 'WEST42';

  const response = await handle(createRequest({
    body: { pin, recipient: requestedRecipient.toUpperCase(), requestRef },
  }), env, fetcher);
  const responseText = await response.text();

  assert.equal(response.status, 200);
  assert.equal(providerCalls.length, 2);
  assert.equal(providerCalls[0].url, tokenEndpoint);
  assert.equal(providerCalls[0].init.method, 'POST');
  assert.equal(providerCalls[0].init.redirect, 'manual');
  assert.equal(providerCalls[0].init.body.get('client_id'), env.AUTH_GMAIL_CLIENT_ID);
  assert.equal(providerCalls[0].init.body.get('client_secret'), env.AUTH_GMAIL_CLIENT_SECRET);
  assert.equal(providerCalls[0].init.body.get('refresh_token'), env.AUTH_GMAIL_REFRESH_TOKEN);
  assert.equal(providerCalls[0].init.body.get('grant_type'), 'refresh_token');
  assert.equal(providerCalls[1].url, sendEndpoint);
  assert.equal(providerCalls[1].init.redirect, 'manual');
  assert.equal(
    providerCalls[1].init.headers.Authorization,
    'Bearer short-lived-gmail-access-token',
  );
  const gmailPayload = JSON.parse(providerCalls[1].init.body);
  const mime = Buffer.from(gmailPayload.raw, 'base64url').toString('utf8');
  assert.match(mime, new RegExp(`From: L3 DC Template Login <${env.AUTH_EMAIL_FROM}>`));
  assert.match(mime, /To: First\.User@flow-metro\.com/);
  assert.match(mime, new RegExp(requestRef));
  assert.match(mime, new RegExp(pin));
  assert.doesNotMatch(responseText, new RegExp(pin));
  assert.deepEqual(JSON.parse(responseText), { ok: true });
});

test('rejects two-field requests even when the retired shared-recipient setting exists', async () => {
  const legacyBody = { pin: '012345', requestRef: 'OLD123' };
  const legacy = createEnv({
    AUTH_LOGIN_EMAIL: 'Legacy.User@example.com',
  });
  const rejected = await handle(
    createRequest({ body: legacyBody }),
    legacy.env,
    legacy.fetcher,
  );
  assert.equal(rejected.status, 400);
  assert.equal(legacy.providerCalls.length, 0);
});

test('logs only a fixed failure stage and never logs or returns a PIN', async () => {
  const pin = '654321';
  const calls = [];
  const { env } = createEnv();
  const fetcher = async (url) => {
    if (url === tokenEndpoint) {
      return Response.json({ access_token: 'short-lived-gmail-access-token' });
    }
    throw new Error(`delivery failed for PIN ${pin}`);
  };

  const response = await handle(createRequest({
    body: { pin, recipient: requestedRecipient, requestRef: 'FAIL42' },
  }), env, fetcher, { error: (...args) => calls.push(args) });
  const responseText = await response.text();
  const loggedText = JSON.stringify(calls);

  assert.equal(response.status, 502);
  assert.doesNotMatch(responseText, new RegExp(pin));
  assert.doesNotMatch(loggedText, new RegExp(pin));
  assert.equal(calls.length, 1);
  assert.match(loggedText, /gmail_message_delivery/);
});

test('fails closed with a safe stage when Google rejects the refresh token', async () => {
  const pin = '987654';
  const calls = [];
  const { env } = createEnv();
  const response = await handle(createRequest({
    body: { pin, recipient: requestedRecipient, requestRef: 'OAUTH7' },
  }), env, async (url) => {
    assert.equal(url, tokenEndpoint);
    return Response.json({
      error: 'invalid_grant',
      error_description: `rejected PIN ${pin}`,
    }, { status: 400 });
  }, { error: (...args) => calls.push(args) });
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
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(calls), /oauth_invalid_grant/);
  assert.doesNotMatch(JSON.stringify(calls), new RegExp(pin));
});

test('fails closed with a safe stage when Google rejects the OAuth client', async () => {
  const pin = '192837';
  const calls = [];
  const { env } = createEnv();
  const response = await handle(createRequest({
    body: { pin, recipient: requestedRecipient, requestRef: 'CLIENT8' },
  }), env, async (url) => {
    assert.equal(url, tokenEndpoint);
    return Response.json({
      error: 'invalid_client',
      error_description: `rejected PIN ${pin}`,
    }, { status: 401 });
  }, { error: (...args) => calls.push(args) });
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
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(calls), /oauth_invalid_client/);
  assert.doesNotMatch(JSON.stringify(calls), new RegExp(pin));
});

test('classifies remaining OAuth failures without logging provider details', async () => {
  const scenarios = [
    {
      expectedStage: 'oauth_invalid_request',
      response: Response.json({ error: 'invalid_request', error_description: 'sensitive detail' }, { status: 400 }),
    },
    {
      expectedStage: 'oauth_unauthorized_client',
      response: Response.json({ error: 'unauthorized_client', error_description: 'sensitive detail' }, { status: 400 }),
    },
    {
      expectedStage: 'oauth_unsupported_grant',
      response: Response.json({ error: 'unsupported_grant_type', error_description: 'sensitive detail' }, { status: 400 }),
    },
    {
      expectedStage: 'oauth_missing_token',
      response: Response.json({ token_type: 'Bearer' }),
    },
  ];

  for (const { expectedStage, response: providerResponse } of scenarios) {
    const calls = [];
    const { env } = createEnv();
    const response = await handle(createRequest(), env, async () => providerResponse.clone(), {
      error: (...args) => calls.push(args),
    });

    assert.equal(response.status, 502);
    assert.equal(calls.length, 1);
    assert.match(JSON.stringify(calls), new RegExp(expectedStage));
    assert.doesNotMatch(JSON.stringify(calls), /sensitive detail/);
  }
});

test('classifies an OAuth network failure without logging the thrown error', async () => {
  const calls = [];
  const { env } = createEnv();
  const response = await handle(createRequest(), env, async () => {
    throw new Error('sensitive network detail');
  }, { error: (...args) => calls.push(args) });

  assert.equal(response.status, 502);
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(calls), /oauth_network/);
  assert.doesNotMatch(JSON.stringify(calls), /sensitive network detail/);
});
