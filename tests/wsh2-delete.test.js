import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest } from '../functions/api/wsh2.js';
import { summarizeWashRows } from '../src/lib/wsh2Records.js';

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

test('AWP keeps uploaded files and all date tables in separate panels, without filters or automatic West assignment', () => {
  const source = fs.readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /workingDepot|depotFilter|statusFilter|type="date"|<details/);
  assert.doesNotMatch(source, /wsh2-sync|Local D1 \+ R2|Shared D1 \+ R2/);
  assert.match(source, /setInterval\(\(\) => \{ if \(!document.hidden\) refresh\(\); \}, 5000\)/);
  assert.ok(source.indexOf('aria-label="Uploaded Excel files"') < source.indexOf('className="wsh2-paper"'));
  assert.match(source, /className="wsh2-content-grid"/);
  assert.match(source, /className="wsh2-checklist-panel"/);
  assert.match(source, /onChange\(\{ completed: !row.completed \}\)/);
  assert.match(source, /aria-label=\{`Depot for/);
  assert.match(source, /Confirm\?/);
  assert.match(source, /Cancel deleting/);
  assert.match(source, /confirmDelete !== upload.id/);
  assert.match(source, /buildWsh2Docx\(selected.rows, \{ depotLabel: 'West and East Depot', singlePage: true/);
  assert.doesNotMatch(source, /dcMark|setDcMark|DC MARK|Name for print/);
});

test('AWP puts the checklist left and uploaded files right only on desktop, without page overflow', () => {
  const css = fs.readFileSync(new URL('../src/wsh2.css', import.meta.url), 'utf8');
  assert.match(css, /\.wsh2-content-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-areas:\s*"sources" "checklist"/);
  assert.match(css, /\.wsh2-checklist-panel\s*\{[^}]*grid-area:\s*checklist;[^}]*min-width:\s*0/);
  assert.match(css, /\.wsh2-sources\s*\{[^}]*grid-area:\s*sources;[^}]*min-width:\s*0/);
  assert.match(css, /@media \(min-width: 1100px\)\s*\{\s*\.wsh2-content-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 280px;[^}]*grid-template-areas:\s*"checklist sources"/);
  assert.match(css, /\.wsh2-table-scroll\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /\.wsh2-sources\s*\{[^}]*(?:position:\s*fixed|max-height:|overflow-y:\s*(?:auto|scroll))/);
});

test('AWP compacts desktop rows without shrinking text or phone touch controls', () => {
  const css = fs.readFileSync(new URL('../src/wsh2.css', import.meta.url), 'utf8');
  const compact = css.match(/@media \(min-width: 768px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(compact, /tbody :is\(th, td\) \{ padding: 3px 6px;/);
  assert.match(compact, /tbody td :is\(select, input:not\(\[type="file"\]\)\) \{ height: 24px; min-height: 24px;/);
  assert.match(compact, /\.wsh2-tick \{ min-height: 24px; padding: 3px 6px; line-height: 16px;/);
  assert.match(compact, /:focus-visible \{ outline-offset: 1px;/);
  assert.doesNotMatch(compact, /font-size:/);
  const phone = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(phone, /select\) \{ font-size: 16px; min-height: 42px;/);
  assert.match(phone, /\.wsh2-tick \{ min-height: 42px;/);
});

test('AWP narrows Train Number and Next Wash columns while preserving full values and table width', () => {
  const source = fs.readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  const columns = source.match(/<colgroup>([\s\S]*?)<\/colgroup>/)[1];
  const widths = [...columns.matchAll(/width: '(\d+)%'/g)].map((match) => Number(match[1]));
  assert.deepEqual(widths, [4, 12, 16, 14, 11, 11, 32]);
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 100);
  assert.match(source, /className="wsh2-train">\{row.trainNumber\}/);
  assert.match(source, /className="wsh2-time">\{formatWashTime\(row.nextWash\)\}/);
});

test('AWP combines its identity, live completion count and existing actions in one responsive header', () => {
  const source = fs.readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/wsh2.css', import.meta.url), 'utf8');
  const header = source.match(/<header className="wsh2-heading">([\s\S]*?)<\/header>/)[1];
  assert.match(header, /<h1>Wash checklist<\/h1>/);
  assert.match(header, /\{doneCount\}<span> \/ \{rows.length\}/);
  assert.match(header, /washes completed/);
  assert.match(header, /className="wsh2-actions"/);
  assert.match(header, /setPrintOpen\(true\)/);
  assert.match(header, /onClick=\{refresh\}/);
  assert.match(header, /disabled=\{filesBusy\} onClick=\{\(\) => fileInput.current\?\.click\(\)\}/);
  assert.doesNotMatch(source, /wsh2-toolbar/);
  assert.match(css, /\.wsh2-heading \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto;/);
  assert.match(css, /@media \(max-width: 1099px\) \{[\s\S]*?\.wsh2-actions \{ grid-column: 1 \/ -1;/);
  assert.match(css, /\.wsh2-workspace \.wsh2-actions button \{ min-height: 42px;/);
});

test('AWP Design C has three live compact pills, with safe empty and fully completed totals', () => {
  const source = fs.readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /summarizeWashRows\(rows\)/);
  assert.match(source, /className="wsh2-header-stats" role="group" aria-label="Wash progress"/);
  for (const tone of ['complete', 'progress', 'remaining']) assert.match(source, new RegExp(`className="wsh2-stat is-${tone}"`));
  assert.match(source, /\{progressPercent.toFixed\(1\)\}%/);
  assert.match(source, /<strong>\{remainingCount\}<\/strong>/);
  assert.deepEqual(summarizeWashRows([]), { total: 0, completed: 0, remaining: 0, progress: 0 });
  const rows = Array.from({ length: 34 }, (_, index) => ({ completed: index < 4 }));
  assert.deepEqual(summarizeWashRows(rows), { total: 34, completed: 4, remaining: 30, progress: 11.8 });
  assert.deepEqual(summarizeWashRows(rows.map(() => ({ completed: true }))), { total: 34, completed: 34, remaining: 0, progress: 100 });
  assert.deepEqual(summarizeWashRows(rows.map(() => ({ completed: false }))), { total: 34, completed: 0, remaining: 34, progress: 0 });
});
