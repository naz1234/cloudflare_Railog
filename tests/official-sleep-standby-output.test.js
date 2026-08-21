import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("Next Day Excel Generator clears Sleep and standby rows except train sets", () => {
  assert.match(generatorSource, /const SLEEP_STANDBY_SHEET_NAMES = \[/);
  assert.match(generatorSource, /function resetSleepAndStandbyModeRows\(/);
  assert.match(generatorSource, /const trainSetColumns = new Set\(\[1, 7, 12\]\);/);
  assert.match(generatorSource, /cellsWithinRange\(sheetDocument, 4, 50, 1, 16\)/);
  assert.match(generatorSource, /if \(trainSetColumns\.has\(columnNumber\(reference\)\)\)/);
  assert.match(generatorSource, /clearCells\(\[cell\]\);/);
});

test("Sleep and standby data rows use white fill and black font", () => {
  assert.match(generatorSource, /function normalizeWhiteFillAndBlackFont\(/);
  assert.match(generatorSource, /foregroundColor\.setAttribute\("rgb", "FFFFFFFF"\);/);
  assert.match(generatorSource, /colorNode\.setAttribute\("rgb", "FF000000"\);/);
  assert.match(generatorSource, /normalizeWhiteFillAndBlackFont\(stylesDocument, dataCells\);/);
});

test("Sleep and standby cleanup is optional for depot templates without the tab", () => {
  assert.match(
    generatorSource,
    /locateWorkbookSheet\(archive, SLEEP_STANDBY_SHEET_NAMES, \{ required: false \}\)/,
  );
  assert.match(generatorSource, /clearedSleepStandbyRows: Boolean\(sleepStandbySheet\)/);
});
