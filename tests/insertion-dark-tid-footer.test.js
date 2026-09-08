import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(
  new URL("../src/main.jsx", import.meta.url),
  "utf8",
);
const darkTidFooterSource = readFileSync(
  new URL("../src/insertionDarkTidFooter.css", import.meta.url),
  "utf8",
);
const lightTidFooterSource = readFileSync(
  new URL("../src/insertionLightTidFooter.css", import.meta.url),
  "utf8",
);

function extractRule(source, selector) {
  const start = source.indexOf(selector);
  const end = source.indexOf("}", start);
  return start === -1 || end === -1 ? "" : source.slice(start, end + 1);
}

test("dark TID footer overrides load after the light-only design", () => {
  const lightImport = mainSource.indexOf("@/insertionLightTidFooter.css");
  const darkImport = mainSource.indexOf("@/insertionDarkTidFooter.css");

  assert.notEqual(lightImport, -1);
  assert.notEqual(darkImport, -1);
  assert.ok(darkImport > lightImport);
  assert.doesNotMatch(
    darkTidFooterSource,
    /data-app-theme="light"|html:not\(/,
  );
  assert.doesNotMatch(
    darkTidFooterSource,
    /(?:^|})\s*\.theme-insertion-page/,
  );
});

test("completed dark-mode TIDs use the approved soft-violet box", () => {
  const railRule = extractRule(
    darkTidFooterSource,
    'html[data-app-theme="dark"] .theme-insertion-page .theme-insertion-tracking-footer.is-complete,',
  );
  const numberRule = extractRule(
    darkTidFooterSource,
    'html[data-app-theme="dark"] .theme-insertion-page .theme-insertion-tracking-footer.is-complete > strong,',
  );

  assert.match(
    railRule,
    /background: linear-gradient\(135deg, #22233e 0%, #17192e 100%\) !important/,
  );
  assert.match(
    railRule,
    /box-shadow:\s*inset 0 1px 0 rgba\(255, 255, 255, 0\.05\),\s*0 2px 4px rgba\(0, 0, 0, 0\.35\) !important/,
  );
  assert.match(
    darkTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete::before \{[\s\S]*content: "TID";[\s\S]*color: #b5adf5/,
  );
  assert.match(railRule, /border-color: #8f86d8 !important/);
  assert.match(numberRule, /color: #f4f8fc !important/);
  assert.match(numberRule, /-webkit-text-fill-color: #f4f8fc !important/);
});

test("dark semantic dots retain their status colour and stationary pulse", () => {
  const pulseStart = lightTidFooterSource.indexOf("@keyframes insertion-tid-status-pulse");
  const pulseEnd = lightTidFooterSource.indexOf('html[data-app-theme="light"]', pulseStart);
  const pulseKeyframes = lightTidFooterSource.slice(pulseStart, pulseEnd);
  const fallbackRule = extractRule(
    darkTidFooterSource,
    ".theme-insertion-tracking-footer.is-complete::after {",
  );
  const semanticDotRule = extractRule(
    darkTidFooterSource,
    ".theme-insertion-tracking-footer.is-complete.has-reference-style::after {",
  );

  assert.match(fallbackRule, /background: var\(--insertion-tracking-reference-border, #b5adf5\)/);
  assert.match(semanticDotRule, /opacity: 1/);
  assert.match(semanticDotRule, /filter: saturate\(1\.55\) brightness\(1\.04\) contrast\(1\.08\)/);
  assert.match(semanticDotRule, /animation: insertion-tid-status-pulse 1\.65s ease-in-out 220ms infinite backwards/);
  assert.ok(pulseStart >= 0, "shared TID pulse keyframes must exist");
  assert.ok(pulseEnd > pulseStart, "shared TID pulse keyframes must be extractable");
  assert.doesNotMatch(pulseKeyframes, /transform:/);
  assert.doesNotMatch(fallbackRule, /animation:/);
  assert.ok(
    (darkTidFooterSource.match(/is-complete\.has-reference-style/g) ?? []).length >= 4,
    "normal and elapsed semantic TID paths must both retain their dark overrides",
  );
});

test("dark semantic dots respect reduced-motion preferences", () => {
  assert.match(
    darkTidFooterSource,
    /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-app-theme="dark"\] \.theme-insertion-page \.theme-insertion-tracking-footer\.is-complete\.has-reference-style::after \{[^}]*animation: none/,
  );
});
