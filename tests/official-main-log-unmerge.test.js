import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("West and East main E-LOG rows remove inherited daily-row merges", () => {
  assert.match(generatorSource, /function normalizeDailyDepotLogMerges\(sheetDocument\)/);
  assert.match(generatorSource, /if \(firstRow > 39 \|\| lastRow < 9\) return;/);
  assert.match(generatorSource, /if \(firstRow !== lastRow\) removedRowSpanningMergeCount \+= 1;/);
  assert.match(generatorSource, /mergeCell\.parentNode\?\.removeChild\(mergeCell\);/);
  assert.match(
    generatorSource,
    /const normalizedDailyMerges = normalizeDailyDepotLogMerges\(sheetDocument\);/,
  );
});

test("each normalized main-log row keeps one standard horizontal Summary cell", () => {
  assert.match(generatorSource, /for \(let rowNumber = 9; rowNumber <= 39; rowNumber \+= 1\)/);
  assert.match(generatorSource, /summaryMerge\.setAttribute\("ref", `E\$\{rowNumber\}:H\$\{rowNumber\}`\);/);
  assert.match(
    generatorSource,
    /mergeCells\.setAttribute\("count", String\(mergeCells\.getElementsByTagNameNS\("\*", "mergeCell"\)\.length\)\);/,
  );
  assert.match(generatorSource, /normalizedDailyMerges,/);
});
