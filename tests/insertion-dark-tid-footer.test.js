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

test("completed dark-mode TIDs use the approved teal pill without changing its layout", () => {
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
    /background: #146f65 !important/,
  );
  assert.match(
    railRule,
    /box-shadow:\s*inset 0 1px 0 rgba\(255, 255, 255, 0\.05\),\s*0 2px 4px rgba\(0, 0, 0, 0\.35\) !important/,
  );
  assert.match(
    darkTidFooterSource,
    /\.theme-insertion-tracking-footer\.is-complete::before \{[\s\S]*content: "TID";[\s\S]*color: #99f6e4/,
  );
  assert.match(railRule, /border-color: #2dd4bf !important/);
  assert.match(railRule, /min-height: 26px/);
  assert.match(railRule, /padding: 3px 27px/);
  assert.match(railRule, /border-radius: 8px/);
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

  assert.match(fallbackRule, /background: var\(--insertion-tracking-reference-border, #99f6e4\)/);
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

test("pending dark-mode TIDs use amber with readable input and placeholder text", () => {
  const pendingRule = extractRule(darkTidFooterSource, '.theme-insertion-tracking-footer.is-editing {');
  const inputRule = extractRule(darkTidFooterSource, '.theme-insertion-tracking-footer.is-editing input.theme-insertion-tid-input {');
  const placeholderRule = extractRule(darkTidFooterSource, 'input.theme-insertion-tid-input::placeholder {');
  assert.match(pendingRule, /border-color: #fbbf24 !important/);
  assert.match(pendingRule, /background: #5b3b0c !important/);
  assert.match(inputRule, /color: #fde68a !important/);
  assert.match(inputRule, /-webkit-text-fill-color: #fde68a !important/);
  assert.match(placeholderRule, /color: #fde68a !important/);
});

test("tracking-pill text meets small-text contrast without recolouring cards or remarks", () => {
  const luminance = (hex) => hex.slice(1).match(/../g).map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (text, background) => (luminance(text) + 0.05) / (luminance(background) + 0.05);
  assert.ok(contrast('#f4f8fc', '#146f65') >= 4.5);
  assert.ok(contrast('#ffffff', '#146f65') >= 4.5);
  assert.ok(contrast('#fde68a', '#5b3b0c') >= 4.5);
  assert.doesNotMatch(darkTidFooterSource, /theme-insertion-card|theme-stabling-remark/);
});
