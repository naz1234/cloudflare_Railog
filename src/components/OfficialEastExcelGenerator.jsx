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
const EAST_LOG_SHEET_NAME = "DC East E-LOG";
const PST_SHEET_NAME = "PST & Train Prep";
const AUTHORITY_SHEET_NAME = "Authority to Proceed Form";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

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

function locateWorkbookSheet(archive, sheetName) {
  const workbook = parseXml(archiveText(archive, WORKBOOK_PATH, "Excel workbook definition"), "Excel workbook definition");
  const sheetNode = Array.from(workbook.getElementsByTagNameNS("*", "sheet")).find(
    (node) => String(node.getAttribute("name") || "").trim() === sheetName,
  );
  if (!sheetNode) {
    throw new Error(`The worksheet "${sheetName}" was not found. Upload the East Depot official Excel file.`);
  }

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
  return { sheetPath, sheetDocument: parseXml(sheetXml, sheetName) };
}

function findCell(sheetDocument, reference) {
  return Array.from(sheetDocument.getElementsByTagNameNS("*", "c")).find(
    (cell) => String(cell.getAttribute("r") || "").toUpperCase() === reference.toUpperCase(),
  );
}

function sharedStringValues(archive) {
  if (!archive[SHARED_STRINGS_PATH]) return [];
  const documentNode = parseXml(strFromU8(archive[SHARED_STRINGS_PATH]), "Excel shared strings");
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

function clearDailyEastLogRows(sheetDocument) {
  clearCells(cellsWithinRange(sheetDocument, 9, 39, 1, 9));
}

function normalizeDailyEastLogRows(sheetDocument) {
  Array.from(sheetDocument.getElementsByTagNameNS("*", "row")).forEach((row) => {
    const rowNumber = Number(row.getAttribute("r") || 0);
    if (rowNumber < 9 || rowNumber > 39) return;
    row.setAttribute("ht", "39");
    row.setAttribute("customHeight", "1");
  });
}

function removeDailyEastLogFills(sheetDocument, stylesDocument) {
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

function clearPstTrainPrepRows(sheetDocument) {
  clearCells(cellsWithinRange(sheetDocument, 3, 49, 1, 11));
}

function excelSerialForDate(date) {
  return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
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

function writeFirstEastRemovalLog(sheetDocument, targetDate, eastRemovalLog) {
  const entries = Array.isArray(eastRemovalLog?.entries) ? eastRemovalLog.entries : [];
  const summary = String(eastRemovalLog?.text || "").replace(/\r\n/g, "\n").trim();
  const hasRemovalLog = entries.length > 0 && Boolean(summary);

  if (hasRemovalLog) {
    const firstTime = String(entries[0]?.time || "").trim();
    const timeFraction = timeTextToDayFraction(firstTime);
    clearCells(cellsWithinRange(sheetDocument, 9, 9, 1, 9));

    writeInlineString(sheetDocument, "A9", `DCE-${dateStamp(targetDate)}-01`);
    if (timeFraction === null) writeInlineString(sheetDocument, "B9", firstTime);
    else writeNumber(sheetDocument, "B9", timeFraction);
    writeInlineString(sheetDocument, "C9", "East Depot");
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
    writeInlineString(sheetDocument, `A${rowNumber}`, `DCE-${dateStamp(targetDate)}-${referenceNumber}`);
    writeInlineString(sheetDocument, `C${rowNumber}`, "East Depot");
    writeInlineString(sheetDocument, `D${rowNumber}`, category);
  });

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

function parseWorkbookDate(dayAndDateText, fileName) {
  const normalized = String(dayAndDateText || "").replace(/\s+/g, " ").trim();
  const monthPattern = MONTHS.join("|");
  const match = normalized.match(new RegExp(`(${monthPattern})\\s+(\\d{1,2}),\\s+(\\d{4})`, "i"));
  if (match) {
    const monthIndex = MONTHS.findIndex((month) => month.toLowerCase() === match[1].toLowerCase());
    return new Date(Number(match[3]), monthIndex, Number(match[2]), 12, 0, 0, 0);
  }

  const fileDate = String(fileName || "").match(/DCE-(\d{2})(\d{2})(\d{4})/i);
  if (fileDate) {
    return new Date(Number(fileDate[3]), Number(fileDate[2]) - 1, Number(fileDate[1]), 12, 0, 0, 0);
  }
  return null;
}

function existingShiftName(cellText) {
  return String(cellText || "").replace(/^.*?Shift:\s*/is, "").trim();
}

function outputFileName(sourceName, targetDate) {
  const stampedName = String(sourceName || "").replace(/DCE-\d{8}(?=\.xlsx$)/i, `DCE-${dateStamp(targetDate)}`);
  if (stampedName !== sourceName && /\.xlsx$/i.test(stampedName)) return stampedName;
  return `OPE-FO-023-01 A03 Line 3 Depot Controller East E-log_DCE-${dateStamp(targetDate)}.xlsx`;
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

async function generateOfficialEastWorkbook({ sourceFile, controllerName, targetDay, eastRemovalLog }) {
  const archive = unzipSync(new Uint8Array(await sourceFile.arrayBuffer()));
  const { sheetPath, sheetDocument } = locateWorkbookSheet(archive, EAST_LOG_SHEET_NAME);
  const { sheetPath: pstSheetPath, sheetDocument: pstSheetDocument } = locateWorkbookSheet(archive, PST_SHEET_NAME);
  const { sheetPath: authoritySheetPath, sheetDocument: authoritySheetDocument } = locateWorkbookSheet(
    archive,
    AUTHORITY_SHEET_NAME,
  );
  const stylesDocument = parseXml(archiveText(archive, STYLES_PATH, "Excel styles"), "Excel styles");
  const strings = sharedStringValues(archive);
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
  if (isNewOutputDate) clearDailyEastLogRows(sheetDocument);
  normalizeDailyEastLogRows(sheetDocument);
  removeDailyEastLogFills(sheetDocument, stylesDocument);
  copyRowCellStyles(sheetDocument, 10, [11, 12, 13], 1, 9);
  const addedEastRemovalLog = writeFirstEastRemovalLog(sheetDocument, targetDate, eastRemovalLog);
  clearPstTrainPrepRows(pstSheetDocument);
  clearAuthorityToProceedForm(authoritySheetDocument, targetDate);

  archive[sheetPath] = strToU8(new XMLSerializer().serializeToString(sheetDocument));
  archive[pstSheetPath] = strToU8(new XMLSerializer().serializeToString(pstSheetDocument));
  archive[authoritySheetPath] = strToU8(new XMLSerializer().serializeToString(authoritySheetDocument));
  archive[STYLES_PATH] = strToU8(new XMLSerializer().serializeToString(stylesDocument));
  const outputBytes = zipSync(archive, { level: 6 });
  return {
    blob: new Blob([outputBytes], { type: XLSX_MIME }),
    fileName: outputFileName(sourceFile.name, targetDate),
    targetDate,
    timetable: timetableForDate(targetDate),
    clearedDailyRows: isNewOutputDate,
    clearedPstRows: true,
    normalizedDailyRows: true,
    clearedAuthorityRows: true,
    addedEastRemovalLog,
  };
}

export default function OfficialEastExcelGenerator({ eastRemovalLog = null }) {
  const fileInputRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
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
    if (file && !/\.xlsx$/i.test(file.name)) {
      setSourceFile(null);
      setError("Upload an East Depot source Excel file in .xlsx format.");
      event.target.value = "";
      return;
    }
    setSourceFile(file);
  };

  const handleGenerate = async () => {
    setError("");
    setGeneratedFile(null);
    if (!sourceFile) {
      setError("Upload an East Depot source Excel file first.");
      return;
    }
    if (!controllerName.trim()) {
      setError("Enter the controller name.");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateOfficialEastWorkbook({ sourceFile, controllerName, targetDay, eastRemovalLog });
      triggerDownload(result.blob, result.fileName);
      setGeneratedFile(result);
    } catch (generationError) {
      console.error("Official East Excel generation failed:", generationError);
      setError(generationError?.message || "The official East Depot Excel file could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="official-east-excel-generator w-full rounded-xl border px-3 py-3">
      <style>{`
        .official-east-excel-generator {
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
        html[data-app-theme="light"] .official-east-excel-generator {
          --official-bg-start: #ecfeff;
          --official-bg-end: #f0fdfa;
          --official-border: #5eead4;
          --official-panel: rgba(255, 255, 255, 0.84);
          --official-input: #ffffff;
          --official-text: #0f172a;
          --official-muted: #36576a;
          --official-accent: #0f766e;
          --official-soft: rgba(13, 148, 136, 0.10);
          --official-warning-bg: #fef3c7;
          --official-warning-border: #b45309;
          --official-warning-text: #451a03;
          --official-warning-icon: #92400e;
          box-shadow: 0 8px 20px rgba(13, 148, 136, 0.10), inset 0 1px 0 #ffffff;
        }
        .official-east-excel-generator .official-panel {
          background: var(--official-panel);
          border-color: color-mix(in srgb, var(--official-border) 48%, transparent);
        }
        .official-east-excel-generator .official-label {
          color: var(--official-muted);
          line-height: 1.45;
        }
        .official-east-excel-generator .official-input {
          background: var(--official-input);
          border-color: color-mix(in srgb, var(--official-border) 72%, transparent);
          color: var(--official-text);
        }
        .official-east-excel-generator .official-warning {
          background: var(--official-warning-bg);
          border-color: var(--official-warning-border);
          color: var(--official-warning-text);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10);
        }
        .official-east-excel-generator .official-warning-icon { color: var(--official-warning-icon); }
        .official-east-excel-generator .official-input::placeholder { color: var(--official-muted); opacity: .92; }
        .official-east-excel-generator .official-input:focus { border-color: var(--official-accent); box-shadow: 0 0 0 2px var(--official-soft); }
        .official-east-excel-generator .official-day[data-active="true"] {
          border-color: var(--official-accent);
          background: var(--official-soft);
          color: var(--official-text);
          box-shadow: 0 0 14px var(--official-soft);
        }
        .official-east-excel-generator .official-day[data-active="false"] { color: var(--official-muted); }
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
                East Depot
              </span>
            </div>
            <p className="official-label mt-0.5 text-[11px] font-medium">
              Create today's or tomorrow's official DCE workbook from any valid East Depot source file.
            </p>
          </div>
        </div>
        <div className="official-panel inline-flex items-center gap-1.5 rounded-lg border border-teal-400/25 px-2 py-1 text-[10px] font-bold text-teal-300">
          <ShieldCheck className="h-3 w-3" />
          Unrelated tabs preserved
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.2fr_1fr]">
        <div className="official-panel rounded-lg border border-teal-400/20 p-2.5">
          <label className="official-label block text-[10px] font-black uppercase tracking-[0.15em]">Source East Excel</label>
          <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="official-input mt-1.5 flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left transition hover:border-teal-400"
          >
            <Upload className="h-4 w-4 shrink-0 text-teal-300" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
              {sourceFile?.name || "Upload East Depot source .xlsx"}
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
          <span>{generatedFile.fileName} downloaded. Night shift and form dates are set, old Authority and PST entries are cleared, and the East removal log is placed first.</span>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-teal-300/70 bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(20,184,166,0.28)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {isGenerating ? "Generating..." : "Generate Official Excel"}
        </button>
      </div>
    </section>
  );
}

