import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";
import {
  analyzeMaspoArchive,
  inspectRarArchiveFlags,
  validateMaspoWorksheetBounds,
} from "../src/lib/maspoArchiveReader.js";

function createWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "Renamed operations sheet",
  );
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));
}

function createUpload(bytes, name) {
  const upload = new Blob([bytes], { type: "application/octet-stream" });
  Object.defineProperty(upload, "name", { configurable: true, value: name });
  return upload;
}

function insertDuplicateSolidRar5MainHeader(bytes) {
  let sizeOffset = 12;
  let headerSize = 0;
  let multiplier = 1;
  while (sizeOffset < bytes.length) {
    const byte = bytes[sizeOffset];
    sizeOffset += 1;
    headerSize += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) break;
    multiplier *= 128;
  }
  const firstHeaderEnd = sizeOffset + headerSize;
  const duplicateSolidMain = new Uint8Array([
    0x00, 0x00, 0x00, 0x00,
    0x03, 0x01, 0x00, 0x04,
  ]);
  const crafted = new Uint8Array(bytes.length + duplicateSolidMain.length);
  crafted.set(bytes.subarray(0, firstHeaderEnd));
  crafted.set(duplicateSolidMain, firstHeaderEnd);
  crafted.set(bytes.subarray(firstHeaderEnd), firstHeaderEnd + duplicateSolidMain.length);
  return crafted;
}

test("analyzes nested Excel workbooks from a ZIP and ignores temporary files", async () => {
  const workbook = createWorkbook([
    ["Details", "Reference Number", "Activity", "Event Time", "Area"],
    [
      "Pending Movements:\n- TR31 G to C10 (Planned Movement)",
      "MASPO-080826-02",
      "Sign in",
      "0730H",
      "MACR",
    ],
  ]);
  const archive = zipSync({
    "daily logs/renamed-book.xlsx": workbook,
    "daily logs/~$renamed-book.xlsx": strToU8("temporary Excel lock file"),
    "__MACOSX/renamed-book.xlsx": strToU8("macOS metadata"),
    "notes/readme.txt": strToU8("not a spreadsheet"),
  });

  const analysis = await analyzeMaspoArchive(
    createUpload(archive, "daily-maspo-logs.zip"),
    "T31",
  );

  assert.equal(analysis.spreadsheetCount, 1);
  assert.equal(analysis.parsedWorkbookCount, 1);
  assert.equal(analysis.sheetsScanned, 1);
  assert.equal(analysis.latest.reference, "MASPO-080826-02");
  assert.equal(analysis.latest.route, "G → C10");
  assert.equal(analysis.latest.areaDetail, "Automatic area → Workshop");
  assert.match(analysis.summaryText, /Ref: MASPO-080826-02/);
});

test("rejects an archive without a supported Excel workbook", async () => {
  const archive = zipSync({ "notes/readme.txt": strToU8("no workbooks here") });
  await assert.rejects(
    analyzeMaspoArchive(createUpload(archive, "empty.zip"), "T31"),
    /No supported Excel files were found/i,
  );
});

test("analyzes a real non-solid RAR5 archive containing a nested workbook", async () => {
  const rarBytes = readFileSync(new URL("./fixtures/maspo-rar-sample.rar", import.meta.url));
  assert.deepEqual(inspectRarArchiveFlags(rarBytes), {
    format: 5,
    solid: false,
    volume: false,
  });

  const analysis = await analyzeMaspoArchive(
    createUpload(rarBytes, "maspo-rar-sample.rar"),
    "TR31",
  );
  assert.equal(analysis.parsedWorkbookCount, 1);
  assert.equal(analysis.latest.reference, "MASPO-080826-02");
  assert.equal(analysis.latest.route, "G → C10");
  assert.equal(analysis.latest.areaDetail, "Automatic area → Workshop");
});

test("rejects a solid RAR5 header before loading the decoder", async () => {
  const solidRarHeader = new Uint8Array([
    0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x03, 0x01, 0x00, 0x04,
  ]);
  assert.equal(inspectRarArchiveFlags(solidRarHeader).solid, true);
  await assert.rejects(
    analyzeMaspoArchive(createUpload(solidRarHeader, "solid.rar"), "T31"),
    /Solid RAR archives are not supported/i,
  );
});

test("rejects a later duplicate solid RAR5 main header before decoding", async () => {
  const rarBytes = readFileSync(new URL("./fixtures/maspo-rar-sample.rar", import.meta.url));
  const craftedRar = insertDuplicateSolidRar5MainHeader(rarBytes);

  assert.throws(
    () => inspectRarArchiveFlags(craftedRar),
    /more than one main header/i,
  );
  await assert.rejects(
    analyzeMaspoArchive(createUpload(craftedRar, "duplicate-main.rar"), "T31"),
    /more than one main header/i,
  );
});

test("rejects duplicate RAR4 main headers during the full block scan", () => {
  const craftedRar4 = new Uint8Array([
    0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00,
    0x00, 0x00, 0x73, 0x00, 0x00, 0x07, 0x00,
    0x00, 0x00, 0x73, 0x08, 0x00, 0x07, 0x00,
    0x00, 0x00, 0x7b, 0x00, 0x00, 0x07, 0x00,
  ]);

  assert.throws(
    () => inspectRarArchiveFlags(craftedRar4),
    /more than one main header/i,
  );
});

test("rejects a RAR with excessive block records before decoding", () => {
  const signature = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
  const mainHeader = [0x00, 0x00, 0x73, 0x00, 0x00, 0x07, 0x00];
  const markerHeader = [0x00, 0x00, 0x72, 0x00, 0x00, 0x07, 0x00];
  const craftedRar4 = new Uint8Array(signature.length + mainHeader.length + markerHeader.length * 10_000);
  craftedRar4.set(signature, 0);
  craftedRar4.set(mainHeader, signature.length);
  for (let index = 0; index < 10_000; index += 1) {
    craftedRar4.set(markerHeader, signature.length + mainHeader.length + markerHeader.length * index);
  }

  assert.throws(
    () => inspectRarArchiveFlags(craftedRar4),
    /more than 10,?000 block records/i,
  );
});

test("rejects unsafe sparse worksheet dimensions before row materialization", () => {
  assert.throws(
    () => validateMaspoWorksheetBounds({ "!ref": "A1:XFD1048576" }, "Huge sheet"),
    /exceeds the supported worksheet dimensions/i,
  );
});

test("rejects an oversized inner XLSX entry before SheetJS parses it", async () => {
  const oversizedWorkbook = zipSync({
    "xl/sharedStrings.xml": new Uint8Array(26 * 1024 * 1024),
  }, { level: 9 });
  await assert.rejects(
    analyzeMaspoArchive(createUpload(oversizedWorkbook, "oversized.xlsx"), "T31"),
    /internal workbook file larger than 25 MB/i,
  );
});
