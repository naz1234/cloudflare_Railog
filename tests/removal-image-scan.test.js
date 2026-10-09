import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRemovalAssignments, imageVehicleToTrainId } from '../functions/lib/removal-image-parser.js';
import { applyRemovalImageAssignments, removalScanFingerprint, summarizeRemovalScan } from '../src/lib/removalImageAssignments.js';
import { createRemovalScanHandler } from '../functions/api/removal-scan.js';
import { createAuthMiddleware } from '../functions/_middleware.js';
import { memoryD1 } from './helpers/memory-d1.js';
import { photographedPairs, trackingTableResult } from './fixtures/removal-tracking-table.js';
import { screenPhotoPairs, screenPhotoResult, screenWord } from './fixtures/removal-screen-photo.js';

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

test('screen photo headers can be one OCR line or split words without reading map labels', () => {
  for (const joined of [false, true]) {
    const result = extractRemovalAssignments(screenPhotoResult({ joined }));
    assert.equal(result.rows.length, screenPhotoPairs.length - 1);
    assert.equal(result.assignedCount, 23);
    assert.equal(result.partial, false);
    for (const [vehicleId, tid] of screenPhotoPairs.filter(([vehicle]) => vehicle !== '999')) {
      assert.deepEqual(result.rows.find((row) => row.vehicleId === vehicleId), {
        vehicleId, tid, trainId: String(Number(vehicleId) - 300).padStart(2, '0'),
      });
    }
    assert.ok(result.rows.every((row) => row.vehicleId !== 'GATE'));
  }
  const table = extractRemovalAssignments(trackingTableResult([['GATE', ''], ['319', '101']]));
  assert.deepEqual(table.rows, [{ vehicleId: '319', trainId: '19', tid: '101' }]);
});

test('a cropped screen table uses aligned numeric columns, preserves blanks, and is explicitly partial', () => {
  const result = extractRemovalAssignments(screenPhotoResult({ cropped: true }));
  assert.equal(result.partial, true);
  assert.equal(result.uncertain, true);
  assert.equal(result.assignedCount, 23);
  for (const [vehicleId, tid] of screenPhotoPairs.slice(7).filter(([vehicle]) => vehicle !== '999')) {
    assert.equal(result.rows.find((row) => row.vehicleId === vehicleId)?.tid, tid);
  }
  assert.equal(result.rows.find((row) => row.trainId === '19').tid, '101');
  assert.equal(result.rows.find((row) => row.trainId === '13').tid, '201');
  assert.equal(result.rows.find((row) => row.trainId === '02').tid, '302');
});

test('cropped inference rejects sparse, non-table, ambiguous, malformed and misaligned OCR', () => {
  const sparse = { pages: [{ words: [screenWord('319', 150, 100), screenWord('101', 340, 100), screenWord('STATION', 540, 100)] }] };
  assert.throws(() => extractRemovalAssignments(sparse), /columns were not found/);
  const noLocations = screenPhotoResult({ cropped: true });
  noLocations.pages[0].words = noLocations.pages[0].words.filter((word) => !/STATION|Unknown/.test(word.content));
  assert.throws(() => extractRemovalAssignments(noLocations), /columns were not found/);
  for (const badTid of ['1O1', 'I01', 'TBD']) {
    const malformed = screenPhotoResult({ cropped: true });
    malformed.pages[0].words.find((word) => word.content === '101').content = badTid;
    assert.throws(() => extractRemovalAssignments(malformed), /Could not read/);
  }
  const orphan = screenPhotoResult({ cropped: true });
  const tid = orphan.pages[0].words.find((word) => word.content === '101');
  tid.polygon = tid.polygon.map((value, index) => index % 2 ? value + 12 : value);
  assert.throws(() => extractRemovalAssignments(orphan), /do not align/);
  const ambiguous = screenPhotoResult({ cropped: true });
  ambiguous.pages[0].words.push(...screenPhotoResult({ cropped: true }).pages[0].words.map((word) => ({
    ...word, polygon: word.polygon.map((value, index) => index % 2 ? value : value + 1000),
  })));
  assert.throws(() => extractRemovalAssignments(ambiguous), /More than one possible/);
});

test('partial photo updates never clear unseen TIDs or create duplicate train assignments', () => {
  const state = { rows: {
    west: [{ tid: '101', trainId: '42', timing: '09:05', remark: 'old' }, { tid: '102', trainId: '09', timing: '09:10', remark: 'keep' }],
    east: [{ tid: '201', trainId: '13', timing: '09:15' }],
  } };
  const rows = [{ trainId: '19', tid: '101' }], options = { partial: true };
  const next = applyRemovalImageAssignments(state, rows, options);
  assert.equal(next.rows.west[0].trainId, '19');
  assert.equal(next.rows.west[0].timing, '09:05');
  assert.equal(next.rows.west[0].remark, '');
  assert.equal(next.rows.west[1], state.rows.west[1]);
  assert.equal(next.rows.east[0], state.rows.east[0]);
  assert.equal(summarizeRemovalScan([...state.rows.west, ...state.rows.east], rows, options).cleared, 0);
  const withOutsideTid = applyRemovalImageAssignments(state, [...rows, { trainId: '09', tid: '302' }], options);
  assert.equal(withOutsideTid.rows.west[1], state.rows.west[1]);
  assert.throws(() => applyRemovalImageAssignments(state, [{ trainId: '09', tid: '101' }], options), /outside this cropped photo/);
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
  const create = (supportsPartial = false) => request({ method: 'POST', body: { target: { supportsPartial, period: '7pm', timetable: 'Weekday', rows: [{ tid: '226', trainId: '42' }, { tid: '101', trainId: '34' }] } } });
  const image = () => { const form = new FormData(); form.append('image', new Blob(['photo'], { type: 'image/png' }), 'screen.png'); return form; };
  return { db, request, create, image, expire: () => { time += 16 * 60 * 1000; } };
}

test('paired phone reads, reviews, confirms and computer acknowledges a one-use scan', async () => {
  const f = setup();
  try {
    const session = await f.create();
    const phone = { id: session.id, token: session.token, email: '' };
    assert.equal((await f.request({ ...phone })).status, 'waiting');
    const read = await f.request({ ...phone, method: 'POST', body: f.image() });
    assert.equal(read.extraction.assignedCount, 20);
    assert.equal(read.status, 'review');
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: false } })).success, false);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: true } })).status, 'ready');
    assert.equal((await f.request({ ...phone, method: 'POST', body: f.image() })).success, false);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'apply' } })).success, false);
    assert.equal((await f.request({ id: session.id, method: 'PATCH', body: { action: 'apply' } })).status, 'applied');
    const receipt = await f.request(phone);
    assert.equal(receipt.status, 'applied');
    assert.equal(receipt.target, undefined);
    assert.equal(receipt.extraction, undefined);
    assert.equal((await f.request({ ...phone, method: 'POST', body: f.image() })).status, 410);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: true } })).status, 410);
  } finally { f.db.close(); }
});

test('cropped scans require an updated computer and explicit partial-photo review', async () => {
  const f = setup(async () => screenPhotoResult({ cropped: true }));
  try {
    const oldSession = await f.create();
    const oldRead = await f.request({ id: oldSession.id, method: 'POST', body: f.image() });
    assert.equal(oldRead.status, 409);
    assert.match(oldRead.error, /refresh Removal summary/);
    assert.equal((await f.request({ id: oldSession.id })).extraction, null);
    const session = await f.create(true);
    const phone = { id: session.id, token: session.token, email: '' };
    const read = await f.request({ ...phone, method: 'POST', body: f.image() });
    assert.equal(read.status, 'review');
    assert.equal(read.extraction.partial, true);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: true } })).status, 409);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: true, partial: true } })).status, 'ready');
    assert.equal((await f.request({ id: session.id })).extraction.partial, true);
  } finally { f.db.close(); }
});

test('blocks unauthenticated, cross-origin, wrong-token and expired requests', async () => {
  const f = setup();
  try {
    assert.equal((await f.request({ email: '' })).status, 401);
    assert.equal((await f.request({ method: 'POST', origin: 'https://other.example', body: {} })).status, 403);
    const session = await f.create();
    assert.equal((await f.request({ id: session.id, email: 'other@example.test', token: 'a'.repeat(64) })).status, 403);
    assert.equal((await f.request({ id: session.id, email: '', token: 'a'.repeat(64) })).status, 403);
    assert.equal((await f.request({ id: session.id, email: '' })).status, 401);
    assert.equal((await f.request({ id: session.id, email: '', token: session.token, method: 'POST', body: f.image(), origin: 'https://other.example' })).status, 403);
    f.expire();
    assert.equal((await f.request({ id: session.id })).status, 410);
    assert.equal((await f.request({ id: session.id, email: '', token: session.token })).status, 410);
  } finally { f.db.close(); }
});

test('QR possession cannot create, cancel or apply a scan, or read another session', async () => {
  const f = setup();
  try {
    const session = await f.create(), other = await f.create();
    const phone = { id: session.id, token: session.token, email: '' };
    assert.equal((await f.request({ ...phone, id: '', method: 'POST', body: { target: {} } })).status, 401);
    assert.equal((await f.request({ ...phone, method: 'DELETE' })).status, 403);
    assert.equal((await f.request({ ...phone, method: 'PATCH', body: { action: 'apply' } })).success, false);
    assert.equal((await f.request({ ...phone, id: other.id })).status, 403);
    await f.request({ id: session.id, method: 'DELETE' });
    assert.equal((await f.request(phone)).status, 410);
    assert.equal((await f.request({ ...phone, method: 'POST', body: f.image() })).status, 410);
  } finally { f.db.close(); }
});

test('anonymous QR phone passes the real middleware for upload and review while creation remains authenticated', async () => {
  const db = memoryD1();
  const env = { AUTH_MODE: 'custom_pin', DB: db, AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.example', AZURE_DOCUMENT_INTELLIGENCE_KEY: 'test' };
  const middleware = createAuthMiddleware({
    authorizeCustom: async ({ request }) => request.headers.get('Cookie') === 'test-owner=1'
      ? { authorized: true, email: 'owner@example.test' }
      : { authorized: false, reason: 'missing_session', status: 401 },
  });
  const handler = createRemovalScanHandler({ readImage: async () => trackingTableResult() });
  const request = async ({ method = 'GET', id = '', token = '', cookie = '', body, path = '/api/removal-scan', origin = 'https://rail.example' } = {}) => {
    const context = { env, data: {}, request: new Request(`https://rail.example${path}${id ? `?id=${id}` : ''}`, {
      method, headers: { Origin: origin, Cookie: cookie, 'X-Removal-Scan-Token': token },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    }) };
    context.next = () => path === '/api/removal-scan' ? handler(context) : new Response('private operational data');
    const response = await middleware(context);
    return { code: response.status, ...await response.json().catch(() => ({})) };
  };
  try {
    const target = { period: '7pm', timetable: 'Weekday', rows: [{ tid: '226', trainId: '42' }] };
    assert.equal((await request({ method: 'POST', body: { target } })).code, 401);
    const session = await request({ method: 'POST', cookie: 'test-owner=1', body: { target } });
    assert.equal(session.code, 200);
    const phone = { id: session.id, token: session.token };
    assert.equal((await request(phone)).status, 'waiting');
    const form = new FormData(); form.append('image', new Blob(['photo'], { type: 'image/png' }), 'screen.png');
    assert.equal((await request({ ...phone, method: 'POST', body: form })).status, 'review');
    assert.equal((await request({ ...phone, method: 'PATCH', body: { action: 'confirm', reviewed: true } })).status, 'ready');
    assert.equal((await request({ ...phone, method: 'PATCH', body: { action: 'apply' } })).success, false);
    assert.equal((await request({ ...phone, method: 'DELETE' })).code, 401);
    for (const path of ['/', '/api/entities/TrainRem', '/api/auth/presence', '/assets/main.js', '/api/maintenance-image']) {
      assert.equal((await request({ ...phone, path })).code, 401, path);
    }
    assert.equal((await request({ ...phone, method: 'PATCH', origin: 'https://evil.example', body: { action: 'confirm', reviewed: true } })).code, 403);
    assert.equal((await request({ id: session.id, cookie: 'test-owner=1', method: 'PATCH', body: { action: 'apply' } })).status, 'applied');
    const receipt = await request(phone);
    assert.equal(receipt.status, 'applied');
    assert.equal(receipt.extraction, undefined);
    assert.equal(receipt.target, undefined);
  } finally { db.close(); }
});

test('anonymous image uploads are size-bounded even without Content-Length', async () => {
  const f = setup();
  try {
    const session = await f.create();
    const form = new FormData(); form.append('image', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'huge.png');
    assert.equal((await f.request({ id: session.id, token: session.token, email: '', method: 'POST', body: form })).status, 413);
    assert.equal((await f.request({ id: session.id })).status, 'waiting');
    assert.equal((await f.request({ id: session.id, token: session.token, email: '', method: 'POST', body: { image: 'not multipart' } })).status, 400);
    assert.equal((await f.request({ id: session.id, token: session.token, email: '', method: 'PATCH', body: { action: 'confirm', reviewed: true, padding: 'x'.repeat(24001) } })).status, 413);
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
