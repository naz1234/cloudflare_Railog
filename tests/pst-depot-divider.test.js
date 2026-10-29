import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pstDepotDivider.css', import.meta.url), 'utf8');
const start = page.indexOf('function PSTTabContent');
const tab = page.slice(start, page.indexOf('function parsePossessionTimeTo24', start));

test('one labeled PST separator sits after the full West workspace and before East', () => {
  const west = tab.indexOf('data-mobile-depot="west"');
  const divider = tab.indexOf('className="pst-depot-divider"');
  const east = tab.indexOf('data-mobile-depot="east"');
  assert.ok(west >= 0 && divider > west && east > divider);
  assert.equal((tab.match(/className="pst-depot-divider"/g) || []).length, 1);
  assert.match(tab, /className="pst-depot-divider" role="separator" aria-orientation="horizontal" aria-label="West and East Depot section divider"/);
  assert.match(tab.slice(divider, east), /<span>EAST DEPOT<\/span>/);
  assert.match(page, /import "\.\.\/pstDepotDivider\.css"/);
});

test('the divider is scoped to PST and insertion workspaces and hidden on phones', () => {
  const parsed = postcss.parse(css);
  parsed.walkRules(rule => {
    if (rule.parent.type === 'root') {
      assert.equal(rule.selector, '.pst-depot-divider');
      assert.equal(rule.toString(), '.pst-depot-divider { display: none; }');
    } else {
      assert.equal(rule.parent.type, 'atrule');
      assert.equal(rule.parent.name, 'media');
      assert.equal(rule.parent.params, '(min-width: 768px)');
      assert.ok(rule.selector.includes('.pst-depot-divider'));
    }
  });
  assert.match(css, /height: 1px/);
  assert.match(css, /html\[data-app-theme='light'\]/);
  assert.doesNotMatch(css, /\.theme-pst-card|\.pst-fldc|\.theme-apu|animation:/);
});

test('insertion uses the same orange divider between the full West and East workspaces', () => {
  const insertionStart = page.indexOf('function InsertionTabContent');
  const insertion = page.slice(insertionStart, page.indexOf('function loadSavedMovementObject', insertionStart));
  const west = insertion.indexOf('data-mobile-depot="west"');
  const westLog = insertion.indexOf('depotFilter="west"', insertion.indexOf('<InsertionLogOutput', west));
  const divider = insertion.indexOf('className="pst-depot-divider"');
  const east = insertion.indexOf('data-mobile-depot="east"');
  assert.ok(west >= 0 && westLog > west && divider > westLog && east > divider);
  assert.equal((insertion.match(/className="pst-depot-divider"/g) || []).length, 1);
  assert.match(insertion, /className="insertion-depot-workspace flex min-w-0 flex-col gap-6"/);
  assert.match(insertion.slice(divider, east), /role="separator" aria-orientation="horizontal" aria-label="West and East Depot section divider"/);
  assert.match(insertion.slice(divider, east), /<span>EAST DEPOT<\/span>/);
  const parsed = postcss.parse(css);
  const desktopRule = parsed.nodes.find(node => node.type === 'atrule' && node.params === '(min-width: 768px)');
  const sharedRule = desktopRule.nodes.find(node => node.type === 'rule' && node.selector.includes('.mobile-pst-workspace > .pst-depot-divider'));
  assert.ok(sharedRule.selector.includes('.insertion-depot-workspace > .pst-depot-divider'));
  assert.ok(sharedRule.nodes.some(node => node.prop === 'display' && node.value === 'flex'));
  const lightRule = desktopRule.nodes.find(node => node.type === 'rule' && node.selector.includes("html[data-app-theme='light'] .insertion-depot-workspace"));
  assert.ok(lightRule.selector.includes("html[data-app-theme='light'] .mobile-pst-workspace"));
});

test('the divider matches Sync from Main orange colors and glow without adding its animation', () => {
  const darkGradient = 'linear-gradient(135deg, rgba(249,115,22,0.42), rgba(220,38,38,0.34))';
  assert.ok(page.includes(`background: "${darkGradient}"`));
  assert.ok(css.includes(`--pst-divider-surface: ${darkGradient};`));
  assert.match(css, /--pst-divider-line: rgba\(251,146,60,0\.92\)/);
  assert.match(css, /--pst-divider-label: #fff7ed/);
  assert.match(css, /box-shadow: 0 0 16px var\(--pst-divider-glow\)/);
  assert.match(css, /--pst-divider-surface: linear-gradient\(135deg, #ffedd5, #fee2e2\)/);
  assert.match(css, /--pst-divider-label: #9a3412/);
  assert.doesNotMatch(css, /animation:|@keyframes/);
});
