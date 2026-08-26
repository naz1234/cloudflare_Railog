function assertDeliverySucceeded(result) {
  if (!(result instanceof Response) || !result.ok) {
    throw new Error('Authentication email service rejected the request.');
  }
}

export function getAuthEmailDeliveryConfiguration(env = {}) {
  const serviceToken = String(env.AUTH_EMAIL_SERVICE_TOKEN || '').trim();
  const issues = [];

  if (typeof env.AUTH_EMAIL_SERVICE?.fetch !== 'function') {
    issues.push('The private AUTH_EMAIL_SERVICE binding is required.');
  }
  if (serviceToken.length < 32) {
    issues.push('AUTH_EMAIL_SERVICE_TOKEN must be an encrypted secret of at least 32 characters.');
  }

  return {
    issues,
    kind: 'service',
    valid: issues.length === 0,
  };
}

/**
 * Deliver a PIN only through the private mailer Worker binding. The Pages
 * function passes only the server-validated recipient. The Worker performs
 * its own private allowlist check and remains the sole owner of sender and
 * Gmail OAuth credentials.
 */
export async function sendAuthPin({ env = {}, pin, recipient, requestRef }) {
  const service = env.AUTH_EMAIL_SERVICE;
  if (typeof service?.fetch !== 'function') {
    throw new Error('The private authentication email service is not configured.');
  }

  const serviceToken = String(env.AUTH_EMAIL_SERVICE_TOKEN || '').trim();
  if (serviceToken.length < 32) {
    throw new Error('AUTH_EMAIL_SERVICE_TOKEN is not configured.');
  }

  const response = await service.fetch(new Request(
    'https://auth-email.internal/send',
    {
      body: JSON.stringify({ pin, recipient, requestRef }),
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      method: 'POST',
    },
  ));
  assertDeliverySucceeded(response);
}
