import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

const insertionSectionStart = source.indexOf("function InsertionStablingSection");
const insertionSectionEnd = source.indexOf("function RemovalSummaryTooltip", insertionSectionStart);
const insertionSectionSource = source.slice(insertionSectionStart, insertionSectionEnd);

test("West and East insertion sections both receive the cross-depot search data", () => {
  const sharedSearchProp = "allDepots={insertionSearchDepots}";

  assert.equal(source.split(sharedSearchProp).length - 1, 2);
  assert.match(source, /data: westSection\?\.data \|\| \{\}/);
  assert.match(source, /data: eastSection\?\.data \|\| \{\}/);
});

test("insertion train search reports depot, road, and block for the active PG data", () => {
  assert.match(insertionSectionSource, /placeholder="Search train ID across both insertion depots…"/);
  assert.match(insertionSectionSource, /allDepots\.forEach/);
  assert.match(insertionSectionSource, /results\.push\(\{ depotLabel, road, blockLabel:/);
  assert.match(insertionSectionSource, /not found in either insertion depot/);
});

test("matching insertion train cards receive the yellow search highlight", () => {
  assert.match(insertionSectionSource, /isSearchMatch=\{Boolean\(normalizedSearch/);
  assert.match(source, /const insCardBorder = isSearchMatch\s*\? "2px solid #facc15"/);
  assert.match(source, /const insCardGlow = isSearchMatch/);
});
