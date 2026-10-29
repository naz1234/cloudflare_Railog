import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createWsh2LocalRuntime } from './wsh2-local-runtime.mjs';

const runtime = await createWsh2LocalRuntime();
const origin = 'http://local.test';
function makeFile(time = '13:00') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Train Number', 'Next Wash', 'Train Location'], ['L3-MV-302', `2026-10-31 ${time}:00`, 'OPE'], ['L3-MV-340', '2026-10-31 00:53:00', 'MAINT'],
  ]), 'Wash');
  return new Blob([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })]);
}
async function call(method = 'GET', payload) {
  const request = new Request(`${origin}/api/wsh2`, { method, headers: { Origin: origin, ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: method === 'PATCH' ? JSON.stringify(payload) : payload } : {}) });
  const response = await runtime.dispatchFetch(request.url, { method, headers: Object.fromEntries(request.headers), ...(payload ? { body: new Uint8Array(await request.arrayBuffer()) } : {}) });
  return { status: response.status, data: await response.json() };
}
function upload(file) { const form = new FormData(); form.append('file', file, 'wash.xlsx'); return call('POST', form); }
try {
  const original = makeFile();
  const imported = await upload(original);
  assert.equal(imported.status, 201, JSON.stringify(imported));
  const laptopA = (await call()).data.rows;
  const laptopB = (await call()).data.rows;
  assert.equal(laptopA.length, 2);
  const changed = await call('PATCH', { id: laptopA[0].id, revision: laptopA[0].revision, changes: { completed: true, depot: 'east', hvac: 'ON', washType: 'Partial' } });
  assert.equal(changed.status, 200); assert.equal(changed.data.row.completed, true);
  const conflict = await call('PATCH', { id: laptopB[0].id, revision: laptopB[0].revision, changes: { completed: false } });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.row.completed, true);
  const second = await call('PATCH', { id: laptopB[1].id, revision: laptopB[1].revision, changes: { location: 'WEST' } });
  assert.equal(second.status, 200);
  const reread = (await call()).data;
  assert.equal(reread.rows[0].completed, true); assert.equal(reread.rows[1].location, 'WEST');
  const duplicate = await upload(original);
  assert.equal(duplicate.data.alreadyImported, true);
  const revised = await upload(makeFile('14:00'));
  assert.equal(revised.status, 201);
  const updated = (await call()).data;
  assert.equal(updated.rows.length, 2); assert.equal(updated.rows[0].completed, true); assert.equal(updated.rows[0].depot, 'east'); assert.equal(updated.rows[0].hvac, 'ON');
  assert.equal(updated.rows[1].nextWash, '2026-10-31T14:00'); assert.equal(updated.rows[1].location, 'WEST');
  const download = await runtime.dispatchFetch(`${origin}/api/wsh2?download=${imported.data.uploadId}`);
  assert.equal(download.status, 200); assert.deepEqual(new Uint8Array(await download.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
  const cleared = await call('PATCH', { id: updated.rows[0].id, revision: updated.rows[0].revision, changes: { completed: false } });
  assert.equal(cleared.data.row.completed, false); assert.equal(cleared.data.row.completedAt, null);
  const invalid = new FormData(); invalid.append('file', new Blob(['invalid']), 'invalid.xlsx');
  assert.equal((await call('POST', invalid)).status, 400);
  assert.equal((await call()).data.rows.length, 2);
  const race = await Promise.all([upload(makeFile('15:00')), upload(makeFile('15:00'))]);
  assert.equal(race.filter((result) => result.status === 201).length, 1);
  assert.equal(race.filter((result) => result.data.alreadyImported).length, 1);
  const bucket = await runtime.getR2Bucket('WSH2_FILES');
  assert.equal((await bucket.list()).objects.length, 3);
  console.log('PASS: local D1/R2 upload, cross-client sync, revision conflicts, independent row edits, re-import preservation, changed times, original download, uncheck, rejected invalid import, concurrent duplicate import and orphan cleanup.');
} finally { await runtime.dispose(); }
