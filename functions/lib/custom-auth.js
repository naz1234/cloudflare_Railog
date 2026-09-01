export const AUTH_SESSION_COOKIE = '__Host-l3dc_session';
export const AUTH_CHALLENGE_TTL_SECONDS = 5 * 60;
export const AUTH_RESEND_AFTER_SECONDS = 60;
export const AUTH_SESSION_TTL_SECONDS = 10 * 60 * 60;
export const AUTH_MAX_PIN_ATTEMPTS = 5;
export const AUTH_PRESENCE_WINDOW_SECONDS = 2 * 60;
export const AUTH_ALLOWED_EMAIL_DOMAIN = 'flow-metro.com';
export const AUTH_MODES = Object.freeze({
  cloudflareAccess: 'cloudflare_access',
  customPin: 'custom_pin',
});

export const AUTH_RATE_LIMITS = Object.freeze({
  requestProviderCadence: { action: 'request-provider-cadence', limit: 30, windowSeconds: 60 },
  requestEmailBurst: { action: 'request-email-burst', limit: 1, windowSeconds: 60 },
  requestEmailWindow: { action: 'request-email-window', limit: 5, windowSeconds: 15 * 60 },
  requestIpBurst: { action: 'request-ip-burst', limit: 10, windowSeconds: 60 },
  requestIpWindow: { action: 'request-ip-window', limit: 30, windowSeconds: 15 * 60 },
  verifyIpWindow: { action: 'verify-ip-window', limit: 150, windowSeconds: 15 * 60 },
});

export const CUSTOM_AUTH_SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS auth_challenges (
    challenge_id TEXT PRIMARY KEY,
    pin_hash TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    used_at INTEGER,
    CHECK (attempt_count >= 0),
    CHECK (max_attempts > 0)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_challenges_created
    ON auth_challenges(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires
    ON auth_challenges(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    email_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
    ON auth_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (
    action TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (action, key_hash, window_start),
    CHECK (count >= 0)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expires
    ON auth_rate_limits(expires_at)`,
]);

const encoder = new TextEncoder();
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const jsonHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getChangedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export function toEpochSeconds(value) {
  return Math.floor(Number(value) / 1000);
}

export function getAuthMode(env = {}) {
  const value = String(env.AUTH_MODE || AUTH_MODES.cloudflareAccess)
    .trim()
    .toLowerCase();
  return Object.values(AUTH_MODES).includes(value) ? value : '';
}

export function normalizeAuthEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseSingleAuthEmail(value) {
  const raw = String(value || '').trim();
  const email = normalizeAuthEmail(raw);

  if (!email || /[\s,;]/.test(raw) || !emailPattern.test(email)) return '';
  return email;
}

export function parseAllowedAuthMembers(value) {
  const tokens = String(value || '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!tokens.length || tokens.length > 100) return [];

  const members = [];
  const seen = new Set();
  for (const canonicalEmail of tokens) {
    const normalizedEmail = parseSingleAuthEmail(canonicalEmail);
    if (
      !normalizedEmail
      || !normalizedEmail.endsWith(`@${AUTH_ALLOWED_EMAIL_DOMAIN}`)
      || seen.has(normalizedEmail)
    ) {
      return [];
    }
    seen.add(normalizedEmail);
    members.push({
      email: canonicalEmail,
      normalizedEmail,
      name: authDisplayName(canonicalEmail),
    });
  }
  return members;
}

export function authDisplayName(email) {
  const canonicalEmail = String(email || '').trim();
  const atIndex = canonicalEmail.indexOf('@');
  return atIndex > 0 ? canonicalEmail.slice(0, atIndex) : '';
}

export function findAllowedAuthMember(config, email) {
  const normalizedEmail = parseSingleAuthEmail(email);
  if (!normalizedEmail) return null;
  return config.allowedMembers.find(
    (member) => member.normalizedEmail === normalizedEmail,
  ) || null;
}

export function getCustomAuthConfiguration(env = {}) {
  const allowedMembers = parseAllowedAuthMembers(env.AUTH_ALLOWED_EMAILS);
  const hmacSecret = String(env.AUTH_HMAC_SECRET || '').trim();
  const turnstileSiteKey = String(env.TURNSTILE_SITE_KEY || '').trim();
  const turnstileSecretKey = String(env.TURNSTILE_SECRET_KEY || '').trim();
  const issues = [];

  if (!allowedMembers.length) {
    issues.push(`AUTH_ALLOWED_EMAILS must contain unique ${AUTH_ALLOWED_EMAIL_DOMAIN} addresses.`);
  }
  if (hmacSecret.length < 32) {
    issues.push('AUTH_HMAC_SECRET must be an encrypted secret of at least 32 characters.');
  }
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    issues.push('The D1 binding DB is missing.');
  }
  if (!turnstileSiteKey) {
    issues.push('TURNSTILE_SITE_KEY is missing.');
  }
  if (!turnstileSecretKey) {
    issues.push('TURNSTILE_SECRET_KEY is missing.');
  }

  return {
    db: env.DB,
    allowedMembers,
    hmacSecret,
    issues,
    turnstileSecretKey,
    turnstileSiteKey,
    valid: issues.length === 0,
  };
}

export function getAuthPresenceConfiguration(
  env = {},
  authConfig = getCustomAuthConfiguration(env),
) {
  const rawHiddenMembers = String(env.AUTH_PRESENCE_HIDDEN_EMAILS || '').trim();
  if (!rawHiddenMembers) {
    return { hiddenMembers: [], issues: [], valid: true };
  }

  const hiddenMembers = parseAllowedAuthMembers(rawHiddenMembers);
  const allowedEmails = new Set(
    (authConfig.allowedMembers || []).map((member) => member.normalizedEmail),
  );
  const issues = [];

  if (
    !hiddenMembers.length
    || hiddenMembers.some((member) => !allowedEmails.has(member.normalizedEmail))
  ) {
    issues.push(
      'AUTH_PRESENCE_HIDDEN_EMAILS must contain only unique approved staff addresses.',
    );
  }

  return {
    hiddenMembers: issues.length ? [] : hiddenMembers,
    issues,
    valid: issues.length === 0,
  };
}

export function maskEmail(email) {
  const canonicalEmail = String(email || '').trim();
  const atIndex = canonicalEmail.indexOf('@');
  if (atIndex < 1) return '';

  const local = canonicalEmail.slice(0, atIndex);
  const domain = canonicalEmail.slice(atIndex + 1);
  const visibleLength = Math.min(4, Math.max(1, local.length - 1));
  return `${local.slice(0, visibleLength)}***@${domain}`;
}

export function getClientIp(request) {
  const value = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]
    || 'unknown';
  return String(value).trim().slice(0, 128) || 'unknown';
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readJsonObject(request, { maxBytes = 4096 } = {}) {
  const mediaType = (request.headers.get('Content-Type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mediaType !== 'application/json') return { body: null, ok: false };

  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > maxBytes) return { body: null, ok: false };

  try {
    const text = await request.text();
    if (text.length > maxBytes) return { body: null, ok: false };
    if (!text) return { body: {}, ok: true };

    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { body: null, ok: false };
    }
    return { body, ok: true };
  } catch {
    return { body: null, ok: false };
  }
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: { ...jsonHeaders, ...extraHeaders },
    status,
  });
}

export function authErrorResponse(
  status,
  code,
  message,
  extra = {},
) {
  return jsonResponse({
    ok: false,
    ...extra,
    error: { code, message },
  }, status);
}

export function methodNotAllowedResponse(allowedMethods) {
  return jsonResponse({
    ok: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' },
  }, 405, { Allow: allowedMethods.join(', ') });
}

export function optionsResponse(allowedMethods) {
  return new Response(null, {
    headers: {
      Allow: [...allowedMethods, 'OPTIONS'].join(', '),
      'Cache-Control': 'no-store',
    },
    status: 204,
  });
}

export function serializeSecureCookie(name, value, maxAgeSeconds) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function clearSecureCookie(name) {
  return [
    `${name}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function getRequestCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function appendSetCookie(response, cookie) {
  response.headers.append('Set-Cookie', cookie);
  return response;
}

export function generateSecurePin() {
  const maximum = 0x1000000;
  const unbiasedCeiling = Math.floor(maximum / 1000000) * 1000000;
  const bytes = new Uint8Array(3);

  for (;;) {
    crypto.getRandomValues(bytes);
    const value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
    if (value < unbiasedCeiling) return String(value % 1000000).padStart(6, '0');
  }
}

export function generateOpaqueToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

export function hashPin({ challengeId, hmacSecret, pin }) {
  return hmacSha256Hex(hmacSecret, `pin:${challengeId}:${pin}`);
}

export function hashSessionToken({ hmacSecret, token }) {
  return hmacSha256Hex(hmacSecret, `session:${token}`);
}

export function hashAuthEmail({ email, hmacSecret }) {
  return hmacSha256Hex(hmacSecret, `email:${normalizeAuthEmail(email)}`);
}

export async function findAllowedAuthMemberByHash(config, emailHash) {
  const expectedHash = String(emailHash || '');
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return null;

  for (const member of config.allowedMembers) {
    const memberHash = await hashAuthEmail({
      email: member.normalizedEmail,
      hmacSecret: config.hmacSecret,
    });
    if (constantTimeEqual(memberHash, expectedHash)) return member;
  }
  return null;
}

export function hashRateIdentifier({ action, hmacSecret, identifier }) {
  return hmacSha256Hex(hmacSecret, `rate:${action}:${identifier}`);
}

export async function deriveRequestRef({ challengeId, hmacSecret }) {
  const digest = await hmacSha256Hex(
    hmacSecret,
    `request-ref:${challengeId}`,
  );
  return digest.slice(0, 6).toUpperCase();
}

export function constantTimeEqual(left, right) {
  const leftValue = String(left || '');
  const rightValue = String(right || '');
  const maximumLength = Math.max(leftValue.length, rightValue.length);
  let difference = leftValue.length ^ rightValue.length;

  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (leftValue.charCodeAt(index) || 0)
      ^ (rightValue.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function createCustomAuthStore(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('D1 binding DB is unavailable.');
  }

  return {
    async consumeRateLimit({ action, keyHash, limit, now, windowSeconds }) {
      const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
      const expiresAt = windowStart + (windowSeconds * 2);
      const row = await db.prepare(`
        INSERT INTO auth_rate_limits (
          action, key_hash, window_start, count, expires_at
        ) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(action, key_hash, window_start)
        DO UPDATE SET
          count = auth_rate_limits.count + 1,
          expires_at = excluded.expires_at
        RETURNING count
      `).bind(action, keyHash, windowStart, expiresAt).first();
      const count = Number(row?.count ?? row ?? limit + 1);

      return {
        allowed: count <= limit,
        count,
        retryAfterSeconds: Math.max(1, (windowStart + windowSeconds) - now),
      };
    },

    async insertChallenge(challenge) {
      await db.prepare(`
        INSERT INTO auth_challenges (
          challenge_id, pin_hash, ip_hash, email_hash, created_at, expires_at,
          attempt_count, max_attempts, used_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL)
      `).bind(
        challenge.challengeId,
        challenge.pinHash,
        challenge.ipHash,
        challenge.emailHash,
        challenge.createdAt,
        challenge.expiresAt,
        challenge.maxAttempts,
      ).run();
    },

    async getChallenge(challengeId) {
      return db.prepare(`
        SELECT challenge_id, pin_hash, ip_hash, email_hash, created_at, expires_at,
          attempt_count, max_attempts, used_at
        FROM auth_challenges
        WHERE challenge_id = ?
      `).bind(challengeId).first();
    },

    async recordFailedAttempt(challengeId, now) {
      const result = await db.prepare(`
        UPDATE auth_challenges
        SET
          attempt_count = attempt_count + 1,
          used_at = CASE
            WHEN attempt_count + 1 >= max_attempts THEN ?
            ELSE used_at
          END
        WHERE challenge_id = ?
          AND used_at IS NULL
          AND expires_at > ?
          AND attempt_count < max_attempts
      `).bind(now, challengeId, now).run();
      return getChangedRows(result) === 1;
    },

    async consumeChallenge(challengeId, pinHash, now) {
      const result = await db.prepare(`
        UPDATE auth_challenges
        SET used_at = ?
        WHERE challenge_id = ?
          AND pin_hash = ?
          AND used_at IS NULL
          AND expires_at > ?
          AND attempt_count < max_attempts
      `).bind(now, challengeId, pinHash, now).run();
      return getChangedRows(result) === 1;
    },

    async invalidateChallenge(challengeId, now) {
      await db.prepare(`
        UPDATE auth_challenges
        SET used_at = COALESCE(used_at, ?)
        WHERE challenge_id = ?
      `).bind(now, challengeId).run();
    },

    async insertSession(session) {
      await db.prepare(`
        INSERT INTO auth_sessions (
          token_hash, email_hash, created_at, expires_at, last_seen_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, NULL)
      `).bind(
        session.tokenHash,
        session.emailHash,
        session.createdAt,
        session.expiresAt,
        session.lastSeenAt,
      ).run();
    },

    async getSession(tokenHash) {
      return db.prepare(`
        SELECT token_hash, email_hash, created_at, expires_at, last_seen_at, revoked_at
        FROM auth_sessions
        WHERE token_hash = ?
      `).bind(tokenHash).first();
    },

    async revokeSession(tokenHash, now) {
      await db.prepare(`
        UPDATE auth_sessions
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE token_hash = ?
      `).bind(now, tokenHash).run();
    },

    async touchSession(tokenHash, now) {
      await db.prepare(`
        UPDATE auth_sessions
        SET last_seen_at = ?
        WHERE token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > ?
      `).bind(now, tokenHash, now).run();
    },

    async listOnlineMemberHashes({ cutoff, now }) {
      const result = await db.prepare(`
        SELECT email_hash, MAX(last_seen_at) AS last_seen_at
        FROM auth_sessions
        WHERE revoked_at IS NULL
          AND expires_at > ?
          AND last_seen_at >= ?
          AND email_hash IS NOT NULL
        GROUP BY email_hash
        ORDER BY last_seen_at DESC
      `).bind(now, cutoff).all();
      return result.results || [];
    },

    async prune(now) {
      const staleChallengeTime = now - (24 * 60 * 60);
      const staleSessionTime = now - (24 * 60 * 60);
      await db.prepare(`
        DELETE FROM auth_challenges
        WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)
      `).bind(staleChallengeTime, staleChallengeTime).run();
      await db.prepare(`
        DELETE FROM auth_sessions
        WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)
      `).bind(staleSessionTime, staleSessionTime).run();
      await db.prepare('DELETE FROM auth_rate_limits WHERE expires_at < ?')
        .bind(now)
        .run();
    },
  };
}

export async function consumeRatePolicy({
  config,
  identifier,
  now,
  policy,
  store,
}) {
  const keyHash = await hashRateIdentifier({
    action: policy.action,
    hmacSecret: config.hmacSecret,
    identifier,
  });
  return store.consumeRateLimit({
    action: policy.action,
    keyHash,
    limit: policy.limit,
    now,
    windowSeconds: policy.windowSeconds,
  });
}

export async function authorizeCustomSessionRequest({
  createStore = createCustomAuthStore,
  env = {},
  now = Date.now(),
  request,
  store: providedStore,
}) {
  const config = getCustomAuthConfiguration(env);
  if (!config.valid) {
    return {
      authorized: false,
      issues: config.issues,
      reason: 'configuration_error',
      status: 503,
    };
  }

  const token = getRequestCookie(request, AUTH_SESSION_COOKIE);
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
    return {
      authorized: false,
      reason: 'missing_session',
      status: 401,
    };
  }

  try {
    const store = providedStore || createStore(config.db);
    const tokenHash = await hashSessionToken({
      hmacSecret: config.hmacSecret,
      token,
    });
    const session = await store.getSession(tokenHash);
    const nowSeconds = toEpochSeconds(now);

    if (
      !session
      || session.revoked_at != null
      || Number(session.expires_at) <= nowSeconds
      || !session.email_hash
    ) {
      return {
        authorized: false,
        reason: 'invalid_session',
        status: 401,
      };
    }

    const member = await findAllowedAuthMemberByHash(config, session.email_hash);
    if (!member) {
      return {
        authorized: false,
        reason: 'invalid_session',
        status: 401,
      };
    }

    return {
      authorized: true,
      email: member.email,
      expiresAt: Number(session.expires_at),
      memberHash: session.email_hash,
      name: member.name,
      status: 200,
      tokenHash,
    };
  } catch {
    return {
      authorized: false,
      reason: 'verification_unavailable',
      status: 503,
    };
  }
}
