import {
  AUTH_MODES,
  AUTH_SESSION_COOKIE,
  appendSetCookie,
  authErrorResponse,
  clearSecureCookie,
  createCustomAuthStore,
  getAuthMode,
  getCustomAuthConfiguration,
  getRequestCookie,
  hashSessionToken,
  isSameOriginRequest,
  jsonResponse,
  methodNotAllowedResponse,
  optionsResponse,
  toEpochSeconds,
} from '../../lib/custom-auth.js';

function loggedOutResponse(extra = {}) {
  const response = jsonResponse({ ok: true, authenticated: false, ...extra });
  return appendSetCookie(response, clearSecureCookie(AUTH_SESSION_COOKIE));
}

function unavailableResponse() {
  return authErrorResponse(
    503,
    'AUTH_UNAVAILABLE',
    'Logout is temporarily unavailable.',
  );
}

export function createLogoutEndpoint({
  createStore = createCustomAuthStore,
  logger = console,
  now = () => Date.now(),
} = {}) {
  return async function handleLogout(context) {
    const { env = {}, request } = context;

    if (request.method === 'OPTIONS') return optionsResponse(['POST']);
    if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
    if (!isSameOriginRequest(request)) {
      return authErrorResponse(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }

    const mode = getAuthMode(env);
    if (!mode) return unavailableResponse();
    if (mode === AUTH_MODES.cloudflareAccess) {
      return loggedOutResponse({ logoutUrl: '/cdn-cgi/access/logout' });
    }

    const config = getCustomAuthConfiguration(env);
    if (!config.valid) {
      logger.error('Custom authentication logout configuration is invalid.');
      return unavailableResponse();
    }

    const token = getRequestCookie(request, AUTH_SESSION_COOKIE);
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return loggedOutResponse();

    try {
      const tokenHash = await hashSessionToken({
        hmacSecret: config.hmacSecret,
        token,
      });
      const store = createStore(config.db);
      await store.revokeSession(tokenHash, toEpochSeconds(now()));
      return loggedOutResponse();
    } catch {
      logger.error('Custom authentication logout operation failed.');
      return unavailableResponse();
    }
  };
}

export const onRequest = createLogoutEndpoint();
