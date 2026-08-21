import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("East Depot output reserves categories in the requested order", () => {
  assert.match(
    generatorSource,
    /const EAST_RESERVED_CATEGORIES = \[\s*"Points Functional Test",\s*"Train Preparation",\s*"Internal Train Cleaning",\s*"Passenger Service Test",\s*\];/,
  );
  assert.match(
    generatorSource,
    /depotConfig\.key === "east"\s*\? EAST_RESERVED_CATEGORIES\s*: DEFAULT_RESERVED_CATEGORIES/,
  );
});

test("West Depot order stays unchanged and the Points summary follows its category row", () => {
  assert.match(
    generatorSource,
    /const DEFAULT_RESERVED_CATEGORIES = \[\s*"Train Preparation",\s*"Points Functional Test",\s*"Internal Train Cleaning",\s*"Passenger Service Test",\s*\];/,
  );
  assert.match(
    generatorSource,
    /const pointsFunctionalRow = 10 \+ reservedCategories\.indexOf\("Points Functional Test"\);/,
  );
  assert.match(generatorSource, /writeInlineString\(sheetDocument, `E\$\{pointsFunctionalRow\}`/);
  assert.match(generatorSource, /setWorksheetRowHeight\(sheetDocument, pointsFunctionalRow,/);
  assert.doesNotMatch(
    generatorSource,
    /writeInlineString\(sheetDocument, "E11", POINTS_FUNCTIONAL_TEST_SUMMARIES/,
  );
});
