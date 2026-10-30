import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { getWashPrintSections, selectWashPrintRows } from '../src/lib/wsh2Records.js';
import { buildWsh2Docx } from '../src/lib/wsh2Docx.js';

const uploads = ['a', 'b', 'c', 'old'].map((id) => ({ id, fileName: `${id}.xlsx` }));
function row(train, date, sourceUploadId, extra = {}) {
  return { id: `${date}_${train}`, trainNumber: `L3-MV-${train}`, date, nextWash: `${date}T09:15`, sourceUploadId, location: 'OPE', completed: false, hvac: '', washType: '', depot: '', ...extra };
}
const rows = [row(301, '2026-10-30', 'a', { completed: true, hvac: 'ON', washType: 'Partial', depot: 'east' }), row(302, '2026-10-31', 'b'), row(303, '2026-11-01', 'c')];

test('AWP prints only the chosen one or two source uploads with saved current details', () => {
  assert.deepEqual(selectWashPrintRows(rows, uploads, ['b']), { rows: [rows[1]], sectionCount: 1 });
  const selected = selectWashPrintRows(rows, uploads, ['b', 'a']);
  assert.deepEqual(selected, { rows: rows.slice(0, 2), sectionCount: 2 });
  const xml = strFromU8(unzipSync(buildWsh2Docx(selected.rows, { singlePage: true }))['word/document.xml']);
  assert.match(xml, /L3-MV-301/);
  assert.match(xml, /L3-MV-302/);
  assert.doesNotMatch(xml, /L3-MV-303/);
  assert.match(xml, /Partial \/ ED/);
  assert.match(xml, />ON<\/w:t>/);
  assert.match(xml, />DONE<\/w:t>/);
  assert.doesNotMatch(xml, /w:type="page"/);
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 2);
});

test('AWP rejects zero, duplicate, more than two, missing and superseded upload selections', () => {
  for (const ids of [null, [], ['a', 'a'], ['a', 'b', 'c']]) assert.throws(() => selectWashPrintRows(rows, uploads, ids), /one or two/);
  assert.throws(() => selectWashPrintRows(rows, uploads, ['missing']), /no longer available/);
  assert.throws(() => selectWashPrintRows(rows, uploads, ['old']), /no current checklist rows/);
  assert.throws(() => selectWashPrintRows(rows, uploads, ['a', 'old']), /no current checklist rows/);
});

test('AWP does not infer source membership from dates when another upload supplied those rows', () => {
  const overlapping = [row(301, '2026-10-30', 'b'), row(302, '2026-10-30', 'a')];
  assert.deepEqual(selectWashPrintRows(overlapping, uploads, ['a']).rows, [overlapping[1]]);
  assert.throws(() => selectWashPrintRows([row(301, '2026-10-30', undefined)], uploads, ['a']), /no current checklist rows/);
});

test('AWP refuses oversized single-page selections without silently dropping trains', () => {
  const threeDates = [row(301, '2026-10-30', 'a'), row(302, '2026-10-31', 'a'), row(303, '2026-11-01', 'a')];
  assert.throws(() => selectWashPrintRows(threeDates, uploads, ['a']), /more than one page/);
  const many = Array.from({ length: 39 }, (_, index) => row(301 + index, '2026-10-30', 'a'));
  assert.throws(() => selectWashPrintRows(many, uploads, ['a']), /more than one page/);
  assert.throws(() => buildWsh2Docx(many, { singlePage: true }), /more than one page/);
  const max = selectWashPrintRows(many.slice(0, 38), uploads, ['a']);
  assert.equal(max.rows.length, 38);
  assert.equal(max.sectionCount, 2);
  assert.equal(getWashPrintSections(max.rows)[1].offset, 19);
  const xml = strFromU8(unzipSync(buildWsh2Docx(max.rows, { singlePage: true }))['word/document.xml']);
  assert.equal((xml.match(/L3-MV-/g) || []).length, 38);
  assert.doesNotMatch(xml, /w:type="page"/);
});

test('AWP print picker is a keyboard-accessible dialog with a two-file limit and no automatic download', () => {
  const workspace = readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../src/components/Wsh2PrintDialog.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /setPrintOpen\(true\)/);
  assert.match(workspace, /printOpen && <Wsh2PrintDialog/);
  assert.match(workspace, /selectWashPrintRows\(rowsRef.current, uploads, selectedIds\)/);
  assert.match(workspace, /groupWashRows\(selected.rows\)/);
  assert.match(picker, /element.showModal\(\)/);
  assert.match(picker, /onCancel=/);
  assert.match(picker, /type="checkbox"/);
  assert.match(picker, /selectedIds.length >= WSH2_PRINT_MAX_FILES/);
  assert.match(picker, /live.length < WSH2_PRINT_MAX_FILES/);
  assert.match(picker, /disabled=\{!selection \|\| busy \|\| blocked\}/);
  assert.match(picker, /onPrint\(selectedIds\)/);
  assert.match(picker, /if \(!selectionChanged && selectedIds.length\)/);
  assert.match(picker, /Reset selection/);
});
