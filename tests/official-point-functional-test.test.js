import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("Next Day Excel Generator updates the Point Functional Test tab", () => {
  assert.match(generatorSource, /const POINTS_FUNCTIONAL_TEST_SHEET_NAME = "Point Functional Test";/);
  assert.match(generatorSource, /function writePointFunctionalTestForDate\(/);
  assert.match(generatorSource, /pointFunctionalTestRowForDate\(sheetDocument, targetDate\)/);
  assert.match(generatorSource, /latestPerformedPointFunctionalRow\(sheetDocument, targetRow, config\.lastStatusColumn\)/);
  assert.match(generatorSource, /archive\[pointsSheetPath\] = strToU8/);
});

test("Point Functional Test completed-by text uses the controller input", () => {
  assert.match(generatorSource, /Completed by DC \$\{controllerName\.trim\(\)\}/);
  assert.match(generatorSource, /noteSeparator: "\\n"/);
  assert.match(generatorSource, /noteSeparator: " - "/);
  assert.match(generatorSource, /updatedPointFunctionalTest: true/);
});
