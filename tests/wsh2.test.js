import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { parseWashDate, parseWsh2Workbook } from '../src/lib/wsh2Workbook.js';
import { formatWashTime, groupWashRows, validateWashChanges } from '../src/lib/wsh2Records.js';
import { buildWsh2Docx } from '../src/lib/wsh2Docx.js';
import { onRequest } from '../functions/api/wsh2.js';

function workbook(rows, props = {}) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { WBProps: props };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Train Number', 'Next Wash', 'Train Location', 'Last Wash'], ...rows]), 'Wash');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
}

test('WSH2 reads, sorts and groups wash report records without timezone shifts', () => {
  const result = parseWsh2Workbook(workbook([
    ['L3-MV-302', '2026-10-31 13:00:00', 'OPE'],
    ['L3-MV-340', '2026-10-31 00:53:00', 'MAINT'],
    ['L3-MV-336', '2026-10-30 07:33:00', 'OPE'],
  ]));
  assert.deepEqual(result.rows.map((row) => row.trainNumber), ['L3-MV-336', 'L3-MV-340', 'L3-MV-302']);
  assert.deepEqual(groupWashRows(result.rows).map((group) => group.date), ['2026-10-30', '2026-10-31']);
  assert.equal(formatWashTime(result.rows[1].nextWash), '10/31/26 12:53 AM');
  assert.equal(result.rows[1].sourceLocation, 'MAINT');
});

test('WSH2 supports serial, US text and 1904 Excel dates, rejects impossible dates', () => {
  assert.equal(parseWashDate('10/31/26 12:53 AM'), '2026-10-31T00:53');
  assert.equal(parseWashDate('10/31/2026 12:53 PM'), '2026-10-31T12:53');
  const serial = (Date.UTC(2026, 9, 31, 9, 15) - Date.UTC(1899, 11, 30)) / 86400000;
  assert.equal(parseWashDate(serial), '2026-10-31T09:15');
  assert.equal(parseWashDate(serial - 1462, true), '2026-10-31T09:15');
  for (const value of ['2026-02-30 08:00:00', '2026-10-31 24:00:00', '10/31/26 14:00 PM', '', 0, 'Friday']) assert.equal(parseWashDate(value), null);
});

test('WSH2 keeps train/date identity when a report changes the scheduled time', () => {
  const a = parseWsh2Workbook(workbook([['L3-MV-302', '2026-10-31 13:00:00']]));
  const b = parseWsh2Workbook(workbook([['L3-MV-302', '2026-10-31 14:00:00']]));
  assert.equal(a.rows[0].id, b.rows[0].id);
});

test('WSH2 rejects invalid rows and conflicting duplicate times without silently dropping entries', () => {
  assert.throws(() => parseWsh2Workbook(workbook([['L3-MV-302', 'not a date']])), /row 2/);
  assert.throws(() => parseWsh2Workbook(workbook([['L3-MV-302', '2026-10-31 13:00:00'], ['L3-MV-302', '2026-10-31 14:00:00']])), /two different wash times/);
  const result = parseWsh2Workbook(workbook([['L3-MV-302', '2026-10-31 13:00:00'], ['L3-MV-302', '2026-10-31 13:00:00']]));
  assert.equal(result.rows.length, 1); assert.equal(result.duplicates, 1);
  assert.throws(() => parseWsh2Workbook(new Uint8Array([1, 2, 3])), /valid XLSX/);
  assert.throws(() => parseWsh2Workbook(new Uint8Array(5 * 1024 * 1024 + 1)), /smaller than 5 MB/);
});

test('WSH2 rejects row overflow rather than importing a truncated workbook', () => {
  assert.throws(() => parseWsh2Workbook(workbook(Array.from({ length: 530 }, (_, i) => [`L3-MV-${300 + (i % 100)}`, '2026-10-31 13:00:00']))), /more than 500 rows/);
});

test('WSH2 allows only bounded checklist fields', () => {
  assert.deepEqual(validateWashChanges({ location: ' WD ', completed: true, hvac: 'ON', washType: 'Partial', depot: 'west' }), { location: 'WD', completed: true, hvac: 'ON', washType: 'Partial', depot: 'west' });
  for (const changes of [{}, { completed: 'true' }, { revision: 999 }, { location: 'x'.repeat(41) }, { depot: 'north' }, { hvac: 'yes' }, { washType: 'unknown' }]) assert.throws(() => validateWashChanges(changes));
});

test('WSH2 Word export matches paper columns and preserves every row in continuation sections', () => {
  const rows = Array.from({ length: 41 }, (_, i) => ({ id: String(i), trainNumber: `L3-MV-${301 + i}`, date: '2026-10-31', nextWash: '2026-10-31T13:00', location: 'WD & <test>', completed: i === 0, hvac: i === 0 ? 'ON' : '', washType: i === 0 ? 'Partial' : '', depot: i === 0 ? 'east' : '' }));
  const zip = unzipSync(buildWsh2Docx(rows));
  const xml = strFromU8(zip['word/document.xml']);
  assert.match(xml, /F4C542/);
  for (const header of ['Train Number', 'Next Wash', 'Location', 'DONE', 'HVAC', 'PARTIAL \/ FULL', 'WD or ED', 'DC MARK']) assert.match(xml, new RegExp(header));
  assert.match(xml, /Partial \/ ED/); assert.match(xml, /WD &amp; &lt;test&gt;/);
  assert.equal((xml.match(/L3-MV-/g) || []).length, 41);
  assert.equal((xml.match(/w:type="page"/g) || []).length, 1);
  assert.match(xml, /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(xml, /w:tblHeader/); assert.match(xml, /w:cantSplit/);
  assert.throws(() => buildWsh2Docx([]), /at least one/);
});

test('WSH2 API fails closed without login, bindings, or a same-origin mutation', async () => {
  const env = { DB: {}, WSH2_FILES: {} };
  assert.equal((await onRequest({ request: new Request('https://local.test/api/wsh2'), env })).status, 401);
  const data = { authUser: { email: 'test@example.invalid' } };
  assert.equal((await onRequest({ request: new Request('https://local.test/api/wsh2'), env: {}, data })).status, 503);
  assert.equal((await onRequest({ request: new Request('https://local.test/api/wsh2', { method: 'PATCH', headers: { Origin: 'https://other.test' } }), env, data })).status, 403);
  assert.equal((await onRequest({ request: new Request('https://local.test/api/wsh2', { method: 'DELETE' }), env, data })).status, 405);
});

test('WSH2 is a separate route and navigation item without removing existing WSH', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/wsh2"/); assert.match(app, /path="\/train-washing"/);
  assert.match(page, /code: "WSH2"/); assert.match(page, /<Wsh2Workspace \/>/); assert.match(page, /<TrainWashing \/>/);
});
