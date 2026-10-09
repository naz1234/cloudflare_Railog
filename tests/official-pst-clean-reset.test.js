import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { XmlElement as Element, xmlDocument } from "./helpers/spreadsheet-dom-fixture.js";

const source = readFileSync(new URL("../src/components/OfficialEastExcelGenerator.jsx", import.meta.url), "utf8");
const helpers = vm.runInNewContext(`${source.slice(source.indexOf("const XLSX_MIME"), source.indexOf("export default"))}\n({clearPstTrainPrepRows, disablePstTableBanding, readCellText, writeInlineString, findCell})`);
function fixture() {
  const font = new Element("font", {}, [new Element("sz", { val: "12" }), new Element("color", { rgb: "FFFF0000" })]);
  const style = new Element("xf", { fontId: "0", fillId: "0", borderId: "2", numFmtId: "165" }, [new Element("alignment", { horizontal: "center", vertical: "center" })]);
  const styles = xmlDocument(new Element("styleSheet", {}, [new Element("fonts", { count: "1" }, [font]), new Element("fills", { count: "1" }, [new Element("fill", {}, [new Element("patternFill", { patternType: "solid" }, [new Element("fgColor", { rgb: "FFFFFF5C" })])])]), new Element("cellXfs", { count: "1" }, [style])]));
  const rows = Array.from({ length: 50 }, (_, index) => new Element("row", { r: String(index + 1) },
    Array.from({ length: 13 }, (_, column) => new Element("c", { r: `${String.fromCharCode(65 + column)}${index + 1}`, s: "0" })),
  ));
  const sheet = xmlDocument(new Element("worksheet", {}, [new Element("sheetData", {}, rows)]));
  helpers.writeInlineString(sheet, "L1", "Verified via FLDC?");
  helpers.writeInlineString(sheet, "M1", "Verified via FLDC by");
  helpers.writeInlineString(sheet, "L2", "Yes/No");
  helpers.writeInlineString(sheet, "M2", "DC Name");
  helpers.writeInlineString(sheet, "A50", "PST summary");
  for (const row of [3, 27, 49]) {
    helpers.writeInlineString(sheet, `L${row}`, "Yes");
    helpers.writeInlineString(sheet, `M${row}`, "MARK");
    helpers.writeInlineString(sheet, `C${row}`, "T43");
  }
  return { sheet, styles };
}
const read = (sheet, reference) => helpers.readCellText(sheet, reference, {}, []);

test("PST reset clears both FLDC fields through the last daily row", () => {
  const { sheet, styles } = fixture();
  helpers.clearPstTrainPrepRows(sheet, styles);
  for (let row = 3; row <= 49; row += 1) for (const column of "ABCDEFGHIJKLM") assert.equal(read(sheet, `${column}${row}`), "");
  assert.equal(read(sheet, "L1"), "Verified via FLDC?");
  assert.equal(read(sheet, "M1"), "Verified via FLDC by");
  assert.equal(read(sheet, "L2"), "Yes/No");
  assert.equal(read(sheet, "M2"), "DC Name");
  assert.equal(read(sheet, "A50"), "PST summary");
});

test("PST body becomes white with black text while preserving borders, number formats and headers", () => {
  const { sheet, styles } = fixture();
  helpers.clearPstTrainPrepRows(sheet, styles);
  const xfs = styles.getElementsByTagNameNS("*", "xf");
  const fills = styles.getElementsByTagNameNS("*", "fill");
  const fonts = styles.getElementsByTagNameNS("*", "font");
  for (const reference of ["C3", "D27", "K49", "L49", "M49"]) {
    const style = xfs[Number(helpers.findCell(sheet, reference).getAttribute("s"))];
    assert.equal(fills[Number(style.getAttribute("fillId"))].getElementsByTagNameNS("*", "fgColor")[0].getAttribute("rgb"), "FFFFFFFF");
    assert.equal(fonts[Number(style.getAttribute("fontId"))].getElementsByTagNameNS("*", "color")[0].getAttribute("rgb"), "FF000000");
    assert.equal(style.getAttribute("borderId"), "2");
    assert.equal(style.getAttribute("numFmtId"), "165");
  }
  assert.equal(helpers.findCell(sheet, "L1").getAttribute("s"), "0");
  assert.equal(helpers.findCell(sheet, "A50").getAttribute("s"), "0");
});

test("PST table does not reintroduce banded row or column fills", () => {
  const style = new Element("tableStyleInfo", { name: "TableStyleLight8", showRowStripes: "1", showColumnStripes: "1" });
  helpers.disablePstTableBanding(xmlDocument(new Element("table", { ref: "A1:K49" }, [style])));
  assert.equal(style.getAttribute("showRowStripes"), "0");
  assert.equal(style.getAttribute("showColumnStripes"), "0");
  assert.equal(style.getAttribute("name"), "TableStyleLight8");
});
