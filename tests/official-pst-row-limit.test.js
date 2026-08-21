import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url),
  "utf8",
);

test("PST & Train Prep output ends at row 50 with the summary formula preserved", () => {
  assert.match(generatorSource, /const PST_LAST_DATA_ROW = 49;/);
  assert.match(generatorSource, /const PST_LAST_OUTPUT_ROW = 50;/);
  assert.match(generatorSource, /function pstSummaryRow\(/);
  assert.match(generatorSource, /const summaryClone = sourceRowNode\.cloneNode\(true\)/);
  assert.match(generatorSource, /formula\.setAttribute\("ref", replaceReferenceRow/);
  assert.match(generatorSource, /summaryRow: PST_LAST_OUTPUT_ROW/);
});

test("PST row normalization keeps dependent workbook ranges aligned", () => {
  assert.match(generatorSource, /function normalizePstTableRange\(/);
  assert.match(generatorSource, /PST_LAST_DATA_ROW\)\)/);
  assert.match(generatorSource, /function normalizePstCalcChain\(/);
  assert.match(generatorSource, /function normalizePstPrintArea\(/);
  assert.match(generatorSource, /normalizedPstRows: true/);
});
