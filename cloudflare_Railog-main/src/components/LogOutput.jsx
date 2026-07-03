import { useState } from "react";
import { Copy, ClipboardCheck, ListChecks, X, Undo2, Redo2, ArrowRightLeft, Trash2 } from "lucide-react";

function CopyButton({ entries, label, disabled, color }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (disabled) return;
    navigator.clipboard.writeText(entries.map((e) => e.line).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const colorClass =
    color === "green"
      ? "border-emerald-700/60 text-emerald-400 hover:bg-emerald-900/30 disabled:border-[#1e3a56] disabled:text-[#3a5a7a]"
      : color === "blue"
      ? "border-sky-700/60 text-sky-400 hover:bg-sky-900/30 disabled:border-[#1e3a56] disabled:text-[#3a5a7a]"
      : "border-orange-700/60 text-orange-400 hover:bg-orange-900/30 disabled:border-[#1e3a56] disabled:text-[#3a5a7a]";
  return (
    <button onClick={handleCopy} disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:cursor-not-allowed ${colorClass}`}>
      {copied ? <ClipboardCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function DepotSection({ label, entries, onRemove, allEntries, onClearDepot }) {
  const insertions = entries.filter((e) => e.operation === "inserted");
  const removals = entries.filter((e) => e.operation === "removed");
  const swaps = entries.filter((e) => e.operation === "swapped");
  const isWest = label === "West";
  const accentBorder = isWest ? "border-violet-800/40" : "border-cyan-800/40";
  const accentHeaderBg = isWest ? "bg-violet-950/40" : "bg-cyan-950/40";
  const dotColor = isWest ? "bg-violet-400" : "bg-cyan-400";
  const accentText = isWest ? "text-violet-300" : "text-cyan-300";

  return (
    <div className={`rounded-xl border ${accentBorder} overflow-hidden bg-[#071828]`}>
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${accentBorder} ${accentHeaderBg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-xs font-bold tracking-widest uppercase ${accentText}`}>{label} Depot</span>
          <span className={`text-[10px] font-medium ${accentText} opacity-60`}>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton entries={insertions} label="Insertions" disabled={insertions.length === 0} color="green" />
          <CopyButton entries={removals} label="Removals" disabled={removals.length === 0} color="orange" />
          <CopyButton entries={swaps} label="Swaps" disabled={swaps.length === 0} color="blue" />
          <div className="w-px h-4 bg-[#1e3a56] mx-0.5" />
          <button onClick={onClearDepot} disabled={entries.length === 0} title={"Clear all " + label + " Depot entries"}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-800/50 text-red-400 hover:bg-red-950/40 disabled:border-[#1e3a56] disabled:text-[#3a5a7a] disabled:cursor-not-allowed transition-colors">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2.5">
        {entries.length === 0 ? (
          <div className="py-4 flex flex-col items-center gap-1.5 text-center">
            <ArrowRightLeft className="w-4 h-4 text-[#2b4f6b]" />
            <p className="text-[10px] text-[#3a5a7a] font-semibold">No entries for {label} Depot</p>
          </div>
        ) : (
          <>
            {insertions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Train Insertion ({insertions.length})</p>
                </div>
                <LogGroup entries={insertions} color="green" onRemove={onRemove} allEntries={allEntries} />
              </div>
            )}
            {removals.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  <p className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">Train Removal ({removals.length})</p>
                </div>
                <LogGroup entries={removals} color="orange" onRemove={onRemove} allEntries={allEntries} />
              </div>
            )}
            {swaps.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <p className="text-[10px] font-bold tracking-widest text-sky-400 uppercase">Train Swapping ({swaps.length})</p>
                </div>
                <LogGroup entries={swaps} color="blue" onRemove={onRemove} allEntries={allEntries} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LogGroup({ entries, color, onRemove, allEntries }) {
  const isGreen = color === "green";
  const isBlue = color === "blue";
  return (
    <div className={`rounded-lg border px-3 py-1.5 ${isGreen ? "border-emerald-800/40 bg-emerald-950/30" : isBlue ? "border-sky-800/40 bg-sky-950/30" : "border-orange-800/40 bg-orange-950/30"}`}>
      {entries.map((entry, i) => (
        <div key={i} className="group flex items-start gap-2 py-0.5">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-[#c8d8ea] leading-relaxed break-words">{entry.line}</p>
            {entry.notes && <p className="text-[10px] text-[#4a8ab5] mt-0.5">{entry.notes}</p>}
          </div>
          <button onClick={() => onRemove(allEntries.indexOf(entry))} title="Remove"
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#3a5a7a] hover:text-red-400 hover:bg-red-950/40 transition-all mt-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function LogOutput({ entries, onRemove, onClearDepot, onUndo, onRedo, canUndo, canRedo }) {
  const westEntries = entries.filter((e) => e.depot === "west");
  const eastEntries = entries.filter((e) => e.depot === "east");

  return (
    <div className="bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden">
      <div className="border-b border-[#1a3a56] px-4 py-3" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
              <ListChecks className="w-3.5 h-3.5 text-[#4f8ef7]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Today's Log</h2>
              <p className="text-[10px] text-[#4a8ab5]">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onUndo} disabled={!canUndo} title="Undo"
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#0a1e2e] border border-[#1e3a56] hover:bg-[#0f2d4a] text-[#4a8ab5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Undo2 className="w-3 h-3" />
            </button>
            <button onClick={onRedo} disabled={!canRedo} title="Redo"
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#0a1e2e] border border-[#1e3a56] hover:bg-[#0f2d4a] text-[#4a8ab5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Redo2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3 min-h-[300px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center gap-2.5 text-center">
            <div className="w-10 h-10 rounded-xl bg-[#0a1e2e] border border-[#1e3a56] flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-[#2b4f6b]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#3a5a7a]">No entries yet</p>
              <p className="text-[10px] text-[#2b4f6b] mt-0.5">Add a log entry from the form</p>
            </div>
          </div>
        ) : (
          <>
            <DepotSection label="West" entries={westEntries} onRemove={onRemove} allEntries={entries} onClearDepot={() => onClearDepot("west")} />
            <DepotSection label="East" entries={eastEntries} onRemove={onRemove} allEntries={entries} onClearDepot={() => onClearDepot("east")} />
          </>
        )}
      </div>
    </div>
  );
}