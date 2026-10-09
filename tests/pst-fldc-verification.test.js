import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendPstFldcColumns, collectPstFldcTrainIds, createPstFldcVerification, getPstFldcDate, getPstFldcRecordKey, isPstFldcVerificationCurrent, normalizePstFldcVerification, savePstFldcVerification, selectPstFldcRecord } from '../src/lib/pstFldcVerification.js';
import { buildPSTExcelClipboardText } from '../src/lib/pstExcelClipboard.js';

const date = '2026-10-09';
const west = createPstFldcVerification('west', ['01', '02'], { by: ' WEST DEMO ', verified: true }, date);
const east = createPstFldcVerification('east', ['47'], { by: 'EAST DEMO', verified: true }, date);
const rows = () => [['Date', 'Version', 'Train', 'Start', 'Location', 'PST', 'Awake', 'End', 'DC', 'Prep', 'TA'], Array(11).fill(''),
  ...Array.from({ length: 47 }, (_, index) => ['9-Oct-26', 'V09-01-02', `TS#3${String(index + 1).padStart(2, '0')}`, '03:00H', 'WD-ST12', 'PASS', 'Completely Awake', '03:06H', 'DC', '03:10H', 'TA'])];

test('FLDC confirmation needs a verifier, explicit attestation and at least one valid train', () => {
  assert.equal(createPstFldcVerification('west', ['01'], { by: ' ', verified: true }, date), null);
  assert.equal(createPstFldcVerification('west', ['01'], { by: 'DC', verified: 'true' }, date), null);
  assert.equal(createPstFldcVerification('west', ['999'], { by: 'DC', verified: true }, date), null);
  assert.equal(createPstFldcVerification('other', ['01'], { by: 'DC', verified: true }, date), null);
  assert.equal(normalizePstFldcVerification({ ...west, by: '' }).status, '');
  assert.deepEqual(west.trainIds, ['01', '02']);
  assert.equal(west.by, 'WEST DEMO');
});

test('train IDs are normalized, deduplicated and restricted to the matching depot', () => {
  assert.deepEqual(collectPstFldcTrainIds('west', { 'WD-ST12': [{ trainId: '1' }, { trainId: 'T01' }, { trainId: 'TS#302' }, { trainId: '' }], 'ED-ST02': [{ trainId: '47' }] }), ['01', '02']);
});

test('verification is only valid for its depot, exact train list and Riyadh calendar day', () => {
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['T02', '1'], date), true);
  assert.equal(isPstFldcVerificationCurrent(west, 'east', ['01', '02'], date), false);
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['01'], date), false);
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['01', '02', '03'], date), false);
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['01', '02'], '2026-10-10'), false);
  assert.equal(getPstFldcDate(new Date('2026-10-09T21:01:00Z')), '2026-10-10');
});

test('new fields extend to M49 without altering any A–K values', () => {
  const original = rows();
  const result = appendPstFldcColumns(original, { west, east }, '', date);
  assert.equal(result.length, 49);
  result.forEach((row, index) => {
    assert.equal(row.length, 13);
    assert.deepEqual(row.slice(0, 11), original[index]);
  });
  assert.deepEqual(result[0].slice(11), ['Verified via FLDC?', 'Verified via FLDC by']);
  assert.deepEqual(result[1].slice(11), ['Yes/No', 'DC Name']);
  assert.deepEqual(result[2].slice(11), ['Yes', 'WEST DEMO']);
  assert.deepEqual(result[3].slice(11), ['Yes', 'WEST DEMO']);
  assert.deepEqual(result[4].slice(11), ['', '']);
  assert.deepEqual(result[48].slice(11), ['Yes', 'EAST DEMO']);
  const clipboard = buildPSTExcelClipboardText(result).split('\n').map((row) => row.split('\t'));
  assert.equal(clipboard.length, 47);
  assert.ok(clipboard.every((row) => row.length === 13));
  assert.equal(clipboard[46][12], 'EAST DEMO');
});

test('standalone exports do not leak the opposite depot verification', () => {
  const result = appendPstFldcColumns(rows(), { west, east }, 'west', date);
  assert.deepEqual(result[2].slice(11), ['Yes', 'WEST DEMO']);
  assert.deepEqual(result[48].slice(11), ['', '']);
});

test('unconfirmed, incomplete, stale or ambiguous records never export as Yes', () => {
  assert.deepEqual(appendPstFldcColumns(rows(), {}, '', date)[2].slice(11), ['', '']);
  assert.deepEqual(appendPstFldcColumns(rows(), { west: { ...west, by: '' } }, '', date)[2].slice(11), ['', '']);
  assert.deepEqual(appendPstFldcColumns(rows(), { west }, '', '2026-10-10')[2].slice(11), ['', '']);
  const conflict = { ...east, trainIds: ['01'] };
  assert.deepEqual(appendPstFldcColumns(rows(), { west, east: conflict }, '', date)[2].slice(11), ['', '']);
});

test('confirmed and revoked verification updates only its own daily depot record', async () => {
  const records = [];
  const entity = {
    filter: async ({ recordKey }) => records.filter((row) => row.recordKey === recordKey),
    create: async (payload) => { const row = { ...payload, id: String(records.length + 1) }; records.push(row); return row; },
    update: async (id, payload) => { const index = records.findIndex((row) => row.id === id); records[index] = { ...records[index], ...payload }; return records[index]; },
  };
  await savePstFldcVerification(entity, west);
  await savePstFldcVerification(entity, east);
  await savePstFldcVerification(entity, { depot: 'west', date, by: '', trainIds: [], status: '' });
  assert.equal(records.length, 2);
  assert.equal(records.find((row) => row.scopeDepot === 'west').verification.status, '');
  assert.equal(records.find((row) => row.scopeDepot === 'east').verification.by, 'EAST DEMO');
  assert.equal(getPstFldcRecordKey('west', date), `pst-fldc-v1:${date}:west`);
  await assert.rejects(savePstFldcVerification(entity, { depot: 'unknown' }));
});

test('latest duplicate record wins deterministically and failed saves reject', async () => {
  const key = getPstFldcRecordKey('west', date);
  assert.equal(selectPstFldcRecord([{ id: '1', recordKey: key, updatedAt: '2026-10-09T01:00:00Z' }, { id: '2', recordKey: key, updatedAt: '2026-10-09T02:00:00Z' }], key).id, '2');
  await assert.rejects(savePstFldcVerification({ filter: async () => [], create: async () => { throw new Error('Offline'); } }, west), /Offline/);
});

test('all workbook and clipboard entry points carry the same verification snapshot', () => {
  const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  assert.match(source, /downloadPSTExcelExport\(exportLogLines, completedBy, normalizedDepot, fldcController.exportVerifications\)/);
  assert.match(source, /buildPSTExportRows\(exportLogLines, completedBy, normalizedDepot, false, fldcController.exportVerifications\)/);
  assert.match(source, /dimension: `A1:M\$\{rows.length\}`/);
  assert.match(source, /38, 38, 26, 32\]/);
  assert.match(source, /<PstFldcChecklist depot=\{depot\} controller=\{fldcController\} \/>/);
  const hook = readFileSync(new URL('../src/hooks/usePstFldcVerification.js', import.meta.url), 'utf8');
  assert.match(hook, /!dirty.current\[depot\]/);
});
