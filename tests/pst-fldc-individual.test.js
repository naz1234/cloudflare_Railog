import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as model from '../src/lib/pstFldcVerification.js';

const date = '2026-10-28';
const entries = (west = ['01', '02'], east = ['47']) => [
  ...west.map(trainKey => ({ type: 'PST', depot: 'west', trainKey, endTime: '03:06' })),
  ...east.map(trainKey => ({ type: 'PST', depot: 'east', trainKey, endTime: '03:07' })),
];
const verification = (depot, ids, by = 'DC') => model.createPstFldcVerification(depot, ids, { by, verified: true }, date);
const hookSource = readFileSync(new URL('../src/hooks/usePstFldcVerification.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');

function harness(initial = [], input = entries()) {
  const records = initial.map((value, i) => ({ id: String(i + 1), recordKey: model.getPstFldcRecordKey(value.depot, value.date), verification: value }));
  const writes = [];
  const slots = [];
  const events = new Map();
  let cursor = 0, dirty = false, effects = [], currentEntries = input, currentDay = date;
  let failSave = false, saveGate = null;
  const entity = {
    filter: async ({ recordKey }) => structuredClone(records.filter(row => row.recordKey === recordKey)),
    create: async payload => { if (saveGate) await saveGate; if (failSave) throw Error('Offline'); const record = { ...payload, id: String(records.length + 1) }; records.push(record); writes.push(structuredClone(payload)); return record; },
    update: async (id, payload) => { if (saveGate) await saveGate; if (failSave) throw Error('Offline'); const i = records.findIndex(row => row.id === id); records[i] = { ...records[i], ...payload }; writes.push(structuredClone(payload)); return records[i]; },
  };
  function useState(initialValue) {
    const i = cursor++;
    if (!slots[i]) slots[i] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
    return [slots[i].value, value => { const next = typeof value === 'function' ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }];
  }
  function useRef(initialValue) { const i = cursor++; if (!slots[i]) slots[i] = { current: initialValue }; return slots[i]; }
  function useEffect(fn, deps) {
    const i = cursor++;
    const old = slots[i];
    if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) {
      slots[i] = { deps, cleanup: old?.cleanup };
      effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    }
  }
  const args = { ...model, getPstFldcDate: () => currentDay, useState, useRef, useEffect, base44: { entities: { PSTTrainPrep: entity } },
    window: { addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) }, setInterval: () => 1, clearInterval: () => {} };
  const hook = new Function(...Object.keys(args), `${hookSource}\nreturn usePstFldcVerification;`)(...Object.values(args));
  let view;
  const render = () => {
    for (let i = 0; i < 30; i++) {
      dirty = false; cursor = 0; effects = [];
      view = hook(currentEntries);
      effects.forEach(fn => fn());
      if (!dirty) return view;
    }
    throw Error('Hook did not settle');
  };
  const settle = async () => { for (let i = 0; i < 12; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } return view; };
  render();
  return { render, settle, records, writes, view: () => view,
    setEntries: value => { currentEntries = value; render(); },
    setDay: value => { currentDay = value; events.get('focus')?.(); render(); },
    refresh: () => { events.get('focus')?.(); },
    fail: value => { failSave = value; }, gate: value => { saveGate = value; },
    stop: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}

test('partial verification keeps only selected eligible trains, never widens to new trains and does not mutate saved data', () => {
  const saved = verification('west', ['01', '02']);
  const before = JSON.stringify(saved);
  assert.deepEqual(model.getActivePstFldcVerification(saved, 'west', ['01', '03'], date).trainIds, ['01']);
  assert.equal(model.getActivePstFldcVerification(saved, 'east', ['01'], date), null);
  assert.equal(model.getActivePstFldcVerification(saved, 'west', ['01'], '2026-10-29'), null);
  assert.equal(JSON.stringify(saved), before);
});

test('generated log names only the checked trains, correct depot and verifier without inventing times', () => {
  const log = model.buildPstFldcChecklistLog(verification('east', ['47', '46'], 'EAST DC'));
  assert.match(log, /East Depot — FLDC Verification \(2026-10-28\)/);
  assert.match(log, /Verified via FLDC by: EAST DC/);
  assert.match(log, /T46 — PST verified via FLDC\./);
  assert.doesNotMatch(log, /T01|West Depot|\d{2}:\d{2}/);
  assert.equal(model.buildPstFldcChecklistLog(null), '');
});

test('one tick verifies only its train and unchecking clears its Excel fields', async () => {
  const h = harness(); await h.settle();
  h.view().updateDraft('west', { by: 'WEST DC' }); await h.settle();
  assert.equal(h.writes.length, 0, 'entering a name alone does not attest');
  h.view().toggleTrain('west', 'T01'); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), ['01']);
  assert.deepEqual(h.view().exportVerifications.west.trainIds, ['01']);
  assert.equal(h.view().isConfirmed('west'), false);
  const rows = [['header'], ['labels'], ['', '', 'TS#301', '', '', 'PASS', '', '03:06'], ['', '', 'TS#302', '', '', 'PASS', '', '03:06']];
  const result = model.appendPstFldcColumns(rows, h.view().exportVerifications, 'west', date);
  assert.deepEqual(result[2].slice(11), ['Yes', 'WEST DC']);
  assert.deepEqual(result[3].slice(11), ['', '']);
  h.view().toggleTrain('west', '01'); await h.settle();
  assert.equal(h.view().exportVerifications.west, null);
  assert.equal(model.buildPstFldcChecklistLog(h.view().exportVerifications.west), '');
  h.stop();
});

test('both depots tick, restore and clear independently while keeping verifier names', async () => {
  const h = harness([verification('west', ['01']), verification('east', ['47'], 'EAST DC')]); await h.settle();
  h.view().toggleTrain('west', '02'); await h.settle();
  assert.equal(h.view().isConfirmed('west'), true);
  h.view().clear('west'); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), []);
  assert.deepEqual(h.view().exportVerifications.east.trainIds, ['47']);
  assert.equal(h.view().drafts.west.by, 'DC');
  const reloaded = harness(h.records.map(row => row.verification)); await reloaded.settle();
  assert.deepEqual(reloaded.view().getSelectedTrainIds('west'), []);
  assert.deepEqual(reloaded.view().getSelectedTrainIds('east'), ['47']);
  reloaded.view().clear('east'); await reloaded.settle();
  assert.equal(reloaded.view().exportVerifications.east, null);
  h.stop(); reloaded.stop();
});

test('new PST trains stay unticked and withdrawn trains cannot regain an old tick', async () => {
  const h = harness([verification('west', ['01', '02'])]); await h.settle();
  h.setEntries(entries(['01', '02', '03'])); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), ['01', '02']);
  assert.equal(h.view().isConfirmed('west'), false);
  h.setEntries(entries(['01', '03'])); await h.settle();
  assert.deepEqual(h.records[0].verification.trainIds, ['01']);
  h.setEntries(entries(['01', '02', '03'])); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), ['01']);
  h.stop();
});

test('initially loading PST data does not clear saved verification', async () => {
  const h = harness([verification('west', ['01', '02'])], []); await h.settle();
  assert.equal(h.writes.length, 0);
  h.setEntries(entries()); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), ['01', '02']);
  h.stop();
});

test('save failure cannot export or be hidden by polling, and retry saves only the intended train', async () => {
  const h = harness(); await h.settle();
  h.view().updateDraft('west', { by: 'DC' }); await h.settle();
  h.fail(true); h.view().toggleTrain('west', '02'); await h.settle();
  assert.match(h.view().errors.west, /Unable to save/);
  assert.equal(h.view().exportVerifications.west, null);
  h.refresh(); await h.settle();
  assert.match(h.view().errors.west, /Unable to save/);
  h.fail(false); h.view().retry('west'); await h.settle();
  assert.deepEqual(h.view().exportVerifications.west.trainIds, ['02']);
  h.fail(true); h.view().clear('west'); await h.settle();
  assert.equal(h.view().exportVerifications.west, null);
  h.fail(false); h.view().retry('west'); await h.settle();
  assert.deepEqual(h.records[0].verification.trainIds, []);
  h.stop();
});

test('changing verifier revokes checks and failed pending ticks cannot be retried under another name', async () => {
  const h = harness([verification('west', ['01'])]); await h.settle();
  h.view().updateDraft('west', { by: 'NEW DC' }); await h.settle();
  assert.equal(h.view().exportVerifications.west, null);
  assert.deepEqual(h.view().getSelectedTrainIds('west'), []);
  h.fail(true); h.view().toggleTrain('west', '02'); await h.settle();
  h.view().updateDraft('west', { by: 'OTHER DC' }); await h.settle();
  h.fail(false); h.view().retry('west'); await h.settle();
  assert.equal(h.view().exportVerifications.west, null);
  assert.deepEqual(h.view().getSelectedTrainIds('west'), []);
  h.stop();
});

test('busy save blocks double clicks and invalid or ineligible train IDs never save', async () => {
  const h = harness(); await h.settle();
  h.view().toggleTrain('west', '01'); await h.settle();
  assert.equal(h.writes.length, 0, 'name is required');
  h.view().updateDraft('west', { by: 'DC' }); await h.settle();
  for (const id of ['00', '48', '999', 'TRAIN', '47']) h.view().toggleTrain('west', id);
  await h.settle(); assert.equal(h.writes.length, 0);
  let release;
  h.gate(new Promise(resolve => { release = resolve; }));
  h.view().toggleTrain('west', '01'); h.view().toggleTrain('west', '02'); await h.settle();
  assert.equal(h.view().exportVerifications.west, null);
  release(); await h.settle();
  assert.deepEqual(h.view().exportVerifications.west.trainIds, ['01']);
  h.stop();
});

test('Riyadh day rollover clears the checklist and never applies yesterday ticks to today', async () => {
  const h = harness([verification('west', ['01'])]); await h.settle();
  h.setDay('2026-10-29'); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), []);
  assert.equal(h.view().exportVerifications.west, null);
  assert.equal(h.view().drafts.west.by, '');
  h.stop();
});

test('a train removed and re-added during a pending save needs a fresh explicit tick', async () => {
  const h = harness([verification('west', ['01'])]); await h.settle();
  let release;
  h.gate(new Promise(resolve => { release = resolve; }));
  h.view().toggleTrain('west', '02'); await h.settle();
  h.setEntries(entries(['02'])); await h.settle();
  h.setEntries(entries(['01', '02'])); await h.settle();
  release(); await h.settle();
  assert.deepEqual(h.view().getSelectedTrainIds('west'), ['02']);
  assert.deepEqual(h.view().exportVerifications.west.trainIds, ['02']);
  h.view().toggleTrain('west', '01'); await h.settle();
  assert.deepEqual(h.view().exportVerifications.west.trainIds, ['01', '02']);
  h.stop();
});

test('editing only verifier whitespace does not revoke existing saved ticks', async () => {
  const h = harness([verification('west', ['01'])]); await h.settle();
  h.view().updateDraft('west', { by: ' DC ' }); await h.settle();
  assert.deepEqual(h.view().exportVerifications.west.trainIds, ['01']);
  assert.equal(h.writes.length, 0);
  h.stop();
});
