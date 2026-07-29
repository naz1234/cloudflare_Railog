import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, Copy, ClipboardCheck, Trash2, Download, Droplets, PlusCircle, Clock } from "lucide-react";

const SESSION_BREAK = 15 * 60 + 30;

function timeToMins(hhmm) {
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function addMins(hhmm, delta) {
  const total = timeToMins(hhmm) + delta;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getCurrentHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function cleanWashingCustomTimeInput(value) {
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

function normalizeWashingCustomTimeInput(value) {
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

function extractTime(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    const totalMins = Math.round(raw * 24 * 60);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const str = String(raw).trim();
  const dt = str.match(/\d{4}-\d{2}-\d{2}[T ]\s*(\d{1,2}):(\d{2})/);
  if (dt) return `${dt[1].padStart(2, "0")}:${dt[2]}`;
  const dmy = str.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})/);
  if (dmy) return `${dmy[1].padStart(2, "0")}:${dmy[2]}`;
  const t = str.match(/^(\d{1,2}):(\d{2})/);
  if (t) return `${t[1].padStart(2, "0")}:${t[2]}`;
  return null;
}

function formatTrainId(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  const mv = str.match(/-(\d+)$/);
  if (mv) return `T${String(parseInt(mv[1], 10) % 100).padStart(2, "0")}`;
  const n = parseInt(str.replace(/^T/i, ""), 10);
  if (!Number.isNaN(n)) return `T${String(n).padStart(2, "0")}`;
  return str.toUpperCase();
}

function parseSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].filter((c) => String(c).trim() !== "").length >= 2) { headerIdx = i; break; }
  }
  const headers = rows[headerIdx].map((h) => String(h).toLowerCase().trim());
  const find = (...kws) => { for (const kw of kws) { const idx = headers.findIndex((h) => h.includes(kw)); if (idx !== -1) return idx; } return -1; };
  const tCol = find("train number", "train", "set", "unit");
  const sCol = find("last wash", "lastwash", "start", "begin");
  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const trainId = formatTrainId(row[tCol >= 0 ? tCol : 0]);
    const startTime = extractTime(row[sCol >= 0 ? sCol : 1]);
    if (!trainId || !startTime) continue;
    const endTime = addMins(startTime, 4);
    records.push({ trainId, startTime, endTime });
  }
  records.sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  return records;
}

function groupSessions(records) {
  const sortedRecords = [...records].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  const s1 = sortedRecords.filter((r) => timeToMins(r.startTime) < SESSION_BREAK);
  const s2 = sortedRecords.filter((r) => timeToMins(r.startTime) >= SESSION_BREAK);
  const sessions = [];
  if (s1.length > 0) sessions.push({ label: "Session 1 — 00:00 to 15:29", records: s1, headerStyle: { background: "linear-gradient(90deg,#0c2e4a,#082b46)" }, badgeCls: "text-sky-300 bg-sky-900/40 border border-sky-700/50" });
  if (s2.length > 0) sessions.push({ label: "Session 2 — 15:30 to 23:59", records: s2, headerStyle: { background: "linear-gradient(90deg,#0a2e1e,#061f14)" }, badgeCls: "text-emerald-300 bg-emerald-900/40 border border-emerald-700/50" });
  return sessions;
}

function buildLine(r) { return `${r.startTime} hrs - ${r.trainId} started PARTIAL wash. Completed by ${r.endTime} hrs.`; }
function sessionText(session) { const lines = session.records.map(buildLine); lines.push(`\nTotal: ${session.records.length} trains washed at the automatic wash plant.`); return lines.join("\n"); }
function recordsText(records) { const lines = records.map(buildLine); lines.push(`\nTotal: ${records.length} trains washed at the automatic wash plant.`); return lines.join("\n"); }

function CopyBtn({ text, compact = false }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`flex items-center gap-1.5 rounded-lg text-xs font-semibold border border-[#1e3a56] bg-[#0a1e2e] text-[#7eb8e0] hover:bg-[#0f2d4a] hover:border-[#2b4f6b] transition-colors ${compact ? "px-2.5 py-1" : "px-3 py-1.5"}`}
      type="button">
      {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function TrainWashing() {
  const [excelSessions, setExcelSessions] = useState([]);
  const [excelFileName, setExcelFileName] = useState(null);
  const [manualRecords, setManualRecords] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [manualTrainId, setManualTrainId] = useState("");
  const [manualTimingMode, setManualTimingMode] = useState("now");
  const [manualCustomTime, setManualCustomTime] = useState("");
  const [clockText, setClockText] = useState(() => getCurrentHHMM());
  const [manualError, setManualError] = useState("");
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  const processFile = useCallback((file) => {
    if (!file) return;
    setExcelFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: false });
      const records = parseSheet(wb.Sheets[wb.SheetNames[0]]);
      setExcelSessions(groupSessions(records));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const getManualStartTime = useCallback(() => {
    if (manualTimingMode === "custom" && manualCustomTime) {
      return normalizeWashingCustomTimeInput(manualCustomTime);
    }
    return clockText;
  }, [clockText, manualCustomTime, manualTimingMode]);

  const addManualWash = useCallback((e) => {
    e?.preventDefault();
    const trainId = formatTrainId(manualTrainId);
    const startTime = getManualStartTime();

    if (!trainId || !startTime) {
      setManualError("Please enter Train ID and select washing timing.");
      return;
    }

    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      trainId,
      startTime,
      endTime: addMins(startTime, 4),
      source: "manual",
    };

    setManualRecords((prev) => [...prev, record].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime)));
    setManualTrainId("");
    setManualError("");
  }, [getManualStartTime, manualTrainId]);

  const deleteManualRecord = useCallback((id) => {
    setManualRecords((prev) => prev.filter((record) => record.id !== id));
  }, []);

  useEffect(() => {
    const tick = () => setClockText(getCurrentHHMM());
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (excelSessions.length > 0 || manualRecords.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [excelSessions, manualRecords]);

  const manualPreviewTrain = formatTrainId(manualTrainId) || "T31";
  const manualPreviewStartTime = getManualStartTime();
  const manualPreviewText = `${manualPreviewStartTime} hrs - ${manualPreviewTrain} started PARTIAL wash. Completed by ${addMins(manualPreviewStartTime, 4)} hrs.`;
  const manualIsNow = manualTimingMode !== "custom";
  const excelFullText = excelSessions.map(sessionText).join("\n\n");
  const manualFullText = manualRecords.length > 0 ? recordsText(manualRecords) : "";
  const totalExcel = excelSessions.reduce((s, sess) => s + sess.records.length, 0);
  const totalManual = manualRecords.length;

  const exportExcel = () => {
    const rows = [["Log"]];
    excelSessions.forEach((s) => { s.records.forEach((r) => rows.push([buildLine(r)])); rows.push([`Total: ${s.records.length} trains washed at the automatic wash plant.`]); rows.push([""]); });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Washing Log");
    XLSX.writeFile(wb, "washing_log.xlsx");
  };


  return (
    <div className="theme-train-washing-page space-y-5">
      {/* Excel Upload + Converted Log Window */}
      <div className="theme-washing-panel bg-[#0b1f33] rounded-2xl border border-[#2b4f6b] shadow-md overflow-hidden">
        <div className="theme-washing-header theme-washing-header-blue flex flex-col gap-3 border-b border-[#1a3a56] px-5 py-4 lg:flex-row lg:items-center lg:justify-between" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
              <Droplets className="w-4 h-4 text-[#4f8ef7]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black leading-tight text-white tracking-widest uppercase">Convert Completed Washing Records from Excel to ELOG</h2>
              <p className="text-[10px] text-[#4a8ab5]">Excel upload only — columns: Train Number, Last Wash</p>
            </div>
          </div>
          {excelSessions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded-full">{totalExcel} trains</span>
              <CopyBtn text={excelFullText} />
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#1e3a56] bg-[#0a1e2e] text-[#7eb8e0] hover:bg-[#0f2d4a] transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button onClick={() => { setExcelSessions([]); setExcelFileName(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-800/50 text-red-400 bg-[#0a1e2e] hover:bg-red-950/40 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Clear Excel
              </button>
            </div>
          )}
        </div>

        <div className={`theme-washing-upload-zone mx-5 my-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 py-8 ${dragging ? "is-dragging border-[#4f8ef7] bg-[#0f2d4a]" : "border-[#1e3a56] bg-[#071828] hover:border-[#2b4f6b] hover:bg-[#0a1e2e]"}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}>
          <div className="w-10 h-10 rounded-full bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
            <Upload className="w-5 h-5 text-[#4f8ef7]" />
          </div>
          <p className="text-sm font-semibold text-[#7eb8e0]">{excelFileName ? `✓ ${excelFileName}` : "Drop Excel file here or click to upload"}</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { processFile(e.target.files[0]); e.target.value = ""; }} />
        </div>

        {/* Converted Excel Log Output */}
        {excelSessions.length > 0 && (
          <div className="border-t border-[#1a3a56]">
            {excelSessions.map((session, si) => (
              <section key={`excel-${si}`} className={si > 0 ? "border-t border-[#1a3a56]" : ""}>
                <div className="theme-washing-header theme-washing-session-header px-5 py-3 border-b border-[#1a3a56] flex items-center justify-between" data-session={si + 1} style={session.headerStyle}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-black text-white">{si + 1}</span>
                    <span className="text-xs font-black text-white tracking-widest uppercase">{session.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${session.badgeCls}`}>{session.records.length} trains</span>
                    <CopyBtn text={sessionText(session)} />
                  </div>
                </div>
                <div className="theme-washing-log-body px-5 py-4 space-y-1">
                  {session.records.map((r, i) => (
                    <p key={i} className="font-mono text-xs text-[#c8d8ea] leading-relaxed">{buildLine(r)}</p>
                  ))}
                </div>
                <div className="theme-washing-log-total px-5 py-3 border-t border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
                  <p className="font-mono text-xs font-bold text-[#7eb8e0]">Total: {session.records.length} trains washed at the automatic wash plant.</p>
                </div>
              </section>
            ))}
          </div>
        )}

        {excelSessions.length === 0 && excelFileName && (
          <div className="mx-5 mb-4 rounded-xl border border-amber-700/60 bg-amber-950/40 px-5 py-4 text-sm font-semibold text-amber-300">
            ⚠ No records found. Ensure the file has "Train Number" and "Last Wash" columns.
          </div>
        )}
      </div>

      {/* Manual Entry + Manual Log Output Window */}
      <div className="theme-washing-panel theme-washing-manual-panel bg-[#0b1f33] rounded-2xl border border-[#2b4f6b] shadow-md overflow-hidden">
        <div className="theme-washing-header theme-washing-header-green px-5 py-4 border-b border-[#1a3a56] flex items-center justify-between" style={{ background: "linear-gradient(180deg,#0a2e1e 0%,#061f14 100%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#0b2419] border border-emerald-700/50 flex items-center justify-center">
              <PlusCircle className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-widest uppercase">Manual Washing Entry</h2>
              <p className="text-[10px] text-emerald-300/80">Manual PARTIAL wash entry with log output in the same window</p>
            </div>
          </div>
          {manualRecords.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded-full">{totalManual} trains</span>
              <CopyBtn text={manualFullText} />
              <button type="button" onClick={() => { setManualRecords([]); setManualTrainId(""); setManualTimingMode("now"); setManualCustomTime(""); setManualError(""); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-800/50 text-red-400 bg-[#071828] hover:bg-red-950/40 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Clear Manual
              </button>
            </div>
          )}
        </div>

        <form onSubmit={addManualWash} className="p-5">
          <div className="theme-washing-manual-form rounded-xl border border-emerald-700/40 bg-[#071828] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-black uppercase tracking-widest text-emerald-300/80 mb-1.5">Train ID</label>
                <input
                  value={manualTrainId}
                  onChange={(e) => { setManualTrainId(e.target.value); setManualError(""); }}
                  placeholder="Example: 31 or T31"
                  className="w-full rounded-lg border border-[#1e3a56] bg-[#0a1e2e] px-3 py-2 text-sm font-semibold text-white placeholder:text-[#4a6074] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>
              <div className="flex-[1.25] min-w-[240px]">
                <label className="block text-[10px] font-black uppercase tracking-widest text-emerald-300/80 mb-1.5">Start Washing Time</label>
                <div className="theme-washing-time-control flex h-10 w-full items-center overflow-hidden rounded-lg border border-[#1e3a56] bg-[#0a1e2e] shadow-[0_0_14px_rgba(16,185,129,0.10),inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-emerald-400">
                  <div className="flex h-full w-9 shrink-0 items-center justify-center text-white">
                    <Clock className="w-4 h-4 text-[#c8d8ea]" />
                  </div>

                  <button
                    type="button"
                    onClick={() => { setManualTimingMode("now"); setManualError(""); }}
                    className={`flex h-full shrink-0 items-center justify-center px-3 text-xs font-semibold transition-all ${manualIsNow ? "bg-emerald-900/60 text-white" : "text-emerald-300 hover:text-white"}`}
                  >
                    Now
                  </button>

                  <div className="h-5 w-px shrink-0 bg-[#244b6b]" />

                  <button
                    type="button"
                    onClick={() => { setManualTimingMode("custom"); setManualCustomTime((prev) => prev || clockText); setManualError(""); }}
                    className={`flex h-full shrink-0 items-center justify-center px-3 text-xs font-semibold transition-all ${!manualIsNow ? "bg-emerald-900/60 text-white" : "text-emerald-300 hover:text-white"}`}
                  >
                    Custom
                  </button>

                  <div className="h-5 w-px shrink-0 bg-[#244b6b]" />

                  {manualIsNow ? (
                    <button
                      type="button"
                      onClick={() => { setManualTimingMode("custom"); setManualCustomTime((prev) => prev || clockText); setManualError(""); }}
                      className="flex h-full min-w-0 flex-1 items-center px-3 text-left text-xs font-semibold text-white transition-all hover:bg-[#0f2d4a]"
                      title="Click to enter custom timing"
                    >
                      <span className="min-w-0 truncate">{clockText} hrs</span>
                    </button>
                  ) : (
                    <div className="flex h-full min-w-0 flex-1 items-center gap-1 px-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={5}
                        value={manualCustomTime}
                        onKeyDown={(e) => {
                          const value = String(manualCustomTime || "");
                          const cursorAtEnd = e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length;
                          if (e.key === "Backspace" && value.endsWith(":") && cursorAtEnd) {
                            e.preventDefault();
                            setManualCustomTime(value.slice(0, -2));
                          }
                        }}
                        onChange={(e) => { setManualCustomTime(cleanWashingCustomTimeInput(e.target.value)); setManualError(""); }}
                        onBlur={(e) => setManualCustomTime(normalizeWashingCustomTimeInput(e.target.value))}
                        placeholder="00:00"
                        className="h-full min-w-[54px] flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder:text-[#31516b]"
                      />
                      <span className="shrink-0 text-xs font-semibold text-[#c8d8ea]">hrs</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="submit"
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-700/50 bg-emerald-950/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-900/50 hover:border-emerald-400"
              >
                <PlusCircle className="w-4 h-4 text-emerald-300" />
                Add Manual Partial Wash
              </button>
            </div>
            <p className="mt-2 font-mono text-[11px] text-emerald-300/90">Preview: {manualPreviewText}</p>
            {manualError && <p className="mt-2 text-xs font-semibold text-amber-300">⚠ {manualError}</p>}
          </div>
        </form>

        {manualRecords.length > 0 && (
          <div className="border-t border-emerald-800/50">
            <div className="theme-washing-header theme-washing-header-green px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(180deg,#0a2e1e 0%,#061f14 100%)" }}>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-black text-white">1</span>
                <span className="text-xs font-black text-white tracking-widest uppercase">Manual Washing Log</span>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-emerald-300 bg-emerald-900/40 border border-emerald-700/50">{manualRecords.length} trains</span>
            </div>

            <div className="theme-washing-log-body px-4 py-2 space-y-1 bg-[#071828]">
              {manualRecords.map((record) => (
                <div key={record.id} className="theme-washing-log-row flex items-center gap-2 rounded-md border border-emerald-900/40 bg-[#0a1e2e] px-3 py-1">
                  <p className="min-w-0 flex-1 font-mono text-xs text-[#c8d8ea] leading-snug">{buildLine(record)}</p>
                  <CopyBtn text={buildLine(record)} compact />
                  <button
                    type="button"
                    onClick={() => deleteManualRecord(record.id)}
                    className="flex items-center gap-1.5 rounded-md border border-red-800/50 bg-[#071828] px-2.5 py-1 text-xs font-semibold text-red-400 transition-colors hover:bg-red-950/40"
                    title="Delete this manual wash log"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="theme-washing-log-total theme-washing-log-total-green px-5 py-3 border-t border-emerald-800/50" style={{ background: "linear-gradient(180deg,#0a2e1e 0%,#061f14 100%)" }}>
              <p className="font-mono text-xs font-bold text-emerald-300">Total: {manualRecords.length} trains washed at the automatic wash plant.</p>
            </div>
          </div>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
