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
import { createAccessMiddleware } from '../functions/_middleware.js';

const memberEmails = Array.from(
  { length: 1 },
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

test('fails closed unless the private allowlist has exactly 1 email', () => {
  const valid = getAccessConfiguration(makeEnv());
  assert.equal(valid.valid, true);
  assert.equal(valid.allowedEmails.length, 1);

  const short = getAccessConfiguration(makeEnv({
    OCC_ALLOWED_EMAILS: '',
  }));
  assert.equal(short.valid, false);
  assert.match(short.issues.join(' '), /exactly 1 unique address; found 0/);

  const attemptedExpansion = getAccessConfiguration(makeEnv({
    OCC_ALLOWED_EMAILS: [...memberEmails, 'member2@example.com'].join(','),
    OCC_EXPECTED_EMAIL_COUNT: '2',
  }));
  assert.equal(attemptedExpansion.valid, false);
  assert.match(attemptedExpansion.issues.join(' '), /exactly 1 unique address; found 2/);
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

test('rejects an invalid Access JWT and an email outside the shared-address allowlist', async () => {
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

test('allows a cryptographically verified JWT for the single shared address', async () => {
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
