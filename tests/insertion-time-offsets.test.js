import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check } from 'lucide-react';
import ts from 'typescript';
import * as usage from '../src/lib/insertionTidUsage.js';
import * as sound from '../src/lib/insertionSoundTiming.js';
import * as sections from '../src/lib/tidScheduleSections.js';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const table = readFileSync(new URL('../src/components/TIDReferenceTable.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const helperContext = vm.createContext({});
vm.runInContext(`${fn(table, 'addMinutesToTime')}\n${fn(table, 'applyInsertionTimeOffsets')}`, helperContext);
const applyOffsets = (...args) => helperContext.applyInsertionTimeOffsets(...args);

test('West shifts by exactly one minute and East retains its separate two-minute rule', () => {
  const base = { weekday: { label: 'Weekday', source: 'uploaded', west: [{ tid: 101, time: '05:25', remark: 'Late Rem' }], east: [{ tid: 201, time: '05:24', remark: 'ED' }] } };
  const original = JSON.stringify(base);
  const west = applyOffsets(base, 1, 0);
  assert.equal(west.weekday.west[0].time, '05:26');
  assert.equal(west.weekday.east, base.weekday.east);
  const east = applyOffsets(base, 0, 2);
  assert.equal(east.weekday.east[0].time, '05:26');
  assert.equal(east.weekday.west, base.weekday.west);
  assert.equal(applyOffsets(base, 0, 0), base);
  assert.equal(applyOffsets(base, 2, 1), base);
  assert.equal(JSON.stringify(base), original);
  assert.equal(west.weekday.west[0].remark, 'Late Rem');
  assert.equal(west.weekday.source, 'uploaded');
});

test('all timetable types and midnight rollover work without accumulating offsets on toggles', () => {
  const base = Object.fromEntries(['weekday', 'friday', 'saturday', 'ph'].map(key => [key, { label: key, west: [{ tid: 101, time: '23:59' }], east: [{ tid: 201, time: '23:58' }] }]));
  for (let toggle = 0; toggle < 3; toggle++) {
    const shifted = applyOffsets(base, 1, 2);
    for (const key of Object.keys(base)) {
      assert.equal(shifted[key].west[0].time, '00:00');
      assert.equal(shifted[key].east[0].time, '00:00');
      assert.equal(applyOffsets(base, 0, 2)[key].west[0].time, '23:59');
    }
  }
  assert.equal(base.weekday.west[0].time, '23:59');
  assert.equal(helperContext.addMinutesToTime('', 1), '');
});

test('the existing thirty-second sound trigger follows the adjusted reference time', () => {
  const schedules = applyOffsets({ weekday: { west: [{ time: '05:25' }], east: [{ time: '05:24' }] } }, 1, 2);
  assert.equal(sound.getInsertionSoundTriggerTime(schedules.weekday.west[0].time), '05:25:30');
  assert.equal(sound.getInsertionSoundTriggerTime(schedules.weekday.east[0].time), '05:25:30');
});

test('West defaults to original time and remembers only 0 or 1 independently of East', () => {
  const stored = new Map();
  const context = vm.createContext({ localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) } });
  const names = ['normalizeWestInsertionTimeOffset', 'loadWestInsertionTimeOffset', 'saveWestInsertionTimeOffset', 'normalizeEastInsertionTimeOffset', 'loadEastInsertionTimeOffset', 'saveEastInsertionTimeOffset'];
  vm.runInContext(`const WEST_INSERTION_TIME_OFFSET_KEY='westInsertionTimeOffsetMinutes_v1'; const EAST_INSERTION_TIME_OFFSET_KEY='eastInsertionTimeOffsetMinutes_v1';\n${names.map(name => fn(page, name)).join('\n')}`, context);
  assert.equal(context.loadWestInsertionTimeOffset(), 0);
  assert.equal(context.loadEastInsertionTimeOffset(), 2);
  context.saveWestInsertionTimeOffset(1);
  assert.equal(context.loadWestInsertionTimeOffset(), 1);
  assert.equal(context.loadEastInsertionTimeOffset(), 2);
  context.saveEastInsertionTimeOffset(0);
  assert.equal(context.loadWestInsertionTimeOffset(), 1);
  assert.equal(context.loadEastInsertionTimeOffset(), 0);
  for (const value of [2, 3, -1, 'invalid', null]) assert.equal(context.normalizeWestInsertionTimeOffset(value), 0);
  context.saveWestInsertionTimeOffset(0);
  assert.equal(context.loadWestInsertionTimeOffset(), 0);
  stored.set('eastInsertionTimeOffsetMinutes_v1', '3');
  assert.equal(context.loadEastInsertionTimeOffset(), 2); // Existing migration is unchanged.
});

function scheduledTimeContext(overrides = {}) {
  const context = vm.createContext({
    getDayScheduleKey: () => 'weekday', normalizeDepotKey: value => value === 'east' ? 'east' : 'west',
    activeInsertionTimeMaps: {}, hasActiveUploadedTimetable: false,
    westInsertionTimeOffsetMinutes: 1, eastInsertionTimeOffsetMinutes: 2,
    TID_TIME_MAPS: { weekday: { west: { 101: '05:25' }, east: { 201: '05:24' } }, friday: { west: { 301: '23:59' }, east: {} }, saturday: { west: {}, east: {} } },
    ...overrides,
  });
  const start = page.indexOf('  const getTidScheduledTime =');
  const end = page.indexOf('  const rebuildInsertionLogLineWithTime', start);
  assert.ok(end > start);
  vm.runInContext(`${fn(page, 'parseHHMM')}\n${fn(page, 'addMinutesToHHMM')}\n${fn(page, 'normalizeWestInsertionTimeOffset')}\n${fn(page, 'normalizeEastInsertionTimeOffset')}\n${page.slice(start, end)}\nthis.getTime=getTidScheduledTime;`, context);
  return context;
}
test('the actual insertion/log/export lookup matches shifted reference times and the source depot', () => {
  const context = scheduledTimeContext();
  assert.equal(context.getTime(101, 'west'), '05:26');
  assert.equal(context.getTime(201, 'east'), '05:26');
  assert.equal(context.getTime(101, 'east'), '05:26'); // West reference TID in an East cell.
  assert.equal(context.getTime(301, 'west'), '00:00');
  assert.equal(context.getTime(301, 'west', { allowFallback: false }), null);
  context.westInsertionTimeOffsetMinutes = 0;
  assert.equal(context.getTime(101, 'west'), '05:25');
  assert.equal(context.getTime(201, 'east'), '05:26');
  const uploaded = scheduledTimeContext({ hasActiveUploadedTimetable: true, activeInsertionTimeMaps: { west: { 111: '23:59' }, east: { 211: '23:58' } } });
  assert.equal(uploaded.getTime(111, 'west'), '00:00');
  assert.equal(uploaded.getTime(211, 'east'), '00:00');
  assert.equal(uploaded.getTime(101, 'west'), null);
  const original = scheduledTimeContext({ westInsertionTimeOffsetMinutes: 0, hasActiveUploadedTimetable: true, activeInsertionTimeMaps: { west: { 111: '5:25' } } });
  assert.equal(original.getTime(111, 'west'), '5:25');
});

test('both log refresh effects react to West selection while leaving manual times and sweeping alone', () => {
  for (const [name, setter, nextMarker] of [['insertionLog', 'setInsertionLog', '  useEffect(() => {\n    if (!pg2InsertionLog.length)'], ['pg2InsertionLog', 'setPg2InsertionLog', '  const applyInsertionTickToLog']]) {
    const start = page.indexOf(`  useEffect(() => {\n    if (!${name}.length) return;`);
    const effect = page.slice(start, page.indexOf(nextMarker, start + 1));
    assert.match(effect, /westInsertionTimeOffsetMinutes/);
    let result;
    const context = scheduledTimeContext();
    Object.assign(context, {
      [name]: [{ tid: 101, depot: 'west', time: '05:25', text: 'old' }, { tid: 101, depot: 'west', time: '05:35', timeEdited: true }, { tid: 101, depot: 'west', time: '05:40', isSweeping: true }],
      [setter]: value => { result = value; }, useEffect: callback => callback(),
      getTidScheduledTime: context.getTime, rebuildInsertionLogLineWithTime: (_entry, time) => `${time} hrs`,
      sortInsertionLogByTime: value => value, markInsertionLiveLocalEdit() {},
      activeTimetable: null, selectedTimetableType: 'weekday', insertionLiveLoaded: true,
    });
    vm.runInContext(effect, context);
    assert.equal(result[0].time, '05:26');
    assert.equal(result[1].time, '05:35');
    assert.equal(result[2].time, '05:40');
  }
});

test('the common schedule window accounts for all West/East offset combinations', () => {
  const start = page.indexOf('  const TID_SCHEDULE_FIRST =');
  const end = page.indexOf('  const withinTIDSchedule', start);
  const code = page.slice(start, end);
  for (const [west, east, expected] of [[0, 0, ['05:24', '06:22']], [1, 0, ['05:24', '06:23']], [0, 2, ['05:25', '06:23']], [1, 2, ['05:26', '06:23']]]) {
    const result = vm.runInNewContext(`${code}\n[TID_SCHEDULE_FIRST,TID_SCHEDULE_LAST]`, { westInsertionTimeOffsetMinutes: west, eastInsertionTimeOffsetMinutes: east });
    assert.deepEqual(Array.from(result), expected);
  }
});

const compiledTable = ts.transpileModule(table.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, '').replace(/^export (?:default )?/gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const Table = new Function('React', 'Check', 'ActionTooltip', 'helpers', 'localStorage', `
  const {useState,useEffect,useMemo,useRef,useCallback}=React;
  const {countAssignedInsertionRows,isInsertionTidAssigned,formatClockTimeWithSeconds,getInsertionSoundTriggerTime,isInsertionSoundDue,getUpcomingFirstRows,hasLargeTimetableGap}=helpers;
  ${compiledTable}\nreturn TIDReferenceTable;`)(React, Check, ({ children }) => children, { ...usage, ...sound, ...sections }, { getItem: () => null });
test('actual reference menus offer West TIME/+1 and East TIME/+2, never West +2', () => {
  const html = renderToStaticMarkup(React.createElement(Table, { showHeader: false, showHelp: false, soundAlertsEnabled: false, westTimeOffsetMinutes: 1, eastTimeOffsetMinutes: 2 }));
  for (const [label, step] of [['West', 1], ['East', 2]]) {
    const select = html.match(new RegExp(`<select[^>]*aria-label="${label} Depot insertion time adjustment"[^]*?<\/select>`))?.[0];
    assert.ok(select);
    assert.match(select, />TIME<\/option>/);
    assert.match(select, new RegExp(`value="${step}"[^>]*selected=""[^>]*>TIME \\+${step}<`));
    assert.doesNotMatch(select, new RegExp(`TIME \\+${step === 1 ? 2 : 1}`));
  }
  assert.match(table, /onTimeOffsetChange=\{depotType === "east" \? onEastTimeOffsetChange : onWestTimeOffsetChange\}/);
  assert.match(page, /onWestInsertionTimeOffsetChange=\{setWestInsertionTimeOffsetMinutes\}/);
  assert.match(page, /saveWestInsertionTimeOffset\(westInsertionTimeOffsetMinutes\)/);
});
