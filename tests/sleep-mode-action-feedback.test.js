import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getSleepModeDepot, buildSleepModeGroupedText } from "../src/lib/sleepModeLog.js";
import { SLEEP_EXCEL_COPY_SHIFTS, buildSleepModeExcelClipboardText } from "../src/lib/sleepModeExcel.js";

const source = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/copyFeedbackSlate.css", import.meta.url), "utf8");
const stablingCss = readFileSync(new URL("../src/stablingSlate.css", import.meta.url), "utf8");
const hookSource = source.slice(source.indexOf("function useSleepLogActionFeedback"), source.indexOf("const DEPOT_LAYOUTS"));

function feedbackHarness() {
  let statuses = {};
  let updates = 0;
  let cleanup;
  let nextTimer = 0;
  const timers = new Map();
  const hook = new Function("useState", "useRef", "useEffect", "useCallback", "setTimeout", "clearTimeout", "console", `${hookSource}\nreturn useSleepLogActionFeedback;`)(
    () => [statuses, (update) => { statuses = update(statuses); updates += 1; }],
    (value) => ({ current: value }),
    (effect) => { cleanup = effect(); },
    (callback) => callback,
    (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    (id) => timers.delete(id),
    { error() {} },
  );
  return {
    ...hook(), timers,
    get statuses() { return statuses; },
    get updates() { return updates; },
    expire(id) { const timer = timers.get(id); timers.delete(id); timer.callback(); },
    unmount() { cleanup(); },
  };
}

test("SLP copy and clear stay pending until success and use separate depot/action keys", async () => {
  const harness = feedbackHarness();
  let finishCopy;
  const pendingCopy = harness.runActionWithFeedback("copy-west", () => new Promise((resolve) => { finishCopy = resolve; }), "copied");
  assert.equal(harness.statuses["copy-west"], "pending");
  assert.equal(harness.timers.size, 0);
  await harness.runActionWithFeedback("copy-east", async () => true, "copied");
  await harness.runActionWithFeedback("clear-east", async () => true, "cleared");
  assert.deepEqual(harness.statuses, { "copy-west": "pending", "copy-east": "copied", "clear-east": "cleared" });
  finishCopy(true);
  assert.equal(await pendingCopy, true);
  assert.equal(harness.statuses["copy-west"], "copied");
  const [firstTimer] = harness.timers.keys();
  assert.equal(harness.timers.get(firstTimer).delay, 2500);
  harness.expire(firstTimer);
  assert.equal(harness.statuses["copy-east"], "");
  assert.equal(harness.statuses["clear-east"], "cleared");
  assert.equal(harness.statuses["copy-west"], "copied");
});

test("clipboard rejection and cloud-save failure never show a success confirmation", async () => {
  const harness = feedbackHarness();
  assert.equal(await harness.runActionWithFeedback("copy-west", async () => { throw new Error("clipboard denied"); }, "copied"), false);
  assert.equal(harness.statuses["copy-west"], "failed");
  assert.equal(await harness.runActionWithFeedback("clear-west", async () => false, "cleared"), false);
  assert.equal(harness.statuses["clear-west"], "failed");
});

test("repeat actions restart the timer and late actions cannot overwrite newer feedback", async () => {
  const harness = feedbackHarness();
  await harness.runActionWithFeedback("copy-west", async () => true, "copied");
  const [oldTimer] = harness.timers.keys();
  let finishOlder;
  const older = harness.runActionWithFeedback("copy-west", () => new Promise((resolve) => { finishOlder = resolve; }), "copied");
  assert.equal(harness.timers.has(oldTimer), false);
  await harness.runActionWithFeedback("copy-west", async () => false, "copied");
  finishOlder(true);
  await older;
  assert.equal(harness.statuses["copy-west"], "failed");
  assert.equal(harness.timers.size, 1);
});

test("unmount cancels timers and prevents an unfinished action from updating state", async () => {
  const harness = feedbackHarness();
  await harness.runActionWithFeedback("copy-east", async () => true, "copied");
  let finish;
  const unfinished = harness.runActionWithFeedback("clear-west", () => new Promise((resolve) => { finish = resolve; }), "cleared");
  harness.unmount();
  assert.equal(harness.timers.size, 0);
  const previousUpdates = harness.updates;
  finish(true);
  await unfinished;
  assert.equal(harness.updates, previousUpdates);
});

function clearHandler({ confirmed = "", saving = false, logs, persist }) {
  const start = source.indexOf("const handleClearLogs = useCallback");
  const expression = source.slice(start, source.indexOf("const deleteLog", start));
  const harness = feedbackHarness();
  const confirmations = [];
  const handler = new Function("useCallback", "DEPOT_LAYOUTS", "confirmClearDepot", "saving", "logs", "logsByDepot", "persistLogs", "getSleepModeDepot", "setConfirmClearDepot", "window", "runActionWithFeedback", `${expression}\nreturn handleClearLogs;`)(
    (callback) => callback, { west: {}, east: {} }, confirmed, saving, logs,
    { west: logs.filter((entry) => getSleepModeDepot(entry.location) === "west"), east: logs.filter((entry) => getSleepModeDepot(entry.location) === "east") },
    persist, getSleepModeDepot, (value) => confirmations.push(value), { setTimeout() {} }, harness.runActionWithFeedback,
  );
  return { handler, harness, confirmations };
}

test("Clear All requires the existing second click and clears only the selected depot", async () => {
  const logs = [{ id: "w", location: "WD-ST14" }, { id: "e", location: "ED-ST02" }];
  const saves = [];
  const persist = async (rows) => { saves.push(rows); return true; };
  const first = clearHandler({ logs, persist });
  await first.handler("west");
  assert.deepEqual(first.confirmations, ["west"]);
  assert.equal(saves.length, 0);
  assert.deepEqual(first.harness.statuses, {});
  const confirmed = clearHandler({ logs, persist, confirmed: "west" });
  await confirmed.handler("west");
  assert.deepEqual(saves, [[logs[1]]]);
  assert.equal(confirmed.harness.statuses["clear-west"], "cleared");
  assert.deepEqual(confirmed.confirmations, [""]);
});

test("clear cannot run for an empty/invalid depot or while another save is pending", async () => {
  let saves = 0;
  const persist = async () => { saves += 1; return true; };
  const empty = clearHandler({ logs: [], persist, confirmed: "west" });
  await empty.handler("west");
  await empty.handler("unknown");
  const busy = clearHandler({ logs: [{ location: "WD-ST14" }], persist, confirmed: "west", saving: true });
  await busy.handler("west");
  assert.equal(saves, 0);
});

test("Copy All confirms the exact existing grouped text only after clipboard completion", async () => {
  const logs = [{ id: "w", time: "19:23", trainIds: ["29"], location: "WD-ST14", mode: "sleep" }];
  const writes = [];
  const harness = feedbackHarness();
  const start = source.indexOf("const copyLogs = useCallback");
  const expression = source.slice(start, source.indexOf("const downloadExcel", start));
  const handler = new Function("useCallback", "logsByDepot", "runActionWithFeedback", "navigator", "buildSleepModeGroupedText", `${expression}\nreturn copyLogs;`)(
    (callback) => callback, { west: logs, east: [] }, harness.runActionWithFeedback,
    { clipboard: { writeText: async (text) => writes.push(text) } }, buildSleepModeGroupedText,
  );
  await handler("west");
  await handler("east");
  assert.deepEqual(writes, [buildSleepModeGroupedText(logs)]);
  assert.deepEqual(harness.statuses, { "copy-west": "copied" });
});

test("both SLP buttons use accessible result labels and Clear remains green when empty/disabled", () => {
  assert.match(source, /copyStatus=\{actionStatuses\[`copy-\$\{depot\}`\]\}/);
  assert.match(source, /clearStatus=\{actionStatuses\[`clear-\$\{depot\}`\]\}/);
  assert.match(source, /data-copy-state=\{copyStatus \|\| "idle"\}/);
  assert.match(source, /data-action-state=\{clearStatus \|\| "idle"\}/);
  assert.match(source, /aria-live="polite"[^\n]*"Copied"[^\n]*"Copy failed"/);
  assert.match(source, /aria-live="polite"[^\n]*"Cleared"[^\n]*"Sync pending"/);
  assert.match(source, /disabled=\{!logs.length \|\| saving \|\| clearing\}/);
  const reference = stablingCss.match(/\.theme-stabling-action\.is-done \{([^}]+)\}/)[1];
  const clear = css.match(/\.slate-action-feedback\[data-action-state="cleared"\] \{([^}]+)\}/)[1];
  for (const property of ["background", "border-color", "color"]) {
    assert.ok(clear.includes(`${property}: ${reference.match(new RegExp(`(?:^|\\s)${property}: ([^;]+);`))[1]};`));
  }
  assert.match(clear, /opacity: 1 !important;/);
  assert.doesNotMatch(css.match(/[^\n]*\.slate-action-feedback\[data-action-state="cleared"\] \{/)[0], /:not\(:disabled\)/);
  assert.match(css, /\.theme-sleep-log-output,[\s\S]*?\.slate-copy-feedback\[data-copy-state="copied"\]/);
  assert.match(css, /\.theme-sleep-log-output :is\([\s\S]*?\) svg \* \{\s*color: #ffffff !important;\s*stroke: #ffffff !important;/);
  assert.match(source, /setSyncStatus\(`Live saved[^\n]+\);\s*return true;/);
  assert.match(source, /setSyncStatus\("Saved locally \\u00b7 cloud retry needed"\);\s*return false;/);
  assert.match(source, /return saveQueueRef.current;/);
});

function excelCopyHandler({ loaded = true, reject = false } = {}) {
  const logsByDepot = {
    west: [{ id: "w", time: "23:30", trainIds: ["01"], location: "WD-ST14", mode: "sleep" }],
    east: [{ id: "e", time: "07:30", trainIds: ["47"], location: "ED-ST02", mode: "wake" }],
  };
  const writes = [];
  const harness = feedbackHarness();
  const start = source.indexOf("const copyExcel = useCallback");
  const expression = source.slice(start, source.indexOf("const handleClearLogs", start));
  const handler = new Function("useCallback", "loaded", "DEPOT_LAYOUTS", "SLEEP_EXCEL_COPY_SHIFTS", "logsByDepot", "runActionWithFeedback", "navigator", "buildSleepModeExcelClipboardText", `${expression}\nreturn copyExcel;`)(
    (callback) => callback, loaded, { west: {}, east: {} }, SLEEP_EXCEL_COPY_SHIFTS, logsByDepot,
    harness.runActionWithFeedback, { clipboard: { writeText: async (text) => { if (reject) throw Error("clipboard denied"); writes.push(text); } } }, buildSleepModeExcelClipboardText,
  );
  return { handler, writes, harness, logsByDepot };
}

test("shift Excel copy uses the selected depot and shift with independent green success feedback", async () => {
  const { handler, writes, harness, logsByDepot } = excelCopyHandler();
  await handler("west", "night");
  await handler("east", "early");
  assert.deepEqual(writes, [buildSleepModeExcelClipboardText(logsByDepot.west, "night"), buildSleepModeExcelClipboardText(logsByDepot.east, "early")]);
  assert.deepEqual(harness.statuses, { "copy-excel-west-night": "copied", "copy-excel-east-early": "copied" });
  await handler("west", "late");
  assert.equal(writes[2].split("\n").length, 47, "an empty shift can clear stale values while retaining all train positions");
  assert.equal(harness.statuses["copy-excel-west-night"], "copied");
});

test("shift Excel copy rejects loading or invalid selections and never confirms clipboard failure", async () => {
  const notLoaded = excelCopyHandler({ loaded: false });
  await notLoaded.handler("west", "night");
  assert.equal(notLoaded.writes.length, 0);
  const invalid = excelCopyHandler();
  await invalid.handler("unknown", "night");
  await invalid.handler("west", "unknown");
  invalid.logsByDepot.east = [];
  await invalid.handler("east", "early");
  assert.equal(invalid.writes.length, 0);
  const failed = excelCopyHandler({ reject: true });
  await failed.handler("west", "night");
  assert.equal(failed.writes.length, 0);
  assert.equal(failed.harness.statuses["copy-excel-west-night"], "failed");
});
