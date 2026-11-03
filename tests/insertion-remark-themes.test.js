import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowRight, Plus, Undo2 } from 'lucide-react';
import postcss from 'postcss';
import ts from 'typescript';
import { getStablingRemarkTheme } from '../src/lib/reqStablingRemarkTheme.js';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const cell = page.slice(page.indexOf('function InsertionCell('), page.indexOf('function InsertionStablingSection('));
const compiled = ts.transpileModule(cell, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const css = postcss.parse(readFileSync(new URL('../src/reqRemarkThemes.css', import.meta.url), 'utf8'));
const normalizeTrainId = value => value ? `T${Number(String(value).replace(/\D/g, ''))}` : '';
const activeEntry = page.slice(page.indexOf('function getActiveInsertionEntryForCell('), page.indexOf('function isInsertionLogEntryActiveForStabling('));
const trackingId = page.slice(page.indexOf('function getInsertionTrackingId('), page.indexOf('const INSERTION_PANEL_COLORS'));
const actualHelpers = new Function('normalizeTrainId', `${activeEntry}\n${trackingId}\nreturn {getActiveInsertionEntryForCell,getInsertionTrackingId};`)(normalizeTrainId);
const reference = { bg: '#3f2456', border: '#c084fc', color: '#faf5ff', lightColor: '#3b0764', shadow: 'none' };
const helpers = {
  ...actualHelpers, getStablingRemarkTheme, normalizeTrainId, WEST_ROADS: ['WD-ST15'],
  getInsertionRemarkStyle: () => null,
  getInsertionAssistRemarkStyle: label => label === 'ED' ? reference : null,
  getInsertionTidReferenceTooltipLabel: () => 'Departure time: 05:00 · ED',
  requestColorRgb: () => ({ r: 79, g: 142, b: 247 }),
  getEastInsertionKeywordRemarkLabel: () => '',
  getMainStablingRemarkLabel: item => item.badgeText || item.displayType || item.typeKey || '',
  getMainStablingRemarkPillStyle: () => ({ background: '#a3e635' }),
  getInsertionTidBigPillStyle: style => style || {},
  isManualInsertionActionRemark: () => false,
  isTimePast: time => time === '00:01',
  padTrainId: value => value,
  formatTrainNumberOnly: value => String(value).replace(/\D/g, '').padStart(2, '0'),
  getStablingRequestVisual: () => ({ accent: '#4f8ef7' }),
  getRequestAccent: () => '#4f8ef7',
  hexToRgba: () => 'rgba(79,142,247,0.11)',
  ActionTooltip: ({ children }) => children,
  HiddenRequestRemarks: () => null,
  Undo2, ArrowRight, Plus,
  INSERTION_PANEL_COLORS: { cardBorder: '#27475d', gridLine: '#183449' },
  EAST_INSERTION_KEYWORD_REMARK_STYLES: { SWEEP: reference },
  EAST_INSERTION_TIME_PILL_STYLE: reference,
  getEastInsertionPillStyle: () => ({}),
};
const InsertionCell = new Function('React', 'helpers', `
  const {useState,useRef,useEffect}=React;
  const {${Object.keys(helpers).join(',')}}=helpers;
  ${compiled}\nreturn InsertionCell;`)(React, helpers);

function renderCell(depot, remarks, overrides = {}) {
  const road = depot === 'west' ? 'WD-ST15' : 'ED-ST02';
  return renderToStaticMarkup(React.createElement('table', null, React.createElement('tbody', null,
    React.createElement('tr', null, React.createElement(InsertionCell, {
      block: { trainId: '45' }, bi: 0, road, labelSide: depot === 'west' ? 'left' : 'right',
      maintenanceMap: { T45: remarks }, insertionLog: [], tidInput: '', onTidChange() {}, onInsertionTick() {},
      getTidScheduledTime: () => '05:00', getTidAssistRemark: () => 'ED', ...overrides,
    })))));
}

test('both actual INS depot cards use the same three REQ themes and retain their remark and TID controls', () => {
  for (const depot of ['west', 'east']) {
    for (const [label, theme] of [['UNFIT by TSM', 'unfit'], ['FIT but LEAST PRIORITY', 'least-priority'], ['Deep Cleaning', 'deep-clean']]) {
      const html = renderCell(depot, [{ badgeText: 'Wash 4-Nov' }, { badgeText: label }]);
      assert.match(html, new RegExp(`has-remark-theme is-${theme}`));
      assert.ok(html.includes(label));
      assert.match(html, /Wash 4-Nov/);
      assert.match(html, new RegExp(`data-stabling-depot="${depot}"`));
      assert.match(html, /theme-insertion-card-divider/);
      assert.match(html, /theme-insertion-tracking-footer is-editing/);
      assert.match(html, /placeholder="Tracking ID"/);
      assert.match(html, /Insert T45 without a Tracking ID/);
      assert.equal((html.match(/class="theme-stabling-remark /g) || []).length, 2);
      assert.match(html, /background:#a3e635/);
    }
  }
});

test('INS checks the full active remark list, uses UNFIT priority, and restores neutral cards when remarks are removed', () => {
  const remarks = ['Wash 4-Nov', 'RST PM', 'Deep Clean', 'FIT but LEAST PRIORITY', 'Unfit by TSM'].map(badgeText => ({ badgeText }));
  const before = structuredClone(remarks);
  assert.match(renderCell('west', remarks), /has-remark-theme is-unfit/);
  assert.match(renderCell('east', [...remarks].reverse()), /has-remark-theme is-unfit/);
  assert.match(renderCell('west', remarks.slice(0, -1)), /has-remark-theme is-least-priority/);
  assert.match(renderCell('west', remarks.slice(0, -2)), /has-remark-theme is-deep-clean/);
  assert.doesNotMatch(renderCell('west', remarks.slice(0, 2)), /has-remark-theme/);
  assert.doesNotMatch(renderCell('east', []), /has-remark-theme/);
  assert.deepEqual(remarks, before);
});

test('INS hidden, empty and manually hidden elapsed cards do not gain a visible theme', () => {
  for (const depot of ['west', 'east']) {
    const road = depot === 'west' ? 'WD-ST15' : 'ED-ST02';
    assert.doesNotMatch(renderCell(depot, [{ badgeText: 'UNFIT' }], { block: { trainId: '' } }), /has-remark-theme/);
    assert.doesNotMatch(renderCell(depot, [], { hiddenMaintenanceMap: { T45: [{ badgeText: 'UNFIT' }] } }), /has-remark-theme/);
    const expired = renderCell(depot, [{ badgeText: 'UNFIT' }], {
      hideElapsedTid: true, insertionLog: [{ key: `ins-${road}-0`, trainKey: 'T45', tid: 101, time: '00:01' }],
    });
    assert.match(expired, /is-expired/);
    assert.doesNotMatch(expired, /has-remark-theme/);
  }
});

test('INS completion and Tracking ID reference pills remain intact alongside remark themes', () => {
  for (const depot of ['west', 'east']) {
    const road = depot === 'west' ? 'WD-ST15' : 'ED-ST02';
    const html = renderCell(depot, [{ badgeText: 'Deep Clean' }], {
      insertionLog: [{ key: `ins-${road}-0`, trainKey: 'T45', tid: 101, time: '05:02' }],
    });
    assert.match(html, /has-remark-theme is-deep-clean/);
    assert.match(html, /is-complete/);
    assert.match(html, /theme-insertion-tracking-footer is-complete has-reference-style/);
    assert.match(html, /--insertion-tracking-reference-bg:#3f2456/);
    assert.match(html, /<strong>101<\/strong>/);
    assert.match(html, /Undo this train insertion|Reset this card/);
    const ownRemark = renderCell(depot, [], { insertionLog: [{ key: `ins-${road}-0`, trainKey: 'T45', remark: 'Deep Clean', time: '05:02' }] });
    assert.match(ownRemark, /has-remark-theme is-deep-clean/);
  }
});

test('duplicate, search and drag/drop markers still coexist with INS remark classes', () => {
  const remarks = [{ badgeText: 'UNFIT' }];
  const duplicate = renderCell('east', remarks, {
    insertionLog: [{ key: 'ins-ED-ST02-0', trainKey: 'T45', tid: 101, time: '05:02' }],
    isWeekdayActive: true, duplicateTidKeys: new Set(['101']),
  });
  assert.match(duplicate, /is-unfit[^"\n]*is-duplicate/);
  assert.match(renderCell('west', remarks, { isSearchMatch: true }), /is-unfit[^"\n]*is-search-match/);
  assert.match(renderCell('west', remarks, { isTidDragActive: true, isTidDropHovered: true }), /is-unfit[^"\n]*is-tid-drag-active is-tid-drop-hovered/);
});

test('INS shares exact REQ palettes only in dark mode and yields surfaces/dividers to higher-priority states', () => {
  const rules = [];
  css.walkRules(rule => rules.push(rule));
  assert.equal(rules.length, 5);
  for (const rule of rules) {
    assert.equal(rule.selectors.length, 2);
    assert.match(rule.selectors[0], /^html\[data-app-theme="dark"\].*data-active-page="stabling"/);
    assert.match(rule.selectors[1], /^html\[data-app-theme="dark"\].*data-active-page="insertion"/);
    assert.doesNotMatch(rule.selector, /theme-pst|tracking-footer|tid-input/);
  }
  for (const rule of [rules[0], rules[4]]) {
    for (const flag of ['is-duplicate', 'is-search-match', 'is-expired', 'is-tid-drag-active', 'is-tid-drop-hovered']) {
      assert.ok(rule.selectors[1].includes(`:not(.${flag})`), flag);
    }
  }
  assert.ok(rules[4].selectors[1].endsWith('> .theme-insertion-card-header > .theme-insertion-card-divider'));
});
