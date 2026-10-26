import { applyOdoChanges, emptyOdoState, normalizeOdoState, validateOdoChanges } from "../../shared/odo-reading.js";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS odo_reading_state (
    id TEXT PRIMARY KEY CHECK (id = 'main'),
    data TEXT NOT NULL,
    revision INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

async function readSnapshot(db) {
  const row = await db.prepare("SELECT data, revision, updated_at FROM odo_reading_state WHERE id = 'main'").first();
  if (!row) return { revision: 0, updatedAt: null, state: emptyOdoState() };
  return { revision: row.revision, updatedAt: row.updated_at, state: normalizeOdoState(JSON.parse(row.data)) };
}

// The existing root middleware requires an authenticated session for this route.
// Compare-and-swap protects the singleton against simultaneous laptop updates.
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET,POST,OPTIONS" } });
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  if (request.method === "POST" && (request.headers.get("Origin") !== new URL(request.url).origin
    || ["cross-site", "same-site"].includes(request.headers.get("Sec-Fetch-Site")))) {
    return json({ error: "Cross-site requests are not allowed." }, 403);
  }
  if (!env.DB) return json({ error: "Shared ODO storage is unavailable." }, 503);
  try {
    let body;
    let changes;
    if (request.method === "POST") {
      try {
        const text = await request.text();
        if (text.length > 32_768) return json({ error: "ODO changes are too large." }, 413);
        body = JSON.parse(text);
        if (!Number.isSafeInteger(body?.revision) || body.revision < 0) throw new Error("Invalid ODO revision.");
        changes = validateOdoChanges(body.changes);
      } catch (error) { return json({ error: error.message || "Invalid ODO changes." }, 400); }
    }
    await ensureSchema(env.DB);
    const current = await readSnapshot(env.DB);
    if (request.method === "GET") return json(current);
    if (body.revision !== current.revision) return json({ error: "ODO data changed on another laptop.", snapshot: current }, 409);
    const state = applyOdoChanges(current.state, changes);
    const updatedAt = new Date().toISOString();
    const revision = current.revision + 1;
    const result = current.revision === 0
      ? await env.DB.prepare("INSERT INTO odo_reading_state (id, data, revision, updated_at) VALUES ('main', ?, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(JSON.stringify(state), revision, updatedAt).run()
      : await env.DB.prepare("UPDATE odo_reading_state SET data = ?, revision = ?, updated_at = ? WHERE id = 'main' AND revision = ?")
        .bind(JSON.stringify(state), revision, updatedAt, current.revision).run();
    if (Number(result.meta?.changes) !== 1) {
      return json({ error: "ODO data changed on another laptop.", snapshot: await readSnapshot(env.DB) }, 409);
    }
    return json({ revision, updatedAt, state });
  } catch (error) {
    console.error("Shared ODO storage failed:", error);
    return json({ error: "Shared ODO storage is temporarily unavailable. Your browser copy is kept." }, 503);
  }
}
