import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("the movement Add Row action keeps the attention animation hook", () => {
  assert.equal(
    (depotStablingSource.match(/theme-movement-add-row-attention/g) || []).length,
    1,
  );
  assert.match(
    depotStablingSource,
    /theme-movement-add-row-attention[^>]*>[\s\S]*?<Plus size=\{12\} \/>Add Row/,
  );
});

test("PST no longer renders the retired PG selector", () => {
  assert.doesNotMatch(depotStablingSource, /function InsertionPgHeaderControls/);
  assert.doesNotMatch(depotStablingSource, /<InsertionPgHeaderControls/);
  assert.doesNotMatch(themeStyles, /@keyframes theme-pg-selected-attention/);
});

test("the shared attention class owns the complete Add Row button style", () => {
  assert.match(
    themeStyles,
    /\.theme-movement-add-row-attention \{[\s\S]*?height: 1\.75rem !important;[\s\S]*?border: 1px solid #2f6084 !important;[\s\S]*?border-radius: 9999px !important;[\s\S]*?background: #0a2236 !important;[\s\S]*?font-weight: 700 !important;/,
  );
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\] \.theme-movement-add-row-attention \{[\s\S]*?border-color: #60a5fa !important;[\s\S]*?background: #ffffff !important;[\s\S]*?color: #0f172a !important;/,
  );
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\] :is\([\s\S]*?\.theme-insertion-page[\s\S]*?\.theme-pst-section[\s\S]*?\) \{[\s\S]*?border: 1px solid #60a5fa !important;[\s\S]*?background: #ffffff !important;[\s\S]*?font-weight: 700 !important;/,
  );
  assert.doesNotMatch(
    themeStyles,
    /:is\(\.theme-pst-section, \.theme-insertion-section\) \.theme-insertion-pg-button\.is-selected/,
  );
});

test("the Add Row animation includes a reduced-motion fallback", () => {
  assert.match(themeStyles, /@keyframes movement-add-row-attention/);
  assert.match(themeStyles, /@keyframes movement-add-row-icon-attention/);
  assert.match(
    themeStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?theme-movement-add-row-attention/,
  );
});
