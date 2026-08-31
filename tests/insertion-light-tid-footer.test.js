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
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
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

test("semantic TID dots reuse the MASPO upload pulse rhythm without moving", () => {
  const pulseStart = lightTidFooterSource.indexOf("@keyframes insertion-tid-status-pulse");
  const pulseEnd = lightTidFooterSource.indexOf('html[data-app-theme="light"]', pulseStart);
  const pulseKeyframes = lightTidFooterSource.slice(pulseStart, pulseEnd);
  const fallbackStart = lightTidFooterSource.indexOf(
    ".theme-insertion-tracking-footer.is-complete::after {",
  );
  const fallbackEnd = lightTidFooterSource.indexOf("}", fallbackStart);
  const fallbackRule = lightTidFooterSource.slice(fallbackStart, fallbackEnd + 1);

  assert.match(themeStyles, /maspo-current-step-pulse 1\.65s ease-in-out 220ms infinite/);
  assert.match(lightTidFooterSource, /@keyframes insertion-tid-status-pulse/);
  assert.match(
    lightTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete\.has-reference-style::after \{[\s\S]*animation: insertion-tid-status-pulse 1\.65s ease-in-out 220ms infinite backwards/,
  );
  assert.match(
    pulseKeyframes,
    /@keyframes insertion-tid-status-pulse \{[\s\S]*0%,[\s\S]*100%[\s\S]*50%/,
  );
  assert.doesNotMatch(pulseKeyframes, /transform:/);
  assert.doesNotMatch(fallbackRule, /animation:/);
});

test("semantic TID dots stay opaque, saturated, and respect reduced motion", () => {
  assert.match(
    lightTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete\.has-reference-style::after \{[\s\S]*filter: saturate\(1\.45\) brightness\(0\.92\) contrast\(1\.08\);[\s\S]*opacity: 1/,
  );
  assert.match(
    lightTidFooterSource,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.theme-insertion-tracking-footer\.is-complete\.has-reference-style::after \{[\s\S]*animation: none/,
  );
});

test("unfinished light-mode TIDs keep a distinct dashed input state", () => {
  assert.match(
    lightTidFooterSource,
    /html\[data-app-theme="light"\] \.theme-insertion-page \.theme-insertion-tracking-footer\.is-editing \{[\s\S]*border-color: #0ea5e9 !important;[\s\S]*border-style: dashed;[\s\S]*background: #f8fafc !important/,
  );
});
