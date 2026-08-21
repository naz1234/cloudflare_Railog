import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const depotSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("standalone West and East PST Excel output ends at row 49", () => {
  assert.match(
    depotSource,
    /const depotRows = buildPSTExportRows\(logLines, completedBy, normalizedDepot, false\);/,
  );
});

test("combined PST Excel output keeps its existing sheet behavior", () => {
  assert.match(
    depotSource,
    /const combinedRl3Rows = buildPSTExportRows\(logLines, completedBy, "", false\);/,
  );
  assert.match(
    depotSource,
    /const westRl3Rows = buildPSTExportRows\(logLines, completedBy, "west", true\);/,
  );
  assert.match(
    depotSource,
    /const eastRl3Rows = buildPSTExportRows\(logLines, completedBy, "east", true\);/,
  );
});
