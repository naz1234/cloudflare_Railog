import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/insertionMaintenanceSticky.css', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../src/mobileWorkspaces.css', import.meta.url), 'utf8');
const start = page.indexOf('function InsertionTabContent');
const insertion = page.slice(start, page.indexOf('// ── Train Movement Internal Page', start));

test('Insertion Maintenance uses the main page scroll without a viewport height limit or nested scrollbar', () => {
  assert.match(page, /import "\.\.\/insertionMaintenanceSticky\.css"/);
  assert.match(insertion, /className="insertion-maintenance-sidebar sticky top-1 self-start"/);
  assert.match(insertion, /<MaintenancePanelShell\s+fullWidth\s+requests=\{maintenanceRequests\}/);
  const root = postcss.parse(css);
  const rule = root.nodes.find(node => node.type === 'atrule').nodes.find(node => node.type === 'rule');
  assert.equal(rule.selector, '.theme-insertion-page > .grid > .insertion-maintenance-sidebar');
  const values = prop => rule.nodes.filter(node => node.prop === prop).map(node => node.value);
  assert.deepEqual(values('position'), ['static']);
  assert.deepEqual(values('top'), ['auto']);
  assert.deepEqual(values('max-height'), ['none']);
  assert.deepEqual(values('overflow'), ['visible']);
  assert.deepEqual(values('overflow-y'), []);
  assert.deepEqual(values('overscroll-behavior-y'), []);
  assert.doesNotMatch(css, /scrollbar|100(?:d)?vh|position:\s*sticky/);
});

test('main-page scrolling applies in both desktop themes and preserves the mobile Requests view selector', () => {
  const root = postcss.parse(css);
  root.walkRules(rule => {
    assert.equal(rule.parent.type, 'atrule');
    assert.equal(rule.parent.name, 'media');
    assert.equal(rule.parent.params, '(min-width: 768px)');
    assert.match(rule.selector, /\.insertion-maintenance-sidebar/);
  });
  assert.doesNotMatch(css, /data-app-theme|position:\s*fixed|transform:|!important/);
  assert.match(mobile, /@media \(max-width: 767px\)/);
  assert.match(mobile, /\.theme-insertion-page > \.grid > \.sticky \{ position: static; width: 100%; \}/);
  // The legacy class is still used by mobile navigation to show/hide Requests.
  assert.match(mobile, /:not\(\[data-mobile-workspace-view="requests"\]\) \.theme-insertion-page > \.grid > \.sticky/);
});
