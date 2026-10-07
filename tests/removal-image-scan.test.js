import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRemovalAssignments, imageVehicleToTrainId } from '../functions/lib/removal-image-parser.js';
import { applyRemovalImageAssignments, removalScanFingerprint } from '../src/lib/removalImageAssignments.js';
import { createRemovalScanHandler } from '../functions/api/removal-scan.js';
import { memoryD1 } from './helpers/memory-d1.js';
import { photographedPairs, trackingTableResult } from './fixtures/removal-tracking-table.js';

test('reads all 20 photographed assignments without shifting blank TIDs', () => {
  const result = extractRemovalAssignments(trackingTableResult());
  assert.equal(result.rows.length, 47);
  assert.equal(result.assignedCount, 20);
  for (const [vehicleId, tid] of photographedPairs.filter(([vehicle]) => vehicle !== '999')) {
    assert.deepEqual(result.rows.find((row) => row.vehicleId === vehicleId), { vehicleId, tid, trainId: String(Number(vehicleId) - 300).padStart(2, '0') });
  }
  assert.equal(imageVehicleToTrainId('999'), '');
  assert.equal(imageVehicleToTrainId('T07'), '07');
});

test('blocks conflicting, shifted, malformed and unrecognized OCR instead of clearing trains', () => {
  assert.throws(() => extractRemovalAssignments(trackingTableResult([['301', '226'], ['301', '225']])), /conflicting/);
  assert.throws(() => extractRemovalAssignments(trackingTableResult([['301', '226'], ['302', '226']])), /more than one train/);
  assert.throws(() => extractRemovalAssignments(trackingTableResult([['3O1', '226']])), /Could not read/);
  assert.throws(() => extractRemovalAssignments(trackingTableResult([['301', '22G']])), /Could not read/);
  const merged = trackingTableResult([['301', '226']]);
  merged.tables[0].cells[4].rowSpan = 2;
  assert.throws(() => extractRemovalAssignments(merged), /overlap/);
  assert.throws(() => extractRemovalAssignments({ content: '301 226 302 125' }), /columns were not found/);
});

test('positions OCR words under headers when a screen has no detected table', () => {
  const item = (content, x, y, width = 20) => ({ content, polygon: [x, y, x + width, y, x + width, y + 10, x, y + 10] });
  const result = extractRemovalAssignments({ pages: [{
    lines: [item('Vehicle ID', 0, 0, 60), item('Tracking ID', 100, 0, 60), item('Location', 200, 0, 60)],
    words: [item('301', 10, 30), item('226', 110, 30), item('334', 10, 50), item('325', 10, 70), item('222', 110, 70)],
  }] });
  assert.deepEqual(result.rows.map(({ trainId, tid }) => [trainId, tid]), [['01', '226'], ['34', ''], ['25', '222']]);
  assert.equal(result.uncertain, true);
});

test('replacement preserves timetable rows, times and other periods while clearing stale trains and remarks', () => {
  const state = { selectedPreset: { west: '7pm', east: '7pm' }, presetRows: { west: { '9am': ['unchanged'] } }, rows: {
    west: [{ tid: '226', trainId: '42', timing: '19:20', remark: 'Old request' }, { tid: '101', trainId: '34', timing: '19:30', remark: 'Old' }],
    east: [{ tid: '125', trainId: '17', timing: '20:00', remark: '' }],
  } };
  const before = structuredClone(state);
  const next = applyRemovalImageAssignments(state, extractRemovalAssignments(trackingTableResult()).rows);
  assert.equal(next.rows.west[0].trainId, '01');
  assert.equal(next.rows.west[1].trainId, '');
  assert.equal(next.rows.east[0].trainId, '22');
  assert.equal(next.rows.west[0].timing, '19:20');
  assert.equal(next.rows.west[1].tid, '101');
  assert.equal(next.rows.west[1].remark, '');
  assert.equal(next.presetRows, state.presetRows);
  assert.deepEqual(state, before);
  assert.notEqual(removalScanFingerprint(state), removalScanFingerprint(next));
  assert.notEqual(removalScanFingerprint(state, 'weekday'), removalScanFingerprint(state, 'friday'));
  assert.throws(() => applyRemovalImageAssignments(state, []), /valid train table/);
});

function setup(readImage = async () => trackingTableResult()) {
  const db = memoryD1();
  let time = 1000;
  const handler = createRemovalScanHandler({ readImage, now: () => time });
  const env = { DB: db, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.example', AZURE_DOCUMENT_INTELLIGENCE_KEY: 'test' };
  const request = async ({ method = 'GET', id = '', token = '', body, email = 'owner@example.test', origin = 'https://rail.example' } = {}) => {
    const response = await handler({
      request: new Request(`https://rail.example/api/removal-scan${id ? `?id=${id}` : ''}`, { method, headers: { Origin: origin, 'X-Removal-Scan-Token': token }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }),
      env, data: email ? { authUser: { email } } : {},
    });
    return { status: response.status, ...await response.json() };
  };
  const create = () => request({ method: 'POST', body: { target: { period: '7pm', timetable: 'Weekday', rows: [{ tid: '226', trainId: '42' }, { tid: '101', trainId: '34' }] } } });
  const image = () => { const form = new FormData(); form.append('image', new Blob(['photo'], { type: 'image/png' }), 'screen.png'); return form; };
  return { db, request, create, image, expire: () => { time += 16 * 60 * 1000; } };
}

test('paired phone reads, reviews, confirms and computer acknowledges a one-use scan', async () => {
  const f = setup();
  try {
    const session = await f.create();
    const phone = { id: session.id, token: session.token, email: 'phone@example.test' };
    assert.equal((await f.request({ ...phone })).status, 'waiting');
    const read = await f.request({ ...phone, method: 'POST', body: f.image() });
    assert.equal(read.extraction.assignedCount, 20);
    assert.equal(read.status, 'review');
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: false } })).success, false);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: true } })).status, 'ready');
    assert.equal((await f.request({ ...phone, method: 'POST', body: f.image() })).success, false);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'apply' } })).success, false);
    assert.equal((await f.request({ id: session.id, method: 'PATCH', body: { action: 'apply' } })).status, 'applied');
  } finally { f.db.close(); }
});

test('blocks unauthenticated, cross-origin, wrong-token and expired requests', async () => {
  const f = setup();
  try {
    assert.equal((await f.request({ email: '' })).status, 401);
    assert.equal((await f.request({ method: 'POST', origin: 'https://other.example', body: {} })).status, 403);
    const session = await f.create();
    assert.equal((await f.request({ id: session.id, email: 'other@example.test', token: 'a'.repeat(64) })).status, 403);
    f.expire();
    assert.equal((await f.request({ id: session.id })).status, 410);
  } finally { f.db.close(); }
});

test('failed OCR can retry, but four attempts exhaust the session', async () => {
  const f = setup(async () => { throw new Error('Image is unreadable.'); });
  try {
    const session = await f.create();
    for (let index = 0; index < 4; index += 1) assert.equal((await f.request({ id: session.id, method: 'POST', body: f.image() })).success, false);
    assert.equal((await f.request({ id: session.id, method: 'POST', body: f.image() })).status, 429);
    assert.equal((await f.request({ id: session.id })).extraction, null);
  } finally { f.db.close(); }
});

test('cancelled sessions cannot receive a late OCR result', async () => {
  let finish, started;
  const entered = new Promise((resolve) => { started = resolve; });
  const f = setup(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
  try {
    const session = await f.create();
    const uploading = f.request({ id: session.id, method: 'POST', body: f.image() });
    await entered;
    await f.request({ id: session.id, method: 'DELETE' });
    finish(trackingTableResult());
    assert.equal((await uploading).success, false);
    assert.equal((await f.request({ id: session.id })).status, 'cancelled');
  } finally { f.db.close(); }
});

test('no matching TIDs cannot clear the wrong timetable; a verified all-blank table can clear assignments', async () => {
  for (const [pairs, succeeds] of [[[['301', '999']], false], [[['301', ''], ['334', '']], true]]) {
    const f = setup(async () => trackingTableResult(pairs));
    try {
      const session = await f.create();
      await f.request({ id: session.id, method: 'POST', body: f.image() });
      assert.equal((await f.request({ id: session.id, method: 'PATCH', body: { action: 'confirm', reviewed: true } })).success, succeeds);
    } finally { f.db.close(); }
  }
});
