import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import {
  analyzeMaspoMovementSources,
  formatMaspoMovementSummary,
  isSupportedMaspoSpreadsheet,
} from "./maspoTrainMovement.js";

const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 180 * 1024 * 1024;
const MAX_SPREADSHEET_COUNT = 120;
const MAX_WORKBOOK_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_WORKBOOK_PACKAGE_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_PACKAGE_ENTRY_COUNT = 2_000;
const MAX_WORKSHEET_COUNT = 80;
const MAX_WORKSHEET_ROWS = 50_000;
const MAX_WORKSHEET_COLUMNS = 256;
const MAX_WORKSHEET_CELLS = 1_000_000;
const MAX_ANALYSIS_PACKAGE_BYTES = 160 * 1024 * 1024;
const MAX_ANALYSIS_WORKSHEETS = 240;
const MAX_ANALYSIS_ROWS = 150_000;
const MAX_ANALYSIS_CELLS = 2_000_000;
const MAX_ANALYSIS_TEXT_CHARACTERS = 16_000_000;
const MAX_RAR_BLOCK_COUNT = 10_000;

function hasBytes(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function isZip(bytes) {
  return (
    hasBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    hasBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    hasBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

function isRar(bytes) {
  return (
    hasBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
    hasBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])
  );
}

function readUint16Le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32Le(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readRarVint(bytes, state, limit = bytes.length, maxBytes = 10) {
  let value = 0;
  let multiplier = 1;
  for (let index = 0; index < maxBytes; index += 1) {
    if (state.offset >= limit) throw new Error("The RAR header is incomplete.");
    const byte = bytes[state.offset];
    state.offset += 1;
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) throw new Error("The RAR header contains an unsupported size.");
    if ((byte & 0x80) === 0) return value;
    multiplier *= 128;
  }
  throw new Error("The RAR header contains an invalid variable-length integer.");
}

function assertSingleRarMainHeader(count) {
  if (count > 1) {
    throw new Error("The RAR archive contains more than one main header and cannot be safely opened.");
  }
}

function assertRarBlockCount(count) {
  if (count > MAX_RAR_BLOCK_COUNT) {
    throw new Error(`The RAR archive contains more than ${MAX_RAR_BLOCK_COUNT.toLocaleString()} block records.`);
  }
}

function inspectRar4ArchiveFlags(bytes) {
  let offset = 7;
  let blockCount = 0;
  let mainHeaderCount = 0;
  let solid = false;
  let volume = false;

  while (offset < bytes.length) {
    if (offset + 7 > bytes.length) throw new Error("The RAR block header is incomplete.");

    const headerType = bytes[offset + 2];
    const headerFlags = readUint16Le(bytes, offset + 3);
    const headerSize = readUint16Le(bytes, offset + 5);
    if (headerSize < 7 || offset + headerSize > bytes.length) {
      throw new Error("The RAR block header is incomplete.");
    }
    if (blockCount === 0 && headerType !== 0x73) {
      throw new Error("The RAR archive does not start with a supported main header.");
    }

    let dataSize = 0;
    if (headerType === 0x73) {
      mainHeaderCount += 1;
      assertSingleRarMainHeader(mainHeaderCount);
      solid = Boolean(headerFlags & 0x0008);
      volume = Boolean(headerFlags & 0x0001);
    } else if (headerType === 0x74 || headerType === 0x7a) {
      if (headerSize < 32) throw new Error("The RAR file header is incomplete.");
      dataSize = readUint32Le(bytes, offset + 7);
      if (headerFlags & 0x0100) {
        if (headerSize < 40) throw new Error("The RAR large-file header is incomplete.");
        dataSize += readUint32Le(bytes, offset + 32) * 0x100000000;
      }
    } else if (headerType !== 0x7b && (headerFlags & 0x8000)) {
      if (headerSize < 11) throw new Error("The RAR long-block header is incomplete.");
      dataSize = readUint32Le(bytes, offset + 7);
    }

    const nextOffset = offset + headerSize + dataSize;
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > bytes.length) {
      throw new Error("The RAR block extends beyond the uploaded file.");
    }
    blockCount += 1;
    assertRarBlockCount(blockCount);
    if (headerType === 0x7b) break;
    offset = nextOffset;
  }

  if (mainHeaderCount !== 1) throw new Error("The RAR archive is missing its main header.");
  return { format: 4, solid, volume };
}

function inspectRar5ArchiveFlags(bytes) {
  let offset = 8;
  let blockCount = 0;
  let mainHeaderCount = 0;
  let solid = false;
  let volume = false;

  while (offset < bytes.length) {
    if (offset + 7 > bytes.length) throw new Error("The RAR block header is incomplete.");

    const sizeState = { offset: offset + 4 };
    const headerSize = readRarVint(bytes, sizeState, bytes.length, 3);
    if (headerSize < 1) throw new Error("The RAR block header has an invalid size.");
    const totalHeaderSize = 4 + (sizeState.offset - (offset + 4)) + headerSize;
    if (totalHeaderSize > 2 * 1024 * 1024 + 7) {
      throw new Error("The RAR block header is larger than the supported limit.");
    }
    const headerEnd = offset + totalHeaderSize;
    if (!Number.isSafeInteger(headerEnd) || headerEnd > bytes.length) {
      throw new Error("The RAR block header is incomplete.");
    }

    const headerState = { offset: sizeState.offset };
    const headerType = readRarVint(bytes, headerState, headerEnd, 8);
    const headerFlags = readRarVint(bytes, headerState, headerEnd, 8);
    if (blockCount === 0 && headerType !== 1) {
      throw new Error("The RAR archive does not start with a supported main header.");
    }
    if (headerFlags & 0x0001) readRarVint(bytes, headerState, headerEnd, 8);
    const dataSize = headerFlags & 0x0002
      ? readRarVint(bytes, headerState, headerEnd, 8)
      : 0;

    if (headerType === 1) {
      mainHeaderCount += 1;
      assertSingleRarMainHeader(mainHeaderCount);
      const archiveFlags = readRarVint(bytes, headerState, headerEnd, 8);
      solid = Boolean(archiveFlags & 0x0004);
      volume = Boolean(archiveFlags & 0x0001);
    }

    const nextOffset = headerEnd + dataSize;
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > bytes.length) {
      throw new Error("The RAR block extends beyond the uploaded file.");
    }
    blockCount += 1;
    assertRarBlockCount(blockCount);
    if (headerType === 5) break;
    offset = nextOffset;
  }

  if (mainHeaderCount !== 1) throw new Error("The RAR archive is missing its main header.");
  return { format: 5, solid, volume };
}

export function inspectRarArchiveFlags(bytes) {
  if (hasBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) {
    return inspectRar4ArchiveFlags(bytes);
  }
  if (hasBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) {
    return inspectRar5ArchiveFlags(bytes);
  }
  return { format: 0, solid: false, volume: false };
}

function assertUploadSize(file) {
  const size = Number(file?.size || 0);
  if (size > MAX_ARCHIVE_BYTES) {
    throw new Error("The selected file is larger than 60 MB. Please upload a smaller MASPO archive.");
  }
}

function assertSpreadsheetEntry(name, size, runningTotal) {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`${name} does not provide a safe expanded file size.`);
  }
  if (size > MAX_SPREADSHEET_BYTES) {
    throw new Error(`${name} is larger than the supported 30 MB Excel-file limit.`);
  }
  if (runningTotal + size > MAX_TOTAL_EXTRACTED_BYTES) {
    throw new Error("The extracted Excel files exceed the supported 180 MB total limit.");
  }
}

function normalizeEntryName(name = "") {
  return String(name).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isUsableSpreadsheetEntry(name = "") {
  const normalized = normalizeEntryName(name);
  const parts = normalized.split("/").filter(Boolean);
  const baseName = parts.at(-1) || "";
  return (
    isSupportedMaspoSpreadsheet(normalized) &&
    !parts.some((part) => part.toLowerCase() === "__macosx") &&
    !baseName.startsWith("~$")
  );
}

function preflightWorkbookPackage(entry) {
  if (!isZip(entry.data)) return { expandedBytes: entry.data.byteLength, entryCount: 1 };

  let entryCount = 0;
  let expandedBytes = 0;
  let limitError = "";
  try {
    unzipSync(entry.data, {
      filter: (innerEntry) => {
        if (limitError || String(innerEntry.name || "").endsWith("/")) return false;
        entryCount += 1;
        expandedBytes += Number(innerEntry.originalSize || 0);
        if (entryCount > MAX_WORKBOOK_PACKAGE_ENTRY_COUNT) {
          limitError = `${entry.name} contains too many internal workbook files.`;
        } else if (innerEntry.originalSize > MAX_WORKBOOK_PACKAGE_ENTRY_BYTES) {
          limitError = `${entry.name} contains an internal workbook file larger than 25 MB.`;
        } else if (expandedBytes > MAX_WORKBOOK_PACKAGE_BYTES) {
          limitError = `${entry.name} expands beyond the supported 80 MB workbook limit.`;
        }
        return false;
      },
    });
  } catch {
    if (limitError) throw new Error(limitError);
    throw new Error(`${entry.name} has a damaged Excel package structure.`);
  }
  if (limitError) throw new Error(limitError);
  return { expandedBytes, entryCount };
}

export function validateMaspoWorksheetBounds(worksheet, sheetName = "Worksheet") {
  const reference = String(worksheet?.["!ref"] || "");
  if (!reference) return { rowCount: 0, columnCount: 0, cellCount: 0 };

  let range;
  try {
    range = XLSX.utils.decode_range(reference);
  } catch {
    throw new Error(`${sheetName} has an invalid used-cell range.`);
  }
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  const cellCount = rowCount * columnCount;
  if (
    rowCount < 1 ||
    columnCount < 1 ||
    rowCount > MAX_WORKSHEET_ROWS ||
    columnCount > MAX_WORKSHEET_COLUMNS ||
    cellCount > MAX_WORKSHEET_CELLS
  ) {
    throw new Error(`${sheetName} exceeds the supported worksheet dimensions.`);
  }
  return { rowCount, columnCount, cellCount };
}

function collectZipSpreadsheets(bytes) {
  let extracted;
  let selectedCount = 0;
  let selectedTotal = 0;
  let limitError = "";
  try {
    extracted = unzipSync(bytes, {
      filter: (entry) => {
        const name = normalizeEntryName(entry.name);
        if (limitError || !isUsableSpreadsheetEntry(name)) return false;
        selectedCount += 1;
        if (selectedCount > MAX_SPREADSHEET_COUNT) {
          limitError = `The archive contains more than ${MAX_SPREADSHEET_COUNT} Excel files.`;
          return false;
        }
        if (entry.originalSize > MAX_SPREADSHEET_BYTES) {
          limitError = `${name} is larger than the supported 30 MB Excel-file limit.`;
          return false;
        }
        selectedTotal += entry.originalSize;
        if (selectedTotal > MAX_TOTAL_EXTRACTED_BYTES) {
          limitError = "The extracted Excel files exceed the supported 180 MB total limit.";
          return false;
        }
        return true;
      },
    });
  } catch {
    if (limitError) throw new Error(limitError);
    throw new Error("The ZIP archive could not be opened. It may be damaged or password protected.");
  }
  if (limitError) throw new Error(limitError);

  const files = [];
  let totalBytes = 0;
  for (const [rawName, data] of Object.entries(extracted)) {
    const name = normalizeEntryName(rawName);
    if (!isUsableSpreadsheetEntry(name)) continue;
    assertSpreadsheetEntry(name, data.byteLength, totalBytes);
    totalBytes += data.byteLength;
    files.push({ name, data });
    if (files.length > MAX_SPREADSHEET_COUNT) {
      throw new Error(`The archive contains more than ${MAX_SPREADSHEET_COUNT} Excel files.`);
    }
  }
  return files;
}

async function collectRarSpreadsheets(bytes) {
  const archiveFlags = inspectRarArchiveFlags(bytes);
  if (archiveFlags.solid) {
    throw new Error("Solid RAR archives are not supported. Recreate the archive as non-solid RAR or ZIP and upload it again.");
  }
  if (archiveFlags.volume) {
    throw new Error("Multi-volume RAR archives are not supported. Upload one complete non-volume RAR or ZIP archive.");
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("RAR extraction requires a current browser. Update the browser or upload the files as ZIP instead.");
  }

  const { unrarRaw } = await import("unrarit");
  let rar;
  try {
    const opened = await unrarRaw(bytes);
    rar = opened.rar;
    const spreadsheetEntries = opened.entries.filter((entry) =>
      !entry.isDirectory && isUsableSpreadsheetEntry(entry.name),
    );

    if (spreadsheetEntries.length > MAX_SPREADSHEET_COUNT) {
      throw new Error(`The archive contains more than ${MAX_SPREADSHEET_COUNT} Excel files.`);
    }

    const files = [];
    let totalBytes = 0;
    for (const entry of spreadsheetEntries) {
      const name = normalizeEntryName(entry.name);
      if (entry.encrypted) {
        throw new Error(`${name} is password protected. Encrypted RAR files are not supported.`);
      }
      assertSpreadsheetEntry(name, entry.size, totalBytes);
      const data = new Uint8Array(await entry.arrayBuffer());
      assertSpreadsheetEntry(name, data.byteLength, totalBytes);
      if (Number.isFinite(entry.size) && data.byteLength !== entry.size) {
        throw new Error(`${name} did not extract to its expected size.`);
      }
      totalBytes += data.byteLength;
      files.push({ name, data });
    }
    return files;
  } catch (error) {
    if (error instanceof Error && /(?:supported|larger|contains more|password protected|current browser|expected size|safe expanded)/i.test(error.message)) {
      throw error;
    }
    throw new Error("The RAR archive could not be opened. It may be damaged, encrypted, or part of a multi-volume archive.");
  } finally {
    rar?.dispose?.();
  }
}

async function extractSpreadsheetFiles(file) {
  assertUploadSize(file);
  const name = String(file?.name || "Uploaded file");
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isSupportedMaspoSpreadsheet(name)) {
    assertSpreadsheetEntry(name, bytes.byteLength, 0);
    return [{ name, data: bytes }];
  }
  if (isZip(bytes)) return collectZipSpreadsheets(bytes);
  if (isRar(bytes)) return collectRarSpreadsheets(bytes);

  throw new Error("Upload a ZIP or RAR archive containing Excel files, or upload an Excel file directly.");
}

function workbookToSource(entry, budget) {
  const packageInfo = preflightWorkbookPackage(entry);
  budget.packageBytes += packageInfo.expandedBytes;
  if (budget.packageBytes > MAX_ANALYSIS_PACKAGE_BYTES) {
    throw new Error("The uploaded workbooks exceed the cumulative 160 MB expanded-package limit.");
  }
  const workbook = XLSX.read(entry.data, {
    type: "array",
    cellDates: true,
    cellText: true,
    dense: false,
  });
  if (workbook.SheetNames.length > MAX_WORKSHEET_COUNT) {
    throw new Error(`${entry.name} contains more than ${MAX_WORKSHEET_COUNT} worksheets.`);
  }
  budget.worksheets += workbook.SheetNames.length;
  if (budget.worksheets > MAX_ANALYSIS_WORKSHEETS) {
    throw new Error(`The uploaded workbooks exceed the cumulative ${MAX_ANALYSIS_WORKSHEETS}-worksheet limit.`);
  }
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const dimensions = validateMaspoWorksheetBounds(worksheet, sheetName);
    budget.rows += dimensions.rowCount;
    budget.cells += dimensions.cellCount;
    if (budget.rows > MAX_ANALYSIS_ROWS || budget.cells > MAX_ANALYSIS_CELLS) {
      throw new Error("The uploaded workbooks exceed the cumulative worksheet-size limit.");
    }
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const textCharacters = rows.reduce((total, row) =>
      total + (Array.isArray(row) ? row.reduce((rowTotal, cell) => rowTotal + String(cell ?? "").length, 0) : 0),
    0);
    budget.textCharacters += textCharacters;
    if (budget.textCharacters > MAX_ANALYSIS_TEXT_CHARACTERS) {
      throw new Error("The uploaded workbooks exceed the cumulative cell-text limit.");
    }
    return {
      sheetName,
      rows,
    };
  });
  return { fileName: entry.name, sheets };
}

export async function analyzeMaspoArchive(file, trainQuery) {
  if (!file?.arrayBuffer) throw new Error("Choose a MASPO archive or Excel file first.");
  const spreadsheetFiles = await extractSpreadsheetFiles(file);
  if (!spreadsheetFiles.length) {
    throw new Error("No supported Excel files were found in the uploaded archive.");
  }

  const sources = [];
  const warnings = [];
  const budget = {
    packageBytes: 0,
    worksheets: 0,
    rows: 0,
    cells: 0,
    textCharacters: 0,
  };
  for (const entry of spreadsheetFiles) {
    try {
      sources.push(workbookToSource(entry, budget));
    } catch (error) {
      if (
        error instanceof Error &&
        /(?:\bcumulative\b|internal workbook|expands beyond|worksheet dimensions|contains more than \d+ worksheets)/i.test(error.message)
      ) {
        throw error;
      }
      warnings.push(`${entry.name} could not be read as an Excel workbook.`);
    }
  }

  if (!sources.length) {
    throw new Error("None of the Excel files in the archive could be read.");
  }

  const analysis = analyzeMaspoMovementSources(sources, trainQuery);
  return {
    ...analysis,
    archiveName: String(file.name || "Uploaded file"),
    spreadsheetCount: spreadsheetFiles.length,
    parsedWorkbookCount: sources.length,
    warnings,
    summaryText: formatMaspoMovementSummary(analysis),
  };
}
