import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { groupWashRows, validateWashChanges } from '../src/lib/wsh2Records.js';

const source = readFileSync(new URL('../src/components/Wsh2PendingWashSummary.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace('export default function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const PendingSummary = new Function('React', `${compiled}\nreturn Wsh2PendingWashSummary;`)(React);
const render = (rows) => renderToStaticMarkup(React.createElement(PendingSummary, { rows }));

const screenshotRows = [32, 46, 37, 31, 35, 44, 8, 9, 45, 29, 15, 1, 6].map((train, index) => ({
  id: `2026-11-12_L3-MV-${300 + train}`, trainNumber: `L3-MV-${300 + train}`, date: '2026-11-12',
  nextWash: `2026-11-12T${String(8 + index).padStart(2, '0')}:10`,
  completed: ![32, 37, 44, 8, 15, 6].includes(train), hvac: '', washDetails: '',
}));

test('each date shows its pending wash count and short train numbers in schedule order', () => {
  const rows = structuredClone(screenshotRows).reverse();
  const before = structuredClone(rows);
  const [group] = groupWashRows(rows);
  const html = render(group.rows);
  assert.match(html, /Pending wash \(6\):/);
  assert.match(html, /<span>32, 37, 44, 08, 15, 06<\/span>/);
  assert.doesNotMatch(html, /L3-MV-|>46|>31/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.deepEqual(rows, before);
});

test('individual saves, batch completion and unchecking Done update the derived summary', () => {
  let rows = structuredClone(screenshotRows);
  rows = rows.map(row => row.trainNumber === 'L3-MV-332' ? { ...row, ...validateWashChanges({ completed: true }) } : row);
  assert.match(render(rows), /Pending wash \(5\):<\/strong><span>37, 44, 08, 15, 06/);
  rows = rows.map(row => ['L3-MV-337', 'L3-MV-344'].includes(row.trainNumber) ? { ...row, ...validateWashChanges({ completed: true }) } : row);
  assert.match(render(rows), /Pending wash \(3\):<\/strong><span>08, 15, 06/);
  rows = rows.map(row => row.trainNumber === 'L3-MV-332' ? { ...row, ...validateWashChanges({ completed: false }) } : row);
  assert.match(render(rows), /Pending wash \(4\):<\/strong><span>32, 08, 15, 06/);
});

test('only Done determines pending wash, not HVAC, location, or manually typed wash details', () => {
  const rows = [{ ...screenshotRows[0], hvac: 'ON', location: 'MAINT', washDetails: 'Full / ED' }];
  assert.match(render(rows), /Pending wash \(1\):<\/strong><span>32<\/span>/);
  assert.match(render([{ ...rows[0], completed: true, hvac: '', washDetails: '' }]), /All trains completed wash\./);
});

test('shared refresh values replace the summary and dates remain independent', () => {
  const tomorrow = { ...screenshotRows[0], id: 'tomorrow', trainNumber: 'L3-MV-302', date: '2026-11-13', nextWash: '2026-11-13T08:10' };
  const groups = groupWashRows([...screenshotRows, tomorrow]);
  assert.equal(groups.length, 2);
  assert.match(render(groups[0].rows), /32, 37, 44, 08, 15, 06/);
  assert.match(render(groups[1].rows), /Pending wash \(1\):<\/strong><span>02/);
  assert.doesNotMatch(render(groups[1].rows), /32|37|44/);
  const refreshed = groups[0].rows.map(row => ({ ...row, completed: true }));
  assert.match(render(refreshed), /class="wsh2-pending-wash is-complete"/);
  assert.match(render(refreshed), /All trains completed wash\./);
  assert.doesNotMatch(render(refreshed), /Pending wash/);
  assert.equal(render([]), '');
});

test('the summary stays outside table scrolling and uses all saved rows, not search or batch highlights', () => {
  const workspace = readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /<\/tbody><\/table><\/div>\s*<Wsh2PendingWashSummary rows=\{group.rows\} \/>\s*<\/section>/);
  assert.doesNotMatch(source, /fetch\(|onChange|matchedRowIds|pendingRef/);
  const css = readFileSync(new URL('../src/wsh2.css', import.meta.url), 'utf8');
  assert.match(css, /\.wsh2-pending-wash \{[^}]*flex-wrap: wrap;[^}]*color: var\(--wsh-text\)/);
  assert.match(css, /\.wsh2-pending-wash > span \{[^}]*overflow-wrap: anywhere/);
});
