import { useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Wrench, FileSpreadsheet, Upload, Copy, ClipboardCheck, Check, X } from "lucide-react";

const MIN_VISIBLE_REQUEST_ROWS = 40;

export const REQUEST_COLORS = {
  // Matched with DepotStabling.jsx MAINT_STYLES badgeBorder values.
  // MaintenancePanel uses `bg` as the visible pill accent/border/text colour.
  UNFIT:                 { bg: "#fca5a5", text: "#000000" },
  "Not Fit":             { bg: "#fca5a5", text: "#000000" },
  "Workshop /Unfit":      { bg: "#fca5a5", text: "#000000" },
  "RST CM":              { bg: "#fb923c", text: "#000000" },
  "RST PM":              { bg: "#86efac", text: "#000000" },
  WASH:                  { bg: "#7dd3fc", text: "#000000" },
  "TLC Comms":           { bg: "#6366f1", text: "#000000" },
  "ML Fault":            { bg: "#dc2626", text: "#000000" },
  "HVAC TESTING":        { bg: "#f9a8d4", text: "#000000" },
  "Deep Cleaning":       { bg: "#d8b4fe", text: "#000000" },
  "INBOUND (G to C)":    { bg: "#fde047", text: "#000000" },
  "CC Tech/Func. Alarm": { bg: "#f59e0b", text: "#000000" },
  "Door Issue":          { bg: "#ef4444", text: "#000000" },
  Training:              { bg: "#0284c7", text: "#000000" },
  "APU alarm":           { bg: "#14b8a6", text: "#000000" },
  Other:                 { bg: "#cbd5e1", text: "#000000" },
};

function normalizeTrainId(value) {
  const cleaned = value.toString().trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";
  if (/^\d+$/.test(cleaned)) return String(Number(cleaned)).padStart(2, "0");
  return cleaned;
}

function normalizeTrainCompareKey(value) {
  const cleaned = (value || "").toString().trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";

  const match = cleaned.match(/^T?0*(\d+)$/);
  if (match) return String(Number(match[1])).padStart(2, "0");

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

function formatTrainIdForPopup(value = "") {
  const key = normalizeTrainCompareKey(value);
  return key ? `T${key}` : value.toString().trim().toUpperCase();
}

function RequestCrossLine({ show }) {
  if (!show) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-0 top-1/2 z-20 h-px -translate-y-1/2 bg-red-500/95"
    />
  );
}

function RequestCrossBubble({ message }) {
  if (!message) return null;

  return (
    <span className="request-cross-bubble pointer-events-none absolute left-[38px] top-1/2 z-[80] -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-900 shadow-xl opacity-0 scale-95 transition-all duration-150">
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-slate-200 bg-white" />
      <span className="relative z-10">{message}</span>
    </span>
  );
}

function DeleteRequestIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-red-300/90 bg-[#941c24] shadow-[0_0_8px_rgba(148,28,36,0.65)] transition-all group-hover/delete:scale-105 group-hover/delete:bg-[#c92a35]"
    >
      <X className="h-3 w-3 stroke-[3.5] text-white" />
    </span>
  );
}

function AlreadyStatusIcon({ message, reason }) {
  if (!message) return null;

  const isWorkshop = reason === "WORKSHOP";

  return (
    <span
      className="already-status-trigger relative z-40 inline-flex shrink-0 items-center justify-center"
      tabIndex={0}
      aria-label={message}
    >
      <span
        className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border ${
          isWorkshop
            ? "border-[#fbbf24] bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            : "border-emerald-300/80 bg-[#58c96b] shadow-[0_0_8px_rgba(88,201,107,0.55)]"
        }`}
      >
        <Check className="h-3 w-3 stroke-[3.5] text-white" />
      </span>
      <span className="already-status-bubble pointer-events-none absolute right-[25px] top-1/2 z-[90] -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-900 shadow-xl opacity-0 scale-95 transition-all duration-150">
        <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-slate-200 bg-white" />
        <span className="relative z-10">{message}</span>
      </span>
    </span>
  );
}

const CUSTOM_REQUEST_PALETTE = [
  "#22c55e", // green
  "#38bdf8", // sky
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fbbf24", // amber
  "#2dd4bf", // teal
  "#fb7185", // rose
  "#c084fc", // purple
  "#60a5fa", // blue
  "#f97316", // orange
  "#34d399", // emerald
  "#e879f9", // fuchsia
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#d946ef", // magenta
  "#facc15", // yellow
  "#10b981", // mint
  "#818cf8", // indigo
  "#fb923c", // soft orange
  "#2dd4bf", // aqua
];

export function getCustomRequestColor(label = "") {
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

  if (!key) return REQUEST_COLORS.Other.bg;

  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return CUSTOM_REQUEST_PALETTE[hash % CUSTOM_REQUEST_PALETTE.length];
}

function getRequestPillStyle(typeKey, displayLabel = "") {
  const styleKey = getKnownRequestColorKey(typeKey || displayLabel);
  const color = REQUEST_COLORS[styleKey];
  const accent = color?.bg || getCustomRequestColor(displayLabel || typeKey);

  return {
    backgroundColor: "#091828",
    color: accent,
    border: `1px solid ${accent}`,
    boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 0 8px ${accent}55`,
    textShadow: `0 0 6px ${accent}88`,
  };
}

function getColumnValue(row, possibleNames) {
  const keys = Object.keys(row || {});
  const matchedKey = keys.find((key) =>
    possibleNames.some((name) => key.trim().toLowerCase() === name.trim().toLowerCase())
  );

  return matchedKey ? row[matchedKey] : "";
}

function normalizeExcelWashTrainNumber(value) {
  if (!value) return "";

  const text = String(value).trim().toUpperCase().replace(/\s+/g, "");

  // Example:
  // L3-MV-302 -> 02
  // L3-MV-331 -> 31
  const match = text.match(/L\d+-MV-(\d+)$/i) || text.match(/(\d+)$/);
  if (!match) return "";

  return match[1].slice(-2).padStart(2, "0");
}


const EXCEL_WASH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EXCEL_WASH_MONTH_LOOKUP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function formatExcelWashDayMonth(day, month) {
  const dayNum = Number(day);
  const monthNum = Number(month);

  if (!Number.isFinite(dayNum) || !Number.isFinite(monthNum)) return "";
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return "";

  return `${dayNum}-${EXCEL_WASH_MONTHS[monthNum - 1]}`;
}

function formatExcelWashDatePart(value) {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatExcelWashDayMonth(value.getDate(), value.getMonth() + 1);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF?.parse_date_code?.(value);
    if (parsed?.d && parsed?.m) return formatExcelWashDayMonth(parsed.d, parsed.m);

    const fallbackDate = new Date(Math.round((Math.floor(value) - 25569) * 86400 * 1000));
    if (!Number.isNaN(fallbackDate.getTime())) {
      return formatExcelWashDayMonth(fallbackDate.getUTCDate(), fallbackDate.getUTCMonth() + 1);
    }
  }

  const text = value.toString().trim();
  if (!text) return "";

  const numericText = Number(text);
  if (Number.isFinite(numericText) && numericText > 20000) {
    return formatExcelWashDatePart(numericText);
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return formatExcelWashDayMonth(isoMatch[3], isoMatch[2]);

  const namedMonthMatch = text.match(/^(\d{1,2})\s*[-/\s]\s*([A-Za-z]{3,9})/i);
  if (namedMonthMatch) {
    const month = EXCEL_WASH_MONTH_LOOKUP[namedMonthMatch[2].toLowerCase()];
    if (month) return formatExcelWashDayMonth(namedMonthMatch[1], month);
  }

  const numericDateMatch = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?/);
  if (numericDateMatch) return formatExcelWashDayMonth(numericDateMatch[1], numericDateMatch[2]);

  const parsedTextDate = new Date(text);
  if (!Number.isNaN(parsedTextDate.getTime())) {
    return formatExcelWashDayMonth(parsedTextDate.getDate(), parsedTextDate.getMonth() + 1);
  }

  return "";
}

function buildExcelWashRequestLabel(nextWashValue) {
  const datePart = formatExcelWashDatePart(nextWashValue);
  return datePart ? `Wash ${datePart}` : "WASH";
}

function isWashRequestLabel(value = "") {
  return normalizeRequestIdentity(value).split(" ").includes("WASH");
}

function getKnownRequestColorKey(label = "") {
  const clean = cleanRequestLabel(label);
  if (REQUEST_COLORS[clean]) return clean;

  const normalized = normalizeRequestIdentity(clean);
  if (normalized === "UNFIT") return "UNFIT";
  if (normalized === "NOT FIT" || normalized === "NOTFIT") return "Not Fit";
  if (normalized === "WORKSHOP UNFIT") return "Workshop /Unfit";
  if (isWashRequestLabel(clean)) return "WASH";
  return clean;
}

function getRequestDisplayLabel(request = {}) {
  return cleanRequestLabel(
    request?.requestType === "Other"
      ? request?.customType || "Other"
      : request?.requestType || ""
  );
}

export default function MaintenancePanel({ requests, onAdd, onRemove, onClearAll, stabledTrainIds = [], stabledTrainLocations = {} }) {
  const [trainId, setTrainId] = useState("");
  const [requestType, setRequestType] = useState("");
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [excelWashPreview, setExcelWashPreview] = useState([]);
  const [excelUploadStatus, setExcelUploadStatus] = useState("");
  const [workshopCopyStatus, setWorkshopCopyStatus] = useState("");

  const handleAdd = () => {
    const trainIds = trainId.split(/[\s,]+/).map(normalizeTrainId).filter(Boolean);
    const cleanType = cleanRequestLabel(requestType);

    if (trainIds.length === 0) { setError("Train ID is required."); return; }
    if (!cleanType) { setError("Request type is required."); return; }

    const uniqueTrainIds = [...new Set(trainIds)];
    const newTypeKey = cleanType.toUpperCase();
    const hasSameTrainAndType = (id) =>
      requests.some((req) => {
        const existingTrainId = normalizeTrainId(req.trainId || "");
        const existingType = cleanRequestLabel(req.requestType === "Other" ? req.customType || "Other" : req.requestType);
        return existingTrainId === id && existingType.toUpperCase() === newTypeKey;
      });
    const newTrainIds = uniqueTrainIds.filter((id) => !hasSameTrainAndType(id));
    const skippedTrainIds = uniqueTrainIds.filter((id) => hasSameTrainAndType(id));
    if (newTrainIds.length === 0) { setError("Train ID already has this request type."); setTrainId(""); return; }
    newTrainIds.forEach((id) => { onAdd({ trainId: id, requestType: cleanType, customType: "", remark: "" }); });
    if (skippedTrainIds.length > 0) { setError(`Skipped same type: ${skippedTrainIds.join(", ")}`); } else { setError(""); }
    setTrainId(""); setRequestType("");
  };

  const handleWashExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError("");
      setExcelUploadStatus("Reading Excel...");
      setExcelWashPreview([]);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        raw: true,
      });

      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        setExcelUploadStatus("No sheet found in Excel.");
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: true,
      });

      const detected = [];
      const seen = new Set();

      rows.forEach((row) => {
        const trainNumber = getColumnValue(row, ["Train Number", "Train No", "Train"]);
        const nextWash = getColumnValue(row, ["Next Wash", "NextWash", "Next Washing"]);
        const trainId = normalizeExcelWashTrainNumber(trainNumber);
        if (!trainId) return;

        const requestLabel = buildExcelWashRequestLabel(nextWash);
        const key = `${trainId}|${normalizeRequestIdentity(requestLabel) || "WASH"}`;

        if (seen.has(key)) return;
        seen.add(key);

        detected.push({
          trainId,
          requestType: requestLabel,
          customType: "",
          remark: "",
        });
      });

      if (detected.length === 0) {
        setExcelUploadStatus("No wash trains detected.");
        return;
      }

      const getExistingWashRequests = (item) =>
        requests.filter((req) => {
          const existingTrainId = normalizeTrainId(req.trainId || "");
          const existingType = getRequestDisplayLabel(req);
          return existingTrainId === item.trainId && isWashRequestLabel(existingType);
        });

      const alreadyExists = (item) =>
        getExistingWashRequests(item).some((req) =>
          normalizeRequestIdentity(getRequestDisplayLabel(req)) === normalizeRequestIdentity(item.requestType)
        );

      const washRequestsToReplace = detected
        .flatMap((item) => getExistingWashRequests(item))
        .filter((req, index, all) => req?.id && all.findIndex((item) => item?.id === req.id) === index)
        .filter((req) => !detected.some((item) =>
          normalizeTrainId(req.trainId || "") === item.trainId &&
          normalizeRequestIdentity(getRequestDisplayLabel(req)) === normalizeRequestIdentity(item.requestType)
        ));

      const newWashItems = detected.filter((item) => !alreadyExists(item));

      for (const req of washRequestsToReplace) {
        await onRemove(req.id);
      }

      for (const item of newWashItems) {
        await onAdd(item);
      }

      setExcelWashPreview(detected);

      const replacedText = washRequestsToReplace.length > 0 ? ` ${washRequestsToReplace.length} old WASH remark replaced.` : "";

      if (newWashItems.length === 0) {
        setExcelUploadStatus(`${detected.length} wash trains detected. All already exist.${replacedText}`);
      } else if (newWashItems.length < detected.length) {
        setExcelUploadStatus(`${newWashItems.length} new wash trains added. ${detected.length - newWashItems.length} already existed.${replacedText}`);
      } else {
        setExcelUploadStatus(`${newWashItems.length} wash trains added.${replacedText}`);
      }
    } catch (uploadError) {
      console.error("Wash Excel upload error:", uploadError);
      setExcelUploadStatus("Unable to read Excel file.");
    } finally {
      event.target.value = "";
    }
  };

  const displayType = (req) => getRequestDisplayLabel(req) || "Request";
  const isWorkshopRequest = (req) => isWorkshopRequestLabel(displayType(req));
  const workshopTrainKeys = new Set(
    (requests || [])
      .filter(isWorkshopRequest)
      .map((req) => normalizeTrainCompareKey(req.trainId || ""))
      .filter(Boolean)
  );
  const stabledTrainKeys = new Set(
    (stabledTrainIds || [])
      .map((id) => normalizeTrainCompareKey(id))
      .filter(Boolean)
  );
  const stabledTrainLocationMap = new Map();

  Object.entries(stabledTrainLocations || {}).forEach(([id, locations]) => {
    const key = normalizeTrainCompareKey(id);
    if (!key) return;

    const cleanLocations = (Array.isArray(locations) ? locations : [locations])
      .map((location) => location?.toString().trim())
      .filter(Boolean);

    if (cleanLocations.length > 0) {
      stabledTrainLocationMap.set(key, cleanLocations);
    }
  });

  const getCrossOutInfo = (req) => {
    const key = normalizeTrainCompareKey(req.trainId || "");
    if (!key) return { reason: "", locationText: "" };

    if (stabledTrainKeys.has(key)) {
      return {
        reason: "STABLING",
        locationText: (stabledTrainLocationMap.get(key) || []).join(" / "),
      };
    }

    if (workshopTrainKeys.has(key) && !isWorkshopRequestLabel(displayType(req))) {
      return { reason: "WORKSHOP", locationText: "" };
    }

    return { reason: "", locationText: "" };
  };

  const getCrossOutMessage = (req, crossOutInfo = getCrossOutInfo(req)) => {
    const titleTrainId = formatTrainIdForPopup(req.trainId || "");

    if (crossOutInfo.reason === "STABLING") {
      return crossOutInfo.locationText
        ? `${titleTrainId} is already at ${crossOutInfo.locationText}`
        : `${titleTrainId} is already in main stabling`;
    }

    if (crossOutInfo.reason === "WORKSHOP") {
      return `${titleTrainId} is already in WORKSHOP`;
    }

    return "";
  };


  const getAlreadyStatusMessage = (crossOutInfo) => {
    if (crossOutInfo.reason === "STABLING") {
      const locationText = (crossOutInfo.locationText || "")
        .replace(/\b(?:West|East) Depot\s*/gi, "")
        .trim();

      return locationText
        ? `Train already at ${locationText}`
        : "Train already in main stabling";
    }

    if (crossOutInfo.reason === "WORKSHOP") {
      return "Train already in WORKSHOP";
    }

    return "";
  };

  const isAlreadyAtStablingOrWorkshopRequest = (req) =>
    !isWorkshopRequest(req) && Boolean(getCrossOutInfo(req).reason);

  const workshopRequests = [...requests]
    .filter(isWorkshopRequest)
    .sort((a, b) => {
      const trainSort = normalizeTrainCompareKey(a.trainId || "").localeCompare(normalizeTrainCompareKey(b.trainId || ""), undefined, { numeric: true });
      return trainSort || displayType(a).localeCompare(displayType(b));
    });
  const alreadyAtStablingOrWorkshopRequests = [...requests]
    .filter(isAlreadyAtStablingOrWorkshopRequest)
    .sort((a, b) => {
      const reasonSort = getCrossOutInfo(a).reason.localeCompare(getCrossOutInfo(b).reason);
      const typeSort = displayType(a).localeCompare(displayType(b));
      const trainSort = normalizeTrainCompareKey(a.trainId || "").localeCompare(normalizeTrainCompareKey(b.trainId || ""), undefined, { numeric: true });
      return reasonSort || typeSort || trainSort;
    });
  const regularRequests = [...requests]
    .filter((req) => !isWorkshopRequest(req) && !isAlreadyAtStablingOrWorkshopRequest(req))
    .sort((a, b) => displayType(a).localeCompare(displayType(b)) || normalizeTrainCompareKey(a.trainId || "").localeCompare(normalizeTrainCompareKey(b.trainId || ""), undefined, { numeric: true }));
  const hasWorkshopRequests = workshopRequests.length > 0;
  const hasAlreadyAtStablingOrWorkshopRequests = alreadyAtStablingOrWorkshopRequests.length > 0;
  const buildWorkshopCopyText = () => {
    const trainList = workshopRequests
      .map((req) => normalizeTrainCompareKey(req.trainId || ""))
      .filter(Boolean);

    return [`Workshop Train (Total ${trainList.length} trains)`, ...trainList].join("\n");
  };

  const handleCopyWorkshopTrains = async () => {
    if (!hasWorkshopRequests) return;

    try {
      await navigator.clipboard.writeText(buildWorkshopCopyText());
      setWorkshopCopyStatus("copied");
    } catch (copyError) {
      console.error("Workshop train copy failed:", copyError);
      setWorkshopCopyStatus("failed");
    } finally {
      setTimeout(() => setWorkshopCopyStatus(""), 1400);
    }
  };

  const visibleRequestRowCount = Math.max(regularRequests.length, 1);
  const emptyRequestRowCount = Math.max(0, MIN_VISIBLE_REQUEST_ROWS - visibleRequestRowCount);

  const inputCls = "w-full border border-[#1e4060] rounded-full px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] bg-[#091828] text-[#c8d8ea] transition-all placeholder:text-[#2b4f6b]";
  const labelCls = "block text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-widest mb-1";

  return (
    <div className="relative overflow-visible bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#1a3a56] rounded-t-xl" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="w-6 h-6 rounded-md bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
          <Wrench className="w-3.5 h-3.5 text-[#4f8ef7]" />
        </div>
        <span className="text-xs font-bold text-white uppercase tracking-widest">Maintenance</span>
        {requests.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="bg-[#0f2d4a] text-[#4f8ef7] border border-[#2b4f6b] text-[10px] font-bold px-2 py-0.5 rounded-full">{requests.length}</span>
            <button
              onClick={() => { if (confirmClear) { onClearAll(); setConfirmClear(false); } else { setConfirmClear(true); } }}
              onBlur={() => setTimeout(() => setConfirmClear(false), 150)}
              className={`text-[9px] font-semibold border rounded-full px-2 py-0.5 transition-colors ${confirmClear ? "text-white bg-red-600 border-red-600" : "text-red-400 border-red-800/50 hover:bg-red-950/40"}`}>
              {confirmClear ? "Confirm?" : "Clear All"}
            </button>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-3 space-y-2.5 border-b border-[#1a3a56]">
        <div className="rounded-xl border border-[#1e4060] bg-[#071e33] p-2.5 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#7eb8e0]">
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#4f8ef7]" />
                Upload Excel
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[#4a8ab5]">
                Train Number will be added as Wash + Next Wash date.
              </p>
            </div>

            <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#2b4f6b] bg-[#10263b] px-2.5 py-1.5 text-[10px] font-bold text-[#c8d8ea] transition-all hover:bg-[#1a3a5c] active:scale-[0.98]">
              <Upload className="w-3 h-3" />
              Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleWashExcelUpload}
                className="hidden"
              />
            </label>
          </div>

          {excelUploadStatus && (
            <div className="mt-2 rounded-lg border border-[#1e4060] bg-[#091828] px-2 py-1 text-[10px] text-[#c8d8ea]">
              {excelUploadStatus}
            </div>
          )}

          {excelWashPreview.length > 0 && (
            <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {excelWashPreview.map((item, index) => (
                <span
                  key={`${item.trainId}-${item.requestType}-${index}`}
                  className="inline-flex items-center rounded-full border border-[#ADD8E6] bg-[#091828] px-2 py-0.5 text-[10px] font-semibold text-[#ADD8E6]"
                >
                  {item.trainId} • {item.requestType}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Train ID</label>
          <input type="text" value={trainId} onChange={(e) => setTrainId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className={inputCls} placeholder="e.g. 24 28 7 20" />
        </div>
        <div>
          <label className={labelCls}>Request Type</label>
          <input
            type="text"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className={inputCls}
            placeholder="e.g. RST PM / INBOUND (G to C)"
          />
          {cleanRequestLabel(requestType) && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#4a8ab5]">
              <span>Colour preview:</span>
              <span
                className="inline-flex max-w-[150px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none truncate"
                style={getRequestPillStyle(cleanRequestLabel(requestType), cleanRequestLabel(requestType))}
              >
                {cleanRequestLabel(requestType)}
              </span>
            </div>
          )}
        </div>
        {error && <p className="text-[10px] text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg px-2.5 py-1.5">{error}</p>}
        <button onClick={handleAdd}
          className="w-full bg-[#1a3a5c] hover:bg-[#1e4d72] border border-[#2b4f6b] active:scale-[0.98] text-[#c8d8ea] font-bold py-2 text-xs rounded-full transition-all flex items-center justify-center gap-1.5 mt-1">
          <Plus className="w-3.5 h-3.5" /> Add Request
        </button>
      </div>

      {/* Workshop Requests */}
      {hasWorkshopRequests && (
        <div className="border-b border-[#1a3a56]">
          <div className="flex items-center justify-between gap-2 border-b border-[#1a3a56] px-3 py-2" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7eb8e0]">Keyword "workshop"</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyWorkshopTrains}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all ${
                  workshopCopyStatus === "copied"
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                    : workshopCopyStatus === "failed"
                    ? "border-red-500/60 bg-red-500/15 text-red-300"
                    : "border-[#2b4f6b] bg-[#10263b] text-[#c8d8ea] hover:bg-[#1a3a5c]"
                }`}
                title="Copy Workshop Train list"
              >
                {workshopCopyStatus === "copied" ? <ClipboardCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {workshopCopyStatus === "copied" ? "Copied" : workshopCopyStatus === "failed" ? "Failed" : "Copy"}
              </button>
              <span className="rounded-full border border-[#2b4f6b] bg-[#0f2d4a] px-2 py-0.5 text-[10px] font-black text-[#4f8ef7]">{workshopRequests.length}</span>
            </div>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
                <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">ID</th>
                <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">Type</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {workshopRequests.map((req) => {
                const displayLabel = displayType(req);
                const crossOutInfo = getCrossOutInfo(req);
                const crossOutReason = crossOutInfo.reason;
                const crossedOut = Boolean(crossOutReason);
                const requestPillStyle = {
                  ...getRequestPillStyle(displayLabel, displayLabel),
                  ...(crossedOut
                    ? {
                        opacity: 0.58,
                      }
                    : {}),
                };
                const crossOutMessage = getCrossOutMessage(req, crossOutInfo);

                return (
                  <tr
                    key={`workshop-${req.id || req._tempId}`}
                    className="group h-[24px] border-b border-[#0f2040] last:border-0 hover:bg-[#0f2040]/50 transition-colors"
                    aria-label={crossOutMessage || undefined}
                  >
                    <td className="request-cross-trigger relative px-0.5 py-0.5 text-center">
                      <span className="inline-flex min-w-[34px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none" style={requestPillStyle}>{req.trainId}</span>
                      <RequestCrossLine show={crossedOut} />
                      <RequestCrossBubble message={crossOutMessage} />
                    </td>
                    <td className="request-cross-trigger relative px-0.5 py-0.5 text-center">
                      <span className="inline-flex max-w-[105px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none truncate" style={requestPillStyle}>{displayLabel}</span>
                      <RequestCrossLine show={crossedOut} />
                    </td>
                    <td className="relative pr-1 py-0.5 text-center">
                      <button
                        onClick={() => onRemove(req.id)}
                        className="group/delete relative z-30 inline-flex h-[20px] w-[20px] items-center justify-center"
                        aria-label={`Delete ${req.trainId}`}
                        title="Delete request"
                      >
                        <DeleteRequestIcon />
                      </button>
                      <RequestCrossLine show={crossedOut} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Already at Stabling / Workshop Requests */}
      {hasAlreadyAtStablingOrWorkshopRequests && (
        <div className="border-b border-[#1a3a56]">
          <div className="flex items-center justify-between gap-2 border-b border-[#1a3a56] px-3 py-2" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7eb8e0]">Already at Stabling / Workshop</span>
            <span className="rounded-full border border-[#2b4f6b] bg-[#0f2d4a] px-2 py-0.5 text-[10px] font-black text-[#4f8ef7]">{alreadyAtStablingOrWorkshopRequests.length}</span>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
                <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">ID</th>
                <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">Type</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {alreadyAtStablingOrWorkshopRequests.map((req) => {
                const displayLabel = displayType(req);
                const crossOutInfo = getCrossOutInfo(req);
                const crossOutReason = crossOutInfo.reason;
                const requestPillStyle = getRequestPillStyle(displayLabel, displayLabel);
                const statusMessage = getAlreadyStatusMessage(crossOutInfo);

                return (
                  <tr
                    key={`already-${crossOutReason}-${req.id || req._tempId}`}
                    className="group h-[24px] border-b border-[#0f2040] last:border-0 hover:bg-[#0f2040]/50 transition-colors"
                    aria-label={statusMessage || undefined}
                  >
                    <td className="relative px-0.5 py-0.5 text-center">
                      <span className="inline-flex min-w-[34px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none" style={requestPillStyle}>{req.trainId}</span>
                    </td>
                    <td className="relative px-0.5 py-0.5 text-center">
                      <span className="inline-flex max-w-[105px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none truncate" style={requestPillStyle}>{displayLabel}</span>
                    </td>
                    <td className="relative pr-1 py-0.5 text-center">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onRemove(req.id)}
                          className="group/delete relative z-30 inline-flex h-[20px] w-[20px] items-center justify-center"
                          aria-label={`Delete ${req.trainId}`}
                          title="Delete request"
                        >
                          <DeleteRequestIcon />
                        </button>
                        <AlreadyStatusIcon message={statusMessage} reason={crossOutReason} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Requests List */}
      <div className="overflow-visible">
        {(hasWorkshopRequests || hasAlreadyAtStablingOrWorkshopRequests) && (
          <div className="flex items-center justify-between gap-2 border-b border-[#1a3a56] px-3 py-2" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7eb8e0]">Pending Request</span>
            <span className="rounded-full border border-[#2b4f6b] bg-[#0f2d4a] px-2 py-0.5 text-[10px] font-black text-[#4f8ef7]">{regularRequests.length}</span>
          </div>
        )}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
              <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">ID</th>
              <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">Type</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody>
            {regularRequests.length === 0 && (
              <tr className="h-[24px] border-b border-[#0f2040]">
                <td colSpan={3} className="text-center text-[#3a5a7a] py-1 text-xs italic">
                  {requests.length === 0 ? "No requests yet" : "No other request type"}
                </td>
              </tr>
            )}
            {regularRequests.map((req) => {
              const displayLabel = displayType(req);
              const typeKey = displayLabel;
              const crossOutInfo = getCrossOutInfo(req);
              const crossOutReason = crossOutInfo.reason;
              const crossedOut = Boolean(crossOutReason);
              const requestPillStyle = {
                ...getRequestPillStyle(typeKey, displayLabel),
                ...(crossedOut
                  ? {
                      opacity: 0.58,
                    }
                  : {}),
              };
              const crossOutMessage = getCrossOutMessage(req, crossOutInfo);
              return (
                <tr
                  key={req.id || req._tempId}
                  className="group h-[24px] border-b border-[#0f2040] last:border-0 hover:bg-[#0f2040]/50 transition-colors"
                  aria-label={crossOutMessage || undefined}
                >
                  <td className="request-cross-trigger relative px-0.5 py-0.5 text-center">
                    <span className="inline-flex min-w-[34px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none" style={requestPillStyle}>{req.trainId}</span>
                    <RequestCrossLine show={crossedOut} />
                    <RequestCrossBubble message={crossOutMessage} />
                  </td>
                  <td className="request-cross-trigger relative px-0.5 py-0.5 text-center">
                    <span className="inline-flex max-w-[105px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none truncate" style={requestPillStyle}>{displayLabel}</span>
                    <RequestCrossLine show={crossedOut} />
                  </td>
                  <td className="relative pr-1 py-0.5 text-center">
                    <button
                        onClick={() => onRemove(req.id)}
                        className="group/delete relative z-30 inline-flex h-[20px] w-[20px] items-center justify-center"
                        aria-label={`Delete ${req.trainId}`}
                        title="Delete request"
                      >
                        <DeleteRequestIcon />
                      </button>
                    <RequestCrossLine show={crossedOut} />
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: emptyRequestRowCount }).map((_, index) => (
              <tr key={`maintenance-empty-${index}`} className="h-[24px] border-b border-[#0f2040] last:border-0">
                <td className="px-0.5 py-0.5 text-center text-[#17314a]">&nbsp;</td>
                <td className="px-0.5 py-0.5 text-center text-[#17314a]">&nbsp;</td>
                <td className="pr-1 py-0.5 text-center">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
