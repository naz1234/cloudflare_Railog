import {
  AUTH_MODES,
  AUTH_PRESENCE_WINDOW_SECONDS,
  authErrorResponse,
  createCustomAuthStore,
  getAuthMode,
  getCustomAuthConfiguration,
  hashAuthEmail,
  jsonResponse,
  methodNotAllowedResponse,
  optionsResponse,
  toEpochSeconds,
} from '../../lib/custom-auth.js';

function unavailableResponse() {
  return authErrorResponse(
    503,
    'AUTH_UNAVAILABLE',
    'Online status is temporarily unavailable.',
  );
}

export function createPresenceEndpoint({
  createStore = createCustomAuthStore,
  logger = console,
  now = () => Date.now(),
} = {}) {
  return async function handlePresence(context) {
    const { data = {}, env = {}, request } = context;

    if (request.method === 'OPTIONS') return optionsResponse(['GET']);
    if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
    if (getAuthMode(env) !== AUTH_MODES.customPin) {
      return authErrorResponse(404, 'NOT_FOUND', 'Not found.');
    }
    if (!data.authUser?.tokenHash) {
      return authErrorResponse(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const config = getCustomAuthConfiguration(env);
    if (!config.valid) {
      logger.error('Custom authentication presence configuration is invalid.');
      return unavailableResponse();
    }

    try {
      const nowSeconds = toEpochSeconds(now());
      const store = createStore(config.db);
      await store.touchSession(data.authUser.tokenHash, nowSeconds);
      const rows = await store.listOnlineMemberHashes({
        cutoff: nowSeconds - AUTH_PRESENCE_WINDOW_SECONDS,
        now: nowSeconds,
      });
      const membersByHash = new Map(await Promise.all(
        config.allowedMembers.map(async (member) => [
          await hashAuthEmail({
            email: member.normalizedEmail,
            hmacSecret: config.hmacSecret,
          }),
          member,
        ]),
      ));
      const users = [];
      for (const row of rows) {
        const member = membersByHash.get(row.email_hash);
        if (!member) continue;
        users.push({ name: member.name });
      }
      users.sort((left, right) => left.name.localeCompare(
        right.name,
        undefined,
        { sensitivity: 'base' },
      ));
      return jsonResponse({ ok: true, users });
    } catch {
      logger.error('Custom authentication presence operation failed.');
      return unavailableResponse();
    }
  };
}

export const onRequest = createPresenceEndpoint();
