import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const extract = (name) => {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return page.slice(start, page.indexOf("\nfunction ", start + 1)).trim();
};
const clipboardSource = `async ${extract("copyTextToClipboard")}`;
const hookSource = extract("useClipboardCopyFeedback");

function mockDocument({ result = true, throws = false } = {}) {
  const record = { removed: false, focused: false, command: "", text: "" };
  return {
    record,
    activeElement: { focus: () => { record.focused = true; } },
    createElement: () => ({
      style: {},
      set value(value) { record.text = value; },
      setAttribute() {},
      select() {},
      remove() { record.removed = true; },
    }),
    body: { appendChild() {} },
    execCommand(command) {
      record.command = command;
      if (throws) throw new Error("copy denied");
      return result;
    },
  };
}

function clipboard(navigator, document) {
  return new Function("navigator", "document", `${clipboardSource}\nreturn copyTextToClipboard;`)(navigator, document);
}

function feedbackHook(copy) {
  let statuses = {};
  let stateUpdates = 0;
  let nextTimer = 0;
  let cleanup;
  const timers = new Map();
  const hook = new Function("useState", "useRef", "useEffect", "copyTextToClipboard", "setTimeout", "clearTimeout", `${hookSource}\nreturn useClipboardCopyFeedback;`)(
    () => [statuses, (update) => { statuses = update(statuses); stateUpdates += 1; }],
    (value) => ({ current: value }),
    (effect) => { cleanup = effect(); },
    copy,
    (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    (id) => { timers.delete(id); },
  );
  return {
    ...hook(),
    timers,
    get statuses() { return statuses; },
    get stateUpdates() { return stateUpdates; },
    unmount() { cleanup(); },
    expire(id) { const timer = timers.get(id); timers.delete(id); timer.callback(); },
  };
}

test("modern clipboard success returns true only after its write completes", async () => {
  const writes = [];
  const copy = clipboard({ clipboard: { writeText: async (text) => writes.push(text) } });
  assert.equal(await copy("sample trains"), true);
  assert.deepEqual(writes, ["sample trains"]);
  assert.equal(await copy(""), false);
  assert.equal(writes.length, 1);
});

test("denied clipboard access falls back to Copy and cleans up the temporary field", async () => {
  const document = mockDocument();
  const copy = clipboard({ clipboard: { writeText: async () => { throw new Error("denied"); } } }, document);
  assert.equal(await copy("West Depot sample"), true);
  assert.deepEqual(document.record, { removed: true, focused: true, command: "copy", text: "West Depot sample" });
});

test("unsupported, rejected and throwing copies never claim success or leave a field behind", async () => {
  assert.equal(await clipboard(undefined, undefined)("sample"), false);
  for (const options of [{ result: false }, { throws: true }]) {
    const document = mockDocument(options);
    assert.equal(await clipboard({}, document)("sample"), false);
    assert.equal(document.record.removed, true);
    assert.equal(document.record.focused, true);
  }
});

test("each successful copy button says Copied for 2.5 seconds independently", async () => {
  const hook = feedbackHook(async () => true);
  await hook.copyWithFeedback("West", "west");
  await hook.copyWithFeedback("East", "east");
  assert.deepEqual(hook.statuses, { west: "copied", east: "copied" });
  const [westTimer, eastTimer] = [...hook.timers.keys()];
  assert.equal(hook.timers.get(westTimer).delay, 2500);
  hook.expire(westTimer);
  assert.deepEqual(hook.statuses, { west: "", east: "copied" });
  hook.expire(eastTimer);
  assert.deepEqual(hook.statuses, { west: "", east: "" });
});

test("repeat clicks restart the feedback timer instead of being reset by the previous click", async () => {
  const hook = feedbackHook(async () => true);
  await hook.copyWithFeedback("sample");
  const firstTimer = [...hook.timers.keys()][0];
  await hook.copyWithFeedback("sample again");
  assert.equal(hook.timers.has(firstTimer), false);
  assert.equal(hook.timers.size, 1);
  assert.equal(hook.statuses.default, "copied");
  hook.unmount();
  assert.equal(hook.timers.size, 0);
});

test("failed copies show failure, and stale or unmounted promises cannot replace the latest result", async () => {
  const resolves = [];
  const hook = feedbackHook(() => new Promise((resolve) => resolves.push(resolve)));
  const olderCopy = hook.copyWithFeedback("first");
  const latestCopy = hook.copyWithFeedback("second");
  resolves[1](false);
  await latestCopy;
  assert.equal(hook.statuses.default, "failed");
  resolves[0](true);
  await olderCopy;
  assert.equal(hook.statuses.default, "failed");
  const unfinished = hook.copyWithFeedback("third");
  hook.unmount();
  const updatesBeforeResolution = hook.stateUpdates;
  resolves[2](true);
  await unfinished;
  assert.equal(hook.stateUpdates, updatesBeforeResolution);
  assert.equal(hook.timers.size, 0);
});

test("all workspace text-copy controls have visible confirmation and movement controls keep separate keys", () => {
  for (const name of ["TrainMovementExcelSheet", "RequestedTrainActionSummary", "RemovalDepotLogCard", "StablingSection"]) {
    const component = extract(name);
    assert.match(component, /useClipboardCopyFeedback\(\)/);
    assert.match(component, /copyWithFeedback\(/);
    assert.match(component, /aria-live="polite"[^\n]*"Copied"[^\n]*"Copy failed"/);
  }
  const sheet = extract("TrainMovementExcelSheet");
  assert.match(sheet, /copyWithFeedback\(lines.join\("\\n"\), "sheet"\)/);
  assert.match(sheet, /depot \? `output-\$\{depot\}` : "output-all"/);
  assert.match(sheet, /if \(!lines.length\) \{\s*showFeedback/);
  assert.match(page, /totalServiceCopyStatus === "copied" \? "Copied"/);
  assert.match(page, /if \(status === "copied"\) return `\$\{prefix\} Copied/);
  for (const type of ["workshop", "group"]) {
    assert.match(maintenance, new RegExp(`clearTimeout\\(${type}CopyTimerRef.current\\);`));
    assert.match(maintenance, new RegExp(`${type}CopyTimerRef.current = setTimeout\\([\\s\\S]*?}, 2500\\);`));
    assert.match(maintenance, new RegExp(`aria-live="polite"[^\\n]*${type}CopyStatus === "copied" \\? "Copied"`));
  }
});
