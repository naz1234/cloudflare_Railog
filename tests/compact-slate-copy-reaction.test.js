import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/copyFeedbackSlate.css", import.meta.url), "utf8");
const stablingCss = readFileSync(new URL("../src/stablingSlate.css", import.meta.url), "utf8");

test("copy success uses the exact existing Stabling colour, border and white text in both themes", () => {
  const reference = stablingCss.match(/\.theme-stabling-action\.is-done \{([^}]+)\}/)[1];
  const shared = css.match(/\.slate-copy-feedback\[data-copy-state="copied"\]:not\(:disabled\) \{([^}]+)\}/)[1];
  for (const property of ["background", "border-color", "color"]) {
    const value = reference.match(new RegExp(`(?:^|\\s)${property}: ([^;]+);`))[1];
    assert.ok(shared.includes(`${property}: ${value};`), `${property} matches Copy Stabling`);
  }
  assert.match(css, /html\[data-app-theme\]/);
  assert.doesNotMatch(css, /data-app-theme="light"|data-app-theme="dark"/);
  assert.match(shared, /box-shadow: none !important;\s*filter: none !important;/);
});

test("all copy controls share Stabling's 200ms easing without a pulse, glow or hover lift", () => {
  assert.match(css, /transition: all 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\) !important;/);
  assert.match(css, /animation-name: none !important;/);
  assert.match(css, /transform: none !important;/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*transition-duration: 0s !important;/);
  assert.doesNotMatch(css, /@keyframes|infinite|width:|height:|font-size:|font-weight:/);
  assert.match(css, /:is\(span\[aria-live\], strong, svg\)/);
  assert.match(css, /stroke: currentColor !important;/);
});

test("every workspace copy action opts into the shared reaction using its own actual result", () => {
  assert.match(page, /import "\.\.\/copyFeedbackSlate\.css";/);
  assert.match(maintenance, /import "\.\.\/copyFeedbackSlate\.css";/);
  const copyButton = (source, handler) => source.match(new RegExp(`<button[^>]*onClick=\\{${handler}\\}[^>]*>`, "s"))?.[0];
  for (const handler of ["copyAllRows", "handleCopySummary", "handleCopy", "handleCopyStabling", "handleCopyTotalService"]) {
    const button = copyButton(page, handler);
    assert.ok(button, handler);
    assert.match(button, /slate-copy-feedback/);
    assert.match(button, /data-copy-state=/);
  }
  for (const handler of ["handleCopyWorkshopTrains", "copyEditingGroupTrainList"]) {
    const button = copyButton(maintenance, handler);
    assert.match(button, /slate-copy-feedback/);
    assert.match(button, /data-copy-state=/);
  }
  assert.match(page, /data-copy-state=\{status \|\| "idle"\}/);
  assert.match(page, /data-copy-state=\{copyStatuses\[`output-\$\{log.key\}`\] \|\| "idle"\}/);
});
