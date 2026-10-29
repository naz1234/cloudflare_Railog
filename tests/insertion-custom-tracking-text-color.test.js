import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const normalize = page.match(/const tidRemarkText = [^\n]+;/)?.[0];
const custom = page.match(/const hasCustomTrackingText = [^\n]+;/)?.[0];
const hasCustomText = new Function('tidInput', `${normalize}\n${custom}\nreturn hasCustomTrackingText;`);

test('blank and literal Tracking ID keep the default colour, including case and spacing variants', () => {
  assert.ok(normalize && custom);
  for (const value of [undefined, null, '', '  ', 'Tracking ID', 'tracking id', ' TRACKING   ID ', 'Tracking\tID']) {
    assert.equal(hasCustomText(value), false, String(value));
  }
});

test('custom text or numbers switch colour and clearing the value returns to the default', () => {
  for (const value of ['dmf utfo', 'DMF UTFO', 'SWEEP', '3K1', '2W', '105', 'TID 105', 'Tracking ID note']) {
    assert.equal(hasCustomText(value), true, value);
  }
  assert.equal(hasCustomText(''), false);
  assert.match(page, /className="theme-insertion-tracking-footer is-editing"\s+data-has-custom-value=\{hasCustomTrackingText \|\| undefined\}/);
  assert.match(page, /onTidChange\(road, bi, e\.target\.value\)/);
});

for (const [theme, colour, promptColour] of [['dark', '#fde68a', '#bae6fd'], ['light', '#ffffff', '#fde68a']]) {
  test(`${theme} custom-value rule changes only editable font colour and preserves the Tracking ID prompt`, () => {
    const css = readFileSync(new URL(`../src/insertion${theme === 'dark' ? 'Dark' : 'Light'}TidFooter.css`, import.meta.url), 'utf8');
    const parsed = postcss.parse(css);
    const rules = parsed.nodes.filter(node => node.type === 'rule');
    const customRule = rules.find(rule => rule.selector.includes('[data-has-custom-value="true"] input.theme-insertion-tid-input'));
    assert.ok(customRule);
    assert.equal(customRule.selector, `html[data-app-theme="${theme}"] .theme-insertion-page .theme-insertion-tracking-footer.is-editing[data-has-custom-value="true"] input.theme-insertion-tid-input`);
    assert.deepEqual(customRule.nodes.map(decl => [decl.prop, decl.value, decl.important]), [
      ['color', colour, true], ['-webkit-text-fill-color', colour, true],
    ]);
    const prompt = rules.find(rule => rule.selector.includes('input.theme-insertion-tid-input::placeholder'));
    assert.ok(prompt.nodes.some(decl => decl.prop === 'color' && decl.value === promptColour));
    const original = rules.find(rule => rule.selector.includes('.is-editing input.theme-insertion-tid-input'));
    assert.ok(original.nodes.some(decl => decl.prop === 'color' && decl.value === promptColour));
    assert.ok(rules.indexOf(customRule) > rules.indexOf(original));
  });
}

for (const [theme, background, originalBackground] of [['dark', '#4c1d95', '#0c334d'], ['light', '#6d28d9', '#5b3b0c']]) {
  test(`${theme} custom entries use a purple pill while unchanged Tracking ID keeps its original background`, () => {
    const css = readFileSync(new URL(`../src/insertion${theme === 'dark' ? 'Dark' : 'Light'}TidFooter.css`, import.meta.url), 'utf8');
    const rules = postcss.parse(css).nodes.filter(node => node.type === 'rule');
    const prefix = `html[data-app-theme="${theme}"] .theme-insertion-page .theme-insertion-tracking-footer.is-editing`;
    const customRule = rules.find(rule => rule.selector === `${prefix}[data-has-custom-value="true"]`);
    const normalRule = rules.find(rule => rule.selector === prefix);
    assert.ok(customRule && normalRule);
    const declarations = Object.fromEntries(customRule.nodes.map(decl => [decl.prop, decl.value]));
    assert.equal(declarations.background, background);
    assert.equal(declarations['border-color'], '#a78bfa');
    assert.deepEqual(Object.keys(declarations).sort(), ['background', 'border-color']);
    assert.ok(customRule.nodes.every(decl => decl.important));
    assert.ok(normalRule.nodes.some(decl => decl.prop === 'background' && decl.value === originalBackground));
    const focus = rules.find(rule => rule.selector === `${prefix}[data-has-custom-value="true"]:focus-within`);
    assert.ok(focus.nodes.some(decl => decl.prop === 'border-color' && decl.value === '#c4b5fd'));
    assert.ok(focus.nodes.some(decl => decl.prop === 'box-shadow' && decl.value.includes('167, 139, 250')));
  });
}
