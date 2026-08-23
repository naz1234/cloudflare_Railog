export const AUTH_TURNSTILE_ACTION = 'l3dc-login';
const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Validate a single-use Turnstile token on the server. The token is deliberately
 * kept out of thrown errors and return values so callers cannot accidentally log it.
 */
export async function verifyTurnstileToken({
  env = {},
  fetcher = fetch,
  hostname,
  remoteIp,
  token,
}) {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  const responseToken = typeof token === 'string' ? token.trim() : '';
  if (!secret) return { success: false, reason: 'configuration_error' };
  if (!responseToken || responseToken.length > 2048) {
    return { success: false, reason: 'invalid' };
  }

  const body = new URLSearchParams({
    idempotency_key: crypto.randomUUID(),
    response: responseToken,
    secret,
  });
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  try {
    const response = await fetcher(siteverifyUrl, {
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    if (!response?.ok) return { success: false, reason: 'unavailable' };

    const result = await response.json();
    if (result?.success !== true) return { success: false, reason: 'invalid' };
    if (result.action !== AUTH_TURNSTILE_ACTION) {
      return { success: false, reason: 'invalid' };
    }
    if (hostname && result.hostname !== hostname) {
      return { success: false, reason: 'invalid' };
    }

    return { success: true };
  } catch {
    return { success: false, reason: 'unavailable' };
  }
}
