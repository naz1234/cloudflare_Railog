import {
  AUTH_MODES,
  AUTH_SESSION_COOKIE,
  appendSetCookie,
  authDisplayName,
  authErrorResponse,
  authorizeCustomSessionRequest,
  clearSecureCookie,
  getAuthMode,
  jsonResponse,
  maskEmail,
  methodNotAllowedResponse,
  optionsResponse,
} from '../../lib/custom-auth.js';

function authenticatedResponse(user) {
  const expiresAt = Number(user.expiresAt || 0);
  return jsonResponse({
    ok: true,
    authenticated: true,
    user: {
      email: maskEmail(user.email),
      name: user.name || authDisplayName(user.email),
    },
    expiresAt: expiresAt > 0
      ? new Date(expiresAt * 1000).toISOString()
      : null,
  });
}

function unauthenticatedResponse({ clearCookie = false } = {}) {
  const response = authErrorResponse(
    401,
    'UNAUTHENTICATED',
    'Authentication required.',
    { authenticated: false },
  );
  if (clearCookie) {
    appendSetCookie(response, clearSecureCookie(AUTH_SESSION_COOKIE));
  }
  return response;
}

export function createSessionEndpoint({
  authorizeSession = authorizeCustomSessionRequest,
  now = () => Date.now(),
} = {}) {
  return async function handleSession(context) {
    const { data = {}, env = {}, request } = context;

    if (request.method === 'OPTIONS') return optionsResponse(['GET']);
    if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);

    const mode = getAuthMode(env);
    if (!mode) {
      return authErrorResponse(
        503,
        'AUTH_UNAVAILABLE',
        'Login is temporarily unavailable.',
      );
    }

    if (mode === AUTH_MODES.cloudflareAccess) {
      if (!data.accessUser?.email) return unauthenticatedResponse();
      return authenticatedResponse(data.accessUser);
    }

    if (data.authUser?.email) return authenticatedResponse(data.authUser);

    const result = await authorizeSession({
      env,
      now: now(),
      request,
    });
    if (result.authorized) return authenticatedResponse(result);
    if (result.status === 503) {
      return authErrorResponse(
        503,
        'AUTH_UNAVAILABLE',
        'Login is temporarily unavailable.',
      );
    }
    return unauthenticatedResponse({ clearCookie: true });
  };
}

export const onRequest = createSessionEndpoint();
