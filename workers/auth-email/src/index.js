const MAX_REQUEST_BYTES = 1024;
const MAX_ALLOWED_RECIPIENTS = 100;
const MIN_SERVICE_TOKEN_LENGTH = 32;
const MIN_OAUTH_SECRET_LENGTH = 16;
const PIN_PATTERN = /^\d{6}$/;
const REQUEST_REF_PATTERN = /^[A-Z0-9]{4,16}$/;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const GOOGLE_CLIENT_ID_PATTERN = /^[a-z0-9._-]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const MIME_BOUNDARY = 'l3dc_auth_alternative';
const ALLOWED_RECIPIENT_DOMAIN = 'flow-metro.com';

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

function canonicalEmail(value) {
  const email = String(value || '').trim();
  return EMAIL_PATTERN.test(email) ? email : '';
}

function parseAllowedEmails(value) {
  const source = String(value || '').trim();
  if (!source) {
    return { configured: false, recipients: new Map(), valid: false };
  }

  const entries = source.split(/[\s,;]+/).filter(Boolean);
  const recipients = new Map();
  let invalid = entries.length === 0 || entries.length > MAX_ALLOWED_RECIPIENTS;

  for (const entry of entries) {
    const canonical = canonicalEmail(entry);
    const normalized = normalizeEmail(canonical);
    if (
      !canonical
      || !normalized.endsWith(`@${ALLOWED_RECIPIENT_DOMAIN}`)
      || recipients.has(normalized)
    ) {
      invalid = true;
      continue;
    }
    recipients.set(normalized, canonical);
  }

  return {
    configured: true,
    recipients,
    valid: !invalid && recipients.size === entries.length,
  };
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
  const allowed = parseAllowedEmails(env.AUTH_ALLOWED_EMAILS);
  const legacySource = String(env.AUTH_LOGIN_EMAIL || '').trim();
  const legacyTo = canonicalEmail(legacySource);
  const serviceToken = String(env.AUTH_EMAIL_SERVICE_TOKEN || '').trim();
  const clientId = String(env.AUTH_GMAIL_CLIENT_ID || '').trim();
  const clientSecret = String(env.AUTH_GMAIL_CLIENT_SECRET || '').trim();
  const refreshToken = String(env.AUTH_GMAIL_REFRESH_TOKEN || '').trim();

  return {
    allowedRecipients: allowed.recipients,
    clientId,
    clientSecret,
    from,
    legacyTo,
    refreshToken,
    serviceToken,
    valid: Boolean(
      from
      && (allowed.configured ? allowed.valid : legacyTo)
      && (!legacySource || legacyTo)
      && serviceToken.length >= MIN_SERVICE_TOKEN_LENGTH
      && GOOGLE_CLIENT_ID_PATTERN.test(clientId)
      && clientSecret.length >= MIN_OAUTH_SECRET_LENGTH
      && refreshToken.length >= MIN_OAUTH_SECRET_LENGTH
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
    const isCurrentPayload = keys.length === 3
      && keys[0] === 'pin'
      && keys[1] === 'recipient'
      && keys[2] === 'requestRef';
    const isLegacyPayload = keys.length === 2
      && keys[0] === 'pin'
      && keys[1] === 'requestRef';
    if (!isCurrentPayload && !isLegacyPayload) {
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
    if (
      isCurrentPayload
      && (typeof body.recipient !== 'string' || !normalizeEmail(body.recipient))
    ) {
      return { error: 'invalid_body' };
    }

    return {
      payload: {
        pin: body.pin,
        recipient: isCurrentPayload ? body.recipient : '',
        requestRef: body.requestRef,
      },
    };
  } catch {
    return { error: 'invalid_body' };
  }
}

function resolveRecipient(config, payload) {
  if (payload.recipient) {
    return config.allowedRecipients.get(normalizeEmail(payload.recipient)) || '';
  }
  return config.legacyTo;
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

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

export function createGmailRawMessage(message) {
  const mime = [
    `From: L3 DC Template Login <${message.from}>`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${MIME_BOUNDARY}"`,
    '',
    `--${MIME_BOUNDARY}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.text,
    '',
    `--${MIME_BOUNDARY}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.html,
    '',
    `--${MIME_BOUNDARY}--`,
    '',
  ].join('\r\n');

  return bytesToBase64Url(new TextEncoder().encode(mime));
}

async function readProviderJson(response) {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function providerFailureStage(error) {
  if (error instanceof Error && error.message === 'Gmail OAuth transport failed.') {
    return 'oauth_network';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth client authentication failed.') {
    return 'oauth_invalid_client';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth refresh grant failed.') {
    return 'oauth_invalid_grant';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth request was invalid.') {
    return 'oauth_invalid_request';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth client is unauthorized.') {
    return 'oauth_unauthorized_client';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth grant type is unsupported.') {
    return 'oauth_unsupported_grant';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth response did not contain a token.') {
    return 'oauth_missing_token';
  }
  if (error instanceof Error && error.message === 'Gmail OAuth token exchange failed.') {
    return 'oauth_token_exchange';
  }
  if (error instanceof Error && error.message === 'Gmail message delivery failed.') {
    return 'gmail_message_delivery';
  }
  return 'provider_request';
}

export async function requestGmailAccessToken(config, fetcher = fetch) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
  });
  let response;
  try {
    response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      method: 'POST',
      redirect: 'manual',
    });
  } catch {
    throw new Error('Gmail OAuth transport failed.');
  }
  const result = await readProviderJson(response);
  const accessToken = String(result.access_token || '').trim();
  if (!response.ok) {
    if (result.error === 'invalid_client') {
      throw new Error('Gmail OAuth client authentication failed.');
    }
    if (result.error === 'invalid_grant') {
      throw new Error('Gmail OAuth refresh grant failed.');
    }
    if (result.error === 'invalid_request') {
      throw new Error('Gmail OAuth request was invalid.');
    }
    if (result.error === 'unauthorized_client') {
      throw new Error('Gmail OAuth client is unauthorized.');
    }
    if (result.error === 'unsupported_grant_type') {
      throw new Error('Gmail OAuth grant type is unsupported.');
    }
    throw new Error('Gmail OAuth token exchange failed.');
  }
  if (!accessToken) {
    throw new Error('Gmail OAuth response did not contain a token.');
  }
  return accessToken;
}

export async function sendGmailMessage({ config, fetcher = fetch, message }) {
  const accessToken = await requestGmailAccessToken(config, fetcher);
  let response;
  try {
    response = await fetcher(GMAIL_SEND_ENDPOINT, {
      body: JSON.stringify({ raw: createGmailRawMessage(message) }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      method: 'POST',
      redirect: 'manual',
    });
  } catch {
    throw new Error('Gmail message delivery failed.');
  }
  if (!response.ok) {
    throw new Error('Gmail message delivery failed.');
  }
}

export async function handleAuthEmailRequest(request, env = {}, options = {}) {
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

  const recipient = resolveRecipient(config, parsed.payload);
  if (!recipient) {
    return errorResponse(400, 'INVALID_REQUEST', 'Invalid request body.');
  }

  const message = createLoginEmail({
    from: config.from,
    pin: parsed.payload.pin,
    requestRef: parsed.payload.requestRef,
    to: recipient,
  });

  try {
    await sendGmailMessage({
      config,
      fetcher: options.fetcher || fetch,
      message,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    const logger = options.logger || console;
    logger.error(`Authentication email provider failure: ${providerFailureStage(error)}.`);
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
