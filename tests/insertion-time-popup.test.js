import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { defaultSweepEndTime, getInsertionLogTiming, normalizeInsertionLogTime, previewInsertionLogTiming } from "../src/lib/insertionLogTiming.js";
import { normalizeInsertionTaName, withoutInsertionTaSuffix } from "../src/lib/insertionTaName.js";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const output = readFileSync(new URL("../src/components/depot/InsertionLogOutput.jsx", import.meta.url), "utf8");
function extractFunction(name) {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  let depth = 0;
  for (let index = page.indexOf(") {", start) + 2; index < page.length; index++) {
    if (page[index] === "{") depth++;
    if (page[index] === "}" && --depth === 0) return page.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}
function callback(name) {
  const start = page.indexOf(`const ${name} = useCallback(`);
  assert.ok(start >= 0, `Missing callback ${name}`);
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
  const helpers = ["normalizeTrainId", "padTrainId", "parseHHMM", "addMinutesToHHMM", "getSweepingClearTime", "getSweepingSignal", "cleanMovementCustomTimeInput", "getInsertionLogTimeMinutes", "sortInsertionLogByTime", "cleanInsertionTaName", "getInsertionTaSuffix", "buildNormalInsertionEntryText", "buildSweepingInsertionEntryText"];
  vm.runInContext([
    page.match(/const EAST_ROADS = .*;/)[0],
    ...helpers.map(extractFunction),
    ...["updateInsertionEntryTimeInLog", "updateSweepEntryInLog", "updateInsertionEntryTaNameInLog", "handlePg2InsertionTimeUpdate", "handlePg2SweepUpdate", "handlePg2InsertionTaNameUpdate"].map(callback),
    output.slice(output.indexOf("function formatSentenceList"), output.indexOf("async function copyText")),
    "globalThis.api = { updateInsertionEntryTimeInLog, updateSweepEntryInLog, handlePg2InsertionTimeUpdate, handlePg2SweepUpdate, handlePg2InsertionTaNameUpdate, buildNormalInsertionCopyText, buildSweepAnd3K1CopyText };",
  ].join("\n"), sandbox);
  return { ...sandbox.api, state, writes };
}
const normal = (depot = "west") => ({
  key: `ins-${depot === "west" ? "WD-ST15" : "ED-ST03"}-0`, trainKey: "T19", tid: "101", taName: "Ali",
  time: "05:25", depot, road: depot === "west" ? "WD-ST15" : "ED-ST03", mainlineTrack: depot === "west" ? 1 : 2,
  text: `05:25 hrs – T19 (TID 101) inserted from ${depot === "west" ? "WD-ST15" : "ED-ST03"} to mainline track ${depot === "west" ? 1 : 2}. TA Ali onboard.`,
});
const sweeping = () => ({ key: "ins-WD-ST13-0", trainKey: "T03", depot: "west", road: "WD-ST13", isSweeping: true, sweepTrack: "TK1", signal: "S101", time: "04:20", clearTime: "04:22", taName: "Zain" });

test("time input accepts 24-hour formats and rejects invalid or incomplete values without clamping", () => {
  for (const value of ["05:25", "5:25", "0525", "525", " 0525 "]) assert.equal(normalizeInsertionLogTime(value), "05:25");
  assert.equal(normalizeInsertionLogTime("0000"), "00:00");
  assert.equal(normalizeInsertionLogTime("2359"), "23:59");
  for (const value of ["", "05:", "5:2", "05", "24:00", "23:60", "2500", "-1:00", "12:345", "noon", "05:25 am"]) assert.equal(normalizeInsertionLogTime(value), "", value);
});

test("Sweep default end time wraps midnight and fallback timing preserves legacy log text", () => {
  assert.equal(defaultSweepEndTime("04:20"), "04:22");
  assert.equal(defaultSweepEndTime("23:59"), "00:01");
  assert.equal(defaultSweepEndTime("99:99"), "");
  const text = "23:59 hrs – T03 sweeping started from WD-ST13 to signal S101 at 45 kph. Track confirmed clear at 00:01 hrs. TA Zain onboard.";
  assert.deepEqual(getInsertionLogTiming({}, text), { time: "23:59", clearTime: "00:01" });
  assert.equal(previewInsertionLogTiming(text, "04:30", "04:35"), "04:30 hrs – T03 sweeping started from WD-ST13 to signal S101 at 45 kph. Track confirmed clear at 04:35 hrs. TA Zain onboard.");
});

test("normal timing updates preserve TA names, train details and other entries in both depots", () => {
  const api = createApi();
  for (const depot of ["west", "east"]) {
    const entry = normal(depot);
    const other = { ...normal(), key: "other", trainKey: "T18", tid: "102", time: "05:28" };
    const log = api.updateInsertionEntryTimeInLog([entry, other], entry.key, "05:30");
    const changed = log.find((item) => item.key === entry.key);
    assert.equal(changed.time, "05:30");
    assert.equal(changed.timeEdited, true);
    assert.equal(changed.text, entry.text.replace("05:25", "05:30"));
    for (const field of ["key", "trainKey", "tid", "road", "mainlineTrack", "depot", "taName"]) assert.equal(changed[field], entry[field]);
    assert.equal(log[0], other);
    assert.match(api.buildNormalInsertionCopyText(log, depot === "west" ? "West" : "East"), /\(TID 101–102\)/);
    assert.match(api.buildNormalInsertionCopyText([changed], depot === "west" ? "West" : "East"), /05:30 hrs.*TA Ali onboard\.$/);
  }
});

test("3K1 copy output retains its destination and TA suffix after editing time", () => {
  const api = createApi();
  const entry = { ...normal("east"), tid: "", remark: "3K1", trainKey: "T32" };
  const log = api.updateInsertionEntryTimeInLog([entry], entry.key, "04:40");
  assert.equal(api.buildSweepAnd3K1CopyText([], log, "East"), "Insertion from East Depot for 3K1 Insertion:\n\n04:40 hrs – T32 inserted from ED-ST03 to mainline track 2 for 3K1 insertion. TA Ali onboard.");
});

test("Sweep updates preserve explicit end times and support midnight", () => {
  const api = createApi();
  const entry = sweeping();
  const log = api.updateSweepEntryInLog([entry], entry.key, { time: "23:59", clearTime: "00:05" });
  assert.equal(log[0].time, "23:59");
  assert.equal(log[0].clearTime, "00:05");
  assert.equal(log[0].taName, "Zain");
  assert.equal(log[0].text, "23:59 hrs – T03 sweeping started from WD-ST13 to signal S101 at 45 kph. Track confirmed clear at 00:05 hrs. TA Zain onboard.");
  const defaultEnd = api.updateSweepEntryInLog([entry], entry.key, { time: "23:59" });
  assert.equal(defaultEnd[0].clearTime, "00:01");
});

test("normal and Sweep handlers persist the same timing to storage, rendered state and live sync", () => {
  for (const entry of [normal(), sweeping()]) {
    const api = createApi([entry]);
    if (entry.isSweeping) api.handlePg2SweepUpdate(entry.key, { time: "04:30", clearTime: "04:34" });
    else api.handlePg2InsertionTimeUpdate(entry.key, "04:30");
    assert.equal(api.writes.marked, true);
    assert.equal(api.state.current[0].time, "04:30");
    assert.equal(api.writes.rendered, api.state.current);
    assert.equal(api.writes.live.pg2InsertionLog, api.state.current);
    assert.equal(JSON.parse(api.writes.stored)[0].taName, entry.taName);
  }
});

test("TA names normalize whitespace and are removed from the sentence only once for the editable chip", () => {
  assert.equal(normalizeInsertionTaName("  Ali   bin\n Ahmad  "), "Ali bin Ahmad");
  assert.equal(normalizeInsertionTaName(" \t "), "");
  assert.equal(normalizeInsertionTaName("A".repeat(50)).length, 40);
  const text = "05:30 hrs – T19 inserted to mainline track 1. TA Ali onboard.";
  assert.equal(withoutInsertionTaSuffix(text, "Ali"), "05:30 hrs – T19 inserted to mainline track 1.");
  assert.equal(withoutInsertionTaSuffix(text, "Al"), text);
});

test("editing TA names and timing in either order preserves both values and persists the combined log", () => {
  for (const entry of [normal(), sweeping(), { ...normal("east"), tid: "", remark: "3K1" }]) {
    const api = createApi([entry]);
    api.handlePg2InsertionTaNameUpdate(entry.key, "Siti");
    if (entry.isSweeping) api.handlePg2SweepUpdate(entry.key, { time: "04:30", clearTime: "04:35" });
    else api.handlePg2InsertionTimeUpdate(entry.key, "04:30");
    api.handlePg2InsertionTaNameUpdate(entry.key, "Ali bin Ahmad");
    const saved = JSON.parse(api.writes.stored)[0];
    assert.equal(saved.time, "04:30");
    assert.equal(saved.taName, "Ali bin Ahmad");
    assert.match(saved.text, /^04:30 hrs.*TA Ali bin Ahmad onboard\.$/);
    if (entry.isSweeping) assert.equal(saved.clearTime, "04:35");
    else assert.equal(saved.timeEdited, true);
    assert.equal(api.writes.live.pg2InsertionLog, api.writes.rendered);
    const copied = entry.isSweeping
      ? api.buildSweepAnd3K1CopyText(api.state.current, [], "West")
      : entry.remark === "3K1"
        ? api.buildSweepAnd3K1CopyText([], api.state.current, "East")
        : api.buildNormalInsertionCopyText(api.state.current, "West");
    assert.match(copied, /04:30 hrs.*TA Ali bin Ahmad onboard\.$/);
    assert.equal((copied.match(/TA Ali bin Ahmad onboard\./g) || []).length, 1);
    api.handlePg2InsertionTaNameUpdate(entry.key, "");
    const removed = JSON.parse(api.writes.stored)[0];
    assert.equal(removed.time, "04:30");
    assert.equal(removed.taName, "");
    assert.doesNotMatch(removed.text, /\bTA\b/);
    if (entry.isSweeping) assert.equal(removed.clearTime, "04:35");
  }
});
