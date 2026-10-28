import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { XmlElement as Element, xmlDocument } from "./helpers/spreadsheet-dom-fixture.js";

const source = readFileSync(new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url), "utf8");
const helpers = vm.runInNewContext(`${source.slice(source.indexOf("const XLSX_MIME"), source.indexOf("export default"))}
  ({pstSummaryRow, movePstSummaryToLastRow, normalizePstTrainPrepOutput, normalizePstCalcChain, findCell})`);

function fixture({ lastRow = 69, summaryRow = 0 } = {}) {
  const rows = Array.from({ length: lastRow }, (_, index) => new Element("row", { r: String(index + 1) },
    Array.from({ length: 13 }, (_, column) => new Element("c", { r: `${String.fromCharCode(65 + column)}${index + 1}`, s: "0" })),
  ));
  const sheet = xmlDocument(new Element("worksheet", {}, [
    new Element("dimension", { ref: `A1:M${lastRow}` }),
    new Element("sheetData", {}, rows),
    new Element("mergeCells", { count: "2" }, [
      new Element("mergeCell", { ref: "L1:M1" }),
      new Element("mergeCell", { ref: `A${lastRow}:K${lastRow}` }),
    ]),
  ]));
  if (summaryRow) {
    const formula = new Element("f", { ref: `A${summaryRow}:K${summaryRow}` });
    formula.textContent = '"Total PST passed: " & COUNTIF(F3:F49,"PASS")';
    helpers.findCell(sheet, `A${summaryRow}`).appendChild(formula);
  }
  return sheet;
}

for (const depot of ["East", "West"]) {
  test(`${depot} PST template without a summary still normalizes to the output row limit`, () => {
    const sheet = fixture();
    assert.equal(helpers.pstSummaryRow(sheet), 0);
    // No workbook/print area is needed here; the shared helper serves both depots.
    const result = helpers.normalizePstTrainPrepOutput(sheet, {}, "xl/worksheets/sheet5.xml", 5, -1);
    assert.equal(result.sourceRow, 0);
    assert.equal(result.summaryRow, null);
    assert.equal(sheet.getElementsByTagNameNS("*", "row").length, 50);
    assert.equal(sheet.getElementsByTagNameNS("*", "dimension")[0].getAttribute("ref"), "A1:M50");
    assert.equal(sheet.getElementsByTagNameNS("*", "f").length, 0);
    assert.equal(helpers.findCell(sheet, "C49").getAttribute("r"), "C49");
    assert.deepEqual(sheet.getElementsByTagNameNS("*", "mergeCell").map((merge) => merge.getAttribute("ref")), ["L1:M1"]);
  });
}

test("existing PST summary formulas are preserved and moved to row 50", () => {
  const sheet = fixture({ lastRow: 69, summaryRow: 69 });
  const originalFormula = helpers.findCell(sheet, "A69").textContent;
  const result = helpers.normalizePstTrainPrepOutput(sheet, {}, "xl/worksheets/sheet5.xml", 5, -1);
  assert.equal(result.sourceRow, 69);
  assert.equal(result.summaryRow, 50);
  assert.equal(helpers.findCell(sheet, "A50").textContent, originalFormula);
  assert.equal(helpers.findCell(sheet, "A50").getElementsByTagNameNS("*", "f")[0].getAttribute("ref"), "A50:K50");
  assert.equal(helpers.findCell(sheet, "A69"), undefined);
  assert.deepEqual(sheet.getElementsByTagNameNS("*", "mergeCell").map((merge) => merge.getAttribute("ref")), ["L1:M1", "A50:K50"]);
});

test("a PST summary already at row 50 is not duplicated", () => {
  const sheet = fixture({ lastRow: 50, summaryRow: 50 });
  helpers.normalizePstTrainPrepOutput(sheet, {}, "xl/worksheets/sheet5.xml", 5, -1);
  assert.equal(sheet.getElementsByTagNameNS("*", "row").length, 50);
  assert.equal(sheet.getElementsByTagNameNS("*", "f").length, 1);
});

test("summary-free PST templates do not rewrite the calculation chain", () => {
  const archive = { "xl/calcChain.xml": "original chain" };
  helpers.normalizePstCalcChain(archive, 5, 0);
  assert.equal(archive["xl/calcChain.xml"], "original chain");
});

test("a missing PST sheetData remains a clear error instead of a successful export", () => {
  const sheet = xmlDocument(new Element("worksheet"));
  assert.throws(() => helpers.normalizePstTrainPrepOutput(sheet, {}, "xl/worksheets/sheet5.xml", 5, -1), /worksheet rows could not be read/);
});
