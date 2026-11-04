import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { findWashTrainMatches, normalizeWashTrainSearch } from '../src/lib/wsh2TrainSearch.js';
import { formatWashTime, groupWashRows, summarizeWashRows, WSH2_LOCATIONS } from '../src/lib/wsh2Records.js';

const rows = [
  { id: 'six-301', trainNumber: 'L3-MV-301', date: '2026-11-06', nextWash: '2026-11-06T08:00', completed: true, hvac: 'ON', revision: 4 },
  { id: 'six-332', trainNumber: 'L3-MV-332', date: '2026-11-06', nextWash: '2026-11-06T08:13', completed: false, hvac: '', revision: 1 },
  { id: 'seven-301', trainNumber: 'L3-MV-301', date: '2026-11-07', nextWash: '2026-11-07T09:00', completed: false, hvac: '', revision: 2 },
  { id: 'seven-347', trainNumber: 'L3-MV-347', date: '2026-11-07', nextWash: '2026-11-07T09:30', completed: false, hvac: '', revision: 1 },
];
const source = readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/wsh2.css', import.meta.url), 'utf8');
const rowSource = source.slice(source.indexOf('function WashRow('), source.indexOf('export default function Wsh2Workspace'));
const compiled = ts.transpileModule(rowSource, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const WashRow = new Function('React', 'formatWashTime', 'WSH2_LOCATIONS', 'Check', 'Loader2', 'Wsh2WashDetailsInput', compiled + '\nreturn WashRow;')(React, formatWashTime, WSH2_LOCATIONS, () => null, () => null, () => null);

test('two-digit search matches vehicle IDs across every uploaded date', () => {
  assert.deepEqual([...findWashTrainMatches(rows, '01')], ['six-301', 'seven-301']);
  assert.deepEqual([...findWashTrainMatches(rows, '32')], ['six-332']);
  assert.deepEqual([...findWashTrainMatches(rows, '47')], ['seven-347']);
});

test('single digits normalize to the same short train number without requiring T', () => {
  assert.equal(normalizeWashTrainSearch('1'), '01');
  assert.equal(normalizeWashTrainSearch(' 09 '), '09');
  assert.deepEqual(findWashTrainMatches(rows, '1'), findWashTrainMatches(rows, '01'));
  assert.match(source, /placeholder="01" value=\{trainSearch\}/);
  assert.match(source, /Use 01–47 · matches are highlighted/);
});

test('invalid, absent and non-train searches highlight nothing without matching suffixes or dates', () => {
  for (const query of ['0', '00', '48', '99', '001', '301', 'T01', 'abc', '-1', '1.0']) {
    assert.equal(normalizeWashTrainSearch(query), null, query);
    assert.equal(findWashTrainMatches(rows, query).size, 0, query);
  }
  assert.equal(findWashTrainMatches([{ id: 'bad', trainNumber: 'L3-MV-1301' }, { id: 'empty', trainNumber: null }], '01').size, 0);
  assert.equal(findWashTrainMatches(rows, '06').size, 0);
});

test('search and clear do not change rows, completion, revision or summary totals', () => {
  const original = structuredClone(rows);
  assert.equal(findWashTrainMatches(rows, '').size, 0);
  assert.equal(findWashTrainMatches(rows, '  ').size, 0);
  findWashTrainMatches(rows, '01');
  assert.deepEqual(rows, original);
  assert.deepEqual(summarizeWashRows(rows), { total: 4, completed: 1, remaining: 3, progress: 25 });
});

test('all date groups and row positions remain rendered for matches and no matches', () => {
  assert.match(source, /\{groups.map\(\(group\)/);
  assert.match(source, /\{group.rows.map\(\(row, index\) => <WashRow[^\n]*index=\{index\} highlighted=\{matchedRowIds.has\(row.id\)\}/);
  assert.doesNotMatch(source, /visibleGroups|visibleRowCount|originalRowIndexes|No wash entries for train|Show all trains/);
  const groups = groupWashRows(rows);
  for (const query of ['01', '32', '46', '']) {
    const matches = findWashTrainMatches(rows, query);
    const rendered = groups.flatMap(group => group.rows.map((row, index) => WashRow({ row, index, highlighted: matches.has(row.id) })));
    assert.equal(rendered.length, rows.length);
    assert.deepEqual(rendered.map(element => element.props.children[0].props.children), [1, 2, 1, 2]);
    assert.equal(rendered.filter(element => element.props.className.includes('wsh2-search-match')).length, matches.size);
  }
});

test('highlighting preserves completed, pending and edit behavior, and clearing removes the highlight', () => {
  let changes;
  const element = WashRow({ row: rows[0], index: 0, highlighted: true, onChange: value => { changes = value; } });
  assert.equal(element.props.className, 'wsh2-completed wsh2-search-match');
  const cells = React.Children.toArray(element.props.children);
  assert.equal(cells[1].props.children.props.children, 'L3-MV-301');
  assert.equal(cells[4].props.children.props['aria-checked'], true);
  cells[4].props.children.props.onClick();
  assert.deepEqual(changes, { completed: false });
  assert.equal(WashRow({ row: rows[0], index: 0 }).props.className, 'wsh2-completed');
  assert.equal(WashRow({ row: rows[1], index: 1 }).props.className, '');
  const pending = WashRow({ row: rows[1], index: 1, highlighted: true, pending: true });
  assert.equal(pending.props.children[4].props.children.props.disabled, true);
});

test('search leaves totals, print, batch and shared sync inputs complete', () => {
  assert.match(source, /const groups = useMemo\(\(\) => groupWashRows\(rows\), \[rows\]\)/);
  assert.match(source, /summarizeWashRows\(rows\)/);
  assert.match(source, /selectWashPrintRows\(rowsRef.current, uploads, selectedIds\)/);
  assert.match(source, /buildWashBatchPlan\(rowsRef.current, uploads, uploadId, date, input\)/);
  assert.match(source, /<Wsh2BatchCompletion rows=\{rows\} uploads=\{uploads\}/);
  assert.match(source, /replaceRows\(data.rows.map/);
  assert.match(source, /changeRow\(row.id, changes, revision\)/);
});

test('search offers clear, Escape, accessible feedback and theme-aware highlights without resizing rows', () => {
  assert.match(source, /role="search" aria-label="Search wash checklist trains"/);
  assert.match(source, /htmlFor="wsh2-train-search"/);
  assert.match(source, /type="search" inputMode="numeric" maxLength=\{2\}/);
  assert.match(source, /aria-describedby="wsh2-train-search-status"/);
  assert.match(source, /event.key === 'Escape'[\s\S]*setTrainSearch\(''\)/);
  assert.match(source, /aria-label="Clear train search"/);
  assert.match(source, /All trains remain visible/);
  assert.match(css, /\.wsh2-train-search \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.wsh2-train-search input::-webkit-search-cancel-button \{ -webkit-appearance: none; \}/);
  assert.match(css, /\.wsh2-workspace \.wsh2-train-search input:focus-visible \{ outline: none; border-color: var\(--wsh-accent\); \}/);
  const highlightRules = [...css.matchAll(/[^{}]*wsh2-search-match[^{}]*\{([^}]*)\}/g)].map(match => match[1]).join(' ');
  assert.match(highlightRules, /background: color-mix\([^;]*var\(--wsh-surface\)/);
  assert.match(highlightRules, /box-shadow: inset/);
  assert.doesNotMatch(highlightRules, /\b(?:padding|margin|height|width|display|opacity)\s*:/);
});
