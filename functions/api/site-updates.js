import { normalizeMergedUpdates, SITE_REPOSITORY, SITE_REPOSITORY_URL } from '../lib/site-updates.js';

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// The parent middleware requires a Railog session before this handler runs.
// Only public PR metadata is cached; session cookies are never sent to GitHub.
export function createSiteUpdatesHandler({ fetchImpl = fetch, cache, now = Date.now } = {}) {
  return async function handleSiteUpdates(context) {
    const edgeCache = cache ?? globalThis.caches?.default;
    const cacheKey = new Request(new URL('/api/site-updates?format=1', context.request.url));
    let saved = null;
    try {
      const response = await edgeCache?.match(cacheKey);
      if (response) saved = await response.json();
    } catch { /* GitHub remains available when the cache is unavailable. */ }

    const age = saved ? now() - Date.parse(saved.checkedAt) : Infinity;
    if (age >= 0 && age < FRESH_MS) return json(saved);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(
        `https://api.github.com/repos/${SITE_REPOSITORY}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100`,
        {
          headers: {
            Accept: 'application/vnd.github.text+json',
            'User-Agent': 'Railog-About',
            'X-GitHub-Api-Version': '2026-03-10',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error('GitHub unavailable');

      const data = {
        repository: SITE_REPOSITORY,
        repositoryUrl: SITE_REPOSITORY_URL,
        checkedAt: new Date(now()).toISOString(),
        updates: normalizeMergedUpdates(await response.json()),
        stale: false,
      };
      if (edgeCache) {
        const save = edgeCache.put(cacheKey, new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
        })).catch(() => {});
        if (context.waitUntil) context.waitUntil(save);
        else await save;
      }
      return json(data);
    } catch {
      if (saved && age >= 0 && age < STALE_MS) {
        return json({ ...saved, stale: true, warning: 'GitHub is temporarily unavailable. Showing the last saved updates.' });
      }
      return json({ error: 'Updates could not be loaded from GitHub. Please try again shortly.' }, 503);
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const onRequestGet = createSiteUpdatesHandler();
