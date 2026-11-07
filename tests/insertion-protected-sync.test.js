import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { onRequest } from '../functions/api/insertion-live.js';
import { onRequest as legacyRequest } from '../functions/api/entities/[[path]].js';
import { applyInsertionChanges, diffInsertionState, normalizeInsertionSharedState, validateInsertionChanges } from '../shared/insertion-sync.js';
import { createInsertionSyncController, createInsertionTransport, INSERTION_SYNC_BACKUP, INSERTION_SYNC_CACHE } from '../src/lib/insertionLiveSync.js';
import { memoryD1 } from './helpers/memory-d1.js';

const empty = () => normalizeInsertionSharedState({});
const clone = (value) => structuredClone(value);
const storage = () => { const data = new Map(); return { get length() { return data.size; }, key: (index) => [...data.keys()][index] ?? null, getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }; };
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
function client(transport, cache = storage(), initialState = empty()) {
  const timers = new Map(); let id = 0;
  const sync = createInsertionSyncController({ transport, storage: cache, initialState, schedule(fn, delay) { timers.set(++id, { fn, delay }); return id; }, cancel(key) { timers.delete(key); } });
  return { sync, cache, timers, async retryTimer() { const [key, timer] = [...timers][0]; timers.delete(key); timer.fn(); await sync.flush(); } };
}
function transport(db) {
  return createInsertionTransport((url, options) => onRequest({ request: new Request(`https://railog.example${url}`, { ...options, headers: { ...options.headers, Origin: 'https://railog.example' } }), env: { DB: db } }));
}
async function seed(db, changes = {}) { const t = transport(db); return t.save(0, changes); }
const set = (sync, changes) => sync.update(applyInsertionChanges(sync.getView().state, changes));

test('protected INS API applies revision-checked patches and rejects a stale revision', async () => {
  const db = memoryD1();
  try {
    const t = transport(db), initial = await t.load();
    assert.equal(initial.revision, 0);
    const first = await t.save(0, { 'pg2TidInputs.ED-ST02-0': '201' });
    assert.equal(first.revision, 1);
    await assert.rejects(t.save(0, { 'pg2TidInputs.WD-ST15-0': '101' }), (error) => error.status === 409 && error.snapshot.revision === 1);
    assert.equal((await t.load()).state.pg2TidInputs['ED-ST02-0'], '201');
  } finally { db.close(); }
});

test('existing shared insertion records migrate without losing either depot or uploading stale browser data', async () => {
  const db = memoryD1();
  try {
    await transport(db).load();
    const legacy = applyInsertionChanges(empty(), { 'pg2TidInputs.ED-ST02-0': '201', 'pg2TidInputs.WD-ST15-0': '101' });
    db.prepare('INSERT INTO entity_records (id, entity, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('old', 'InsertionLive', JSON.stringify({ ...legacy, stateKey: 'insertion-live-main', updatedAt: '2026-11-07T01:00:00Z' }), '2026-11-07T01:00:00Z', '2026-11-07T01:00:00Z').run();
    const stale = applyInsertionChanges(empty(), { 'pg2TidInputs.ED-ST02-0': '999' });
    const c = client(transport(db), storage(), stale);
    await c.sync.refresh();
    assert.equal(c.sync.getView().state.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(c.sync.getView().state.pg2TidInputs['WD-ST15-0'], '101');
    assert.equal(c.sync.getView().pending, 0);
    assert.ok(c.cache.getItem(INSERTION_SYNC_BACKUP));
    set(c.sync, { 'pg2TidInputs.WD-ST15-1': '102' });
    await c.sync.flush();
    assert.equal((await transport(db).load()).state.pg2TidInputs['ED-ST02-0'], '201');
  } finally { db.close(); }
});

test('concurrent West and East clients preserve unrelated edits, including a stale laptop saving a West TID after East sync', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const west = client(transport(db)).sync, east = client(transport(db)).sync;
    await Promise.all([west.refresh(), east.refresh()]);
    set(east, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: '' } });
    set(west, { 'pg2TidInputs.WD-ST15-0': '101' });
    await Promise.all([east.flush(), west.flush()]);
    await Promise.all([east.refresh(), west.refresh()]);
    for (const c of [west, east]) {
      assert.equal(c.getView().state.pg2Stabling.eastData['ED-ST02'][0].trainId, '17');
      assert.equal(c.getView().state.pg2TidInputs['WD-ST15-0'], '101');
      assert.equal(c.getView().depots.west.phase, 'saved');
      assert.equal(c.getView().depots.east.phase, 'saved');
    }
  } finally { db.close(); }
});

test('same-cell conflicts stop for review instead of overwriting another session, while the other depot still saves', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const a = client(transport(db)).sync, b = client(transport(db)).sync;
    await Promise.all([a.refresh(), b.refresh()]);
    set(a, { 'pg2TidInputs.ED-ST02-0': '201' });
    set(b, { 'pg2TidInputs.ED-ST02-0': '202', 'pg2TidInputs.WD-ST15-0': '101' });
    await a.flush(); await b.flush();
    const shared = (await transport(db).load()).state;
    assert.equal(shared.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(shared.pg2TidInputs['WD-ST15-0'], '101');
    assert.equal(b.getView().state.pg2TidInputs['ED-ST02-0'], '202');
    assert.equal(b.getView().depots.east.phase, 'failed');
    assert.equal(b.getView().depots.east.conflict, true);
    assert.equal(b.getView().depots.west.phase, 'saved');
    await b.useShared('east');
    assert.equal(b.getView().state.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(b.getView().pending, 0);
  } finally { db.close(); }
});

test('a stale TID cannot attach to a different train moved into the same cell by another laptop', async () => {
  const db = memoryD1();
  try {
    await seed(db, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: '' } });
    const a = client(transport(db)).sync, b = client(transport(db)).sync;
    await Promise.all([a.refresh(), b.refresh()]);
    set(a, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '40', extraRemark: '' } });
    set(b, { 'pg2TidInputs.ED-ST02-0': '201' });
    await a.flush(); await b.flush();
    assert.equal(b.getView().depots.east.conflict, true);
    const shared = (await transport(db).load()).state;
    assert.equal(shared.pg2Stabling.eastData['ED-ST02'][0].trainId, '40');
    assert.equal(shared.pg2TidInputs['ED-ST02-0'], undefined);
  } finally { db.close(); }
});

test('a conflicted cell cannot save its train change while retaining an unseen conflicting TID', async () => {
  const db = memoryD1();
  try {
    await seed(db, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: '' } });
    const a = client(transport(db)).sync, b = client(transport(db)).sync;
    await Promise.all([a.refresh(), b.refresh()]);
    set(a, { 'pg2TidInputs.ED-ST02-0': '201' });
    set(b, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '40', extraRemark: '' } });
    await a.flush(); await b.flush();
    assert.equal(b.getView().depots.east.conflict, true);
    const shared = (await transport(db).load()).state;
    assert.equal(shared.pg2Stabling.eastData['ED-ST02'][0].trainId, '17');
    assert.equal(shared.pg2TidInputs['ED-ST02-0'], '201');
  } finally { db.close(); }
});

test('failed saves retain queued edits and retry automatically with per-depot Failed then Saved confirmation', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const t = transport(db); let offline = true;
    const c = client({ load: t.load, save: (...args) => { if (offline) throw new Error('Offline'); return t.save(...args); } });
    await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.WD-ST15-0': '101' });
    await c.sync.flush();
    assert.equal(c.sync.getView().depots.west.phase, 'failed');
    assert.equal(c.sync.getView().depots.east.phase, 'saved');
    assert.equal([...c.timers.values()][0].delay, 2000);
    assert.ok(Object.keys(JSON.parse(c.cache.getItem(INSERTION_SYNC_CACHE)).pending).length);
    offline = false; await c.retryTimer();
    assert.equal(c.sync.getView().depots.west.phase, 'saved');
    assert.equal(c.sync.getView().pending, 0);
    assert.equal((await t.load()).state.pg2TidInputs['WD-ST15-0'], '101');
  } finally { db.close(); }
});

test('queued edits resume after closing/reopening without replacing another depot snapshot', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const t = transport(db), cache = storage();
    const c = client({ load: t.load, save: async () => { throw new Error('Offline'); } }, cache);
    await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' }); await c.sync.flush(); c.sync.stop();
    await t.save((await t.load()).revision, { 'pg2TidInputs.WD-ST15-0': '101' });
    const reopened = client(t, cache);
    await reopened.sync.refresh(); await reopened.sync.flush();
    const shared = (await t.load()).state;
    assert.equal(shared.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(shared.pg2TidInputs['WD-ST15-0'], '101');
    assert.equal(reopened.sync.getView().pending, 0);
  } finally { db.close(); }
});

test('polling merges unrelated remote changes but never drops pending local input', async () => {
  let snapshot = { revision: 1, state: empty(), updatedAt: '2026-11-07' };
  const c = client({ load: async () => snapshot, save: async () => {} });
  await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.WD-ST15-0': '101' });
  snapshot = { revision: 2, state: applyInsertionChanges(snapshot.state, { 'pg2TidInputs.ED-ST02-0': '201' }), updatedAt: '2026-11-07' };
  await c.sync.refresh();
  assert.equal(c.sync.getView().state.pg2TidInputs['WD-ST15-0'], '101');
  assert.equal(c.sync.getView().state.pg2TidInputs['ED-ST02-0'], '201');
  assert.equal(c.sync.getView().pending, 1);
});

test('failed initial loading cannot post cached data, and prolonged failures retain the queue with capped retry delays', async () => {
  let writes = 0;
  const c = client({ load: async () => { throw new Error('Offline'); }, save: async () => { writes++; } });
  set(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' });
  await c.sync.flush();
  for (let i = 0; i < 7; i++) {
    assert.ok([...c.timers.values()][0].delay <= 30000);
    await c.retryTimer();
  }
  assert.equal(writes, 0);
  assert.equal(c.sync.getView().pending, 1);
  assert.equal(c.sync.getView().depots.east.phase, 'failed');
});

test('Use shared does not discard a pending edit if refreshing the shared version fails', async () => {
  let offline = false;
  const c = client({ load: async () => { if (offline) throw new Error('Offline'); return { revision: 1, state: empty(), updatedAt: '2026-11-07' }; }, save: async () => {} });
  await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' });
  offline = true; await c.sync.useShared('east');
  assert.equal(c.sync.getView().pending, 1);
  assert.equal(c.sync.getView().state.pg2TidInputs['ED-ST02-0'], '201');
  assert.equal(c.sync.getView().depots.east.phase, 'failed');
});

test('a truly empty cloud can import the current local layout once, without losing trains or TIDs', async () => {
  const db = memoryD1();
  try {
    const initial = applyInsertionChanges(empty(), { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: 'Note' }, 'pg2TidInputs.ED-ST02-0': '201' });
    const c = client(transport(db), storage(), initial);
    await c.sync.refresh(); await c.sync.flush();
    const saved = await transport(db).load();
    assert.equal(saved.state.pg2Stabling.eastData['ED-ST02'][0].trainId, '17');
    assert.equal(saved.state.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(c.sync.getView().pending, 0);
  } finally { db.close(); }
});

test('rapid edits during an in-flight save serialize and are not acknowledged before the newest value saves', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const t = transport(db), gate = deferred(); let writes = 0;
    const c = client({ load: t.load, async save(...args) { if (++writes === 1) await gate.promise; return t.save(...args); } });
    await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' });
    const saving = c.sync.flush();
    while (!writes) await new Promise((resolve) => setImmediate(resolve));
    set(c.sync, { 'pg2TidInputs.ED-ST02-0': '202' });
    gate.resolve(); await saving;
    assert.equal(writes, 2);
    assert.equal((await t.load()).state.pg2TidInputs['ED-ST02-0'], '202');
    assert.equal(c.sync.getView().depots.east.phase, 'saved');
  } finally { db.close(); }
});

test('one clean tab cannot erase another tab outbox before closing and reopening the browser page', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const cache = storage(), t = transport(db);
    const editing = client({ load: t.load, save: async () => { throw new Error('Offline'); } }, cache);
    const clean = client(t, cache);
    await Promise.all([editing.sync.refresh(), clean.sync.refresh()]);
    set(editing.sync, { 'pg2TidInputs.ED-ST02-0': '201' }); await editing.sync.flush();
    await clean.sync.refresh(); // Writes an empty display cache, but not the other tab's outbox.
    editing.sync.stop(); clean.sync.stop();
    const reopened = client(t, cache);
    await reopened.sync.refresh(); await reopened.sync.flush();
    assert.equal((await t.load()).state.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(reopened.sync.getView().pending, 0);
  } finally { db.close(); }
});

test('two offline tabs retain different-depot queues independently when reopened together', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const cache = storage(), t = transport(db), offline = { load: t.load, save: async () => { throw new Error('Offline'); } };
    const a = client(offline, cache), b = client(offline, cache);
    await Promise.all([a.sync.refresh(), b.sync.refresh()]);
    set(a.sync, { 'pg2TidInputs.ED-ST02-0': '201' });
    set(b.sync, { 'pg2TidInputs.WD-ST15-0': '101' });
    await Promise.all([a.sync.flush(), b.sync.flush()]);
    a.sync.stop(); b.sync.stop();
    const reopened = client(t, cache);
    await reopened.sync.refresh(); await reopened.sync.flush();
    const saved = (await t.load()).state;
    assert.equal(saved.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(saved.pg2TidInputs['WD-ST15-0'], '101');
  } finally { db.close(); }
});

test('a lost save reply is confirmed on retry without replaying the destructive Sync action', async () => {
  const db = memoryD1();
  try {
    await seed(db);
    const t = transport(db); let writes = 0;
    const c = client({ load: t.load, async save(...args) { writes++; await t.save(...args); throw new Error('Lost reply'); } });
    await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' }); await c.sync.flush();
    assert.equal(c.sync.getView().depots.east.phase, 'failed');
    await c.retryTimer();
    assert.equal(writes, 1);
    assert.equal(c.sync.getView().pending, 0);
    assert.equal(c.sync.getView().depots.east.phase, 'saved');
  } finally { db.close(); }
});

test('malformed replies never acknowledge pending input and denied saves do not retry in a loop', async () => {
  for (const status of [undefined, 401, 403]) {
    const c = client({ load: async () => ({ revision: 1, state: empty(), updatedAt: '2026-11-07' }), save: async () => {
      if (!status) return { revision: 2, state: {} };
      const error = new Error('Denied'); error.status = status; throw error;
    } });
    await c.sync.refresh(); set(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' }); await c.sync.flush();
    assert.equal(c.sync.getView().pending, 1);
    assert.equal(c.sync.getView().depots.east.phase, 'failed');
    if (status) assert.equal(c.timers.size, 0);
  }
});

test('old unversioned tabs cannot overwrite or delete protected insertion state', async () => {
  for (const [method, path] of [['PUT', ['InsertionLive', 'old']], ['PATCH', ['InsertionLive', 'old']], ['DELETE', ['InsertionLive', 'old']], ['POST', ['InsertionLive']], ['POST', ['InsertionLive', 'bulkCreate']]]) {
    const result = await legacyRequest({ request: new Request('https://railog.example/api/entities/' + path.join('/'), { method, ...(method !== 'DELETE' ? { body: '{}' } : {}) }), env: { DB: {} }, params: { path } });
    assert.equal(result.status, 409);
    assert.equal((await result.json()).code, 'INSERTION_REFRESH_REQUIRED');
  }
});

test('protected sync rejects unsupported/prototype changes, cross-site requests and unavailable storage', async () => {
  for (const changes of [{ '__proto__.x': 'x' }, { 'pg2Stabling.westData.ED-ST02.0': { trainId: '17', extraRemark: '' } }, { 'pg2TidInputs.ED-ST02-9': '201' }, { 'pg2TidInputs.ED-ST02-0': {} }]) assert.throws(() => validateInsertionChanges(changes));
  const result = await onRequest({ request: new Request('https://railog.example/api/insertion-live', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }), env: { DB: {} } });
  assert.equal(result.status, 403);
  assert.equal((await onRequest({ request: new Request('https://railog.example/api/insertion-live'), env: {} })).status, 503);
});

test('stalled requests time out so the durable retry queue cannot remain stuck saving forever', async () => {
  const t = createInsertionTransport((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timed out')))), 5);
  await assert.rejects(t.load(), /Timed out/);
});

test('both depot status pills visibly distinguish Saved, Saving and Failed with retry and conflict review controls', () => {
  const source = readFileSync(new URL('../src/components/depot/InsertionSaveStatus.jsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source.replace('export default function', 'function') + '\nreturn InsertionSaveStatus;', { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
  const Status = new Function('React', compiled)(React);
  for (const depot of ['west', 'east']) for (const [phase, label] of [['saved', 'Saved'], ['saving', 'Saving…'], ['failed', 'Failed']]) {
    const html = renderToStaticMarkup(React.createElement(Status, { depot, status: { phase, error: phase === 'failed' ? 'Offline; input kept' : '', conflict: phase === 'failed' } }));
    assert.ok(html.includes(label)); assert.match(html, /role="status" aria-live="polite"/);
    assert.ok(html.includes(`data-insertion-save-depot="${depot}"`));
    if (phase === 'failed') { assert.match(html, /Retry save/); assert.match(html, /Use shared/); assert.match(html, /Offline; input kept/); }
  }
});

test('both actual INS depot configurations expose status/retry and require confirmation before discarding conflicts', () => {
  const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  assert.match(page, /saveStatus: insertionMainSyncStatus\[normalizedDepot\] \|\| insertionSaveStatus\[normalizedDepot\]/);
  assert.match(page, /onRetrySave:[\s\S]*?insertionSyncController\.flush\(\)/);
  assert.match(page, /window\.confirm\("Discard unsaved [\s\S]*?insertionSyncController\.useShared\(normalizedDepot\)/);
  assert.match(page, /window\.addEventListener\('online', retry\)/);
  assert.match(page, /window\.addEventListener\('beforeunload', beforeUnload\)/);
  assert.match(page, /insertionSyncController\.stop\(\)/);
});
