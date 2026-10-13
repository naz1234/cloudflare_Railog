import {
  AUTH_MODES, AUTH_RATE_LIMITS, AUTH_SESSION_COOKIE, AUTH_SESSION_TTL_SECONDS,
  appendSetCookie, authErrorResponse, constantTimeEqual, consumeRatePolicy,
  createCustomAuthStore, generateOpaqueToken, getAuthMode, getClientIp,
  getCodeOnlyAuthMember, getCustomAuthConfiguration, hashPin, hashSessionToken,
  isSameOriginRequest, jsonResponse, methodNotAllowedResponse, optionsResponse,
  readJsonObject, serializeSecureCookie, toEpochSeconds,
} from '../../lib/custom-auth.js';
import { verifyTurnstileToken } from '../../lib/custom-auth-turnstile.js';

function unavailableResponse() {
  return authErrorResponse(503, 'AUTH_UNAVAILABLE', 'Code-only login is temporarily unavailable.');
}

export function createCodeOnlyEndpoint({
  createStore = createCustomAuthStore,
  logger = console,
  now = () => Date.now(),
  verifyTurnstile = verifyTurnstileToken,
} = {}) {
  return async function handleCodeOnly(context) {
    const { env = {}, request } = context;
    if (request.method === 'OPTIONS') return optionsResponse(['POST']);
    if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
    if (!isSameOriginRequest(request)) {
      return authErrorResponse(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }
    if (getAuthMode(env) !== AUTH_MODES.customPin) {
      return authErrorResponse(404, 'NOT_FOUND', 'Not found.');
    }
    const parsed = await readJsonObject(request);
    const code = typeof parsed.body?.code === 'string' ? parsed.body.code.trim() : '';
    if (!parsed.ok || !/^\d{6}$/.test(code)
      || Object.keys(parsed.body).some((key) => !['code', 'turnstileToken'].includes(key))) {
      return authErrorResponse(400, 'INVALID_REQUEST', 'Enter a valid 6-digit access code.');
    }
    const config = getCustomAuthConfiguration(env);
    if (!config.valid || !config.codeOnlyPin) return unavailableResponse();

    try {
      const store = createStore(config.db);
      const timestamp = toEpochSeconds(now());
      // Count every attempt, including missing/invalid security tokens, before
      // comparing the shared PIN. These limits never consume email-login quotas.
      for (const [policy, identifier] of [
        [AUTH_RATE_LIMITS.codeOnlyIpWindow, getClientIp(request)],
        [AUTH_RATE_LIMITS.codeOnlyGlobalWindow, 'shared-code'],
      ]) {
        const limit = await consumeRatePolicy({ config, store, now: timestamp, policy, identifier });
        if (!limit.allowed) {
          return jsonResponse({
            ok: false,
            retryAfterSeconds: limit.retryAfterSeconds,
            error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait or use email login.' },
          }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
        }
      }
      const verification = await verifyTurnstile({
        env, hostname: new URL(request.url).hostname,
        remoteIp: getClientIp(request), token: parsed.body.turnstileToken,
      });
      if (!verification.success) {
        if (verification.reason === 'unavailable' || verification.reason === 'configuration_error') {
          return unavailableResponse();
        }
        return authErrorResponse(400, 'VERIFICATION_REQUIRED', 'Please complete the security check and try again.');
      }
      const [expected, submitted] = await Promise.all([
        hashPin({ challengeId: 'code-only-verify-v1', hmacSecret: config.hmacSecret, pin: config.codeOnlyPin }),
        hashPin({ challengeId: 'code-only-verify-v1', hmacSecret: config.hmacSecret, pin: code }),
      ]);
      if (!constantTimeEqual(expected, submitted)) {
        return authErrorResponse(401, 'INVALID_CODE', 'The access code is incorrect.');
      }
      const member = await getCodeOnlyAuthMember(config);
      const token = generateOpaqueToken(32);
      const tokenHash = await hashSessionToken({ hmacSecret: config.hmacSecret, token });
      const expiresAt = timestamp + AUTH_SESSION_TTL_SECONDS;
      await store.insertSession({
        tokenHash, emailHash: member.memberHash, createdAt: timestamp,
        expiresAt, lastSeenAt: timestamp,
      });
      const response = jsonResponse({
        ok: true, authenticated: true,
        user: { email: '', name: member.name },
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      });
      appendSetCookie(response, serializeSecureCookie(AUTH_SESSION_COOKIE, token, AUTH_SESSION_TTL_SECONDS));
      if (typeof context.waitUntil === 'function') context.waitUntil(store.prune(timestamp).catch(() => {}));
      return response;
    } catch {
      logger.error('Code-only authentication operation failed.');
      return unavailableResponse();
    }
  };
}

export const onRequest = createCodeOnlyEndpoint();
