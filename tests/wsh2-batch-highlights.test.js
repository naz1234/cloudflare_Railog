import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { findWashBatchTrainMatches, findWashTrainMatches } from '../src/lib/wsh2TrainSearch.js';
import { buildWashBatchPlan, parseWashBatchTrains, WSH2_BATCH_MAX_INPUT } from '../src/lib/wsh2BatchCompletion.js';
import { groupWashRows, summarizeWashRows } from '../src/lib/wsh2Records.js';

const uploadId = 'e1111111-1111-4111-8111-111111111111';
const otherUploadId = 'e2222222-2222-4222-8222-222222222222';
const rows = [
  { id: 'one-301', trainNumber: 'L3-MV-301', date: '2026-11-04', nextWash: '2026-11-04T09:00', sourceUploadId: uploadId, completed: false, hvac: '', revision: 1 },
  { id: 'one-302', trainNumber: 'L3-MV-302', date: '2026-11-04', nextWash: '2026-11-04T09:15', sourceUploadId: uploadId, completed: true, hvac: 'ON', revision: 2 },
  { id: 'two-301', trainNumber: 'L3-MV-301', date: '2026-11-06', nextWash: '2026-11-06T09:00', sourceUploadId: otherUploadId, completed: false, hvac: '', revision: 1 },
  { id: 'other-date-303', trainNumber: 'L3-MV-303', date: '2026-11-06', nextWash: '2026-11-06T09:15', sourceUploadId: uploadId, completed: false, hvac: '', revision: 1 },
  { id: 'other-file-303', trainNumber: 'L3-MV-303', date: '2026-11-04', nextWash: '2026-11-04T09:30', sourceUploadId: otherUploadId, completed: false, hvac: '', revision: 1 },
];
const uploads = [{ id: uploadId, fileName: 'first.xlsx' }, { id: otherUploadId, fileName: 'second.xlsx' }];
const workspace = readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/components/Wsh2BatchCompletion.jsx', import.meta.url), 'utf8');

test('batch typing highlights every matching train before selecting an Excel file/date', () => {
  assert.deepEqual([...findWashBatchTrainMatches(rows, { input: '01 02' })], ['one-301', 'one-302', 'two-301']);
  assert.deepEqual([...findWashBatchTrainMatches(rows, { input: '01 02 03 04 05' })], rows.map(row => row.id));
});

test('selecting a batch file/date scopes highlights to exactly the rows that could be submitted', () => {
  const preview = { input: '01 02 03', uploadId, date: '2026-11-04' };
  assert.deepEqual([...findWashBatchTrainMatches(rows, preview)], ['one-301', 'one-302']);
  assert.deepEqual([...findWashBatchTrainMatches(rows, { ...preview, uploadId: otherUploadId })], ['other-file-303']);
  assert.deepEqual([...findWashBatchTrainMatches(rows, { ...preview, date: '2026-11-06' })], ['other-date-303']);
  assert.deepEqual([...findWashBatchTrainMatches(rows, { ...preview, uploadId: 'missing' })], []);
  const plan = buildWashBatchPlan(rows, uploads, uploadId, '2026-11-04', '01 02');
  assert.deepEqual([...findWashBatchTrainMatches(rows, { ...preview, input: '01 02' })], plan.rows.map(row => row.id));
});

test('live batch preview normalizes short numbers and separators, ignoring duplicate tokens', () => {
  assert.deepEqual(findWashBatchTrainMatches(rows, { input: ' 1, 02;01\n2\t01 ' }), findWashBatchTrainMatches(rows, { input: '01 02' }));
  const boundary = [{ id: 'last', trainNumber: 'L3-MV-347' }];
  assert.deepEqual([...findWashBatchTrainMatches(boundary, { input: '47' })], ['last']);
});

test('valid tokens stay highlighted while typing but invalid tokens never become train matches', () => {
  const invalid = '0 00 48 99 001 301 T01 01-05 x -1 1.0';
  assert.equal(findWashBatchTrainMatches(rows, { input: invalid }).size, 0);
  assert.deepEqual([...findWashBatchTrainMatches(rows, { input: `01 ${invalid} 02` })], ['one-301', 'one-302', 'two-301']);
  assert.throws(() => parseWashBatchTrains(`01 ${invalid} 02`), /Use train numbers/);
  assert.equal(findWashBatchTrainMatches([{ id: 'bad-suffix', trainNumber: 'L3-MV-1301' }, { id: 'blank', trainNumber: null }], { input: '01' }).size, 0);
});

test('cleared, oversized or non-text batch input leaves no batch highlights', () => {
  for (const input of ['', ' \n ', null, 25, {}, '1'.repeat(WSH2_BATCH_MAX_INPUT + 1)]) {
    assert.equal(findWashBatchTrainMatches(rows, { input }).size, 0);
  }
});

test('batch preview never mutates shared rows, completion, HVAC, row order or daily totals', () => {
  const original = structuredClone(rows);
  const groups = groupWashRows(rows);
  const summary = summarizeWashRows(rows);
  findWashBatchTrainMatches(rows, { input: '01 02' });
  findWashBatchTrainMatches(rows, { input: '01', uploadId, date: '2026-11-04' });
  assert.deepEqual(rows, original);
  assert.deepEqual(groupWashRows(rows), groups);
  assert.deepEqual(summarizeWashRows(rows), summary);
  assert.match(workspace, /\{groups.map\(\(group\)/);
  assert.match(workspace, /highlighted=\{matchedRowIds.has\(row.id\)\}/);
});

test('search and batch highlights combine independently without changing the search result count', () => {
  const search = findWashTrainMatches(rows, '03');
  const preview = findWashBatchTrainMatches(rows, { input: '01', uploadId, date: '2026-11-04' });
  assert.equal(new Set([...search, ...preview]).size, 3);
  assert.deepEqual([...new Set([...search, ...findWashBatchTrainMatches(rows, { input: '' })])], [...search]);
  assert.deepEqual([...new Set([...findWashTrainMatches(rows, ''), ...preview])], [...preview]);
  assert.match(workspace, /new Set\(\[\.\.\.searchMatchedRowIds, \.\.\.batchMatchedRowIds\]\)/);
  assert.match(workspace, /\$\{searchMatchedRowIds.size\}/);
});

test('batch preview follows live input and selected scope, and clears after a successful submission only', () => {
  assert.match(batch, /onPreviewChange\?\.\(\{ input, uploadId: option\?\.uploadId \|\| '', date: option\?\.date \|\| '' \}\)/);
  assert.match(batch, /\[input, option\?\.uploadId, option\?\.date, onPreviewChange\]/);
  assert.match(workspace, /onPreviewChange=\{setBatchPreview\} highlightedCount=\{batchMatchedRowIds.size\}/);
  assert.match(batch, /await onSubmit\([\s\S]*setInput\(''\);[\s\S]*catch/);
  const typingHandler = batch.match(/onChange=\{event => \{ setInput\(event.target.value\);[^}]*\}\}/)?.[0];
  assert.ok(typingHandler);
  assert.doesNotMatch(typingHandler, /onSubmit|fetch|request/);
  assert.match(batch, /aria-describedby="wsh2-batch-highlight-status"/);
  assert.match(batch, /role="status" aria-live="polite"/);
  assert.match(batch, /Nothing is marked Done until Submit/);
});
