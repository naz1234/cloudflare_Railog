import {
  AUTH_MODES,
  authErrorResponse,
  getAuthMode,
  getCustomAuthConfiguration,
  jsonResponse,
  maskEmail,
  methodNotAllowedResponse,
  optionsResponse,
} from '../../lib/custom-auth.js';
import { getAuthEmailDeliveryConfiguration } from '../../lib/custom-auth-email.js';

export function createAuthConfigEndpoint({
  logger = console,
  resolveDelivery = getAuthEmailDeliveryConfiguration,
} = {}) {
  return async function handleAuthConfig(context) {
    const { env = {}, request } = context;

    if (request.method === 'OPTIONS') return optionsResponse(['GET']);
    if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
    if (getAuthMode(env) !== AUTH_MODES.customPin) {
      return authErrorResponse(404, 'NOT_FOUND', 'Not found.');
    }

    const config = getCustomAuthConfiguration(env);
    let delivery;
    try {
      delivery = resolveDelivery(env);
    } catch {
      logger.error('Custom authentication email delivery configuration failed.');
      return authErrorResponse(
        503,
        'AUTH_UNAVAILABLE',
        'Login is temporarily unavailable.',
      );
    }
    if (!config.valid || !delivery.valid) {
      logger.error('Custom authentication public configuration is invalid.');
      return authErrorResponse(
        503,
        'AUTH_UNAVAILABLE',
        'Login is temporarily unavailable.',
      );
    }

    return jsonResponse({
      siteKey: config.turnstileSiteKey,
      emailHint: maskEmail(config.loginEmail),
    });
  };
}

export const onRequest = createAuthConfigEndpoint();
