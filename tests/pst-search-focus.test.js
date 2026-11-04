import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(new URL('../src/pstSlate.css', import.meta.url), 'utf8');
const ast = postcss.parse(css);
const rules = [];
ast.walkRules(rule => rules.push(rule));
const scope = 'html[data-app-theme] #root .app-shell[data-active-page="pst"]';
const inputSelector = `${scope} .theme-pst-search .theme-stabling-search-input:focus-visible`;
const barSelector = `${scope} .theme-pst-search.is-empty:focus-within`;
const input = rules.find(rule => rule.selector === inputSelector);
const bar = rules.find(rule => rule.selector === barSelector);

test('PST search removes only the inner focus outline in the existing desktop theme', () => {
  assert.ok(input);
  assert.equal(input.parent.name, 'media');
  assert.equal(input.parent.params, '(min-width: 768px)');
  assert.deepEqual(input.nodes.map(({ prop, value }) => [prop, value]), [['outline', 'none'], ['outline-offset', '0']]);
  assert.ok(css.indexOf(inputSelector) > css.indexOf(':is(input,button,select):focus-visible'));
});

test('an empty focused search retains a visible outer border in both light and dark themes', () => {
  assert.ok(bar);
  assert.equal(bar.nodes.length, 1);
  assert.equal(bar.nodes[0].prop, 'border-color');
  assert.equal(bar.nodes[0].value, 'var(--pst-slate-focus)');
  assert.equal(bar.nodes[0].important, true);
  assert.match(css, /--pst-slate-focus: #8bb5f6/);
  assert.match(css, /--pst-slate-focus: #396cba/);
  assert.ok(css.indexOf(barSelector) > css.indexOf('.theme-pst-search.is-empty {'));
});

test('PST buttons, train fields and other pages retain their existing focus indicators', () => {
  const general = rules.find(rule => rule.selector.endsWith(':is(input,button,select):focus-visible'));
  assert.ok(general);
  assert.equal(general.nodes.find(decl => decl.prop === 'outline').value, '2px solid var(--pst-slate-focus)');
  assert.equal(input.selector, inputSelector);
  assert.equal(bar.selector, barSelector);
  assert.doesNotMatch(`${input.selector} ${bar.selector}`, /button|select|theme-pst-time-input|theme-pst-ta-input/);
});

test('the fix preserves search dimensions and found, missing and active status colours', () => {
  for (const rule of [input, bar]) {
    assert.doesNotMatch(rule.toString(), /(?:height|width|padding|margin|font|background|display)\s*:/);
  }
  const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  assert.match(source, /className=\{`theme-stabling-search theme-pst-search/);
  assert.match(source, /border: searchFound \? "1.5px solid #facc15" : searchNotFound \? "1.5px solid #ef4444"/);
  assert.match(source, /onChange=\{\(event\) => onTrainSearchChange\?\.\(event.target.value\)\}/);
  assert.match(source, /onClick=\{\(\) => onTrainSearchChange\?\.\(""\)\}/);
  assert.match(source, /title="WEST DEPOT — PST \/ TRAIN PREP"/);
  assert.match(source, /title="EAST DEPOT — PST \/ TRAIN PREP"/);
});
