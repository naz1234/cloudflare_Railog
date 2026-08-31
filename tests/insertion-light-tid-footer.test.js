import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(
  new URL("../src/main.jsx", import.meta.url),
  "utf8",
);
const lightTidFooterSource = readFileSync(
  new URL("../src/insertionLightTidFooter.css", import.meta.url),
  "utf8",
);

test("light TID footer overrides load after the light Insertion card styles", () => {
  const cardContrastImport = mainSource.indexOf("@/insertionLightCardContrast.css");
  const tidFooterImport = mainSource.indexOf("@/insertionLightTidFooter.css");

  assert.notEqual(cardContrastImport, -1);
  assert.notEqual(tidFooterImport, -1);
  assert.ok(tidFooterImport > cardContrastImport);
});

test("completed TIDs use a dark footer bar only in light mode", () => {
  assert.match(
    lightTidFooterSource,
    /html\[data-app-theme="light"\][\s\S]*\.theme-insertion-tracking-footer\.is-complete[\s\S]*background: linear-gradient\(135deg, #0b2d47 0%, #061b2e 100%\) !important/,
  );
  assert.match(
    lightTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete > strong,[\s\S]*color: #ffffff !important/,
  );
  assert.doesNotMatch(lightTidFooterSource, /data-app-theme="dark"|html:not\(/);
  assert.doesNotMatch(
    lightTidFooterSource,
    /(?:^|})\s*\.theme-insertion-page/,
  );
});

test("the TID bar keeps the reference colour as a compact status dot", () => {
  assert.match(
    lightTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete::before[\s\S]*content: "TID"/,
  );
  assert.match(
    lightTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete::after[\s\S]*width: 7px[\s\S]*background: var\(--insertion-tracking-reference-border, #38bdf8\)/,
  );
});

test("unfinished light-mode TIDs keep a distinct dashed input state", () => {
  assert.match(
    lightTidFooterSource,
    /html\[data-app-theme="light"\] \.theme-insertion-page \.theme-insertion-tracking-footer\.is-editing \{[\s\S]*border-color: #0ea5e9 !important;[\s\S]*border-style: dashed;[\s\S]*background: #f8fafc !important/,
  );
});
