import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const css = readFileSync(new URL("../src/insertionReferenceSlate.css", import.meta.url), "utf8");
const root = postcss.parse(css);
const declarations = (selector) => {
  const values = {};
  root.walkRules((rule) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
  });
  return values;
};
const scope = "html[data-app-theme] .theme-insertion-page";
const dashboard = `${scope} .theme-insertion-reference-controls-only`;
const depot = `${scope} .theme-insertion-reference-depot`;

test("reference slate styling is restricted to desktop Insertion", () => {
  root.walkRules((rule) => {
    assert.equal(rule.parent.type, "atrule");
    assert.equal(rule.parent.name, "media");
    assert.equal(rule.parent.params, "(min-width: 768px)");
    for (const selector of rule.selectors) assert.match(selector, /^html\[data-app-theme(?:="light")?\] \.theme-insertion-page(?: |$)/);
  });
  const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  assert.match(source, /import "\.\.\/insertionReferenceSlate\.css"/);
});

test("reference panels share the REQ slate palette in dark and light mode", () => {
  const dark = declarations(scope);
  const light = declarations('html[data-app-theme="light"] .theme-insertion-page');
  assert.equal(dark["--insertion-reference-panel"], "#0b1f33");
  assert.equal(light["--insertion-reference-panel"], "#edf2f7");
  assert.equal(dark["--insertion-reference-text"], "#e1ecf5");
  assert.equal(light["--insertion-reference-text"], "#0b2443");
  assert.equal(declarations(`${dashboard} .insertion-dashboard`)["box-shadow"], "none");
  assert.equal(declarations(depot)["box-shadow"], "none");
});

test("clock and sound buttons stay visible with readable compact controls", () => {
  assert.equal(declarations(`${dashboard} .insertion-dashboard__time`)["font-size"], "22px");
  assert.equal(declarations(`${dashboard} .insertion-dashboard__sound-button`)["min-height"], "28px");
  assert.equal(declarations(`${dashboard} .insertion-dashboard__sound-button`)["font-size"], "10px");
  assert.equal(declarations(`${dashboard} .insertion-dashboard__sound-button.is-enabled`).color, "var(--insertion-reference-warning)");
  assert.equal(declarations(`${dashboard} .insertion-dashboard__schedule-tab:focus-visible`).outline, "2px solid var(--insertion-reference-focus)");
});

test("active timetable and override warning remain distinguishable without glow", () => {
  assert.equal(declarations(`${dashboard} .insertion-dashboard__schedule-tab.is-active`).background, "var(--insertion-reference-active)");
  assert.equal(declarations(`${dashboard} .insertion-dashboard__schedule-tab.is-warning`).background, "var(--insertion-reference-warning-bg)");
  assert.equal(declarations(`${depot} .theme-insertion-reference-stat-label`)["font-size"], "10px");
  assert.match(css, /theme-insertion-reference-depot-chip:not\(\.is-override\)/);
});

test("reference restyling does not override train rows, status pills, time offsets or drag targets", () => {
  root.walkRules((rule) => assert.doesNotMatch(rule.selector, /reference-row|reference-time-value|reference-service-pill|reference-used-icon|reference-next-badge|reference-train-id|reference-time-offset/));
  root.walkDecls((decl) => assert.ok(!["pointer-events", "visibility", "overflow"].includes(decl.prop)));
});

test("INS Sync matches PST size and theme colours, without button or icon glow", () => {
  const pst = postcss.parse(readFileSync(new URL('../src/pstSlate.css', import.meta.url), 'utf8'));
  for (const theme of ['', '="light"']) {
    const insPalette = declarations(`html[data-app-theme${theme}] .theme-insertion-page`);
    let pstPalette;
    pst.walkRules(rule => {
      if (rule.selector !== `html[data-app-theme${theme}] #root .app-shell[data-active-page="pst"]`) return;
      pstPalette = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    });
    for (const token of ['control', 'line', 'text', 'focus']) {
      assert.equal(insPalette[`--insertion-reference-${token}`], pstPalette[`--pst-slate-${token}`]);
    }
    assert.equal(insPalette['--insertion-sync-warning'], pstPalette['--pst-slate-warning']);
    assert.equal(insPalette['--insertion-sync-warning-bg'], pstPalette['--pst-slate-warning-bg']);
  }
  const controlScope = `${scope} .theme-insertion-section .theme-insertion-editable-controls`;
  const button = declarations(`${controlScope} .theme-insertion-refresh-button`);
  assert.equal(button.height, '32px');
  assert.equal(button['border-radius'], '8px');
  assert.equal(button['font-size'], '12px');
  for (const property of ['box-shadow', 'filter', 'transform', 'animation']) assert.equal(button[property], 'none');
  const icon = declarations(`${controlScope} .theme-insertion-refresh-icon`);
  assert.equal(icon.animation, 'none');
  assert.equal(icon.filter, 'none');
  assert.equal(icon.color, 'inherit');
  assert.equal(declarations(`${controlScope} .theme-insertion-refresh-button.is-dirty`).background, 'var(--insertion-sync-warning-bg)');
});
