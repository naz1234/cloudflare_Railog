import { useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Wrench, FileSpreadsheet, Upload, Copy, ClipboardCheck, Check, X, ChevronDown } from "lucide-react";

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
      className="theme-maintenance-delete-icon inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-300/85 bg-[#941c24] shadow-[0_0_6px_rgba(148,28,36,0.5)] transition-all group-hover/delete:scale-105 group-hover/delete:bg-[#c92a35]"
    >
      <X className="h-2.5 w-2.5 stroke-[3.5] text-white" />
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
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
          isWorkshop
            ? "border-[#fbbf24] bg-[#fbbf24] shadow-[0_0_6px_rgba(251,191,36,0.46)]"
            : "border-emerald-300/80 bg-[#58c96b] shadow-[0_0_6px_rgba(88,201,107,0.42)]"
        }`}
      >
        <Check className="h-2.5 w-2.5 stroke-[3.5] text-white" />
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

function hexToRgb(hex = "") {
  const clean = String(hex).replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 74, g: 138, b: 181 };

  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function getRequestCardStyle(typeKey, displayLabel = "") {
  const styleKey = getKnownRequestColorKey(typeKey || displayLabel);
  const color = REQUEST_COLORS[styleKey];
  const accent = color?.bg || getCustomRequestColor(displayLabel || typeKey);
  const { r, g, b } = hexToRgb(accent);

  return {
    accent,
    card: {
      background: `radial-gradient(circle at 8% 35%, rgba(${r},${g},${b},0.38), transparent 50%), linear-gradient(145deg, rgba(${r},${g},${b},0.29), rgba(7,27,45,0.94))`,
      border: `1px solid rgba(${r},${g},${b},0.76)`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 10px rgba(${r},${g},${b},0.26)`,
    },
    divider: `rgba(${r},${g},${b},0.58)`,
  };
}

// Mirrors the request-card visual language used inside the West and East
// main stabling tables. Shared by Workshop, Already-at-Stabling/Workshop,
// and Pending Request compact rows so every request section stays consistent.
function getMainStablingRequestCategory(value = "") {
  const label = normalizeRequestIdentity(value);

  if (!label) return "custom";
  if (label.includes("UNFIT") || label.includes("NOT FIT") || label.includes("INBOUND")) return "critical";
  if (label.includes("RST CM") || label === "SR" || label.startsWith("SR ") || label.includes("CORRECTIVE")) return "sr";
  if (label.includes("RST PM") || label === "PM" || label.startsWith("PM ") || label.includes("PREVENTIVE")) return "pm";
  if (label === "W TA" || label.includes("TA REQUIRED") || label.includes("WITH TA")) return "ta";
  if (label.includes("WASH")) return "wash";
  return "custom";
}

function rgbaFromHex(hex = "#4f8ef7", alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function normalizeRequestGroupColorKey(value = "") {
  return normalizeRequestIdentity(value)
    // Treat date spellings such as "Wash 2Jul", "Wash 2-Jul" and
    // "WASH 2 JUL" as the same request group.
    .replace(/\b(\d{1,2})(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\b/g, "$1 $2");
}

// Match Main Stabling's high-contrast group palette. The hue order jumps
// between colour families so consecutive request groups do not end up as
// almost identical purple/pink/blue shades.
const DISTINCT_REQUEST_GROUP_PALETTE = [
  "#22d3ee", // cyan
  "#fb923c", // orange
  "#a3e635", // lime
  "#f472b6", // pink
  "#60a5fa", // blue
  "#facc15", // yellow
  "#34d399", // emerald
  "#fb7185", // rose
  "#c084fc", // purple
  "#2dd4bf", // teal
  "#f97316", // deep orange
  "#818cf8", // indigo
  "#84cc16", // green-lime
  "#e879f9", // fuchsia
  "#38bdf8", // sky
  "#fbbf24", // amber
  "#10b981", // green
  "#ef4444", // red
  "#a78bfa", // violet
  "#06b6d4", // aqua
  "#d946ef", // magenta
  "#4ade80", // bright green
  "#0ea5e9", // strong blue
  "#eab308", // gold
];

const GENERIC_REQUEST_GROUP_KEYS = new Set(
  [
    ...Object.keys(REQUEST_COLORS),
    "PM",
    "CM",
    "SR",
    "WASH",
    "UNFIT",
    "NOT FIT",
    "NOTFIT",
    "WORKSHOP UNFIT",
    "W TA",
    "TA REQUIRED",
    "WITH TA",
    "OTHER",
    "REQUEST",
  ].map((value) => normalizeRequestGroupColorKey(value))
);

function isSpecificRequestGroup(value = "") {
  const groupKey = normalizeRequestGroupColorKey(value);
  return Boolean(groupKey && !GENERIC_REQUEST_GROUP_KEYS.has(groupKey));
}

function hashRequestGroupKey(value = "") {
  const key = normalizeRequestGroupColorKey(value);
  let hash = 2166136261;

  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash >>> 0;
}

function requestColorDistance(first, second) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const redMean = (a.r + b.r) / 2;
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;

  return Math.sqrt(
    (2 + redMean / 256) * red * red +
      4 * green * green +
      (2 + (255 - redMean) / 256) * blue * blue
  );
}

function buildDistinctRequestGroupColorMap(values = []) {
  const keys = Array.from(
    new Set(
      values
        .map((value) => normalizeRequestGroupColorKey(value))
        .filter((value) => value && isSpecificRequestGroup(value))
    )
  ).sort((a, b) => hashRequestGroupKey(a) - hashRequestGroupKey(b) || a.localeCompare(b));

  const available = DISTINCT_REQUEST_GROUP_PALETTE.map((color, index) => ({ color, index }));
  const assigned = {};
  const usedColors = ["#fb5b63", "#fb923c", "#d879ff", "#2ee6b7", "#4de3ff"];

  keys.forEach((key) => {
    if (available.length === 0) {
      assigned[key] = getCustomRequestColor(key);
      return;
    }

    const preferredIndex = hashRequestGroupKey(key) % DISTINCT_REQUEST_GROUP_PALETTE.length;
    let bestPosition = 0;
    let bestDistance = -1;
    let bestTieBreak = Number.POSITIVE_INFINITY;

    available.forEach((candidate, position) => {
      const minimumDistance = usedColors.reduce(
        (minimum, usedColor) => Math.min(minimum, requestColorDistance(candidate.color, usedColor)),
        Number.POSITIVE_INFINITY
      );
      const directDistance = Math.abs(candidate.index - preferredIndex);
      const circularDistance = Math.min(
        directDistance,
        DISTINCT_REQUEST_GROUP_PALETTE.length - directDistance
      );

      if (
        minimumDistance > bestDistance ||
        (minimumDistance === bestDistance && circularDistance < bestTieBreak)
      ) {
        bestPosition = position;
        bestDistance = minimumDistance;
        bestTieBreak = circularDistance;
      }
    });

    const [{ color }] = available.splice(bestPosition, 1);
    assigned[key] = color;
    usedColors.push(color);
  });

  return assigned;
}

function getMainStablingCompactCardStyle(typeKey, displayLabel = "", requestGroupColors = {}) {
  const requestLabel = displayLabel || typeKey;
  const styleKey = getKnownRequestColorKey(typeKey || displayLabel);
  const configuredColor = REQUEST_COLORS[styleKey];
  const fallbackAccent = configuredColor?.bg || getCustomRequestColor(requestLabel);
  const category = getMainStablingRequestCategory(requestLabel);
  const groupColorKey = normalizeRequestGroupColorKey(requestLabel);
  const usesGroupColor = isSpecificRequestGroup(requestLabel);
  const groupAccent = usesGroupColor
    ? requestGroupColors[groupColorKey] || getCustomRequestColor(groupColorKey)
    : "";

  const visuals = {
    critical: {
      accent: "#fb5b63",
      gradient: "linear-gradient(135deg,rgba(239,68,68,0.26) 0%,#2a0c16 48%,#071828 100%)",
      glow: "0 0 0 1px rgba(239,68,68,0.12),0 0 10px rgba(239,68,68,0.21),0 2px 7px rgba(0,0,0,0.42),inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    sr: {
      accent: "#fb923c",
      gradient: "linear-gradient(135deg,rgba(249,115,22,0.25) 0%,#2b1708 48%,#071828 100%)",
      glow: "0 0 0 1px rgba(249,115,22,0.12),0 0 10px rgba(249,115,22,0.21),0 2px 7px rgba(0,0,0,0.42),inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    pm: {
      accent: "#d879ff",
      gradient: "linear-gradient(135deg,rgba(168,85,247,0.24) 0%,#21103b 48%,#071828 100%)",
      glow: "0 0 0 1px rgba(168,85,247,0.12),0 0 10px rgba(168,85,247,0.22),0 2px 7px rgba(0,0,0,0.42),inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    ta: {
      accent: "#2ee6b7",
      gradient: "linear-gradient(135deg,rgba(16,185,129,0.25) 0%,#062a23 48%,#071828 100%)",
      glow: "0 0 0 1px rgba(16,185,129,0.12),0 0 10px rgba(16,185,129,0.21),0 2px 7px rgba(0,0,0,0.42),inset 0 1px 0 rgba(255,255,255,0.05)",
    },
    wash: {
      accent: "#4de3ff",
      gradient: "linear-gradient(135deg,rgba(34,211,238,0.24) 0%,#062937 48%,#071828 100%)",
      glow: "0 0 0 1px rgba(34,211,238,0.12),0 0 10px rgba(34,211,238,0.22),0 2px 7px rgba(0,0,0,0.42),inset 0 1px 0 rgba(255,255,255,0.05)",
    },
  };

  const visual = usesGroupColor
    ? {
        // Every specific group name receives a distinct colour allocated
        // across the complete request set. The same name always reuses it.
        accent: groupAccent,
      }
    : visuals[category] || {
        accent: fallbackAccent,
      };

  const accent = visual.accent || "#4f8ef7";

  return {
    accent,
    card: {
      // Same treatment as the Removal Summary rows: low-fill horizontal row,
      // thin coloured border, subtle 3px inset on the left, and no bright pill.
      background: `linear-gradient(90deg,${rgbaFromHex(accent, 0.20)} 0%,${rgbaFromHex(accent, 0.10)} 55%,rgba(7,24,40,0.98) 100%)`,
      borderColor: rgbaFromHex(accent, 0.72),
      boxShadow: `inset 3px 0 0 ${rgbaFromHex(accent, 0.86)},inset 0 1px 0 rgba(255,255,255,0.045),0 1px 3px rgba(0,0,0,0.18)`,
    },
    divider: rgbaFromHex(accent, 0.34),
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
  const [expandedAlreadyGroups, setExpandedAlreadyGroups] = useState({});
  const [expandedPendingGroups, setExpandedPendingGroups] = useState({});

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
  const requestGroupColors = buildDistinctRequestGroupColorMap(
    (requests || []).map((req) => displayType(req))
  );
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

  const formatCompactLocationText = (locationText = "", fallback = "") => {
    const firstLocation = (locationText || "")
      .toString()
      .split("/")
      .map((part) => part.trim())
      .find(Boolean) || "";

    if (!firstLocation) return fallback;
    if (/WORKSHOP/i.test(firstLocation)) return "WORKSHOP";

    const depotMatch = firstLocation.match(/^(West|East) Depot\s+STB\s*(\d+)\s+Block\s*(\d+)$/i);
    if (depotMatch) {
      const [, depot, stablingNo, blockNo] = depotMatch;
      const depotPrefix = depot.toUpperCase() === "EAST" ? "ED " : "";
      return `${depotPrefix}STB-${String(stablingNo).padStart(2, "0")} BLK-${String(Number(blockNo))}`;
    }

    const genericMatch = firstLocation.match(/STB\s*(\d+)\s+Block\s*(\d+)/i);
    if (genericMatch) {
      return `STB-${String(genericMatch[1]).padStart(2, "0")} BLK-${String(Number(genericMatch[2]))}`;
    }

    return firstLocation.toUpperCase();
  };

  const getAlreadyExpandedLocationText = (req) => {
    const crossOutInfo = getCrossOutInfo(req);
    if (crossOutInfo.reason === "WORKSHOP") return "WORKSHOP";
    return formatCompactLocationText(crossOutInfo.locationText, "STABLING");
  };

  const getPendingExpandedLocationText = (req) => {
    const key = normalizeTrainCompareKey(req?.trainId || "");
    const crossOutInfo = getCrossOutInfo(req);

    if (crossOutInfo.reason === "WORKSHOP") return "WORKSHOP";
    if (crossOutInfo.locationText) return formatCompactLocationText(crossOutInfo.locationText, "MAINLINE");

    const detectedLocationText = key ? (stabledTrainLocationMap.get(key) || []).join(" / ") : "";
    if (detectedLocationText) return formatCompactLocationText(detectedLocationText, "MAINLINE");

    return "MAINLINE";
  };

  const isAlreadyAtStablingOrWorkshopRequest = (req) =>
    !isWorkshopRequest(req) && Boolean(getCrossOutInfo(req).reason);

  const sortRequestsByTrainThenLabel = (items = []) => [...items].sort((a, b) => {
    const trainSort = normalizeTrainCompareKey(a.trainId || "").localeCompare(
      normalizeTrainCompareKey(b.trainId || ""),
      undefined,
      { numeric: true }
    );
    return trainSort || displayType(a).localeCompare(displayType(b));
  });

  const groupRequestsByExactRemark = (items = []) => {
    const groups = new Map();

    items.forEach((req) => {
      const label = displayType(req) || "Request";
      const key = normalizeRequestIdentity(label) || label.toUpperCase();
      if (!groups.has(key)) {
        groups.set(key, { key, label, items: [] });
      }
      groups.get(key).items.push(req);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) =>
          normalizeTrainCompareKey(a.trainId || "").localeCompare(
            normalizeTrainCompareKey(b.trainId || ""),
            undefined,
            { numeric: true }
          )
        ),
      }))
      .sort((a, b) => {
        const labelSort = a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
        if (labelSort) return labelSort;

        return normalizeTrainCompareKey(a.items?.[0]?.trainId || "").localeCompare(
          normalizeTrainCompareKey(b.items?.[0]?.trainId || ""),
          undefined,
          { numeric: true }
        );
      });
  };

  const getRequestChipTrainLabel = (req) => formatTrainIdForPopup(req?.trainId || "");

  const workshopRequests = sortRequestsByTrainThenLabel(
    [...requests].filter(isWorkshopRequest)
  );
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
  const alreadyRequestGroups = groupRequestsByExactRemark(alreadyAtStablingOrWorkshopRequests);
  const regularRequestGroups = groupRequestsByExactRemark(regularRequests);
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

  const toggleGroupExpanded = (section, groupKey) => {
    const setter = section === "already" ? setExpandedAlreadyGroups : setExpandedPendingGroups;
    setter((previous) => ({ ...previous, [groupKey]: !previous[groupKey] }));
  };

  const renderSingleRequestCard = (req, options = {}) => {
    const { section = "pending", showStatus = false, groupKey = "single" } = options;
    const displayLabel = displayType(req);
    const cardVisual = getMainStablingCompactCardStyle(displayLabel, displayLabel, requestGroupColors);
    const chipLabel = getRequestChipTrainLabel(req);
    const crossOutInfo = getCrossOutInfo(req);
    const crossedOut = Boolean(crossOutInfo.reason);
    const singleCardStyle = {
      ...cardVisual.card,
      ...(crossedOut
        ? {
            opacity: 0.58,
          }
        : {}),
    };
    const crossOutMessage = getCrossOutMessage(req, crossOutInfo);
    const statusText = showStatus ? getAlreadyExpandedLocationText(req) : "";
    const secondaryText = statusText ? `${displayLabel} • ${statusText}` : displayLabel;

    return (
      <div
        key={`${section}-${groupKey}-${req.id || req._tempId || chipLabel}`}
        className="theme-maintenance-request-card theme-train-rem-row-card theme-maintenance-summary-row request-cross-trigger relative grid h-[24px] w-full grid-cols-[46px_minmax(0,1fr)_20px] items-center gap-1 overflow-visible rounded-md border px-1.5 leading-none text-white transition-[filter,box-shadow] duration-150 hover:brightness-105"
        style={{ ...singleCardStyle, "--maintenance-request-accent": cardVisual.accent }}
      >
        <span className="truncate text-center text-[12px] font-semibold text-[#f8fbff]">{chipLabel}</span>
        <span className="min-w-0 truncate pl-2 text-left text-[12px] font-normal uppercase tracking-[0.02em] text-[#f8fbff]">{secondaryText}</span>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRemove(req.id);
          }}
          className="group/delete relative z-30 inline-flex h-4 w-4 items-center justify-center justify-self-end"
          aria-label={`Delete ${chipLabel}`}
          title="Delete request"
        >
          <DeleteRequestIcon />
        </button>
        <RequestCrossLine show={crossedOut} />
        <RequestCrossBubble message={crossOutMessage} />
      </div>
    );
  };

  const renderGroupedRequestCard = (group, options = {}) => {
    const { section = "pending", showStatus = false } = options;
    if (group.items.length === 1) {
      return renderSingleRequestCard(group.items[0], { section, showStatus, groupKey: group.key });
    }

    const cardVisual = getMainStablingCompactCardStyle(group.label, group.label, requestGroupColors);
    const isExpanded = section === "already"
      ? Boolean(expandedAlreadyGroups[group.key])
      : Boolean(expandedPendingGroups[group.key]);

    return (
      <div
        key={`${section}-${group.key}`}
        className="space-y-[4px]"
      >
        <button
          type="button"
          onClick={() => toggleGroupExpanded(section, group.key)}
          className="theme-maintenance-request-card theme-train-rem-row-card theme-maintenance-summary-row grid h-[24px] w-full grid-cols-[minmax(0,1fr)_20px] items-center gap-1 overflow-hidden rounded-md border pl-3 pr-1.5 text-left leading-none transition-[border-color,background,box-shadow] duration-150 hover:brightness-105"
          style={cardVisual.card}
        >
          <span className="min-w-0 truncate text-[12px] font-normal uppercase text-[#f8fbff]">
            {group.label} <span className="text-[#8fa3b2]">({group.items.length})</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 justify-self-end text-[#8fa3b2] transition-transform duration-200 ${isExpanded ? "rotate-180" : "rotate-0"}`}
          />
        </button>

        {isExpanded ? (
          <div className="space-y-[4px]">
            {group.items.map((req) => {
              const chipLabel = getRequestChipTrainLabel(req);
              const locationText = showStatus
                ? getAlreadyExpandedLocationText(req)
                : getPendingExpandedLocationText(req);

              return (
                <div
                  key={`${section}-${group.key}-${req.id || req._tempId || chipLabel}`}
                  className="theme-maintenance-request-card theme-train-rem-row-card theme-maintenance-summary-row grid h-[24px] grid-cols-[56px_minmax(0,1fr)_20px] items-center gap-1 overflow-hidden rounded-md border px-1.5 leading-none transition-[border-color,background,box-shadow] duration-150"
                  style={{ ...cardVisual.card, marginLeft: "10px", width: "calc(100% - 10px)" }}
                >
                  <span className="truncate text-center text-[12px] font-semibold text-[#f8fbff]">{chipLabel}</span>
                  <span className="truncate text-center text-[11px] font-normal uppercase tracking-[0.02em] text-[#a9bfd1]">{locationText}</span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(req.id);
                    }}
                    className="group/delete relative z-30 inline-flex h-4 w-4 items-center justify-center justify-self-end"
                    aria-label={`Delete ${chipLabel}`}
                    title="Delete request"
                  >
                    <DeleteRequestIcon />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const inputCls = "w-full border border-[#1e4060] rounded-full px-3 py-[5px] text-xs outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] bg-[#091828] text-[#c8d8ea] transition-all placeholder:text-[#2b4f6b]";
  const labelCls = "block text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-widest mb-0.5";

  return (
    <div className="theme-maintenance-panel relative overflow-visible bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md">
      {/* Header */}
      <div className="theme-maintenance-header flex items-center gap-2.5 px-4 py-3 border-b border-[#1a3a56] rounded-t-xl" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
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
      <div className="border-b border-[#1a3a56] p-2.5 space-y-2">
        <div className="rounded-xl border border-[#1e4060] bg-[#071e33] p-2 shadow-inner">
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

            <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[#2b4f6b] bg-[#10263b] px-2.5 py-1 text-[10px] font-bold text-[#c8d8ea] transition-all hover:bg-[#1a3a5c] active:scale-[0.98]">
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
          className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-[#2b4f6b] bg-[#1a3a5c] py-1.5 text-xs font-bold text-[#c8d8ea] transition-all hover:bg-[#1e4d72] active:scale-[0.98]">
          <Plus className="w-3.5 h-3.5" /> Add Request
        </button>
      </div>

      {/* Workshop Requests */}
      {hasWorkshopRequests && (
        <div className="border-b border-[#1a3a56]">
          <div className="theme-maintenance-subheader flex items-center justify-between gap-2 border-b border-[#1a3a56] px-3 py-2" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
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
              <tr className="theme-maintenance-subheader border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
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
                const requestCardStyle = getMainStablingCompactCardStyle(displayLabel, displayLabel, requestGroupColors);
                const workshopCardStyle = {
                  ...requestCardStyle.card,
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
                    className="group h-[30px]"
                    aria-label={crossOutMessage || undefined}
                  >
                    <td colSpan={3} className="h-[30px] p-[3px]">
                      <div
                        className="theme-maintenance-request-card theme-train-rem-row-card theme-maintenance-summary-row request-cross-trigger relative grid h-[24px] w-full grid-cols-[40px_minmax(0,1fr)_24px] items-center overflow-visible rounded-md border text-white transition-[filter,box-shadow] duration-150 group-hover:brightness-105"
                        style={{ ...workshopCardStyle, "--maintenance-request-accent": requestCardStyle.accent }}
                      >
                        <span
                          className="flex h-[14px] items-center justify-center border-r pl-1 text-[13px] font-bold leading-none"
                          style={{ borderColor: requestCardStyle.divider, color: "#ffffff" }}
                        >
                          {req.trainId}
                        </span>
                        <span
                          className="theme-maintenance-request-type min-w-0 truncate px-2 text-left text-[13px] font-semibold leading-none"
                          style={{ color: "#ffffff" }}
                        >
                          {displayLabel}
                        </span>
                        <div className="flex items-center justify-end pr-1.5">
                          <button
                            onClick={() => onRemove(req.id)}
                            className="group/delete relative z-30 inline-flex h-4 w-4 items-center justify-center"
                            aria-label={`Delete ${req.trainId}`}
                            title="Delete request"
                          >
                            <DeleteRequestIcon />
                          </button>
                        </div>
                        <RequestCrossLine show={crossedOut} />
                        <RequestCrossBubble message={crossOutMessage} />
                      </div>
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
          <div className="theme-maintenance-subheader flex items-center justify-between gap-2 border-b border-[#1a3a56] px-3 py-2" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7eb8e0]">Already at Stabling / Workshop</span>
            <span className="rounded-full border border-[#2b4f6b] bg-[#0f2d4a] px-2 py-0.5 text-[10px] font-black text-[#4f8ef7]">{alreadyAtStablingOrWorkshopRequests.length}</span>
          </div>

          <div className="grid gap-[5px] p-2.5">
            {alreadyRequestGroups.map((group) => renderGroupedRequestCard(group, { section: "already", showStatus: true }))}
          </div>
        </div>
      )}

      {/* Requests List */}
      <div className="overflow-visible">
        <div className="theme-maintenance-subheader flex items-center justify-between gap-2 border-b border-[#1a3a56] px-3 py-2" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7eb8e0]">Pending Request</span>
          <span className="rounded-full border border-[#2b4f6b] bg-[#0f2d4a] px-2 py-0.5 text-[10px] font-black text-[#4f8ef7]">{regularRequests.length}</span>
        </div>

        {regularRequestGroups.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs italic text-[#3a5a7a]">
            {requests.length === 0 ? "No requests yet" : "No other request type"}
          </div>
        ) : (
          <div className="grid gap-[5px] p-2.5">
            {regularRequestGroups.map((group) => renderGroupedRequestCard(group, { section: "pending" }))}
          </div>
        )}
      </div>
    </div>
  );
}
