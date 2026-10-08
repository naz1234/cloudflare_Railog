import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/removalSummarySlate.css', import.meta.url), 'utf8');
function createClearHarness() {
  const start = source.indexOf('const requestTrainRemClear =');
  const handler = source.slice(start, source.indexOf('const renderRemovalGroupClearButton =', start));
  const effectStart = source.indexOf('  useEffect(() => {\n    if (!trainRemClearTarget)');
  const effect = source.slice(effectStart, source.indexOf('  }, [trainRemClearTarget]);', effectStart) + '  }, [trainRemClearTarget]);'.length);
  const state = { sample: true };
  const activeTimetable = { weekday: true };
  const calls = { targets: [], clears: [], updates: [], delays: [] };
  const timers = new Map();
  const listeners = new Map();
  let nextTimer = 0;
  let confirmationEffect;
  let cleanup;
  const context = {
    trainRemClearTarget: null,
    activeTimetable,
    useEffect: (callback) => { confirmationEffect = callback; },
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
    },
    setTimeout: (callback, delay) => {
      calls.delays.push(delay);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    setTrainRemClearTarget: (target) => {
      calls.targets.push(target);
      context.trainRemClearTarget = target;
      cleanup?.();
      cleanup = confirmationEffect();
    },
    clearTrainRemGroupState: (previous, key, timetable) => {
      calls.clears.push({ previous, key, timetable });
      return { ...previous, cleared: key };
    },
    clearTrainRemSummaryState: (previous) => {
      calls.clears.push({ previous, key: 'all' });
      return { ...previous, cleared: 'all' };
    },
    updateTrainRemState: (updater) => calls.updates.push(updater(state)),
  };
  runInNewContext(`${effect}\n${handler}\nglobalThis.click = (key) => {
    if (key === 'all') clearAllTrainRem();
    else clearTrainRemGroup(key);
  };`, context);
  return {
    calls, state, activeTimetable, context, timers, listeners,
    click: (key) => context.click(key),
    keydown: (key) => listeners.get('keydown')?.({ key }),
    expire: () => [...timers.values()][0]?.(),
    unmount: () => cleanup?.(),
  };
}

test('Removal Summary has one icon-only clear that shows Confirm? on the same button with Undo/save support', () => {
  const panel = source.slice(source.indexOf('function TrainRemPanel('), source.indexOf('function MainStablingTrainPopup('));
  assert.equal((panel.match(/className="theme-train-rem-clear /g) || []).length, 1);
  assert.match(panel, /onClick=\{clearAllTrainRem\}/);
  const buttonStart = panel.indexOf('{depot === "west" && <ActionTooltip');
  const button = panel.slice(buttonStart, panel.indexOf('</ActionTooltip>}', buttonStart));
  assert.match(button, /<Trash2 size=\{12\} aria-hidden="true" \/>/);
  assert.match(button, /trainRemClearConfirm \? <span aria-live="polite">Confirm\?<\/span> : <Trash2/);
  assert.match(button, /data-confirming=\{trainRemClearConfirm \|\| undefined\}/);
  assert.match(button, /aria-label=\{trainRemClearConfirm \? "Confirm clearing all Removal Summary entries" : "Clear all Removal Summary entries"\}/);
  assert.match(button, /Other periods, Maintenance and stabling stay unchanged/);
  assert.doesNotMatch(button, /aria-haspopup|aria-expanded|>\s*Clear All\s*</);
  assert.match(panel, /const clearAllTrainRem = \(\) => requestTrainRemClear\("all"\)/);
  assert.match(panel, /if \(event.key !== "Escape"\) return;/);
  assert.match(panel, /if \(!isSameTrainRemState\(trainRemClearStateRef\.current, trainRemState\)\) \{\s+setTrainRemClearTarget\(null\);/);
  assert.match(panel, /groupKey === "all"\s+\? clearTrainRemSummaryState\(prev\)/);
  assert.doesNotMatch(panel, /clearDepotTrainRem/);
  assert.match(panel, /const nextUndoStack = \[\.\.\.trainRemUndoStackRef\.current, cloneTrainRemState\(prev\)\]/);
  assert.match(panel, /scheduleTrainRemSave\(nextState\)/);
  assert.match(css, /\.theme-train-rem-clear \{[^}]*width: 36px;[^}]*padding: 0;/);
  assert.match(css, /\.theme-train-rem-clear \{ width: 30px; min-width: 30px; padding: 0; \}/);
  assert.match(css, /\.theme-train-rem-clear\[data-confirming="true"\] \{[^}]*min-width: 62px;/);
  assert.match(css, /\.theme-train-rem-clear\[data-confirming="true"\] \{ width: 58px; min-width: 58px;/);
});

test('all three group headers share inline confirmation and bubble tooltips in scheduled and HDW layouts', () => {
  const start = source.indexOf('const renderRemovalGroupClearButton =');
  const button = source.slice(start, source.indexOf('const handleTrainRemPdfDownload =', start));
  assert.match(button, /<ActionTooltip asChild/);
  assert.match(button, /west: "West Depot", east: "East Depot", offpeak: "Off Peak"/);
  assert.match(button, /\$\{otherGroups\} stay unchanged/);
  assert.match(button, /data-removal-clear-group=\{groupKey\}/);
  assert.match(button, /cursor-pointer/);
  assert.match(button, /data-confirming=\{confirming \|\| undefined\}/);
  assert.match(button, /confirming \? <span aria-live="polite">Confirm\?<\/span> : <Trash2/);
  assert.match(button, /Confirm clearing \$\{label\} entries only/);
  assert.match(button, /Escape or 5 seconds cancels; Undo restores cleared entries/);
  assert.match(button, /<Trash2 size=\{12\} aria-hidden="true" \/>/);
  assert.doesNotMatch(button, /title=|>\s*Clear All\s*<|<Check\b|aria-haspopup|aria-expanded/);
  assert.match(source, /renderRemovalGroupClearButton\(hdwHeader\.depot === "mainline" \? "offpeak" : hdwHeader\.depot\)/);
  assert.match(source, /renderRemovalGroupClearButton\(rowLocation\.key\)/);
  assert.match(css, /button\.theme-train-rem-group-clear \{[^}]*background: transparent !important;/);
  assert.match(css, /button\.theme-train-rem-group-clear\[data-confirming="true"\] \{[^}]*width: 54px;[^}]*text-transform: none;/);
});

test('scheduled group dustbins center below Time at both table column widths', () => {
  assert.match(css, /\.theme-train-rem-table:not\(\[data-removal-headway\]\) \.slate-removal-group-header \{ position: relative; \}/);
  assert.match(css, /\.slate-removal-group-header \.theme-train-rem-group-clear \{\s+position: absolute;\s+left: 34%;[^}]*top: 50%;[^}]*transform: translate\(-50%, -50%\);/);
  assert.match(css, /\.slate-removal-group-header \.theme-train-rem-group-clear \{ left: 40\.5%; \}/);
  assert.equal(14 + 11 + (18 / 2), 34);
  assert.equal(18 + 13 + (19 / 2), 40.5);
  assert.match(css, /\.slate-removal-group-count \{ margin-left: auto;/);
});

test('inline confirmation routes all four targets through one atomic Undo/save update', () => {
  const start = source.indexOf('const requestTrainRemClear =');
  const handler = source.slice(start, source.indexOf('const renderRemovalGroupClearButton =', start));
  assert.match(handler, /if \(!\["west", "east", "offpeak"\]\.includes\(groupKey\)\) return;/);
  assert.match(handler, /if \(trainRemClearTarget !== groupKey\) \{\s+setTrainRemClearTarget\(groupKey\);\s+return;/);
  assert.match(handler, /updateTrainRemState\(\(prev\) => groupKey === "all"[\s\S]*?: clearTrainRemGroupState\(prev, groupKey, activeTimetable\)\)/);
  assert.equal((handler.match(/updateTrainRemState\(/g) || []).length, 1);
  assert.match(source, /trainRemClearConfirm = trainRemClearTarget === "all"/);
  assert.doesNotMatch(source, /RemovalGroupClearDialog|confirmTrainRemGroupClear|trainRemClearTriggerRef/);
  assert.doesNotMatch(css, /theme-removal-clear-dialog/);
});

test('first click on every dustbin only arms confirmation without changing entries or Undo', () => {
  for (const groupKey of ['all', 'west', 'east', 'offpeak']) {
    const harness = createClearHarness();
    harness.click(groupKey);
    assert.equal(harness.context.trainRemClearTarget, groupKey);
    assert.equal(harness.calls.clears.length, 0);
    assert.equal(harness.calls.updates.length, 0);
    assert.deepEqual(harness.calls.targets, [groupKey]);
    assert.deepEqual(harness.calls.delays, [5000]);
  }
});

test('second click on the same group clears only that group in one update', () => {
  for (const groupKey of ['west', 'east', 'offpeak']) {
    const harness = createClearHarness();
    harness.click(groupKey);
    harness.click(groupKey);
    const { calls, state, activeTimetable } = harness;
    assert.deepEqual(calls.targets, [groupKey, null]);
    assert.equal(calls.clears.length, 1);
    assert.equal(calls.clears[0].previous, state);
    assert.equal(calls.clears[0].key, groupKey);
    assert.equal(calls.clears[0].timetable, activeTimetable);
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0].cleared, groupKey);
    assert.equal(harness.timers.size, 0);
    assert.equal(harness.listeners.size, 0);
  }
});

test('unknown groups cannot arm confirmation or change entries', () => {
  const { calls, click, timers } = createClearHarness();
  click('unknown');
  assert.equal(calls.targets.length, 0);
  assert.equal(calls.clears.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(timers.size, 0);
});

test('second click on the toolbar dustbin clears all groups in one atomic Undo/save update', () => {
  const confirmed = createClearHarness();
  confirmed.click('all');
  confirmed.click('all');
  assert.deepEqual(confirmed.calls.targets, ['all', null]);
  assert.equal(confirmed.calls.clears.length, 1);
  assert.equal(confirmed.calls.clears[0].key, 'all');
  assert.equal(confirmed.calls.clears[0].previous, confirmed.state);
  assert.equal(confirmed.calls.updates.length, 1);
  assert.equal(confirmed.calls.updates[0].cleared, 'all');
});

test('switching to a different dustbin arms it without clearing either target', () => {
  const harness = createClearHarness();
  for (const groupKey of ['west', 'all', 'offpeak', 'east']) harness.click(groupKey);
  assert.equal(harness.calls.updates.length, 0);
  assert.equal(harness.calls.clears.length, 0);
  assert.equal(harness.timers.size, 1);
  assert.equal(harness.context.trainRemClearTarget, 'east');
  harness.click('east');
  assert.equal(harness.calls.updates.length, 1);
  assert.equal(harness.calls.clears[0].key, 'east');
});

test('five seconds cancels every target, and the next click only rearms it', () => {
  for (const groupKey of ['all', 'west', 'east', 'offpeak']) {
    const harness = createClearHarness();
    harness.click(groupKey);
    harness.expire();
    assert.equal(harness.context.trainRemClearTarget, null);
    assert.equal(harness.calls.updates.length, 0);
    assert.equal(harness.timers.size, 0);
    harness.click(groupKey);
    assert.equal(harness.context.trainRemClearTarget, groupKey);
    assert.equal(harness.calls.updates.length, 0);
  }
});

test('Escape cancels without modifying entries, while other keys keep confirmation armed', () => {
  const harness = createClearHarness();
  harness.click('west');
  harness.keydown('Tab');
  assert.equal(harness.context.trainRemClearTarget, 'west');
  harness.keydown('Escape');
  assert.equal(harness.context.trainRemClearTarget, null);
  assert.equal(harness.calls.updates.length, 0);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.listeners.size, 0);
});

test('actual state changes cancel confirmation but identical live polls leave it armed', () => {
  const start = source.indexOf('  useEffect(() => {\n    // Identical polling results');
  const effect = source.slice(start, source.indexOf('  }, [trainRemState]);', start) + '  }, [trainRemState]);'.length);
  const previous = { rows: { west: [{ trainId: '23', tid: '213' }] }, selectedPreset: { west: '7pm' } };
  let callback;
  let cancellations = 0;
  const context = {
    trainRemState: structuredClone(previous),
    trainRemClearStateRef: { current: previous },
    isSameTrainRemState: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    setTrainRemClearTarget: (target) => { assert.equal(target, null); cancellations++; },
    useEffect: (fn) => { callback = fn; },
  };
  runInNewContext(effect, context);
  callback();
  assert.equal(cancellations, 0);
  assert.equal(context.trainRemClearStateRef.current, context.trainRemState);
  context.trainRemState = { ...context.trainRemState, selectedPreset: { west: '9am' } };
  callback();
  assert.equal(cancellations, 1);
});

test('unmount removes the confirmation timer and keyboard listener', () => {
  const harness = createClearHarness();
  harness.click('offpeak');
  harness.unmount();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.listeners.size, 0);
  assert.equal(harness.calls.updates.length, 0);
});

test('primary removal actions retain their order without an empty title spacer', () => {
  const start = source.indexOf('<div className="theme-train-rem-depot-card');
  const header = source.slice(start, source.indexOf('<div className="space-y-1 mt-2">', start));
  assert.match(header, /flex flex-col items-start gap-2/);
  assert.match(header, /\{\(depot !== "west" \|\| subtitle\) && \(/);
  assert.match(header, /theme-train-rem-action-row flex flex-nowrap items-center justify-start gap-1/);
  assert.doesNotMatch(header, /justify-between/);
  const actions = ['theme-train-rem-pdf-menu', 'theme-train-rem-undo', 'theme-train-rem-clear'];
  const positions = actions.map(action => header.indexOf(action));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
});

test('removal sort and depot copy controls share one non-wrapping row in the requested order', () => {
  const start = source.indexOf('{canSortByRemovalColor && (');
  const toolbar = source.slice(start, source.indexOf('{isHdw40 && depot === "west" && (', start));
  assert.match(toolbar, /theme-train-rem-sort-copy-row flex w-full flex-nowrap items-center gap-1/);
  assert.ok(toolbar.indexOf('theme-train-rem-sort-control') < toolbar.indexOf('renderDepotCopyButton("west")'));
  assert.ok(toolbar.indexOf('renderDepotCopyButton("west")') < toolbar.indexOf('renderDepotCopyButton("east")'));
  assert.doesNotMatch(toolbar, /flex-col/);
});

test('depot copy buttons are text-only while retaining copy handlers and feedback', () => {
  const start = source.indexOf('const renderDepotCopyButton =');
  const button = source.slice(start, source.indexOf('const renderDepotTable =', start));
  assert.doesNotMatch(button, /<(?:Copy|ClipboardCheck)\b/);
  assert.match(button, /handleCopyDepotTrainList\(safeDepot\)/);
  assert.match(button, /getDepotCopyLabel\(safeDepot\)/);
  assert.match(button, /aria-label=\{tooltipMessage\}/);
});
