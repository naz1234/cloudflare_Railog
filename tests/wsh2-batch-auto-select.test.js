import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, Loader2 } from 'lucide-react';
import ts from 'typescript';
import postcss from 'postcss';
import { formatWashDate } from '../src/lib/wsh2Records.js';
import { getWashBatchOptions, getWashBatchSelection, WSH2_BATCH_MAX_INPUT } from '../src/lib/wsh2BatchCompletion.js';

const uploads = [{ id: 'first', fileName: '12-Nov.xlsx' }, { id: 'second', fileName: '13-Nov.xlsx' }];
const row = (train, uploadId = 'first', date = '2026-11-12') => ({
  id: `${uploadId}-${date}-${train}`, trainNumber: `L3-MV-${300 + train}`, sourceUploadId: uploadId, date,
  completed: false, hvac: '', revision: 1,
});
const rows = [row(1), row(2)];
const soleKey = 'first:2026-11-12';
const source = readFileSync(new URL('../src/components/Wsh2BatchCompletion.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace(/^import[^\n]+\n/gm, '').replace('export default function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(initial = {}) {
  const states = [initial.selection || '', initial.input || '', Boolean(initial.submitting), '', ''];
  let stateIndex = 0;
  const effects = [], submissions = [], previews = [];
  const hooks = {
    useState(value) {
      const index = stateIndex++;
      if (states[index] === undefined) states[index] = value;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useMemo: factory => factory(), useEffect: effect => effects.push(effect),
  };
  const Component = new Function('React', 'hooks', 'helpers', `const {useEffect,useMemo,useState}=hooks;
    const {Check,Loader2,formatWashDate,getWashBatchOptions,getWashBatchSelection,WSH2_BATCH_MAX_INPUT}=helpers;
    ${code}\nreturn Wsh2BatchCompletion;`)(React, hooks, {
    Check, Loader2, formatWashDate, getWashBatchOptions, getWashBatchSelection, WSH2_BATCH_MAX_INPUT,
  });
  return {
    submissions, previews,
    render(overrides = {}) {
      stateIndex = 0; effects.length = 0;
      return Component({ rows, uploads: [uploads[0]], busy: false, blocked: false,
        onSubmit: async batch => { submissions.push(batch); return { updatedCount: 2 }; },
        onPreviewChange: preview => previews.push(preview), ...overrides });
    },
    flushEffects: () => effects.forEach(effect => effect()),
    selection: () => states[0],
  };
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
const radios = tree => elements(tree).filter(node => node.type === 'input' && node.props.type === 'radio');
const selectedKey = tree => radios(tree).find(node => node.props.checked)?.props.value || '';
const selectFile = (tree, key) => radios(tree).find(node => node.props.value === key).props.onChange();

test('one current Excel file/date is selected immediately, including after asynchronous loading', () => {
  const options = getWashBatchOptions(rows, [uploads[0]]);
  assert.equal(getWashBatchSelection(options), soleKey);
  const h = harness();
  assert.equal(selectedKey(h.render({ rows: [], uploads: [] })), '');
  h.flushEffects();
  const tree = h.render();
  assert.equal(selectedKey(tree), soleKey);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /type="radio"/);
  assert.equal((html.match(/checked=""/g) || []).length, 1);
  assert.match(html, /<strong>12 NOV 2026<\/strong>/);
  h.flushEffects();
  assert.equal(h.selection(), soleKey);
  assert.deepEqual(h.previews.at(-1), { input: '', uploadId: 'first', date: '2026-11-12' });
  assert.deepEqual(h.submissions, []);
});

test('superseded empty uploads do not prevent auto-selecting the one usable file/date', () => {
  assert.equal(getWashBatchSelection(getWashBatchOptions(rows, uploads)), soleKey);
  assert.equal(getWashBatchOptions(rows, uploads).length, 1);
});

test('multiple files or multiple dates in one workbook require a choice when none is selected', () => {
  for (const [schedule, sources] of [
    [[...rows, row(3, 'second', '2026-11-13')], uploads],
    [[...rows, row(3, 'first', '2026-11-13')], [uploads[0]]],
  ]) {
    const options = getWashBatchOptions(schedule, sources);
    assert.equal(getWashBatchSelection(options), '');
    const h = harness();
    const tree = h.render({ rows: schedule, uploads: sources });
    assert.equal(selectedKey(tree), '');
    h.flushEffects();
    assert.deepEqual(h.previews.at(-1), { input: '', uploadId: '', date: '' });
    assert.deepEqual(h.submissions, []);
  }
});

test('valid manual and automatic selections survive refreshes and newly added files', () => {
  const h = harness();
  let tree = h.render(); h.flushEffects();
  selectFile(tree, soleKey);
  tree = h.render(); h.flushEffects();
  assert.equal(h.selection(), soleKey);
  const schedule = [...rows, row(3, 'second', '2026-11-13')];
  tree = h.render({ rows: schedule, uploads });
  assert.equal(selectedKey(tree), soleKey);
  selectFile(tree, 'second:2026-11-13');
  tree = h.render({ rows: structuredClone(schedule), uploads: structuredClone(uploads) });
  h.flushEffects();
  assert.equal(h.selection(), 'second:2026-11-13');
  assert.equal(selectedKey(tree), 'second:2026-11-13');
  assert.deepEqual(h.previews.at(-1), { input: '', uploadId: 'second', date: '2026-11-13' });
});

test('removed selections cannot submit stale files; only a sole remaining option is auto-selected', () => {
  const options = getWashBatchOptions(rows, [uploads[0]]);
  assert.equal(getWashBatchSelection(options, 'removed:2026-11-10'), soleKey);
  assert.equal(getWashBatchSelection([], soleKey), '');
  const multiple = getWashBatchOptions([...rows, row(3, 'second', '2026-11-13')], uploads);
  assert.equal(getWashBatchSelection(multiple, 'removed:2026-11-10'), '');
  const h = harness({ selection: 'removed:2026-11-10' });
  assert.equal(selectedKey(h.render()), soleKey);
  h.flushEffects();
  assert.equal(h.selection(), soleKey);
});

test('automatic selection scopes typing highlights and submission without completing anything automatically', async () => {
  const h = harness({ input: '01 02' });
  const before = structuredClone(rows);
  let tree = h.render(); h.flushEffects();
  assert.deepEqual(h.previews.at(-1), { input: '01 02', uploadId: 'first', date: '2026-11-12' });
  assert.deepEqual(h.submissions, []);
  assert.deepEqual(rows, before);
  await elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.submissions, [{ input: '01 02', uploadId: 'first', date: '2026-11-12' }]);
  tree = h.render(); h.flushEffects();
  assert.equal(selectedKey(tree), soleKey);
  assert.equal(elements(tree).find(node => node.type === 'textarea').props.value, '');
  assert.deepEqual(h.previews.at(-1), { input: '', uploadId: 'first', date: '2026-11-12' });
  assert.deepEqual(rows, before);
});

test('selection never bypasses loading, failed-sync or submitting guards', async () => {
  for (const flags of [{ busy: true }, { blocked: true }, { submitting: true }]) {
    const h = harness({ input: '01 02', ...flags });
    const tree = h.render(flags);
    h.flushEffects();
    assert.equal(elements(tree).find(node => node.type === 'fieldset').props.disabled, true);
    assert.ok(radios(tree).every(node => node.props.disabled));
    assert.equal(elements(tree).find(node => node.props.type === 'submit').props.disabled, true);
    await elements(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(h.submissions, []);
  }
});

test('batch file/date uses accessible native single-choice inputs with tick rows and no dropdown', () => {
  const h = harness();
  const tree = h.render();
  const controls = radios(tree);
  assert.equal(controls.length, 1);
  assert.equal(controls[0].props.name, 'wsh2-batch-file-date');
  assert.match(controls[0].props['aria-label'], /12 NOV 2026 — 12-Nov.xlsx \(2 trains\)/);
  const group = elements(tree).find(node => node.props.role === 'radiogroup');
  assert.equal(group.props['aria-label'], 'Batch wash Excel file and date');
  assert.equal(elements(tree).find(node => node.type === 'legend').props.children, 'Excel file / date');
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /<select|<option|type="checkbox"/);
  assert.match(html, /class="wsh2-batch-file-choice is-selected"/);
  assert.match(html, /class="wsh2-batch-file-tick" aria-hidden="true"/);
  assert.match(html, /12-Nov.xlsx · 2 trains/);
});

test('ticking another file or date moves the single selection and updates highlight scope without submitting', () => {
  const h = harness({ input: '01 02' });
  const schedule = [...rows, row(3, 'second', '2026-11-13'), row(4, 'first', '2026-11-14')];
  const before = structuredClone(schedule);
  let tree = h.render({ rows: schedule, uploads });
  assert.equal(radios(tree).length, 3);
  assert.equal(selectedKey(tree), '');
  assert.equal(new Set(radios(tree).map(node => node.props.name)).size, 1);
  for (const key of [soleKey, 'second:2026-11-13', 'first:2026-11-14', 'first:2026-11-14']) {
    selectFile(tree, key);
    tree = h.render({ rows: schedule, uploads }); h.flushEffects();
    assert.equal(radios(tree).filter(node => node.props.checked).length, 1);
    assert.equal(selectedKey(tree), key);
    const [uploadId, date] = key.split(':');
    assert.deepEqual(h.previews.at(-1), { input: '01 02', uploadId, date });
    assert.deepEqual(h.submissions, []);
  }
  assert.deepEqual(schedule, before);
});

test('empty and removed file/date lists cannot retain a checked radio', () => {
  const h = harness({ selection: soleKey });
  const tree = h.render({ rows: [], uploads: [] }); h.flushEffects();
  assert.equal(radios(tree).length, 0);
  assert.equal(h.selection(), '');
  assert.match(renderToStaticMarkup(tree), /No Excel file\/date available yet\./);
  assert.equal(elements(tree).find(node => node.props.type === 'submit').props.disabled, true);
  assert.deepEqual(h.submissions, []);
});

test('tick row styles remain theme-aware, keyboard-focusable, wrapping and phone-sized', () => {
  const css = postcss.parse(readFileSync(new URL('../src/wsh2.css', import.meta.url), 'utf8'));
  const rules = [];
  css.walkRules(rule => rules.push(rule));
  const rowRule = rules.find(rule => rule.selector === '.wsh2-workspace .wsh2-batch-file-choice');
  const values = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  assert.equal(values(rowRule).background, 'var(--wsh-control)');
  assert.equal(values(rowRule).color, 'var(--wsh-text)');
  assert.equal(values(rowRule)['min-width'], '0');
  const selected = rules.find(rule => rule.selector === '.wsh2-workspace .wsh2-batch-file-choice.is-selected');
  assert.equal(values(selected)['border-color'], 'var(--wsh-good)');
  assert.ok(rules.some(rule => rule.selector.endsWith('.wsh2-batch-file-choice:focus-within')));
  const native = rules.find(rule => rule.selector.endsWith('.wsh2-batch-file-choice input[type="radio"]'));
  assert.equal(values(native).opacity, '0');
  assert.equal(values(native).width, '100%');
  assert.equal(values(native).height, '100%');
  assert.equal(values(native).display, undefined);
  assert.equal(values(native)['pointer-events'], undefined);
  const phone = rules.find(rule => rule.selector === '.wsh2-workspace .wsh2-batch-file-choice' && rule.parent.type === 'atrule');
  assert.equal(phone.parent.params, '(max-width: 767px)');
  assert.equal(values(phone)['min-height'], '44px');
  assert.ok(rules.some(rule => rule.selector.endsWith('.wsh2-batch-file-info > span') && values(rule)['overflow-wrap'] === 'anywhere'));
});
