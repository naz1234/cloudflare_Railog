import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { XmlElement as Element, xmlDocument } from "./helpers/spreadsheet-dom-fixture.js";

const source = readFileSync(new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url), "utf8");
const helpers = vm.runInNewContext(`${source.slice(source.indexOf("const XLSX_MIME"), source.indexOf("export default"))}\n({clearDailyDepotLogRows, restoreDailyDepotLogHeader, normalizeDailyDepotLogMerges, normalizeDailyDepotLogRows, formatDailyDepotLogCells, resetDailyDepotLogView, writeFirstDepotRemovalLog, readCellText, writeInlineString, findCell, DEPOT_CONFIGS})`);
function fixture() {
  const rows = Array.from({ length: 39 }, (_, index) => new Element("row", { r: String(index + 1), ht: "39" }, Array.from({ length: 9 }, (_, column) => new Element("c", { r: `${String.fromCharCode(65 + column)}${index + 1}`, s: index === 8 ? "1" : "0" }))));
  const sheet = xmlDocument(new Element("worksheet", {}, [new Element("cols", {}, [new Element("col", { min: "1", max: "9", width: "25" })]), new Element("sheetData", {}, rows), new Element("mergeCells", { count: "3" }, [new Element("mergeCell", { ref: "B7:I8" }), new Element("mergeCell", { ref: "E9:H9" }), new Element("mergeCell", { ref: "E15:H16" })])]));
  const styles = xmlDocument(new Element("styleSheet", {}, [new Element("numFmts", { count: "1" }, [new Element("numFmt", { numFmtId: "164", formatCode: "dd-mmm-yy" })]), new Element("fills", { count: "2" }, [new Element("fill"), new Element("fill", {}, [new Element("patternFill", {}, [new Element("fgColor", { rgb: "FF00B050" })])])]), new Element("cellXfs", { count: "2" }, [new Element("xf", { numFmtId: "0", fillId: "0" }, [new Element("alignment", { horizontal: "center", vertical: "center" })]), new Element("xf", { numFmtId: "0", fillId: "1" }, [new Element("alignment", { horizontal: "center", vertical: "center" })])])]));
  helpers.writeInlineString(sheet, "A9", "OCC Ref. Number");
  helpers.writeInlineString(sheet, "B9", "Time");
  return { sheet, styles, rows };
}
const read = (sheet, reference) => helpers.readCellText(sheet, reference, {}, []);

for (const depot of ["east", "west"]) test(`${depot}: headings survive daily cleanup and the first removal uses row 10`, () => {
  const { sheet, styles } = fixture();
  helpers.writeInlineString(sheet, "E10", "Previous daily log");
  helpers.clearDailyDepotLogRows(sheet);
  assert.equal(read(sheet, "A9"), "OCC Ref. Number");
  assert.equal(read(sheet, "B9"), "Time");
  assert.equal(read(sheet, "E10"), "");
  const summary = "00:08 hrs – T43 removed.\n00:14 hrs – T11 removed.";
  helpers.writeFirstDepotRemovalLog(sheet, new Date(2026, 9, 10), { entries: [{ time: "00:08" }], text: summary }, helpers.DEPOT_CONFIGS[depot]);
  assert.equal(read(sheet, "D10"), "Removal");
  assert.equal(Number(read(sheet, "B10")), 8 / 1440);
  assert.equal(read(sheet, "E10"), summary);
  assert.equal(read(sheet, depot === "east" ? "D11" : "D12"), "Points Functional Test");
  assert.equal(read(sheet, "D14"), "Passenger Service Test");
  helpers.formatDailyDepotLogCells(sheet, styles);
  const xfs = styles.getElementsByTagNameNS("*", "xf");
  const timeStyle = xfs[Number(helpers.findCell(sheet, "B10").getAttribute("s"))];
  const timeFormat = styles.getElementsByTagNameNS("*", "numFmt").find((format) => format.getAttribute("numFmtId") === timeStyle.getAttribute("numFmtId"));
  assert.equal(timeFormat.getAttribute("formatCode"), "hh:mm");
  const summaryStyle = xfs[Number(helpers.findCell(sheet, "E10").getAttribute("s"))];
  assert.equal(summaryStyle.getElementsByTagNameNS("*", "alignment")[0].getAttribute("wrapText"), "1");
  assert.equal(summaryStyle.getElementsByTagNameNS("*", "alignment")[0].getAttribute("horizontal"), "left");
});

test("daily merges leave official headings and handover notes intact", () => {
  const { sheet } = fixture();
  helpers.normalizeDailyDepotLogMerges(sheet);
  const merges = sheet.getElementsByTagNameNS("*", "mergeCell").map((merge) => merge.getAttribute("ref"));
  assert.equal(merges.filter((reference) => reference === "E9:H9").length, 1);
  assert.ok(merges.includes("B7:I8"));
  assert.ok(!merges.includes("E15:H16"));
  assert.ok(merges.includes("E15:H15") && merges.includes("E16:H16"));
});

test("row heights fit summary text without resizing the heading", () => {
  const { sheet, rows } = fixture();
  rows[8].setAttribute("ht", "25.5");
  helpers.writeInlineString(sheet, "E10", Array(15).fill("A timed log entry.").join("\n"));
  helpers.normalizeDailyDepotLogRows(sheet, {}, []);
  assert.equal(rows[8].getAttribute("ht"), "25.5");
  assert.equal(rows[9].getAttribute("ht"), "252");
  assert.equal(rows[10].getAttribute("ht"), "39");
});

test("older same-day downloads recover the first record before restoring headings", () => {
  const { sheet, styles } = fixture();
  helpers.writeInlineString(sheet, "A9", "DCE-10102026-01");
  helpers.writeInlineString(sheet, "E9", "Existing removal details");
  helpers.writeInlineString(sheet, "A10", "DCE-10102026-02");
  helpers.restoreDailyDepotLogHeader(sheet, styles, {}, [], false);
  assert.equal(read(sheet, "A9"), "OCC Ref. Number");
  assert.equal(read(sheet, "A10"), "DCE-10102026-01");
  assert.equal(read(sheet, "E10"), "Existing removal details");
  assert.equal(read(sheet, "A11"), "DCE-10102026-02");
});

test("header recovery refuses to discard a full log's last record", () => {
  const { sheet, styles } = fixture();
  helpers.writeInlineString(sheet, "A9", "DCE-10102026-01");
  helpers.writeInlineString(sheet, "E39", "Final existing record");
  assert.throws(() => helpers.restoreDailyDepotLogHeader(sheet, styles, {}, [], false), /log is full/);
  assert.equal(read(sheet, "E39"), "Final existing record");
});

test("generated workbook opens at its heading instead of the previous day's blank tail", () => {
  const selection = new Element("selection", { activeCell: "A33", sqref: "A33:XFD38" });
  const view = new Element("sheetView", { topLeftCell: "A32", zoomScale: "55" }, [selection]);
  const sheet = xmlDocument(new Element("worksheet", {}, [new Element("sheetViews", {}, [view])]));
  helpers.resetDailyDepotLogView(sheet);
  assert.equal(view.getAttribute("topLeftCell"), "A1");
  assert.equal(view.getAttribute("zoomScale"), "55");
  assert.equal(selection.getAttribute("activeCell"), "A10");
  assert.equal(selection.getAttribute("sqref"), "A10");
});
