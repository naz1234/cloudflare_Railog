import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Save, CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X, Bookmark, ChevronDown, ExternalLink, Pencil, Plus, Trash2, Copy, ClipboardCheck, Shield, Wind, Undo2 } from "lucide-react";
import MaintenancePanel from "../components/MaintenancePanel";
import TrainWashing from "../components/TrainWashing";
import OdoReading from "../components/OdoReading";
import TIDReferenceTable from "../components/TIDReferenceTable";
import PSTLogOutput from "../components/depot/PSTLogOutput";
import InsertionLogOutput from "../components/depot/InsertionLogOutput";

const DEFAULT_BOOKMARK_LINKS = [
  { title: "Outlook", url: "https://outlook.office.com", sortOrder: 0 },
  { title: "SharePoint", url: "https://www.office.com/launch/sharepoint", sortOrder: 1 },
  { title: "SAP", url: "https://www.sap.com", sortOrder: 2 },
];

const NEW_BOOKMARK_ID = "__new_bookmark__";

function normalizeBookmarkUrl(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(clean)) return clean;
  return `https://${clean}`;
}

function compactBookmarkUrl(value = "") {
  return String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

const BOOKMARK_COLOR_THEMES = [
  {
    name: "Blue",
    card: "border-sky-400/30 bg-sky-500/[0.08] hover:border-sky-300/55 hover:bg-sky-500/[0.13]",
    icon: "border-sky-300/35 bg-sky-500/15 text-sky-200",
    strip: "bg-sky-400",
    chip: "border-sky-300/30 bg-sky-500/10 text-sky-100",
    linkIcon: "text-sky-200",
  },
  {
    name: "Emerald",
    card: "border-emerald-400/30 bg-emerald-500/[0.08] hover:border-emerald-300/55 hover:bg-emerald-500/[0.13]",
    icon: "border-emerald-300/35 bg-emerald-500/15 text-emerald-200",
    strip: "bg-emerald-400",
    chip: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100",
    linkIcon: "text-emerald-200",
  },
  {
    name: "Purple",
    card: "border-violet-400/30 bg-violet-500/[0.08] hover:border-violet-300/55 hover:bg-violet-500/[0.13]",
    icon: "border-violet-300/35 bg-violet-500/15 text-violet-200",
    strip: "bg-violet-400",
    chip: "border-violet-300/30 bg-violet-500/10 text-violet-100",
    linkIcon: "text-violet-200",
  },
  {
    name: "Amber",
    card: "border-amber-400/30 bg-amber-500/[0.08] hover:border-amber-300/55 hover:bg-amber-500/[0.13]",
    icon: "border-amber-300/35 bg-amber-500/15 text-amber-200",
    strip: "bg-amber-400",
    chip: "border-amber-300/30 bg-amber-500/10 text-amber-100",
    linkIcon: "text-amber-200",
  },
  {
    name: "Rose",
    card: "border-rose-400/30 bg-rose-500/[0.08] hover:border-rose-300/55 hover:bg-rose-500/[0.13]",
    icon: "border-rose-300/35 bg-rose-500/15 text-rose-200",
    strip: "bg-rose-400",
    chip: "border-rose-300/30 bg-rose-500/10 text-rose-100",
    linkIcon: "text-rose-200",
  },
  {
    name: "Cyan",
    card: "border-cyan-400/30 bg-cyan-500/[0.08] hover:border-cyan-300/55 hover:bg-cyan-500/[0.13]",
    icon: "border-cyan-300/35 bg-cyan-500/15 text-cyan-200",
    strip: "bg-cyan-400",
    chip: "border-cyan-300/30 bg-cyan-500/10 text-cyan-100",
    linkIcon: "text-cyan-200",
  },
];

const BOOKMARK_KEYWORD_THEMES = [
  { keywords: ["dc west", "west depot", "wd-"], index: 2, label: "WEST" },
  { keywords: ["dc east", "east depot", "ed-"], index: 5, label: "EAST" },
  { keywords: ["cms", "wash"], index: 3, label: "CMS" },
  { keywords: ["handover", "tr handover"], index: 4, label: "TR" },
  { keywords: ["sap"], index: 1, label: "SAP" },
  { keywords: ["outlook", "mail"], index: 0, label: "MAIL" },
  { keywords: ["sharepoint"], index: 2, label: "SP" },
];

function getBookmarkTheme(link = {}, index = 0) {
  const searchable = `${link.title || ""} ${link.url || ""}`.toLowerCase();
  const matched = BOOKMARK_KEYWORD_THEMES.find((item) =>
    item.keywords.some((keyword) => searchable.includes(keyword))
  );

  if (matched) {
    return { ...BOOKMARK_COLOR_THEMES[matched.index], label: matched.label };
  }

  const hash = searchable.split("").reduce((sum, char) => sum + char.charCodeAt(0), index);
  return { ...BOOKMARK_COLOR_THEMES[hash % BOOKMARK_COLOR_THEMES.length], label: "LINK" };
}

// ── Train Washing XLSX → DOCX Export ────────────────────────────────────────
// Added as a second Train Washing window so the existing Train Washing Log stays unchanged, while this JSX carries the latest
// DOCX-only output window: date titles from Next Wash, HVAC header, centred cells,
// wider date/time columns, no wrapping, and no paragraph spacing after lines.
const TrainWashingDocxExport = (() => {
const OUTPUT_HEADERS = [
  "Train Number",
  "Description",
  "HVAC",
  "Next Wash",
  "Train Location",
  "Last Wash",
];

// Wider Next Wash + Last Wash columns to avoid 2-line wrapping in Word.
// Total width = 10,300 dxa, fits A4 portrait with narrow side margins.
const DOCX_COL_WIDTHS = [1600, 1500, 700, 2500, 1500, 2500];
const DOCX_TABLE_WIDTH = DOCX_COL_WIDTHS.reduce((sum, width) => sum + width, 0);

function xmlEscape(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeHeader(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildHeaderMap(headerRow = []) {
  const map = {};
  headerRow.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key) map[key] = index;
  });
  return map;
}

function findColumnIndex(headerMap, candidates = []) {
  for (const candidate of candidates) {
    const key = normalizeHeader(candidate);
    if (Number.isInteger(headerMap[key])) return headerMap[key];
  }
  return -1;
}

function excelSerialToDate(serialValue) {
  const serial = Number(serialValue);
  if (!Number.isFinite(serial)) return null;

  const parsed = XLSX?.SSF?.parse_date_code?.(serial);
  if (parsed) {
    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      Math.floor(parsed.S || 0)
    );
  }

  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  const baseDateUtc = new Date(Date.UTC(1899, 11, 30 + wholeDays));
  const secondsInDay = Math.round(fraction * 24 * 60 * 60);
  const hours = Math.floor(secondsInDay / 3600);
  const minutes = Math.floor((secondsInDay % 3600) / 60);
  const seconds = secondsInDay % 60;

  return new Date(
    baseDateUtc.getUTCFullYear(),
    baseDateUtc.getUTCMonth(),
    baseDateUtc.getUTCDate(),
    hours,
    minutes,
    seconds
  );
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") return excelSerialToDate(value);

  const clean = String(value || "").trim();
  if (!clean) return null;

  // Excel may provide date/time as text: 5-20-26 7:53 AM or 5/20/2026 7:53 AM.
  const match = clean.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i
  );

  if (match) {
    let [, month, day, year, hour = "0", minute = "0", second = "0", ampm = ""] = match;
    let fullYear = Number(year);
    if (fullYear < 100) fullYear += 2000;

    let hourNumber = Number(hour);
    const upperAmPm = ampm.toUpperCase();
    if (upperAmPm === "PM" && hourNumber < 12) hourNumber += 12;
    if (upperAmPm === "AM" && hourNumber === 12) hourNumber = 0;

    const date = new Date(
      fullYear,
      Number(month) - 1,
      Number(day),
      hourNumber,
      Number(minute),
      Number(second)
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(clean);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatWashDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(-2);
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const amPm = hours24 < 12 ? "AM" : "PM";

  return `${month}-${day}-${year} ${hours12}:${minutes} ${amPm}`;
}

function formatDateTitle(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Unknown Date";
  return `${date.getDate()} ${date.toLocaleString("en-GB", { month: "long" })}`;
}

function dateGroupKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCell(row, index) {
  if (!Number.isInteger(index) || index < 0) return "";
  return row?.[index] ?? "";
}

async function parseWashWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });

  const headerRowIndex = rows.findIndex((row) => {
    const joined = row.map((cell) => normalizeHeader(cell)).join("|");
    return joined.includes("trainnumber") && joined.includes("nextwash");
  });

  if (headerRowIndex === -1) {
    throw new Error(`${file.name}: unable to find Train Number / Next Wash headers.`);
  }

  const headerMap = buildHeaderMap(rows[headerRowIndex]);
  const trainIndex = findColumnIndex(headerMap, ["Train Number", "Train"]);
  const nextWashIndex = findColumnIndex(headerMap, ["Next Wash"]);
  const locationIndex = findColumnIndex(headerMap, ["Train Location", "Location"]);
  const lastWashIndex = findColumnIndex(headerMap, ["Last Wash", "Full Wash"]);

  return rows.slice(headerRowIndex + 1).reduce((items, row) => {
    const trainNumber = String(getCell(row, trainIndex) || "").trim();
    const nextWashDate = parseDateValue(getCell(row, nextWashIndex));
    const lastWashDate = parseDateValue(getCell(row, lastWashIndex));

    if (!trainNumber || !nextWashDate) return items;

    items.push({
      id: `${file.name}-${items.length}-${trainNumber}`,
      sourceFile: file.name,
      trainNumber,
      // Keep Description and HVAC blank to match the uploaded print format.
      description: "",
      hvac: "",
      nextWashDate,
      nextWash: formatWashDateTime(nextWashDate),
      trainLocation: String(getCell(row, locationIndex) || "").trim(),
      lastWash: formatWashDateTime(lastWashDate),
    });

    return items;
  }, []);
}

function groupRowsByNextWashDate(rows = []) {
  const map = new Map();

  rows
    .filter((row) => row?.nextWashDate instanceof Date && !Number.isNaN(row.nextWashDate.getTime()))
    .sort((a, b) => a.nextWashDate.getTime() - b.nextWashDate.getTime())
    .forEach((row) => {
      const key = dateGroupKey(row.nextWashDate);
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: formatDateTitle(row.nextWashDate),
          sortTime: new Date(row.nextWashDate.getFullYear(), row.nextWashDate.getMonth(), row.nextWashDate.getDate()).getTime(),
          rows: [],
        });
      }
      map.get(key).rows.push(row);
    });

  return Array.from(map.values()).sort((a, b) => a.sortTime - b.sortTime);
}

function docxTextRun(text, { bold = false, size = 20, font = "Aptos Narrow" } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}"/><w:sz w:val="${size}"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${xmlEscape(text || " ")}</w:t></w:r>`;
}

function buildDocxCell(text, width, { bold = false, size = 20, font, noWrap = true } = {}) {
  const selectedFont = font || (bold ? "Calibri" : "Aptos Narrow");

  return `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        <w:vAlign w:val="center"/>
        ${noWrap ? "<w:noWrap/>" : ""}
      </w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>
        ${docxTextRun(text, { bold, size, font: selectedFont })}
      </w:p>
    </w:tc>`;
}

function buildDocxRow(values, { header = false } = {}) {
  const cells = values
    .map((value, index) =>
      buildDocxCell(value, DOCX_COL_WIDTHS[index], {
        bold: header,
        size: 20,
        font: header ? "Calibri" : "Aptos Narrow",
        noWrap: true,
      })
    )
    .join("");

  return `
    <w:tr>
      <w:trPr>
        ${header ? "<w:tblHeader/>" : ""}
        <w:trHeight w:val="340" w:hRule="atLeast"/>
      </w:trPr>
      ${cells}
    </w:tr>`;
}

function buildWashDocxTable(rows = []) {
  const grid = DOCX_COL_WIDTHS.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const headerRow = buildDocxRow(OUTPUT_HEADERS, { header: true });
  const bodyRows = rows
    .map((row) =>
      buildDocxRow([
        row.trainNumber,
        row.description,
        row.hvac,
        row.nextWash,
        row.trainLocation,
        row.lastWash,
      ])
    )
    .join("");

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${DOCX_TABLE_WIDTH}" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>${grid}</w:tblGrid>
      ${headerRow}${bodyRows}
    </w:tbl>`;
}

function buildWashDocx(groups = []) {
  const bodyXml = groups
    .map((group) => {
      return `
        <w:p>
          <w:pPr><w:spacing w:before="240" w:after="0"/></w:pPr>
          ${docxTextRun(group.title, { size: 26, font: "Times New Roman" })}
        </w:p>
        ${buildWashDocxTable(group.rows)}
        <w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
    })
    .join("");

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="360" w:bottom="720" w:left="360" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return buildStoredZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: packageRels },
    { name: "word/document.xml", data: documentXml },
  ]);
}

function textToUint8(text) {
  return new TextEncoder().encode(text);
}

function concatUint8(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = ZIP_CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function buildStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  files.forEach(({ name, data }) => {
    const nameBytes = textToUint8(name);
    const fileData = data instanceof Uint8Array ? data : textToUint8(data);
    const fileCrc = crc32(fileData);

    const localHeader = concatUint8([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(fileCrc),
      u32(fileData.length),
      u32(fileData.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, fileData);

    const centralHeader = concatUint8([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(fileCrc),
      u32(fileData.length),
      u32(fileData.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + fileData.length;
  });

  const centralDirectory = concatUint8(centralParts);
  const endRecord = concatUint8([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return concatUint8([...localParts, centralDirectory, endRecord]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TrainWashingDocxExport() {
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [statusText, setStatusText] = useState("Upload two Excel files to generate the washing DOCX.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorText, setErrorText] = useState("");

  const groups = useMemo(() => groupRowsByNextWashDate(rows), [rows]);
  const totalRows = rows.length;

  const handleFiles = async (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) =>
      /\.xlsx$/i.test(file.name)
    );

    setFiles(selectedFiles);
    setRows([]);
    setErrorText("");

    if (selectedFiles.length === 0) {
      setStatusText("Please upload Excel files in .xlsx format.");
      return;
    }

    setIsProcessing(true);
    setStatusText("Reading Excel files...");

    try {
      const parsed = await Promise.all(selectedFiles.map(parseWashWorkbook));
      const combinedRows = parsed.flat().sort((a, b) => a.nextWashDate - b.nextWashDate);

      setRows(combinedRows);
      setStatusText(
        `Ready: ${combinedRows.length} train wash rows detected across ${selectedFiles.length} Excel file${selectedFiles.length > 1 ? "s" : ""}.`
      );
    } catch (error) {
      console.error("Train washing Excel import failed:", error);
      setErrorText(error?.message || "Unable to read the uploaded Excel files.");
      setStatusText("Import failed.");
    } finally {
      setIsProcessing(false);
      event.target.value = "";
    }
  };

  const clearFiles = () => {
    setFiles([]);
    setRows([]);
    setErrorText("");
    setStatusText("Upload two Excel files to generate the washing DOCX.");
  };

  const downloadDocx = () => {
    if (groups.length === 0) {
      setStatusText("No DOCX generated — upload Excel files first.");
      return;
    }

    const docxBytes = buildWashDocx(groups);
    const blob = new Blob([docxBytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const firstDate = groups[0]?.title?.replace(/\s+/g, "-").toLowerCase() || "train-washing";
    const lastDate = groups[groups.length - 1]?.title?.replace(/\s+/g, "-").toLowerCase() || firstDate;
    const filename = firstDate === lastDate
      ? `train-washing-${firstDate}.docx`
      : `train-washing-${firstDate}-to-${lastDate}.docx`;

    downloadBlob(blob, filename);
    setStatusText(`DOCX generated: ${groups.map((group) => group.title).join(", ")}.`);
  };

  return (
    <div className="w-full rounded-2xl border border-[#2b4f6b] bg-[#071828] p-5 text-slate-100 shadow-xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.18)]">
              <FileSpreadsheet size={18} />
            </div>
            <h1 className="text-lg font-black uppercase tracking-[0.22em] text-white">Train Washing DOCX Export</h1>
          </div>
          <p className="text-xs text-slate-400">
            Upload Excel wash records, group by <span className="text-cyan-200">Next Wash</span> date, then download the printable DOCX.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/45 px-4 py-2 text-xs font-bold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.20)] transition hover:border-cyan-300 hover:bg-cyan-900/60 hover:text-white">
            <Upload size={15} />
            Upload Excel
            <input type="file" accept=".xlsx" multiple onChange={handleFiles} className="hidden" />
          </label>

          <button
            type="button"
            onClick={downloadDocx}
            disabled={isProcessing || groups.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-400/55 bg-blue-950/55 px-4 py-2 text-xs font-bold text-blue-100 shadow-[0_0_16px_rgba(59,130,246,0.22)] transition hover:border-blue-300 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Generate DOCX
          </button>

          {(files.length > 0 || rows.length > 0) && (
            <button
              type="button"
              onClick={clearFiles}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/45 bg-red-950/45 px-4 py-2 text-xs font-bold text-red-100 shadow-[0_0_16px_rgba(239,68,68,0.18)] transition hover:border-red-300 hover:bg-red-900/60"
            >
              <X size={15} />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-[#2b4f6b] bg-[#0b1f33] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Files</div>
          <div className="mt-1 text-xl font-black text-white">{files.length}</div>
        </div>
        <div className="rounded-xl border border-[#2b4f6b] bg-[#0b1f33] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Rows Detected</div>
          <div className="mt-1 text-xl font-black text-white">{totalRows}</div>
        </div>
        <div className="rounded-xl border border-[#2b4f6b] bg-[#0b1f33] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Date Titles</div>
          <div className="mt-1 text-xl font-black text-white">{groups.map((group) => group.title).join(" / ") || "—"}</div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-[#2b4f6b] bg-[#0b1f33] px-4 py-3 text-xs text-slate-300">
        {statusText}
        {errorText && <div className="mt-2 text-red-300">{errorText}</div>}
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((file) => (
              <span key={file.name} className="rounded-full border border-cyan-500/30 bg-cyan-950/30 px-3 py-1 text-[11px] text-cyan-100">
                {file.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-2xl border border-[#2b4f6b] bg-[#0b1f33]">
              <div className="border-b border-[#2b4f6b] bg-[#09233a] px-4 py-3">
                <div className="text-sm font-black text-white">{group.title}</div>
                <div className="text-[11px] text-slate-400">{group.rows.length} trains</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full text-xs">
                  <thead className="bg-[#071828] text-slate-200">
                    <tr>
                      {OUTPUT_HEADERS.map((header) => (
                        <th key={header} className="border-b border-[#2b4f6b] px-3 py-2 text-center font-bold whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.id} className="odd:bg-[#0a1b2d] even:bg-[#0d2439]">
                        <td className="border-b border-[#193752] px-3 py-2 text-center whitespace-nowrap">{row.trainNumber}</td>
                        <td className="border-b border-[#193752] px-3 py-2 text-center whitespace-nowrap">{row.description}</td>
                        <td className="border-b border-[#193752] px-3 py-2 text-center whitespace-nowrap">{row.hvac}</td>
                        <td className="border-b border-[#193752] px-3 py-2 text-center whitespace-nowrap">{row.nextWash}</td>
                        <td className="border-b border-[#193752] px-3 py-2 text-center whitespace-nowrap">{row.trainLocation}</td>
                        <td className="border-b border-[#193752] px-3 py-2 text-center whitespace-nowrap">{row.lastWash}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

  return TrainWashingDocxExport;
})();

const WEST_ROADS = ["WD-ST15", "WD-ST14", "WD-ST13", "WD-ST12"];
const EAST_ROADS = ["ED-ST02", "ED-ST03"];
const INSERTION_ROAD_PILLS = {
  "ED-ST02": "2518",
  "ED-ST03": "2519",
};
const NUM_BLOCKS = 7;

const MAINT_STYLES = {
  UNFIT: {
    cellBg: "#fff1f2",
    trainColor: "#be123c",
    badgeBg: "#fecaca",
    badgeBorder: "#fca5a5",
    badgeColor: "#000000",
  },
  "Workshop /Unfit": {
    cellBg: "#fff1f2",
    trainColor: "#be123c",
    badgeBg: "#fecaca",
    badgeBorder: "#fca5a5",
    badgeColor: "#000000",
  },
  "RST CM": {
    cellBg: "#fff7ed",
    trainColor: "#c2410c",
    badgeBg: "#FFA500",
    badgeBorder: "#fb923c",
    badgeColor: "#000000",
  },
  "RST PM": {
    cellBg: "#ecfdf5",
    trainColor: "#047857",
    badgeBg: "#90EE90",
    badgeBorder: "#86efac",
    badgeColor: "#000000",
  },
  WASH: {
    cellBg: "#eaf8ff",
    trainColor: "#0e7490",
    badgeBg: "#ADD8E6",
    badgeBorder: "#7dd3fc",
    badgeColor: "#000000",
  },
  "TLC Comms": {
    cellBg: "#eef2ff",
    trainColor: "#4f46e5",
    badgeBg: "#c7d2fe",
    badgeBorder: "#6366f1",
    badgeColor: "#000000",
  },
  "ML Fault": {
    cellBg: "#fff1f2",
    trainColor: "#dc2626",
    badgeBg: "#fee2e2",
    badgeBorder: "#dc2626",
    badgeColor: "#000000",
  },
  "HVAC TESTING": {
    cellBg: "#fdf2f8",
    trainColor: "#be185d",
    badgeBg: "#FFB6C1",
    badgeBorder: "#f9a8d4",
    badgeColor: "#000000",
  },
  "Deep Cleaning": {
    cellBg: "#faf5ff",
    trainColor: "#7e22ce",
    badgeBg: "#DDA0DD",
    badgeBorder: "#d8b4fe",
    badgeColor: "#000000",
  },
  "INBOUND (G to C)": {
    cellBg: "#fefce8",
    trainColor: "#a16207",
    badgeBg: "#FFFF99",
    badgeBorder: "#fde047",
    badgeColor: "#000000",
  },
  "CC Tech/Func. Alarm": {
    cellBg: "#fffbeb",
    trainColor: "#b45309",
    badgeBg: "#fde68a",
    badgeBorder: "#f59e0b",
    badgeColor: "#000000",
  },
  "Door Issue": {
    cellBg: "#fef2f2",
    trainColor: "#b91c1c",
    badgeBg: "#fca5a5",
    badgeBorder: "#ef4444",
    badgeColor: "#000000",
  },
  Training: {
    cellBg: "#f0f9ff",
    trainColor: "#0369a1",
    badgeBg: "#bae6fd",
    badgeBorder: "#0284c7",
    badgeColor: "#000000",
  },
  "APU alarm": {
    cellBg: "#f0fdfa",
    trainColor: "#0f766e",
    badgeBg: "#99f6e4",
    badgeBorder: "#14b8a6",
    badgeColor: "#000000",
  },
  Other: {
    cellBg: "#f8fafc",
    trainColor: "#475569",
    badgeBg: "#D3D3D3",
    badgeBorder: "#cbd5e1",
    badgeColor: "#000000",
  },
};

const PST_STORAGE_KEY = "pstTrainPrepState_v1";
const PST_LIVE_RECORD_KEY = "pst-train-prep-main";
const PST_LIVE_SYNC_INTERVAL_MS = 5000;
const PST_LIVE_LOCAL_EDIT_HOLD_MS = 30000;
const PST_LIVE_POST_SAVE_HOLD_MS = 12000;
const INSERTION_LOG_KEY = "insertionLogState_v1";
const INSERTION_LIVE_RECORD_KEY = "insertion-live-main";
const INSERTION_LIVE_SYNC_INTERVAL_MS = 5000;
const INSERTION_LIVE_LOCAL_EDIT_HOLD_MS = 30000;
const INSERTION_LIVE_POST_SAVE_HOLD_MS = 12000;
const SIDEBAR_COLLAPSED_KEY = "depotSidebarCollapsed_v1";
const SIDEBAR_AUTO_HIDE_MS = 3000;

function loadInsertionLog() {
  try {
    const raw = localStorage.getItem(INSERTION_LOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch { return []; }
}
function saveInsertionLog(log) {
  try { localStorage.setItem(INSERTION_LOG_KEY, JSON.stringify(log)); } catch {}
}

const TID_INPUTS_KEY = "tidInputsState_v1";
function loadTidInputs() {
  try {
    const raw = localStorage.getItem(TID_INPUTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch { return {}; }
}
function saveTidInputs(inputs) {
  try { localStorage.setItem(TID_INPUTS_KEY, JSON.stringify(inputs)); } catch {}
}

function normalizeInsertionLiveState(source = {}) {
  return {
    insertionLog: sortInsertionLogByTime(Array.isArray(source?.insertionLog) ? source.insertionLog : []),
    tidInputs: source?.tidInputs && typeof source.tidInputs === "object" ? source.tidInputs : {},
    updatedAt: (source?.updatedAt || "").toString(),
  };
}

function getInsertionLiveEntity() {
  return base44?.entities?.InsertionLive || null;
}

function isInsertionLiveEntityReady(entity = getInsertionLiveEntity()) {
  return Boolean(entity?.list && entity?.create && entity?.update);
}

function buildInsertionLivePayload(state = {}) {
  const normalized = normalizeInsertionLiveState(state);

  return {
    stateKey: INSERTION_LIVE_RECORD_KEY,
    insertionLog: normalized.insertionLog,
    tidInputs: normalized.tidInputs,
    updatedAt: new Date().toISOString(),
  };
}


const TRAIN_REM_STORAGE_KEY = "trainRemState_v1";
const TRAIN_REM_SYNC_INTERVAL_MS = 5000;
const TRAIN_REM_UNDO_LIMIT = 30;
const TRAIN_REM_ROW_COUNTS = { west: 26, east: 14 };
const FULL_ML_TID_ROW_COUNT = 40;
const FULL_ML_TID_AUTO_CLEAR_MS = 5 * 60 * 1000;
const FULL_ML_TID_PRESETS = [
  {
    label: "Preset 1",
    tids: [
      101,102,103,104,105,106,107,108,109,110,
      111,112,113,114,115,116,117,118,119,120,
      201,202,203,204,205,206,207,208,209,210,
      211,212,213,214,215,216,217,218,219,220,
    ],
  },
  {
    label: "Preset 2",
    tids: [
      101,103,105,107,109,111,113,115,117,119,
      121,122,123,124,125,126,127,128,129,130,
      201,203,205,207,209,211,213,215,217,219,
      221,222,223,224,225,226,227,228,229,230,
    ],
  },
  {
    label: "Preset 3",
    tids: [
      101,103,105,107,109,111,113,115,117,119,
      201,203,205,207,209,211,213,215,217,219,
    ],
  },
  {
    label: "Preset 4",
    tids: [
      121,122,123,124,125,126,127,128,129,130,
      221,222,223,224,225,226,227,228,229,230,
    ],
  },
];
const TRAIN_REM_WEST_9AM_PRIORITY_INSERT_INDEX = 10;
const TRAIN_REM_WEST_9AM_PRIORITY_TITLE = "Check this TID if required for washing and priority to swap";
const TRAIN_REM_WEST_9AM_PRIORITY_TIDS = new Set(["207", "209", "211"]);

const TID_PRESETS = {
  west: [
    { label: "9am",  tids: [212,214,216,218,220,102,104,106,108,110,207,209,211] },
    { label: "7pm",  tids: [213,215,217,219,101,103,105,107,109,111,113,115,117,119,201,203,205] },
    { label: "12am", tids: [122,123,124,125,126,127,128,129,130,221] },
    { label: "Fri",  tids: [102,103,104,105,106,107,108,109,110,201] },
    { label: "Sat",  tids: [107,108,109,110,201,202,203,204,205,206] },
    { label: "PH",   tids: [111,202,112,203,113,204,114,205,115,206,116,207,117,208,118,209,119,210,120,101,211,102,212,103,213,104] },
  ],
  east: [
    { label: "9am",  tids: [112,114,116,118,120,202,204,206,208,210] },
    { label: "7pm",  tids: [207,209,211] },
    { label: "12am", tids: [222,223,224,225,226,227,228,229,230,121] },
    { label: "Fri",  tids: [202,203,204,205,206,207,208,209,210,101] },
    { label: "Sat",  tids: [207,208,209,210,101,102,103,104,105,106] },
    { label: "PH",   tids: [214,105,215,106,216,107,217,108,218,109,219,110,220,201] },
  ],
};

const TID_TIME_MAP = {
  west: {
    "9am":  { 212:"08:59",214:"09:05",216:"09:11",218:"09:17",220:"09:23",102:"09:29",104:"09:35",106:"09:41",108:"09:47",110:"09:53" },
    "7pm":  { 213:"19:02",215:"19:08",217:"19:14",219:"19:20",101:"19:26",103:"19:32",105:"19:38",107:"19:44",109:"19:50",111:"19:56",113:"20:02",115:"20:08",117:"20:14",119:"20:20",201:"20:26",203:"20:32",205:"20:38" },
    "12am": { 122:"00:03",123:"00:09",124:"00:15",125:"00:21",126:"00:27",127:"00:33",128:"00:39",129:"00:45",130:"00:51",221:"00:56" },
    "Fri":  { 102:"00:02",103:"00:08",104:"00:14",105:"00:20",106:"00:26",107:"00:32",108:"00:38",109:"00:44",110:"00:50",201:"00:56" },
    "Sat":  { 107:"00:02",108:"00:08",109:"00:14",110:"00:20",201:"00:26",202:"00:32",203:"00:38",204:"00:44",205:"00:50",206:"00:56" },
    "PH":   { 111:"00:00",202:"00:02",112:"00:05",203:"00:08",113:"00:11",204:"00:14",114:"00:17",205:"00:20",115:"00:23",206:"00:26",116:"00:29",207:"00:32",117:"00:35",208:"00:38",118:"00:41",209:"00:44",119:"00:47",210:"00:50",120:"00:53",101:"00:56",211:"00:59",102:"01:02",212:"01:05",103:"01:08",213:"01:11",104:"01:14" },
  },
  east: {
    "9am":  { 112:"08:59",114:"09:05",116:"09:11",118:"09:17",120:"09:23",202:"09:29",204:"09:35",206:"09:41",208:"09:47",210:"09:53" },
    "7pm":  { 207:"19:44",209:"19:50",211:"19:56" },
    "12am": { 222:"00:04",223:"00:10",224:"00:16",225:"00:22",226:"00:28",227:"00:34",228:"00:40",229:"00:46",230:"00:52",121:"00:56" },
    "Fri":  { 202:"00:02",203:"00:08",204:"00:14",205:"00:20",206:"00:26",207:"00:32",208:"00:38",209:"00:44",210:"00:50",101:"00:56" },
    "Sat":  { 207:"00:02",208:"00:08",209:"00:14",210:"00:20",101:"00:26",102:"00:32",103:"00:38",104:"00:44",105:"00:50",106:"00:56" },
    "PH":   { 214:"00:17",105:"00:20",215:"00:23",106:"00:26",216:"00:29",107:"00:32",217:"00:35",108:"00:38",218:"00:41",109:"00:44",219:"00:47",110:"00:50",220:"00:53",201:"00:56" },
  },
};

function emptyTrainRemRows(count) {
  return Array.from({ length: count }, () => ({
    trainId: "",
    tid: "",
    timing: "",
    remark: "",
  }));
}

function emptyFullMlTidRows(count = FULL_ML_TID_ROW_COUNT) {
  return Array.from({ length: count }, () => ({
    trainId: "",
    tid: "",
  }));
}

function cleanFullMlTrainIdInput(value = "") {
  // Full ML TID uses plain 2-digit Train ID only (01, 02, 10).
  // If old saved data contains T01/T1, strip the T and keep the number only.
  return (value || "").toString().replace(/[^0-9]/g, "").slice(0, 2);
}

function normalizeFullMlTidRows(rows) {
  const source = Array.isArray(rows) ? rows : [];

  return Array.from({ length: FULL_ML_TID_ROW_COUNT }, (_, i) => ({
    trainId: cleanFullMlTrainIdInput(source[i]?.trainId || ""),
    tid: (source[i]?.tid || "").toString().replace(/[^0-9]/g, ""),
  }));
}

function getFullMlTidActivePresetLabel(rows = []) {
  const currentTids = normalizeFullMlTidRows(rows).map((row) => (row.tid || "").toString().replace(/[^0-9]/g, ""));

  for (const preset of FULL_ML_TID_PRESETS) {
    const presetTids = (preset?.tids || []).map((tid) => String(tid));
    const presetRowsMatch = presetTids.every((tid, index) => currentTids[index] === tid);
    const remainingRowsClear = currentTids.slice(presetTids.length).every((tid) => !tid);

    if (presetRowsMatch && remainingRowsClear) {
      return preset.label;
    }
  }

  return "";
}

function normalizeFullMlTrainId(value = "") {
  return cleanFullMlTrainIdInput(value);
}

function buildFullMlTidMap(rows = []) {
  const map = {};

  normalizeFullMlTidRows(rows).forEach((row) => {
    const tid = (row.tid || "").toString().replace(/[^0-9]/g, "");
    const trainId = normalizeFullMlTrainId(row.trainId);

    if (tid && trainId && !map[tid]) {
      map[tid] = trainId;
    }
  });

  return map;
}

function applyFullMlTidMatchesToTrainRemRows(rowsByDepot = {}, fullMlTidRows = []) {
  const tidMap = buildFullMlTidMap(fullMlTidRows);
  const nextRows = {};

  ["west", "east"].forEach((depot) => {
    nextRows[depot] = normalizeTrainRemRows(rowsByDepot?.[depot], depot).map((row) => {
      const tid = (row.tid || "").toString().replace(/[^0-9]/g, "");
      const matchedTrainId = tid ? tidMap[tid] : "";

      if (!matchedTrainId || (normalizeFullMlTrainId(row.trainId) === matchedTrainId && (row.trainId || "").toString() === matchedTrainId)) return row;

      return {
        ...row,
        trainId: matchedTrainId,
        remark: "",
      };
    });
  });

  return nextRows;
}

function getFullMlTidAutoClearInfo(fullMlTidRows = []) {
  const activeRows = normalizeFullMlTidRows(fullMlTidRows)
    .map((row, index) => ({
      index,
      trainId: normalizeFullMlTrainId(row.trainId),
      tid: (row.tid || "").toString().replace(/[^0-9]/g, ""),
    }))
    .filter((row) => row.tid);

  const filledRows = activeRows.filter((row) => row.trainId);

  return {
    activeCount: activeRows.length,
    filledCount: filledRows.length,
    isComplete: activeRows.length > 0 && filledRows.length === activeRows.length,
    signature: activeRows.map((row) => `${row.index}:${row.tid}:${row.trainId}`).join("|"),
  };
}

function formatFullMlTidCountdown(seconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function normalizeFullMlTidAutoClearMeta(meta = {}) {
  const signature = (meta?.signature || "").toString();
  const rawEndsAt = Number(meta?.endsAt || 0);
  const endsAt = Number.isFinite(rawEndsAt) && rawEndsAt > 0 ? rawEndsAt : null;

  return { signature, endsAt };
}

function emptyFullMlTidAutoClearMeta() {
  return { signature: "", endsAt: null };
}

function isSameFullMlTidAutoClearMeta(a = {}, b = {}) {
  const left = normalizeFullMlTidAutoClearMeta(a);
  const right = normalizeFullMlTidAutoClearMeta(b);

  return left.signature === right.signature && left.endsAt === right.endsAt;
}

function clearAutoMatchedTrainRemRows(rowsByDepot = {}, fullMlTidRows = []) {
  const activeMap = {};

  normalizeFullMlTidRows(fullMlTidRows).forEach((row) => {
    const tid = (row.tid || "").toString().replace(/[^0-9]/g, "");
    const trainId = normalizeFullMlTrainId(row.trainId);
    if (tid && trainId && !activeMap[tid]) activeMap[tid] = trainId;
  });

  const nextRows = {};

  ["west", "east"].forEach((depot) => {
    nextRows[depot] = normalizeTrainRemRows(rowsByDepot?.[depot], depot).map((row) => {
      const tid = (row.tid || "").toString().replace(/[^0-9]/g, "");
      const matchedTrainId = tid ? activeMap[tid] : "";

      if (!matchedTrainId || normalizeFullMlTrainId(row.trainId) !== matchedTrainId) return row;

      return {
        ...row,
        trainId: "",
        remark: "",
      };
    });
  });

  return nextRows;
}

function clearFullMlTidTrainIdsFromState(state = {}) {
  const clearedFullRows = normalizeFullMlTidRows(state.fullMlTidRows).map((row) => ({
    ...row,
    trainId: "",
  }));

  return {
    ...state,
    fullMlTidRows: clearedFullRows,
  };
}

function normalizeTrainRemRows(rows, depot) {
  const count = TRAIN_REM_ROW_COUNTS[depot];
  const source = Array.isArray(rows) ? rows : [];
  return Array.from({ length: count }, (_, i) => ({
    trainId: source[i]?.trainId || "",
    tid: source[i]?.tid || "",
    timing: source[i]?.timing || "",
    remark: source[i]?.remark || "",
  }));
}

function buildTrainRemRowsFromPreset(depot, label, existingRows = []) {
  const preset = TID_PRESETS[depot].find((item) => item.label === label);
  const tids = preset?.tids || [];
  const rows = normalizeTrainRemRows(existingRows, depot);

  return rows.map((row, index) => {
    const tid = tids[index] ? String(tids[index]) : "";
    return {
      ...row,
      tid,
      timing: tid ? TID_TIME_MAP?.[depot]?.[label]?.[tid] || "" : "",
    };
  });
}

function buildDefaultTrainRemState() {
  return {
    selectedPreset: { west: "9am", east: "9am" },
    rows: {
      west: buildTrainRemRowsFromPreset("west", "9am"),
      east: buildTrainRemRowsFromPreset("east", "9am"),
    },
    fullMlTidRows: emptyFullMlTidRows(),
    fullMlTidAutoClear: emptyFullMlTidAutoClearMeta(),
  };
}

function loadTrainRemState() {
  try {
    const raw = localStorage.getItem(TRAIN_REM_STORAGE_KEY);
    if (!raw) return buildDefaultTrainRemState();
    const parsed = JSON.parse(raw);
    return {
      selectedPreset: {
        west: parsed?.selectedPreset?.west || "9am",
        east: parsed?.selectedPreset?.east || "9am",
      },
      rows: applyFullMlTidMatchesToTrainRemRows(
        {
          west: normalizeTrainRemRows(parsed?.rows?.west, "west"),
          east: normalizeTrainRemRows(parsed?.rows?.east, "east"),
        },
        parsed?.fullMlTidRows
      ),
      fullMlTidRows: normalizeFullMlTidRows(parsed?.fullMlTidRows),
      fullMlTidAutoClear: normalizeFullMlTidAutoClearMeta(parsed?.fullMlTidAutoClear),
    };
  } catch {
    return buildDefaultTrainRemState();
  }
}

function saveTrainRemState(state) {
  try { localStorage.setItem(TRAIN_REM_STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function cloneTrainRemState(state) {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return buildDefaultTrainRemState();
  }
}

function isSameTrainRemState(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}


function getTrainRemEntity() {
  return base44?.entities?.TrainRem || null;
}

function isTrainRemEntityReady(entity = getTrainRemEntity()) {
  return Boolean(entity?.list && entity?.create && entity?.update);
}

function buildTrainRemStateFromRecords(records = []) {
  const fallback = buildDefaultTrainRemState();
  const map = {};
  const state = {
    selectedPreset: { ...fallback.selectedPreset },
    rows: { ...fallback.rows },
    fullMlTidRows: emptyFullMlTidRows(),
    fullMlTidAutoClear: emptyFullMlTidAutoClearMeta(),
  };

  (records || []).forEach((rec) => {
    const depot = rec?.depot === "east" ? "east" : rec?.depot === "west" ? "west" : null;
    if (!depot) return;

    if (rec.id) map[depot] = rec.id;

    state.selectedPreset[depot] = rec.selectedPreset || fallback.selectedPreset[depot];
    state.rows[depot] = normalizeTrainRemRows(rec.rows, depot);

    const fullRows = normalizeFullMlTidRows(rec.fullMlTidRows);
    if (fullRows.some((row) => row.trainId || row.tid)) {
      state.fullMlTidRows = fullRows;
    }

    const fullMlTidAutoClear = normalizeFullMlTidAutoClearMeta({
      signature: rec?.fullMlTidAutoClearSignature || rec?.fullMlTidAutoClear?.signature,
      endsAt: rec?.fullMlTidAutoClearEndsAt || rec?.fullMlTidAutoClear?.endsAt,
    });

    if (fullMlTidAutoClear.signature && fullMlTidAutoClear.endsAt) {
      const currentAutoClear = normalizeFullMlTidAutoClearMeta(state.fullMlTidAutoClear);
      if (!currentAutoClear.endsAt || fullMlTidAutoClear.endsAt > currentAutoClear.endsAt) {
        state.fullMlTidAutoClear = fullMlTidAutoClear;
      }
    }
  });

  state.rows = applyFullMlTidMatchesToTrainRemRows(state.rows, state.fullMlTidRows);

  return { state, map };
}

function formatTime(date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}
function getSavedPSTCompletedByNames() {
  try {
    const legacyName = localStorage.getItem("pstExcelCompletedByName") || "";
    const raw = localStorage.getItem("pstExcelCompletedByNames");
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      west: parsed?.west || legacyName || "",
      east: parsed?.east || legacyName || "",
    };
  } catch {
    return { west: "", east: "" };
  }
}

function normalizePSTLiveState(source = {}) {
  return {
    pstState: source?.pstState && typeof source.pstState === "object" ? source.pstState : {},
    prepState: source?.prepState && typeof source.prepState === "object" ? source.prepState : {},
    logLines: sortPSTLogLinesByTime(Array.isArray(source?.logLines) ? source.logLines : []),
    taNameState: source?.taNameState && typeof source.taNameState === "object" ? source.taNameState : {},
    completedByNames: {
      west: (source?.completedByNames?.west || "").toString(),
      east: (source?.completedByNames?.east || "").toString(),
    },
    updatedAt: (source?.updatedAt || "").toString(),
  };
}

function loadSavedPSTState() {
  const fallbackCompletedByNames = getSavedPSTCompletedByNames();

  try {
    const raw = localStorage.getItem(PST_STORAGE_KEY);
    if (!raw) {
      return {
        pstState: {},
        prepState: {},
        logLines: [],
        taNameState: {},
        completedByNames: fallbackCompletedByNames,
      };
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizePSTLiveState({
      ...parsed,
      completedByNames: parsed?.completedByNames || fallbackCompletedByNames,
    });

    return normalized;
  } catch {
    return {
      pstState: {},
      prepState: {},
      logLines: [],
      taNameState: {},
      completedByNames: fallbackCompletedByNames,
    };
  }
}

function savePSTState(pstState, prepState, logLines, taNameState, completedByNames = { west: "", east: "" }) {
  const normalizedCompletedByNames = {
    west: (completedByNames?.west || "").toString(),
    east: (completedByNames?.east || "").toString(),
  };

  try {
    localStorage.setItem(
      PST_STORAGE_KEY,
      JSON.stringify({
        pstState,
        prepState,
        logLines: sortPSTLogLinesByTime(logLines),
        taNameState,
        completedByNames: normalizedCompletedByNames,
      })
    );
    localStorage.setItem("pstExcelCompletedByNames", JSON.stringify(normalizedCompletedByNames));
  } catch {}
}

function getPSTTrainPrepEntity() {
  return base44?.entities?.PSTTrainPrep || null;
}

function isPSTTrainPrepEntityReady(entity = getPSTTrainPrepEntity()) {
  return Boolean(entity?.list && entity?.create && entity?.update);
}

function buildPSTLivePayload(state = {}) {
  const normalized = normalizePSTLiveState(state);

  return {
    stateKey: PST_LIVE_RECORD_KEY,
    pstState: normalized.pstState,
    prepState: normalized.prepState,
    logLines: normalized.logLines,
    taNameState: normalized.taNameState,
    completedByNames: normalized.completedByNames,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTrainId(value) {
  if (!value) return "";
  const cleaned = value.toString().trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";
  // Pure digits: strip leading zeros, prefix with T
  if (/^\d+$/.test(cleaned)) return `T${parseInt(cleaned, 10)}`;
  // T-prefixed digits (e.g. T03, T003): strip leading zeros from numeric part
  const tMatch = cleaned.match(/^T(\d+)$/);
  if (tMatch) return `T${parseInt(tMatch[1], 10)}`;
  return cleaned;
}


function padTrainId(trainId) {
  // Always format as T## — ensure minimum 2-digit number (T1→T01, T9→T09, T10→T10)
  if (!trainId) return trainId;
  return trainId.replace(/^T(\d+)$/, (_, n) => `T${n.padStart(2, "0")}`);
}


function emptyBlocks() {
  return Array.from({ length: NUM_BLOCKS }, () => ({
    trainId: "",
    extraRemark: "",
  }));
}

function initRoads(roads) {
  return Object.fromEntries(roads.map((r) => [r, emptyBlocks()]));
}

function buildStablingStateFromRecords(stablingRecords = []) {
  const map = {};
  const newWest = initRoads(WEST_ROADS);
  const newEast = initRoads(EAST_ROADS);

  (stablingRecords || []).forEach((rec) => {
    map[`${rec.depot}_${rec.road}`] = rec.id;

    const blocks = (rec.blocks || emptyBlocks()).map((b) => ({
      trainId: b.trainId || "",
      extraRemark: b.extraRemark || "",
    }));

    if (rec.depot === "west" && newWest[rec.road]) {
      newWest[rec.road] = blocks;
    }

    if (rec.depot === "east" && newEast[rec.road]) {
      newEast[rec.road] = blocks;
    }
  });

  return { map, newWest, newEast };
}

function getDuplicates(westData, eastData) {
  const all = [];

  [...Object.values(westData), ...Object.values(eastData)].forEach((blocks) => {
    blocks.forEach((b) => {
      const id = normalizeTrainId(b.trainId);
      if (id) all.push(id);
    });
  });

  const counts = {};
  all.forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });

  return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
}

const CUSTOM_REQUEST_PALETTE = [
  "#22c55e",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#2dd4bf",
  "#fb7185",
  "#c084fc",
  "#60a5fa",
  "#f97316",
  "#34d399",
  "#e879f9",
  "#84cc16",
  "#06b6d4",
  "#d946ef",
  "#facc15",
  "#10b981",
  "#818cf8",
  "#fb923c",
  "#2dd4bf",
];

function getCustomRequestColor(label = "") {
  // Custom types entered through "Other" are coloured from the full label.
  // This avoids different requests such as "TMRW IN BOUND" and "TMRW PM"
  // being grouped by only the first two words.
  const key = label
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .join(" ");

  if (!key) return MAINT_STYLES.Other.badgeBorder;

  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return CUSTOM_REQUEST_PALETTE[hash % CUSTOM_REQUEST_PALETTE.length];
}

function getCustomRequestStyle(label = "") {
  const accent = getCustomRequestColor(label);

  return {
    cellBg: "#f8fafc",
    trainColor: accent,
    badgeBg: accent,
    badgeBorder: accent,
    badgeColor: "#000000",
  };
}

function buildMaintenanceMap(requests) {
  const map = {};

  (requests || []).forEach((req) => {
    const key = normalizeTrainId(req.trainId);
    if (!key) return;

    const displayType =
      req.requestType === "Other"
        ? req.customType || "Other"
        : req.requestType;
    const typeKey = req.requestType === "Other" ? displayType : req.requestType;

    // Keep the request note/remark so main stabling can show Excel wash dates.
    // Example: requestType = "WASH", remark = "wash 20 May" → badge shows "wash 20 May".
    const remark = (req.remark || req.note || "").toString().trim();
    const badgeText = remark || displayType;

    const styles = MAINT_STYLES[typeKey] || getCustomRequestStyle(displayType);

    if (!map[key]) {
      map[key] = [];
    }

    map[key].push({
      typeKey,
      displayType,
      remark,
      badgeText,
      ...styles,
    });
  });

  return map;
}


const TRAIN_REM_AUTO_REMARK_LABELS = [
  ...Object.keys(MAINT_STYLES),
  "PM",
  "CM",
  "RST PM",
  "RST CM",
  "WASH",
  "HVAC",
  "HVAC TESTING",
  "UNFIT",
  "Other",
];

function normalizeRemarkText(value = "") {
  return (value || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

const TRAIN_REM_NOTE_COLOR_OVERRIDES = {
  "PM TODAY": "#fbbf24",
  "TODAY PM": "#fbbf24",
  "PM TOMORROW": "#38bdf8",
  "TOMORROW PM": "#38bdf8",
  "TMRW PM": "#38bdf8",
};

function normalizeRemarkColorKey(value = "") {
  return (value || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .join(" ");
}

function getTrainRemNoteOverrideColor(value = "") {
  return TRAIN_REM_NOTE_COLOR_OVERRIDES[normalizeRemarkColorKey(value)] || "";
}

function isDefaultAutoRequestRemarkText(value = "") {
  const clean = normalizeRemarkText(value);
  if (!clean) return false;
  return TRAIN_REM_AUTO_REMARK_LABELS.some((label) => normalizeRemarkText(label) === clean);
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== "string") return `rgba(79,142,247,${alpha})`;
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return `rgba(79,142,247,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(79,142,247,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function getRequestAccent(item) {
  return item?.badgeBorder || item?.badgeBg || item?.trainColor || "#4f8ef7";
}

function getRequestCardGradient(item) {
  const accent = getRequestAccent(item);
  return `linear-gradient(135deg,${hexToRgba(accent, 0.24)} 0%,#08251f 42%,#071828 100%)`;
}

function getRequestGlow(item) {
  const accent = getRequestAccent(item);
  return `0 0 0 1px ${hexToRgba(accent, 0.16)}, 0 0 14px ${hexToRgba(accent, 0.28)}, 0 2px 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)`;
}

function getRequestPillStyle(item) {
  const accent = getRequestAccent(item);
  return {
    backgroundColor: hexToRgba(accent, 0.11),
    color: accent,
    border: `1px solid ${accent}`,
    boxShadow: `0 0 8px ${hexToRgba(accent, 0.24)}, inset 0 1px 0 rgba(255,255,255,0.05)`,
  };
}

function getTrainRemRequestRemarkStyle(requestItem = null, label = "") {
  const requestLabel = (
    label ||
    requestItem?.badgeText ||
    requestItem?.remark ||
    requestItem?.displayType ||
    requestItem?.typeKey ||
    ""
  ).toString().trim();

  // Train Rem remark colour must follow the NOTE text first.
  // Example: RST PM with note "PM Today" should be amber, while
  // RST PM with note "PM Tomorrow" should be blue.
  const noteOverrideColor = getTrainRemNoteOverrideColor(requestLabel);
  const matchedKnownStyle = MAINT_STYLES[requestLabel] || null;
  const fallbackCustomStyle = requestLabel ? getCustomRequestStyle(requestLabel) : null;
  const accent =
    noteOverrideColor ||
    matchedKnownStyle?.badgeBorder ||
    matchedKnownStyle?.badgeBg ||
    getRemovalRemarkFillColor(requestLabel, null) ||
    fallbackCustomStyle?.badgeBorder ||
    fallbackCustomStyle?.badgeBg ||
    requestItem?.badgeBorder ||
    requestItem?.badgeBg ||
    requestItem?.trainColor ||
    "#fbbf24";

  return {
    backgroundColor: hexToRgba(accent, 0.13),
    borderColor: hexToRgba(accent, 0.82),
    color: accent,
    boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.16)}, 0 0 10px ${hexToRgba(accent, 0.18)}, inset 0 1px 0 rgba(255,255,255,0.05)`,
  };
}

// ── PST / Train Prep Components ──────────────────────────────────────────────

const PSTBadge = ({ text, bg, border }) => (
  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap" style={{ backgroundColor: bg, color: "#000", border: `1px solid ${border}` }}>{text}</span>
);

function PSTCell({ block, bi, road, labelSide, isLast, isFirstBlock, isLastBlock, maintenanceMap, pstState, prepState, onPSTTick, onPSTStartTimeChange, onPrepTick, taName, onTaNameChange }) {
  const val = block?.trainId || "";
  const key = normalizeTrainId(val);
  const maintList = key ? maintenanceMap[key] || [] : [];
  const primaryMaint = maintList[0] || null;
  const isWestBottomRightCorner = labelSide === "left" && isLast && isLastBlock;
  const isEastBottomLeftCorner = labelSide === "right" && isLast && isFirstBlock;
  let trainColor = "#e2eaf4";
  if (primaryMaint) { trainColor = primaryMaint.trainColor; }
  const cellKey = `${road}-${bi}`;
  const rawPst = pstState[cellKey];
  const rawPrep = prepState[cellKey];
  const pstMatchesTrain = key && (!rawPst?.trainKey || normalizeTrainId(rawPst.trainKey) === key);
  const prepMatchesTrain = key && (!rawPrep?.trainKey || normalizeTrainId(rawPrep.trainKey) === key);
  const pst = pstMatchesTrain ? rawPst : null;
  const prep = prepMatchesTrain ? rawPrep : null;
  const isPstDone = pst?.done;
  const isPstConfirming = pst?.confirming && !pst?.done;
  const pstEstimateTime = pst?.endTime || "";
  const isPrepStarted = prep?.started;
  const isPrepDone = prep?.done;
  if (isPstDone) { trainColor = "#4ade80"; }
  else if (isPstConfirming) { trainColor = "#facc15"; }
  const displayVal = key ? key.replace(/^T/, "") : "";
  const pstCardBg = isPstDone
    ? "linear-gradient(135deg,#0d2b1e,#082015)"
    : isPstConfirming
    ? "linear-gradient(135deg,#1f2b0d,#082015)"
    : isPrepDone
    ? "linear-gradient(135deg,#0d1f2e,#081525)"
    : isPrepStarted
    ? "linear-gradient(135deg,#1f1c0a,#151205)"
    : key && primaryMaint
    ? `linear-gradient(135deg,${primaryMaint.cellBg},${primaryMaint.cellBg}bb)`
    : key
    ? "linear-gradient(135deg,#0f2d4a,#081e32)"
    : "none";
  const pstCardBorder = isPstDone ? "1px solid #059669" : isPstConfirming ? "1px solid #ca8a04" : isPrepDone ? "1px solid #3b82f6" : isPrepStarted ? "1px solid #ca8a04" : key && primaryMaint ? `1px solid ${primaryMaint.badgeBorder}` : key ? "1px solid #1e4d72" : "1.5px dashed #1b3a55";
  const pstRowLine = isLast ? "1px solid #1a3a56" : "2px solid #1a3a56";
  return (
    <td className="p-1.5 align-top" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: pstRowLine, borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined, borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined }}>
      <div className="relative flex flex-col items-center justify-start gap-1 rounded-xl" style={{ minHeight: pstEstimateTime ? 102 : 90, padding: "7px 5px", background: pstCardBg, border: pstCardBorder, boxShadow: key ? "0 2px 8px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05)" : undefined }}>
        {key && (
          <div className="absolute top-1 right-1.5 opacity-20 pointer-events-none">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={trainColor} strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>
          </div>
        )}
        <div className="w-full text-center font-black leading-none" style={{ fontSize: key ? 15 : 12, color: key ? trainColor : "#2a4a64", letterSpacing: key ? "0.05em" : undefined }}>
          {displayVal || "—"}
        </div>
        {maintList.map((item) => <PSTBadge key={`${item.displayType}-${item.badgeText || ""}`} text={item.badgeText || item.displayType} bg={item.badgeBg} border={item.badgeBorder} />)}
        {key && pstEstimateTime && (
          <span
            className="rounded-full border border-red-500/80 bg-red-950/55 px-1.5 py-0.5 text-[9px] font-normal tracking-wide text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.34)] whitespace-nowrap"
            title={`Estimated PST completed at ${pstEstimateTime} hrs`}
          >
            {pstEstimateTime}
          </span>
        )}
        {key && (
          <div className="flex flex-col gap-1 w-full mt-1">
            {isPstConfirming ? (
              <div className="w-full rounded-lg border border-amber-600/70 bg-amber-950/40 px-1 py-1">
                <div className="mb-1 flex items-center gap-1">
                  <span className="shrink-0 text-[8px] font-black uppercase tracking-wide text-amber-300">Start</span>
                  <div className="flex min-w-0 flex-1 items-center rounded-md border border-amber-500/60 bg-[#071828] px-1 py-0.5 focus-within:border-amber-300">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={pst?.startTime || ""}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        const value = String(pst?.startTime || "");
                        const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
                        if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                          e.preventDefault();
                          onPSTStartTimeChange?.(road, bi, key, value.slice(0, -2));
                        }
                      }}
                      onChange={(e) => onPSTStartTimeChange?.(road, bi, key, cleanMovementCustomTimeInput(e.target.value))}
                      onBlur={(e) => onPSTStartTimeChange?.(road, bi, key, normalizeMovementCustomTimeInput(e.target.value))}
                      placeholder="00:00"
                      className="min-w-0 flex-1 bg-transparent text-center text-[9px] font-black leading-tight text-amber-100 outline-none placeholder:text-amber-700"
                      title="Edit PST start time"
                    />
                  </div>
                </div>
                <div className="mb-1 text-center text-[8px] font-black uppercase tracking-wide text-amber-300">Any alarm?</div>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => onPSTTick(road, bi, key, "no_alarm")} className="rounded-md border border-emerald-600/70 bg-emerald-950/50 px-1 py-0.5 text-[8px] font-black leading-tight text-emerald-300 hover:bg-emerald-900/70">
                    No
                  </button>
                  <button onClick={() => onPSTTick(road, bi, key, "alarm")} className="rounded-md border border-amber-500/80 bg-amber-900/50 px-1 py-0.5 text-[8px] font-black leading-tight text-amber-200 hover:bg-amber-800/70">
                    Alarm
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => onPSTTick(road, bi, key)} className={`w-full text-[9px] font-bold rounded-lg px-1 py-0.5 border transition-all leading-tight ${isPstDone ? "bg-emerald-900/60 border-emerald-600 text-emerald-300" : "bg-[#0a1e2e] border-[#1e4060] text-[#5a7a9a] hover:border-blue-500 hover:text-blue-300"}`}>
                {isPstDone ? "✓ PST" : "PST"}
              </button>
            )}
            {isPrepStarted && !isPrepDone && (
              <input value={taName} onChange={(e) => onTaNameChange(road, bi, e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="TA name" className="w-full text-[11px] rounded-lg border border-yellow-600/60 bg-yellow-950/30 px-1 py-0.5 outline-none text-yellow-200 placeholder:text-yellow-700" />
            )}
            <button onClick={() => onPrepTick(road, bi, key, taName)} className={`w-full text-[9px] font-bold rounded-lg px-1 py-0.5 border transition-all leading-tight ${isPrepDone ? "bg-blue-900/60 border-blue-500 text-blue-200" : isPrepStarted ? "bg-yellow-950/50 border-yellow-600/60 text-yellow-300" : "bg-[#0a1e2e] border-[#1e4060] text-[#5a7a9a] hover:border-indigo-500 hover:text-indigo-300"}`}>
              {isPrepDone ? "✓ Prep" : isPrepStarted ? "⏱ Complete" : "Train Prep"}
            </button>
          </div>
        )}
      </div>
    </td>
  );
}

function PSTStablingSection({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap, pstState, prepState, onPSTTick, onPSTStartTimeChange, onPrepTick, taNameState, onTaNameChange, onClearPST, onClearPrep }) {
  const [confirmClearAction, setConfirmClearAction] = useState(null);
  const hasClearControls = Boolean(onClearPST || onClearPrep);
  const pstClearCount = roads.reduce((count, road) => {
    return count + blockIndices.filter((bi) => {
      const state = pstState?.[`${road}-${bi}`];
      return state?.done || state?.confirming;
    }).length;
  }, 0);
  const prepClearCount = roads.reduce((count, road) => {
    return count + blockIndices.filter((bi) => {
      const state = prepState?.[`${road}-${bi}`];
      return state?.started || state?.done;
    }).length;
  }, 0);

  const handleSectionClear = (action) => {
    const clearHandler = action === "pst" ? onClearPST : onClearPrep;
    if (!clearHandler) return;

    if (confirmClearAction === action) {
      clearHandler();
      setConfirmClearAction(null);
      return;
    }

    setConfirmClearAction(action);
    setTimeout(() => {
      setConfirmClearAction((current) => (current === action ? null : current));
    }, 3000);
  };

  const clearButtonBase = "rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-40";
  const sectionDepotLabel = title?.toUpperCase().includes("EAST") ? "East Depot" : "West Depot";

  return (
    <section className="bg-[#0b1f33] border border-[#2b4f6b] rounded-2xl shadow-md px-5 py-4" style={{ width: "fit-content", maxWidth: "fit-content" }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#10263b] border border-[#2b4f6b] shadow-sm flex items-center justify-center flex-shrink-0">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          </div>
          <h2 className="text-base leading-none font-black text-white tracking-widest uppercase whitespace-nowrap">{title}</h2>
        </div>

        {hasClearControls && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {onClearPST && (
              <button
                type="button"
                onClick={() => handleSectionClear("pst")}
                disabled={pstClearCount === 0}
                className={`${clearButtonBase} ${confirmClearAction === "pst" ? "border-red-500 bg-red-600 text-white" : "border-emerald-500/50 bg-emerald-950/35 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-900/50"}`}
                title={`Clear ${sectionDepotLabel} PST status only`}
              >
                {confirmClearAction === "pst" ? "Confirm PST?" : "Clear PST"}
              </button>
            )}
            {onClearPrep && (
              <button
                type="button"
                onClick={() => handleSectionClear("prep")}
                disabled={prepClearCount === 0}
                className={`${clearButtonBase} ${confirmClearAction === "prep" ? "border-red-500 bg-red-600 text-white" : "border-blue-500/50 bg-blue-950/35 text-blue-300 hover:border-blue-400 hover:bg-blue-900/50"}`}
                title={`Clear ${sectionDepotLabel} Train Prep status only`}
              >
                {confirmClearAction === "prep" ? "Confirm Prep?" : "Clear Train Prep"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl">
        <table className="border-separate border-spacing-0 table-fixed text-xs" style={{ minWidth: 912, maxWidth: 912, width: 912 }}>
          <thead>
            <tr>
              {labelSide === "left" && <th className="w-[72px]" style={{ background: "transparent", border: "none" }} />}
              {blockLabels.map((label, i) => {
                const isLastBlock = i === blockLabels.length - 1;
                return (
                  <th key={label} className="h-8 text-center text-[9px] font-black tracking-widest uppercase" style={{ width: 120, minWidth: 120, maxWidth: 120, background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)", color: "#4a8ab5", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined, borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: "2px solid #1a3a56", borderTopLeftRadius: labelSide === "left" && i === 0 ? 12 : undefined, borderTopRightRadius: labelSide === "right" && isLastBlock ? 12 : undefined }}>
                    {label}
                  </th>
                );
              })}
              {labelSide === "right" && <th className="w-[72px]" style={{ background: "transparent", border: "none" }} />}
            </tr>
          </thead>
          <tbody>
            {roads.map((road, ri) => {
              const rowLine = ri === roads.length - 1 ? "1px solid #1a3a56" : "2px solid #1a3a56";
              const labelCell = (
                <td className="text-center align-middle font-black text-[11px] tracking-tight uppercase" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)", color: "#7eb8e0", borderTop: ri === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", borderBottom: rowLine, borderRight: labelSide === "left" ? "1px solid rgba(126,184,224,0.15)" : "1px solid #1a3a56", borderLeft: labelSide === "right" ? "1px solid rgba(126,184,224,0.15)" : undefined, whiteSpace: "nowrap", width: 72, minWidth: 72, letterSpacing: "0.05em", borderTopLeftRadius: labelSide === "left" && ri === 0 ? 12 : undefined, borderTopRightRadius: labelSide === "right" && ri === 0 ? 12 : undefined, borderBottomLeftRadius: labelSide === "left" && ri === roads.length - 1 ? 12 : undefined, borderBottomRightRadius: labelSide === "right" && ri === roads.length - 1 ? 12 : undefined }}>{road}</td>
              );
              return (
                <tr key={road}>
                  {labelSide === "left" && labelCell}
                  {blockIndices.map((bi, i) => (
                    <PSTCell key={bi} block={data[road]?.[bi]} bi={bi} road={road} labelSide={labelSide} isLast={ri === roads.length - 1} isFirstBlock={i === 0} isLastBlock={i === blockIndices.length - 1} maintenanceMap={maintenanceMap} pstState={pstState} prepState={prepState} onPSTTick={onPSTTick} onPSTStartTimeChange={onPSTStartTimeChange} onPrepTick={onPrepTick} taName={taNameState[`${road}-${bi}`] || ""} onTaNameChange={onTaNameChange} />
                  ))}
                  {labelSide === "right" && labelCell}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatTrainList(trainKeys) {
  if (trainKeys.length === 0) return "";
  if (trainKeys.length === 1) return trainKeys[0];
  return trainKeys.slice(0, -1).join(", ") + " and " + trainKeys[trainKeys.length - 1];
}

function getPSTLogTimeMinutes(entry = {}) {
  const rawTime = (entry.startTime || entry.time || "").toString().trim();
  const textTime = (entry.text || "").toString().match(/(\d{1,2}):(\d{2})\s*hrs/i);
  const source = rawTime || (textTime ? `${textTime[1]}:${textTime[2]}` : "");
  const match = source.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return Number.POSITIVE_INFINITY;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.POSITIVE_INFINITY;

  return hours * 60 + minutes;
}

function sortPSTLogLinesByTime(logLines = []) {
  return [...(Array.isArray(logLines) ? logLines : [])].sort((a, b) => {
    const timeDiff = getPSTLogTimeMinutes(a) - getPSTLogTimeMinutes(b);
    if (timeDiff !== 0) return timeDiff;

    const typeDiff = (a?.type || "").localeCompare(b?.type || "");
    if (typeDiff !== 0) return typeDiff;

    return (a?.trainKey || a?.key || "").localeCompare(b?.trainKey || b?.key || "", undefined, { numeric: true, sensitivity: "base" });
  });
}

function getInsertionLogTimeMinutes(entry = {}) {
  const rawTime = (entry.time || entry.startTime || "").toString().trim();
  const textTime = (entry.text || "").toString().match(/(\d{1,2}):(\d{2})\s*hrs/i);
  const source = rawTime || (textTime ? `${textTime[1]}:${textTime[2]}` : "");
  const match = source.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return Number.POSITIVE_INFINITY;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.POSITIVE_INFINITY;

  return hours * 60 + minutes;
}

function sortInsertionLogByTime(logLines = []) {
  return [...(Array.isArray(logLines) ? logLines : [])].sort((a, b) => {
    const timeDiff = getInsertionLogTimeMinutes(a) - getInsertionLogTimeMinutes(b);
    if (timeDiff !== 0) return timeDiff;

    const depotDiff = (a?.depot || "").localeCompare(b?.depot || "");
    if (depotDiff !== 0) return depotDiff;

    return (a?.trainKey || a?.key || "").localeCompare(b?.trainKey || b?.key || "", undefined, { numeric: true, sensitivity: "base" });
  });
}

// ── Insertion Tab Components ─────────────────────────────────────────────────

// Special insertion remark colours for the live insertion TID/remark pill.
// 3K1 = teal, SW/2W = purple, matching the insertion design reference.
// Numeric TID colours below apply on Sunday–Thursday only.
// Friday and Saturday keep the normal yellow in-app TID remark colour.
const INSERTION_REMARK_STYLES = {
  "3K1": {
    bg: "rgba(13, 148, 136, 0.28)",
    border: "#14d8bd",
    color: "#d7fff8",
    shadow: "0 0 10px rgba(20, 216, 189, 0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  SW: {
    bg: "rgba(88, 28, 135, 0.58)",
    border: "#a855f7",
    color: "#f6e8ff",
    shadow: "0 0 10px rgba(168, 85, 247, 0.36), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  "2W": {
    bg: "rgba(88, 28, 135, 0.58)",
    border: "#a855f7",
    color: "#f6e8ff",
    shadow: "0 0 10px rgba(168, 85, 247, 0.36), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
};

const INSERTION_TID_REMARK_NO_CHANGE = new Set([
  201, 203, 205, 213, 215, 217, 219,
  101, 103, 105, 107, 109, 111, 113, 115, 117, 119,
]);

const INSERTION_TID_REMARK_GREEN = new Set([
  212, 214, 216, 218, 220,
  102, 104, 106, 108, 110,
]);

const INSERTION_TID_REMARK_RED = new Set([
  112, 114, 116, 118, 120,
  202, 204, 206, 208, 210,
]);

const INSERTION_TID_REMARK_GRAY = new Set([211, 209, 207]);

const INSERTION_TID_REMARK_COLOR_STYLES = {
  green: {
    bg: "rgba(22, 163, 74, 0.30)",
    border: "#22c55e",
    color: "#dcfce7",
    shadow: "0 0 10px rgba(34, 197, 94, 0.36), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  red: {
    bg: "rgba(185, 28, 28, 0.36)",
    border: "#ef4444",
    color: "#fee2e2",
    shadow: "0 0 10px rgba(239, 68, 68, 0.38), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  gray: {
    bg: "rgba(75, 85, 99, 0.42)",
    border: "#9ca3af",
    color: "#f3f4f6",
    shadow: "0 0 10px rgba(156, 163, 175, 0.28), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
};

function isFridayOrSaturday(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  return day === 5 || day === 6;
}

function getInsertionTidRemarkNumber(value) {
  const key = (value || "").toString().trim().toUpperCase();
  const match = key.match(/^(?:TID\s*)?T?(\d{1,3})$/);
  return match ? Number(match[1]) : null;
}

function getInsertionRemarkStyle(value) {
  const key = (value || "").toString().trim().toUpperCase();

  // Keep 3K1 / SW / 2W colours active every day.
  if (INSERTION_REMARK_STYLES[key]) return INSERTION_REMARK_STYLES[key];

  // TID number colours are in-app only and must not affect Friday/Saturday.
  if (isFridayOrSaturday()) return null;

  const tid = getInsertionTidRemarkNumber(key);
  if (tid === null) return null;

  // Yellow/no-change TIDs must stay normal yellow even when repeated
  // inside the green or red lists. Then gray overrides red, and red overrides green.
  if (INSERTION_TID_REMARK_NO_CHANGE.has(tid)) return null;
  if (INSERTION_TID_REMARK_GRAY.has(tid)) return INSERTION_TID_REMARK_COLOR_STYLES.gray;
  if (INSERTION_TID_REMARK_RED.has(tid)) return INSERTION_TID_REMARK_COLOR_STYLES.red;
  if (INSERTION_TID_REMARK_GREEN.has(tid)) return INSERTION_TID_REMARK_COLOR_STYLES.green;

  return null;
}

function parseHHMM(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function addMinutesToHHMM(timeStr, mins = 0) {
  const parsed = parseHHMM(timeStr);
  if (parsed === null) return timeStr;
  const total = (parsed + mins + 1440) % 1440;
  const hours = Math.floor(total / 60).toString().padStart(2, "0");
  const minutes = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isTimePast(timeStr) {
  if (!timeStr) return false;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const entryMins = parseHHMM(timeStr);
  if (entryMins === null) return false;
  return nowMins > entryMins;
}

// Returns true only while current time is within the TID schedule range.
// Grey-out should only apply during this window; once the last TID time
// has passed, all rows return to normal styling.
function isWithinTIDSchedule(firstTidTime, lastTidTime) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const firstMins = parseHHMM(firstTidTime);
  const lastMins = parseHHMM(lastTidTime);
  if (firstMins === null || lastMins === null) return false;
  return nowMins >= firstMins && nowMins <= lastMins;
}

function getSweepingSignal(road, sweepTrack) {
  const track = (sweepTrack || "").toString().trim().toUpperCase();
  if (EAST_ROADS.includes(road)) return track === "TK2" ? "S2208" : "S2207";
  return track === "TK2" ? "S102" : "S101";
}

function getSweepingClearTime(startTime, road, sweepTrack) {
  const track = (sweepTrack || "").toString().trim().toUpperCase();
  if (EAST_ROADS.includes(road) && track === "TK2") return addMinutesToHHMM(startTime, 2);
  return startTime;
}

function InsertionCell({ block, bi, road, labelSide, isLast, isFirstBlock, isLastBlock, maintenanceMap, insertionLog, onInsertionTick, tidInput, onTidChange, onTidKeyDown, tidInputRef, hideElapsedTid }) {
  const val = block?.trainId || "";
  const key = normalizeTrainId(val);
  const maintList = key ? maintenanceMap[key] || [] : [];
  const primaryMaint = maintList[0] || null;
  const isWestBottomRightCorner = labelSide === "left" && isLast && isLastBlock;
  const isEastBottomLeftCorner = labelSide === "right" && isLast && isFirstBlock;
  const cellKey = `${road}-${bi}`;
  const inserted = insertionLog.find((l) => l.key === `ins-${cellKey}`);
  const insertedRemarkLabel = inserted?.tid
    ? `TID ${inserted.tid}`
    : inserted?.remark
    ? `${inserted.remark}${inserted.sweepTrack ? ` ${inserted.sweepTrack}` : ""}`
    : "";
  const tidRemarkText = (tidInput || "").toString().trim().toUpperCase();
  const [showSweepChoice, setShowSweepChoice] = useState(false);
  const hasTidRemark = key && !inserted && tidRemarkText !== "";
  const specialTidRemarkStyle = hasTidRemark ? getInsertionRemarkStyle(tidRemarkText) : null;

  useEffect(() => {
    if (tidRemarkText !== "SW" || inserted) setShowSweepChoice(false);
  }, [tidRemarkText, inserted]);

  const handleInsertClick = () => {
    if (tidRemarkText === "SW") {
      setShowSweepChoice(true);
      return;
    }

    setShowSweepChoice(false);
    onInsertionTick(road, bi, key, tidInput);
  };

  const handleSweepChoice = (sweepTrack) => {
    setShowSweepChoice(false);
    onInsertionTick(road, bi, key, tidInput, sweepTrack);
  };

  // Elapsed inserted trains are hidden only after user clicks "Hide elapsed TID".
  const expired = Boolean(hideElapsedTid && inserted && isTimePast(inserted.time));

  let trainColor = "#e2eaf4";
  if (expired) { trainColor = "#3a5068"; }
  else if (inserted) { trainColor = "#4ade80"; }
  else if (hasTidRemark) { trainColor = "#facc15"; }
  else if (primaryMaint) { trainColor = primaryMaint.trainColor; }

  const displayVal = key ? key.replace(/^T/, "") : "";

  const insCardBg = expired ? "linear-gradient(135deg,#071218,#050d14)" : inserted ? "linear-gradient(135deg,#0d2b1e,#082015)" : hasTidRemark ? "linear-gradient(135deg,#1f1c0a,#151205)" : key && primaryMaint ? `linear-gradient(135deg,${primaryMaint.cellBg},${primaryMaint.cellBg}bb)` : key ? "linear-gradient(135deg,#0f2d4a,#081e32)" : "none";
  const insCardBorder = expired ? "1px solid #1a3040" : inserted ? "1px solid #059669" : hasTidRemark ? "1px solid #ca8a04" : key && primaryMaint ? `1px solid ${primaryMaint.badgeBorder}` : key ? "1px solid #1e4d72" : "1.5px dashed #1b3a55";
  const insTidInputStyle = {
    border: specialTidRemarkStyle ? `1px solid ${specialTidRemarkStyle.border}` : hasTidRemark ? "1px solid #ca8a04" : "1px solid #1e4060",
    backgroundColor: specialTidRemarkStyle ? specialTidRemarkStyle.bg : hasTidRemark ? "#1f1c0a" : "#091828",
    color: specialTidRemarkStyle ? specialTidRemarkStyle.color : hasTidRemark ? "#fde68a" : "#c8d8ea",
    boxShadow: specialTidRemarkStyle ? specialTidRemarkStyle.shadow : undefined,
  };
  const insRowLine = isLast ? "1px solid #2b4f6b" : "2px solid #2b4f6b";

  if (expired) {
    return (
      <td className="p-1.5 align-top" title="Elapsed TID hidden manually" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: insRowLine, borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined, borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined }}>
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl select-none" style={{ minHeight: 90, padding: "7px 5px", background: insCardBg, border: insCardBorder, opacity: 0.55 }}>
          <div className="w-full text-center font-black leading-none" style={{ fontSize: 14, color: "#3a5068" }}>{displayVal || "—"}</div>
          {insertedRemarkLabel && <span className="text-[10px] font-semibold" style={{ color: "#3a5068" }}>{insertedRemarkLabel}</span>}
          <span className="text-[9px] font-semibold" style={{ color: "#3a5068" }}>✓ {inserted.time}</span>
          <span className="text-[8px] tracking-wide uppercase" style={{ color: "#1e3a52" }}>elapsed hidden</span>
        </div>
      </td>
    );
  }

  return (
    <td className="p-1.5 align-top" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: insRowLine, borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined, borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined }}>
      <div className="relative flex flex-col items-center justify-start gap-1 rounded-xl" style={{ minHeight: showSweepChoice ? 118 : 90, padding: "7px 5px", background: insCardBg, border: insCardBorder, boxShadow: key ? "0 2px 8px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05)" : undefined }}>
        {key && !inserted && (
          <div className="absolute top-1 right-1.5 opacity-20 pointer-events-none">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={trainColor} strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>
          </div>
        )}
        <div className="w-full text-center font-black leading-none" style={{ fontSize: key ? 15 : 12, color: key ? trainColor : "#2a4a64", letterSpacing: key ? "0.05em" : undefined }}>{displayVal || "—"}</div>
        {maintList.map((item) => (<span key={`${item.displayType}-${item.badgeText || ""}`} className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap" style={{ backgroundColor: item.badgeBg, color: "#000", border: `1px solid ${item.badgeBorder}` }} title={item.badgeText || item.displayType}>{item.badgeText || item.displayType}</span>))}
        {key && !inserted && (<input ref={tidInputRef} type="text" value={tidInput} onChange={(e) => onTidChange(road, bi, e.target.value)} onKeyDown={onTidKeyDown} placeholder="TID" className="w-full h-6 px-1 text-center text-[12px] font-semibold rounded-lg outline-none placeholder:text-[#2b4f6b]" style={insTidInputStyle} />)}
        {key && inserted && insertedRemarkLabel && (<span className="text-[12px] font-bold text-emerald-400">{insertedRemarkLabel}</span>)}
        {key && !inserted && showSweepChoice && (
          <div className="w-full rounded-lg border border-purple-500/70 bg-purple-950/40 px-1 py-1 shadow-[0_0_12px_rgba(168,85,247,0.24)]">
            <div className="mb-1 text-center text-[8px] font-black uppercase tracking-wide text-purple-200">Choose SW track</div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => handleSweepChoice("TK1")}
                className="rounded-md border border-sky-500/75 bg-sky-950/50 px-1 py-0.5 text-[9px] font-black leading-tight text-sky-200 hover:bg-sky-900/70"
              >
                TK1
              </button>
              <button
                type="button"
                onClick={() => handleSweepChoice("TK2")}
                className="rounded-md border border-fuchsia-500/75 bg-fuchsia-950/50 px-1 py-0.5 text-[9px] font-black leading-tight text-fuchsia-200 hover:bg-fuchsia-900/70"
              >
                TK2
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowSweepChoice(false)}
              className="mt-1 w-full rounded-md border border-slate-500/50 bg-slate-950/35 px-1 py-0.5 text-[8px] font-bold text-slate-300 hover:bg-slate-900/60"
            >
              Cancel
            </button>
          </div>
        )}
        {key && !inserted && !showSweepChoice && (<button onClick={handleInsertClick} className={`w-full text-[12px] font-bold rounded-lg px-1 py-0.5 border transition-all ${hasTidRemark ? "bg-yellow-950/50 border-yellow-600/60 text-yellow-300 hover:bg-emerald-900/40 hover:border-emerald-600 hover:text-emerald-300" : "bg-[#0a1e2e] border-[#1e4060] text-[#5a7a9a] hover:bg-emerald-900/40 hover:border-emerald-600 hover:text-emerald-300"}`}>Insert</button>)}
        {key && inserted && (<button onClick={() => onInsertionTick(road, bi, key, tidInput)} className="w-full text-[12px] font-bold rounded-lg px-1 py-0.5 border transition-all bg-emerald-900/50 border-emerald-600 text-emerald-300 hover:bg-red-950/40 hover:border-red-700 hover:text-red-400" title="Click to undo">✓ {inserted.time}</button>)}
      </div>
    </td>
  );
}

function InsertionStablingSection({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap, insertionLog, onInsertionTick, tidInputs, onTidChange, onClearInsertedTidRemarks, onClearInsertedTrains, getTidScheduledTime }) {
  const [hideFiltered, setHideFiltered] = useState(false);
  const [hideElapsedTid, setHideElapsedTid] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const HIDE_REMARKS = ["3K1", "SW", "2W"];

  const handleDownloadPng = async () => {
    if (downloadingPng) return;
    setDownloadingPng(true);

    try {
      await downloadInsertionPicturePng({
        title,
        blockLabels,
        blockIndices,
        roads,
        data,
        labelSide,
        insertionLog,
        tidInputs,
        getTidScheduledTime,
      });
    } catch (error) {
      console.error("Insertion PNG export failed:", error);
      alert("Unable to create insertion PNG export. Please try again.");
    } finally {
      setDownloadingPng(false);
    }
  };

  // ── Keyboard navigation refs ─────────────────────────────────────────────
  // Key: "roadIndex-visualColIndex", value: input element
  const tidRefs = useRef({});

  const focusInsertionTid = useCallback((roadIdx, colIdx) => {
    const el = tidRefs.current[`${roadIdx}-${colIdx}`];
    if (el) { el.focus(); el.select(); }
  }, []);

  const handleTidKeyDown = useCallback((e, roadIdx, colIdx) => {
    const totalRows = roads.length;
    const totalCols = blockIndices.length;

    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      if (roadIdx < totalRows - 1) focusInsertionTid(roadIdx + 1, colIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (roadIdx > 0) focusInsertionTid(roadIdx - 1, colIdx);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (colIdx < totalCols - 1) focusInsertionTid(roadIdx, colIdx + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (colIdx > 0) focusInsertionTid(roadIdx, colIdx - 1);
    }
  }, [roads.length, blockIndices.length, focusInsertionTid]);

  const handleTidChange = (road, bi, value) => {
    onTidChange(road, bi, value);
  };
  // Count elapsed inserted TIDs for the manual Hide elapsed TID button.
  const elapsedTidCount = roads.reduce((acc, road) => {
    return acc + blockIndices.filter((bi) => {
      const cellKey = `${road}-${bi}`;
      const entry = insertionLog.find((l) => l.key === `ins-${cellKey}`);
      return entry && isTimePast(entry.time);
    }).length;
  }, 0);
  const hasLiveTidRemarks = roads.some((road) =>
    blockIndices.some((bi) => (tidInputs[`${road}-${bi}`] || "").trim() !== "")
  );
  const hasInsertedTidRemarks = roads.some((road) =>
    blockIndices.some((bi) => {
      const entry = insertionLog.find((l) => l.key === `ins-${road}-${bi}`);
      if (!entry) return false;
      return entry.tid !== null && entry.tid !== undefined || (entry.remark || "").toString().trim() !== "";
    })
  );
  const hasTidRemarks = hasLiveTidRemarks || hasInsertedTidRemarks;
  const hasInsertedTrains = roads.some((road) =>
    blockIndices.some((bi) => insertionLog.some((l) => l.key === `ins-${road}-${bi}`))
  );
  const handleClearTidRemarks = () => {
    roads.forEach((road) => {
      blockIndices.forEach((bi) => {
        if ((tidInputs[`${road}-${bi}`] || "").trim() !== "") {
          onTidChange(road, bi, "");
        }
      });
    });

    onClearInsertedTidRemarks?.(roads, blockIndices);
  };
  const handleClearInsertedTrains = () => {
    roads.forEach((road) => {
      blockIndices.forEach((bi) => {
        if ((tidInputs[`${road}-${bi}`] || "").trim() !== "") {
          onTidChange(road, bi, "");
        }
      });
    });

    onClearInsertedTrains?.(roads, blockIndices);
    setHideElapsedTid(false);
  };
  const isFiltered = (block, road, bi) => {
    // Check live TID input typed by user
    const typed = (tidInputs[`${road}-${bi}`] || "").trim().toUpperCase();
    if (HIDE_REMARKS.some((r) => typed === r)) return true;
    // Check remark stored on the insertion log entry for this cell
    const logEntry = insertionLog.find((l) => l.key === `ins-${road}-${bi}`);
    const logRemark = (logEntry?.remark || "").trim().toUpperCase();
    if (HIDE_REMARKS.some((r) => logRemark === r)) return true;
    // Check stabling extraRemark
    const extraRemark = (block?.extraRemark || "").trim().toUpperCase();
    if (HIDE_REMARKS.some((r) => extraRemark === r)) return true;
    return false;
  };
  return (
    <section className="bg-[#0b1f33] border border-[#2b4f6b] rounded-2xl shadow-md px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm leading-none font-black text-white tracking-widest uppercase">{title}</h2>
        <button
          onClick={handleDownloadPng}
          disabled={downloadingPng}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all bg-[#1f1246] border-[#a855f7] text-[#f0d9ff] shadow-[0_0_14px_rgba(168,85,247,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[#321968] hover:border-[#c084fc] hover:text-white hover:shadow-[0_0_22px_rgba(168,85,247,0.8),inset_0_1px_0_rgba(255,255,255,0.16)] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#1f1246] disabled:hover:border-[#a855f7] disabled:hover:text-[#f0d9ff]"
          title="Download PNG picture with insertion TID, timing and 3K1/SW pills"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {downloadingPng ? "Preparing..." : "Download PNG"}
        </button>
        <button
          onClick={() => setHideFiltered((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
            hideFiltered
              ? "bg-[#0c3a5a] border-[#38bdf8] text-white shadow-[0_0_16px_rgba(56,189,248,0.65),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[#0f4b73] hover:shadow-[0_0_22px_rgba(56,189,248,0.85),inset_0_1px_0_rgba(255,255,255,0.16)]"
              : "bg-[#09233a] border-[#38bdf8] text-[#bae6fd] shadow-[0_0_14px_rgba(56,189,248,0.50),inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-[#0f3a5c] hover:border-[#7dd3fc] hover:text-white hover:shadow-[0_0_22px_rgba(56,189,248,0.78),inset_0_1px_0_rgba(255,255,255,0.16)]"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {hideFiltered
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
          </svg>
          {hideFiltered ? "Show 3K1 / SW" : "Hide 3K1 / SW"}
        </button>
        <button
          onClick={handleClearTidRemarks}
          disabled={!hasTidRemarks}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all bg-[#3b0b12] border-[#ef4444] text-[#fecaca] shadow-[0_0_14px_rgba(239,68,68,0.50),inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-[#5a111b] hover:border-[#f87171] hover:text-white hover:shadow-[0_0_22px_rgba(239,68,68,0.78),inset_0_1px_0_rgba(255,255,255,0.16)] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#3b0b12] disabled:hover:border-[#ef4444] disabled:hover:text-[#fecaca]"
          title="Clear TID / remark inputs for this depot"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
          </svg>
          Clear TID Remark
        </button>
        <button
          onClick={handleClearInsertedTrains}
          disabled={!hasInsertedTrains}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all bg-[#3b0b12] border-[#ef4444] text-[#fecaca] shadow-[0_0_14px_rgba(239,68,68,0.50),inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-[#5a111b] hover:border-[#f87171] hover:text-white hover:shadow-[0_0_22px_rgba(239,68,68,0.78),inset_0_1px_0_rgba(255,255,255,0.16)] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#3b0b12] disabled:hover:border-[#ef4444] disabled:hover:text-[#fecaca]"
          title="Clear inserted status and insertion log for this depot"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
          </svg>
          Clear Inserted Train
        </button>
        <button
          onClick={() => setHideElapsedTid((v) => !v)}
          disabled={elapsedTidCount === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
            hideElapsedTid
              ? "bg-[#0c3a5a] border-[#38bdf8] text-white shadow-[0_0_16px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[#0f4b73] hover:border-[#7dd3fc]"
              : "bg-[#3a2609] border-[#f59e0b] text-[#fde68a] shadow-[0_0_14px_rgba(245,158,11,0.48),inset_0_1px_0_rgba(255,255,255,0.10)] hover:bg-[#5a3a0b] hover:border-[#fbbf24] hover:text-white hover:shadow-[0_0_22px_rgba(245,158,11,0.75),inset_0_1px_0_rgba(255,255,255,0.16)]"
          } disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#3a2609] disabled:hover:border-[#f59e0b] disabled:hover:text-[#fde68a]`}
          title="Manually hide inserted TIDs where the scheduled time has elapsed"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {hideElapsedTid
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
          </svg>
          {hideElapsedTid ? `Show elapsed TID (${elapsedTidCount})` : `Hide elapsed TID (${elapsedTidCount})`}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl">
        <table className="border-separate border-spacing-0 w-full table-fixed text-xs">
          <thead>
            <tr>
              {labelSide === "left" && <th className="w-[72px]" style={{ background: "transparent", border: "none" }} />}
              {blockLabels.map((label, i) => {
                const isLastBlock = i === blockLabels.length - 1;
                return (
                  <th key={label} className="h-8 text-center text-[9px] font-black tracking-widest uppercase" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)", color: "#4a8ab5", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined, borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: "2px solid #1a3a56", borderTopLeftRadius: labelSide === "left" && i === 0 ? 12 : undefined, borderTopRightRadius: labelSide === "right" && isLastBlock ? 12 : undefined }}>
                    {label}
                  </th>
                );
              })}
              {labelSide === "right" && <th className="w-[72px]" style={{ background: "transparent", border: "none" }} />}
            </tr>
          </thead>
          <tbody>
            {roads.map((road, ri) => {
              const rowLine = ri === roads.length - 1 ? "1px solid #1a3a56" : "2px solid #1a3a56";
              const insertionRoadPill = INSERTION_ROAD_PILLS[road];
              const labelCell = (
                <td className="text-center align-middle font-black text-[11px] tracking-tight uppercase" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)", color: "#7eb8e0", borderTop: ri === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", borderBottom: rowLine, borderRight: labelSide === "left" ? "1px solid rgba(126,184,224,0.15)" : "1px solid #1a3a56", borderLeft: labelSide === "right" ? "1px solid rgba(126,184,224,0.15)" : undefined, whiteSpace: "nowrap", width: 72, minWidth: 72, letterSpacing: "0.05em", borderTopLeftRadius: labelSide === "left" && ri === 0 ? 12 : undefined, borderTopRightRadius: labelSide === "right" && ri === 0 ? 12 : undefined, borderBottomLeftRadius: labelSide === "left" && ri === roads.length - 1 ? 12 : undefined, borderBottomRightRadius: labelSide === "right" && ri === roads.length - 1 ? 12 : undefined }}>
                  <div className="flex flex-col items-center justify-center gap-1 leading-none">
                    <span>{road}</span>
                    {insertionRoadPill && (
                      <span className="rounded-full border-2 border-amber-400/95 bg-transparent px-2.5 py-0.5 text-[9px] font-black leading-none text-amber-300 shadow-[0_0_9px_rgba(245,158,11,0.45)]">
                        {insertionRoadPill}
                      </span>
                    )}
                  </div>
                </td>
              );
              return (
                <tr key={road}>
                  {labelSide === "left" && labelCell}
                  {blockIndices.map((bi, i) => {
                    const block = data[road]?.[bi];
                    const isLastBlock = i === blockIndices.length - 1;
                    const isLastRow = ri === roads.length - 1;
                    const borderBottom = isLastRow ? "1px solid #2b4f6b" : "2px solid #2b4f6b";
                    const borderBottomRightRadius = labelSide === "left" && isLastRow && isLastBlock ? 12 : undefined;
                    const borderBottomLeftRadius = labelSide === "right" && isLastRow && i === 0 ? 12 : undefined;
                    if (hideFiltered && isFiltered(block, road, bi)) {
                      return (
                        <td key={bi} className="p-1.5 align-top" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom, borderBottomRightRadius, borderBottomLeftRadius }}>
                          <div className="flex items-center justify-center rounded-xl" style={{ minHeight: 90, border: "1.5px dashed #1a3050" }}>
                            <span className="text-[9px] font-black text-[#2a4464] tracking-widest uppercase">{(block?.extraRemark || "").trim()}</span>
                          </div>
                        </td>
                      );
                    }
                    return <InsertionCell key={bi} block={block} bi={bi} road={road} labelSide={labelSide} isLast={isLastRow} isFirstBlock={i === 0} isLastBlock={isLastBlock} maintenanceMap={maintenanceMap} insertionLog={insertionLog} onInsertionTick={onInsertionTick} tidInput={tidInputs[`${road}-${bi}`] || ""} onTidChange={handleTidChange} onTidKeyDown={(e) => handleTidKeyDown(e, ri, i)} tidInputRef={(el) => { tidRefs.current[`${ri}-${i}`] = el; }} hideElapsedTid={hideElapsedTid} />;
                  })}
                  {labelSide === "right" && labelCell}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}




function TrainRemPanel({ maintenanceMap = {}, onTrainRemStateChange }) {
  const [trainRemState, setTrainRemState] = useState(() => loadTrainRemState());
  const [trainRemLoaded, setTrainRemLoaded] = useState(false);
  const [trainRemSyncing, setTrainRemSyncing] = useState(false);
  const [trainRemLastSynced, setTrainRemLastSynced] = useState(null);
  const [trainRemSyncError, setTrainRemSyncError] = useState(false);
  const [trainRemDbReady, setTrainRemDbReady] = useState(() => isTrainRemEntityReady());
  const [trainRemDebug, setTrainRemDebug] = useState("");
  const [trainRemFocusedTrainIdCell, setTrainRemFocusedTrainIdCell] = useState(null);
  const [trainRemPdfStatus, setTrainRemPdfStatus] = useState({ west: false, east: false });
  const [trainRemUndoCount, setTrainRemUndoCount] = useState(0);
  const [fullMlTidAutoClearEndsAt, setFullMlTidAutoClearEndsAt] = useState(null);
  const [fullMlTidCountdownSeconds, setFullMlTidCountdownSeconds] = useState(0);

  const trainRemStateRef = useRef(trainRemState);

  useEffect(() => {
    trainRemStateRef.current = trainRemState;
    onTrainRemStateChange?.(trainRemState);
  }, [trainRemState, onTrainRemStateChange]);

  const trainRemMapRef = useRef({});
  const trainRemAutoSaveTimerRef = useRef(null);
  const trainRemEditEndTimerRef = useRef(null);
  const trainRemSavingRef = useRef(false);
  const trainRemPendingSaveRef = useRef(false);
  const trainRemEditingRef = useRef(false);
  const trainRemPollingRef = useRef(false);
  const trainRemTrainIdRefs = useRef({});
  const fullMlTidTrainIdRefs = useRef({});
  const fullMlTidAutoClearTimerRef = useRef(null);
  const fullMlTidAutoClearSignatureRef = useRef("");
  const trainRemUndoStackRef = useRef([]);
  const trainRemSmartDirectionRef = useRef({});
  const trainRemLastFocusedIndexRef = useRef({});
  const trainRemFocusedTrainIdCellRef = useRef(null);

  useEffect(() => {
    const entity = getTrainRemEntity();
    const entityReady = isTrainRemEntityReady(entity);

    console.log("[TrainRem debug] base44.entities keys:", Object.keys(base44?.entities || {}));
    console.log("[TrainRem debug] base44.entities.TrainRem:", entity);
    console.log("[TrainRem debug] TrainRem ready:", entityReady);

    if (!entityReady) {
      setTrainRemDebug(
        "TrainRem entity is not available in base44.entities yet. Commit TrainRem.jsonc, redeploy/sync Base44, then hard refresh."
      );
    }
  }, []);

  const getTimingForTid = (depot, presetLabel, tid) => {
    const cleanTid = (tid || "").toString().trim();
    if (!cleanTid) return "";
    return TID_TIME_MAP?.[depot]?.[presetLabel]?.[cleanTid] || "";
  };

  const getRequestRemarkForTrain = useCallback((trainId) => {
    const trainKey = normalizeTrainId(trainId);
    if (!trainKey) return "";

    const maintList = maintenanceMap?.[trainKey] || [];
    if (!maintList.length) return "";

    return maintList
      .map((item) => item.badgeText || item.remark || item.displayType || item.typeKey || "")
      .filter(Boolean)
      .join(", ");
  }, [maintenanceMap]);

  const isKnownRequestRemark = useCallback((remark) => {
    const cleanRemark = normalizeRemarkText(remark);
    if (!cleanRemark) return false;

    if (isDefaultAutoRequestRemarkText(cleanRemark)) return true;

    return Object.values(maintenanceMap || {}).some((maintList) =>
      (maintList || []).some((item) => {
        const requestText = item.badgeText || item.remark || item.displayType || item.typeKey || "";
        return normalizeRemarkText(requestText) === cleanRemark;
      })
    );
  }, [maintenanceMap]);

  const refreshTrainRemFromDb = useCallback(async ({ showStatus = false } = {}) => {
    const entity = getTrainRemEntity();

    if (!isTrainRemEntityReady(entity)) {
      const message =
        "TrainRem entity is missing/not ready. base44.entities.TrainRem is undefined or missing list/create/update.";
      console.warn("[TrainRem debug]", message, {
        entity,
        availableEntities: Object.keys(base44?.entities || {}),
      });
      setTrainRemDebug(message);
      setTrainRemDbReady(false);
      setTrainRemLoaded(true);
      return;
    }

    if (
      trainRemEditingRef.current ||
      trainRemSavingRef.current ||
      trainRemPendingSaveRef.current ||
      trainRemPollingRef.current
    ) {
      return;
    }

    trainRemPollingRef.current = true;
    if (showStatus) setTrainRemSyncing(true);

    try {
      const records = await entity.list();

      if (!records || records.length === 0) {
        const state = loadTrainRemState();
        const map = {};

        for (const depot of ["west", "east"]) {
          const created = await entity.create({
            depot,
            selectedPreset: state.selectedPreset?.[depot] || "9am",
            rows: normalizeTrainRemRows(state.rows?.[depot], depot),
            fullMlTidRows: normalizeFullMlTidRows(state.fullMlTidRows),
          });
          if (created?.id) map[depot] = created.id;
        }

        trainRemMapRef.current = map;
        setTrainRemState(state);
        saveTrainRemState(state);
        setTrainRemLastSynced(new Date());
        setTrainRemSyncError(false);
        setTrainRemDbReady(true);
        setTrainRemLoaded(true);
        return;
      }

      const { state, map } = buildTrainRemStateFromRecords(records || []);
      const dbAutoClearMeta = normalizeFullMlTidAutoClearMeta(state.fullMlTidAutoClear);
      const localAutoClearMeta = normalizeFullMlTidAutoClearMeta(trainRemStateRef.current.fullMlTidAutoClear);
      if (!dbAutoClearMeta.signature && localAutoClearMeta.signature && localAutoClearMeta.endsAt) {
        state.fullMlTidAutoClear = localAutoClearMeta;
      }

      trainRemMapRef.current = map;
      setTrainRemState(state);
      saveTrainRemState(state);
      setTrainRemLastSynced(new Date());
      setTrainRemSyncError(false);
      setTrainRemDebug("");
      setTrainRemDbReady(true);
      setTrainRemLoaded(true);
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || String(err);
      console.error("Train Rem live sync failed:", err);
      setTrainRemDebug(`Live sync failed: ${message}`);
      setTrainRemSyncError(true);
      setTrainRemLoaded(true);
    } finally {
      trainRemPollingRef.current = false;
      if (showStatus) setTrainRemSyncing(false);
    }
  }, []);

  const saveTrainRemToDb = useCallback(async (state) => {
    const entity = getTrainRemEntity();

    saveTrainRemState(state);

    if (!isTrainRemEntityReady(entity)) {
      const message =
        "Cannot save: TrainRem entity is missing/not ready. Check TrainRem.jsonc commit/deploy.";
      console.warn("[TrainRem debug]", message, {
        entity,
        availableEntities: Object.keys(base44?.entities || {}),
      });
      setTrainRemDebug(message);
      setTrainRemDbReady(false);
      setTrainRemSyncError(true);
      trainRemPendingSaveRef.current = false;
      return;
    }

    trainRemSavingRef.current = true;
    setTrainRemSyncing(true);

    try {
      for (const depot of ["west", "east"]) {
        const payload = {
          depot,
          selectedPreset: state.selectedPreset?.[depot] || "9am",
          rows: normalizeTrainRemRows(state.rows?.[depot], depot),
          fullMlTidRows: normalizeFullMlTidRows(state.fullMlTidRows),
          fullMlTidAutoClear: normalizeFullMlTidAutoClearMeta(state.fullMlTidAutoClear),
          fullMlTidAutoClearSignature: normalizeFullMlTidAutoClearMeta(state.fullMlTidAutoClear).signature,
          fullMlTidAutoClearEndsAt: normalizeFullMlTidAutoClearMeta(state.fullMlTidAutoClear).endsAt || null,
        };

        if (trainRemMapRef.current[depot]) {
          await entity.update(trainRemMapRef.current[depot], payload);
        } else {
          const created = await entity.create(payload);
          if (created?.id) trainRemMapRef.current[depot] = created.id;
        }
      }

      setTrainRemLastSynced(new Date());
      setTrainRemSyncError(false);
      setTrainRemDebug("");
      setTrainRemDbReady(true);
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || String(err);
      console.error("Train Rem save failed:", err);
      setTrainRemDebug(`Save failed: ${message}`);
      setTrainRemSyncError(true);
    } finally {
      trainRemPendingSaveRef.current = false;
      trainRemSavingRef.current = false;
      setTrainRemSyncing(false);
    }
  }, []);

  const scheduleTrainRemSave = useCallback((nextState) => {
    saveTrainRemState(nextState);
    trainRemPendingSaveRef.current = true;

    if (trainRemAutoSaveTimerRef.current) {
      clearTimeout(trainRemAutoSaveTimerRef.current);
    }

    trainRemAutoSaveTimerRef.current = setTimeout(() => {
      saveTrainRemToDb(nextState);
    }, 1200);
  }, [saveTrainRemToDb]);

  const updateTrainRemState = useCallback((updater) => {
    const prev = trainRemStateRef.current;
    const nextState = typeof updater === "function" ? updater(prev) : updater;

    if (isSameTrainRemState(prev, nextState)) return;

    const nextUndoStack = [...trainRemUndoStackRef.current, cloneTrainRemState(prev)].slice(-TRAIN_REM_UNDO_LIMIT);
    trainRemUndoStackRef.current = nextUndoStack;
    trainRemStateRef.current = nextState;
    setTrainRemUndoCount(nextUndoStack.length);
    setTrainRemState(nextState);
    scheduleTrainRemSave(nextState);
  }, [scheduleTrainRemSave]);

  useEffect(() => {
    const autoClearInfo = getFullMlTidAutoClearInfo(trainRemState.fullMlTidRows);
    const { isComplete, signature } = autoClearInfo;

    const resetRunningTimer = () => {
      if (fullMlTidAutoClearTimerRef.current) {
        clearTimeout(fullMlTidAutoClearTimerRef.current);
        fullMlTidAutoClearTimerRef.current = null;
      }
      fullMlTidAutoClearSignatureRef.current = "";
      setFullMlTidAutoClearEndsAt(null);
      setFullMlTidCountdownSeconds(0);
    };

    const saveAutoClearMeta = (meta) => {
      const normalizedMeta = normalizeFullMlTidAutoClearMeta(meta);
      const currentState = trainRemStateRef.current;

      if (isSameFullMlTidAutoClearMeta(currentState.fullMlTidAutoClear, normalizedMeta)) return;

      const nextState = {
        ...currentState,
        fullMlTidAutoClear: normalizedMeta,
      };

      trainRemStateRef.current = nextState;
      setTrainRemState(nextState);
      scheduleTrainRemSave(nextState);
    };

    const clearFullMlTidTrainIdsAndTimer = () => {
      resetRunningTimer();
      updateTrainRemState((prev) => ({
        ...clearFullMlTidTrainIdsFromState(prev),
        fullMlTidAutoClear: emptyFullMlTidAutoClearMeta(),
      }));
    };

    if (!isComplete) {
      resetRunningTimer();
      saveAutoClearMeta(emptyFullMlTidAutoClearMeta());
      return undefined;
    }

    if (fullMlTidAutoClearTimerRef.current && fullMlTidAutoClearSignatureRef.current === signature) {
      return undefined;
    }

    resetRunningTimer();

    const now = Date.now();
    const savedAutoClearMeta = normalizeFullMlTidAutoClearMeta(trainRemState.fullMlTidAutoClear);
    let nextEndsAt = null;

    if (savedAutoClearMeta.signature === signature && savedAutoClearMeta.endsAt) {
      if (savedAutoClearMeta.endsAt <= now) {
        clearFullMlTidTrainIdsAndTimer();
        return undefined;
      }

      nextEndsAt = savedAutoClearMeta.endsAt;
    } else {
      nextEndsAt = now + FULL_ML_TID_AUTO_CLEAR_MS;
      saveAutoClearMeta({ signature, endsAt: nextEndsAt });
    }

    const remainingMs = Math.max(0, nextEndsAt - now);

    fullMlTidAutoClearSignatureRef.current = signature;
    setFullMlTidAutoClearEndsAt(nextEndsAt);
    setFullMlTidCountdownSeconds(Math.ceil(remainingMs / 1000));

    fullMlTidAutoClearTimerRef.current = setTimeout(() => {
      const currentInfo = getFullMlTidAutoClearInfo(trainRemStateRef.current.fullMlTidRows);

      if (!currentInfo.isComplete || currentInfo.signature !== fullMlTidAutoClearSignatureRef.current) {
        return;
      }

      clearFullMlTidTrainIdsAndTimer();
    }, remainingMs);

    return undefined;
  }, [trainRemState.fullMlTidRows, trainRemState.fullMlTidAutoClear, scheduleTrainRemSave, updateTrainRemState]);

  useEffect(() => {
    if (!fullMlTidAutoClearEndsAt) {
      setFullMlTidCountdownSeconds(0);
      return undefined;
    }

    const tick = () => {
      setFullMlTidCountdownSeconds(Math.max(0, Math.ceil((fullMlTidAutoClearEndsAt - Date.now()) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [fullMlTidAutoClearEndsAt]);

  const handleTrainRemUndo = useCallback(() => {
    const previousState = trainRemUndoStackRef.current.pop();
    if (!previousState) return;

    const restoredState = cloneTrainRemState(previousState);
    setTrainRemUndoCount(trainRemUndoStackRef.current.length);
    setTrainRemFocusedTrainIdCell(null);
    trainRemFocusedTrainIdCellRef.current = null;
    trainRemStateRef.current = restoredState;
    setTrainRemState(restoredState);
    scheduleTrainRemSave(restoredState);
  }, [scheduleTrainRemSave]);

  useEffect(() => {
    if (!trainRemLoaded) return;

    setTrainRemState((prev) => {
      let changed = false;
      const nextRows = { ...prev.rows };

      ["west", "east"].forEach((depot) => {
        const rows = normalizeTrainRemRows(prev.rows?.[depot], depot).map((row) => {
          const requestRemark = getRequestRemarkForTrain(row.trainId);

          // Do not save auto-detected request text into row.remark.
          // It must be derived live from the current Train ID only.
          // This cleans old saved WASH/PM/CM/etc. from localStorage/Base44 so
          // typing T03 then T33 cannot leave the old WASH text behind.
          if (row.remark && (isKnownRequestRemark(row.remark) || normalizeRemarkText(row.remark) === normalizeRemarkText(requestRemark))) {
            changed = true;
            return { ...row, remark: "" };
          }

          return row;
        });

        nextRows[depot] = rows;
      });

      if (!changed) return prev;

      const nextState = {
        ...prev,
        rows: nextRows,
      };

      scheduleTrainRemSave(nextState);
      return nextState;
    });
  }, [maintenanceMap, trainRemLoaded, getRequestRemarkForTrain, isKnownRequestRemark, scheduleTrainRemSave]);

  useEffect(() => {
    refreshTrainRemFromDb({ showStatus: true });
  }, [refreshTrainRemFromDb]);

  useEffect(() => {
    if (!trainRemLoaded || !trainRemDbReady) return;

    const interval = setInterval(() => {
      refreshTrainRemFromDb({ showStatus: true });
    }, TRAIN_REM_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [trainRemLoaded, trainRemDbReady, refreshTrainRemFromDb]);

  useEffect(() => {
    return () => {
      if (trainRemAutoSaveTimerRef.current) {
        clearTimeout(trainRemAutoSaveTimerRef.current);
      }
      if (trainRemEditEndTimerRef.current) {
        clearTimeout(trainRemEditEndTimerRef.current);
      }
      if (fullMlTidAutoClearTimerRef.current) {
        clearTimeout(fullMlTidAutoClearTimerRef.current);
      }
    };
  }, []);

  const handleTrainRemEditStart = () => {
    if (trainRemEditEndTimerRef.current) {
      clearTimeout(trainRemEditEndTimerRef.current);
    }
    trainRemEditingRef.current = true;
  };

  const handleTrainRemEditEnd = () => {
    if (trainRemEditEndTimerRef.current) {
      clearTimeout(trainRemEditEndTimerRef.current);
    }

    trainRemEditEndTimerRef.current = setTimeout(() => {
      trainRemEditingRef.current = false;
    }, 250);
  };

  const setTrainRemTrainIdRef = (depot, rowIndex, element) => {
    const key = `${depot}-${rowIndex}`;
    if (element) {
      trainRemTrainIdRefs.current[key] = element;
    } else {
      delete trainRemTrainIdRefs.current[key];
    }
  };

  const focusTrainRemTrainId = (depot, rowIndex) => {
    const element = trainRemTrainIdRefs.current[`${depot}-${rowIndex}`];
    if (!element) return;

    element.focus();
    element.select();
  };

  const setFullMlTidTrainIdRef = (rowIndex, element) => {
    if (element) {
      fullMlTidTrainIdRefs.current[rowIndex] = element;
    } else {
      delete fullMlTidTrainIdRefs.current[rowIndex];
    }
  };

  const focusFullMlTidTrainId = (rowIndex) => {
    const element = fullMlTidTrainIdRefs.current[rowIndex];
    if (!element) return;

    element.focus();
    element.select();
  };

  const handleFullMlTidTrainIdFocus = () => {
    handleTrainRemOtherFieldFocus();
  };

  const handleTrainRemTrainIdFocus = (depot, rowIndex, rowCount) => {
    handleTrainRemEditStart();

    const focusedCell = { depot, rowIndex };
    trainRemFocusedTrainIdCellRef.current = focusedCell;
    setTrainRemFocusedTrainIdCell(focusedCell);

    // Train Rem auto-jump should only move downward after 2 digits.
    // Backspace on an empty field still moves upward from onKeyDown.
    trainRemSmartDirectionRef.current[depot] = "down";
    trainRemLastFocusedIndexRef.current[depot] = rowIndex;
  };

  const handleTrainRemTrainIdBlur = (depot, rowIndex) => {
    handleTrainRemEditEnd();

    window.setTimeout(() => {
      const focusedCell = trainRemFocusedTrainIdCellRef.current;
      if (focusedCell?.depot === depot && focusedCell?.rowIndex === rowIndex) {
        trainRemFocusedTrainIdCellRef.current = null;
        setTrainRemFocusedTrainIdCell(null);
      }
    }, 150);
  };

  const handleTrainRemOtherFieldFocus = () => {
    trainRemFocusedTrainIdCellRef.current = null;
    setTrainRemFocusedTrainIdCell(null);
    handleTrainRemEditStart();
  };

  const getTrainRemDigitLength = (value) => {
    const cleaned = (value || "").toString().trim().toUpperCase().replace(/\s+/g, "");
    const match = cleaned.match(/^T?(\d+)$/);
    return match ? match[1].length : 0;
  };

  const getTrainRemDuplicateKey = (value) => {
    const key = normalizeTrainId(value);
    return key || "";
  };

  const shouldIgnoreFocusedPartialDuplicate = (depot, rowIndex, value) => {
    const focusedCell = trainRemFocusedTrainIdCell;
    const isFocusedTrainIdCell = focusedCell?.depot === depot && focusedCell?.rowIndex === rowIndex;

    // While user has only typed the first digit, do not mark duplicate yet.
    // This allows typing 11 even when another row already contains 1 / 01.
    return isFocusedTrainIdCell && getTrainRemDigitLength(value) === 1;
  };

  const getTrainRemDuplicateCounts = () => {
    const counts = {};

    ["west", "east"].forEach((scanDepot) => {
      const scanRows = normalizeTrainRemRows(trainRemState.rows?.[scanDepot], scanDepot);

      scanRows.forEach((scanRow, scanIndex) => {
        if (shouldIgnoreFocusedPartialDuplicate(scanDepot, scanIndex, scanRow.trainId)) return;

        const key = getTrainRemDuplicateKey(scanRow.trainId);
        if (!key) return;

        counts[key] = (counts[key] || 0) + 1;
      });
    });

    return counts;
  };

  const getNextTrainRemTrainIdIndex = (rowIndex, rowCount) => {
    const nextIndex = rowIndex + 1;
    return nextIndex >= 0 && nextIndex < rowCount ? nextIndex : null;
  };

  const handleTrainRemTrainIdAutoMove = (depot, rowIndex, rowCount, value) => {
    const digitCount = (value || "").toString().replace(/[^0-9]/g, "").length;
    if (digitCount < 2) return;

    // After 2 digits, always move downward only.
    // The bottom row stays focused because there is no row below.
    const nextIndex = getNextTrainRemTrainIdIndex(rowIndex, rowCount);
    if (nextIndex === null) return;

    window.setTimeout(() => focusTrainRemTrainId(depot, nextIndex), 0);
  };

  const handleFullMlTidTrainIdAutoMove = (rowIndex, value) => {
    const digitCount = cleanFullMlTrainIdInput(value).length;
    if (digitCount < 2) return;

    const nextIndex = rowIndex + 1;
    if (nextIndex >= FULL_ML_TID_ROW_COUNT) return;

    window.setTimeout(() => focusFullMlTidTrainId(nextIndex), 0);
  };

  const applyPreset = (depot, label) => {
    const preset = TID_PRESETS[depot].find((item) => item.label === label);
    const tids = preset?.tids || [];

    updateTrainRemState((prev) => {
      const existingRows = normalizeTrainRemRows(prev.rows?.[depot], depot);
      return {
        ...prev,
        selectedPreset: {
          ...prev.selectedPreset,
          [depot]: label,
        },
        rows: applyFullMlTidMatchesToTrainRemRows(
          {
            ...prev.rows,
            [depot]: existingRows.map((row, index) => {
              const tid = tids[index] ? String(tids[index]) : "";
              return {
                ...row,
                tid,
                timing: tid ? getTimingForTid(depot, label, tid) : "",
              };
            }),
          },
          prev.fullMlTidRows
        ),
      };
    });
  };

  const updateTrainRemCell = (depot, rowIndex, field, value) => {
    updateTrainRemState((prev) => {
      const presetLabel = prev.selectedPreset?.[depot] || "9am";
      const rows = normalizeTrainRemRows(prev.rows?.[depot], depot);
      const updatedRow = { ...rows[rowIndex], [field]: value };

      if (field === "tid") {
        const cleanTid = (value || "").toString().replace(/[^0-9]/g, "");
        const matchedTrainId = buildFullMlTidMap(prev.fullMlTidRows)[cleanTid] || "";
        updatedRow.tid = cleanTid;
        updatedRow.timing = getTimingForTid(depot, presetLabel, cleanTid);
        if (matchedTrainId) {
          updatedRow.trainId = matchedTrainId;
          updatedRow.remark = "";
        }
      }

      if (field === "trainId") {
        // Train ID drives the request remark, but request text is displayed live
        // from maintenanceMap and should not be stored in row.remark.
        // Always clear row.remark on Train ID change to prevent stale WASH/PM/etc.
        // from the previously typed train from staying visible.
        updatedRow.remark = "";
      }

      rows[rowIndex] = updatedRow;

      return {
        ...prev,
        rows: {
          ...prev.rows,
          [depot]: rows,
        },
      };
    });
  };

  const updateFullMlTidCell = (rowIndex, field, value) => {
    updateTrainRemState((prev) => {
      const fullMlTidRows = normalizeFullMlTidRows(prev.fullMlTidRows);
      const nextRows = [...fullMlTidRows];
      nextRows[rowIndex] = {
        ...nextRows[rowIndex],
        [field]: field === "tid"
          ? value.replace(/[^0-9]/g, "")
          : cleanFullMlTrainIdInput(value),
      };

      const normalizedFullRows = normalizeFullMlTidRows(nextRows);

      return {
        ...prev,
        fullMlTidRows: normalizedFullRows,
        rows: applyFullMlTidMatchesToTrainRemRows(prev.rows, normalizedFullRows),
      };
    });
  };

  const clearFullMlTidRows = () => {
    updateTrainRemState((prev) => ({
      ...prev,
      fullMlTidRows: emptyFullMlTidRows(),
    }));
  };

  const applyFullMlTidPreset = (preset) => {
    const tids = Array.isArray(preset?.tids) ? preset.tids : [];

    updateTrainRemState((prev) => {
      const existingRows = normalizeFullMlTidRows(prev.fullMlTidRows);
      const nextRows = existingRows.map((row, index) => ({
        ...row,
        tid: tids[index] ? String(tids[index]) : "",
      }));
      const normalizedFullRows = normalizeFullMlTidRows(nextRows);

      return {
        ...prev,
        fullMlTidRows: normalizedFullRows,
        rows: applyFullMlTidMatchesToTrainRemRows(prev.rows, normalizedFullRows),
      };
    });
  };

  const clearDepotTrainRem = (depot) => {
    updateTrainRemState((prev) => ({
      ...prev,
      rows: {
        ...prev.rows,
        [depot]: emptyTrainRemRows(TRAIN_REM_ROW_COUNTS[depot]),
      },
    }));
  };

  const syncStatusText = !trainRemDbReady
    ? "Local only"
    : trainRemSyncError
    ? "Sync issue"
    : trainRemSyncing
    ? "Syncing..."
    : trainRemLastSynced
    ? `Synced ${formatTime(trainRemLastSynced)}`
    : "Live ready";

  const syncStatusClass = !trainRemDbReady || trainRemSyncError
    ? "border-amber-600/50 bg-amber-950/30 text-amber-300"
    : "border-emerald-600/50 bg-emerald-950/30 text-emerald-300";

  const handleTrainRemPdfDownload = (depot) => {
    const westLog = buildTrainRemRemovalLog(trainRemState, "west", maintenanceMap);
    const eastLog = buildTrainRemRemovalLog(trainRemState, "east", maintenanceMap);
    setTrainRemPdfStatus((prev) => ({ ...prev, [depot]: true }));

    try {
      downloadCombinedRemovalPdf(westLog, eastLog);
    } catch (error) {
      console.error("Train Rem PDF export failed:", error);
      alert("Unable to create removal PDF. Please try again.");
    } finally {
      setTimeout(() => {
        setTrainRemPdfStatus((prev) => ({ ...prev, [depot]: false }));
      }, 700);
    }
  };

  const renderDepotTable = (depot, title, subtitle) => {
    const rows = normalizeTrainRemRows(trainRemState.rows?.[depot], depot);
    const selectedPreset = trainRemState.selectedPreset?.[depot] || "9am";
    const duplicateCounts = getTrainRemDuplicateCounts();
    const showWest9amPrioritySection = depot === "west" && selectedPreset === "9am";
    const pdfActive = Boolean(trainRemPdfStatus?.[depot]);

    return (
      <div className="rounded-xl border border-[#2b4f6b] bg-[#071828] overflow-hidden shadow-md">
        <div className="px-2 py-2 border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[9px] font-black text-white uppercase tracking-widest">{title}</div>
              {subtitle && <div className="text-[7px] font-semibold text-[#7eb8e0] mt-0.5">{subtitle}</div>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => handleTrainRemPdfDownload(depot)}
                className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[9px] font-black text-cyan-100 transition-all hover:-translate-y-0.5"
                style={{
                  background: pdfActive ? "rgba(34,197,94,0.18)" : "rgba(6,212,232,0.14)",
                  borderColor: pdfActive ? "rgba(34,197,94,0.48)" : "rgba(34,211,238,0.55)",
                  color: pdfActive ? "#86efac" : "#b6f3ff",
                  boxShadow: pdfActive ? "0 0 12px rgba(34,197,94,0.16)" : "0 0 12px rgba(34,211,238,0.16)",
                }}
                title="Download one-page PDF: West Depot left, East Depot right"
              >
                <FileText size={12} />
                {pdfActive ? "Done" : "PDF"}
              </button>

              <button
                type="button"
                onClick={handleTrainRemUndo}
                disabled={trainRemUndoCount === 0}
                className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[9px] font-black transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                style={{
                  background: "rgba(15,45,74,0.75)",
                  borderColor: "rgba(74,138,181,0.55)",
                  color: "#9ccbea",
                }}
                title={trainRemUndoCount > 0 ? "Undo last Train Rem change" : "No Train Rem changes to undo"}
              >
                <Undo2 size={12} />
                Undo
              </button>

              <button
                onClick={() => clearDepotTrainRem(depot)}
                className="px-1.5 py-0.5 rounded-md text-[9px] font-black border border-[#2b4f6b] bg-[#10263b] text-[#7eb8e0] hover:bg-red-950/30 hover:border-red-600/60 hover:text-red-300 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1 mt-2">
            <div className="flex items-center gap-1">
              {TID_PRESETS[depot].slice(0, 3).map((preset) => {
                const active = selectedPreset === preset.label;
                return (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(depot, preset.label)}
                    className={`h-5 rounded-md text-[11px] font-black border transition-all ${
                      active
                        ? "bg-[#1d4ed8] border-[#60a5fa] text-white shadow-sm"
                        : "bg-[#10263b] border-[#2b4f6b] text-[#7eb8e0] hover:bg-[#173a59] hover:text-white"
                    }`}
                    style={{ width: "13%" }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              {TID_PRESETS[depot].slice(3).map((preset) => {
                const active = selectedPreset === preset.label;
                return (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(depot, preset.label)}
                    className={`h-5 rounded-md text-[11px] font-black border transition-all ${
                      active
                        ? "bg-[#1d4ed8] border-[#60a5fa] text-white shadow-sm"
                        : "bg-[#10263b] border-[#2b4f6b] text-[#7eb8e0] hover:bg-[#173a59] hover:text-white"
                    }`}
                    style={{ width: "13%" }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-hidden">
          <table className="w-full border-separate border-spacing-0 table-fixed text-[12px]">
            <thead>
              <tr>
                <th className="h-5 px-1 text-left text-[9.5px] font-black uppercase tracking-widest text-[#4a8ab5] bg-[#071828] border-b border-[#1a3a56]" style={{ width: "2%" }}>Train ID</th>
                <th className="h-5 px-1 text-left text-[9.5px] font-black uppercase tracking-widest text-[#4a8ab5] bg-[#071828] border-b border-[#1a3a56]" style={{ width: "2%" }}>TID</th>
                <th className="h-5 px-1 text-left text-[9.5px] font-black uppercase tracking-widest text-[#4a8ab5] bg-[#071828] border-b border-[#1a3a56]" style={{ width: "2%" }}>Timing</th>
                <th className="h-5 px-1 text-left text-[9.5px] font-black uppercase tracking-widest text-[#4a8ab5] bg-[#071828] border-b border-[#1a3a56]" style={{ width: "5%" }}>Remark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const trainRemRequestKey = normalizeTrainId(row.trainId);
                const trainRemRequestItems = trainRemRequestKey ? maintenanceMap?.[trainRemRequestKey] || [] : [];
                const requestRemark = getRequestRemarkForTrain(row.trainId);
                const requestRemarkStyle = requestRemark
                  ? getTrainRemRequestRemarkStyle(trainRemRequestItems[0], requestRemark)
                  : undefined;
                const remarkValue = requestRemark || row.remark;
                const hasTrainId = (row.trainId || "").toString().trim() !== "";
                const duplicateKey = getTrainRemDuplicateKey(row.trainId);
                const isDuplicateTrainId = Boolean(
                  duplicateKey &&
                  duplicateCounts[duplicateKey] > 1 &&
                  !shouldIgnoreFocusedPartialDuplicate(depot, index, row.trainId)
                );
                const filledRowBg = isDuplicateTrainId ? "#2a0b13" : hasTrainId ? "#082a25" : "#071828";
                const trainIdInputClass = isDuplicateTrainId
                  ? "border-red-500/90 bg-red-950/50 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.28),0_0_12px_rgba(248,113,113,0.16)]"
                  : hasTrainId
                  ? "border-emerald-500/80 bg-emerald-950/35 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                  : "border-[#1e4060] bg-[#091828] text-[#e2eaf4]";

                return (
                  <Fragment key={`${depot}-train-rem-${index}`}>
                    {showWest9amPrioritySection && index === TRAIN_REM_WEST_9AM_PRIORITY_INSERT_INDEX && (
                      <tr>
                        <td colSpan={4} className="border-b border-[#10263b] px-1 py-1.5" style={{ backgroundColor: "#071828" }}>
                          <div className="flex min-h-[26px] w-full items-center justify-center rounded-full border border-[#1e4060] bg-[#091828] px-2 text-center text-[10px] font-bold leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_14px_rgba(79,142,247,0.12)]">
                            {TRAIN_REM_WEST_9AM_PRIORITY_TITLE} :
                          </div>
                        </td>
                      </tr>
                    )}

                    <tr>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      ref={(element) => setTrainRemTrainIdRef(depot, index, element)}
                      value={row.trainId}
                      onFocus={() => handleTrainRemTrainIdFocus(depot, index, rows.length)}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        updateTrainRemCell(depot, index, "trainId", nextValue);
                        handleTrainRemTrainIdAutoMove(depot, index, rows.length, nextValue);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !row.trainId && index > 0) {
                          e.preventDefault();
                          focusTrainRemTrainId(depot, index - 1);
                        }
                      }}
                      onBlur={() => handleTrainRemTrainIdBlur(depot, index)}
                      placeholder="ID"
                      title={isDuplicateTrainId ? "Duplicate Train ID detected" : ""}
                      className={`w-full h-5 rounded-md border px-1 text-center text-[11px] font-bold outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7] ${trainIdInputClass}`}
                    />
                  </td>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      value={row.tid}
                      onFocus={handleTrainRemOtherFieldFocus}
                      onChange={(e) => updateTrainRemCell(depot, index, "tid", e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={handleTrainRemEditEnd}
                      placeholder="TID"
                      className="w-full h-5 rounded-md border border-[#1e4060] bg-[#091828] px-1 text-center text-[11px] font-bold text-[#c8d8ea] outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7]"
                    />
                  </td>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      value={row.timing}
                      onFocus={handleTrainRemOtherFieldFocus}
                      onChange={(e) => updateTrainRemCell(depot, index, "timing", e.target.value)}
                      onBlur={handleTrainRemEditEnd}
                      placeholder="00:00"
                      className="w-full h-5 rounded-md border border-[#1e4060] bg-[#071828] px-1 text-center text-[11px] font-bold text-[#7eb8e0] outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7]"
                    />
                  </td>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      value={remarkValue}
                      onFocus={handleTrainRemOtherFieldFocus}
                      onChange={(e) => {
                        if (!requestRemark) {
                          updateTrainRemCell(depot, index, "remark", e.target.value);
                        }
                      }}
                      onBlur={handleTrainRemEditEnd}
                      readOnly={Boolean(requestRemark)}
                      title={requestRemark ? `Auto-detected request type: ${requestRemark}` : ""}
                      placeholder="Remark"
                      style={requestRemarkStyle}
                      className={`w-full h-5 rounded-md border px-1.5 text-[11px] font-semibold outline-none placeholder:text-[#2b4f6b] ${
                        requestRemark
                          ? "cursor-default"
                          : "border-[#1e4060] bg-[#091828] text-[#c8d8ea] focus:border-[#4f8ef7]"
                      }`}
                    />
                  </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderFullMlTidTable = () => {
    const rows = normalizeFullMlTidRows(trainRemState.fullMlTidRows);
    const tidMap = buildFullMlTidMap(rows);
    const matchedTidCount = new Set(
      ["west", "east"]
        .flatMap((depot) => normalizeTrainRemRows(trainRemState.rows?.[depot], depot))
        .map((row) => (row.tid || "").toString().replace(/[^0-9]/g, ""))
        .filter((tid) => tid && tidMap[tid])
    ).size;
    const autoClearInfo = getFullMlTidAutoClearInfo(rows);
    const countdownActive = Boolean(fullMlTidAutoClearEndsAt && autoClearInfo.isComplete);
    const countdownValue = countdownActive ? formatFullMlTidCountdown(fullMlTidCountdownSeconds) : "--:--";
    const countdownLabel = countdownActive
      ? "Train ID auto-clear"
      : autoClearInfo.activeCount > 0
        ? `Waiting ${autoClearInfo.filledCount}/${autoClearInfo.activeCount}`
        : "Timer inactive";
    const activeFullMlTidPresetLabel = getFullMlTidActivePresetLabel(rows);

    return (
      <div className="rounded-xl border border-[#2b4f6b] bg-[#071828] overflow-hidden shadow-md">
        <div className="px-2 py-2 border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black text-white uppercase tracking-widest">Full ML TID</div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="rounded-md border border-emerald-500/40 bg-emerald-950/25 px-1.5 py-0.5 text-[8px] font-black text-emerald-200 whitespace-nowrap">
                {matchedTidCount} matched
              </div>

              <button
                type="button"
                onClick={clearFullMlTidRows}
                className="h-6 rounded-md border border-[#2b4f6b] bg-[#10263b] px-1.5 text-[10px] font-black text-[#7eb8e0] transition-colors hover:border-red-600/60 hover:bg-red-950/30 hover:text-red-300"
                title="Clear Full ML TID list only"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1">
            {FULL_ML_TID_PRESETS.map((preset) => {
              const presetLines = preset.label.split(/\s+/).filter(Boolean);
              const active = activeFullMlTidPresetLabel === preset.label;

              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyFullMlTidPreset(preset)}
                  className={`min-h-[30px] rounded-md border px-1 py-1 text-[9px] font-black leading-[10px] transition-colors ${
                    active
                      ? "border-amber-300/80 bg-amber-500/20 text-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.35)] ring-1 ring-amber-300/40"
                      : "border-cyan-500/35 bg-cyan-950/25 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-900/40"
                  }`}
                  title={`${preset.label} - fill ${preset.tids.length} TID rows`}
                >
                  <span className="flex flex-col items-center justify-center gap-0.5 whitespace-normal text-center">
                    {presetLines.map((line, lineIndex) => (
                      <span key={`${preset.label}-line-${lineIndex}`} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-visible">
          <table className="w-full border-separate border-spacing-0 table-fixed text-[12px]">
            <thead>
              <tr>
                <th className="h-4 px-1 text-left text-[9.5px] font-black uppercase tracking-widest text-[#4a8ab5] bg-[#071828] border-b border-[#1a3a56]" style={{ width: "50%" }}>Train ID</th>
                <th className="h-4 px-1 text-left text-[9.5px] font-black uppercase tracking-widest text-[#4a8ab5] bg-[#071828] border-b border-[#1a3a56]" style={{ width: "50%" }}>TID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const hasData = Boolean((row.trainId || "").toString().trim() || (row.tid || "").toString().trim());
                const matchedTrainId = row.tid ? tidMap[row.tid] : "";
                const rowBg = matchedTrainId ? "#082a25" : hasData ? "#08223b" : "#071828";
                const trainIdValue = (row.trainId || "").toString();

                return (
                  <tr key={`full-ml-tid-${index}`}>
                    <td className="border-b border-[#10263b] px-1 py-0" style={{ backgroundColor: rowBg }}>
                      <input
                        ref={(element) => setFullMlTidTrainIdRef(index, element)}
                        value={trainIdValue}
                        onFocus={handleFullMlTidTrainIdFocus}
                        onChange={(e) => {
                          const nextValue = cleanFullMlTrainIdInput(e.target.value);
                          updateFullMlTidCell(index, "trainId", nextValue);
                          handleFullMlTidTrainIdAutoMove(index, nextValue);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !row.trainId && index > 0) {
                            e.preventDefault();
                            focusFullMlTidTrainId(index - 1);
                          }
                        }}
                        onBlur={handleTrainRemEditEnd}
                        placeholder="ID"
                        inputMode="numeric"
                        className="h-4 w-full rounded border border-[#1e4060] bg-[#091828] px-1 text-center text-[11px] font-bold text-[#e2eaf4] outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7]"
                      />
                    </td>
                    <td className="border-b border-[#10263b] px-1 py-0" style={{ backgroundColor: rowBg }}>
                      <input
                        value={row.tid}
                        onFocus={handleTrainRemOtherFieldFocus}
                        onChange={(e) => updateFullMlTidCell(index, "tid", e.target.value)}
                        onBlur={handleTrainRemEditEnd}
                        placeholder="TID"
                        className="h-4 w-full rounded border border-[#1e4060] bg-[#091828] px-1 text-center text-[11px] font-bold text-[#c8d8ea] outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7]"
                      />
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={2} className="px-1 py-1 bg-[#071828]">
                  <div className={`flex h-7 items-center justify-between rounded-lg border px-2 ${
                    countdownActive
                      ? "border-amber-400/60 bg-amber-950/25 text-amber-100"
                      : "border-[#1e4060] bg-[#091828] text-[#7eb8e0]"
                  }`}>
                    <span className="text-[10px] font-black uppercase tracking-widest">{countdownLabel}</span>
                    <span className="font-mono text-[15px] font-black tabular-nums">{countdownValue}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <section className="w-[560px] flex-shrink-0 rounded-xl border border-[#2b4f6b] bg-[#0b1f33] p-2 shadow-md">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center flex-shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] font-black text-white tracking-widest uppercase leading-none">Train Rem</h2>
            <p className="text-[8px] font-semibold text-[#7eb8e0] mt-0.5">Train removal timing entry</p>
          </div>
        </div>
        <div className={`px-1.5 py-0.5 rounded-md border text-[7px] font-black whitespace-nowrap ${syncStatusClass}`}>
          {syncStatusText}
        </div>
      </div>

      {(!trainRemDbReady || trainRemSyncError) && trainRemDebug && (
        <div className="mb-2 rounded-lg border border-amber-600/50 bg-amber-950/25 px-2 py-1.5 text-[8px] font-semibold text-amber-200">
          <div className="font-black uppercase tracking-widest">TrainRem sync debug</div>
          <div className="mt-0.5 leading-snug">{trainRemDebug}</div>
          <div className="mt-1 text-[7px] text-amber-300/80">
            Open browser console and search <span className="font-black">TrainRem debug</span> for full details.
          </div>
        </div>
      )}

      <div className="grid grid-cols-[300px_1fr] items-start gap-2">
        <div className="space-y-1.5">
          {renderDepotTable("west", "West Depot", "")}
          {renderDepotTable("east", "East Depot", "")}
        </div>

        {renderFullMlTidTable()}
      </div>
    </section>
  );
}

function InsertionTabContent({ westData, eastData, maintenanceMap, insertionLog, onInsertionTick, onRemoveInsertionLog, onClearInsertionDepot, onClearInsertedTidRemarks, onClearInsertedTrains, tidInputs, onTidChange, getTidScheduledTime, insertionLiveStatusText, insertionLiveStatusClass, insertionLiveDebug }) {
  // TID schedule range: earliest first-TID time across both series, latest last-TID time.
  // Series 1xx: 05:25–06:22 | Series 2xx: 05:24–06:21
  // Grey-out in the TID Reference Table only applies while current time is within this window.
  const TID_SCHEDULE_FIRST = "05:24"; // earliest TID time (TID 201)
  const TID_SCHEDULE_LAST  = "06:22"; // latest TID time  (TID 120)
  const withinTIDSchedule = isWithinTIDSchedule(TID_SCHEDULE_FIRST, TID_SCHEDULE_LAST);

  return (
    <div className="flex flex-col gap-5">
      <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-bold ${insertionLiveStatusClass || "border-slate-600/50 bg-slate-950/40 text-slate-300"}`}>
        {insertionLiveStatusText || "Insertion Local only"}
      </div>
      {insertionLiveDebug && (
        <div className="w-fit rounded-xl border border-amber-600/40 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-200">
          {insertionLiveDebug}
        </div>
      )}

      {/* Top row: TID Reference Table (left) + Stabling sections (centre) */}
      <div className="grid gap-5 items-start" style={{ gridTemplateColumns: "auto 1fr" }}>
        {/* TID Reference Tables — left column */}
        <div className="sticky top-16">
          <TIDReferenceTable withinSchedule={withinTIDSchedule} />
        </div>

        {/* Stabling sections — centre column */}
        <div className="space-y-5 min-w-0">
          <InsertionStablingSection title="WEST DEPOT" blockLabels={["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"]} blockIndices={[6,5,4,3,2,1,0]} roads={WEST_ROADS} data={westData} labelSide="left" maintenanceMap={maintenanceMap} insertionLog={insertionLog} onInsertionTick={onInsertionTick} tidInputs={tidInputs} onTidChange={onTidChange} onClearInsertedTidRemarks={onClearInsertedTidRemarks} onClearInsertedTrains={onClearInsertedTrains} getTidScheduledTime={getTidScheduledTime} />
          <InsertionStablingSection title="EAST DEPOT" blockLabels={["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"]} blockIndices={[0,1,2,3,4,5,6]} roads={EAST_ROADS} data={eastData} labelSide="right" maintenanceMap={maintenanceMap} insertionLog={insertionLog} onInsertionTick={onInsertionTick} tidInputs={tidInputs} onTidChange={onTidChange} onClearInsertedTidRemarks={onClearInsertedTidRemarks} onClearInsertedTrains={onClearInsertedTrains} getTidScheduledTime={getTidScheduledTime} />
        </div>
      </div>

      {/* Insertion log — full width below stabling tables */}
      <InsertionLogOutput insertionLog={sortInsertionLogByTime(insertionLog)} onRemove={onRemoveInsertionLog} onClearDepot={onClearInsertionDepot} />
    </div>
  );
}

// ── Train Movement Internal Page ─────────────────────────────────────────────

const TRAIN_MOVEMENT_LOG_KEY = "trainMovementLogState_v1";
const TP1_MOVEMENT_LOG_KEY = "tp1MovementLogState_v1";
const TRAIN_MOVEMENT_FORM_KEY = "trainMovementFormState_v1";
const TP1_MOVEMENT_FORM_KEY = "tp1MovementFormState_v1";

function loadSavedMovementObject(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSavedMovementObject(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value || {}));
  } catch {}
}

function mergeTrainMovementForms(defaultForms, savedForms) {
  if (!savedForms || typeof savedForms !== "object" || Array.isArray(savedForms)) return defaultForms;

  return {
    insertion: { ...defaultForms.insertion, ...(savedForms.insertion || {}) },
    removal: { ...defaultForms.removal, ...(savedForms.removal || {}) },
    swapping: { ...defaultForms.swapping, ...(savedForms.swapping || {}) },
  };
}

function mergeTp1MovementForm(defaultForm, savedForm) {
  if (!savedForm || typeof savedForm !== "object" || Array.isArray(savedForm)) return defaultForm;
  return { ...defaultForm, ...savedForm };
}

function loadTrainMovementLog() {
  try {
    const raw = localStorage.getItem(TRAIN_MOVEMENT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTrainMovementLog(entries) {
  try { localStorage.setItem(TRAIN_MOVEMENT_LOG_KEY, JSON.stringify(entries || [])); } catch {}
}

function loadTp1MovementLog() {
  try {
    const raw = localStorage.getItem(TP1_MOVEMENT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTp1MovementLog(entries) {
  try { localStorage.setItem(TP1_MOVEMENT_LOG_KEY, JSON.stringify(entries || [])); } catch {}
}

function formatTp1DateForLog(dateText) {
  const raw = String(dateText || "").trim();
  if (!raw) return "dd/mm/yyyy";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
}

function formatTp1NextWashForLog(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalized = raw.replace("T", " ").replace(/\s+/g, " ").trim();
  const dayFirstMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (dayFirstMatch) {
    const [, day, month, year, hour, minute] = dayFirstMatch;
    return {
      dateText: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
      timeText: `${String(hour).padStart(2, "0")}:${minute}`,
    };
  }

  const isoDateTimeMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (isoDateTimeMatch) {
    const [, year, month, day, hour, minute] = isoDateTimeMatch;
    return {
      dateText: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
      timeText: `${String(hour).padStart(2, "0")}:${minute}`,
    };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    dateText: `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`,
    timeText: `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`,
  };
}

function getMovementDepotLabel(depot) {
  return depot === "east" ? "East Depot" : "West Depot";
}

function getMovementTrack(depot) {
  return depot === "east" ? "2" : "1";
}

function getMovementRoads(depot) {
  return depot === "east" ? EAST_ROADS : WEST_ROADS;
}

function normalizeMovementTrain(value) {
  const normalized = normalizeTrainId(value);
  return normalized ? padTrainId(normalized) : "";
}

function cleanMovementCustomTimeInput(value) {
  const raw = String(value || "").replace(/[^\d:]/g, "").slice(0, 5);
  if (raw.includes(":")) {
    const [hour = "", minute = ""] = raw.split(":");
    return `${hour.slice(0, 2)}:${minute.slice(0, 2)}`;
  }

  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 1) return digits;
  if (digits.length === 2) return `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function cleanTp1MovementTimeInput(value) {
  const raw = String(value || "").replace(/[^\d:]/g, "").slice(0, 5);
  if (raw.includes(":")) {
    const [hour = "", minute = ""] = raw.split(":");
    return `${hour.slice(0, 2)}:${minute.slice(0, 2)}`;
  }

  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 1) return digits;
  if (digits.length === 2) return `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeMovementCustomTimeInput(value) {
  const raw = String(value || "").replace(/[^\d:]/g, "").slice(0, 5);
  if (!raw) return "";

  let hourText = "";
  let minuteText = "";

  if (raw.includes(":")) {
    const [hour = "", minute = ""] = raw.split(":");
    hourText = hour.slice(0, 2);
    minuteText = minute.slice(0, 2) || "00";
  } else {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (!digits) return "";
    hourText = digits.length <= 2 ? digits : digits.slice(0, 2);
    minuteText = digits.length <= 2 ? "00" : digits.slice(2);
  }

  const hour = Math.min(Math.max(Number(hourText || 0), 0), 23);
  const minute = Math.min(Math.max(Number(minuteText || 0), 0), 59);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function TrainMovementContent() {
  const createDefaultMovementForms = () => ({
    insertion: {
      trainId: "",
      timingMode: "now",
      customTime: "",
      depot: "west",
      road: "WD-ST14",
      tid: "",
      notes: "",
    },
    removal: {
      trainId: "",
      timingMode: "now",
      customTime: "",
      depot: "west",
      tid: "",
      notes: "",
    },
    swapping: {
      trainId: "",
      timingMode: "now",
      customTime: "",
      depot: "west",
      swapReason: "RST PM",
      replacedBy: "",
      notes: "",
    },
  });

  const createDefaultTp1MovementForm = () => ({
    trainSet: "",
    planStatus: "Planned",
    movementType: "automatic",
    trAtTp1: "",
    shunterName: "",
    trLocalized: "",
    nextWashText: "",
    nextWashDate: "",
    nextWashTime: "",
    fromTp1: "",
    toManual: "",
  });

  const OPERATION_META = {
    insertion: {
      title: "Insertion",
      subtitle: "Add Insertion Log",
      logTitle: "Insertion Log",
      iconType: "in",
      accent: "#22c55e",
      buttonLabel: "Add Insertion Log",
      emptyText: "No insertion log yet.",
    },
    removal: {
      title: "Removal",
      subtitle: "Add Removal Log",
      logTitle: "Removal Log",
      iconType: "out",
      accent: "#ef4444",
      buttonLabel: "Add Removal Log",
      emptyText: "No removal log yet.",
    },
    swapping: {
      title: "Swapping",
      subtitle: "Add Swapping Log",
      logTitle: "Swapping Log",
      iconType: "swap",
      accent: "#f59e0b",
      buttonLabel: "Add Swapping Log",
      emptyText: "No swapping log yet.",
    },
  };

  const MOVEMENT_OPERATIONS = ["swapping", "insertion", "removal"];

  const SHUNTER_NAME_OPTIONS = [
    "PAUL",
    "FAZREEN",
    "ARSHAD",
    "BBOSA",
    "AKMAL",
    "KRISNA",
    "GERALD",
    "LEO",
    "FARAS",
    "MIRAN",
  ];

  const [entries, setEntries] = useState(() => loadTrainMovementLog());
  const [tp1Entries, setTp1Entries] = useState(() => loadTp1MovementLog());
  const [clockText, setClockText] = useState(() => formatTime(new Date()));
  const [copyFeedback, setCopyFeedback] = useState({});
  const copyFeedbackTimerRef = useRef({});
  const [forms, setForms] = useState(() => {
    const defaultForms = createDefaultMovementForms();
    return mergeTrainMovementForms(defaultForms, loadSavedMovementObject(TRAIN_MOVEMENT_FORM_KEY));
  });
  const [tp1Form, setTp1Form] = useState(() => {
    const defaultForm = createDefaultTp1MovementForm();
    return mergeTp1MovementForm(defaultForm, loadSavedMovementObject(TP1_MOVEMENT_FORM_KEY));
  });
  const movementScrollRestoreRef = useRef(null);

  const captureMovementScrollPosition = () => {
    if (typeof window === "undefined") return;
    movementScrollRestoreRef.current = { x: window.scrollX, y: window.scrollY };
  };

  useLayoutEffect(() => {
    const position = movementScrollRestoreRef.current;
    if (!position || typeof window === "undefined") return;

    movementScrollRestoreRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo(position.x, position.y);
    });
  }, [forms, entries, tp1Form, tp1Entries]);

  useEffect(() => { saveTrainMovementLog(entries); }, [entries]);
  useEffect(() => { saveTp1MovementLog(tp1Entries); }, [tp1Entries]);
  useEffect(() => { saveSavedMovementObject(TRAIN_MOVEMENT_FORM_KEY, forms); }, [forms]);
  useEffect(() => { saveSavedMovementObject(TP1_MOVEMENT_FORM_KEY, tp1Form); }, [tp1Form]);

  useEffect(() => {
    return () => {
      Object.values(copyFeedbackTimerRef.current || {}).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const tick = () => setClockText(formatTime(new Date()));
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const insertionForm = forms.insertion || createDefaultMovementForms().insertion;
    const roads = getMovementRoads(insertionForm.depot);
    if (!roads.includes(insertionForm.road)) {
      setForms((prev) => ({
        ...prev,
        insertion: {
          ...prev.insertion,
          road: roads[0],
        },
      }));
    }
  }, [forms.insertion?.depot, forms.insertion?.road]);

  const updateMovementForm = (operation, field, value) => {
    captureMovementScrollPosition();
    setForms((prev) => ({
      ...prev,
      [operation]: {
        ...prev[operation],
        [field]: value,
      },
    }));
  };

  const updateTp1MovementForm = (field, value) => {
    captureMovementScrollPosition();
    setTp1Form((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const getMovementForm = (operation) => forms[operation] || createDefaultMovementForms()[operation];

  const getResolvedMovementTime = (operation) => {
    const current = getMovementForm(operation);
    return current.timingMode === "custom" && current.customTime ? current.customTime : clockText;
  };

  const setMovementTimingMode = (operation, mode) => {
    captureMovementScrollPosition();
    setForms((prev) => {
      const current = prev[operation] || createDefaultMovementForms()[operation];
      return {
        ...prev,
        [operation]: {
          ...current,
          timingMode: mode,
          customTime: mode === "custom" && !current.customTime ? clockText : current.customTime,
        },
      };
    });
  };

  const showCopyFeedback = (key, status) => {
    setCopyFeedback((prev) => ({ ...prev, [key]: status }));

    if (copyFeedbackTimerRef.current[key]) {
      clearTimeout(copyFeedbackTimerRef.current[key]);
    }

    copyFeedbackTimerRef.current[key] = setTimeout(() => {
      setCopyFeedback((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete copyFeedbackTimerRef.current[key];
    }, 1600);
  };

  const getCopyButtonLabel = (depot, operation, fallbackLabel) => {
    const status = copyFeedback[`${depot}-${operation}`];
    if (status === "copied") return "copied !";
    if (status === "empty") return "no log !";
    return fallbackLabel;
  };

  const getTp1CopyButtonLabel = (fallbackLabel = "Copy") => {
    const status = copyFeedback["tp1-all"];
    if (status === "copied") return "copied !";
    if (status === "empty") return "no log !";
    return fallbackLabel;
  };

  const buildMovementLine = (operation) => {
    const current = getMovementForm(operation);
    const train = normalizeMovementTrain(current.trainId);
    const tid = (current.tid || "").toString().replace(/\D/g, "").trim();
    const tidPart = tid ? ` (TID ${tid})` : "";
    const time = getResolvedMovementTime(operation);
    const selectedDepotLabel = getMovementDepotLabel(current.depot);
    const selectedTrack = getMovementTrack(current.depot);
    const selectedRoads = getMovementRoads(current.depot);

    if (!train) {
      alert("Please enter Train ID first.");
      return null;
    }

    if (operation === "insertion") {
      const road = current.road || selectedRoads[0];
      return {
        text: `${time} hrs – ${train}${tidPart} inserted from ${road} to mainline track ${selectedTrack}.`,
        train,
        tid,
        road,
      };
    }

    if (operation === "removal") {
      return {
        text: `${time} hrs – ${train}${tidPart} removed from mainline to ${selectedDepotLabel}.`,
        train,
        tid,
        road: "",
      };
    }

    const replacement = normalizeMovementTrain(current.replacedBy);
    const reason = (current.swapReason || "").trim();
    if (!replacement) {
      alert("Please enter the replacement train.");
      return null;
    }
    if (!reason) {
      alert("Please enter the swap reason.");
      return null;
    }

    return {
      text: `${time} hrs – ${train} removed from mainline to ${selectedDepotLabel} stabling due to ${reason}. Replaced by ${replacement}.`,
      train,
      tid: "",
      road: "",
      replacement,
      reason,
    };
  };

  const buildMovementPreview = (operation) => {
    const current = getMovementForm(operation);
    const time = getResolvedMovementTime(operation);
    const selectedDepotLabel = getMovementDepotLabel(current.depot);
    const selectedTrack = getMovementTrack(current.depot);
    const selectedRoads = getMovementRoads(current.depot);
    const train = normalizeMovementTrain(current.trainId) || "T25";
    const tid = (current.tid || "").toString().replace(/\D/g, "").trim();
    const tidPart = tid ? ` (TID ${tid})` : "";

    if (operation === "insertion") {
      return `${time} hrs – ${train}${tidPart} inserted from ${current.road || selectedRoads[0]} to mainline track ${selectedTrack}.`;
    }

    if (operation === "removal") {
      return `${time} hrs – ${train}${tidPart} removed from mainline to ${selectedDepotLabel}.`;
    }

    return `${time} hrs – ${train} removed from mainline to ${selectedDepotLabel} stabling due to ${current.swapReason || "RST PM"}. Replaced by ${normalizeMovementTrain(current.replacedBy) || "T30"}.`;
  };

  const addMovementLog = (operation) => {
    captureMovementScrollPosition();
    const current = getMovementForm(operation);
    const built = buildMovementLine(operation);
    if (!built) return;

    const now = new Date();
    const entry = {
      id: `movement-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      depot: current.depot,
      operation,
      time: getResolvedMovementTime(operation),
      createdAt: now.toISOString(),
      text: built.text,
      train: built.train,
      tid: built.tid,
      road: built.road,
      replacement: built.replacement || "",
      reason: built.reason || "",
      notes: current.notes || "",
    };

    setEntries((prev) => [...prev, entry]);
    setForms((prev) => ({
      ...prev,
      [operation]: {
        ...prev[operation],
        trainId: "",
        tid: "",
        replacedBy: "",
        notes: "",
      },
    }));
  };

  const removeMovementLog = (id) => {
    captureMovementScrollPosition();
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearDepotLogs = (depot) => {
    const label = getMovementDepotLabel(depot);
    if (!window.confirm(`Clear all Train Movement logs for ${label}?`)) return;
    captureMovementScrollPosition();
    setEntries((prev) => prev.filter((entry) => entry.depot !== depot));
  };

  const clearDepotOperationLogs = (depot, operation) => {
    const label = getMovementDepotLabel(depot);
    const operationLabel = OPERATION_META[operation]?.title || "Movement";
    if (!window.confirm(`Clear ${operationLabel} logs for ${label}?`)) return;
    captureMovementScrollPosition();
    setEntries((prev) => prev.filter((entry) => !(entry.depot === depot && entry.operation === operation)));
  };

  const copyTextToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const copyDepotLogs = async (depot, operation = null) => {
    const feedbackKey = `${depot}-${operation || "all"}`;
    const lines = entries
      .filter((entry) => entry.depot === depot && (!operation || entry.operation === operation))
      .map((entry) => entry.text);

    if (lines.length === 0) {
      showCopyFeedback(feedbackKey, "empty");
      return;
    }

    await copyTextToClipboard(lines.join("\n"));
    showCopyFeedback(feedbackKey, "copied");
  };

  const copySingleMovementLog = async (entry) => {
    if (!entry?.text) return;
    await copyTextToClipboard(entry.text);
    showCopyFeedback(`movement-entry-${entry.id}`, "copied");
  };

  const getTp1NextWashSuffix = (form = tp1Form) => {
    const nextWashRaw = String(
      form.nextWashText || (form.nextWashDate && form.nextWashTime ? `${form.nextWashDate} ${form.nextWashTime}` : "")
    ).trim();
    if (!nextWashRaw) return "";

    const nextWash = formatTp1NextWashForLog(nextWashRaw);
    if (!nextWash) return ` ── Next wash: ${nextWashRaw}.`;

    return ` ── Next wash: ${nextWash.dateText} at ${nextWash.timeText}.`;
  };

  const getTp1MovementType = (form = tp1Form) => {
    if (form.movementType === "manual" || form.movementType === "automatic") return form.movementType;
    return form.trLocalized ? "automatic" : "manual";
  };

  const buildTp1MovementText = ({ preview = false } = {}) => {
    const movementType = getTp1MovementType();
    const train = normalizeMovementTrain(tp1Form.trainSet);
    const displayTrain = train || "T19";
    const planStatus = tp1Form.planStatus || "Planned";
    const shunterName = (tp1Form.shunterName || "ALVIN").trim();
    const trAtTp1 = tp1Form.trAtTp1 || "18:20";
    const shunterAuth = addMinutesToHHMM(trAtTp1, 1);
    const trLocalized = tp1Form.trLocalized || "18:28";
    const fromTp1 = tp1Form.fromTp1 || "18:30";
    const toManual = tp1Form.toManual || "18:35";
    const nextWashSuffix = getTp1NextWashSuffix();

    if (!preview) {
      const missing = [];
      if (!train) missing.push("Train Set");
      if (!tp1Form.planStatus) missing.push("Plan / Unplanned");
      if (!tp1Form.trAtTp1) missing.push("TR at TP1");
      if (!tp1Form.shunterName) missing.push("Shunter Name");
      if (movementType === "automatic" && !tp1Form.trLocalized) missing.push("TR Localized");
      if (movementType === "manual" && !tp1Form.fromTp1) missing.push("From TP1");
      if (movementType === "manual" && !tp1Form.toManual) missing.push("to Manual");

      if (missing.length) {
        alert(`Please complete: ${missing.join(", ")}.`);
        return null;
      }
    }

    if (movementType === "automatic") {
      return `${displayTrain}: ${planStatus} movement to Automatic Area.${nextWashSuffix}\n${trAtTp1} hrs – ${displayTrain} arrived at TP1 with Shunter ${shunterName} onboard.\n${shunterAuth} hrs – ${displayTrain} authorized to prepare the train, conduct a brake self-test, and localize the train.\n${trLocalized} hrs – ${displayTrain} localized at TP1.`;
    }

    return `${displayTrain}: ${planStatus} movement to Manual Area.${nextWashSuffix}\n${trAtTp1} hrs – ${displayTrain} arrived at TP1.\n${shunterAuth} hrs – ${displayTrain} was authorized to prepare the train. Shunter ${shunterName} onboard.\n${fromTp1} hrs – ${displayTrain} departed from TP1 and arrived at the Manual Area at ${toManual} hrs.`;
  };

  const addTp1MovementLog = () => {
    captureMovementScrollPosition();
    const text = buildTp1MovementText();
    if (!text) return;

    const now = new Date();
    const movementType = getTp1MovementType();
    const entry = {
      id: `tp1-movement-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      type: movementType,
      train: normalizeMovementTrain(tp1Form.trainSet),
      planStatus: tp1Form.planStatus,
      createdAt: now.toISOString(),
      text,
    };

    setTp1Entries((prev) => [...prev, entry]);
    setTp1Form((prev) => ({
      ...prev,
      trainSet: "",
      trAtTp1: "",
      trLocalized: "",
      nextWashText: "",
      nextWashDate: "",
      nextWashTime: "",
      fromTp1: "",
      toManual: "",
    }));
  };

  const removeTp1MovementLog = (id) => {
    captureMovementScrollPosition();
    setTp1Entries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearTp1MovementLogs = () => {
    if (!window.confirm("Clear all inbound / outbound movement logs?")) return;
    captureMovementScrollPosition();
    setTp1Entries([]);
  };

  const copyTp1MovementLogs = async () => {
    const lines = tp1Entries.map((entry) => entry.text);
    if (lines.length === 0) {
      showCopyFeedback("tp1-all", "empty");
      return;
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = lines.join("\n\n");
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    showCopyFeedback("tp1-all", "copied");
  };

  const renderMovementLogLine = (entry) => {
    const depotColor = entry.depot === "east" ? "#06d4e8" : "#a855f7";
    const trainColor = entry.depot === "east" ? "#22d3ee" : "#a855f7";
    const tidColor = "#facc15";
    const insertedColor = "#22c55e";
    const removedColor = "#ef4444";
    const roadColor = "#06d4e8";
    const time = entry.time || entry.text?.match(/^(\d{1,2}:\d{2})/)?.[1] || "--:--";
    const train = entry.train || entry.text?.match(/\bT\d+\b/)?.[0] || "";
    const tid = (entry.tid || "").toString().trim();
    const depotName = getMovementDepotLabel(entry.depot);

    if (entry.operation === "insertion") {
      const road = entry.road || getMovementRoads(entry.depot)?.[0] || "";
      const track = getMovementTrack(entry.depot);

      return (
        <>
          <span>{time} hrs – </span>
          <span style={{ color: trainColor }}>{train}</span>
          {tid ? <span style={{ color: tidColor }}> (TID {tid})</span> : null}
          <span> </span>
          <span style={{ color: insertedColor }}>inserted</span>
          <span> from </span>
          <span style={{ color: roadColor }}>{road}</span>
          <span> to mainline track {track}.</span>
        </>
      );
    }

    if (entry.operation === "removal") {
      return (
        <>
          <span>{time} hrs – </span>
          <span style={{ color: trainColor }}>{train}</span>
          {tid ? <span style={{ color: tidColor }}> (TID {tid})</span> : null}
          <span> </span>
          <span style={{ color: removedColor }}>removed</span>
          <span> from mainline to </span>
          <span style={{ color: depotColor }}>{depotName}</span>
          <span>.</span>
        </>
      );
    }

    if (entry.operation === "swapping") {
      return (
        <>
          <span>{time} hrs – </span>
          <span style={{ color: trainColor }}>{train}</span>
          <span> </span>
          <span style={{ color: removedColor }}>removed</span>
          <span> from mainline to </span>
          <span style={{ color: depotColor }}>{depotName}</span>
          <span> stabling due to </span>
          <span style={{ color: tidColor }}>{entry.reason || "RST PM"}</span>
          <span>. Replaced by </span>
          <span style={{ color: trainColor }}>{entry.replacement || ""}</span>
          <span>.</span>
        </>
      );
    }

    return <>{entry.text}</>;
  };

  const MovementIcon = ({ type = "train", color = "currentColor" }) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {type === "train" && <><rect x="4" y="3" width="16" height="15" rx="3"/><path d="M8 21l2-3"/><path d="M16 21l-2-3"/><path d="M8 8h8"/><path d="M8 13h.01"/><path d="M16 13h.01"/></>}
      {type === "clock" && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
      {type === "copy" && <><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></>}
      {type === "trash" && <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></>}
      {type === "swap" && <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>}
      {type === "in" && <><polyline points="5 12 12 5 19 12"/><line x1="12" y1="5" x2="12" y2="19"/></>}
      {type === "out" && <><polyline points="19 12 12 19 5 12"/><line x1="12" y1="5" x2="12" y2="19"/></>}
      {type === "chevron" && <><polyline points="6 9 12 15 18 9"/></>}
    </svg>
  );

  const renderDepotButton = ({ operation, depot, label, accent }) => {
    const current = getMovementForm(operation);
    const active = current.depot === depot;
    return (
      <button
        type="button"
        onClick={() => updateMovementForm(operation, "depot", depot)}
        className="flex h-8 items-center justify-between rounded-lg border px-2 py-1 text-left transition-all"
        style={{
          background: active ? `linear-gradient(135deg, ${accent}38, #081e32 82%)` : "#061827",
          borderColor: active ? accent : "#1e4060",
          boxShadow: active ? `0 0 18px ${accent}33, inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
          color: active ? "#ffffff" : "#9bb3ca",
        }}
      >
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}2e`, color: accent }}>
            <MovementIcon type="train" color={accent} />
          </span>
          <span className="text-[11px] font-medium">{label}</span>
        </span>
        <span className="h-3 w-3 rounded-full border" style={{ borderColor: active ? accent : "#2b4f6b", backgroundColor: active ? accent : "transparent" }} />
      </button>
    );
  };

  const renderTimingPicker = (operation) => {
    const current = getMovementForm(operation);
    const isNow = current.timingMode !== "custom";
    const activeStyle = "text-white";
    const inactiveStyle = "text-[#6fa8df] hover:text-white";
    const currentDisplay = isNow ? `${clockText} hrs (current)` : `${current.customTime || clockText} hrs`;

    return (
      <div>
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.20em] text-[#58a6ff]">Timing</span>
        <div className="flex h-8 w-full items-center overflow-hidden rounded-lg border border-[#1e4060] bg-[#061827] shadow-[0_0_14px_rgba(79,142,247,0.10),inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-[#4f8ef7]">
          <div className="flex h-full w-8 shrink-0 items-center justify-center text-white">
            <MovementIcon type="clock" color="#dbeafe" />
          </div>

          <button
            type="button"
            onClick={() => setMovementTimingMode(operation, "now")}
            className={`flex h-full shrink-0 items-center justify-center px-2 text-[11px] font-medium transition-all ${isNow ? activeStyle : inactiveStyle}`}
          >
            Now
          </button>

          <div className="h-5 w-px shrink-0 bg-[#244b6b]" />

          <button
            type="button"
            onClick={() => setMovementTimingMode(operation, "custom")}
            className={`flex h-full shrink-0 items-center justify-center px-2 text-[11px] font-medium transition-all ${!isNow ? activeStyle : inactiveStyle}`}
          >
            Custom
          </button>

          <div className="h-5 w-px shrink-0 bg-[#244b6b]" />

          {isNow ? (
            <button
              type="button"
              onClick={() => setMovementTimingMode(operation, "custom")}
              className="flex h-full min-w-0 flex-1 items-center justify-between gap-1.5 px-2 text-left text-[11px] font-medium text-white transition-all hover:bg-[#0a2238]"
              title="Click to enter custom timing"
            >
              <span className="min-w-0 truncate">{currentDisplay}</span>
              <MovementIcon type="chevron" color="#b8cff0" />
            </button>
          ) : (
            <div className="flex h-full min-w-0 flex-1 items-center gap-1 px-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={current.customTime}
                onKeyDown={(e) => {
                  const value = String(current.customTime || "");
                  const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
                  if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                    e.preventDefault();
                    updateMovementForm(operation, "customTime", value.slice(0, -2));
                  }
                }}
                onChange={(e) => updateMovementForm(operation, "customTime", cleanMovementCustomTimeInput(e.target.value))}
                onBlur={(e) => updateMovementForm(operation, "customTime", normalizeMovementCustomTimeInput(e.target.value))}
                placeholder="00:00"
                className="h-full min-w-[42px] flex-1 bg-transparent text-[11px] font-medium text-white outline-none placeholder:text-[#31516b]"
              />
              <span className="shrink-0 text-[11px] font-medium text-[#c8d8ea]">hrs</span>
              <MovementIcon type="chevron" color="#b8cff0" />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMovementFormCard = (operation) => {
    const meta = OPERATION_META[operation];
    const current = getMovementForm(operation);
    const selectedRoads = getMovementRoads(current.depot);
    const isInsertion = operation === "insertion";
    const isSwapping = operation === "swapping";
    const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#58a6ff]";
    const inputClass = "h-8 w-full rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] focus:border-[#4f8ef7]";
    const glowInputBoxClass = "flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7bc4] bg-[#061827] px-2 shadow-[0_0_12px_rgba(79,142,247,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all focus-within:border-[#7ab7ff] focus-within:shadow-[0_0_16px_rgba(79,142,247,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]";

    return (
      <section
        className="overflow-hidden rounded-xl border shadow-[0_14px_28px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{ borderColor: `${meta.accent}42`, background: "linear-gradient(180deg,#061827 0%,#041727 100%)" }}
      >
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-12 lg:items-end">
            <label className="col-span-1 lg:col-span-2 xl:max-w-[105px]">
              <span className={labelClass}>Train ID</span>
              <div className={glowInputBoxClass}>
                <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
                <input
                  value={current.trainId}
                  onChange={(e) => updateMovementForm(operation, "trainId", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 25"
                  className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
                />
              </div>
            </label>

            <div className="col-span-2 min-w-0 lg:col-span-5 xl:max-w-[300px]">
              {renderTimingPicker(operation)}
            </div>

            <div className="col-span-2 min-w-0 lg:col-span-5 xl:max-w-[300px]">
              <span className={labelClass}>Depot</span>
              <div className="grid grid-cols-2 gap-1.5">
                {renderDepotButton({ operation, depot: "west", label: "West Depot", accent: "#8b5cf6" })}
                {renderDepotButton({ operation, depot: "east", label: "East Depot", accent: "#06d4e8" })}
              </div>
            </div>

            {isInsertion && (
              <div className="col-span-2 lg:col-span-4 xl:max-w-[300px]">
                <span className={labelClass}>Stabling road</span>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {selectedRoads.map((road) => {
                    const active = current.road === road;
                    return (
                      <button
                        key={road}
                        type="button"
                        onClick={() => updateMovementForm(operation, "road", road)}
                        className={`rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-all ${active ? "border-blue-400 bg-blue-600/30 text-white" : "border-[#1e4060] bg-[#061827] text-[#7eb8e0] hover:border-[#4f8ef7] hover:text-white"}`}
                      >
                        {road}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!isSwapping && (
              <label className="col-span-1 lg:col-span-2 xl:max-w-[105px]">
                <span className={labelClass}>TID <span className="text-[#4a6b85]">(optional)</span></span>
                <input
                  value={current.tid}
                  onChange={(e) => updateMovementForm(operation, "tid", e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 101"
                  className={inputClass}
                />
              </label>
            )}

            {isSwapping && (
              <>
                <label className="col-span-1 lg:col-span-4">
                  <span className={labelClass}>Reason swap</span>
                  <input
                    value={current.swapReason}
                    onChange={(e) => updateMovementForm(operation, "swapReason", e.target.value)}
                    placeholder="e.g. RST PM"
                    className={inputClass}
                  />
                </label>
                <label className="col-span-1 lg:col-span-3">
                  <span className={labelClass}>Replaced by train</span>
                  <div className={glowInputBoxClass}>
                    <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
                    <input
                      value={current.replacedBy}
                      onChange={(e) => updateMovementForm(operation, "replacedBy", e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 30"
                      className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
                    />
                  </div>
                </label>
              </>
            )}

            <label className={`col-span-2 lg:col-span-5 ${isSwapping ? "lg:translate-y-[4px]" : ""}`}>
              <span className={labelClass}>Notes <span className="text-[#4a6b85]">(optional)</span></span>
              <textarea
                value={current.notes}
                onChange={(e) => updateMovementForm(operation, "notes", e.target.value)}
                placeholder="Any additional remarks..."
                className="mt-1 h-8 min-h-0 w-full resize-none rounded-lg border border-[#1e4060] bg-[#061827] px-2 py-1.5 text-[11px] font-medium leading-tight text-white outline-none placeholder:text-[#31516b] focus:border-[#4f8ef7]"
              />
            </label>

            <div className="col-span-2 self-stretch rounded-lg border border-[#1e4060] bg-[#061827] px-3 py-2 lg:col-span-12">
              <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[#4a8ab5]">Preview</p>
              <p className="overflow-x-auto whitespace-nowrap font-mono text-[12px] font-medium leading-snug text-[#c8d8ea]">
                {buildMovementPreview(operation)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => addMovementLog(operation)}
              className="col-span-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium text-white shadow-[0_0_16px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.01] lg:col-span-12"
              style={{ borderColor: `${meta.accent}9a`, backgroundColor: `${meta.accent}33` }}
            >
              <span className="text-[12px] leading-none">+</span> {meta.buttonLabel}
            </button>
          </div>
        </div>
      </section>
    );
  };


  const renderTrainMovementOperationLogTable = ({ depot, operation, accent, logs }) => {
    const meta = OPERATION_META[operation];
    const depotLabel = getMovementDepotLabel(depot);
    return (
      <section className="overflow-hidden rounded-xl border" style={{ borderColor: `${meta.accent}42`, background: "linear-gradient(180deg,#041727 0%,#03111d 100%)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: `${meta.accent}30`, backgroundColor: `${meta.accent}10` }}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent || meta.accent}22`, color: accent || meta.accent }}>
              <MovementIcon type={meta.iconType} color={accent || meta.accent} />
            </span>
            <div className="min-w-0">
              <h4 className="text-[12px] font-black uppercase tracking-wide text-white">{depotLabel} — {meta.logTitle}</h4>
              <p className="text-[10px] font-semibold text-[#8ea8c0]">{logs.length} entries</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => clearDepotOperationLogs(depot, operation)}
              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02]"
              style={{ borderColor: `${meta.accent}55`, color: meta.accent, backgroundColor: `${meta.accent}14` }}
            >
              <MovementIcon type="trash" />Clear
            </button>
          </div>
        </div>

        <div className="min-h-[80px]">
          {logs.length === 0 ? (
            <div className="flex min-h-[80px] items-center justify-center px-3 text-center text-[11px] font-semibold text-[#7eb8e0]">
              {meta.emptyText}
            </div>
          ) : (
            logs.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-center gap-2 border-b border-[#12304a]/55 px-3 py-1.5 last:border-b-0"
              >
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#f4f8ff]">
                  {renderMovementLogLine(entry)}
                </p>
                <button
                  type="button"
                  onClick={() => copySingleMovementLog(entry)}
                  title="Copy this log"
                  aria-label="Copy this log"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent opacity-80 transition-all hover:scale-[1.04] group-hover:opacity-100"
                  style={{ color: meta.accent }}
                >
                  {copyFeedback[`movement-entry-${entry.id}`] === "copied" ? (
                    <span className="text-[11px] font-black leading-none">✓</span>
                  ) : (
                    <MovementIcon type="copy" color="currentColor" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeMovementLog(entry.id)}
                  title="Delete this log"
                  aria-label="Delete this log"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-red-400 opacity-80 transition-all hover:border-red-500/60 hover:bg-red-950/35 hover:text-red-300 group-hover:opacity-100"
                >
                  <MovementIcon type="trash" color="currentColor" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    );
  };

  const renderTrainMovementOperationWindow = (operation) => {
    const meta = OPERATION_META[operation];
    const westLogs = entries.filter((entry) => entry.depot === "west" && entry.operation === operation);
    const eastLogs = entries.filter((entry) => entry.depot === "east" && entry.operation === operation);
    const totalLogs = westLogs.length + eastLogs.length;

    return (
      <section
        key={operation}
        className="overflow-hidden rounded-xl border shadow-[0_14px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{
          borderColor: `${meta.accent}55`,
          background: "linear-gradient(180deg,#071e33 0%,#061827 100%)",
          boxShadow: `0 0 24px ${meta.accent}16, inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-3" style={{ borderColor: `${meta.accent}35`, background: `linear-gradient(90deg, ${meta.accent}1f, transparent)` }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${meta.accent}24`, color: meta.accent, boxShadow: `0 0 14px ${meta.accent}22` }}>
              <MovementIcon type={meta.iconType} color={meta.accent} />
            </div>
            <div>
              <h2 className="text-[16px] font-black leading-tight text-white">{meta.title} Movement + Log</h2>
              <p className="mt-0.5 text-[11px] font-medium" style={{ color: meta.accent }}>One window for input and output log</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border px-2 py-1 text-[10px] font-black" style={{ borderColor: `${meta.accent}55`, backgroundColor: `${meta.accent}1c`, color: meta.accent }}>
              {totalLogs} entries
            </span>
            <span className="rounded-md border border-[#1e4060] bg-[#061827] px-2 py-1 text-[10px] font-bold text-[#8ea8c0]">
              WD {westLogs.length} • ED {eastLogs.length}
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-4">
          {renderMovementFormCard(operation)}

          <div className="grid content-start gap-3">
            {renderTrainMovementOperationLogTable({ depot: "west", operation, accent: "#8b5cf6", logs: westLogs })}
            {renderTrainMovementOperationLogTable({ depot: "east", operation, accent: "#06d4e8", logs: eastLogs })}
          </div>
        </div>
      </section>
    );
  };

  const renderTp1MovementWindow = () => {
    const movementType = getTp1MovementType();
    const isAutomatic = movementType === "automatic";
    const accent = isAutomatic ? "#22c55e" : "#f59e0b";
    const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#58a6ff]";
    const inputClass = "h-8 w-full rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] focus:border-[#4f8ef7]";
    const glowInputBoxClass = "flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7bc4] bg-[#061827] px-2 shadow-[0_0_12px_rgba(79,142,247,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all focus-within:border-[#7ab7ff] focus-within:shadow-[0_0_16px_rgba(79,142,247,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]";
    const timeInputBoxClass = "flex h-8 w-full items-center gap-1.5 rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus-within:border-[#4f8ef7]";

    const renderTp1TimeInput = (field, disabled = false) => (
      <div className={`${timeInputBoxClass} ${disabled ? "cursor-not-allowed opacity-35" : ""}`}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={tp1Form[field]}
          onKeyDown={(e) => {
            const value = String(tp1Form[field] || "");
            const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
            if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
              e.preventDefault();
              updateTp1MovementForm(field, value.slice(0, -2));
            }
          }}
          onChange={(e) => updateTp1MovementForm(field, cleanTp1MovementTimeInput(e.target.value))}
          onBlur={(e) => updateTp1MovementForm(field, normalizeMovementCustomTimeInput(e.target.value))}
          placeholder="00:00"
          disabled={disabled}
          className="h-full min-w-0 flex-1 bg-transparent text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] disabled:cursor-not-allowed"
        />
        <span className="shrink-0 text-[10px] font-medium text-[#8ea8c0]">hrs</span>
      </div>
    );

    const renderTypeButton = (type, title, subtitle, color) => {
      const active = movementType === type;
      return (
        <button
          type="button"
          onClick={() => updateTp1MovementForm("movementType", type)}
          className="rounded-lg border px-3 py-2 text-left transition-all"
          style={{
            borderColor: active ? color : "#1e4060",
            background: active ? `linear-gradient(135deg, ${color}30, #061827 86%)` : "#061827",
            boxShadow: active ? `0 0 18px ${color}26, inset 0 1px 0 rgba(255,255,255,0.06)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <span className="block text-[12px] font-semibold text-white">{title}</span>
          <span className="mt-0.5 block text-[10px] font-medium text-[#8ea8c0]">{subtitle}</span>
        </button>
      );
    };

    return (
      <section
        className="overflow-hidden rounded-xl border shadow-[0_14px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)] xl:sticky xl:top-3"
        style={{
          borderColor: `${accent}55`,
          background: "linear-gradient(180deg,#071e33 0%,#061827 100%)",
          boxShadow: `0 0 24px ${accent}16, inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-3" style={{ borderColor: `${accent}35`, background: `linear-gradient(90deg, ${accent}1f, transparent)` }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}24`, color: accent, boxShadow: `0 0 14px ${accent}22` }}>
              <MovementIcon type="train" color={accent} />
            </div>
            <div>
              <h2 className="text-[16px] font-black leading-tight text-white">Inbound / Outbound Movement</h2>
              <p className="mt-0.5 text-[11px] font-medium" style={{ color: accent }}>Automatic / Manual Area log generator</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border px-2 py-1 text-[10px] font-black" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}1c`, color: accent }}>
              {tp1Entries.length} entries
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            {renderTypeButton("automatic", "Automatic Area", "Fill TR Localized", "#22c55e")}
            {renderTypeButton("manual", "Manual Area", "Fill From TP1 + to Manual", "#f59e0b")}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="col-span-1">
              <span className={labelClass}>Train Set</span>
              <div className={glowInputBoxClass}>
                <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
                <input
                  value={tp1Form.trainSet}
                  onChange={(e) => updateTp1MovementForm("trainSet", e.target.value.replace(/\D/g, ""))}
                  placeholder="19"
                  className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
                />
              </div>
            </label>

            <label className="col-span-1">
              <span className={labelClass}>Plan / Unplanned</span>
              <select
                value={tp1Form.planStatus}
                onChange={(e) => updateTp1MovementForm("planStatus", e.target.value)}
                className={inputClass}
              >
                <option value="Planned">Planned</option>
                <option value="Unplanned">Unplanned</option>
              </select>
            </label>

            <label className="col-span-1">
              <span className={labelClass}>TR at TP1</span>
              {renderTp1TimeInput("trAtTp1")}
            </label>

            <label className="col-span-1">
              <span className={labelClass}>Shunter Name</span>
              <select
                value={tp1Form.shunterName}
                onChange={(e) => updateTp1MovementForm("shunterName", e.target.value)}
                className={inputClass}
              >
                <option value="">Select Shunter</option>
                {SHUNTER_NAME_OPTIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            {isAutomatic && (
              <label className="col-span-1">
                <span className={labelClass}>TR Localized</span>
                {renderTp1TimeInput("trLocalized")}
              </label>
            )}

            <label className="col-span-2">
              <span className={labelClass}>Next Wash <span className="normal-case tracking-normal text-[#6f8fa8]">Optional</span></span>
              <input
                type="text"
                maxLength={19}
                value={tp1Form.nextWashText || ""}
                onChange={(e) => updateTp1MovementForm("nextWashText", e.target.value)}
                placeholder="28-05-2026 12:23:00"
                className={inputClass}
              />
            </label>

            {!isAutomatic && (
              <>
                <label className="col-span-1">
                  <span className={labelClass}>From TP1</span>
                  {renderTp1TimeInput("fromTp1")}
                </label>

                <label className="col-span-1">
                  <span className={labelClass}>to Manual</span>
                  {renderTp1TimeInput("toManual")}
                </label>
              </>
            )}
          </div>

          <div className="rounded-xl border border-[#1e4060] bg-[#041727] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#4a8ab5]">Preview</p>
              <span className="rounded-md border px-2 py-1 text-[10px] font-bold" style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}12` }}>
                {isAutomatic ? "Automatic" : "Manual"}
              </span>
            </div>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap font-mono text-[12px] font-medium leading-[1.35] text-[#c8d8ea]">{buildTp1MovementText({ preview: true })}</pre>
          </div>

          <button
            type="button"
            onClick={addTp1MovementLog}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium text-white shadow-[0_0_16px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.01]"
            style={{ borderColor: `${accent}9a`, backgroundColor: `${accent}33` }}
          >
            <span className="text-[12px] leading-none">+</span> Add Inbound / Outbound Movement Log
          </button>

          <section className="overflow-hidden rounded-xl border border-[#1e4060] bg-[#03111d]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#12304a] px-3 py-2">
              <div>
                <h4 className="text-[12px] font-black uppercase tracking-wide text-white">Inbound / Outbound Movement Log</h4>
                <p className="text-[10px] font-semibold text-[#8ea8c0]">{tp1Entries.length} entries</p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyTp1MovementLogs}
                  className="flex min-w-[78px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02]"
                  style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
                >
                  <MovementIcon type="copy" />{getTp1CopyButtonLabel("Copy All")}
                </button>
                <button
                  type="button"
                  onClick={clearTp1MovementLogs}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02]"
                  style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
                >
                  <MovementIcon type="trash" />Clear
                </button>
              </div>
            </div>

            <div className="min-h-[120px]">
              {tp1Entries.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center px-3 text-center text-[11px] font-semibold text-[#7eb8e0]">
                  No inbound / outbound movement log yet.
                </div>
              ) : (
                tp1Entries.map((entry) => (
                  <div key={entry.id} className="group flex items-start gap-2 border-b border-[#12304a]/55 px-3 py-2 last:border-b-0">
                    <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] font-semibold leading-[1.32] tracking-[-0.01em] text-[#f4f8ff]">{entry.text}</pre>
                    <button
                      type="button"
                      onClick={() => removeTp1MovementLog(entry.id)}
                      title="Delete this log"
                      aria-label="Delete this log"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-red-400 opacity-80 transition-all hover:border-red-500/60 hover:bg-red-950/35 hover:text-red-300 group-hover:opacity-100"
                    >
                      <MovementIcon type="trash" color="currentColor" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    );
  };

  const TrainMovementDepotCard = ({ depot, title, accent, logs }) => {
    const insertionLogs = logs.filter((entry) => entry.operation === "insertion");
    const removalLogs = logs.filter((entry) => entry.operation === "removal");
    const swapLogs = logs.filter((entry) => entry.operation === "swapping");

    return (
      <section
        className="overflow-hidden rounded-xl border"
        style={{
          borderColor: `${accent}55`,
          background: depot === "west" ? "linear-gradient(180deg,rgba(35,18,77,0.58),rgba(6,24,39,0.94))" : "linear-gradient(180deg,rgba(8,73,86,0.48),rgba(6,24,39,0.94))",
          boxShadow: `0 0 24px ${accent}18, inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-3" style={{ borderColor: `${accent}3a`, background: `linear-gradient(90deg, ${accent}17, transparent)` }}>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}66)`, boxShadow: `0 0 18px ${accent}55` }}>
              <MovementIcon type="train" color="#ffffff" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-black uppercase tracking-wide text-white">{title}</h3>
                <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-black" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}1c`, color: accent }}>
                  {logs.length} entries
                </span>
              </div>
              <p className="mt-0.5 text-[10px] font-medium text-[#8ea8c0]">
                Insertions {insertionLogs.length} • Removals {removalLogs.length} • Swaps {swapLogs.length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => copyDepotLogs(depot)} className="flex min-w-[82px] items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-all hover:scale-[1.02]" style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}><MovementIcon type="copy" />{getCopyButtonLabel(depot, "all", "Copy All")}</button>
            <button onClick={() => clearDepotLogs(depot)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-all hover:scale-[1.02]" style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}><MovementIcon type="trash" />Clear All</button>
          </div>
        </div>

        <div className="grid gap-3 p-4">
          {renderTrainMovementOperationLogTable({ depot, operation: "insertion", accent, logs: insertionLogs })}
          {renderTrainMovementOperationLogTable({ depot, operation: "removal", accent, logs: removalLogs })}
          {renderTrainMovementOperationLogTable({ depot, operation: "swapping", accent, logs: swapLogs })}
        </div>
      </section>
    );
  };

  return (
    <div className="grid w-full gap-3 xl:grid-cols-2 xl:items-start">
      <section className="rounded-xl border border-[#2b4f6b] bg-[#071e33] shadow-[0_14px_30px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1a3a56] px-4 py-3" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/25 text-blue-300 shadow-[0_0_14px_rgba(59,130,246,0.22)]">
              <MovementIcon type="train" />
            </div>
            <div>
              <h2 className="text-[17px] font-black leading-tight text-white">Train Movement + Log</h2>
              <p className="mt-0.5 text-[11px] font-medium text-[#58a6ff]">Swapping, Insertion, and Removal are separated into their own input + log windows</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-[#2b4f6b] bg-[#061827] px-3 py-1.5 font-mono text-[11px] font-bold text-[#7eb8e0]">
              {clockText} hrs
            </span>
            <span className="rounded-lg border border-[#2b4f6b] bg-[#061827] px-3 py-1.5 text-[11px] font-bold text-[#8ea8c0]">
              {entries.length} total logs
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-4">
          {MOVEMENT_OPERATIONS.map((operation) => renderTrainMovementOperationWindow(operation))}
        </div>
      </section>

      {renderTp1MovementWindow()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────


function buildPSTExportLinesFromVisibleState({
  westData = {},
  eastData = {},
  pstState = {},
  logLines = [],
} = {}) {
  // Excel export must follow the visible PST table, not only the saved logLines.
  // This prevents East Depot from exporting only 7 trains when both ED-ST02 and ED-ST03
  // are already marked completed on screen.
  const existingPstByKey = new Map(
    (Array.isArray(logLines) ? logLines : [])
      .filter((entry) => entry?.type === "PST" && entry?.key)
      .map((entry) => [entry.key, entry])
  );

  const exportLines = [];

  const collectDepot = (depot, roads, data) => {
    roads.forEach((road) => {
      const blocks = Array.isArray(data?.[road]) ? data[road] : [];

      blocks.forEach((block, bi) => {
        const cellKey = `${road}-${bi}`;
        const pst = pstState?.[cellKey];

        if (!pst?.done) return;

        const trainKey = padTrainId(normalizeTrainId(block?.trainId || ""));
        if (!trainKey) return;

        const logKey = `pst-${cellKey}`;
        const oldEntry = existingPstByKey.get(logKey);
        const oldTrainKey = padTrainId(normalizeTrainId(oldEntry?.trainKey || ""));
        const sameTrain = oldTrainKey === trainKey;

        const startTime = pst.startTime || (sameTrain ? oldEntry?.startTime : "") || "";
        const endTime = pst.endTime || (sameTrain ? oldEntry?.endTime : "") || "";
        const alarmStatus = pst.alarmStatus || (sameTrain ? oldEntry?.alarmStatus : "") || "no_alarm";
        const depotLabel = depot === "west" ? "WD" : "ED";
        const roadFormatted = road.replace(/^(WD|ED)-/, `${depotLabel}\u2013`);
        const alarmText = alarmStatus === "alarm" ? " Alarm reported." : " No alarm reported.";
        const generatedText = `${startTime} hrs \u2013 PST commenced at ${roadFormatted} for ${trainKey}. Completed at ${endTime} hrs.${alarmText}`;

        exportLines.push({
          ...(sameTrain ? oldEntry : {}),
          key: logKey,
          text: sameTrain && oldEntry?.text ? oldEntry.text : generatedText,
          type: "PST",
          depot,
          road,
          trainKey,
          startTime,
          endTime,
          alarmStatus,
        });
      });
    });
  };

  collectDepot("west", WEST_ROADS, westData);
  collectDepot("east", EAST_ROADS, eastData);

  return sortPSTLogLinesByTime(exportLines);
}

function PSTTabContent
({ westData, eastData, maintenanceMap, pstState, prepState, logLines, onPSTTick, onPSTStartTimeChange, onPrepTick, onRemoveLog, onClearDepotLog, onClearDepotPSTOnly, onClearDepotPrepOnly, taNameState, onTaNameChange, completedByNames, onCompletedByChange, pstLiveStatusText, pstLiveStatusClass, pstLiveDebug }) {
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const safeCompletedByNames = completedByNames || { west: "", east: "" };
  const sortedLogLines = sortPSTLogLinesByTime(logLines);
  const exportLogLines = buildPSTExportLinesFromVisibleState({
    westData,
    eastData,
    pstState,
    logLines: sortedLogLines,
  });

  const handleCompletedByChange = (depot, value) => {
    onCompletedByChange?.(depot, value);
  };

  const handleDownloadExcel = () => {
    if (downloadingExcel) return;

    const pstEntries = (exportLogLines || []).filter((entry) => entry?.type === "PST");
    if (pstEntries.length === 0) {
      alert("No completed PST log to export yet.");
      return;
    }

    const completedBy = normalizeCompletedByNames(safeCompletedByNames);
    const hasWestPST = pstEntries.some((entry) => getPSTDepotFromEntry(entry) === "west");
    const hasEastPST = pstEntries.some((entry) => getPSTDepotFromEntry(entry) === "east");

    if (hasWestPST && !completedBy.west) {
      alert("Please enter West Depot completed by name before downloading the Excel file.");
      return;
    }

    if (hasEastPST && !completedBy.east) {
      alert("Please enter East Depot completed by name before downloading the Excel file.");
      return;
    }

    try { localStorage.setItem("pstExcelCompletedByNames", JSON.stringify(completedBy)); } catch {}
    setDownloadingExcel(true);

    try {
      downloadPSTExcelExport(exportLogLines, completedBy);
    } catch (error) {
      console.error("PST Excel export failed:", error);
      alert("Unable to create Excel export. Please try again.");
    } finally {
      setDownloadingExcel(false);
    }
  };


  const liveStatusText = pstLiveStatusText || "PST Local only";
  const liveStatusTitle = /local/i.test(liveStatusText)
    ? "PST LOCAL"
    : /issue/i.test(liveStatusText)
    ? "PST SYNC"
    : "PST LIVE";
  const liveStatusSubtext =
    liveStatusText
      .replace(/^PST\s+Live\s*/i, "")
      .replace(/^PST\s*/i, "")
      .replace(/^synced/i, "Synced")
      .replace(/^syncing/i, "Syncing")
      .replace(/^ready/i, "Ready")
      .replace(/^local/i, "Local")
      .replace(/^sync issue/i, "Sync issue")
      .trim() || liveStatusText;
  const isLiveHealthy = !/local|issue/i.test(liveStatusText);
  const liveAccent = isLiveHealthy ? "#22c55e" : "#f59e0b";

  return (
    <div className="flex flex-col gap-5 w-fit">
      <div className="space-y-5 min-w-0">
        <PSTStablingSection title="WEST DEPOT — PST / TRAIN PREP" blockLabels={["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"]} blockIndices={[6,5,4,3,2,1,0]} roads={WEST_ROADS} data={westData} labelSide="left" maintenanceMap={maintenanceMap} pstState={pstState} prepState={prepState} onPSTTick={onPSTTick} onPSTStartTimeChange={onPSTStartTimeChange} onPrepTick={onPrepTick} taNameState={taNameState} onTaNameChange={onTaNameChange} onClearPST={() => onClearDepotPSTOnly?.("west")} onClearPrep={() => onClearDepotPrepOnly?.("west")} />
        <PSTStablingSection title="EAST DEPOT — PST / TRAIN PREP" blockLabels={["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"]} blockIndices={[0,1,2,3,4,5,6]} roads={EAST_ROADS} data={eastData} labelSide="right" maintenanceMap={maintenanceMap} pstState={pstState} prepState={prepState} onPSTTick={onPSTTick} onPSTStartTimeChange={onPSTStartTimeChange} onPrepTick={onPrepTick} taNameState={taNameState} onTaNameChange={onTaNameChange} onClearPST={() => onClearDepotPSTOnly?.("east")} onClearPrep={() => onClearDepotPrepOnly?.("east")} />
      </div>

      <div className="w-full max-w-[960px]">
        <div
          data-pst-live-status-class={pstLiveStatusClass || ""}
          className="mb-3 flex flex-col gap-4 rounded-2xl border px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
          style={{
            background: "linear-gradient(135deg, rgba(7,24,40,0.98) 0%, rgba(8,38,61,0.94) 48%, rgba(6,18,31,0.98) 100%)",
            borderColor: "rgba(79,142,247,0.28)",
            boxShadow: "0 18px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex min-w-[170px] items-center gap-3 lg:border-r lg:border-[#2b4f6b]/70 lg:pr-5">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: `${liveAccent}22` }}>
              <span className="absolute inline-flex h-10 w-10 rounded-full opacity-35 animate-ping" style={{ backgroundColor: liveAccent }} />
              <span
                className="relative h-5 w-5 rounded-full border"
                style={{
                  backgroundColor: liveAccent,
                  borderColor: `${liveAccent}aa`,
                  boxShadow: `0 0 18px ${liveAccent}aa`,
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[15px] font-medium uppercase leading-none tracking-wide" style={{ color: liveAccent }}>
                {liveStatusTitle}
              </div>
              <div className="mt-1 whitespace-nowrap text-[12px] font-normal text-slate-300">
                {liveStatusSubtext}
              </div>
              {pstLiveDebug && (
                <div className="mt-1 max-w-[260px] text-[10px] font-semibold leading-tight text-amber-300/85">
                  {pstLiveDebug}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-center">
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap lg:pr-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7da9ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.16em] text-blue-200">
                Completed By
              </span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium tracking-wide text-[#58a6ff]">West Depot</span>
                <input
                  type="text"
                  value={safeCompletedByNames.west}
                  onChange={(e) => handleCompletedByChange("west", e.target.value)}
                  placeholder="West name"
                  className="h-9 w-full rounded-xl border px-3 text-[12px] font-normal outline-none transition-all sm:w-40"
                  style={{
                    background: "linear-gradient(180deg,#071d31,#061827)",
                    borderColor: "rgba(88,166,255,0.42)",
                    color: "#e2eaf4",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium tracking-wide text-purple-300">East Depot</span>
                <input
                  type="text"
                  value={safeCompletedByNames.east}
                  onChange={(e) => handleCompletedByChange("east", e.target.value)}
                  placeholder="East name"
                  className="h-10 w-full rounded-xl border px-3 text-[13px] font-bold outline-none transition-all sm:w-40"
                  style={{
                    background: "linear-gradient(180deg,#071d31,#061827)",
                    borderColor: "rgba(192,132,252,0.48)",
                    color: "#e2eaf4",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                />
              </label>
            </div>
          </div>

          <div className="lg:border-l lg:border-[#2b4f6b]/70 lg:pl-6">
            <button
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-5 text-[12px] font-semibold transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.16), rgba(6,78,59,0.22))",
                borderColor: "rgba(34,197,94,0.62)",
                color: "#86efac",
                boxShadow: "0 0 18px rgba(34,197,94,0.16), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
              title="Download RL3 Passenger Service Test Excel"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadingExcel ? "Preparing Excel..." : "Download Excel"}
            </button>
          </div>
        </div>

        <div className="pst-train-prep-log-font-bump">
          <style>{`
          /* PST / Train Prep Log title: keep slightly smaller than the log text */
          .pst-train-prep-log-font-bump :is(h1, h2, h3),
          .pst-train-prep-log-font-bump [data-log-title],
          .pst-train-prep-log-font-bump .log-title,
          .pst-train-prep-log-font-bump .pst-log-title {
            font-size: 18px !important;
            line-height: 1.25 !important;
          }

          /* PST / Train Prep actual log text: force compact 13px text */
          .pst-train-prep-log-font-bump :is(pre, code, textarea),
          .pst-train-prep-log-font-bump [class*="font-mono"],
          .pst-train-prep-log-font-bump [class*="whitespace-pre"],
          .pst-train-prep-log-font-bump [class*="text-[8px]"],
          .pst-train-prep-log-font-bump [class*="text-[9px]"],
          .pst-train-prep-log-font-bump [class*="text-[10px]"],
          .pst-train-prep-log-font-bump [class*="text-[11px]"],
          .pst-train-prep-log-font-bump [class*="text-xs"],
          .pst-train-prep-log-font-bump [data-log-line],
          .pst-train-prep-log-font-bump .log-line,
          .pst-train-prep-log-font-bump .log-content,
          .pst-train-prep-log-font-bump .log-output,
          .pst-train-prep-log-font-bump .pst-log-line,
          .pst-train-prep-log-font-bump .pst-log-content {
            font-size: 13px !important;
            line-height: 1.1 !important;
          }

          /* Make the PST / Train Prep Log output tighter vertically */
          .pst-train-prep-log-font-bump :is(p, pre, div, section) {
            line-height: 1.1 !important;
          }

          .pst-train-prep-log-font-bump :is(p, pre) {
            margin-top: 0.05rem !important;
            margin-bottom: 0.05rem !important;
          }

          .pst-train-prep-log-font-bump :is(hr) {
            margin-top: 0.2rem !important;
            margin-bottom: 0.2rem !important;
          }

          .pst-train-prep-log-font-bump [class*="space-y-"] > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.12rem !important;
          }

          .pst-train-prep-log-font-bump [class*="gap-"] {
            gap: 0.12rem !important;
          }

          .pst-train-prep-log-font-bump [class*="py-"] {
            padding-top: 0.25rem !important;
            padding-bottom: 0.25rem !important;
          }

          .pst-train-prep-log-font-bump [class*="px-"] {
            padding-left: 0.75rem !important;
            padding-right: 0.75rem !important;
          }
        `}</style>
          <PSTLogOutput logLines={sortedLogLines} onRemove={onRemoveLog} onClearDepot={onClearDepotLog} />
        </div>
      </div>
    </div>
  );
}

// ── Possession tab content (uses DepotStabling shared header + sidebar) ──────
function parsePossessionTimeTo24(raw) {
  if (!raw) return "";
  const clean = String(raw).trim();

  const isValid = (hour, minute) => hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;

  const h24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = Number(h24[2]);
    if (!isValid(hour, minute)) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // Backward compatibility for old saved data only. The input fields below no longer accept AM/PM text.
  const h12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (h12) {
    let hour = Number(h12[1]);
    const minute = Number(h12[2]);
    const period = h12[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return "";
    if (period === "AM" && hour === 12) hour = 0;
    if (period === "PM" && hour !== 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return "";
}

function fmtPossession24(raw) { const t = parsePossessionTimeTo24(raw); return t ? `${t} hrs` : ""; }
function cleanPossessionAccessNo(raw) { return raw.replace(/,/g, ""); }

function formatPossessionTimeInput(raw, previousValue = "") {
  const value = String(raw || "").toUpperCase();

  // If user backspaces the auto colon from 12:, keep 12 instead of immediately forcing 12: again.
  if (previousValue?.endsWith(":") && value === previousValue.slice(0, -1)) return value;

  const digits = value.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length <= 1) return digits;
  if (digits.length === 2) return `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// ── Dark-themed shared primitives ─────────────────────────────────────────────

function PossessionCopyBtn({ text, disabled }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    if (disabled || !text) return;
    navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handle} disabled={disabled || !text}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#1e3a56] bg-[#0a1e2e] text-[#7eb8e0] hover:bg-[#0f2d4a] hover:border-[#2b4f6b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
      {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy Output"}
    </button>
  );
}

const POSSESSION_FIELD = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-semibold text-[#4a8ab5] tracking-widest uppercase mb-1">{label}</label>
    {children}
  </div>
);

const possessionInputCls = "w-full rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b]";

const POSSESSION_INPUT = ({ value, onChange, placeholder, className = "" }) => (
  <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || ""}
    className={`${possessionInputCls} ${className}`} />
);

const POSSESSION_SELECT = ({ value, onChange, children, className = "" }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    className={`${possessionInputCls} ${className}`}>
    {children}
  </select>
);

const POSSESSION_TIME_INPUT = ({ value, onChange, placeholder = "e.g. 04:17", className = "" }) => (
  <input
    value={value}
    onChange={(e) => onChange(formatPossessionTimeInput(e.target.value, value))}
    placeholder={placeholder}
    inputMode="numeric"
    maxLength={5}
    autoComplete="off"
    className={`${possessionInputCls} font-mono tracking-wide ${className}`}
  />
);

const POSSESSION_TEXTAREA = ({ value, onChange, placeholder, rows = 2 }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || ""} rows={rows}
    className="w-full rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b] resize-none" />
);

// ── Shared card/header styles ─────────────────────────────────────────────────
const possessionCardCls = "bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden";
const possessionHeaderCls = "border-b border-[#1a3a56] px-4 py-3 flex items-center justify-between";
const possessionHeaderStyle = { background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" };

// ── Section 1: Possession Log ─────────────────────────────────────────────────
const POSSESSION_LOG_KEY = "possessionLog_v2";

const defaultEntry = () => ({ picName: "", picId: "", description: "", accessNo: "", issueTime: "", accessPoint: "", accessAuthTime: "", scd: "Yes", scdLoc: "", scdApplyTime: "", scdRemTime: "", handbackTime: "" });

function generateEntryOutput(f) {
  const access = cleanPossessionAccessNo(f.accessNo);
  const lines = [];
  if (f.picName || f.picId) lines.push(`PIC - ${f.picName}${f.picId ? ` (${f.picId})` : ""}`);
  if (f.description) lines.push(f.description);
  lines.push("");
  const accessPoint = String(f.accessPoint || "").trim();
  const accessAuthT = fmtPossession24(f.accessAuthTime);
  if (f.scd !== "No" && accessAuthT && accessPoint) {
    lines.push(`${accessAuthT} – PIC${f.picName ? ` ${f.picName}` : ""} authorized to access ${accessPoint} and start apply the SCD.`);
  }
  if (f.scd === "Yes" && (f.scdApplyTime || f.scdRemTime || f.scdLoc)) {
    const applyT = fmtPossession24(f.scdApplyTime); const remT = fmtPossession24(f.scdRemTime);
    let scdLine = "";
    if (applyT) scdLine += `${applyT} - SCD applied${f.scdLoc ? ` at ${f.scdLoc}` : ""}.`;
    if (remT) scdLine += ` At ${remT} SCD confirmed removed.`;
    if (scdLine) lines.push(scdLine);
  }
  const issueT = fmtPossession24(f.issueTime);
  if (issueT && access) lines.push(`${issueT} - CMMS updated to ISSUED (Access #${access})`);
  const handbackT = fmtPossession24(f.handbackTime);
  if (handbackT && access) lines.push(`${handbackT} - CMMS updated to COMP (Access #${access})`);
  return lines.join("\n");
}

function AccessEntryForm({ entry, index, onChange, onRemove, canRemove }) {
  const set = (field) => (val) => onChange({ ...entry, [field]: val });
  return (
    <div className="rounded-xl border border-[#1e3a56] overflow-hidden bg-[#071828]">
      <div className="border-b border-[#1e3a56] px-3 py-2 flex items-center justify-between" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <span className="text-[11px] font-black text-[#7eb8e0] tracking-widest uppercase">Access Entry {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-colors">
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <POSSESSION_FIELD label="PIC Name"><POSSESSION_INPUT value={entry.picName} onChange={set("picName")} placeholder="Full name" /></POSSESSION_FIELD>
          <POSSESSION_FIELD label="PIC ID"><POSSESSION_INPUT value={entry.picId} onChange={set("picId")} placeholder="e.g. FLOW_8545" /></POSSESSION_FIELD>
        </div>
        <POSSESSION_FIELD label="Description"><POSSESSION_TEXTAREA value={entry.description} onChange={set("description")} placeholder="Work description..." rows={2} /></POSSESSION_FIELD>
        <div className="grid grid-cols-2 gap-3">
          <POSSESSION_FIELD label="Access No."><POSSESSION_INPUT value={entry.accessNo || ""} onChange={set("accessNo")} placeholder="e.g. 268,216" /></POSSESSION_FIELD>
          <POSSESSION_FIELD label="Issue Time"><POSSESSION_TIME_INPUT value={entry.issueTime || ""} onChange={set("issueTime")} placeholder="e.g. 04:17" /></POSSESSION_FIELD>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <POSSESSION_FIELD label="Access Point"><POSSESSION_INPUT value={entry.accessPoint || ""} onChange={set("accessPoint")} placeholder="e.g. DOOR B01" /></POSSESSION_FIELD>
          <POSSESSION_FIELD label="Access Authorized Time"><POSSESSION_TIME_INPUT value={entry.accessAuthTime || ""} onChange={set("accessAuthTime")} placeholder="e.g. 18:10" /></POSSESSION_FIELD>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#4a8ab5] tracking-widest uppercase mb-1">SCD?</label>
          <div className="flex gap-1.5">
            {["Yes", "No"].map((opt) => (
              <button key={opt} type="button" onClick={() => set("scd")(opt)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${entry.scd === opt ? "bg-[#0f2d4a] text-[#c8d8ea] border-[#4f8ef7]" : "bg-[#071828] text-[#4a8ab5] border-[#1e3a56] hover:border-[#2b4f6b] hover:text-[#c8d8ea]"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
        {entry.scd === "Yes" && (
          <div className="space-y-3 rounded-xl border border-amber-800/40 bg-amber-950/20 p-3">
            <POSSESSION_FIELD label="SCD Location"><POSSESSION_INPUT value={entry.scdLoc} onChange={set("scdLoc")} placeholder="e.g. Building A" /></POSSESSION_FIELD>
            <div className="grid grid-cols-2 gap-3">
              <POSSESSION_FIELD label="SCD Apply Time"><POSSESSION_TIME_INPUT value={entry.scdApplyTime} onChange={set("scdApplyTime")} placeholder="e.g. 04:17" /></POSSESSION_FIELD>
              <POSSESSION_FIELD label="SCD Remove Time"><POSSESSION_TIME_INPUT value={entry.scdRemTime} onChange={set("scdRemTime")} placeholder="e.g. 02:10" /></POSSESSION_FIELD>
            </div>
          </div>
        )}
        <POSSESSION_FIELD label="Handback Time"><POSSESSION_TIME_INPUT value={entry.handbackTime} onChange={set("handbackTime")} placeholder="e.g. 08:19" /></POSSESSION_FIELD>
      </div>
    </div>
  );
}

function PossessionLog() {
  const [entries, setEntries] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POSSESSION_LOG_KEY) || "null");
      return Array.isArray(saved) && saved.length > 0
        ? saved.map((entry) => ({ ...defaultEntry(), ...entry }))
        : [defaultEntry()];
    }
    catch { return [defaultEntry()]; }
  });
  useEffect(() => { localStorage.setItem(POSSESSION_LOG_KEY, JSON.stringify(entries)); }, [entries]);
  const updateEntry = (i, val) => setEntries((prev) => prev.map((e, idx) => idx === i ? val : e));
  const addEntry = () => setEntries((prev) => [...prev, defaultEntry()]);
  const removeEntry = (i) => setEntries((prev) => prev.filter((_, idx) => idx !== i));
  const clear = () => { setEntries([defaultEntry()]); localStorage.removeItem(POSSESSION_LOG_KEY); };
  const output = entries.map(generateEntryOutput).join("\n\n");

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-[#4f8ef7]" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Possession Log</h2>
              <p className="text-[10px] text-[#4a8ab5]">{entries.length} access {entries.length === 1 ? "entry" : "entries"}</p>
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        </div>
        <div className="p-4 space-y-3">
          {entries.map((entry, i) => (<AccessEntryForm key={i} entry={entry} index={i} onChange={(val) => updateEntry(i, val)} onRemove={() => removeEntry(i)} canRemove={entries.length > 1} />))}
          <button onClick={addEntry}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-cyan-300/70 bg-cyan-400/10 text-xs font-bold text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.35),inset_0_0_14px_rgba(34,211,238,0.10)] hover:bg-cyan-400/20 hover:border-cyan-200 hover:text-white hover:shadow-[0_0_28px_rgba(34,211,238,0.70),inset_0_0_18px_rgba(34,211,238,0.18)] active:scale-[0.99] transition-all duration-200">
            <Plus className="w-3.5 h-3.5 drop-shadow-[0_0_8px_rgba(34,211,238,0.90)]" /> Add Another Access
          </button>
        </div>
      </div>
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Generated Output</h2>
            <p className="text-[10px] text-[#4a8ab5]">Formatted possession log</p>
          </div>
          <PossessionCopyBtn text={output} disabled={!output.trim()} />
        </div>
        <div className="p-4 min-h-[200px]">
          {output.trim() ? (
            <pre className="font-mono text-xs text-[#c8d8ea] whitespace-pre-wrap leading-relaxed">{output}</pre>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
              <FileText className="w-6 h-6 text-[#1e3a56]" />
              <p className="text-[10px] text-[#3a5a7a] font-semibold">Fill in the form to generate output</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section 2: Station Controller Security Message ────────────────────────────
const POSSESSION_SC_KEY = "scSecurityMessage_v1";
const defaultSC = { picName: "", phone: "", accessNo: "", description: "", location: "", gateNo: "" };

function generateSCOutput(f) {
  const access = cleanPossessionAccessNo(f.accessNo);
  return [`PIC Name: ${f.picName}`, `Mobile#: ${f.phone}`, `Access: ${access}`, `Activity: ${f.description}`, `Location: ${f.location}`, `Gate Number: ${f.gateNo}`].join("\n");
}

function SCSecurityMessage() {
  const [form, setForm] = useState(() => { try { return { ...defaultSC, ...JSON.parse(localStorage.getItem(POSSESSION_SC_KEY) || "{}") }; } catch { return defaultSC; } });
  useEffect(() => { localStorage.setItem(POSSESSION_SC_KEY, JSON.stringify(form)); }, [form]);
  const set = (field) => (val) => setForm((p) => ({ ...p, [field]: val }));
  const clear = () => { setForm(defaultSC); localStorage.removeItem(POSSESSION_SC_KEY); };
  const output = generateSCOutput(form);
  const hasContent = Object.values(form).some((v) => v.trim() !== "");

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-[#4f8ef7]" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Station Controller Security Message</h2>
              <p className="text-[10px] text-[#4a8ab5]">Fill in details to generate message</p>
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="PIC Name"><POSSESSION_INPUT value={form.picName} onChange={set("picName")} placeholder="e.g. Nawaf and Ridha" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="Phone / Mobile"><POSSESSION_INPUT value={form.phone} onChange={set("phone")} placeholder="Optional" /></POSSESSION_FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="Access Number"><POSSESSION_INPUT value={form.accessNo} onChange={set("accessNo")} placeholder="e.g. 265,404" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="Gate Number"><POSSESSION_INPUT value={form.gateNo} onChange={set("gateNo")} placeholder="e.g. 4" /></POSSESSION_FIELD>
          </div>
          <POSSESSION_FIELD label="Description / Activity"><POSSESSION_TEXTAREA value={form.description} onChange={set("description")} placeholder="e.g. TPE, ATWP01-WD, PM..." rows={3} /></POSSESSION_FIELD>
          <POSSESSION_FIELD label="Location"><POSSESSION_INPUT value={form.location} onChange={set("location")} placeholder="e.g. West Depot" /></POSSESSION_FIELD>
        </div>
      </div>
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Generated Message</h2>
            <p className="text-[10px] text-[#4a8ab5]">Formatted security message</p>
          </div>
          <PossessionCopyBtn text={hasContent ? output : ""} disabled={!hasContent} />
        </div>
        <div className="p-4 min-h-[200px]">
          {hasContent ? (
            <pre className="font-mono text-xs text-[#c8d8ea] whitespace-pre-wrap leading-relaxed">{output}</pre>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
              <Shield className="w-6 h-6 text-[#1e3a56]" />
              <p className="text-[10px] text-[#3a5a7a] font-semibold">Fill in the form to generate message</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section 3: EPAF ────────────────────────────────────────────────────────────
const POSSESSION_EPAF_KEY = "epafLog_v1";
const defaultEPAF = {
  activity: "",
  picName: "",
  location: "",
  depot: "West Depot",
  signallingAppliedTime: "",
  issuedTime: "",
  powerOffTime: "",
  scd: "Yes",
  accessPoint: "",
  accessAuthTime: "",
  scdLoc: "",
  scdApplyTime: "",
  scdRemoveTime: "",
  withdrawnTime: "",
  powerOnTime: "",
};

function buildEPAFLocation(f) {
  const location = String(f.location || "").trim();
  const depot = String(f.depot || "").trim();
  if (!location) return depot;
  if (!depot) return location;
  if (location.toLowerCase().includes(depot.toLowerCase())) return location;
  return `${location} ${depot}`;
}

function generateEPAFOutput(f) {
  const lines = [];
  const activity = String(f.activity || "").trim();
  const pic = String(f.picName || "").trim();
  const rawLocation = String(f.location || "").trim();
  const location = rawLocation ? buildEPAFLocation(f) : "";

  if (activity) lines.push(`EPAF for the ${activity}.`);
  if (pic) lines.push(`PIC : ${pic}.`);
  if (location) lines.push(`Location : ${location}.`);
  if (lines.length > 0) lines.push("");

  const signalT = fmtPossession24(f.signallingAppliedTime);
  if (signalT) lines.push(`${signalT} – Signalling protection successfully applied.`);

  const issuedT = fmtPossession24(f.issuedTime);
  const powerOffT = fmtPossession24(f.powerOffTime);
  if (issuedT && powerOffT) {
    lines.push(`${issuedT} – EPAF issued; at ${powerOffT}, third rail power has been switched off.`);
  } else if (issuedT) {
    lines.push(`${issuedT} – EPAF issued.`);
  } else if (powerOffT) {
    lines.push(`${powerOffT} – Third rail power has been switched off.`);
  }

  const scdApplyT = fmtPossession24(f.scdApplyTime);
  const scdRemoveT = fmtPossession24(f.scdRemoveTime);
  const scdLoc = String(f.scdLoc || "").trim();
  const accessPoint = String(f.accessPoint || "").trim();
  const accessAuthT = fmtPossession24(f.accessAuthTime);
  if (f.scd !== "No" && accessAuthT && accessPoint) {
    lines.push(`${accessAuthT} – PIC${pic ? ` ${pic}` : ""} authorized to access ${accessPoint} and start apply the SCD.`);
  }
  if (f.scd === "No") {
    if (scdApplyT) lines.push(`${scdApplyT} – PIC confirmed the activity does not require SCD application.`);
  } else if (scdApplyT || scdRemoveT || scdLoc) {
    let scdLine = "";
    if (scdApplyT) scdLine += `${scdApplyT} – SCD applied${scdLoc ? ` at ${scdLoc}` : ""}.`;
    else if (scdLoc) scdLine += `SCD applied at ${scdLoc}.`;
    if (scdRemoveT) scdLine += ` At ${scdRemoveT}, SCD confirmed removed.`;
    if (scdLine) lines.push(scdLine);
  }

  const withdrawnT = fmtPossession24(f.withdrawnTime);
  const powerOnT = fmtPossession24(f.powerOnTime);
  if (withdrawnT && powerOnT) {
    lines.push(`${withdrawnT} – EPAF withdrawn; at ${powerOnT}, third rail switched on; signalling protection removed.`);
  } else if (withdrawnT) {
    lines.push(`${withdrawnT} – EPAF withdrawn.`);
  } else if (powerOnT) {
    lines.push(`${powerOnT} – Third rail switched on; signalling protection removed.`);
  }

  return lines.join("\n").trim();
}

function EPAFLog() {
  const [form, setForm] = useState(() => {
    try { return { ...defaultEPAF, ...JSON.parse(localStorage.getItem(POSSESSION_EPAF_KEY) || "{}") }; }
    catch { return defaultEPAF; }
  });

  useEffect(() => { localStorage.setItem(POSSESSION_EPAF_KEY, JSON.stringify(form)); }, [form]);

  const set = (field) => (val) => setForm((p) => ({ ...p, [field]: val }));
  const clear = () => { setForm(defaultEPAF); localStorage.removeItem(POSSESSION_EPAF_KEY); };
  const output = generateEPAFOutput(form);
  const hasContent = output.trim() !== "";

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-[#4f8ef7]" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">EPAF</h2>
              <p className="text-[10px] text-[#4a8ab5]">Extended protection authority form output</p>
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="w-3 h-3" /> Clear Form
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="EPAF Title / Activity"><POSSESSION_INPUT value={form.activity} onChange={set("activity")} placeholder="e.g. ATWP BRUSH ISSUE" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="PIC Name"><POSSESSION_INPUT value={form.picName} onChange={set("picName")} placeholder="e.g. AKMAL" /></POSSESSION_FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="Location"><POSSESSION_INPUT value={form.location} onChange={set("location")} placeholder="e.g. ATWP BRUSH ISSUE" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="Depot"><POSSESSION_SELECT value={form.depot} onChange={set("depot")}>
              <option value="West Depot">West Depot</option>
              <option value="East Depot">East Depot</option>
            </POSSESSION_SELECT></POSSESSION_FIELD>
          </div>

          <div className="rounded-xl border border-[#1e3a56] bg-[#071828] p-3 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#7eb8e0]">Protection Timing</p>
            <div className="grid grid-cols-3 gap-3">
              <POSSESSION_FIELD label="Protection Applied"><POSSESSION_TIME_INPUT value={form.signallingAppliedTime} onChange={set("signallingAppliedTime")} placeholder="16:50" /></POSSESSION_FIELD>
              <POSSESSION_FIELD label="EPAF Issued"><POSSESSION_TIME_INPUT value={form.issuedTime} onChange={set("issuedTime")} placeholder="16:50" /></POSSESSION_FIELD>
              <POSSESSION_FIELD label="Third Rail OFF"><POSSESSION_TIME_INPUT value={form.powerOffTime} onChange={set("powerOffTime")} placeholder="16:50" /></POSSESSION_FIELD>
            </div>
          </div>

          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#d2a451] tracking-widest uppercase mb-1">SCD Required?</label>
              <div className="flex gap-1.5">
                {["Yes", "No"].map((opt) => (
                  <button key={opt} type="button" onClick={() => set("scd")(opt)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.scd === opt ? "bg-amber-900/60 text-amber-100 border-amber-500/70" : "bg-[#071828] text-[#4a8ab5] border-[#1e3a56] hover:border-amber-700/60 hover:text-[#c8d8ea]"}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {form.scd === "Yes" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <POSSESSION_FIELD label="Access Point"><POSSESSION_INPUT value={form.accessPoint} onChange={set("accessPoint")} placeholder="e.g. Door B01" /></POSSESSION_FIELD>
                  <POSSESSION_FIELD label="Access Authorized Time"><POSSESSION_TIME_INPUT value={form.accessAuthTime} onChange={set("accessAuthTime")} placeholder="00:00" /></POSSESSION_FIELD>
                </div>
                <POSSESSION_FIELD label="SCD Location"><POSSESSION_INPUT value={form.scdLoc} onChange={set("scdLoc")} placeholder="e.g. TRACK 1" /></POSSESSION_FIELD>
                <div className="grid grid-cols-2 gap-3">
                  <POSSESSION_FIELD label="SCD Applied Time"><POSSESSION_TIME_INPUT value={form.scdApplyTime} onChange={set("scdApplyTime")} placeholder="16:51" /></POSSESSION_FIELD>
                  <POSSESSION_FIELD label="SCD Removed Time"><POSSESSION_TIME_INPUT value={form.scdRemoveTime} onChange={set("scdRemoveTime")} placeholder="16:51" /></POSSESSION_FIELD>
                </div>
              </>
            ) : (
              <POSSESSION_FIELD label="No SCD Confirmation Time"><POSSESSION_TIME_INPUT value={form.scdApplyTime} onChange={set("scdApplyTime")} placeholder="16:51" /></POSSESSION_FIELD>
            )}
          </div>

          <div className="rounded-xl border border-[#1e3a56] bg-[#071828] p-3 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#7eb8e0]">Withdrawal</p>
            <div className="grid grid-cols-2 gap-3">
              <POSSESSION_FIELD label="EPAF Withdrawn"><POSSESSION_TIME_INPUT value={form.withdrawnTime} onChange={set("withdrawnTime")} placeholder="16:51" /></POSSESSION_FIELD>
              <POSSESSION_FIELD label="Third Rail ON"><POSSESSION_TIME_INPUT value={form.powerOnTime} onChange={set("powerOnTime")} placeholder="16:51" /></POSSESSION_FIELD>
            </div>
          </div>
        </div>
      </div>

      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Generated EPAF Output</h2>
            <p className="text-[10px] text-[#4a8ab5]">Formatted EPAF log</p>
          </div>
          <PossessionCopyBtn text={hasContent ? output : ""} disabled={!hasContent} />
        </div>
        <div className="p-4 min-h-[220px]">
          {hasContent ? (
            <pre className="font-mono text-xs text-[#c8d8ea] whitespace-pre-wrap leading-relaxed">{output}</pre>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
              <FileText className="w-6 h-6 text-[#1e3a56]" />
              <p className="text-[10px] text-[#3a5a7a] font-semibold">Fill in the EPAF form to generate output</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section 4: Sweeping ───────────────────────────────────────────────────────
const POSSESSION_SWEEP_KEY = "sweepingLog_v1";
const POSSESSION_SWEEP_ENTRIES_KEY = "sweepingLogEntries_v1";
const defaultSweep = { trainSet: "", nameTa: "", startTime: "", sweepFrom: "", sweepTo: "", lineClearTime: "" };

function formatTrainSet(val) {
  if (!val) return "";
  const clean = val.trim().replace(/^T/i, "");
  const num = clean.replace(/\D/g, "");
  return num ? `T${num}` : val.trim();
}

function generateSweepOutput(f) {
  const trainId = formatTrainSet(f.trainSet);
  const start = fmtPossession24(f.startTime);
  const lineClear = fmtPossession24(f.lineClearTime);
  if (!trainId || !start) return "";
  let line = `${start} – ${trainId} sweeping started from ${f.sweepFrom || "?"} to ${f.sweepTo || "?"}.`;
  if (f.nameTa) line += ` TA ${f.nameTa} onboard.`;
  if (lineClear) line += ` At ${lineClear}, confirmed line is clear.`;
  return line;
}

function SweepingLog() {
  const [form, setForm] = useState(() => { try { return { ...defaultSweep, ...JSON.parse(localStorage.getItem(POSSESSION_SWEEP_KEY) || "{}") }; } catch { return defaultSweep; } });
  const [logEntries, setLogEntries] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POSSESSION_SWEEP_ENTRIES_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [added, setAdded] = useState(false);

  useEffect(() => { localStorage.setItem(POSSESSION_SWEEP_KEY, JSON.stringify(form)); }, [form]);
  useEffect(() => { localStorage.setItem(POSSESSION_SWEEP_ENTRIES_KEY, JSON.stringify(logEntries)); }, [logEntries]);

  const set = (field) => (val) => setForm((p) => ({ ...p, [field]: val }));
  const clear = () => { setForm(defaultSweep); localStorage.removeItem(POSSESSION_SWEEP_KEY); };
  const clearLog = () => { setLogEntries([]); localStorage.removeItem(POSSESSION_SWEEP_ENTRIES_KEY); };
  const output = generateSweepOutput(form);
  const hasOutput = output.trim() !== "";
  const allLogsText = logEntries.map((entry) => entry.text).join("\n");

  const addToLog = () => {
    if (!hasOutput) return;
    setLogEntries((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: output }]);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  const removeLogEntry = (id) => setLogEntries((prev) => prev.filter((entry) => entry.id !== id));

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center"><Wind className="w-3.5 h-3.5 text-[#4f8ef7]" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Sweeping (after Possession)</h2>
              <p className="text-[10px] text-[#4a8ab5]">Fill details, then add to sweeping log</p>
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="w-3 h-3" /> Clear Form
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="Train Set"><POSSESSION_INPUT value={form.trainSet} onChange={set("trainSet")} placeholder="e.g. 33" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="Name TA"><POSSESSION_INPUT value={form.nameTa} onChange={set("nameTa")} placeholder="e.g. faizal" /></POSSESSION_FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="Sweeping From"><POSSESSION_INPUT value={form.sweepFrom} onChange={set("sweepFrom")} placeholder="e.g. a" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="Sweeping To"><POSSESSION_INPUT value={form.sweepTo} onChange={set("sweepTo")} placeholder="e.g. b" /></POSSESSION_FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <POSSESSION_FIELD label="Start Time"><POSSESSION_TIME_INPUT value={form.startTime} onChange={set("startTime")} placeholder="e.g. 02:32" /></POSSESSION_FIELD>
            <POSSESSION_FIELD label="Line Clear Time"><POSSESSION_TIME_INPUT value={form.lineClearTime} onChange={set("lineClearTime")} placeholder="e.g. 03:32" /></POSSESSION_FIELD>
          </div>

          {hasOutput && (
            <div className="rounded-xl border border-[#1e3a56] bg-[#071828] px-3 py-2">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#4a8ab5]">Preview</p>
              <p className="font-mono text-xs leading-relaxed text-[#c8d8ea]">{output}</p>
            </div>
          )}

          <button
            type="button"
            onClick={addToLog}
            disabled={!hasOutput}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#2b4f6b] bg-[#0f2d4a] text-xs font-bold text-[#c8d8ea] hover:bg-[#12385c] hover:border-[#4f8ef7] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {added ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> : <Plus className="w-3.5 h-3.5" />}
            {added ? "Added to Log" : "Add to Log"}
          </button>
        </div>
      </div>
      <div className={possessionCardCls}>
        <div className={possessionHeaderCls} style={possessionHeaderStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Sweeping Log</h2>
            <p className="text-[10px] text-[#4a8ab5]">{logEntries.length} {logEntries.length === 1 ? "entry" : "entries"}</p>
          </div>
          <div className="flex items-center gap-2">
            <PossessionCopyBtn text={allLogsText} disabled={!allLogsText} />
            <button onClick={clearLog} disabled={logEntries.length === 0} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Trash2 className="w-3 h-3" /> Clear Log
            </button>
          </div>
        </div>
        <div className="p-4 min-h-[160px]">
          {logEntries.length > 0 ? (
            <div className="space-y-2">
              {logEntries.map((entry, index) => (
                <div key={entry.id || `${index}-${entry.text}`} className="group rounded-xl border border-[#1e3a56] bg-[#071828] p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-700/50 bg-emerald-900/40 text-[10px] font-black text-emerald-300">{index + 1}</span>
                    <pre className="flex-1 whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#c8d8ea]">{entry.text}</pre>
                    <button
                      type="button"
                      onClick={() => removeLogEntry(entry.id)}
                      className="rounded-lg border border-red-800/40 p-1 text-red-400 opacity-70 transition-all hover:bg-red-950/40 hover:opacity-100"
                      title="Remove log"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex flex-col items-center justify-center gap-2 text-center">
              <Wind className="w-6 h-6 text-[#1e3a56]" />
              <p className="text-[10px] text-[#3a5a7a] font-semibold">Fill in the form and click Add to Log</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PossessionTabContent() {
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-5 h-5 rounded-full bg-violet-900/50 border border-violet-700/50 flex items-center justify-center text-[10px] font-black text-violet-300">1</span>
          <h1 className="text-sm font-black text-white tracking-widest uppercase">Possession Log</h1>
          <div className="flex-1 h-px bg-[#1e3a56]" />
        </div>
        <PossessionLog />
      </section>
      <div className="border-t border-[#1e3a56]" />
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-5 h-5 rounded-full bg-amber-900/50 border border-amber-700/50 flex items-center justify-center text-[10px] font-black text-amber-300">2</span>
          <h1 className="text-sm font-black text-white tracking-widest uppercase">EPAF</h1>
          <div className="flex-1 h-px bg-[#1e3a56]" />
        </div>
        <EPAFLog />
      </section>
      <div className="border-t border-[#1e3a56]" />
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-5 h-5 rounded-full bg-sky-900/50 border border-sky-700/50 flex items-center justify-center text-[10px] font-black text-sky-300">3</span>
          <h1 className="text-sm font-black text-white tracking-widest uppercase">Station Controller Security Message</h1>
          <div className="flex-1 h-px bg-[#1e3a56]" />
        </div>
        <SCSecurityMessage />
      </section>
      <div className="border-t border-[#1e3a56]" />
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-5 h-5 rounded-full bg-emerald-900/50 border border-emerald-700/50 flex items-center justify-center text-[10px] font-black text-emerald-300">4</span>
          <h1 className="text-sm font-black text-white tracking-widest uppercase">Sweeping (after Possession)</h1>
          <div className="flex-1 h-px bg-[#1e3a56]" />
        </div>
        <SweepingLog />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HeaderBookmarkDropdown({
  links,
  loading,
  error,
  isOpen,
  setIsOpen,
  menuRef,
  editId,
  draft,
  saving,
  onStartAdd,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
  onDelete,
}) {
  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all shadow-sm ${
          isOpen
            ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-100"
            : "bg-[#071828] border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10 hover:border-emerald-300/50"
        }`}
      >
        <Bookmark className="w-3.5 h-3.5" />
        Bookmarks
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[360px] overflow-hidden rounded-2xl border border-[#1f4d6f] bg-[#071828] shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-[#1a3a56] bg-[#0b253d] px-4 py-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">External Links</p>
              <p className="mt-0.5 text-[10px] text-[#7eb8e0]">Outlook, SharePoint, SAP, and other shortcuts</p>
            </div>
            <button
              type="button"
              onClick={onStartAdd}
              className="flex items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-2">
            {error && (
              <div className="mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-100">
                {error}
              </div>
            )}

            {editId === NEW_BOOKMARK_ID && (
              <BookmarkEditForm
                draft={draft}
                saving={saving}
                onDraftChange={onDraftChange}
                onCancel={onCancelEdit}
                onSave={onSave}
              />
            )}

            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#1a3a56] bg-[#082036] px-3 py-3 text-[11px] text-[#7eb8e0]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading bookmarks...
              </div>
            ) : links.length === 0 && editId !== NEW_BOOKMARK_ID ? (
              <div className="rounded-xl border border-dashed border-[#2b4f6b] bg-[#082036] px-3 py-4 text-center text-[11px] text-[#7eb8e0]">
                No bookmark yet. Click <span className="font-bold text-emerald-200">Add</span> to create an external shortcut.
              </div>
            ) : (
              <div className="space-y-1.5">
                {links.map((link, index) => {
                  const isEditing = editId === link.id;
                  const theme = getBookmarkTheme(link, index);

                  if (isEditing) {
                    return (
                      <BookmarkEditForm
                        key={link.id}
                        draft={draft}
                        saving={saving}
                        onDraftChange={onDraftChange}
                        onCancel={onCancelEdit}
                        onSave={onSave}
                      />
                    );
                  }

                  return (
                    <div
                      key={link.id}
                      className={`group relative flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 transition ${theme.card}`}
                    >
                      <span className={`absolute left-0 top-0 h-full w-1 ${theme.strip}`} />
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-2 pl-1"
                      >
                        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border ${theme.icon}`}>
                          <Bookmark className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-bold text-white">{link.title}</span>
                          <span className="block truncate text-[10px] text-[#7eb8e0]">{compactBookmarkUrl(link.url)}</span>
                        </span>
                        <ExternalLink className={`ml-auto h-3.5 w-3.5 flex-shrink-0 opacity-75 ${theme.linkIcon}`} />
                      </a>

                      <button
                        type="button"
                        onClick={() => onStartEdit(link)}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-[#2b4f6b] bg-[#071828]/80 text-[#7eb8e0] transition hover:border-cyan-300/50 hover:text-white"
                        title="Edit bookmark"
                        aria-label={`Edit ${link.title}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(link)}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-red-400/20 bg-red-500/5 text-red-200 transition hover:border-red-300/50 hover:bg-red-500/15"
                        title="Delete bookmark"
                        aria-label={`Delete ${link.title}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-[#1a3a56] bg-[#061827] px-4 py-2 text-[9px] text-[#5d94bd]">
            Links open in a new tab. Edit name or URL anytime from this dropdown.
          </div>
        </div>
      )}
    </div>
  );
}

function BookmarkEditForm({ draft, saving, onDraftChange, onCancel, onSave }) {
  return (
    <div className="mb-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
      <div className="grid gap-2">
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
          Name
          <input
            value={draft.title}
            onChange={(event) => onDraftChange("title", event.target.value)}
            placeholder="Outlook"
            className="h-8 rounded-lg border border-[#2b4f6b] bg-[#071828] px-2 text-[12px] font-medium normal-case tracking-normal text-white outline-none transition placeholder:text-[#4a8ab5] focus:border-emerald-300/60"
          />
        </label>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
          URL
          <input
            value={draft.url}
            onChange={(event) => onDraftChange("url", event.target.value)}
            placeholder="https://outlook.office.com"
            className="h-8 rounded-lg border border-[#2b4f6b] bg-[#071828] px-2 text-[12px] font-medium normal-case tracking-normal text-white outline-none transition placeholder:text-[#4a8ab5] focus:border-emerald-300/60"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-[#2b4f6b] bg-[#071828] px-3 py-1.5 text-[10px] font-bold text-[#7eb8e0] transition hover:bg-[#0f2d4a] disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Bookmark"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DepotStablingPage() {
  const [westData, setWestData] = useState(initRoads(WEST_ROADS));
  const [eastData, setEastData] = useState(initRoads(EAST_ROADS));
  const [requests, setRequests] = useState([]);
  const [trainRemCheckState, setTrainRemCheckState] = useState(() => loadTrainRemState());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError] = useState(false);
  const location = useLocation();
  const savedPST = loadSavedPSTState();
  const [pstState, setPstState] = useState(savedPST.pstState);
  const [prepState, setPrepState] = useState(savedPST.prepState);
  const [pstLogLines, setPstLogLines] = useState(savedPST.logLines);
  const [taNameState, setTaNameState] = useState(savedPST.taNameState || {});
  const [pstCompletedByNames, setPstCompletedByNames] = useState(savedPST.completedByNames || { west: "", east: "" });
  const [pstLiveLoaded, setPstLiveLoaded] = useState(false);
  const [pstLiveSyncing, setPstLiveSyncing] = useState(false);
  const [pstLiveLastSynced, setPstLiveLastSynced] = useState(null);
  const [pstLiveSyncError, setPstLiveSyncError] = useState(false);
  const [pstLiveDbReady, setPstLiveDbReady] = useState(() => isPSTTrainPrepEntityReady());
  const [pstLiveDebug, setPstLiveDebug] = useState("");
  const [insertionLog, setInsertionLog] = useState(() => loadInsertionLog());
  const [tidInputs, setTidInputs] = useState(() => loadTidInputs());
  const [insertionLiveLoaded, setInsertionLiveLoaded] = useState(false);
  const [insertionLiveSyncing, setInsertionLiveSyncing] = useState(false);
  const [insertionLiveLastSynced, setInsertionLiveLastSynced] = useState(null);
  const [insertionLiveSyncError, setInsertionLiveSyncError] = useState(false);
  const [insertionLiveDbReady, setInsertionLiveDbReady] = useState(() => isInsertionLiveEntityReady());
  const [insertionLiveDebug, setInsertionLiveDebug] = useState("");
  const [flashingCells, setFlashingCells] = useState(new Set());

  useEffect(() => { saveTidInputs(tidInputs); }, [tidInputs]);

  const handleTaNameChange = useCallback((road, bi, value) => {
    setTaNameState((prev) => ({ ...prev, [`${road}-${bi}`]: value }));
  }, []);
  const getTabFromPath = (path) => {
    if (path === "/train-washing") return "washing";
    if (path === "/train-movement") return "movement";
    if (path === "/pst-train-prep") return "pst";
    if (path === "/insertion") return "insertion";
    if (path === "/odo-reading") return "odo";
    if (path === "/possession") return "possession";
    return "stabling";
  };
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location.pathname));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [bookmarkLinks, setBookmarkLinks] = useState([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bookmarkError, setBookmarkError] = useState("");
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [bookmarkEditId, setBookmarkEditId] = useState(null);
  const [bookmarkDraft, setBookmarkDraft] = useState({ title: "", url: "" });
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const bookmarkMenuRef = useRef(null);
  const mainContentScrollRef = useRef(null);
  const stablingHorizontalScrollRef = useRef(null);

  const handleHeaderHorizontalScroll = useCallback((direction) => {
    const scrollTarget = stablingHorizontalScrollRef.current || mainContentScrollRef.current;
    if (!scrollTarget) return;

    const nextLeft = direction === "left" ? 0 : scrollTarget.scrollWidth;
    scrollTarget.scrollTo({ left: nextLeft, behavior: "smooth" });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    } catch {}
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (isSidebarCollapsed) return undefined;

    const timer = window.setTimeout(() => {
      setIsSidebarCollapsed(true);
    }, SIDEBAR_AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    setActiveTab(getTabFromPath(location.pathname));
  }, [location.pathname]);

  const loadBookmarkLinks = useCallback(async () => {
    setBookmarkLoading(true);
    setBookmarkError("");

    try {
      let records = await base44.entities.BookmarkLink.list("sortOrder");

      if (!records.length) {
        records = await Promise.all(
          DEFAULT_BOOKMARK_LINKS.map((link, index) =>
            base44.entities.BookmarkLink.create({
              ...link,
              sortOrder: index,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          )
        );
      }

      setBookmarkLinks(
        [...records]
          .filter((link) => link?.title && link?.url)
          .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
      );
    } catch (error) {
      console.error("Bookmark links load failed:", error);
      setBookmarkError("Unable to load bookmarks. Please check Cloudflare D1 binding and try again.");
    } finally {
      setBookmarkLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarkLinks();
  }, [loadBookmarkLinks]);

  useEffect(() => {
    if (!bookmarkOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!bookmarkMenuRef.current?.contains(event.target)) {
        setBookmarkOpen(false);
        setBookmarkEditId(null);
        setBookmarkError("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [bookmarkOpen]);

  const handleStartAddBookmark = useCallback(() => {
    setBookmarkError("");
    setBookmarkEditId(NEW_BOOKMARK_ID);
    setBookmarkDraft({ title: "", url: "" });
    setBookmarkOpen(true);
  }, []);

  const handleStartEditBookmark = useCallback((link) => {
    setBookmarkError("");
    setBookmarkEditId(link.id);
    setBookmarkDraft({ title: link.title || "", url: link.url || "" });
  }, []);

  const handleCancelBookmarkEdit = useCallback(() => {
    setBookmarkEditId(null);
    setBookmarkDraft({ title: "", url: "" });
    setBookmarkError("");
  }, []);

  const handleBookmarkDraftChange = useCallback((field, value) => {
    setBookmarkDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveBookmark = useCallback(async () => {
    const title = bookmarkDraft.title.trim();
    const url = normalizeBookmarkUrl(bookmarkDraft.url);

    if (!title || !url) {
      setBookmarkError("Please enter both bookmark name and URL.");
      return;
    }

    setBookmarkSaving(true);
    setBookmarkError("");

    try {
      if (bookmarkEditId === NEW_BOOKMARK_ID) {
        const created = await base44.entities.BookmarkLink.create({
          title,
          url,
          sortOrder: bookmarkLinks.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setBookmarkLinks((prev) => [...prev, created]);
      } else {
        const updated = await base44.entities.BookmarkLink.update(bookmarkEditId, {
          title,
          url,
          updatedAt: new Date().toISOString(),
        });
        setBookmarkLinks((prev) => prev.map((link) => (link.id === bookmarkEditId ? updated : link)));
      }

      setBookmarkEditId(null);
      setBookmarkDraft({ title: "", url: "" });
    } catch (error) {
      console.error("Bookmark save failed:", error);
      setBookmarkError("Bookmark was not saved. Please try again.");
    } finally {
      setBookmarkSaving(false);
    }
  }, [bookmarkDraft, bookmarkEditId, bookmarkLinks.length]);

  const handleDeleteBookmark = useCallback(async (link) => {
    const confirmed = window.confirm(`Delete bookmark "${link.title}"?`);
    if (!confirmed) return;

    setBookmarkSaving(true);
    setBookmarkError("");

    try {
      await base44.entities.BookmarkLink.delete(link.id);
      setBookmarkLinks((prev) => prev.filter((item) => item.id !== link.id));
      if (bookmarkEditId === link.id) handleCancelBookmarkEdit();
    } catch (error) {
      console.error("Bookmark delete failed:", error);
      setBookmarkError("Bookmark was not deleted. Please try again.");
    } finally {
      setBookmarkSaving(false);
    }
  }, [bookmarkEditId, handleCancelBookmarkEdit]);

  const existingMapRef = useRef({});
  const autoSaveTimer = useRef(null);
  const cellRefs = useRef({});
  const westDataRef = useRef(westData);
  const eastDataRef = useRef(eastData);
  const isEditingStablingRef = useRef(false);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const pollInProgressRef = useRef(false);

  const pstLiveRecordIdRef = useRef(null);
  const pstLiveAutoSaveTimerRef = useRef(null);
  const pstLiveSavingRef = useRef(false);
  const pstLivePendingSaveRef = useRef(false);
  const pstLivePollingRef = useRef(false);
  const pstLiveLocalEditUntilRef = useRef(0);
  const pstStateRef = useRef(pstState);
  const prepStateRef = useRef(prepState);
  const pstLogLinesRef = useRef(pstLogLines);
  const taNameStateRef = useRef(taNameState);
  const pstCompletedByNamesRef = useRef(pstCompletedByNames);
  const pstLiveLocalUpdatedAtRef = useRef(0);
  const pstLiveRemoteUpdatedAtRef = useRef(0);

  const insertionLiveRecordIdRef = useRef(null);
  const insertionLiveAutoSaveTimerRef = useRef(null);
  const insertionLiveSavingRef = useRef(false);
  const insertionLivePendingSaveRef = useRef(false);
  const insertionLivePollingRef = useRef(false);
  const insertionLiveLocalEditUntilRef = useRef(0);
  const insertionLiveApplyingRemoteRef = useRef(false);
  const insertionLogRef = useRef(insertionLog);
  const tidInputsRef = useRef(tidInputs);
  const insertionLiveLocalUpdatedAtRef = useRef(0);
  const insertionLiveRemoteUpdatedAtRef = useRef(0);

  useEffect(() => { pstStateRef.current = pstState; }, [pstState]);
  useEffect(() => { prepStateRef.current = prepState; }, [prepState]);
  useEffect(() => { pstLogLinesRef.current = pstLogLines; }, [pstLogLines]);
  useEffect(() => { taNameStateRef.current = taNameState; }, [taNameState]);
  useEffect(() => { pstCompletedByNamesRef.current = pstCompletedByNames; }, [pstCompletedByNames]);
  useEffect(() => { insertionLogRef.current = insertionLog; }, [insertionLog]);
  useEffect(() => { tidInputsRef.current = tidInputs; }, [tidInputs]);

  const markPSTLiveLocalEdit = useCallback(() => {
    const now = Date.now();
    pstLiveLocalUpdatedAtRef.current = now;
    pstLiveLocalEditUntilRef.current = now + PST_LIVE_LOCAL_EDIT_HOLD_MS;
  }, []);

  const markInsertionLiveLocalEdit = useCallback(() => {
    const now = Date.now();
    insertionLiveLocalUpdatedAtRef.current = now;
    insertionLiveLocalEditUntilRef.current = now + INSERTION_LIVE_LOCAL_EDIT_HOLD_MS;
  }, []);

  const handleTidChange = useCallback((road, bi, value) => {
    markInsertionLiveLocalEdit();
    setTidInputs((prev) => ({ ...prev, [`${road}-${bi}`]: value }));
  }, [markInsertionLiveLocalEdit]);

  useEffect(() => {
    westDataRef.current = westData;
  }, [westData]);

  useEffect(() => {
    eastDataRef.current = eastData;
  }, [eastData]);

  const applyPSTLiveState = useCallback((incomingState) => {
    const normalized = normalizePSTLiveState(incomingState);
    const incomingUpdatedMs = Date.parse(normalized.updatedAt || "");
    const localUpdatedMs = pstLiveLocalUpdatedAtRef.current || 0;

    // Prevent an older in-flight sync response or eventual-consistency DB read
    // from overwriting a fresh local PST / Train Prep click.
    if (Date.now() < pstLiveLocalEditUntilRef.current) return;
    if (localUpdatedMs && (!incomingUpdatedMs || incomingUpdatedMs + 1000 < localUpdatedMs)) return;

    if (incomingUpdatedMs) {
      pstLiveRemoteUpdatedAtRef.current = Math.max(pstLiveRemoteUpdatedAtRef.current, incomingUpdatedMs);
    }

    setPstState(normalized.pstState);
    setPrepState(normalized.prepState);
    setPstLogLines(normalized.logLines);
    setTaNameState(normalized.taNameState);
    setPstCompletedByNames(normalized.completedByNames);
    savePSTState(
      normalized.pstState,
      normalized.prepState,
      normalized.logLines,
      normalized.taNameState,
      normalized.completedByNames
    );
  }, []);

  const savePSTLiveToDb = useCallback(async (state) => {
    const entity = getPSTTrainPrepEntity();
    const payload = buildPSTLivePayload(state);

    savePSTState(
      payload.pstState,
      payload.prepState,
      payload.logLines,
      payload.taNameState,
      payload.completedByNames
    );

    if (!isPSTTrainPrepEntityReady(entity)) {
      setPstLiveDbReady(false);
      setPstLiveSyncError(true);
      setPstLiveDebug(
        "PSTTrainPrep entity is not available yet. Create/commit the PSTTrainPrep entity in Base44, redeploy/sync, then hard refresh."
      );
      pstLivePendingSaveRef.current = false;
      return;
    }

    pstLiveSavingRef.current = true;
    setPstLiveSyncing(true);

    try {
      if (pstLiveRecordIdRef.current) {
        await entity.update(pstLiveRecordIdRef.current, payload);
      } else {
        const created = await entity.create(payload);
        if (created?.id) pstLiveRecordIdRef.current = created.id;
      }

      const payloadUpdatedMs = Date.parse(payload.updatedAt || "");
      if (payloadUpdatedMs) {
        pstLiveRemoteUpdatedAtRef.current = Math.max(pstLiveRemoteUpdatedAtRef.current, payloadUpdatedMs);
      }

      setPstLiveLastSynced(new Date());
      setPstLiveSyncError(false);
      setPstLiveDbReady(true);
      setPstLiveDebug("");
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || String(err);
      console.error("PST / Train Prep live save failed:", err);
      setPstLiveSyncError(true);
      setPstLiveDebug(`PST live save failed: ${message}`);
    } finally {
      // Keep a short hold after save so eventual DB reads do not bounce the UI back.
      pstLiveLocalEditUntilRef.current = Date.now() + PST_LIVE_POST_SAVE_HOLD_MS;
      pstLivePendingSaveRef.current = false;
      pstLiveSavingRef.current = false;
      setPstLiveSyncing(false);
    }
  }, []);

  const schedulePSTLiveSave = useCallback((state) => {
    const payload = buildPSTLivePayload(state);

    savePSTState(
      payload.pstState,
      payload.prepState,
      payload.logLines,
      payload.taNameState,
      payload.completedByNames
    );

    pstLivePendingSaveRef.current = true;
    pstLiveLocalEditUntilRef.current = Date.now() + PST_LIVE_LOCAL_EDIT_HOLD_MS;

    if (pstLiveAutoSaveTimerRef.current) {
      clearTimeout(pstLiveAutoSaveTimerRef.current);
    }

    pstLiveAutoSaveTimerRef.current = setTimeout(() => {
      savePSTLiveToDb(payload);
    }, 1200);
  }, [savePSTLiveToDb]);

  const refreshPSTLiveFromDb = useCallback(async ({ showStatus = false } = {}) => {
    const entity = getPSTTrainPrepEntity();

    if (!isPSTTrainPrepEntityReady(entity)) {
      setPstLiveDbReady(false);
      setPstLiveLoaded(true);
      setPstLiveDebug(
        "PSTTrainPrep entity is not available yet. PST / Train Prep will remain local only until the entity is added."
      );
      return;
    }

    if (
      Date.now() < pstLiveLocalEditUntilRef.current ||
      pstLiveSavingRef.current ||
      pstLivePendingSaveRef.current ||
      pstLivePollingRef.current
    ) {
      return;
    }

    pstLivePollingRef.current = true;
    if (showStatus) setPstLiveSyncing(true);

    try {
      const records = await entity.list();
      const record = (records || []).find((item) => item?.stateKey === PST_LIVE_RECORD_KEY || item?.key === PST_LIVE_RECORD_KEY) || (records || [])[0];

      if (!record) {
        const payload = buildPSTLivePayload({
          pstState: pstStateRef.current,
          prepState: prepStateRef.current,
          logLines: pstLogLinesRef.current,
          taNameState: taNameStateRef.current,
          completedByNames: pstCompletedByNamesRef.current,
        });
        const created = await entity.create(payload);
        if (created?.id) pstLiveRecordIdRef.current = created.id;
        const payloadUpdatedMs = Date.parse(payload.updatedAt || "");
        if (payloadUpdatedMs) {
          pstLiveRemoteUpdatedAtRef.current = Math.max(pstLiveRemoteUpdatedAtRef.current, payloadUpdatedMs);
        }
        setPstLiveLastSynced(new Date());
        setPstLiveSyncError(false);
        setPstLiveDbReady(true);
        setPstLiveDebug("");
        setPstLiveLoaded(true);
        return;
      }

      if (record?.id) pstLiveRecordIdRef.current = record.id;

      applyPSTLiveState(record);
      setPstLiveLastSynced(new Date());
      setPstLiveSyncError(false);
      setPstLiveDbReady(true);
      setPstLiveDebug("");
      setPstLiveLoaded(true);
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || String(err);
      console.error("PST / Train Prep live sync failed:", err);
      setPstLiveSyncError(true);
      setPstLiveDebug(`PST live sync failed: ${message}`);
      setPstLiveLoaded(true);
    } finally {
      pstLivePollingRef.current = false;
      if (showStatus) setPstLiveSyncing(false);
    }
  }, [applyPSTLiveState]);

  useEffect(() => {
    refreshPSTLiveFromDb({ showStatus: true });
  }, [refreshPSTLiveFromDb]);

  useEffect(() => {
    if (!pstLiveLoaded || !pstLiveDbReady) return;

    const interval = setInterval(() => {
      refreshPSTLiveFromDb({ showStatus: true });
    }, PST_LIVE_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pstLiveLoaded, pstLiveDbReady, refreshPSTLiveFromDb]);

  useEffect(() => {
    const state = {
      pstState,
      prepState,
      logLines: pstLogLines,
      taNameState,
      completedByNames: pstCompletedByNames,
    };

    savePSTState(pstState, prepState, pstLogLines, taNameState, pstCompletedByNames);

    if (!pstLiveLoaded) return;
    schedulePSTLiveSave(state);
  }, [pstState, prepState, pstLogLines, taNameState, pstCompletedByNames, pstLiveLoaded, schedulePSTLiveSave]);

  useEffect(() => {
    return () => {
      if (pstLiveAutoSaveTimerRef.current) {
        clearTimeout(pstLiveAutoSaveTimerRef.current);
      }
    };
  }, []);

  const handleCompletedByChange = useCallback((depot, value) => {
    markPSTLiveLocalEdit();
    setPstCompletedByNames((prev) => ({
      ...prev,
      [depot]: value,
    }));
  }, [markPSTLiveLocalEdit]);

  const pstLiveStatusText = !pstLiveDbReady
    ? "PST Local only"
    : pstLiveSyncError
    ? "PST Sync issue"
    : pstLiveSyncing
    ? "PST Syncing..."
    : pstLiveLastSynced
    ? `PST Live synced ${formatTime(pstLiveLastSynced)}`
    : "PST Live ready";

  const pstLiveStatusClass = !pstLiveDbReady || pstLiveSyncError
    ? "border-amber-600/50 bg-amber-950/30 text-amber-300"
    : "border-emerald-600/50 bg-emerald-950/30 text-emerald-300";

  const applyInsertionLiveState = useCallback((incomingState) => {
    const normalized = normalizeInsertionLiveState(incomingState);
    const incomingUpdatedMs = Date.parse(normalized.updatedAt || "");
    const localUpdatedMs = insertionLiveLocalUpdatedAtRef.current || 0;

    // Prevent an older in-flight sync response or eventual-consistency DB read
    // from overwriting a fresh local Insertion click / TID remark edit.
    if (Date.now() < insertionLiveLocalEditUntilRef.current) return;
    if (localUpdatedMs && (!incomingUpdatedMs || incomingUpdatedMs + 1000 < localUpdatedMs)) return;

    if (incomingUpdatedMs) {
      insertionLiveRemoteUpdatedAtRef.current = Math.max(insertionLiveRemoteUpdatedAtRef.current, incomingUpdatedMs);
    }

    insertionLiveApplyingRemoteRef.current = true;
    setInsertionLog(normalized.insertionLog);
    setTidInputs(normalized.tidInputs);
    saveInsertionLog(normalized.insertionLog);
    saveTidInputs(normalized.tidInputs);
  }, []);

  const saveInsertionLiveToDb = useCallback(async (state) => {
    const entity = getInsertionLiveEntity();
    const payload = buildInsertionLivePayload(state);

    saveInsertionLog(payload.insertionLog);
    saveTidInputs(payload.tidInputs);

    if (!isInsertionLiveEntityReady(entity)) {
      setInsertionLiveDbReady(false);
      setInsertionLiveSyncError(true);
      setInsertionLiveDebug(
        "InsertionLive entity is not available yet. Create/commit the InsertionLive entity in Base44, redeploy/sync, then hard refresh."
      );
      insertionLivePendingSaveRef.current = false;
      return;
    }

    insertionLiveSavingRef.current = true;
    setInsertionLiveSyncing(true);

    try {
      if (insertionLiveRecordIdRef.current) {
        await entity.update(insertionLiveRecordIdRef.current, payload);
      } else {
        const created = await entity.create(payload);
        if (created?.id) insertionLiveRecordIdRef.current = created.id;
      }

      const payloadUpdatedMs = Date.parse(payload.updatedAt || "");
      if (payloadUpdatedMs) {
        insertionLiveRemoteUpdatedAtRef.current = Math.max(insertionLiveRemoteUpdatedAtRef.current, payloadUpdatedMs);
      }

      setInsertionLiveLastSynced(new Date());
      setInsertionLiveSyncError(false);
      setInsertionLiveDbReady(true);
      setInsertionLiveDebug("");
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || String(err);
      console.error("Insertion live save failed:", err);
      setInsertionLiveSyncError(true);
      setInsertionLiveDebug(`Insertion live save failed: ${message}`);
    } finally {
      insertionLiveLocalEditUntilRef.current = Date.now() + INSERTION_LIVE_POST_SAVE_HOLD_MS;
      insertionLivePendingSaveRef.current = false;
      insertionLiveSavingRef.current = false;
      setInsertionLiveSyncing(false);
    }
  }, []);

  const scheduleInsertionLiveSave = useCallback((state) => {
    const payload = buildInsertionLivePayload(state);

    saveInsertionLog(payload.insertionLog);
    saveTidInputs(payload.tidInputs);

    insertionLivePendingSaveRef.current = true;
    insertionLiveLocalEditUntilRef.current = Date.now() + INSERTION_LIVE_LOCAL_EDIT_HOLD_MS;

    if (insertionLiveAutoSaveTimerRef.current) {
      clearTimeout(insertionLiveAutoSaveTimerRef.current);
    }

    insertionLiveAutoSaveTimerRef.current = setTimeout(() => {
      saveInsertionLiveToDb(payload);
    }, 1200);
  }, [saveInsertionLiveToDb]);

  const refreshInsertionLiveFromDb = useCallback(async ({ showStatus = false } = {}) => {
    const entity = getInsertionLiveEntity();

    if (!isInsertionLiveEntityReady(entity)) {
      setInsertionLiveDbReady(false);
      setInsertionLiveLoaded(true);
      setInsertionLiveDebug(
        "InsertionLive entity is not available yet. Insertion will remain local only until the entity is added."
      );
      return;
    }

    if (
      Date.now() < insertionLiveLocalEditUntilRef.current ||
      insertionLiveSavingRef.current ||
      insertionLivePendingSaveRef.current ||
      insertionLivePollingRef.current
    ) {
      return;
    }

    insertionLivePollingRef.current = true;
    if (showStatus) setInsertionLiveSyncing(true);

    try {
      const records = await entity.list();
      const record = (records || []).find((item) => item?.stateKey === INSERTION_LIVE_RECORD_KEY || item?.key === INSERTION_LIVE_RECORD_KEY) || (records || [])[0];

      if (!record) {
        const payload = buildInsertionLivePayload({
          insertionLog: insertionLogRef.current,
          tidInputs: tidInputsRef.current,
        });
        const created = await entity.create(payload);
        if (created?.id) insertionLiveRecordIdRef.current = created.id;

        const payloadUpdatedMs = Date.parse(payload.updatedAt || "");
        if (payloadUpdatedMs) {
          insertionLiveRemoteUpdatedAtRef.current = Math.max(insertionLiveRemoteUpdatedAtRef.current, payloadUpdatedMs);
        }

        setInsertionLiveLastSynced(new Date());
        setInsertionLiveSyncError(false);
        setInsertionLiveDbReady(true);
        setInsertionLiveDebug("");
        setInsertionLiveLoaded(true);
        return;
      }

      if (record?.id) insertionLiveRecordIdRef.current = record.id;

      applyInsertionLiveState(record);
      setInsertionLiveLastSynced(new Date());
      setInsertionLiveSyncError(false);
      setInsertionLiveDbReady(true);
      setInsertionLiveDebug("");
      setInsertionLiveLoaded(true);
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || String(err);
      console.error("Insertion live sync failed:", err);
      setInsertionLiveSyncError(true);
      setInsertionLiveDebug(`Insertion live sync failed: ${message}`);
      setInsertionLiveLoaded(true);
    } finally {
      insertionLivePollingRef.current = false;
      if (showStatus) setInsertionLiveSyncing(false);
    }
  }, [applyInsertionLiveState]);

  useEffect(() => {
    refreshInsertionLiveFromDb({ showStatus: true });
  }, [refreshInsertionLiveFromDb]);

  useEffect(() => {
    if (!insertionLiveLoaded || !insertionLiveDbReady) return;

    const interval = setInterval(() => {
      refreshInsertionLiveFromDb({ showStatus: true });
    }, INSERTION_LIVE_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [insertionLiveLoaded, insertionLiveDbReady, refreshInsertionLiveFromDb]);

  useEffect(() => {
    const payload = {
      insertionLog,
      tidInputs,
    };

    saveInsertionLog(sortInsertionLogByTime(insertionLog));
    saveTidInputs(tidInputs);

    if (insertionLiveApplyingRemoteRef.current) {
      insertionLiveApplyingRemoteRef.current = false;
      return;
    }

    if (!insertionLiveLoaded) return;
    scheduleInsertionLiveSave(payload);
  }, [insertionLog, tidInputs, insertionLiveLoaded, scheduleInsertionLiveSave]);

  useEffect(() => {
    return () => {
      if (insertionLiveAutoSaveTimerRef.current) {
        clearTimeout(insertionLiveAutoSaveTimerRef.current);
      }
    };
  }, []);

  const insertionLiveStatusText = !insertionLiveDbReady
    ? "Insertion Local only"
    : insertionLiveSyncError
    ? "Insertion Sync issue"
    : insertionLiveSyncing
    ? "Insertion Syncing..."
    : insertionLiveLastSynced
    ? `Insertion Live synced ${formatTime(insertionLiveLastSynced)}`
    : "Insertion Live ready";

  const insertionLiveStatusClass = !insertionLiveDbReady || insertionLiveSyncError
    ? "border-amber-600/50 bg-amber-950/30 text-amber-300"
    : "border-emerald-600/50 bg-emerald-950/30 text-emerald-300";

  const focusCell = useCallback((depot, roadIndex, visualIndex) => {
    const key = `${depot}-${roadIndex}-${visualIndex}`;
    cellRefs.current[key]?.focus();
    cellRefs.current[key]?.select();
  }, []);

  const handleCellKeyDown = useCallback(
    (e, depot, roadIndex, visualIndex, totalRows, totalCols) => {
      let nextRoadIndex = roadIndex;
      let nextVisualIndex = visualIndex;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextVisualIndex = Math.min(visualIndex + 1, totalCols - 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nextVisualIndex = Math.max(visualIndex - 1, 0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nextRoadIndex = Math.min(roadIndex + 1, totalRows - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nextRoadIndex = Math.max(roadIndex - 1, 0);
      } else {
        return;
      }

      focusCell(depot, nextRoadIndex, nextVisualIndex);
    },
    [focusCell]
  );

  const refreshStablingFromDb = useCallback(async ({ showStatus = false } = {}) => {
    if (isEditingStablingRef.current || isSavingRef.current || pendingSaveRef.current || pollInProgressRef.current) return;

    pollInProgressRef.current = true;
    if (showStatus) setSyncing(true);

    try {
      const [stablingRecords, maintenanceRecords] = await Promise.all([
        base44.entities.DepotStabling.list(),
        base44.entities.MaintenanceRequest.list(),
      ]);
      const { map, newWest, newEast } = buildStablingStateFromRecords(stablingRecords);

      existingMapRef.current = map;
      setWestData(newWest);
      setEastData(newEast);
      setRequests(maintenanceRecords || []);
      setLastSynced(new Date());
      setSyncError(false);
    } catch (err) {
      console.error("Live stabling / maintenance sync failed:", err);
      setSyncError(true);
    } finally {
      pollInProgressRef.current = false;
      if (showStatus) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      base44.entities.DepotStabling.list(),
      base44.entities.MaintenanceRequest.list(),
    ]).then(([stablingRecords, maintenanceRecords]) => {
      const { map, newWest, newEast } = buildStablingStateFromRecords(stablingRecords);

      existingMapRef.current = map;
      setWestData(newWest);
      setEastData(newEast);
      setRequests(maintenanceRecords || []);
      setLastSynced(new Date());
      setLoaded(true);
    }).catch(() => {
      // If initial load fails (e.g. 502), still show the page with empty data
      setLoaded(true);
      setSyncError(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const interval = setInterval(() => {
      refreshStablingFromDb({ showStatus: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [loaded, refreshStablingFromDb]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  const saveToDb = useCallback(async (west, east) => {
    isSavingRef.current = true;
    setSaving(true);

    const allEntries = [
      ...WEST_ROADS.map((road) => ({
        depot: "west",
        road,
        blocks: west[road],
      })),
      ...EAST_ROADS.map((road) => ({
        depot: "east",
        road,
        blocks: east[road],
      })),
    ];

    try {
      // Save sequentially to avoid overwhelming the server with concurrent requests
      for (const entry of allEntries) {
        const key = `${entry.depot}_${entry.road}`;
        if (existingMapRef.current[key]) {
          await base44.entities.DepotStabling.update(existingMapRef.current[key], entry);
        } else {
          const created = await base44.entities.DepotStabling.create(entry);
          existingMapRef.current[key] = created.id;
        }
      }
      setSaved(true);
      setLastSynced(new Date());
      setSyncError(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      pendingSaveRef.current = false;
      isSavingRef.current = false;
      setSaving(false);
    }
  }, []);

  const scheduleAutoSave = useCallback(
    (west, east) => {
      pendingSaveRef.current = true;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        pendingSaveRef.current = false;
        saveToDb(west, east);
      }, 1500);
    },
    [saveToDb]
  );

  const handleStablingEditStart = useCallback(() => {
    isEditingStablingRef.current = true;
  }, []);

  const handleStablingEditEnd = useCallback(() => {
    isEditingStablingRef.current = false;
  }, []);

  const clearPSTTrainPrepForCell = useCallback((road, blockIndex) => {
    const cellKey = `${road}-${blockIndex}`;
    const removeCellKey = (prev) => {
      if (!prev?.[cellKey]) return prev;
      const next = { ...prev };
      delete next[cellKey];
      return next;
    };

    setPstState(removeCellKey);
    setPrepState(removeCellKey);
    setTaNameState(removeCellKey);
    setPstLogLines((prev) => prev.filter((line) => line.key !== `pst-${cellKey}` && line.key !== `prep-${cellKey}`));
  }, []);

  // Called on every keystroke — updates state freely so typing "33" works even if "3" exists
  const updateBlockTrain = (depot, road, blockIndex, value) => {
    const setter = depot === "west" ? setWestData : setEastData;
    const sourceData = depot === "west" ? westDataRef.current : eastDataRef.current;
    const previousKey = normalizeTrainId(sourceData?.[road]?.[blockIndex]?.trainId);
    const incomingKey = normalizeTrainId(value);

    if (previousKey !== incomingKey) {
      markPSTLiveLocalEdit();
      clearPSTTrainPrepForCell(road, blockIndex);
    }

    setter((prev) => {
      const updated = { ...prev };
      const blocks = [...updated[road]];
      blocks[blockIndex] = { ...blocks[blockIndex], trainId: value };
      updated[road] = blocks;
      return updated;
    });
  };

  // Called on blur or Enter — runs duplicate check against the final typed value
  const commitBlockTrain = (depot, road, blockIndex, value) => {
    const setter = depot === "west" ? setWestData : setEastData;
    const sourceData = depot === "west" ? westDataRef.current : eastDataRef.current;
    const previousKey = normalizeTrainId(sourceData?.[road]?.[blockIndex]?.trainId);
    const incomingKey = normalizeTrainId(value);

    if (incomingKey) {
      const allKeys = [];
      const collectFrom = (data, depotName) => {
        Object.entries(data).forEach(([r, blocks]) => {
          blocks.forEach((b, bi) => {
            if (depotName === depot && r === road && bi === blockIndex) return;
            const k = normalizeTrainId(b.trainId);
            if (k) allKeys.push(k);
          });
        });
      };
      collectFrom(westDataRef.current, "west");
      collectFrom(eastDataRef.current, "east");

      if (allKeys.includes(incomingKey)) {
        // Flash cell red, revert to empty after 800ms — do NOT save
        const cellKey = `${depot}-${road}-${blockIndex}`;
        setFlashingCells((prev) => new Set([...prev, cellKey]));
        setTimeout(() => {
          if (previousKey) {
            markPSTLiveLocalEdit();
            clearPSTTrainPrepForCell(road, blockIndex);
          }
          setter((prev) => {
            const updated = { ...prev };
            const blocks = [...updated[road]];
            blocks[blockIndex] = { ...blocks[blockIndex], trainId: "" };
            updated[road] = blocks;
            return updated;
          });
          setFlashingCells((prev) => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 800);
        return; // prevent save
      }
    }

    // No duplicate — persist and schedule auto-save
    if (previousKey !== incomingKey) {
      markPSTLiveLocalEdit();
      clearPSTTrainPrepForCell(road, blockIndex);
    }

    setter((prev) => {
      const updated = { ...prev };
      const blocks = [...updated[road]];
      blocks[blockIndex] = { ...blocks[blockIndex], trainId: value };
      updated[road] = blocks;
      const newWest = depot === "west" ? updated : westDataRef.current;
      const newEast = depot === "east" ? updated : eastDataRef.current;
      scheduleAutoSave(newWest, newEast);
      return updated;
    });
  };

  const updateExtraRemark = (depot, road, blockIndex, value) => {
    const setter = depot === "west" ? setWestData : setEastData;

    setter((prev) => {
      const updated = { ...prev };
      const blocks = [...updated[road]];

      blocks[blockIndex] = {
        ...blocks[blockIndex],
        extraRemark: value,
      };

      updated[road] = blocks;

      const newWest = depot === "west" ? updated : westDataRef.current;
      const newEast = depot === "east" ? updated : eastDataRef.current;

      scheduleAutoSave(newWest, newEast);

      return updated;
    });
  };

  const handleClearStabling = (depot) => {
    const roads = depot === "west" ? WEST_ROADS : EAST_ROADS;
    const setter = depot === "west" ? setWestData : setEastData;

    markPSTLiveLocalEdit();
    setPstLogLines((prev) => prev.filter((line) => line.depot !== depot));
    setPstState((prev) => removePSTSectionKeys(prev, depot));
    setPrepState((prev) => removePSTSectionKeys(prev, depot));
    setTaNameState((prev) => removePSTSectionKeys(prev, depot));

    setter((prev) => {
      const updated = { ...prev };
      roads.forEach((road) => {
        updated[road] = updated[road].map((block) => ({
          ...block,
          trainId: "",
        }));
      });

      const newWest = depot === "west" ? updated : westDataRef.current;
      const newEast = depot === "east" ? updated : eastDataRef.current;
      scheduleAutoSave(newWest, newEast);

      return updated;
    });
  };

  useEffect(() => {
    saveInsertionLog(sortInsertionLogByTime(insertionLog));
  }, [insertionLog]);

  const WEEKDAY_WEST = [
    { tid: 101, time: "05:25" }, { tid: 102, time: "05:28" }, { tid: 103, time: "05:31" },
    { tid: 104, time: "05:34" }, { tid: 105, time: "05:37" }, { tid: 106, time: "05:40" },
    { tid: 107, time: "05:43" }, { tid: 108, time: "05:46" }, { tid: 109, time: "05:49" },
    { tid: 110, time: "05:52" }, { tid: 111, time: "05:55" }, { tid: 112, time: "05:58" },
    { tid: 113, time: "06:01" }, { tid: 114, time: "06:04" }, { tid: 115, time: "06:07" },
    { tid: 116, time: "06:10" }, { tid: 117, time: "06:13" }, { tid: 118, time: "06:16" },
    { tid: 119, time: "06:19" }, { tid: 120, time: "06:22" },
    { tid: 121, time: "15:58" }, { tid: 122, time: "16:04" }, { tid: 123, time: "16:10" },
    { tid: 124, time: "16:16" }, { tid: 125, time: "16:22" }, { tid: 126, time: "16:28" },
    { tid: 127, time: "16:34" }, { tid: 128, time: "16:40" }, { tid: 129, time: "16:46" },
    { tid: 130, time: "16:52" },
  ];

  const WEEKDAY_EAST = [
    { tid: 201, time: "05:24" }, { tid: 202, time: "05:27" }, { tid: 203, time: "05:30" },
    { tid: 204, time: "05:33" }, { tid: 205, time: "05:36" }, { tid: 206, time: "05:39" },
    { tid: 207, time: "05:42" }, { tid: 208, time: "05:45" }, { tid: 209, time: "05:48" },
    { tid: 210, time: "05:51" }, { tid: 211, time: "05:54" }, { tid: 212, time: "05:57" },
    { tid: 213, time: "06:00" }, { tid: 214, time: "06:03" }, { tid: 215, time: "06:06" },
    { tid: 216, time: "06:09" }, { tid: 217, time: "06:12" }, { tid: 218, time: "06:15" },
    { tid: 219, time: "06:18" }, { tid: 220, time: "06:21" },
    { tid: 121, time: "15:58" }, { tid: 122, time: "16:04" }, { tid: 123, time: "16:10" },
    { tid: 124, time: "16:16" }, { tid: 125, time: "16:22" }, { tid: 126, time: "16:28" },
    { tid: 127, time: "16:34" }, { tid: 128, time: "16:40" }, { tid: 129, time: "16:46" },
    { tid: 130, time: "16:52" },
  ];

  const SATURDAY_WEST = [
    { tid: 101, time: "05:25" },
    { tid: 102, time: "05:31" },
    { tid: 103, time: "05:37" },
    { tid: 104, time: "05:43" },
    { tid: 105, time: "05:49" },
    { tid: 106, time: "05:55" },
    { tid: 107, time: "06:01" },
    { tid: 108, time: "06:07" },
    { tid: 109, time: "06:13" },
    { tid: 110, time: "06:19" },
  ];

  const SATURDAY_EAST = [
    { tid: 221, time: "05:24" },
    { tid: 222, time: "05:30" },
    { tid: 223, time: "05:36" },
    { tid: 224, time: "05:42" },
    { tid: 225, time: "05:48" },
    { tid: 226, time: "05:54" },
    { tid: 227, time: "06:00" },
    { tid: 228, time: "06:06" },
    { tid: 229, time: "06:12" },
    { tid: 230, time: "06:18" },
  ];

  const FRIDAY_WEST = [
    { tid: 101, time: "09:55" },
    { tid: 102, time: "10:01" },
    { tid: 103, time: "10:07" },
    { tid: 104, time: "10:13" },
    { tid: 105, time: "10:19" },
    { tid: 106, time: "10:25" },
    { tid: 107, time: "10:31" },
    { tid: 108, time: "10:37" },
    { tid: 109, time: "10:43" },
    { tid: 110, time: "10:49" },
  ];

  const FRIDAY_EAST = [
    { tid: 201, time: "09:54" },
    { tid: 202, time: "10:00" },
    { tid: 203, time: "10:06" },
    { tid: 204, time: "10:12" },
    { tid: 205, time: "10:18" },
    { tid: 206, time: "10:24" },
    { tid: 207, time: "10:30" },
    { tid: 208, time: "10:36" },
    { tid: 209, time: "10:42" },
    { tid: 210, time: "10:48" },
  ];

  const toTimeMap = (rows) => Object.fromEntries(rows.map((row) => [row.tid, row.time]));

  const TID_TIME_MAPS = {
    weekday: {
      west: toTimeMap(WEEKDAY_WEST),
      east: toTimeMap(WEEKDAY_EAST),
    },
    friday: {
      west: toTimeMap(FRIDAY_WEST),
      east: toTimeMap(FRIDAY_EAST),
    },
    saturday: {
      west: toTimeMap(SATURDAY_WEST),
      east: toTimeMap(SATURDAY_EAST),
    },
  };

  const getDayScheduleKey = () => {
    const day = new Date().getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
    if (day === 5) return "friday";
    if (day === 6) return "saturday";
    return "weekday";
  };

  const getTidScheduledTime = (tid, depot) => {
    const dayKey = getDayScheduleKey();
    const cleanTid = Number(String(tid || "").replace(/\D/g, ""));
    if (!cleanTid) return null;

    // First follow today's schedule for the depot the train is inserted from.
    // If the TID is not listed under that depot, fall back to the other depot for the same day.
    const sameDayTime =
      TID_TIME_MAPS[dayKey]?.[depot]?.[cleanTid] ||
      TID_TIME_MAPS[dayKey]?.[depot === "west" ? "east" : "west"]?.[cleanTid];

    if (sameDayTime) return sameDayTime;

    // PNG export can be prepared while viewing / typing TIDs from a different schedule day.
    // Keep the East Depot PNG from losing the timing pill by checking the remaining day maps too.
    const fallbackDayOrder = ["weekday", "friday", "saturday"].filter((key) => key !== dayKey);

    for (const fallbackDay of fallbackDayOrder) {
      const fallbackTime =
        TID_TIME_MAPS[fallbackDay]?.[depot]?.[cleanTid] ||
        TID_TIME_MAPS[fallbackDay]?.[depot === "west" ? "east" : "west"]?.[cleanTid];

      if (fallbackTime) return fallbackTime;
    }

    return null;
  };

  const handleInsertionTick = (road, bi, trainKey, remark = "", sweepTrack = "") => {
    markInsertionLiveLocalEdit();
    const cellKey = `${road}-${bi}`;
    const logKey = `ins-${cellKey}`;
    const existing = insertionLog.find((l) => l.key === logKey);
    if (existing) {
      setInsertionLog((prev) => prev.filter((l) => l.key !== logKey));
      return;
    }
    const depot = getDepotFromRoad(road);
    const mainlineTrack = depot === "west" ? 1 : 2;
    const paddedTrainKey = trainKey.replace(/^T(\d+)$/, (_, n) => `T${n.padStart(2, "0")}`);
    // Parse remark: plain number, "TID N", "TID: N" or "T121" => TID.
    // Anything else (e.g. "3K1" / "SW") stays as a destination/remark label.
    const tidStr = remark && remark.toString().trim();
    const normalizedRemark = (tidStr || "").toUpperCase();
    const tidMatch = tidStr ? tidStr.match(/^(?:tid[:\s-]*)?t?(\d{1,3})$/i) : null;
    const tid = tidMatch ? parseInt(tidMatch[1], 10) : null;

    // Insertion Log timing follows the TID schedule for the actual day:
    // weekday / friday / saturday. If the TID is not found, fallback to current clock time.
    const scheduledTime = tid ? getTidScheduledTime(tid, depot) : null;
    const time = scheduledTime || formatTime(new Date());

    // SW is a sweeping movement. Ask the user to choose TK1/TK2 in the cell,
    // then generate the road-specific signal log instead of normal insertion.
    if (normalizedRemark === "SW") {
      const normalizedSweepTrack = (sweepTrack || "").toString().trim().toUpperCase();
      if (!["TK1", "TK2"].includes(normalizedSweepTrack)) return;

      const signal = getSweepingSignal(road, normalizedSweepTrack);
      const clearTime = getSweepingClearTime(time, road, normalizedSweepTrack);
      const line = `${time} hrs – ${paddedTrainKey} sweeping started from ${road} to signal ${signal} at 45 kph. Track confirmed clear at ${clearTime} hrs.`;

      setInsertionLog((prev) => sortInsertionLogByTime([...prev, {
        key: logKey,
        text: line,
        time,
        depot,
        road,
        trainKey: paddedTrainKey,
        tid: null,
        mainlineTrack,
        remark: normalizedRemark,
        sweepTrack: normalizedSweepTrack,
        signal,
        clearTime,
        isSweeping: true,
      }]));
      return;
    }

    // Parenthetical: TID number > remark label > nothing
    const tidPart = tid !== null ? ` (TID ${tid})` : tidStr ? ` (${tidStr})` : "";
    const line = `${time} hrs – ${paddedTrainKey}${tidPart} inserted from ${road} to mainline track ${mainlineTrack}.`;
    setInsertionLog((prev) => sortInsertionLogByTime([...prev, { key: logKey, text: line, time, depot, road, trainKey: paddedTrainKey, tid, mainlineTrack, remark: tidStr || "" }]));
  };

  const handleRemoveInsertionLog = (key) => {
    markInsertionLiveLocalEdit();
    setInsertionLog((prev) => prev.filter((l) => l.key !== key));
  };

  const handleClearInsertionDepot = (depot) => {
    markInsertionLiveLocalEdit();
    setInsertionLog((prev) => prev.filter((l) => l.depot !== depot));
  };

  const handleClearInsertedTidRemarks = useCallback((roads, blockIndices) => {
    markInsertionLiveLocalEdit();
    const targetKeys = new Set();
    roads.forEach((road) => {
      blockIndices.forEach((bi) => targetKeys.add(`ins-${road}-${bi}`));
    });

    setInsertionLog((prev) => prev.map((entry) => {
      if (!targetKeys.has(entry.key)) return entry;
      if (entry.isSweeping) return entry;

      const time = entry.time || formatTime(new Date());
      const trainKey = entry.trainKey || "";
      const road = entry.road || "";
      const mainlineTrack = entry.mainlineTrack || (getDepotFromRoad(road) === "west" ? 1 : 2);
      const cleanText = trainKey && road
        ? `${time} hrs – ${trainKey} inserted from ${road} to mainline track ${mainlineTrack}.`
        : (entry.text || "").replace(/(hrs\s+–\s+T\d{1,2})\s*\([^)]*\)(\s+inserted)/i, "$1$2");

      return {
        ...entry,
        text: cleanText,
        tid: null,
        remark: "",
        sweepTrack: "",
        signal: "",
        clearTime: "",
        isSweeping: false,
      };
    }));
  }, [markInsertionLiveLocalEdit]);

  const handleClearInsertedTrains = useCallback((roads, blockIndices) => {
    markInsertionLiveLocalEdit();
    const targetKeys = new Set();
    roads.forEach((road) => {
      blockIndices.forEach((bi) => targetKeys.add(`ins-${road}-${bi}`));
    });

    setInsertionLog((prev) => prev.filter((entry) => !targetKeys.has(entry.key)));
  }, [markInsertionLiveLocalEdit]);

  const getDepotFromRoad = (road) => WEST_ROADS.includes(road) ? "west" : "east";

  const handlePSTStartTimeChange = useCallback((road, bi, trainKey, startTime) => {
    const cleanStartTime = cleanMovementCustomTimeInput(startTime);

    markPSTLiveLocalEdit();
    const cellKey = `${road}-${bi}`;
    const isCompleteTime = /^\d{2}:\d{2}$/.test(cleanStartTime);

    setPstState((prev) => {
      const current = prev[cellKey];
      if (!current) return prev;
      const endTime = isCompleteTime ? addMinutesToHHMM(cleanStartTime, 6) : current.endTime;
      return {
        ...prev,
        [cellKey]: {
          ...current,
          startTime: cleanStartTime,
          endTime,
        },
      };
    });
  }, [markPSTLiveLocalEdit]);

  const handlePSTTick = (road, bi, trainKey, alarmStatus = null) => {
    markPSTLiveLocalEdit();
    const cellKey = `${road}-${bi}`;
    const current = pstState[cellKey];

    // Completed PST: clicking again removes PST state and its log.
    if (current?.done) {
      setPstState((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
      setPstLogLines((prev) => prev.filter((l) => l.key !== `pst-${cellKey}`));
      return;
    }

    const paddedKey = trainKey.replace(/^T(\d+)$/, (_, n) => `T${n.padStart(2, "0")}`);
    const depotLabel = WEST_ROADS.includes(road) ? "WD" : "ED";
    const roadFormatted = road.replace(/^(WD|ED)-/, `${depotLabel}\u2013`);
    const depot = getDepotFromRoad(road);

    // Pending confirmation: user has clicked PST once and must confirm alarm / no alarm.
    if (current?.confirming && alarmStatus) {
      const startTime = normalizeMovementCustomTimeInput(current.startTime);
      if (!/^\d{2}:\d{2}$/.test(startTime)) return;
      const endTime = addMinutesToHHMM(startTime, 6);
      const alarmText = alarmStatus === "alarm" ? " Alarm reported." : " No alarm reported.";
      const line = `${startTime} hrs \u2013 PST commenced at ${roadFormatted} for ${paddedKey}. Completed at ${endTime} hrs.${alarmText}`;

      setPstState((prev) => ({
        ...prev,
        [cellKey]: {
          done: true,
          confirming: false,
          startTime,
          endTime,
          alarmStatus,
          trainKey: paddedKey,
        },
      }));
      setPstLogLines((prev) => sortPSTLogLinesByTime([
        ...prev.filter((l) => l.key !== `pst-${cellKey}`),
        { key: `pst-${cellKey}`, text: line, type: "PST", depot, road, trainKey: paddedKey, startTime, endTime, alarmStatus },
      ]));
      return;
    }

    // First click: do not complete/log yet. Hold the cell in green/amber confirmation state.
    const now = new Date();
    const startTime = formatTime(now);
    const endTime = formatTime(addMinutes(now, 6));
    setPstState((prev) => ({
      ...prev,
      [cellKey]: {
        done: false,
        confirming: true,
        startTime,
        endTime,
        trainKey: paddedKey,
      },
    }));
    setPstLogLines((prev) => prev.filter((l) => l.key !== `pst-${cellKey}`));
  };

  const handlePrepTick = (road, bi, trainKey, taName = "") => {
    markPSTLiveLocalEdit();
    const cellKey = `${road}-${bi}`;
    const current = prepState[cellKey];
    if (current?.done) {
      setPrepState((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
      setPstLogLines((prev) => prev.filter((l) => l.key !== `prep-${cellKey}`));
      // Clear TA name when undoing completion
      setTaNameState((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
      return;
    }
    const paddedKey = trainKey.replace(/^T(\d+)$/, (_, n) => `T${n.padStart(2, "0")}`);
    if (!current?.started) {
      setPrepState((prev) => ({ ...prev, [cellKey]: { started: true, done: false, startTime: formatTime(new Date()), trainKey: paddedKey } }));
    } else {
      const endTime = formatTime(new Date());
      const resolvedTaName = taNameState[cellKey] || taName;
      const taStr = resolvedTaName.trim() ? ` Performed by TA ${resolvedTaName.trim()}.` : "";
      const depotLabel = WEST_ROADS.includes(road) ? "WD" : "ED";
      const roadFormatted = road.replace(/^(WD|ED)-/, `${depotLabel}\u2013`);
      const line = `${current.startTime} hrs \u2013 Train preparation commenced at ${roadFormatted} for ${paddedKey}. Completed at ${endTime} hrs.${taStr}`;
      const depot = getDepotFromRoad(road);
      setPrepState((prev) => ({ ...prev, [cellKey]: { ...prev[cellKey], done: true, endTime, trainKey: paddedKey } }));
      setPstLogLines((prev) => sortPSTLogLinesByTime([...prev.filter((l) => l.key !== `prep-${cellKey}`), { key: `prep-${cellKey}`, text: line, type: "Prep", depot, trainKey: paddedKey, startTime: current.startTime, endTime, taName: resolvedTaName.trim() }]));
    }
  };

  const handleRemovePSTLog = (key) => {
    markPSTLiveLocalEdit();
    setPstLogLines((prev) => prev.filter((l) => l.key !== key));
    const parts = key.replace(/^(pst|prep)-/, "");
    if (key.startsWith("pst-")) setPstState((prev) => { const n = { ...prev }; delete n[parts]; return n; });
    else setPrepState((prev) => { const n = { ...prev }; delete n[parts]; return n; });
  };

  const removePSTSectionKeys = (state, depot) => {
    const roads = depot === "west" ? WEST_ROADS : EAST_ROADS;
    const next = { ...state };
    Object.keys(next).forEach((key) => {
      if (roads.some((road) => key.startsWith(`${road}-`))) delete next[key];
    });
    return next;
  };

  const handleClearDepotPSTOnly = (depot) => {
    markPSTLiveLocalEdit();
    setPstLogLines((prev) => prev.filter((line) => !(line.depot === depot && line.type === "PST")));
    setPstState((prev) => removePSTSectionKeys(prev, depot));
  };

  const handleClearDepotPrepOnly = (depot) => {
    markPSTLiveLocalEdit();
    setPstLogLines((prev) => prev.filter((line) => !(line.depot === depot && line.type === "Prep")));
    setPrepState((prev) => removePSTSectionKeys(prev, depot));
    setTaNameState((prev) => removePSTSectionKeys(prev, depot));
  };

  const handleClearDepotPST = (depot) => {
    markPSTLiveLocalEdit();
    setPstLogLines((prev) => prev.filter((l) => l.depot !== depot));
    setPstState((prev) => removePSTSectionKeys(prev, depot));
    setPrepState((prev) => removePSTSectionKeys(prev, depot));
    setTaNameState((prev) => removePSTSectionKeys(prev, depot));
  };

  const handleAddRequest = async (reqData) => {
    const created = await base44.entities.MaintenanceRequest.create(reqData);
    setRequests((prev) => [...prev, created]);
  };

  const handleRemoveRequest = async (id) => {
    await base44.entities.MaintenanceRequest.delete(id).catch(() => {});
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAllRequests = async () => {
    await Promise.all(requests.map((r) => base44.entities.MaintenanceRequest.delete(r.id).catch(() => {})));
    setRequests([]);
  };

  const handleSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    pendingSaveRef.current = false;
    saveToDb(westData, eastData);
  };

  const duplicates = getDuplicates(westData, eastData);
  const maintenanceMap = buildMaintenanceMap(requests);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#071828]">
        <div className="w-8 h-8 border-4 border-[#1a3a56] border-t-[#4f8ef7] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-inter bg-[#071828]">
      <header className="h-[56px] sticky top-0 z-20" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)", borderBottom: "1px solid #1a3a56" }}>
        <div className="w-full px-4 h-full flex items-center justify-start gap-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <img 
  src="https://media.base44.com/images/public/69fd0add5545130d2d15d03c/456db1150_ChatGPTImageMay15202605_49_31PM.png" 
  alt="Riyadh Metro" 
  className="h-10 w-auto object-contain" 
/>
              <div className="w-px h-6 bg-[#1a3a56]" />
              <span className="text-sm font-bold text-white tracking-tight">L3 Depot Controller Template</span>
            </div>
            
            <HeaderBookmarkDropdown
              links={bookmarkLinks}
              loading={bookmarkLoading}
              error={bookmarkError}
              isOpen={bookmarkOpen}
              setIsOpen={setBookmarkOpen}
              menuRef={bookmarkMenuRef}
              editId={bookmarkEditId}
              draft={bookmarkDraft}
              saving={bookmarkSaving}
              onStartAdd={handleStartAddBookmark}
              onStartEdit={handleStartEditBookmark}
              onCancelEdit={handleCancelBookmarkEdit}
              onDraftChange={handleBookmarkDraftChange}
              onSave={handleSaveBookmark}
              onDelete={handleDeleteBookmark}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all disabled:opacity-60 bg-[#1a3a5c] hover:bg-[#0f2d4a] border border-[#2b4f6b] text-white shadow-sm"
            >
              {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
            <div className="flex items-center gap-2 bg-[#071828] border border-[#1a3a56] px-3 py-1.5 rounded-lg">
              <div className={`w-1.5 h-1.5 rounded-full ${syncError ? "bg-red-400" : syncing ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
              <span className="text-[10px] text-[#7eb8e0]">
                {syncError ? "Live sync issue" : syncing ? "Updating..." : lastSynced ? `Live sync on • Last synced ${formatTime(lastSynced)}` : "Live sync on"}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-[#071828] border border-[#1a3a56] px-3 py-1.5 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-[#7eb8e0]">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleHeaderHorizontalScroll("left")}
              title="Go to far left"
              aria-label="Go to far left"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#2b4f6b] bg-[#071828] px-3 text-[10px] font-black uppercase tracking-wide text-[#8bd5ff] shadow-[0_0_14px_rgba(79,142,247,0.18)] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white active:scale-95"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 5l-7 7 7 7" />
              </svg>
              Left
            </button>
            <button
              type="button"
              onClick={() => handleHeaderHorizontalScroll("right")}
              title="Go to far right"
              aria-label="Go to far right"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#2b4f6b] bg-[#071828] px-3 text-[10px] font-black uppercase tracking-wide text-[#8bd5ff] shadow-[0_0_14px_rgba(79,142,247,0.18)] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white active:scale-95"
            >
              Right
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-56px)]">

        {/* Left Sidebar Tab Navigation */}
        <aside
          className={`${isSidebarCollapsed ? "w-[58px] px-2" : "w-[200px] px-3"} flex-shrink-0 sticky top-[56px] h-[calc(100vh-56px)] flex flex-col pt-4 gap-1 z-10 transition-all duration-300 ease-in-out`}
          style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)", borderRight: "1px solid #1a3a56" }}
        >
          <div className={`mb-2 flex items-center ${isSidebarCollapsed ? "justify-center px-0" : "justify-between px-2"}`}>
            {!isSidebarCollapsed && (
              <p className="text-[9px] font-black tracking-widest uppercase text-[#4a8ab5]">Navigation</p>
            )}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              title={isSidebarCollapsed ? "Show navigation for 3 seconds" : "Hide navigation now"}
              aria-label={isSidebarCollapsed ? "Show navigation for 3 seconds" : "Hide navigation now"}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2b4f6b] bg-[#071828] text-[#7eb8e0] shadow-sm transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                {isSidebarCollapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
              </svg>
            </button>
          </div>

          {[
            {
              key: "stabling",
              label: "Train Req",
              to: "/depot-stabling",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              ),
            },

            {
              key: "movement",
              label: "Train Movement",
              to: "/train-movement",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="3" width="16" height="15" rx="3"/><path d="M8 21l2-3"/><path d="M16 21l-2-3"/><path d="M8 8h8"/><path d="M8 13h.01"/><path d="M16 13h.01"/>
                </svg>
              ),
            },

            {
              key: "pst",
              label: "PST / Train Prep",
              to: "/pst-train-prep",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              ),
            },
            {
              key: "insertion",
              label: "Insertion",
              to: "/insertion",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 12 12 5 19 12"/><line x1="12" y1="5" x2="12" y2="19"/>
                </svg>
              ),
            },
            {
              key: "washing",
              label: "Train Washing",
              to: "/train-washing",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              ),
            },
            {
              key: "odo",
              label: "ODO Reading",
              to: "/odo-reading",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              ),
            },
            {
              key: "possession",
              label: "Possession",
              to: "/possession",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>
                </svg>
              ),
            },
          ].map(({ key, label, icon, to }) => {
            const isActive = activeTab === key;
            const navClass = `flex items-center ${isSidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3"} py-2.5 rounded-lg text-xs font-semibold transition-all text-left w-full ${
              isActive
                ? "bg-[#1a3a5c] text-white shadow-sm border border-[#2b4f6b]"
                : "text-[#7eb8e0] hover:text-white hover:bg-[#0f2d4a]"
            }`;

            if (to) {
              return (
                <Link
                  key={key}
                  to={to}
                  onClick={() => setActiveTab(key)}
                  title={isSidebarCollapsed ? label : undefined}
                  className={navClass}
                >
                  <span className="flex-shrink-0">{icon}</span>
                  {!isSidebarCollapsed && <span>{label}</span>}
                </Link>
              );
            }

            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                title={isSidebarCollapsed ? label : undefined}
                className={navClass}
              >
                <span className="flex-shrink-0">{icon}</span>
                {!isSidebarCollapsed && <span>{label}</span>}
              </button>
            );
          })}
        </aside>

        {/* Main Content */}
        <main ref={mainContentScrollRef} className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-[1700px] mx-auto px-5 py-5">

  {activeTab === "stabling" && (
  <div
    ref={stablingHorizontalScrollRef}
    className="grid gap-5 items-start overflow-x-auto scroll-smooth"
    style={{ gridTemplateColumns: "960px auto" }}
  >
    {/* LEFT CONTENT - left aligned stabling tables */}
    <div className="min-w-0 flex flex-col items-start gap-5">
      <StablingSection
        depot="west"
        title="WEST DEPOT STABLING"
        blockLabels={["BLOCK 7", "BLOCK 6", "BLOCK 5", "BLOCK 4", "BLOCK 3", "BLOCK 2", "BLOCK 1"]}
        blockIndices={[6, 5, 4, 3, 2, 1, 0]}
        roads={WEST_ROADS}
        data={westData}
        labelSide="left"
        duplicates={duplicates}
        maintenanceMap={maintenanceMap}
        cellRefs={cellRefs}
        flashingCells={flashingCells}
        onCellKeyDown={handleCellKeyDown}
        onUpdate={(road, bi, val) => updateBlockTrain("west", road, bi, val)}
        onCommit={(road, bi, val) => commitBlockTrain("west", road, bi, val)}
        onEditStart={handleStablingEditStart}
        onEditEnd={handleStablingEditEnd}
        onClearAll={() => handleClearStabling("west")}
        allDepots={[
          { depotLabel: "West Depot", roads: WEST_ROADS, data: westData, blockLabels: ["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"], blockIndices: [6,5,4,3,2,1,0] },
          { depotLabel: "East Depot", roads: EAST_ROADS, data: eastData, blockLabels: ["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"], blockIndices: [0,1,2,3,4,5,6] },
        ]}
      />

      <StablingSection
        depot="east"
        title="EAST DEPOT STABLING"
        blockLabels={["BLOCK 1", "BLOCK 2", "BLOCK 3", "BLOCK 4", "BLOCK 5", "BLOCK 6", "BLOCK 7"]}
        blockIndices={[0, 1, 2, 3, 4, 5, 6]}
        roads={EAST_ROADS}
        data={eastData}
        labelSide="right"
        duplicates={duplicates}
        maintenanceMap={maintenanceMap}
        cellRefs={cellRefs}
        flashingCells={flashingCells}
        onCellKeyDown={handleCellKeyDown}
        onUpdate={(road, bi, val) => updateBlockTrain("east", road, bi, val)}
        onCommit={(road, bi, val) => commitBlockTrain("east", road, bi, val)}
        onEditStart={handleStablingEditStart}
        onEditEnd={handleStablingEditEnd}
        onClearAll={() => handleClearStabling("east")}
        allDepots={[
          { depotLabel: "West Depot", roads: WEST_ROADS, data: westData, blockLabels: ["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"], blockIndices: [6,5,4,3,2,1,0] },
          { depotLabel: "East Depot", roads: EAST_ROADS, data: eastData, blockLabels: ["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"], blockIndices: [0,1,2,3,4,5,6] },
        ]}
      />


      <TrainRequestedNotInRemoval
        requests={requests}
        trainRemState={trainRemCheckState}
        maintenanceMap={maintenanceMap}
        westData={westData}
      />

      <RemovalLogOutputFromTrainRem
        trainRemState={trainRemCheckState}
        maintenanceMap={maintenanceMap}
      />
    </div>

    {/* RIGHT PANEL */}
    <div className="flex items-start gap-5 sticky top-1 self-start mt-0 pt-0 w-fit">
      <div
        className="maintenance-panel-shell"
        style={{ width: 276, minWidth: 276, flex: "0 0 276px" }}
      >
        <style>{`
          .maintenance-panel-shell > * {
            width: 100%;
          }

          .maintenance-panel-shell button[class*="red"] svg,
          .maintenance-panel-shell button[class*="danger"] svg,
          .maintenance-panel-shell button[class*="text-red"] svg,
          .maintenance-panel-shell button[class*="border-red"] svg,
          .maintenance-panel-shell button[class*="bg-red"] svg {
            color: #f87171 !important;
            stroke: #f87171 !important;
          }

          .maintenance-panel-shell button[class*="red"] svg *,
          .maintenance-panel-shell button[class*="danger"] svg *,
          .maintenance-panel-shell button[class*="text-red"] svg *,
          .maintenance-panel-shell button[class*="border-red"] svg *,
          .maintenance-panel-shell button[class*="bg-red"] svg * {
            stroke: #f87171 !important;
          }
        `}</style>
        <MaintenancePanel
          requests={requests}
          onAdd={handleAddRequest}
          onRemove={handleRemoveRequest}
          onClearAll={handleClearAllRequests}
        />
      </div>

      <TrainRemPanel
        maintenanceMap={maintenanceMap}
        onTrainRemStateChange={setTrainRemCheckState}
      />
    </div>
  </div>
)}

        {activeTab === "movement" && (
          <TrainMovementContent />
        )}


        {activeTab === "insertion" && (
          <InsertionTabContent
            westData={westData}
            eastData={eastData}
            maintenanceMap={maintenanceMap}
            insertionLog={insertionLog}
            onInsertionTick={handleInsertionTick}
            onRemoveInsertionLog={handleRemoveInsertionLog}
            onClearInsertionDepot={handleClearInsertionDepot}
            onClearInsertedTidRemarks={handleClearInsertedTidRemarks}
            onClearInsertedTrains={handleClearInsertedTrains}
            tidInputs={tidInputs}
            onTidChange={handleTidChange}
            getTidScheduledTime={getTidScheduledTime}
            insertionLiveStatusText={insertionLiveStatusText}
            insertionLiveStatusClass={insertionLiveStatusClass}
            insertionLiveDebug={insertionLiveDebug}
          />
        )}

        {activeTab === "washing" && (
          <div className="grid w-full gap-5 xl:w-1/2">
            <TrainWashing />
            <TrainWashingDocxExport />
          </div>
        )}

        {activeTab === "odo" && (
          <OdoReading />
        )}

        {activeTab === "pst" && (
          <PSTTabContent
            westData={westData}
            eastData={eastData}
            maintenanceMap={maintenanceMap}
            pstState={pstState}
            prepState={prepState}
            logLines={pstLogLines}
            onPSTTick={handlePSTTick}
            onPSTStartTimeChange={handlePSTStartTimeChange}
            onPrepTick={handlePrepTick}
            onRemoveLog={handleRemovePSTLog}
            onClearDepotLog={handleClearDepotPST}
            onClearDepotPSTOnly={handleClearDepotPSTOnly}
            onClearDepotPrepOnly={handleClearDepotPrepOnly}
            taNameState={taNameState}
            onTaNameChange={handleTaNameChange}
            completedByNames={pstCompletedByNames}
            onCompletedByChange={handleCompletedByChange}
            pstLiveStatusText={pstLiveStatusText}
            pstLiveStatusClass={pstLiveStatusClass}
            pstLiveDebug={pstLiveDebug}
          />
        )}

        {activeTab === "possession" && (
          <PossessionTabContent />
        )}


        </div>
        </main>
      </div>
    </div>
  );
}

function getTrainRequestDisplayType(request = {}) {
  return request?.requestType === "Other"
    ? request?.customType || "Other"
    : request?.requestType || "Request";
}

function isUnfitTrainRequest(request = {}) {
  const displayType = normalizeRemarkText(getTrainRequestDisplayType(request));
  return displayType === "unfit" || displayType === "workshop /unfit" || displayType === "workshop / unfit";
}

function getTrainRemRowForTrain(trainRemState = {}, trainKey = "") {
  const key = normalizeTrainId(trainKey);
  if (!key) return null;

  for (const depot of ["west", "east"]) {
    const rows = normalizeTrainRemRows(trainRemState?.rows?.[depot], depot);
    const match = rows.find((row) => normalizeTrainId(row.trainId) === key);
    if (match) {
      return {
        depot,
        tid: (match.tid || "").toString().trim(),
        timing: (match.timing || "").toString().trim(),
        remark: (match.remark || "").toString().trim(),
      };
    }
  }

  return null;
}

function isWest9amPrioritySwapTid(trainRemState = {}, row = {}) {
  const selectedPreset = trainRemState?.selectedPreset?.west || "";
  const tid = (row?.tid || "").toString().trim();

  return selectedPreset === "9am" && TRAIN_REM_WEST_9AM_PRIORITY_TIDS.has(tid);
}

function getWestRemovalRowsMap(trainRemState = {}) {
  const map = new Map();

  normalizeTrainRemRows(trainRemState?.rows?.west, "west").forEach((row) => {
    // West 9am priority TIDs 207 / 209 / 211 are only for washing / swap checking.
    // They must not make the train appear under "will be removed to West Depot".
    if (isWest9amPrioritySwapTid(trainRemState, row)) return;

    const key = normalizeTrainId(row.trainId);
    if (!key) return;

    map.set(key, {
      tid: (row.tid || "").toString().trim(),
      timing: (row.timing || "").toString().trim(),
      remark: (row.remark || "").toString().trim(),
    });
  });

  return map;
}

function getWestStablingKeys(westData = {}) {
  const westStablingKeys = new Set();

  Object.values(westData || {}).forEach((blocks) => {
    (blocks || []).forEach((block) => {
      const key = normalizeTrainId(block?.trainId);
      if (key) westStablingKeys.add(key);
    });
  });

  return westStablingKeys;
}

function getRequestTid(request = {}, trainRemRow = {}) {
  return (
    trainRemRow?.tid ||
    request?.tid ||
    request?.TID ||
    request?.tidNo ||
    request?.trackingId ||
    ""
  ).toString().trim();
}

function getRequestTiming(request = {}, trainRemRow = {}) {
  return (
    request?.timeRemoved ||
    request?.removedTime ||
    request?.time ||
    request?.timing ||
    trainRemRow?.timing ||
    ""
  ).toString().trim();
}

function getRequestNoteSummaryForTrain(requests = [], trainKey = "") {
  const key = normalizeTrainId(trainKey);
  if (!key) return "";

  const notes = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;
    if (normalizeTrainId(request?.trainId) !== key) return;

    const displayType = getTrainRequestDisplayType(request);
    const rawRemark = (request?.remark || request?.note || "").toString().trim();
    const noteText = rawRemark || displayType;
    const noteKey = normalizeRemarkText(noteText);

    if (!noteText || seen.has(noteKey)) return;

    seen.add(noteKey);
    notes.push(noteText);
  });

  return notes.join(", ");
}

function getRequestedTrainsForWestDepotRemoval({ requests = [], trainRemState, westData = {} }) {
  const westRemovalRowsMap = getWestRemovalRowsMap(trainRemState);
  const westStablingKeys = getWestStablingKeys(westData);
  const requestedRows = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;

    const key = normalizeTrainId(request?.trainId);
    const trainRemRow = key ? westRemovalRowsMap.get(key) : null;

    if (!key || !trainRemRow || westStablingKeys.has(key) || seen.has(key)) return;

    seen.add(key);

    requestedRows.push({
      key,
      label: padTrainId(key),
      tid: getRequestTid(request, trainRemRow),
      requestType: getRequestNoteSummaryForTrain(requests, key) || getTrainRequestDisplayType(request),
      timeRemoved: getRequestTiming(request, trainRemRow),
      actionNote: "Removal to west depot",
    });
  });

  return requestedRows;
}

function getRequestedTrainsNotInWestDepotStablingRemoval({ requests = [], trainRemState, westData = {} }) {
  const westRemovalRowsMap = getWestRemovalRowsMap(trainRemState);
  const westStablingKeys = getWestStablingKeys(westData);
  const requestedRows = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;

    const key = normalizeTrainId(request?.trainId);
    if (!key || westRemovalRowsMap.has(key) || westStablingKeys.has(key) || seen.has(key)) return;

    seen.add(key);
    const trainRemRow = getTrainRemRowForTrain(trainRemState, key);

    requestedRows.push({
      key,
      label: padTrainId(key),
      tid: getRequestTid(request, trainRemRow),
      requestType: getRequestNoteSummaryForTrain(requests, key) || getTrainRequestDisplayType(request),
      timeRemoved: getRequestTiming(request, trainRemRow),
      actionNote: "",
    });
  });

  return requestedRows;
}

function getRequestedTrainTidSortValue(value = "") {
  const raw = (value || "").toString().trim();
  if (!raw) return Number.POSITIVE_INFINITY;

  const match = raw.match(/\d+/);
  if (!match) return Number.POSITIVE_INFINITY;

  const tidNumber = Number(match[0]);
  return Number.isFinite(tidNumber) ? tidNumber : Number.POSITIVE_INFINITY;
}

function getRequestedTrainLabelSortValue(value = "") {
  const key = normalizeTrainId(value);
  const match = key.match(/\d+/);
  if (!match) return Number.POSITIVE_INFINITY;

  const trainNumber = Number(match[0]);
  return Number.isFinite(trainNumber) ? trainNumber : Number.POSITIVE_INFINITY;
}

function sortRequestedTrainRowsByTid(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const tidA = getRequestedTrainTidSortValue(a?.tid);
    const tidB = getRequestedTrainTidSortValue(b?.tid);

    if (tidA !== tidB) return tidA - tidB;

    const trainA = getRequestedTrainLabelSortValue(a?.label || a?.key);
    const trainB = getRequestedTrainLabelSortValue(b?.label || b?.key);

    return trainA - trainB;
  });
}

function getRequestedTrainDisplayRows(rows = [], minRows = 3) {
  const normalizedRows = sortRequestedTrainRowsByTid(rows);
  const paddedRows = normalizedRows.map((row, index) => ({
    key: row?.key || `requested-${index}`,
    label: row?.label || "",
    tid: (row?.tid || "").toString().trim(),
    requestType: (row?.requestType || "").toString().trim(),
    actionNote: (row?.actionNote || row?.secondNote || "").toString().trim(),
  }));

  while (paddedRows.length < minRows) {
    paddedRows.push({
      key: `empty-${paddedRows.length + 1}`,
      label: "",
      tid: "",
      requestType: "",
      actionNote: "",
    });
  }

  return paddedRows;
}

function requestedDocxCell(text = "", { width = 1800, fontSize = 20, bold = false } = {}) {
  return `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${width}" w:type="dxa"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>
            <w:r>
              <w:rPr><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>${bold ? "<w:b/>" : ""}</w:rPr>
              <w:t xml:space="preserve">${xmlEscape(text || "")}</w:t>
            </w:r>
          </w:p>
        </w:tc>`;
}

function requestedDocxRow(cells, { header = false } = {}) {
  // Narrower requested-train table columns for DOCX export.
  // Both Note columns are reduced and kept equal width.
  const widths = [1000, 750, 1900, 1900];

  return `
      <w:tr>
        <w:trPr><w:trHeight w:val="300" w:hRule="atLeast"/></w:trPr>
        ${cells.map((cell, index) => requestedDocxCell(cell, { width: widths[index], bold: header })).join("")}
      </w:tr>`;
}

function buildRequestedTrainsDocx({ removalRows = [], swappingRows = [] } = {}) {
  const buildTableXml = (rows = []) => {
    const exportRows = getRequestedTrainDisplayRows(rows, 3);
    const tableRows = [
      requestedDocxRow(["Train Set", "TID", "Note:", "Note:"], { header: true }),
      ...exportRows.map((row) => requestedDocxRow([
        (row.label || "").replace(/^T/, ""),
        row.tid || "",
        row.requestType || "",
        row.actionNote || "",
      ])),
    ].join("");

    return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5550" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="1000"/>
        <w:gridCol w:w="750"/>
        <w:gridCol w:w="1900"/>
        <w:gridCol w:w="1900"/>
      </w:tblGrid>
      ${tableRows}
    </w:tbl>`;
  };

  const buildTitleXml = (title, before = 0, highlightSwapping = false) => {
    const swappingTarget = "required for swapping.";
    const removalTarget = "will be removed to West Depot";
    const target = highlightSwapping && title.includes(swappingTarget)
      ? swappingTarget
      : title.includes(removalTarget)
      ? removalTarget
      : "";
    const highlightColor = target === removalTarget ? "00B050" : "FF0000";

    if (!target) {
      return `
    <w:p>
      <w:pPr><w:spacing w:before="${before}" w:after="160"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
        <w:t xml:space="preserve">${xmlEscape(title)}</w:t>
      </w:r>
    </w:p>`;
    }

    const [prefix, suffix = ""] = title.split(target);

    return `
    <w:p>
      <w:pPr><w:spacing w:before="${before}" w:after="160"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
        <w:t xml:space="preserve">${xmlEscape(prefix)}</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="${highlightColor}"/></w:rPr>
        <w:t xml:space="preserve">${xmlEscape(target)}</w:t>
      </w:r>
      ${suffix ? `<w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlEscape(suffix)}</w:t></w:r>` : ""}
    </w:p>`;
  };

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${buildTitleXml("West Depot Train Request Overview")}
    ${buildTitleXml("Train requested and will be removed to West Depot.", 80)}
    ${buildTableXml(removalRows)}
    ${buildTitleXml("Train requested and required for swapping.", 180, true)}
    ${buildTableXml(swappingRows)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return buildStoredZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: packageRels },
    { name: "word/document.xml", data: documentXml },
  ]);
}

function downloadRequestedTrainsDocx({ removalRows = [], swappingRows = [] } = {}) {
  const docxBytes = buildRequestedTrainsDocx({ removalRows, swappingRows });
  const blob = new Blob([docxBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `requested-trains-west-depot-${dateStamp}.docx`);
}

function RequestedTrainPill({ children, accent = "#4f8ef7", muted = false }) {
  return (
    <span
      className="inline-flex min-w-[46px] items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none tracking-wide whitespace-nowrap"
      style={{
        background: muted
          ? "rgba(255,255,255,0.06)"
          : `linear-gradient(135deg,${hexToRgba(accent, 0.20)} 0%,rgba(8,37,31,0.82) 100%)`,
        borderColor: muted ? "#2b4f6b" : hexToRgba(accent, 0.74),
        color: muted ? "#8fa6bd" : "#eef7ff",
        boxShadow: muted
          ? "inset 0 1px 0 rgba(255,255,255,0.04)"
          : `0 0 8px ${hexToRgba(accent, 0.22)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      {children || "--"}
    </span>
  );
}

function RequestedTrainTitle({ title }) {
  const removalTarget = "will be removed to West Depot";
  const swappingTarget = "required for swapping.";

  const isRemovalTitle = title.includes(removalTarget);
  const isSwappingTitle = title.includes(swappingTarget);
  const target = isRemovalTitle ? removalTarget : isSwappingTitle ? swappingTarget : "";

  if (!target) {
    return title;
  }

  const [prefix, suffix = ""] = title.split(target);
  const glowStyle = isRemovalTitle
    ? {
        color: "#bbf7d0",
        textShadow: "0 0 8px rgba(74,222,128,0.95), 0 0 16px rgba(34,197,94,0.85), 0 0 24px rgba(22,163,74,0.65)",
        boxShadow: "0 0 10px rgba(34,197,94,0.45), inset 0 0 8px rgba(20,83,45,0.35)",
        background: "linear-gradient(135deg,rgba(20,83,45,0.34),rgba(5,46,22,0.20))",
        border: "1px solid rgba(74,222,128,0.44)",
      }
    : {
        color: "#fecaca",
        textShadow: "0 0 8px rgba(248,113,113,0.95), 0 0 16px rgba(239,68,68,0.85), 0 0 24px rgba(220,38,38,0.65)",
        boxShadow: "0 0 10px rgba(239,68,68,0.45), inset 0 0 8px rgba(127,29,29,0.35)",
        background: "linear-gradient(135deg,rgba(127,29,29,0.30),rgba(69,10,10,0.18))",
        border: "1px solid rgba(248,113,113,0.42)",
      };

  return (
    <>
      {prefix}
      <span className="rounded-md px-1.5 py-0.5 font-normal" style={glowStyle}>
        {target}
      </span>
      {suffix}
    </>
  );
}

function RequestedTrainTable({ title, rows = [], maintenanceMap = {} }) {
  const tableRows = getRequestedTrainDisplayRows(rows, 3);

  return (
    <div className="leading-tight">
      <div className="mb-2.5">
        <div className="text-[11px] font-normal text-[#d8e7f7] tracking-wide whitespace-nowrap">
          <RequestedTrainTitle title={title} />
        </div>
      </div>

      <div className="w-fit max-w-full overflow-hidden rounded-xl border border-[#2b4f6b] bg-[#071828]">
        <table className="table-fixed text-[11px] leading-none" style={{ width: 574, maxWidth: "100%" }}>
          <colgroup>
            <col style={{ width: 96 }} />
            <col style={{ width: 78 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 200 }} />
          </colgroup>
          <thead>
            <tr className="bg-[#0a2237] text-[#cfe5fb]">
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Train Set</th>
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">TID</th>
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Note:</th>
              <th className="border-b border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Note:</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item, index) => {
              const maintItem = maintenanceMap?.[item.key]?.[0] || null;
              const accent = maintItem ? getRequestAccent(maintItem) : "#4f8ef7";
              const isEmpty = !item.label && !item.tid && !item.requestType && !item.actionNote;

              return (
                <tr key={`${item.key}-${index}`} className="odd:bg-[#081b2d] even:bg-[#0a2136]">
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-none">
                    <RequestedTrainPill accent={accent} muted={isEmpty}>{item.label}</RequestedTrainPill>
                  </td>
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-none">
                    <RequestedTrainPill accent={accent} muted={isEmpty || !item.tid}>{item.tid}</RequestedTrainPill>
                  </td>
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-tight text-[#eaf4ff] whitespace-normal break-words">
                    {item.requestType || ""}
                  </td>
                  <td className="border-b border-[#193752] px-2 py-1 text-center align-middle leading-none text-[#eaf4ff]">
                    {item.actionNote || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrainRequestedNotInRemoval({ requests = [], trainRemState, maintenanceMap = {}, westData = {} }) {
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const removalRows = getRequestedTrainsForWestDepotRemoval({
    requests,
    trainRemState,
    westData,
  });
  const swappingRows = getRequestedTrainsNotInWestDepotStablingRemoval({
    requests,
    trainRemState,
    westData,
  });

  const handleDownloadDocx = () => {
    if (downloadingDocx) return;
    setDownloadingDocx(true);

    try {
      downloadRequestedTrainsDocx({ removalRows, swappingRows });
    } catch (error) {
      console.error("Requested trains DOCX export failed:", error);
      alert("Unable to create requested trains DOCX. Please try again.");
    } finally {
      setTimeout(() => setDownloadingDocx(false), 400);
    }
  };

  return (
    <div
      className="w-full rounded-xl border border-[#2b4f6b] bg-[#0b1f33] shadow-sm px-3 py-3"
      style={{
        background: "linear-gradient(135deg,rgba(12,46,74,0.62) 0%,rgba(7,24,40,0.96) 100%)",
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[260px]">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white drop-shadow-[0_0_10px_rgba(147,197,253,0.26)]">
            West Depot Train Request Overview
          </h2>
        </div>

        <button
          onClick={handleDownloadDocx}
          disabled={downloadingDocx}
          className="group flex items-center gap-1.5 h-6 px-2.5 rounded-[10px] border text-[10px] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
          style={{ ...MAIN_STABLING_BUTTON_BLUE, minHeight: 24, borderRadius: 10 }}
          title="Download requested trains tables as DOCX"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {downloadingDocx ? "Preparing..." : "Download DOCX"}
        </button>
      </div>

      <div className="space-y-2">
        <RequestedTrainTable
          title="Train requested and will be removed to West Depot."
          rows={removalRows}
          maintenanceMap={maintenanceMap}
        />

        <RequestedTrainTable
          title="Train requested and required for swapping."
          rows={swappingRows}
          maintenanceMap={maintenanceMap}
        />
      </div>
    </div>
  );
}





function cleanRemovalTime(value = "") {
  const raw = (value || "").toString().trim();
  if (!raw) return "";

  const match = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return raw.replace(/\s*hrs\.?$/i, "");

  const hour = match[1].padStart(2, "0");
  const minute = match[2].padStart(2, "0");
  return `${hour}:${minute}`;
}

function getRemovalTimeMinutes(value = "") {
  const time = cleanRemovalTime(value);
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.POSITIVE_INFINITY;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.POSITIVE_INFINITY;

  return hours * 60 + minutes;
}

function getTrainRemRemovalRemark(row = {}, maintenanceMap = {}) {
  const key = normalizeTrainId(row?.trainId);
  const requestRemark = key ? maintenanceMap?.[key]?.[0]?.badgeText || maintenanceMap?.[key]?.[0]?.displayType || "" : "";
  const manualRemark = (row?.remark || "").toString().trim();

  // Match the Train Rem table display: request remark first, manual remark second.
  return (requestRemark || manualRemark || "").toString().trim();
}

function getTrainRemRemovalRequestItem(row = {}, maintenanceMap = {}) {
  const key = normalizeTrainId(row?.trainId);
  return key ? maintenanceMap?.[key]?.[0] || null : null;
}

function getTrainRemRemovalRemarkItems(row = {}, maintenanceMap = {}) {
  const key = normalizeTrainId(row?.trainId);
  const requestItems = key && Array.isArray(maintenanceMap?.[key]) ? maintenanceMap[key] : [];
  const manualRemark = (row?.remark || "").toString().trim();
  const seen = new Set();
  const items = [];

  requestItems.forEach((item) => {
    const text = (item?.badgeText || item?.remark || item?.displayType || item?.typeKey || "").toString().trim();
    const clean = normalizeRemarkText(text);
    if (!text || seen.has(clean)) return;

    seen.add(clean);
    items.push({
      text,
      fill: getRemovalRemarkFillColor(text, item) || "#ffffff",
      stroke: item?.badgeBorder || item?.badgeBg || "#000000",
    });
  });

  if (manualRemark) {
    const cleanManual = normalizeRemarkText(manualRemark);
    if (!seen.has(cleanManual)) {
      items.push({
        text: manualRemark,
        fill: getRemovalRemarkFillColor(manualRemark, null) || "#ffffff",
        stroke: "#000000",
      });
    }
  }

  return items;
}

function getRemovalRemarkFillColor(remark = "", requestItem = null) {
  const noteOverrideColor = getTrainRemNoteOverrideColor(remark);
  if (noteOverrideColor) return noteOverrideColor;

  const clean = normalizeRemarkText(remark);
  if (!clean || clean === "-") return "";

  const text = clean.toUpperCase();
  const styleChecks = [
    ["RST PM", MAINT_STYLES["RST PM"]],
    ["RST CM", MAINT_STYLES["RST CM"]],
    ["WASH", MAINT_STYLES.WASH],
    ["HVAC TESTING", MAINT_STYLES["HVAC TESTING"]],
    ["HVAC", MAINT_STYLES["HVAC TESTING"]],
    ["UNFIT", MAINT_STYLES.UNFIT],
    ["TLC", MAINT_STYLES["TLC Comms"]],
    ["ML FAULT", MAINT_STYLES["ML Fault"]],
    ["DEEP CLEAN", MAINT_STYLES["Deep Cleaning"]],
    ["INBOUND", MAINT_STYLES["INBOUND (G to C)"]],
    ["CC TECH", MAINT_STYLES["CC Tech/Func. Alarm"]],
    ["DOOR", MAINT_STYLES["Door Issue"]],
    ["TRAINING", MAINT_STYLES.Training],
    ["APU", MAINT_STYLES["APU alarm"]],
  ];

  const matchedStyle = styleChecks.find(([keyword]) => text.includes(keyword))?.[1];
  return (
    matchedStyle?.badgeBg ||
    matchedStyle?.cellBg ||
    requestItem?.badgeBg ||
    requestItem?.cellBg ||
    ""
  );
}

function getTrainRemRemovalEntries(trainRemState = {}, depot = "west", maintenanceMap = {}) {
  return normalizeTrainRemRows(trainRemState?.rows?.[depot], depot)
    .map((row, index) => {
      if (depot === "west" && isWest9amPrioritySwapTid(trainRemState, row)) return null;

      const key = normalizeTrainId(row?.trainId);
      const time = cleanRemovalTime(row?.timing);
      if (!key || !time) return null;

      const requestItem = getTrainRemRemovalRequestItem(row, maintenanceMap);
      const remarkPills = getTrainRemRemovalRemarkItems(row, maintenanceMap);
      const remark = remarkPills.map((item) => item.text).join(" / ") || getTrainRemRemovalRemark(row, maintenanceMap);

      return {
        trainId: padTrainId(key),
        tid: (row?.tid || "").toString().trim(),
        time,
        remark,
        remarkPills,
        remarkFill: getRemovalRemarkFillColor(remark, requestItem),
        sortMinutes: getRemovalTimeMinutes(time),
        originalIndex: index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const timeDiff = a.sortMinutes - b.sortMinutes;
      if (timeDiff !== 0) return timeDiff;

      const trainDiff = a.trainId.localeCompare(b.trainId, undefined, { numeric: true, sensitivity: "base" });
      if (trainDiff !== 0) return trainDiff;

      return a.originalIndex - b.originalIndex;
    })
    .map(({ sortMinutes, originalIndex, ...entry }) => entry);
}

function buildTrainRemRemovalLog(trainRemState = {}, depot = "west", maintenanceMap = {}) {
  const config = depot === "east"
    ? {
        depot,
        depotLabel: "East Depot",
        source: "3K1 (Platform 1)",
        title: "EAST DEPOT REMOVAL LOG",
        dotColor: "#22d3ee",
        noEntryText: "No valid East Depot removal entries",
        copyLabel: "Copy East Log",
      }
    : {
        depot: "west",
        depotLabel: "West Depot",
        source: "3A1 (Platform 2)",
        title: "WEST DEPOT REMOVAL LOG",
        dotColor: "#c084fc",
        noEntryText: "No valid West Depot removal entries",
        copyLabel: "Copy West Log",
      };

  const entries = getTrainRemRemovalEntries(trainRemState, config.depot, maintenanceMap);
  const trainWord = entries.length === 1 ? "train" : "trains";
  const trainList = formatTrainList(entries.map((entry) => entry.trainId));

  const lines = entries.length
    ? [
        `Removal from ${config.source} to ${config.depotLabel}: ${entries.length} ${trainWord} completed.`,
        `Trains: ${trainList}.`,
        ...entries.map((entry) =>
          entry.tid
            ? `${entry.time} hrs – ${entry.trainId} (TID ${entry.tid}) removed from mainline to ${config.depotLabel}.`
            : `${entry.time} hrs – ${entry.trainId} removed from mainline to ${config.depotLabel}.`
        ),
      ]
    : [];

  return {
    ...config,
    entries,
    text: lines.join("\n"),
  };
}

function copyTextToClipboard(text = "") {
  if (!text) return Promise.resolve(false);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true);
  }

  return new Promise((resolve) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      resolve(ok);
    } catch {
      resolve(false);
    }
  });
}


function sanitizePdfText(value = "") {
  return (value ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value = "") {
  return sanitizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function hexToPdfColor(hex = "#ffffff") {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return [1, 1, 1];
  return [0, 2, 4].map((start) => Number.parseInt(clean.slice(start, start + 2), 16) / 255);
}

function pdfColor(hex = "#ffffff") {
  return hexToPdfColor(hex).map((value) => Number(value).toFixed(3)).join(" ");
}

function pdfText(value, x, y, { size = 10, color = "#ffffff", font = "F1" } = {}) {
  return `BT /${font} ${size} Tf ${pdfColor(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET\n`;
}

function pdfRoundedRect(x, y, width, height, radius, { fill = "#0b1f33", stroke = "", strokeWidth = 1 } = {}) {
  const r = Math.min(radius, width / 2, height / 2);
  const c = r * 0.5522847498;
  const path = [
    `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
    `${(x + width - r).toFixed(2)} ${y.toFixed(2)} l`,
    `${(x + width - r + c).toFixed(2)} ${y.toFixed(2)} ${(x + width).toFixed(2)} ${(y + r - c).toFixed(2)} ${(x + width).toFixed(2)} ${(y + r).toFixed(2)} c`,
    `${(x + width).toFixed(2)} ${(y + height - r).toFixed(2)} l`,
    `${(x + width).toFixed(2)} ${(y + height - r + c).toFixed(2)} ${(x + width - r + c).toFixed(2)} ${(y + height).toFixed(2)} ${(x + width - r).toFixed(2)} ${(y + height).toFixed(2)} c`,
    `${(x + r).toFixed(2)} ${(y + height).toFixed(2)} l`,
    `${(x + r - c).toFixed(2)} ${(y + height).toFixed(2)} ${x.toFixed(2)} ${(y + height - r + c).toFixed(2)} ${x.toFixed(2)} ${(y + height - r).toFixed(2)} c`,
    `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
    `${x.toFixed(2)} ${(y + r - c).toFixed(2)} ${(x + r - c).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`,
    "h",
  ].join(" ");

  const fillCmd = fill ? `${pdfColor(fill)} rg` : "";
  const strokeCmd = stroke ? `${pdfColor(stroke)} RG ${strokeWidth.toFixed(2)} w` : "";
  const paintCmd = fill && stroke ? "B" : fill ? "f" : "S";

  return `q ${fillCmd} ${strokeCmd} ${path} ${paintCmd} Q\n`;
}

function truncatePdfText(value = "", maxLength = 42) {
  const clean = sanitizePdfText(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildPdfDocument(pageContents = [], pageSize = {}) {
  const safePages = pageContents.length ? pageContents : [""];
  const pageWidth = Number(pageSize?.width) || 595.28;
  const pageHeight = Number(pageSize?.height) || 841.89;
  const fontObjectId = 3 + safePages.length * 2;
  const objects = [];

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const kids = safePages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${safePages.length} >>\nendobj\n`;

  safePages.forEach((content, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    objects[pageId] = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${fontObjectId + 1} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
  });

  objects[fontObjectId] = `${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  objects[fontObjectId + 1] = `${fontObjectId + 1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`;

  const maxObjectId = fontObjectId + 1;
  let pdf = "%PDF-1.4\n% TrainLog PDF Export\n";
  const offsets = [0];

  for (let id = 1; id <= maxObjectId; id += 1) {
    offsets[id] = pdf.length;
    pdf += objects[id];
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxObjectId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxObjectId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

function buildRemovalPdfBlob(log = {}) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 30;
  const rows = Array.isArray(log.entries) ? log.entries : [];
  const title = log.depotLabel ? `${log.depotLabel} Removal` : "Depot Removal";
  const contentWidth = pageWidth - marginX * 2;
  const pages = [];
  let ops = "";

  const yFromTop = (top, height = 0) => pageHeight - top - height;

  ops += `q ${pdfColor("#ffffff")} rg 0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} re f Q\n`;

  // Compact black-and-white header.
  ops += pdfRoundedRect(24, yFromTop(22, 62), pageWidth - 48, 62, 16, {
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  });
  ops += pdfText(title.toUpperCase(), 42, yFromTop(46), {
    size: 15,
    color: "#000000",
    font: "F2",
  });
  ops += pdfText(`Source: ${log.source || "Mainline"}  |  Total: ${rows.length} ${rows.length === 1 ? "train" : "trains"}`, 42, yFromTop(65), {
    size: 8.5,
    color: "#000000",
  });
  ops += pdfRoundedRect(pageWidth - 154, yFromTop(41, 24), 110, 24, 12, {
    fill: "#000000",
    stroke: "#000000",
    strokeWidth: 0.8,
  });
  ops += pdfText(`${rows.length} REMOVAL${rows.length === 1 ? "" : "S"}`, pageWidth - 132, yFromTop(57), {
    size: 8.2,
    color: "#ffffff",
    font: "F2",
  });

  if (rows.length === 0) {
    ops += pdfRoundedRect(marginX, yFromTop(104, 46), contentWidth, 46, 16, {
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 0.9,
    });
    ops += pdfText(log.noEntryText || "No valid removal entries", marginX + 170, yFromTop(132), {
      size: 11,
      color: "#000000",
      font: "F2",
    });
    pages.push(ops);
    const emptyPdf = buildPdfDocument(pages);
    return new Blob([emptyPdf], { type: "application/pdf" });
  }

  // Designed to keep West/East removal on one A4 page.
  const headerTop = 96;
  const rowStartTop = 124;
  const bottomTopLimit = 818;
  const availableRowHeight = Math.floor((bottomTopLimit - rowStartTop) / Math.max(rows.length, 1));
  const rowHeight = Math.max(18, Math.min(24, availableRowHeight));
  const rowPillHeight = Math.max(15, rowHeight - 4);
  const fieldYInset = Math.max(3, (rowPillHeight - 14) / 2);
  const fontSize = rowHeight <= 18 ? 7.4 : rowHeight <= 20 ? 8 : 8.5;
  const labelFont = 7;

  const col = {
    no: marginX + 12,
    train: marginX + 62,
    tid: marginX + 138,
    time: marginX + 202,
    remark: marginX + 292,
  };
  // Keep the highlighted remark pill compact instead of stretching to the end of the row.
  const remarkWidth = Math.min(165, Math.max(105, marginX + contentWidth - col.remark - 10));

  // Column guide bar.
  ops += pdfRoundedRect(marginX, yFromTop(headerTop, 22), contentWidth, 22, 11, {
    fill: "#000000",
    stroke: "#000000",
    strokeWidth: 0.8,
  });
  ops += pdfText("NO", col.no + 2, yFromTop(headerTop + 14), { size: labelFont, color: "#ffffff", font: "F2" });
  ops += pdfText("TRAIN ID", col.train, yFromTop(headerTop + 14), { size: labelFont, color: "#ffffff", font: "F2" });
  ops += pdfText("TID", col.tid, yFromTop(headerTop + 14), { size: labelFont, color: "#ffffff", font: "F2" });
  ops += pdfText("TIMING", col.time, yFromTop(headerTop + 14), { size: labelFont, color: "#ffffff", font: "F2" });
  ops += pdfText("REMARK", col.remark + 8, yFromTop(headerTop + 14), { size: labelFont, color: "#ffffff", font: "F2" });

  rows.forEach((entry, index) => {
    const top = rowStartTop + index * rowHeight;
    const y = yFromTop(top, rowPillHeight);
    const fieldY = y + fieldYInset;

    ops += pdfRoundedRect(marginX, y, contentWidth, rowPillHeight, 10, {
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 0.55,
    });

    // Small black number pill keeps the style modern while remaining black-and-white.
    ops += pdfRoundedRect(col.no - 3, fieldY - 1, 28, 15, 7.5, {
      fill: "#000000",
      stroke: "#000000",
      strokeWidth: 0.4,
    });
    ops += pdfText(String(index + 1).padStart(2, "0"), col.no + 4, fieldY + 4, {
      size: fontSize - 0.3,
      color: "#ffffff",
      font: "F2",
    });

    // Only the remark is highlighted.
    ops += pdfRoundedRect(col.remark, fieldY - 1, remarkWidth, 15, 7.5, {
      fill: "#e6e6e6",
      stroke: "#000000",
      strokeWidth: 0.35,
    });

    ops += pdfText(truncatePdfText(entry.trainId || "-", 9), col.train, fieldY + 4, {
      size: fontSize,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(truncatePdfText(entry.tid || "-", 7), col.tid, fieldY + 4, {
      size: fontSize,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(truncatePdfText(entry.time ? `${entry.time} hrs` : "-", 12), col.time, fieldY + 4, {
      size: fontSize,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(truncatePdfText(entry.remark || "-", 24), col.remark + 8, fieldY + 4, {
      size: fontSize,
      color: "#000000",
      font: "F2",
    });
  });

  ops += pdfText("Generated by TrainLog", marginX, 24, {
    size: 7,
    color: "#000000",
  });

  pages.push(ops);
  const pdf = buildPdfDocument(pages);
  return new Blob([pdf], { type: "application/pdf" });
}


function buildCombinedRemovalPdfBlob(westLog = {}, eastLog = {}) {
  // A4 landscape, one page: West at left and East at right.
  // Table layout with compact colour-coded remark pills inside each remark cell.
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 22;
  const gutter = 18;
  const columnWidth = (pageWidth - marginX * 2 - gutter) / 2;
  const pageSize = { width: pageWidth, height: pageHeight };
  const yFromTop = (top, height = 0) => pageHeight - top - height;

  const westRows = Array.isArray(westLog?.entries) ? westLog.entries : [];
  const eastRows = Array.isArray(eastLog?.entries) ? eastLog.entries : [];
  const maxRows = Math.max(westRows.length, eastRows.length, 1);

  const titleTop = 28;
  const columnTitleTop = 62;
  const tableTop = 108;
  const tableBottomTop = 566;
  const headerHeight = 17;
  const availableBodyHeight = tableBottomTop - tableTop - headerHeight;
  const rowHeight = Math.max(11.5, Math.min(15.2, availableBodyHeight / maxRows));
  const fontSize = rowHeight <= 12 ? 5.7 : rowHeight <= 13 ? 6.1 : rowHeight <= 14 ? 6.4 : 6.8;
  const headerFontSize = 6.4;

  const rect = (x, y, width, height, { fill = "", stroke = "#000000", strokeWidth = 0.45 } = {}) => {
    const fillCmd = fill ? `${pdfColor(fill)} rg` : "";
    const strokeCmd = stroke ? `${pdfColor(stroke)} RG ${strokeWidth.toFixed(2)} w` : "";
    const paintCmd = fill && stroke ? "B" : fill ? "f" : "S";
    return `q ${fillCmd} ${strokeCmd} ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${paintCmd} Q\n`;
  };

  const line = (x1, y1, x2, y2, width = 0.35) => {
    return `q ${pdfColor("#000000")} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q\n`;
  };

  let ops = "";
  ops += rect(0, 0, pageWidth, pageHeight, { fill: "#ffffff", stroke: "" });

  // Simple text header, no rounded label/pill.
  ops += pdfText("DEPOT REMOVAL SUMMARY", marginX, yFromTop(titleTop), {
    size: 14,
    color: "#000000",
    font: "F2",
  });
  ops += pdfText(`West: ${westRows.length} ${westRows.length === 1 ? "train" : "trains"}   |   East: ${eastRows.length} ${eastRows.length === 1 ? "train" : "trains"}`, marginX, yFromTop(titleTop + 16), {
    size: 7.3,
    color: "#000000",
  });
  ops += line(marginX, yFromTop(titleTop + 24), pageWidth - marginX, yFromTop(titleTop + 24), 0.5);

  const getFittedPdfText = (value, maxLength) => truncatePdfText(value || "-", maxLength);

  const getApproxPdfTextWidth = (value, size, bold = false) => {
    const text = sanitizePdfText(value || "");
    // Slightly conservative width estimate for PDF Helvetica text.
    // This prevents long bold remark labels from overflowing their pill background.
    return text.length * size * (bold ? 0.66 : 0.54);
  };

  const drawTextInCell = (value, x, y, maxLength, { size = fontSize, bold = false, align = "left", width = 0 } = {}) => {
    const fittedText = getFittedPdfText(value, maxLength);
    let drawX = x;

    if (align === "center" && width > 0) {
      drawX = x + Math.max(0, (width - getApproxPdfTextWidth(fittedText, size, bold)) / 2);
    }

    ops += pdfText(fittedText, drawX, y, {
      size,
      color: "#000000",
      font: bold ? "F2" : "F1",
    });
  };

  const drawRemarkPills = (entry = {}, cellX, rowY, cellWidth, rowH, fallbackTextY) => {
    const pills = Array.isArray(entry?.remarkPills)
      ? entry.remarkPills.filter((pill) => (pill?.text || "").toString().trim())
      : [];

    if (pills.length === 0) {
      drawTextInCell("-", cellX + 8, fallbackTextY, 2, { size: fontSize, bold: false });
      return;
    }

    const visiblePills = pills.slice(0, 3).map((pill) => ({
      ...pill,
      cleanText: sanitizePdfText(pill.text || "-"),
    }));

    const gap = visiblePills.length >= 3 ? 2 : 3;
    const pillHeight = Math.max(8.2, Math.min(10.8, rowH - 2.4));
    const pillY = rowY + (rowH - pillHeight) / 2;
    const basePillFontSize = Math.max(4.8, Math.min(5.8, fontSize - 0.55));
    const safeLeft = cellX + 4;
    const safeRight = cellX + cellWidth - 4;
    const availableWidth = Math.max(10, safeRight - safeLeft);
    const pillPaddingX = visiblePills.length > 1 ? 5 : 8;

    // Use equal pill slots for multiple remarks. This prevents the next coloured pill
    // from covering the tail of short labels such as "TODAY PM".
    const slotWidth = visiblePills.length > 1
      ? Math.max(28, (availableWidth - gap * (visiblePills.length - 1)) / visiblePills.length)
      : availableWidth;

    // More conservative than getApproxPdfTextWidth because PDF viewers/browser canvas
    // can render Helvetica bold slightly wider. Short operational labels should shrink,
    // not truncate, so "TODAY PM" never becomes "TODA".
    const getSafeTextWidth = (value, size, bold = true) => sanitizePdfText(value || "").length * size * (bold ? 0.82 : 0.58);

    const fitLabelForPill = (value, pillWidth) => {
      const clean = sanitizePdfText(value || "-");
      const maxTextWidth = Math.max(8, pillWidth - pillPaddingX * 2);
      let size = basePillFontSize;

      while (getSafeTextWidth(clean, size, true) > maxTextWidth && size > 3.35) {
        size -= 0.15;
      }

      // Keep common short request labels in full; reduce the font instead of cutting.
      if (clean.length <= 10) {
        return { text: clean, size: Math.max(3.35, size) };
      }

      if (getSafeTextWidth(clean, size, true) <= maxTextWidth) {
        return { text: clean, size };
      }

      let fitted = clean;
      while (fitted.length > 4 && getSafeTextWidth(`${fitted}...`, size, true) > maxTextWidth) {
        fitted = fitted.slice(0, -1).trimEnd();
      }

      return { text: fitted.length > 4 ? `${fitted}...` : fitted, size };
    };

    let cursorX = safeLeft;

    visiblePills.forEach((pill, index) => {
      if (cursorX >= safeRight - 8) return;

      const remainingPills = visiblePills.length - index;
      const remainingWidth = safeRight - cursorX - gap * Math.max(0, remainingPills - 1);
      const pillWidth = visiblePills.length > 1
        ? Math.min(slotWidth, remainingWidth)
        : Math.min(
            availableWidth,
            Math.max(
              42,
              getSafeTextWidth(pill.cleanText, basePillFontSize, true) + pillPaddingX * 2
            )
          );
      const fitted = fitLabelForPill(pill.cleanText, pillWidth);
      const textWidth = getSafeTextWidth(fitted.text, fitted.size, true);
      const textX = cursorX + Math.max(2, (pillWidth - textWidth) / 2);

      ops += pdfRoundedRect(cursorX, pillY, pillWidth, pillHeight, pillHeight / 2, {
        fill: pill.fill || "#ffffff",
        stroke: pill.stroke || "#000000",
        strokeWidth: 0.35,
      });
      ops += pdfText(fitted.text, textX, fallbackTextY, {
        size: fitted.size,
        color: "#000000",
        font: "F2",
      });

      cursorX += pillWidth + gap;
    });
  };

  const drawColumn = (log = {}, x, sideLabel) => {
    const rows = Array.isArray(log?.entries) ? log.entries : [];
    const source = log?.source || "Mainline";
    const title = sideLabel === "west" ? "WEST DEPOT" : "EAST DEPOT";

    const colWidths = {
      no: 31,
      train: 53,
      tid: 42,
      time: 62,
      // Wider remark column so paired request pills like "TODAY PM" and "TMRW PM"
      // are printed in full in the Depot Removal Summary PDF.
      remark: 192,
    };
    const colX = {
      no: x,
      train: x + colWidths.no,
      tid: x + colWidths.no + colWidths.train,
      time: x + colWidths.no + colWidths.train + colWidths.tid,
      remark: x + colWidths.no + colWidths.train + colWidths.tid + colWidths.time,
    };
    const tableWidth = colWidths.no + colWidths.train + colWidths.tid + colWidths.time + colWidths.remark;
    const tableHeight = headerHeight + Math.max(rows.length, 1) * rowHeight;
    const tableY = yFromTop(tableTop, tableHeight);

    ops += pdfText(title, x, yFromTop(columnTitleTop), {
      size: 11,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(`Source: ${source} | Total: ${rows.length}`, x, yFromTop(columnTitleTop + 14), {
      size: 6.8,
      color: "#000000",
    });

    // Outer table border.
    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });

    // Header row line.
    const headerBottomY = yFromTop(tableTop + headerHeight);
    ops += line(x, headerBottomY, x + tableWidth, headerBottomY, 0.55);

    // Vertical grid lines.
    [colX.train, colX.tid, colX.time, colX.remark].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });

    // Header labels.
    const headerTextY = yFromTop(tableTop + 11);
    drawTextInCell("NO", colX.no + 7, headerTextY, 4, { size: headerFontSize, bold: true });
    drawTextInCell("TRAIN", colX.train + 9, headerTextY, 8, { size: headerFontSize, bold: true });
    drawTextInCell("TID", colX.tid + 10, headerTextY, 5, { size: headerFontSize, bold: true });
    drawTextInCell("TIME", colX.time + 13, headerTextY, 7, { size: headerFontSize, bold: true });
    drawTextInCell("REMARK", colX.remark + 8, headerTextY, 10, { size: headerFontSize, bold: true });

    if (rows.length === 0) {
      const rowTop = tableTop + headerHeight;
      const rowY = yFromTop(rowTop, rowHeight);
      drawTextInCell(log?.noEntryText || "No valid removal entries", x + 10, rowY + rowHeight / 2 - 2, 46, {
        size: 6.8,
        bold: true,
      });
      return;
    }

    rows.forEach((entry, index) => {
      const rowTop = tableTop + headerHeight + index * rowHeight;
      const rowY = yFromTop(rowTop, rowHeight);
      const textY = rowY + rowHeight / 2 - 2.2;

      drawTextInCell(String(index + 1).padStart(2, "0"), colX.no + 8, textY, 4, { size: fontSize, bold: false });
      drawTextInCell(entry.trainId || "-", colX.train, textY, 8, { size: fontSize, bold: true, align: "center", width: colWidths.train });
      drawTextInCell(entry.tid || "-", colX.tid + 8, textY, 6, { size: fontSize, bold: false });
      drawTextInCell(entry.time ? `${entry.time} hrs` : "-", colX.time + 8, textY, 11, { size: fontSize, bold: false });
      drawRemarkPills(entry, colX.remark, rowY, colWidths.remark, rowHeight, textY);
    });

    // Draw all horizontal row lines clearly across every column.
    for (let i = 0; i <= Math.max(rows.length, 1); i += 1) {
      const rowLineY = yFromTop(tableTop + headerHeight + i * rowHeight);
      ops += line(x, rowLineY, x + tableWidth, rowLineY, 0.38);
    }

    // Draw vertical table lines so the table remains clean.
    [x, colX.train, colX.tid, colX.time, colX.remark, x + tableWidth].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });
    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });
  };

  drawColumn(westLog, marginX, "west");
  drawColumn(eastLog, marginX + columnWidth + gutter, "east");

  ops += pdfText("Generated by TrainLog", marginX, 18, {
    size: 6.5,
    color: "#000000",
  });

  const pdf = buildPdfDocument([ops], pageSize);
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadClientBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadRemovalPdf(log = {}) {
  const depotName = (log.depotLabel || log.depot || "depot").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "depot";
  const dateStamp = new Date().toISOString().slice(0, 10);
  const blob = buildRemovalPdfBlob(log);
  downloadClientBlob(blob, `${depotName}-removal-${dateStamp}.pdf`);
}


function downloadCombinedRemovalPdf(westLog = {}, eastLog = {}) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const blob = buildCombinedRemovalPdfBlob(westLog, eastLog);
  downloadClientBlob(blob, `west-east-depot-removal-${dateStamp}.pdf`);
}

function RemovalDepotLogCard({ log, combinedLogs = null }) {
  const [copied, setCopied] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const hasEntries = log.entries.length > 0;

  const handleDownloadPdf = () => {
    if (pdfReady) return;
    const westLog = combinedLogs?.westLog;
    const eastLog = combinedLogs?.eastLog;
    const hasCombinedEntries = Boolean(
      (westLog?.entries?.length || 0) > 0 || (eastLog?.entries?.length || 0) > 0
    );
    if (!hasCombinedEntries && !hasEntries) return;

    setPdfReady(true);

    try {
      if (westLog && eastLog) {
        downloadCombinedRemovalPdf(westLog, eastLog);
      } else {
        downloadRemovalPdf(log);
      }
    } catch (error) {
      console.error("Removal PDF export failed:", error);
      alert("Unable to create removal PDF. Please try again.");
    } finally {
      setTimeout(() => setPdfReady(false), 500);
    }
  };

  const handleCopy = async () => {
    if (!hasEntries || !log.text) return;

    const ok = await copyTextToClipboard(log.text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="rounded-lg border border-[#1a3a56] bg-[#061827] overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 px-3 py-1.5"
        style={{ background: "linear-gradient(90deg,#0d4d75 0%,#0b5f88 55%,#0d4d75 100%)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: log.dotColor, boxShadow: `0 0 10px ${log.dotColor}` }}
          />
          <div className="text-[10px] font-black text-white uppercase tracking-widest truncate">
            {log.title}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfReady || (!(combinedLogs?.westLog?.entries?.length || combinedLogs?.eastLog?.entries?.length) && !hasEntries)}
            className="inline-flex h-5 items-center gap-1 rounded-md border px-2 text-[9px] font-normal transition-all hover:-translate-y-0.5 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              background: pdfReady ? "rgba(34,197,94,0.18)" : "rgba(6,212,232,0.12)",
              borderColor: pdfReady ? "rgba(34,197,94,0.45)" : "rgba(34,211,238,0.45)",
              color: pdfReady ? "#86efac" : "#b6f3ff",
              boxShadow: pdfReady ? "0 0 12px rgba(34,197,94,0.16)" : "0 0 12px rgba(34,211,238,0.16)",
            }}
            title="Download one-page PDF: West Depot left, East Depot right"
          >
            <FileText size={10} />
            {pdfReady ? "Done" : "Download PDF"}
          </button>

          <button
            onClick={handleCopy}
            disabled={!hasEntries}
            className="h-5 px-2 rounded-md border text-[9px] font-normal transition-all disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              background: copied ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.08)",
              borderColor: copied ? "rgba(34,197,94,0.45)" : "rgba(126,184,224,0.28)",
              color: copied ? "#86efac" : "#9fb7d1",
            }}
          >
            {copied ? "Copied" : log.copyLabel}
          </button>
        </div>
      </div>

      <div className="min-h-[76px] rounded-b-lg border-t border-[#1a3a56] bg-[#061321] px-3 py-2">
        {hasEntries ? (
          <pre className="whitespace-pre-wrap break-words text-[10px] leading-[1.35] font-normal text-[#d8e7f7]">
            {log.text}
          </pre>
        ) : (
          <div className="min-h-[56px] flex flex-col items-center justify-center gap-1.5 text-[#315d82]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div className="text-[10px] font-normal">{log.noEntryText}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function RemovalLogOutputFromTrainRem({ trainRemState, maintenanceMap = {} }) {
  const westLog = buildTrainRemRemovalLog(trainRemState, "west", maintenanceMap);
  const eastLog = buildTrainRemRemovalLog(trainRemState, "east", maintenanceMap);

  return (
    <section
      className="w-full rounded-xl border border-[#2b4f6b] bg-[#0b1f33] shadow-md px-3 py-3"
      style={{
        background: "linear-gradient(135deg,rgba(12,46,74,0.58) 0%,rgba(7,24,40,0.98) 100%)",
        boxShadow: "0 16px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#10263b] border border-[#2b4f6b] shadow-sm flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="14" y2="17" />
          </svg>
        </div>
        <h2 className="text-sm leading-none font-black text-white tracking-widest uppercase">
          Removal Log Output
        </h2>
        <div className="text-[10px] font-normal text-[#58a6ff]">
          Auto-generated from Train Rem
        </div>
      </div>

      <div className="space-y-2">
        <RemovalDepotLogCard log={westLog} combinedLogs={{ westLog, eastLog }} />
        <RemovalDepotLogCard log={eastLog} combinedLogs={{ westLog, eastLog }} />
      </div>
    </section>
  );
}



const MAIN_STABLING_BUTTON_COMMON = {
  minHeight: 34,
  borderRadius: 14,
  letterSpacing: "0.01em",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const MAIN_STABLING_BUTTON_BLUE = {
  ...MAIN_STABLING_BUTTON_COMMON,
  background: "linear-gradient(135deg, rgba(9,42,76,0.94) 0%, rgba(10,65,122,0.88) 48%, rgba(7,26,46,0.96) 100%)",
  borderColor: "rgba(70,160,255,0.92)",
  color: "#dff0ff",
  boxShadow: "0 0 0 1px rgba(50,150,255,0.20), 0 0 16px rgba(37,99,235,0.42), 0 0 28px rgba(14,165,233,0.24), inset 0 1px 0 rgba(255,255,255,0.16)",
  textShadow: "0 0 8px rgba(191,219,254,0.55)",
};

const MAIN_STABLING_BUTTON_PRIMARY = {
  ...MAIN_STABLING_BUTTON_COMMON,
  background: "linear-gradient(135deg, #0f63ff 0%, #1d8bff 52%, #0757df 100%)",
  borderColor: "rgba(148,202,255,0.98)",
  color: "#ffffff",
  boxShadow: "0 0 0 1px rgba(147,197,253,0.34), 0 0 18px rgba(37,99,235,0.72), 0 0 34px rgba(14,165,233,0.46), inset 0 1px 0 rgba(255,255,255,0.24)",
  textShadow: "0 0 10px rgba(255,255,255,0.52)",
};

const MAIN_STABLING_BUTTON_SUCCESS = {
  ...MAIN_STABLING_BUTTON_COMMON,
  background: "linear-gradient(135deg, #059669 0%, #16a34a 55%, #047857 100%)",
  borderColor: "rgba(134,239,172,0.95)",
  color: "#ffffff",
  boxShadow: "0 0 0 1px rgba(74,222,128,0.28), 0 0 18px rgba(34,197,94,0.58), 0 0 30px rgba(16,185,129,0.32), inset 0 1px 0 rgba(255,255,255,0.20)",
  textShadow: "0 0 8px rgba(220,252,231,0.50)",
};

const MAIN_STABLING_BUTTON_DANGER = {
  ...MAIN_STABLING_BUTTON_COMMON,
  background: "linear-gradient(135deg, #991b1b 0%, #dc2626 55%, #7f1d1d 100%)",
  borderColor: "rgba(252,165,165,0.95)",
  color: "#ffffff",
  boxShadow: "0 0 0 1px rgba(248,113,113,0.32), 0 0 18px rgba(239,68,68,0.62), 0 0 30px rgba(220,38,38,0.36), inset 0 1px 0 rgba(255,255,255,0.18)",
  textShadow: "0 0 8px rgba(254,226,226,0.50)",
};

function ClearAllStablingButton({ onClearAll }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  const handleClick = () => {
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      onClearAll();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 5000);
    }
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <button
      onClick={handleClick}
      className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
      style={confirming ? MAIN_STABLING_BUTTON_DANGER : MAIN_STABLING_BUTTON_BLUE}
    >
      {!confirming && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      )}
      {confirming ? "Confirm Clear?" : "Clear All"}
    </button>
  );
}

// ── Main Stabling PDF Export (picture-format) ────────────────────────────────
// Generates a real .pdf file with a printable stabling picture.
// Maintenance/request remarks are rendered from the stabling SVG into the PDF.
function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textToUint8(text) {
  return new TextEncoder().encode(text);
}

function concatUint8(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = ZIP_CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function buildStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  files.forEach(({ name, data }) => {
    const nameBytes = textToUint8(name);
    const fileData = data instanceof Uint8Array ? data : textToUint8(data);
    const fileCrc = crc32(fileData);

    const localHeader = concatUint8([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(fileCrc),
      u32(fileData.length),
      u32(fileData.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, fileData);

    const centralHeader = concatUint8([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(fileCrc),
      u32(fileData.length),
      u32(fileData.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + fileData.length;
  });

  const centralDirectory = concatUint8(centralParts);
  const endRecord = concatUint8([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return concatUint8([...localParts, centralDirectory, endRecord]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── PST / Train Prep Excel Export (RL3 format) ───────────────────────────────
// Creates an .xlsx in the same structure as the Line 3 Passenger Service Test file:
// RL3 sheet with TS#301–TS#347 rows and a FORM reference sheet.
const PST_EXCEL_VERSION = "V09-01-02";
const PST_EXCEL_TRAIN_COUNT = 47;

function formatExcelExportDate(date = new Date()) {
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function formatExcelExportTime(timeValue = "") {
  const clean = String(timeValue || "").trim();
  if (!clean) return "";
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return clean;
  return `${match[1].padStart(2, "0")}:${match[2]}H`;
}

function excelColumnName(columnNumber) {
  let n = columnNumber;
  let name = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function excelCellRef(rowNumber, columnNumber) {
  return `${excelColumnName(columnNumber)}${rowNumber}`;
}

function excelInlineCell(value, rowNumber, columnNumber, styleId = 0) {
  const ref = excelCellRef(rowNumber, columnNumber);
  const styleAttr = styleId ? ` s="${styleId}"` : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${styleAttr}/>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(value)}</t></is></c>`;
}

function excelRowXml(values, rowNumber, styleId, height = 15) {
  const cells = values.map((value, index) => excelInlineCell(value, rowNumber, index + 1, styleId)).join("");
  return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
}

function buildExcelWorksheetXml({ rows, rowStyles = [], rowHeights = [], colWidths = [], dimension, merges = [] }) {
  const cols = colWidths.length
    ? `<cols>${colWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const sheetRows = rows
    .map((row, index) => excelRowXml(row, index + 1, rowStyles[index] || 0, rowHeights[index] || 15))
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${cols}
  <sheetData>${sheetRows}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function trainKeyToExcelTrainNumber(trainKey = "") {
  const match = String(trainKey || "").match(/T?(\d{1,2})$/i);
  if (!match) return "";
  return `TS#3${match[1].padStart(2, "0")}`;
}

function trainKeyToNumber(trainKey = "") {
  const match = String(trainKey || "").match(/T?(\d{1,2})$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) && num >= 1 && num <= PST_EXCEL_TRAIN_COUNT ? num : null;
}

function extractPSTLocation(entry = {}) {
  if (entry.road) return entry.road;
  const text = entry.text || "";
  const match = text.match(/PST\s+commenced\s+at\s+([A-Z]{2})[–-]([A-Z0-9]+)/i);
  if (!match) return "";
  return `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
}

function getPSTExcelRemark() {
  // Keep Excel Remarks column empty, even when the PST log says alarm / no alarm reported.
  return "";
}

function getPSTDepotFromEntry(entry = {}) {
  const location = extractPSTLocation(entry);
  if (entry?.depot === "west" || /^WD-/i.test(location)) return "west";
  if (entry?.depot === "east" || /^ED-/i.test(location)) return "east";
  return "";
}

function normalizeCompletedByNames(completedBy = "") {
  if (typeof completedBy === "string") {
    const name = completedBy.trim();
    return { west: name, east: name };
  }

  return {
    west: (completedBy?.west || "").toString().trim(),
    east: (completedBy?.east || "").toString().trim(),
  };
}

function getCompletedByForPSTEntry(entry = {}, completedBy = "") {
  const names = normalizeCompletedByNames(completedBy);
  const depot = getPSTDepotFromEntry(entry);

  if (depot === "west") return names.west;
  if (depot === "east") return names.east;
  return names.west || names.east;
}

function buildPSTExportRows(logLines = [], completedBy = "") {
  const todayText = formatExcelExportDate(new Date());
  const pstLogs = (logLines || []).filter((entry) => entry?.type === "PST");
  const latestByTrain = new Map();

  pstLogs.forEach((entry) => {
    const trainNo = trainKeyToNumber(entry.trainKey);
    if (!trainNo) return;
    latestByTrain.set(trainNo, entry);
  });

  const completedEntries = pstLogs.filter((entry) => trainKeyToNumber(entry.trainKey));
  const westCount = completedEntries.filter((entry) => getPSTDepotFromEntry(entry) === "west").length;
  const eastCount = completedEntries.filter((entry) => getPSTDepotFromEntry(entry) === "east").length;

  const rows = [
    ["Date", "Version Sheet", "TRAIN Number", "Start Time", "Location", "Passenger Service Test", "Awake Status", "Completion Time", "Completed by", "Remarks"],
    ["", "", "", "", "", "", "", "", "", ""],
  ];

  for (let trainNo = 1; trainNo <= PST_EXCEL_TRAIN_COUNT; trainNo += 1) {
    const entry = latestByTrain.get(trainNo);
    rows.push([
      todayText,
      PST_EXCEL_VERSION,
      `TS#3${String(trainNo).padStart(2, "0")}`,
      entry ? formatExcelExportTime(entry.startTime) : "",
      entry ? extractPSTLocation(entry) : "",
      entry ? "PASS" : "",
      entry ? "Completely Awake" : "",
      entry ? formatExcelExportTime(entry.endTime) : "",
      entry ? getCompletedByForPSTEntry(entry, completedBy) : "",
      entry ? getPSTExcelRemark(entry) : "",
    ]);
  }

  rows.push([
    `Total PST completed PASS is ${completedEntries.length}. (West Depot ${westCount} and East Depot ${eastCount})`,
    "", "", "", "", "", "", "", "", "",
  ]);

  return rows;
}

function buildPSTFormRows() {
  const rows = Array.from({ length: 50 }, () => ["", "", "", "", "", ""]);
  rows[1] = ["", "TRAIN", "Location", "Status", "Passenger Service Test", "Version Sheet"];
  rows[2] = ["", "N/A", "WD-ST12", "Completely Awake ", "PASS", ""];
  rows[3] = ["", "TS#301", "WD-ST13", "Failed - Return to Park", "FAIL", "V07-01-02"];
  rows[4] = ["", "TS#302", "WD-ST14", "", "", ""];
  rows[5] = ["", "TS#303", "WD-ST15", "", "", ""];
  rows[6] = ["", "TS#304", "WD-TT1", "", "", ""];
  rows[7] = ["", "TS#305", "WD-TT2", "", "", ""];
  rows[8] = ["", "TS#306", "ED-ST02", "", "", ""];
  rows[9] = ["", "TS#307", "ED-ST03", "", "", ""];
  rows[10] = ["", "TS#308", "ED-Transfer Track 1", "", "", ""];
  rows[11] = ["", "TS#309", "ED-Transfer Track 2", "", "", ""];
  rows[12] = ["", "TS#310", "WD-Temp1", "", "", ""];
  rows[13] = ["", "TS#311", "WD-Temp2", "", "", ""];
  for (let trainNo = 12; trainNo <= PST_EXCEL_TRAIN_COUNT; trainNo += 1) {
    const rowIndex = trainNo + 2;
    rows[rowIndex] = ["", `TS#3${String(trainNo).padStart(2, "0")}`, "", "", "", ""];
  }
  return rows;
}

function buildPSTExcelWorkbook(logLines = [], completedBy = "") {
  const rl3Rows = buildPSTExportRows(logLines, completedBy);
  const formRows = buildPSTFormRows();

  const rl3RowStyles = rl3Rows.map((_, index) => {
    if (index === 0) return 1;      // black header
    if (index === 1) return 2;      // orange separator
    if (index === rl3Rows.length - 1) return 4; // total row
    return 3;                       // body
  });
  const formRowStyles = formRows.map((_, index) => index === 1 ? 1 : 3);

  const rl3Xml = buildExcelWorksheetXml({
    rows: rl3Rows,
    rowStyles: rl3RowStyles,
    rowHeights: rl3Rows.map((_, index) => index === 0 ? 16 : 15),
    colWidths: [13, 16, 13, 14, 14, 22, 18, 16, 17, 38],
    dimension: "A1:J50",
    merges: ["A50:J50"],
  });

  const formXml = buildExcelWorksheetXml({
    rows: formRows,
    rowStyles: formRowStyles,
    rowHeights: formRows.map((_, index) => index === 1 ? 18 : 15),
    colWidths: [4, 13, 22, 22, 22, 15],
    dimension: "A1:F50",
  });

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="RL3" sheetId="1" r:id="rId1"/>
    <sheet name="FORM" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="10"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFF9900"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF333333"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  return buildStoredZip([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: packageRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/worksheets/sheet1.xml", data: rl3Xml },
    { name: "xl/worksheets/sheet2.xml", data: formXml },
    { name: "xl/styles.xml", data: stylesXml },
  ]);
}

function downloadPSTExcelExport(logLines = [], completedBy = "") {
  const xlsxBytes = buildPSTExcelWorkbook(logLines, completedBy);
  const blob = new Blob([xlsxBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `Line-3-Passenger-Service-Test-${dateStamp}.xlsx`);
}

function sectionToPrintableSvg({
  title,
  blockLabels,
  blockIndices,
  roads,
  data,
  labelSide,
  maintenanceMap,
  cellPillsBuilder,
  roadPillBuilder,
  includeMaintenancePills = true,
}) {
  const width = 1600;
  const margin = 44;
  const tableLeft = 78;
  const tableTop = 160;
  const tableWidth = 1467;
  const headerHeight = 50;
  const rowHeight = 120;
  const roadWidth = 120;
  const blockWidth = (tableWidth - roadWidth) / 7;
  const tableHeight = headerHeight + rowHeight * roads.length;
  const height = tableTop + tableHeight + 72;
  const right = tableLeft + tableWidth;
  const bottom = tableTop + tableHeight;
  const roadX = labelSide === "left" ? tableLeft : tableLeft + blockWidth * 7;
  const blocksStartX = labelSide === "left" ? tableLeft + roadWidth : tableLeft;
  const blockDrawWidth = labelSide === "left" ? (tableWidth - roadWidth) / 7 : blockWidth;
  const dividerXs = [];

  for (let i = 1; i < 7; i += 1) {
    dividerXs.push(blocksStartX + blockDrawWidth * i);
  }
  dividerXs.push(labelSide === "left" ? tableLeft + roadWidth : tableLeft + blockWidth * 7);

  const parts = [];
  const add = (line) => parts.push(line);

  const centerText = (text, x1, y1, x2, y2, size = 16, weight = 700, extra = "", fill = "#000") => {
    add(`<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${xmlEscape(text)}</text>`);
  };

  const rect = (x, y, w, h, options = {}) => {
    const { rx = 0, fill = "#fff", stroke = "#000", strokeWidth = 1, dash = "" } = options;
    add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`);
  };

  add(`<?xml version="1.0" encoding="UTF-8"?>`);
  add(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  add(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  rect(margin, margin, width - margin * 2, height - margin * 2, { rx: 22, strokeWidth: 2 });
  add(`<text x="78" y="108" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800" fill="#000" letter-spacing="0.5">${xmlEscape(title)}</text>`);

  // Rounded outer table border.
  rect(tableLeft, tableTop, tableWidth, tableHeight, { rx: 18, strokeWidth: 2 });

  // Internal table lines only, so the outer table corners remain rounded.
  add(`<line x1="${tableLeft}" y1="${tableTop + headerHeight}" x2="${right}" y2="${tableTop + headerHeight}" stroke="#000" stroke-width="1"/>`);
  for (let r = 1; r < roads.length; r += 1) {
    const y = tableTop + headerHeight + rowHeight * r;
    add(`<line x1="${tableLeft}" y1="${y}" x2="${right}" y2="${y}" stroke="#000" stroke-width="1"/>`);
  }
  dividerXs.forEach((x) => add(`<line x1="${x}" y1="${tableTop}" x2="${x}" y2="${bottom}" stroke="#000" stroke-width="1"/>`));

  blockLabels.forEach((label, i) => {
    const x1 = blocksStartX + blockDrawWidth * i;
    centerText(label, x1, tableTop, x1 + blockDrawWidth, tableTop + headerHeight, 17, 800);
  });

  roads.forEach((road, ri) => {
    const y1 = tableTop + headerHeight + rowHeight * ri;
    const y2 = y1 + rowHeight;
    const roadPillText = typeof roadPillBuilder === "function" ? roadPillBuilder({ road, ri }) : "";

    if (roadPillText) {
      const cy = (y1 + y2) / 2;
      centerText(road, roadX, y1 + 18, roadX + roadWidth, cy - 2, 17, 800);
      rect(roadX + 31, cy + 8, roadWidth - 62, 24, { rx: 12, fill: "#ffffff", stroke: "#f59e0b", strokeWidth: 3 });
      centerText(roadPillText, roadX + 31, cy + 8, roadX + roadWidth - 31, cy + 32, 14, 800, "", "#000");
    } else {
      centerText(road, roadX, y1, roadX + roadWidth, y2, 18, 800);
    }

    blockIndices.forEach((bi, i) => {
      const block = data?.[road]?.[bi] || {};
      const rawTrain = (block.trainId || "").toString().trim();
      const key = normalizeTrainId(rawTrain);
      const displayTrain = key ? key.replace(/^T/, "").padStart(2, "0") : "";
      const maintList = includeMaintenancePills && key ? maintenanceMap?.[key] || [] : [];
      const insertionPills = typeof cellPillsBuilder === "function" ? cellPillsBuilder({ block, road, bi, key, displayTrain }) : [];
      const pillItems = [
        ...(Array.isArray(insertionPills) ? insertionPills : []),
        ...maintList.map((item) => ({
          label: item.badgeText || item.remark || item.displayType || item.typeKey || "Remark",
          // Use the same colour identity as the main stabling / maintenance request pill.
          // Example: WASH = light blue, RST PM = light green, RST CM = orange,
          // Deep Cleaning = purple, INBOUND = yellow, Other = grey.
          fill: item.badgeBg || "#fff176",
          stroke: item.badgeBorder || item.trainColor || "#000",
          textFill: item.badgeColor || "#000",
        })),
      ];
      const x1 = blocksStartX + blockDrawWidth * i;
      const innerPadX = 14;
      const innerPadY = 12;
      const bx = x1 + innerPadX;
      const by = y1 + innerPadY;
      const bw = blockDrawWidth - innerPadX * 2;
      const bh = rowHeight - innerPadY * 2;

      if (!displayTrain) {
        rect(bx, by, bw, bh, { rx: 0, strokeWidth: 1, dash: "16 16" });
        centerText("—", bx, by, bx + bw, by + bh, 32, 800);
        return;
      }

      rect(bx, by, bw, bh, { rx: 16, strokeWidth: 1 });

      if (pillItems.length > 0) {
        const visiblePills = pillItems.slice(0, 3);
        const visibleCount = visiblePills.length;
        const pillGap = visibleCount >= 3 ? 2 : 4;
        const pillHeight = visibleCount >= 3 ? 17 : visibleCount > 1 ? 20 : 24;
        const pillFontSize = visibleCount >= 3 ? 10.5 : visibleCount > 1 ? 12 : 13;
        const trainFontSize = visibleCount >= 3 ? 23 : visibleCount > 1 ? 27 : 31;
        const bottomPadding = visibleCount >= 3 ? 8 : 12;
        const totalPillHeight = visibleCount * pillHeight + Math.max(0, visibleCount - 1) * pillGap;
        let pillY = by + bh - bottomPadding - totalPillHeight;

        // Keep the train number above the remark pills so multiple remarks do not overlap.
        centerText(displayTrain, bx, by + 4, bx + bw, Math.max(by + 24, pillY - 6), trainFontSize, 800);

        visiblePills.forEach((item) => {
          const label = item.label || "Remark";
          const safeLabel = label.length > 24 ? `${label.slice(0, 22)}…` : label;
          const pillWidth = Math.min(bw - 20, Math.max(96, safeLabel.length * 7 + 32));
          const pillX = bx + (bw - pillWidth) / 2;
          rect(pillX, pillY, pillWidth, pillHeight, {
            rx: 9,
            fill: item.fill || "#fff176",
            stroke: item.stroke || "#000",
            strokeWidth: 1,
          });
          centerText(safeLabel, pillX, pillY, pillX + pillWidth, pillY + pillHeight, pillFontSize, 800, "", item.textFill || "#000");
          pillY += pillHeight + pillGap;
        });
      } else {
        centerText(displayTrain, bx, by, bx + bw, by + bh, 31, 800);
      }
    });
  });

  add(`</svg>`);
  return parts.join("");
}

function svgToPngBytes(svg, width, height) {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Unable to create PNG image."));
            return;
          }
          resolve(new Uint8Array(await blob.arrayBuffer()));
        }, "image/png");
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to render stabling image."));
    };

    img.src = url;
  });
}

function svgToJpegBytes(svg, width, height, quality = 0.95) {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Unable to create PDF image."));
            return;
          }
          resolve(new Uint8Array(await blob.arrayBuffer()));
        }, "image/jpeg", quality);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to render stabling image."));
    };

    img.src = url;
  });
}

function buildPicturePdf(jpegBytes, imageWidthPx, imageHeightPx) {
  // Landscape letter size, matching the previous Word landscape export.
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 18;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const imageRatio = imageHeightPx / imageWidthPx;
  let drawWidth = maxWidth;
  let drawHeight = drawWidth * imageRatio;

  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
    drawWidth = drawHeight / imageRatio;
  }

  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const contentStream = `q
${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm
/Im0 Do
Q
`;
  const objects = [
    textToUint8("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    textToUint8("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    textToUint8(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`),
    concatUint8([
      textToUint8(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidthPx} /Height ${imageHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
      jpegBytes,
      textToUint8("\nendstream\nendobj\n"),
    ]),
    textToUint8(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`),
  ];

  const header = textToUint8("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  const parts = [header];
  const offsets = [0];
  let currentOffset = header.length;

  objects.forEach((objectBytes) => {
    offsets.push(currentOffset);
    parts.push(objectBytes);
    currentOffset += objectBytes.length;
  });

  const xrefOffset = currentOffset;
  const xrefRows = offsets
    .map((offset, index) => index === 0
      ? "0000000000 65535 f "
      : `${String(offset).padStart(10, "0")} 00000 n `)
    .join("\n");
  const trailer = `xref\n0 ${objects.length + 1}\n${xrefRows}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return concatUint8([...parts, textToUint8(trailer)]);
}

async function downloadStablingPicturePdf({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap }) {
  const svg = sectionToPrintableSvg({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap });
  const sizeMatch = svg.match(/width="(\d+)" height="(\d+)"/);
  const imageWidth = sizeMatch ? Number(sizeMatch[1]) : 1600;
  const imageHeight = sizeMatch ? Number(sizeMatch[2]) : 520;
  const jpegBytes = await svgToJpegBytes(svg, imageWidth, imageHeight);
  const pdfBytes = buildPicturePdf(jpegBytes, imageWidth, imageHeight);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "depot-stabling";
  downloadBlob(blob, `${safeName}-print.pdf`);
}

function getInsertionPrintDepotFromRoad(road = "") {
  return String(road || "").toUpperCase().startsWith("WD-") ? "west" : "east";
}

function getInsertionPrintPillStyle(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "3K1") {
    return { fill: "#bff7f0", stroke: "#0f9f8f", textFill: "#003f39" };
  }
  if (key === "SW" || key.startsWith("SW ") || key === "2W" || key.startsWith("2W ")) {
    return { fill: "#dfc6ff", stroke: "#8b5cf6", textFill: "#3b1163" };
  }
  return { fill: "#fff176", stroke: "#000", textFill: "#000" };
}

function buildInsertionPrintPillItems({ road, bi, block, tidInputs = {}, insertionLog = [], getTidScheduledTime }) {
  const cellKey = `${road}-${bi}`;
  const logEntry = insertionLog.find((entry) => entry.key === `ins-${cellKey}`);
  const liveInput = (tidInputs[cellKey] || "").toString().trim();
  // Only print insertion-specific remarks/TIDs.
  // Do not read block.extraRemark here because main stabling remarks can contain
  // old numeric values; those numbers were being mistaken as TID entries in PNG export.
  const storedRemark = (
    logEntry?.isSweeping && logEntry?.remark
      ? `${logEntry.remark}${logEntry.sweepTrack ? ` ${logEntry.sweepTrack}` : ""}`
      : (logEntry?.remark || "")
  ).toString().trim();

  const buildTidAndTimePills = (tid, time = "") => {
    const pills = [{
      label: `TID ${tid}`,
      ...getInsertionPrintPillStyle("TID"),
    }];

    if (time) {
      pills.push({
        label: time,
        ...getInsertionPrintPillStyle("TID"),
      });
    }

    return pills;
  };

  if (logEntry?.tid !== null && logEntry?.tid !== undefined) {
    const tid = Number(logEntry.tid);
    const depot = getInsertionPrintDepotFromRoad(road);
    const time = logEntry.time || getTidScheduledTime?.(tid, depot) || "";
    return buildTidAndTimePills(tid, time);
  }

  const rawValue = liveInput || storedRemark;
  if (!rawValue) return [];

  const tidMatch = rawValue.match(/^(?:tid[:\s-]*)?t?(\d{1,3})$/i);
  if (tidMatch) {
    const tid = Number(tidMatch[1]);
    const depot = getInsertionPrintDepotFromRoad(road);
    const time = getTidScheduledTime?.(tid, depot) || "";
    return buildTidAndTimePills(tid, time);
  }

  const remark = rawValue.toUpperCase();
  return [{
    label: remark,
    ...getInsertionPrintPillStyle(remark),
  }];
}

async function downloadInsertionPicturePng({ title, blockLabels, blockIndices, roads, data, labelSide, insertionLog, tidInputs, getTidScheduledTime }) {
  const printableTitle = `${String(title || "Depot").replace(/\s+INSERTION$/i, "").trim()} STABLING`;
  const svg = sectionToPrintableSvg({
    title: printableTitle,
    blockLabels,
    blockIndices,
    roads,
    data,
    labelSide,
    maintenanceMap: {},
    includeMaintenancePills: false,
    roadPillBuilder: ({ road }) => INSERTION_ROAD_PILLS[road] || "",
    cellPillsBuilder: ({ road, bi, block }) => buildInsertionPrintPillItems({
      road,
      bi,
      block,
      tidInputs,
      insertionLog,
      getTidScheduledTime,
    }),
  });
  const sizeMatch = svg.match(/width="(\d+)" height="(\d+)"/);
  const imageWidth = sizeMatch ? Number(sizeMatch[1]) : 1600;
  const imageHeight = sizeMatch ? Number(sizeMatch[2]) : 520;
  const pngBytes = await svgToPngBytes(svg, imageWidth, imageHeight);
  const blob = new Blob([pngBytes], { type: "image/png" });
  const safeName = printableTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "depot-stabling";
  downloadBlob(blob, `${safeName}-insertion-print.png`);
}

function StablingSection({
  depot,
  title,
  blockLabels,
  blockIndices,
  roads,
  data,
  labelSide,
  duplicates,
  maintenanceMap,
  cellRefs,
  flashingCells,
  onCellKeyDown,
  onUpdate,
  onCommit,
  onEditStart,
  onEditEnd,
  onClearAll,
  allDepots = [],
}) {
  const [sectionSearch, setSectionSearch] = useState("");
  const searchQuery = sectionSearch.trim().toUpperCase().replace(/\s+/g, "");
  const normalizedSearch = searchQuery ? normalizeTrainId(searchQuery) : "";
  const [copiedStabling, setCopiedStabling] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);

    try {
      await downloadStablingPicturePdf({
        title,
        blockLabels,
        blockIndices,
        roads,
        data,
        labelSide,
        maintenanceMap,
      });
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Unable to create PDF export. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCopyStabling = () => {
    const lines = roads.map((road) => {
      const blocks = data[road] || [];
      const trains = blockIndices
        .map((bi) => {
          const val = (blocks[bi]?.trainId || "").trim();
          return val ? padTrainId(normalizeTrainId(val)) : null;
        })
        .filter(Boolean);
      if (trains.length === 0) return null;
      const roadNum = road.replace(/^[A-Z]+-ST0?/, "");
      const label = `STABLING ${roadNum.padStart(2, "0")}`;
      return labelSide === "left"
        ? `${label}: ${trains.join(", ")}`
        : `${trains.join(", ")} : ${label}`;
    }).filter(Boolean);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedStabling(true);
    setTimeout(() => setCopiedStabling(false), 2000);
  };

  // ── Cross-depot location lookup ────────────────────────────────────────────
  const locationResults = (() => {
    if (!normalizedSearch || allDepots.length === 0) return [];
    const results = [];
    allDepots.forEach(({ depotLabel, roads: dRoads, data: dData, blockLabels: dBlockLabels, blockIndices: dBlockIndices }) => {
      dRoads.forEach((road) => {
        const blocks = dData[road] || [];
        dBlockIndices.forEach((bi, vi) => {
          const val = blocks[bi]?.trainId || "";
          const key = normalizeTrainId(val);
          if (key && key === normalizedSearch) {
            results.push({ depotLabel, road, blockLabel: dBlockLabels[vi] });
          }
        });
      });
    });
    return results;
  })();

  const searched = normalizedSearch.length > 0;
  const found = locationResults.length > 0;
  const notFound = searched && !found;

  return (
    <section className="bg-[#0b1f33] border border-[#2b4f6b] rounded-2xl shadow-md px-5 py-4" style={{ width: "fit-content", maxWidth: "fit-content" }}>
      <SectionTitle
        title={title}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyStabling}
              className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
              style={copiedStabling ? MAIN_STABLING_BUTTON_SUCCESS : MAIN_STABLING_BUTTON_BLUE}
            >
              {copiedStabling ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
              {copiedStabling ? "Copied!" : "Copy Stabling"}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
              style={MAIN_STABLING_BUTTON_BLUE}
              title="Download PDF print version with colour-coded remark pills"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {downloadingPdf ? "Preparing..." : "Download PDF"}
            </button>
            {onClearAll && <ClearAllStablingButton onClearAll={onClearAll} />}
          </div>
        }
      />

      {/* Search Box */}
      <div className="mb-3" style={{ width: 912 }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
          style={{
            background: "#071828",
            border: found ? "1.5px solid #facc15" : notFound ? "1.5px solid #ef4444" : sectionSearch ? "1.5px solid #4f8ef7" : "1.5px dashed #1b3a55",
            boxShadow: found ? "0 0 0 2px rgba(250,204,21,0.10)" : notFound ? "0 0 0 2px rgba(239,68,68,0.10)" : sectionSearch ? "0 0 0 2px rgba(79,142,247,0.12)" : undefined,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={found ? "#facc15" : notFound ? "#ef4444" : sectionSearch ? "#4f8ef7" : "#2a4a64"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={sectionSearch}
            onChange={(e) => setSectionSearch(e.target.value)}
            placeholder="Search train ID across both depots…"
            className="flex-1 bg-transparent outline-none text-sm font-semibold placeholder:font-normal"
            style={{
              color: found ? "#fde68a" : notFound ? "#fca5a5" : sectionSearch ? "#e2eaf4" : undefined,
              caretColor: "#4f8ef7",
              letterSpacing: sectionSearch ? "0.06em" : undefined,
            }}
          />
          {sectionSearch && (
            <button
              onClick={() => setSectionSearch("")}
              className="flex items-center justify-center rounded-full w-4 h-4 transition-all hover:bg-[#1a3a56]"
              style={{ color: "#4a8ab5" }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Location result pills */}
        {searched && (
          <div className="flex flex-wrap items-center gap-2 mt-2 min-h-[22px]">
            {found ? locationResults.map((r, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "linear-gradient(135deg,#1a2e10,#0f1f08)", border: "1px solid #4d7c0f" }}>
                {/* pin icon */}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a3e635" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span className="text-[11px] font-bold tracking-wide" style={{ color: "#a3e635" }}>{normalizedSearch}</span>
                <span className="text-[10px] font-bold" style={{ color: "#6a9a20" }}>is at</span>
                <span className="text-[11px] font-bold" style={{ color: "#d9f99d" }}>{r.depotLabel}</span>
                <span className="text-[9px]" style={{ color: "#4d7c0f" }}>›</span>
                <span className="text-[11px] font-bold" style={{ color: "#bef264" }}>{r.road}</span>
                <span className="text-[9px]" style={{ color: "#4d7c0f" }}>›</span>
                <span className="text-[11px] font-bold" style={{ color: "#bef264" }}>{r.blockLabel}</span>
              </div>
            )) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(127,29,29,0.35)", border: "1px solid #7f1d1d" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span className="text-[11px] font-bold" style={{ color: "#f87171" }}>{normalizedSearch} not found in either depot</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl">
        <table className="border-separate border-spacing-0 table-fixed text-xs" style={{ minWidth: 912, maxWidth: 912, width: 912 }}>
          <thead>
            <tr>
              {labelSide === "left" && <EmptyCornerCell />}

              {blockLabels.map((label, i) => {
                const isLastBlock = i === blockLabels.length - 1;
                return (
                  <th
                    key={label}
                    className="h-8 text-center text-[9px] font-black tracking-widest uppercase"
                    style={{
                      width: 120,
                      minWidth: 120,
                      maxWidth: 120,
                      background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)",
                      color: "#4a8ab5",
                      borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                      borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined,
                      borderBottom: "2px solid #1a3a56",
                      borderTopLeftRadius: labelSide === "left" && i === 0 ? 12 : undefined,
                      borderTopRightRadius: labelSide === "right" && isLastBlock ? 12 : undefined,
                    }}
                  >
                    {label}
                  </th>
                );
              })}

              {labelSide === "right" && <EmptyCornerCell />}
            </tr>
          </thead>

          <tbody>
            {roads.map((road, ri) => (
              <RoadRow
                key={road}
                depot={depot}
                roadIndex={ri}
                totalRows={roads.length}
                label={road}
                labelSide={labelSide}
                blocks={data[road]}
                blockIndices={blockIndices}
                duplicates={duplicates}
                maintenanceMap={maintenanceMap}
                cellRefs={cellRefs}
                flashingCells={flashingCells}
                onCellKeyDown={onCellKeyDown}
                onUpdate={(bi, val) => onUpdate(road, bi, val)}
                onCommit={(bi, val) => onCommit(road, bi, val)}
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
                isFirst={ri === 0}
                isLast={ri === roads.length - 1}
                searchHighlight={normalizedSearch}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function SectionTitle({ title, small = false, action = null }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-8 h-8 rounded-full bg-[#10263b] border border-[#2b4f6b] shadow-sm flex items-center justify-center flex-shrink-0">
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4f8ef7"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>

      <h2
        className={`leading-none font-black text-white tracking-widest uppercase flex-1 ${
          small ? "text-sm" : "text-base"
        }`}
      >
        {title}
      </h2>

      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

function EmptyCornerCell() {
  return (
    <th
      className="w-[72px]"
      style={{
        background: "transparent",
        border: "none",
      }}
    />
  );
}

function RoadRow({
  depot,
  roadIndex,
  totalRows,
  label,
  labelSide,
  blocks,
  blockIndices,
  duplicates,
  maintenanceMap,
  cellRefs,
  flashingCells,
  onCellKeyDown,
  onUpdate,
  onCommit,
  onEditStart,
  onEditEnd,
  isFirst,
  isLast,
  searchHighlight = "",
}) {
  const rowLine = isLast ? "1px solid #1a3a56" : "2px solid #1a3a56";

  const labelCell = (
    <RoadLabelCell
      label={label}
      labelSide={labelSide}
      isFirst={isFirst}
      isLast={isLast}
      rowLine={rowLine}
    />
  );

  return (
    <tr>
      {labelSide === "left" && labelCell}

      {blockIndices.map((bi, i) => {
        const val = blocks[bi]?.trainId || "";
        const key = normalizeTrainId(val);
        const maintList = key ? maintenanceMap[key] || [] : [];
        const primaryMaint = maintList[0] || null;
        const isDup = key && duplicates.has(key);
        const cellFlashKey = `${depot}-${label}-${bi}`;
        const isFlashing = flashingCells && flashingCells.has(cellFlashKey);
        const isSearchMatch = searchHighlight && key && key === searchHighlight;

        const isFirstBlock = i === 0;
        const isLastBlock = i === blockIndices.length - 1;
        const isWestBottomRightCorner =
          labelSide === "left" && isLast && isLastBlock;
        const isEastBottomLeftCorner =
          labelSide === "right" && isLast && isFirstBlock;

        let cellBg = "#10263b";
        let trainColor = "#e2eaf4";
        const requestAccent = primaryMaint ? getRequestAccent(primaryMaint) : "#4f8ef7";

        if (isFlashing) {
          cellBg = "#7f1d1d";
          trainColor = "#ffffff";
        } else if (isDup) {
          cellBg = "#2d0a0a";
          trainColor = "#f87171";
        } else if (primaryMaint) {
          // Keep the request train number/control-card dark like Train REM, but use the request color as accent.
          cellBg = "#071828";
          trainColor = requestAccent;
        }

        // Train card styling
        const cardGrad = isFlashing
          ? "linear-gradient(135deg,#7f1d1d,#5c0f0f)"
          : isDup
          ? "linear-gradient(135deg,#2d0a0a,#1a0505)"
          : key && primaryMaint
          ? getRequestCardGradient(primaryMaint)
          : key
          ? "linear-gradient(135deg,#0f2d4a,#081e32)"
          : "none";
        const cardBorder = isSearchMatch
          ? "2px solid #facc15"
          : isFlashing || isDup
          ? "1.5px solid #ef4444"
          : key && primaryMaint
          ? `1.5px solid ${requestAccent}`
          : key
          ? "1px solid #1e4d72"
          : "1.5px dashed #1b3a55";
        const cardGlow = isSearchMatch
          ? "0 0 0 3px rgba(250,204,21,0.18), 0 2px 8px rgba(0,0,0,0.45)"
          : key && primaryMaint && !isFlashing && !isDup
          ? getRequestGlow(primaryMaint)
          : key && !isFlashing && !isDup
          ? "0 2px 8px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.06)"
          : undefined;

        return (
          <td
            key={bi}
            className="p-1.5 align-middle"
            style={{
              backgroundColor: "#071828",
              borderLeft: "1px solid #1a3a56",
              borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined,
              borderBottom: rowLine,
              borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined,
              borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined,
            }}
          >
            <div
              className="relative flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-150"
              style={{
                minHeight: 64,
                padding: "6px 4px",
                background: cardGrad,
                border: cardBorder,
                boxShadow: cardGlow,
              }}
            >
              {key && !isFlashing && !isDup && (
                <div className="absolute top-1 right-1.5 opacity-25 pointer-events-none">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={trainColor} strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>
                </div>
              )}
              <input
                ref={(el) => { cellRefs.current[`${depot}-${roadIndex}-${i}`] = el; }}
                type="text"
                value={val}
                onChange={(e) => onUpdate(bi, e.target.value)}
                onFocus={() => onEditStart?.()}
                onBlur={(e) => {
                  onCommit(bi, e.target.value);
                  onEditEnd?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onCommit(bi, e.target.value); e.target.blur(); return; }
                  onCellKeyDown(e, depot, roadIndex, i, totalRows, blockIndices.length);
                }}
                placeholder="—"
                className="w-full text-center font-black outline-none bg-transparent leading-none"
                style={{ fontSize: key ? 16 : 13, color: isFlashing ? "#fecaca" : isDup ? "#f87171" : key ? trainColor : "#2a4a64", letterSpacing: key ? "0.05em" : undefined }}
              />
              {isFlashing ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black whitespace-nowrap" style={{ background: "rgba(239,68,68,0.25)", color: "#fca5a5", border: "1px solid #ef4444" }}>DUP!</span>
              ) : isDup ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black whitespace-nowrap" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid #ef4444" }}>DUP</span>
              ) : (
                maintList.map((item) => (
                  <span
                    key={`${key}-${item.displayType}-${item.badgeText || ""}`}
                    className="inline-flex min-w-[92px] w-fit max-w-full items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-normal leading-none whitespace-nowrap text-center"
                    style={getRequestPillStyle(item)}
                    title={item.badgeText || item.displayType}
                  >
                    {item.badgeText || item.displayType}
                  </span>
                ))
              )}
            </div>
          </td>
        );
      })}

      {labelSide === "right" && labelCell}
    </tr>
  );
}


function RoadLabelCell({ label, labelSide, isFirst, isLast, rowLine }) {
  return (
    <td
      className="text-center align-middle font-black text-[11px] tracking-tight uppercase"
      style={{
        background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)",
        color: "#7eb8e0",
        borderTop: isFirst ? "none" : "1px solid rgba(255,255,255,0.06)",
        borderBottom: rowLine,
        borderRight: labelSide === "left" ? "1px solid rgba(126,184,224,0.15)" : "1px solid #1a3a56",
        borderLeft: labelSide === "right" ? "1px solid rgba(126,184,224,0.15)" : undefined,
        whiteSpace: "nowrap",
        width: 72,
        minWidth: 72,
        letterSpacing: "0.05em",
        borderTopLeftRadius: labelSide === "left" && isFirst ? 12 : undefined,
        borderTopRightRadius: labelSide === "right" && isFirst ? 12 : undefined,
        borderBottomLeftRadius: labelSide === "left" && isLast ? 12 : undefined,
        borderBottomRightRadius: labelSide === "right" && isLast ? 12 : undefined,
      }}
    >
      {label}
    </td>
  );
}

function Badge({ text, bg, color = "#000000", border }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap"
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
      }}
    >
      {text}
    </span>
  );
}
