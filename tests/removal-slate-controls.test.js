import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/removalSummarySlate.css", import.meta.url), "utf8");
const uploadCss = readFileSync(new URL("../src/components/MaintenanceUploadTools.css", import.meta.url), "utf8");

test("selected timetable and sort controls share the same theme-aware colors", () => {
  for (const control of ["preset", "sort-button"]) {
    const activeRule = css.match(new RegExp(`\\.theme-train-rem-${control}\\.is-active \\{([^}]*)\\}`))?.[1];
    assert.ok(activeRule, `${control} has an active style`);
    assert.match(activeRule, /background: var\(--slate-active\) !important;/);
    assert.match(activeRule, /color: var\(--slate-active-text\) !important;/);
    assert.match(activeRule, /box-shadow: var\(--slate-active-shadow\) !important;/);
  }
  assert.match(css, /--slate-active: #17364a;/);
  assert.match(css, /--slate-active: #e7effd;/);
});

test("PDF inherits the neutral action-button styling without a blue highlight", () => {
  const pdfRules = [...css.matchAll(/[^{}]*\.theme-train-rem-pdf[^{}]*\{([^}]*)\}/g)];
  assert.ok(pdfRules.length > 0);
  for (const rule of pdfRules) {
    assert.doesNotMatch(rule[1], /#155bd7|#124cba/);
  }
  assert.match(css, /button:not\(\[role="menuitem"\]\) \{[^}]*background: var\(--slate-control\) !important;/);
});

test("Wash Excel and Req. Image share the neutral PDF and INS palette in both themes", () => {
  for (const [name, colors] of Object.entries({
    bg: ["#10263b", "#ffffff"],
    border: ["#2b4f6b", "#d7e2ee"],
    text: ["#e1ecf5", "#0b2443"],
    hover: ["#102c44", "#e1ebf8"],
  })) {
    for (const color of colors) {
      assert.ok(uploadCss.includes(`--maintenance-shortcut-${name}: ${color};`));
      assert.ok(css.includes(color), "the neutral palette matches Removal Summary");
    }
  }
  assert.match(uploadCss, /background: var\(--maintenance-shortcut-bg\);/);
  assert.match(uploadCss, /color: var\(--maintenance-shortcut-text\);/);
  assert.doesNotMatch(uploadCss, /\.maintenance-upload-shortcut--image\s*\{|linear-gradient/);
});

test("upload shortcut hover and expanded states stay neutral without glow", () => {
  assert.match(uploadCss, /\[aria-expanded="true"\] \{\s*background: var\(--maintenance-shortcut-hover\);/);
  for (const shadow of uploadCss.matchAll(/box-shadow:\s*([^;]+);/g)) {
    assert.equal(shadow[1].trim(), "none");
  }
  assert.match(uploadCss, /outline: 2px solid var\(--maintenance-shortcut-focus\);/);
});

test("sorting has a matching rounded frame in both themes with a white light-mode outline", () => {
  const sortRule = css.match(/html\[data-app-theme\] \.theme-train-rem-panel\[data-removal-design="compact-slate"\] \.theme-train-rem-sort-control \{([^}]*)\}/)?.[1];
  assert.ok(sortRule);
  assert.match(sortRule, /background: var\(--slate-row\) !important;/);
  assert.match(sortRule, /border: 1px solid var\(--slate-line\) !important;/);
  assert.match(sortRule, /border-radius: 12px;/);
  const lightSortRule = css.match(/html\[data-app-theme="light"\] \.theme-train-rem-panel\[data-removal-design="compact-slate"\] \.theme-train-rem-sort-control \{([^}]*)\}/)?.[1];
  assert.ok(lightSortRule);
  assert.match(lightSortRule, /border: 1px solid #ffffff !important;/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-train-rem-panel\[data-removal-design="compact-slate"\] \.theme-train-rem-sort-button\.is-active \{\s*box-shadow: inset 0 0 0 1px #ffffff !important;/);
});

test("Location fills the frame's trailing edge without padding or tooltip clipping", () => {
  const sortRule = css.match(/\.theme-train-rem-sort-control \{([^}]*)\}/)?.[1];
  const trailingButtonRule = css.match(/\.theme-train-rem-sort-button:last-child \{([^}]*)\}/)?.[1];
  assert.ok(sortRule);
  assert.ok(trailingButtonRule);
  assert.match(sortRule, /padding: 0 0 0 2px !important;/);
  assert.match(trailingButtonRule, /align-self: stretch;/);
  assert.match(trailingButtonRule, /height: auto;/);
  assert.match(trailingButtonRule, /border-radius: 8px 11px 11px 8px;/);
  assert.doesNotMatch(sortRule + trailingButtonRule, /overflow:\s*(?:hidden|clip)/);
});
