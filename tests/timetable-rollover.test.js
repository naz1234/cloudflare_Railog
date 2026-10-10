import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const functionText = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
};
const helpers = [
  "normalizeTimetableType", "getTimetableOperationalDate", "getTimetableOperationalDayKey",
  "getNextTimetableRolloverDelay", "getCurrentDayTimetableType", "loadActiveTimetableType", "saveActiveTimetableType",
].map(functionText).join("\n");
const localDate = (year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) =>
  new Date(year, month - 1, day, hour, minute, second, millisecond);

function harness(now, storedType = "", selectedType) {
  let clock = now;
  let timerId = 0;
  const timers = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  const storageWrites = [];
  const selections = [];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.getTime()])); }
    static now() { return clock.getTime(); }
  }
  const context = {
    Date: ClockDate,
    ACTIVE_TIMETABLE_TYPE_KEY: "activeTimetableType_v1",
    localStorage: {
      getItem: () => storedType,
      setItem: (key, value) => { storedType = value; storageWrites.push({ key, value }); },
    },
    window: {
      setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout: (id) => timers.delete(id),
      addEventListener: (name, callback) => windowEvents.set(name, callback),
      removeEventListener: (name, callback) => { if (windowEvents.get(name) === callback) windowEvents.delete(name); },
    },
    document: {
      hidden: false,
      addEventListener: (name, callback) => documentEvents.set(name, callback),
      removeEventListener: (name, callback) => { if (documentEvents.get(name) === callback) documentEvents.delete(name); },
    },
    setSelectedTimetableType: (type) => selections.push(type),
  };
  vm.createContext(context);
  vm.runInContext(helpers, context);
  context.selectedTimetableType = selectedType ?? context.loadActiveTimetableType();
  context.timetableOperationalDayRef = { current: context.getTimetableOperationalDayKey() };
  const effectStart = source.indexOf("  // Roll over at 02:00 without requiring a refresh");
  const effectEnd = source.indexOf("  const [timetableRecords", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  let cleanup;
  context.useEffect = (callback) => { cleanup = callback(); };
  const mount = () => vm.runInContext(source.slice(effectStart, effectEnd), context);
  return {
    context, timers, windowEvents, documentEvents, storageWrites, selections, mount,
    moveClock: (next) => { clock = next; },
    fireTimer: () => {
      assert.equal(timers.size, 1);
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
    },
    cleanup: () => cleanup(),
  };
}

test("Weekday, Friday and Saturday change at 02:00, not midnight", () => {
  const { context } = harness(localDate(2026, 10, 9));
  for (const [day, previous, next] of [[9, "weekday", "friday"], [10, "friday", "saturday"], [11, "saturday", "weekday"]]) {
    assert.equal(context.getCurrentDayTimetableType(localDate(2026, 10, day, 0)), previous);
    assert.equal(context.getCurrentDayTimetableType(localDate(2026, 10, day, 1, 59, 59, 999)), previous);
    assert.equal(context.getCurrentDayTimetableType(localDate(2026, 10, day, 2)), next);
    assert.equal(context.getCurrentDayTimetableType(localDate(2026, 10, day, 23, 59)), next);
  }
});

test("the operational date handles month/year boundaries without mutating its input", () => {
  const { context } = harness(localDate(2026, 10, 9));
  for (const [date, key, type] of [
    [localDate(2027, 1, 1, 1, 59), "2026-12-31", "weekday"],
    [localDate(2027, 1, 1, 2), "2027-1-1", "friday"],
    [localDate(2026, 11, 1, 1), "2026-10-31", "saturday"],
  ]) {
    const originalTime = date.getTime();
    assert.equal(context.getTimetableOperationalDayKey(date), key);
    assert.equal(context.getCurrentDayTimetableType(date), type);
    assert.equal(date.getTime(), originalTime);
  }
});

test("refresh/reopen uses the 02:00 cutoff while preserving PH and handling blocked storage", () => {
  const before = harness(localDate(2026, 10, 11, 1, 59), "weekday");
  assert.equal(before.context.loadActiveTimetableType(), "saturday");
  before.context.localStorage.getItem = () => { throw new Error("Storage unavailable"); };
  assert.equal(before.context.loadActiveTimetableType(), "saturday");
  assert.equal(harness(localDate(2026, 10, 11, 2), "saturday").context.loadActiveTimetableType(), "weekday");
  assert.equal(harness(localDate(2026, 10, 11, 2), "ph").context.loadActiveTimetableType(), "ph");
});

test("an open page schedules the exact next 02:00 and changes and saves its active timetable", () => {
  for (const [day, previous, next] of [[9, "weekday", "friday"], [10, "friday", "saturday"], [11, "saturday", "weekday"]]) {
    const state = harness(localDate(2026, 10, day, 1, 59, 59, 999));
    assert.equal(state.context.selectedTimetableType, previous);
    state.mount();
    assert.equal(state.timers.values().next().value.delay, 1);
    assert.deepEqual(state.selections, []);
    state.moveClock(localDate(2026, 10, day, 2));
    state.fireTimer();
    assert.deepEqual(state.selections, [next]);
    assert.deepEqual(state.storageWrites, [{ key: "activeTimetableType_v1", value: next }]);
    assert.equal(state.timers.values().next().value.delay, localDate(2026, 10, day + 1, 2) - localDate(2026, 10, day, 2));
    state.cleanup();
  }
});

test("manual selections are retained during the operating day and PH is never replaced", () => {
  for (const selectedType of ["friday", "ph"]) {
    const state = harness(localDate(2026, 10, 10, 18), "", selectedType);
    state.mount();
    state.moveClock(localDate(2026, 10, 11, 1, 59));
    state.windowEvents.get("focus")();
    assert.deepEqual(state.selections, []);
    state.moveClock(localDate(2026, 10, 11, 2));
    state.fireTimer();
    assert.deepEqual(state.selections, selectedType === "ph" ? [] : ["weekday"]);
    assert.equal(state.storageWrites.length, selectedType === "ph" ? 0 : 1);
    state.cleanup();
  }
});

test("focus and visibility catch up after browser sleep without duplicate changes", () => {
  for (const event of ["focus", "visibilitychange"]) {
    const state = harness(localDate(2026, 10, 10, 23));
    state.mount();
    state.moveClock(localDate(2026, 10, 11, 3));
    if (event === "visibilitychange") {
      state.context.document.hidden = true;
      state.documentEvents.get(event)();
      assert.deepEqual(state.selections, []);
      state.context.document.hidden = false;
    }
    const callback = (event === "focus" ? state.windowEvents : state.documentEvents).get(event);
    callback();
    callback();
    assert.deepEqual(state.selections, ["weekday"]);
    assert.equal(state.storageWrites.length, 1);
    assert.equal(state.timers.size, 1);
    state.cleanup();
    assert.equal(state.timers.size, 0);
    assert.equal(state.windowEvents.size, 0);
    assert.equal(state.documentEvents.size, 0);
  }
});

test("a rerender at rollover does not reschedule the timetable change", () => {
  const state = harness(localDate(2026, 10, 11, 1, 59));
  state.mount();
  state.moveClock(localDate(2026, 10, 11, 2));
  state.fireTimer();
  state.cleanup();
  state.context.selectedTimetableType = "weekday";
  state.mount();
  assert.deepEqual(state.selections, ["weekday"]);
  assert.equal(state.storageWrites.length, 1);
  assert.equal(state.timers.size, 1);
  state.cleanup();
});

test("the timer delay targets tomorrow's 02:00 when today's cutoff has passed", () => {
  const { context } = harness(localDate(2026, 10, 9));
  for (const date of [localDate(2026, 10, 10, 2), localDate(2026, 10, 10, 19), localDate(2026, 12, 31, 23, 59)]) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0);
    assert.equal(context.getNextTimetableRolloverDelay(date), next - date);
  }
});
