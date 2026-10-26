import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createOdoSyncController, createOdoTransport, ODO_BACKUP_KEY, ODO_CACHE_KEY, ODO_LEGACY_KEY } from "../src/lib/odoReadingSync.js";
import { applyOdoChanges, emptyOdoState } from "../shared/odo-reading.js";
import { onRequest } from "../functions/api/odo-reading.js";
import { memoryD1 } from "./helpers/memory-d1.js";

const report = { fileName: "handover.pdf", reportTimestamp: "26 October 26, 16:00 hrs.", operationCount: 46, maintenanceCount: 1, totalCount: 47, maintenanceTrainsets: ["T03"] };
function storage(entries = []) {
  const data = new Map(entries);
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function createClient(transport, cache = storage()) {
  return createOdoSyncController({ transport, storage: cache, schedule: () => 1, cancel: () => {} });
}
function transportFor(db) {
  return createOdoTransport((url, options) => onRequest({
    request: new Request(`https://railog.example.com${url}`, { ...options, headers: { ...options.headers, Origin: "https://railog.example.com" } }), env: { DB: db },
  }));
}
function editMileage(client, train, value) {
  client.update((state) => ({ ...state, mileages: { ...state.mileages, [train]: value } }));
}

test("a new laptop loads existing ODO data and never posts its empty initial values", async () => {
  const state = applyOdoChanges(emptyOdoState(), { "mileages.TS01": "276072", "workshops.TS03": true, cmmsReport: report });
  let writes = 0;
  const client = createClient({ load: async () => ({ state, revision: 4 }), save: async () => { writes++; } });
  await client.refresh();
  await client.flush();
  assert.deepEqual(client.getView().state, state);
  assert.equal(client.getView().phase, "synced");
  assert.equal(writes, 0);
});

test("existing browser mileage and workshop data is backed up and imported only when the cloud is empty", async () => {
  const db = memoryD1();
  try {
    const legacy = { mileages: { TS01: "276072" }, workshops: { TS03: true } };
    const cache = storage([[ODO_LEGACY_KEY, JSON.stringify(legacy)]]);
    const first = createClient(transportFor(db), cache);
    assert.equal(JSON.parse(cache.getItem(ODO_BACKUP_KEY)).mileages.TS01, "276072");
    await first.refresh();
    await first.flush();
    const second = createClient(transportFor(db));
    await second.refresh();
    assert.equal(second.getView().state.mileages.TS01, "276072");
    assert.equal(second.getView().state.workshops.TS03, true);
  } finally { db.close(); }
});

test("stale legacy browser data cannot overwrite an existing cloud snapshot", async () => {
  const cache = storage([[ODO_LEGACY_KEY, JSON.stringify({ mileages: { TS01: "111111" } })]]);
  let writes = 0;
  const client = createClient({ load: async () => ({ state: applyOdoChanges(emptyOdoState(), { "mileages.TS01": "222222" }), revision: 2 }), save: async () => { writes++; } }, cache);
  await client.refresh();
  await client.flush();
  assert.equal(client.getView().state.mileages.TS01, "222222");
  assert.equal(JSON.parse(cache.getItem(ODO_BACKUP_KEY)).mileages.TS01, "111111");
  assert.equal(writes, 0);
});

test("concurrent laptops preserve different train edits using server conflict rebasing", async () => {
  const db = memoryD1();
  try {
    const west = createClient(transportFor(db));
    const east = createClient(transportFor(db));
    await Promise.all([west.refresh(), east.refresh()]);
    editMileage(west, "TS01", "111111");
    editMileage(east, "TS02", "222222");
    await Promise.all([west.flush(), east.flush()]);
    await Promise.all([west.refresh(), east.refresh()]);
    assert.equal(west.getView().state.mileages.TS01, "111111");
    assert.equal(west.getView().state.mileages.TS02, "222222");
    assert.deepEqual(west.getView().state, east.getView().state);
  } finally { db.close(); }
});

test("simultaneous legacy imports cannot replace the first laptop's cloud data", async () => {
  const db = memoryD1();
  try {
    const first = createClient(transportFor(db), storage([[ODO_LEGACY_KEY, JSON.stringify({ mileages: { TS01: "111111" } })]]));
    const second = createClient(transportFor(db), storage([[ODO_LEGACY_KEY, JSON.stringify({ mileages: { TS01: "999999" } })]]));
    await Promise.all([first.refresh(), second.refresh()]);
    await first.flush();
    editMileage(second, "TS02", "222222");
    await second.flush();
    assert.equal(second.getView().state.mileages.TS01, "111111");
    assert.equal(second.getView().state.mileages.TS02, "222222");
  } finally { db.close(); }
});

test("an edit made during the initial load is retained without dropping unrelated cloud data", async () => {
  const load = deferred();
  const client = createClient({ load: () => load.promise, save: async () => {} });
  const loading = client.refresh();
  editMileage(client, "TS01", "333333");
  load.resolve({ revision: 5, state: applyOdoChanges(emptyOdoState(), { "mileages.TS01": "111111", "mileages.TS02": "222222" }) });
  await loading;
  assert.equal(client.getView().state.mileages.TS01, "333333");
  assert.equal(client.getView().state.mileages.TS02, "222222");
});

test("rapid edits during an in-flight save are serialized and the latest edit is not acknowledged too soon", async () => {
  const first = deferred();
  const writes = [];
  let snapshot = { revision: 0, state: emptyOdoState() };
  const client = createClient({ load: async () => snapshot, save: async (revision, changes) => {
    writes.push(changes);
    if (writes.length === 1) await first.promise;
    snapshot = { revision: revision + 1, state: applyOdoChanges(snapshot.state, changes) };
    return snapshot;
  } });
  await client.refresh();
  editMileage(client, "TS01", "1");
  const saving = client.flush();
  editMileage(client, "TS01", "123456");
  first.resolve();
  await saving;
  assert.equal(writes.length, 2);
  assert.equal(writes[1]["mileages.TS01"], "123456");
  assert.equal(client.getView().state.mileages.TS01, "123456");
  assert.equal(client.getView().phase, "synced");
});

test("initial load failure cannot trigger a write, and migration survives closing and reopening the page", async () => {
  const cache = storage([[ODO_LEGACY_KEY, JSON.stringify({ mileages: { TS01: "111111" } })]]);
  let writes = 0;
  const failing = createClient({ load: async () => { throw new Error("Offline"); }, save: async () => { writes++; } }, cache);
  editMileage(failing, "TS02", "222222");
  await failing.flush();
  assert.equal(writes, 0);
  assert.equal(failing.getView().phase, "offline");
  const db = memoryD1();
  try {
    const reopened = createClient(transportFor(db), cache);
    await reopened.refresh();
    await reopened.flush();
    assert.equal(reopened.getView().state.mileages.TS01, "111111");
    assert.equal(reopened.getView().state.mileages.TS02, "222222");
  } finally { db.close(); }
});

test("a failed save retains pending edits in the browser and retries them after reopening", async () => {
  const cache = storage();
  const first = createClient({ load: async () => ({ revision: 0, state: emptyOdoState() }), save: async () => { throw new Error("Offline"); } }, cache);
  await first.refresh();
  editMileage(first, "TS01", "123456");
  await first.flush();
  assert.equal(first.getView().phase, "offline");
  assert.equal(JSON.parse(cache.getItem(ODO_CACHE_KEY)).pending["mileages.TS01"], "123456");
  const db = memoryD1();
  try {
    const reopened = createClient(transportFor(db), cache);
    await reopened.refresh();
    await reopened.flush();
    assert.equal(reopened.getView().phase, "synced");
    assert.equal(reopened.getView().state.mileages.TS01, "123456");
    assert.deepEqual(JSON.parse(cache.getItem(ODO_CACHE_KEY)).pending, {});
  } finally { db.close(); }
});

test("polling updates remote values but never replaces pending local input", async () => {
  let snapshot = { revision: 1, state: emptyOdoState() };
  const client = createClient({ load: async () => snapshot, save: async () => {} });
  await client.refresh();
  editMileage(client, "TS01", "123");
  snapshot = { revision: 2, state: applyOdoChanges(snapshot.state, { "mileages.TS01": "999999", "workshops.TS03": true, cmmsReport: report }) };
  await client.refresh();
  assert.equal(client.getView().state.mileages.TS01, "123");
  assert.equal(client.getView().state.workshops.TS03, true);
  assert.deepEqual(client.getView().state.cmmsReport, report);
});

test("explicit shared Clear All also clears trains added by another laptop after the last poll, while retaining CMMS", async () => {
  const db = memoryD1();
  try {
    const first = createClient(transportFor(db));
    const second = createClient(transportFor(db));
    await Promise.all([first.refresh(), second.refresh()]);
    second.update((state) => ({ ...state, cmmsReport: report, workshops: { ...state.workshops, TS03: true } }));
    editMileage(second, "TS47", "777777");
    await second.flush();
    first.clearReadings();
    await first.flush();
    await second.refresh();
    assert.equal(second.getView().state.mileages.TS47, "");
    assert.equal(second.getView().state.workshops.TS03, false);
    assert.deepEqual(second.getView().state.cmmsReport, report);
  } finally { db.close(); }
});

test("a malformed save response does not discard queued edits", async () => {
  const cache = storage();
  const client = createClient({ load: async () => ({ revision: 0, state: emptyOdoState() }), save: async () => ({ ok: true }) }, cache);
  await client.refresh();
  editMileage(client, "TS01", "123456");
  await client.flush();
  assert.equal(client.getView().phase, "offline");
  assert.equal(JSON.parse(cache.getItem(ODO_CACHE_KEY)).pending["mileages.TS01"], "123456");
});

test("incomplete successful and malformed conflict replies never acknowledge or discard pending input", async () => {
  for (const isConflict of [false, true]) {
    const cache = storage();
    const client = createClient({ load: async () => ({ revision: 0, state: emptyOdoState() }), save: async () => {
      if (!isConflict) return { revision: 1, state: {} };
      const error = new Error("Conflict");
      error.status = 409;
      error.snapshot = { revision: 1, state: {} };
      throw error;
    } }, cache);
    await client.refresh();
    editMileage(client, "TS01", "123456");
    await client.flush();
    assert.equal(client.getView().phase, "offline");
    assert.equal(JSON.parse(cache.getItem(ODO_CACHE_KEY)).pending["mileages.TS01"], "123456");
  }
});

test("a stalled network request times out so automatic retries are not blocked forever", async () => {
  const transport = createOdoTransport((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("Timed out")), { once: true });
  }), 10);
  await assert.rejects(transport.load(), /Timed out/);
});

test("blocked local storage does not prevent shared saving and reports missing browser backup honestly", async () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const client = createClient({ load: async () => ({ revision: 0, state: emptyOdoState() }), save: async () => { throw new Error("Offline"); } }, blocked);
  await client.refresh();
  editMileage(client, "TS01", "123456");
  await client.flush();
  assert.equal(client.getView().state.mileages.TS01, "123456");
  assert.equal(client.getView().backupAvailable, false);
});

test("the ODO component uses shared storage without changing protected access or clearing CMMS on failed uploads", () => {
  const source = readFileSync(new URL("../src/components/OdoReading.jsx", import.meta.url), "utf8");
  const hooks = readFileSync(new URL("../src/hooks/useOdoReadingSync.js", import.meta.url), "utf8");
  assert.match(source, /useOdoReadingSync\(\)/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /window.confirm\("Clear ODO mileages and the workshop list on all laptops/);
  assert.match(source, /shared.clearReadings\(\)/);
  assert.match(source, /workshopDraftDirtyRef.current/);
  assert.match(source, /setCmmsReport\(validateCmmsReport\(await parseCmmsHandoverPdf\(file\)\)\)/);
  assert.doesNotMatch(source, /setCmmsReport\(null\)|localStorage.setItem/);
  assert.match(hooks, /setInterval\(refresh, 15_000\)/);
  assert.match(hooks, /addEventListener\("online", retry\)/);
  assert.match(hooks, /addEventListener\("visibilitychange", refresh\)/);
});
