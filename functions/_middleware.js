import { authorizeOccRequest } from './lib/cloudflare-access.js';
import {
  authorizeCustomSessionRequest,
  getAuthMode,
} from './lib/custom-auth.js';

const responseHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

const acmeChallengePrefix = '/.well-known/acme-challenge/';

const customAuthStaticPaths = new Set([
  '/login',
  '/login.html',
  '/auth/login.css',
  '/auth/login.js',
  '/favicon.png',
]);

const customAuthApiMethods = new Map([
  ['/api/auth/config', new Set(['GET'])],
  ['/api/auth/request-code', new Set(['POST'])],
  ['/api/auth/verify-code', new Set(['POST'])],
  ['/api/auth/session', new Set(['GET'])],
  ['/api/auth/logout', new Set(['POST'])],
]);

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAcmeChallengeRequest(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const pathname = new URL(request.url).pathname;
  return pathname.startsWith(acmeChallengePrefix)
    && pathname.length > acmeChallengePrefix.length;
}

function isCustomAuthPublicRequest(request) {
  const pathname = new URL(request.url).pathname;
  const apiMethods = customAuthApiMethods.get(pathname);
  if (apiMethods?.has(request.method)) return true;

  return ['GET', 'HEAD'].includes(request.method)
    && customAuthStaticPaths.has(pathname);
}

function withLoginSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "base-uri 'none'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'frame-src https://challenges.cloudflare.com',
      "img-src 'self' data:",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self'",
    ].join('; '),
  );
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isDocumentNavigation(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;

  const destination = request.headers.get('Sec-Fetch-Dest');
  if (destination) return destination === 'document';

  return (request.headers.get('Accept') || '').includes('text/html');
}

function isSameOriginMutation(request) {
  if (!unsafeMethods.has(request.method)) return true;

  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin !== expectedOrigin) return false;

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  return true;
}

function getDeniedMessage(result) {
  if (result.reason === 'configuration_error') {
    return 'Access protection is not configured correctly.';
  }
  if (result.reason === 'access_verification_unavailable') {
    return 'Access verification is temporarily unavailable.';
  }
  if (result.status === 403) {
    return 'This email address is not authorized for the OCC application.';
  }
  return 'A valid Cloudflare Access login is required.';
}

function deniedResponse(result) {
  return new Response(JSON.stringify({
    ok: false,
    error: getDeniedMessage(result),
  }), {
    status: result.status,
    headers: responseHeaders,
  });
}

function customDeniedResponse(result) {
  const isConfigurationError = result.reason === 'configuration_error';
  const isUnavailable = result.status === 503;
  return new Response(JSON.stringify({
    ok: false,
    error: isConfigurationError
      ? 'Custom authentication is not configured correctly.'
      : isUnavailable
        ? 'Session verification is temporarily unavailable.'
        : 'A valid L3 DC session is required.',
  }), {
    status: result.status || (isConfigurationError ? 503 : 401),
    headers: responseHeaders,
  });
}

function loginRedirect(request) {
  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Location: new URL('/login', request.url).toString(),
    },
  });
}

function csrfDeniedResponse() {
  return new Response(JSON.stringify({
    ok: false,
    error: 'Cross-site requests are not allowed.',
  }), {
    status: 403,
    headers: responseHeaders,
  });
}

export function createAccessMiddleware({
  authorize = authorizeOccRequest,
  logger = console,
} = {}) {
  return async function handleAccessRequest(context) {
    if (isAcmeChallengeRequest(context.request)) {
      return context.next();
    }

    const result = await authorize({
      request: context.request,
      env: context.env,
    });

    if (!result.authorized) {
      if (result.reason === 'configuration_error') {
        logger.error('Cloudflare Access configuration error:', result.issues.join(' '));
      } else if (result.reason === 'access_verification_unavailable') {
        logger.error('Cloudflare Access JWT verification is unavailable.');
      }
      return deniedResponse(result);
    }

    context.data.accessUser = {
      email: result.email,
      subject: result.payload.sub || '',
    };

    return context.next();
  };
}

export function createAuthMiddleware({
  authorizeAccess = authorizeOccRequest,
  authorizeCustom = authorizeCustomSessionRequest,
  resolveMode = getAuthMode,
  logger = console,
} = {}) {
  const accessMiddleware = createAccessMiddleware({
    authorize: authorizeAccess,
    logger,
  });

  return async function handleAuthRequest(context) {
    if (isAcmeChallengeRequest(context.request)) {
      return context.next();
    }

    const mode = resolveMode(context.env);
    if (mode === 'cloudflare_access') {
      return accessMiddleware(context);
    }

    if (mode !== 'custom_pin') {
      logger.error('AUTH_MODE must be cloudflare_access or custom_pin.');
      return customDeniedResponse({
        reason: 'configuration_error',
        status: 503,
      });
    }

    if (!isSameOriginMutation(context.request)) {
      return csrfDeniedResponse();
    }

    if (isCustomAuthPublicRequest(context.request)) {
      const response = await context.next();
      const pathname = new URL(context.request.url).pathname;
      if (customAuthStaticPaths.has(pathname)) {
        return withLoginSecurityHeaders(response);
      }
      return response;
    }

    const result = await authorizeCustom({
      request: context.request,
      env: context.env,
    });

    if (!result.authorized) {
      if (result.reason === 'configuration_error') {
        logger.error(
          'Custom authentication configuration error:',
          (result.issues || []).join(' '),
        );
      } else if (result.status === 503) {
        logger.error('Custom authentication session verification is unavailable.');
      }

      if (isDocumentNavigation(context.request) && result.status !== 503) {
        return loginRedirect(context.request);
      }

      return customDeniedResponse(result);
    }

    context.data.authUser = {
      email: result.email,
      expiresAt: result.expiresAt,
    };

    return context.next();
  };
}

export const onRequest = createAuthMiddleware();
