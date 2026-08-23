import { createRemoteJWKSet, jwtVerify } from 'jose';

export const DEFAULT_EXPECTED_OCC_EMAIL_COUNT = 38;

const remoteJwksByUrl = new Map();

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseAllowedEmails(value) {
  const emails = String(value || '')
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);

  return [...new Set(emails)];
}

export function parseAccessAudiences(value) {
  return [...new Set(
    String(value || '')
      .split(/[\s,;]+/)
      .map((audience) => audience.trim())
      .filter(Boolean),
  )];
}

export function normalizeTeamDomain(value) {
  let domain = String(value || '').trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').split('/')[0];

  if (domain && !domain.includes('.')) {
    domain = `${domain}.cloudflareaccess.com`;
  }

  if (!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(domain)) {
    return '';
  }

  return domain;
}

export function getAccessConfiguration(env = {}) {
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audiences = parseAccessAudiences(env.CF_ACCESS_AUD);
  const allowedEmails = parseAllowedEmails(env.OCC_ALLOWED_EMAILS);
  const expectedEmailCount = DEFAULT_EXPECTED_OCC_EMAIL_COUNT;
  const issues = [];

  if (!teamDomain) issues.push('CF_ACCESS_TEAM_DOMAIN is missing or invalid.');
  if (audiences.length === 0) issues.push('CF_ACCESS_AUD is missing.');
  if (allowedEmails.length !== expectedEmailCount) {
    issues.push(
      `OCC_ALLOWED_EMAILS must contain exactly ${expectedEmailCount} unique addresses; found ${allowedEmails.length}.`,
    );
  }

  return {
    audiences,
    allowedEmails,
    expectedEmailCount,
    issues,
    teamDomain,
    valid: issues.length === 0,
  };
}

function getRemoteJwks(teamDomain) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;

  if (!remoteJwksByUrl.has(url)) {
    remoteJwksByUrl.set(url, createRemoteJWKSet(new URL(url)));
  }

  return remoteJwksByUrl.get(url);
}

export async function verifyCloudflareAccessJwt(
  token,
  config,
  jwks = getRemoteJwks(config.teamDomain),
) {
  return jwtVerify(token, jwks, {
    algorithms: ['RS256'],
    audience: config.audiences,
    issuer: `https://${config.teamDomain}`,
  });
}

export async function authorizeOccRequest({
  request,
  env,
  verifyJwt = verifyCloudflareAccessJwt,
}) {
  const config = getAccessConfiguration(env);

  if (!config.valid) {
    return {
      authorized: false,
      issues: config.issues,
      reason: 'configuration_error',
      status: 503,
    };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return {
      authorized: false,
      reason: 'missing_access_token',
      status: 401,
    };
  }

  try {
    const { payload } = await verifyJwt(token, config);
    const email = normalizeEmail(payload?.email);

    if (!email) {
      return {
        authorized: false,
        reason: 'missing_email_claim',
        status: 401,
      };
    }

    if (!config.allowedEmails.includes(email)) {
      return {
        authorized: false,
        reason: 'email_not_allowed',
        status: 403,
      };
    }

    return {
      authorized: true,
      email,
      payload,
      status: 200,
    };
  } catch (error) {
    const invalidTokenCodes = new Set([
      'ERR_JWS_INVALID',
      'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
      'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
      'ERR_JWKS_NO_MATCHING_KEY',
      'ERR_JWT_CLAIM_VALIDATION_FAILED',
      'ERR_JWT_EXPIRED',
      'ERR_JWT_INVALID',
    ]);

    if (!invalidTokenCodes.has(error?.code)) {
      return {
        authorized: false,
        reason: 'access_verification_unavailable',
        status: 503,
      };
    }

    return {
      authorized: false,
      reason: 'invalid_access_token',
      status: 401,
    };
  }
}
