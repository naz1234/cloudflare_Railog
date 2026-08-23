const MAX_REQUEST_BYTES = 1024;
const MIN_SERVICE_TOKEN_LENGTH = 32;
const PIN_PATTERN = /^\d{6}$/;
const REQUEST_REF_PATTERN = /^[A-Z0-9]{4,16}$/;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const responseHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: { ...responseHeaders, ...extraHeaders },
    status,
  });
}

function errorResponse(status, code, message, extraHeaders = {}) {
  return jsonResponse({
    ok: false,
    error: { code, message },
  }, status, extraHeaders);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

function constantTimeEqual(left, right) {
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

function getBearerToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
}

function getConfiguration(env = {}) {
  const from = normalizeEmail(env.AUTH_EMAIL_FROM);
  const to = normalizeEmail(env.AUTH_LOGIN_EMAIL);
  const serviceToken = String(env.AUTH_EMAIL_SERVICE_TOKEN || '').trim();
  const emailBinding = env.EMAIL;

  return {
    emailBinding,
    from,
    serviceToken,
    to,
    valid: Boolean(
      from
      && to
      && serviceToken.length >= MIN_SERVICE_TOKEN_LENGTH
      && typeof emailBinding?.send === 'function'
    ),
  };
}

async function readBoundedText(request, maximumBytes = MAX_REQUEST_BYTES) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function readPayload(request) {
  const contentType = String(request.headers.get('Content-Type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return { error: 'unsupported_media_type' };
  }

  const text = await readBoundedText(request);
  if (text == null) return { error: 'body_too_large' };

  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'invalid_body' };
    }

    const keys = Object.keys(body).sort();
    if (keys.length !== 2 || keys[0] !== 'pin' || keys[1] !== 'requestRef') {
      return { error: 'invalid_body' };
    }
    if (typeof body.pin !== 'string' || !PIN_PATTERN.test(body.pin)) {
      return { error: 'invalid_body' };
    }
    if (
      typeof body.requestRef !== 'string'
      || !REQUEST_REF_PATTERN.test(body.requestRef)
    ) {
      return { error: 'invalid_body' };
    }

    return {
      payload: {
        pin: body.pin,
        requestRef: body.requestRef,
      },
    };
  } catch {
    return { error: 'invalid_body' };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createLoginEmail({ from, pin, requestRef, to }) {
  const safePin = escapeHtml(pin);
  const safeRequestRef = escapeHtml(requestRef);

  return {
    from,
    to,
    subject: `L3 DC Template login code - ${requestRef}`,
    text: [
      'L3 DC Template - West Depot',
      '',
      `Request reference: ${requestRef}`,
      `Your login code is: ${pin}`,
      '',
      'This code expires in 5 minutes and can be used only once.',
      'If you did not request this code, you can ignore this email.',
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,sans-serif;color:#10243e;line-height:1.5">',
      '<h2 style="margin:0 0 8px">L3 DC Template - West Depot</h2>',
      `<p style="margin:0 0 16px">Request reference: <strong>${safeRequestRef}</strong></p>`,
      '<p style="margin:0 0 8px">Your login code is:</p>',
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${safePin}</p>`,
      '<p style="margin:0 0 8px">This code expires in 5 minutes and can be used only once.</p>',
      '<p style="margin:0">If you did not request this code, you can ignore this email.</p>',
      '</div>',
    ].join(''),
  };
}

export async function handleAuthEmailRequest(request, env = {}) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== '/send') {
    return errorResponse(404, 'NOT_FOUND', 'Not found.');
  }
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', {
      Allow: 'POST',
    });
  }

  const config = getConfiguration(env);
  if (!config.valid) {
    return errorResponse(
      503,
      'SERVICE_NOT_CONFIGURED',
      'Authentication email service is unavailable.',
    );
  }

  if (!constantTimeEqual(getBearerToken(request), config.serviceToken)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized.', {
      'WWW-Authenticate': 'Bearer',
    });
  }

  const parsed = await readPayload(request);
  if (parsed.error === 'unsupported_media_type') {
    return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected application/json.');
  }
  if (parsed.error === 'body_too_large') {
    return errorResponse(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  }
  if (!parsed.payload) {
    return errorResponse(400, 'INVALID_REQUEST', 'Invalid request body.');
  }

  const message = createLoginEmail({
    from: config.from,
    pin: parsed.payload.pin,
    requestRef: parsed.payload.requestRef,
    to: config.to,
  });

  try {
    await config.emailBinding.send(message);
    return jsonResponse({ ok: true });
  } catch {
    return errorResponse(
      502,
      'DELIVERY_FAILED',
      'Authentication email could not be delivered.',
    );
  }
}

export default {
  fetch(request, env) {
    return handleAuthEmailRequest(request, env);
  },
};
