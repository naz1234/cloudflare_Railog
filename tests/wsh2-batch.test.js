import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { onRequest } from '../functions/api/wsh2.js';
import { buildWashBatchPlan, buildWashBatchUpdate, getWashBatchOptions, parseWashBatchTrains, validateWashBatchRequest } from '../src/lib/wsh2BatchCompletion.js';

const uploadId = 'e1111111-1111-4111-8111-111111111111';
const otherUpload = 'e2222222-2222-4222-8222-222222222222';
const date = '2026-11-05';
const uploads = [{ id: uploadId, fileName: '5-Nov.xlsx' }, { id: otherUpload, fileName: '6-Nov.xlsx' }];
const makeRow = (train, day = date, sourceUploadId = uploadId) => ({
  id: `${day}_L3-MV-${300 + train}`, trainNumber: `L3-MV-${300 + train}`, date: day, sourceUploadId, revision: 1,
});
const rows = [makeRow(1), makeRow(2), makeRow(3, '2026-11-06', otherUpload), makeRow(4, '2026-11-06')];

test('batch input accepts space-separated short train numbers, normalizes and deduplicates', () => {
  assert.deepEqual(parseWashBatchTrains('01 02 03 04 05'), ['01', '02', '03', '04', '05']);
  assert.deepEqual(parseWashBatchTrains(' 1, 02;03\n04\t05 01 '), ['01', '02', '03', '04', '05']);
  assert.deepEqual(parseWashBatchTrains('47'), ['47']);
  for (const input of ['', ' ', '00', '48', '301', 'T01', '01-05', '01 x', null, '1'.repeat(501)]) assert.throws(() => parseWashBatchTrains(input));
});

test('batch file/date options only include current rows, keeping different dates separate', () => {
  assert.deepEqual(getWashBatchOptions(rows, [...uploads, { id: 'superseded', fileName: 'old.xlsx' }]), [
    { key: `${uploadId}:${date}`, uploadId, fileName: '5-Nov.xlsx', date, count: 2 },
    { key: `${uploadId}:2026-11-06`, uploadId, fileName: '5-Nov.xlsx', date: '2026-11-06', count: 1 },
    { key: `${otherUpload}:2026-11-06`, uploadId: otherUpload, fileName: '6-Nov.xlsx', date: '2026-11-06', count: 1 },
  ]);
});

test('planning never crosses files/dates and rejects the entire batch if any train is missing', () => {
  const before = structuredClone(rows);
  assert.deepEqual(buildWashBatchPlan(rows, uploads, uploadId, date, '01 02 01'), {
    action: 'completeBatch', uploadId, date, rows: rows.slice(0, 2).map(({ id, revision }) => ({ id, revision })),
  });
  assert.throws(() => buildWashBatchPlan(rows, uploads, uploadId, date, '01 03 04'), /03, 04.*Nothing was submitted/);
  assert.throws(() => buildWashBatchPlan(rows, uploads, uploadId, '2026-11-07', '01'), /Choose an available/);
  assert.deepEqual(rows, before);
});

test('server bounds batch IDs, dates, revisions and unique row count', () => {
  const valid = buildWashBatchPlan(rows, uploads, uploadId, date, '01 02');
  assert.equal(validateWashBatchRequest(valid).rows.length, 2);
  for (const patch of [
    { uploadId: 'invalid' }, { date: '2026-02-30' }, { date: '1999-12-31' }, { rows: [] },
    { rows: Array.from({ length: 48 }, (_, n) => ({ id: String(n), revision: 1 })) },
    { rows: [{ id: '', revision: 1 }] }, { rows: [{ id: rows[0].id, revision: 0 }] },
    { rows: [{ id: rows[0].id, revision: 1.5 }] }, { rows: [valid.rows[0], valid.rows[0]] },
  ]) assert.throws(() => validateWashBatchRequest({ ...valid, ...patch }));
  const max = validateWashBatchRequest({ ...valid, rows: Array.from({ length: 47 }, (_, n) => ({ id: String(n), revision: 1 })) });
  const update = buildWashBatchUpdate(max, 'now', 'actor');
  assert.equal(update.values.length, 100);
  assert.equal((update.sql.match(/\?/g) || []).length, 100);
  assert.match(update.sql, /AS MATERIALIZED/);
  assert.doesNotMatch(update.sql, /wash_details\s*=|wash_type\s*=|depot\s*=|location\s*=/);
});

function fixture(t, trainCount = 2) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0004_wsh2.sql', '0005_wsh2_wash_details.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  for (const upload of uploads) sqlite.prepare('INSERT INTO wsh2_uploads VALUES(?,?,?,?,?,?,?,?,?)').run(upload.id, upload.id, upload.fileName, 'sample.xlsx', trainCount, date, '2026-11-06', 'before', 'seed');
  const seed = train => {
    const row = makeRow(train);
    sqlite.prepare('INSERT INTO wsh2_washes(id,train_number,next_wash,scheduled_date,source_upload_id,location,wash_details,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?)').run(row.id, row.trainNumber, `${date}T09:15`, date, uploadId, 'MAINT', `Full / ED ${train}`, 'before', 'seed');
    return row;
  };
  const selected = Array.from({ length: trainCount }, (_, n) => seed(n + 1));
  sqlite.prepare('INSERT INTO wsh2_washes(id,train_number,next_wash,scheduled_date,source_upload_id,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)').run('other-day', 'L3-MV-301', '2026-11-06T10:00', '2026-11-06', otherUpload, 'before', 'seed');
  const DB = {
    prepare(query) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(query).get(...values) || null; },
        async all() { return { results: sqlite.prepare(query).all(...values) }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...values).changes) } }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.all())); },
  };
  const body = { action: 'completeBatch', uploadId, date, rows: selected.map(({ id, revision }) => ({ id, revision })) };
  return {
    sqlite, body,
    async patch(value = body, { origin = 'https://local.test', auth = true } = {}) {
      return onRequest({ request: new Request('https://local.test/api/wsh2', { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) }), env: { DB, WSH2_FILES: {} }, data: auth ? { authUser: { email: 'test@example.invalid' } } : {} });
    },
    snapshot: () => sqlite.prepare('SELECT * FROM wsh2_washes ORDER BY id').all(),
  };
}

test('actual API + SQLite updates all selected trains, preserves details/location and original completion time', async t => {
  const f = fixture(t);
  f.sqlite.prepare('UPDATE wsh2_washes SET completed=1,completed_at=? WHERE id=?').run('original-completion', f.body.rows[0].id);
  const response = await f.patch();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.updatedCount, 2);
  assert.equal(result.rows.length, 2);
  for (const row of result.rows) {
    assert.equal(row.completed, true);
    assert.equal(row.hvac, 'ON');
    assert.equal(row.location, 'MAINT');
    assert.match(row.washDetails, /^Full \/ ED/);
    assert.equal(row.revision, 2);
    assert.equal(row.updatedBy, 'test@example.invalid');
  }
  assert.equal(result.rows[0].completedAt, 'original-completion');
  assert.match(result.rows[1].completedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(f.snapshot().find(row => row.id === 'other-day').completed, 0);
});

test('actual SQL works at the 47-train, 100-parameter maximum', async t => {
  const f = fixture(t, 47);
  const response = await f.patch();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).updatedCount, 47);
  assert.equal(f.snapshot().filter(row => row.completed).length, 47);
});

for (const scenario of ['stale revision', 'wrong date', 'wrong source', 'missing row']) {
  test(`batch is all-or-nothing in real SQLite when one selected row has ${scenario}`, async t => {
    const f = fixture(t);
    if (scenario === 'stale revision') f.body.rows[1].revision = 2;
    if (scenario === 'wrong date') f.sqlite.prepare('UPDATE wsh2_washes SET scheduled_date=? WHERE id=?').run('2026-11-06', f.body.rows[1].id);
    if (scenario === 'wrong source') f.sqlite.prepare('UPDATE wsh2_washes SET source_upload_id=? WHERE id=?').run(otherUpload, f.body.rows[1].id);
    if (scenario === 'missing row') f.body.rows[1].id = 'missing';
    const before = f.snapshot();
    const response = await f.patch();
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Nothing was updated/);
    assert.deepEqual(f.snapshot(), before);
  });
}

test('batch keeps authentication, same-origin checks, input validation and missing-upload errors', async t => {
  const f = fixture(t);
  const before = f.snapshot();
  assert.equal((await f.patch(f.body, { auth: false })).status, 401);
  assert.equal((await f.patch(f.body, { origin: 'https://other.test' })).status, 403);
  assert.equal((await f.patch({ ...f.body, rows: [] })).status, 400);
  assert.equal((await f.patch({ ...f.body, uploadId: 'e3333333-3333-4333-8333-333333333333' })).status, 404);
  assert.equal((await f.patch(null)).status, 400);
  assert.deepEqual(f.snapshot(), before);
});
