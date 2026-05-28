const ALLOWED_ENTITIES = new Set([
  'DepotStabling',
  'MaintenanceRequest',
  'TrainLogEntry',
  'TrainRem',
  'rawTrainRem',
  'InsertionLive',
  'PSTTrainPrep',
  'RemovalListRow',
  'MainlineTrainRow',
  'BookmarkLink',
]);

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function normalizePathParam(pathParam) {
  if (!pathParam) return [];
  if (Array.isArray(pathParam)) return pathParam.filter(Boolean);
  return String(pathParam).split('/').filter(Boolean);
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

function safeParseJson(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function readJsonBody(request, fallback = {}) {
  try {
    const text = await request.text();
    if (!text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function hydrate(row) {
  const data = safeParseJson(row.data, {});
  return {
    id: row.id,
    ...data,
    created_date: row.created_at,
    updated_date: row.updated_at,
    createdAt: data.createdAt || row.created_at,
    updatedAt: data.updatedAt || row.updated_at,
  };
}

function compareValues(a, b) {
  if (a === b) return 0;

  const aNumber = Number(a);
  const bNumber = Number(b);
  const bothNumeric = !Number.isNaN(aNumber) && !Number.isNaN(bNumber) && String(a).trim() !== '' && String(b).trim() !== '';

  if (bothNumeric) return aNumber - bNumber;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function sortRecords(records, sortField) {
  if (!sortField) return records;

  const descending = sortField.startsWith('-');
  const field = descending ? sortField.slice(1) : sortField;

  return [...records].sort((left, right) => {
    const result = compareValues(left?.[field], right?.[field]);
    return descending ? -result : result;
  });
}

function valueMatches(actual, expected) {
  if (Array.isArray(expected)) {
    return expected.some((item) => valueMatches(actual, item));
  }

  if (actual === expected) return true;
  if (actual == null || expected == null) return false;

  return String(actual).toLowerCase() === String(expected).toLowerCase();
}

function applyFilters(records, filters = {}) {
  const entries = Object.entries(filters || {}).filter(([, value]) => value !== undefined);
  if (!entries.length) return records;

  return records.filter((record) => entries.every(([key, expected]) => valueMatches(record?.[key], expected)));
}

async function getAllRecords(db, entity) {
  const result = await db
    .prepare('SELECT id, data, created_at, updated_at FROM entity_records WHERE entity = ?')
    .bind(entity)
    .all();

  return (result.results || []).map(hydrate);
}

async function getRecord(db, entity, id) {
  const row = await db
    .prepare('SELECT id, data, created_at, updated_at FROM entity_records WHERE entity = ? AND id = ?')
    .bind(entity, id)
    .first();

  return row ? hydrate(row) : null;
}

async function createRecord(db, entity, payload) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanPayload = { ...(payload || {}) };
  delete cleanPayload.id;

  await db
    .prepare('INSERT INTO entity_records (id, entity, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, entity, JSON.stringify(cleanPayload), now, now)
    .run();

  return {
    id,
    ...cleanPayload,
    created_date: now,
    updated_date: now,
    createdAt: cleanPayload.createdAt || now,
    updatedAt: cleanPayload.updatedAt || now,
  };
}

async function updateRecord(db, entity, id, payload) {
  const existing = await getRecord(db, entity, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const { id: _id, created_date, updated_date, createdAt, updatedAt, ...existingData } = existing;
  const cleanPayload = { ...(payload || {}) };
  delete cleanPayload.id;

  const merged = { ...existingData, ...cleanPayload };

  await db
    .prepare('UPDATE entity_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?')
    .bind(JSON.stringify(merged), now, entity, id)
    .run();

  return {
    id,
    ...merged,
    created_date,
    updated_date: now,
    createdAt: merged.createdAt || createdAt || created_date,
    updatedAt: merged.updatedAt || now,
  };
}

async function deleteRecord(db, entity, id) {
  await db
    .prepare('DELETE FROM entity_records WHERE entity = ? AND id = ?')
    .bind(entity, id)
    .run();

  return { success: true, id };
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (!env.DB) {
    return json({
      error: 'D1 binding "DB" is missing. In Cloudflare Pages, add a D1 database binding named DB.',
    }, 500);
  }

  const path = normalizePathParam(params.path);
  const entity = decodeURIComponent(path[0] || '');
  const actionOrId = path[1] ? decodeURIComponent(path[1]) : null;

  if (!entity || !ALLOWED_ENTITIES.has(entity)) {
    return json({ error: `Unknown entity: ${entity || '(empty)'}` }, 404);
  }

  await ensureSchema(env.DB);

  const url = new URL(request.url);

  try {
    if (request.method === 'GET' && !actionOrId) {
      const sort = url.searchParams.get('sort') || '';
      const limit = Number(url.searchParams.get('limit') || '0');
      let records = await getAllRecords(env.DB, entity);
      records = sortRecords(records, sort);
      if (limit > 0) records = records.slice(0, limit);
      return json(records);
    }

    if (request.method === 'POST' && actionOrId === 'filter') {
      const filters = await readJsonBody(request, {});
      let records = await getAllRecords(env.DB, entity);
      records = applyFilters(records, filters);
      return json(records);
    }

    if (request.method === 'POST' && actionOrId === 'bulkCreate') {
      const body = await readJsonBody(request, {});
      const records = Array.isArray(body) ? body : Array.isArray(body.records) ? body.records : [];
      const created = [];

      for (const record of records) {
        created.push(await createRecord(env.DB, entity, record));
      }

      return json(created, 201);
    }

    if (request.method === 'POST' && !actionOrId) {
      const payload = await readJsonBody(request, {});
      const created = await createRecord(env.DB, entity, payload);
      return json(created, 201);
    }

    if ((request.method === 'PUT' || request.method === 'PATCH') && actionOrId) {
      const payload = await readJsonBody(request, {});
      const updated = await updateRecord(env.DB, entity, actionOrId, payload);
      if (!updated) return json({ error: 'Record not found' }, 404);
      return json(updated);
    }

    if (request.method === 'DELETE' && actionOrId) {
      return json(await deleteRecord(env.DB, entity, actionOrId));
    }

    return json({ error: 'Unsupported route or method' }, 405);
  } catch (error) {
    console.error('Entity API error:', error);
    return json({ error: error?.message || 'Unexpected server error' }, 500);
  }
}
