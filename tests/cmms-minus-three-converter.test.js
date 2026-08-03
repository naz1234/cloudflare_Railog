import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  buildCmmsMinusThreeFileName,
  createCmmsMinusThreeWorkbook,
  formatCmmsAdjustedText,
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

test("CMMS conversion supports either a two-minute or three-minute deduction", () => {
  assert.equal(formatCmmsAdjustedText(46237.39097222222, 2), "03-08-2026 09:21:00");
  assert.equal(formatCmmsAdjustedText(46237.39097222222, 3), "03-08-2026 09:20:00");
});

test("CMMS rows are discovered by required headers and preserve source order", () => {
  const rows = parseCmmsMinusThreeMatrix([
    ["Train Number", "Description", "Line", "Next Wash", "Train Location", "Last Wash"],
    ["L3-MV-304", "Train Volume 304", "L3", 46237.39097222222, "OPE", 46234.39097222222],
    ["L3-MV-305", "Train Volume 305", "L3", 46237.91458333333, "MAINT", 46234.91458333333],
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.trainNumber), ["L3-MV-304", "L3-MV-305"]);
  assert.equal(rows[0].nextWashText, "03-08-2026 09:23:00");
  assert.equal(rows[0].outputText, "03-08-2026 09:20:00");
  assert.equal(rows[0].trainLocation, "OPE");
  assert.equal(rows[0].isMaintenance, false);
  assert.equal(rows[1].trainLocation, "MAINT");
  assert.equal(rows[1].isMaintenance, true);
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

  assert.equal(sheet.D1.v, "OUTPUT –3 Time");
  assert.equal(sheet.D2.v, "03-08-2026 09:20:00");
  assert.equal(sheet.D2.t, "s");
  assert.equal(sheet.D2.z, "@");
  assert.equal(sheet.C2.t, "n");
});

test("download workbook uses the selected deduction and only the supplied trains", () => {
  const rows = parseCmmsMinusThreeMatrix([
    ["Train Number", "Description", "Next Wash", "Train Location"],
    ["L3-MV-304", "Train Volume 304", 46237.39097222222, "OPE"],
    ["L3-MV-336", "Train Volume 336", 46237.91458333333, "MAINT"],
  ]);
  const includedRows = rows.filter((row) => !row.isMaintenance);
  const workbook = createCmmsMinusThreeWorkbook(includedRows, XLSX, 2);
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const reopened = XLSX.read(bytes, { type: "array", cellStyles: true, cellDates: false });
  const sheet = reopened.Sheets["List of Train Wash Record"];

  assert.equal(sheet.D1.v, "OUTPUT –2 Time");
  assert.equal(sheet.D2.v, "03-08-2026 09:21:00");
  assert.equal(sheet.D2.t, "s");
  assert.equal(sheet.D2.z, "@");
  assert.equal(sheet.A3, undefined);
});

test("CMMS output filename follows the supplied example", () => {
  assert.equal(buildCmmsMinusThreeFileName("44155245.xlsx"), "44155245–OUTPUT.xlsx");
  assert.equal(buildCmmsMinusThreeFileName("44155245–OUTPUT.xlsx"), "44155245–OUTPUT.xlsx");
});

test("the converter window is below Manual Washing Entry and exposes upload, selection, and download", () => {
  assert.ok(trainWashingSource.indexOf("Manual Washing Entry") < trainWashingSource.indexOf("<CmmsMinusThreeConverter />"));
  assert.match(converterSource, /Subtract 2 or 3 CMMS Time Entries/);
  assert.match(converterSource, /\[2, 3\]\.map/);
  assert.match(converterSource, /not included because Train Location is/);
  assert.match(converterSource, /Exclude MAINT/);
  assert.match(converterSource, /Converted Preview/);
  assert.match(converterSource, /Download Output Excel/);
  assert.match(converterSource, /Upload CMMS washing Excel/);
});
