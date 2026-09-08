import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteUpdatesHandler } from '../functions/api/site-updates.js';
import { normalizeMergedUpdates } from '../functions/lib/site-updates.js';
import { createAuthMiddleware } from '../functions/_middleware.js';

const NOW = Date.parse('2026-09-08T04:00:00Z');
const pull = (number, extra = {}) => ({
  number, title: `Update ${number}`, body_text: 'Improved PST remarks.',
  merged_at: '2026-09-08T03:00:00Z', base: { ref: 'main' },
  merge_commit_sha: 'a'.repeat(40), ...extra,
});
const context = () => ({ request: new Request('https://railog.example/api/site-updates') });
const github = (pulls) => new Response(JSON.stringify(pulls), { headers: { 'Content-Type': 'application/json' } });

test('update history contains merged main-branch PRs in merge-date order', () => {
  const updates = normalizeMergedUpdates([
    pull(10), pull(11, { merged_at: '2026-09-08T03:30:00Z' }),
    pull(12, { merged_at: null }), pull(13, { base: { ref: 'preview' } }),
    pull(10), pull(14, { merged_at: 'invalid' }),
  ]);
  assert.deepEqual(updates.map((item) => item.number), [11, 10]);
  assert.equal(updates[0].commit, 'a'.repeat(40));
});

test('GitHub content stays text and PR links stay within the configured repository', () => {
  const [update] = normalizeMergedUpdates([pull(15, {
    title: '<script>alert(1)</script>', html_url: 'javascript:alert(1)',
    body_text: 'x'.repeat(9000), merge_commit_sha: 'not-a-commit',
  })]);
  assert.equal(update.url, 'https://github.com/naz1234/cloudflare_Railog/pull/15');
  assert.equal(update.description.length, 8000);
  assert.equal(update.commit, '');
});

test('feed fetches public PRs without forwarding a Railog session', async () => {
  let input;
  const handler = createSiteUpdatesHandler({
    now: () => NOW,
    fetchImpl: async (url, options) => { input = { url, options }; return github([pull(15)]); },
  });
  const response = await handler({ request: new Request(context().request, { headers: { Cookie: 'session=private' } }) });
  assert.equal(response.status, 200);
  assert.match(input.url, /state=closed&base=main/);
  assert.equal(new Headers(input.options.headers).has('Cookie'), false);
  assert.equal(new Headers(input.options.headers).has('Authorization'), false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  assert.equal((await response.json()).updates[0].number, 15);
});

test('fresh cached updates do not use another GitHub request', async () => {
  const cached = { checkedAt: new Date(NOW - 60000).toISOString(), updates: [{ number: 15 }], stale: false };
  const handler = createSiteUpdatesHandler({
    now: () => NOW, cache: { match: async () => github(cached) },
    fetchImpl: async () => { assert.fail('should use cache'); },
  });
  assert.deepEqual(await (await handler(context())).json(), cached);
});

test('expired cache refreshes and caches the normalized feed', async () => {
  let saved;
  const handler = createSiteUpdatesHandler({
    now: () => NOW,
    cache: {
      match: async () => github({ checkedAt: new Date(NOW - 600000).toISOString() }),
      put: async (_key, response) => { saved = await response.json(); },
    },
    fetchImpl: async () => github([pull(16)]),
  });
  const data = await (await handler(context())).json();
  assert.equal(data.updates[0].number, 16);
  assert.deepEqual(data, saved);
});

test('GitHub outages return clearly marked saved data or a retryable error', async () => {
  const cached = { checkedAt: new Date(NOW - 600000).toISOString(), updates: [{ number: 15 }] };
  const fetchImpl = async () => new Response('Rate limit exceeded', { status: 403 });
  const savedHandler = createSiteUpdatesHandler({ now: () => NOW, fetchImpl, cache: { match: async () => github(cached) } });
  const stale = await (await savedHandler(context())).json();
  assert.equal(stale.stale, true);
  assert.equal(stale.updates[0].number, 15);
  const handler = createSiteUpdatesHandler({ now: () => NOW, fetchImpl });
  assert.equal((await handler(context())).status, 503);
});

test('malformed GitHub responses do not become an empty successful history', async () => {
  const handler = createSiteUpdatesHandler({ fetchImpl: async () => github({ message: 'failure' }) });
  assert.equal((await handler(context())).status, 503);
});

test('existing session middleware protects the new feed', async () => {
  let reachedFeed = false;
  const middleware = createAuthMiddleware({
    resolveMode: () => 'custom_pin',
    authorizeCustom: async () => ({ authorized: false, status: 401 }),
  });
  const response = await middleware({ ...context(), env: {}, next: () => { reachedFeed = true; } });
  assert.equal(response.status, 401);
  assert.equal(reachedFeed, false);
});
