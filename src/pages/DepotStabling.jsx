import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Save, CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X, Bookmark, ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, Trash2, Copy, ClipboardCheck, Shield, Wind, Undo2, Download, Search, ArrowUp, ArrowDown, Check } from "lucide-react";
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


const TIMETABLE_TYPES = [
  { key: "weekday", label: "Weekday", presetLabel: "9am" },
  { key: "friday", label: "Friday", presetLabel: "Fri" },
  { key: "saturday", label: "Saturday", presetLabel: "Sat" },
  { key: "ph", label: "PH", presetLabel: "PH" },
];

const ACTIVE_TIMETABLE_TYPE_KEY = "activeTimetableType_v1";
const LOCAL_TIMETABLE_RECORDS_KEY = "storedTimetableRecords_v1";
const TIMETABLE_PARSE_VERSION = 4;

function normalizeTimetableType(value = "") {
  const clean = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (["fri", "friday"].includes(clean)) return "friday";
  if (["sat", "saturday"].includes(clean)) return "saturday";
  if (["ph", "publicholiday", "holiday"].includes(clean)) return "ph";
  return "weekday";
}

function getTimetableTypeLabel(type = "weekday") {
  return TIMETABLE_TYPES.find((item) => item.key === normalizeTimetableType(type))?.label || "Weekday";
}

function detectTimetableTypeFromFileName(fileName = "", fallbackType = "weekday") {
  const clean = String(fileName || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const compact = clean.replace(/\s+/g, "");

  if (/\bfri(day)?\b/.test(clean) || compact.includes("fullfri")) return "friday";
  if (/\bsat(urday)?\b/.test(clean) || compact.includes("fullsat")) return "saturday";
  if (/\bph\b/.test(clean) || compact.includes("publicholiday") || /\bholiday\b/.test(clean)) return "ph";
  if (/\bweek(day)?\b/.test(clean) || compact.includes("weekday")) return "weekday";

  return normalizeTimetableType(fallbackType);
}

function getDefaultPresetLabelForTimetableType(type = "weekday", currentLabel = "") {
  const normalized = normalizeTimetableType(type);
  if (normalized === "friday") return "Fri";
  if (normalized === "saturday") return "Sat";
  if (normalized === "ph") return "PH";
  return ["9am", "7pm", "12am"].includes(currentLabel) ? currentLabel : "9am";
}

function getValidTrainRemPresetLabelsForTimetableType(type = "weekday") {
  const normalized = normalizeTimetableType(type);
  if (normalized === "friday") return ["Fri"];
  if (normalized === "saturday") return ["Sat"];
  if (normalized === "ph") return ["PH"];
  return ["9am", "7pm", "12am"];
}

function isTrainRemPresetMismatchWithTimetable(type = "weekday", presetLabel = "") {
  const cleanPreset = String(presetLabel || "").trim();
  if (!cleanPreset) return false;
  return !getValidTrainRemPresetLabelsForTimetableType(type).includes(cleanPreset);
}

function getCurrentDayTimetableType(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  if (day === 5) return "friday";
  if (day === 6) return "saturday";
  return "weekday";
}

function loadActiveTimetableType() {
  try {
    const storedType = normalizeTimetableType(localStorage.getItem(ACTIVE_TIMETABLE_TYPE_KEY) || "");
    // PH is a manual override and must stay selected after page refresh.
    // Other timetable types follow the current day whenever the page is reopened/refreshed.
    return storedType === "ph" ? "ph" : getCurrentDayTimetableType();
  } catch {
    return getCurrentDayTimetableType();
  }
}

function saveActiveTimetableType(type) {
  try { localStorage.setItem(ACTIVE_TIMETABLE_TYPE_KEY, normalizeTimetableType(type)); } catch {}
}

function loadLocalTimetableRecords() {
  try {
    const raw = localStorage.getItem(LOCAL_TIMETABLE_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalTimetableRecords(records = []) {
  try { localStorage.setItem(LOCAL_TIMETABLE_RECORDS_KEY, JSON.stringify(records)); } catch {}
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64 = "") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function base64ToBlob(base64 = "", mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  const sliceSize = 1024;
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let index = 0; index < slice.length; index += 1) {
      byteNumbers[index] = slice.charCodeAt(index);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function sanitizeDownloadFileName(fileName = "uploaded_timetable.xlsx") {
  const clean = String(fileName || "uploaded_timetable.xlsx")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "uploaded_timetable.xlsx";
}

function triggerFileDownload(blob, fileName = "uploaded_timetable.xlsx") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeDownloadFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function buildTimetableDownloadWorkbook(activeTimetable = null) {
  const parsed = getActiveTimetableParsedData(activeTimetable);
  const workbook = XLSX.utils.book_new();
  const makeRows = (entries = []) => (Array.isArray(entries) ? entries : []).map((entry) => ({
    TID: entry?.tid || "",
    DID: entry?.did || "",
    Timing: entry?.time || "",
    Remark: entry?.remark || "",
    Preset: entry?.label || "",
    Sheet: entry?.sheetName || "",
  }));
  const sheets = [
    ["Removal West", makeRows(parsed?.removal?.west?.entries)],
    ["Removal East", makeRows(parsed?.removal?.east?.entries)],
    ["Insertion West", makeRows(parsed?.insertion?.west?.entries)],
    ["Insertion East", makeRows(parsed?.insertion?.east?.entries)],
    ["Arrival 3A1P2", makeRows(parsed?.reference?.arrival3A1P2?.entries)],
  ];

  let appended = false;
  sheets.forEach(([name, rows]) => {
    if (!rows.length) return;
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
    appended = true;
  });

  if (!appended) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Timetable", activeTimetable?.fileName || activeTimetable?.sourceFileName || parsed?.sourceFileName || "Uploaded timetable"],
      ["Status", "Original file data is not stored for this older upload."],
    ]), "Timetable");
  }

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function downloadStoredTimetableFile(activeTimetable = null) {
  if (!activeTimetable) return false;
  const fileName = sanitizeDownloadFileName(activeTimetable?.fileName || activeTimetable?.sourceFileName || activeTimetable?.parsedData?.sourceFileName || "uploaded_timetable.xlsx");
  const base64 = activeTimetable?.fileBase64 || activeTimetable?.originalFileBase64 || activeTimetable?.sourceFileBase64 || "";
  if (base64) {
    triggerFileDownload(base64ToBlob(base64, activeTimetable?.fileMimeType), fileName);
    return true;
  }

  const fallbackName = fileName.toLowerCase().endsWith(".xlsx") ? fileName.replace(/\.xlsx$/i, "_parsed.xlsx") : `${fileName}_parsed.xlsx`;
  triggerFileDownload(buildTimetableDownloadWorkbook(activeTimetable), fallbackName);
  return true;
}

function getTimetableEntity() {
  return base44?.entities?.TimetableFile || null;
}

function isTimetableEntityReady(entity = getTimetableEntity()) {
  return Boolean(entity?.list && entity?.create);
}

function normalizeExcelHeader(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeRemarkForMatch(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactRemarkForMatch(value = "") {
  return normalizeRemarkForMatch(value).replace(/\s+/g, "");
}

function remarkHasAll(value = "", tokens = []) {
  const compact = compactRemarkForMatch(value);
  return tokens.every((token) => compact.includes(String(token || "").toUpperCase().replace(/[^A-Z0-9]+/g, "")));
}

function remarkHasAny(value = "", tokens = []) {
  const compact = compactRemarkForMatch(value);
  return tokens.some((token) => compact.includes(String(token || "").toUpperCase().replace(/[^A-Z0-9]+/g, "")));
}

function remarkHasAutoLaunch(value = "") {
  return remarkHasAll(value, ["AUTO", "LAUNCH"]) || compactRemarkForMatch(value).includes("AUTOLAUNCH");
}

function isWestInsertionRemark(value = "") {
  return (
    (remarkHasAll(value, ["WEST", "DEPOT"]) && remarkHasAutoLaunch(value)) ||
    remarkHasAll(value, ["3A1", "PF1", "MANUAL", "INSERTION"]) ||
    remarkHasAll(value, ["MANUAL", "INSERTION", "3A1", "P1"])
  );
}

function isEastInsertionRemark(value = "") {
  return (
    (remarkHasAll(value, ["EAST", "DEPOT"]) && remarkHasAutoLaunch(value)) ||
    remarkHasAll(value, ["3K1", "PF2", "MANUAL", "INSERTION"]) ||
    remarkHasAll(value, ["MANUAL", "INSERTION", "3K1", "P2"])
  );
}

function isWestRemovalRemark(value = "") {
  return (
    (remarkHasAll(value, ["WEST", "DEPOT", "REMOVAL"]) && !remarkHasAll(value, ["EAST", "DEPOT"])) ||
    remarkHasAll(value, ["REMOVAL", "WD"]) ||
    remarkHasAll(value, ["3K1", "PF1", "REMOVAL", "WD"])
  );
}

function isEastRemovalRemark(value = "") {
  return (
    (remarkHasAll(value, ["EAST", "DEPOT", "REMOVAL"]) && !remarkHasAll(value, ["WEST", "DEPOT"])) ||
    remarkHasAll(value, ["REMOVAL", "ED"]) ||
    remarkHasAll(value, ["3A1", "PF2", "REMOVAL", "ED"])
  );
}

function findExcelColumn(row = [], headerText = "", startIndex = 0) {
  const wanted = normalizeExcelHeader(headerText);
  for (let i = Math.max(0, startIndex); i < row.length; i += 1) {
    if (normalizeExcelHeader(row[i]) === wanted) return i;
  }
  return -1;
}

function findReasonColumn(subHeaderRow = [], afterIndex = 0, beforeIndex = subHeaderRow.length) {
  for (let i = Math.max(0, afterIndex); i < Math.min(subHeaderRow.length, beforeIndex); i += 1) {
    const clean = normalizeExcelHeader(subHeaderRow[i]);
    if (clean.includes("reason") && clean.includes("delay")) return i;
  }
  return -1;
}

function normalizeTidValue(value = "") {
  const clean = String(value ?? "").replace(/[^0-9]/g, "");
  return clean ? String(Number(clean)) : "";
}

function normalizeDidValue(value = "") {
  const clean = String(value ?? "").replace(/[^0-9]/g, "");
  return clean || "";
}

function excelTimeToMinutes(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const total = value.getHours() * 60 + value.getMinutes() + (value.getSeconds() >= 30 ? 1 : 0);
    return total % 1440;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const dayFraction = value >= 1 ? value % 1 : value;
    return Math.round(dayFraction * 24 * 60) % 1440;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const ampm = (match[4] || "").toUpperCase();

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return (hour * 60 + minute + (second >= 30 ? 1 : 0)) % 1440;
}

function formatMinutesAsTime(minutes) {
  if (!Number.isFinite(minutes)) return "";
  const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function excelTimeToSeconds(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ((value.getHours() * 3600) + (value.getMinutes() * 60) + value.getSeconds()) % 86400;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const dayFraction = value >= 1 ? value % 1 : value;
    return Math.round(dayFraction * 24 * 60 * 60) % 86400;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const ampm = (match[4] || "").toUpperCase();

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return ((hour * 3600) + (minute * 60) + second) % 86400;
}

function formatSecondsAsTime(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const safe = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const hour = Math.floor(safe / 3600);
  const minute = Math.floor((safe % 3600) / 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const DEPOT_TIMETABLE_OFFSET_SECONDS = {
  west: (4 * 60) + 30,
  east: (5 * 60) + 22,
};

function formatDepotMovementStartTime(value, depot = "west", movementType = "insertion") {
  const seconds = excelTimeToSeconds(value);
  if (seconds === null) return "";
  const depotKey = depot === "east" ? "east" : "west";
  const offset = DEPOT_TIMETABLE_OFFSET_SECONDS[depotKey] || 0;
  const isRemovalToDepot = movementType === "removal";
  return formatSecondsAsTime(seconds + (isRemovalToDepot ? offset : -offset));
}

function formatExcelTimeValue(value) {
  const minutes = excelTimeToMinutes(value);
  return minutes === null ? "" : formatMinutesAsTime(minutes);
}

function classifyRemovalPresetFromTime(timetableType, time = "") {
  const normalizedType = normalizeTimetableType(timetableType);
  if (normalizedType === "friday") return "Fri";
  if (normalizedType === "saturday") return "Sat";
  if (normalizedType === "ph") return "PH";

  const minutes = excelTimeToMinutes(time);
  if (minutes === null) return "9am";
  if (minutes < 180) return "12am";
  if (minutes >= 18 * 60) return "7pm";
  return "9am";
}

function pushTimetableEntry(bucket, entry) {
  if (!entry?.tid || !entry?.time) return;
  bucket.entries.push(entry);
  bucket.timeMap[entry.tid] = entry.time;
  if (entry.label) {
    if (!bucket.presets[entry.label]) bucket.presets[entry.label] = { tids: [], timeMap: {}, entries: [] };
    bucket.presets[entry.label].tids.push(entry.tid);
    bucket.presets[entry.label].timeMap[entry.tid] = entry.time;
    bucket.presets[entry.label].entries.push(entry);
  }
}

function sortTimetableBucket(bucket) {
  const byTime = (a, b) => {
    const aMinutes = excelTimeToMinutes(a.time) ?? 0;
    const bMinutes = excelTimeToMinutes(b.time) ?? 0;
    if (aMinutes !== bMinutes) return aMinutes - bMinutes;
    return Number(a.tid || 0) - Number(b.tid || 0);
  };

  bucket.entries.sort(byTime);
  Object.values(bucket.presets || {}).forEach((preset) => {
    preset.entries.sort(byTime);
    preset.tids = preset.entries.map((entry) => entry.tid);
    preset.timeMap = Object.fromEntries(preset.entries.map((entry) => [entry.tid, entry.time]));
  });
  bucket.timeMap = Object.fromEntries(bucket.entries.map((entry) => [entry.tid, entry.time]));
}

function pushTimetableReferenceEntry(bucket, entry) {
  if (!bucket || !entry?.tid || !entry?.time) return;
  bucket.entries.push(entry);
}

function sortTimetableReferenceBucket(bucket) {
  if (!bucket) return;

  const byTime = (a, b) => {
    const aMinutes = excelTimeToMinutes(a.time) ?? 0;
    const bMinutes = excelTimeToMinutes(b.time) ?? 0;
    if (aMinutes !== bMinutes) return aMinutes - bMinutes;
    return Number(a.tid || 0) - Number(b.tid || 0);
  };

  bucket.entries.sort(byTime);
  bucket.timeMap = {};
  bucket.timesByTid = {};

  bucket.entries.forEach((entry) => {
    if (!entry?.tid || !entry?.time) return;
    if (!bucket.timeMap[entry.tid]) bucket.timeMap[entry.tid] = entry.time;
    if (!bucket.timesByTid[entry.tid]) bucket.timesByTid[entry.tid] = [];
    bucket.timesByTid[entry.tid].push(entry.time);
  });
}

function createEmptyParsedTimetable(timetableType = "weekday") {
  const makeRemovalBucket = () => ({ entries: [], timeMap: {}, presets: {} });
  const makeInsertionBucket = () => ({ entries: [], timeMap: {} });
  const makeReferenceBucket = () => ({ entries: [], timeMap: {}, timesByTid: {} });

  return {
    timetableType: normalizeTimetableType(timetableType),
    parsedAt: new Date().toISOString(),
    depotTimingOffsetVersion: TIMETABLE_PARSE_VERSION,
    summary: {
      insertion: { west: 0, east: 0 },
      removal: { west: 0, east: 0 },
      reference: { arrival3A1P2: 0 },
    },
    insertion: {
      west: makeInsertionBucket(),
      east: makeInsertionBucket(),
    },
    removal: {
      west: makeRemovalBucket(),
      east: makeRemovalBucket(),
    },
    reference: {
      arrival3A1P2: makeReferenceBucket(),
    },
  };
}

function parseTimetableWorkbook(arrayBuffer, timetableType = "weekday", fileName = "") {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const parsed = createEmptyParsedTimetable(timetableType);
  parsed.sourceFileName = fileName || "Uploaded timetable";

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => normalizeExcelHeader(cell) === "tid") &&
      row.some((cell) => normalizeExcelHeader(cell) === "departure 3a1p1") &&
      row.some((cell) => normalizeExcelHeader(cell) === "departure 3k1p2")
    );

    if (headerIndex === -1) return;

    const headerRow = rows[headerIndex] || [];
    const subHeaderRow = rows[headerIndex + 1] || [];
    const tidIndex = findExcelColumn(headerRow, "TID");
    const westDidIndex = findExcelColumn(headerRow, "DID", tidIndex + 1);
    const westDepartureIndex = findExcelColumn(headerRow, "Departure 3A1P1");
    const eastArrivalIndex = findExcelColumn(headerRow, "Arrival 3K1P1");
    const eastDidIndex = findExcelColumn(headerRow, "DID", eastArrivalIndex + 1);
    const eastDepartureIndex = findExcelColumn(headerRow, "Departure 3K1P2");
    const westArrivalIndex = findExcelColumn(headerRow, "Arrival 3A1P2");
    const leftReasonIndex = findReasonColumn(subHeaderRow, eastArrivalIndex + 1, eastDidIndex >= 0 ? eastDidIndex : subHeaderRow.length);
    const rightReasonIndex = findReasonColumn(subHeaderRow, westArrivalIndex + 1, subHeaderRow.length);

    if (tidIndex === -1) return;

    rows.slice(headerIndex + 2).forEach((row) => {
      const tid = normalizeTidValue(row[tidIndex]);
      if (!tid) return;

      const leftRemark = String(row[leftReasonIndex] || "").trim();
      const rightRemark = String(row[rightReasonIndex] || "").trim();
      const westDid = normalizeDidValue(row[westDidIndex]);
      const eastDid = normalizeDidValue(row[eastDidIndex]);
      const arrival3A1P2Time = formatExcelTimeValue(row[westArrivalIndex]);

      if (arrival3A1P2Time) {
        pushTimetableReferenceEntry(parsed.reference.arrival3A1P2, { tid, did: eastDid, time: arrival3A1P2Time, sheetName });
      }

      if (isWestInsertionRemark(leftRemark)) {
        // Departure 3A1P1 is the platform time. Insertion starts from West Depot 4m30s earlier.
        const time = formatDepotMovementStartTime(row[westDepartureIndex], "west");
        if (time) {
          const entry = { tid, did: westDid, time, remark: leftRemark, sheetName };
          parsed.insertion.west.entries.push(entry);
          parsed.insertion.west.timeMap[tid] = time;
        }
      }

      if (isEastInsertionRemark(rightRemark)) {
        // Departure 3K1P2 is the platform time. Insertion starts from East Depot 5m22s earlier.
        const time = formatDepotMovementStartTime(row[eastDepartureIndex], "east");
        if (time) {
          const entry = { tid, did: eastDid, time, remark: rightRemark, sheetName };
          parsed.insertion.east.entries.push(entry);
          parsed.insertion.east.timeMap[tid] = time;
        }
      }

      if (isWestRemovalRemark(rightRemark)) {
        const platformTime = formatExcelTimeValue(row[westArrivalIndex]);
        // Arrival 3A1P2 is the platform time. Removal reaches West Depot 4m30s later.
        const time = formatDepotMovementStartTime(row[westArrivalIndex], "west", "removal");
        const label = classifyRemovalPresetFromTime(timetableType, platformTime);
        pushTimetableEntry(parsed.removal.west, { tid, did: eastDid, time, remark: rightRemark, label, sheetName });
      }

      if (isEastRemovalRemark(leftRemark)) {
        const platformTime = formatExcelTimeValue(row[eastArrivalIndex]);
        // Arrival 3K1P1 is the platform time. Removal reaches East Depot 5m22s later.
        const time = formatDepotMovementStartTime(row[eastArrivalIndex], "east", "removal");
        const label = classifyRemovalPresetFromTime(timetableType, platformTime);
        pushTimetableEntry(parsed.removal.east, { tid, did: westDid, time, remark: leftRemark, label, sheetName });
      }
    });
  });

  ["west", "east"].forEach((depot) => {
    parsed.insertion[depot].entries.sort((a, b) => (excelTimeToMinutes(a.time) ?? 0) - (excelTimeToMinutes(b.time) ?? 0));
    parsed.insertion[depot].timeMap = Object.fromEntries(parsed.insertion[depot].entries.map((entry) => [entry.tid, entry.time]));
    sortTimetableBucket(parsed.removal[depot]);
    parsed.summary.insertion[depot] = parsed.insertion[depot].entries.length;
    parsed.summary.removal[depot] = parsed.removal[depot].entries.length;
  });

  sortTimetableReferenceBucket(parsed.reference.arrival3A1P2);
  parsed.summary.reference.arrival3A1P2 = parsed.reference.arrival3A1P2.entries.length;

  return parsed;
}

function normalizeStoredTimetableRecord(record = null) {
  if (!record) return record;

  const parsed = getActiveTimetableParsedData(record);
  const version = Number(parsed?.depotTimingOffsetVersion || 0);
  if (version >= TIMETABLE_PARSE_VERSION) return record;

  const base64 = record?.fileBase64 || record?.originalFileBase64 || record?.sourceFileBase64 || "";
  if (!base64) return record;

  try {
    const fileName = record?.fileName || record?.sourceFileName || parsed?.sourceFileName || "Uploaded timetable";
    const type = detectTimetableTypeFromFileName(fileName, record?.timetableType || parsed?.timetableType || "weekday");
    const reparsedData = parseTimetableWorkbook(base64ToArrayBuffer(base64), type, fileName);

    return {
      ...record,
      timetableType: normalizeTimetableType(type),
      typeLabel: getTimetableTypeLabel(type),
      parsedData: reparsedData,
      summary: reparsedData.summary,
    };
  } catch (error) {
    console.warn("Unable to refresh stored timetable timing offsets:", error);
    return record;
  }
}

function normalizeStoredTimetableRecords(records = []) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeStoredTimetableRecord(record));
}

function getTimetableRecordType(record = null) {
  const storedType = normalizeTimetableType(record?.timetableType || record?.parsedData?.timetableType || "weekday");
  const fileName = record?.fileName || record?.sourceFileName || record?.parsedData?.sourceFileName || "";
  return detectTimetableTypeFromFileName(fileName, storedType);
}

function findLatestTimetableRecord(records = [], type = "weekday") {
  const normalizedType = normalizeTimetableType(type);
  return (records || [])
    .filter((record) => getTimetableRecordType(record) === normalizedType)
    .sort((a, b) => new Date(b?.updatedAt || b?.updated_date || b?.createdAt || 0) - new Date(a?.updatedAt || a?.updated_date || a?.createdAt || 0))[0] || null;
}

function getActiveTimetableParsedData(activeTimetable = null) {
  return activeTimetable?.parsedData || activeTimetable?.data || null;
}

function normalizeDepotKey(value = "west") {
  const text = String(value || "west").trim().toLowerCase();
  if (text === "east" || text.includes("east") || text.startsWith("ed")) return "east";
  return "west";
}

function getTimetableInsertionTimeMap(activeTimetable = null, depot = "west") {
  const parsed = getActiveTimetableParsedData(activeTimetable);
  const depotKey = normalizeDepotKey(depot);
  return parsed?.insertion?.[depotKey]?.timeMap || {};
}

function getDayMinutes(date = new Date()) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return safeDate.getHours() * 60 + safeDate.getMinutes();
}

function getNextTimetableTimeForTid(activeTimetable = null, referenceKey = "arrival3A1P2", tid = "", date = new Date()) {
  const parsed = getActiveTimetableParsedData(activeTimetable);
  const key = normalizeTidValue(tid);
  if (!parsed || !key) return "";

  const bucket = parsed?.reference?.[referenceKey] || {};
  const nowMinutes = getDayMinutes(date);
  const times = Array.isArray(bucket?.timesByTid?.[key])
    ? bucket.timesByTid[key]
    : Array.isArray(bucket?.entries)
      ? bucket.entries.filter((entry) => normalizeTidValue(entry?.tid) === key).map((entry) => entry.time)
      : bucket?.timeMap?.[key]
        ? [bucket.timeMap[key]]
        : [];

  const validTimes = times
    .map((time) => ({ time, minutes: excelTimeToMinutes(time) }))
    .filter((item) => item.time && item.minutes !== null);

  if (!validTimes.length) return "";

  validTimes.sort((a, b) => {
    const deltaA = (a.minutes - nowMinutes + 1440) % 1440;
    const deltaB = (b.minutes - nowMinutes + 1440) % 1440;
    if (deltaA !== deltaB) return deltaA - deltaB;
    return a.minutes - b.minutes;
  });

  return validTimes[0]?.time || "";
}

function getTimetableArrival3A1P2Time(activeTimetable = null, tid = "", date = new Date()) {
  return getNextTimetableTimeForTid(activeTimetable, "arrival3A1P2", tid, date);
}

function formatTimetableTimeWithHrs(value = "") {
  const time = formatExcelTimeValue(value) || (value || "").toString().trim().replace(/\s*hrs\.?$/i, "");
  return time ? `${time} hrs` : "";
}

function addArrival3A1P2ToRequestedRows(rows = [], activeTimetable = null, date = new Date()) {
  return (rows || []).map((row) => ({
    ...row,
    arrival3A1P2: getTimetableArrival3A1P2Time(activeTimetable, row?.tid, date),
  }));
}

function getTimetableRemovalPreset(activeTimetable = null, depot = "west", label = "9am") {
  const parsed = getActiveTimetableParsedData(activeTimetable);
  const depotKey = depot === "east" ? "east" : "west";
  const preset = parsed?.removal?.[depotKey]?.presets?.[label];
  if (preset?.tids?.length) return preset;

  const recordType = getTimetableRecordType(activeTimetable);
  const entries = parsed?.removal?.[depotKey]?.entries || [];
  if (getValidTrainRemPresetLabelsForTimetableType(recordType).includes(label) && entries.length) {
    return {
      label,
      entries,
      tids: entries.map((entry) => entry.tid).filter(Boolean),
      timeMap: Object.fromEntries(entries.filter((entry) => entry?.tid && entry?.time).map((entry) => [entry.tid, entry.time])),
    };
  }

  return null;
}

function getTrainRemPresetConfig(depot = "west", label = "9am", activeTimetable = null) {
  const dynamicPreset = getTimetableRemovalPreset(activeTimetable, depot, label);
  if (dynamicPreset) {
    return {
      label,
      tids: dynamicPreset.tids || [],
      timeMap: dynamicPreset.timeMap || {},
      source: "uploaded",
    };
  }

  const fallbackPreset = TID_PRESETS[depot]?.find((item) => item.label === label) || { label, tids: [] };
  return {
    label,
    tids: fallbackPreset.tids || [],
    timeMap: TID_TIME_MAP?.[depot]?.[label] || {},
    source: "fallback",
  };
}

function buildTrainRemRowsFromPresetConfig(depot, label, existingRows = [], activeTimetable = null) {
  const config = getTrainRemPresetConfig(depot, label, activeTimetable);
  const rows = normalizeTrainRemRows(existingRows, depot);
  const tids = getTrainRemPresetRowTids(depot, label, config.tids);

  return rows.map((row, index) => {
    const tid = tids[index] ? String(tids[index]) : "";
    const referenceOnly = isTrainRemReferenceOnlyIndex(depot, label, index);
    return {
      ...row,
      trainId: isTrainRemReferenceSeparatorIndex(depot, label, index) ? "" : row.trainId,
      tid,
      timing: tid && !referenceOnly ? config.timeMap?.[tid] || "" : "",
      remark: referenceOnly ? "" : row.remark,
    };
  });
}

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
const LOCAL_STABLING_STATE_KEY = "depotStablingLocalState_v2";
const STABLING_LOCAL_EDIT_HOLD_MS = 15000;
const STABLING_POST_SAVE_HOLD_MS = 8000;

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
const ADM_SESSION_KEY = "admAdminUnlocked_v1";
const ADM_LOGIN_ID = "admin";
const ADM_LOGIN_PASSWORD = "921016";
const ADMIN_NOTES_STORAGE_KEY = "admModernNotes_v1";
const ADMIN_NOTE_LIVE_RECORD_KEY = "adm-modern-notes-main";
const ADMIN_NOTE_SAVE_DEBOUNCE_MS = 700;
const ADMIN_NOTE_THEMES = [
  { from: "#e2e8f0", to: "#cbd5e1", border: "#cbd5e1", shadow: "rgba(100, 116, 139, 0.18)" },
  { from: "#dbeafe", to: "#bfdbfe", border: "#93c5fd", shadow: "rgba(59, 130, 246, 0.18)" },
  { from: "#ccfbf1", to: "#99f6e4", border: "#5eead4", shadow: "rgba(20, 184, 166, 0.18)" },
  { from: "#fce7f3", to: "#fbcfe8", border: "#f9a8d4", shadow: "rgba(236, 72, 153, 0.18)" },
  { from: "#ffedd5", to: "#fed7aa", border: "#fdba74", shadow: "rgba(249, 115, 22, 0.18)" },
  { from: "#cffafe", to: "#bae6fd", border: "#7dd3fc", shadow: "rgba(14, 165, 233, 0.18)" },
  { from: "#ede9fe", to: "#ddd6fe", border: "#c4b5fd", shadow: "rgba(139, 92, 246, 0.18)" },
];

function createAdminNoteItem(title = "New Parent") {
  const now = new Date().toISOString();
  return {
    id: `adm-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    note: "",
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeAdminNoteItem(item = {}, index = 0) {
  const fallback = createAdminNoteItem(`Parent ${index + 1}`);
  return {
    ...fallback,
    ...item,
    id: String(item.id || fallback.id),
    title: String(item.title || `Parent ${index + 1}`).trim() || `Parent ${index + 1}`,
    note: String(item.note || ""),
    collapsed: item.collapsed === true || item.collapsed === "true",
    createdAt: item.createdAt || item.created_date || fallback.createdAt,
    updatedAt: item.updatedAt || item.updated_date || fallback.updatedAt,
  };
}

function getDefaultAdminNotes() {
  return [
    {
      id: "adm-note-default",
      title: "Admin Note",
      note: "",
      collapsed: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

function normalizeAdminNoteList(notes = []) {
  const cleanNotes = Array.isArray(notes) ? notes : [];
  if (!cleanNotes.length) return getDefaultAdminNotes();
  return cleanNotes.map((item, index) => normalizeAdminNoteItem(item, index));
}

function loadAdminNotes() {
  try {
    const raw = localStorage.getItem(ADMIN_NOTES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) {
      return normalizeAdminNoteList(parsed);
    }
  } catch {}

  return getDefaultAdminNotes();
}

function saveAdminNotes(notes = []) {
  try { localStorage.setItem(ADMIN_NOTES_STORAGE_KEY, JSON.stringify(normalizeAdminNoteList(notes))); } catch {}
}

function getAdminNoteEntity() {
  return base44?.entities?.AdminNote || null;
}

function isAdminNoteEntityReady(entity = getAdminNoteEntity()) {
  return Boolean(entity?.list && entity?.create && entity?.update);
}

function getAdminNoteCardStyle(index) {
  const theme = ADMIN_NOTE_THEMES[index % ADMIN_NOTE_THEMES.length];
  return {
    background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)`,
    borderColor: theme.border,
    boxShadow: `0 12px 26px -20px ${theme.shadow}`,
  };
}

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

const INSERTION_ACTIVE_PG_KEY = "insertionActivePg_v1";
const INSERTION_PG2_STABLING_KEY = "insertionPg2StablingState_v1";
const INSERTION_PG2_LOG_KEY = "insertionPg2LogState_v1";
const INSERTION_PG2_TID_INPUTS_KEY = "insertionPg2TidInputsState_v1";

function normalizeInsertionPg(value = "pg1") {
  return String(value || "").toLowerCase() === "pg2" ? "pg2" : "pg1";
}

function cloneInsertionStablingState(westData = {}, eastData = {}) {
  return {
    westData: normalizeStablingDepotData(westData, WEST_ROADS),
    eastData: normalizeStablingDepotData(eastData, EAST_ROADS),
  };
}

function loadInsertionActivePg() {
  try {
    if (typeof localStorage === "undefined") return "pg1";
    return normalizeInsertionPg(localStorage.getItem(INSERTION_ACTIVE_PG_KEY));
  } catch {
    return "pg1";
  }
}

function saveInsertionActivePg(value = "pg1") {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(INSERTION_ACTIVE_PG_KEY, normalizeInsertionPg(value));
  } catch {}
}

function normalizeInsertionPg2Stabling(source = {}, fallbackWest = {}, fallbackEast = {}) {
  const hasSource = source && typeof source === "object" && (source.westData || source.west || source.eastData || source.east);
  return cloneInsertionStablingState(
    hasSource ? source.westData || source.west || {} : fallbackWest,
    hasSource ? source.eastData || source.east || {} : fallbackEast
  );
}

function loadInsertionPg2Stabling(fallbackWest = {}, fallbackEast = {}) {
  try {
    if (typeof localStorage === "undefined") return cloneInsertionStablingState(fallbackWest, fallbackEast);
    const raw = localStorage.getItem(INSERTION_PG2_STABLING_KEY);
    if (!raw) return cloneInsertionStablingState(fallbackWest, fallbackEast);
    return normalizeInsertionPg2Stabling(JSON.parse(raw), fallbackWest, fallbackEast);
  } catch {
    return cloneInsertionStablingState(fallbackWest, fallbackEast);
  }
}

function saveInsertionPg2Stabling(state = {}) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(INSERTION_PG2_STABLING_KEY, JSON.stringify(normalizeInsertionPg2Stabling(state)));
  } catch {}
}

function loadInsertionPg2Log() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(INSERTION_PG2_LOG_KEY);
    if (!raw) return [];
    return sortInsertionLogByTime(JSON.parse(raw) || []);
  } catch { return []; }
}
function saveInsertionPg2Log(log = []) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(INSERTION_PG2_LOG_KEY, JSON.stringify(sortInsertionLogByTime(Array.isArray(log) ? log : [])));
  } catch {}
}

function loadInsertionPg2TidInputs() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(INSERTION_PG2_TID_INPUTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function saveInsertionPg2TidInputs(inputs = {}) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(INSERTION_PG2_TID_INPUTS_KEY, JSON.stringify(inputs && typeof inputs === "object" ? inputs : {}));
  } catch {}
}

const INSERTION_HIDE_ELAPSED_TID_KEY_PREFIX = "insertionHideElapsedTid_v1";
function getInsertionHideElapsedTidKey(title = "", roads = []) {
  const fallback = Array.isArray(roads) && roads.length ? roads.join("_") : "insertion";
  const scope = String(title || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "default";
  return `${INSERTION_HIDE_ELAPSED_TID_KEY_PREFIX}_${scope}`;
}
function loadInsertionHideElapsedTid(title, roads) {
  try {
    return localStorage.getItem(getInsertionHideElapsedTidKey(title, roads)) === "true";
  } catch { return false; }
}
function saveInsertionHideElapsedTid(title, roads, value) {
  try { localStorage.setItem(getInsertionHideElapsedTidKey(title, roads), String(Boolean(value))); } catch {}
}

function normalizeInsertionLiveState(source = {}) {
  const hasPg2Stabling = Boolean(source?.pg2Stabling || source?.pg2WestData || source?.pg2EastData);
  const pg2StablingSource = source?.pg2Stabling || {
    westData: source?.pg2WestData,
    eastData: source?.pg2EastData,
  };

  return {
    insertionLog: sortInsertionLogByTime(Array.isArray(source?.insertionLog) ? source.insertionLog : []),
    tidInputs: source?.tidInputs && typeof source.tidInputs === "object" ? source.tidInputs : {},
    pg2Stabling: hasPg2Stabling ? normalizeInsertionPg2Stabling(pg2StablingSource) : null,
    pg2InsertionLog: Array.isArray(source?.pg2InsertionLog) ? sortInsertionLogByTime(source.pg2InsertionLog) : null,
    pg2TidInputs: source?.pg2TidInputs && typeof source.pg2TidInputs === "object" ? source.pg2TidInputs : null,
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
    pg2Stabling: normalized.pg2Stabling || normalizeInsertionPg2Stabling(state?.pg2Stabling || {}),
    pg2InsertionLog: normalized.pg2InsertionLog || [],
    pg2TidInputs: normalized.pg2TidInputs || {},
    updatedAt: new Date().toISOString(),
  };
}


const TRAIN_REM_STORAGE_KEY = "trainRemState_v1";
const TRAIN_REM_SYNC_INTERVAL_MS = 5000;
const TRAIN_REM_UNDO_LIMIT = 30;
const TRAIN_REM_ROW_COUNTS = { west: 32, east: 14 };
const TRAIN_REM_WEST_9AM_REAL_ROW_COUNT = 10;
const TRAIN_REM_WEST_9AM_REFERENCE_SEPARATOR_COUNT = 2;
const TRAIN_REM_WEST_9AM_REFERENCE_START_INDEX = TRAIN_REM_WEST_9AM_REAL_ROW_COUNT + TRAIN_REM_WEST_9AM_REFERENCE_SEPARATOR_COUNT;
const TRAIN_REM_WEST_9AM_REFERENCE_NOTE = "Enter the Train IDs below to minimize train swapping for washing.";
const TRAIN_REM_WEST_9AM_REFERENCE_TIDS = [
  101, 103, 105, 107, 109, 111, 113, 115, 117, 119,
  201, 203, 205, 207, 209, 211, 213, 215, 217, 219,
];
const TRAIN_REM_WEST_9AM_REAL_TIDS = [212, 214, 216, 218, 220, 102, 104, 106, 108, 110];
const TRAIN_REM_WASH_LATE_SHIFT_TIDS = [
  101, 103, 105, 107, 109, 111, 113, 115, 117, 119,
  201, 203, 205, 213, 215, 217, 219,
];
const TRAIN_REM_WASH_NEED_SWAP_TIDS = [207, 209, 211];
const FULL_ML_TID_ROW_COUNT = 40;
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
const TRAIN_REM_WEST_9AM_PRIORITY_TIDS = new Set(TRAIN_REM_WEST_9AM_REFERENCE_TIDS.map((tid) => String(tid)));
const TRAIN_REM_WEST_9AM_REAL_TID_SET = new Set(TRAIN_REM_WEST_9AM_REAL_TIDS.map((tid) => String(tid)));
const TRAIN_REM_WASH_LATE_SHIFT_TID_SET = new Set(TRAIN_REM_WASH_LATE_SHIFT_TIDS.map((tid) => String(tid)));
const TRAIN_REM_WASH_NEED_SWAP_TID_SET = new Set(TRAIN_REM_WASH_NEED_SWAP_TIDS.map((tid) => String(tid)));

function normalizeTrainRemTidValue(value = "") {
  return (value || "").toString().replace(/[^0-9]/g, "");
}

function isWashOnlyRequestedRemark(value = "") {
  return getRequestedWashOnlySortValue(value) === 1;
}

function getWashOnlyShiftRemovalAction({ tid = "", requestType = "", westRemovalRow = null } = {}) {
  if (!isWashOnlyRequestedRemark(requestType)) return null;

  const tidKey = normalizeTrainRemTidValue(tid || westRemovalRow?.tid || "");
  if (!tidKey) return null;

  if (westRemovalRow?.isWest9amRealRemoval || TRAIN_REM_WEST_9AM_REAL_TID_SET.has(tidKey)) {
    return {
      actionLabel: "Early Shift Rem",
      actionSymbol: "✓",
      actionStatus: "Early Shift Rem ✓",
      actionType: "earlyShiftRem",
      group: "removal",
    };
  }

  if (TRAIN_REM_WASH_NEED_SWAP_TID_SET.has(tidKey)) return null;

  if (TRAIN_REM_WASH_LATE_SHIFT_TID_SET.has(tidKey)) {
    return {
      actionLabel: "Late Shift Rem",
      actionSymbol: "✓",
      actionStatus: "Late Shift Rem ✓",
      actionType: "lateShiftRem",
      group: "removal",
    };
  }

  return null;
}

function isTrainRemWest9amPreset(depot = "west", label = "9am") {
  return depot === "west" && label === "9am";
}

function isTrainRemReferenceSeparatorIndex(depot = "west", label = "9am", rowIndex = -1) {
  return (
    isTrainRemWest9amPreset(depot, label) &&
    rowIndex >= TRAIN_REM_WEST_9AM_REAL_ROW_COUNT &&
    rowIndex < TRAIN_REM_WEST_9AM_REFERENCE_START_INDEX
  );
}

function isTrainRemReferenceOnlyIndex(depot = "west", label = "9am", rowIndex = -1) {
  return isTrainRemWest9amPreset(depot, label) && rowIndex >= TRAIN_REM_WEST_9AM_REAL_ROW_COUNT;
}

function getTrainRemPresetRowTids(depot = "west", label = "9am", tids = []) {
  const sourceTids = Array.isArray(tids) ? tids : [];

  if (!isTrainRemWest9amPreset(depot, label)) {
    return sourceTids;
  }

  const realRemovalTids = sourceTids
    .slice(0, TRAIN_REM_WEST_9AM_REAL_ROW_COUNT)
    .map((tid) => (tid ? String(tid) : ""));

  while (realRemovalTids.length < TRAIN_REM_WEST_9AM_REAL_ROW_COUNT) {
    realRemovalTids.push("");
  }

  return [
    ...realRemovalTids,
    ...Array.from({ length: TRAIN_REM_WEST_9AM_REFERENCE_SEPARATOR_COUNT }, () => ""),
    ...TRAIN_REM_WEST_9AM_REFERENCE_TIDS.map((tid) => String(tid)),
  ].slice(0, TRAIN_REM_ROW_COUNTS.west);
}

const TID_PRESETS = {
  west: [
    {
      label: "9am",
      tids: [
        212, 214, 216, 218, 220, 102, 104, 106, 108, 110,
        "", "",
        ...TRAIN_REM_WEST_9AM_REFERENCE_TIDS,
      ],
    },
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

function buildFullMlTrainTidMap(rows = []) {
  const map = {};

  normalizeFullMlTidRows(rows).forEach((row) => {
    const tid = (row.tid || "").toString().replace(/[^0-9]/g, "");
    const trainKey = normalizeTrainId(row.trainId);

    if (tid && trainKey && !map[trainKey]) {
      map[trainKey] = tid;
    }
  });

  return map;
}

function getFullMlTidForTrain(fullMlTidRows = [], trainKey = "") {
  const normalizedTrainKey = normalizeTrainId(trainKey);
  if (!normalizedTrainKey) return "";

  return buildFullMlTrainTidMap(fullMlTidRows)[normalizedTrainKey] || "";
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

function getTrainRemTimestampValue(value) {
  const time = Date.parse((value || "").toString());
  return Number.isFinite(time) ? time : 0;
}

function getTrainRemStateTimestamp(state = {}) {
  return getTrainRemTimestampValue(state?.updatedAt || state?.updated_date || state?.updatedDate);
}

function getTrainRemRecordTimestamp(record = {}) {
  return getTrainRemTimestampValue(
    record?.updatedAt ||
    record?.updated_date ||
    record?.updatedDate ||
    record?.createdAt ||
    record?.created_date
  );
}

function getTrainRemRecordFilledTrainIdCount(record = {}) {
  const depot = record?.depot === "east" ? "east" : record?.depot === "west" ? "west" : null;
  const rows = depot ? normalizeTrainRemRows(record?.rows, depot) : Array.isArray(record?.rows) ? record.rows : [];

  const selectedPreset = record?.selectedPreset || "9am";
  return rows.filter((row, index) => {
    if (isTrainRemReferenceOnlyIndex(depot, selectedPreset, index)) return false;
    return normalizeTrainId(row?.trainId || "");
  }).length;
}

function stampTrainRemState(state = {}, updatedAt = new Date().toISOString()) {
  return {
    ...state,
    updatedAt,
  };
}

function isTrainRemLocalStateNewer(localState = {}, dbState = {}) {
  const localTime = getTrainRemStateTimestamp(localState);
  const dbTime = getTrainRemStateTimestamp(dbState);

  return localTime > 0 && localTime > dbTime;
}

function getLatestTrainRemRecordsByDepot(records = []) {
  const latestByDepot = {};

  (records || []).forEach((record) => {
    const depot = record?.depot === "east" ? "east" : record?.depot === "west" ? "west" : null;
    if (!depot) return;

    const recordTime = getTrainRemRecordTimestamp(record);
    const existingTime = getTrainRemRecordTimestamp(latestByDepot[depot]);

    const recordFilledCount = getTrainRemRecordFilledTrainIdCount(record);
    const existingFilledCount = getTrainRemRecordFilledTrainIdCount(latestByDepot[depot]);

    // D1 can contain duplicate depot records from older app versions. Keep the
    // newest record, and if timestamps match, keep the one with more Train ID
    // data so an empty duplicate cannot erase typed Train IDs.
    if (
      !latestByDepot[depot] ||
      recordTime > existingTime ||
      (recordTime === existingTime && recordFilledCount > existingFilledCount)
    ) {
      latestByDepot[depot] = record;
    }
  });

  return latestByDepot;
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

function normalizeTrainRemRowsForPreset(rows, depot, label = "9am") {
  const normalizedRows = normalizeTrainRemRows(rows, depot);

  if (!isTrainRemWest9amPreset(depot, label)) return normalizedRows;

  return normalizedRows.map((row, index) => {
    if (isTrainRemReferenceSeparatorIndex(depot, label, index)) {
      return {
        ...row,
        trainId: "",
        tid: "",
        timing: "",
        remark: "",
      };
    }

    if (isTrainRemReferenceOnlyIndex(depot, label, index)) {
      const referenceTid = TRAIN_REM_WEST_9AM_REFERENCE_TIDS[index - TRAIN_REM_WEST_9AM_REFERENCE_START_INDEX];
      return {
        ...row,
        tid: referenceTid ? String(referenceTid) : "",
        timing: "",
        remark: "",
      };
    }

    return row;
  });
}

function collectStablingTrainIds(data = {}, roads = []) {
  const seen = new Set();
  const trainIds = [];

  (roads || []).forEach((road) => {
    const blocks = Array.isArray(data?.[road]) ? data[road] : [];
    blocks.forEach((block) => {
      const trainKey = padTrainId(normalizeTrainId(block?.trainId || ""));
      if (!trainKey || seen.has(trainKey)) return;

      seen.add(trainKey);
      trainIds.push(trainKey);
    });
  });

  return trainIds;
}

function buildTrainRemRowsFromPreset(depot, label, existingRows = []) {
  const preset = TID_PRESETS[depot].find((item) => item.label === label);
  const tids = getTrainRemPresetRowTids(depot, label, preset?.tids || []);
  const rows = normalizeTrainRemRows(existingRows, depot);

  return rows.map((row, index) => {
    const tid = tids[index] ? String(tids[index]) : "";
    const referenceOnly = isTrainRemReferenceOnlyIndex(depot, label, index);
    return {
      ...row,
      trainId: isTrainRemReferenceSeparatorIndex(depot, label, index) ? "" : row.trainId,
      tid,
      timing: tid && !referenceOnly ? TID_TIME_MAP?.[depot]?.[label]?.[tid] || "" : "",
      remark: referenceOnly ? "" : row.remark,
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
    updatedAt: "",
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
      rows: {
        west: normalizeTrainRemRowsForPreset(parsed?.rows?.west, "west", parsed?.selectedPreset?.west || "9am"),
        east: normalizeTrainRemRowsForPreset(parsed?.rows?.east, "east", parsed?.selectedPreset?.east || "9am"),
      },
      fullMlTidRows: normalizeFullMlTidRows(parsed?.fullMlTidRows),
      fullMlTidAutoClear: normalizeFullMlTidAutoClearMeta(parsed?.fullMlTidAutoClear),
      updatedAt: (parsed?.updatedAt || parsed?.updated_date || parsed?.updatedDate || "").toString(),
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

function buildTrainRemDepotPayload(state = {}, depot = "west") {
  const safeDepot = depot === "east" ? "east" : "west";
  const autoClearMeta = normalizeFullMlTidAutoClearMeta(state.fullMlTidAutoClear);

  return {
    depot: safeDepot,
    key: safeDepot,
    selectedPreset: state.selectedPreset?.[safeDepot] || "9am",
    rows: normalizeTrainRemRowsForPreset(state.rows?.[safeDepot], safeDepot, state.selectedPreset?.[safeDepot] || "9am"),
    fullMlTidRows: normalizeFullMlTidRows(state.fullMlTidRows),
    fullMlTidAutoClear: autoClearMeta,
    fullMlTidAutoClearSignature: autoClearMeta.signature,
    fullMlTidAutoClearEndsAt: autoClearMeta.endsAt || null,
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
}

function buildTrainRemStateFromRecords(records = []) {
  const fallback = buildDefaultTrainRemState();
  const map = {};
  const state = {
    selectedPreset: { ...fallback.selectedPreset },
    rows: { ...fallback.rows },
    fullMlTidRows: emptyFullMlTidRows(),
    fullMlTidAutoClear: emptyFullMlTidAutoClearMeta(),
    updatedAt: "",
  };

  const latestByDepot = getLatestTrainRemRecordsByDepot(records);
  const selectedRecords = [latestByDepot.west, latestByDepot.east].filter(Boolean);

  selectedRecords.forEach((rec) => {
    const depot = rec?.depot === "east" ? "east" : rec?.depot === "west" ? "west" : null;
    if (!depot) return;

    if (rec.id) map[depot] = rec.id;

    state.selectedPreset[depot] = rec.selectedPreset || fallback.selectedPreset[depot];
    state.rows[depot] = normalizeTrainRemRowsForPreset(rec.rows, depot, state.selectedPreset[depot]);

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

    const recordUpdatedAt = (rec?.updatedAt || rec?.updated_date || rec?.updatedDate || "").toString();
    if (getTrainRemTimestampValue(recordUpdatedAt) >= getTrainRemStateTimestamp(state)) {
      state.updatedAt = recordUpdatedAt;
    }
  });

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
      west: (source?.completedByNames?.west || source?.completedByWest || "").toString(),
      east: (source?.completedByNames?.east || source?.completedByEast || "").toString(),
    },
    updatedAt: (source?.updatedAt || source?.updated_date || source?.updatedDate || source?.createdAt || source?.created_date || "").toString(),
  };
}

function getPSTLiveRecordUpdatedMs(record = {}) {
  const normalized = normalizePSTLiveState(record);
  return Date.parse(normalized.updatedAt || "") || 0;
}

function selectPSTLiveRecord(records = []) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!list.length) return null;

  const preferredRecords = list.filter((item) => (
    item?.stateKey === PST_LIVE_RECORD_KEY ||
    item?.recordKey === PST_LIVE_RECORD_KEY ||
    item?.key === PST_LIVE_RECORD_KEY
  ));

  const candidates = preferredRecords.length ? preferredRecords : list;
  return [...candidates].sort((a, b) => getPSTLiveRecordUpdatedMs(b) - getPSTLiveRecordUpdatedMs(a))[0] || null;
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

function savePSTState(pstState, prepState, logLines, taNameState, completedByNames = { west: "", east: "" }, updatedAt = new Date().toISOString()) {
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
        updatedAt,
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

function cleanRequestLabel(value = "") {
  return value.toString().trim().replace(/\s+/g, " ");
}

function normalizeRequestIdentity(value = "") {
  return cleanRequestLabel(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .join(" ");
}

const TOMORROW_REQUEST_TOKENS = new Set(["TOM", "TMR", "TMRW", "TOMORROW"]);

function hasTomorrowRequestToken(value = "") {
  const normalized = normalizeRequestIdentity(value);
  if (!normalized) return false;

  return normalized
    .split(" ")
    .filter(Boolean)
    .some((token) => TOMORROW_REQUEST_TOKENS.has(token));
}

function isWorkshopRequestLabel(value = "") {
  const normalized = normalizeRequestIdentity(value);

  return normalized.includes("WORKSHOP") && !hasTomorrowRequestToken(normalized);
}


function padTrainId(trainId) {
  // Always format as T## — ensure minimum 2-digit number (T1→T01, T9→T09, T10→T10)
  if (!trainId) return trainId;
  return trainId.replace(/^T(\d+)$/, (_, n) => `T${n.padStart(2, "0")}`);
}

function formatTrainNumberOnly(trainId) {
  const trainKey = padTrainId(normalizeTrainId(trainId));
  const match = trainKey.match(/^T(\d+)$/);
  return match ? match[1].padStart(2, "0") : trainKey.replace(/^T/i, "");
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

function normalizeStablingBlocks(blocks = []) {
  const source = Array.isArray(blocks) ? blocks : [];
  return Array.from({ length: NUM_BLOCKS }, (_, index) => ({
    trainId: source[index]?.trainId || "",
    extraRemark: source[index]?.extraRemark || "",
  }));
}

function normalizeStablingDepotData(data = {}, roads = []) {
  const normalized = initRoads(roads);
  roads.forEach((road) => {
    normalized[road] = normalizeStablingBlocks(data?.[road]);
  });
  return normalized;
}

function hasAnyStablingTrain(data = {}, roads = []) {
  return roads.some((road) => (data?.[road] || []).some((block) => normalizeTrainId(block?.trainId || "")));
}

function getStablingRecordsUpdatedMs(records = []) {
  return (records || []).reduce((latest, rec) => {
    const ms = Date.parse(rec?.updatedAt || rec?.updated_date || rec?.createdAt || rec?.created_date || "");
    return Number.isFinite(ms) ? Math.max(latest, ms) : latest;
  }, 0);
}

function loadLocalStablingState() {
  const fallback = { westData: initRoads(WEST_ROADS), eastData: initRoads(EAST_ROADS), updatedAt: "", updatedMs: 0 };
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(LOCAL_STABLING_STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const updatedAt = parsed?.updatedAt || "";
    const updatedMs = Date.parse(updatedAt || "") || 0;
    return {
      westData: normalizeStablingDepotData(parsed?.westData || parsed?.west || {}, WEST_ROADS),
      eastData: normalizeStablingDepotData(parsed?.eastData || parsed?.east || {}, EAST_ROADS),
      updatedAt,
      updatedMs,
    };
  } catch {
    return fallback;
  }
}

function saveLocalStablingState(westData = {}, eastData = {}, updatedAt = new Date().toISOString()) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LOCAL_STABLING_STATE_KEY, JSON.stringify({
      westData: normalizeStablingDepotData(westData, WEST_ROADS),
      eastData: normalizeStablingDepotData(eastData, EAST_ROADS),
      updatedAt,
    }));
  } catch {}
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

function getKnownMaintenanceStyle(label = "") {
  const clean = cleanRequestLabel(label);
  if (MAINT_STYLES[clean]) return MAINT_STYLES[clean];

  const normalized = normalizeRequestIdentity(clean);
  if (normalized.split(" ").includes("WASH")) return MAINT_STYLES.WASH;

  return null;
}

function buildMaintenanceMap(requests, mainStablingKeys = new Set()) {
  const map = {};
  const workshopTrainKeys = new Set();

  (requests || []).forEach((req) => {
    const key = normalizeTrainId(req.trainId);
    if (!key) return;

    const displayType = cleanRequestLabel(
      req.requestType === "Other"
        ? req.customType || "Other"
        : req.requestType || "Request"
    ) || "Request";

    if (isWorkshopRequestLabel(displayType)) {
      workshopTrainKeys.add(key);
    }
  });

  (requests || []).forEach((req) => {
    const key = normalizeTrainId(req.trainId);
    if (!key) return;

    const displayType = cleanRequestLabel(
      req.requestType === "Other"
        ? req.customType || "Other"
        : req.requestType || "Request"
    ) || "Request";
    const typeKey = displayType;
    const isWorkshop = isWorkshopRequestLabel(displayType);
    const isSuppressedByWorkshop = workshopTrainKeys.has(key) && !isWorkshop;
    const isSuppressedByStabling = mainStablingKeys.has(key);
    const suppressionReason = isSuppressedByStabling
      ? "STABLING"
      : isSuppressedByWorkshop
      ? "WORKSHOP"
      : "";

    const styles = getKnownMaintenanceStyle(typeKey) || getCustomRequestStyle(displayType);

    if (!map[key]) {
      map[key] = [];
    }

    map[key].push({
      typeKey,
      displayType,
      remark: "",
      badgeText: displayType,
      isWorkshop,
      isSuppressedByWorkshop,
      isSuppressedByStabling,
      isSuppressed: Boolean(suppressionReason),
      suppressionReason,
      ...styles,
    });
  });

  Object.keys(map).forEach((key) => {
    map[key].sort((a, b) => {
      if (a.isWorkshop !== b.isWorkshop) return a.isWorkshop ? -1 : 1;
      if (a.isSuppressed !== b.isSuppressed) return a.isSuppressed ? 1 : -1;
      return (a.displayType || "").localeCompare(b.displayType || "");
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
  "PM TOM": "#38bdf8",
  "TOM PM": "#38bdf8",
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

function getRequestPillStyle(item, options = {}) {
  const accent = getRequestAccent(item);
  const showSuppressedStyle = options.showSuppressedStyle !== false;

  return {
    backgroundColor: hexToRgba(accent, 0.11),
    color: accent,
    border: `1px solid ${accent}`,
    boxShadow: `0 0 8px ${hexToRgba(accent, 0.24)}, inset 0 1px 0 rgba(255,255,255,0.05)`,
    ...(showSuppressedStyle && item?.isSuppressed
      ? {
          opacity: 0.5,
          textDecoration: "line-through",
          textDecorationColor: "#ef4444",
          textDecorationThickness: "1px",
        }
      : {}),
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

function PSTCell({ block, bi, road, labelSide, isLast, isFirstBlock, isLastBlock, maintenanceMap, pstState, prepState, onPSTTick, onPSTStartTimeChange, onPrepTick, onPrepCompletionTimeChange, taName, onTaNameChange }) {
  const val = block?.trainId || "";
  const key = normalizeTrainId(val);
  // PST / Train Prep section must not inherit Maintenance Request / Request Type colors.
  // Keep all normal train cells in one consistent colour; only PST / Prep status changes the colour.
  void maintenanceMap;
  const isWestBottomRightCorner = labelSide === "left" && isLast && isLastBlock;
  const isEastBottomLeftCorner = labelSide === "right" && isLast && isFirstBlock;
  let trainColor = "#e2eaf4";
  const cellKey = `${road}-${bi}`;
  const rawPst = pstState[cellKey];
  const rawPrep = prepState[cellKey];
  const pstMatchesTrain = key && (!rawPst?.trainKey || normalizeTrainId(rawPst.trainKey) === key);
  const prepMatchesTrain = key && (!rawPrep?.trainKey || normalizeTrainId(rawPrep.trainKey) === key);
  const pst = pstMatchesTrain ? rawPst : null;
  const prep = prepMatchesTrain ? rawPrep : null;
  const isPstDone = pst?.done;
  // PST click cycle: PST -> ⏳PST -> ✓ PST -> reset.
  // First click keeps PST in-progress but already creates the default No Alarm log.
  const isPstConfirming = Boolean(pst?.confirming && !pst?.done);
  const pstEstimateTime = (isPstDone || isPstConfirming) ? (pst?.endTime || "") : "";
  const pstStartTime = (isPstDone || isPstConfirming) ? (pst?.startTime || "") : "";
  const isPrepStarted = false;
  const isPrepDone = prep?.done;
  if (isPstDone) { trainColor = "#4ade80"; }
  else if (isPstConfirming) { trainColor = "#facc15"; }
  else if (isPrepDone) { trainColor = "#93c5fd"; }
  const displayVal = key ? key.replace(/^T/, "") : "";
  const pstCardBg = isPstDone
    ? "linear-gradient(135deg,#0d2b1e,#082015)"
    : isPstConfirming
    ? "linear-gradient(135deg,#1f2b0d,#082015)"
    : isPrepDone
    ? "linear-gradient(135deg,#0d1f2e,#081525)"
    : isPrepStarted
    ? "linear-gradient(135deg,#1f1c0a,#151205)"
    : key
    ? "linear-gradient(135deg,#0f2d4a,#081e32)"
    : "none";
  const pstCardBorder = isPstDone ? "1px solid #059669" : isPstConfirming ? "1px solid #ca8a04" : isPrepDone ? "1px solid #3b82f6" : isPrepStarted ? "1px solid #ca8a04" : key ? "1px solid #1e4d72" : "1.5px dashed #1b3a55";
  const pstRowLine = isLast ? "1px solid #1a3a56" : "2px solid #1a3a56";
  return (
    <td className="p-1.5 align-top" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: pstRowLine, borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined, borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined }}>
      <div className="relative flex flex-col items-center justify-start gap-1 rounded-xl" style={{ minHeight: isPrepDone ? 156 : (isPstDone || isPstConfirming) ? 128 : pstEstimateTime ? 102 : 90, padding: "7px 5px", background: pstCardBg, border: pstCardBorder, boxShadow: key ? "0 2px 8px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05)" : undefined }}>
        {key && (
          <div className="absolute top-1 right-1.5 opacity-20 pointer-events-none">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={trainColor} strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>
          </div>
        )}
        <div className="w-full text-center font-black leading-none" style={{ fontSize: key ? 15 : 12, color: key ? trainColor : "#2a4a64", letterSpacing: key ? "0.05em" : undefined }}>
          {displayVal || "—"}
        </div>
        {/* PST / Train Prep cells intentionally hide Maintenance Request type / remark pills. */}
        {key && pstEstimateTime && (
          <span
            className="rounded-full border border-red-500/80 bg-red-950/55 px-1.5 py-0.5 text-[9px] font-normal tracking-wide text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.34)] whitespace-nowrap"
            title={`PST completed at ${pstEstimateTime} hrs`}
          >
            {pstEstimateTime}
          </span>
        )}
        {key && (isPstDone || isPstConfirming) && (
          <div className={`w-full rounded-lg border px-1 py-1 ${isPstConfirming ? "border-amber-500/60 bg-amber-950/25" : "border-emerald-500/60 bg-emerald-950/30"}`}>
            <div className={`mb-0.5 text-center text-[8px] font-black uppercase tracking-wide ${isPstConfirming ? "text-amber-300" : "text-emerald-300"}`}>PST Time</div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={pstStartTime}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                const value = String(pstStartTime || "");
                const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
                if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                  e.preventDefault();
                  onPSTStartTimeChange?.(road, bi, key, value.slice(0, -2));
                }
              }}
              onChange={(e) => onPSTStartTimeChange?.(road, bi, key, cleanMovementCustomTimeInput(e.target.value))}
              onBlur={(e) => onPSTStartTimeChange?.(road, bi, key, normalizeMovementCustomTimeInput(e.target.value))}
              placeholder="00:00"
              className={`w-full rounded-md border bg-[#071828] px-1 py-0.5 text-center text-[10px] font-normal leading-tight outline-none ${isPstConfirming ? "border-amber-500/50 text-amber-100 placeholder:text-amber-700 focus:border-amber-300" : "border-emerald-500/50 text-emerald-100 placeholder:text-emerald-700 focus:border-emerald-300"}`}
              title="Edit PST start time. Completion time updates automatically +6 minutes."
            />
          </div>
        )}
        {key && (
          <div className="flex flex-col gap-1 w-full mt-1">
            <button onClick={() => onPSTTick(road, bi, key)} className={`w-full text-[9px] font-bold rounded-lg px-1 py-0.5 border transition-all leading-tight ${isPstDone ? "bg-emerald-900/60 border-emerald-600 text-emerald-300" : isPstConfirming ? "bg-amber-900/60 border-amber-600 text-amber-300" : "bg-[#0a1e2e] border-[#1e4060] text-[#5a7a9a] hover:border-blue-500 hover:text-blue-300"}`}>
              {isPstDone ? "✓ PST" : isPstConfirming ? "⏳PST" : "PST"}
            </button>
            {isPrepDone && (
              <div className="w-full rounded-lg border border-blue-500/60 bg-blue-950/30 px-1 py-1">
                <div className="mb-0.5 text-center text-[8px] font-black uppercase tracking-wide text-blue-300">Completion</div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={prep?.endTime || prep?.time || ""}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    const value = String(prep?.endTime || prep?.time || "");
                    const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
                    if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                      e.preventDefault();
                      onPrepCompletionTimeChange?.(road, bi, key, value.slice(0, -2));
                    }
                  }}
                  onChange={(e) => onPrepCompletionTimeChange?.(road, bi, key, cleanMovementCustomTimeInput(e.target.value))}
                  onBlur={(e) => onPrepCompletionTimeChange?.(road, bi, key, normalizeMovementCustomTimeInput(e.target.value))}
                  placeholder="00:00"
                  className="w-full rounded-md border border-blue-500/50 bg-[#071828] px-1 py-0.5 text-center text-[10px] font-normal leading-tight text-blue-100 outline-none placeholder:text-blue-700 focus:border-blue-300"
                  title="Edit Train Prep completion time"
                />
              </div>
            )}
            {!isPrepDone && (
              <input value={taName} onChange={(e) => onTaNameChange(road, bi, e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="TA name (optional)" className="w-full text-[11px] rounded-lg border border-blue-600/60 bg-blue-950/30 px-1 py-0.5 outline-none text-blue-200 placeholder:text-blue-700" />
            )}
            <button onClick={() => onPrepTick(road, bi, key, taName)} className={`w-full text-[9px] font-bold rounded-lg px-1 py-0.5 border transition-all leading-tight ${isPrepDone ? "bg-blue-900/60 border-blue-500 text-blue-200" : "bg-[#0a1e2e] border-[#1e4060] text-[#5a7a9a] hover:border-indigo-500 hover:text-indigo-300"}`}>
              {isPrepDone ? "✓ Prep" : "Train Prep"}
            </button>
          </div>
        )}
      </div>
    </td>
  );
}

function PSTStablingSection({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap, pstState, prepState, onPSTTick, onPSTStartTimeChange, onPrepTick, onPrepCompletionTimeChange, taNameState, onTaNameChange, onClearPST, onClearPrep }) {
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
                    <PSTCell key={bi} block={data[road]?.[bi]} bi={bi} road={road} labelSide={labelSide} isLast={ri === roads.length - 1} isFirstBlock={i === 0} isLastBlock={i === blockIndices.length - 1} maintenanceMap={maintenanceMap} pstState={pstState} prepState={prepState} onPSTTick={onPSTTick} onPSTStartTimeChange={onPSTStartTimeChange} onPrepTick={onPrepTick} onPrepCompletionTimeChange={onPrepCompletionTimeChange} taName={taNameState[`${road}-${bi}`] || ""} onTaNameChange={onTaNameChange} />
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

function normalizePSTEntryType(entry = {}) {
  return (entry?.type || entry?.logType || entry?.category || "").toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isPSTLogEntry(entry = {}) {
  const normalizedType = normalizePSTEntryType(entry);
  const text = (entry?.text || "").toString();
  return normalizedType === "pst" || /\bPST\b/i.test(text);
}

function isTrainPrepLogEntry(entry = {}) {
  const normalizedType = normalizePSTEntryType(entry);
  const text = (entry?.text || "").toString();
  return (
    normalizedType === "prep" ||
    normalizedType === "trainprep" ||
    normalizedType === "trainpreparation" ||
    /train\s+prep(?:aration)?/i.test(text)
  );
}

function formatTrainList(trainKeys) {
  if (trainKeys.length === 0) return "";
  if (trainKeys.length === 1) return trainKeys[0];
  return trainKeys.slice(0, -1).join(", ") + " and " + trainKeys[trainKeys.length - 1];
}

function getPSTLogTimeMinutes(entry = {}) {
  const rawTime = (entry.startTime || entry.time || entry.endTime || "").toString().trim();
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

const INSERTION_ASSIST_REMARK_STYLES = {
  "Early Rem": {
    // Match the TID Reference Table colour transparency.
    // Table row uses 20% fading to 7%; pill fill uses 17%.
    bg: "rgba(34, 197, 94, 0.17)",
    cardBg: "linear-gradient(135deg, rgba(34, 197, 94, 0.20) 0%, rgba(34, 197, 94, 0.07) 100%)",
    border: "#22c55e",
    color: "#bbf7d0",
    shadow: "0 0 12px rgba(34, 197, 94, 0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  "Late Rem": {
    // Match the TID Reference Table colour transparency.
    // Table row uses 20% fading to 7%; pill fill uses 17%.
    bg: "rgba(250, 204, 21, 0.17)",
    cardBg: "linear-gradient(135deg, rgba(250, 204, 21, 0.20) 0%, rgba(250, 204, 21, 0.07) 100%)",
    border: "#facc15",
    color: "#fde68a",
    shadow: "0 0 12px rgba(250, 204, 21, 0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  "ED (7pm)": {
    // Match the TID Reference Table colour transparency.
    // Table row uses 20% fading to 7%; pill fill uses 18%.
    bg: "rgba(244, 114, 182, 0.18)",
    cardBg: "linear-gradient(135deg, rgba(244, 114, 182, 0.20) 0%, rgba(244, 114, 182, 0.07) 100%)",
    border: "#f472b6",
    color: "#fbcfe8",
    shadow: "0 0 12px rgba(244, 114, 182, 0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  ED: {
    // Match the TID Reference Table colour transparency.
    // Table row uses 20% fading to 7%; pill fill uses 18%.
    bg: "rgba(248, 113, 113, 0.18)",
    cardBg: "linear-gradient(135deg, rgba(248, 113, 113, 0.20) 0%, rgba(248, 113, 113, 0.07) 100%)",
    border: "#f87171",
    color: "#fecaca",
    shadow: "0 0 12px rgba(248, 113, 113, 0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
};

const WEEKDAY_INSERTION_ASSIST_REMARKS = {
  west: {
    101: "Late Rem", 102: "Early Rem", 103: "Late Rem", 104: "Early Rem", 105: "Late Rem",
    106: "Early Rem", 107: "Late Rem", 108: "Early Rem", 109: "Late Rem", 110: "Early Rem",
    111: "Late Rem", 112: "ED", 113: "Late Rem", 114: "ED", 115: "Late Rem",
    116: "ED", 117: "Late Rem", 118: "ED", 119: "Late Rem", 120: "ED",
  },
  east: {
    201: "Late Rem", 202: "ED", 203: "Late Rem", 204: "ED", 205: "Late Rem",
    206: "ED", 207: "ED (7pm)", 208: "ED", 209: "ED (7pm)", 210: "ED",
    211: "ED (7pm)", 212: "Early Rem", 213: "Late Rem", 214: "Early Rem", 215: "Late Rem",
    216: "Early Rem", 217: "Late Rem", 218: "Early Rem", 219: "Late Rem", 220: "Early Rem",
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

function normalizeInsertionAssistRemark(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (/^early\s*rem$/i.test(text)) return "Early Rem";
  if (/^late\s*rem$/i.test(text)) return "Late Rem";
  if (/^ed\s*\(\s*7\s*pm\s*\)$/i.test(text)) return "ED (7pm)";
  if (/^ed$/i.test(text)) return "ED";
  return "";
}

function getInsertionAssistRemarkStyle(remark = "") {
  const normalized = normalizeInsertionAssistRemark(remark);
  return normalized ? INSERTION_ASSIST_REMARK_STYLES[normalized] || null : null;
}

function getBuiltinInsertionAssistRemark(dayKey = "weekday", depot = "west", tid = "") {
  if (normalizeTimetableType(dayKey) !== "weekday") return "";
  const depotKey = normalizeDepotKey(depot);
  const cleanTid = Number(String(tid || "").replace(/\D/g, ""));
  return WEEKDAY_INSERTION_ASSIST_REMARKS[depotKey]?.[cleanTid] || "";
}

function getTimetableInsertionRemarkMap(activeTimetable = null, depot = "west") {
  const parsed = getActiveTimetableParsedData(activeTimetable);
  const depotKey = normalizeDepotKey(depot);
  const entries = Array.isArray(parsed?.insertion?.[depotKey]?.entries)
    ? parsed.insertion[depotKey].entries
    : [];

  return entries.reduce((map, entry) => {
    const tid = Number(normalizeTidValue(entry?.tid));
    if (!tid) return map;

    const remark = normalizeInsertionAssistRemark(entry?.assistRemark || entry?.displayRemark || entry?.remark);
    if (remark) map[tid] = remark;
    return map;
  }, {});
}

function getInsertionRemarkStyle(value) {
  const key = (value || "").toString().trim().toUpperCase();

  // Keep 3K1 / SW / 2W colours active every day.
  if (INSERTION_REMARK_STYLES[key]) return INSERTION_REMARK_STYLES[key];

  // Allow manual text such as Early Rem, Late Rem, ED, and ED (7pm)
  // to use the same colours as the assist table pill.
  const assistStyle = getInsertionAssistRemarkStyle(value);
  if (assistStyle) return assistStyle;

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

function getActiveInsertionEntryForCell(insertionLog = [], road, bi, trainKey = "") {
  const normalizedTrainKey = normalizeTrainId(trainKey);
  if (!normalizedTrainKey) return null;

  const cellKey = `${road}-${bi}`;
  const entry = insertionLog.find((l) => l.key === `ins-${cellKey}`);
  if (!entry) return null;

  // Prevent stale insertion status from staying green after the train is
  // removed from the stabling cell, or after another train replaces it.
  const entryTrainKey = normalizeTrainId(entry.trainKey || "");
  if (entryTrainKey && entryTrainKey !== normalizedTrainKey) return null;

  return entry;
}

function InsertionCell({ block, bi, road, labelSide, isLast, isFirstBlock, isLastBlock, maintenanceMap, insertionLog, onInsertionTick, tidInput, onTidChange, onTidKeyDown, onTidFocus, tidInputRef, hideElapsedTid, getTidScheduledTime, getTidAssistRemarkStyle, stablingEditable = false, onEditableTrainIdChange }) {
  const val = block?.trainId || "";
  const key = normalizeTrainId(val);
  const maintList = key ? maintenanceMap[key] || [] : [];
  const primaryMaint = maintList[0] || null;
  const isWestBottomRightCorner = labelSide === "left" && isLast && isLastBlock;
  const isEastBottomLeftCorner = labelSide === "right" && isLast && isFirstBlock;
  const cellKey = `${road}-${bi}`;
  const inserted = getActiveInsertionEntryForCell(insertionLog, road, bi, key);
  const insertedRemarkLabel = inserted?.tid
    ? `TID ${inserted.tid}`
    : inserted?.remark
    ? `${inserted.remark}${inserted.sweepTrack ? ` ${inserted.sweepTrack}` : ""}`
    : "";
  const tidRemarkText = (tidInput || "").toString().trim().toUpperCase();
  const [showSweepChoice, setShowSweepChoice] = useState(false);
  const hasTidRemark = key && !inserted && tidRemarkText !== "";
  const autoTidMatch = tidRemarkText.match(/^(?:TID[:\s-]*)?T?(\d{3})$/i);
  const autoTid = autoTidMatch ? parseInt(autoTidMatch[1], 10) : null;
  const autoTidDepot = WEST_ROADS.includes(road) ? "west" : "east";
  const specialTidRemarkStyle = hasTidRemark
    ? (typeof getTidAssistRemarkStyle === "function" ? getTidAssistRemarkStyle(tidRemarkText, autoTidDepot) : null) || getInsertionRemarkStyle(tidRemarkText)
    : null;
  const insertedTid = inserted?.tid !== null && inserted?.tid !== undefined
    ? parseInt(String(inserted.tid).replace(/\D/g, ""), 10)
    : null;
  const insertedTidRemarkStyle = insertedTid && typeof getTidAssistRemarkStyle === "function"
    ? getTidAssistRemarkStyle(insertedTid, autoTidDepot)
    : null;
  const activeTidRemarkStyle = inserted ? insertedTidRemarkStyle : specialTidRemarkStyle;
  const insertedScheduledTime = insertedTid && typeof getTidScheduledTime === "function"
    ? getTidScheduledTime(insertedTid, autoTidDepot, { allowFallback: false })
    : null;
  const insertedDisplayTime = insertedScheduledTime || inserted?.time || "";
  const autoScheduledTime = autoTid !== null && typeof getTidScheduledTime === "function"
    ? getTidScheduledTime(autoTid, autoTidDepot, { allowFallback: false })
    : null;
  const isNumericTidRemark = autoTid !== null;
  const canAutoInsertTid = Boolean(key && !inserted && autoTid !== null && autoScheduledTime);

  useEffect(() => {
    if (tidRemarkText !== "SW" || inserted) setShowSweepChoice(false);
  }, [tidRemarkText, inserted]);

  useEffect(() => {
    if (!canAutoInsertTid) return;
    setShowSweepChoice(false);
    onInsertionTick(road, bi, key, tidInput);
  }, [canAutoInsertTid, road, bi, key, tidInput, onInsertionTick]);

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

  const handleInsertedUndoClick = () => {
    onTidChange?.(road, bi, "");
    setShowSweepChoice(false);
    onInsertionTick(road, bi, key, tidInput);
  };

  // Elapsed inserted trains are hidden only after user clicks "Hide elapsed TID".
  const expired = Boolean(hideElapsedTid && inserted && isTimePast(inserted.time));

  const requestAccent = primaryMaint ? getRequestAccent(primaryMaint) : "#4f8ef7";
  let trainColor = "#e2eaf4";
  if (expired) { trainColor = "#3a5068"; }
  else if (activeTidRemarkStyle) { trainColor = activeTidRemarkStyle.color; }
  else if (inserted) { trainColor = "#4ade80"; }
  else if (hasTidRemark) { trainColor = "#facc15"; }

  const displayVal = key ? key.replace(/^T/, "") : "";

  // Maintenance/request remarks already show their own coloured pill.
  // Keep the stabling card border/background neutral so the pill is the only request colour.
  const insCardBg = expired
    ? "linear-gradient(135deg,#071218,#050d14)"
    : activeTidRemarkStyle?.cardBg || activeTidRemarkStyle?.bg
      ? activeTidRemarkStyle.cardBg || activeTidRemarkStyle.bg
      : inserted
        ? "linear-gradient(135deg,#0d2b1e,#082015)"
        : hasTidRemark
          ? "linear-gradient(135deg,#1f1c0a,#151205)"
          : key
            ? "linear-gradient(135deg,#0f2d4a,#081e32)"
            : "none";
  const insCardBorder = expired
    ? "1px solid #1a3040"
    : activeTidRemarkStyle
      ? `1.5px solid ${activeTidRemarkStyle.border}`
      : inserted
        ? "1.5px solid #059669"
        : hasTidRemark
          ? "1.5px solid #ca8a04"
          : key
            ? "1px solid #1e4d72"
            : "1.5px dashed #1b3a55";
  const insCardGlow = activeTidRemarkStyle && !expired
    ? activeTidRemarkStyle.shadow
    : key && !expired
    ? "0 2px 8px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.06)"
    : undefined;
  const insTidInputStyle = {
    border: specialTidRemarkStyle ? `1px solid ${specialTidRemarkStyle.border}` : hasTidRemark ? "1px solid #ca8a04" : "1px solid #1e4060",
    backgroundColor: specialTidRemarkStyle ? specialTidRemarkStyle.bg : hasTidRemark ? "#1f1c0a" : "#091828",
    color: specialTidRemarkStyle ? specialTidRemarkStyle.color : hasTidRemark ? "#fde68a" : "#c8d8ea",
    boxShadow: specialTidRemarkStyle ? specialTidRemarkStyle.shadow : undefined,
  };
  const insRowLine = isLast ? "1px solid #1a3a56" : "2px solid #1a3a56";

  if (expired) {
    return (
      <td className="p-1.5 align-middle" title="Elapsed TID hidden manually" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: insRowLine, borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined, borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined }}>
        <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl select-none" style={{ minHeight: 82, padding: "6px 4px", background: insCardBg, border: insCardBorder, opacity: 0.55 }}>
          <div className="w-full text-center font-black leading-none" style={{ fontSize: 14, color: "#3a5068" }}>{displayVal || "—"}</div>
          {insertedRemarkLabel && <span className="text-[10px] font-semibold" style={{ color: "#3a5068" }}>{insertedRemarkLabel}</span>}
          <span className="text-[9px] font-semibold" style={{ color: "#3a5068" }}>✓ {insertedDisplayTime}</span>
          <span className="text-[8px] tracking-wide uppercase" style={{ color: "#1e3a52" }}>elapsed hidden</span>
        </div>
      </td>
    );
  }

  return (
    <td className="p-1.5 align-middle" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom: insRowLine, borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined, borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined }}>
      <div className="relative flex flex-col items-center justify-start gap-1 rounded-xl" style={{ minHeight: showSweepChoice ? 118 : 82, padding: "6px 4px", background: insCardBg, border: insCardBorder, boxShadow: insCardGlow }}>
        {key && !inserted && (
          <div className="absolute top-1 right-1.5 opacity-20 pointer-events-none">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={trainColor} strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>
          </div>
        )}
        {stablingEditable ? (
          <input
            type="text"
            value={val}
            onChange={(e) => onEditableTrainIdChange?.(road, bi, e.target.value)}
            placeholder="Train ID"
            className="w-full h-6 rounded-lg border px-1 text-center text-[13px] font-black uppercase outline-none placeholder:text-[#2b4f6b]"
            style={{
              borderColor: key ? "#1e4d72" : "#1a3a56",
              backgroundColor: key ? "#081e32" : "#071828",
              color: key ? trainColor : "#4a6f8c",
              letterSpacing: key ? "0.05em" : undefined,
            }}
          />
        ) : (
          <div className="w-full text-center font-black leading-none" style={{ fontSize: key ? 15 : 12, color: key ? trainColor : "#2a4a64", letterSpacing: key ? "0.05em" : undefined }}>{displayVal || "—"}</div>
        )}
        {maintList.map((item) => (
          <span
            key={`${item.displayType}-${item.badgeText || ""}`}
            className="inline-flex min-w-[92px] w-fit max-w-full items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-normal leading-none whitespace-nowrap text-center"
            style={getRequestPillStyle(item, { showSuppressedStyle: false })}
            title={item.badgeText || item.displayType}
          >
            {item.badgeText || item.displayType}
          </span>
        ))}
        {key && !inserted && (<input ref={tidInputRef} type="text" value={tidInput} onChange={(e) => onTidChange(road, bi, e.target.value)} onKeyDown={onTidKeyDown} onFocus={onTidFocus} onPointerDown={onTidFocus} placeholder="TID" className="w-full h-6 px-1 text-center text-[12px] font-semibold rounded-lg outline-none placeholder:text-[#2b4f6b]" style={insTidInputStyle} />)}
        {key && inserted && insertedRemarkLabel && (
          <span
            className="text-[12px] font-bold"
            style={{ color: activeTidRemarkStyle?.color || "#4ade80" }}
          >
            {insertedRemarkLabel}
          </span>
        )}
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
        {key && !inserted && !showSweepChoice && isNumericTidRemark && !autoScheduledTime && (
          <div className="w-full rounded-lg border border-amber-700/60 bg-amber-950/35 px-1 py-1 text-center text-[9px] font-bold leading-tight text-amber-300" title="This TID is not available in today's insertion schedule">
            No TID time
          </div>
        )}
        {key && !inserted && !showSweepChoice && !isNumericTidRemark && (<button onClick={handleInsertClick} className={`w-full text-[12px] font-bold rounded-lg px-1 py-0.5 border transition-all ${hasTidRemark ? "bg-yellow-950/50 border-yellow-600/60 text-yellow-300 hover:bg-emerald-900/40 hover:border-emerald-600 hover:text-emerald-300" : "bg-[#0a1e2e] border-[#1e4060] text-[#5a7a9a] hover:bg-emerald-900/40 hover:border-emerald-600 hover:text-emerald-300"}`}>{hasTidRemark ? "Insert Remark" : "Insert"}</button>)}
        {key && inserted && (
          <button
            onClick={handleInsertedUndoClick}
            className="w-full text-[12px] font-bold rounded-lg px-1 py-0.5 border transition-all hover:bg-red-950/40 hover:border-red-700 hover:text-red-400"
            style={activeTidRemarkStyle ? {
              backgroundColor: activeTidRemarkStyle.bg,
              borderColor: activeTidRemarkStyle.border,
              color: activeTidRemarkStyle.color,
            } : {
              backgroundColor: "rgba(6, 78, 59, 0.5)",
              borderColor: "#059669",
              color: "#6ee7b7",
            }}
            title="Click to undo"
          >
            ✓ {insertedDisplayTime}
          </button>
        )}
      </div>
    </td>
  );
}

function InsertionStablingSection({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap, insertionLog, onInsertionTick, tidInputs, onTidChange, onClearInsertedTidRemarks, onClearInsertedTrains, getTidScheduledTime, getTidAssistRemarkStyle, stablingEditable = false, onEditableTrainIdChange }) {
  const [hideFiltered, setHideFiltered] = useState(false);
  const [hideElapsedTid, setHideElapsedTid] = useState(() => loadInsertionHideElapsedTid(title, roads));
  const [downloadingPng, setDownloadingPng] = useState(false);
  const HIDE_REMARKS = ["3K1", "SW", "2W"];

  useEffect(() => {
    saveInsertionHideElapsedTid(title, roads, hideElapsedTid);
  }, [title, roads, hideElapsedTid]);

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
  const tidAutoAdvanceRef = useRef(false);
  const tidAutoDirectionRef = useRef(null);

  const getTidAutoDirection = useCallback((colIdx) => {
    // Start from the visual right side = continue moving left.
    // Start from the visual left side = continue moving right.
    const middleCol = (blockIndices.length - 1) / 2;
    return colIdx > middleCol ? "left" : "right";
  }, [blockIndices.length]);

  const rememberTidStartDirection = useCallback((colIdx) => {
    if (tidAutoAdvanceRef.current) return;
    tidAutoDirectionRef.current = getTidAutoDirection(colIdx);
  }, [getTidAutoDirection]);

  const focusInsertionTid = useCallback((roadIdx, colIdx, options = {}) => {
    const el = tidRefs.current[`${roadIdx}-${colIdx}`];
    if (!el) return;

    if (options.autoAdvance) tidAutoAdvanceRef.current = true;
    el.focus();
    el.select();

    if (options.autoAdvance) {
      setTimeout(() => {
        tidAutoAdvanceRef.current = false;
      }, 0);
    }
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

  const getNextTidAutoFocusTarget = useCallback((roadIdx, colIdx, direction) => {
    const totalRows = roads.length;
    const totalCols = blockIndices.length;
    const horizontalColIdx = direction === "left" ? colIdx - 1 : colIdx + 1;

    // Normal movement: continue across the same road.
    if (horizontalColIdx >= 0 && horizontalColIdx < totalCols) {
      return { roadIdx, colIdx: horizontalColIdx, direction };
    }

    // Row end reached at Block 1 / Block 7: move down to the next road,
    // then reverse direction so entry continues in a snake pattern.
    if (roadIdx < totalRows - 1) {
      return {
        roadIdx: roadIdx + 1,
        colIdx,
        direction: direction === "left" ? "right" : "left",
      };
    }

    return null;
  }, [roads.length, blockIndices.length]);

  const handleTidChange = (road, bi, value, roadIdx, colIdx) => {
    const cellKey = `${road}-${bi}`;
    const previousValue = (tidInputs[cellKey] || "").toString().trim();
    const nextValue = (value || "").toString().trim();

    onTidChange(road, bi, value);

    // Auto move only after a fresh 3-digit numeric TID remark is filled.
    // It moves horizontally first, then drops to the next road at Block 1 / Block 7.
    if (/^\d{3}$/.test(nextValue) && !/^\d{3}$/.test(previousValue)) {
      const direction = tidAutoDirectionRef.current || getTidAutoDirection(colIdx);
      const target = getNextTidAutoFocusTarget(roadIdx, colIdx, direction);

      if (target) {
        setTimeout(() => {
          tidAutoDirectionRef.current = target.direction;
          focusInsertionTid(target.roadIdx, target.colIdx, { autoAdvance: true });
        }, 0);
      }
    }
  };
  // Count elapsed inserted TIDs for the manual Hide elapsed TID button.
  const elapsedTidCount = roads.reduce((acc, road) => {
    return acc + blockIndices.filter((bi) => {
      const trainKey = normalizeTrainId(data[road]?.[bi]?.trainId || "");
      const entry = getActiveInsertionEntryForCell(insertionLog, road, bi, trainKey);
      return entry && isTimePast(entry.time);
    }).length;
  }, 0);
  const hasLiveTidRemarks = roads.some((road) =>
    blockIndices.some((bi) => (tidInputs[`${road}-${bi}`] || "").trim() !== "")
  );
  const hasInsertedTidRemarks = roads.some((road) =>
    blockIndices.some((bi) => {
      const trainKey = normalizeTrainId(data[road]?.[bi]?.trainId || "");
      const entry = getActiveInsertionEntryForCell(insertionLog, road, bi, trainKey);
      if (!entry) return false;
      return entry.tid !== null && entry.tid !== undefined || (entry.remark || "").toString().trim() !== "";
    })
  );
  const hasTidRemarks = hasLiveTidRemarks || hasInsertedTidRemarks;
  const hasInsertedTrains = roads.some((road) =>
    blockIndices.some((bi) => {
      const trainKey = normalizeTrainId(data[road]?.[bi]?.trainId || "");
      return Boolean(getActiveInsertionEntryForCell(insertionLog, road, bi, trainKey));
    })
  );
  const handleClearAllTid = () => {
    roads.forEach((road) => {
      blockIndices.forEach((bi) => {
        if ((tidInputs[`${road}-${bi}`] || "").trim() !== "") {
          onTidChange(road, bi, "");
        }
      });
    });

    // One action to clear both manual TID/remark inputs and inserted TID status/logs.
    onClearInsertedTidRemarks?.(roads, blockIndices);
    onClearInsertedTrains?.(roads, blockIndices);
    setHideElapsedTid(false);
  };
  const isFiltered = (block, road, bi) => {
    // Check live TID input typed by user
    const typed = (tidInputs[`${road}-${bi}`] || "").trim().toUpperCase();
    if (HIDE_REMARKS.some((r) => typed === r)) return true;
    // Check remark stored on the active insertion log entry for this cell.
    // Stale log entries are ignored when the train has already been removed
    // from the stabling cell.
    const trainKey = normalizeTrainId(block?.trainId || "");
    const logEntry = getActiveInsertionEntryForCell(insertionLog, road, bi, trainKey);
    const logRemark = (logEntry?.remark || "").trim().toUpperCase();
    if (HIDE_REMARKS.some((r) => logRemark === r)) return true;
    // Check stabling extraRemark
    const extraRemark = (block?.extraRemark || "").trim().toUpperCase();
    if (HIDE_REMARKS.some((r) => extraRemark === r)) return true;
    return false;
  };
  return (
    <section className="bg-[#0b1f33] border border-[#2b4f6b] rounded-2xl shadow-md px-5 py-4" style={{ width: "fit-content", maxWidth: "fit-content" }}>
      <SectionTitle
        title={title}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPng}
              disabled={downloadingPng}
              className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
              style={MAIN_STABLING_BUTTON_BLUE}
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
              className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
              style={hideFiltered ? MAIN_STABLING_BUTTON_PRIMARY : MAIN_STABLING_BUTTON_BLUE}
            >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {hideFiltered
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
          </svg>
          {hideFiltered ? "Show 3K1 / SW" : "Hide 3K1 / SW"}
        </button>
            <button
              onClick={handleClearAllTid}
              disabled={!hasTidRemarks && !hasInsertedTrains}
              className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
              style={MAIN_STABLING_BUTTON_DANGER}
              title="Clear all TID inputs, remarks and inserted TID status for this depot"
            >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
          </svg>
          Clear All TID
        </button>
            <button
              onClick={() => setHideElapsedTid((v) => !v)}
              disabled={elapsedTidCount === 0}
              className="group flex items-center gap-1.5 px-3.5 py-1.5 rounded-[14px] text-[10px] font-bold border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
              style={hideElapsedTid ? MAIN_STABLING_BUTTON_PRIMARY : MAIN_STABLING_BUTTON_BLUE}
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
        }
      />
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
                    const borderBottom = isLastRow ? "1px solid #1a3a56" : "2px solid #1a3a56";
                    const borderBottomRightRadius = labelSide === "left" && isLastRow && isLastBlock ? 12 : undefined;
                    const borderBottomLeftRadius = labelSide === "right" && isLastRow && i === 0 ? 12 : undefined;
                    if (hideFiltered && isFiltered(block, road, bi)) {
                      return (
                        <td key={bi} className="p-1.5 align-middle" style={{ backgroundColor: "#071828", borderLeft: "1px solid #1a3a56", borderRight: labelSide === "left" && isLastBlock ? "1px solid #1a3a56" : undefined, borderBottom, borderBottomRightRadius, borderBottomLeftRadius }}>
                          <div className="flex items-center justify-center rounded-xl" style={{ minHeight: 82, border: "1.5px dashed #1a3050" }}>
                            <span className="text-[9px] font-black text-[#2a4464] tracking-widest uppercase">{(block?.extraRemark || "").trim()}</span>
                          </div>
                        </td>
                      );
                    }
                    return <InsertionCell key={bi} block={block} bi={bi} road={road} labelSide={labelSide} isLast={isLastRow} isFirstBlock={i === 0} isLastBlock={isLastBlock} maintenanceMap={maintenanceMap} insertionLog={insertionLog} onInsertionTick={onInsertionTick} tidInput={tidInputs[`${road}-${bi}`] || ""} onTidChange={(targetRoad, targetBi, value) => handleTidChange(targetRoad, targetBi, value, ri, i)} onTidKeyDown={(e) => handleTidKeyDown(e, ri, i)} onTidFocus={() => rememberTidStartDirection(i)} tidInputRef={(el) => { tidRefs.current[`${ri}-${i}`] = el; }} hideElapsedTid={hideElapsedTid} getTidScheduledTime={getTidScheduledTime} getTidAssistRemarkStyle={getTidAssistRemarkStyle} stablingEditable={stablingEditable} onEditableTrainIdChange={onEditableTrainIdChange} />;
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




function TrainRemPanel({ maintenanceMap = {}, onTrainRemStateChange, eastStablingData = {}, requests = [], westData = {}, eastData = {}, activeTimetable = null, activeTimetableType = "weekday" }) {
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
  const [eastDepotCopyStatus, setEastDepotCopyStatus] = useState("");

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
  const trainRemSaveRevisionRef = useRef(0);
  const trainRemEditingRef = useRef(false);
  const trainRemPollingRef = useRef(false);
  const trainRemTrainIdRefs = useRef({});
  const fullMlTidTrainIdRefs = useRef({});
  const trainRemUndoStackRef = useRef([]);
  const trainRemSmartDirectionRef = useRef({});
  const trainRemLastFocusedIndexRef = useRef({});
  const trainRemFocusedTrainIdCellRef = useRef(null);
  const eastDepotCopyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (eastDepotCopyTimerRef.current) clearTimeout(eastDepotCopyTimerRef.current);
    };
  }, []);

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
    return getTrainRemPresetConfig(depot, presetLabel, activeTimetable).timeMap?.[cleanTid] || "";
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
      const records = await entity.list("-updated_date");

      if (!records || records.length === 0) {
        const state = stampTrainRemState(loadTrainRemState());
        const map = {};

        for (const depot of ["west", "east"]) {
          const created = await entity.create(buildTrainRemDepotPayload(stampTrainRemState(state), depot));
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
      const localState = loadTrainRemState();
      const localAutoClearMeta = normalizeFullMlTidAutoClearMeta(localState.fullMlTidAutoClear);

      if (!dbAutoClearMeta.signature && localAutoClearMeta.signature && localAutoClearMeta.endsAt) {
        state.fullMlTidAutoClear = localAutoClearMeta;
      }

      if (isTrainRemLocalStateNewer(localState, state)) {
        trainRemMapRef.current = map;
        trainRemStateRef.current = localState;
        setTrainRemState(localState);
        saveTrainRemState(localState);

        for (const depot of ["west", "east"]) {
          const payload = buildTrainRemDepotPayload(localState, depot);

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
        setTrainRemLoaded(true);
        return;
      }

      trainRemMapRef.current = map;
      trainRemStateRef.current = state;
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

  const saveTrainRemToDb = useCallback(async (state, saveRevision = trainRemSaveRevisionRef.current) => {
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
        const payload = buildTrainRemDepotPayload(state, depot);

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

      if (saveRevision === trainRemSaveRevisionRef.current) {
        setTrainRemDebug(`Save failed: ${message}`);
        setTrainRemSyncError(true);
      }
    } finally {
      const isLatestSave = saveRevision === trainRemSaveRevisionRef.current;

      if (isLatestSave) {
        trainRemPendingSaveRef.current = false;
        trainRemSavingRef.current = false;
        setTrainRemSyncing(false);
      }
    }
  }, []);

  const scheduleTrainRemSave = useCallback((nextState) => {
    const stateToSave = nextState?.updatedAt ? nextState : stampTrainRemState(nextState);
    const saveRevision = trainRemSaveRevisionRef.current + 1;

    trainRemSaveRevisionRef.current = saveRevision;
    trainRemStateRef.current = stateToSave;
    saveTrainRemState(stateToSave);
    trainRemPendingSaveRef.current = true;

    if (trainRemAutoSaveTimerRef.current) {
      clearTimeout(trainRemAutoSaveTimerRef.current);
    }

    trainRemAutoSaveTimerRef.current = setTimeout(() => {
      saveTrainRemToDb(stateToSave, saveRevision);
    }, 1200);
  }, [saveTrainRemToDb]);

  const updateTrainRemState = useCallback((updater) => {
    const prev = trainRemStateRef.current;
    const nextStateBase = typeof updater === "function" ? updater(prev) : updater;

    if (isSameTrainRemState(prev, nextStateBase)) return;

    const nextState = stampTrainRemState(nextStateBase);
    const nextUndoStack = [...trainRemUndoStackRef.current, cloneTrainRemState(prev)].slice(-TRAIN_REM_UNDO_LIMIT);
    trainRemUndoStackRef.current = nextUndoStack;
    trainRemStateRef.current = nextState;
    setTrainRemUndoCount(nextUndoStack.length);
    setTrainRemState(nextState);
    scheduleTrainRemSave(nextState);
  }, [scheduleTrainRemSave]);

  useEffect(() => {
    if (!trainRemLoaded) return;

    // Timetable selection must not auto-select Train Rem preset buttons.
    // Only refresh the currently selected preset rows when a new uploaded timetable record is loaded.
    updateTrainRemState((prev) => {
      const nextRows = {};

      ["west", "east"].forEach((depot) => {
        const currentPresetLabel = prev.selectedPreset?.[depot] || "9am";
        const existingRows = normalizeTrainRemRows(prev.rows?.[depot], depot);
        nextRows[depot] = buildTrainRemRowsFromPresetConfig(depot, currentPresetLabel, existingRows, activeTimetable);
      });

      return {
        ...prev,
        rows: nextRows,
      };
    });
  }, [activeTimetable?.id, trainRemLoaded, updateTrainRemState]);

  const handleTrainRemUndo = useCallback(() => {
    const previousState = trainRemUndoStackRef.current.pop();
    if (!previousState) return;

    const restoredState = stampTrainRemState(cloneTrainRemState(previousState));
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
      const scanPreset = trainRemState.selectedPreset?.[scanDepot] || "9am";
      const scanRows = normalizeTrainRemRowsForPreset(trainRemState.rows?.[scanDepot], scanDepot, scanPreset);

      scanRows.forEach((scanRow, scanIndex) => {
        // Reference-only washing rows are excluded from log/PDF output,
        // but still participate in duplicate detection so users can see
        // when a real removal train ID matches the washing reference list.
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
    updateTrainRemState((prev) => {
      const existingRows = normalizeTrainRemRows(prev.rows?.[depot], depot);
      return {
        ...prev,
        selectedPreset: {
          ...prev.selectedPreset,
          [depot]: label,
        },
        rows: {
          ...prev.rows,
          [depot]: buildTrainRemRowsFromPresetConfig(depot, label, existingRows, activeTimetable),
        },
      };
    });
  };

  const updateTrainRemCell = (depot, rowIndex, field, value) => {
    updateTrainRemState((prev) => {
      const presetLabel = prev.selectedPreset?.[depot] || "9am";
      const rows = normalizeTrainRemRowsForPreset(prev.rows?.[depot], depot, presetLabel);
      const referenceOnly = isTrainRemReferenceOnlyIndex(depot, presetLabel, rowIndex);
      const updatedRow = { ...rows[rowIndex], [field]: value };

      if (field === "tid") {
        const cleanTid = (value || "").toString().replace(/[^0-9]/g, "");
        updatedRow.tid = cleanTid;
        updatedRow.timing = referenceOnly ? "" : getTimingForTid(depot, presetLabel, cleanTid);
      }

      if (field === "trainId") {
        // Train ID drives the request remark, but request text is displayed live
        // from maintenanceMap and should not be stored in row.remark.
        // Always clear row.remark on Train ID change to prevent stale WASH/PM/etc.
        // from the previously typed train from staying visible.
        updatedRow.remark = "";
      }

      if (referenceOnly) {
        updatedRow.timing = "";
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
      };
    });
  };

  const matchFullMlTidToTrainRemoval = () => {
    updateTrainRemState((prev) => ({
      ...prev,
      fullMlTidAutoClear: emptyFullMlTidAutoClearMeta(),
      rows: applyFullMlTidMatchesToTrainRemRows(prev.rows, prev.fullMlTidRows),
    }));
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

  const handleTrainRemPdfDownload = (depot, event = null) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (trainRemPdfStatus?.[depot]) return;

    try {
      const latestTrainRemState = trainRemStateRef.current || trainRemState;
      const westLog = buildTrainRemRemovalLog(latestTrainRemState, "west", maintenanceMap);
      const eastLog = buildTrainRemRemovalLog(latestTrainRemState, "east", maintenanceMap);
      const latestEastData = Object.keys(eastData || {}).length ? eastData : eastStablingData;
      const swappingRows = getRemovalPdfSwappingRows({
        requests,
        trainRemState: latestTrainRemState,
        westData,
        eastData: latestEastData,
        activeTimetable,
      });
      const actionOverviewRows = getRemovalPdfActionOverviewRows({
        requests,
        trainRemState: latestTrainRemState,
        westData,
        eastData: latestEastData,
      });

      // Keep the file download as the first action in the click handler.
      // Some browsers/PWA views can ignore the download when a state update runs first.
      downloadCombinedRemovalPdf(westLog, eastLog, { swappingRows, actionOverviewRows });
      setTrainRemPdfStatus((prev) => ({ ...prev, [depot]: true }));
      setTimeout(() => {
        setTrainRemPdfStatus((prev) => ({ ...prev, [depot]: false }));
      }, 700);
    } catch (error) {
      console.error("Train Rem PDF export failed:", error);
      alert("Unable to create removal PDF. Please try again.");
      setTrainRemPdfStatus((prev) => ({ ...prev, [depot]: false }));
    }
  };

  const flashEastDepotCopyStatus = (status) => {
    setEastDepotCopyStatus(status);

    if (eastDepotCopyTimerRef.current) {
      clearTimeout(eastDepotCopyTimerRef.current);
    }

    eastDepotCopyTimerRef.current = setTimeout(() => {
      setEastDepotCopyStatus("");
      eastDepotCopyTimerRef.current = null;
    }, 1600);
  };

  const handleCopyEastDepotTrainList = async () => {
    const removalTrainIds = normalizeTrainRemRows(trainRemStateRef.current?.rows?.east, "east")
      .map((row) => padTrainId(normalizeTrainId(row.trainId)))
      .filter(Boolean);
    const stablingTrainIds = collectStablingTrainIds(eastStablingData, EAST_ROADS);
    const combinedTrainIds = Array.from(new Set([...removalTrainIds, ...stablingTrainIds]));

    if (combinedTrainIds.length === 0) {
      flashEastDepotCopyStatus("empty");
      return;
    }

    const text = [`East Depot Train (Total ${combinedTrainIds.length} trains)`, ...combinedTrainIds.map(formatTrainNumberOnly)]
      .filter(Boolean)
      .join("\n");

    const ok = await copyTextToClipboard(text);
    flashEastDepotCopyStatus(ok ? "copied" : "failed");
  };

  const getEastDepotCopyLabel = () => {
    if (eastDepotCopyStatus === "copied") return "Copied";
    if (eastDepotCopyStatus === "empty") return "No Train";
    if (eastDepotCopyStatus === "failed") return "Failed";
    return "Copy";
  };

  const renderDepotTable = (depot, title, subtitle) => {
    const selectedPreset = trainRemState.selectedPreset?.[depot] || "9am";
    const rows = normalizeTrainRemRowsForPreset(trainRemState.rows?.[depot], depot, selectedPreset);
    const duplicateCounts = getTrainRemDuplicateCounts();
    const pdfActive = Boolean(trainRemPdfStatus?.[depot]);
    const activeTimetableLabel = getTimetableTypeLabel(activeTimetableType);
    const timetablePresetNotice = isTrainRemPresetMismatchWithTimetable(activeTimetableType, selectedPreset)
      ? `Currently timetable ${activeTimetableLabel} is used`
      : "";

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
                onClick={(event) => handleTrainRemPdfDownload(depot, event)}
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

              {depot === "east" && (
                <button
                  type="button"
                  onClick={handleCopyEastDepotTrainList}
                  className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[9px] font-black transition-all hover:-translate-y-0.5"
                  style={{
                    background: eastDepotCopyStatus === "copied" ? "rgba(34,197,94,0.18)" : "rgba(15,45,74,0.75)",
                    borderColor: eastDepotCopyStatus === "copied" ? "rgba(34,197,94,0.48)" : "rgba(74,138,181,0.55)",
                    color: eastDepotCopyStatus === "copied" ? "#86efac" : eastDepotCopyStatus === "empty" ? "#fbbf24" : "#9ccbea",
                    boxShadow: eastDepotCopyStatus === "copied" ? "0 0 12px rgba(34,197,94,0.16)" : "none",
                  }}
                  title="Copy East Depot removal Train ID list together with main East Depot stabling Train ID list"
                >
                  {eastDepotCopyStatus === "copied" ? <ClipboardCheck size={12} /> : <Copy size={12} />}
                  {getEastDepotCopyLabel()}
                </button>
              )}

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
            {timetablePresetNotice && (
              <div className="rounded-md border border-amber-400/45 bg-amber-950/25 px-2 py-1 text-[9px] font-black leading-tight text-amber-200">
                {timetablePresetNotice}
              </div>
            )}
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
                const referenceSeparator = isTrainRemReferenceSeparatorIndex(depot, selectedPreset, index);
                const referenceOnly = isTrainRemReferenceOnlyIndex(depot, selectedPreset, index);

                if (referenceSeparator) {
                  return (
                    <tr key={`${depot}-train-rem-reference-note-${index}`}>
                      <td
                        colSpan={4}
                        className="border-b border-[#1f3c55] px-2 py-1 text-left text-[9.5px] font-normal text-amber-100"
                        style={{ backgroundColor: index === TRAIN_REM_WEST_9AM_REAL_ROW_COUNT ? "#2a2110" : "#071828" }}
                      >
                        {index === TRAIN_REM_WEST_9AM_REAL_ROW_COUNT ? TRAIN_REM_WEST_9AM_REFERENCE_NOTE : ""}
                      </td>
                    </tr>
                  );
                }

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
                const filledRowBg = referenceOnly ? (hasTrainId ? "#1f2615" : "#121d18") : isDuplicateTrainId ? "#2a0b13" : hasTrainId ? "#082a25" : "#071828";
                const trainIdInputClass = isDuplicateTrainId
                  ? "border-red-500/90 bg-red-950/50 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.28),0_0_12px_rgba(248,113,113,0.16)]"
                  : hasTrainId
                  ? "border-emerald-500/80 bg-emerald-950/35 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                  : "border-[#1e4060] bg-[#091828] text-[#e2eaf4]";

                return (
                  <Fragment key={`${depot}-train-rem-${index}`}>
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
                      title={referenceOnly ? "Reference only — excluded from removal log and PDF" : isDuplicateTrainId ? "Duplicate Train ID detected" : ""}
                      className={`w-full h-5 rounded-md border px-1 text-center text-[11px] ${referenceOnly ? "font-normal" : "font-bold"} outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7] ${trainIdInputClass}`}
                    />
                  </td>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      value={row.tid}
                      onFocus={handleTrainRemOtherFieldFocus}
                      onChange={(e) => {
                        if (!referenceOnly) {
                          updateTrainRemCell(depot, index, "tid", e.target.value.replace(/[^0-9]/g, ""));
                        }
                      }}
                      onBlur={handleTrainRemEditEnd}
                      placeholder="TID"
                      readOnly={referenceOnly}
                      title={referenceOnly ? "Reference only — excluded from removal log and PDF" : ""}
                      className={`w-full h-5 rounded-md border px-1 text-center text-[11px] ${referenceOnly ? "font-normal" : "font-bold"} outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7] ${
                        referenceOnly
                          ? "border-amber-500/45 bg-amber-950/20 text-amber-100 cursor-default"
                          : "border-[#1e4060] bg-[#091828] text-[#c8d8ea]"
                      }`}
                    />
                  </td>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      value={row.timing}
                      onFocus={handleTrainRemOtherFieldFocus}
                      onChange={(e) => {
                        if (!referenceOnly) {
                          updateTrainRemCell(depot, index, "timing", e.target.value);
                        }
                      }}
                      onBlur={handleTrainRemEditEnd}
                      placeholder={referenceOnly ? "REF" : "00:00"}
                      readOnly={referenceOnly}
                      title={referenceOnly ? "Reference only — timing disabled so it will not export" : ""}
                      className={`w-full h-5 rounded-md border px-1 text-center text-[11px] ${referenceOnly ? "font-normal" : "font-bold"} outline-none placeholder:text-[#2b4f6b] focus:border-[#4f8ef7] ${
                        referenceOnly
                          ? "border-amber-500/35 bg-[#121d18] text-amber-100 cursor-default placeholder:text-amber-700/70"
                          : "border-[#1e4060] bg-[#071828] text-[#7eb8e0]"
                      }`}
                    />
                  </td>
                  <td className="border-b border-[#10263b] px-1 py-0.5" style={{ backgroundColor: filledRowBg }}>
                    <input
                      value={remarkValue}
                      onFocus={handleTrainRemOtherFieldFocus}
                      onChange={(e) => {
                        if (!requestRemark && !referenceOnly) {
                          updateTrainRemCell(depot, index, "remark", e.target.value);
                        }
                      }}
                      onBlur={handleTrainRemEditEnd}
                      readOnly={Boolean(requestRemark) || referenceOnly}
                      title={referenceOnly ? "Reference only — excluded from removal log and PDF" : requestRemark ? `Auto-detected request type: ${requestRemark}` : ""}
                      placeholder={referenceOnly ? "Reference only" : "Remark"}
                      style={requestRemarkStyle}
                      className={`w-full h-5 rounded-md border px-1.5 text-[11px] ${referenceOnly ? "font-normal" : "font-semibold"} outline-none placeholder:text-[#2b4f6b] ${
                        requestRemark || referenceOnly
                          ? "cursor-default"
                          : "border-[#1e4060] bg-[#091828] text-[#c8d8ea] focus:border-[#4f8ef7]"
                      } ${referenceOnly ? "border-amber-500/35 bg-[#121d18] text-amber-100 placeholder:text-amber-700/70" : ""}`}
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
        .map((row) => {
          const tid = (row.tid || "").toString().replace(/[^0-9]/g, "");
          const matchedTrainId = tid ? tidMap[tid] : "";
          const currentTrainId = normalizeFullMlTrainId(row.trainId);
          return tid && matchedTrainId && currentTrainId === matchedTrainId ? tid : "";
        })
        .filter(Boolean)
    ).size;
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
                  <div className="flex h-7 items-center justify-between gap-2 rounded-lg border border-[#1e4060] bg-[#091828] px-2 text-[#7eb8e0]">
                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Manual match only</span>
                    <button
                      type="button"
                      onClick={matchFullMlTidToTrainRemoval}
                      className="h-5 rounded-md border border-emerald-500/50 bg-emerald-950/35 px-2 text-[10px] font-black uppercase tracking-widest text-emerald-100 transition-colors hover:border-emerald-300 hover:bg-emerald-900/45"
                      title="Click to match Full ML TID Train ID with Train Rem rows"
                    >
                      Match
                    </button>
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

function InsertionTabContent({ westData, eastData, maintenanceMap, insertionLog, onInsertionTick, onRemoveInsertionLog, onClearInsertionDepot, onClearInsertedTidRemarks, onClearInsertedTrains, tidInputs, onTidChange, getTidScheduledTime, getTidAssistRemarkStyle, activeTimetable, activeTimetableType, insertionLiveStatusText, insertionLiveStatusClass, insertionLiveDebug, activePg = "pg1", onPgChange, onRefreshPg2, stablingEditable = false, onEditableTrainIdChange }) {
  // TID schedule range: earliest first-TID time across both series, latest last-TID time.
  // Series 1xx: 05:25–06:22 | Series 2xx: 05:24–06:21
  // Grey-out in the TID Reference Table only applies while current time is within this window.
  const TID_SCHEDULE_FIRST = "05:24"; // earliest TID time (TID 201)
  const TID_SCHEDULE_LAST  = "06:22"; // latest TID time  (TID 120)
  const withinTIDSchedule = isWithinTIDSchedule(TID_SCHEDULE_FIRST, TID_SCHEDULE_LAST);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex w-fit items-center rounded-full border border-[#2b4f6b] bg-[#071828] p-1 text-[10px] font-black shadow-inner shadow-black/20">
          {(["pg1", "pg2"]).map((pg) => {
            const selected = normalizeInsertionPg(activePg) === pg;
            return (
              <button
                key={pg}
                type="button"
                onClick={() => onPgChange?.(pg)}
                className="rounded-full px-3 py-1 transition-all"
                style={selected ? MAIN_STABLING_BUTTON_PRIMARY : { color: "#7eb8e0", background: "transparent" }}
                title={pg === "pg1" ? "PG1 default stabling" : "PG2 editable stabling"}
              >
                {pg.toUpperCase()}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onRefreshPg2}
          className="group flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
          style={MAIN_STABLING_BUTTON_BLUE}
          title="Refresh PG2 back to the current default PG1 stabling"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-15.5 6.2" />
            <path d="M3 12A9 9 0 0 1 18.5 5.8" />
            <path d="M18 2v4h4" />
            <path d="M6 22v-4H2" />
          </svg>
          Refresh PG2
        </button>
        <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-bold ${insertionLiveStatusClass || "border-slate-600/50 bg-slate-950/40 text-slate-300"}`}>
          {insertionLiveStatusText || "Insertion Local only"}
        </div>
      </div>
      <div className="w-full rounded-2xl border border-sky-500/25 bg-gradient-to-br from-[#071827]/95 via-[#071422]/95 to-[#06111d]/95 px-5 py-4 shadow-[0_0_22px_rgba(14,165,233,0.08),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 text-[12px] font-black uppercase tracking-[0.16em] text-white">
          Insertion Notes
        </div>
        <div className="grid grid-cols-1 gap-3 text-[13px] font-normal leading-relaxed text-[#e5eef8] lg:grid-cols-3">
          <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-[#0a2440]/90 to-[#071827]/90 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-2 text-[15px] font-black leading-tight text-sky-400">PG2 Editable Train ID</div>
            <div>
              Go to <span className="text-yellow-300">PG2</span> if a train ID needs to be changed or removed from STB. No need to edit it from the main page.
            </div>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-[#082939]/90 to-[#071827]/90 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-2 text-[15px] font-black leading-tight text-cyan-300">Night Shift WD DC</div>
            <div>
              Utilize <span className="text-yellow-300">4 trains to 3K1</span> with the remark <span className="text-yellow-300">Wash Only</span>.<br />
              It will automatically be removed during Early or <span className="text-yellow-300">Late Shift</span> at WD.
            </div>
          </div>
          <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-[#171b3a]/90 to-[#071827]/90 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-2 text-[15px] font-black leading-tight text-purple-300">Night Shift ED DC</div>
            <div>
              Utilize <span className="text-yellow-300">TID 203 and 205</span> with the remark <span className="text-yellow-300">Wash Only</span>. It will automatically be removed during <span className="text-yellow-300">Late Shift</span> at WD.
            </div>
          </div>
        </div>
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
          <TIDReferenceTable withinSchedule={withinTIDSchedule} activeTimetable={activeTimetable} activeTimetableType={activeTimetableType} />
        </div>

        {/* Stabling sections — centre column */}
        <div className="space-y-5 min-w-0">
          <InsertionStablingSection title="WEST DEPOT" blockLabels={["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"]} blockIndices={[6,5,4,3,2,1,0]} roads={WEST_ROADS} data={westData} labelSide="left" maintenanceMap={maintenanceMap} insertionLog={insertionLog} onInsertionTick={onInsertionTick} tidInputs={tidInputs} onTidChange={onTidChange} onClearInsertedTidRemarks={onClearInsertedTidRemarks} onClearInsertedTrains={onClearInsertedTrains} getTidScheduledTime={getTidScheduledTime} getTidAssistRemarkStyle={getTidAssistRemarkStyle} stablingEditable={stablingEditable} onEditableTrainIdChange={(road, bi, value) => onEditableTrainIdChange?.("west", road, bi, value)} />
          <InsertionStablingSection title="EAST DEPOT" blockLabels={["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"]} blockIndices={[0,1,2,3,4,5,6]} roads={EAST_ROADS} data={eastData} labelSide="right" maintenanceMap={maintenanceMap} insertionLog={insertionLog} onInsertionTick={onInsertionTick} tidInputs={tidInputs} onTidChange={onTidChange} onClearInsertedTidRemarks={onClearInsertedTidRemarks} onClearInsertedTrains={onClearInsertedTrains} getTidScheduledTime={getTidScheduledTime} getTidAssistRemarkStyle={getTidAssistRemarkStyle} stablingEditable={stablingEditable} onEditableTrainIdChange={(road, bi, value) => onEditableTrainIdChange?.("east", road, bi, value)} />
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
const TP1_MOVEMENT_LIVE_RECORD_KEY = "tp1MovementLiveState_v1";
const TP1_MOVEMENT_LIVE_SYNC_INTERVAL_MS = 3000;
const TP1_MOVEMENT_LIVE_SAVE_DEBOUNCE_MS = 700;
const TP1_MOVEMENT_LIVE_LOCAL_EDIT_HOLD_MS = 2500;
const TP1_MOVEMENT_LIVE_POST_SAVE_HOLD_MS = 1200;

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

function getTp1MovementLiveEntity() {
  return base44?.entities?.InboundOutboundMovement || null;
}

function isTp1MovementLiveEntityReady(entity = getTp1MovementLiveEntity()) {
  return Boolean(entity?.list && entity?.create && entity?.update);
}

function selectTp1MovementLiveRecord(records = []) {
  const list = Array.isArray(records) ? records : [];
  return list.find((item) => item?.stateKey === TP1_MOVEMENT_LIVE_RECORD_KEY || item?.key === TP1_MOVEMENT_LIVE_RECORD_KEY) || list[0] || null;
}


function getTp1EntrySection(entry = {}) {
  const type = String(entry?.type || "").toLowerCase();
  const text = String(entry?.text || "").toLowerCase();

  if (type === "automatic" || text.includes("automatic area")) return "automatic";
  if (type === "manual" || text.includes("manual area")) return "manual";
  return "other";
}

function getTp1EntrySectionOrder(entry = {}) {
  const section = getTp1EntrySection(entry);
  if (section === "automatic") return 0;
  if (section === "manual") return 1;
  return 2;
}

function getTp1EntrySortMinutes(entry = {}) {
  const preferredTime = entry?.trAtTp1 || entry?.startTime || entry?.time;
  const preferredMinutes = excelTimeToMinutes(preferredTime);
  if (preferredMinutes !== null) return preferredMinutes;

  const text = String(entry?.text || "");
  const firstLogTime = text.match(/(\d{1,2}:\d{2})\s*hrs/i)?.[1] || text.match(/(\d{1,2}:\d{2})/)?.[1];
  const firstLogMinutes = excelTimeToMinutes(firstLogTime);
  return firstLogMinutes !== null ? firstLogMinutes : 99999;
}

function sortTp1MovementEntries(entries = []) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const sectionDiff = getTp1EntrySectionOrder(a) - getTp1EntrySectionOrder(b);
    if (sectionDiff !== 0) return sectionDiff;

    const timeDiff = getTp1EntrySortMinutes(a) - getTp1EntrySortMinutes(b);
    if (timeDiff !== 0) return timeDiff;

    return String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""));
  });
}
function getTp1TimedLineMinutes(line = "") {
  const match = String(line || "").match(/^\s*(\d{1,2}:\d{2})\s*hrs\s*[\u2013-]/i);
  const minutes = excelTimeToMinutes(match?.[1]);
  return minutes !== null ? minutes : 99999;
}

function sortTp1TimedLogLines(lines = []) {
  return [...(Array.isArray(lines) ? lines : [])].sort((a, b) => getTp1TimedLineMinutes(a) - getTp1TimedLineMinutes(b));
}

function sortTp1MovementTextLinesByTime(text = "") {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  const titleLines = lines.filter((line) => getTp1TimedLineMinutes(line) === 99999);
  const timedLines = lines.filter((line) => getTp1TimedLineMinutes(line) !== 99999);
  return [...titleLines, ...sortTp1TimedLogLines(timedLines)].join("\n");
}


function normalizeTp1ExcelRoad(road = "") {
  const clean = String(road || "").trim();
  if (!clean) return "Automatic Area";
  if (/automatic\s+area/i.test(clean)) return "Automatic Area";
  return clean.replace(/[\u2012\u2013\u2014\u2212]/g, "-").replace(/\s+/g, "").toUpperCase();
}

function getTp1DepotFromExcelRoad(road = "") {
  const clean = normalizeTp1ExcelRoad(road);
  if (/^WD-/i.test(clean)) return "west";
  if (/^ED-/i.test(clean)) return "east";
  return "";
}

function getFirstTp1TimeMatch(text = "", pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1].padStart(5, "0") : "";
}

function getTp1AutomaticEntryMeta(entry = {}) {
  const text = String(entry?.text || "");
  const trainKey = padTrainId(normalizeTrainId(entry?.train || text.match(/\bT\s*(\d{1,2})\b/i)?.[0] || ""));
  const roadMatch = text.match(/(?:Train preparation|PST)\s+completed\s+at\s+([^\n.]+?)(?:\s+by\s+Shunter|\s+from|\.|$)/i);
  const road = normalizeTp1ExcelRoad(entry?.stablingRoad || roadMatch?.[1] || "Automatic Area");
  const prepTime = entry?.trainPrepCompletedTime || getFirstTp1TimeMatch(text, /^(\d{1,2}:\d{2})\s+hrs\s+[\u2013-].*?Train preparation completed/im);
  const pstStartTime = entry?.pstPerformedTime || getFirstTp1TimeMatch(text, /^(\d{1,2}:\d{2})\s+hrs\s+[\u2013-].*?PST completed/im);
  const pstEndTime = entry?.pstCompletedTime || text.match(/\bfrom\s+\d{1,2}:\d{2}\s+to\s+(\d{1,2}:\d{2})\s+hrs/i)?.[1] || (pstStartTime ? addMinutesToHHMM(pstStartTime, 6) : "");
  const shunterName = formatTp1ShunterNameForLog(
    entry?.shunterName ||
    text.match(/\bby\s+Shunter\s+([^\n.]+)/i)?.[1] ||
    text.match(/\bwith\s+Shunter\s+(.+?)\s+onboard/i)?.[1] ||
    ""
  );

  return {
    trainKey,
    road,
    depot: entry?.depot || getTp1DepotFromExcelRoad(road),
    prepTime,
    pstStartTime,
    pstEndTime,
    shunterName,
  };
}

function buildTp1AutomaticPSTExportLines(entries = []) {
  const exportLines = [];

  sortTp1MovementEntries(entries)
    .filter((entry) => getTp1EntrySection(entry) === "automatic")
    .forEach((entry, index) => {
      const meta = getTp1AutomaticEntryMeta(entry);
      if (!meta.trainKey) return;
      const safeKey = entry?.id || `tp1-${index}`;
      const roadForLog = meta.road === "Automatic Area" ? "Automatic Area" : meta.road;

      if (meta.pstStartTime) {
        exportLines.push({
          key: `tp1-pst-${safeKey}`,
          text: `${meta.pstStartTime} hrs \u2013 ${meta.trainKey} PST completed at ${roadForLog} from ${meta.pstStartTime} to ${meta.pstEndTime} hrs. No alarm reported.`,
          type: "PST",
          depot: meta.depot,
          road: roadForLog,
          trainKey: meta.trainKey,
          startTime: meta.pstStartTime,
          endTime: meta.pstEndTime,
          alarmStatus: "no_alarm",
        });
      }

      if (meta.prepTime) {
        const completedByText = meta.shunterName ? `Shunter ${meta.shunterName}` : "Shunter";
        exportLines.push({
          key: `tp1-prep-${safeKey}`,
          text: `${meta.prepTime} hrs \u2013 ${meta.trainKey} Train preparation completed at ${roadForLog} by ${completedByText}.`,
          type: "Prep",
          depot: meta.depot,
          road: roadForLog,
          trainKey: meta.trainKey,
          startTime: "",
          time: meta.prepTime,
          endTime: meta.prepTime,
          completedByText,
        });
      }
    });

  return sortPSTLogLinesByTime(exportLines);
}

function downloadTp1AutomaticExcelExport(entries = [], completedByDc = "") {
  const exportLines = buildTp1AutomaticPSTExportLines(entries);
  const xlsxBytes = buildPSTExcelWorkbook(exportLines, String(completedByDc || "").trim(), "");
  const blob = new Blob([xlsxBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `Line-3-Inbound-Outbound-Automatic-PST-Train-Prep-${dateStamp}.xlsx`);
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


function formatTp1RoadForLog(road = "") {
  const clean = String(road || "").trim().toUpperCase();
  if (!clean) return "";
  return clean.replace(/^(WD|ED)[\s\u2013-]*(ST\d+)/i, (_, depot, stabling) => `${depot.toUpperCase()}\u2013${stabling.toUpperCase()}`);
}

function findTp1TrainStablingRoad(trainId = "") {
  const trainKey = padTrainId(normalizeTrainId(trainId || ""));
  if (!trainKey) return "";

  const state = loadLocalStablingState();
  const depots = [
    { roads: WEST_ROADS, data: state.westData },
    { roads: EAST_ROADS, data: state.eastData },
  ];

  for (const depot of depots) {
    for (const road of depot.roads) {
      const blocks = Array.isArray(depot.data?.[road]) ? depot.data[road] : [];
      const found = blocks.some((block) => padTrainId(normalizeTrainId(block?.trainId || "")) === trainKey);
      if (found) return formatTp1RoadForLog(road);
    }
  }

  return "";
}

function formatTp1ShunterNameForLog(name = "") {
  const clean = String(name || "").trim();
  if (!clean) return "";
  return clean
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function isCompleteMovementTimeInput(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
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
      swapReason: "",
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
    automaticStablingRoad: "",
    trainPrepCompletedTime: "",
    pstPerformedTime: "",
    completedByDc: "",
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

  const TP1_AUTOMATIC_STABLING_OPTIONS = [
    "WD-ST15",
    "WD-ST14",
    "WD-ST13",
    "WD-ST12",
  ];

  const [clockText, setClockText] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const updateClock = () => setClockText(formatTime(new Date()));
    updateClock();

    const timer = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const [entries, setEntries] = useState(() => loadTrainMovementLog());
  const [tp1Entries, setTp1Entries] = useState(() => sortTp1MovementEntries(loadTp1MovementLog()));
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
  const [focusedFlowInput, setFocusedFlowInput] = useState("");
  const [flowSettledInputs, setFlowSettledInputs] = useState({});
  const flowInputSettleTimerRef = useRef({});
  const movementScrollRestoreRef = useRef(null);
  const [tp1LiveLoaded, setTp1LiveLoaded] = useState(false);
  const [tp1LiveSyncing, setTp1LiveSyncing] = useState(false);
  const [tp1LiveLastSynced, setTp1LiveLastSynced] = useState(null);
  const [tp1LiveSyncError, setTp1LiveSyncError] = useState(false);
  const [tp1LiveDbReady, setTp1LiveDbReady] = useState(() => isTp1MovementLiveEntityReady());
  const [tp1LiveDebug, setTp1LiveDebug] = useState("");
  const tp1FormRef = useRef(tp1Form);
  const tp1EntriesRef = useRef(tp1Entries);
  const tp1LiveRecordIdRef = useRef("");
  const tp1LiveRemoteUpdatedAtRef = useRef(0);
  const tp1LiveLocalEditUntilRef = useRef(0);
  const tp1LiveAutoSaveTimerRef = useRef(null);
  const tp1LivePendingSaveRef = useRef(false);
  const tp1LiveSavingRef = useRef(false);
  const tp1LivePollingRef = useRef(false);
  const tp1LiveApplyingRemoteRef = useRef(false);

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

  useEffect(() => { tp1FormRef.current = tp1Form; }, [tp1Form]);
  useEffect(() => { tp1EntriesRef.current = sortTp1MovementEntries(tp1Entries); }, [tp1Entries]);

  useEffect(() => { saveTrainMovementLog(entries); }, [entries]);
  useEffect(() => { saveSavedMovementObject(TRAIN_MOVEMENT_FORM_KEY, forms); }, [forms]);

  const normalizeTp1MovementLiveState = useCallback((source = {}) => {
    const formSource = source?.form || source?.tp1Form || source?.draft || {};
    const entriesSource = Array.isArray(source?.entries)
      ? source.entries
      : Array.isArray(source?.tp1Entries)
      ? source.tp1Entries
      : [];

    return {
      form: mergeTp1MovementForm(createDefaultTp1MovementForm(), formSource),
      entries: sortTp1MovementEntries(entriesSource),
      updatedAt: String(source?.updatedAt || source?.updated_date || source?.updatedAt || ""),
    };
  }, []);

  const buildTp1MovementLivePayload = useCallback((state = {}) => {
    const normalized = normalizeTp1MovementLiveState({
      form: state.form || state.tp1Form || tp1FormRef.current,
      entries: state.entries || state.tp1Entries || tp1EntriesRef.current,
    });

    return {
      stateKey: TP1_MOVEMENT_LIVE_RECORD_KEY,
      form: normalized.form,
      entries: normalized.entries,
      updatedAt: new Date().toISOString(),
    };
  }, [normalizeTp1MovementLiveState]);

  const applyTp1MovementLiveState = useCallback((incomingState = {}) => {
    const normalized = normalizeTp1MovementLiveState(incomingState);
    const remoteUpdatedMs = Date.parse(normalized.updatedAt || "");

    if (remoteUpdatedMs && remoteUpdatedMs + 250 < tp1LiveRemoteUpdatedAtRef.current) return;

    tp1LiveApplyingRemoteRef.current = true;
    setTp1Form(normalized.form);
    setTp1Entries(normalized.entries);
    saveSavedMovementObject(TP1_MOVEMENT_FORM_KEY, normalized.form);
    saveTp1MovementLog(normalized.entries);

    if (remoteUpdatedMs) {
      tp1LiveRemoteUpdatedAtRef.current = Math.max(tp1LiveRemoteUpdatedAtRef.current, remoteUpdatedMs);
    }
  }, [normalizeTp1MovementLiveState]);

  const saveTp1MovementLiveToDb = useCallback(async (state) => {
    const entity = getTp1MovementLiveEntity();
    const payload = buildTp1MovementLivePayload(state);

    saveSavedMovementObject(TP1_MOVEMENT_FORM_KEY, payload.form);
    saveTp1MovementLog(payload.entries);

    if (!isTp1MovementLiveEntityReady(entity)) {
      setTp1LiveDbReady(false);
      setTp1LiveSyncError(true);
      setTp1LiveDebug("Inbound / Outbound Movement live draft will stay local until the InboundOutboundMovement entity is deployed.");
      tp1LivePendingSaveRef.current = false;
      return;
    }

    tp1LiveSavingRef.current = true;
    setTp1LiveSyncing(true);

    try {
      if (tp1LiveRecordIdRef.current) {
        await entity.update(tp1LiveRecordIdRef.current, payload);
      } else {
        const records = await entity.list();
        const existing = selectTp1MovementLiveRecord(records);
        if (existing?.id) {
          tp1LiveRecordIdRef.current = existing.id;
          await entity.update(existing.id, payload);
        } else {
          const created = await entity.create(payload);
          if (created?.id) tp1LiveRecordIdRef.current = created.id;
        }
      }

      const payloadUpdatedMs = Date.parse(payload.updatedAt || "");
      if (payloadUpdatedMs) {
        tp1LiveRemoteUpdatedAtRef.current = Math.max(tp1LiveRemoteUpdatedAtRef.current, payloadUpdatedMs);
      }

      setTp1LiveLastSynced(new Date());
      setTp1LiveSyncError(false);
      setTp1LiveDbReady(true);
      setTp1LiveDebug("");
    } catch (err) {
      const message = err?.message || String(err);
      console.error("Inbound / Outbound Movement live save failed:", err);
      setTp1LiveSyncError(true);
      setTp1LiveDebug(`Inbound / Outbound live save failed: ${message}`);
    } finally {
      tp1LiveLocalEditUntilRef.current = Date.now() + TP1_MOVEMENT_LIVE_POST_SAVE_HOLD_MS;
      tp1LivePendingSaveRef.current = false;
      tp1LiveSavingRef.current = false;
      setTp1LiveSyncing(false);
    }
  }, [buildTp1MovementLivePayload]);

  const scheduleTp1MovementLiveSave = useCallback((state) => {
    const payload = buildTp1MovementLivePayload(state);

    saveSavedMovementObject(TP1_MOVEMENT_FORM_KEY, payload.form);
    saveTp1MovementLog(payload.entries);

    tp1LivePendingSaveRef.current = true;
    tp1LiveLocalEditUntilRef.current = Date.now() + TP1_MOVEMENT_LIVE_LOCAL_EDIT_HOLD_MS;

    if (tp1LiveAutoSaveTimerRef.current) {
      clearTimeout(tp1LiveAutoSaveTimerRef.current);
    }

    tp1LiveAutoSaveTimerRef.current = setTimeout(() => {
      saveTp1MovementLiveToDb(payload);
    }, TP1_MOVEMENT_LIVE_SAVE_DEBOUNCE_MS);
  }, [buildTp1MovementLivePayload, saveTp1MovementLiveToDb]);

  const refreshTp1MovementLiveFromDb = useCallback(async ({ showStatus = false } = {}) => {
    const entity = getTp1MovementLiveEntity();

    if (!isTp1MovementLiveEntityReady(entity)) {
      setTp1LiveDbReady(false);
      setTp1LiveLoaded(true);
      setTp1LiveDebug("Inbound / Outbound Movement live draft is local only until InboundOutboundMovement is available in D1.");
      return;
    }

    if (
      Date.now() < tp1LiveLocalEditUntilRef.current ||
      tp1LiveSavingRef.current ||
      tp1LivePendingSaveRef.current ||
      tp1LivePollingRef.current
    ) {
      return;
    }

    tp1LivePollingRef.current = true;
    if (showStatus) setTp1LiveSyncing(true);

    try {
      const records = await entity.list();
      const record = selectTp1MovementLiveRecord(records);

      if (!record) {
        const payload = buildTp1MovementLivePayload({
          form: tp1FormRef.current,
          entries: tp1EntriesRef.current,
        });
        const created = await entity.create(payload);
        if (created?.id) tp1LiveRecordIdRef.current = created.id;

        const payloadUpdatedMs = Date.parse(payload.updatedAt || "");
        if (payloadUpdatedMs) {
          tp1LiveRemoteUpdatedAtRef.current = Math.max(tp1LiveRemoteUpdatedAtRef.current, payloadUpdatedMs);
        }

        setTp1LiveLastSynced(new Date());
        setTp1LiveSyncError(false);
        setTp1LiveDbReady(true);
        setTp1LiveDebug("");
        setTp1LiveLoaded(true);
        return;
      }

      if (record?.id) tp1LiveRecordIdRef.current = record.id;
      applyTp1MovementLiveState(record);
      setTp1LiveLastSynced(new Date());
      setTp1LiveSyncError(false);
      setTp1LiveDbReady(true);
      setTp1LiveDebug("");
      setTp1LiveLoaded(true);
    } catch (err) {
      const message = err?.message || String(err);
      console.error("Inbound / Outbound Movement live sync failed:", err);
      setTp1LiveSyncError(true);
      setTp1LiveDebug(`Inbound / Outbound live sync failed: ${message}`);
      setTp1LiveLoaded(true);
    } finally {
      tp1LivePollingRef.current = false;
      if (showStatus) setTp1LiveSyncing(false);
    }
  }, [applyTp1MovementLiveState, buildTp1MovementLivePayload]);

  useEffect(() => {
    refreshTp1MovementLiveFromDb({ showStatus: true });
  }, [refreshTp1MovementLiveFromDb]);

  useEffect(() => {
    if (!tp1LiveLoaded || !tp1LiveDbReady) return;

    const interval = setInterval(() => {
      refreshTp1MovementLiveFromDb({ showStatus: true });
    }, TP1_MOVEMENT_LIVE_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [tp1LiveLoaded, tp1LiveDbReady, refreshTp1MovementLiveFromDb]);

  useEffect(() => {
    saveSavedMovementObject(TP1_MOVEMENT_FORM_KEY, tp1Form);
    saveTp1MovementLog(sortTp1MovementEntries(tp1Entries));

    if (tp1LiveApplyingRemoteRef.current) {
      tp1LiveApplyingRemoteRef.current = false;
      return;
    }

    if (!tp1LiveLoaded) return;
    scheduleTp1MovementLiveSave({ form: tp1Form, entries: tp1Entries });
  }, [tp1Form, tp1Entries, tp1LiveLoaded, scheduleTp1MovementLiveSave]);

  useEffect(() => {
    return () => {
      Object.values(copyFeedbackTimerRef.current || {}).forEach((timer) => clearTimeout(timer));
      if (tp1LiveAutoSaveTimerRef.current) clearTimeout(tp1LiveAutoSaveTimerRef.current);
    };
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

  const updateMovementFlowTextField = (operation, field, value) => {
    updateMovementForm(operation, field, value);
    scheduleFlowInputSettled(getMovementFlowInputKey(operation, field));
  };

  const updateTp1MovementForm = (field, value) => {
    captureMovementScrollPosition();
    setTp1Form((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const getMovementFlowInputKey = (operation, field) => `movement:${operation}:${field}`;
  const getTp1FlowInputKey = (field) => `tp1:${field}`;
  const isFlowInputFocused = (key) => focusedFlowInput === key;
  const focusFlowInput = (key) => setFocusedFlowInput(key);
  const markFlowInputSettledNow = (key) => {
    if (flowInputSettleTimerRef.current[key]) {
      clearTimeout(flowInputSettleTimerRef.current[key]);
      delete flowInputSettleTimerRef.current[key];
    }
    setFlowSettledInputs((prev) => ({ ...prev, [key]: true }));
  };
  const scheduleFlowInputSettled = (key) => {
    if (!key) return;
    if (flowInputSettleTimerRef.current[key]) {
      clearTimeout(flowInputSettleTimerRef.current[key]);
      delete flowInputSettleTimerRef.current[key];
    }
    // Show the next flow pill immediately once the current input has valid text/time.
    // Keep focus/cursor inside the current input so the user can continue typing.
    setFlowSettledInputs((prev) => ({ ...prev, [key]: true }));
  };
  const blurFlowInput = (key) => {
    setFocusedFlowInput((current) => (current === key ? "" : current));
    markFlowInputSettledNow(key);
  };

  const isFlowInputSettled = () => true;
  const isMovementFlowFieldSettled = (operation, field) => isFlowInputSettled(getMovementFlowInputKey(operation, field));
  const isTp1FlowFieldSettled = (field) => isFlowInputSettled(getTp1FlowInputKey(field));

  const resetTp1AutomaticFlow = () => {
    captureMovementScrollPosition();
    setFocusedFlowInput("");
    setFlowSettledInputs({});
    setTp1Form((prev) => ({
      ...prev,
      movementType: "automatic",
      trainSet: "",
      planStatus: "Planned",
      trAtTp1: "",
      shunterName: "",
      trLocalized: "",
      automaticStablingRoad: "",
      trainPrepCompletedTime: "",
      pstPerformedTime: "",
      completedByDc: "",
      nextWashText: "",
      nextWashDate: "",
      nextWashTime: "",
    }));
  };

  const resetTp1ManualFlow = () => {
    captureMovementScrollPosition();
    setFocusedFlowInput("");
    setFlowSettledInputs({});
    setTp1Form((prev) => ({
      ...prev,
      movementType: "manual",
      trainSet: "",
      planStatus: "Planned",
      trAtTp1: "",
      shunterName: "",
      fromTp1: "",
      toManual: "",
      nextWashText: "",
      nextWashDate: "",
      nextWashTime: "",
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

    return `${time} hrs – ${train} removed from mainline to ${selectedDepotLabel} stabling due to ${(current.swapReason || "").trim()}. Replaced by ${normalizeMovementTrain(current.replacedBy) || "T30"}.`;
  };

  const addMovementLog = (operation) => {
    captureMovementScrollPosition();
    setFocusedFlowInput("");
    setFlowSettledInputs({});
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
        swapReason: operation === "swapping" ? "" : prev[operation].swapReason,
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
    const shunterNameForLog = formatTp1ShunterNameForLog(shunterName) || shunterName;
    const trAtTp1 = tp1Form.trAtTp1 || "18:20";
    const shunterAuth = addMinutesToHHMM(trAtTp1, 1);
    const trLocalized = tp1Form.trLocalized || "18:28";
    const trainPrepCompletedTime = tp1Form.trainPrepCompletedTime || "";
    const pstPerformedTime = tp1Form.pstPerformedTime || "";
    const pstCompletedTime = pstPerformedTime ? addMinutesToHHMM(pstPerformedTime, 6) : "";
    const selectedAutomaticStablingRoad = formatTp1RoadForLog(tp1Form.automaticStablingRoad);
    const stablingRoad = selectedAutomaticStablingRoad || findTp1TrainStablingRoad(train || displayTrain) || "Automatic Area";
    const fromTp1 = tp1Form.fromTp1 || "18:30";
    const toManual = tp1Form.toManual || "18:35";
    const nextWashSuffix = getTp1NextWashSuffix();

    if (!preview) {
      const missing = [];
      if (!train) missing.push("Train Set");
      if (!tp1Form.planStatus) missing.push("Plan / Unplanned");
      if (!isCompleteMovementTimeInput(tp1Form.trAtTp1)) missing.push("TR at TP1 (HH:MM)");
      if (!tp1Form.shunterName) missing.push("Shunter Name");
      if (movementType === "automatic" && !isCompleteMovementTimeInput(tp1Form.trLocalized)) missing.push("TR Localized (HH:MM)");
      if (movementType === "automatic" && !tp1Form.automaticStablingRoad) missing.push("Stabling");
      if (movementType === "automatic" && !isCompleteMovementTimeInput(tp1Form.trainPrepCompletedTime)) missing.push("Train Prep Completed (HH:MM)");
      if (movementType === "automatic" && !isCompleteMovementTimeInput(tp1Form.pstPerformedTime)) missing.push("PST Performed (HH:MM)");
      if (movementType === "manual" && !isCompleteMovementTimeInput(tp1Form.fromTp1)) missing.push("From TP1 (HH:MM)");
      if (movementType === "manual" && !isCompleteMovementTimeInput(tp1Form.toManual)) missing.push("to Manual (HH:MM)");

      if (missing.length) {
        alert(`Please complete: ${missing.join(", ")}.`);
        return null;
      }
    }

    if (movementType === "automatic") {
      const titleLine = `${displayTrain}: ${planStatus} movement to Automatic Area.${nextWashSuffix}`;
      const timedLines = [
        `${trAtTp1} hrs – ${displayTrain} arrived at TP1 with Shunter ${shunterNameForLog} onboard.`,
        `${shunterAuth} hrs – ${displayTrain} authorized to prepare the train, conduct a brake self-test, and localize the train.`,
        `${trLocalized} hrs – ${displayTrain} localized at TP1.`,
      ];

      if (trainPrepCompletedTime) {
        timedLines.push(`${trainPrepCompletedTime} hrs – ${displayTrain} Train preparation completed at ${stablingRoad} by Shunter ${shunterNameForLog}.`);
      }

      if (pstPerformedTime) {
        timedLines.push(`${pstPerformedTime} hrs – ${displayTrain} PST completed at ${stablingRoad} from ${pstPerformedTime} to ${pstCompletedTime} hrs. No alarm reported.`);
      }

      return [titleLine, ...sortTp1TimedLogLines(timedLines)].join("\n");
    }

    return [
      `${displayTrain}: ${planStatus} movement to Manual Area.${nextWashSuffix}`,
      ...sortTp1TimedLogLines([
        `${trAtTp1} hrs – ${displayTrain} arrived at TP1.`,
        `${shunterAuth} hrs – ${displayTrain} was authorized to prepare the train. Shunter ${shunterNameForLog} onboard.`,
        `${fromTp1} hrs – ${displayTrain} departed from TP1 and arrived at the Manual Area at ${toManual} hrs.`,
      ]),
    ].join("\n");
  };

  const addTp1MovementLog = () => {
    captureMovementScrollPosition();
    setFocusedFlowInput("");
    const text = buildTp1MovementText();
    if (!text) return;

    const now = new Date();
    const movementType = getTp1MovementType();
    const normalizedTrain = normalizeMovementTrain(tp1Form.trainSet);
    const selectedAutomaticStablingRoad = formatTp1RoadForLog(tp1Form.automaticStablingRoad);
    const stablingRoad = movementType === "automatic" ? (selectedAutomaticStablingRoad || findTp1TrainStablingRoad(normalizedTrain) || "Automatic Area") : "";
    const pstPerformedTime = tp1Form.pstPerformedTime || "";
    const entry = {
      id: `tp1-movement-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      type: movementType,
      train: normalizedTrain,
      planStatus: tp1Form.planStatus,
      startTime: tp1Form.trAtTp1,
      trAtTp1: tp1Form.trAtTp1,
      trLocalized: tp1Form.trLocalized,
      automaticStablingRoad: tp1Form.automaticStablingRoad,
      trainPrepCompletedTime: tp1Form.trainPrepCompletedTime,
      pstPerformedTime,
      pstCompletedTime: pstPerformedTime ? addMinutesToHHMM(pstPerformedTime, 6) : "",
      shunterName: tp1Form.shunterName,
      stablingRoad,
      fromTp1: tp1Form.fromTp1,
      toManual: tp1Form.toManual,
      nextWashText: tp1Form.nextWashText || "",
      createdAt: now.toISOString(),
      text,
    };

    setTp1Entries((prev) => sortTp1MovementEntries([...prev, entry]));
    setTp1Form((prev) => ({
      ...prev,
      trainSet: "",
      trAtTp1: "",
      trLocalized: "",
      automaticStablingRoad: "",
      trainPrepCompletedTime: "",
      pstPerformedTime: "",
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
    const lines = sortTp1MovementEntries(tp1Entries).map((entry) => sortTp1MovementTextLinesByTime(entry.text));
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

  const handleDownloadTp1AutomaticExcel = () => {
    const completedByDc = String(tp1Form.completedByDc || "").trim();
    const exportLines = buildTp1AutomaticPSTExportLines(tp1Entries);

    if (!exportLines.length) {
      alert("No Automatic Area PST or Train Prep log to export yet.");
      return;
    }

    if (!completedByDc) {
      alert("Please enter Completed By DC name before downloading the Excel file.");
      return;
    }

    downloadTp1AutomaticExcelExport(tp1Entries, completedByDc);
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
          <span style={{ color: tidColor }}>{entry.reason || ""}</span>
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
      {type === "download" && <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}
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
                  onChange={(e) => {
            updateMovementForm(operation, "trainId", e.target.value.replace(/\D/g, ""));
            scheduleFlowInputSettled(getMovementFlowInputKey(operation, "trainId"));
          }}
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
                  onChange={(e) => {
          updateMovementForm(operation, "tid", e.target.value.replace(/\D/g, ""));
          scheduleFlowInputSettled(getMovementFlowInputKey(operation, "tid"));
        }}
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
                    onChange={(e) => {
          updateMovementForm(operation, "swapReason", e.target.value);
          scheduleFlowInputSettled(getMovementFlowInputKey(operation, "swapReason"));
        }}
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
                      onChange={(e) => {
            updateMovementForm(operation, "replacedBy", e.target.value.replace(/\D/g, ""));
            scheduleFlowInputSettled(getMovementFlowInputKey(operation, "replacedBy"));
          }}
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


  const resetMovementFlow = (operation) => {
    captureMovementScrollPosition();
    setFocusedFlowInput("");
    setFlowSettledInputs({});
    setForms((prev) => ({
      ...prev,
      [operation]: createDefaultMovementForms()[operation],
    }));
  };

  const isMovementTimeReady = (current = {}) => {
    if (current.timingMode !== "custom") return true;
    return isCompleteMovementTimeInput(current.customTime);
  };

  const renderMovementTimeFlowInput = (operation) => {
    const current = getMovementForm(operation);
    const isNow = current.timingMode !== "custom";
    const currentDisplay = isNow ? `${clockText} hrs` : `${current.customTime || "00:00"} hrs`;
    const fieldKey = getMovementFlowInputKey(operation, "customTime");

    return (
      <div className="flex h-8 w-full items-center overflow-hidden rounded-lg border border-[#1e4060] bg-[#061827] shadow-[0_0_14px_rgba(79,142,247,0.10),inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-[#4f8ef7]">
        <button
          type="button"
          onClick={() => setMovementTimingMode(operation, "now")}
          className={`flex h-full shrink-0 items-center justify-center px-2 text-[11px] font-medium transition-all ${isNow ? "text-white" : "text-[#6fa8df] hover:text-white"}`}
        >
          Now
        </button>
        <div className="h-5 w-px shrink-0 bg-[#244b6b]" />
        <button
          type="button"
          onClick={() => setMovementTimingMode(operation, "custom")}
          className={`flex h-full shrink-0 items-center justify-center px-2 text-[11px] font-medium transition-all ${!isNow ? "text-white" : "text-[#6fa8df] hover:text-white"}`}
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
              onFocus={() => focusFlowInput(fieldKey)}
              onKeyDown={(e) => {
                const value = String(current.customTime || "");
                const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                  return;
                }
                if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                  e.preventDefault();
                  updateMovementForm(operation, "customTime", value.slice(0, -2));
                }
              }}
              onChange={(e) => {
                updateMovementForm(operation, "customTime", cleanMovementCustomTimeInput(e.target.value));
                scheduleFlowInputSettled(fieldKey);
              }}
              onBlur={(e) => {
                updateMovementForm(operation, "customTime", normalizeMovementCustomTimeInput(e.target.value));
                blurFlowInput(fieldKey);
              }}
              placeholder="00:00"
              className="h-full min-w-[42px] flex-1 bg-transparent text-[11px] font-medium text-white outline-none placeholder:text-[#31516b]"
            />
            <span className="shrink-0 text-[11px] font-medium text-[#c8d8ea]">hrs</span>
          </div>
        )}
      </div>
    );
  };

  const renderMovementAutomaticFlowCard = (operation) => {
    const meta = OPERATION_META[operation];
    const current = getMovementForm(operation);
    const selectedRoads = getMovementRoads(current.depot);
    const isInsertion = operation === "insertion";
    const isRemoval = operation === "removal";
    const isSwapping = operation === "swapping";
    const accent = meta.accent;
    const inputClass = "h-8 w-full rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] focus:border-[#4f8ef7]";
    const glowInputBoxClass = "flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7bc4] bg-[#061827] px-2 shadow-[0_0_12px_rgba(79,142,247,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all focus-within:border-[#7ab7ff] focus-within:shadow-[0_0_16px_rgba(79,142,247,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]";
    const trainReady = Boolean(normalizeMovementTrain(current.trainId)) && isMovementFlowFieldSettled(operation, "trainId");
    const timingReady = trainReady && isMovementTimeReady(current) && isMovementFlowFieldSettled(operation, "customTime");
    const depotReady = timingReady && Boolean(current.depot);
    const roadReady = !isInsertion || (depotReady && Boolean(current.road || selectedRoads[0]));
    const reasonReady = isSwapping && depotReady && Boolean(String(current.swapReason || "").trim()) && isMovementFlowFieldSettled(operation, "swapReason");
    const replacementReady = isSwapping && reasonReady && Boolean(normalizeMovementTrain(current.replacedBy)) && isMovementFlowFieldSettled(operation, "replacedBy");
    const requiredReady = isSwapping ? replacementReady : roadReady;

    const trainInput = () => (
      <div className={glowInputBoxClass}>
        <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
        <input
          value={current.trainId}
          onFocus={() => focusFlowInput(getMovementFlowInputKey(operation, "trainId"))}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onChange={(e) => updateMovementFlowTextField(operation, "trainId", e.target.value.replace(/\D/g, ""))}
          onBlur={() => blurFlowInput(getMovementFlowInputKey(operation, "trainId"))}
          placeholder="25"
          className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
        />
      </div>
    );

    const depotInput = () => (
      <div className="grid grid-cols-2 gap-1.5">
        {renderDepotButton({ operation, depot: "west", label: "West Depot", accent: "#8b5cf6" })}
        {renderDepotButton({ operation, depot: "east", label: "East Depot", accent: "#06d4e8" })}
      </div>
    );

    const roadInput = () => (
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
    );

    const tidInput = () => (
      <input
        value={current.tid}
        onFocus={() => focusFlowInput(getMovementFlowInputKey(operation, "tid"))}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onChange={(e) => updateMovementFlowTextField(operation, "tid", e.target.value.replace(/\D/g, ""))}
        onBlur={() => blurFlowInput(getMovementFlowInputKey(operation, "tid"))}
        placeholder="Optional, e.g. 101"
        className={inputClass}
      />
    );

    const reasonInput = () => (
      <input
        value={current.swapReason}
        onFocus={() => focusFlowInput(getMovementFlowInputKey(operation, "swapReason"))}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onChange={(e) => updateMovementFlowTextField(operation, "swapReason", e.target.value)}
        onBlur={() => blurFlowInput(getMovementFlowInputKey(operation, "swapReason"))}
        placeholder="e.g. RST PM"
        className={inputClass}
      />
    );

    const replacementInput = () => (
      <div className={glowInputBoxClass}>
        <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
        <input
          value={current.replacedBy}
          onFocus={() => focusFlowInput(getMovementFlowInputKey(operation, "replacedBy"))}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onChange={(e) => updateMovementFlowTextField(operation, "replacedBy", e.target.value.replace(/\D/g, ""))}
          onBlur={() => blurFlowInput(getMovementFlowInputKey(operation, "replacedBy"))}
          placeholder="30"
          className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
        />
      </div>
    );

    const steps = [
      { key: "trainId", label: "Train ID", visible: true, complete: trainReady, render: trainInput },
      { key: "timing", label: "Timing", visible: trainReady, complete: timingReady, render: () => renderMovementTimeFlowInput(operation) },
      { key: "depot", label: "Depot", visible: timingReady, complete: depotReady, render: depotInput },
    ];

    if (isInsertion) {
      steps.push(
        { key: "road", label: "Stabling Road", visible: depotReady, complete: roadReady, render: roadInput },
        { key: "tid", label: "TID Optional", visible: roadReady, optional: true, complete: Boolean(String(current.tid || "").trim()), render: tidInput }
      );
    }

    if (isRemoval) {
      steps.push({ key: "tid", label: "TID Optional", visible: depotReady, optional: true, complete: Boolean(String(current.tid || "").trim()), render: tidInput });
    }

    if (isSwapping) {
      steps.push(
        { key: "swapReason", label: "Reason Swap", visible: depotReady, complete: reasonReady, render: reasonInput },
        { key: "replacedBy", label: "Replaced By Train", visible: reasonReady, complete: replacementReady, render: replacementInput }
      );
    }

    const visibleSteps = steps.filter((step) => step.visible);

    const renderMovementFlowStepCard = (step, index) => (
      <div
        key={step.key}
        className="rounded-xl border p-2 transition-all"
        style={{
          borderColor: step.complete ? `${accent}70` : "#1e4060",
          background: step.complete ? `linear-gradient(135deg, ${accent}14, #061827 82%)` : "#061827",
          boxShadow: step.complete ? `0 0 10px ${accent}12, inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-1.5">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.07em]" style={{ borderColor: step.complete ? `${accent}80` : "#244761", color: step.complete ? accent : "#7ea6c2", backgroundColor: step.complete ? `${accent}10` : "#061827" }}>
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-normal" style={{ borderColor: step.complete ? `${accent}80` : "#31516b" }}>{index + 1}</span>
            <span className="truncate">{step.label}</span>
          </span>
          <span className="shrink-0 text-[9px] font-black" style={{ color: step.complete ? accent : "#4a8ab5" }}>
            {step.complete ? "DONE" : step.optional ? "OPTIONAL" : "NEXT"}
          </span>
        </div>
        {step.render()}
      </div>
    );

    const renderMovementFlowRows = (items) => (
      <div className="grid gap-y-2">
        {items.reduce((rows, _step, index) => {
          if (index % 2 === 0) rows.push(items.slice(index, index + 2));
          return rows;
        }, []).map((pair, pairIndex) => {
          const leftToRight = pairIndex % 2 === 0;
          const firstIndex = pairIndex * 2;
          const secondIndex = firstIndex + 1;
          const first = pair[0];
          const second = pair[1];
          const leftStep = leftToRight ? first : second;
          const rightStep = leftToRight ? second : first;
          const leftIndex = leftToRight ? firstIndex : secondIndex;
          const rightIndex = leftToRight ? secondIndex : firstIndex;
          const arrow = second ? (leftToRight ? "→" : "←") : "";

          return (
            <div key={`movement-flow-row-${pairIndex}`} className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-x-1.5">
              <div>{leftStep ? renderMovementFlowStepCard(leftStep, leftIndex) : null}</div>
              <div className="flex items-center justify-center">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full border text-[17px] font-black leading-none"
                  style={{
                    opacity: arrow ? 1 : 0,
                    borderColor: `${accent}55`,
                    backgroundColor: `${accent}10`,
                    color: accent,
                  }}
                >
                  {arrow || "→"}
                </span>
              </div>
              <div>{rightStep ? renderMovementFlowStepCard(rightStep, rightIndex) : null}</div>
            </div>
          );
        })}
      </div>
    );

    return (
      <section
        className="overflow-hidden rounded-xl border shadow-[0_14px_28px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{ borderColor: `${accent}42`, background: "linear-gradient(180deg,#061827 0%,#041727 100%)" }}
      >
        <div className="border-b px-3 py-2" style={{ borderColor: `${accent}30`, backgroundColor: `${accent}0d` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-white">{meta.title} Automatic Flow</p>
              <p className="text-[10px] font-semibold text-[#8ea8c0]">Next pill appears immediately while typing continues.</p>
            </div>
            <button
              type="button"
              onClick={() => resetMovementFlow(operation)}
              className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] shadow-[0_0_14px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.03]"
              style={{ borderColor: "rgba(248,113,113,0.85)", backgroundColor: "rgba(127,29,29,0.36)", color: "#fecaca" }}
              title={`Reset ${meta.title} Flow`}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-3">
          {renderMovementFlowRows(visibleSteps)}

          <div className="rounded-lg border border-[#1e4060] bg-[#061827] px-3 py-2">
            <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[#4a8ab5]">Preview</p>
            <p className="overflow-x-auto whitespace-nowrap font-mono text-[12px] font-medium leading-snug text-[#c8d8ea]">
              {buildMovementPreview(operation)}
            </p>
          </div>

          {requiredReady && (
            <button
              type="button"
              onClick={() => addMovementLog(operation)}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium text-white shadow-[0_0_16px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.01]"
              style={{ borderColor: `${accent}9a`, backgroundColor: `${accent}33` }}
            >
              <span className="text-[12px] leading-none">+</span> {meta.buttonLabel}
            </button>
          )}
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
              onClick={() => copyDepotLogs(depot, operation)}
              className="flex min-w-[78px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02]"
              style={{ borderColor: `${meta.accent}55`, color: meta.accent, backgroundColor: `${meta.accent}14` }}
            >
              <MovementIcon type="copy" />{getCopyButtonLabel(depot, operation, "Copy All")}
            </button>
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
          {renderMovementAutomaticFlowCard(operation)}

          <div className="grid content-start gap-3">
            {renderTrainMovementOperationLogTable({ depot: "west", operation, accent: "#8b5cf6", logs: westLogs })}
            {renderTrainMovementOperationLogTable({ depot: "east", operation, accent: "#06d4e8", logs: eastLogs })}
          </div>
        </div>
      </section>
    );
  };

  const tp1LiveStatusText = !tp1LiveDbReady
    ? "Local only"
    : tp1LiveSyncError
    ? "Sync issue"
    : tp1LiveSyncing
    ? "Syncing..."
    : tp1LiveLastSynced
    ? `Live synced ${formatTime(tp1LiveLastSynced)}`
    : "Live ready";

  const tp1LiveStatusClass = !tp1LiveDbReady || tp1LiveSyncError
    ? "border-amber-600/50 bg-amber-950/30 text-amber-300"
    : "border-emerald-600/50 bg-emerald-950/30 text-emerald-300";

  const renderTp1MovementWindow = () => {
    const movementType = getTp1MovementType();
    const isAutomatic = movementType === "automatic";
    const accent = isAutomatic ? "#22c55e" : "#f59e0b";
    const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#58a6ff]";
    const inputClass = "h-8 w-full rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] focus:border-[#4f8ef7]";
    const glowInputBoxClass = "flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7bc4] bg-[#061827] px-2 shadow-[0_0_12px_rgba(79,142,247,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all focus-within:border-[#7ab7ff] focus-within:shadow-[0_0_16px_rgba(79,142,247,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]";
    const timeInputBoxClass = "flex h-8 w-full items-center gap-1.5 rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus-within:border-[#4f8ef7]";

    const renderTp1TimeInput = (field, disabled = false) => {
      const fieldKey = getTp1FlowInputKey(field);
      return (
        <div className={`${timeInputBoxClass} ${disabled ? "cursor-not-allowed opacity-35" : ""}`}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={tp1Form[field]}
            onFocus={() => focusFlowInput(fieldKey)}
            onKeyDown={(e) => {
              const value = String(tp1Form[field] || "");
              const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
              if (e.key === "Enter") {
                e.currentTarget.blur();
                return;
              }
              if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                e.preventDefault();
                updateTp1MovementForm(field, value.slice(0, -2));
              }
            }}
            onChange={(e) => {
              updateTp1MovementForm(field, cleanTp1MovementTimeInput(e.target.value));
              scheduleFlowInputSettled(fieldKey);
            }}
            onBlur={(e) => {
              updateTp1MovementForm(field, normalizeMovementCustomTimeInput(e.target.value));
              blurFlowInput(fieldKey);
            }}
            placeholder="00:00"
            disabled={disabled}
            className="h-full min-w-0 flex-1 bg-transparent text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] disabled:cursor-not-allowed"
          />
          <span className="shrink-0 text-[10px] font-medium text-[#8ea8c0]">hrs</span>
        </div>
      );
    };

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

    const isTp1TimeReady = (field) => isCompleteMovementTimeInput(tp1Form[field]) && isTp1FlowFieldSettled(field);

    const automaticTrainSetReady = Boolean(normalizeMovementTrain(tp1Form.trainSet)) && isTp1FlowFieldSettled("trainSet");
    const automaticPlanReady = automaticTrainSetReady && Boolean(tp1Form.planStatus);
    const automaticTrAtTp1Ready = automaticPlanReady && isTp1TimeReady("trAtTp1");
    const automaticShunterReady = automaticTrAtTp1Ready && Boolean(tp1Form.shunterName);
    const automaticTrLocalizedReady = automaticShunterReady && isTp1TimeReady("trLocalized");
    const automaticStablingReady = automaticTrLocalizedReady && Boolean(tp1Form.automaticStablingRoad);
    const automaticTrainPrepReady = automaticStablingReady && isTp1TimeReady("trainPrepCompletedTime");
    const automaticPstReady = automaticTrainPrepReady && isTp1TimeReady("pstPerformedTime");
    const automaticCompletedDcReady = automaticPstReady && Boolean(String(tp1Form.completedByDc || "").trim()) && isTp1FlowFieldSettled("completedByDc");

    const automaticFlowSteps = [
      {
        key: "trainSet",
        label: "Train Set",
        visible: true,
        complete: automaticTrainSetReady,
        render: () => (
          <div className={glowInputBoxClass}>
            <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
            <input
              value={tp1Form.trainSet}
              onFocus={() => focusFlowInput(getTp1FlowInputKey("trainSet"))}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              onChange={(e) => {
                updateTp1MovementForm("trainSet", e.target.value.replace(/\D/g, ""));
                scheduleFlowInputSettled(getTp1FlowInputKey("trainSet"));
              }}
              onBlur={() => blurFlowInput(getTp1FlowInputKey("trainSet"))}
              placeholder="19"
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
            />
          </div>
        ),
      },
      {
        key: "planStatus",
        label: "Plan / Unplanned",
        visible: automaticTrainSetReady,
        complete: automaticPlanReady,
        render: () => (
          <select
            value={tp1Form.planStatus}
            onChange={(e) => updateTp1MovementForm("planStatus", e.target.value)}
            className={inputClass}
          >
            <option value="Planned">Planned</option>
            <option value="Unplanned">Unplanned</option>
          </select>
        ),
      },
      {
        key: "trAtTp1",
        label: "TR at TP1",
        visible: automaticPlanReady,
        complete: automaticTrAtTp1Ready,
        render: () => renderTp1TimeInput("trAtTp1"),
      },
      {
        key: "shunterName",
        label: "Shunter Name",
        visible: automaticTrAtTp1Ready,
        complete: automaticShunterReady,
        render: () => (
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
        ),
      },
      {
        key: "trLocalized",
        label: "TR Localized",
        visible: automaticShunterReady,
        complete: automaticTrLocalizedReady,
        render: () => renderTp1TimeInput("trLocalized"),
      },
      {
        key: "automaticStablingRoad",
        label: "Stabling",
        visible: automaticTrLocalizedReady,
        complete: automaticStablingReady,
        render: () => (
          <select
            value={tp1Form.automaticStablingRoad || ""}
            onChange={(e) => updateTp1MovementForm("automaticStablingRoad", e.target.value)}
            className={inputClass}
          >
            <option value="">Select STB</option>
            {TP1_AUTOMATIC_STABLING_OPTIONS.map((road) => (
              <option key={road} value={road}>{road}</option>
            ))}
          </select>
        ),
      },
      {
        key: "trainPrepCompletedTime",
        label: "Train Prep Completed",
        visible: automaticStablingReady,
        complete: automaticTrainPrepReady,
        render: () => renderTp1TimeInput("trainPrepCompletedTime"),
      },
      {
        key: "pstPerformedTime",
        label: "PST Performed",
        visible: automaticTrainPrepReady,
        complete: automaticPstReady,
        render: () => renderTp1TimeInput("pstPerformedTime"),
      },
      {
        key: "completedByDc",
        label: "Completed By DC",
        visible: automaticPstReady,
        complete: automaticCompletedDcReady,
        render: () => (
          <input
            type="text"
            value={tp1Form.completedByDc || ""}
            onFocus={() => focusFlowInput(getTp1FlowInputKey("completedByDc"))}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onChange={(e) => {
              updateTp1MovementForm("completedByDc", e.target.value);
              scheduleFlowInputSettled(getTp1FlowInputKey("completedByDc"));
            }}
            onBlur={() => blurFlowInput(getTp1FlowInputKey("completedByDc"))}
            placeholder="DC name"
            className={inputClass}
          />
        ),
      },
      {
        key: "nextWashText",
        label: "Next Wash Optional",
        visible: automaticCompletedDcReady,
        complete: Boolean(String(tp1Form.nextWashText || "").trim()),
        render: () => (
          <input
            type="text"
            maxLength={19}
            value={tp1Form.nextWashText || ""}
            onFocus={() => focusFlowInput(getTp1FlowInputKey("nextWashText"))}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onChange={(e) => {
              updateTp1MovementForm("nextWashText", e.target.value);
              scheduleFlowInputSettled(getTp1FlowInputKey("nextWashText"));
            }}
            onBlur={() => blurFlowInput(getTp1FlowInputKey("nextWashText"))}
            placeholder="28-05-2026 12:23:00"
            className={inputClass}
          />
        ),
      },
    ];

    const visibleAutomaticFlowSteps = automaticFlowSteps.filter((step) => step.visible);

    const manualTrainSetReady = Boolean(normalizeMovementTrain(tp1Form.trainSet)) && isTp1FlowFieldSettled("trainSet");
    const manualPlanReady = manualTrainSetReady && Boolean(tp1Form.planStatus);
    const manualTrAtTp1Ready = manualPlanReady && isTp1TimeReady("trAtTp1");
    const manualShunterReady = manualTrAtTp1Ready && Boolean(tp1Form.shunterName);
    const manualFromTp1Ready = manualShunterReady && isTp1TimeReady("fromTp1");
    const manualToManualReady = manualFromTp1Ready && isTp1TimeReady("toManual");

    const manualFlowSteps = [
      {
        key: "trainSet",
        label: "Train Set",
        visible: true,
        complete: manualTrainSetReady,
        render: () => (
          <div className={glowInputBoxClass}>
            <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
            <input
              value={tp1Form.trainSet}
              onFocus={() => focusFlowInput(getTp1FlowInputKey("trainSet"))}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              onChange={(e) => {
                updateTp1MovementForm("trainSet", e.target.value.replace(/\D/g, ""));
                scheduleFlowInputSettled(getTp1FlowInputKey("trainSet"));
              }}
              onBlur={() => blurFlowInput(getTp1FlowInputKey("trainSet"))}
              placeholder="19"
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
            />
          </div>
        ),
      },
      {
        key: "planStatus",
        label: "Plan / Unplanned",
        visible: manualTrainSetReady,
        complete: manualPlanReady,
        render: () => (
          <select
            value={tp1Form.planStatus}
            onChange={(e) => updateTp1MovementForm("planStatus", e.target.value)}
            className={inputClass}
          >
            <option value="Planned">Planned</option>
            <option value="Unplanned">Unplanned</option>
          </select>
        ),
      },
      {
        key: "trAtTp1",
        label: "TR at TP1",
        visible: manualPlanReady,
        complete: manualTrAtTp1Ready,
        render: () => renderTp1TimeInput("trAtTp1"),
      },
      {
        key: "shunterName",
        label: "Shunter Name",
        visible: manualTrAtTp1Ready,
        complete: manualShunterReady,
        render: () => (
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
        ),
      },
      {
        key: "fromTp1",
        label: "From TP1",
        visible: manualShunterReady,
        complete: manualFromTp1Ready,
        render: () => renderTp1TimeInput("fromTp1"),
      },
      {
        key: "toManual",
        label: "to Manual",
        visible: manualFromTp1Ready,
        complete: manualToManualReady,
        render: () => renderTp1TimeInput("toManual"),
      },
      {
        key: "nextWashText",
        label: "Next Wash Optional",
        visible: manualToManualReady,
        complete: Boolean(String(tp1Form.nextWashText || "").trim()),
        render: () => (
          <input
            type="text"
            maxLength={19}
            value={tp1Form.nextWashText || ""}
            onFocus={() => focusFlowInput(getTp1FlowInputKey("nextWashText"))}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onChange={(e) => {
              updateTp1MovementForm("nextWashText", e.target.value);
              scheduleFlowInputSettled(getTp1FlowInputKey("nextWashText"));
            }}
            onBlur={() => blurFlowInput(getTp1FlowInputKey("nextWashText"))}
            placeholder="28-05-2026 12:23:00"
            className={inputClass}
          />
        ),
      },
    ];

    const visibleManualFlowSteps = manualFlowSteps.filter((step) => step.visible);

    const renderTp1FlowStepCard = (step, index) => (
      <div
        key={step.key}
        className="rounded-xl border p-2 transition-all"
        style={{
          borderColor: step.complete ? `${accent}70` : "#1e4060",
          background: step.complete ? `linear-gradient(135deg, ${accent}14, #061827 82%)` : "#061827",
          boxShadow: step.complete ? `0 0 10px ${accent}12, inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-1.5">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.07em]" style={{ borderColor: step.complete ? `${accent}80` : "#244761", color: step.complete ? accent : "#7ea6c2", backgroundColor: step.complete ? `${accent}10` : "#061827" }}>
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-normal" style={{ borderColor: step.complete ? `${accent}80` : "#31516b" }}>{index + 1}</span>
            <span className="truncate">{step.label}</span>
          </span>
          <span className="shrink-0 text-[9px] font-black" style={{ color: step.complete ? accent : "#4a8ab5" }}>{step.complete ? "DONE" : "NEXT"}</span>
        </div>
        {step.render()}
      </div>
    );

    const renderTp1FlowRows = (items) => (
      <div className="grid gap-y-2">
        {items.reduce((rows, _step, index) => {
          if (index % 2 === 0) rows.push(items.slice(index, index + 2));
          return rows;
        }, []).map((pair, pairIndex) => {
          const leftToRight = pairIndex % 2 === 0;
          const firstIndex = pairIndex * 2;
          const secondIndex = firstIndex + 1;
          const first = pair[0];
          const second = pair[1];
          const leftStep = leftToRight ? first : second;
          const rightStep = leftToRight ? second : first;
          const leftIndex = leftToRight ? firstIndex : secondIndex;
          const rightIndex = leftToRight ? secondIndex : firstIndex;
          const arrow = second ? (leftToRight ? "→" : "←") : "";

          return (
            <div key={`movement-flow-row-${pairIndex}`} className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-x-1.5">
              <div>{leftStep ? renderTp1FlowStepCard(leftStep, leftIndex) : null}</div>
              <div className="flex items-center justify-center">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full border text-[17px] font-black leading-none"
                  style={{
                    opacity: arrow ? 1 : 0,
                    borderColor: `${accent}55`,
                    backgroundColor: `${accent}10`,
                    color: accent,
                  }}
                >
                  {arrow || "→"}
                </span>
              </div>
              <div>{rightStep ? renderTp1FlowStepCard(rightStep, rightIndex) : null}</div>
            </div>
          );
        })}
      </div>
    );

    const renderTp1ZigZagFlowCard = ({ title, subtitle, steps, onReset, resetTitle }) => (
      <div className="rounded-xl border border-[#1e4060] bg-[#031827] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.12em] text-white">{title}</p>
            <p className="text-[10px] font-semibold text-[#8ea8c0]">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border px-2 py-0.5 text-[9px] font-black" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}16`, color: accent }}>
              L ↔ R
            </span>
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] shadow-[0_0_14px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.03]"
              style={{ borderColor: "rgba(248,113,113,0.85)", backgroundColor: "rgba(127,29,29,0.36)", color: "#fecaca" }}
              title={resetTitle}
            >
              Reset
            </button>
          </div>
        </div>

        {renderTp1FlowRows(steps)}
      </div>
    );

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
            <span className={`rounded-md border px-2 py-1 text-[10px] font-black ${tp1LiveStatusClass}`} title={tp1LiveDebug || tp1LiveStatusText}>
              {tp1LiveStatusText}
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            {renderTypeButton("automatic", "Automatic Area", "Fill TR Localized", "#22c55e")}
            {renderTypeButton("manual", "Manual Area", "Fill From TP1 + to Manual", "#f59e0b")}
          </div>

          {isAutomatic
            ? renderTp1ZigZagFlowCard({
                title: "Automatic Flow",
                subtitle: "Compact flow. Next pill appears immediately while typing continues.",
                steps: visibleAutomaticFlowSteps,
                onReset: resetTp1AutomaticFlow,
                resetTitle: "Reset Automatic Flow",
              })
            : renderTp1ZigZagFlowCard({
                title: "Manual Flow",
                subtitle: "Compact flow. Next pill appears immediately while typing continues.",
                steps: visibleManualFlowSteps,
                onReset: resetTp1ManualFlow,
                resetTitle: "Reset Manual Flow",
              })}

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
                {isAutomatic && (
                  <button
                    type="button"
                    onClick={handleDownloadTp1AutomaticExcel}
                    className="flex min-w-[78px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold shadow-[0_0_14px_rgba(34,197,94,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.02]"
                    style={{ borderColor: "rgba(74,222,128,0.82)", color: "#86efac", backgroundColor: "rgba(20,83,45,0.32)" }}
                    title="Download Automatic Area PST / Train Prep Excel"
                  >
                    <MovementIcon type="download" />Excel
                  </button>
                )}
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
                sortTp1MovementEntries(tp1Entries).map((entry) => (
                  <div key={entry.id} className="group flex items-start gap-2 border-b border-[#12304a]/55 px-3 py-2 last:border-b-0">
                    <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] font-semibold leading-[1.32] tracking-[-0.01em] text-[#f4f8ff]">{sortTp1MovementTextLinesByTime(entry.text)}</pre>
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
  prepState = {},
  logLines = [],
} = {}) {
  // Excel export must follow the visible PST / Train Prep table, not only the saved logLines.
  // This prevents a refreshed or synced screen from exporting an incomplete Excel file.
  const existingPstByKey = new Map(
    (Array.isArray(logLines) ? logLines : [])
      .filter((entry) => entry?.type === "PST" && entry?.key)
      .map((entry) => [entry.key, entry])
  );
  const existingPrepByKey = new Map(
    (Array.isArray(logLines) ? logLines : [])
      .filter((entry) => entry?.type === "Prep" && entry?.key)
      .map((entry) => [entry.key, entry])
  );

  const exportLines = [];

  const collectDepot = (depot, roads, data) => {
    roads.forEach((road) => {
      const blocks = Array.isArray(data?.[road]) ? data[road] : [];

      blocks.forEach((block, bi) => {
        const cellKey = `${road}-${bi}`;
        const trainKey = padTrainId(normalizeTrainId(block?.trainId || ""));
        if (!trainKey) return;

        const depotLabel = depot === "west" ? "WD" : "ED";
        const roadFormatted = road.replace(/^(WD|ED)-/, `${depotLabel}\u2013`);

        const pst = pstState?.[cellKey];
        const pstMatchesTrain = !pst?.trainKey || padTrainId(normalizeTrainId(pst.trainKey)) === trainKey;
        if (pst?.done && pstMatchesTrain) {
          const logKey = `pst-${cellKey}`;
          const oldEntry = existingPstByKey.get(logKey);
          const oldTrainKey = padTrainId(normalizeTrainId(oldEntry?.trainKey || ""));
          const sameTrain = oldTrainKey === trainKey;

          const startTime = pst.startTime || (sameTrain ? oldEntry?.startTime : "") || "";
          const endTime = pst.endTime || (sameTrain ? oldEntry?.endTime : "") || "";
          const alarmStatus = pst.alarmStatus || (sameTrain ? oldEntry?.alarmStatus : "") || "no_alarm";
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
        }

        const prep = prepState?.[cellKey];
        const prepMatchesTrain = !prep?.trainKey || padTrainId(normalizeTrainId(prep.trainKey)) === trainKey;
        if (prep?.done && prepMatchesTrain) {
          const logKey = `prep-${cellKey}`;
          const oldEntry = existingPrepByKey.get(logKey);
          const oldTrainKey = padTrainId(normalizeTrainId(oldEntry?.trainKey || ""));
          const sameTrain = oldTrainKey === trainKey;

          const endTime = prep.endTime || prep.time || (sameTrain ? (oldEntry?.endTime || oldEntry?.time || oldEntry?.startTime) : "") || "";
          const taName = (prep.taName || (sameTrain ? oldEntry?.taName : "") || "").toString().trim();
          const formattedTaName = formatTACompletedBy(taName);
          const taStr = formattedTaName ? ` Performed by ${formattedTaName}` : "";
          const generatedText = `${endTime} hrs \u2013  ${trainKey} Train preparation completed at ${roadFormatted}.${taStr}`;

          exportLines.push({
            ...(sameTrain ? oldEntry : {}),
            key: logKey,
            text: generatedText,
            type: "Prep",
            depot,
            road,
            trainKey,
            startTime: "",
            time: endTime,
            endTime,
            taName,
          });
        }
      });
    });
  };

  collectDepot("west", WEST_ROADS, westData);
  collectDepot("east", EAST_ROADS, eastData);

  return sortPSTLogLinesByTime(exportLines);
}


function PSTTabContent
({ westData, eastData, maintenanceMap, pstState, prepState, logLines, onPSTTick, onPSTStartTimeChange, onPrepTick, onPrepCompletionTimeChange, onRemoveLog, onClearDepotLog, onClearDepotPSTOnly, onClearDepotPrepOnly, taNameState, onTaNameChange, completedByNames, onCompletedByChange, pstLiveStatusText, pstLiveStatusClass, pstLiveDebug }) {
  const [downloadingExcelDepot, setDownloadingExcelDepot] = useState("");
  const safeCompletedByNames = completedByNames || { west: "", east: "" };
  const sortedLogLines = sortPSTLogLinesByTime(logLines);
  const exportLogLines = buildPSTExportLinesFromVisibleState({
    westData,
    eastData,
    pstState,
    prepState,
    logLines: sortedLogLines,
  });

  const handleCompletedByChange = (depot, value) => {
    onCompletedByChange?.(depot, value);
  };

  const handleDownloadExcel = (depot) => {
    if (downloadingExcelDepot) return;

    const isCombinedDepot = depot === "combined" || depot === "all" || depot === "";
    const normalizedDepot = depot === "west" || depot === "east" ? depot : "";
    const downloadKey = isCombinedDepot ? "combined" : normalizedDepot;
    const depotLabel = isCombinedDepot ? "Combined West + East Depot" : normalizedDepot === "west" ? "West Depot" : "East Depot";
    const completedEntries = (exportLogLines || [])
      .filter((entry) => {
        if (!isPSTLogEntry(entry) && !isTrainPrepLogEntry(entry)) return false;
        return isCombinedDepot || getPSTDepotFromEntry(entry) === normalizedDepot;
      });
    const pstEntries = completedEntries.filter(isPSTLogEntry);

    if (completedEntries.length === 0) {
      alert(`No completed PST or Train Prep log to export for ${depotLabel} yet.`);
      return;
    }

    const completedBy = normalizeCompletedByNames(safeCompletedByNames);
    const hasWestPST = pstEntries.some((entry) => getPSTDepotFromEntry(entry) === "west");
    const hasEastPST = pstEntries.some((entry) => getPSTDepotFromEntry(entry) === "east");

    if (!isCombinedDepot && pstEntries.length > 0 && !completedBy[normalizedDepot]) {
      alert(`Please enter ${depotLabel} completed by name before downloading the Excel file.`);
      return;
    }

    if (isCombinedDepot && hasWestPST && !completedBy.west) {
      alert("Please enter West Depot completed by name before downloading the combined Excel file.");
      return;
    }

    if (isCombinedDepot && hasEastPST && !completedBy.east) {
      alert("Please enter East Depot completed by name before downloading the combined Excel file.");
      return;
    }

    try { localStorage.setItem("pstExcelCompletedByNames", JSON.stringify(completedBy)); } catch {}
    setDownloadingExcelDepot(downloadKey);

    try {
      downloadPSTExcelExport(exportLogLines, completedBy, normalizedDepot);
    } catch (error) {
      console.error("PST Excel export failed:", error);
      alert("Unable to create Excel export. Please try again.");
    } finally {
      setDownloadingExcelDepot("");
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
    <div className="flex flex-col lg:flex-row gap-5 w-fit items-start">
      <div className="flex flex-col gap-5 min-w-0 shrink-0">
        <div className="space-y-5 min-w-0">
          <PSTStablingSection title="WEST DEPOT — PST / TRAIN PREP" blockLabels={["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"]} blockIndices={[6,5,4,3,2,1,0]} roads={WEST_ROADS} data={westData} labelSide="left" maintenanceMap={maintenanceMap} pstState={pstState} prepState={prepState} onPSTTick={onPSTTick} onPSTStartTimeChange={onPSTStartTimeChange} onPrepTick={onPrepTick} onPrepCompletionTimeChange={onPrepCompletionTimeChange} taNameState={taNameState} onTaNameChange={onTaNameChange} onClearPST={() => onClearDepotPSTOnly?.("west")} onClearPrep={() => onClearDepotPrepOnly?.("west")} />
          <PSTStablingSection title="EAST DEPOT — PST / TRAIN PREP" blockLabels={["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"]} blockIndices={[0,1,2,3,4,5,6]} roads={EAST_ROADS} data={eastData} labelSide="right" maintenanceMap={maintenanceMap} pstState={pstState} prepState={prepState} onPSTTick={onPSTTick} onPSTStartTimeChange={onPSTStartTimeChange} onPrepTick={onPrepTick} onPrepCompletionTimeChange={onPrepCompletionTimeChange} taNameState={taNameState} onTaNameChange={onTaNameChange} onClearPST={() => onClearDepotPSTOnly?.("east")} onClearPrep={() => onClearDepotPrepOnly?.("east")} />
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

          <div className="flex flex-col gap-2 lg:border-l lg:border-[#2b4f6b]/70 lg:pl-6">
            <button
              onClick={() => handleDownloadExcel("west")}
              disabled={Boolean(downloadingExcelDepot)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-5 text-[12px] font-semibold transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 sm:w-40"
              style={{
                background: "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(30,64,175,0.22))",
                borderColor: "rgba(88,166,255,0.62)",
                color: "#bfdbfe",
                boxShadow: "0 0 18px rgba(59,130,246,0.16), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
              title="Download West Depot only Excel"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadingExcelDepot === "west" ? "Preparing..." : "West Excel"}
            </button>

            <button
              onClick={() => handleDownloadExcel("east")}
              disabled={Boolean(downloadingExcelDepot)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-5 text-[12px] font-semibold transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 sm:w-40"
              style={{
                background: "linear-gradient(135deg, rgba(147,51,234,0.18), rgba(88,28,135,0.22))",
                borderColor: "rgba(192,132,252,0.62)",
                color: "#e9d5ff",
                boxShadow: "0 0 18px rgba(168,85,247,0.16), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
              title="Download East Depot only Excel"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadingExcelDepot === "east" ? "Preparing..." : "East Excel"}
            </button>


            <button
              onClick={() => handleDownloadExcel("combined")}
              disabled={Boolean(downloadingExcelDepot)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-5 text-[12px] font-semibold transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 sm:w-40"
              style={{
                background: "linear-gradient(135deg, rgba(20,184,166,0.18), rgba(14,116,144,0.22))",
                borderColor: "rgba(94,234,212,0.58)",
                color: "#ccfbf1",
                boxShadow: "0 0 18px rgba(20,184,166,0.16), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
              title="Download combined West + East Depot Excel"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadingExcelDepot === "combined" ? "Preparing..." : "Combined Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>

      <div className="pst-train-prep-log-font-bump w-full max-w-[900px] overflow-visible lg:w-[900px] lg:max-w-[900px] lg:shrink-0 lg:self-start lg:sticky lg:top-4">
        <style>{`
        /* PST / Train Prep Log output: auto-height, wider width, +2px text */
        .pst-train-prep-log-font-bump {
          height: auto !important;
          min-height: 0;
        }

        .pst-train-prep-log-font-bump .pst-log-shell {
          width: 100%;
          height: auto !important;
          min-height: 0;
        }

        .pst-train-prep-log-font-bump .pst-log-scroll {
          min-height: 0;
        }

        .pst-train-prep-log-font-bump .pst-plain-main-title {
          font-size: 16px !important;
          line-height: 1.1 !important;
        }

        .pst-train-prep-log-font-bump .pst-plain-main-count {
          font-size: 13px !important;
        }

        .pst-train-prep-log-font-bump .pst-plain-depot-title {
          font-size: 14px !important;
          line-height: 1.1 !important;
        }

        .pst-train-prep-log-font-bump .pst-plain-count,
        .pst-train-prep-log-font-bump .pst-plain-button {
          font-size: 12px !important;
        }

        .pst-train-prep-log-font-bump .pst-plain-title {
          font-size: 13px !important;
          line-height: 1.1 !important;
        }

        .pst-train-prep-log-font-bump .pst-plain-summary,
        .pst-train-prep-log-font-bump .pst-plain-train,
        .pst-train-prep-log-font-bump .pst-plain-row-text,
        .pst-train-prep-log-font-bump .pst-plain-empty {
          font-size: 13px !important;
          line-height: 1.45 !important;
        }

        .pst-train-prep-log-font-bump .pst-log-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .pst-train-prep-log-font-bump .pst-log-scroll::-webkit-scrollbar-track {
          background: rgba(7,24,40,0.9);
          border-radius: 999px;
        }

        .pst-train-prep-log-font-bump .pst-log-scroll::-webkit-scrollbar-thumb {
          background: rgba(88,166,255,0.38);
          border-radius: 999px;
        }
      `}</style>
        <PSTLogOutput logLines={sortedLogLines} onRemove={onRemoveLog} onClearDepot={onClearDepotLog} />
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


function TimetableHeaderControl({
  selectedType,
  activeTimetable,
  loading,
  saving,
  error,
  onTypeChange,
  onUpload,
  onDownload,
}) {
  const parsed = getActiveTimetableParsedData(activeTimetable);
  const fileLabel = activeTimetable?.fileName || activeTimetable?.sourceFileName || parsed?.sourceFileName || "No file stored";
  const hasFile = Boolean(activeTimetable);
  const summary = parsed?.summary;
  const totalRemoval = (summary?.removal?.west || 0) + (summary?.removal?.east || 0);
  const totalInsertion = (summary?.insertion?.west || 0) + (summary?.insertion?.east || 0);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#1a3a56] bg-[#071828] px-2 py-1.5 shadow-sm">
      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-300" />
      <select
        value={normalizeTimetableType(selectedType)}
        onChange={(event) => onTypeChange(event.target.value)}
        className="h-7 rounded-md border border-[#2b4f6b] bg-[#061827] px-2 text-[10px] font-black uppercase tracking-wide text-white outline-none focus:border-emerald-300/60"
        title="Select timetable to apply to Train Rem and Insertion"
      >
        {TIMETABLE_TYPES.map((type) => (
          <option key={type.key} value={type.key}>{type.label}</option>
        ))}
      </select>

      <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 text-[10px] font-black uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/18">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {saving ? "Saving" : "Upload"}
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={saving}
          onChange={onUpload}
        />
      </label>

      {hasFile && (
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#2b4f6b] bg-[#0a1e2e] px-2 text-[10px] font-black uppercase tracking-wide text-[#9bd0f1] transition hover:border-cyan-300/50 hover:bg-[#0f2d4a]"
          title="Download uploaded timetable Excel"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      )}

      <div className="min-w-[190px] max-w-[260px]">
        <div className={`truncate text-[10px] font-bold ${hasFile ? "text-emerald-200" : "text-amber-200"}`} title={fileLabel}>
          {loading ? "Loading timetable..." : fileLabel}
        </div>
        <div className="truncate text-[8.5px] font-semibold text-[#5d94bd]">
          {hasFile ? `Applied • REM ${totalRemoval} / INS ${totalInsertion}` : "Upload once, then reuse from storage"}
        </div>
      </div>

      {error && (
        <span className="max-w-[220px] truncate rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[9px] font-semibold text-red-100" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

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
            ? "bg-cyan-500/15 border-cyan-300/55 text-cyan-100 shadow-cyan-500/10"
            : "bg-[#071828] border-[#2b6f93] text-cyan-100 hover:bg-cyan-500/10 hover:border-cyan-300/55"
        }`}
      >
        <Bookmark className="w-3.5 h-3.5" />
        Bookmarks
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-2xl border border-[#1f4d6f] bg-[#071828] shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-[#1a3a56] bg-[#0b253d] px-4 py-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">External Links</p>
              <p className="mt-0.5 text-[10px] text-[#7eb8e0]">Outlook, SharePoint, SAP, and other shortcuts</p>
            </div>
            <button
              type="button"
              onClick={onStartAdd}
              className="flex items-center gap-1 rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <div className="max-h-[330px] overflow-y-auto p-2">
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
                No bookmark yet. Click <span className="font-bold text-cyan-200">Add</span> to create an external shortcut.
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
                      className={`group relative flex items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 py-1.5 transition ${theme.card}`}
                    >
                      <span className={`absolute left-0 top-0 h-full w-1 ${theme.strip}`} />
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-1.5 pl-1"
                      >
                        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${theme.icon}`}>
                          <Bookmark className="h-3 w-3" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-bold leading-5 text-white">{link.title}</span>
                        </span>
                        <ExternalLink className={`ml-auto h-3 w-3 flex-shrink-0 opacity-75 ${theme.linkIcon}`} />
                      </a>

                      <button
                        type="button"
                        onClick={() => onStartEdit(link)}
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-[#2b4f6b] bg-[#071828]/80 text-[#7eb8e0] transition hover:border-cyan-300/50 hover:text-white"
                        title="Edit bookmark"
                        aria-label={`Edit ${link.title}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(link)}
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-red-400/20 bg-red-500/5 text-red-200 transition hover:border-red-300/50 hover:bg-red-500/15"
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
    <div className="mb-2 rounded-xl border border-cyan-300/35 bg-cyan-500/10 p-3">
      <div className="grid gap-2">
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
          Name
          <input
            value={draft.title}
            onChange={(event) => onDraftChange("title", event.target.value)}
            placeholder="Outlook"
            className="h-8 rounded-lg border border-[#2b4f6b] bg-[#071828] px-2 text-[12px] font-medium normal-case tracking-normal text-white outline-none transition placeholder:text-[#4a8ab5] focus:border-cyan-300/60"
          />
        </label>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
          URL
          <input
            value={draft.url}
            onChange={(event) => onDraftChange("url", event.target.value)}
            placeholder="https://outlook.office.com"
            className="h-8 rounded-lg border border-[#2b4f6b] bg-[#071828] px-2 text-[12px] font-medium normal-case tracking-normal text-white outline-none transition placeholder:text-[#4a8ab5] focus:border-cyan-300/60"
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
          className="rounded-lg border border-cyan-300/45 bg-cyan-500/15 px-3 py-1.5 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Bookmark"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────


function AdminAutoResizeTextarea({ value, onChange, placeholder }) {
  const textareaRef = useRef(null);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight + 10, 112), 620);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 620 ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        window.requestAnimationFrame(resizeTextarea);
      }}
      onInput={resizeTextarea}
      onFocus={resizeTextarea}
      placeholder={placeholder}
      rows={4}
      className="min-h-[112px] w-full resize-none overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-normal leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
    />
  );
}


// ── Alarm Internal Page ───────────────────────────────────────────────────────

const ALARM_FLOW_FORM_KEY = "alarmFlowFormState_v1";
const ALARM_FLOW_LOG_KEY = "alarmFlowLogState_v1";

function loadAlarmFlowEntries() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(ALARM_FLOW_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAlarmFlowEntries(entries = []) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ALARM_FLOW_LOG_KEY, JSON.stringify(entries || []));
  } catch {}
}

function loadAlarmFlowForm(defaultForm) {
  try {
    if (typeof localStorage === "undefined") return defaultForm;
    const raw = localStorage.getItem(ALARM_FLOW_FORM_KEY);
    if (!raw) return defaultForm;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...defaultForm, ...parsed } : defaultForm;
  } catch {
    return defaultForm;
  }
}

function saveAlarmFlowForm(form = {}) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ALARM_FLOW_FORM_KEY, JSON.stringify(form || {}));
  } catch {}
}

function getAlarmEntryMinutes(entry = {}) {
  const minutes = excelTimeToMinutes(entry?.time || "");
  if (minutes !== null) return minutes;
  const text = String(entry?.text || "");
  const match = text.match(/(\d{1,2}:\d{2})\s*hrs/i);
  const fallback = excelTimeToMinutes(match?.[1]);
  return fallback !== null ? fallback : 99999;
}

function sortAlarmFlowEntries(entries = []) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const timeDiff = getAlarmEntryMinutes(a) - getAlarmEntryMinutes(b);
    if (timeDiff !== 0) return timeDiff;
    return String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""));
  });
}

function buildCcTechnicalFailureText(form = {}, { preview = false } = {}) {
  const train = normalizeMovementTrain(form.trainId) || (preview ? "T15" : "");
  const atcName = String(form.atcName || "").trim() || (preview ? "Moiz" : "");
  const shunterName = String(form.shunterName || "").trim() || (preview ? "Gerald" : "");
  const onboardTime = String(form.onboardTime || "").trim() || (preview ? "03:22" : "");
  const ccResetTime = String(form.ccResetTime || "").trim() || (preview ? "03:22" : "");
  const fitTime = String(form.fitTime || "").trim() || (preview ? "03:32" : "");

  if (!preview && (!train || !atcName || !shunterName || !onboardTime || !ccResetTime || !fitTime)) return "";

  const atcLabel = atcName ? `ATC ${atcName}` : "ATC";
  const shunterLabel = shunterName ? `Shunter ${shunterName}` : "Shunter";

  return [
    `${train} showed CC Technical Failure alarm from Train Status in ATS.`,
    "SR:",
    "",
    "Action:",
    `${onboardTime} hrs – ${train} ${atcLabel} and ${shunterLabel} on board.`,
    `${onboardTime} hrs – ${train} shunter authorized to switch DMF, and ATC started troubleshooting.`,
    `${ccResetTime} hrs – ${train} performed CC reset and was authorized to localize the train after completion.`,
    `${fitTime} hrs – ${train} ${atcLabel} and ${shunterLabel} alighted. Alarm cleared. ${atcLabel} confirmed ${train} fit for service.`,
  ].join("\n");
}

function buildAlarmFlowText(form = {}, options = {}) {
  return buildCcTechnicalFailureText(form, options);
}

function AlarmContent() {
  const createDefaultAlarmForm = () => ({
    trainId: "",
    atcName: "",
    shunterName: "",
    onboardTime: "",
    ccResetTime: "",
    fitTime: "",
  });

  const accent = "#f59e0b";
  const [entries, setEntries] = useState(() => sortAlarmFlowEntries(loadAlarmFlowEntries()));
  const [form, setForm] = useState(() => loadAlarmFlowForm(createDefaultAlarmForm()));
  const [focusedFlowInput, setFocusedFlowInput] = useState("");
  const [flowSettledInputs, setFlowSettledInputs] = useState({});
  const [copyFeedback, setCopyFeedback] = useState({});
  const copyFeedbackTimerRef = useRef({});
  const alarmScrollRestoreRef = useRef(null);

  const captureAlarmScrollPosition = () => {
    if (typeof window === "undefined") return;
    alarmScrollRestoreRef.current = { x: window.scrollX, y: window.scrollY };
  };

  useLayoutEffect(() => {
    const position = alarmScrollRestoreRef.current;
    if (!position || typeof window === "undefined") return;

    alarmScrollRestoreRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo(position.x, position.y);
    });
  }, [form, entries]);

  useEffect(() => { saveAlarmFlowEntries(sortAlarmFlowEntries(entries)); }, [entries]);
  useEffect(() => { saveAlarmFlowForm(form); }, [form]);

  useEffect(() => {
    return () => {
      Object.values(copyFeedbackTimerRef.current || {}).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const getAlarmFlowInputKey = (field) => `alarm:${field}`;
  const focusFlowInput = (key) => setFocusedFlowInput(key);
  const blurFlowInput = (key) => {
    setFocusedFlowInput((current) => (current === key ? "" : current));
    setFlowSettledInputs((prev) => ({ ...prev, [key]: true }));
  };
  const scheduleFlowInputSettled = (key) => {
    if (!key) return;
    // Same as Train Movement Automatic Flow: show next pill immediately while cursor stays in current input.
    setFlowSettledInputs((prev) => ({ ...prev, [key]: true }));
  };
  const isFlowFieldSettled = (field) => Boolean(flowSettledInputs[getAlarmFlowInputKey(field)] || focusedFlowInput === getAlarmFlowInputKey(field) || true);

  const updateForm = (field, value) => {
    captureAlarmScrollPosition();
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateFlowTextField = (field, value) => {
    updateForm(field, value);
    scheduleFlowInputSettled(getAlarmFlowInputKey(field));
  };

  const trainReady = Boolean(normalizeMovementTrain(form.trainId)) && isFlowFieldSettled("trainId");
  const atcReady = trainReady && Boolean(String(form.atcName || "").trim()) && isFlowFieldSettled("atcName");
  const shunterReady = atcReady && Boolean(String(form.shunterName || "").trim()) && isFlowFieldSettled("shunterName");
  const onboardTimeReady = shunterReady && isCompleteMovementTimeInput(form.onboardTime) && isFlowFieldSettled("onboardTime");
  const ccResetTimeReady = onboardTimeReady && isCompleteMovementTimeInput(form.ccResetTime) && isFlowFieldSettled("ccResetTime");
  const fitTimeReady = ccResetTimeReady && isCompleteMovementTimeInput(form.fitTime) && isFlowFieldSettled("fitTime");
  const requiredReady = fitTimeReady;

  const inputClass = "h-8 w-full rounded-lg border border-[#1e4060] bg-[#061827] px-2 text-[11px] font-medium text-white outline-none placeholder:text-[#31516b] focus:border-[#4f8ef7]";
  const glowInputBoxClass = "flex h-8 items-center gap-1.5 rounded-lg border border-[#2f7bc4] bg-[#061827] px-2 shadow-[0_0_12px_rgba(79,142,247,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all focus-within:border-[#7ab7ff] focus-within:shadow-[0_0_16px_rgba(79,142,247,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]";

  const showCopyFeedback = (key, status) => {
    setCopyFeedback((prev) => ({ ...prev, [key]: status }));

    if (copyFeedbackTimerRef.current[key]) clearTimeout(copyFeedbackTimerRef.current[key]);

    copyFeedbackTimerRef.current[key] = setTimeout(() => {
      setCopyFeedback((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete copyFeedbackTimerRef.current[key];
    }, 1600);
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

  const resetAlarmFlow = () => {
    captureAlarmScrollPosition();
    setFocusedFlowInput("");
    setFlowSettledInputs({});
    setForm(createDefaultAlarmForm());
  };

  const addAlarmLog = () => {
    const text = buildAlarmFlowText(form);
    if (!text) return;

    const now = new Date();
    const entry = {
      id: `alarm-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      time: String(form.onboardTime || "").trim(),
      train: normalizeMovementTrain(form.trainId),
      alarmName: "CC Technical Failure",
      source: "Train Status in ATS",
      onboardTime: String(form.onboardTime || "").trim(),
      ccResetTime: String(form.ccResetTime || "").trim(),
      fitTime: String(form.fitTime || "").trim(),
      atcName: String(form.atcName || "").trim(),
      shunterName: String(form.shunterName || "").trim(),
      text,
      createdAt: now.toISOString(),
    };

    captureAlarmScrollPosition();
    setEntries((prev) => sortAlarmFlowEntries([...prev, entry]));
    setFocusedFlowInput("");
    setFlowSettledInputs({});
    setForm((prev) => ({
      ...prev,
      trainId: "",
      onboardTime: "",
      ccResetTime: "",
      fitTime: "",
    }));
  };

  const removeAlarmLog = (id) => {
    captureAlarmScrollPosition();
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearAlarmLogs = () => {
    if (!window.confirm("Clear all ALM logs?")) return;
    captureAlarmScrollPosition();
    setEntries([]);
  };

  const copyAllAlarmLogs = async () => {
    if (!entries.length) {
      showCopyFeedback("alarm-all", "empty");
      return;
    }
    await copyTextToClipboard(sortAlarmFlowEntries(entries).map((entry) => entry.text).join("\n\n"));
    showCopyFeedback("alarm-all", "copied");
  };

  const copySingleAlarmLog = async (entry) => {
    if (!entry?.text) return;
    await copyTextToClipboard(entry.text);
    showCopyFeedback(`alarm-entry-${entry.id}`, "copied");
  };

  const getCopyButtonLabel = () => {
    const status = copyFeedback["alarm-all"];
    if (status === "copied") return "copied !";
    if (status === "empty") return "no log !";
    return "Copy All";
  };

  const renderSimpleTimeInput = (field, placeholder = "03:32") => (
    <div className={glowInputBoxClass}>
      <input
        value={form[field] || ""}
        inputMode="numeric"
        maxLength={5}
        onFocus={() => focusFlowInput(getAlarmFlowInputKey(field))}
        onKeyDown={(event) => {
          const value = String(form[field] || "");
          const cursorAtEnd = event.currentTarget.selectionStart === value.length && event.currentTarget.selectionEnd === value.length;
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
            event.preventDefault();
            updateForm(field, value.slice(0, -2));
          }
        }}
        onChange={(event) => {
          updateForm(field, cleanMovementCustomTimeInput(event.target.value));
          scheduleFlowInputSettled(getAlarmFlowInputKey(field));
        }}
        onBlur={(event) => {
          updateForm(field, normalizeMovementCustomTimeInput(event.target.value));
          blurFlowInput(getAlarmFlowInputKey(field));
        }}
        placeholder={placeholder}
        className="h-full min-w-[42px] flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
      />
      <span className="shrink-0 text-[11px] font-medium text-[#c8d8ea]">hrs</span>
    </div>
  );

  const renderNameInput = (field, placeholder) => (
    <input
      type="text"
      value={form[field] || ""}
      onFocus={() => focusFlowInput(getAlarmFlowInputKey(field))}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      onChange={(event) => updateFlowTextField(field, event.target.value)}
      onBlur={() => blurFlowInput(getAlarmFlowInputKey(field))}
      placeholder={placeholder}
      className={inputClass}
    />
  );

  const renderTrainInput = () => (
    <div className={glowInputBoxClass}>
      <span className="text-[12px] font-medium text-[#4f8ef7]">T</span>
      <input
        value={form.trainId}
        onFocus={() => focusFlowInput(getAlarmFlowInputKey("trainId"))}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        onChange={(event) => updateFlowTextField("trainId", event.target.value.replace(/\D/g, ""))}
        onBlur={() => blurFlowInput(getAlarmFlowInputKey("trainId"))}
        placeholder="15"
        className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-medium text-white outline-none placeholder:text-[#31516b]"
      />
    </div>
  );

  const steps = [
    { key: "trainId", label: "Train ID", visible: true, complete: trainReady, render: renderTrainInput },
    { key: "atcName", label: "ATC Name", visible: trainReady, complete: atcReady, render: () => renderNameInput("atcName", "Moiz") },
    { key: "shunterName", label: "Shunter Name", visible: atcReady, complete: shunterReady, render: () => renderNameInput("shunterName", "Gerald") },
    { key: "onboardTime", label: "ATC/SHUNTER Onboard Time", visible: shunterReady, complete: onboardTimeReady, render: () => renderSimpleTimeInput("onboardTime", "03:22") },
    { key: "ccResetTime", label: "CC Reset Time", visible: onboardTimeReady, complete: ccResetTimeReady, render: () => renderSimpleTimeInput("ccResetTime", "03:22") },
    { key: "fitTime", label: "ATC Confirmed Train Fit Time", visible: ccResetTimeReady, complete: fitTimeReady, render: () => renderSimpleTimeInput("fitTime", "03:32") },
  ];

  const visibleSteps = steps.filter((step) => step.visible);

  const renderFlowStepCard = (step, index) => (
    <div
      key={step.key}
      className="rounded-xl border p-2 transition-all"
      style={{
        borderColor: step.complete ? `${accent}70` : "#1e4060",
        background: step.complete ? `linear-gradient(135deg, ${accent}14, #061827 82%)` : "#061827",
        boxShadow: step.complete ? `0 0 10px ${accent}12, inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.07em]" style={{ borderColor: step.complete ? `${accent}80` : "#244761", color: step.complete ? accent : "#7ea6c2", backgroundColor: step.complete ? `${accent}10` : "#061827" }}>
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-normal" style={{ borderColor: step.complete ? `${accent}80` : "#31516b" }}>{index + 1}</span>
          <span className="truncate">{step.label}</span>
        </span>
        <span className="shrink-0 text-[9px] font-black" style={{ color: step.complete ? accent : "#4a8ab5" }}>
          {step.complete ? "DONE" : step.optional ? "OPTIONAL" : "NEXT"}
        </span>
      </div>
      {step.render()}
    </div>
  );

  const renderFlowRows = (items) => (
    <div className="grid gap-y-2">
      {items.reduce((rows, _step, index) => {
        if (index % 2 === 0) rows.push(items.slice(index, index + 2));
        return rows;
      }, []).map((pair, pairIndex) => {
        const leftToRight = pairIndex % 2 === 0;
        const firstIndex = pairIndex * 2;
        const secondIndex = firstIndex + 1;
        const first = pair[0];
        const second = pair[1];
        const leftStep = leftToRight ? first : second;
        const rightStep = leftToRight ? second : first;
        const leftIndex = leftToRight ? firstIndex : secondIndex;
        const rightIndex = leftToRight ? secondIndex : firstIndex;
        const arrow = second ? (leftToRight ? "→" : "←") : "";

        return (
          <div key={`alarm-flow-row-${pairIndex}`} className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-x-1.5">
            <div>{leftStep ? renderFlowStepCard(leftStep, leftIndex) : null}</div>
            <div className="flex items-center justify-center">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full border text-[17px] font-black leading-none"
                style={{
                  opacity: arrow ? 1 : 0,
                  borderColor: `${accent}55`,
                  backgroundColor: `${accent}10`,
                  color: accent,
                }}
              >
                {arrow || "→"}
              </span>
            </div>
            <div>{rightStep ? renderFlowStepCard(rightStep, rightIndex) : null}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex w-full min-h-[calc(100vh-120px)] justify-center p-5">
      <section
        className="w-full max-w-4xl overflow-hidden rounded-xl border shadow-[0_14px_28px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{ borderColor: `${accent}42`, background: "linear-gradient(180deg,#061827 0%,#041727 100%)" }}
      >
        <div className="border-b px-3 py-2" style={{ borderColor: `${accent}30`, backgroundColor: `${accent}0d` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-white">CC Technical Failure</p>
              <p className="text-[10px] font-semibold text-[#8ea8c0]">Fixed CC Technical Failure template. Fill Train ID, ATC, shunter, onboard time, CC reset time, and fit time.</p>
            </div>
            <button
              type="button"
              onClick={resetAlarmFlow}
              className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] shadow-[0_0_14px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.03]"
              style={{ borderColor: "rgba(248,113,113,0.85)", backgroundColor: "rgba(127,29,29,0.36)", color: "#fecaca" }}
              title="Reset Alarm Flow"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-3">
          {renderFlowRows(visibleSteps)}

          <div className="rounded-lg border border-[#1e4060] bg-[#061827] px-3 py-2">
            <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.12em] text-[#4a8ab5]">Preview</p>
            <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] font-medium leading-snug text-[#c8d8ea]">
              {buildAlarmFlowText(form, { preview: true })}
            </pre>
          </div>

          {requiredReady && (
            <button
              type="button"
              onClick={addAlarmLog}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium text-white shadow-[0_0_16px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:scale-[1.01]"
              style={{ borderColor: `${accent}9a`, backgroundColor: `${accent}33` }}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}

          <div className="overflow-hidden rounded-xl border border-[#1d4869] bg-[#041727]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d4869] bg-[#061827] px-3 py-2">
              <div className="min-w-0">
                <h3 className="text-[12px] font-black uppercase tracking-wide text-white">Log Output</h3>
                <p className="text-[10px] font-semibold text-[#8ea8c0]">{entries.length} entries saved locally</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyAllAlarmLogs}
                  className="flex min-w-[82px] items-center justify-center gap-1 rounded-lg border border-amber-400/55 bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200 transition-all hover:scale-[1.02]"
                >
                  <Copy className="h-3 w-3" />{getCopyButtonLabel()}
                </button>
                <button
                  type="button"
                  onClick={clearAlarmLogs}
                  className="flex items-center gap-1 rounded-lg border border-red-400/55 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200 transition-all hover:scale-[1.02]"
                >
                  <Trash2 className="h-3 w-3" />Clear
                </button>
              </div>
            </div>

            <div className="min-h-[180px]">
              {entries.length === 0 ? (
                <div className="flex min-h-[180px] items-center justify-center px-3 text-center text-[11px] font-semibold text-[#7eb8e0]">
                  No CC Technical Failure log yet.
                </div>
              ) : (
                sortAlarmFlowEntries(entries).map((entry) => (
                  <div key={entry.id} className="group border-b border-[#12304a]/70 px-3 py-2 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#f4f8ff]">
                        {entry.text}
                      </pre>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => copySingleAlarmLog(entry)}
                          title="Copy this log"
                          aria-label="Copy this log"
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-amber-200 opacity-80 transition-all hover:scale-[1.04] group-hover:opacity-100"
                        >
                          {copyFeedback[`alarm-entry-${entry.id}`] === "copied" ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAlarmLog(entry.id)}
                          title="Delete this log"
                          aria-label="Delete this log"
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-red-400 opacity-80 transition-all hover:border-red-500/60 hover:bg-red-950/35 hover:text-red-300 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DepotStablingPage() {
  const [westData, setWestData] = useState(() => loadLocalStablingState().westData);
  const [eastData, setEastData] = useState(() => loadLocalStablingState().eastData);
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
  const [activeInsertionPg, setActiveInsertionPg] = useState(() => loadInsertionActivePg());
  const [pg2Stabling, setPg2Stabling] = useState(() => loadInsertionPg2Stabling(westData, eastData));
  const [pg2InsertionLog, setPg2InsertionLog] = useState(() => loadInsertionPg2Log());
  const [pg2TidInputs, setPg2TidInputs] = useState(() => loadInsertionPg2TidInputs());
  const [insertionLiveLoaded, setInsertionLiveLoaded] = useState(false);
  const [insertionLiveSyncing, setInsertionLiveSyncing] = useState(false);
  const [insertionLiveLastSynced, setInsertionLiveLastSynced] = useState(null);
  const [insertionLiveSyncError, setInsertionLiveSyncError] = useState(false);
  const [insertionLiveDbReady, setInsertionLiveDbReady] = useState(() => isInsertionLiveEntityReady());
  const [insertionLiveDebug, setInsertionLiveDebug] = useState("");
  const [flashingCells, setFlashingCells] = useState(new Set());

  useEffect(() => { saveTidInputs(tidInputs); }, [tidInputs]);
  useEffect(() => { saveInsertionActivePg(activeInsertionPg); }, [activeInsertionPg]);
  useEffect(() => { saveInsertionPg2Stabling(pg2Stabling); }, [pg2Stabling]);
  useEffect(() => { saveInsertionPg2Log(pg2InsertionLog); }, [pg2InsertionLog]);
  useEffect(() => { saveInsertionPg2TidInputs(pg2TidInputs); }, [pg2TidInputs]);

  const getTabFromPath = (path) => {
    if (path === "/train-washing") return "washing";
    if (path === "/train-movement") return "movement";
    if (path === "/pst-train-prep") return "pst";
    if (path === "/insertion") return "insertion";
    if (path === "/odo-reading") return "odo";
    if (path === "/possession") return "possession";
    if (path === "/alarm") return "alarm";
    if (path === "/admin" || path === "/adm") return "admin";
    return "stabling";
  };
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location.pathname));
  const [adminCredentials, setAdminCredentials] = useState({ id: "", password: "" });
  const [adminError, setAdminError] = useState("");
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(ADM_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [adminNotes, setAdminNotes] = useState(() => loadAdminNotes());
  const [adminSearch, setAdminSearch] = useState("");
  const [adminEditingNoteId, setAdminEditingNoteId] = useState(null);
  const [adminTitleDraft, setAdminTitleDraft] = useState("");
  const [adminNotesLoading, setAdminNotesLoading] = useState(false);
  const [adminNotesSaving, setAdminNotesSaving] = useState(false);
  const [adminNotesLiveStatus, setAdminNotesLiveStatus] = useState("Local cache ready");
  const [adminNotesDbReady, setAdminNotesDbReady] = useState(() => isAdminNoteEntityReady());
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
  const adminNotesLiveIdRef = useRef(null);
  const adminNotesLoadedRef = useRef(false);
  const adminNotesLastSavedJsonRef = useRef("");
  const adminNotesSaveTimerRef = useRef(null);
  const adminNotesCurrentRef = useRef(adminNotes);

  const [selectedTimetableType, setSelectedTimetableType] = useState(() => loadActiveTimetableType());
  const [timetableRecords, setTimetableRecords] = useState(() => {
    const records = normalizeStoredTimetableRecords(loadLocalTimetableRecords());
    if (records.length) saveLocalTimetableRecords(records);
    return records;
  });
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableSaving, setTimetableSaving] = useState(false);
  const [timetableError, setTimetableError] = useState("");

  const activeTimetable = useMemo(
    () => findLatestTimetableRecord(timetableRecords, selectedTimetableType),
    [timetableRecords, selectedTimetableType]
  );

  const loadTimetableRecords = useCallback(async () => {
    const localRecords = normalizeStoredTimetableRecords(loadLocalTimetableRecords());
    if (localRecords.length) saveLocalTimetableRecords(localRecords);
    setTimetableLoading(true);
    setTimetableError("");

    try {
      const entity = getTimetableEntity();

      if (!isTimetableEntityReady(entity)) {
        setTimetableRecords(localRecords);
        return;
      }

      const records = await entity.list("-updatedAt");
      const safeRecords = normalizeStoredTimetableRecords(Array.isArray(records) ? records : []);
      setTimetableRecords(safeRecords.length ? safeRecords : localRecords);
      if (safeRecords.length) saveLocalTimetableRecords(safeRecords);
    } catch (error) {
      console.error("Timetable load failed:", error);
      setTimetableRecords(localRecords);
      setTimetableError("Timetable storage not available. Using local cache.");
    } finally {
      setTimetableLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimetableRecords();
  }, [loadTimetableRecords]);

  const handleTimetableTypeChange = useCallback((type) => {
    const nextType = normalizeTimetableType(type);
    setSelectedTimetableType(nextType);
    saveActiveTimetableType(nextType);
  }, []);

  const handleTimetableUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setTimetableSaving(true);
    setTimetableError("");

    try {
      const buffer = await file.arrayBuffer();
      const detectedTimetableType = detectTimetableTypeFromFileName(file.name, selectedTimetableType);
      const parsedData = parseTimetableWorkbook(buffer, detectedTimetableType, file.name);
      const totalParsed =
        (parsedData.summary?.removal?.west || 0) +
        (parsedData.summary?.removal?.east || 0) +
        (parsedData.summary?.insertion?.west || 0) +
        (parsedData.summary?.insertion?.east || 0) +
        (parsedData.summary?.reference?.arrival3A1P2 || 0);

      if (!totalParsed) {
        throw new Error("No insertion/removal rows detected. Check that the Excel contains 3A1/3K1 timetable columns and movement remarks.");
      }

      setSelectedTimetableType(detectedTimetableType);
      saveActiveTimetableType(detectedTimetableType);

      const now = new Date().toISOString();
      const payload = {
        timetableType: normalizeTimetableType(detectedTimetableType),
        typeLabel: getTimetableTypeLabel(detectedTimetableType),
        fileName: file.name,
        sourceFileName: file.name,
        fileMimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSize: file.size || buffer.byteLength || 0,
        fileBase64: arrayBufferToBase64(buffer),
        parsedData,
        summary: parsedData.summary,
        createdAt: now,
        updatedAt: now,
      };

      let savedRecord = { id: `local-${Date.now()}`, ...payload };
      const entity = getTimetableEntity();

      if (isTimetableEntityReady(entity)) {
        savedRecord = await entity.create(payload);
      }

      setTimetableRecords((prev) => {
        const next = [savedRecord, ...prev].slice(0, 24);
        saveLocalTimetableRecords(next);
        return next;
      });
    } catch (error) {
      console.error("Timetable upload failed:", error);
      setTimetableError(error?.message || "Unable to read timetable Excel.");
    } finally {
      setTimetableSaving(false);
    }
  }, [selectedTimetableType]);

  const handleTimetableDownload = useCallback(() => {
    try {
      downloadStoredTimetableFile(activeTimetable);
    } catch (error) {
      console.error("Timetable download failed:", error);
      setTimetableError("Unable to download timetable file.");
    }
  }, [activeTimetable]);

  const handleHeaderHorizontalScroll = useCallback((direction) => {
    const scrollTarget = stablingHorizontalScrollRef.current || mainContentScrollRef.current;
    if (!scrollTarget) return;

    const nextLeft = direction === "left" ? 0 : scrollTarget.scrollWidth;
    scrollTarget.scrollTo({ left: nextLeft, behavior: "smooth" });
  }, []);

  const handleAdminLogin = useCallback((event) => {
    event.preventDefault();
    const loginId = String(adminCredentials.id || "").trim();
    const loginPassword = String(adminCredentials.password || "");

    if (loginId === ADM_LOGIN_ID && loginPassword === ADM_LOGIN_PASSWORD) {
      setIsAdminUnlocked(true);
      setAdminError("");
      setAdminCredentials({ id: "", password: "" });
      try { sessionStorage.setItem(ADM_SESSION_KEY, "true"); } catch {}
      return;
    }

    setIsAdminUnlocked(false);
    setAdminError("Invalid admin ID or password.");
    try { sessionStorage.removeItem(ADM_SESSION_KEY); } catch {}
  }, [adminCredentials]);

  const handleAdminLogout = useCallback(() => {
    setIsAdminUnlocked(false);
    setAdminCredentials({ id: "", password: "" });
    setAdminError("");
    setAdminNotesLoading(false);
    setAdminNotesSaving(false);
    setAdminNotesLiveStatus("Local cache ready");
    try { sessionStorage.removeItem(ADM_SESSION_KEY); } catch {}
  }, []);

  const loadAdminNotesLive = useCallback(async () => {
    const entity = getAdminNoteEntity();
    const entityReady = isAdminNoteEntityReady(entity);

    adminNotesLoadedRef.current = false;
    setAdminNotesDbReady(entityReady);

    if (!entityReady) {
      adminNotesLoadedRef.current = true;
      setAdminNotesLiveStatus("Local only - D1 entity unavailable");
      return;
    }

    setAdminNotesLoading(true);
    setAdminNotesLiveStatus("Loading live notes...");

    try {
      const records = await entity.list("-updatedAt");
      const liveRecord = (Array.isArray(records) ? records : []).find((record) => (
        record?.recordKey === ADMIN_NOTE_LIVE_RECORD_KEY
      ));

      if (liveRecord && Array.isArray(liveRecord.notes)) {
        const normalizedNotes = normalizeAdminNoteList(liveRecord.notes);
        const notesJson = JSON.stringify(normalizedNotes);

        adminNotesLiveIdRef.current = liveRecord.id;
        adminNotesLastSavedJsonRef.current = notesJson;
        setAdminNotes(normalizedNotes);
        saveAdminNotes(normalizedNotes);
        setAdminNotesDbReady(true);
        setAdminNotesLiveStatus("Live saved");
        return;
      }

      const notesToCreate = normalizeAdminNoteList(adminNotesCurrentRef.current);
      const created = await entity.create({
        recordKey: ADMIN_NOTE_LIVE_RECORD_KEY,
        notes: notesToCreate,
        updatedAt: new Date().toISOString(),
      });

      adminNotesLiveIdRef.current = created?.id || null;
      adminNotesLastSavedJsonRef.current = JSON.stringify(notesToCreate);
      setAdminNotes(notesToCreate);
      saveAdminNotes(notesToCreate);
      setAdminNotesDbReady(true);
      setAdminNotesLiveStatus("Live saved");
    } catch (error) {
      console.error("Admin notes live load failed:", error);
      setAdminNotesDbReady(false);
      setAdminNotesLiveStatus("D1 unavailable - local saved");
    } finally {
      adminNotesLoadedRef.current = true;
      setAdminNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdminUnlocked) return;
    loadAdminNotesLive();
  }, [isAdminUnlocked, loadAdminNotesLive]);

  const adminSearchKeyword = adminSearch.trim().toLowerCase();

  const visibleAdminNotes = useMemo(() => {
    if (!adminSearchKeyword) return adminNotes;

    return adminNotes.filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const note = String(item.note || "").toLowerCase();
      return title.includes(adminSearchKeyword) || note.includes(adminSearchKeyword);
    });
  }, [adminNotes, adminSearchKeyword]);

  const handleAddAdminNote = useCallback(() => {
    setAdminNotes((prev) => [
      ...prev.map((item) => ({ ...item, collapsed: true })),
      createAdminNoteItem(`Parent ${prev.length + 1}`),
    ]);
  }, []);

  const toggleAdminNoteCollapsed = useCallback((id) => {
    setAdminNotes((prev) => prev.map((item) => (
      item.id === id ? { ...item, collapsed: !item.collapsed } : item
    )));
  }, []);

  const collapseAllAdminNotes = useCallback(() => {
    setAdminNotes((prev) => prev.map((item) => ({ ...item, collapsed: true })));
  }, []);

  const handleAdminNoteChange = useCallback((id, value) => {
    setAdminNotes((prev) => prev.map((item) => (
      item.id === id ? { ...item, note: value, updatedAt: new Date().toISOString() } : item
    )));
  }, []);

  const startAdminTitleEdit = useCallback((item) => {
    setAdminEditingNoteId(item.id);
    setAdminTitleDraft(item.title || "");
  }, []);

  const cancelAdminTitleEdit = useCallback(() => {
    setAdminEditingNoteId(null);
    setAdminTitleDraft("");
  }, []);

  const saveAdminTitle = useCallback((event, item) => {
    event.preventDefault();
    const cleanTitle = adminTitleDraft.trim() || item.title || "Admin Note";
    setAdminNotes((prev) => prev.map((noteItem) => (
      noteItem.id === item.id
        ? { ...noteItem, title: cleanTitle, updatedAt: new Date().toISOString() }
        : noteItem
    )));
    setAdminEditingNoteId(null);
    setAdminTitleDraft("");
  }, [adminTitleDraft]);

  const deleteAdminNote = useCallback((id) => {
    setAdminNotes((prev) => {
      if (prev.length <= 1) {
        return [{ ...prev[0], title: "Admin Note", note: "", collapsed: false, updatedAt: new Date().toISOString() }];
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const moveAdminNote = useCallback((id, direction) => {
    setAdminNotes((prev) => {
      const currentIndex = prev.findIndex((item) => item.id === id);
      if (currentIndex < 0) return prev;
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      return next;
    });
  }, []);

  const handleSidebarShortcutClick = useCallback((event, key, to) => {
    event.preventDefault();
    setActiveTab(key);

    const route = to?.startsWith("/") ? to : `/${to || "depot-stabling"}`;
    const targetHash = `#${route}`;

    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }

    window.setTimeout(() => {
      window.location.reload();
    }, 0);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
    } catch {}
  }, [isSidebarCollapsed]);

  useEffect(() => {
    adminNotesCurrentRef.current = adminNotes;
    saveAdminNotes(adminNotes);
  }, [adminNotes]);

  useEffect(() => {
    if (!isAdminUnlocked || !adminNotesLoadedRef.current) return undefined;

    const entity = getAdminNoteEntity();
    if (!isAdminNoteEntityReady(entity)) {
      setAdminNotesDbReady(false);
      return undefined;
    }

    const notesToSave = normalizeAdminNoteList(adminNotes);
    const nextNotesJson = JSON.stringify(notesToSave);
    if (nextNotesJson === adminNotesLastSavedJsonRef.current) return undefined;

    if (adminNotesSaveTimerRef.current) {
      window.clearTimeout(adminNotesSaveTimerRef.current);
      adminNotesSaveTimerRef.current = null;
    }

    setAdminNotesSaving(true);
    setAdminNotesLiveStatus("Saving live...");

    const timer = window.setTimeout(async () => {
      try {
        const payload = {
          recordKey: ADMIN_NOTE_LIVE_RECORD_KEY,
          notes: notesToSave,
          updatedAt: new Date().toISOString(),
        };

        let savedRecord = null;
        const existingId = adminNotesLiveIdRef.current;

        if (existingId) {
          try {
            savedRecord = await entity.update(existingId, payload);
          } catch (error) {
            if (error?.status !== 404) throw error;
            savedRecord = await entity.create(payload);
          }
        } else {
          savedRecord = await entity.create(payload);
        }

        if (savedRecord?.id) adminNotesLiveIdRef.current = savedRecord.id;
        adminNotesLastSavedJsonRef.current = nextNotesJson;
        setAdminNotesDbReady(true);
        setAdminNotesLiveStatus("Live saved");
      } catch (error) {
        console.error("Admin notes live save failed:", error);
        setAdminNotesDbReady(false);
        setAdminNotesLiveStatus("D1 save failed - local saved");
      } finally {
        setAdminNotesSaving(false);
        if (adminNotesSaveTimerRef.current === timer) {
          adminNotesSaveTimerRef.current = null;
        }
      }
    }, ADMIN_NOTE_SAVE_DEBOUNCE_MS);

    adminNotesSaveTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (adminNotesSaveTimerRef.current === timer) {
        adminNotesSaveTimerRef.current = null;
      }
    };
  }, [adminNotes, isAdminUnlocked]);

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
  const stablingLocalUpdatedAtRef = useRef(loadLocalStablingState().updatedMs || 0);
  const stablingRemoteUpdatedAtRef = useRef(0);
  const stablingLocalEditUntilRef = useRef(0);

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
  const pstLiveLocalUpdatedAtRef = useRef(Date.parse(savedPST.updatedAt || "") || 0);
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
  const pg2StablingRef = useRef(pg2Stabling);
  const pg2InsertionLogRef = useRef(pg2InsertionLog);
  const pg2TidInputsRef = useRef(pg2TidInputs);
  const insertionLiveLocalUpdatedAtRef = useRef(0);
  const insertionLiveRemoteUpdatedAtRef = useRef(0);

  useEffect(() => { pstStateRef.current = pstState; }, [pstState]);
  useEffect(() => { prepStateRef.current = prepState; }, [prepState]);
  useEffect(() => { pstLogLinesRef.current = pstLogLines; }, [pstLogLines]);
  useEffect(() => { taNameStateRef.current = taNameState; }, [taNameState]);
  useEffect(() => { pstCompletedByNamesRef.current = pstCompletedByNames; }, [pstCompletedByNames]);
  useEffect(() => { insertionLogRef.current = insertionLog; }, [insertionLog]);
  useEffect(() => { tidInputsRef.current = tidInputs; }, [tidInputs]);
  useEffect(() => { pg2StablingRef.current = pg2Stabling; }, [pg2Stabling]);
  useEffect(() => { pg2InsertionLogRef.current = pg2InsertionLog; }, [pg2InsertionLog]);
  useEffect(() => { pg2TidInputsRef.current = pg2TidInputs; }, [pg2TidInputs]);

  const markStablingLocalEdit = useCallback((nextWest = westDataRef.current, nextEast = eastDataRef.current) => {
    const updatedAt = new Date().toISOString();
    const updatedMs = Date.parse(updatedAt);
    stablingLocalUpdatedAtRef.current = Number.isFinite(updatedMs) ? updatedMs : Date.now();
    stablingLocalEditUntilRef.current = Date.now() + STABLING_LOCAL_EDIT_HOLD_MS;
    saveLocalStablingState(nextWest, nextEast, updatedAt);
  }, []);

  const markPSTLiveLocalEdit = useCallback(() => {
    const now = Date.now();
    pstLiveLocalUpdatedAtRef.current = now;
    pstLiveLocalEditUntilRef.current = now + PST_LIVE_LOCAL_EDIT_HOLD_MS;
  }, []);

  const handleTaNameChange = useCallback((road, bi, value) => {
    markPSTLiveLocalEdit();
    setTaNameState((prev) => ({ ...prev, [`${road}-${bi}`]: value }));
  }, [markPSTLiveLocalEdit]);

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
      normalized.completedByNames,
      normalized.updatedAt
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
      payload.completedByNames,
      payload.updatedAt
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
      payload.completedByNames,
      payload.updatedAt
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
      const record = selectPSTLiveRecord(records);

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
    const payload = buildPSTLivePayload(state);

    savePSTState(
      payload.pstState,
      payload.prepState,
      payload.logLines,
      payload.taNameState,
      payload.completedByNames,
      payload.updatedAt
    );

    if (!pstLiveLoaded) return;
    schedulePSTLiveSave(payload);
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

    if (normalized.pg2Stabling) {
      setPg2Stabling(normalized.pg2Stabling);
      saveInsertionPg2Stabling(normalized.pg2Stabling);
    }
    if (Array.isArray(normalized.pg2InsertionLog)) {
      setPg2InsertionLog(normalized.pg2InsertionLog);
      saveInsertionPg2Log(normalized.pg2InsertionLog);
    }
    if (normalized.pg2TidInputs && typeof normalized.pg2TidInputs === "object") {
      setPg2TidInputs(normalized.pg2TidInputs);
      saveInsertionPg2TidInputs(normalized.pg2TidInputs);
    }
  }, []);

  const saveInsertionLiveToDb = useCallback(async (state) => {
    const entity = getInsertionLiveEntity();
    const payload = buildInsertionLivePayload(state);

    saveInsertionLog(payload.insertionLog);
    saveTidInputs(payload.tidInputs);
    saveInsertionPg2Stabling(payload.pg2Stabling);
    saveInsertionPg2Log(payload.pg2InsertionLog);
    saveInsertionPg2TidInputs(payload.pg2TidInputs);

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
    saveInsertionPg2Stabling(payload.pg2Stabling);
    saveInsertionPg2Log(payload.pg2InsertionLog);
    saveInsertionPg2TidInputs(payload.pg2TidInputs);

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
          pg2Stabling: pg2StablingRef.current,
          pg2InsertionLog: pg2InsertionLogRef.current,
          pg2TidInputs: pg2TidInputsRef.current,
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
      pg2Stabling,
      pg2InsertionLog,
      pg2TidInputs,
    };

    saveInsertionLog(sortInsertionLogByTime(insertionLog));
    saveTidInputs(tidInputs);
    saveInsertionPg2Stabling(pg2Stabling);
    saveInsertionPg2Log(pg2InsertionLog);
    saveInsertionPg2TidInputs(pg2TidInputs);

    if (insertionLiveApplyingRemoteRef.current) {
      insertionLiveApplyingRemoteRef.current = false;
      return;
    }

    if (!insertionLiveLoaded) return;
    scheduleInsertionLiveSave(payload);
  }, [insertionLog, tidInputs, pg2Stabling, pg2InsertionLog, pg2TidInputs, insertionLiveLoaded, scheduleInsertionLiveSave]);

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
      const remoteUpdatedMs = getStablingRecordsUpdatedMs(stablingRecords);
      const localUpdatedMs = stablingLocalUpdatedAtRef.current || 0;
      const hasLocalTrains = hasAnyStablingTrain(westDataRef.current, WEST_ROADS) || hasAnyStablingTrain(eastDataRef.current, EAST_ROADS);
      const hasRemoteTrains = hasAnyStablingTrain(newWest, WEST_ROADS) || hasAnyStablingTrain(newEast, EAST_ROADS);
      const shouldKeepLocalStabling = hasLocalTrains && localUpdatedMs && (
        Date.now() < stablingLocalEditUntilRef.current ||
        (!hasRemoteTrains && !remoteUpdatedMs) ||
        (remoteUpdatedMs && remoteUpdatedMs + 1000 < localUpdatedMs)
      );

      existingMapRef.current = map;
      if (!shouldKeepLocalStabling) {
        setWestData(newWest);
        setEastData(newEast);
        if (remoteUpdatedMs) {
          stablingRemoteUpdatedAtRef.current = Math.max(stablingRemoteUpdatedAtRef.current, remoteUpdatedMs);
          stablingLocalUpdatedAtRef.current = Math.max(stablingLocalUpdatedAtRef.current, remoteUpdatedMs);
        }
        saveLocalStablingState(newWest, newEast, new Date(remoteUpdatedMs || Date.now()).toISOString());
      }
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
      const remoteUpdatedMs = getStablingRecordsUpdatedMs(stablingRecords);
      const localUpdatedMs = stablingLocalUpdatedAtRef.current || 0;
      const hasLocalTrains = hasAnyStablingTrain(westDataRef.current, WEST_ROADS) || hasAnyStablingTrain(eastDataRef.current, EAST_ROADS);
      const hasRemoteTrains = hasAnyStablingTrain(newWest, WEST_ROADS) || hasAnyStablingTrain(newEast, EAST_ROADS);
      const shouldKeepLocalStabling = hasLocalTrains && localUpdatedMs && (
        (!hasRemoteTrains && !remoteUpdatedMs) ||
        (remoteUpdatedMs && remoteUpdatedMs + 1000 < localUpdatedMs)
      );

      existingMapRef.current = map;
      if (!shouldKeepLocalStabling) {
        setWestData(newWest);
        setEastData(newEast);
        if (remoteUpdatedMs) {
          stablingRemoteUpdatedAtRef.current = Math.max(stablingRemoteUpdatedAtRef.current, remoteUpdatedMs);
          stablingLocalUpdatedAtRef.current = Math.max(stablingLocalUpdatedAtRef.current, remoteUpdatedMs);
        }
        saveLocalStablingState(newWest, newEast, new Date(remoteUpdatedMs || Date.now()).toISOString());
      }
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

    const saveUpdatedAt = new Date().toISOString();
    const allEntries = [
      ...WEST_ROADS.map((road) => ({
        depot: "west",
        road,
        blocks: west[road],
        updatedAt: saveUpdatedAt,
      })),
      ...EAST_ROADS.map((road) => ({
        depot: "east",
        road,
        blocks: east[road],
        updatedAt: saveUpdatedAt,
      })),
    ];

    saveLocalStablingState(west, east, saveUpdatedAt);

    try {
      // Save sequentially to avoid overwhelming the server with concurrent requests
      for (const entry of allEntries) {
        const key = `${entry.depot}_${entry.road}`;
        if (existingMapRef.current[key]) {
          try {
            await base44.entities.DepotStabling.update(existingMapRef.current[key], entry);
          } catch (err) {
            // If a row id is stale/missing in D1, recreate that road instead of losing the local edit.
            if (err?.status !== 404) throw err;
            const created = await base44.entities.DepotStabling.create(entry);
            existingMapRef.current[key] = created.id;
          }
        } else {
          const created = await base44.entities.DepotStabling.create(entry);
          existingMapRef.current[key] = created.id;
        }
      }
      const savedMs = Date.parse(saveUpdatedAt) || Date.now();
      stablingRemoteUpdatedAtRef.current = Math.max(stablingRemoteUpdatedAtRef.current, savedMs);
      stablingLocalUpdatedAtRef.current = Math.max(stablingLocalUpdatedAtRef.current, savedMs);
      stablingLocalEditUntilRef.current = Date.now() + STABLING_POST_SAVE_HOLD_MS;
      setSaved(true);
      setLastSynced(new Date());
      setSyncError(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      setSyncError(true);
      stablingLocalEditUntilRef.current = Date.now() + STABLING_LOCAL_EDIT_HOLD_MS;
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
      const newWest = depot === "west" ? updated : westDataRef.current;
      const newEast = depot === "east" ? updated : eastDataRef.current;
      markStablingLocalEdit(newWest, newEast);
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
        // Keep the typed Train ID visible. Duplicate trains are highlighted red instead
        // of auto-clearing, so the user can see and correct the duplicated entry.
        const cellKey = `${depot}-${road}-${blockIndex}`;
        setFlashingCells((prev) => new Set([...prev, cellKey]));
        setTimeout(() => {
          setFlashingCells((prev) => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 1200);
      }
    }

    // Persist and schedule auto-save. If duplicate, it stays visible and the DUP highlight shows it.
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
      markStablingLocalEdit(newWest, newEast);
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
    { tid: 221, time: "15:57" }, { tid: 222, time: "16:03" }, { tid: 223, time: "16:09" },
    { tid: 224, time: "16:15" }, { tid: 225, time: "16:21" }, { tid: 226, time: "16:27" },
    { tid: 227, time: "16:33" }, { tid: 228, time: "16:39" }, { tid: 229, time: "16:45" },
    { tid: 230, time: "16:51" },
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

  const activeInsertionTimeMaps = useMemo(() => ({
    west: getTimetableInsertionTimeMap(activeTimetable, "west"),
    east: getTimetableInsertionTimeMap(activeTimetable, "east"),
  }), [activeTimetable]);

  const activeInsertionRemarkMaps = useMemo(() => ({
    west: getTimetableInsertionRemarkMap(activeTimetable, "west"),
    east: getTimetableInsertionRemarkMap(activeTimetable, "east"),
  }), [activeTimetable]);

  const getDayScheduleKey = () => {
    const selectedType = normalizeTimetableType(selectedTimetableType);
    if (["weekday", "friday", "saturday"].includes(selectedType)) return selectedType;

    const day = new Date().getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
    if (day === 5) return "friday";
    if (day === 6) return "saturday";
    return "weekday";
  };

  const getTidAssistRemarkStyle = useCallback((value, depot) => {
    const specialStyle = getInsertionRemarkStyle(value);
    const cleanTid = getInsertionTidRemarkNumber(value);
    if (!cleanTid) return specialStyle;

    const dayKey = getDayScheduleKey();
    const depotKey = normalizeDepotKey(depot);
    const oppositeDepotKey = depotKey === "west" ? "east" : "west";
    const uploadedRemark =
      activeInsertionRemarkMaps?.[depotKey]?.[cleanTid] ||
      activeInsertionRemarkMaps?.[oppositeDepotKey]?.[cleanTid];
    const fallbackRemark =
      getBuiltinInsertionAssistRemark(dayKey, depotKey, cleanTid) ||
      getBuiltinInsertionAssistRemark(dayKey, oppositeDepotKey, cleanTid);

    return getInsertionAssistRemarkStyle(uploadedRemark || fallbackRemark) || specialStyle;
  }, [activeInsertionRemarkMaps, selectedTimetableType]);

  const getTidScheduledTime = (tid, depot, options = {}) => {
    const { allowFallback = true } = options || {};
    const dayKey = getDayScheduleKey();
    const depotKey = normalizeDepotKey(depot);
    const oppositeDepotKey = depotKey === "west" ? "east" : "west";
    const cleanTid = Number(String(tid || "").replace(/\D/g, ""));
    if (!cleanTid) return null;

    // Uploaded timetable selected in the header is the first source of truth.
    // West insertion uses Departure 3A1P1 minus 00:04:30.
    // East insertion uses Departure 3K1P2 minus 00:05:22.
    const uploadedTime =
      activeInsertionTimeMaps?.[depotKey]?.[cleanTid] ||
      activeInsertionTimeMaps?.[oppositeDepotKey]?.[cleanTid];

    if (uploadedTime) return uploadedTime;

    // Then fall back to the built-in schedule for the selected timetable type.
    const sameDayTime =
      TID_TIME_MAPS[dayKey]?.[depotKey]?.[cleanTid] ||
      TID_TIME_MAPS[dayKey]?.[oppositeDepotKey]?.[cleanTid];

    if (sameDayTime) return sameDayTime;
    if (!allowFallback) return null;

    // PNG export can be prepared while viewing / typing TIDs from a different schedule day.
    // Keep the East Depot PNG from losing the timing pill by checking the remaining day maps too.
    const fallbackDayOrder = ["weekday", "friday", "saturday"].filter((key) => key !== dayKey);

    for (const fallbackDay of fallbackDayOrder) {
      const fallbackTime =
        TID_TIME_MAPS[fallbackDay]?.[depotKey]?.[cleanTid] ||
        TID_TIME_MAPS[fallbackDay]?.[oppositeDepotKey]?.[cleanTid];

      if (fallbackTime) return fallbackTime;
    }

    return null;
  };

  const rebuildInsertionLogLineWithTime = (entry = {}, scheduledTime = "") => {
    const depot = entry.depot || getDepotFromRoad(entry.road || "");
    const mainlineTrack = entry.mainlineTrack || (depot === "west" ? 1 : 2);
    const trainKey = entry.trainKey || "";
    const road = entry.road || "";
    const tid = entry.tid !== null && entry.tid !== undefined
      ? String(entry.tid).replace(/\D/g, "")
      : String(entry.remark || entry.text || "").match(/TID\s*(\d{1,3})/i)?.[1] || "";

    if (!scheduledTime || !trainKey || !road) {
      return (entry.text || "").replace(/^\d{1,2}:\d{2}\s+hrs\s+–\s+/i, `${scheduledTime} hrs – `);
    }

    const tidPart = tid ? ` (TID ${tid})` : "";
    return `${scheduledTime} hrs – ${trainKey}${tidPart} inserted from ${road} to mainline track ${mainlineTrack}.`;
  };

  useEffect(() => {
    if (!insertionLog.length) return;

    let changed = false;
    const nextLog = insertionLog.map((entry) => {
      if (!entry || entry.isSweeping) return entry;

      const tid = entry.tid !== null && entry.tid !== undefined
        ? String(entry.tid).replace(/\D/g, "")
        : String(entry.remark || entry.text || "").match(/TID\s*(\d{1,3})/i)?.[1] || "";
      const depot = entry.depot || getDepotFromRoad(entry.road || "");
      const scheduledTime = tid ? getTidScheduledTime(tid, depot, { allowFallback: false }) : null;
      if (!scheduledTime) return entry;

      const nextText = rebuildInsertionLogLineWithTime(entry, scheduledTime);
      if (entry.time === scheduledTime && entry.text === nextText) return entry;

      changed = true;
      return {
        ...entry,
        time: scheduledTime,
        text: nextText,
      };
    });

    if (changed) {
      markInsertionLiveLocalEdit();
      setInsertionLog(sortInsertionLogByTime(nextLog));
    }
  }, [activeTimetable?.id, selectedTimetableType, insertionLiveLoaded, insertionLog]);

  useEffect(() => {
    if (!pg2InsertionLog.length) return;

    let changed = false;
    const nextLog = pg2InsertionLog.map((entry) => {
      if (!entry || entry.isSweeping) return entry;

      const tid = entry.tid !== null && entry.tid !== undefined
        ? String(entry.tid).replace(/\D/g, "")
        : String(entry.remark || entry.text || "").match(/TID\s*(\d{1,3})/i)?.[1] || "";
      const depot = entry.depot || getDepotFromRoad(entry.road || "");
      const scheduledTime = tid ? getTidScheduledTime(tid, depot, { allowFallback: false }) : null;
      if (!scheduledTime) return entry;

      const nextText = rebuildInsertionLogLineWithTime(entry, scheduledTime);
      if (entry.time === scheduledTime && entry.text === nextText) return entry;

      changed = true;
      return {
        ...entry,
        time: scheduledTime,
        text: nextText,
      };
    });

    if (changed) {
      markInsertionLiveLocalEdit();
      setPg2InsertionLog(sortInsertionLogByTime(nextLog));
    }
  }, [activeTimetable?.id, selectedTimetableType, insertionLiveLoaded, pg2InsertionLog]);

  const applyInsertionTickToLog = useCallback((prevLog = [], road, bi, trainKey, remark = "", sweepTrack = "") => {
    const cellKey = `${road}-${bi}`;
    const logKey = `ins-${cellKey}`;
    const existing = (prevLog || []).find((l) => l.key === logKey);
    const existingMatchesCurrentTrain = existing && normalizeTrainId(existing.trainKey || "") === normalizeTrainId(trainKey || "");
    if (existingMatchesCurrentTrain) {
      return (prevLog || []).filter((l) => l.key !== logKey);
    }

    const depot = WEST_ROADS.includes(road) ? "west" : "east";
    const mainlineTrack = depot === "west" ? 1 : 2;
    const paddedTrainKey = padTrainId(normalizeTrainId(trainKey));
    if (!paddedTrainKey) return prevLog || [];

    // Parse remark: plain number, "TID N", "TID: N" or "T121" => TID.
    // Anything else (e.g. "3K1" / "SW") stays as a destination/remark label.
    const tidStr = remark && remark.toString().trim();
    const normalizedRemark = (tidStr || "").toUpperCase();
    const tidMatch = tidStr ? tidStr.match(/^(?:tid[:\s-]*)?t?(\d{1,3})$/i) : null;
    const tid = tidMatch ? parseInt(tidMatch[1], 10) : null;

    // Insertion Log timing follows the TID schedule for the actual day:
    // weekday / friday / saturday. If the TID is not found, fallback to current clock time.
    const scheduledTime = tid ? getTidScheduledTime(tid, depot, { allowFallback: false }) : null;
    const time = scheduledTime || formatTime(new Date());

    // SW is a sweeping movement. Ask the user to choose TK1/TK2 in the cell,
    // then generate the road-specific signal log instead of normal insertion.
    if (normalizedRemark === "SW") {
      const normalizedSweepTrack = (sweepTrack || "").toString().trim().toUpperCase();
      if (!["TK1", "TK2"].includes(normalizedSweepTrack)) return prevLog || [];

      const signal = getSweepingSignal(road, normalizedSweepTrack);
      const clearTime = getSweepingClearTime(time, road, normalizedSweepTrack);
      const line = `${time} hrs – ${paddedTrainKey} sweeping started from ${road} to signal ${signal} at 45 kph. Track confirmed clear at ${clearTime} hrs.`;

      return sortInsertionLogByTime([
        ...(prevLog || []).filter((l) => l.key !== logKey),
        {
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
        },
      ]);
    }

    // Parenthetical: TID number > remark label > nothing
    const tidPart = tid !== null ? ` (TID ${tid})` : tidStr ? ` (${tidStr})` : "";
    const line = `${time} hrs – ${paddedTrainKey}${tidPart} inserted from ${road} to mainline track ${mainlineTrack}.`;

    return sortInsertionLogByTime([
      ...(prevLog || []).filter((l) => l.key !== logKey),
      { key: logKey, text: line, time, depot, road, trainKey: paddedTrainKey, tid, mainlineTrack, remark: tidStr || "" },
    ]);
  }, [getTidScheduledTime]);

  const handleInsertionTick = useCallback((road, bi, trainKey, remark = "", sweepTrack = "") => {
    markInsertionLiveLocalEdit();
    setInsertionLog((prev) => applyInsertionTickToLog(prev, road, bi, trainKey, remark, sweepTrack));
  }, [applyInsertionTickToLog, markInsertionLiveLocalEdit]);

  const handlePg2InsertionTick = useCallback((road, bi, trainKey, remark = "", sweepTrack = "") => {
    markInsertionLiveLocalEdit();
    setPg2InsertionLog((prev) => applyInsertionTickToLog(prev, road, bi, trainKey, remark, sweepTrack));
  }, [applyInsertionTickToLog, markInsertionLiveLocalEdit]);

  const clearTidInputForInsertionKey = (key) => {
    const match = (key || "").match(/^ins-(.+)-(\d+)$/);
    if (!match) return;

    const cellKey = `${match[1]}-${match[2]}`;
    setTidInputs((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, cellKey)) return prev;
      const next = { ...prev };
      delete next[cellKey];
      return next;
    });
  };

  const clearTidInputsForInsertionDepot = (depot) => {
    const targetRoads = depot === "west" ? WEST_ROADS : EAST_ROADS;
    setTidInputs((prev) => {
      const next = { ...prev };
      let changed = false;

      targetRoads.forEach((road) => {
        for (let bi = 0; bi < 7; bi += 1) {
          const cellKey = `${road}-${bi}`;
          if (Object.prototype.hasOwnProperty.call(next, cellKey)) {
            delete next[cellKey];
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  };

  const clearPg2TidInputForInsertionKey = (key) => {
    const match = (key || "").match(/^ins-(.+)-(\d+)$/);
    if (!match) return;

    const cellKey = `${match[1]}-${match[2]}`;
    setPg2TidInputs((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, cellKey)) return prev;
      const next = { ...prev };
      delete next[cellKey];
      return next;
    });
  };

  const clearPg2TidInputsForInsertionDepot = (depot) => {
    const targetRoads = depot === "west" ? WEST_ROADS : EAST_ROADS;
    setPg2TidInputs((prev) => {
      const next = { ...prev };
      let changed = false;

      targetRoads.forEach((road) => {
        for (let bi = 0; bi < 7; bi += 1) {
          const cellKey = `${road}-${bi}`;
          if (Object.prototype.hasOwnProperty.call(next, cellKey)) {
            delete next[cellKey];
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  };

  const handleRemovePg2InsertionLog = (key) => {
    markInsertionLiveLocalEdit();
    clearPg2TidInputForInsertionKey(key);
    setPg2InsertionLog((prev) => prev.filter((l) => l.key !== key));
  };

  const handleRemoveInsertionLog = (key) => {
    markInsertionLiveLocalEdit();
    clearTidInputForInsertionKey(key);
    setInsertionLog((prev) => prev.filter((l) => l.key !== key));
  };

  const handleClearInsertionDepot = (depot) => {
    markInsertionLiveLocalEdit();
    clearTidInputsForInsertionDepot(depot);
    setInsertionLog((prev) => prev.filter((l) => l.depot !== depot));
  };

  const handleClearPg2InsertionDepot = (depot) => {
    markInsertionLiveLocalEdit();
    clearPg2TidInputsForInsertionDepot(depot);
    setPg2InsertionLog((prev) => prev.filter((l) => l.depot !== depot));
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

  const handleClearPg2InsertedTidRemarks = useCallback((roads, blockIndices) => {
    markInsertionLiveLocalEdit();
    const targetKeys = new Set();
    roads.forEach((road) => {
      blockIndices.forEach((bi) => targetKeys.add(`ins-${road}-${bi}`));
    });

    setPg2InsertionLog((prev) => prev.map((entry) => {
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

  const handleClearPg2InsertedTrains = useCallback((roads, blockIndices) => {
    markInsertionLiveLocalEdit();
    const targetKeys = new Set();
    roads.forEach((road) => {
      blockIndices.forEach((bi) => targetKeys.add(`ins-${road}-${bi}`));
    });

    setPg2InsertionLog((prev) => prev.filter((entry) => !targetKeys.has(entry.key)));
  }, [markInsertionLiveLocalEdit]);

  const handlePg2TidChange = useCallback((road, bi, value) => {
    markInsertionLiveLocalEdit();
    setPg2TidInputs((prev) => ({ ...prev, [`${road}-${bi}`]: value }));
  }, [markInsertionLiveLocalEdit]);

  const handlePg2TrainIdChange = useCallback((depot, road, blockIndex, value) => {
    markInsertionLiveLocalEdit();
    const normalizedDepot = normalizeDepotKey(depot);
    const cellKey = `${road}-${blockIndex}`;
    const logKey = `ins-${cellKey}`;

    setPg2Stabling((prev) => {
      const currentDepotData = normalizedDepot === "west" ? prev.westData : prev.eastData;
      const previousKey = normalizeTrainId(currentDepotData?.[road]?.[blockIndex]?.trainId || "");
      const incomingKey = normalizeTrainId(value);

      if (previousKey !== incomingKey) {
        setPg2TidInputs((prevInputs) => {
          if (!Object.prototype.hasOwnProperty.call(prevInputs, cellKey)) return prevInputs;
          const nextInputs = { ...prevInputs };
          delete nextInputs[cellKey];
          return nextInputs;
        });
        setPg2InsertionLog((prevLog) => prevLog.filter((entry) => entry.key !== logKey));
      }

      const next = cloneInsertionStablingState(prev.westData, prev.eastData);
      const target = normalizedDepot === "west" ? next.westData : next.eastData;
      const blocks = [...(target[road] || emptyBlocks())];
      blocks[blockIndex] = { ...(blocks[blockIndex] || { trainId: "", extraRemark: "" }), trainId: value };
      target[road] = blocks;
      return next;
    });
  }, [markInsertionLiveLocalEdit]);

  const handleRefreshPg2FromDefault = useCallback(() => {
    markInsertionLiveLocalEdit();
    setPg2Stabling(cloneInsertionStablingState(westDataRef.current, eastDataRef.current));
    setPg2InsertionLog([]);
    setPg2TidInputs({});
    setActiveInsertionPg("pg2");
  }, [markInsertionLiveLocalEdit]);

  const getDepotFromRoad = (road) => WEST_ROADS.includes(road) ? "west" : "east";

  const buildPSTLogLine = (startTime, endTime, road, trainKey, alarmStatus = "no_alarm") => {
    const paddedKey = padTrainId(normalizeTrainId(trainKey));
    const depotLabel = WEST_ROADS.includes(road) ? "WD" : "ED";
    const roadFormatted = road.replace(/^(WD|ED)-/, `${depotLabel}–`);
    const alarmText = alarmStatus === "alarm" ? " Alarm reported." : " No alarm reported.";
    return `${startTime} hrs – PST commenced at ${roadFormatted} for ${paddedKey}. Completed at ${endTime} hrs.${alarmText}`;
  };

  const handlePSTStartTimeChange = useCallback((road, bi, trainKey, startTime) => {
    const cleanStartTime = cleanMovementCustomTimeInput(startTime);

    markPSTLiveLocalEdit();
    const cellKey = `${road}-${bi}`;
    const logKey = `pst-${cellKey}`;
    const currentPst = pstState[cellKey];
    if (!currentPst) return;

    const paddedKey = padTrainId(normalizeTrainId(trainKey || currentPst.trainKey));
    const isCompleteTime = /^\d{2}:\d{2}$/.test(cleanStartTime);
    const endTime = isCompleteTime ? addMinutesToHHMM(cleanStartTime, 6) : currentPst.endTime;
    const alarmStatus = currentPst.alarmStatus || "no_alarm";

    setPstState((prev) => {
      const current = prev[cellKey];
      if (!current) return prev;
      return {
        ...prev,
        [cellKey]: {
          ...current,
          startTime: cleanStartTime,
          endTime,
          trainKey: paddedKey || current.trainKey,
        },
      };
    });

    if ((currentPst.done || currentPst.confirming) && isCompleteTime) {
      const depot = getDepotFromRoad(road);
      const nextLogEntry = {
        key: logKey,
        text: buildPSTLogLine(cleanStartTime, endTime, road, paddedKey, alarmStatus),
        type: "PST",
        depot,
        road,
        trainKey: paddedKey,
        startTime: cleanStartTime,
        endTime,
        alarmStatus,
      };
      setPstLogLines((prev) => sortPSTLogLinesByTime([
        ...prev.filter((line) => line.key !== logKey),
        nextLogEntry,
      ]));
    }
  }, [markPSTLiveLocalEdit, pstState]);

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

    const paddedKey = padTrainId(normalizeTrainId(trainKey));
    const depot = getDepotFromRoad(road);

    // Second click: change ⏳PST to ✓ PST and keep/update the generated default No Alarm log.
    if (current?.confirming) {
      const startTime = normalizeMovementCustomTimeInput(current.startTime);
      if (!/^\d{2}:\d{2}$/.test(startTime)) return;
      const endTime = addMinutesToHHMM(startTime, 6);
      const finalAlarmStatus = alarmStatus || "no_alarm";
      const line = buildPSTLogLine(startTime, endTime, road, paddedKey, finalAlarmStatus);

      setPstState((prev) => ({
        ...prev,
        [cellKey]: {
          done: true,
          confirming: false,
          startTime,
          endTime,
          alarmStatus: finalAlarmStatus,
          trainKey: paddedKey,
        },
      }));
      setPstLogLines((prev) => sortPSTLogLinesByTime([
        ...prev.filter((l) => l.key !== `pst-${cellKey}`),
        { key: `pst-${cellKey}`, text: line, type: "PST", depot, road, trainKey: paddedKey, startTime, endTime, alarmStatus: finalAlarmStatus },
      ]));
      return;
    }

    // First click: show ⏳PST and generate the log immediately with default "No alarm reported".
    const now = new Date();
    const startTime = formatTime(now);
    const endTime = formatTime(addMinutes(now, 6));
    const finalAlarmStatus = alarmStatus || "no_alarm";
    const line = buildPSTLogLine(startTime, endTime, road, paddedKey, finalAlarmStatus);

    setPstState((prev) => ({
      ...prev,
      [cellKey]: {
        done: false,
        confirming: true,
        startTime,
        endTime,
        alarmStatus: finalAlarmStatus,
        trainKey: paddedKey,
      },
    }));
    setPstLogLines((prev) => sortPSTLogLinesByTime([
      ...prev.filter((l) => l.key !== `pst-${cellKey}`),
      { key: `pst-${cellKey}`, text: line, type: "PST", depot, road, trainKey: paddedKey, startTime, endTime, alarmStatus: finalAlarmStatus },
    ]));
  };

  const buildTrainPrepLogLine = (time, trainKey, road, taName = "") => {
    const depotLabel = WEST_ROADS.includes(road) ? "WD" : "ED";
    const roadFormatted = road.replace(/^(WD|ED)-/, `${depotLabel}–`);
    const formattedTaName = formatTACompletedBy(taName);
    const taStr = formattedTaName ? ` Performed by ${formattedTaName}` : "";
    return `${time} hrs –  ${trainKey} Train preparation completed at ${roadFormatted}.${taStr}`;
  };

  const handlePrepCompletionTimeChange = (road, bi, trainKey, endTime) => {
    const cleanEndTime = cleanMovementCustomTimeInput(endTime);

    markPSTLiveLocalEdit();
    const cellKey = `${road}-${bi}`;
    const paddedKey = trainKey.replace(/^T(\d+)$/, (_, n) => `T${n.padStart(2, "0")}`);
    const currentPrep = prepState[cellKey];
    if (!currentPrep?.done) return;
    const completedTaName = (currentPrep.taName || taNameState[cellKey] || "").toString().trim();
    const entryTrainKey = currentPrep.trainKey || paddedKey;

    setPrepState((prev) => {
      const current = prev[cellKey];
      if (!current?.done) return prev;
      return {
        ...prev,
        [cellKey]: {
          ...current,
          endTime: cleanEndTime,
          time: cleanEndTime,
          trainKey: current.trainKey || paddedKey,
        },
      };
    });

    setPstLogLines((prev) => {
      const logKey = `prep-${cellKey}`;
      let found = false;
      const next = prev.map((entry) => {
        if (entry.key !== logKey) return entry;
        found = true;
        return {
          ...entry,
          text: buildTrainPrepLogLine(cleanEndTime, entry.trainKey || entryTrainKey, road, entry.taName || completedTaName),
          time: cleanEndTime,
          endTime: cleanEndTime,
          startTime: "",
        };
      });
      if (!found) {
        const depot = getDepotFromRoad(road);
        next.push({
          key: logKey,
          text: buildTrainPrepLogLine(cleanEndTime, entryTrainKey, road, completedTaName),
          type: "Prep",
          depot,
          road,
          trainKey: entryTrainKey,
          startTime: "",
          time: cleanEndTime,
          endTime: cleanEndTime,
          taName: completedTaName,
        });
      }
      return sortPSTLogLinesByTime(next);
    });
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
    const endTime = formatTime(new Date());
    const resolvedTaName = taNameState[cellKey] || taName || "";
    const completedTaName = resolvedTaName.trim();
    const line = buildTrainPrepLogLine(endTime, paddedKey, road, completedTaName);
    const depot = getDepotFromRoad(road);

    setPrepState((prev) => ({
      ...prev,
      [cellKey]: { done: true, endTime, time: endTime, trainKey: paddedKey, taName: completedTaName },
    }));
    setPstLogLines((prev) => sortPSTLogLinesByTime([
      ...prev.filter((l) => l.key !== `prep-${cellKey}`),
      { key: `prep-${cellKey}`, text: line, type: "Prep", depot, road, trainKey: paddedKey, startTime: "", time: endTime, endTime, taName: completedTaName },
    ]));
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
    setPstLogLines((prev) => prev.filter((line) => !(line.depot === depot && isTrainPrepLogEntry(line))));
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
  const westStablingKeys = getWestStablingKeys(westData);
  const westStablingLocations = getWestStablingLocations(westData);
  const maintenanceMap = buildMaintenanceMap(requests, westStablingKeys);
  const activeInsertionPgKey = normalizeInsertionPg(activeInsertionPg);
  const activeInsertionWestData = activeInsertionPgKey === "pg2" ? pg2Stabling.westData : westData;
  const activeInsertionEastData = activeInsertionPgKey === "pg2" ? pg2Stabling.eastData : eastData;
  const activeInsertionLog = activeInsertionPgKey === "pg2" ? pg2InsertionLog : insertionLog;
  const activeInsertionTidInputs = activeInsertionPgKey === "pg2" ? pg2TidInputs : tidInputs;
  const activeInsertionTickHandler = activeInsertionPgKey === "pg2" ? handlePg2InsertionTick : handleInsertionTick;
  const activeInsertionRemoveHandler = activeInsertionPgKey === "pg2" ? handleRemovePg2InsertionLog : handleRemoveInsertionLog;
  const activeInsertionClearDepotHandler = activeInsertionPgKey === "pg2" ? handleClearPg2InsertionDepot : handleClearInsertionDepot;
  const activeClearInsertedTidRemarksHandler = activeInsertionPgKey === "pg2" ? handleClearPg2InsertedTidRemarks : handleClearInsertedTidRemarks;
  const activeClearInsertedTrainsHandler = activeInsertionPgKey === "pg2" ? handleClearPg2InsertedTrains : handleClearInsertedTrains;
  const activeTidChangeHandler = activeInsertionPgKey === "pg2" ? handlePg2TidChange : handleTidChange;

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

            <TimetableHeaderControl
              selectedType={selectedTimetableType}
              activeTimetable={activeTimetable}
              loading={timetableLoading}
              saving={timetableSaving}
              error={timetableError}
              onTypeChange={handleTimetableTypeChange}
              onUpload={handleTimetableUpload}
              onDownload={handleTimetableDownload}
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
            <div className="flex w-[178px] flex-none items-center gap-2 bg-[#071828] border border-[#1a3a56] px-3 py-1.5 rounded-lg">
              <div className={`w-1.5 h-1.5 flex-none rounded-full ${syncError ? "bg-red-400" : syncing ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
              <span className="min-w-0 truncate whitespace-nowrap text-[10px] text-[#7eb8e0]">
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
              label: "Train Request",
              code: "REQ",
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
              code: "MOV",
              to: "/train-movement",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="3" width="16" height="15" rx="3"/><path d="M8 21l2-3"/><path d="M16 21l-2-3"/><path d="M8 8h8"/><path d="M8 13h.01"/><path d="M16 13h.01"/>
                </svg>
              ),
            },

            {
              key: "pst",
              label: "PST Train Prep",
              code: "PST",
              to: "/pst-train-prep",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              ),
            },
            {
              key: "insertion",
              label: "Train Insertion",
              code: "INS",
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
              code: "WSH",
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
              code: "ODO",
              to: "/odo-reading",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              ),
            },
            {
              key: "alarm",
              label: "Alarm",
              code: "ALM",
              to: "/alarm",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              ),
            },
            {
              key: "possession",
              label: "Possession Log",
              code: "PSS",
              to: "/possession",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>
                </svg>
              ),
            },
            {
              key: "admin",
              label: "Admin",
              code: "ADM",
              to: "/admin",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4z"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              ),
            },
          ].map(({ key, label, code, to }) => {
            const isActive = activeTab === key;
            const adminBottomClass = key === "admin" ? " mt-auto" : "";
            const navClass = isSidebarCollapsed
              ? `flex items-center justify-center px-1 py-2.5 text-xs font-normal transition-all text-left w-full${adminBottomClass} ${
                  isActive
                    ? "text-white"
                    : "text-[#7eb8e0] hover:text-white"
                }`
              : `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-left w-full${adminBottomClass} ${
                  isActive
                    ? "bg-[#1a3a5c] text-white shadow-sm border border-[#2b4f6b]"
                    : "text-[#7eb8e0] hover:text-white hover:bg-[#0f2d4a]"
                }`;

            if (to) {
              return (
                <a
                  key={key}
                  href={`#${to}`}
                  onClick={(event) => handleSidebarShortcutClick(event, key, to)}
                  title={isSidebarCollapsed ? label : undefined}
                  className={navClass}
                >
                  <span
                    className={`${isSidebarCollapsed ? "w-9 text-[10px]" : "w-8 text-[9px]"} flex flex-shrink-0 items-center justify-center font-normal uppercase tracking-wider text-current`}
                  >
                    {code}
                  </span>
                  {!isSidebarCollapsed && <span>{label}</span>}
                </a>
              );
            }

            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                title={isSidebarCollapsed ? label : undefined}
                className={navClass}
              >
                <span
                  className={`${isSidebarCollapsed ? "w-9 text-[10px]" : "w-8 text-[9px]"} flex flex-shrink-0 items-center justify-center font-normal uppercase tracking-wider text-current`}
                >
                  {code}
                </span>
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
        eastData={eastData}
        activeTimetable={activeTimetable}
        activeTimetableType={selectedTimetableType}
      />

      <RemovalLogOutputFromTrainRem
        trainRemState={trainRemCheckState}
        maintenanceMap={maintenanceMap}
        requests={requests}
        westData={westData}
        eastData={eastData}
        activeTimetable={activeTimetable}
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
          stabledTrainIds={Array.from(westStablingKeys)}
          stabledTrainLocations={westStablingLocations}
        />
      </div>

      <TrainRemPanel
        maintenanceMap={maintenanceMap}
        onTrainRemStateChange={setTrainRemCheckState}
        eastStablingData={eastData}
        requests={requests}
        westData={westData}
        eastData={eastData}
        activeTimetable={activeTimetable}
        activeTimetableType={selectedTimetableType}
      />
    </div>
  </div>
)}

        {activeTab === "movement" && (
          <TrainMovementContent />
        )}


        {activeTab === "insertion" && (
          <InsertionTabContent
            westData={activeInsertionWestData}
            eastData={activeInsertionEastData}
            maintenanceMap={maintenanceMap}
            insertionLog={activeInsertionLog}
            onInsertionTick={activeInsertionTickHandler}
            onRemoveInsertionLog={activeInsertionRemoveHandler}
            onClearInsertionDepot={activeInsertionClearDepotHandler}
            onClearInsertedTidRemarks={activeClearInsertedTidRemarksHandler}
            onClearInsertedTrains={activeClearInsertedTrainsHandler}
            tidInputs={activeInsertionTidInputs}
            onTidChange={activeTidChangeHandler}
            getTidScheduledTime={getTidScheduledTime}
            getTidAssistRemarkStyle={getTidAssistRemarkStyle}
            activeTimetable={activeTimetable}
            activeTimetableType={selectedTimetableType}
            insertionLiveStatusText={insertionLiveStatusText}
            insertionLiveStatusClass={insertionLiveStatusClass}
            insertionLiveDebug={insertionLiveDebug}
            activePg={activeInsertionPgKey}
            onPgChange={setActiveInsertionPg}
            onRefreshPg2={handleRefreshPg2FromDefault}
            stablingEditable={activeInsertionPgKey === "pg2"}
            onEditableTrainIdChange={handlePg2TrainIdChange}
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
            onPrepCompletionTimeChange={handlePrepCompletionTimeChange}
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

        {activeTab === "alarm" && (
          <AlarmContent />
        )}

        {activeTab === "admin" && (
          <div className="w-full px-2 pb-10 pt-6">
            <div className="mx-auto w-full max-w-[620px]">
              {!isAdminUnlocked ? (
                <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-[24px] border border-[#23506f]/80 bg-[#061827]/95 shadow-[0_20px_70px_rgba(0,0,0,0.38)] backdrop-blur">
                  <div className="relative border-b border-[#1a3a56]/80 bg-gradient-to-br from-[#0d3455] via-[#08223a] to-[#061827] px-5 py-5">
                    <div className="absolute right-5 top-5 h-10 w-10 rounded-full border border-[#4f8ef7]/25 bg-[#4f8ef7]/10 blur-[1px]" />
                    <div className="relative flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4f8ef7]/40 bg-[#0f2d4a] text-[11px] font-semibold tracking-[0.22em] text-[#bceaff] shadow-[0_0_22px_rgba(79,142,247,0.18)]">
                        ADM
                      </div>
                      <div>
                        <p className="text-[10px] font-normal uppercase tracking-[0.24em] text-[#6db6e8]">Admin access</p>
                        <h2 className="mt-1 text-[18px] font-semibold text-white">Admin Login</h2>
                      </div>
                    </div>
                    <p className="relative mt-4 text-[11px] leading-relaxed text-[#8dc7ed]">
                      Enter admin ID and password to unlock this page.
                    </p>
                  </div>

                  <form onSubmit={handleAdminLogin} className="px-5 py-5">
                    <label className="block text-[10px] font-normal uppercase tracking-wide text-[#7eb8e0]">
                      ID
                      <input
                        value={adminCredentials.id}
                        onChange={(event) => {
                          setAdminCredentials((prev) => ({ ...prev, id: event.target.value }));
                          setAdminError("");
                        }}
                        className="mt-2 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[13px] font-normal text-[#061827] outline-none transition focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </label>
                    <label className="mt-4 block text-[10px] font-normal uppercase tracking-wide text-[#7eb8e0]">
                      Password
                      <input
                        type="password"
                        value={adminCredentials.password}
                        onChange={(event) => {
                          setAdminCredentials((prev) => ({ ...prev, password: event.target.value }));
                          setAdminError("");
                        }}
                        className="mt-2 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[13px] font-normal text-[#061827] outline-none transition focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
                        autoComplete="current-password"
                      />
                    </label>
                    {adminError && (
                      <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] font-normal text-red-200">
                        {adminError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="mt-5 flex h-10 w-full items-center justify-center rounded-xl border border-[#4f8ef7]/60 bg-[#1b5f93] text-[11px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(79,142,247,0.22)] transition hover:bg-[#2476b4] active:scale-[0.99]"
                    >
                      Login
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="rounded-[24px] border border-[#1d4869] bg-[#061827]/90 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.25)]">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#4f8ef7]/35 bg-[#0f2d4a] text-[10px] font-semibold tracking-[0.16em] text-[#bceaff]">
                        ADM
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#6db6e8]">Admin notes</p>
                        <h2 className="truncate text-[17px] font-normal leading-tight text-white">Modern Note</h2>
                        <p className={`mt-0.5 flex items-center gap-1 text-[10px] font-semibold ${adminNotesDbReady ? "text-emerald-300" : "text-amber-300"}`}>
                          {(adminNotesLoading || adminNotesSaving) && <Loader2 className="h-3 w-3 animate-spin" />}
                          {adminNotesLoading ? "Loading live notes..." : adminNotesSaving ? "Saving live..." : adminNotesLiveStatus}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={collapseAllAdminNotes}
                        className="shrink-0 rounded-2xl border border-[#2b4f6b] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8bd5ff] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white active:scale-[0.98]"
                        title="Collapse all expanded parents"
                      >
                        Collapse All
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAdminNote}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[#dbeafe] text-[#0f2d4a] shadow-sm transition active:scale-95"
                        title="Add parent"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleAdminLogout}
                        className="rounded-2xl border border-[#2b4f6b] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8bd5ff] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white active:scale-[0.98]"
                      >
                        Logout
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={adminSearch}
                      onChange={(event) => setAdminSearch(event.target.value)}
                      placeholder="Search admin note"
                      className="h-11 w-full rounded-2xl border border-[#d7e3ee] bg-[#f8fbff] pl-11 pr-4 text-[13px] font-normal text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#93c5fd] focus:ring-2 focus:ring-[#93c5fd]/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    {visibleAdminNotes.map((item, visibleIndex) => {
                      const itemIndex = adminNotes.findIndex((noteItem) => noteItem.id === item.id);
                      const isEditingTitle = adminEditingNoteId === item.id;
                      const isExpanded = adminSearchKeyword ? true : !item.collapsed;
                      const noteChars = String(item.note || "").trim().length;

                      return (
                        <section
                          key={item.id}
                          className="rounded-2xl border px-2.5 py-1.5 shadow-sm"
                          style={getAdminNoteCardStyle(visibleIndex)}
                        >
                          {isEditingTitle ? (
                            <form onSubmit={(event) => saveAdminTitle(event, item)} className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={adminTitleDraft}
                                onChange={(event) => setAdminTitleDraft(event.target.value)}
                                placeholder="Parent name"
                                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[15px] font-normal text-slate-800 outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-200"
                              />
                              <button
                                type="submit"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition-transform active:scale-95"
                                title="Save name"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelAdminTitleEdit}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-transform active:scale-95"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleAdminNoteCollapsed(item.id)}
                                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl text-left transition active:scale-[0.99]"
                                aria-expanded={isExpanded}
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/65 text-slate-600 ring-1 ring-white/70">
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[17px] font-normal leading-tight tracking-tight text-slate-800">{item.title}</span>
                                  <span className="mt-px block text-[10px] font-semibold leading-tight text-slate-500">
                                    {noteChars ? `${noteChars} chars saved` : "empty note"}
                                  </span>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => moveAdminNote(item.id, "up")}
                                disabled={itemIndex <= 0}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:opacity-25"
                                title="Move up"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveAdminNote(item.id, "down")}
                                disabled={itemIndex < 0 || itemIndex === adminNotes.length - 1}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:opacity-25"
                                title="Move down"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => startAdminTitleEdit(item)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700"
                                title="Edit parent name"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAdminNote(item.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-rose-500 transition-colors hover:bg-white/60 hover:text-rose-600"
                                title="Delete parent"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {isExpanded && !isEditingTitle && (
                            <div className="mt-1.5 rounded-2xl border border-white/65 bg-white/80 p-2 shadow-inner shadow-white/40">
                              <AdminAutoResizeTextarea
                                value={item.note || ""}
                                onChange={(value) => handleAdminNoteChange(item.id, value)}
                                placeholder="Write note here..."
                              />
                              <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-semibold text-slate-500">
                                <span>{adminNotesDbReady ? "Live saved after refresh" : adminNotesLiveStatus}</span>
                                <span>{item.title}</span>
                              </div>
                            </div>
                          )}
                        </section>
                      );
                    })}

                    {adminSearchKeyword && visibleAdminNotes.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center shadow-sm">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                          <Search className="h-4 w-4" />
                        </div>
                        <h3 className="mt-2 text-sm font-normal text-slate-800">No admin note found</h3>
                        <p className="mt-1 text-xs text-slate-400">Try another parent name or note keyword.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        </div>
        </main>
      </div>
    </div>
  );
}

function getTrainRequestDisplayType(request = {}) {
  return cleanRequestLabel(
    request?.requestType === "Other"
      ? request?.customType || "Other"
      : request?.requestType || "Request"
  ) || "Request";
}

function isUnfitTrainRequest(request = {}) {
  const displayType = normalizeRemarkText(getTrainRequestDisplayType(request));
  return displayType === "unfit" || displayType === "workshop /unfit" || displayType === "workshop / unfit";
}

function getTrainRemRowForTrain(trainRemState = {}, trainKey = "") {
  const key = normalizeTrainId(trainKey);
  if (!key) return null;

  for (const depot of ["west", "east"]) {
    const selectedPreset = trainRemState?.selectedPreset?.[depot] || "9am";
    const rows = normalizeTrainRemRowsForPreset(trainRemState?.rows?.[depot], depot, selectedPreset);
    const matchIndex = rows.findIndex((row) => normalizeTrainId(row.trainId) === key);
    if (matchIndex >= 0) {
      const match = rows[matchIndex];
      const isWest9amPreset = isTrainRemWest9amPreset(depot, selectedPreset);
      return {
        depot,
        tid: (match.tid || "").toString().trim(),
        timing: (match.timing || "").toString().trim(),
        remark: (match.remark || "").toString().trim(),
        rowIndex: matchIndex,
        selectedPreset,
        isWest9amReferenceOnly: isTrainRemReferenceOnlyIndex(depot, selectedPreset, matchIndex),
        isWest9amRealRemoval: isWest9amPreset && matchIndex < TRAIN_REM_WEST_9AM_REAL_ROW_COUNT,
      };
    }
  }

  return null;
}

function isWest9amPrioritySwapTid(trainRemState = {}, row = {}, rowIndex = -1) {
  const selectedPreset = trainRemState?.selectedPreset?.west || "";

  if (isTrainRemReferenceOnlyIndex("west", selectedPreset, rowIndex)) return true;

  const tid = (row?.tid || "").toString().trim();
  return selectedPreset === "9am" && rowIndex < 0 && TRAIN_REM_WEST_9AM_PRIORITY_TIDS.has(tid);
}

function getWestRemovalRowsMap(trainRemState = {}) {
  const map = new Map();

  const selectedPreset = trainRemState?.selectedPreset?.west || "9am";
  normalizeTrainRemRowsForPreset(trainRemState?.rows?.west, "west", selectedPreset).forEach((row, index) => {
    // West 9am washing reference rows are only for checking/minimising swapping.
    // They must not make the train appear under "will be removed to West Depot".
    if (isWest9amPrioritySwapTid(trainRemState, row, index)) return;

    const key = normalizeTrainId(row.trainId);
    if (!key) return;

    map.set(key, {
      tid: (row.tid || "").toString().trim(),
      timing: (row.timing || "").toString().trim(),
      remark: (row.remark || "").toString().trim(),
      rowIndex: index,
      selectedPreset,
      isWest9amRealRemoval: isTrainRemWest9amPreset("west", selectedPreset) && index < TRAIN_REM_WEST_9AM_REAL_ROW_COUNT,
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

function getMainStablingKeys(westData = {}, eastData = {}) {
  const stablingKeys = new Set();

  [...Object.values(westData || {}), ...Object.values(eastData || {})].forEach((blocks) => {
    (blocks || []).forEach((block) => {
      const key = normalizeTrainId(block?.trainId);
      if (key) stablingKeys.add(key);
    });
  });

  return stablingKeys;
}

function formatStablingRoadForPopup(road = "") {
  const match = road.toString().trim().toUpperCase().match(/(?:WD|ED)-ST(\d+)/);
  if (match) return `STB ${match[1].padStart(2, "0")}`;
  return road.toString().trim().toUpperCase();
}

function getMainStablingLocations(westData = {}, eastData = {}) {
  const locations = {};

  const addDepotLocations = (depotLabel, data = {}) => {
    Object.entries(data || {}).forEach(([road, blocks]) => {
      (blocks || []).forEach((block, blockIndex) => {
        const key = normalizeTrainId(block?.trainId);
        if (!key) return;

        const locationText = `${depotLabel} ${formatStablingRoadForPopup(road)} Block ${String(blockIndex + 1).padStart(2, "0")}`;
        if (!locations[key]) locations[key] = [];
        locations[key].push(locationText);
      });
    });
  };

  addDepotLocations("West Depot", westData);
  addDepotLocations("East Depot", eastData);

  return locations;
}

function getWestStablingLocations(westData = {}) {
  const locations = {};

  Object.entries(westData || {}).forEach(([road, blocks]) => {
    (blocks || []).forEach((block, blockIndex) => {
      const key = normalizeTrainId(block?.trainId);
      if (!key) return;

      const locationText = `West Depot ${formatStablingRoadForPopup(road)} Block ${String(blockIndex + 1).padStart(2, "0")}`;
      if (!locations[key]) locations[key] = [];
      locations[key].push(locationText);
    });
  });

  return locations;
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

function getRequestNoteSummaryForTrain(requests = [], trainKey = "", options = {}) {
  const key = normalizeTrainId(trainKey);
  if (!key) return "";

  const { includeTomorrowRequests = true } = options || {};
  const notes = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;
    if (normalizeTrainId(request?.trainId) !== key) return;
    if (!includeTomorrowRequests && isTomorrowTrainRequest(request)) return;

    const displayType = getTrainRequestDisplayType(request);
    const noteKey = normalizeRemarkText(displayType);

    if (!displayType || seen.has(noteKey)) return;

    seen.add(noteKey);
    notes.push(displayType);
  });

  return notes.join(", ");
}

function getRequestNoteSummaryFromRequests(requests = []) {
  const notes = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;

    const displayType = getTrainRequestDisplayType(request);
    const noteKey = normalizeRemarkText(displayType);

    if (!displayType || seen.has(noteKey)) return;

    seen.add(noteKey);
    notes.push(displayType);
  });

  return notes.join(", ");
}

function doesTrainRemRemarkCoverRequest(trainRemRemark = "", requestType = "") {
  const remarkKey = normalizeRequestIdentity(trainRemRemark);
  const requestKey = normalizeRequestIdentity(requestType);

  // When the removal row has no remark, treat the removal row as covering the request.
  if (!remarkKey) return true;
  if (!requestKey) return false;
  if (remarkKey === requestKey) return true;

  const remarkTokens = new Set(remarkKey.split(" ").filter(Boolean));
  return requestKey.split(" ").filter(Boolean).every((token) => remarkTokens.has(token));
}

function isRequestCoveredByWestRemoval(request = {}, westRemovalRow = null) {
  if (!westRemovalRow) return false;
  return doesTrainRemRemarkCoverRequest(westRemovalRow?.remark || "", getTrainRequestDisplayType(request));
}

function getSwappingRequestsForTrain(requests = [], trainKey = "", westRemovalRow = null, options = {}) {
  const key = normalizeTrainId(trainKey);
  if (!key) return [];

  const { includeTomorrowRequests = true } = options || {};

  return (requests || []).filter((request) => {
    if (isUnfitTrainRequest(request)) return false;
    if (normalizeTrainId(request?.trainId) !== key) return false;
    if (!includeTomorrowRequests && isTomorrowTrainRequest(request)) return false;
    return !isRequestCoveredByWestRemoval(request, westRemovalRow);
  });
}

const TOMORROW_SWAP_KEYWORDS = ["TOM", "TMR", "TMRW", "TOMORROW", "MRNING", "MORNING"];

function isTomorrowRequestText(value = "") {
  const normalized = normalizeRequestIdentity(value);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  return TOMORROW_SWAP_KEYWORDS.some((keyword) => tokens.includes(keyword));
}

function isTomorrowTrainRequest(request = {}) {
  return [
    getTrainRequestDisplayType(request),
    request?.requestType,
    request?.customType,
    request?.displayType,
    request?.note,
    request?.notes,
    request?.remark,
    request?.remarks,
  ].some(isTomorrowRequestText);
}

function getNonUnfitRequestsForTrain(requests = [], trainKey = "") {
  const key = normalizeTrainId(trainKey);
  if (!key) return [];

  return (requests || []).filter((request) => (
    !isUnfitTrainRequest(request) &&
    normalizeTrainId(request?.trainId) === key
  ));
}

function hasTomorrowRequestForTrain(requests = [], trainKey = "") {
  return getNonUnfitRequestsForTrain(requests, trainKey).some(isTomorrowTrainRequest);
}

function hasCurrentRequestForTrain(requests = [], trainKey = "") {
  return getNonUnfitRequestsForTrain(requests, trainKey).some((request) => !isTomorrowTrainRequest(request));
}

function shouldHideFromSwappingWhenTomorrowExcluded(requests = [], trainKey = "") {
  const trainRequests = getNonUnfitRequestsForTrain(requests, trainKey);
  if (!trainRequests.length) return false;

  // Hide only trains where every request is for TMRW/TOMORROW/MRNING/MORNING.
  // If the train also has a current request like WASH, keep it visible for swapping.
  return trainRequests.every(isTomorrowTrainRequest);
}

function getWorkshopTrainRequestKeys(requests = []) {
  const workshopKeys = new Set();

  (requests || []).forEach((request) => {
    const key = normalizeTrainId(request?.trainId);
    if (!key) return;

    if (isWorkshopRequestLabel(getTrainRequestDisplayType(request))) {
      workshopKeys.add(key);
    }
  });

  return workshopKeys;
}

function getRequestedTrainsForWestDepotRemoval({ requests = [], trainRemState, westData = {}, eastData = {} }) {
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

function getRequestedTrainsNotInWestDepotStablingRemoval({ requests = [], trainRemState, westData = {}, eastData = {} }) {
  const westRemovalRowsMap = getWestRemovalRowsMap(trainRemState);
  const westStablingKeys = getWestStablingKeys(westData);
  const workshopTrainKeys = getWorkshopTrainRequestKeys(requests);
  const requestedRows = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;

    const key = normalizeTrainId(request?.trainId);
    if (!key || workshopTrainKeys.has(key) || seen.has(key)) return;

    const trainRemRow = getTrainRemRowForTrain(trainRemState, key);
    const requestType = getTrainRequestDisplayType(request);
    const isWashReferenceRow = Boolean(trainRemRow?.isWest9amReferenceOnly && isWashOnlyRequestedRemark(requestType));

    if (westStablingKeys.has(key) && !isWashReferenceRow) return;

    const westRemovalRow = westRemovalRowsMap.get(key) || null;
    const swappingRequests = getSwappingRequestsForTrain(requests, key, westRemovalRow);
    if (!swappingRequests.length) return;

    seen.add(key);
    const currentSwappingRequests = swappingRequests.filter((item) => !isTomorrowTrainRequest(item));
    const hasTomorrowRequest = swappingRequests.some(isTomorrowTrainRequest);
    const hasCurrentRequest = currentSwappingRequests.length > 0;
    const hideWhenTomorrowExcluded = swappingRequests.every(isTomorrowTrainRequest);

    requestedRows.push({
      key,
      label: padTrainId(key),
      tid: getRequestTid(request, trainRemRow),
      isWest9amReferenceTid: Boolean(trainRemRow?.isWest9amReferenceOnly),
      requestType: getRequestNoteSummaryFromRequests(swappingRequests) || getTrainRequestDisplayType(request),
      requestTypeWithoutTomorrow: getRequestNoteSummaryFromRequests(currentSwappingRequests),
      timeRemoved: getRequestTiming(request, trainRemRow),
      actionNote: "",
      hasTomorrowRequest,
      hasCurrentRequest,
      hideWhenTomorrowExcluded,
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
    const washA = getRequestedRowWashOnlySortValue(a);
    const washB = getRequestedRowWashOnlySortValue(b);
    if (washA !== washB) return washA - washB;

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
  const paddedRows = normalizedRows.map((row, index) => {
    const key = row?.key || `requested-${index}`;
    const label = row?.label || "";
    const manualTid = (row?.manualTid || "").toString().trim();
    const autoTid = (row?.autoTid || "").toString().trim();
    const tid = (row?.tid || "").toString().trim();

    return {
      key,
      label,
      tid,
      autoTid,
      manualTid,
      canEditTid: Boolean(row?.canEditTid && label),
      requestType: (row?.requestType || "").toString().trim(),
      arrival3A1P2: (row?.arrival3A1P2 || "").toString().trim(),
      actionNote: (row?.actionNote || row?.secondNote || "").toString().trim(),
    };
  });

  while (paddedRows.length < minRows) {
    paddedRows.push({
      key: `empty-${paddedRows.length + 1}`,
      label: "",
      tid: "",
      autoTid: "",
      manualTid: "",
      canEditTid: false,
      requestType: "",
      arrival3A1P2: "",
      actionNote: "",
    });
  }

  return paddedRows;
}


function formatRequestedTrainNumber(value = "") {
  const trainNumber = formatTrainNumberOnly(value);
  if (trainNumber) return trainNumber;
  return (value || "").toString().trim().replace(/^T/i, "");
}

function getRequestedActionTrainSortValue(row = {}) {
  const trainNumber = Number(formatRequestedTrainNumber(row?.trainsetNumber || row?.key));
  return Number.isFinite(trainNumber) ? trainNumber : Number.POSITIVE_INFINITY;
}

function splitRequestedActionRemarks(value = "") {
  return (value || "")
    .toString()
    .split(",")
    .map((item) => cleanRequestLabel(item))
    .filter(Boolean);
}

function isWashRequestedActionRemark(value = "") {
  return normalizeRequestIdentity(value).includes("WASH");
}

function getRequestedActionRemarkPriority(value = "") {
  const normalized = normalizeRequestIdentity(value);
  if (!normalized) return 999;
  if (normalized === "SR") return 10;
  if (normalized === "CM") return 20;
  if (normalized.includes("WASH")) return 90;
  return 30;
}

function buildRequestedActionRemarkSummary(values = []) {
  const entries = [];
  const seen = new Set();

  (values || []).forEach((value) => {
    splitRequestedActionRemarks(value).forEach((remark) => {
      const key = normalizeRequestIdentity(remark);
      if (!key || seen.has(key)) return;
      seen.add(key);
      entries.push({ value: remark, index: entries.length, priority: getRequestedActionRemarkPriority(remark) });
    });
  });

  const allKnownPriority = entries.length > 0 && entries.every((entry) => entry.priority < 999);
  const orderedEntries = allKnownPriority
    ? [...entries].sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
    : entries;

  return orderedEntries.map((entry) => entry.value).join(", ");
}

function getRequestedWashOnlySortValue(value = "") {
  const remarks = splitRequestedActionRemarks(value);
  if (!remarks.length) return 2;
  return remarks.every(isWashRequestedActionRemark) ? 1 : 0;
}

function getRequestedRowWashOnlySortValue(row = {}) {
  return getRequestedWashOnlySortValue(row?.requestType || row?.actionNote || "");
}

function sortRequestedActionRows(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const washA = getRequestedRowWashOnlySortValue(a);
    const washB = getRequestedRowWashOnlySortValue(b);
    if (washA !== washB) return washA - washB;

    const trainA = getRequestedActionTrainSortValue(a);
    const trainB = getRequestedActionTrainSortValue(b);
    if (trainA !== trainB) return trainA - trainB;

    return (a?.requestType || "").localeCompare(b?.requestType || "");
  });
}

function mergeRequestedActionRowsByTrain(rows = []) {
  const mergedMap = new Map();

  (rows || []).forEach((row) => {
    if (!row || row.isSeparator) return;

    const key = normalizeTrainId(row?.key || row?.trainsetNumber);
    const group = row?.group === "removal" ? "removal" : "swap";
    if (!key) return;

    const mapKey = `${group}|${key}`;
    const existing = mergedMap.get(mapKey);

    if (existing) {
      existing._requestTypes.push(row?.requestType || "");
      existing.requestType = buildRequestedActionRemarkSummary(existing._requestTypes);
      return;
    }

    mergedMap.set(mapKey, {
      ...row,
      key,
      trainsetNumber: formatRequestedTrainNumber(key),
      requestType: buildRequestedActionRemarkSummary([row?.requestType || ""]),
      _requestTypes: [row?.requestType || ""],
    });
  });

  return [...mergedMap.values()].map(({ _requestTypes, ...row }) => row);
}

function getRequestedTrainActionOverviewRows({ requests = [], trainRemState, westData = {}, eastData = {}, includeTomorrowRequests = true } = {}) {
  const westRemovalRowsMap = getWestRemovalRowsMap(trainRemState);
  const westStablingKeys = getWestStablingKeys(westData);
  const workshopTrainKeys = getWorkshopTrainRequestKeys(requests);
  const swapRows = [];
  const removalRows = [];
  const seen = new Set();

  (requests || []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;
    if (!includeTomorrowRequests && isTomorrowTrainRequest(request)) return;

    const key = normalizeTrainId(request?.trainId);
    if (!key || workshopTrainKeys.has(key)) return;

    const requestType = getTrainRequestDisplayType(request);
    const westRemovalRow = westRemovalRowsMap.get(key) || null;
    const trainRemRow = getTrainRemRowForTrain(trainRemState, key);
    const isRemoval = isRequestCoveredByWestRemoval(request, westRemovalRow);
    const isWashReferenceRow = Boolean(trainRemRow?.isWest9amReferenceOnly && isWashOnlyRequestedRemark(requestType));

    // Keep trains that are covered by the West removal table so the
    // REQUESTED TRAIN: can show the Removal ✓ group.
    // Also keep West 9am washing-reference rows for wash-only requests so they
    // can display Late Shift Rem / Need Swapping even though they do not export.
    // Only hide already-West-Depot trains when they have no removal/reference action.
    if (!isRemoval && !isWashReferenceRow && westStablingKeys.has(key)) return;

    const group = isRemoval ? "removal" : "swap";
    const seenKey = `${key}|${normalizeRequestIdentity(requestType)}|${group}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);

    const requestTid = isRemoval
      ? (westRemovalRow?.tid || "").toString().trim()
      : getRequestTid(request, trainRemRow);
    const washShiftAction = getWashOnlyShiftRemovalAction({
      tid: requestTid,
      requestType,
      westRemovalRow: isRemoval ? westRemovalRow : null,
    });
    const finalGroup = washShiftAction?.group || group;
    const actionLabel = washShiftAction?.actionLabel || (isRemoval ? "Removal" : "Need Swapping");
    const actionSymbol = washShiftAction ? washShiftAction.actionSymbol : (isRemoval ? "✓" : "⇆");
    const actionStatus = washShiftAction?.actionStatus || `${actionLabel} ${actionSymbol}`;

    const row = {
      key,
      trainsetNumber: formatRequestedTrainNumber(key),
      tid: finalGroup === "removal" ? requestTid : "",
      requestType,
      actionLabel,
      actionSymbol,
      actionStatus,
      actionType: washShiftAction?.actionType || "",
      group: finalGroup,
    };

    if (finalGroup === "removal") removalRows.push(row);
    else swapRows.push(row);
  });

  const sortRows = (rows = []) => sortRequestedActionRows(mergeRequestedActionRowsByTrain(rows));

  const sortedSwapRows = sortRows(swapRows);
  const sortedRemovalRows = sortRows(removalRows);

  if (sortedSwapRows.length && sortedRemovalRows.length) {
    return [
      ...sortedSwapRows,
      { key: "requested-action-overview-separator", isSeparator: true },
      ...sortedRemovalRows,
    ];
  }

  return [...sortedSwapRows, ...sortedRemovalRows];
}

function getRequestedTrainActionOverviewRowsFromSwappingTable({ swappingRows = [], actionOverviewRows = [] } = {}) {
  const displayedSwapRows = sortRequestedTrainRowsByTid(swappingRows)
    .filter((row) => row && normalizeTrainId(row?.key || row?.label || row?.trainId));
  const removalRows = (Array.isArray(actionOverviewRows) ? actionOverviewRows : [])
    .filter((row) => row && !row.isSeparator && row.group === "removal");

  const requestedActionRows = displayedSwapRows.map((row, index) => {
    const key = normalizeTrainId(row?.key || row?.label || row?.trainId);
    const requestNotes = [row?.requestType, row?.actionNote]
      .map((value) => (value || "").toString().trim())
      .filter(Boolean);
    const requestType = requestNotes.join(", ");
    const rowTid = (row?.tid || row?.manualTid || row?.autoTid || "").toString().trim();
    const washShiftAction = getWashOnlyShiftRemovalAction({
      tid: rowTid,
      requestType,
    });
    const actionLabel = washShiftAction?.actionLabel || "Need Swapping";
    const actionSymbol = washShiftAction ? washShiftAction.actionSymbol : "⇆";
    const actionStatus = washShiftAction?.actionStatus || `${actionLabel} ${actionSymbol}`;
    const group = washShiftAction?.group || "swap";

    return {
      key: key || `swap-table-${index}`,
      trainsetNumber: formatRequestedTrainNumber(key || row?.label || row?.trainId),
      tid: group === "removal" ? rowTid : "",
      requestType,
      actionLabel,
      actionSymbol,
      actionStatus,
      actionType: washShiftAction?.actionType || "",
      group,
    };
  });

  const mergedSwapRows = sortRequestedActionRows(mergeRequestedActionRowsByTrain(
    requestedActionRows.filter((row) => row?.group !== "removal")
  ));
  const mergedRemovalRows = sortRequestedActionRows(mergeRequestedActionRowsByTrain([
    ...removalRows,
    ...requestedActionRows.filter((row) => row?.group === "removal"),
  ]));

  if (mergedSwapRows.length && mergedRemovalRows.length) {
    return [
      ...mergedSwapRows,
      { key: "requested-action-overview-separator", isSeparator: true },
      ...mergedRemovalRows,
    ];
  }

  return [...mergedSwapRows, ...mergedRemovalRows];
}


function formatRequestedSummaryTrainLabel(value = "") {
  const formatted = formatRequestedTrainNumber(value);
  if (!formatted) return "";
  return /^T/i.test(formatted) ? padTrainId(formatted) : `T${formatted}`;
}

function appendRequestedSummaryTrain(bucket, row = {}) {
  const key = normalizeTrainId(row?.key || row?.trainsetNumber);
  const label = formatRequestedSummaryTrainLabel(key || row?.trainsetNumber);
  if (!key || !label || bucket.seen.has(key)) return;

  bucket.seen.add(key);
  bucket.trains.push(label);
}

function joinRequestedSummaryTrainList(trains = []) {
  const list = (trains || []).filter(Boolean);
  if (list.length <= 1) return list.join("");
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function createRequestedSummaryBucket() {
  return { trains: [], seen: new Set() };
}

function formatRequestedSummaryCmActivityLabel(value = "") {
  const normalized = normalizeRequestIdentity(value);
  if (!normalized || normalized === "CM") return "RST CM";
  return normalized;
}

function getRequestedActionSummaryRowsFromRequests(requests = []) {
  const rows = [];
  const seen = new Set();

  (Array.isArray(requests) ? requests : []).forEach((request) => {
    if (isUnfitTrainRequest(request)) return;

    const key = normalizeTrainId(request?.trainId);
    const requestType = getTrainRequestDisplayType(request);
    const requestKey = normalizeRequestIdentity(requestType);
    if (!key || !requestKey) return;

    const seenKey = `${key}|${requestKey}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);

    rows.push({
      key,
      trainsetNumber: formatRequestedTrainNumber(key),
      requestType,
    });
  });

  return rows;
}

function buildRequestedActionSummaryLines(rows = []) {
  const inbound = createRequestedSummaryBucket();
  const todayPm = createRequestedSummaryBucket();
  const morningPm = createRequestedSummaryBucket();
  const cm = createRequestedSummaryBucket();
  const tlc = createRequestedSummaryBucket();
  let cmActivityLabel = "RST CM";

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || row.isSeparator) return;

    const requestType = row?.requestType || "";
    const normalized = normalizeRequestIdentity(requestType);
    if (!normalized) return;

    const tokens = normalized.split(" ").filter(Boolean);
    const hasInbound = tokens.includes("INBOUND") || normalized.includes("G TO C");
    const hasPm = tokens.includes("PM");
    const hasCm = tokens.includes("CM");
    const hasTlc = tokens.includes("TLC");
    const isTomorrowPm = hasTomorrowRequestToken(requestType) || tokens.includes("MORNING");

    if (hasInbound) appendRequestedSummaryTrain(inbound, row);
    if (hasPm) appendRequestedSummaryTrain(isTomorrowPm ? morningPm : todayPm, row);
    if (hasTlc) appendRequestedSummaryTrain(tlc, row);
    if (hasCm) {
      appendRequestedSummaryTrain(cm, row);
      const requestedCmLabel = formatRequestedSummaryCmActivityLabel(requestType);
      if (requestedCmLabel !== "RST CM") cmActivityLabel = requestedCmLabel;
    }
  });

  const lines = [];
  const inboundList = joinRequestedSummaryTrainList(inbound.trains);
  const todayPmList = joinRequestedSummaryTrainList(todayPm.trains);
  const morningPmList = joinRequestedSummaryTrainList(morningPm.trains);

  if (inboundList) {
    const verb = inbound.trains.length === 1 ? "was" : "were";
    lines.push(`${inboundList} ${verb} requested for inbound movement G to C.`);
  }

  if (morningPmList) {
    lines.push(`RST requested ${morningPmList} for morning PM activity.`);
  }

  if (todayPmList) {
    lines.push(`RST requested ${todayPmList} for Today PM activity.`);
  }

  const cmList = joinRequestedSummaryTrainList(cm.trains);
  if (cmList) {
    const verb = cm.trains.length === 1 ? "was" : "were";
    lines.push(`${cmList} ${verb} requested for ${cmActivityLabel} activity. Closing SR.`);
  }

  const tlcList = joinRequestedSummaryTrainList(tlc.trains);
  if (tlcList) {
    lines.push(`${tlcList} requested for TLC team.`);
  }

  return lines;
}

const REQUESTED_TRAIN_MANUAL_TID_STORAGE_KEY = "requestedTrainManualTidByTrain";

function cleanRequestedTrainTidInput(value = "") {
  return (value || "").toString().replace(/[^0-9]/g, "").slice(0, 3);
}

function normalizeRequestedTrainManualTidMap(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const map = {};

  Object.entries(source).forEach(([trainKey, tid]) => {
    const key = normalizeTrainId(trainKey);
    const cleanedTid = cleanRequestedTrainTidInput(tid);
    if (key && cleanedTid) map[key] = cleanedTid;
  });

  return map;
}

function loadRequestedTrainManualTidMap() {
  try {
    return normalizeRequestedTrainManualTidMap(
      JSON.parse(localStorage.getItem(REQUESTED_TRAIN_MANUAL_TID_STORAGE_KEY) || "{}")
    );
  } catch {
    return {};
  }
}

function saveRequestedTrainManualTidMap(map = {}) {
  try {
    localStorage.setItem(REQUESTED_TRAIN_MANUAL_TID_STORAGE_KEY, JSON.stringify(normalizeRequestedTrainManualTidMap(map)));
  } catch {}
}

function loadRequestedTrainIncludeTomorrowSwaps() {
  try {
    return localStorage.getItem("requestedTrainIncludeTomorrowSwaps") === "true";
  } catch {
    return false;
  }
}

function getRemovalPdfSwappingRows({ requests = [], trainRemState = {}, westData = {}, eastData = {}, activeTimetable = null } = {}) {
  const manualTidByTrain = loadRequestedTrainManualTidMap();
  const includeTomorrowRequests = loadRequestedTrainIncludeTomorrowSwaps();
  const allRows = applyManualTidToRequestedRows(
    getRequestedTrainsNotInWestDepotStablingRemoval({
      requests,
      trainRemState,
      westData,
      eastData,
    }),
    manualTidByTrain
  );

  const displayRows = includeTomorrowRequests
    ? allRows
    : allRows
        .filter((row) => !row?.hideWhenTomorrowExcluded)
        .map((row) => ({
          ...row,
          requestType: row?.requestTypeWithoutTomorrow || row?.requestType || "",
        }));

  return addArrival3A1P2ToRequestedRows(displayRows, activeTimetable, new Date());
}

function getRemovalPdfActionOverviewRows({ requests = [], trainRemState = {}, westData = {}, eastData = {} } = {}) {
  return getRequestedTrainActionOverviewRows({
    requests,
    trainRemState,
    westData,
    eastData,
    includeTomorrowRequests: loadRequestedTrainIncludeTomorrowSwaps(),
  });
}

function applyManualTidToRequestedRows(rows = [], manualTidByTrain = {}) {
  const manualTidMap = normalizeRequestedTrainManualTidMap(manualTidByTrain);

  return (rows || []).map((row) => {
    const key = normalizeTrainId(row?.key || row?.label || row?.trainId);
    const manualTid = key ? manualTidMap[key] || "" : "";
    const referenceTid = row?.isWest9amReferenceTid ? cleanRequestedTrainTidInput(row?.tid || "") : "";

    return {
      ...row,
      key: row?.key || key,
      // Do not auto-match from Full ML TID. West 9am washing-reference rows are
      // allowed because the user manually enters the train ID there for wash planning.
      autoTid: referenceTid,
      manualTid,
      tid: manualTid || referenceTid || "",
      canEditTid: Boolean(key),
    };
  });
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

function requestedDocxRow(cells, { header = false, widths = null } = {}) {
  // Narrower requested-train table columns for DOCX export.
  // Note columns are reduced and kept equal width.
  const activeWidths = Array.isArray(widths) && widths.length ? widths : [1000, 750, 1900, 1900];

  return `
      <w:tr>
        <w:trPr><w:trHeight w:val="300" w:hRule="atLeast"/></w:trPr>
        ${cells.map((cell, index) => requestedDocxCell(cell, { width: activeWidths[index] || 1200, bold: header })).join("")}
      </w:tr>`;
}

function buildRequestedTrainsDocx({ swappingRows = [], actionOverviewRows = [] } = {}) {

  const buildTableXml = (rows = [], options = {}) => {
    const includeArrival3A1P2 = Boolean(options?.includeArrival3A1P2);
    const exportRows = getRequestedTrainDisplayRows(rows, 3);
    const widths = includeArrival3A1P2 ? [900, 650, 1050, 1475, 1475] : [1000, 750, 1900, 1900];
    const headerCells = includeArrival3A1P2 ? ["Trainset number", "TID", "Arrival 3A1P2", "Note:", "Note:"] : ["Trainset number", "TID", "Note:", "Note:"];
    const tableRows = [
      requestedDocxRow(headerCells, { header: true, widths }),
      ...exportRows.map((row) => requestedDocxRow(includeArrival3A1P2 ? [
        (row.label || "").replace(/^T/, ""),
        row.tid || "",
        formatTimetableTimeWithHrs(row.arrival3A1P2),
        row.requestType || "",
        row.actionNote || "",
      ] : [
        (row.label || "").replace(/^T/, ""),
        row.tid || "",
        row.requestType || "",
        row.actionNote || "",
      ], { widths })),
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
        ${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("\n        ")}
      </w:tblGrid>
      ${tableRows}
    </w:tbl>`;
  };

  const buildActionOverviewTableXml = (rows = []) => {
    const displayRows = Array.isArray(rows) ? rows : [];
    const safeRows = displayRows.filter((row) => row && !row.isSeparator);
    if (!safeRows.length) return "";

    const widths = [1250, 850, 1650, 1800];
    const tableRows = [
      requestedDocxRow(["Trainset number", "TID", "Remark Request", ""], { header: true, widths }),
      ...displayRows.map((row) => {
        if (row?.isSeparator) return requestedDocxRow(["", "", "", ""], { widths });

        return requestedDocxRow([
          formatRequestedTrainNumber(row.trainsetNumber || row.key),
          row.group === "removal" ? (row.tid || "") : "",
          row.requestType || "",
          row.actionStatus || "",
        ], { widths });
      }),
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
        ${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("\n        ")}
      </w:tblGrid>
      ${tableRows}
    </w:tbl>`;
  };

  const buildTitleXml = (title, before = 0, highlightSwapping = false) => {
    const swappingTarget = "required for swapping.";
    const target = highlightSwapping && title.includes(swappingTarget) ? swappingTarget : "";
    const highlightColor = "FF0000";

    if (!target) {
      return `
    <w:p>
      <w:pPr><w:spacing w:before="${before}" w:after="160"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>
        <w:t xml:space="preserve">${xmlEscape(title)}</w:t>
      </w:r>
    </w:p>`;
    }

    const [prefix, suffix = ""] = title.split(target);

    return `
    <w:p>
      <w:pPr><w:spacing w:before="${before}" w:after="160"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>
        <w:t xml:space="preserve">${xmlEscape(prefix)}</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="${highlightColor}"/></w:rPr>
        <w:t xml:space="preserve">${xmlEscape(target)}</w:t>
      </w:r>
      ${suffix ? `<w:r><w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t xml:space="preserve">${xmlEscape(suffix)}</w:t></w:r>` : ""}
    </w:p>`;
  };

  const buildSwappingNoteBodyXml = () => `
    ${buildTitleXml("TRAIN REMOVAL PLAN", 0, false)}
    ${buildTableXml(swappingRows, { includeArrival3A1P2: true })}
    ${buildActionOverviewTableXml(actionOverviewRows) ? buildTitleXml("REQUESTED TRAIN:", 220, false) : ""}
    ${buildActionOverviewTableXml(actionOverviewRows)}`;

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
    ${buildSwappingNoteBodyXml()}
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

function downloadRequestedTrainsDocx({ swappingRows = [], actionOverviewRows = [] } = {}) {
  const docxBytes = buildRequestedTrainsDocx({ swappingRows, actionOverviewRows });
  const blob = new Blob([docxBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `requested-trains-required-for-swapping-${dateStamp}.docx`);
}

function RequestedTrainPill({ children, accent = "#4f8ef7", muted = false }) {
  return (
    <span
      className="inline-flex min-w-[46px] items-center justify-center px-1 py-0 text-[11px] font-normal leading-none tracking-wide whitespace-nowrap"
      style={{
        color: muted ? "#8fa6bd" : accent || "#eef7ff",
        textShadow: muted ? "none" : `0 0 5px ${hexToRgba(accent || "#eaf4ff", 0.25)}`,
      }}
    >
      {children || "--"}
    </span>
  );
}

function RequestedTrainTitle({ title = "" }) {
  const swappingTarget = "required for swapping.";

  const isSwappingTitle = title.includes(swappingTarget);
  const target = isSwappingTitle ? swappingTarget : "";

  if (!target) {
    return title;
  }

  const [prefix, suffix = ""] = title.split(target);
  const glowStyle = {
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

function RequestedTrainTable({ title, rows = [], maintenanceMap = {}, onManualTidChange = null, showArrival3A1P2 = false, showNote = false }) {
  const tableRows = getRequestedTrainDisplayRows(rows, 3);
  const tableWidth = 132 + (showArrival3A1P2 ? 88 : 0) + (showNote ? 112 : 0);
  const totalRows = tableRows.filter((item) => item && (item.label || item.tid || item.requestType || item.actionNote || item.arrival3A1P2)).length;

  return (
    <div className="flex h-full min-h-0 self-stretch flex-col leading-tight">
      {title && (
        <div className="mb-2.5">
          <div className="text-[12px] font-normal text-[#d8e7f7] tracking-wide whitespace-nowrap">
            <RequestedTrainTitle title={title} />
          </div>
          <div className="mt-0.5 text-[10px] font-normal text-[#d8e7f7] tracking-wide whitespace-nowrap">
            Total: {totalRows}
          </div>
        </div>
      )}

      <div className="flex-1 w-fit max-w-full overflow-hidden rounded-xl border border-[#2b4f6b] bg-[#071828]">
        <table className="h-full min-h-full table-fixed text-[11px] leading-none" style={{ width: tableWidth, maxWidth: "100%" }}>
          <colgroup>
            <col style={{ width: 74 }} />
            <col style={{ width: 58 }} />
            {showArrival3A1P2 && <col style={{ width: 88 }} />}
            {showNote && <col style={{ width: 112 }} />}
          </colgroup>
          <thead>
            <tr className="bg-[#0a2237] text-[#cfe5fb]">
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Trainset number</th>
              <th className={`border-b ${(showArrival3A1P2 || showNote) ? "border-r" : ""} border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none`}>TID</th>
              {showArrival3A1P2 && (
                <th className={`border-b ${showNote ? "border-r" : ""} border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none`}>Arrival 3A1P2</th>
              )}
              {showNote && (
                <th className="border-b border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Note</th>
              )}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item, index) => {
              const accent = "#ffffff";
              const arrivalAccent = "#ffffff";
              const arrival3A1P2 = formatTimetableTimeWithHrs(item.arrival3A1P2);
              const noteText = [item.requestType, item.actionNote].map((value) => (value || "").toString().trim()).filter(Boolean).join(", ");
              const displayTid = [item.manualTid, item.autoTid, item.tid]
                .map((value) => (value || "").toString().trim())
                .find(Boolean) || "";
              const isEmpty = !item.label && !displayTid && !item.requestType && !item.actionNote && !arrival3A1P2;

              return (
                <tr key={`${item.key}-${index}`} className="odd:bg-[#081b2d] even:bg-[#0a2136]">
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-none">
                    <RequestedTrainPill accent={accent} muted={isEmpty}>{formatRequestedTrainNumber(item.label)}</RequestedTrainPill>
                  </td>
                  <td className={`border-b ${(showArrival3A1P2 || showNote) ? "border-r" : ""} border-[#193752] px-2 py-1 text-center align-middle leading-none`}>
                    {item.canEditTid && typeof onManualTidChange === "function" ? (
                      <input
                        value={displayTid}
                        onChange={(event) => onManualTidChange(item.key, event.target.value)}
                        inputMode="numeric"
                        maxLength={3}
                        placeholder="--"
                        title={item.manualTid ? "Enter TID manually" : (displayTid ? "Matched TID from train removal/reference row" : "Enter TID manually")}
                        className="h-[19px] w-[46px] bg-transparent px-1 py-0 text-center text-[11px] font-normal leading-none tracking-wide text-[#eef7ff] outline-none placeholder:text-[#8fa6bd] focus:text-sky-200"
                        style={{
                          color: displayTid ? "#ffffff" : undefined,
                          textShadow: "none",
                        }}
                      />
                    ) : (
                      <RequestedTrainPill accent={accent} muted={isEmpty || !displayTid}>{displayTid}</RequestedTrainPill>
                    )}
                  </td>
                  {showArrival3A1P2 && (
                    <td className={`border-b ${showNote ? "border-r" : ""} border-[#193752] px-2 py-1 text-center align-middle leading-none text-[#eaf4ff]`}>
                      <RequestedTrainPill accent={arrivalAccent} muted={isEmpty || !arrival3A1P2}>{arrival3A1P2}</RequestedTrainPill>
                    </td>
                  )}
                  {showNote && (
                    <td className="border-b border-[#193752] px-2 py-1 text-center align-middle leading-tight text-[#eaf4ff] whitespace-normal break-words">
                      <RequestedTrainPill accent={accent} muted={isEmpty || !noteText}>{noteText}</RequestedTrainPill>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getRequestedActionPillStyle(item = {}) {
  const label = (item?.actionLabel || "").toString().toLowerCase();
  const actionType = (item?.actionType || "").toString();

  if (actionType === "lateShiftRem" || label.includes("late shift")) {
    return "border-[#38bdf8] bg-[#0ea5e9]/25 text-[#dff6ff] shadow-[0_0_8px_rgba(56,189,248,0.22)]";
  }

  if (actionType === "earlyShiftRem" || label.includes("early shift")) {
    return "border-[#facc15] bg-[#facc15]/25 text-[#fff7c2] shadow-[0_0_8px_rgba(250,204,21,0.22)]";
  }

  return "border-[#ef4444] bg-[#ef4444]/22 text-[#ffe4e6] shadow-[0_0_8px_rgba(239,68,68,0.22)]";
}

function RequestedActionStatusPill({ item }) {
  const group = item?.group === "removal" ? "removal" : "swap";
  const label = item?.actionLabel || (group === "removal" ? "Removal" : "Need Swapping");
  const symbol = Object.prototype.hasOwnProperty.call(item || {}, "actionSymbol")
    ? (item?.actionSymbol || "").toString().trim()
    : (group === "removal" ? "✓" : "⇆");

  return (
    <span className={`inline-flex min-w-[104px] items-center justify-center rounded-full border px-2 py-[3px] text-[10px] font-normal leading-none whitespace-nowrap ${getRequestedActionPillStyle(item)}`}>
      <span>{label}</span>
      {symbol && <span className="ml-1 font-normal">{symbol}</span>}
    </span>
  );
}

function RequestedTrainActionOverviewTable({ rows = [] }) {
  const displayRows = Array.isArray(rows) ? rows : [];
  const hasRows = displayRows.some((row) => row && !row.isSeparator);
  const totalRows = displayRows.filter((row) => row && !row.isSeparator).length;

  return (
    <div className="flex h-fit self-start flex-col leading-tight">
      <div className="mb-2.5">
        <div className="text-[12px] font-normal text-[#d8e7f7] tracking-wide whitespace-nowrap">
          REQUESTED TRAIN:
        </div>
        <div className="mt-0.5 text-[10px] font-normal text-[#d8e7f7] tracking-wide whitespace-nowrap">
          Total: {totalRows}
        </div>
      </div>

      <div className="w-fit max-w-full overflow-hidden rounded-xl border border-[#2b4f6b] bg-[#071828]">
        <table className="table-fixed text-[11px] leading-none" style={{ width: 400, maxWidth: "100%" }}>
          <colgroup>
            <col style={{ width: 58 }} />
            <col style={{ width: 46 }} />
            <col style={{ width: 176 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr className="bg-[#0a2237] text-[#cfe5fb]">
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Trainset number</th>
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">TID</th>
              <th className="border-b border-r border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none">Remark Request</th>
              <th className="border-b border-[#2b4f6b] px-2 py-1 text-center font-semibold leading-none"></th>
            </tr>
          </thead>
          <tbody>
            {hasRows ? displayRows.map((item, index) => {
              if (item?.isSeparator) {
                return (
                  <tr key={item.key || `separator-${index}`} className="bg-[#071828]">
                    <td className="border-b border-r border-[#193752] px-2 py-1 leading-none">&nbsp;</td>
                    <td className="border-b border-r border-[#193752] px-2 py-1 leading-none">&nbsp;</td>
                    <td className="border-b border-r border-[#193752] px-2 py-1 leading-none">&nbsp;</td>
                    <td className="border-b border-[#193752] px-2 py-1 leading-none">&nbsp;</td>
                  </tr>
                );
              }

              const displayTid = item.group === "removal" ? (item.tid || "") : "";

              return (
                <tr key={`${item.key}-${item.requestType}-${item.actionStatus}-${index}`} className="odd:bg-[#081b2d] even:bg-[#0a2136]">
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-none text-[#eaf4ff]">
                    {formatRequestedTrainNumber(item.trainsetNumber || item.key)}
                  </td>
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-none text-[#eaf4ff]">
                    {displayTid}
                  </td>
                  <td className="border-b border-r border-[#193752] px-2 py-1 text-center align-middle leading-tight text-[#eaf4ff] whitespace-normal break-words">
                    {item.requestType || ""}
                  </td>
                  <td className="border-b border-[#193752] px-2 py-1 text-center align-middle leading-none whitespace-nowrap">
                    <RequestedActionStatusPill item={item} />
                  </td>
                </tr>
              );
            }) : (
              <tr className="bg-[#081b2d]">
                <td colSpan={4} className="border-b border-[#193752] px-2 py-2 text-center align-middle leading-none text-[#8fa6bd]">
                  No requested train action found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function RequestedTrainActionSummary({ rows = [], requests = [] }) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);
  const summaryRows = Array.isArray(requests) && requests.length
    ? getRequestedActionSummaryRowsFromRequests(requests)
    : rows;
  const summaryLines = buildRequestedActionSummaryLines(summaryRows);
  if (!summaryLines.length) return null;

  const summaryText = summaryLines.join("\n");

  const handleCopySummary = async () => {
    const ok = await copyTextToClipboard(summaryText);
    if (!ok) return;
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1400);
  };

  return (
    <div className="mt-3 w-full max-w-full rounded-xl border border-[#2b4f6b] bg-[#071828]/80 px-3 py-2 text-[12px] leading-snug text-[#eaf4ff]">
      <div className="mb-1.5 flex w-full items-center justify-end">
        <button
          type="button"
          onClick={handleCopySummary}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#2f6e9f] bg-[#0d2b45] px-2 py-1 text-[10px] font-semibold leading-none text-[#dff3ff] shadow-[0_0_10px_rgba(56,189,248,0.18)] transition hover:bg-[#123957] active:scale-95"
          title="Copy requested summary"
        >
          {copied ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div>
        {summaryLines.map((line, index) => (
          <p key={`requested-action-summary-${index}`} className={index > 0 ? "mt-1" : ""}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function TrainRequestedNotInRemoval({ requests = [], trainRemState, maintenanceMap = {}, westData = {}, eastData = {}, activeTimetable = null, activeTimetableType = "weekday" }) {
  const [downloadingDocxType, setDownloadingDocxType] = useState(null);
  const [arrivalLookupTime, setArrivalLookupTime] = useState(() => new Date());
  const [includeTomorrowRequests, setIncludeTomorrowRequests] = useState(loadRequestedTrainIncludeTomorrowSwaps);

  const [manualTidByTrain, setManualTidByTrain] = useState(loadRequestedTrainManualTidMap);

  useEffect(() => {
    try {
      localStorage.setItem("requestedTrainIncludeTomorrowSwaps", includeTomorrowRequests ? "true" : "false");
    } catch {}
  }, [includeTomorrowRequests]);

  useEffect(() => {
    saveRequestedTrainManualTidMap(manualTidByTrain);
  }, [manualTidByTrain]);

  useEffect(() => {
    const tick = () => setArrivalLookupTime(new Date());
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualTidChange = useCallback((trainKey, value) => {
    const key = normalizeTrainId(trainKey);
    if (!key) return;

    const cleanedTid = cleanRequestedTrainTidInput(value);

    setManualTidByTrain((prev) => {
      const next = { ...normalizeRequestedTrainManualTidMap(prev) };
      if (cleanedTid) {
        next[key] = cleanedTid;
      } else {
        delete next[key];
      }
      return next;
    });
  }, []);

  const allSwappingRows = applyManualTidToRequestedRows(
    getRequestedTrainsNotInWestDepotStablingRemoval({
      requests,
      trainRemState,
      westData,
      eastData,
    }),
    manualTidByTrain
  );
  const hiddenTomorrowSwapCount = allSwappingRows.filter((row) => row?.hideWhenTomorrowExcluded).length;
  const swappingRows = includeTomorrowRequests
    ? allSwappingRows
    : allSwappingRows
        .filter((row) => !row?.hideWhenTomorrowExcluded)
        .map((row) => ({
          ...row,
          requestType: row?.requestTypeWithoutTomorrow || row?.requestType || "",
        }));

  const swappingRowsWithArrival3A1P2 = addArrival3A1P2ToRequestedRows(swappingRows, activeTimetable, arrivalLookupTime);
  const rawActionOverviewRows = getRequestedTrainActionOverviewRows({
    requests,
    trainRemState,
    westData,
    eastData,
    includeTomorrowRequests,
  });
  const actionOverviewRows = getRequestedTrainActionOverviewRowsFromSwappingTable({
    swappingRows: swappingRowsWithArrival3A1P2,
    actionOverviewRows: rawActionOverviewRows,
  });
  const activeTimetableLabel = getTimetableTypeLabel(activeTimetableType);
  const parsedTimetable = getActiveTimetableParsedData(activeTimetable);
  const arrivalReferenceCount = parsedTimetable?.summary?.reference?.arrival3A1P2 || parsedTimetable?.reference?.arrival3A1P2?.entries?.length || 0;
  const hasTidWithoutArrival = swappingRowsWithArrival3A1P2.some((row) => row?.tid && !row?.arrival3A1P2);
  const timetableNotice = activeTimetable
    ? `Currently timetable ${activeTimetableLabel} is used`
    : `Currently timetable ${activeTimetableLabel} is used — no uploaded timetable found`;
  const arrivalNotice = activeTimetable && hasTidWithoutArrival && arrivalReferenceCount === 0
    ? `No Arrival 3A1P2 data found in ${activeTimetableLabel} timetable`
    : "";

  const handleDownloadDocx = () => {
    if (downloadingDocxType) return;
    setDownloadingDocxType("swapping");

    try {
      downloadRequestedTrainsDocx({ swappingRows: swappingRowsWithArrival3A1P2, actionOverviewRows });
    } catch (error) {
      console.error("Requested trains DOCX export failed:", error);
      alert("Unable to create requested trains DOCX. Please try again.");
    } finally {
      setTimeout(() => setDownloadingDocxType(null), 400);
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
          <h2 className="text-[13px] font-bold uppercase tracking-[2px] text-white whitespace-nowrap">
            TRAIN REMOVAL PLAN
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex h-6 items-center gap-1.5 rounded-[10px] border border-[#2b4f6b] bg-[#071828] px-2 text-[10px] font-bold text-[#cfe5fb] shadow-sm select-none"
            title="Include or hide TMRW / TOMORROW / MRNING / MORNING requests from the swapping table"
          >
            <input
              type="checkbox"
              checked={includeTomorrowRequests}
              onChange={(event) => setIncludeTomorrowRequests(event.target.checked)}
              className="h-3 w-3 accent-sky-400"
            />
            Include TMRW / Morning
            {!includeTomorrowRequests && hiddenTomorrowSwapCount > 0 && (
              <span className="rounded-full border border-sky-300/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-100">
                {hiddenTomorrowSwapCount} hidden
              </span>
            )}
          </label>

          <button
            onClick={handleDownloadDocx}
            disabled={Boolean(downloadingDocxType)}
            className="group flex items-center gap-1.5 h-6 px-2.5 rounded-[10px] border text-[10px] font-bold transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
            style={{ ...MAIN_STABLING_BUTTON_BLUE, minHeight: 24, borderRadius: 10 }}
            title="Download DOCX with both overview tables"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {downloadingDocxType ? "Preparing..." : "Download DOCX"}
          </button>
        </div>
      </div>

      <div className="w-fit max-w-full">
        <div className="grid w-fit max-w-full grid-cols-[auto_auto] items-stretch gap-3 overflow-x-hidden">
          <RequestedTrainTable
            title="TRAIN REQUESTED FOR SWAPPING"
            rows={swappingRowsWithArrival3A1P2}
            maintenanceMap={maintenanceMap}
            onManualTidChange={handleManualTidChange}
            showArrival3A1P2
            showNote
          />

          <RequestedTrainActionOverviewTable rows={actionOverviewRows} />
        </div>

        <RequestedTrainActionSummary rows={actionOverviewRows} requests={requests} />
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
  const selectedPreset = trainRemState?.selectedPreset?.[depot] || "9am";

  return normalizeTrainRemRowsForPreset(trainRemState?.rows?.[depot], depot, selectedPreset)
    .map((row, index) => {
      if (isTrainRemReferenceOnlyIndex(depot, selectedPreset, index)) return null;

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
  const raw = typeof hex === "string" ? hex.trim() : "";
  const rgbMatch = raw.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgbMatch) {
    return [1, 2, 3].map((index) => Math.max(0, Math.min(255, Number.parseFloat(rgbMatch[index]) || 0)) / 255);
  }

  const clean = raw.replace("#", "").trim();
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


function buildCombinedRemovalPdfBlob(westLog = {}, eastLog = {}, options = {}) {
  // A4 landscape, one page: West at left, East at right.
  // Requested swapping table is placed under West Depot; request/action table is placed under East Depot.
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 22;
  const gutter = 18;
  const columnWidth = (pageWidth - marginX * 2 - gutter) / 2;
  const pageSize = { width: pageWidth, height: pageHeight };
  const yFromTop = (top, height = 0) => pageHeight - top - height;

  const westRows = Array.isArray(westLog?.entries) ? westLog.entries : [];
  const eastRows = Array.isArray(eastLog?.entries) ? eastLog.entries : [];
  const rawSwappingRows = Array.isArray(options?.swappingRows) ? options.swappingRows : [];
  const rawActionOverviewRows = Array.isArray(options?.actionOverviewRows) ? options.actionOverviewRows : [];
  const swappingRows = getRequestedTrainDisplayRows(rawSwappingRows, rawSwappingRows.length ? rawSwappingRows.length : 1);
  const actionOverviewRows = rawActionOverviewRows.length ? rawActionOverviewRows : [];
  const hasSwappingRows = rawSwappingRows.length > 0;
  const hasActionOverviewRows = actionOverviewRows.some((row) => row && !row.isSeparator);

  const titleTop = 28;
  const columnTitleTop = 62;
  const tableTop = 108;
  const tableBottomTop = 566;
  const headerHeight = 17;
  const swapSectionGap = 30;
  const headerFontSize = 6.4;

  const westRowCount = Math.max(westRows.length, 1);
  const eastRowCount = Math.max(eastRows.length, 1);
  const swappingRowCount = Math.max(swappingRows.length, 1);
  const actionOverviewRowCount = Math.max(actionOverviewRows.length, 1);
  const leftAvailableHeight = tableBottomTop - tableTop;
  const leftRowHeight = Math.max(
    8.4,
    Math.min(14.2, (leftAvailableHeight - headerHeight * 2 - swapSectionGap) / (westRowCount + swappingRowCount))
  );
  const westTableHeight = headerHeight + westRowCount * leftRowHeight;
  const swapTitleTop = tableTop + westTableHeight + 14;
  const swapTableTop = tableTop + westTableHeight + swapSectionGap;

  const rightAvailableHeight = tableBottomTop - tableTop;
  const rightRowHeight = Math.max(
    8.4,
    Math.min(14.2, (rightAvailableHeight - headerHeight * 2 - swapSectionGap) / (eastRowCount + actionOverviewRowCount))
  );
  const eastTableHeight = headerHeight + eastRowCount * rightRowHeight;
  const actionTitleTop = tableTop + eastTableHeight + 14;
  const actionTableTop = tableTop + eastTableHeight + swapSectionGap;

  const rect = (x, y, width, height, { fill = "", stroke = "#000000", strokeWidth = 0.45 } = {}) => {
    const fillCmd = fill ? `${pdfColor(fill)} rg` : "";
    const strokeCmd = stroke ? `${pdfColor(stroke)} RG ${strokeWidth.toFixed(2)} w` : "";
    const paintCmd = fill && stroke ? "B" : fill ? "f" : "S";
    return `q ${fillCmd} ${strokeCmd} ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${paintCmd} Q\n`;
  };

  const line = (x1, y1, x2, y2, width = 0.35, color = "#000000") => {
    return `q ${pdfColor(color)} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q\n`;
  };

  let ops = "";
  ops += rect(0, 0, pageWidth, pageHeight, { fill: "#ffffff", stroke: "" });

  ops += pdfText("DEPOT REMOVAL SUMMARY", marginX, yFromTop(titleTop), {
    size: 14,
    color: "#000000",
    font: "F2",
  });
  ops += pdfText(
    `West: ${westRows.length} ${westRows.length === 1 ? "train" : "trains"}   |   East: ${eastRows.length} ${eastRows.length === 1 ? "train" : "trains"}   |   Requested for swapping: ${rawSwappingRows.length}   |   Request/action: ${rawActionOverviewRows.filter((row) => row && !row.isSeparator).length}`,
    marginX,
    yFromTop(titleTop + 16),
    {
      size: 7.3,
      color: "#000000",
    }
  );
  ops += line(marginX, yFromTop(titleTop + 24), pageWidth - marginX, yFromTop(titleTop + 24), 0.5);

  const getFittedPdfText = (value, maxLength) => truncatePdfText(value || "-", maxLength);
  const getFontSizeForRowHeight = (rowH) => (rowH <= 9.2 ? 4.7 : rowH <= 10.5 ? 5.2 : rowH <= 12 ? 5.8 : rowH <= 13.5 ? 6.4 : 6.8);

  const getApproxPdfTextWidth = (value, size, bold = false) => {
    const text = sanitizePdfText(value || "");
    return text.length * size * (bold ? 0.66 : 0.54);
  };

  const drawTextInCell = (value, x, y, maxLength, { size = 6.2, bold = false, align = "left", width = 0 } = {}) => {
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

  const drawCheckIcon = (x, centerY, size = 5.6, color = "#000000") => {
    ops += line(x, centerY - 0.1, x + size * 0.38, centerY - size * 0.42, 0.65, color);
    ops += line(x + size * 0.38, centerY - size * 0.42, x + size, centerY + size * 0.45, 0.65, color);
  };

  const drawSwapIcon = (x, centerY, width = 11, color = "#000000") => {
    const topY = centerY + 1.8;
    const bottomY = centerY - 1.8;
    const leftX = x;
    const rightX = x + width;

    ops += line(leftX, topY, rightX, topY, 0.55, color);
    ops += line(rightX, topY, rightX - 2.8, topY + 1.9, 0.55, color);
    ops += line(rightX, topY, rightX - 2.8, topY - 1.9, 0.55, color);

    ops += line(rightX, bottomY, leftX, bottomY, 0.55, color);
    ops += line(leftX, bottomY, leftX + 2.8, bottomY + 1.9, 0.55, color);
    ops += line(leftX, bottomY, leftX + 2.8, bottomY - 1.9, 0.55, color);
  };

  const getPdfActionStatusColors = (entry = {}) => {
    const label = (entry?.actionLabel || "").toString().toLowerCase();
    const actionType = (entry?.actionType || "").toString();

    if (actionType === "lateShiftRem" || label.includes("late shift")) {
      return { fill: "#0ea5e9", stroke: "#0369a1", text: "#000000", icon: "#000000" };
    }

    if (actionType === "earlyShiftRem" || label.includes("early shift")) {
      return { fill: "#facc15", stroke: "#ca8a04", text: "#000000", icon: "#000000" };
    }

    return { fill: "#ef4444", stroke: "#b91c1c", text: "#ffffff", icon: "#ffffff" };
  };

  const drawActionStatusInCell = (entry = {}, cellX, rowY, cellWidth, rowH, textY, activeFontSize) => {
    const group = entry?.group === "removal" ? "removal" : "swap";
    const label = entry?.actionLabel || (group === "removal" ? "Removal" : "Need Swapping");
    const cleanLabel = sanitizePdfText(label);
    const hasExplicitActionSymbol = Object.prototype.hasOwnProperty.call(entry || {}, "actionSymbol");
    const actionSymbol = (entry?.actionSymbol || "").toString().trim();
    const symbolToDraw = hasExplicitActionSymbol ? actionSymbol : (group === "removal" ? "✓" : "⇆");
    const colors = getPdfActionStatusColors(entry);
    const pillHeight = Math.max(7.0, Math.min(rowH - 1.0, 10.8));
    const pillY = rowY + (rowH - pillHeight) / 2;
    const labelSize = Math.max(4.2, Math.min(6.0, activeFontSize + 0.45));
    const cleanLabelWidth = getApproxPdfTextWidth(cleanLabel, labelSize, false);
    const symbolWidth = symbolToDraw ? (symbolToDraw === "⇆" ? Math.max(7.8, pillHeight * 1.05) : Math.max(4.4, pillHeight * 0.55)) : 0;
    const pillWidth = Math.min(cellWidth - 6, Math.max(54, cleanLabelWidth + symbolWidth + 18));
    const pillX = cellX + Math.max(3, (cellWidth - pillWidth) / 2);
    const centerY = rowY + rowH / 2;
    const contentWidth = cleanLabelWidth + (symbolToDraw ? symbolWidth + 4 : 0);
    const textX = pillX + Math.max(6, (pillWidth - contentWidth) / 2);
    const pillTextY = centerY - labelSize * 0.36;

    ops += pdfRoundedRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2, {
      fill: colors.fill,
      stroke: colors.stroke,
      strokeWidth: 0.45,
    });

    ops += pdfText(cleanLabel, textX, pillTextY, {
      size: labelSize,
      color: colors.text,
      font: "F2",
    });

    if (!symbolToDraw) return;

    const iconX = Math.min(pillX + pillWidth - symbolWidth - 5, textX + cleanLabelWidth + 4);
    if (symbolToDraw === "✓") {
      drawCheckIcon(iconX, centerY, Math.max(4.1, Math.min(5.9, pillHeight * 0.55)), colors.icon);
    } else if (symbolToDraw === "⇆") {
      drawSwapIcon(iconX, centerY, Math.max(7.6, Math.min(10.5, pillHeight * 1.05)), colors.icon);
    }
  };

  const drawRemarkPills = (entry = {}, cellX, rowY, cellWidth, rowH, fallbackTextY, activeFontSize) => {
    const pills = Array.isArray(entry?.remarkPills)
      ? entry.remarkPills.filter((pill) => (pill?.text || "").toString().trim())
      : [];

    if (pills.length === 0) {
      drawTextInCell("-", cellX + 8, fallbackTextY, 2, { size: activeFontSize, bold: false });
      return;
    }

    const visiblePills = pills.slice(0, 3).map((pill) => ({
      ...pill,
      cleanText: sanitizePdfText(pill.text || "-"),
    }));

    const gap = visiblePills.length >= 3 ? 2 : 3;
    const pillHeight = Math.max(6.4, Math.min(10.8, rowH - 2.4));
    const pillY = rowY + (rowH - pillHeight) / 2;
    const basePillFontSize = Math.max(3.8, Math.min(5.8, activeFontSize - 0.55));
    const safeLeft = cellX + 4;
    const safeRight = cellX + cellWidth - 4;
    const availableWidth = Math.max(10, safeRight - safeLeft);
    const pillPaddingX = visiblePills.length > 1 ? 5 : 8;

    const slotWidth = visiblePills.length > 1
      ? Math.max(28, (availableWidth - gap * (visiblePills.length - 1)) / visiblePills.length)
      : availableWidth;

    const getSafeTextWidth = (value, size, bold = true) => sanitizePdfText(value || "").length * size * (bold ? 0.82 : 0.58);

    const fitLabelForPill = (value, pillWidth) => {
      const clean = sanitizePdfText(value || "-");
      const maxTextWidth = Math.max(8, pillWidth - pillPaddingX * 2);
      let size = basePillFontSize;

      while (getSafeTextWidth(clean, size, true) > maxTextWidth && size > 3.0) {
        size -= 0.15;
      }

      if (clean.length <= 10) {
        return { text: clean, size: Math.max(3.0, size) };
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

  const drawRemovalColumn = (log = {}, x, sideLabel, optionsForTable = {}) => {
    const rows = Array.isArray(log?.entries) ? log.entries : [];
    const source = log?.source || "Mainline";
    const title = sideLabel === "west" ? "WEST DEPOT" : "EAST DEPOT";
    const activeTableTop = optionsForTable.tableTop ?? tableTop;
    const activeColumnTitleTop = optionsForTable.columnTitleTop ?? columnTitleTop;
    const activeRowHeight = optionsForTable.rowHeight ?? rightRowHeight;
    const activeFontSize = getFontSizeForRowHeight(activeRowHeight);
    const rowCount = Math.max(rows.length, 1);

    const colWidths = {
      no: 31,
      train: 53,
      tid: 42,
      time: 62,
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
    const tableHeight = headerHeight + rowCount * activeRowHeight;
    const tableY = yFromTop(activeTableTop, tableHeight);

    ops += pdfText(title, x, yFromTop(activeColumnTitleTop), {
      size: 11,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(`Source: ${source} | Total: ${rows.length}`, x, yFromTop(activeColumnTitleTop + 14), {
      size: 6.8,
      color: "#000000",
    });

    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });

    const headerBottomY = yFromTop(activeTableTop + headerHeight);
    ops += line(x, headerBottomY, x + tableWidth, headerBottomY, 0.55);

    [colX.train, colX.tid, colX.time, colX.remark].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });

    const headerTextY = yFromTop(activeTableTop + 11);
    drawTextInCell("NO", colX.no + 7, headerTextY, 4, { size: headerFontSize, bold: true });
    drawTextInCell("TRAIN", colX.train + 9, headerTextY, 8, { size: headerFontSize, bold: true });
    drawTextInCell("TID", colX.tid + 10, headerTextY, 5, { size: headerFontSize, bold: true });
    drawTextInCell("TIME", colX.time + 13, headerTextY, 7, { size: headerFontSize, bold: true });
    drawTextInCell("REMARK", colX.remark + 8, headerTextY, 10, { size: headerFontSize, bold: true });

    if (rows.length === 0) {
      const rowTop = activeTableTop + headerHeight;
      const rowY = yFromTop(rowTop, activeRowHeight);
      drawTextInCell(log?.noEntryText || "No valid removal entries", x + 10, rowY + activeRowHeight / 2 - 2, 46, {
        size: activeFontSize,
        bold: true,
      });
    } else {
      rows.forEach((entry, index) => {
        const rowTop = activeTableTop + headerHeight + index * activeRowHeight;
        const rowY = yFromTop(rowTop, activeRowHeight);
        const textY = rowY + activeRowHeight / 2 - 2.2;

        drawTextInCell(String(index + 1).padStart(2, "0"), colX.no + 8, textY, 4, { size: activeFontSize, bold: false });
        drawTextInCell(entry.trainId || "-", colX.train, textY, 8, { size: activeFontSize, bold: true, align: "center", width: colWidths.train });
        drawTextInCell(entry.tid || "-", colX.tid + 8, textY, 6, { size: activeFontSize, bold: false });
        drawTextInCell(entry.time ? `${entry.time} hrs` : "-", colX.time + 8, textY, 11, { size: activeFontSize, bold: false });
        drawRemarkPills(entry, colX.remark, rowY, colWidths.remark, activeRowHeight, textY, activeFontSize);
      });
    }

    for (let i = 0; i <= rowCount; i += 1) {
      const rowLineY = yFromTop(activeTableTop + headerHeight + i * activeRowHeight);
      ops += line(x, rowLineY, x + tableWidth, rowLineY, 0.38);
    }

    [x, colX.train, colX.tid, colX.time, colX.remark, x + tableWidth].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });
    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });
  };

  const drawRequestedSwappingTable = (rows = [], x, titleTopForTable, tableTopForTable, rowH) => {
    const activeFontSize = getFontSizeForRowHeight(rowH);
    const rowCount = Math.max(rows.length, 1);
    const colWidths = {
      no: 25,
      train: 48,
      tid: 36,
      note1: 142,
      note2: 129,
    };
    const colX = {
      no: x,
      train: x + colWidths.no,
      tid: x + colWidths.no + colWidths.train,
      note1: x + colWidths.no + colWidths.train + colWidths.tid,
      note2: x + colWidths.no + colWidths.train + colWidths.tid + colWidths.note1,
    };
    const tableWidth = colWidths.no + colWidths.train + colWidths.tid + colWidths.note1 + colWidths.note2;
    const tableHeight = headerHeight + rowCount * rowH;
    const tableY = yFromTop(tableTopForTable, tableHeight);

    ops += pdfText("TRAIN REQUESTED FOR SWAPPING", x, yFromTop(titleTopForTable), {
      size: 10.4,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(`Total: ${hasSwappingRows ? rawSwappingRows.length : 0}`, x, yFromTop(titleTopForTable + 12), {
      size: 6.5,
      color: "#000000",
    });

    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });
    const headerBottomY = yFromTop(tableTopForTable + headerHeight);
    ops += line(x, headerBottomY, x + tableWidth, headerBottomY, 0.55);

    [colX.train, colX.tid, colX.note1, colX.note2].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });

    const headerTextY = yFromTop(tableTopForTable + 11);
    drawTextInCell("NO", colX.no + 6, headerTextY, 4, { size: headerFontSize - 0.5, bold: true });
    drawTextInCell("TRAIN", colX.train + 8, headerTextY, 8, { size: headerFontSize - 0.5, bold: true });
    drawTextInCell("TID", colX.tid + 8, headerTextY, 5, { size: headerFontSize - 0.5, bold: true });
    drawTextInCell("NOTE", colX.note1 + 8, headerTextY, 10, { size: headerFontSize - 0.5, bold: true });
    drawTextInCell("NOTE", colX.note2 + 8, headerTextY, 10, { size: headerFontSize - 0.5, bold: true });

    if (!hasSwappingRows) {
      const rowY = yFromTop(tableTopForTable + headerHeight, rowH);
      drawTextInCell("No train requested for swapping", x + 10, rowY + rowH / 2 - 2, 42, {
        size: activeFontSize,
        bold: true,
      });
    } else {
      rows.forEach((entry, index) => {
        const rowTop = tableTopForTable + headerHeight + index * rowH;
        const rowY = yFromTop(rowTop, rowH);
        const textY = rowY + rowH / 2 - 2.2;
        const label = (entry?.label || "").replace(/^T/i, "");

        drawTextInCell(String(index + 1).padStart(2, "0"), colX.no + 6, textY, 4, { size: activeFontSize, bold: false });
        drawTextInCell(label || "-", colX.train, textY, 6, { size: activeFontSize, bold: true, align: "center", width: colWidths.train });
        drawTextInCell("", colX.tid, textY, 5, { size: activeFontSize, bold: false, align: "center", width: colWidths.tid });
        drawTextInCell(entry?.requestType || "-", colX.note1 + 5, textY, 30, { size: Math.max(3.9, activeFontSize - 0.2), bold: false });
        drawTextInCell(entry?.actionNote || "-", colX.note2 + 5, textY, 28, { size: Math.max(3.9, activeFontSize - 0.2), bold: false });
      });
    }

    for (let i = 0; i <= rowCount; i += 1) {
      const rowLineY = yFromTop(tableTopForTable + headerHeight + i * rowH);
      ops += line(x, rowLineY, x + tableWidth, rowLineY, 0.38);
    }

    [x, colX.train, colX.tid, colX.note1, colX.note2, x + tableWidth].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });
    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });
  };

  const drawRequestedActionOverviewTable = (rows = [], x, titleTopForTable, tableTopForTable, rowH) => {
    const activeFontSize = getFontSizeForRowHeight(rowH);
    const displayRows = rows.length ? rows : [{ key: "no-action-overview", empty: true }];
    const rowCount = Math.max(displayRows.length, 1);
    const colWidths = {
      train: 94,
      tid: 52,
      request: 132,
      action: 102,
    };
    const colX = {
      train: x,
      tid: x + colWidths.train,
      request: x + colWidths.train + colWidths.tid,
      action: x + colWidths.train + colWidths.tid + colWidths.request,
    };
    const tableWidth = colWidths.train + colWidths.tid + colWidths.request + colWidths.action;
    const tableHeight = headerHeight + rowCount * rowH;
    const tableY = yFromTop(tableTopForTable, tableHeight);

    ops += pdfText("REQUESTED TRAIN:", x, yFromTop(titleTopForTable), {
      size: 10.4,
      color: "#000000",
      font: "F2",
    });
    ops += pdfText(`Total: ${rawActionOverviewRows.filter((row) => row && !row.isSeparator).length}`, x, yFromTop(titleTopForTable + 12), {
      size: 6.5,
      color: "#000000",
    });

    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });
    const headerBottomY = yFromTop(tableTopForTable + headerHeight);
    ops += line(x, headerBottomY, x + tableWidth, headerBottomY, 0.55);

    [colX.tid, colX.request, colX.action].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });

    const headerTextY = yFromTop(tableTopForTable + 11);
    drawTextInCell("TRAINSET NUMBER", colX.train + 5, headerTextY, 17, { size: headerFontSize - 0.5, bold: true });
    drawTextInCell("TID", colX.tid + 8, headerTextY, 5, { size: headerFontSize - 0.5, bold: true });
    drawTextInCell("REMARK REQUEST", colX.request + 7, headerTextY, 17, { size: headerFontSize - 0.5, bold: true });

    if (!hasActionOverviewRows) {
      const rowY = yFromTop(tableTopForTable + headerHeight, rowH);
      drawTextInCell("No requested train action found", x + 10, rowY + rowH / 2 - 2, 42, {
        size: activeFontSize,
        bold: true,
      });
    } else {
      displayRows.forEach((entry, index) => {
        const rowTop = tableTopForTable + headerHeight + index * rowH;
        const rowY = yFromTop(rowTop, rowH);
        const textY = rowY + rowH / 2 - 2.2;

        if (entry?.isSeparator) return;

        drawTextInCell(formatRequestedTrainNumber(entry?.trainsetNumber || entry?.key) || "-", colX.train, textY, 8, {
          size: activeFontSize,
          bold: true,
          align: "center",
          width: colWidths.train,
        });
        drawTextInCell(entry?.group === "removal" ? (entry?.tid || "") : "", colX.tid, textY, 5, {
          size: activeFontSize,
          bold: false,
          align: "center",
          width: colWidths.tid,
        });
        drawTextInCell(entry?.requestType || "-", colX.request + 6, textY, 20, {
          size: Math.max(3.9, activeFontSize - 0.2),
          bold: false,
        });
        drawActionStatusInCell(entry, colX.action, rowY, colWidths.action, rowH, textY, activeFontSize);
      });
    }

    for (let i = 0; i <= rowCount; i += 1) {
      const rowLineY = yFromTop(tableTopForTable + headerHeight + i * rowH);
      ops += line(x, rowLineY, x + tableWidth, rowLineY, 0.38);
    }

    [x, colX.tid, colX.request, colX.action, x + tableWidth].forEach((gridX) => {
      ops += line(gridX, tableY, gridX, tableY + tableHeight, 0.35);
    });
    ops += rect(x, tableY, tableWidth, tableHeight, { fill: "", stroke: "#000000", strokeWidth: 0.65 });
  };

  const rightColumnX = marginX + columnWidth + gutter;

  drawRemovalColumn(westLog, marginX, "west", {
    tableTop,
    columnTitleTop,
    rowHeight: leftRowHeight,
  });
  drawRequestedSwappingTable(swappingRows, marginX, swapTitleTop, swapTableTop, leftRowHeight);
  drawRemovalColumn(eastLog, rightColumnX, "east", {
    tableTop,
    columnTitleTop,
    rowHeight: rightRowHeight,
  });
  drawRequestedActionOverviewTable(actionOverviewRows, rightColumnX, actionTitleTop, actionTableTop, rightRowHeight);

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


function downloadCombinedRemovalPdf(westLog = {}, eastLog = {}, options = {}) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const blob = buildCombinedRemovalPdfBlob(westLog, eastLog, options);
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
        const latestSwappingRows = typeof combinedLogs?.getSwappingRows === "function"
          ? combinedLogs.getSwappingRows()
          : combinedLogs?.swappingRows || [];
        const latestActionOverviewRows = typeof combinedLogs?.getActionOverviewRows === "function"
          ? combinedLogs.getActionOverviewRows()
          : combinedLogs?.actionOverviewRows || [];
        downloadCombinedRemovalPdf(westLog, eastLog, {
          swappingRows: latestSwappingRows,
          actionOverviewRows: latestActionOverviewRows,
        });
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
          <pre className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] font-normal text-[#d8e7f7]">
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

function RemovalLogOutputFromTrainRem({ trainRemState, maintenanceMap = {}, requests = [], westData = {}, eastData = {}, activeTimetable = null }) {
  const westLog = buildTrainRemRemovalLog(trainRemState, "west", maintenanceMap);
  const eastLog = buildTrainRemRemovalLog(trainRemState, "east", maintenanceMap);
  const getLatestSwappingRows = () => getRemovalPdfSwappingRows({
    requests,
    trainRemState,
    westData,
    eastData,
    activeTimetable,
  });
  const getLatestActionOverviewRows = () => getRemovalPdfActionOverviewRows({
    requests,
    trainRemState,
    westData,
    eastData,
  });
  const swappingRows = getLatestSwappingRows();
  const actionOverviewRows = getLatestActionOverviewRows();

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
        <RemovalDepotLogCard
          log={westLog}
          combinedLogs={{
            westLog,
            eastLog,
            swappingRows,
            actionOverviewRows,
            getSwappingRows: getLatestSwappingRows,
            getActionOverviewRows: getLatestActionOverviewRows,
          }}
        />
        <RemovalDepotLogCard
          log={eastLog}
          combinedLogs={{
            westLog,
            eastLog,
            swappingRows,
            actionOverviewRows,
            getSwappingRows: getLatestSwappingRows,
            getActionOverviewRows: getLatestActionOverviewRows,
          }}
        />
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
  const match = text.match(/(?:PST|Train preparation)\s+(?:commenced|completed)\s+at\s+([A-Z]{2})[–-]([A-Z0-9]+)/i);
  if (!match) return "";
  return `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
}

function getPSTDepotFromEntry(entry = {}) {
  const location = extractPSTLocation(entry);
  if (entry?.depot === "west" || /^WD[‒–—−-]/i.test(location)) return "west";
  if (entry?.depot === "east" || /^ED[‒–—−-]/i.test(location)) return "east";
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

function normalizeTACompletedByName(value = "") {
  return String(value || "")
    .trim()
    .replace(/\.+$/g, "")
    .replace(/^TA\b\s*/i, "")
    .trim();
}

function formatTACompletedBy(value = "") {
  const name = normalizeTACompletedByName(value);
  return name ? `TA ${name}.` : "";
}

function formatTACompletedByExcel(value = "") {
  const name = normalizeTACompletedByName(value);
  return name ? `TA ${name}` : "";
}

function getCompletedByForPrepEntry(entry = {}) {
  const explicitCompletedBy = (entry?.completedByText || entry?.completedBy || "").toString().trim();
  if (explicitCompletedBy) return explicitCompletedBy;

  const explicitName = (entry?.taName || "").toString().trim();
  if (explicitName) return formatTACompletedByExcel(explicitName);

  const text = (entry?.text || "").toString();
  const shunterMatch = text.match(/by\s+Shunter\s+(.+?)\.?$/i);
  if (shunterMatch) return `Shunter ${formatTp1ShunterNameForLog(shunterMatch[1]) || shunterMatch[1].trim()}`;

  const match = text.match(/Performed\s+by\s+TA\s+(.+?)\.?$/i);
  return match ? formatTACompletedByExcel(match[1]) : "";
}

function buildLatestPSTExcelMap(entries = []) {
  const latestByTrain = new Map();

  entries.forEach((entry) => {
    const trainNo = trainKeyToNumber(entry.trainKey);
    if (!trainNo) return;
    latestByTrain.set(trainNo, entry);
  });

  return latestByTrain;
}

function buildPSTExportRows(logLines = [], completedBy = "", depotFilter = "") {
  const todayText = formatExcelExportDate(new Date());
  const safeLogLines = Array.isArray(logLines) ? logLines : [];
  const normalizedDepot = depotFilter === "west" || depotFilter === "east" ? depotFilter : "";
  const depotLabel = normalizedDepot === "west" ? "West Depot" : normalizedDepot === "east" ? "East Depot" : "";

  const matchesDepot = (entry) => !normalizedDepot || getPSTDepotFromEntry(entry) === normalizedDepot;
  const pstLogs = safeLogLines.filter((entry) => entry?.type === "PST" && matchesDepot(entry));
  const prepLogs = safeLogLines.filter((entry) => entry?.type === "Prep" && matchesDepot(entry));

  const latestPSTByTrain = buildLatestPSTExcelMap(pstLogs);
  const latestPrepByTrain = buildLatestPSTExcelMap(prepLogs);

  const completedPSTEntries = Array.from(latestPSTByTrain.values());
  const westCount = completedPSTEntries.filter((entry) => getPSTDepotFromEntry(entry) === "west").length;
  const eastCount = completedPSTEntries.filter((entry) => getPSTDepotFromEntry(entry) === "east").length;

  const rows = [
    ["Date", "Version Sheet", "TRAIN Number", "Start Time", "Location", "Passenger Service Test", "Awake Status", "PST Completion Time", "PST Completed by", "Train Preparation Completion Time", "Train Preparation Completed By"],
    ["", "", "", "", "", "", "", "", "", "", ""],
  ];

  for (let trainNo = 1; trainNo <= PST_EXCEL_TRAIN_COUNT; trainNo += 1) {
    const pstEntry = latestPSTByTrain.get(trainNo);
    const prepEntry = latestPrepByTrain.get(trainNo);
    const sourceEntry = pstEntry || prepEntry;

    rows.push([
      todayText,
      PST_EXCEL_VERSION,
      `TS#3${String(trainNo).padStart(2, "0")}`,
      pstEntry ? formatExcelExportTime(pstEntry.startTime) : "",
      sourceEntry ? extractPSTLocation(sourceEntry) : "",
      pstEntry ? "PASS" : "",
      pstEntry ? "Completely Awake" : "",
      pstEntry ? formatExcelExportTime(pstEntry.endTime) : "",
      pstEntry ? getCompletedByForPSTEntry(pstEntry, completedBy) : "",
      prepEntry ? formatExcelExportTime(prepEntry.endTime) : "",
      prepEntry ? getCompletedByForPrepEntry(prepEntry) : "",
    ]);
  }

  const totalText = normalizedDepot
    ? `Total PST completed PASS is ${completedPSTEntries.length}. (${depotLabel})`
    : `Total PST completed PASS is ${completedPSTEntries.length}. (West Depot ${westCount} and East Depot ${eastCount})`;

  rows.push([totalText, "", "", "", "", "", "", "", "", "", ""]);

  return rows;
}

function buildPSTFormRows() {
  const rows = Array.from({ length: 50 }, () => ["", "", "", "", "", ""]);
  rows[1] = ["", "TRAIN", "Location", "Status", "Passenger Service Test", "Version Sheet"];
  rows[2] = ["", "N/A", "WD-ST12", "Completely Awake", "PASS", ""];
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

function buildPSTExcelWorkbook(logLines = [], completedBy = "", depotFilter = "") {
  const normalizedDepot = depotFilter === "west" || depotFilter === "east" ? depotFilter : "";
  const combinedRl3Rows = buildPSTExportRows(logLines, completedBy, "");
  const westRl3Rows = buildPSTExportRows(logLines, completedBy, "west");
  const eastRl3Rows = buildPSTExportRows(logLines, completedBy, "east");
  const formRows = buildPSTFormRows();

  const buildRL3RowStyles = (rows) => rows.map((_, index) => {
    if (index === 0) return 1;      // black header
    if (index === 1) return 2;      // orange separator
    if (index === rows.length - 1) return 4; // total row
    return 3;                       // body
  });
  const formRowStyles = formRows.map((_, index) => index === 1 ? 1 : 3);

  const buildRL3WorksheetXml = (rows) => buildExcelWorksheetXml({
    rows,
    rowStyles: buildRL3RowStyles(rows),
    rowHeights: rows.map((_, index) => index === 0 ? 16 : 15),
    colWidths: [13, 16, 18.28515625, 14, 14, 22, 21.42578125, 24.42578125, 20.85546875, 38, 38],
    dimension: "A1:K50",
    merges: ["A50:K50"],
  });

  const formXml = buildExcelWorksheetXml({
    rows: formRows,
    rowStyles: formRowStyles,
    rowHeights: formRows.map((_, index) => index === 1 ? 18 : 15),
    colWidths: [4, 13, 22, 22, 22, 15],
    dimension: "A1:F50",
  });

  const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

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

  if (normalizedDepot) {
    const depotSheetName = normalizedDepot === "west" ? "WEST DEPOT" : "EAST DEPOT";
    const depotRows = normalizedDepot === "west" ? westRl3Rows : eastRl3Rows;
    const depotRl3Xml = buildRL3WorksheetXml(depotRows);

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${depotSheetName}" sheetId="1" r:id="rId1"/>
    <sheet name="FORM" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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

    return buildStoredZip([
      { name: "[Content_Types].xml", data: contentTypesXml },
      { name: "_rels/.rels", data: packageRelsXml },
      { name: "xl/workbook.xml", data: workbookXml },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
      { name: "xl/worksheets/sheet1.xml", data: depotRl3Xml },
      { name: "xl/worksheets/sheet2.xml", data: formXml },
      { name: "xl/styles.xml", data: stylesXml },
    ]);
  }

  const combinedRl3Xml = buildRL3WorksheetXml(combinedRl3Rows);
  const westRl3Xml = buildRL3WorksheetXml(westRl3Rows);
  const eastRl3Xml = buildRL3WorksheetXml(eastRl3Rows);

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="WEST + EAST" sheetId="1" r:id="rId1"/>
    <sheet name="WEST DEPOT" sheetId="2" r:id="rId2"/>
    <sheet name="EAST DEPOT" sheetId="3" r:id="rId3"/>
    <sheet name="FORM" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  return buildStoredZip([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: packageRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/worksheets/sheet1.xml", data: combinedRl3Xml },
    { name: "xl/worksheets/sheet2.xml", data: westRl3Xml },
    { name: "xl/worksheets/sheet3.xml", data: eastRl3Xml },
    { name: "xl/worksheets/sheet4.xml", data: formXml },
    { name: "xl/styles.xml", data: stylesXml },
  ]);
}

function downloadPSTExcelExport(logLines = [], completedBy = "", depotFilter = "") {
  const normalizedDepot = depotFilter === "west" || depotFilter === "east" ? depotFilter : "";
  const xlsxBytes = buildPSTExcelWorkbook(logLines, completedBy, normalizedDepot);
  const blob = new Blob([xlsxBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const depotFileLabel = normalizedDepot === "west" ? "West-Depot" : normalizedDepot === "east" ? "East-Depot" : "West-East";
  downloadBlob(blob, `Line-3-Passenger-Service-Test-${depotFileLabel}-${dateStamp}.xlsx`);
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
          strike: false,
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
            strokeWidth: item.strike ? 2 : 1,
          });
          centerText(safeLabel, pillX, pillY, pillX + pillWidth, pillY + pillHeight, pillFontSize, 800, "", item.textFill || "#000");
          if (item.strike) {
            add(`<line x1="${pillX + 8}" y1="${pillY + pillHeight / 2}" x2="${pillX + pillWidth - 8}" y2="${pillY + pillHeight / 2}" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>`);
          }
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
  const trainKey = normalizeTrainId(block?.trainId || "");
  const logEntry = getActiveInsertionEntryForCell(insertionLog, road, bi, trainKey);
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
      const roadNum = road.replace(/^[A-Z]+-ST0?/, "");
      const label = `STABLING ${roadNum.padStart(2, "0")}`;
      return `${label}: ${trains.join(", ")}`;
    });
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
                    style={getRequestPillStyle(item, { showSuppressedStyle: false })}
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
