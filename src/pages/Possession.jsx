import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Copy, ClipboardCheck, Trash2, FileText, Shield, Wind, Plus, X } from "lucide-react";

const NAV_LINKS = [
  { to: "/depot-stabling", label: "Depot Stabling" },
  { to: "/possession", label: "Possession" },
];

function parseTimeTo24(raw) {
  if (!raw) return "";
  const clean = raw.trim();
  const h24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return `${String(parseInt(h24[1])).padStart(2, "0")}:${h24[2]}`;
  const h12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (h12) {
    let h = parseInt(h12[1]); const m = h12[2]; const period = h12[3].toUpperCase();
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  return clean;
}

function fmt24(raw) { const t = parseTimeTo24(raw); return t ? `${t} hrs` : ""; }
function cleanAccessNo(raw) { return raw.replace(/,/g, ""); }

// ── Dark-themed shared primitives ─────────────────────────────────────────────

function CopyBtn({ text, disabled }) {
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

const FIELD = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-semibold text-[#4a8ab5] tracking-widest uppercase mb-1">{label}</label>
    {children}
  </div>
);

const INPUT = ({ value, onChange, placeholder, className = "" }) => (
  <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || ""}
    className={`w-full rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b] ${className}`} />
);

const TEXTAREA = ({ value, onChange, placeholder, rows = 2 }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || ""} rows={rows}
    className="w-full rounded-lg border border-[#1e3a56] bg-[#071828] px-3 py-2 text-xs text-[#c8d8ea] outline-none focus:ring-1 focus:ring-[#4f8ef7] focus:border-[#4f8ef7] transition-all placeholder:text-[#2b4f6b] resize-none" />
);

// ── Shared card/header styles ─────────────────────────────────────────────────
const cardCls = "bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden";
const headerCls = "border-b border-[#1a3a56] px-4 py-3 flex items-center justify-between";
const headerStyle = { background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" };

// ── Section 1: Possession Log ─────────────────────────────────────────────────
const POSSESSION_KEY = "possessionLog_v2";

const defaultEntry = () => ({ picName: "", picId: "", description: "", accessNo: "", issueTime: "", scd: "Yes", scdLoc: "", scdApplyTime: "", scdRemTime: "", handbackTime: "" });

function generateEntryOutput(f) {
  const access = cleanAccessNo(f.accessNo);
  const lines = [];
  if (f.picName || f.picId) lines.push(`PIC - ${f.picName}${f.picId ? ` (${f.picId})` : ""}`);
  if (f.description) lines.push(f.description);
  lines.push("");
  if (f.scd === "Yes" && (f.scdApplyTime || f.scdRemTime || f.scdLoc)) {
    const applyT = fmt24(f.scdApplyTime); const remT = fmt24(f.scdRemTime);
    let scdLine = "";
    if (applyT) scdLine += `${applyT} - SCD applied${f.scdLoc ? ` at ${f.scdLoc}` : ""}.`;
    if (remT) scdLine += ` At ${remT} SCD confirmed removed.`;
    if (scdLine) lines.push(scdLine);
  }
  const issueT = fmt24(f.issueTime);
  if (issueT && access) lines.push(`${issueT} - CMMS updated to ISSUED (Access #${access})`);
  const handbackT = fmt24(f.handbackTime);
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
          <FIELD label="PIC Name"><INPUT value={entry.picName} onChange={set("picName")} placeholder="Full name" /></FIELD>
          <FIELD label="PIC ID"><INPUT value={entry.picId} onChange={set("picId")} placeholder="e.g. FLOW_8545" /></FIELD>
        </div>
        <FIELD label="Description"><TEXTAREA value={entry.description} onChange={set("description")} placeholder="Work description..." rows={2} /></FIELD>
        <div className="grid grid-cols-2 gap-3">
          <FIELD label="Access No."><INPUT value={entry.accessNo} onChange={set("accessNo")} placeholder="e.g. 268,216" /></FIELD>
          <FIELD label="Issue Time"><INPUT value={entry.issueTime} onChange={set("issueTime")} placeholder="e.g. 04:17 PM" /></FIELD>
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
            <FIELD label="SCD Location"><INPUT value={entry.scdLoc} onChange={set("scdLoc")} placeholder="e.g. Building A" /></FIELD>
            <div className="grid grid-cols-2 gap-3">
              <FIELD label="SCD Apply Time"><INPUT value={entry.scdApplyTime} onChange={set("scdApplyTime")} placeholder="e.g. 04:17 PM" /></FIELD>
              <FIELD label="SCD Remove Time"><INPUT value={entry.scdRemTime} onChange={set("scdRemTime")} placeholder="e.g. 02:10 AM" /></FIELD>
            </div>
          </div>
        )}
        <FIELD label="Handback Time"><INPUT value={entry.handbackTime} onChange={set("handbackTime")} placeholder="e.g. 08:19 PM" /></FIELD>
      </div>
    </div>
  );
}

function PossessionLog() {
  const [entries, setEntries] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(POSSESSION_KEY) || "null"); return Array.isArray(saved) && saved.length > 0 ? saved : [defaultEntry()]; }
    catch { return [defaultEntry()]; }
  });
  useEffect(() => { localStorage.setItem(POSSESSION_KEY, JSON.stringify(entries)); }, [entries]);
  const updateEntry = (i, val) => setEntries((prev) => prev.map((e, idx) => idx === i ? val : e));
  const addEntry = () => setEntries((prev) => [...prev, defaultEntry()]);
  const removeEntry = (i) => setEntries((prev) => prev.filter((_, idx) => idx !== i));
  const clear = () => { setEntries([defaultEntry()]); localStorage.removeItem(POSSESSION_KEY); };
  const output = entries.map(generateEntryOutput).join("\n\n");

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={cardCls}>
        <div className={headerCls} style={headerStyle}>
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
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[#2b4f6b] text-xs font-semibold text-[#4a8ab5] hover:bg-[#0a1e2e] hover:border-[#4f8ef7] hover:text-[#c8d8ea] transition-all">
            <Plus className="w-3.5 h-3.5" /> Add Another Access
          </button>
        </div>
      </div>
      <div className={cardCls}>
        <div className={headerCls} style={headerStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Generated Output</h2>
            <p className="text-[10px] text-[#4a8ab5]">Formatted possession log</p>
          </div>
          <CopyBtn text={output} disabled={!output.trim()} />
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
const SC_KEY = "scSecurityMessage_v1";
const defaultSC = { picName: "", phone: "", accessNo: "", description: "", location: "", gateNo: "" };

function generateSCOutput(f) {
  const access = cleanAccessNo(f.accessNo);
  return [`PIC Name: ${f.picName}`, `Mobile#: ${f.phone}`, `Access: ${access}`, `Activity: ${f.description}`, `Location: ${f.location}`, `Gate Number: ${f.gateNo}`].join("\n");
}

function SCSecurityMessage() {
  const [form, setForm] = useState(() => { try { return { ...defaultSC, ...JSON.parse(localStorage.getItem(SC_KEY) || "{}") }; } catch { return defaultSC; } });
  useEffect(() => { localStorage.setItem(SC_KEY, JSON.stringify(form)); }, [form]);
  const set = (field) => (val) => setForm((p) => ({ ...p, [field]: val }));
  const clear = () => { setForm(defaultSC); localStorage.removeItem(SC_KEY); };
  const output = generateSCOutput(form);
  const hasContent = Object.values(form).some((v) => v.trim() !== "");

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={cardCls}>
        <div className={headerCls} style={headerStyle}>
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
            <FIELD label="PIC Name"><INPUT value={form.picName} onChange={set("picName")} placeholder="e.g. Nawaf and Ridha" /></FIELD>
            <FIELD label="Phone / Mobile"><INPUT value={form.phone} onChange={set("phone")} placeholder="Optional" /></FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FIELD label="Access Number"><INPUT value={form.accessNo} onChange={set("accessNo")} placeholder="e.g. 265,404" /></FIELD>
            <FIELD label="Gate Number"><INPUT value={form.gateNo} onChange={set("gateNo")} placeholder="e.g. 4" /></FIELD>
          </div>
          <FIELD label="Description / Activity"><TEXTAREA value={form.description} onChange={set("description")} placeholder="e.g. TPE, ATWP01-WD, PM..." rows={3} /></FIELD>
          <FIELD label="Location"><INPUT value={form.location} onChange={set("location")} placeholder="e.g. West Depot" /></FIELD>
        </div>
      </div>
      <div className={cardCls}>
        <div className={headerCls} style={headerStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Generated Message</h2>
            <p className="text-[10px] text-[#4a8ab5]">Formatted security message</p>
          </div>
          <CopyBtn text={hasContent ? output : ""} disabled={!hasContent} />
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

// ── Section 3: Sweeping ───────────────────────────────────────────────────────
const SWEEP_KEY = "sweepingLog_v1";
const defaultSweep = { trainSet: "", nameTa: "", startTime: "", sweepFrom: "", sweepTo: "", lineClearTime: "" };

function formatTrainSet(val) {
  if (!val) return "";
  const clean = val.trim().replace(/^T/i, "");
  const num = clean.replace(/\D/g, "");
  return num ? `T${num}` : val.trim();
}

function generateSweepOutput(f) {
  const trainId = formatTrainSet(f.trainSet);
  const start = fmt24(f.startTime);
  const lineClear = fmt24(f.lineClearTime);
  if (!trainId || !start) return "";
  let line = `${start} – ${trainId} sweeping started from ${f.sweepFrom || "?"} to ${f.sweepTo || "?"}.`;
  if (f.nameTa) line += ` TA ${f.nameTa} onboard.`;
  if (lineClear) line += ` At ${lineClear}, confirmed line is clear.`;
  return line;
}

function SweepingLog() {
  const [form, setForm] = useState(() => { try { return { ...defaultSweep, ...JSON.parse(localStorage.getItem(SWEEP_KEY) || "{}") }; } catch { return defaultSweep; } });
  useEffect(() => { localStorage.setItem(SWEEP_KEY, JSON.stringify(form)); }, [form]);
  const set = (field) => (val) => setForm((p) => ({ ...p, [field]: val }));
  const clear = () => { setForm(defaultSweep); localStorage.removeItem(SWEEP_KEY); };
  const output = generateSweepOutput(form);

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 items-start">
      <div className={cardCls}>
        <div className={headerCls} style={headerStyle}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center"><Wind className="w-3.5 h-3.5 text-[#4f8ef7]" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Sweeping (after Possession)</h2>
              <p className="text-[10px] text-[#4a8ab5]">Fill in details to generate log</p>
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FIELD label="Train Set"><INPUT value={form.trainSet} onChange={set("trainSet")} placeholder="e.g. 33" /></FIELD>
            <FIELD label="Name TA"><INPUT value={form.nameTa} onChange={set("nameTa")} placeholder="e.g. faizal" /></FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FIELD label="Sweeping From"><INPUT value={form.sweepFrom} onChange={set("sweepFrom")} placeholder="e.g. a" /></FIELD>
            <FIELD label="Sweeping To"><INPUT value={form.sweepTo} onChange={set("sweepTo")} placeholder="e.g. b" /></FIELD>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FIELD label="Start Time"><INPUT value={form.startTime} onChange={set("startTime")} placeholder="e.g. 02:32 AM" /></FIELD>
            <FIELD label="Line Clear Time"><INPUT value={form.lineClearTime} onChange={set("lineClearTime")} placeholder="e.g. 03:32 AM" /></FIELD>
          </div>
        </div>
      </div>
      <div className={cardCls}>
        <div className={headerCls} style={headerStyle}>
          <div>
            <h2 className="text-sm font-bold text-white">Generated Output</h2>
            <p className="text-[10px] text-[#4a8ab5]">Formatted sweeping log</p>
          </div>
          <CopyBtn text={output} disabled={!output} />
        </div>
        <div className="p-4 min-h-[160px]">
          {output ? (
            <pre className="font-mono text-xs text-[#c8d8ea] whitespace-pre-wrap leading-relaxed">{output}</pre>
          ) : (
            <div className="h-32 flex flex-col items-center justify-center gap-2 text-center">
              <Wind className="w-6 h-6 text-[#1e3a56]" />
              <p className="text-[10px] text-[#3a5a7a] font-semibold">Fill in the form to generate output</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Possession() {
  const location = useLocation();
  return (
    <div className="h-screen font-inter bg-[#071828] flex flex-col overflow-hidden">
      <header className="h-[56px] border-b border-[#1a3a56] shadow-sm flex-shrink-0" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="max-w-[1800px] mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" /><path d="M9 11V7a3 3 0 0 1 6 0v4" /><circle cx="9" cy="16" r="1" /><circle cx="15" cy="16" r="1" />
                </svg>
              </div>
              <span className="text-sm font-bold text-white tracking-tight">TrainLog</span>
            </div>
            <nav className="flex items-center gap-0.5 bg-[#050f1a] p-0.5 rounded-lg border border-[#1e3a56]">
              {NAV_LINKS.map(({ to, label }) => (
                <Link key={to} to={to} className={`px-3 py-1.5 rounded-md text-xs transition-colors ${location.pathname === to ? "font-semibold bg-[#0f2d4a] text-[#c8d8ea] shadow-sm border border-[#2b4f6b]" : "font-medium text-[#4a8ab5] hover:text-[#c8d8ea] hover:bg-[#0a1e2e]"}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 bg-[#050f1a] border border-[#1e3a56] px-3 py-1.5 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-[#4a8ab5]">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto px-5 py-5 space-y-6">
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
              <span className="w-5 h-5 rounded-full bg-sky-900/50 border border-sky-700/50 flex items-center justify-center text-[10px] font-black text-sky-300">2</span>
              <h1 className="text-sm font-black text-white tracking-widest uppercase">Station Controller Security Message</h1>
              <div className="flex-1 h-px bg-[#1e3a56]" />
            </div>
            <SCSecurityMessage />
          </section>
          <div className="border-t border-[#1e3a56]" />
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-emerald-900/50 border border-emerald-700/50 flex items-center justify-center text-[10px] font-black text-emerald-300">3</span>
              <h1 className="text-sm font-black text-white tracking-widest uppercase">Sweeping (after Possession)</h1>
              <div className="flex-1 h-px bg-[#1e3a56]" />
            </div>
            <SweepingLog />
          </section>
        </div>
      </main>
    </div>
  );
}