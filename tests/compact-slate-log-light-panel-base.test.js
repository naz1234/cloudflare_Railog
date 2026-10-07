import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const generator = readFileSync(new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url), "utf8");
const removalCss = readFileSync(new URL("../src/removalSummarySlate.css", import.meta.url), "utf8");
const outputCss = readFileSync(new URL("../src/outputWindowsSlate.css", import.meta.url), "utf8");
const lightRule = (name) => css.match(new RegExp(`html\\[data-app-theme="light"\\] \\.${name} \\{([^}]*)\\}`))?.[1];

test("all log and request windows share the Maintenance and Removal Summary light slate base", () => {
  assert.match(css, /--maintenance-panel-base: #edf2f7;/);
  assert.match(removalCss, /--slate-panel: #edf2f7;/);
  assert.match(removalCss, /--slate-line: #d7e2ee;/);
  for (const name of ["theme-movement-sheet", "theme-movement-log-output", "theme-removal-log-output", "theme-request-type-summary"]) {
    const rule = lightRule(name);
    assert.ok(rule, `${name} has a light-only base rule`);
    assert.match(rule, /background: #edf2f7 !important;/);
    assert.match(rule, /background-image: none !important;/);
    assert.match(rule, /border-color: #d7e2ee !important;/);
    assert.match(rule, /box-shadow: 0 14px 36px rgb\(35 51 75 \/ 5%\) !important;/);
    assert.doesNotMatch(rule, /font-size|height:|width:|padding:/);
  }
});

test("movement title and table surround use the same base instead of a blue or white band", () => {
  assert.match(lightRule("theme-movement-sheet-header"), /background: #edf2f7 !important;\s*background-image: none !important;\s*border-color: #d7e2ee !important;/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-movement-sheet > \.overflow-x-auto \{\s*background: #edf2f7 !important;/);
});

test("Excel Generator uses a flat slate light base while retaining legible inputs and warning contrast", () => {
  const rule = generator.match(/html\[data-app-theme="light"\] \.official-depot-excel-generator \{([^}]*)\}/)?.[1];
  assert.ok(rule);
  for (const property of ["--official-bg-start", "--official-bg-end", "background"]) assert.ok(rule.includes(`${property}: #edf2f7;`));
  assert.match(rule, /--official-border: #d7e2ee;/);
  assert.match(rule, /background-image: none;/);
  assert.match(rule, /--official-input: #ffffff;/);
  assert.match(rule, /--official-warning-bg: #fffbeb;/);
  assert.match(rule, /--official-warning-text: #78350f;/);
  assert.match(rule, /--official-accent: #0f766e;/);
});

test("dark windows share the Removal Summary slate base while West/East operational colours remain intact", () => {
  assert.match(outputCss, /--window-panel: #0b1f33;/);
  assert.match(outputCss, /--window-line: #2b4f6b;/);
  assert.match(outputCss, /background: var\(--window-panel\) !important;\s*background-image: none !important;/);
  assert.match(outputCss, /--official-bg-start: var\(--window-panel\);\s*--official-bg-end: var\(--window-panel\);\s*--official-border: var\(--window-line\);/);
  assert.match(generator, /data-window-design="compact-slate"/);
  assert.match(css, /--depot-log-body-bg: #faf7ff;/);
  assert.match(css, /--depot-log-body-bg: #f0fdfa;/);
});
