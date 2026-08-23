import { authorizeOccRequest } from './lib/cloudflare-access.js';

const responseHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

const acmeChallengePrefix = '/.well-known/acme-challenge/';

function isAcmeChallengeRequest(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const pathname = new URL(request.url).pathname;
  return pathname.startsWith(acmeChallengePrefix)
    && pathname.length > acmeChallengePrefix.length;
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

export const onRequest = createAccessMiddleware();
