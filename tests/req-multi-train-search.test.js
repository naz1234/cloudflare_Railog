import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { findStablingTrainLocations as findReqTrainLocations, parseStablingTrainSearch as parseReqTrainSearch } from '../src/lib/stablingTrainSearch.js';
import { getStablingRemarkTheme } from '../src/lib/reqStablingRemarkTheme.js';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const functionSource = name => {
  const start = page.indexOf(`function ${name}(`);
  const end = page.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start, name);
  return page.slice(start, end);
};
const compile = code => ts.transpileModule(code, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ids = new Function(`${functionSource('normalizeTrainId')}\n${functionSource('padTrainId')}\nreturn {normalizeTrainId,padTrainId};`)();
const rowSource = compile(functionSource('RoadRow'));
const rowHelpers = {
  ...ids, getStablingRemarkTheme,
  getPrimaryStablingRequest: items => items[0] || null,
  getStablingRequestVisual: () => ({ accent: '#4f8ef7' }), hexToRgba: () => 'rgba(79,142,247,0.11)',
  HiddenRequestRemarks: () => null, ActionTooltip: ({ children }) => children,
  getMainStablingRemarkLabel: item => item.badgeText, getMainStablingRemarkPillStyle: () => ({}),
  RoadLabelCell: ({ label }) => React.createElement('td', {}, label),
};
const RoadRow = new Function('React', 'helpers', `const {${Object.keys(rowHelpers).join(',')}}=helpers; ${rowSource}\nreturn RoadRow;`)(React, rowHelpers);
const sectionSource = functionSource('StablingSection');
const compiledSection = compile(sectionSource);
function sectionHarness() {
  const effects = [], copied = [], stateUpdates = [];
  const helpers = {
    ...ids, findStablingTrainLocations: findReqTrainLocations, parseStablingTrainSearch: parseReqTrainSearch, RoadRow,
    useState: initial => [initial, value => stateUpdates.push(value)], useMemo: factory => factory(),
    useEffect: effect => effects.push(effect),
    useClipboardCopyFeedback: () => ({ copyStatuses: {}, copyWithFeedback: async text => copied.push(text) }),
    SectionTitle: ({ title, action }) => React.createElement('header', {}, title, action),
    ActionTooltip: ({ children }) => children, ClearAllStablingButton: () => null, EmptyCornerCell: () => React.createElement('th'),
    MAIN_STABLING_BUTTON_COPY: {}, MAIN_STABLING_BUTTON_SUCCESS: {}, MAIN_STABLING_BUTTON_PDF: {},
    downloadStablingPicturePdf: () => {},
  };
  const Section = new Function('React', 'helpers', `const {${Object.keys(helpers).join(',')}}=helpers; ${compiledSection}\nreturn StablingSection;`)(React, helpers);
  return { Section, effects, copied, stateUpdates };
}

function depotSamples() {
  const blocks = values => Array.from({ length: 7 }, (_, index) => ({ trainId: values[index] || '' }));
  return [{
    depot: 'west', depotLabel: 'West Depot', roads: ['WD-ST15', 'WD-ST14'],
    data: { 'WD-ST15': blocks({ 6: '01', 5: '04' }), 'WD-ST14': blocks({ 3: 'T03' }) },
    blockIndices: [6, 5, 4, 3, 2, 1, 0], blockLabels: ['BLOCK 7', 'BLOCK 6', 'BLOCK 5', 'BLOCK 4', 'BLOCK 3', 'BLOCK 2', 'BLOCK 1'], labelSide: 'left',
  }, {
    depot: 'east', depotLabel: 'East Depot', roads: ['ED-ST02'], data: { 'ED-ST02': blocks({ 0: 'T02', 1: 'T001' }) },
    blockIndices: [0, 1, 2, 3, 4, 5, 6], blockLabels: ['BLOCK 1', 'BLOCK 2', 'BLOCK 3', 'BLOCK 4', 'BLOCK 5', 'BLOCK 6', 'BLOCK 7'], labelSide: 'right',
  }];
}
function props(config, depots, trainSearch, onTrainSearchChange = () => {}) {
  return { ...config, title: config.depotLabel, trainSearch, onTrainSearchChange, allDepots: depots,
    duplicates: new Set(), maintenanceMap: { T4: [{ badgeText: 'UNFIT' }] }, cellRefs: { current: {} },
    flashingCells: new Set(), onUpdate: () => assert.fail('search must not edit stabling'), onCommit: () => assert.fail('search must not save stabling') };
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children), ...elements(node.props.action)];
}

test('REQ search accepts multiple numeric or T-prefixed IDs without concatenating them', () => {
  for (const input of ['01 02 03', '1,2,3', 'T01; t02 / 03', ' t 001 \n T002\t03 ']) {
    assert.deepEqual(parseReqTrainSearch(input), { trainKeys: ['T1', 'T2', 'T3'], invalidTokens: [] });
  }
  assert.deepEqual(parseReqTrainSearch('01 1 T001,02 T02'), { trainKeys: ['T1', 'T2'], invalidTokens: [] });
  for (const input of ['', '   ', null]) assert.deepEqual(parseReqTrainSearch(input), { trainKeys: [], invalidTokens: [] });
});

test('partial words, ranges, out-of-fleet IDs and concatenated IDs cannot match real trains', () => {
  const parsed = parseReqTrainSearch('01 abc 0 48 301 T99 1-3 1a 0102 02');
  assert.deepEqual(parsed.trainKeys, ['T1', 'T2']);
  assert.deepEqual(parsed.invalidTokens, ['ABC', '0', '48', '301', 'T99', '1-3', '1A', '0102']);
  assert.deepEqual(parseReqTrainSearch('47 T047').trainKeys, ['T47']);
});

test('cross-depot results identify each train and every location using actual block orientations', () => {
  const depots = depotSamples();
  const before = structuredClone(depots);
  assert.deepEqual(findReqTrainLocations(parseReqTrainSearch('02 01 47').trainKeys, depots), [
    { trainKey: 'T2', depotLabel: 'East Depot', road: 'ED-ST02', blockLabel: 'BLOCK 1' },
    { trainKey: 'T1', depotLabel: 'West Depot', road: 'WD-ST15', blockLabel: 'BLOCK 7' },
    { trainKey: 'T1', depotLabel: 'East Depot', road: 'ED-ST02', blockLabel: 'BLOCK 2' },
  ]);
  assert.deepEqual(depots, before);
  assert.deepEqual(findReqTrainLocations([], depots), []);
  assert.deepEqual(findReqTrainLocations(['T1'], []), []);
});

test('results update when trains move or disappear without changing the search', () => {
  const depots = depotSamples();
  const keys = parseReqTrainSearch('01 02').trainKeys;
  depots[1].data['ED-ST02'][0].trainId = '';
  depots[0].data['WD-ST14'][2].trainId = '02';
  assert.deepEqual(findReqTrainLocations(keys, depots).at(-1), {
    trainKey: 'T2', depotLabel: 'West Depot', road: 'WD-ST14', blockLabel: 'BLOCK 3',
  });
  depots[0].data['WD-ST14'][2].trainId = '';
  assert.ok(findReqTrainLocations(keys, depots).every(result => result.trainKey !== 'T2'));
});

test('both actual depot panels highlight all matching cards while retaining other trains, remarks and empty blocks', () => {
  const depots = depotSamples();
  const before = structuredClone(depots);
  for (const config of depots) {
    const { Section } = sectionHarness();
    const html = renderToStaticMarkup(React.createElement(Section, props(config, depots, '01 02 47')));
    assert.equal((html.match(/class="theme-stabling-train-card[^"\n]*is-search-match/g) || []).length, config.depot === 'west' ? 1 : 2);
    assert.equal((html.match(/class="theme-stabling-train-card/g) || []).length, config.roads.length * 7);
    assert.match(html, /47 not found in either depot/);
    assert.match(html, /West Depot/);
    assert.match(html, /East Depot/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.doesNotMatch(html, /Use train numbers/);
    if (config.depot === 'west') {
      assert.match(html, /data-stabling-train="T4"/);
      assert.match(html, /is-unfit/);
      assert.match(html, /UNFIT/);
      assert.match(html, /data-stabling-train="T3"/);
    }
  }
  assert.deepEqual(depots, before);
});

test('input, Clear and Escape use the shared query setter; copying still includes every train', async () => {
  const depots = depotSamples();
  const harness = sectionHarness();
  const changes = [];
  const tree = harness.Section(props(depots[0], depots, '01 02', value => changes.push(value)));
  const nodes = elements(tree);
  const input = nodes.find(node => node.type === 'input' && node.props.placeholder?.startsWith('Search trains'));
  assert.equal(input.props.maxLength, 512);
  assert.match(input.props['aria-label'], /West Depot.*both depots/);
  input.props.onChange({ target: { value: '03 04' } });
  input.props.onKeyDown({ key: 'Escape' });
  nodes.find(node => node.props['aria-label'] === 'Clear train search').props.onClick();
  assert.deepEqual(changes, ['03 04', '', '']);
  await nodes.find(node => node.props['data-copy-state'] === 'idle').props.onClick();
  assert.equal(harness.copied[0], 'STABLING 15 : T01, T04\nSTABLING 14 : T03');
});

test('all-invalid and mixed queries give guidance without losing valid matches; clearing removes all highlights', () => {
  const depots = depotSamples();
  for (const [query, matches, guidance] of [['abc 99', 0, true], ['01, abc', 1, true], ['', 0, false]]) {
    const { Section } = sectionHarness();
    const html = renderToStaticMarkup(React.createElement(Section, props(depots[0], depots, query)));
    assert.equal((html.match(/class="theme-stabling-train-card[^"\n]*is-search-match/g) || []).length, matches);
    assert.equal(html.includes('Use train numbers 01–47'), guidance);
    if (!query) assert.doesNotMatch(html, /not found in either depot|role="status"/);
  }
});

test('mobile road selection recognizes any searched train and old single-highlight row callers remain supported', () => {
  const depots = depotSamples();
  const harness = sectionHarness();
  harness.Section(props(depots[0], depots, '03 47'));
  harness.effects.forEach(effect => effect());
  assert.deepEqual(harness.stateUpdates, ['WD-ST14']);
  for (const searchHighlight of ['T1', new Set(['T1', 'T2'])]) {
    const html = renderToStaticMarkup(React.createElement(RoadRow, { ...props(depots[0], depots, ''), blocks: [{ trainId: '01' }],
      blockIndices: [0], label: 'WD-ST15', roadIndex: 0, totalRows: 1, searchHighlight }));
    assert.match(html, /is-search-match/);
  }
});

test('production and local preview share the query between REQ panels and use the same parser as INS and PST', () => {
  const panels = page.match(/<StablingSection\b[\s\S]*?\n\s*\/>/g) || [];
  assert.equal(panels.length, 2);
  for (const panel of panels) {
    assert.match(panel, /trainSearch=\{reqTrainSearch\}/);
    assert.match(panel, /onTrainSearchChange=\{setReqTrainSearch\}/);
  }
  assert.match(sectionSource, /searchHighlight=\{searchTrainKeys\}/);
  assert.doesNotMatch(sectionSource, /data\[road\].*\.filter\(.*search|onUpdate\(.*search/i);
  for (const name of ['PSTStablingSection', 'InsertionStablingSection']) assert.match(functionSource(name), /parseStablingTrainSearch/);
  const preview = readFileSync(new URL('../scripts/preview-compact-slate.jsx', import.meta.url), 'utf8');
  assert.match(preview, /trainSearch=\{reqTrainSearch\}/);
  assert.match(preview, /onTrainSearchChange=\{setReqTrainSearch\}/);
});
