import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const WORKBOOK_PATH = "xl/workbook.xml";
const WORKBOOK_RELS_PATH = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS_PATH = "xl/sharedStrings.xml";
const STYLES_PATH = "xl/styles.xml";
const CALC_CHAIN_PATH = "xl/calcChain.xml";
const PST_LAST_DATA_ROW = 49;
const PST_LAST_OUTPUT_ROW = 50;
const DEPOT_CONFIGS = {
  east: {
    key: "east",
    code: "DCE",
    label: "East Depot",
    fileLabel: "East",
    sheetNames: ["DC East E-LOG", "DC East E-log"],
  },
  west: {
    key: "west",
    code: "DCW",
    label: "West Depot",
    fileLabel: "West",
    sheetNames: ["DC West E-LOG", "DC West E-log"],
  },
};
const PST_SHEET_NAME = "PST & Train Prep";
const AUTHORITY_SHEET_NAME = "Authority to Proceed Form";
const POINTS_FUNCTIONAL_TEST_SHEET_NAME = "Point Functional Test";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const POINTS_FUNCTIONAL_TEST_SUMMARIES = {
  west: "Point functional test for the automatic area completed, except SA08 and SA06, which were not performed due to being blocked in reverse position.",
  east: [
    "Point Functional Test completed for the automatic area.",
    "",
    "* SA08 remained blocked in the normal direction and was restricted from all testing.",
    "* SA10 could not be unblocked via ATS; therefore, the test was not performed. The block indication remained blinking after the unblock command. SR#10121125, dated 13 June 2026.",
    "",
    "The Point Functional Test Form was updated accordingly.",
  ].join("\n"),
};
const POINTS_FUNCTIONAL_TEST_CONFIGS = {
  east: {
    lastStatusColumn: 22,
    noteColumn: "W",
    noteSeparator: "\n",
    fallbackNote: "SA-08 are blocked in the normal position. SA10 could not be tested as the block indication remained blinking after the unblock command. SR 10121125 - 13 JUNE 2026.",
  },
  west: {
    lastStatusColumn: 44,
    noteColumn: "AS",
    noteSeparator: " - ",
    fallbackNote: "SA06 and SA08 are blocked in the reverse position.",
  },
};

const SHIFT_FIELDS = {
  early: { cell: "B3", label: "Early Shift:" },
  late: { cell: "D3", label: "Late Shift:" },
  night: { cell: "E3", label: "Night Shift:" },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseXml(xmlText, label) {
  const documentNode = new DOMParser().parseFromString(xmlText, "application/xml");
  if (documentNode.getElementsByTagName("parsererror").length) {
    throw new Error(`${label} is not valid Excel XML.`);
  }
  return documentNode;
}

function archiveText(archive, path, label = path) {
  const entry = archive[path];
  if (!entry) throw new Error(`${label} is missing from this workbook.`);
  return strFromU8(entry);
}

function normalizeArchivePath(basePath, targetPath) {
  const cleanTarget = String(targetPath || "").replace(/\\/g, "/");
  if (cleanTarget.startsWith("/")) return cleanTarget.replace(/^\/+/, "");

  const parts = `${basePath}/${cleanTarget}`.split("/");
  const normalized = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  });
  return normalized.join("/");
}

function relationshipIdForSheet(sheetNode) {
  const directId = sheetNode.getAttribute("r:id");
  if (directId) return directId;
  return Array.from(sheetNode.attributes || []).find((attribute) => attribute.localName === "id")?.value || "";
}

function locateWorkbookSheet(archive, sheetNameOrNames) {
  const workbook = parseXml(archiveText(archive, WORKBOOK_PATH, "Excel workbook definition"), "Excel workbook definition");
  const requestedNames = (Array.isArray(sheetNameOrNames) ? sheetNameOrNames : [sheetNameOrNames])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const normalizeSheetName = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedNames = new Set(requestedNames.map(normalizeSheetName));
  const workbookSheets = Array.from(workbook.getElementsByTagNameNS("*", "sheet"));
  const sheetNode = workbookSheets.find((node) =>
    normalizedNames.has(normalizeSheetName(node.getAttribute("name")))
  );
  if (!sheetNode) {
    throw new Error(`The worksheet "${requestedNames[0]}" was not found. Upload the matching official Depot Controller Excel file.`);
  }
  const sheetName = String(sheetNode.getAttribute("name") || requestedNames[0]).trim();

  const relationshipId = relationshipIdForSheet(sheetNode);
  if (!relationshipId) throw new Error(`The worksheet link for "${sheetName}" could not be read.`);

  const relationships = parseXml(
    archiveText(archive, WORKBOOK_RELS_PATH, "Excel workbook relationships"),
    "Excel workbook relationships",
  );
  const relationship = Array.from(relationships.getElementsByTagNameNS("*", "Relationship")).find(
    (node) => node.getAttribute("Id") === relationshipId,
  );
  const target = relationship?.getAttribute("Target") || "";
  if (!target) throw new Error(`The worksheet file for "${sheetName}" could not be located.`);

  const sheetPath = normalizeArchivePath("xl", target);
  const sheetXml = archiveText(archive, sheetPath, sheetName);
  return {
    sheetPath,
    sheetDocument: parseXml(sheetXml, sheetName),
    sheetId: Number(sheetNode.getAttribute("sheetId") || 0),
    sheetIndex: workbookSheets.indexOf(sheetNode),
  };
}

function findCell(sheetDocument, reference) {
  return Array.from(sheetDocument.getElementsByTagNameNS("*", "c")).find(
    (cell) => String(cell.getAttribute("r") || "").toUpperCase() === reference.toUpperCase(),
  );
}

function sharedStringsDocument(archive) {
  if (!archive[SHARED_STRINGS_PATH]) return null;
  return parseXml(strFromU8(archive[SHARED_STRINGS_PATH]), "Excel shared strings");
}

function sharedStringValues(archive, documentNode = sharedStringsDocument(archive)) {
  if (!documentNode) return [];
  return Array.from(documentNode.getElementsByTagNameNS("*", "si")).map((item) =>
    Array.from(item.getElementsByTagNameNS("*", "t")).map((node) => node.textContent || "").join(""),
  );
}

function readCellText(sheetDocument, reference, archive, cachedSharedStrings) {
  const cell = findCell(sheetDocument, reference);
  if (!cell) return "";

  const cellType = cell.getAttribute("t") || "";
  if (cellType === "inlineStr") {
    return Array.from(cell.getElementsByTagNameNS("*", "t")).map((node) => node.textContent || "").join("");
  }

  const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
  const value = valueNode?.textContent || "";
  if (cellType === "s") {
    const strings = cachedSharedStrings || sharedStringValues(archive);
    return strings[Number(value)] || "";
  }
  return value;
}

function writeInlineString(sheetDocument, reference, value) {
  const cell = findCell(sheetDocument, reference);
  if (!cell) throw new Error(`Required Excel cell ${reference} was not found.`);

  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.setAttribute("t", "inlineStr");

  const namespace = sheetDocument.documentElement.namespaceURI;
  const inlineString = sheetDocument.createElementNS(namespace, "is");
  const textNode = sheetDocument.createElementNS(namespace, "t");
  textNode.setAttributeNS(XML_NAMESPACE, "xml:space", "preserve");
  textNode.textContent = value;
  inlineString.appendChild(textNode);
  cell.appendChild(inlineString);
}

function writeNumber(sheetDocument, reference, value) {
  const cell = findCell(sheetDocument, reference);
  if (!cell) throw new Error(`Required Excel cell ${reference} was not found.`);

  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.removeAttribute("t");
  const valueNode = sheetDocument.createElementNS(sheetDocument.documentElement.namespaceURI, "v");
  valueNode.textContent = String(value);
  cell.appendChild(valueNode);
}

function columnNumber(reference) {
  const letters = String(reference || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function columnLetters(column) {
  let value = Number(column) || 0;
  let letters = "";
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return letters;
}

function cellHasValue(cell) {
  if (!cell) return false;
  const valueText = Array.from(cell.getElementsByTagNameNS("*", "v"))
    .map((node) => node.textContent || "")
    .join("")
    .trim();
  const inlineText = Array.from(cell.getElementsByTagNameNS("*", "t"))
    .map((node) => node.textContent || "")
    .join("")
    .trim();
  return Boolean(valueText || inlineText);
}

function copyCellValue(sourceCell, targetCell) {
  while (targetCell.firstChild) targetCell.removeChild(targetCell.firstChild);
  targetCell.removeAttribute("t");
  if (!sourceCell || !cellHasValue(sourceCell)) return;

  const cellType = sourceCell.getAttribute("t");
  if (cellType) targetCell.setAttribute("t", cellType);
  Array.from(sourceCell.childNodes).forEach((node) => targetCell.appendChild(node.cloneNode(true)));
}

function copyCellStyle(sourceCell, targetCell) {
  const styleId = sourceCell?.getAttribute("s");
  if (styleId === null || styleId === undefined) targetCell.removeAttribute("s");
  else targetCell.setAttribute("s", styleId);
}

function richTextContainerForCell(cell, stringsDocument) {
  if (!cell) return null;
  const cellType = cell.getAttribute("t") || "";
  if (cellType === "inlineStr") return cell.getElementsByTagNameNS("*", "is")[0] || null;
  if (cellType !== "s" || !stringsDocument) return null;

  const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
  const stringIndex = Number(valueNode?.textContent);
  return Array.from(stringsDocument.getElementsByTagNameNS("*", "si"))[stringIndex] || null;
}

function cellHasRichText(cell, stringsDocument) {
  return Boolean(richTextContainerForCell(cell, stringsDocument)?.getElementsByTagNameNS("*", "r").length);
}

function writePointFunctionalRichNote(sheetDocument, sourceCell, targetCell, stringsDocument, fallbackText, controllerName) {
  const sourceContainer = richTextContainerForCell(sourceCell, stringsDocument);
  if (!sourceContainer || !sourceContainer.getElementsByTagNameNS("*", "r").length) {
    writeInlineString(sheetDocument, targetCell.getAttribute("r"), `${fallbackText}Completed by DC ${controllerName.trim()}`);
    return;
  }

  while (targetCell.firstChild) targetCell.removeChild(targetCell.firstChild);
  targetCell.setAttribute("t", "inlineStr");

  const namespace = sheetDocument.documentElement.namespaceURI;
  const inlineString = sheetDocument.createElementNS(namespace, "is");
  Array.from(sourceContainer.childNodes).forEach((node) => {
    inlineString.appendChild(sheetDocument.importNode(node, true));
  });

  const completedByNode = Array.from(inlineString.getElementsByTagNameNS("*", "t")).find((node) =>
    /Completed by DC\b/i.test(node.textContent || ""),
  );
  if (!completedByNode) {
    writeInlineString(sheetDocument, targetCell.getAttribute("r"), `${fallbackText}Completed by DC ${controllerName.trim()}`);
    return;
  }

  completedByNode.textContent = String(completedByNode.textContent || "").replace(
    /Completed by DC\b[\s\S]*$/i,
    `Completed by DC ${controllerName.trim()}`,
  );
  targetCell.appendChild(inlineString);
}

function cellsWithinRange(sheetDocument, startRow, endRow, startColumn, endColumn) {
  const cells = [];
  Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).forEach((row) => {
    const rowNumber = Number(row.getAttribute("r") || 0);
    if (rowNumber < startRow || rowNumber > endRow) return;

    Array.from(row.getElementsByTagNameNS("*", "c")).forEach((cell) => {
      const cellColumn = columnNumber(cell.getAttribute("r") || "");
      if (cellColumn >= startColumn && cellColumn <= endColumn) cells.push(cell);
    });
  });
  return cells;
}

function clearCells(cells) {
  cells.forEach((cell) => {
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.removeAttribute("t");
  });
}

function copyRowCellStyles(sheetDocument, sourceRowNumber, targetRowNumbers, startColumn, endColumn) {
  const sourceStyles = new Map(
    cellsWithinRange(sheetDocument, sourceRowNumber, sourceRowNumber, startColumn, endColumn).map((cell) => [
      columnNumber(cell.getAttribute("r") || ""),
      cell.getAttribute("s"),
    ]),
  );

  targetRowNumbers.forEach((rowNumber) => {
    cellsWithinRange(sheetDocument, rowNumber, rowNumber, startColumn, endColumn).forEach((cell) => {
      const sourceStyle = sourceStyles.get(columnNumber(cell.getAttribute("r") || ""));
      if (sourceStyle !== null && sourceStyle !== undefined) cell.setAttribute("s", sourceStyle);
    });
  });
}

function clearDailyDepotLogRows(sheetDocument) {
  clearCells(cellsWithinRange(sheetDocument, 9, 39, 1, 9));
}

function normalizeDailyDepotLogRows(sheetDocument) {
  Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).forEach((row) => {
    const rowNumber = Number(row.getAttribute("r") || 0);
    if (rowNumber < 9 || rowNumber > 39) return;
    row.setAttribute("ht", "39");
    row.setAttribute("customHeight", "1");
  });
}

function removeDailyDepotLogFills(sheetDocument, stylesDocument) {
  const cellXfs = stylesDocument.getElementsByTagNameNS("*", "cellXfs")[0];
  if (!cellXfs) throw new Error("Excel cell styles could not be read.");

  const styleElements = Array.from(cellXfs.childNodes).filter(
    (node) => node.nodeType === 1 && node.localName === "xf",
  );
  const noFillStyleByOriginal = new Map();

  cellsWithinRange(sheetDocument, 9, 39, 1, 9).forEach((cell) => {
    const originalStyleId = Number(cell.getAttribute("s") || 0);
    const originalStyle = styleElements[originalStyleId];
    const fillId = Number(originalStyle?.getAttribute("fillId") || 0);
    if (!originalStyle || fillId === 0) return;

    if (!noFillStyleByOriginal.has(originalStyleId)) {
      const noFillStyle = originalStyle.cloneNode(true);
      noFillStyle.setAttribute("fillId", "0");
      noFillStyle.removeAttribute("applyFill");
      const replacementStyleId = styleElements.length + noFillStyleByOriginal.size;
      cellXfs.appendChild(noFillStyle);
      noFillStyleByOriginal.set(originalStyleId, replacementStyleId);
    }
    cell.setAttribute("s", String(noFillStyleByOriginal.get(originalStyleId)));
  });

  cellXfs.setAttribute(
    "count",
    String(Array.from(cellXfs.childNodes).filter((node) => node.nodeType === 1 && node.localName === "xf").length),
  );
}

function forceBlackFontForCells(sheetDocument, stylesDocument, references) {
  const fonts = stylesDocument.getElementsByTagNameNS("*", "fonts")[0];
  const cellXfs = stylesDocument.getElementsByTagNameNS("*", "cellXfs")[0];
  if (!fonts || !cellXfs) throw new Error("Excel font styles could not be read.");

  const fontElements = Array.from(fonts.childNodes).filter(
    (node) => node.nodeType === 1 && node.localName === "font",
  );
  const styleElements = Array.from(cellXfs.childNodes).filter(
    (node) => node.nodeType === 1 && node.localName === "xf",
  );
  const blackStyleByOriginal = new Map();

  references.forEach((reference) => {
    const cell = findCell(sheetDocument, reference);
    if (!cell) throw new Error(`Required Excel cell ${reference} was not found.`);

    const originalStyleId = Number(cell.getAttribute("s") || 0);
    if (!blackStyleByOriginal.has(originalStyleId)) {
      const originalStyle = styleElements[originalStyleId] || styleElements[0];
      const originalFontId = Number(originalStyle?.getAttribute("fontId") || 0);
      const originalFont = fontElements[originalFontId] || fontElements[0];
      if (!originalStyle || !originalFont) throw new Error("Excel font styles could not be normalized.");

      const blackFont = originalFont.cloneNode(true);
      let colorNode = Array.from(blackFont.childNodes).find(
        (node) => node.nodeType === 1 && node.localName === "color",
      );
      if (!colorNode) {
        colorNode = stylesDocument.createElementNS(stylesDocument.documentElement.namespaceURI, "color");
        const insertBeforeNode = Array.from(blackFont.childNodes).find(
          (node) => node.nodeType === 1 && ["sz", "u", "vertAlign", "scheme"].includes(node.localName),
        );
        blackFont.insertBefore(colorNode, insertBeforeNode || null);
      }
      Array.from(colorNode.attributes).forEach((attribute) => colorNode.removeAttributeNode(attribute));
      colorNode.setAttribute("rgb", "FF000000");

      const blackFontId = fontElements.length + blackStyleByOriginal.size;
      fonts.appendChild(blackFont);

      const blackStyle = originalStyle.cloneNode(true);
      blackStyle.setAttribute("fontId", String(blackFontId));
      blackStyle.setAttribute("applyFont", "1");
      const blackStyleId = styleElements.length + blackStyleByOriginal.size;
      cellXfs.appendChild(blackStyle);
      blackStyleByOriginal.set(originalStyleId, blackStyleId);
    }

    cell.setAttribute("s", String(blackStyleByOriginal.get(originalStyleId)));
  });

  fonts.setAttribute(
    "count",
    String(Array.from(fonts.childNodes).filter((node) => node.nodeType === 1 && node.localName === "font").length),
  );
  cellXfs.setAttribute(
    "count",
    String(Array.from(cellXfs.childNodes).filter((node) => node.nodeType === 1 && node.localName === "xf").length),
  );
}

function clearPstTrainPrepRows(sheetDocument) {
  clearCells(cellsWithinRange(sheetDocument, 3, PST_LAST_DATA_ROW, 1, 11));
}

function pstSummaryRow(sheetDocument) {
  const summaryCell = Array.from(sheetDocument.getElementsByTagNameNS("*", "c")).find((cell) => {
    const formula = cell.getElementsByTagNameNS("*", "f")[0]?.textContent || "";
    return /Total PST passed|COUNTIF\(F3:F49/i.test(formula);
  });
  return Number(String(summaryCell?.getAttribute("r") || "").match(/\d+$/)?.[0] || 0);
}

function replaceReferenceRow(reference, sourceRow, targetRow) {
  return String(reference || "").replace(/(\$?)(\d+)/g, (match, absoluteMarker, rowText) =>
    Number(rowText) === sourceRow ? `${absoluteMarker}${targetRow}` : match
  );
}

function lastRowInReference(reference) {
  const rowNumbers = Array.from(String(reference || "").matchAll(/\$?(\d+)/g), (match) => Number(match[1]));
  return rowNumbers.at(-1) || 0;
}

function setReferenceLastRow(reference, lastRow) {
  return String(reference || "").replace(/(\$?)(\d+)$/, `$1${lastRow}`);
}

function movePstSummaryToLastRow(sheetDocument, sourceRow) {
  const sheetData = sheetDocument.getElementsByTagNameNS("*", "sheetData")[0];
  const sourceRowNode = Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).find(
    (row) => Number(row.getAttribute("r") || 0) === sourceRow,
  );
  if (!sheetData || !sourceRowNode) throw new Error("The PST & Train Prep summary formula row could not be read.");

  if (sourceRow !== PST_LAST_OUTPUT_ROW) {
    const summaryClone = sourceRowNode.cloneNode(true);
    summaryClone.setAttribute("r", String(PST_LAST_OUTPUT_ROW));
    Array.from(summaryClone.getElementsByTagNameNS("*", "c")).forEach((cell) => {
      cell.setAttribute("r", replaceReferenceRow(cell.getAttribute("r"), sourceRow, PST_LAST_OUTPUT_ROW));
      Array.from(cell.getElementsByTagNameNS("*", "f")).forEach((formula) => {
        if (formula.hasAttribute("ref")) {
          formula.setAttribute("ref", replaceReferenceRow(formula.getAttribute("ref"), sourceRow, PST_LAST_OUTPUT_ROW));
        }
      });
    });

    const existingLastRow = Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).find(
      (row) => Number(row.getAttribute("r") || 0) === PST_LAST_OUTPUT_ROW,
    );
    existingLastRow?.parentNode?.removeChild(existingLastRow);
    const nextRow = Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).find(
      (row) => Number(row.getAttribute("r") || 0) > PST_LAST_OUTPUT_ROW,
    );
    sheetData.insertBefore(summaryClone, nextRow || null);
  }

  Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).forEach((row) => {
    if (Number(row.getAttribute("r") || 0) > PST_LAST_OUTPUT_ROW) row.parentNode?.removeChild(row);
  });

  const mergeCells = sheetDocument.getElementsByTagNameNS("*", "mergeCells")[0];
  if (mergeCells) {
    Array.from(mergeCells.getElementsByTagNameNS("*", "mergeCell")).forEach((mergeCell) => {
      const reference = mergeCell.getAttribute("ref") || "";
      if (lastRowInReference(reference) === sourceRow) {
        mergeCell.setAttribute("ref", replaceReferenceRow(reference, sourceRow, PST_LAST_OUTPUT_ROW));
      } else if (lastRowInReference(reference) > PST_LAST_OUTPUT_ROW) {
        mergeCell.parentNode?.removeChild(mergeCell);
      }
    });
    mergeCells.setAttribute("count", String(mergeCells.getElementsByTagNameNS("*", "mergeCell").length));
  }

  const dimension = sheetDocument.getElementsByTagNameNS("*", "dimension")[0];
  if (dimension) dimension.setAttribute("ref", setReferenceLastRow(dimension.getAttribute("ref"), PST_LAST_OUTPUT_ROW));
}

function worksheetRelationshipsPath(sheetPath) {
  const lastSlash = sheetPath.lastIndexOf("/");
  const directory = sheetPath.slice(0, lastSlash);
  const fileName = sheetPath.slice(lastSlash + 1);
  return `${directory}/_rels/${fileName}.rels`;
}

function normalizePstTableRange(archive, sheetPath) {
  const relationshipsPath = worksheetRelationshipsPath(sheetPath);
  if (!archive[relationshipsPath]) return;
  const relationships = parseXml(strFromU8(archive[relationshipsPath]), "PST worksheet relationships");
  const tableRelationship = Array.from(relationships.getElementsByTagNameNS("*", "Relationship")).find((node) =>
    /\/table$/i.test(node.getAttribute("Type") || "")
  );
  if (!tableRelationship) return;

  const sheetDirectory = sheetPath.slice(0, sheetPath.lastIndexOf("/"));
  const tablePath = normalizeArchivePath(sheetDirectory, tableRelationship.getAttribute("Target"));
  if (!archive[tablePath]) return;
  const tableDocument = parseXml(strFromU8(archive[tablePath]), "PST Excel table");
  const table = tableDocument.getElementsByTagNameNS("*", "table")[0];
  const autoFilter = tableDocument.getElementsByTagNameNS("*", "autoFilter")[0];
  if (table?.hasAttribute("ref")) table.setAttribute("ref", setReferenceLastRow(table.getAttribute("ref"), PST_LAST_DATA_ROW));
  if (autoFilter?.hasAttribute("ref")) {
    autoFilter.setAttribute("ref", setReferenceLastRow(autoFilter.getAttribute("ref"), PST_LAST_DATA_ROW));
  }
  archive[tablePath] = strToU8(new XMLSerializer().serializeToString(tableDocument));
}

function normalizePstCalcChain(archive, sheetId, sourceRow) {
  if (!archive[CALC_CHAIN_PATH] || !sheetId || sourceRow === PST_LAST_OUTPUT_ROW) return;
  const calcChain = parseXml(strFromU8(archive[CALC_CHAIN_PATH]), "Excel calculation chain");
  let activeSheetId = 0;
  Array.from(calcChain.getElementsByTagNameNS("*", "c")).forEach((cell) => {
    if (cell.hasAttribute("i")) activeSheetId = Number(cell.getAttribute("i") || 0);
    if (activeSheetId !== sheetId) return;
    cell.setAttribute("r", replaceReferenceRow(cell.getAttribute("r"), sourceRow, PST_LAST_OUTPUT_ROW));
  });
  archive[CALC_CHAIN_PATH] = strToU8(new XMLSerializer().serializeToString(calcChain));
}

function normalizePstPrintArea(archive, sheetIndex) {
  if (sheetIndex < 0) return;
  const workbook = parseXml(archiveText(archive, WORKBOOK_PATH, "Excel workbook definition"), "Excel workbook definition");
  Array.from(workbook.getElementsByTagNameNS("*", "definedName")).forEach((definedName) => {
    if (
      definedName.getAttribute("name") === "_xlnm.Print_Area"
      && Number(definedName.getAttribute("localSheetId")) === sheetIndex
    ) {
      definedName.textContent = setReferenceLastRow(definedName.textContent, PST_LAST_OUTPUT_ROW);
    }
  });
  archive[WORKBOOK_PATH] = strToU8(new XMLSerializer().serializeToString(workbook));
}

function normalizePstTrainPrepOutput(sheetDocument, archive, sheetPath, sheetId, sheetIndex) {
  const sourceRow = pstSummaryRow(sheetDocument);
  if (!sourceRow) throw new Error("The PST & Train Prep summary formula row was not found.");
  movePstSummaryToLastRow(sheetDocument, sourceRow);
  normalizePstTableRange(archive, sheetPath);
  normalizePstCalcChain(archive, sheetId, sourceRow);
  normalizePstPrintArea(archive, sheetIndex);
  return { sourceRow, summaryRow: PST_LAST_OUTPUT_ROW };
}

function excelSerialForDate(date) {
  return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
}

function pointFunctionalTestRowForDate(sheetDocument, targetDate) {
  const targetSerial = excelSerialForDate(targetDate);
  const dateCell = cellsWithinRange(sheetDocument, 1, 500, 1, 1).find((cell) => {
    const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
    return Number(valueNode?.textContent) === targetSerial;
  });
  const rowNumber = Number(String(dateCell?.getAttribute("r") || "").match(/\d+$/)?.[0] || 0);
  if (!rowNumber) {
    throw new Error(`The ${POINTS_FUNCTIONAL_TEST_SHEET_NAME} row for ${officialDateLabel(targetDate)} was not found.`);
  }
  return rowNumber;
}

function pointFunctionalStatusRowHasValues(sheetDocument, rowNumber, lastStatusColumn) {
  return cellsWithinRange(sheetDocument, rowNumber, rowNumber, 3, lastStatusColumn).some(cellHasValue);
}

function latestPerformedPointFunctionalRow(sheetDocument, targetRow, lastStatusColumn) {
  if (pointFunctionalStatusRowHasValues(sheetDocument, targetRow, lastStatusColumn)) return targetRow;
  for (let rowNumber = targetRow - 1; rowNumber >= 1; rowNumber -= 1) {
    if (pointFunctionalStatusRowHasValues(sheetDocument, rowNumber, lastStatusColumn)) return rowNumber;
  }
  return 0;
}

function latestFormattedPointFunctionalRow(
  sheetDocument,
  targetRow,
  lastStatusColumn,
  noteColumn,
  stringsDocument,
) {
  for (let rowNumber = targetRow; rowNumber >= 1; rowNumber -= 1) {
    const noteCell = findCell(sheetDocument, `${noteColumn}${rowNumber}`);
    if (
      pointFunctionalStatusRowHasValues(sheetDocument, rowNumber, lastStatusColumn)
      && cellHasRichText(noteCell, stringsDocument)
    ) {
      return rowNumber;
    }
  }
  return 0;
}

function writePointFunctionalTestForDate(
  sheetDocument,
  archive,
  sharedStrings,
  stringsDocument,
  targetDate,
  depotConfig,
  controllerName,
) {
  const config = POINTS_FUNCTIONAL_TEST_CONFIGS[depotConfig.key];
  if (!config) throw new Error(`Point Functional Test settings are missing for ${depotConfig.label}.`);

  const targetRow = pointFunctionalTestRowForDate(sheetDocument, targetDate);
  const sourceRow = latestPerformedPointFunctionalRow(sheetDocument, targetRow, config.lastStatusColumn);
  if (!sourceRow) {
    throw new Error(`No previous performed row was found in the ${POINTS_FUNCTIONAL_TEST_SHEET_NAME} sheet.`);
  }

  const formattingRow = latestFormattedPointFunctionalRow(
    sheetDocument,
    targetRow,
    config.lastStatusColumn,
    config.noteColumn,
    stringsDocument,
  ) || sourceRow;

  for (let column = 3; column <= config.lastStatusColumn; column += 1) {
    const columnName = columnLetters(column);
    const sourceCell = findCell(sheetDocument, `${columnName}${sourceRow}`);
    const formattingCell = findCell(sheetDocument, `${columnName}${formattingRow}`);
    const targetCell = findCell(sheetDocument, `${columnName}${targetRow}`);
    if (!targetCell) throw new Error(`Required Excel cell ${columnName}${targetRow} was not found.`);
    if (sourceRow !== targetRow) copyCellValue(sourceCell, targetCell);
    copyCellStyle(formattingCell || sourceCell, targetCell);
  }

  const noteSourceCell = findCell(sheetDocument, `${config.noteColumn}${formattingRow}`);
  const targetNoteCell = findCell(sheetDocument, `${config.noteColumn}${targetRow}`);
  if (!targetNoteCell) throw new Error(`Required Excel cell ${config.noteColumn}${targetRow} was not found.`);
  copyCellStyle(noteSourceCell, targetNoteCell);

  const sourceNote = readCellText(sheetDocument, `${config.noteColumn}${formattingRow}`, archive, sharedStrings);
  const noteWithoutCompletedBy = String(sourceNote || config.fallbackNote)
    .replace(/\s*(?:[-–—]\s*)?Completed by DC\b[\s\S]*$/i, "")
    .trim() || config.fallbackNote;
  writePointFunctionalRichNote(
    sheetDocument,
    noteSourceCell,
    targetNoteCell,
    stringsDocument,
    `${noteWithoutCompletedBy}${config.noteSeparator}`,
    controllerName,
  );

  return { targetRow, sourceRow, formattingRow };
}

function clearAuthorityToProceedForm(sheetDocument, targetDate) {
  writeNumber(sheetDocument, "C6", excelSerialForDate(targetDate));
  clearCells(cellsWithinRange(sheetDocument, 10, 44, 2, 15));
}

function timeTextToDayFraction(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return ((Number(match[1]) * 60) + Number(match[2])) / 1440;
}

function setWorksheetRowHeight(sheetDocument, rowNumber, height) {
  const row = Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).find(
    (rowNode) => Number(rowNode.getAttribute("r") || 0) === rowNumber,
  );
  if (!row) throw new Error(`Required Excel row ${rowNumber} was not found.`);
  row.setAttribute("ht", String(height));
  row.setAttribute("customHeight", "1");
}

function writeFirstDepotRemovalLog(sheetDocument, targetDate, removalLog, depotConfig) {
  const entries = Array.isArray(removalLog?.entries) ? removalLog.entries : [];
  const summary = String(removalLog?.text || "").replace(/\r\n/g, "\n").trim();
  const hasRemovalLog = entries.length > 0 && Boolean(summary);

  if (hasRemovalLog) {
    const firstTime = String(entries[0]?.time || "").trim();
    const timeFraction = timeTextToDayFraction(firstTime);
    clearCells(cellsWithinRange(sheetDocument, 9, 9, 1, 9));

    writeInlineString(sheetDocument, "A9", `${depotConfig.code}-${dateStamp(targetDate)}-01`);
    if (timeFraction === null) writeInlineString(sheetDocument, "B9", firstTime);
    else writeNumber(sheetDocument, "B9", timeFraction);
    writeInlineString(sheetDocument, "C9", depotConfig.label);
    writeInlineString(sheetDocument, "D9", "Removal");
    writeInlineString(sheetDocument, "E9", summary);

    setWorksheetRowHeight(sheetDocument, 9, 280);
  }

  const reservedCategories = [
    "Train Preparation",
    "Points Functional Test",
    "Internal Train Cleaning",
    "Passenger Service Test",
  ];
  clearCells(cellsWithinRange(sheetDocument, 10, 13, 1, 9));
  reservedCategories.forEach((category, index) => {
    const rowNumber = 10 + index;
    const referenceNumber = String(index + 2).padStart(2, "0");
    writeInlineString(sheetDocument, `A${rowNumber}`, `${depotConfig.code}-${dateStamp(targetDate)}-${referenceNumber}`);
    writeInlineString(sheetDocument, `C${rowNumber}`, depotConfig.label);
    writeInlineString(sheetDocument, `D${rowNumber}`, category);
  });

  writeInlineString(sheetDocument, "E11", POINTS_FUNCTIONAL_TEST_SUMMARIES[depotConfig.key]);
  setWorksheetRowHeight(sheetDocument, 11, depotConfig.key === "east" ? 180 : 75);

  return hasRemovalLog;
}

function addLocalDays(date, dayCount) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + dayCount);
  return result;
}

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function dateStamp(date) {
  return `${String(date.getDate()).padStart(2, "0")}${String(date.getMonth() + 1).padStart(2, "0")}${date.getFullYear()}`;
}

function officialDateLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function compactDateLabel(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function timetableForDate(date) {
  if (date.getDay() === 5) return "L3FULLFRI1000-0000H";
  if (date.getDay() === 6) return "L3FULLSAT0530-0000H";
  return "L3FULLSUNTHU05300-0000H";
}

function detectDepotFromFileName(fileName) {
  const normalized = String(fileName || "").trim();
  const code = normalized.match(/(?:^|[^A-Z0-9])(DCE|DCW)-\d{8}(?:[^0-9]|$)/i)?.[1]?.toUpperCase();
  if (code === "DCE") return DEPOT_CONFIGS.east;
  if (code === "DCW") return DEPOT_CONFIGS.west;

  const depotLabel = normalized.match(/Depot Controller\s+(East|West)\s+E-?log/i)?.[1]?.toLowerCase();
  return depotLabel ? DEPOT_CONFIGS[depotLabel] || null : null;
}

function parseWorkbookDate(dayAndDateText, fileName) {
  const normalized = String(dayAndDateText || "").replace(/\s+/g, " ").trim();
  const monthPattern = MONTHS.join("|");
  const match = normalized.match(new RegExp(`(${monthPattern})\\s+(\\d{1,2}),\\s+(\\d{4})`, "i"));
  if (match) {
    const monthIndex = MONTHS.findIndex((month) => month.toLowerCase() === match[1].toLowerCase());
    return new Date(Number(match[3]), monthIndex, Number(match[2]), 12, 0, 0, 0);
  }

  const fileDate = String(fileName || "").match(/DC[EW]-(\d{2})(\d{2})(\d{4})/i);
  if (fileDate) {
    return new Date(Number(fileDate[3]), Number(fileDate[2]) - 1, Number(fileDate[1]), 12, 0, 0, 0);
  }
  return null;
}

function existingShiftName(cellText) {
  return String(cellText || "").replace(/^.*?Shift:\s*/is, "").trim();
}

function outputFileName(targetDate, depotConfig) {
  return `OPE-FO-023-01 A03 Line 3 Depot Controller ${depotConfig.fileLabel} E-log_${depotConfig.code}-${dateStamp(targetDate)}.xlsx`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function generateOfficialDepotWorkbook({ sourceFile, controllerName, targetDay, removalLogs }) {
  const depotConfig = detectDepotFromFileName(sourceFile.name);
  if (!depotConfig) {
    throw new Error("The filename must contain DCE-DDMMYYYY for East Depot or DCW-DDMMYYYY for West Depot.");
  }

  const archive = unzipSync(new Uint8Array(await sourceFile.arrayBuffer()));
  const { sheetPath, sheetDocument } = locateWorkbookSheet(archive, depotConfig.sheetNames);
  const {
    sheetPath: pstSheetPath,
    sheetDocument: pstSheetDocument,
    sheetId: pstSheetId,
    sheetIndex: pstSheetIndex,
  } = locateWorkbookSheet(archive, PST_SHEET_NAME);
  const { sheetPath: authoritySheetPath, sheetDocument: authoritySheetDocument } = locateWorkbookSheet(
    archive,
    AUTHORITY_SHEET_NAME,
  );
  const { sheetPath: pointsSheetPath, sheetDocument: pointsSheetDocument } = locateWorkbookSheet(
    archive,
    POINTS_FUNCTIONAL_TEST_SHEET_NAME,
  );
  const stylesDocument = parseXml(archiveText(archive, STYLES_PATH, "Excel styles"), "Excel styles");
  const stringsDocument = sharedStringsDocument(archive);
  const strings = sharedStringValues(archive, stringsDocument);
  const today = addLocalDays(new Date(), 0);
  const targetDate = addLocalDays(today, targetDay === "tomorrow" ? 1 : 0);
  const workbookDate = parseWorkbookDate(readCellText(sheetDocument, "G3", archive, strings), sourceFile.name);

  if (!workbookDate) {
    throw new Error("The source date could not be read from the East Depot workbook.");
  }

  const isNewOutputDate = dateKey(workbookDate) !== dateKey(targetDate);
  Object.entries(SHIFT_FIELDS).forEach(([shiftKey, field]) => {
    const existingName = existingShiftName(readCellText(sheetDocument, field.cell, archive, strings));
    const nextName = shiftKey === "night" ? controllerName.trim() : isNewOutputDate ? "" : existingName;
    writeInlineString(sheetDocument, field.cell, `${field.label}\n${nextName}`);
  });

  writeInlineString(sheetDocument, "G3", officialDateLabel(targetDate));
  writeInlineString(sheetDocument, "I3", timetableForDate(targetDate));
  if (isNewOutputDate) clearDailyDepotLogRows(sheetDocument);
  normalizeDailyDepotLogRows(sheetDocument);
  removeDailyDepotLogFills(sheetDocument, stylesDocument);
  copyRowCellStyles(sheetDocument, 10, [11, 12, 13], 1, 9);
  const addedDepotRemovalLog = writeFirstDepotRemovalLog(
    sheetDocument,
    targetDate,
    removalLogs?.[depotConfig.key] || null,
    depotConfig,
  );
  forceBlackFontForCells(sheetDocument, stylesDocument, ["D9", "D10", "D11", "D12", "D13"]);
  const pstTrainPrep = normalizePstTrainPrepOutput(
    pstSheetDocument,
    archive,
    pstSheetPath,
    pstSheetId,
    pstSheetIndex,
  );
  clearPstTrainPrepRows(pstSheetDocument);
  clearAuthorityToProceedForm(authoritySheetDocument, targetDate);
  const pointFunctionalTest = writePointFunctionalTestForDate(
    pointsSheetDocument,
    archive,
    strings,
    stringsDocument,
    targetDate,
    depotConfig,
    controllerName,
  );

  archive[sheetPath] = strToU8(new XMLSerializer().serializeToString(sheetDocument));
  archive[pstSheetPath] = strToU8(new XMLSerializer().serializeToString(pstSheetDocument));
  archive[authoritySheetPath] = strToU8(new XMLSerializer().serializeToString(authoritySheetDocument));
  archive[pointsSheetPath] = strToU8(new XMLSerializer().serializeToString(pointsSheetDocument));
  archive[STYLES_PATH] = strToU8(new XMLSerializer().serializeToString(stylesDocument));
  const outputBytes = zipSync(archive, { level: 6 });
  return {
    blob: new Blob([outputBytes], { type: XLSX_MIME }),
    fileName: outputFileName(targetDate, depotConfig),
    targetDate,
    depot: depotConfig,
    timetable: timetableForDate(targetDate),
    clearedDailyRows: isNewOutputDate,
    clearedPstRows: true,
    normalizedPstRows: true,
    pstTrainPrep,
    normalizedDailyRows: true,
    clearedAuthorityRows: true,
    updatedPointFunctionalTest: true,
    pointFunctionalTest,
    addedDepotRemovalLog,
  };
}

export default function OfficialDepotExcelGenerator({ eastRemovalLog = null, westRemovalLog = null }) {
  const fileInputRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceDepot, setSourceDepot] = useState(null);
  const [controllerName, setControllerName] = useState("");
  const [targetDay, setTargetDay] = useState("tomorrow");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generatedFile, setGeneratedFile] = useState(null);

  const targetDate = useMemo(
    () => addLocalDays(new Date(), targetDay === "tomorrow" ? 1 : 0),
    [targetDay],
  );

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setGeneratedFile(null);
    setError("");
    setSourceDepot(null);
    if (file && !/\.xlsx$/i.test(file.name)) {
      setSourceFile(null);
      setError("Upload a Depot Controller source Excel file in .xlsx format.");
      event.target.value = "";
      return;
    }
    const detectedDepot = file ? detectDepotFromFileName(file.name) : null;
    if (file && !detectedDepot) {
      setSourceFile(null);
      setError("Filename not recognized. Use DCE-DDMMYYYY for East Depot or DCW-DDMMYYYY for West Depot.");
      event.target.value = "";
      return;
    }
    setSourceFile(file);
    setSourceDepot(detectedDepot);
  };

  const handleGenerate = async () => {
    setError("");
    setGeneratedFile(null);
    if (!sourceFile) {
      setError("Upload an East or West Depot Controller source Excel file first.");
      return;
    }
    if (!controllerName.trim()) {
      setError("Enter the controller name.");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateOfficialDepotWorkbook({
        sourceFile,
        controllerName,
        targetDay,
        removalLogs: { east: eastRemovalLog, west: westRemovalLog },
      });
      triggerDownload(result.blob, result.fileName);
      setGeneratedFile(result);
    } catch (generationError) {
      console.error("Official Depot Excel generation failed:", generationError);
      setError(generationError?.message || "The official Depot Controller Excel file could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="official-depot-excel-generator w-full rounded-xl border px-3 py-3">
      <style>{`
        .official-depot-excel-generator {
          --official-bg-start: #062b32;
          --official-bg-end: #0a1f35;
          --official-border: rgba(45, 212, 191, 0.62);
          --official-panel: rgba(4, 26, 39, 0.76);
          --official-input: #071b2c;
          --official-text: #ecfeff;
          --official-muted: #c2e8ec;
          --official-accent: #2dd4bf;
          --official-soft: rgba(45, 212, 191, 0.12);
          --official-warning-bg: #713f12;
          --official-warning-border: #fbbf24;
          --official-warning-text: #ffffff;
          --official-warning-icon: #fde68a;
          background: linear-gradient(135deg, var(--official-bg-start), var(--official-bg-end));
          border-color: var(--official-border);
          color: var(--official-text);
          box-shadow: 0 8px 22px rgba(8, 145, 178, 0.16), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        html[data-app-theme="light"] .official-depot-excel-generator {
          --official-bg-start: #f0fdfa;
          --official-bg-end: #ecfeff;
          --official-border: #14b8a6;
          --official-panel: rgba(255, 255, 255, 0.86);
          --official-input: #ffffff;
          --official-text: #0f2733;
          --official-muted: #425f6b;
          --official-accent: #0f766e;
          --official-soft: rgba(13, 148, 136, 0.12);
          --official-warning-bg: #fffbeb;
          --official-warning-border: #d97706;
          --official-warning-text: #78350f;
          --official-warning-icon: #b45309;
          box-shadow: 0 8px 20px rgba(13, 148, 136, 0.12), inset 0 1px 0 rgba(255,255,255,0.82);
        }
        .official-depot-excel-generator :is(h1, h2, h3, p, label, span, button, input) {
          color: var(--official-text) !important;
          -webkit-text-fill-color: var(--official-text) !important;
        }
        .official-depot-excel-generator .official-panel {
          background: var(--official-panel);
          border-color: color-mix(in srgb, var(--official-border) 48%, transparent);
        }
        .official-depot-excel-generator .official-label {
          color: var(--official-muted) !important;
          -webkit-text-fill-color: var(--official-muted) !important;
          line-height: 1.45;
        }
        .official-depot-excel-generator .official-input {
          background: var(--official-input);
          border-color: color-mix(in srgb, var(--official-border) 72%, transparent);
          color: var(--official-text);
        }
        .official-depot-excel-generator .official-warning {
          background: var(--official-warning-bg);
          border-color: var(--official-warning-border);
          color: var(--official-warning-text);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10);
        }
        .official-depot-excel-generator .official-warning :is(p, span) {
          color: var(--official-warning-text) !important;
          -webkit-text-fill-color: var(--official-warning-text) !important;
        }
        .official-depot-excel-generator .official-warning-icon { color: var(--official-warning-icon); }
        .official-depot-excel-generator .official-generate-button {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
        html[data-app-theme="light"] .official-depot-excel-generator svg.text-teal-300 {
          color: var(--official-accent) !important;
        }
        @keyframes official-upload-pulse {
          0%, 100% {
            transform: translateY(0) scale(1);
            box-shadow: 0 0 0 rgba(45, 212, 191, 0);
          }
          50% {
            transform: translateY(-1px) scale(1.003);
            box-shadow: 0 0 18px var(--official-soft);
          }
        }
        .official-depot-excel-generator .official-upload-panel {
          animation: official-upload-pulse 2.6s ease-in-out infinite;
          transform-origin: center;
          will-change: transform, box-shadow;
        }
        .official-depot-excel-generator .official-upload-panel:hover,
        .official-depot-excel-generator .official-upload-panel:focus-within {
          animation-play-state: paused;
          border-color: var(--official-accent);
          box-shadow: 0 0 18px var(--official-soft);
        }
        @media (prefers-reduced-motion: reduce) {
          .official-depot-excel-generator .official-upload-panel {
            animation: none;
            transform: none;
          }
        }
        .official-depot-excel-generator .official-input::placeholder { color: var(--official-muted); opacity: .78; }
        .official-depot-excel-generator .official-input:focus { border-color: var(--official-accent); box-shadow: 0 0 0 2px var(--official-soft); }
        .official-depot-excel-generator .official-day[data-active="true"] {
          border-color: var(--official-accent);
          background: var(--official-soft);
          color: var(--official-text);
          box-shadow: 0 0 14px var(--official-soft);
        }
        .official-depot-excel-generator .official-day[data-active="false"] { color: var(--official-muted); }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-400/45 bg-teal-400/10 text-teal-300">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[12px] font-black uppercase tracking-[0.16em]">Next Day Excel Generator</h2>
              <span className="rounded-full border border-teal-400/40 bg-teal-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300">
                {sourceDepot?.label || "Auto-detect"}
              </span>
            </div>
            <p className="official-label mt-0.5 text-[11px] font-medium">
              Create today's or tomorrow's official Depot Controller workbook. East or West is detected from the filename.
            </p>
          </div>
        </div>
        <div className="official-panel inline-flex items-center gap-1.5 rounded-lg border border-teal-400/25 px-2 py-1 text-[10px] font-bold text-teal-300">
          <ShieldCheck className="h-3 w-3" />
          Unrelated tabs preserved
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.2fr_1fr]">
        <div className="official-panel official-upload-panel rounded-lg border border-teal-400/20 p-2.5">
          <label className="official-label block text-[10px] font-black uppercase tracking-[0.15em]">Add West / East log to convert New Log</label>
          <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="official-input mt-1.5 flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left transition hover:border-teal-400"
          >
            <Upload className="h-4 w-4 shrink-0 text-teal-300" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
              {sourceFile?.name || "Upload DCE or DCW source .xlsx"}
            </span>
            <span className="text-[10px] font-black uppercase text-teal-300">{sourceFile ? "Replace" : "Choose"}</span>
          </button>
        </div>

        <div className="official-panel rounded-lg border border-teal-400/20 p-2.5">
          <label htmlFor="official-east-controller" className="official-label block text-[10px] font-black uppercase tracking-[0.15em]">Night shift controller name</label>
          <div className="relative mt-1.5">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-teal-300" />
            <input
              id="official-east-controller"
              type="text"
              value={controllerName}
              onChange={(event) => setControllerName(event.target.value)}
              placeholder="Enter name"
              className="official-input h-10 w-full rounded-lg border pl-9 pr-3 text-[11px] font-bold outline-none"
            />
          </div>
        </div>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1.05fr_1fr]">
        <div className="official-panel rounded-lg border border-teal-400/20 p-2.5">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-teal-300" />
            <span className="official-label text-[10px] font-black uppercase tracking-[0.15em]">Output date</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {["today", "tomorrow"].map((option) => {
              const optionDate = addLocalDays(new Date(), option === "tomorrow" ? 1 : 0);
              const active = targetDay === option;
              return (
                <button
                  key={option}
                  type="button"
                  data-active={active}
                  onClick={() => { setTargetDay(option); setGeneratedFile(null); setError(""); }}
                  className="official-day rounded-lg border border-teal-400/20 px-3 py-2 text-left transition hover:border-teal-400/60"
                >
                  <span className="block text-[11px] font-black uppercase">{option}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold">{compactDateLabel(optionDate)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="official-warning flex items-start gap-2 rounded-lg border p-3 text-[12px] font-semibold leading-relaxed">
          <AlertTriangle className="official-warning-icon mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em]">Important notice</p>
            <p className="mt-1">
              Use the previous day’s Excel file to preserve “New Notices and Briefing,” “Outstanding Faults,” “Active Restrictions,” and “Other Handover Notes.”
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {generatedFile && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{generatedFile.fileName} downloaded for {generatedFile.depot.label}. Night shift and form dates are set, Point Functional Test is marked as performed by the entered controller, old Authority and PST entries are cleared, and the matching removal log is placed first.</span>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="official-generate-button inline-flex h-9 items-center gap-2 rounded-lg border border-teal-300/70 bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(20,184,166,0.28)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {isGenerating ? "Generating..." : "Generate Official Excel"}
        </button>
      </div>
    </section>
  );
}

