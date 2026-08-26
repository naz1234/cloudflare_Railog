import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';

import {
  authorizeOccRequest,
  getAccessConfiguration,
  normalizeTeamDomain,
  parseAccessAudiences,
  parseAllowedEmails,
  verifyCloudflareAccessJwt,
} from '../functions/lib/cloudflare-access.js';
import {
  createAccessMiddleware,
  createAuthMiddleware,
} from '../functions/_middleware.js';

const memberEmails = Array.from(
  { length: 21 },
  (_, index) => `member${index + 1}@example.com`,
);

function makeEnv(overrides = {}) {
  return {
    CF_ACCESS_AUD: 'test-audience-tag',
    CF_ACCESS_TEAM_DOMAIN: 'occ-team.cloudflareaccess.com',
    OCC_ALLOWED_EMAILS: memberEmails.join('\n'),
    ...overrides,
  };
}

function makeRequest(token = 'signed-access-token') {
  return new Request('https://railog.example.com/', {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  });
}

test('normalizes the Access team domain and exact email allowlist', () => {
  assert.equal(
    normalizeTeamDomain('https://OCC-Team.cloudflareaccess.com/path'),
    'occ-team.cloudflareaccess.com',
  );
  assert.equal(normalizeTeamDomain('occ-team'), 'occ-team.cloudflareaccess.com');
  assert.equal(normalizeTeamDomain('example.com'), '');

  assert.deepEqual(
    parseAllowedEmails(' First@Example.com,second@example.com\nFIRST@example.com '),
    ['first@example.com', 'second@example.com'],
  );
  assert.deepEqual(
    parseAccessAudiences('production-aud,custom-domain-aud\nproduction-aud'),
    ['production-aud', 'custom-domain-aud'],
  );
});

test('fails closed unless the private allowlist contains valid individual emails', () => {
  const valid = getAccessConfiguration(makeEnv());
  assert.equal(valid.valid, true);
  assert.equal(valid.allowedEmails.length, 21);

  const short = getAccessConfiguration(makeEnv({
    OCC_ALLOWED_EMAILS: '',
  }));
  assert.equal(short.valid, false);
  assert.match(short.issues.join(' '), /1-100 valid email addresses/);

  const invalidAddress = getAccessConfiguration(makeEnv({
    OCC_ALLOWED_EMAILS: [...memberEmails, 'not-an-email'].join(','),
  }));
  assert.equal(invalidAddress.valid, false);
  assert.match(invalidAddress.issues.join(' '), /1-100 valid email addresses/);
});

test('rejects a request that has no Cloudflare Access JWT', async () => {
  const result = await authorizeOccRequest({
    request: makeRequest(''),
    env: makeEnv(),
  });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'missing_access_token');
  assert.equal(result.status, 401);
});

test('rejects an invalid Access JWT and an email outside the individual allowlist', async () => {
  const invalid = await authorizeOccRequest({
    request: makeRequest(),
    env: makeEnv(),
    verifyJwt: async () => {
      throw Object.assign(new Error('invalid signature'), {
        code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
      });
    },
  });
  assert.equal(invalid.reason, 'invalid_access_token');
  assert.equal(invalid.status, 401);

  const unlisted = await authorizeOccRequest({
    request: makeRequest(),
    env: makeEnv(),
    verifyJwt: async () => ({ payload: { email: 'outsider@example.com' } }),
  });
  assert.equal(unlisted.reason, 'email_not_allowed');
  assert.equal(unlisted.status, 403);
});

test('keeps requests denied when the remote Access keys are unavailable', async () => {
  const result = await authorizeOccRequest({
    request: makeRequest(),
    env: makeEnv(),
    verifyJwt: async () => {
      throw new TypeError('fetch failed');
    },
  });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'access_verification_unavailable');
  assert.equal(result.status, 503);
});

test('allows a cryptographically verified JWT for an approved individual address', async () => {
  const result = await authorizeOccRequest({
    request: makeRequest(),
    env: makeEnv(),
    verifyJwt: async (token, config) => {
      assert.equal(token, 'signed-access-token');
      assert.deepEqual(config.audiences, ['test-audience-tag']);
      return {
        payload: {
          email: 'MEMBER1@EXAMPLE.COM',
          sub: 'user-1',
        },
      };
    },
  });

  assert.equal(result.authorized, true);
  assert.equal(result.email, 'member1@example.com');
});

test('verifies the Access signature, issuer, audience, and expiry', async () => {
  const config = getAccessConfiguration(makeEnv());
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'RS256';
  publicJwk.kid = 'test-key';
  publicJwk.use = 'sig';
  const jwks = createLocalJWKSet({ keys: [publicJwk] });

  const sign = ({
    audience = config.audiences[0],
    expiresIn = '5m',
    issuer = `https://${config.teamDomain}`,
  } = {}) => new SignJWT({ email: memberEmails[0] })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(privateKey);

  const validToken = await sign();
  const verified = await verifyCloudflareAccessJwt(validToken, config, jwks);
  assert.equal(verified.payload.email, memberEmails[0]);

  const multiAudienceConfig = getAccessConfiguration(makeEnv({
    CF_ACCESS_AUD: 'production-aud,custom-domain-aud',
  }));
  const customDomainToken = await sign({ audience: 'custom-domain-aud' });
  const customDomainVerified = await verifyCloudflareAccessJwt(
    customDomainToken,
    multiAudienceConfig,
    jwks,
  );
  assert.equal(customDomainVerified.payload.email, memberEmails[0]);

  await assert.rejects(
    verifyCloudflareAccessJwt(await sign({ audience: 'wrong-audience' }), config, jwks),
  );
  await assert.rejects(
    verifyCloudflareAccessJwt(
      await sign({ issuer: 'https://another-team.cloudflareaccess.com' }),
      config,
      jwks,
    ),
  );
  await assert.rejects(
    verifyCloudflareAccessJwt(await sign({ expiresIn: 0 }), config, jwks),
  );
});

test('middleware never calls the application for a denied request', async () => {
  let nextCalls = 0;
  const middleware = createAccessMiddleware({
    authorize: async () => ({
      authorized: false,
      issues: ['missing settings'],
      reason: 'configuration_error',
      status: 503,
    }),
    logger: { error: () => {} },
  });

  const response = await middleware({
    data: {},
    env: {},
    next: async () => {
      nextCalls += 1;
      return new Response('unexpected');
    },
    request: makeRequest(),
  });

  assert.equal(response.status, 503);
  assert.equal(nextCalls, 0);
});

test('middleware attaches the verified user before calling the application', async () => {
  let nextCalls = 0;
  const data = {};
  const middleware = createAccessMiddleware({
    authorize: async () => ({
      authorized: true,
      email: memberEmails[0],
      payload: { sub: 'member-subject' },
      status: 200,
    }),
  });

  const response = await middleware({
    data,
    env: makeEnv(),
    next: async () => {
      nextCalls += 1;
      return new Response('ok');
    },
    request: makeRequest(),
  });

  assert.equal(await response.text(), 'ok');
  assert.equal(nextCalls, 1);
  assert.deepEqual(data.accessUser, {
    email: memberEmails[0],
    subject: 'member-subject',
  });
});

test('middleware returns 403 and does not call the app for an unlisted email', async () => {
  let nextCalls = 0;
  const middleware = createAccessMiddleware({
    authorize: async () => ({
      authorized: false,
      reason: 'email_not_allowed',
      status: 403,
    }),
  });

  const response = await middleware({
    data: {},
    env: makeEnv(),
    next: async () => {
      nextCalls += 1;
      return new Response('unexpected');
    },
    request: makeRequest(),
  });

  assert.equal(response.status, 403);
  assert.equal(nextCalls, 0);
});

test('middleware leaves only the certificate-validation challenge path public', async () => {
  let authorizeCalls = 0;
  let nextCalls = 0;
  const middleware = createAccessMiddleware({
    authorize: async () => {
      authorizeCalls += 1;
      throw new Error('ACME validation must not enter the auth flow');
    },
  });

  const response = await middleware({
    data: {},
    env: {},
    next: async () => {
      nextCalls += 1;
      return new Response('challenge');
    },
    request: new Request(
      'https://railog.example.com/.well-known/acme-challenge/token-value',
    ),
  });

  assert.equal(await response.text(), 'challenge');
  assert.equal(authorizeCalls, 0);
  assert.equal(nextCalls, 1);
});

test('combined middleware preserves Cloudflare Access as the default mode', async () => {
  let accessCalls = 0;
  let customCalls = 0;
  const middleware = createAuthMiddleware({
    authorizeAccess: async () => {
      accessCalls += 1;
      return {
        authorized: true,
        email: memberEmails[0],
        payload: { sub: 'access-user' },
      };
    },
    authorizeCustom: async () => {
      customCalls += 1;
      return { authorized: true };
    },
  });

  const response = await middleware({
    data: {},
    env: makeEnv(),
    next: async () => new Response('access mode'),
    request: makeRequest(),
  });

  assert.equal(await response.text(), 'access mode');
  assert.equal(accessCalls, 1);
  assert.equal(customCalls, 0);
});

test('custom mode exposes only the exact login shell and auth endpoints', async () => {
  let authorizeCalls = 0;
  const middleware = createAuthMiddleware({
    authorizeCustom: async () => {
      authorizeCalls += 1;
      return { authorized: false, reason: 'missing_session', status: 401 };
    },
  });

  const publicRequests = [
    new Request('https://railog.example.com/login'),
    new Request('https://railog.example.com/login.html'),
    new Request('https://railog.example.com/auth/login.css'),
    new Request('https://railog.example.com/auth/login.js'),
    new Request('https://railog.example.com/favicon.png'),
    new Request('https://railog.example.com/api/auth/config'),
    new Request('https://railog.example.com/api/auth/session'),
    new Request('https://railog.example.com/api/auth/request-code', {
      method: 'POST',
      headers: { Origin: 'https://railog.example.com' },
    }),
  ];

  for (const request of publicRequests) {
    const response = await middleware({
      data: {},
      env: { AUTH_MODE: 'custom_pin' },
      next: async () => new Response('public'),
      request,
    });
    assert.equal(await response.text(), 'public');
    if (['/login', '/login.html'].includes(new URL(request.url).pathname)) {
      assert.match(
        response.headers.get('Content-Security-Policy') || '',
        /frame-src https:\/\/challenges\.cloudflare\.com/,
      );
      assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
      assert.match(response.headers.get('Cache-Control') || '', /no-store/);
    }
  }

  for (const path of [
    '/auth/internal.js',
    '/auth/login.js/extra',
    '/auth/%6cogin.js',
    '/login.html/extra',
    '/api/auth/internal',
  ]) {
    const privateResponse = await middleware({
      data: {},
      env: { AUTH_MODE: 'custom_pin' },
      next: async () => new Response('unexpected'),
      request: new Request(`https://railog.example.com${path}`),
    });

    assert.equal(privateResponse.status, 401);
  }
  assert.equal(authorizeCalls, 5);

  const wrongMethodResponse = await middleware({
    data: {},
    env: { AUTH_MODE: 'custom_pin' },
    next: async () => new Response('unexpected'),
    request: new Request('https://railog.example.com/api/auth/request-code'),
  });
  assert.equal(wrongMethodResponse.status, 401);
  assert.equal(authorizeCalls, 6);
});

test('custom mode serves the canonical extensionless login without checking a session', async () => {
  let authorizeCalls = 0;
  let nextCalls = 0;
  const middleware = createAuthMiddleware({
    authorizeCustom: async () => {
      authorizeCalls += 1;
      return { authorized: false, reason: 'missing_session', status: 401 };
    },
  });

  for (const method of ['GET', 'HEAD']) {
    const response = await middleware({
      data: {},
      env: { AUTH_MODE: 'custom_pin' },
      next: async () => {
        nextCalls += 1;
        return new Response(method === 'HEAD' ? null : 'login');
      },
      request: new Request('https://railog.example.com/login', {
        method,
        headers: { Accept: 'text/html' },
      }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Security-Policy') || '', /frame-ancestors 'none'/);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  }

  assert.equal(nextCalls, 2);
  assert.equal(authorizeCalls, 0);
});

test('custom mode redirects unauthenticated document requests without exposing assets', async () => {
  const middleware = createAuthMiddleware({
    authorizeCustom: async () => ({
      authorized: false,
      reason: 'missing_session',
      status: 401,
    }),
  });

  const documentResponse = await middleware({
    data: {},
    env: { AUTH_MODE: 'custom_pin' },
    next: async () => new Response('unexpected'),
    request: new Request('https://railog.example.com/', {
      headers: { Accept: 'text/html' },
    }),
  });
  assert.equal(documentResponse.status, 302);
  assert.equal(
    documentResponse.headers.get('Location'),
    'https://railog.example.com/login',
  );

  const assetResponse = await middleware({
    data: {},
    env: { AUTH_MODE: 'custom_pin' },
    next: async () => new Response('unexpected'),
    request: new Request('https://railog.example.com/assets/main.js'),
  });
  assert.equal(assetResponse.status, 401);
});

test('custom mode attaches the verified session before serving protected content', async () => {
  const data = {};
  const middleware = createAuthMiddleware({
    authorizeCustom: async () => ({
      authorized: true,
      email: 'l3.dc@example.com',
      expiresAt: '2026-08-23T12:00:00.000Z',
    }),
  });

  const response = await middleware({
    data,
    env: { AUTH_MODE: 'custom_pin' },
    next: async () => new Response('private'),
    request: new Request('https://railog.example.com/assets/main.js'),
  });

  assert.equal(await response.text(), 'private');
  assert.deepEqual(data.authUser, {
    email: 'l3.dc@example.com',
    expiresAt: '2026-08-23T12:00:00.000Z',
  });
});

test('custom mode blocks cross-site and originless mutations before auth handlers', async () => {
  let nextCalls = 0;
  const middleware = createAuthMiddleware();

  for (const headers of [
    { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'cross-site' },
    {},
  ]) {
    const response = await middleware({
      data: {},
      env: { AUTH_MODE: 'custom_pin' },
      next: async () => {
        nextCalls += 1;
        return new Response('unexpected');
      },
      request: new Request('https://railog.example.com/api/auth/request-code', {
        method: 'POST',
        headers,
      }),
    });
    assert.equal(response.status, 403);
  }

  assert.equal(nextCalls, 0);
});

test('custom mode fails closed for an invalid AUTH_MODE value', async () => {
  let nextCalls = 0;
  const middleware = createAuthMiddleware({ logger: { error: () => {} } });
  const response = await middleware({
    data: {},
    env: { AUTH_MODE: 'disabled' },
    next: async () => {
      nextCalls += 1;
      return new Response('unexpected');
    },
    request: new Request('https://railog.example.com/login.html'),
  });

  assert.equal(response.status, 503);
  assert.equal(nextCalls, 0);
});
