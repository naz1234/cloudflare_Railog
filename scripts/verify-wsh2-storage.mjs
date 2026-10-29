import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createWsh2LocalRuntime } from './wsh2-local-runtime.mjs';

const codeOnly = process.argv.includes('--code-only');
const runtime = await createWsh2LocalRuntime({ codeOnly });
const origin = 'http://local.test';
function makeFile(time = '13:00', date = '2026-10-31') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Train Number', 'Next Wash', 'Train Location'], ['L3-MV-302', `${date} ${time}:00`, 'OPE'], ['L3-MV-340', `${date} 00:53:00`, 'MAINT'],
  ]), 'Wash');
  return new Blob([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })]);
}
async function call(method = 'GET', payload) {
  const json = ['PATCH', 'DELETE'].includes(method);
  const request = new Request(`${origin}/api/wsh2`, { method, headers: { Origin: origin, ...(json ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: json ? JSON.stringify(payload) : payload } : {}) });
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
  const actor = codeOnly ? `member:${'a'.repeat(64)}` : 'local-preview@example.invalid';
  assert.ok(laptopA.every((row) => row.updatedBy === actor));
  const db = await runtime.getD1Database('DB');
  const audit = await db.prepare('SELECT uploaded_by FROM wsh2_uploads WHERE id = ?').bind(imported.data.uploadId).first();
  assert.equal(audit.uploaded_by, actor);
  const changed = await call('PATCH', { id: laptopA[0].id, revision: laptopA[0].revision, changes: { completed: true, depot: 'east', hvac: 'ON', washType: 'Partial' } });
  assert.equal(changed.status, 200); assert.equal(changed.data.row.completed, true);
  assert.equal(changed.data.row.updatedBy, actor);
  if (codeOnly) assert.ok(!JSON.stringify(changed.data).includes('b'.repeat(64)), 'Do not expose the session token hash');
  const conflict = await call('PATCH', { id: laptopB[0].id, revision: laptopB[0].revision, changes: { completed: false } });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.row.completed, true);
  const second = await call('PATCH', { id: laptopB[1].id, revision: laptopB[1].revision, changes: { location: 'MAINT' } });
  assert.equal(second.status, 200);
  const reread = (await call()).data;
  assert.equal(reread.rows[0].completed, true); assert.equal(reread.rows[1].location, 'MAINT');
  assert.equal((await call('PATCH', { id: second.data.row.id, revision: second.data.row.revision, changes: { hvac: 'OFF' } })).status, 400);
  assert.equal((await call('PATCH', { id: second.data.row.id, revision: second.data.row.revision, changes: { location: 'WEST' } })).status, 400);
  const hvacConfirmed = await call('PATCH', { id: second.data.row.id, revision: second.data.row.revision, changes: { hvac: 'ON' } });
  assert.equal(hvacConfirmed.status, 200); assert.equal(hvacConfirmed.data.row.hvac, 'ON');
  assert.equal(hvacConfirmed.data.row.completed, false, 'HVAC confirmation is separate from wash completion');
  const hvacCleared = await call('PATCH', { id: hvacConfirmed.data.row.id, revision: hvacConfirmed.data.row.revision, changes: { hvac: '' } });
  assert.equal(hvacCleared.status, 200); assert.equal(hvacCleared.data.row.hvac, '');
  const duplicate = await upload(original);
  assert.equal(duplicate.data.alreadyImported, true);
  const revised = await upload(makeFile('14:00'));
  assert.equal(revised.status, 201);
  const updated = (await call()).data;
  assert.equal(updated.rows.length, 2); assert.equal(updated.rows[0].completed, true); assert.equal(updated.rows[0].depot, 'east'); assert.equal(updated.rows[0].hvac, 'ON');
  assert.equal(updated.rows[1].nextWash, '2026-10-31T14:00'); assert.equal(updated.rows[1].location, 'MAINT');
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
  const current = (await call()).data;
  const latestUploadId = race.find((result) => result.status === 201).data.uploadId;
  assert.ok(current.rows.every((row) => row.sourceUploadId === latestUploadId));
  assert.equal(current.uploads.find((file) => file.id === latestUploadId).currentRowCount, 2);
  assert.equal(current.uploads.find((file) => file.id === imported.data.uploadId).currentRowCount, 0);
  assert.equal((await call('DELETE', { uploadId: latestUploadId })).status, 400);
  assert.equal((await call()).data.rows.length, 2, 'An unconfirmed delete cannot change rows');
  const removeOld = await call('DELETE', { uploadId: imported.data.uploadId, confirm: true });
  assert.equal(removeOld.status, 200); assert.equal(removeOld.data.removedRows, 0);
  assert.equal((await call()).data.rows.length, 2, 'Keep rows supplied by a newer workbook');
  assert.equal((await runtime.dispatchFetch(`${origin}/api/wsh2?download=${imported.data.uploadId}`)).status, 404);
  assert.equal((await bucket.list()).objects.length, 2);
  const unrelated = await upload(makeFile('09:00', '2026-11-01'));
  assert.equal(unrelated.status, 201);
  const beforeDelete = (await call()).data.rows;
  const marked = beforeDelete.find((row) => row.sourceUploadId === latestUploadId);
  assert.equal((await call('PATCH', { id: marked.id, revision: marked.revision, changes: { completed: true } })).status, 200);
  const removeCurrent = await call('DELETE', { uploadId: latestUploadId, confirm: true });
  assert.equal(removeCurrent.data.removedRows, 2, 'Deletes current rows including completion details');
  const otherLaptop = (await call()).data;
  assert.equal(otherLaptop.rows.length, 2);
  assert.ok(otherLaptop.rows.every((row) => row.sourceUploadId === unrelated.data.uploadId));
  assert.equal(otherLaptop.uploads.some((file) => file.id === latestUploadId), false);
  assert.equal((await bucket.list()).objects.length, 2);
  assert.equal((await call('DELETE', { uploadId: latestUploadId, confirm: true })).data.removedRows, 0, 'Repeated delete is safe');
  assert.equal((await call('PATCH', { id: marked.id, revision: marked.revision, changes: { completed: true } })).status, 404, 'Stale laptop cannot recreate deleted rows');
  const restored = await upload(original);
  assert.equal(restored.status, 201, 'A deleted Excel can be uploaded again');
  const restoredRows = (await call()).data.rows.filter((row) => row.sourceUploadId === restored.data.uploadId);
  assert.equal(restoredRows.length, 2);
  assert.ok(restoredRows.every((row) => !row.completed), 'Re-upload does not invent deleted completion records');
  console.log(`PASS (${codeOnly ? 'code-only session' : 'email session'}): local D1/R2 upload, audit identity, cross-client sync, revision conflicts, independent row edits, re-import preservation, changed times, original download, uncheck, rejected invalid import, concurrent duplicate import, confirmed deletion, newer/unrelated row preservation, cross-client deletion sync, original cleanup, idempotent retry, stale-edit rejection and re-upload.`);
} finally { await runtime.dispose(); }
