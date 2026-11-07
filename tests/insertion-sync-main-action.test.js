import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyInsertionChanges, INSERTION_ROADS, normalizeInsertionSharedState } from '../shared/insertion-sync.js';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const prefix = '  const handleRefreshEditableStablingFromMain = ';
const start = source.indexOf(prefix), end = source.indexOf('\n  }, [', start);
assert.ok(start > 0 && end > start);
const callback = source.slice(start + prefix.length, end) + '\n  }, []);';
const ref = (current) => ({ current });
const empty = () => normalizeInsertionSharedState({});

function harness({ confirm = true, fail = false, pendingMain = false, gate = null } = {}) {
  const original = applyInsertionChanges(empty(), {
    'pg2Stabling.westData.WD-ST15.0': { trainId: '01', extraRemark: 'West note' },
    'pg2Stabling.eastData.ED-ST02.0': { trainId: '02', extraRemark: 'East note' },
    'pg2TidInputs.WD-ST15-0': '101', 'pg2TidInputs.ED-ST02-0': '201',
    'pg2InsertionLog.ins-WD-ST15-0': { key: 'ins-WD-ST15-0', depot: 'west', road: 'WD-ST15', trainKey: 'T1' },
    'pg2InsertionLog.ins-ED-ST02-0': { key: 'ins-ED-ST02-0', depot: 'east', road: 'ED-ST02', trainKey: 'T2' },
  });
  const fresh = applyInsertionChanges(empty(), {
    'pg2Stabling.westData.WD-ST15.0': { trainId: '07', extraRemark: 'Fresh West' },
    'pg2Stabling.eastData.ED-ST02.0': { trainId: '17', extraRemark: 'Fresh East' },
  }).pg2Stabling;
  const events = { reads: 0, commits: [], confirms: [], remembered: [], statuses: { west: null, east: null } };
  const env = {
    useCallback: (fn) => fn, normalizeDepotKey: (depot) => depot === 'east' ? 'east' : 'west',
    insertionMainSyncBusyRef: ref({ west: false, east: false }), pendingSaveRef: ref(pendingMain), isSavingRef: ref(false),
    stablingLocalUpdatedAtRef: ref(0), stablingRemoteUpdatedAtRef: ref(0),
    WEST_ROADS: INSERTION_ROADS.west, EAST_ROADS: INSERTION_ROADS.east,
    pg2StablingRef: ref(structuredClone(original.pg2Stabling)),
    pg2InsertionLogRef: ref(structuredClone(original.pg2InsertionLog)), pg2TidInputsRef: ref(structuredClone(original.pg2TidInputs)),
    westDataRef: ref(empty().pg2Stabling.westData), eastDataRef: ref(empty().pg2Stabling.eastData),
    base44: { entities: { DepotStabling: { async list() { events.reads++; if (gate) await gate; if (fail) throw new Error('Offline loading Main'); return [{ id: 'fresh-main' }]; } } } },
    buildStablingStateFromRecords: () => ({ newWest: fresh.westData, newEast: fresh.eastData }), getStablingRecordsUpdatedMs: () => 100,
    insertionStablingTrainPositionsMatch: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    cloneInsertionStablingState: (westData, eastData) => structuredClone({ westData, eastData }),
    normalizeStablingDepotData: (data) => structuredClone(data), getDepotFromRoad: (road) => road.startsWith('ED') ? 'east' : 'west',
    markInsertionLiveLocalEdit() {}, rememberInsertionEditableDepot(depot) { events.remembered.push(depot); },
    commitInsertionLiveSnapshot(state) { events.commits.push(structuredClone(state)); },
    window: { confirm(message) { events.confirms.push(message); return confirm; } },
    setInsertionMainSyncStatus(updater) { events.statuses = updater(events.statuses); },
  };
  env.getInsertionEditableDepotSnapshot = (depot) => ({
    stabling: env.pg2StablingRef.current[`${depot}Data`],
    insertionLog: env.pg2InsertionLogRef.current.filter((entry) => entry.depot === depot),
    tidInputs: Object.fromEntries(Object.entries(env.pg2TidInputsRef.current).filter(([key]) => key.startsWith(depot === 'east' ? 'ED' : 'WD'))),
  });
  for (const name of ['setWestData', 'setEastData', 'setPg2Stabling', 'setPg2InsertionLog', 'setPg2TidInputs']) env[name] = () => {};
  const action = new Function(...Object.keys(env), `return ${callback}`)(...Object.values(env));
  return { action, env, events, original, fresh };
}

for (const depot of ['west', 'east']) test(`actual ${depot} Sync action fetches fresh Main, confirms clearing and changes only that INS depot`, async () => {
  const h = harness(), other = depot === 'west' ? 'east' : 'west';
  await h.action(depot);
  assert.equal(h.events.reads, 1);
  assert.equal(h.events.commits.length, 1);
  const saved = h.events.commits[0];
  assert.deepEqual(saved.pg2Stabling[`${depot}Data`], h.fresh[`${depot}Data`]);
  assert.deepEqual(saved.pg2Stabling[`${other}Data`], h.original.pg2Stabling[`${other}Data`]);
  assert.equal(Object.keys(saved.pg2TidInputs).length, 1);
  assert.ok(Object.keys(saved.pg2TidInputs)[0].startsWith(other === 'east' ? 'ED-' : 'WD-'));
  assert.equal(saved.pg2InsertionLog.length, 1);
  assert.equal(saved.pg2InsertionLog[0].depot, other);
  assert.equal(h.events.confirms.length, 1);
  assert.match(h.events.confirms[0], /clears its insertion entries and TID inputs/);
  assert.equal(h.env.insertionMainSyncBusyRef.current[depot], false);
  assert.equal(h.events.statuses[depot], null); // Save acknowledgement belongs to the protected controller, not the click.
});

test('cancelling Sync does not reset a layout, TID, log or undo history', async () => {
  const h = harness({ confirm: false }); await h.action('east');
  assert.equal(h.events.commits.length, 0);
  assert.equal(h.events.remembered.length, 0);
  assert.deepEqual(h.env.pg2StablingRef.current, h.original.pg2Stabling);
  assert.deepEqual(h.env.pg2TidInputsRef.current, h.original.pg2TidInputs);
  assert.deepEqual(h.env.pg2InsertionLogRef.current, h.original.pg2InsertionLog);
});

test('failed/latest-unconfirmed Main reads show Failed without clearing any insertion work', async () => {
  for (const options of [{ fail: true }, { pendingMain: true }]) {
    const h = harness(options); await h.action('west');
    assert.equal(h.events.commits.length, 0);
    assert.deepEqual(h.env.pg2TidInputsRef.current, h.original.pg2TidInputs);
    assert.equal(h.events.statuses.west.phase, 'failed');
    assert.equal(h.events.statuses.west.retryLabel, 'Retry sync');
    assert.equal(h.events.statuses.east, null);
  }
});

test('repeated clicks during Main loading cause only one fetch and one clearing action', async () => {
  let resolve; const gate = new Promise((yes) => { resolve = yes; });
  const h = harness({ gate }); const first = h.action('east'); await h.action('east');
  assert.equal(h.events.reads, 1); assert.equal(h.events.commits.length, 0);
  resolve(); await first;
  assert.equal(h.events.commits.length, 1);
});

test('other-depot edits made while Main is loading are retained in the resulting snapshot', async () => {
  let resolve; const gate = new Promise((yes) => { resolve = yes; });
  const h = harness({ gate }); const syncing = h.action('east');
  h.env.pg2TidInputsRef.current['WD-ST15-1'] = '102';
  resolve(); await syncing;
  assert.equal(h.events.commits[0].pg2TidInputs['WD-ST15-1'], '102');
});
