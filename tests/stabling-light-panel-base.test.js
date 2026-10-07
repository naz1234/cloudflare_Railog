import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const removalCss = readFileSync(new URL("../src/removalSummarySlate.css", import.meta.url), "utf8");

test("light-mode stabling matches the soft slate base and border of both side panels", () => {
  const stablingRule = css.match(/html\[data-app-theme="light"\] \.theme-stabling-section \{([^}]*)\}/)?.[1];
  assert.ok(stablingRule);
  assert.match(stablingRule, /background: #edf2f7 !important;/);
  assert.match(stablingRule, /border-color: #d7e2ee !important;/);
  assert.match(css, /--maintenance-panel-base: #edf2f7;/);
  assert.match(removalCss, /--slate-panel: #edf2f7;/);
  assert.match(removalCss, /--slate-line: #d7e2ee;/);
});

test("stabling base override follows the legacy white rule and does not target train cards or dark mode", () => {
  const whiteRule = css.indexOf("/* Light-mode contrast fixes for the Depot Stabling workspace. */");
  const override = css.indexOf('html[data-app-theme="light"] .theme-stabling-section {');
  assert.ok(whiteRule >= 0 && override > whiteRule);
  assert.doesNotMatch(css, /html\[data-app-theme(?:="dark")?\] \.theme-stabling-section \{/);
  const rule = css.slice(override, css.indexOf("}", override) + 1);
  assert.doesNotMatch(rule, /theme-stabling-train-card|theme-stabling-remark|font-size|height/);
});
