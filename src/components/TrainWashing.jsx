import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, Copy, ClipboardCheck, Trash2, Download, Droplets } from "lucide-react";

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
  if (!isNaN(n)) return `T${String(n).padStart(2, "0")}`;
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
  const s1 = records.filter((r) => timeToMins(r.startTime) < SESSION_BREAK);
  const s2 = records.filter((r) => timeToMins(r.startTime) >= SESSION_BREAK);
  const sessions = [];
  if (s1.length > 0) sessions.push({ label: "Session 1 — 00:00 to 15:29", records: s1, headerStyle: { background: "linear-gradient(90deg,#0c2e4a,#082b46)" }, badgeCls: "text-sky-300 bg-sky-900/40 border border-sky-700/50" });
  if (s2.length > 0) sessions.push({ label: "Session 2 — 15:30 to 23:59", records: s2, headerStyle: { background: "linear-gradient(90deg,#0a2e1e,#061f14)" }, badgeCls: "text-emerald-300 bg-emerald-900/40 border border-emerald-700/50" });
  return sessions;
}

function buildLine(r) { return `${r.startTime} hrs - ${r.trainId} started PARTIAL wash. Completed by ${r.endTime} hrs.`; }
function sessionText(session) { const lines = session.records.map(buildLine); lines.push(`\nTotal: ${session.records.length} trains washed at the automatic wash plant.`); return lines.join("\n"); }

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#1e3a56] bg-[#0a1e2e] text-[#7eb8e0] hover:bg-[#0f2d4a] hover:border-[#2b4f6b] transition-colors">
      {copied ? <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function TrainWashing() {
  const [sessions, setSessions] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  const processFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: false });
      const records = parseSheet(wb.Sheets[wb.SheetNames[0]]);
      setSessions(groupSessions(records));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  useEffect(() => {
    if (sessions.length > 0) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [sessions]);

  const fullText = sessions.map(sessionText).join("\n\n");
  const totalAll = sessions.reduce((s, sess) => s + sess.records.length, 0);

  const exportExcel = () => {
    const rows = [["Log"]];
    sessions.forEach((s) => { s.records.forEach((r) => rows.push([buildLine(r)])); rows.push([`Total: ${s.records.length} trains washed at the automatic wash plant.`]); rows.push([""]); });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Washing Log");
    XLSX.writeFile(wb, "washing_log.xlsx");
  };

  return (
    <div className="space-y-5">
      {/* Upload Card */}
      <div className="bg-[#0b1f33] rounded-2xl border border-[#2b4f6b] shadow-md overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1a3a56] flex items-center justify-between" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
              <Droplets className="w-4 h-4 text-[#4f8ef7]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-widest uppercase">Train Washing Log</h2>
              <p className="text-[10px] text-[#4a8ab5]">Upload Excel — columns: Train Number, Last Wash</p>
            </div>
          </div>
          {sessions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-1 rounded-full">{totalAll} trains</span>
              <CopyBtn text={fullText} />
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#1e3a56] bg-[#0a1e2e] text-[#7eb8e0] hover:bg-[#0f2d4a] transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button onClick={() => { setSessions([]); setFileName(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-800/50 text-red-400 bg-[#0a1e2e] hover:bg-red-950/40 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          )}
        </div>
        {/* Drop Zone */}
        <div className={`mx-5 my-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 py-8 ${dragging ? "border-[#4f8ef7] bg-[#0f2d4a]" : "border-[#1e3a56] bg-[#071828] hover:border-[#2b4f6b] hover:bg-[#0a1e2e]"}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}>
          <div className="w-10 h-10 rounded-full bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
            <Upload className="w-5 h-5 text-[#4f8ef7]" />
          </div>
          <p className="text-sm font-semibold text-[#7eb8e0]">{fileName ? `✓ ${fileName}` : "Drop Excel file here or click to upload"}</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { processFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
      </div>

      {/* Log Output */}
      {sessions.length > 0 && sessions.map((session, si) => (
        <div key={si} className="bg-[#0b1f33] rounded-2xl border border-[#2b4f6b] shadow-md overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a3a56] flex items-center justify-between" style={session.headerStyle}>
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-black text-white">{si + 1}</span>
              <span className="text-xs font-black text-white tracking-widest uppercase">{session.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${session.badgeCls}`}>{session.records.length} trains</span>
              <CopyBtn text={sessionText(session)} />
            </div>
          </div>
          <div className="px-5 py-4 space-y-1">
            {session.records.map((r, i) => (
              <p key={i} className="font-mono text-xs text-[#c8d8ea] leading-relaxed">{buildLine(r)}</p>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
            <p className="font-mono text-xs font-bold text-[#7eb8e0]">Total: {session.records.length} trains washed at the automatic wash plant.</p>
          </div>
        </div>
      ))}

      {sessions.length === 0 && fileName && (
        <div className="bg-amber-950/40 border border-amber-700/60 rounded-xl px-5 py-4 text-sm text-amber-300 font-semibold">
          ⚠ No records found. Ensure the file has "Train Number" and "Last Wash" columns.
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}