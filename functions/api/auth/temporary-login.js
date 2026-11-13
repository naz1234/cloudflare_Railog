import {
  AUTH_MODES, AUTH_RATE_LIMITS, AUTH_SESSION_COOKIE, AUTH_SESSION_TTL_SECONDS,
  appendSetCookie, authErrorResponse, constantTimeEqual, consumeRatePolicy,
  createCustomAuthStore, generateOpaqueToken, getAuthMode, getClientIp,
  getCustomAuthConfiguration, getTemporaryAuthMember, hashPin, hashSessionToken,
  isSameOriginRequest, jsonResponse, methodNotAllowedResponse, optionsResponse,
  parseTemporaryPassword, readJsonObject, serializeSecureCookie, toEpochSeconds,
} from '../../lib/custom-auth.js';
import { verifyTurnstileToken } from '../../lib/custom-auth-turnstile.js';

const unavailableResponse = () => authErrorResponse(503, 'AUTH_UNAVAILABLE', 'Temporary login is unavailable. Use staff email login.');

export function createTemporaryLoginEndpoint({
  createStore = createCustomAuthStore, logger = console,
  now = () => Date.now(), verifyTurnstile = verifyTurnstileToken,
} = {}) {
  return async function handleTemporaryLogin(context) {
    const { env = {}, request } = context;
    if (request.method === 'OPTIONS') return optionsResponse(['POST']);
    if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
    if (!isSameOriginRequest(request)) return authErrorResponse(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    if (getAuthMode(env) !== AUTH_MODES.customPin) return authErrorResponse(404, 'NOT_FOUND', 'Not found.');
    const parsed = await readJsonObject(request);
    const password = parseTemporaryPassword(parsed.body?.password);
    if (!parsed.ok || !password || Object.keys(parsed.body).some(key => !['password', 'turnstileToken'].includes(key))) {
      return authErrorResponse(400, 'INVALID_REQUEST', 'Enter a valid temporary password.');
    }
    const config = getCustomAuthConfiguration(env);
    if (!config.valid || !config.temporaryPassword) return unavailableResponse();
    try {
      const store = createStore(config.db);
      const timestamp = toEpochSeconds(now());
      for (const [policy, identifier] of [
        [AUTH_RATE_LIMITS.temporaryIpWindow, getClientIp(request)],
        [AUTH_RATE_LIMITS.temporaryGlobalWindow, 'temporary-login'],
      ]) {
        const limit = await consumeRatePolicy({ config, store, now: timestamp, policy, identifier });
        if (!limit.allowed) return jsonResponse({ ok: false, retryAfterSeconds: limit.retryAfterSeconds,
          error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait or use email login.' },
        }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
      }
      const verification = await verifyTurnstile({ env, hostname: new URL(request.url).hostname,
        remoteIp: getClientIp(request), token: parsed.body.turnstileToken });
      if (!verification.success) return verification.reason === 'unavailable' || verification.reason === 'configuration_error'
        ? unavailableResponse()
        : authErrorResponse(400, 'VERIFICATION_REQUIRED', 'Please complete the security check and try again.');
      const [expected, submitted] = await Promise.all([
        hashPin({ challengeId: 'temporary-login-verify-v1', hmacSecret: config.hmacSecret, pin: config.temporaryPassword }),
        hashPin({ challengeId: 'temporary-login-verify-v1', hmacSecret: config.hmacSecret, pin: password }),
      ]);
      if (!constantTimeEqual(expected, submitted)) return authErrorResponse(401, 'INVALID_PASSWORD', 'Unable to sign in. Check your entry.');
      const member = await getTemporaryAuthMember(config);
      const token = generateOpaqueToken(32);
      const tokenHash = await hashSessionToken({ hmacSecret: config.hmacSecret, token });
      const expiresAt = timestamp + AUTH_SESSION_TTL_SECONDS;
      await store.insertSession({ tokenHash, emailHash: member.memberHash,
        createdAt: timestamp, expiresAt, lastSeenAt: timestamp });
      const response = jsonResponse({ ok: true, authenticated: true,
        user: { email: '', name: member.name }, expiresAt: new Date(expiresAt * 1000).toISOString() });
      appendSetCookie(response, serializeSecureCookie(AUTH_SESSION_COOKIE, token, AUTH_SESSION_TTL_SECONDS));
      if (typeof context.waitUntil === 'function') context.waitUntil(store.prune(timestamp).catch(() => {}));
      return response;
    } catch {
      logger.error('Temporary authentication operation failed.');
      return unavailableResponse();
    }
  };
}

export const onRequest = createTemporaryLoginEndpoint();
