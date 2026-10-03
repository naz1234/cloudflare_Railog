import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("Train Request no longer renders the OCC briefing row-copy or Train Removal Plan panels", () => {
  assert.doesNotMatch(pageSource, /<OccBriefingFormSigner\b/);
  assert.doesNotMatch(pageSource, /import\s+OccBriefingFormSigner\b/);
  assert.doesNotMatch(pageSource, /<TrainRequestedNotInRemoval\b/);
});

test("removing the two panels keeps stabling, movement logs, request summary, Excel generator and side panels", () => {
  assert.match(pageSource, /<StablingSection\s+depot="west"/);
  assert.match(pageSource, /<StablingSection\s+depot="east"/);
  assert.match(pageSource, /<TrainMovementExcelSheet\b/);
  assert.match(pageSource, /<RemovalLogOutputFromTrainRem\b/);
  assert.match(pageSource, /<RequestedTrainActionSummary requests=\{requests\}\s*\/>/);
  assert.match(pageSource, /<OfficialEastExcelGenerator\b[^]*?\/>(?:\s*)<\/div>\s*\{\/\* RIGHT PANEL \*\/\}/);
  assert.match(pageSource, /<MaintenancePanel\b/);
  assert.match(pageSource, /<TrainRemPanel\b/);
});
