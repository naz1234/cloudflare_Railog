import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');

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
