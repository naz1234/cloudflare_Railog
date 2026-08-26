import {
  AUTH_CHALLENGE_TTL_SECONDS,
  AUTH_ALLOWED_EMAIL_DOMAIN,
  AUTH_MAX_PIN_ATTEMPTS,
  AUTH_MODES,
  AUTH_RATE_LIMITS,
  AUTH_RESEND_AFTER_SECONDS,
  authErrorResponse,
  consumeRatePolicy,
  createCustomAuthStore,
  deriveRequestRef,
  findAllowedAuthMember,
  generateOpaqueToken,
  generateSecurePin,
  getClientIp,
  getAuthMode,
  getCustomAuthConfiguration,
  hashAuthEmail,
  hashPin,
  hashRateIdentifier,
  isSameOriginRequest,
  jsonResponse,
  maskEmail,
  methodNotAllowedResponse,
  optionsResponse,
  readJsonObject,
  parseSingleAuthEmail,
  toEpochSeconds,
} from '../../lib/custom-auth.js';
import {
  getAuthEmailDeliveryConfiguration,
  sendAuthPin,
} from '../../lib/custom-auth-email.js';
import { verifyTurnstileToken } from '../../lib/custom-auth-turnstile.js';

const genericRequestResponse = Object.freeze({
  ok: true,
  message: 'If this Flow email is approved, a login code was sent.',
  expiresInSeconds: AUTH_CHALLENGE_TTL_SECONDS,
  resendAfterSeconds: AUTH_RESEND_AFTER_SECONDS,
});

function unavailableResponse() {
  return authErrorResponse(
    503,
    'AUTH_UNAVAILABLE',
    'Login is temporarily unavailable.',
  );
}

function genericResponseWithChallenge(challengeId, requestRef, emailHint) {
  return jsonResponse({
    ...genericRequestResponse,
    challengeId,
    emailHint,
    requestRef,
  }, 202);
}

function verificationRequiredResponse() {
  return authErrorResponse(
    400,
    'VERIFICATION_REQUIRED',
    'Please complete the security check and try again.',
  );
}

function rateLimitedResponse(retryAfterSeconds) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  return jsonResponse({
    ok: false,
    retryAfterSeconds: retryAfter,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Please wait before requesting another code.',
    },
  }, 429, { 'Retry-After': String(retryAfter) });
}

export function createRequestCodeEndpoint({
  createStore = createCustomAuthStore,
  logger = console,
  now = () => Date.now(),
  resolveDelivery = getAuthEmailDeliveryConfiguration,
  sendPin = sendAuthPin,
  verifyTurnstile = verifyTurnstileToken,
} = {}) {
  return async function handleRequestCode(context) {
    const { env = {}, request } = context;

    if (request.method === 'OPTIONS') return optionsResponse(['POST']);
    if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
    if (!isSameOriginRequest(request)) {
      return authErrorResponse(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }
    if (getAuthMode(env) !== AUTH_MODES.customPin) {
      return authErrorResponse(404, 'NOT_FOUND', 'Not found.');
    }

    const parsedBody = await readJsonObject(request);
    const submittedEmail = typeof parsedBody.body?.email === 'string'
      ? parsedBody.body.email.trim()
      : '';
    const normalizedSubmittedEmail = parseSingleAuthEmail(submittedEmail);
    if (
      !parsedBody.ok
      || Object.keys(parsedBody.body).some(
        (key) => !['email', 'turnstileToken'].includes(key),
      )
      || !normalizedSubmittedEmail
      || !normalizedSubmittedEmail.endsWith(`@${AUTH_ALLOWED_EMAIL_DOMAIN}`)
    ) {
      return authErrorResponse(
        400,
        'INVALID_REQUEST',
        `Enter a valid @${AUTH_ALLOWED_EMAIL_DOMAIN} email address.`,
      );
    }

    const config = getCustomAuthConfiguration(env);
    if (!config.valid) {
      logger.error('Custom authentication request-code configuration is invalid.');
      return unavailableResponse();
    }
    let delivery;
    try {
      delivery = resolveDelivery(env);
    } catch {
      logger.error('Custom authentication email delivery configuration failed.');
      return unavailableResponse();
    }
    if (!delivery.valid) {
      logger.error('Custom authentication email delivery is not configured.');
      return unavailableResponse();
    }

    try {
      const nowSeconds = toEpochSeconds(now());
      const clientIp = getClientIp(request);
      const turnstileResult = await verifyTurnstile({
        env,
        hostname: new URL(request.url).hostname,
        remoteIp: clientIp,
        token: parsedBody.body.turnstileToken,
      });
      if (!turnstileResult.success) {
        if (turnstileResult.reason === 'unavailable'
          || turnstileResult.reason === 'configuration_error') {
          logger.error('Custom authentication Turnstile verification is unavailable.');
          return unavailableResponse();
        }
        return verificationRequiredResponse();
      }

      const store = createStore(config.db);
      const ipLimit = await consumeRatePolicy({
        config,
        identifier: clientIp,
        now: nowSeconds,
        policy: AUTH_RATE_LIMITS.requestIpWindow,
        store,
      });
      const ipBurst = await consumeRatePolicy({
        config,
        identifier: clientIp,
        now: nowSeconds,
        policy: AUTH_RATE_LIMITS.requestIpBurst,
        store,
      });
      if (!ipLimit.allowed || !ipBurst.allowed) {
        return rateLimitedResponse(Math.max(
          ipLimit.retryAfterSeconds,
          ipBurst.retryAfterSeconds,
        ));
      }

      const emailLimit = await consumeRatePolicy({
        config,
        identifier: normalizedSubmittedEmail,
        now: nowSeconds,
        policy: AUTH_RATE_LIMITS.requestEmailWindow,
        store,
      });
      const emailBurst = await consumeRatePolicy({
        config,
        identifier: normalizedSubmittedEmail,
        now: nowSeconds,
        policy: AUTH_RATE_LIMITS.requestEmailBurst,
        store,
      });
      const emailRequestAllowed = emailLimit.allowed && emailBurst.allowed;

      const challengeId = generateOpaqueToken(24);
      const requestRef = await deriveRequestRef({
        challengeId,
        hmacSecret: config.hmacSecret,
      });
      const pin = generateSecurePin();
      const pinHash = await hashPin({
        challengeId,
        hmacSecret: config.hmacSecret,
        pin,
      });
      const ipHash = await hashRateIdentifier({
        action: 'challenge-ip',
        hmacSecret: config.hmacSecret,
        identifier: clientIp,
      });
      const emailHash = await hashAuthEmail({
        email: normalizedSubmittedEmail,
        hmacSecret: config.hmacSecret,
      });

      await store.insertChallenge({
        challengeId,
        createdAt: nowSeconds,
        emailHash,
        expiresAt: nowSeconds + AUTH_CHALLENGE_TTL_SECONDS,
        ipHash,
        maxAttempts: AUTH_MAX_PIN_ATTEMPTS,
        pinHash,
      });

      const member = findAllowedAuthMember(config, normalizedSubmittedEmail);
      const finishChallenge = async () => {
        if (!member || !emailRequestAllowed) {
          await store.invalidateChallenge(challengeId, nowSeconds);
          return;
        }

        try {
          const providerCadence = await consumeRatePolicy({
            config,
            identifier: 'gmail-provider',
            now: nowSeconds,
            policy: AUTH_RATE_LIMITS.requestProviderCadence,
            store,
          });
          if (!providerCadence.allowed) {
            await store.invalidateChallenge(challengeId, nowSeconds);
            return;
          }
          await sendPin({
            env,
            pin,
            recipient: member.email,
            requestRef,
          });
        } catch {
          await store.invalidateChallenge(challengeId, nowSeconds).catch(() => {});
          logger.error('Custom authentication email delivery failed.');
        }
      };
      const completion = finishChallenge().catch(() => {
        logger.error('Custom authentication challenge finalization failed.');
      });
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(completion);
        context.waitUntil(store.prune(nowSeconds).catch(() => {}));
      } else {
        await completion;
      }

      return genericResponseWithChallenge(
        challengeId,
        requestRef,
        maskEmail(normalizedSubmittedEmail),
      );
    } catch {
      logger.error('Custom authentication request-code operation failed.');
      return unavailableResponse();
    }
  };
}

export const onRequest = createRequestCodeEndpoint();
