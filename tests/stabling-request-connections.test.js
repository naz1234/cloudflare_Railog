import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildStablingConnectionPath, findStablingRequestTargets, getStablingRequestConnectionTrainIds, getVisibleConnectionRect, intersectConnectionRects, normalizeConnectionTrainId } from "../src/lib/stablingRequestConnections.js";

const overlay = readFileSync(new URL("../src/components/StablingRequestConnections.jsx", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const depot = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../scripts/preview-compact-slate.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/stablingRequestConnections.css", import.meta.url), "utf8");
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const style = { overflowX: "visible", overflowY: "visible", display: "block", visibility: "visible" };
const element = (bounds, parentElement = null, styles = {}) => ({ bounds, parentElement, styles: { ...style, ...styles }, getBoundingClientRect() { return this.bounds; } });

test("connection IDs normalize numeric, padded and T-prefixed trains without partial matches", () => {
  for (const value of [3, "03", "T3", "t003", " T 03 "]) assert.equal(normalizeConnectionTrainId(value), "T3");
  assert.equal(normalizeConnectionTrainId("30"), "T30");
  for (const value of [null, undefined, "", "—", "T3 issue", "T3,T8"]) assert.equal(normalizeConnectionTrainId(value), "");
});

test("request matching stays in one workspace, includes both depots and keeps duplicate train locations", () => {
  const cards = ["T3", "03", "T8", "T30", ""].map((train) => ({ dataset: { stablingTrain: train } }));
  const workspace = { querySelectorAll: (selector) => { assert.equal(selector, "[data-stabling-train]"); return cards; } };
  assert.deepEqual(findStablingRequestTargets(workspace, ["t03", "3", "T8", "T45"]), cards.slice(0, 3));
  assert.deepEqual(findStablingRequestTargets(workspace, []), []);
  assert.deepEqual(findStablingRequestTargets(null, ["03"]), []);
});

test("group hover selects every member while individual hover selects only that exact train", () => {
  const trains = ["03", "T8", "30", "45"];
  assert.deepEqual(getStablingRequestConnectionTrainIds(trains), trains);
  assert.deepEqual(getStablingRequestConnectionTrainIds(trains, "T003"), ["03"]);
  assert.deepEqual(getStablingRequestConnectionTrainIds(trains, "08"), ["T8"]);
  assert.deepEqual(getStablingRequestConnectionTrainIds(trains, "T30"), ["30"]);
  assert.deepEqual(getStablingRequestConnectionTrainIds(trains, "T23"), []);
  for (const invalid of [null, "", "—", "T3 issue"]) {
    assert.deepEqual(getStablingRequestConnectionTrainIds(trains, invalid), []);
  }
  assert.deepEqual(trains, ["03", "T8", "30", "45"]);
});

test("visible card geometry clips to the viewport and excludes hidden or off-screen trains", () => {
  const viewport = { width: 1000, height: 800 };
  assert.deepEqual(getVisibleConnectionRect(element(rect(-20, 40, 100, 80)), viewport, (el) => el.styles), rect(0, 40, 80, 80));
  assert.equal(getVisibleConnectionRect(element(rect(1200, 40, 100, 80)), viewport, (el) => el.styles), null);
  assert.equal(getVisibleConnectionRect(element(rect(30, 40, 100, 80), null, { visibility: "hidden" }), viewport, (el) => el.styles), null);
  assert.equal(intersectConnectionRects(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), null);
});

test("nested horizontal and vertical scroll clipping cannot draw connections to invisible cards", () => {
  const vertical = element(rect(0, 100, 1000, 300), null, { overflowY: "auto" });
  const horizontal = element(rect(100, 0, 400, 800), vertical, { overflowX: "hidden" });
  const card = element(rect(70, 80, 140, 100), horizontal);
  assert.deepEqual(getVisibleConnectionRect(card, { width: 1000, height: 800 }, (el) => el.styles), rect(100, 100, 110, 80));
  card.bounds = rect(520, 150, 100, 80);
  assert.equal(getVisibleConnectionRect(card, { width: 1000, height: 800 }, (el) => el.styles), null);
});

test("smooth connector paths attach to the nearest card edge on either side", () => {
  const source = rect(900, 300, 200, 24);
  const left = buildStablingConnectionPath(source, rect(400, 100, 100, 80));
  assert.deepEqual(left.start, { x: 897, y: 312 });
  assert.deepEqual(left.end, { x: 503, y: 140 });
  assert.match(left.path, /^M 897 312 C 797 312, 603 140, 503 140$/);
  const right = buildStablingConnectionPath(rect(100, 20, 100, 24), rect(700, 90, 100, 80));
  assert.deepEqual(right.start, { x: 203, y: 32 });
  assert.deepEqual(right.end, { x: 697, y: 130 });
  assert.doesNotMatch(right.path, /NaN|Infinity/);
});

function createOverlayHarness({ scoped = true, trainKey = "T3,T8,T45", sourceBounds = rect(900, 300, 90, 24) } = {}) {
  const cards = [
    Object.assign(element(rect(400, 100, 100, 80)), { dataset: { stablingTrain: "T3", stablingDepot: "west", stablingRoad: "WD-ST14", stablingBlock: "5" } }),
    Object.assign(element(rect(650, 550, 100, 80)), { dataset: { stablingTrain: "T8", stablingDepot: "east", stablingRoad: "ED-ST02", stablingBlock: "4" } }),
    Object.assign(element(rect(200, 900, 100, 80)), { dataset: { stablingTrain: "T45", stablingDepot: "west", stablingRoad: "WD-ST12", stablingBlock: "1" } }),
  ];
  const workspace = { querySelectorAll: () => cards };
  const source = Object.assign(element(sourceBounds), { isConnected: true, closest: (selector) => { assert.equal(selector, "[data-stabling-workspace]"); return scoped ? workspace : null; } });
  const frames = new Map();
  const events = new Map();
  const observers = [];
  const dismissals = [];
  let nextFrame = 0;
  let cleanup;
  let geometry = { connections: [] };
  const surface = (label) => ({
    addEventListener: (name, callback) => events.set(`${label}:${name}`, callback),
    removeEventListener: (name) => events.delete(`${label}:${name}`),
  });
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const context = {
    source, trainKey, onDismiss: (value) => dismissals.push(value),
    findStablingRequestTargets, buildStablingConnectionPath, normalizeConnectionTrainId,
    getVisibleConnectionRect: (el, viewport) => getVisibleConnectionRect(el, viewport, (target) => target.styles),
    getComputedStyle: () => ({ getPropertyValue: () => "#c084fc" }),
    window: { ...surface("window"), innerWidth: 1000, innerHeight: 800, visualViewport: surface("viewport") },
    document: surface("document"),
    ResizeObserver: Observer, MutationObserver: Observer,
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setGeometry: (updater) => { geometry = typeof updater === "function" ? updater(geometry) : updater; },
    useLayoutEffect: (callback) => { cleanup = callback(); },
  };
  const start = overlay.indexOf("  useLayoutEffect(() => {");
  const end = overlay.indexOf("  }, [source, trainKey, onDismiss]);", start) + "  }, [source, trainKey, onDismiss]);".length;
  runInNewContext(overlay.slice(start, end), context);
  return { source, cards, observers, events, frames, dismissals, geometry: () => geometry, cleanup: () => cleanup?.(),
    event: (name, data = {}) => events.get(name)?.(data),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); },
  };
}

test("overlay connects only visible matching cards and never requires a data mutation", () => {
  const harness = createOverlayHarness();
  assert.deepEqual(Array.from(harness.geometry().connections, (entry) => entry.train), ["T3", "T8"]);
  assert.equal(harness.geometry().accent, "#c084fc");
  assert.equal(harness.cards[0].dataset.stablingTrain, "T3");
  assert.doesNotMatch(overlay, /onAdd|onRemove|onCommit|localStorage|base44|fetch\(/);
});

test("group hover retains a shared subgroup-title origin and omits the instructional tooltip sentence", () => {
  const harness = createOverlayHarness();
  assert.ok(harness.geometry().connections.every((entry) => entry.start.x === 897 && entry.start.y === 312));
  assert.doesNotMatch(maintenance, /Hover to connect/i);
});

test("individual train hover connects only its matching West or East card from the hovered label", () => {
  for (const [train, end] of [["T3", { x: 503, y: 140 }], ["T8", { x: 753, y: 590 }]]) {
    const harness = createOverlayHarness({ trainKey: train, sourceBounds: rect(900, 350, 56, 12) });
    const connections = harness.geometry().connections;
    assert.equal(connections.length, 1);
    assert.equal(connections[0].train, train);
    assert.deepEqual({ ...connections[0].start }, { x: 897, y: 356 });
    assert.deepEqual({ ...connections[0].end }, end);
  }
  assert.equal(createOverlayHarness({ trainKey: "T23" }).geometry().connections.length, 0);
  assert.equal(createOverlayHarness({ trainKey: "T45" }).geometry().connections.length, 0);
});

test("individual train triggers preserve the group key, target one train and support hover plus focus", () => {
  const start = maintenance.indexOf('className="theme-maintenance-train-connection-trigger');
  const label = maintenance.slice(start, maintenance.indexOf(">{chipLabel}</span>", start));
  assert.match(label, /cursor-pointer/);
  assert.match(label, /data-maintenance-connection-train=\{normalizeTrainCompareKey\(req\.trainId\)\}/);
  assert.match(maintenance, /message=\{`\$\{chipLabel\} — \$\{group\.label\}`\}/);
  for (const name of ["onMouseEnter", "onFocus"]) {
    const expression = label.match(new RegExp(`${name}=\\{(\\(event\\) => setStablingHoverGroup\\(\\{[^\\n]+\\}\\))\\}`))?.[1];
    assert.ok(expression, `${name} selects the individual train`);
    let selected;
    const source = {};
    const handler = runInNewContext(`(${expression})`, {
      setStablingHoverGroup: (value) => { selected = value; },
      group: { key: "inbound" }, req: { trainId: "03" },
    });
    handler({ currentTarget: source });
    assert.equal(selected.key, "inbound");
    assert.equal(selected.trainId, "03");
    assert.equal(selected.source, source);
  }
  assert.match(label, /onMouseLeave=\{\(event\) => \{ if \(document\.activeElement !== event\.currentTarget\) setStablingHoverGroup\(null\)/);
  assert.match(label, /onBlur=\{\(event\) => \{ if \(!event\.currentTarget\.matches\(":hover"\)\) setStablingHoverGroup\(null\)/);
});

test("scroll and resize work are batched per animation frame and follow the new card position", () => {
  const harness = createOverlayHarness();
  const oldPath = harness.geometry().connections[0].path;
  harness.cards[0].bounds = rect(350, 120, 100, 80);
  harness.event("document:scroll");
  harness.event("window:resize");
  harness.event("viewport:scroll");
  assert.equal(harness.frames.size, 1);
  harness.flush();
  assert.notEqual(harness.geometry().connections[0].path, oldPath);
});

test("live card changes remove stale matches and disconnected or unscoped sources hide lines", () => {
  const harness = createOverlayHarness();
  harness.cards[0].dataset.stablingTrain = "T30";
  harness.observers[1].callback();
  harness.flush();
  assert.deepEqual(Array.from(harness.geometry().connections, (entry) => entry.train), ["T8"]);
  harness.source.isConnected = false;
  harness.event("document:scroll");
  harness.flush();
  assert.equal(harness.geometry().connections.length, 0);
  assert.equal(createOverlayHarness({ scoped: false }).geometry().connections.length, 0);
});

test("Escape or window blur dismisses connections and cleanup removes all observers and listeners", () => {
  const harness = createOverlayHarness();
  harness.event("document:keydown", { key: "Tab" });
  assert.equal(harness.dismissals.length, 0);
  harness.event("document:keydown", { key: "Escape" });
  harness.event("window:blur");
  assert.deepEqual(harness.dismissals, [null, null]);
  harness.event("document:scroll");
  harness.cleanup();
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.events.size, 0);
  assert.ok(harness.observers.every((observer) => observer.disconnected));
});

test("group titles retain their tooltips and support mouse hover plus keyboard focus", () => {
  assert.match(maintenance, /data-maintenance-connection-source=\{group\.key\}/);
  assert.match(maintenance, /onMouseEnter=\{\(event\) => setStablingHoverGroup/);
  assert.match(maintenance, /onMouseLeave=\{\(event\) => \{ if \(document\.activeElement !== event\.currentTarget\) setStablingHoverGroup\(null\)/);
  assert.match(maintenance, /onFocus=\{\(event\) => setStablingHoverGroup/);
  assert.match(maintenance, /onBlur=\{\(event\) => \{ if \(!event\.currentTarget\.matches\(":hover"\)\) setStablingHoverGroup\(null\)/);
  assert.match(maintenance, /trainIds=\{getStablingRequestConnectionTrainIds\(\s+connectedRequestGroup\.items\.map\(\(request\) => request\.trainId\),\s+stablingHoverGroup\.trainId\s+\)\}/);
  assert.match(maintenance, /regularRequestGroups\.find\(\(group\) => group\.key === stablingHoverGroup\?\.key\)/);
  assert.match(depot, /ref=\{stablingHorizontalScrollRef\}\s+data-stabling-workspace/);
  assert.match(preview, /className="slate-preview-workspace" data-stabling-workspace/);
  assert.match(depot, /data-stabling-train=\{key \|\| undefined\}/);
});

test("decorative connections are portalled, click-through and theme-aware without motion", () => {
  assert.match(overlay, /createPortal\(/);
  assert.match(overlay, /document\.body/);
  assert.match(overlay, /aria-hidden="true" focusable="false"/);
  assert.match(css, /position: fixed;/);
  assert.match(css, /pointer-events: none;/);
  assert.match(css, /html\[data-app-theme="light"\] \.stabling-request-connections/);
  assert.doesNotMatch(css, /animation|transition|@keyframes/);
});
