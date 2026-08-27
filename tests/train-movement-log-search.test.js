import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const stylesheetSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const sheetStart = pageSource.indexOf("function TrainMovementExcelSheet");
const sheetEnd = pageSource.indexOf("function cleanMovementCustomTimeInput", sheetStart);
const sheetSource = pageSource.slice(sheetStart, sheetEnd);

test("movement log search checks the main train, replacement train, and saved log text", () => {
  assert.match(pageSource, /\[row\.trainId, row\.replacedBy\]/);
  assert.match(pageSource, /String\(entry\.text \|\| ""\)\.match\(\/\\bT0\*\\d\{1,2\}\\b\/gi\)/);
  assert.match(sheetSource, /trainMovementRowMatchesSearch\(row, trainSearchKey\)/);
  assert.match(sheetSource, /trainMovementLogEntryMatchesSearch\(entry, trainSearchKey\)/);
});

test("combined movement section exposes the train search and depot-operation results", () => {
  assert.match(sheetSource, /placeholder="Search train ID in swapping, insertion and removal logs…"/);
  assert.match(sheetSource, /getMovementDepotLabel\(row\.depot\)/);
  assert.match(sheetSource, /formatMovementExcelOperation\(entry\.operation\)/);
  assert.match(sheetSource, /not found in the movement sheet or either depot log/);
});

test("matching spreadsheet rows and saved log lines use the shared yellow highlight", () => {
  assert.match(sheetSource, /theme-movement-sheet-row \$\{isSearchMatch \? "is-search-match"/);
  assert.match(sheetSource, /theme-movement-log-line \$\{isSearchMatch \? "is-search-match"/);
  assert.match(stylesheetSource, /theme-movement-sheet-row\.is-search-match > td/);
  assert.match(stylesheetSource, /theme-movement-log-line\.is-search-match/);
});
