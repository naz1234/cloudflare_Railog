import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLatestTrainMovementSaveQueue,
  selectTrainMovementExcelLiveRecord,
  shouldApplyTrainMovementRemoteSnapshot,
  upsertTrainMovementLiveRecord,
} from "../src/lib/trainMovementLiveSync.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const indexCssSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("rapid movement edits are serialized and the latest complete row wins", async () => {
  const firstSave = createDeferred();
  const writes = [];
  let activeWrites = 0;
  let maxActiveWrites = 0;

  const queue = createLatestTrainMovementSaveQueue(async (snapshot) => {
    activeWrites += 1;
    maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
    writes.push(snapshot);
    if (writes.length === 1) await firstSave.promise;
    activeWrites -= 1;
  });

  queue.enqueue({ revision: 1, rows: [{ trainId: "25" }] });
  queue.enqueue({ revision: 2, rows: [{ trainId: "25", tid: "111" }] });
  queue.enqueue({
    revision: 3,
    rows: [{ trainId: "25", tid: "111", reason: "RST PM / CM", replacedBy: "30", time: "18:30" }],
  });

  assert.equal(writes.length, 1);
  firstSave.resolve();
  await queue.whenIdle();

  assert.equal(maxActiveWrites, 1);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].revision, 3);
  assert.deepEqual(writes[1].rows[0], {
    trainId: "25",
    tid: "111",
    reason: "RST PM / CM",
    replacedBy: "30",
    time: "18:30",
  });
});

test("a failed older save does not discard the latest queued edit", async () => {
  const writes = [];
  const queue = createLatestTrainMovementSaveQueue(async (snapshot) => {
    writes.push(snapshot.revision);
    if (snapshot.revision === 1) throw new Error("temporary failure");
  });

  queue.enqueue({ revision: 1 });
  queue.enqueue({ revision: 2 });
  await queue.whenIdle();

  assert.deepEqual(writes, [1, 2]);
  assert.equal(queue.getLastError(), null);
});

test("remote movement snapshots cannot replace an edit made during polling", () => {
  assert.equal(shouldApplyTrainMovementRemoteSnapshot({
    now: 10_000,
    pollRevision: 7,
    currentRevision: 8,
    incomingUpdatedMs: 9_900,
  }), false);
});

test("remote movement snapshots wait for queued, active, focused, or dirty local work", () => {
  const base = {
    now: 10_000,
    pollRevision: 8,
    currentRevision: 8,
    incomingUpdatedMs: 11_000,
  };

  assert.equal(shouldApplyTrainMovementRemoteSnapshot({ ...base, isSaveBusy: true }), false);
  assert.equal(shouldApplyTrainMovementRemoteSnapshot({ ...base, isInputFocused: true }), false);
  assert.equal(shouldApplyTrainMovementRemoteSnapshot({ ...base, hasUnsavedLocalEdits: true }), false);
  assert.equal(shouldApplyTrainMovementRemoteSnapshot(base), true);
});

test("even a remote snapshot one millisecond older than local input is rejected", () => {
  assert.equal(shouldApplyTrainMovementRemoteSnapshot({
    now: 10_000,
    pollRevision: 4,
    currentRevision: 4,
    localUpdatedMs: 9_500,
    incomingUpdatedMs: 9_499,
  }), false);
});

test("an equal remote timestamp cannot replace the locally saved snapshot", () => {
  assert.equal(shouldApplyTrainMovementRemoteSnapshot({
    now: 10_000,
    pollRevision: 4,
    currentRevision: 4,
    localUpdatedMs: 9_500,
    incomingUpdatedMs: 9_500,
  }), false);
});

test("dirty recovery updates the existing live record instead of creating a duplicate", async () => {
  const calls = [];
  const entity = {
    async list() {
      calls.push(["list"]);
      return [{ id: "existing", recordKey: "main", updated_date: "2026-07-29T08:00:00.000Z" }];
    },
    async update(id, payload) {
      calls.push(["update", id, payload]);
      return { id, ...payload, updated_date: "2026-07-29T08:05:00.000Z" };
    },
    async create(payload) {
      calls.push(["create", payload]);
      return { id: "duplicate", ...payload };
    },
  };
  const payload = { recordKey: "main", rows: [{ trainId: "25" }], logRows: [] };

  const result = await upsertTrainMovementLiveRecord({ entity, payload });

  assert.equal(result.recordId, "existing");
  assert.equal(result.created, false);
  assert.deepEqual(calls.map(([method]) => method), ["list", "update"]);
  assert.equal(calls[1][1], "existing");
  assert.deepEqual(calls[1][2], payload);
});

test("a stale cached record id recovers through the newest live record", async () => {
  const calls = [];
  const entity = {
    async list() {
      calls.push(["list"]);
      return [{ id: "replacement", recordKey: "main", updated_date: "2026-07-29T09:00:00.000Z" }];
    },
    async update(id, payload) {
      calls.push(["update", id, payload]);
      if (id === "deleted") {
        const error = new Error("Record not found");
        error.status = 404;
        throw error;
      }
      return { id, ...payload, updated_date: "2026-07-29T09:05:00.000Z" };
    },
    async create(payload) {
      calls.push(["create", payload]);
      return { id: "unexpected", ...payload };
    },
  };

  const result = await upsertTrainMovementLiveRecord({
    entity,
    recordId: "deleted",
    payload: { recordKey: "main", rows: [{ trainId: "30" }], logRows: [] },
  });

  assert.equal(result.recordId, "replacement");
  assert.deepEqual(calls.map(([method, id]) => [method, id]), [
    ["update", "deleted"],
    ["list", undefined],
    ["update", "replacement"],
  ]);
});

test("the newest server record wins when duplicate main records already exist", () => {
  const selected = selectTrainMovementExcelLiveRecord([
    { id: "old", recordKey: "main", updated_date: "2026-07-29T07:00:00.000Z" },
    { id: "new", recordKey: "main", updatedAt: "2099-01-01T00:00:00.000Z", updated_date: "2026-07-29T09:00:00.000Z" },
  ]);

  assert.equal(selected.id, "new");
});

test("the movement editor captures poll revisions and routes autosaves through the queue", () => {
  const refreshStart = depotStablingSource.indexOf("const refreshTrainMovementExcelLiveFromDb");
  const pollRevisionCapture = depotStablingSource.indexOf(
    "const pollRevision = trainMovementExcelLocalRevisionRef.current",
    refreshStart,
  );
  const remoteListAwait = depotStablingSource.indexOf("await entity.list()", pollRevisionCapture);

  assert.ok(refreshStart >= 0, "expected the movement refresh callback");
  assert.ok(pollRevisionCapture > refreshStart, "expected revision capture inside refresh");
  assert.ok(remoteListAwait > pollRevisionCapture, "revision must be captured before the remote request");
  assert.match(depotStablingSource, /getTrainMovementExcelSaveQueue\(\)\.enqueue\(\{ payload, revision \}\)/);
  assert.match(depotStablingSource, /upsertTrainMovementLiveRecord\(\{/);
  assert.match(depotStablingSource, /onFocusCapture=.*trainMovementExcelInputFocusedRef\.current = true/s);
});


test("the movement time refresh button fills the selected row with the current browser time", () => {
  assert.match(
    depotStablingSource,
    /const setRowCurrentTime = \(id\) => \{[\s\S]*?const currentTime = formatTime\(new Date\(\)\);[\s\S]*?updateRow\(id, "time", currentTime\);/,
  );
  assert.match(depotStablingSource, /onClick=\{\(\) => setRowCurrentTime\(row\.id\)\}/);
  assert.match(depotStablingSource, /aria-label="Set this row time to the current time"/);
  assert.match(depotStablingSource, /theme-movement-time-refresh[\s\S]*?bg-emerald-500\/20/);
});


test("the current-time refresh icon matches the swapping animation rhythm", () => {
  assert.match(indexCssSource, /@keyframes movement-time-refresh-spin/);
  assert.match(
    indexCssSource,
    /\.theme-movement-time-refresh svg[\s\S]*?animation: movement-time-refresh-spin 2\.8s ease-in-out infinite;/,
  );
  assert.match(indexCssSource, /rotate\(360deg\)/);
  assert.match(indexCssSource, /prefers-reduced-motion: reduce[\s\S]*?\.theme-movement-time-refresh svg[\s\S]*?animation: none !important;/);
});
