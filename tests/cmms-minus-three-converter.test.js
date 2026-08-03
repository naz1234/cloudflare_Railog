import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  buildCmmsMinusThreeFileName,
  createCmmsMinusThreeWorkbook,
  formatCmmsMinusThreeText,
  parseCmmsMinusThreeMatrix,
} from "../src/lib/cmmsMinusThreeConverter.js";

const trainWashingSource = fs.readFileSync(new URL("../src/components/TrainWashing.jsx", import.meta.url), "utf8");
const converterSource = fs.readFileSync(new URL("../src/components/CmmsMinusThreeConverter.jsx", import.meta.url), "utf8");

test("CMMS Next Wash time is converted exactly three minutes earlier", () => {
  assert.equal(formatCmmsMinusThreeText(46237.39097222222), "03-08-2026 09:20:00");
  assert.equal(formatCmmsMinusThreeText(46237.91458333333), "03-08-2026 21:54:00");
});

test("CMMS conversion handles a three-minute subtraction across midnight", () => {
  assert.equal(formatCmmsMinusThreeText("8/3/2026 12:02 AM"), "02-08-2026 23:59:00");
});

test("CMMS rows are discovered by required headers and preserve source order", () => {
  const rows = parseCmmsMinusThreeMatrix([
    ["Train Number", "Description", "Line", "Next Wash", "Train Location", "Last Wash"],
    ["L3-MV-304", "Train Volume 304", "L3", 46237.39097222222, "OPE", 46234.39097222222],
    ["L3-MV-305", "Train Volume 305", "L3", 46237.91458333333, "OPE", 46234.91458333333],
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.trainNumber), ["L3-MV-304", "L3-MV-305"]);
  assert.equal(rows[0].nextWashText, "03-08-2026 09:23:00");
  assert.equal(rows[0].outputText, "03-08-2026 09:20:00");
});

test("download workbook writes converted output as Excel Text cells", () => {
  const rows = parseCmmsMinusThreeMatrix([
    ["Train Number", "Description", "Next Wash"],
    ["L3-MV-304", "Train Volume 304", 46237.39097222222],
  ]);
  const workbook = createCmmsMinusThreeWorkbook(rows, XLSX);
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const reopened = XLSX.read(bytes, { type: "array", cellStyles: true, cellDates: false });
  const sheet = reopened.Sheets["List of Train Wash Record"];

  assert.equal(sheet.D2.v, "03-08-2026 09:20:00");
  assert.equal(sheet.D2.t, "s");
  assert.equal(sheet.D2.z, "@");
  assert.equal(sheet.C2.t, "n");
});

test("CMMS output filename follows the supplied example", () => {
  assert.equal(buildCmmsMinusThreeFileName("44155245.xlsx"), "44155245–OUTPUT.xlsx");
  assert.equal(buildCmmsMinusThreeFileName("44155245–OUTPUT.xlsx"), "44155245–OUTPUT.xlsx");
});

test("the converter window is below Manual Washing Entry and exposes upload, preview, and download", () => {
  assert.ok(trainWashingSource.indexOf("Manual Washing Entry") < trainWashingSource.indexOf("<CmmsMinusThreeConverter />"));
  assert.match(converterSource, /Convert –3 Time Excell from CMMS/);
  assert.match(converterSource, /Converted Preview/);
  assert.match(converterSource, /Download Output Excel/);
  assert.match(converterSource, /Upload CMMS washing Excel/);
});
