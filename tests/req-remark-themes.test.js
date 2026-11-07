import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import ts from 'typescript';
import { getStablingRemarkTheme } from '../src/lib/reqStablingRemarkTheme.js';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const css = postcss.parse(readFileSync(new URL('../src/reqRemarkThemes.css', import.meta.url), 'utf8'));
const rowSource = page.slice(page.indexOf('function RoadRow('), page.indexOf('function RoadLabelCell('));
const compiled = ts.transpileModule(rowSource, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
// Render the production RoadRow with unrelated layout/tooltip dependencies
// replaced by inert fixtures. The real remark detector is used unchanged.
const RoadRow = new Function('React', 'helpers', `
  const {getStablingRemarkTheme, normalizeTrainId, getPrimaryStablingRequest,
    getStablingRequestVisual, hexToRgba, HiddenRequestRemarks, ActionTooltip,
    getMainStablingRemarkLabel, getMainStablingRemarkPillStyle, RoadLabelCell}=helpers;
  ${compiled}\nreturn RoadRow;`)(React, {
  getStablingRemarkTheme,
  normalizeTrainId: value => value ? `T${Number(String(value).replace(/\D/g, ''))}` : '',
  getPrimaryStablingRequest: items => items[0] || null,
  getStablingRequestVisual: () => ({ accent: '#4f8ef7' }),
  hexToRgba: () => 'rgba(79,142,247,0.11)',
  HiddenRequestRemarks: () => null,
  ActionTooltip: ({ children }) => children,
  getMainStablingRemarkLabel: item => item.badgeText || item.displayType || item.typeKey,
  getMainStablingRemarkPillStyle: () => ({ background: '#a3e635' }),
  RoadLabelCell: () => null,
});

function renderRow(depot = 'west', remarks = [], overrides = {}) {
  return renderToStaticMarkup(React.createElement(RoadRow, {
    depot, roadIndex: 0, totalRows: 1, label: depot === 'west' ? 'WD-ST15' : 'ED-ST02',
    labelSide: depot === 'west' ? 'left' : 'right', blocks: [{ trainId: '45' }],
    blockIndices: [0], duplicates: new Set(), maintenanceMap: { T45: remarks },
    cellRefs: { current: {} }, flashingCells: new Set(), ...overrides,
  }));
}

test('UNFIT matches complete words in any displayed remark, regardless of case or request order', () => {
  for (const remark of ['UNFIT', 'unfit', 'UNFIT by TSM', 'Workshop /Unfit', 'UNFIT / PARK MODE']) {
    assert.equal(getStablingRemarkTheme([{ badgeText: 'Wash 4-Nov' }, { badgeText: remark }]), 'unfit', remark);
  }
  assert.equal(getStablingRemarkTheme([{ displayType: 'Unfit' }]), 'unfit');
  assert.equal(getStablingRemarkTheme([{ typeKey: 'UNFIT' }]), 'unfit');
  for (const items of [[], null, undefined, {}, ['FIT'], ['UNFITNESS'], ['priority'], ['clean'], ['deep cleaner'], [{ badgeText: 'RST PM' }], [null]]) {
    assert.equal(getStablingRemarkTheme(items), '');
  }
});

test('least-priority and deep-clean remark spellings select their approved themes', () => {
  for (const label of ['FIT but LEAST PRIORITY', 'least priority', 'FIT - LEAST-PRIORITY']) {
    assert.equal(getStablingRemarkTheme([{ badgeText: 'Wash 4-Nov' }, { badgeText: label }]), 'least-priority', label);
  }
  for (const label of ['DEEP CLEAN', 'Deep Cleaning', 'deep-clean', 'DEEPCLEAN']) {
    assert.equal(getStablingRemarkTheme([{ displayType: label }]), 'deep-clean', label);
  }
});

test('APU and APU ALARM use the UNFIT surface, but unrelated APU remarks do not', () => {
  for (const label of ['APU', ' apu ', '(APU)', 'APU ALARM', 'apu alarm', 'APU-ALARM', 'APU_ALARM', 'APU ALARM - RST CM']) {
    for (const item of [label, { badgeText: label }, { displayType: label }, { typeKey: label }]) {
      assert.equal(getStablingRemarkTheme([item]), 'unfit', label);
    }
  }
  for (const label of ['APU no load', 'APU TEST', 'APU123', 'CAPU', 'APU ALARMING', 'NOTAPU ALARM']) {
    assert.equal(getStablingRemarkTheme([label]), '', label);
  }
});

test('requested technical-failure and APU mismatch spellings share the UNFIT visual surface', () => {
  for (const label of ['CC Technical Failure', 'CC tehnical failure', 'CC TECHNICAL', 'CC TEHNICAL', 'Technical Failure', 'tehnical failure', 'CC-Technical / Failure in ML', 'APU Mismatch', 'APU Missmatch', 'APU_MISMATCH', 'APU MIS - RST CM', 'APU missmatch alarm']) {
    for (const item of [label, { badgeText: label }, { displayType: label }, { typeKey: label }]) {
      assert.equal(getStablingRemarkTheme([item]), 'unfit', label);
    }
    const items = [{ badgeText: 'DEEP CLEAN' }, { badgeText: 'FIT but LEAST PRIORITY' }, { badgeText: label }];
    const before = structuredClone(items);
    assert.equal(getStablingRemarkTheme(items), 'unfit');
    assert.equal(getStablingRemarkTheme([...items].reverse()), 'unfit');
    assert.deepEqual(items, before);
  }
  for (const label of ['Technical', 'TECHNICAL INSPECTION', 'Failure', 'CC TEST', 'CC TECHNICALLY', 'TECHNICAL FAILURENESS', 'APU MISREAD', 'NOTAPU MISMATCH']) {
    assert.equal(getStablingRemarkTheme([label]), '', label);
  }
});

test('bare APU retains warning priority without changing requests or a separate mismatch remark', () => {
  const items = ['APU MISMATCH', 'Deep Clean', 'FIT but LEAST PRIORITY', 'APU'].map(badgeText => ({ badgeText }));
  const before = structuredClone(items);
  assert.equal(getStablingRemarkTheme(items), 'unfit');
  assert.equal(getStablingRemarkTheme([...items].reverse()), 'unfit');
  assert.equal(getStablingRemarkTheme(items.slice(0, -1)), 'unfit');
  assert.equal(getStablingRemarkTheme(items.slice(1, -1)), 'least-priority');
  assert.deepEqual(items, before);
});

test('APU ALARM and mismatch retain warning priority without mutating requests', () => {
  const items = ['APU MISMATCH', 'Deep Clean', 'FIT but LEAST PRIORITY', 'APU ALARM'].map(badgeText => ({ badgeText }));
  const original = structuredClone(items);
  assert.equal(getStablingRemarkTheme(items), 'unfit');
  assert.equal(getStablingRemarkTheme([...items].reverse()), 'unfit');
  assert.equal(getStablingRemarkTheme(items.slice(0, -1)), 'unfit');
  assert.equal(getStablingRemarkTheme(items.slice(1, -1)), 'least-priority');
  assert.equal(getStablingRemarkTheme(items.slice(1, 2)), 'deep-clean');
  assert.deepEqual(items, original);
});

test('UNFIT takes visual priority over least priority and deep clean without modifying requests', () => {
  const items = [{ badgeText: 'Deep Clean' }, { badgeText: 'FIT but LEAST PRIORITY' }, { badgeText: 'Unfit by TSM' }];
  const original = JSON.stringify(items);
  assert.equal(getStablingRemarkTheme(items), 'unfit');
  assert.equal(getStablingRemarkTheme([...items].reverse()), 'unfit');
  assert.equal(getStablingRemarkTheme(items.slice(0, 2)), 'least-priority');
  assert.equal(JSON.stringify(items), original);
});

test('both actual REQ depot cards gain the theme class without recolouring or dropping remark pills', () => {
  for (const depot of ['west', 'east']) {
    for (const [label, theme] of [['UNFIT by TSM', 'unfit'], ['APU', 'unfit'], ['APU ALARM', 'unfit'], ['CC Technical Failure', 'unfit'], ['CC tehnical', 'unfit'], ['tehnical failure', 'unfit'], ['APU Missmatch', 'unfit'], ['FIT but LEAST PRIORITY', 'least-priority'], ['DEEP CLEAN', 'deep-clean']]) {
      const html = renderRow(depot, [{ badgeText: 'RST PM' }, { badgeText: label }]);
      assert.match(html, new RegExp(`class="theme-stabling-train-card[^"\\n]*has-remark-theme is-${theme}`));
      assert.match(html, new RegExp(`data-stabling-depot="${depot}"`));
      assert.match(html, /RST PM/);
      assert.ok(html.includes(label));
      assert.equal((html.match(/class="theme-stabling-remark /g) || []).length, 2);
      assert.match(html, /theme-stabling-card-divider/);
      assert.doesNotMatch(html, /DUPLICATE/);
    }
    assert.doesNotMatch(renderRow(depot, [{ badgeText: 'Wash 4-Nov' }]), /has-remark-theme/);
    assert.doesNotMatch(renderRow(depot, [{ badgeText: 'TECHNICAL INSPECTION' }]), /has-remark-theme/);
  }
});

test('empty cards and hidden remarks do not receive an unrelated theme', () => {
  for (const label of ['UNFIT', 'APU', 'APU ALARM', 'CC Technical Failure', 'CC tehnical', 'tehnical failure', 'APU Missmatch', 'FIT but LEAST PRIORITY', 'Deep Clean']) {
    assert.doesNotMatch(renderRow('west', [{ badgeText: label }], { blocks: [{ trainId: '' }] }), /has-remark-theme/);
    assert.doesNotMatch(renderRow('west', [], { hiddenMaintenanceMap: { T45: [{ badgeText: label }] } }), /has-remark-theme/);
  }
});

test('duplicate, flashing and search markers remain available alongside UNFIT', () => {
  const items = [{ badgeText: 'UNFIT' }];
  assert.match(renderRow('west', items, { duplicates: new Set(['T45']) }), /is-unfit[^"\n]*is-duplicate/);
  assert.match(renderRow('west', items, { duplicates: new Set(['T45']) }), /DUPLICATE/);
  assert.match(renderRow('west', items, { flashingCells: new Set(['west-WD-ST15-0']) }), /DUPLICATE!/);
  assert.match(renderRow('east', items, { searchHighlight: 'T45' }), /is-unfit[^"\n]*is-search-match/);
});

test('all approved palettes are shared by dark REQ/INS cards and yield to existing alerts', () => {
  const rules = [];
  css.walkRules(rule => { rules.push(rule); });
  assert.equal(rules.length, 5);
  for (const rule of rules) {
    assert.equal(rule.selectors.length, 2);
    assert.ok(rule.selectors[0].startsWith('html[data-app-theme="dark"] #root .app-shell[data-active-page="stabling"] .theme-stabling-section '));
    assert.ok(rule.selectors[1].startsWith('html[data-app-theme="dark"] #root .app-shell[data-active-page="insertion"] .theme-insertion-page '));
  }
  for (const rule of [rules[0], rules[4]]) {
    for (const flag of ['is-duplicate', 'is-flashing', 'is-search-match']) assert.ok(rule.selector.includes(`:not(.${flag})`));
    assert.ok(rule.selector.includes('.has-train.has-remark-theme'));
  }
  const card = Object.fromEntries(rules[0].nodes.map(({ prop, value }) => [prop, value]));
  assert.equal(card.background, 'var(--req-remark-background)');
  assert.equal(card.border, '1.5px solid var(--req-remark-border)');
  assert.equal(card['box-shadow'], 'var(--req-remark-shadow)');
  for (const [theme, background, border, glow] of [
    ['unfit', 'linear-gradient(135deg, #2d0a0a, #1a0505)', '#7a5324', '249, 115, 22'],
    ['least-priority', 'linear-gradient(135deg, #24132f, #160c20)', '#a78bfa', '167, 139, 250'],
    ['deep-clean', 'linear-gradient(135deg, #073438, #061e25)', '#2dd4bf', '45, 212, 191'],
  ]) {
    const rule = rules.find(rule => rule.selector.endsWith(`.is-${theme}`));
    assert.ok(rule, theme);
    const values = Object.fromEntries(rule.nodes.map(({ prop, value }) => [prop, value]));
    assert.equal(values['--req-remark-background'], background);
    assert.equal(values['--req-remark-border'], border);
    assert.ok(values['--req-remark-shadow'].includes(`rgba(${glow}, 0.14)`));
    assert.ok(values['--req-remark-divider']);
    assert.ok(rule.nodes.every(({ prop }) => prop.startsWith('--req-remark-')), 'Theme rules only set scoped variables');
  }
  assert.ok(rules[0].nodes.filter(({ prop }) => ['background', 'border', 'box-shadow'].includes(prop)).every(({ important }) => important));
  assert.match(page, /import "\.\.\/reqRemarkThemes\.css";/);
  assert.equal((rowSource.match(/getStablingRemarkTheme\(maintList\)/g) || []).length, 1, 'REQ RoadRow keeps its existing detector');
});
