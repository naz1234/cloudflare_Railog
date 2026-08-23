import {
  AUTH_MAX_PIN_ATTEMPTS,
  AUTH_MODES,
  AUTH_RATE_LIMITS,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_TTL_SECONDS,
  appendSetCookie,
  authErrorResponse,
  constantTimeEqual,
  consumeRatePolicy,
  createCustomAuthStore,
  generateOpaqueToken,
  getClientIp,
  getAuthMode,
  getCustomAuthConfiguration,
  hashPin,
  hashSessionToken,
  isSameOriginRequest,
  jsonResponse,
  maskEmail,
  methodNotAllowedResponse,
  optionsResponse,
  readJsonObject,
  serializeSecureCookie,
  toEpochSeconds,
} from '../../lib/custom-auth.js';

function invalidCodeResponse() {
  return authErrorResponse(
    401,
    'INVALID_CODE',
    'The code is invalid or expired.',
  );
}

function unavailableResponse() {
  return authErrorResponse(
    503,
    'AUTH_UNAVAILABLE',
    'Login is temporarily unavailable.',
  );
}

export function createVerifyCodeEndpoint({
  createStore = createCustomAuthStore,
  logger = console,
  now = () => Date.now(),
} = {}) {
  return async function handleVerifyCode(context) {
    const { env = {}, request } = context;

    if (request.method === 'OPTIONS') return optionsResponse(['POST']);
    if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
    if (!isSameOriginRequest(request)) {
      return authErrorResponse(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }
    if (getAuthMode(env) !== AUTH_MODES.customPin) {
      return authErrorResponse(404, 'NOT_FOUND', 'Not found.');
    }

    const parsedBody = await readJsonObject(request);
    const code = typeof parsedBody.body?.code === 'string'
      ? parsedBody.body.code.trim()
      : '';
    const challengeId = typeof parsedBody.body?.challengeId === 'string'
      ? parsedBody.body.challengeId.trim()
      : '';
    if (
      !parsedBody.ok
      || !/^\d{6}$/.test(code)
      || !/^[A-Za-z0-9_-]{24,128}$/.test(challengeId)
    ) {
      return authErrorResponse(400, 'INVALID_REQUEST', 'Enter a valid 6-digit code.');
    }

    const config = getCustomAuthConfiguration(env);
    if (!config.valid) {
      logger.error('Custom authentication verify-code configuration is invalid.');
      return unavailableResponse();
    }

    try {
      const store = createStore(config.db);
      const nowSeconds = toEpochSeconds(now());
      const ipLimit = await consumeRatePolicy({
        config,
        identifier: getClientIp(request),
        now: nowSeconds,
        policy: AUTH_RATE_LIMITS.verifyIpWindow,
        store,
      });
      if (!ipLimit.allowed) return invalidCodeResponse();

      const challenge = await store.getChallenge(challengeId);
      const challengeIsActive = Boolean(
        challenge
        && challenge.used_at == null
        && Number(challenge.expires_at) > nowSeconds
        && Number(challenge.attempt_count) < Number(
          challenge.max_attempts ?? AUTH_MAX_PIN_ATTEMPTS,
        )
      );
      if (!challengeIsActive) return invalidCodeResponse();

      const submittedPinHash = await hashPin({
        challengeId,
        hmacSecret: config.hmacSecret,
        pin: code,
      });
      if (!constantTimeEqual(submittedPinHash, challenge.pin_hash)) {
        await store.recordFailedAttempt(challengeId, nowSeconds);
        return invalidCodeResponse();
      }

      const challengeConsumed = await store.consumeChallenge(
        challengeId,
        submittedPinHash,
        nowSeconds,
      );
      if (!challengeConsumed) return invalidCodeResponse();

      const sessionToken = generateOpaqueToken(32);
      const sessionTokenHash = await hashSessionToken({
        hmacSecret: config.hmacSecret,
        token: sessionToken,
      });
      const sessionExpiresAt = nowSeconds + AUTH_SESSION_TTL_SECONDS;
      await store.insertSession({
        createdAt: nowSeconds,
        expiresAt: sessionExpiresAt,
        tokenHash: sessionTokenHash,
      });

      const response = jsonResponse({
        ok: true,
        authenticated: true,
        user: { email: maskEmail(config.loginEmail) },
        expiresAt: new Date(sessionExpiresAt * 1000).toISOString(),
      });
      appendSetCookie(response, serializeSecureCookie(
        AUTH_SESSION_COOKIE,
        sessionToken,
        AUTH_SESSION_TTL_SECONDS,
      ));
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(store.prune(nowSeconds).catch(() => {}));
      }
      return response;
    } catch {
      logger.error('Custom authentication verify-code operation failed.');
      return unavailableResponse();
    }
  };
}

export const onRequest = createVerifyCodeEndpoint();
