import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');

test('primary removal actions retain their order without an empty title spacer', () => {
  const start = source.indexOf('<div className="theme-train-rem-depot-card');
  const header = source.slice(start, source.indexOf('<div className="space-y-1 mt-2">', start));
  assert.match(header, /flex flex-col items-start gap-2/);
  assert.match(header, /\{\(depot !== "west" \|\| subtitle\) && \(/);
  assert.match(header, /theme-train-rem-action-row flex flex-nowrap items-center justify-start gap-1/);
  assert.doesNotMatch(header, /justify-between/);
  const actions = ['theme-train-rem-pdf-menu', 'theme-train-rem-undo', 'theme-train-rem-clear'];
  const positions = actions.map(action => header.indexOf(action));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
});

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
