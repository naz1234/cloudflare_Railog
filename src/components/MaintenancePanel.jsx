import { useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Trash2, Wrench, FileSpreadsheet, Upload } from "lucide-react";

const REQUEST_TYPES = [
  "UNFIT", "Workshop /Unfit", "RST CM", "RST PM", "WASH", "TLC Comms", "ML Fault", "HVAC TESTING",
  "Deep Cleaning", "INBOUND (G to C)", "CC Tech/Func. Alarm", "Door Issue", "Training", "APU alarm", "Other"
];

const MIN_VISIBLE_REQUEST_ROWS = 40;

export const REQUEST_COLORS = {
  // Matched with DepotStabling.jsx MAINT_STYLES badgeBorder values.
  // MaintenancePanel uses `bg` as the visible pill accent/border/text colour.
  UNFIT:                 { bg: "#fca5a5", text: "#000000" },
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
  const color = REQUEST_COLORS[typeKey];
  const accent = color?.bg || getCustomRequestColor(displayLabel || typeKey);

  return {
    backgroundColor: "#091828",
    color: accent,
    border: `1px solid ${accent}`,
    boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 0 8px ${accent}55`,
    textShadow: `0 0 6px ${accent}88`,
  };
}

function getNeutralPillStyle() {
  return {
    backgroundColor: "#091828",
    color: "#7eb8e0",
    border: "1px solid #1e4060",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  };
}

const NOTE_COLOR_OVERRIDES = {
  "PM TODAY": "#fbbf24",
  "TODAY PM": "#fbbf24",
  "PM TOMORROW": "#38bdf8",
  "TOMORROW PM": "#38bdf8",
  "TMRW PM": "#38bdf8",
};

function getRemarkPillStyle(remark = "") {
  const cleanRemark = remark
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .join(" ");

  const accent = NOTE_COLOR_OVERRIDES[cleanRemark] || getCustomRequestColor(cleanRemark);

  return {
    backgroundColor: "#091828",
    color: accent,
    border: `1px solid ${accent}`,
    boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 0 8px ${accent}55`,
    textShadow: `0 0 6px ${accent}88`,
  };
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

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

function getDateParts(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      day: value.getDate(),
      monthIndex: value.getMonth(),
      year: value.getFullYear(),
    };
  }

  if (typeof value === "number") {
    // Excel serial date support.
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return {
        day: parsed.d,
        monthIndex: parsed.m - 1,
        year: parsed.y,
      };
    }
  }

  const text = String(value).trim();
  if (!text) return null;

  // Handles Excel text like: 5-20-26 11:17 AM or 5/20/2026 11:17 AM
  const mmddyy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (mmddyy) {
    return {
      day: Number(mmddyy[2]),
      monthIndex: Number(mmddyy[1]) - 1,
      year: mmddyy[3].length === 2 ? 2000 + Number(mmddyy[3]) : Number(mmddyy[3]),
    };
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return {
      day: parsedDate.getDate(),
      monthIndex: parsedDate.getMonth(),
      year: parsedDate.getFullYear(),
    };
  }

  return null;
}

function formatWashRemark(nextWashValue) {
  const parts = getDateParts(nextWashValue);
  if (!parts || parts.monthIndex < 0 || parts.monthIndex > 11) return "wash";

  return `wash ${parts.day} ${MONTHS_SHORT[parts.monthIndex]}`;
}

export default function MaintenancePanel({ requests, onAdd, onRemove, onClearAll }) {
  const [trainId, setTrainId] = useState("");
  const [requestType, setRequestType] = useState("RST PM");
  const [customType, setCustomType] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [excelWashPreview, setExcelWashPreview] = useState([]);
  const [excelUploadStatus, setExcelUploadStatus] = useState("");

  const handleAdd = () => {
    const trainIds = trainId.split(/[\s,]+/).map(normalizeTrainId).filter(Boolean);
    if (trainIds.length === 0) { setError("Train ID is required."); return; }
    if (requestType === "Other" && !customType.trim()) { setError("Please enter custom type."); return; }
    const uniqueTrainIds = [...new Set(trainIds)];
    const newType = requestType === "Other" ? customType.trim() || "Other" : requestType;
    const hasSameTrainAndType = (id) =>
      requests.some((req) => {
        const existingTrainId = normalizeTrainId(req.trainId || "");
        const existingType = req.requestType === "Other" ? req.customType || "Other" : req.requestType;
        return existingTrainId === id && existingType === newType;
      });
    const newTrainIds = uniqueTrainIds.filter((id) => !hasSameTrainAndType(id));
    const skippedTrainIds = uniqueTrainIds.filter((id) => hasSameTrainAndType(id));
    if (newTrainIds.length === 0) { setError("Train ID already has this request type."); setTrainId(""); return; }
    newTrainIds.forEach((id) => { onAdd({ trainId: id, requestType, customType: requestType === "Other" ? customType.trim() : "", remark: remark.trim() }); });
    if (skippedTrainIds.length > 0) { setError(`Skipped same type: ${skippedTrainIds.join(", ")}`); } else { setError(""); }
    setTrainId(""); setRemark(""); setCustomType(""); setRequestType("RST PM");
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
        const nextWash = getColumnValue(row, ["Next Wash", "Next wash", "NEXT WASH"]);

        const trainId = normalizeExcelWashTrainNumber(trainNumber);
        if (!trainId) return;

        const remarkText = formatWashRemark(nextWash);
        const key = `${trainId}|${remarkText}`;

        if (seen.has(key)) return;
        seen.add(key);

        detected.push({
          trainId,
          requestType: "WASH",
          customType: "",
          remark: remarkText,
        });
      });

      if (detected.length === 0) {
        setExcelUploadStatus("No wash trains detected.");
        return;
      }

      const alreadyExists = (item) =>
        requests.some((req) => {
          const existingTrainId = normalizeTrainId(req.trainId || "");
          const existingType = req.requestType === "Other" ? req.customType || "Other" : req.requestType;
          return existingTrainId === item.trainId && existingType === "WASH";
        });

      const newWashItems = detected.filter((item) => !alreadyExists(item));

      newWashItems.forEach((item) => {
        onAdd(item);
      });

      setExcelWashPreview(detected);

      if (newWashItems.length === 0) {
        setExcelUploadStatus(`${detected.length} wash trains detected. All already exist.`);
      } else if (newWashItems.length < detected.length) {
        setExcelUploadStatus(`${newWashItems.length} new wash trains added. ${detected.length - newWashItems.length} already existed.`);
      } else {
        setExcelUploadStatus(`${newWashItems.length} wash trains added.`);
      }
    } catch (uploadError) {
      console.error("Wash Excel upload error:", uploadError);
      setExcelUploadStatus("Unable to read Excel file.");
    } finally {
      event.target.value = "";
    }
  };

  const displayType = (req) => req.requestType === "Other" ? (req.customType || "Other") : req.requestType;
  const sortedRequests = [...requests].sort((a, b) => displayType(a).localeCompare(displayType(b)));
  const visibleRequestRowCount = Math.max(sortedRequests.length, requests.length === 0 ? 1 : 0);
  const emptyRequestRowCount = Math.max(0, MIN_VISIBLE_REQUEST_ROWS - visibleRequestRowCount);

  const inputCls = "w-full border border-[#1e4060] rounded-full px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] bg-[#091828] text-[#c8d8ea] transition-all placeholder:text-[#2b4f6b]";
  const labelCls = "block text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-widest mb-1";

  return (
    <div className="bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
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
                Train Number + Next Wash will be added as WASH.
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
                  key={`${item.trainId}-${item.remark}-${index}`}
                  className="inline-flex items-center rounded-full border border-[#ADD8E6] bg-[#091828] px-2 py-0.5 text-[10px] font-semibold text-[#ADD8E6]"
                >
                  {item.trainId} • WASH • {item.remark}
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
          <select value={requestType} onChange={(e) => setRequestType(e.target.value)}
            className="w-full border border-[#1e4060] rounded-full px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#4f8ef7] bg-[#091828] text-[#c8d8ea] transition-all">
            {REQUEST_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
        {requestType === "Other" && (
          <div>
            <label className={labelCls}>Custom Type</label>
            <input type="text" value={customType} onChange={(e) => setCustomType(e.target.value)} className={inputCls} placeholder="Enter type..." />
          </div>
        )}
        <div>
          <label className={labelCls}>Note <span className="normal-case font-normal">(optional)</span></label>
          <input type="text" value={remark} onChange={(e) => setRemark(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
        {error && <p className="text-[10px] text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg px-2.5 py-1.5">{error}</p>}
        <button onClick={handleAdd}
          className="w-full bg-[#1a3a5c] hover:bg-[#1e4d72] border border-[#2b4f6b] active:scale-[0.98] text-[#c8d8ea] font-bold py-2 text-xs rounded-full transition-all flex items-center justify-center gap-1.5 mt-1">
          <Plus className="w-3.5 h-3.5" /> Add Request
        </button>
      </div>

      {/* Requests List */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
              <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">ID</th>
              <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">Type</th>
              <th className="px-0.5 py-1 text-center text-[10px] font-semibold text-[#4a8ab5] uppercase tracking-wider">Note</th>
              <th className="w-4" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr className="h-[24px] border-b border-[#0f2040]">
                <td colSpan={4} className="text-center text-[#3a5a7a] py-1 text-xs italic">No requests yet</td>
              </tr>
            )}
            {sortedRequests.map((req) => {
              const displayLabel = displayType(req);
              const typeKey = req.requestType === "Other" ? displayLabel : req.requestType;
              const requestPillStyle = getRequestPillStyle(typeKey, displayLabel);
              const notePillStyle = req.remark ? getRemarkPillStyle(req.remark) : getNeutralPillStyle();
              return (
                <tr key={req.id || req._tempId} className="h-[24px] border-b border-[#0f2040] last:border-0 hover:bg-[#0f2040]/50 transition-colors">
                  <td className="px-0.5 py-0.5 text-center">
                    <span className="inline-flex min-w-[34px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none" style={requestPillStyle}>{req.trainId}</span>
                  </td>
                  <td className="px-0.5 py-0.5 text-center">
                    <span className="inline-flex max-w-[105px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none truncate" style={requestPillStyle}>{displayType(req)}</span>
                  </td>
                  <td className="px-0.5 py-0.5 text-center">
                    <span className="inline-flex min-w-[44px] max-w-[105px] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-none truncate" style={notePillStyle}>{req.remark || "Note"}</span>
                  </td>
                  <td className="pr-1 py-0.5 text-center">
                    <button onClick={() => onRemove(req.id)} className="text-[#3a5a7a] hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: emptyRequestRowCount }).map((_, index) => (
              <tr key={`maintenance-empty-${index}`} className="h-[24px] border-b border-[#0f2040] last:border-0">
                <td className="px-0.5 py-0.5 text-center text-[#17314a]">&nbsp;</td>
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
