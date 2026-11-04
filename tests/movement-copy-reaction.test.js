import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import postcss from "postcss";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const checker = readFileSync(new URL("../src/components/depot/MaspoTrainMovementChecker.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/copyFeedbackSlate.css", import.meta.url), "utf8");
const movement = page.slice(page.indexOf("function TrainMovementContent()"), page.indexOf("function buildPSTExportLinesFromVisibleState("));
const handlers = movement.slice(movement.indexOf("  const copyTp1MovementPreview ="), movement.indexOf("  const handleDownloadTp1AutomaticExcel ="));
const feedback = movement.slice(movement.indexOf("  const showCopyFeedback ="), movement.indexOf("  const getCopyButtonLabel ="));
const scope = '.theme-train-movement-page[data-movement-design="req-slate"]';

function harness({ copied = true, entries = [{ type: "automatic", text: "Auto log" }, { type: "manual", text: "Manual log" }] } = {}) {
  const writes = [], states = [];
  const context = vm.createContext({
    tp1Entries: entries,
    getTp1MovementType: () => "automatic",
    buildTp1MovementText: ({ movementType }) => `${movementType} preview`,
    sortTp1MovementEntries: (items) => items,
    sortTp1MovementTextLinesByTime: (text) => text,
    copyTextToClipboard: async (text) => { writes.push(text); return copied; },
    showCopyFeedback: (key, status) => states.push({ key, status }),
  });
  vm.runInContext(`${handlers}\nthis.preview = copyTp1MovementPreview; this.logs = copyTp1MovementLogs;`, context);
  return { context, writes, states };
}

test("Automatic and Manual preview/Copy All confirmations use independent successful clipboard results", async () => {
  const h = harness();
  for (const mode of ["automatic", "manual"]) { await h.context.preview(mode); await h.context.logs(mode); }
  assert.deepEqual(h.writes, ["automatic preview", "Auto log", "manual preview", "Manual log"]);
  assert.deepEqual(h.states, ["tp1-preview-automatic", "tp1-all-automatic", "tp1-preview-manual", "tp1-all-manual"].map((key) => ({ key, status: "copied" })));
});

test("failed and empty copies never report a successful green state", async () => {
  const denied = harness({ copied: false });
  await denied.context.preview("automatic"); await denied.context.logs("manual");
  assert.deepEqual(denied.states.map((item) => item.status), ["failed", "failed"]);
  const empty = harness({ entries: [] });
  await empty.context.logs("automatic");
  assert.deepEqual(empty.writes, []);
  assert.deepEqual(empty.states, [{ key: "tp1-all-automatic", status: "empty" }]);
  assert.doesNotMatch(movement, /const copyTextToClipboard =/);
});

test("MOV reactions say Copied or Copy failed and reset independently after REQ's 2.5 seconds", () => {
  let states = {}, nextTimer = 0;
  const timers = new Map();
  const context = vm.createContext({ copyFeedback: states, copyFeedbackTimerRef: { current: {} },
    setCopyFeedback: (update) => { states = update(states); },
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
  });
  vm.runInContext(`${feedback}\nthis.show = showCopyFeedback; this.label = getCopyFeedbackLabel;`, context);
  context.show("tp1-preview-automatic", "copied");
  context.show("tp1-all-manual", "copied");
  assert.deepEqual([...timers.values()].map((item) => item.delay), [2500, 2500]);
  const firstTimer = [...timers.keys()][0];
  context.show("tp1-preview-automatic", "copied");
  assert.equal(timers.has(firstTimer), false);
  context.copyFeedback = { sample: "copied", failed: "failed" };
  assert.equal(context.label("sample", "Copy"), "Copied");
  assert.equal(context.label("failed", "Copy"), "Copy failed");
  assert.equal(context.label("idle", "Copy All"), "Copy All");
  timers.get([...timers.keys()][0]).callback();
  assert.equal(states["tp1-all-manual"], undefined);
  assert.equal(states["tp1-preview-automatic"], "copied");
});

test("both rendered MOV copy buttons opt into the shared reaction and swap to the existing check icon", () => {
  const preview = movement.slice(movement.indexOf('className="theme-tp1-movement-preview '), movement.indexOf('className="theme-tp1-movement-log '));
  const log = movement.slice(movement.indexOf('className="theme-tp1-movement-log '));
  for (const [block, key] of [[preview, "tp1-preview"], [log, "tp1-all"]]) {
    assert.ok(block.includes(`data-copy-state={copyFeedback[\`${key}-\${movementType}\`] || "idle"}`));
    assert.match(block, /slate-copy-feedback/);
    assert.match(block, /=== "copied" \? "check" : "copy"/);
    assert.match(block, /<span aria-live="polite">\{getCopyFeedbackLabel/);
  }
  assert.equal((movement.match(/slate-copy-feedback/g) || []).length, 2, "Excel, Add and Clear do not receive the copied theme");
});

test("MOV shares the exact existing REQ green, white text, easing and reduced-motion declarations", () => {
  const tree = postcss.parse(css);
  const success = [];
  tree.walkRules((node) => {
    if (node.selector.includes(scope) && node.selector.includes('[data-copy-state="copied"]:not(:disabled)')) success.push(node);
  });
  assert.equal(success.length, 1);
  assert.ok(success[0].selectors.some((selector) => !selector.includes(scope)), "the existing REQ rule is reused, not duplicated");
  const declarations = Object.fromEntries(success[0].nodes.map(({ prop, value }) => [prop, value]));
  assert.equal(declarations.background, "#13785a");
  assert.equal(declarations["border-color"], "#13785a");
  assert.equal(declarations.color, "#ffffff");
  assert.equal(declarations["box-shadow"], "none");
  assert.match(css, /transition: all 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\) !important;/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*theme-train-movement-page[\s\S]*transition-duration: 0s/);
  assert.doesNotMatch(css, /width:|height:|font-size:|font-weight:/);
});

test("MASPO summary and reference copies on MOV also opt into the same state-only theme", async () => {
  assert.equal((checker.match(/slate-copy-feedback/g) || []).length, 3);
  assert.match(checker, /data-copy-state=\{copied \? "copied" : "idle"\}/);
  assert.match(checker, /data-copy-state=\{copiedReference === latest.reference \? "copied" : "idle"\}/);
  assert.match(checker, /data-copy-state=\{copiedReference === record.reference \? "copied" : "idle"\}/);
  const start = checker.indexOf("async function copyText(");
  const helper = checker.slice(start, checker.indexOf("\nexport default", start));
  let removed = false;
  const context = vm.createContext({ navigator: {}, document: {
    createElement: () => ({ style: {}, select() {}, remove() { removed = true; } }),
    body: { appendChild() {} }, execCommand: () => false,
  } });
  vm.runInContext(`${helper}\nthis.copy = copyText;`, context);
  await assert.rejects(context.copy("Sample reference"), /Copy failed/);
  assert.equal(removed, true);
});
