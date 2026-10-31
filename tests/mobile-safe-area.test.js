import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(new URL('../src/mobileDensity.css', import.meta.url), 'utf8'));
const prefix = '#root .app-shell[data-active-page]';
const values = (suffix) => {
  let rule;
  css.walkRules((candidate) => { if (candidate.selector === prefix + suffix) rule = candidate; });
  assert.ok(rule, suffix);
  assert.equal(rule.parent.params, '(max-width: 767px)', 'Never change laptop layout');
  return Object.fromEntries(rule.nodes.filter(({ type }) => type === 'decl').map(({ prop, value }) => [prop, value]));
};

test('phone shell reads all four safe-area insets for portrait and narrow landscape', () => {
  const shell = values('');
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    assert.equal(shell[`--mobile-safe-${edge}`], `env(safe-area-inset-${edge}, 0px)`);
  }
  assert.equal(shell['padding-inline'], 'var(--mobile-safe-left) var(--mobile-safe-right)');
});

test('shared REQ and workspace menus reserve home-indicator space below their controls', () => {
  const nav = values(' .req-mobile-bottom-nav');
  assert.equal(nav.padding, '4px calc(6px + var(--mobile-safe-right)) calc(8px + var(--mobile-safe-bottom)) calc(6px + var(--mobile-safe-left))');
  assert.equal(values(' .req-mobile-bottom-nav button')['min-height'], '44px');
  assert.equal(values(' > .flex > main > div').padding, '8px 10px calc(74px + var(--mobile-safe-bottom))');
  // Both menu types use this class; no duplicate spacer or fake home indicator.
  const component = readFileSync(new URL('../src/components/ReqMobileNavigation.jsx', import.meta.url), 'utf8');
  assert.match(component, /className="req-mobile-only req-mobile-bottom-nav"/);
  assert.match(component, /className="req-mobile-only req-mobile-bottom-nav mobile-workspace-nav"/);
  assert.equal(nav.height, undefined, 'Allow accessible text to determine the menu height');
});

test('phone header and its popup stay below the top safe area', () => {
  const header = values(' .req-mobile-header');
  assert.equal(header['min-height'], 'calc(56px + var(--mobile-safe-top))');
  assert.equal(header.padding, 'calc(5px + var(--mobile-safe-top)) 8px 5px');
  assert.equal(values(' .req-mobile-page-menu').top, 'calc(51px + var(--mobile-safe-top))');
});
