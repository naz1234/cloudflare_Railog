import { useState } from "react";
import { X } from "lucide-react";

function buildInsertionCopyText(lines, depotLabel) {
  if (lines.length === 0) return "";
  const depotShort = depotLabel === "West" ? "West Depot" : "East Depot";
  const destination = depotLabel === "West" ? "3A1P1" : "3K1P2";
  const tidsWithValue = lines.filter((l) => l.tid !== null && l.tid !== undefined);
  const tidRange = tidsWithValue.length > 0 ? ` (TID ${tidsWithValue[0].tid}–${tidsWithValue[tidsWithValue.length - 1].tid})` : "";
  const header = `Insertion from ${depotShort} to ${destination}${tidRange}.`;
  const trainList = lines.map((l) => l.trainKey).join(", ");
  const totalLine = `Total of ${lines.length} train${lines.length !== 1 ? "s" : ""}: ${trainList}.`;
  return [header, totalLine, ...lines.map((l) => l.text)].join("\n");
}

function DepotSection({ label, lines, color, depot, onRemove, onClearDepot }) {
  const [depotCopied, setDepotCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const copyText = buildInsertionCopyText(lines, label);
  const isWest = color === "west";
  const handleClear = () => {
    if (confirmClear) { onClearDepot(depot); setConfirmClear(false); }
    else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }
  };
  return (
    <div className="rounded-2xl border p-4 space-y-2" style={{ borderColor: "#2b4f6b", background: "linear-gradient(135deg,#0c2240 0%,#071828 100%)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isWest ? "bg-purple-400" : "bg-cyan-400"}`} />
          <h3 className={`text-xs font-black tracking-widest uppercase ${isWest ? "text-purple-300" : "text-cyan-300"}`}>{label} Depot</h3>
          <span className="text-[10px] text-[#4a8ab5] font-medium">{lines.length} {lines.length === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(copyText); setDepotCopied(true); setTimeout(() => setDepotCopied(false), 2000); }}
            disabled={lines.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: depotCopied ? "#16a34a" : "rgba(255,255,255,0.1)", borderColor: "#2b4f6b", color: "#c8d8ea" }}
          >
            {depotCopied ? "Copied!" : "Copy"}
          </button>
          {lines.length > 0 && (
            <button onClick={handleClear} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${confirmClear ? "bg-red-600 border-red-600 text-white" : "text-[#7a91b0] hover:text-red-400 hover:border-red-700/60"}`} style={{ borderColor: confirmClear ? undefined : "#2b4f6b", background: confirmClear ? undefined : "transparent" }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              {confirmClear ? "Confirm?" : "Clear"}
            </button>
          )}
        </div>
      </div>
      {lines.length === 0 ? (
        <div className="rounded-xl border border-[#1a3a56] py-5 flex items-center justify-center text-[#3a5a7a] text-[11px]" style={{ background: "#071828" }}>No entries</div>
      ) : (
        <div className="rounded-xl border border-[#1a3a56] px-4 py-2 space-y-0" style={{ background: "#071828" }}>
          <div className="pb-1 mb-0 border-b border-[#1a3a56] space-y-0">
            <p className="font-mono text-[11px] font-bold text-[#c8d8ea] leading-[1.2]">{buildInsertionCopyText(lines, label).split("\n")[0]}</p>
            <p className="font-mono text-[11px] text-[#4a8ab5] leading-[1.2]">{buildInsertionCopyText(lines, label).split("\n")[1]}</p>
          </div>
          {lines.map((entry) => (
            <div key={entry.key} className="group flex items-center gap-2" style={{ paddingTop: 0, paddingBottom: 0, marginBottom: 0 }}>
              <p className="flex-1 font-mono text-[12px] text-[#c8d8ea]" style={{ lineHeight: "1.2", margin: 0, padding: "1px 0" }}>{entry.text}</p>
              <button onClick={() => onRemove(entry.key)} className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-[#3a5a7a] hover:text-red-400 transition-all flex-shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InsertionLogOutput({ insertionLog, onRemove, onClearDepot }) {
  const westLines = insertionLog.filter((l) => l.depot === "west");
  const eastLines = insertionLog.filter((l) => l.depot === "east");
  const [copied, setCopied] = useState(false);
  const copyAll = () => {
    const w = buildInsertionCopyText(westLines, "West");
    const e = buildInsertionCopyText(eastLines, "East");
    navigator.clipboard.writeText([w, e].filter(Boolean).join("\n\n"));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="bg-[#0b1f33] rounded-2xl border border-[#2b4f6b] shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1a3a56] flex items-center gap-4" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="w-10 h-10 rounded-xl bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.2"><polyline points="5 12 12 5 19 12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>
        </div>
        <div className="flex-1">
          <p className="text-[20px] font-black text-white leading-tight">Insertion Log</p>
          <p className="text-[13px] text-[#4a8ab5] font-medium">{insertionLog.length} {insertionLog.length === 1 ? "entry" : "entries"}</p>
        </div>
        {insertionLog.length > 0 && (
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors"
            style={{ background: copied ? "#16a34a" : "rgba(255,255,255,0.1)", borderColor: "#2b4f6b", color: "#c8d8ea" }}
          >
            {copied ? "Copied!" : "Copy All"}
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <DepotSection label="West" lines={westLines} color="west" depot="west" onRemove={onRemove} onClearDepot={onClearDepot} />
        <DepotSection label="East" lines={eastLines} color="east" depot="east" onRemove={onRemove} onClearDepot={onClearDepot} />
      </div>
    </div>
  );
}