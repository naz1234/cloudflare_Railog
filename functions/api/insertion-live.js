import { applyInsertionChanges, normalizeInsertionSharedState, validateInsertionChanges } from '../../shared/insertion-sync.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const SHARED_ID = 'insertion-live-protected-v2';

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS entity_records (
    id TEXT PRIMARY KEY, entity TEXT NOT NULL, data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function readSnapshot(db) {
  const protectedRow = await db.prepare('SELECT data, updated_at FROM entity_records WHERE entity = ? AND id = ?').bind('InsertionLive', SHARED_ID).first();
  if (protectedRow) {
    const data = JSON.parse(protectedRow.data);
    if (!Number.isSafeInteger(data._syncRevision) || data._syncRevision < 1) throw new Error('Invalid shared insertion revision.');
    return { revision: data._syncRevision, state: normalizeInsertionSharedState(data), updatedAt: protectedRow.updated_at, raw: protectedRow.data };
  }
  // Import the shared legacy record, not a stale browser's whole local snapshot.
  const legacy = await db.prepare(`SELECT data, updated_at FROM entity_records WHERE entity = ?
    ORDER BY CASE WHEN json_extract(data, '$.stateKey') = 'insertion-live-main' OR json_extract(data, '$.key') = 'insertion-live-main' THEN 0 ELSE 1 END,
    COALESCE(json_extract(data, '$.updatedAt'), updated_at) DESC LIMIT 1`).bind('InsertionLive').first();
  return { revision: 0, state: normalizeInsertionSharedState(legacy ? JSON.parse(legacy.data) : {}), updatedAt: legacy?.updated_at || null, raw: null };
}
const publicSnapshot = ({ revision, state, updatedAt }) => ({ revision, state, updatedAt });

// The root middleware authenticates this endpoint. CAS makes concurrent writes atomic.
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET,POST,OPTIONS' } });
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  if (request.method === 'POST' && (request.headers.get('Origin') !== new URL(request.url).origin || ['cross-site', 'same-site'].includes(request.headers.get('Sec-Fetch-Site')))) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  if (!env.DB) return json({ error: 'Shared insertion storage is unavailable.' }, 503);
  try {
    let body;
    if (request.method === 'POST') {
      try {
        const text = await request.text();
        if (text.length > 1_000_000) return json({ error: 'Insertion changes are too large.' }, 413);
        body = JSON.parse(text);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('Invalid insertion revision.');
        validateInsertionChanges(body.changes);
      } catch (error) { return json({ error: error.message || 'Invalid insertion changes.' }, 400); }
    }
    await ensureSchema(env.DB);
    const current = await readSnapshot(env.DB);
    if (request.method === 'GET') return json(publicSnapshot(current));
    if (body.revision !== current.revision) return json({ error: 'Insertion changed on another session.', snapshot: publicSnapshot(current) }, 409);
    const state = applyInsertionChanges(current.state, body.changes);
    const updatedAt = new Date().toISOString(), revision = current.revision + 1;
    const data = JSON.stringify({ ...state, stateKey: 'insertion-live-main', updatedAt, _syncRevision: revision });
    const result = current.raw === null
      ? await env.DB.prepare('INSERT INTO entity_records (id, entity, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(SHARED_ID, 'InsertionLive', data, updatedAt, updatedAt).run()
      : await env.DB.prepare('UPDATE entity_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ? AND data = ?').bind(data, updatedAt, 'InsertionLive', SHARED_ID, current.raw).run();
    if (Number(result.meta?.changes) !== 1) return json({ error: 'Insertion changed on another session.', snapshot: publicSnapshot(await readSnapshot(env.DB)) }, 409);
    return json({ revision, state, updatedAt });
  } catch (error) {
    console.error('Protected insertion sync failed:', error);
    return json({ error: 'Could not save/load insertion. Your pending changes are kept for retry.' }, 503);
  }
}
