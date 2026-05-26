const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS entity_records (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity ON entity_records(entity)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity_updated ON entity_records(entity, updated_at)`).run();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (!env.DB) {
    return json({
      ok: false,
      error: 'D1 binding "DB" is missing. In Cloudflare Pages, add a D1 database binding named DB.',
    }, 500);
  }

  try {
    await ensureSchema(env.DB);

    const tableCheck = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_records'")
      .first();

    return json({
      ok: true,
      databaseBinding: 'DB',
      tableReady: Boolean(tableCheck?.name),
      tableName: 'entity_records',
      message: 'D1 schema is ready.',
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health API error:', error);
    return json({
      ok: false,
      error: error?.message || 'Unexpected D1 health check error',
    }, 500);
  }
}
