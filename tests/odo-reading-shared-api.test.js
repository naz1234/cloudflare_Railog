import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/odo-reading.js";
import { createAuthMiddleware } from "../functions/_middleware.js";
import { memoryD1 } from "./helpers/memory-d1.js";
import { emptyOdoState, validateOdoChanges } from "../shared/odo-reading.js";

const origin = "https://railog.example.com";
const cmmsReport = { fileName: "handover.pdf", reportTimestamp: "26 October 26, 16:00 hrs.", operationCount: 43,
  maintenanceCount: 4, totalCount: 47, maintenanceTrainsets: ["T03", "T09", "T15", "T21"] };

async function call(db, body, options = {}) {
  const request = new Request(`${origin}/api/odo-reading`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  return onRequest({ request, env: { DB: db } });
}

test("reading an uninitialized ODO page returns all 47 trains without inserting blank cloud data", async () => {
  const db = memoryD1();
  try {
    const response = await call(db);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
    assert.deepEqual(await response.json(), { revision: 0, updatedAt: null, state: emptyOdoState() });
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM odo_reading_state").first()).count, 0);
  } finally { db.close(); }
});

test("shared ODO preserves mileage, workshop selections and parsed CMMS output across requests", async () => {
  const db = memoryD1();
  try {
    const saved = await call(db, { revision: 0, changes: { "mileages.TS01": "276072", "workshops.TS03": true, cmmsReport } });
    assert.equal(saved.status, 200);
    const output = await saved.json();
    assert.equal(output.revision, 1);
    const loaded = await (await call(db)).json();
    assert.deepEqual(loaded, output);
    assert.equal(loaded.state.mileages.TS01, "276072");
    assert.equal(loaded.state.workshops.TS03, true);
    assert.deepEqual(loaded.state.cmmsReport, cmmsReport);
  } finally { db.close(); }
});

test("stale laptop writes return a conflict snapshot without replacing newer data", async () => {
  const db = memoryD1();
  try {
    await call(db, { revision: 0, changes: { "mileages.TS01": "123456" } });
    const conflict = await call(db, { revision: 0, changes: { "mileages.TS02": "234567" } });
    assert.equal(conflict.status, 409);
    const { snapshot } = await conflict.json();
    assert.equal(snapshot.state.mileages.TS01, "123456");
    assert.equal(snapshot.state.mileages.TS02, "");
    const rebased = await call(db, { revision: snapshot.revision, changes: { "mileages.TS02": "234567" } });
    assert.equal(rebased.status, 200);
    const { state } = await rebased.json();
    assert.equal(state.mileages.TS01, "123456");
    assert.equal(state.mileages.TS02, "234567");
  } finally { db.close(); }
});

test("concurrent first saves create one singleton and cannot both commit revision one", async () => {
  const db = memoryD1();
  try {
    const responses = await Promise.all([
      call(db, { revision: 0, changes: { "mileages.TS01": "111111" } }),
      call(db, { revision: 0, changes: { "mileages.TS02": "222222" } }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM odo_reading_state").first()).count, 1);
  } finally { db.close(); }
});

test("ODO clear values and CMMS null are explicit shared changes", async () => {
  const db = memoryD1();
  try {
    await call(db, { revision: 0, changes: { "mileages.TS01": "111111", "workshops.TS03": true, cmmsReport } });
    const response = await call(db, { revision: 1, changes: { "mileages.TS01": "", "workshops.TS03": false } });
    const { state } = await response.json();
    assert.equal(state.mileages.TS01, "");
    assert.equal(state.workshops.TS03, false);
    assert.deepEqual(state.cmmsReport, cmmsReport);
    const cleared = await call(db, { revision: 2, changes: { cmmsReport: null } });
    assert.equal((await cleared.json()).state.cmmsReport, null);
  } finally { db.close(); }
});

test("concurrent updates of an existing record use atomic revision checks", async () => {
  const db = memoryD1();
  try {
    await call(db, { revision: 0, changes: { cmmsReport } });
    const responses = await Promise.all([
      call(db, { revision: 1, changes: { "mileages.TS01": "111111" } }),
      call(db, { revision: 1, changes: { "mileages.TS02": "222222" } }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await (await call(db)).json()).revision, 2);
  } finally { db.close(); }
});

test("ODO changes reject malformed records, unknown fields and out-of-range trains", async () => {
  const db = memoryD1();
  try {
    for (const changes of [{}, { "mileages.TS48": "123" }, { "mileages.TS01": "1234567" }, { "mileages.TS01": 123 },
      { "workshops.TS01": "true" }, { "__proto__.x": true }, { cmmsReport: { ...cmmsReport, operationCount: 48 } },
      { cmmsReport: { ...cmmsReport, maintenanceTrainsets: ["T03", "T03", "T15", "T21"] } }]) {
      const response = await call(db, { revision: 0, changes });
      assert.equal(response.status, 400, JSON.stringify(changes));
    }
    for (const revision of [-1, 1.5, "0", null]) {
      assert.equal((await call(db, { revision, changes: { "mileages.TS01": "1" } })).status, 400);
    }
    assert.throws(() => validateOdoChanges({ cmmsReport: [] }));
  } finally { db.close(); }
});

test("ODO endpoint denies cross-origin writes and is not a public authentication route", async () => {
  const db = memoryD1();
  try {
    const denied = await call(db, { revision: 0, changes: { "mileages.TS01": "1" } }, { headers: { Origin: "https://attacker.example" } });
    assert.equal(denied.status, 403);
    let reached = false;
    const middleware = createAuthMiddleware({ resolveMode: () => "custom_pin", authorizeCustom: async () => ({ authorized: false, status: 401 }) });
    const response = await middleware({ request: new Request(`${origin}/api/odo-reading`), env: {}, data: {}, next: async () => { reached = true; return call(db); } });
    assert.equal(response.status, 401);
    assert.equal(reached, false);
  } finally { db.close(); }
});

test("unavailable ODO storage reports a retryable error without pretending to save", async () => {
  const response = await onRequest({ request: new Request(`${origin}/api/odo-reading`), env: {} });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /unavailable/);
});
