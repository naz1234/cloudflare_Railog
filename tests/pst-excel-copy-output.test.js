import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PST_EXCEL_COPY_COLUMN_COUNT,
  PST_EXCEL_COPY_FIRST_ROW,
  PST_EXCEL_COPY_LAST_ROW,
  buildPSTExcelClipboardText,
} from "../src/lib/pstExcelClipboard.js";

test("PST Excel clipboard output copies only rows 3 through 49", () => {
  const rows = Array.from({ length: 52 }, (_, rowIndex) =>
    Array.from({ length: PST_EXCEL_COPY_COLUMN_COUNT }, (_, columnIndex) => `R${rowIndex + 1}C${columnIndex + 1}`),
  );

  const copiedRows = buildPSTExcelClipboardText(rows).split("\n");

  assert.equal(PST_EXCEL_COPY_FIRST_ROW, 3);
  assert.equal(PST_EXCEL_COPY_LAST_ROW, 49);
  assert.equal(copiedRows.length, 47);
  assert.equal(copiedRows[0].split("\t")[0], "R3C1");
  assert.equal(copiedRows.at(-1).split("\t").at(-1), "R49C11");
  assert.doesNotMatch(copiedRows.join("\n"), /R2C|R50C/);
});

test("PST Excel clipboard output preserves an 11-column paste shape", () => {
  const rows = [
    ["header"],
    [],
    ["23-Aug-26", "V09-01-02", "TS#301"],
  ];

  const copiedRows = buildPSTExcelClipboardText(rows).split("\n");

  assert.equal(copiedRows.length, 47);
  copiedRows.forEach((row) => assert.equal(row.split("\t").length, PST_EXCEL_COPY_COLUMN_COUNT));
  assert.equal(copiedRows[0].split("\t").slice(0, 3).join("|"), "23-Aug-26|V09-01-02|TS#301");
});

test("PST panel exposes East, West, and Combined clipboard actions", () => {
  const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

  assert.match(source, /ED Copy Excell Output/);
  assert.match(source, /WD Copy Excell Output/);
  assert.match(source, /Combined Copy Excell Output/);
  assert.match(source, /buildPSTExcelClipboardText\(copyRows\)/);
  assert.match(source, /handleCopyExcelOutput\("combined"\)/);
});
