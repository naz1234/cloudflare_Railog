import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const cellSource = source.slice(source.indexOf('function PSTCell('), source.indexOf('function PSTStablingSection('));
const compiled = ts.transpileModule(`const { useState } = React; ${cellSource}\nreturn PSTCell;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = {
  normalizeTrainId: (value) => value ? `T${Number(String(value).replace(/\D/g, ''))}` : '',
  normalizeRequestIdentity: (value) => value.toUpperCase(),
  getPSTRequestRemarkStyle: () => ({ background: '#233a52', color: '#a8def5' }),
  formatTrainNumberOnly: (value) => value ? String(value).replace(/^T/i, '').padStart(2, '0') : '',
};
const loadCell = (react) => new Function('React', 'helpers', `const { normalizeTrainId, normalizeRequestIdentity, getPSTRequestRemarkStyle, formatTrainNumberOnly } = helpers; ${compiled}`)(react, helpers);
const Cell = loadCell(React);
const noop = () => {};
const baseProps = (depot) => ({
  block: { trainId: '05' }, bi: 0, road: depot === 'west' ? 'WD-ST15' : 'ED-ST02',
  labelSide: depot === 'west' ? 'left' : 'right', isLast: false, isFirstBlock: true, isLastBlock: false,
  maintenanceMap: {}, pstState: {}, prepState: {}, taName: '', stablingEditable: true,
  onPSTTick: noop, onPSTStartTimeChange: noop, onPrepTick: noop, onPrepCompletionTimeChange: noop,
  onTaNameChange: noop, onEditableTrainIdChange: noop,
});
const render = (depot, items, overrides = {}) => renderToStaticMarkup(React.createElement('table', null,
  React.createElement('tbody', null, React.createElement('tr', null, React.createElement(Cell, {
    ...baseProps(depot), maintenanceMap: { T5: items }, ...overrides,
  }))),
));

test('both actual PST depot cards detect APU words across active remark labels and separators', () => {
  for (const depot of ['west', 'east']) {
    for (const label of ['APU', 'apu alarm', 'APU MISMATCH', 'RST CM - APU', 'APU/no load', 'APU_MISMATCH']) {
      const html = render(depot, [{ badgeText: 'Wash 7-Nov' }, { badgeText: label }]);
      assert.match(html, /class="theme-pst-card[^"\n]*has-apu-remark/);
      assert.ok(html.includes(label));
      assert.match(html, /Wash 7-Nov/);
      assert.equal((html.match(/class="theme-pst-request-remark /g) || []).length, 2);
    }
    for (const field of ['badgeText', 'displayType', 'typeKey', 'remark']) {
      assert.match(render(depot, [{ [field]: 'APU alarm' }]), /has-apu-remark/);
    }
  }
});

test('only PST APU remarks flag cards; unrelated keywords, empty blocks and other trains do not', () => {
  for (const items of [[], [null], [{ badgeText: 'UNFIT' }], [{ badgeText: 'DEEP CLEAN' }], [{ badgeText: 'Least Priority' }], [{ badgeText: 'CAPUCHIN' }], [{ badgeText: 'APU123' }], [{ badgeText: 'PST' }]]) {
    assert.doesNotMatch(render('west', items), /has-apu-remark/);
  }
  assert.doesNotMatch(render('west', [{ badgeText: 'APU alarm' }], { block: { trainId: '' } }), /has-apu-remark/);
  assert.doesNotMatch(render('east', [], { maintenanceMap: { T6: [{ badgeText: 'APU alarm' }] }, block: { trainId: '05', extraRemark: 'APU' } }), /has-apu-remark/);
  assert.match(source, /const pstMaintenanceMap = buildMaintenanceMap\(\s*pstRequests\.filter\(\(request\) => request\?\.groupHidden !== true\)/);
});

test('APU detection checks all active PST remarks without changing the two-pill display limit or mutating data', () => {
  const items = [{ badgeText: 'Wash' }, { badgeText: 'RST PM' }, { badgeText: 'APU alarm' }];
  const before = JSON.stringify(items);
  const html = render('west', items);
  assert.match(html, /has-apu-remark/);
  assert.equal((html.match(/class="theme-pst-request-remark /g) || []).length, 2);
  assert.equal(JSON.stringify(items), before);
  assert.doesNotMatch(render('west', items.slice(0, 2)), /has-apu-remark/);
});

test('APU card surfaces preserve every PST/Prep work state, timing field, control and search marker', () => {
  for (const depot of ['west', 'east']) {
    const { road } = baseProps(depot);
    const key = `${road}-0`;
    for (const [overrides, state] of [
      [{}, 'is-normal'],
      [{ pstState: { [key]: { trainKey: 'T5', confirming: true, startTime: '04:00', endTime: '04:06' } } }, 'is-pst-confirming'],
      [{ pstState: { [key]: { trainKey: 'T5', done: true, startTime: '04:00', endTime: '04:06' } } }, 'is-pst-done'],
      [{ prepState: { [key]: { trainKey: 'T5', done: true, endTime: '04:10' } } }, 'is-prep-done'],
    ]) {
      const html = render(depot, [{ badgeText: 'APU alarm' }], { ...overrides, isSearchMatch: true });
      assert.match(html, /theme-pst-card is-search-match/);
      assert.ok(html.includes(`${state} has-apu-remark`));
      assert.match(html, /theme-pst-action-button/);
      assert.match(html, /theme-pst-prep-button/);
      assert.match(html, /data-pst-grid-input="train-id"/);
      const plain = render(depot, [{ badgeText: 'APU alarm' }], overrides).replace('has-apu-remark', '');
      assert.doesNotMatch(plain, /is-unfit/);
      if (state === 'is-pst-done' || state === 'is-pst-confirming') {
        assert.match(html, /value="04:00"/);
        assert.match(html, /04:06/);
      }
      if (state === 'is-prep-done') assert.match(html, /value="04:10"/);
    }
  }
});

test('PST APU styling matches the approved UNFIT palette but is dark/PST-only with no geometry or control overrides', () => {
  const css = postcss.parse(readFileSync(new URL('../src/pstApuRemarkTheme.css', import.meta.url), 'utf8'));
  const reqCss = postcss.parse(readFileSync(new URL('../src/reqRemarkThemes.css', import.meta.url), 'utf8'));
  const rules = [];
  css.walkRules((rule) => rules.push(rule));
  assert.equal(rules.length, 2);
  for (const rule of rules) {
    assert.match(rule.selector, /^html\[data-app-theme="dark"\] #root \.app-shell\[data-active-page="pst"\] \.theme-pst-section \.theme-pst-card\.has-apu-remark:not\(\.is-empty\):not\(\.is-search-match\)/);
    assert.doesNotMatch(rule.selector, /button|time-input|request-remark/);
  }
  const values = Object.fromEntries(rules[0].nodes.filter((node) => node.type === 'decl').map(({ prop, value }) => [prop, value]));
  let unfit;
  reqCss.walkRules((rule) => { if (rule.selector.endsWith('.is-unfit')) unfit = Object.fromEntries(rule.nodes.map(({ prop, value }) => [prop, value])); });
  assert.equal(values.background, unfit['--req-remark-background']);
  assert.equal(values['border-color'], unfit['--req-remark-border']);
  assert.equal(values['box-shadow'].replace(/\s+/g, ''), unfit['--req-remark-shadow'].replace(/\s+/g, ''));
  assert.deepEqual(Object.keys(values).sort(), ['background', 'border-color', 'box-shadow']);
  assert.ok(rules[0].nodes.every(({ important }) => important));
  assert.match(source, /import "\.\.\/pstApuRemarkTheme\.css";/);
});

test('APU styling does not change the PST and Train Prep button callback arguments', () => {
  const InteractiveCell = loadCell({ ...React, useState: () => [false, noop] });
  for (const depot of ['west', 'east']) {
    const calls = [];
    const props = {
      ...baseProps(depot), maintenanceMap: { T5: [{ badgeText: 'APU alarm' }] }, taName: 'Sample TA',
      onPSTTick: (...args) => calls.push(['pst', ...args]),
      onPrepTick: (...args) => calls.push(['prep', ...args]),
    };
    const tree = InteractiveCell(props);
    const buttons = [];
    const walk = (node) => {
      if (!React.isValidElement(node)) return;
      if (node.type === 'button') buttons.push(node);
      React.Children.forEach(node.props.children, walk);
    };
    walk(tree);
    buttons.find((node) => node.props.className.includes('theme-pst-action-button')).props.onClick();
    buttons.find((node) => node.props.className.includes('theme-pst-prep-button')).props.onClick();
    assert.deepEqual(calls, [['pst', props.road, 0, 'T5'], ['prep', props.road, 0, 'T5', 'Sample TA']]);
  }
});
