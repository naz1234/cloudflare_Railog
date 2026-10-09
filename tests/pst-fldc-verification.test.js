import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, ShieldCheck } from 'lucide-react';
import ts from 'typescript';
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
  assert.equal(createPstFldcVerification('west', ['01'], { by: 'DC' }, date), null);
  assert.equal(createPstFldcVerification('west', ['999'], { by: 'DC', verified: true }, date), null);
  assert.equal(createPstFldcVerification('other', ['01'], { by: 'DC', verified: true }, date), null);
  assert.equal(normalizePstFldcVerification({ ...west, by: '' }).status, '');
  assert.deepEqual(west.trainIds, ['01', '02']);
  assert.equal(west.by, 'WEST DEMO');
});

test('train IDs are normalized, deduplicated and restricted to active PST in the matching depot', () => {
  const entries = [
    { type: 'PST', depot: 'west', trainKey: '1', endTime: '03:06' },
    { type: 'PST', depot: 'west', trainKey: 'T01', endTime: '03:06' },
    { type: 'PST', depot: 'west', trainKey: 'TS#302', endTime: '03:07' },
    { type: 'PST', depot: 'east', trainKey: '47', endTime: '03:08' },
    { type: 'Prep', depot: 'west', trainKey: '04', endTime: '03:09' },
    { type: 'PST', depot: 'west', trainKey: '05', endTime: '' },
  ];
  assert.deepEqual(collectPstFldcTrainIds('west', entries), ['01', '02']);
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
  assert.equal(getPstFldcRecordKey('west', date), `pst-fldc-v3:${date}:west`);
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

test('active-PST eligibility includes orange first-click trains without a fixed T03 exclusion or all-fleet list', () => {
  const entries = [
    { type: 'PST', depot: 'west', trainKey: 'T03', endTime: '03:06' },
    { type: 'PST', depot: 'west', trainKey: 'T38', endTime: '03:07', manualEntry: true },
    { type: 'PST', depot: 'west', trainKey: 'T03', endTime: '03:08' },
    { type: 'Prep', depot: 'west', trainKey: 'T04', endTime: '03:09' },
    { type: 'PST', depot: 'west', trainKey: 'T05', endTime: ' ' },
    { type: 'PST', depot: 'west', trainKey: 'T06', endTime: '03:12', completed: false, confirming: true },
    { type: 'PST', depot: 'east', trainKey: 'T47', endTime: '03:10' },
  ];
  assert.deepEqual(collectPstFldcTrainIds('west', entries), ['03', '06', '38']);
  assert.deepEqual(collectPstFldcTrainIds('east', entries), ['47']);
  assert.deepEqual(collectPstFldcTrainIds('west', { 'WD-ST12': [{ trainId: '06' }] }), []);
});

test('empty, missing-time and Prep-only rows never export FLDC even when included in a snapshot', () => {
  const original = rows();
  original[3][5] = '';
  original[3][7] = '';
  original[3][9] = '03:10H'; // Train Prep only.
  original[5][7] = ''; // PST without a completion time.
  original[39][5] = '';
  original[39][7] = ''; // T38 is merely stabled.
  const performedWest = createPstFldcVerification('west', ['01', '02', '03', '04', '38'], { by: 'WEST DC', verified: true }, date);
  const result = appendPstFldcColumns(original, { west: performedWest, east }, '', date);
  assert.equal(result.slice(2).filter(row => row[11] === 'Yes').length, 3);
  assert.deepEqual(result[2].slice(11), ['Yes', 'WEST DC']);
  assert.deepEqual(result[4].slice(11), ['Yes', 'WEST DC']); // T03 is included when PST is performed.
  for (const index of [3, 5, 39]) assert.deepEqual(result[index].slice(11), ['', '']);
  assert.deepEqual(result[48].slice(11), ['Yes', 'EAST DEMO']);
  result.forEach((row, index) => assert.deepEqual(row.slice(0, 11), original[index]));
  assert.equal(buildPSTExcelClipboardText(result).split('\n').length, 47);
});

test('new PST records require reconfirmation rather than automatically widening a saved attestation', () => {
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['01', '02'], date), true);
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['01', '02', '03'], date), false);
  assert.equal(isPstFldcVerificationCurrent(west, 'west', ['01'], date), false);
});

test('old stabling and fleet records are isolated from active-PST attestations', () => {
  const key = getPstFldcRecordKey('west', date);
  const oldRecords = [
    { id: 'old-depot', recordKey: `pst-fldc-v1:${date}:west`, verification: west },
    { id: 'old-fleet', recordKey: `pst-fldc-v2:${date}:fleet`, verification: { ...west, depot: 'fleet' } },
  ];
  assert.equal(key, `pst-fldc-v3:${date}:west`);
  assert.equal(selectPstFldcRecord(oldRecords, key), null);
  assert.equal(normalizePstFldcVerification({ ...west, depot: 'fleet' }).status, '');
  const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  assert.match(source, /usePstFldcVerification\(exportLogLines\.map/);
  assert.match(source, /depot: getPSTDepotFromEntry\(entry\)/);
  assert.doesNotMatch(source, /completed: Boolean\(entry.manualEntry \|\| pstState\?/);
});

test('orange PST can be verified and copied before its second click, which keeps the verification current', () => {
  const orange = { type: 'PST', depot: 'west', trainKey: 'T06', startTime: '03:06', endTime: '03:12', confirming: true, completed: false };
  const orangeIds = collectPstFldcTrainIds('west', [orange]);
  const verification = createPstFldcVerification('west', orangeIds, { by: 'WEST DC', verified: true }, date);
  const original = rows();
  original[6][5] = '';
  original[6][7] = ''; // T05 has not started PST.
  const result = appendPstFldcColumns(original, { west: verification }, 'west', date);
  assert.deepEqual(result[7].slice(11), ['Yes', 'WEST DC']); // T06 is still orange.
  assert.deepEqual(result[6].slice(11), ['', '']);
  result.forEach((row, index) => assert.deepEqual(row.slice(0, 11), original[index]));
  const copied = buildPSTExcelClipboardText(result).split('\n').map(row => row.split('\t'));
  assert.equal(copied.length, 47);
  assert.deepEqual(copied[5].slice(11), ['Yes', 'WEST DC']);
  const greenIds = collectPstFldcTrainIds('west', [{ ...orange, confirming: false, completed: true }]);
  assert.deepEqual(greenIds, orangeIds);
  assert.equal(isPstFldcVerificationCurrent(verification, 'west', greenIds, date), true);
});

const checklistSource = readFileSync(new URL('../src/components/PstFldcChecklist.jsx', import.meta.url), 'utf8');
const checklistRenderSource = ts.transpileModule(checklistSource.replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const Checklist = new Function('React', 'Check', 'ShieldCheck', `${checklistRenderSource}\nreturn PstFldcChecklist;`)(React, Check, ShieldCheck);

function renderChecklist(overrides = {}) {
  const controller = {
    drafts: { west: { by: 'WEST DC' }, east: { by: 'EAST DC' } },
    trainIds: { west: ['01', '02', '03'], east: ['47'] },
    loaded: { west: true, east: true }, saving: {}, errors: {},
    isConfirmed: () => false, confirm: () => {}, updateDraft: () => {}, retry: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(Checklist, { depot: 'west', controller }));
}

test('FLDC renders a single enabled confirmation button without a checkbox', () => {
  const html = renderChecklist();
  assert.doesNotMatch(html, /type="checkbox"|pst-fldc-check"/);
  assert.match(html, /Confirm all 3 trains via FLDC/);
  assert.doesNotMatch(html.match(/<button\b[^>]*>/)?.[0] || '', /disabled/);
});

test('single FLDC confirmation still requires a name, eligible PST trains and a loaded, idle record', () => {
  for (const override of [
    { drafts: { west: { by: ' ' } } },
    { trainIds: { west: [] } },
    { loaded: { west: false } },
    { saving: { west: 'confirm' } },
    { isConfirmed: () => true },
  ]) {
    assert.match(renderChecklist(override).match(/<button\b[^>]*>/)?.[0] || '', /disabled/);
  }
  const confirmed = renderChecklist({ isConfirmed: () => true });
  assert.match(confirmed, /Confirmed all 3 trains via FLDC/);
  assert.match(confirmed, /Verified by WEST DC/);
});

test('the actual hook confirms via the button without checkbox state and never saves a name alone', () => {
  const hook = readFileSync(new URL('../src/hooks/usePstFldcVerification.js', import.meta.url), 'utf8');
  const confirmSource = hook.slice(hook.indexOf('  const confirm ='), hook.indexOf('  const retry ='));
  const saved = [];
  const makeConfirm = (by, loaded = true) => new Function('getPstFldcDate', 'day', 'setDay', 'createPstFldcVerification', 'trainIds', 'drafts', 'loaded', 'persist', `${confirmSource}\nreturn confirm;`)(
    () => date, date, () => {}, createPstFldcVerification,
    { west: ['01', '02', '03'] }, { west: { by } }, { west: loaded },
    (depot, value, confirmed) => saved.push({ depot, value, confirmed }),
  );
  assert.equal(saved.length, 0);
  makeConfirm('WEST DC')('west');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].confirmed, true);
  assert.equal(saved[0].value.status, 'Yes');
  assert.equal(saved[0].value.by, 'WEST DC');
  assert.deepEqual(saved[0].value.trainIds, ['01', '02', '03']);
  makeConfirm(' ')('west');
  makeConfirm('WEST DC', false)('west');
  assert.equal(saved.length, 1);
  assert.doesNotMatch(hook, /drafts\[depot\]\.verified|next\.verified/);
});
