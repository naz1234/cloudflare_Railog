import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest } from '../functions/api/wsh2.js';

const origin = 'https://railog.example';
const uploadId = '8ca0d38d-d1fb-4252-823e-3f2a6aed3f39';
const objectKey = `wsh2/uploads/${uploadId}.xlsx`;

function fixture({ missing = false, r2Fails = false, d1Fails = false } = {}) {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return { sql, bind(...values) { this.values = values; return this; }, async first() { calls.push(['read', sql, this.values]); return missing ? null : { object_key: objectKey }; } };
      },
      async batch(statements) { calls.push(['batch', statements]); if (d1Fails) throw new Error('D1 unavailable'); return [{ meta: { changes: 3 } }, { meta: { changes: 1 } }]; },
    },
    WSH2_FILES: { async delete(key) { calls.push(['r2-delete', key]); if (r2Fails) throw new Error('R2 unavailable'); } },
  };
  async function call(body = { uploadId, confirm: true }, headers = { Origin: origin }, data = { authUser: { email: 'operator@example.test' } }) {
    return onRequest({ request: new Request(`${origin}/api/wsh2`, { method: 'DELETE', headers, body: JSON.stringify(body) }), env, data });
  }
  return { calls, call };
}

test('WSH2 delete resolves its private R2 key on the server and atomically deletes only current source rows', async () => {
  const f = fixture();
  const response = await f.call({ uploadId, confirm: true, objectKey: 'never-trust-this-client-key' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, uploadId, removedRows: 3 });
  assert.deepEqual(f.calls.map(([kind]) => kind), ['read', 'r2-delete', 'batch']);
  assert.equal(f.calls[1][1], objectKey);
  const batch = f.calls[2][1];
  assert.equal(batch.length, 2);
  assert.equal(batch[0].sql, 'DELETE FROM wsh2_washes WHERE source_upload_id = ?');
  assert.equal(batch[1].sql, 'DELETE FROM wsh2_uploads WHERE id = ?');
  assert.deepEqual(batch.map((statement) => statement.values), [[uploadId], [uploadId]]);
});

test('WSH2 delete requires a bounded, confirmed upload ID before touching storage', async () => {
  const f = fixture();
  for (const body of [null, [], {}, { uploadId }, { uploadId, confirm: false }, { uploadId, confirm: 'true' }, { uploadId: '../other', confirm: true }, { uploadId: 'x'.repeat(2000), confirm: true }]) {
    assert.equal((await f.call(body)).status, 400);
  }
  assert.deepEqual(f.calls, []);
});

test('WSH2 delete remains authenticated and same-origin only', async () => {
  const f = fixture();
  assert.equal((await f.call(undefined, { Origin: origin }, {})).status, 401);
  assert.equal((await f.call(undefined, {})).status, 403);
  assert.equal((await f.call(undefined, { Origin: 'https://other.example' })).status, 403);
  assert.deepEqual(f.calls, []);
});

test('WSH2 delete is safe to retry after another computer has removed the upload', async () => {
  const f = fixture({ missing: true });
  const response = await f.call();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).removedRows, 0);
  assert.deepEqual(f.calls.map(([kind]) => kind), ['read']);
});

test('WSH2 leaves D1 intact when R2 deletion fails and reports D1 failures without claiming success', async (t) => {
  t.mock.method(console, 'error', () => {});
  const r2 = fixture({ r2Fails: true });
  assert.equal((await r2.call()).status, 503);
  assert.deepEqual(r2.calls.map(([kind]) => kind), ['read', 'r2-delete']);
  const d1 = fixture({ d1Fails: true });
  assert.equal((await d1.call()).status, 503);
  assert.deepEqual(d1.calls.map(([kind]) => kind), ['read', 'r2-delete', 'batch']);
});

test('WSH2 shows uploaded files before all dates, without page-level filters or automatic West assignment', () => {
  const source = fs.readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /workingDepot|depotFilter|statusFilter|type="date"|<details/);
  assert.doesNotMatch(source, /wsh2-sync|Local D1 \+ R2|Shared D1 \+ R2/);
  assert.match(source, /setInterval\(\(\) => \{ if \(!document.hidden\) refresh\(\); \}, 5000\)/);
  assert.ok(source.indexOf('aria-label="Uploaded Excel files"') < source.indexOf('className="wsh2-paper"'));
  assert.match(source, /onChange\(\{ completed: !row.completed \}\)/);
  assert.match(source, /aria-label=\{`Depot for/);
  assert.match(source, /Confirm\?/);
  assert.match(source, /Cancel deleting/);
  assert.match(source, /confirmDelete !== upload.id/);
  assert.match(source, /buildWsh2Docx\(rows, \{ dcMark, depotLabel: 'West and East Depot'/);
});
