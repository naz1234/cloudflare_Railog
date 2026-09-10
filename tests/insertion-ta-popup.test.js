import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { normalizeInsertionTaName, withoutInsertionTaSuffix } from "../src/lib/insertionTaName.js";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const output = readFileSync(new URL("../src/components/depot/InsertionLogOutput.jsx", import.meta.url), "utf8");
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const body = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = body; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}
function callback(name) {
  const start = page.indexOf(`const ${name} = useCallback(`);
  return page.slice(start, page.indexOf(");", page.indexOf("  }, [", start)) + 2);
}
function createApi(initialLog = []) {
  const state = { current: initialLog };
  const writes = {};
  const sandbox = {
    useCallback: (fn) => fn,
    pg2InsertionLogRef: state,
    markInsertionLiveLocalEdit: () => { writes.marked = true; },
    saveInsertionPg2Log: (log) => { writes.stored = JSON.stringify(log); },
    setPg2InsertionLog: (log) => { writes.rendered = log; },
    commitInsertionLiveSnapshot: (snapshot) => { writes.live = snapshot; },
    getDepotFromRoad: (road) => road.startsWith("WD") ? "west" : "east",
  };
  vm.createContext(sandbox);
  const helpers = ["normalizeTrainId", "padTrainId", "getInsertionLogTimeMinutes", "sortInsertionLogByTime", "cleanInsertionTaName", "getInsertionTaSuffix", "buildNormalInsertionEntryText", "buildSweepingInsertionEntryText"];
  vm.runInContext([
    ...helpers.map((name) => extractFunction(page, name)),
    callback("updateInsertionEntryTaNameInLog"),
    callback("handlePg2InsertionTaNameUpdate"),
    output.slice(output.indexOf("function formatSentenceList"), output.indexOf("async function copyText")),
    "globalThis.api = { updateInsertionEntryTaNameInLog, handlePg2InsertionTaNameUpdate, buildNormalInsertionCopyText, buildSweepAnd3K1CopyText };",
  ].join("\n"), sandbox);
  return { ...sandbox.api, state, writes };
}
const normal = (depot = "west") => ({
  key: `ins-${depot === "west" ? "WD" : "ED"}-ST15-0`, trainKey: "T19", tid: "101",
  time: "05:25", depot, road: depot === "west" ? "WD-ST15" : "ED-ST15", mainlineTrack: depot === "west" ? 1 : 2,
  text: `05:25 hrs – T19 (TID 101) inserted from ${depot === "west" ? "WD" : "ED"}-ST15 to mainline track ${depot === "west" ? 1 : 2}.`,
});

test("TA input keeps full names and normalizes whitespace without adding another sentence", () => {
  assert.equal(normalizeInsertionTaName("  Ali   bin\n Ahmad\t"), "Ali bin Ahmad");
  assert.equal(normalizeInsertionTaName("José O'Neil"), "José O'Neil");
  assert.equal(normalizeInsertionTaName(" \n\t "), "");
  assert.equal(normalizeInsertionTaName("A".repeat(60)).length, 40);
  assert.equal(withoutInsertionTaSuffix("Track 1. TA Ali onboard.", "Ali"), "Track 1.");
  assert.equal(withoutInsertionTaSuffix("Track 1. TA Ali onboard.", "Al"), "Track 1. TA Ali onboard.");
});

test("adding, replacing and removing a TA preserves every other entry field", () => {
  const api = createApi();
  const west = normal();
  const east = normal("east");
  let log = [west, east];
  for (const name of ["Ali", "Siti Aminah", ""]) {
    log = api.updateInsertionEntryTaNameInLog(log, west.key, name);
    const changed = log.find((entry) => entry.key === west.key);
    assert.equal(changed.text, west.text + (name ? ` TA ${name} onboard.` : ""));
    assert.equal(changed.taName, name);
    for (const field of Object.keys(west).filter((key) => key !== "text")) assert.equal(changed[field], west[field]);
    assert.equal(log.find((entry) => entry.key === east.key), east);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(api.updateInsertionEntryTaNameInLog(log, "deleted-entry", "Ali"))), JSON.parse(JSON.stringify(log)));
});

test("normal copy output includes TA exactly once and keeps depot headers and totals", () => {
  const api = createApi();
  for (const depot of ["west", "east"]) {
    const entry = normal(depot);
    const updated = api.updateInsertionEntryTaNameInLog([entry], entry.key, "Ali");
    const label = depot === "west" ? "West" : "East";
    assert.equal(api.buildNormalInsertionCopyText(updated, label),
      `Insertion from ${label} Depot to ${depot === "west" ? "3A1P1" : "3K1P2"} (TID 101–101).\nTotal of 1 train: T19.\n\n${entry.text} TA Ali onboard.`);
  }
});

test("Sweep and 3K1 retain their own timing, destination and copy wording", () => {
  const api = createApi();
  const sweep = { key: "sweep", depot: "west", isSweeping: true, trainKey: "T03", road: "WD-ST13", time: "04:20", clearTime: "04:22", signal: "S101", sweepTrack: "TK1" };
  const threeK1 = { ...normal("east"), key: "3k1", tid: "", remark: "3K1", trainKey: "T32" };
  const sw = api.updateInsertionEntryTaNameInLog([sweep], "sweep", "Ali");
  const special = api.updateInsertionEntryTaNameInLog([threeK1], "3k1", "Siti");
  assert.equal(sw[0].text, "04:20 hrs – T03 sweeping started from WD-ST13 to signal S101 at 45 kph. Track confirmed clear at 04:22 hrs. TA Ali onboard.");
  assert.equal(sw[0].clearTime, "04:22");
  assert.match(api.buildSweepAnd3K1CopyText(sw, [], "West"), /to S101:\n\n04:20 hrs/);
  assert.equal(api.buildSweepAnd3K1CopyText([], special, "East"), "Insertion from East Depot for 3K1 Insertion:\n\n05:25 hrs – T32 inserted from ED-ST15 to mainline track 2 for 3K1 insertion. TA Siti onboard.");
});

test("the active PG2 handler persists the same result to local storage, React state and live sync", () => {
  const entry = normal();
  const api = createApi([entry]);
  api.handlePg2InsertionTaNameUpdate(entry.key, "Ali");
  assert.equal(api.writes.marked, true);
  assert.equal(api.state.current[0].text, `${entry.text} TA Ali onboard.`);
  assert.equal(api.writes.rendered, api.state.current);
  assert.equal(api.writes.live.pg2InsertionLog, api.state.current);
  assert.equal(JSON.parse(api.writes.stored)[0].taName, "Ali");
  api.handlePg2InsertionTaNameUpdate(entry.key, "");
  assert.equal(JSON.parse(api.writes.stored)[0].text, entry.text);
});
