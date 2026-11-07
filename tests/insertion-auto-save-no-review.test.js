import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { onRequest } from '../functions/api/insertion-live.js';
import { applyInsertionChanges, normalizeInsertionSharedState } from '../shared/insertion-sync.js';
import { createInsertionSyncController, createInsertionTransport, INSERTION_SYNC_CACHE, INSERTION_SYNC_OUTBOX, INSERTION_SYNC_SUPERSEDED } from '../src/lib/insertionLiveSync.js';
import { memoryD1 } from './helpers/memory-d1.js';

const empty = () => normalizeInsertionSharedState({});
function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function client(transport, cache = storage(), initialState = empty()) {
  const timers = new Map(); let id = 0;
  const sync = createInsertionSyncController({ transport, storage: cache, initialState,
    schedule(fn, delay) { timers.set(++id, { fn, delay }); return id; }, cancel(key) { timers.delete(key); } });
  return { sync, cache, timers };
}
function transport(db) {
  return createInsertionTransport((url, options) => onRequest({ request: new Request('https://railog.example' + url, { ...options, headers: { ...options.headers, Origin: 'https://railog.example' } }), env: { DB: db } }));
}
const edit = (sync, changes) => sync.update(applyInsertionChanges(sync.getView().state, changes));

test('both depots retry a real competing revision automatically without presenting a Failed or review state', async () => {
  for (const [depot, road, otherRoad] of [['west', 'WD-ST15', 'ED-ST02'], ['east', 'ED-ST02', 'WD-ST15']]) {
    const db = memoryD1();
    try {
      const t = transport(db); await t.save(0, {});
      let writes = 0;
      const c = client({ load: t.load, async save(revision, changes) {
        if (++writes === 1) await t.save(revision, { [`pg2TidInputs.${road}-0`]: '999', [`pg2TidInputs.${otherRoad}-1`]: 'keep-other' });
        return t.save(revision, changes);
      } });
      const phases = []; c.sync.subscribe(view => phases.push(view.depots[depot].phase));
      await c.sync.refresh(); edit(c.sync, { [`pg2TidInputs.${road}-0`]: '201' }); await c.sync.flush();
      assert.equal(writes, 2);
      assert.equal(c.sync.getView().depots[depot].phase, 'saved');
      assert.equal(c.sync.getView().depots[depot].error, '');
      assert.ok(!phases.includes('failed'));
      const saved = (await t.load()).state;
      assert.equal(saved.pg2TidInputs[`${road}-0`], '201');
      assert.equal(saved.pg2TidInputs[`${otherRoad}-1`], 'keep-other');
    } finally { db.close(); }
  }
});

test('sustained simultaneous updates remain queued/Saving and back off, then complete without user review', async () => {
  let snapshot = { revision: 1, state: empty(), updatedAt: '2026-11-07' }, busy = true, writes = 0;
  const c = client({ load: async () => snapshot, async save(revision, changes) {
    writes++;
    if (busy) {
      snapshot = { ...snapshot, revision: snapshot.revision + 1 };
      const error = new Error('Insertion changed on another session.'); error.status = 409; error.snapshot = snapshot; throw error;
    }
    snapshot = { ...snapshot, revision: revision + 1, state: applyInsertionChanges(snapshot.state, changes) }; return snapshot;
  } });
  await c.sync.refresh(); edit(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' }); await c.sync.flush();
  assert.equal(writes, 5);
  assert.equal(c.sync.getView().depots.east.phase, 'pending');
  assert.equal(c.sync.getView().depots.east.error, '');
  assert.equal(c.sync.getView().pending, 1);
  assert.ok(c.timers.size);
  busy = false; await c.sync.flush();
  assert.equal(c.sync.getView().depots.east.phase, 'saved');
  assert.equal(snapshot.state.pg2TidInputs['ED-ST02-0'], '201');
});

test('pending input previously marked for review resumes saving after upgrade, including its old outbox flags', async () => {
  const db = memoryD1();
  try {
    const t = transport(db); await t.save(0, {});
    const cache = storage(), first = client({ load: t.load, save: async () => { throw new Error('Offline'); } }, cache);
    await first.sync.refresh(); edit(first.sync, { 'pg2TidInputs.ED-ST02-0': '201' }); await first.sync.flush(); first.sync.stop();
    const savedCache = JSON.parse(cache.getItem(INSERTION_SYNC_CACHE));
    for (const entry of Object.values(savedCache.pending)) {
      entry.conflict = true; entry.localConflict = true;
      const journal = JSON.parse(cache.getItem(INSERTION_SYNC_OUTBOX + entry.id));
      journal.entry.conflict = true; journal.entry.localConflict = true;
      cache.setItem(INSERTION_SYNC_OUTBOX + entry.id, JSON.stringify(journal));
    }
    cache.setItem(INSERTION_SYNC_CACHE, JSON.stringify(savedCache));
    await t.save((await t.load()).revision, { 'pg2TidInputs.ED-ST02-0': '202' });
    const reopened = client(t, cache);
    await reopened.sync.refresh(); await reopened.sync.flush();
    assert.equal((await t.load()).state.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(reopened.sync.getView().pending, 0);
    assert.equal(reopened.sync.getView().depots.east.error, '');
  } finally { db.close(); }
});

test('automatic initial imports cannot overwrite a shared snapshot another laptop already initialized', async () => {
  const db = memoryD1();
  try {
    const t = transport(db);
    const initialA = applyInsertionChanges(empty(), { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: '' } });
    const initialB = applyInsertionChanges(empty(), { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '40', extraRemark: '' } });
    const a = client(t, storage(), initialA), b = client(t, storage(), initialB);
    await Promise.all([a.sync.refresh(), b.sync.refresh()]);
    await a.sync.flush();
    edit(b.sync, { 'pg2TidInputs.WD-ST15-0': '101' });
    await b.sync.flush();
    const saved = (await t.load()).state;
    assert.equal(saved.pg2Stabling.eastData['ED-ST02'][0].trainId, '17');
    assert.equal(saved.pg2TidInputs['WD-ST15-0'], '101');
    assert.equal(b.sync.getView().pending, 0);
  } finally { db.close(); }
});

test('an acknowledged operation left in a stale display cache is not replayed over a later successful save', async () => {
  const db = memoryD1();
  try {
    const t = transport(db); await t.save(0, {});
    const cache = storage(), c = client(t, cache);
    await c.sync.refresh(); edit(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' });
    const staleCache = cache.getItem(INSERTION_SYNC_CACHE);
    await c.sync.flush(); c.sync.stop();
    await t.save((await t.load()).revision, { 'pg2TidInputs.ED-ST02-0': '202' });
    cache.setItem(INSERTION_SYNC_CACHE, staleCache);
    const reopened = client(t, cache);
    await reopened.sync.refresh(); await reopened.sync.flush();
    assert.equal((await t.load()).state.pg2TidInputs['ED-ST02-0'], '202');
    assert.equal(reopened.sync.getView().state.pg2TidInputs['ED-ST02-0'], '202');
    assert.equal(reopened.sync.getView().pending, 0);
  } finally { db.close(); }
});

test('automatic backup keeps obsolete TID/log input recoverable without assigning it to the replacement train', async () => {
  const db = memoryD1();
  try {
    const t = transport(db); await t.save(0, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: '' } });
    const c = client(t);
    await c.sync.refresh();
    edit(c.sync, {
      'pg2TidInputs.ED-ST02-0': '201',
      'pg2InsertionLog.ins-ED-ST02-0': { key: 'ins-ED-ST02-0', trainKey: 'T17', depot: 'east', road: 'ED-ST02', text: 'T17 insertion log' },
    });
    await t.save((await t.load()).revision, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '40', extraRemark: '' } });
    await c.sync.flush();
    assert.equal(c.sync.getView().pending, 0);
    assert.equal(c.sync.getView().depots.east.phase, 'saved');
    assert.equal(c.sync.getView().retainedInputs.length, 2);
    for (const retained of c.sync.getView().retainedInputs) assert.ok(c.cache.getItem(INSERTION_SYNC_SUPERSEDED + retained.id));
    const shared = (await t.load()).state;
    assert.equal(shared.pg2TidInputs['ED-ST02-0'], undefined);
    assert.equal(shared.pg2InsertionLog.length, 0);
    assert.equal(shared.pg2Stabling.eastData['ED-ST02'][0].trainId, '40');
  } finally { db.close(); }
});

test('no-review sync preserves another session extra remark while the same train receives a new TID', async () => {
  const db = memoryD1();
  try {
    const t = transport(db); await t.save(0, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: '' } });
    const c = client(t); await c.sync.refresh(); edit(c.sync, { 'pg2TidInputs.ED-ST02-0': '201' });
    await t.save((await t.load()).revision, { 'pg2Stabling.eastData.ED-ST02.0': { trainId: 'T017', extraRemark: 'Keep newer note' } });
    await c.sync.flush();
    const shared = (await t.load()).state;
    assert.equal(shared.pg2TidInputs['ED-ST02-0'], '201');
    assert.equal(shared.pg2Stabling.eastData['ED-ST02'][0].extraRemark, 'Keep newer note');
    assert.equal(c.sync.getView().retainedInputs.length, 0);
  } finally { db.close(); }
});

test('review message and Use shared action are absent, while revision checks and real failure retries remain', () => {
  const source = readFileSync(new URL('../src/lib/insertionLiveSync.js', import.meta.url), 'utf8');
  const status = readFileSync(new URL('../src/components/depot/InsertionSaveStatus.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Changed in another session\. Your input is kept|review the shared version|entry\.localConflict|entry\.conflict/);
  assert.doesNotMatch(status, /Use shared|onUseShared|Review changes/);
  assert.match(source, /transport\.save\(remote\.revision/);
  assert.match(source, /Input kept; retrying automatically/);
});
