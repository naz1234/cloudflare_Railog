import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/insertionReqHeader.css', import.meta.url), 'utf8');
const reqCss = readFileSync(new URL('../src/stablingSlate.css', import.meta.url), 'utf8');
const parsed = postcss.parse(css);
const desktop = parsed.nodes.find(node => node.type === 'atrule');
const find = suffix => desktop.nodes.find(node => node.type === 'rule' && node.selector.endsWith(suffix));
const value = (rule, prop) => rule?.nodes.find(node => node.prop === prop)?.value;

test('both insertion depots display the REQ-style title, subtitle and live TRN count', () => {
  assert.match(page, /import "\.\.\/insertionReqHeader\.css"/);
  assert.match(page, /data-insertion-design="req-header"/);
  assert.match(page, /<InsertionSectionTitle\s+title=\{title\}\s+count=\{insertionSummary\.trains\}/);
  assert.match(page, /<span className="insertion-heading-req">\{depotLabel\} stabling<\/span>/);
  assert.match(page, /className="insertion-heading-subtitle">Train locations in \{depotLabel\}/);
  assert.match(page, /<span>TRN<\/span><strong>\{count\}<\/strong>/);
  assert.match(page, /title="WEST DEPOT"/);
  assert.match(page, /title="EAST DEPOT"/);
});

test('desktop title, icon, count and neutral actions match the REQ design tokens', () => {
  assert.equal(value(find('.theme-insertion-title'), 'font-size'), '16px');
  assert.equal(value(find('.theme-insertion-title'), 'font-weight'), '700');
  assert.equal(value(find('.theme-insertion-title-icon'), 'width'), '30px');
  assert.equal(value(find('.theme-insertion-title-icon'), 'height'), '30px');
  assert.equal(value(find('.insertion-heading-count > strong'), 'font-size'), '24px');
  assert.match(value(find('.insertion-heading-count'), 'border-left'), /1px solid/);
  assert.equal(value(find('.theme-insertion-search-actions .theme-insertion-action'), 'height'), '30px');
  for (const [insertion, req] of [['panel', 'panel'], ['control', 'control'], ['line', 'line'], ['text', 'text'], ['muted', 'muted']]) {
    const insertionValues = [...css.matchAll(new RegExp(`--insertion-header-${insertion}: (#[a-f0-9]+);`, 'g'))].map(match => match[1]);
    const reqValues = [...reqCss.matchAll(new RegExp(`--stabling-${req}: (#[a-f0-9]+);`, 'g'))].map(match => match[1]);
    assert.deepEqual(insertionValues, reqValues);
  }
});

test('desktop actions move to the header while a remark note replaces the secondary counters', () => {
  const actions = find('.theme-insertion-search-actions');
  assert.equal(value(actions, 'position'), 'absolute');
  assert.equal(value(actions, 'top'), '16px');
  assert.equal(value(actions, 'right'), '76px');
  assert.equal(value(find('.insertion-tracking-remark-note'), 'position'), 'absolute');
  assert.equal(value(find('.insertion-tracking-remark-note'), 'max-width'), 'calc(100% - 432px)');
  assert.match(page, /className="insertion-tracking-remark-note" role="note"/);
  assert.match(page, /Tracking ID also accepts remarks: <strong>SW<\/strong>, <strong>3K1<\/strong>/);
  assert.match(page, /sectionDepot === "east" && <>, <strong>SW ATWP<\/strong><\/>/);
  assert.doesNotMatch(page, /className="theme-insertion-stabling-summary|insertionSummary\.(?:completed|tidAssigned)|insertionSummaryPending|insertionSummaryEmpty/);
});

test('the remark note is white in dark mode while preserving readable light-mode text', () => {
  const note = parsed.nodes.find(node => node.type === 'rule' && node.selector.endsWith('.insertion-tracking-remark-note'));
  assert.equal(value(note, 'color'), '#ffffff');
  assert.equal(note.nodes.find(node => node.prop === 'color').important, true);
  assert.equal(value(find('.insertion-tracking-remark-note'), 'color'), undefined);
  assert.equal(value(note, 'font-size'), '11px');
  assert.equal(value(note, 'display'), 'flex');
  assert.equal(value(note, 'line-height'), '1.5');
  const light = parsed.nodes.find(node => node.type === 'rule' && node.selector.startsWith('html[data-app-theme="light"]'));
  assert.equal(value(light, 'color'), '#4e7198');
  assert.equal(light.nodes.find(node => node.prop === 'color').important, true);
  const children = parsed.nodes.find(node => node.type === 'rule' && node.selector.endsWith(':is(svg, span, strong)'));
  assert.equal(value(children, 'color'), 'inherit');
  assert.equal(children.nodes.find(node => node.prop === 'color').important, true);
});

test('new header styling is desktop-only and excludes REQ, PST and train-card controls', () => {
  assert.equal(desktop.params, '(min-width: 768px)');
  parsed.walkRules(rule => {
    if (rule.parent.type === 'root') {
      if (rule.selector.includes('insertion-tracking-remark-note')) {
        assert.ok(rule.selector.includes('.theme-insertion-section[data-insertion-design="req-header"]'));
        assert.equal(value(rule, 'position'), undefined);
      } else {
        assert.equal(value(rule, 'display'), 'none');
        assert.equal(rule.nodes.length, 1);
      }
    } else {
      assert.equal(rule.parent, desktop);
      assert.ok(rule.selector.includes('.theme-insertion-section[data-insertion-design="req-header"]'));
    }
  });
  assert.match(page, /className="insertion-heading-original">\{title\}<\/span>/);
  assert.doesNotMatch(css, /theme-insertion-card|theme-insertion-tid-input|theme-pst|theme-stabling-section|pointer-events: none/);
});
