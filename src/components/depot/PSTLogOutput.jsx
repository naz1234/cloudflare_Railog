import { useState } from "react";
import { X } from "lucide-react";

function formatTrainList(trainKeys) {
  if (trainKeys.length === 0) return "";
  if (trainKeys.length === 1) return trainKeys[0];
  return trainKeys.slice(0, -1).join(", ") + " and " + trainKeys[trainKeys.length - 1];
}

function buildPSTCopyText(pstLines) {
  if (pstLines.length === 0) return "";
  const firstTime = pstLines[0].startTime;
  const lastTime = pstLines[pstLines.length - 1].startTime;
  const trainList = formatTrainList(pstLines.map((l) => l.trainKey));
  return [
    `Total PST completed: ${pstLines.length} train${pstLines.length !== 1 ? "s" : ""} conducted from ${firstTime} to ${lastTime} hrs.`,
    `Trains: ${trainList}.`,
    "",
    ...pstLines.map((l) => l.text),
  ].join("\n");
}

function buildPrepCopyText(prepLines, depotLabel) {
  if (prepLines.length === 0) return "";
  const firstTime = prepLines[0].startTime;
  const lastTime = prepLines[prepLines.length - 1].startTime;
  const trainList = formatTrainList(prepLines.map((l) => l.trainKey));
  return [
    `Train Preparation at ${depotLabel} Depot: Total ${prepLines.length} train${prepLines.length !== 1 ? "s" : ""} completed from ${firstTime} to ${lastTime} hrs.`,
    `Trains: ${trainList}.`,
    "",
    ...prepLines.map((l) => l.text),
  ].join("\n");
}

function CopyBtn({ text, label, disabled }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        if (disabled) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: copied ? "#16a34a" : "rgba(255,255,255,0.1)",
        borderColor: "#2b4f6b",
        color: "#c8d8ea",
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function PSTDepotBlock({ label, lines, onRemove, onClearDepot }) {
  const pstLines = lines.filter((l) => l.type === "PST");
  const prepLines = lines.filter((l) => l.type === "Prep");
  const isWest = label === "West";
  const [confirmClear, setConfirmClear] = useState(false);

  const handleDepotClear = () => {
    if (confirmClear) {
      onClearDepot();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        borderColor: "#2b4f6b",
        background: "linear-gradient(135deg,#0c2240 0%,#071828 100%)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isWest ? "bg-purple-400" : "bg-cyan-400"}`} />
          <h3 className={`text-xs font-black tracking-widest uppercase whitespace-nowrap ${isWest ? "text-purple-300" : "text-cyan-300"}`}>
            {label} Depot
          </h3>
          <span className="text-[10px] text-[#4a8ab5] font-medium whitespace-nowrap">
            {lines.length} {lines.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <CopyBtn text={buildPSTCopyText(pstLines)} label="PST" disabled={pstLines.length === 0} />
          <CopyBtn text={buildPrepCopyText(prepLines, label)} label="Train Prep" disabled={prepLines.length === 0} />

          {lines.length > 0 && (
            <button
              onClick={handleDepotClear}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                confirmClear
                  ? "bg-red-600 border-red-600 text-white"
                  : "text-[#7a91b0] hover:text-red-400 hover:border-red-700/60"
              }`}
              style={{
                borderColor: confirmClear ? undefined : "#2b4f6b",
                background: confirmClear ? undefined : "transparent",
              }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              {confirmClear ? "Confirm?" : "Clear"}
            </button>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <div
          className="rounded-xl border border-[#1a3a56] py-6 flex flex-col items-center justify-center gap-2 text-[#3a5a7a]"
          style={{ background: "#071828" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01" />
          </svg>
          <span className="text-[11px] font-medium">No entries for {label} Depot</span>
        </div>
      ) : (
        <div className="space-y-3 min-w-0">
          {pstLines.length > 0 && (
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 px-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-black tracking-widest uppercase text-emerald-400">
                  PST ({pstLines.length})
                </span>
              </div>

              <div
                className="rounded-xl px-4 py-3 space-y-2 border border-emerald-900/50 min-w-0"
                style={{ background: "#071828" }}
              >
                <div className="pb-2 mb-1 border-b border-emerald-900/40 space-y-0.5 min-w-0 overflow-x-auto">
                  <p className="font-mono text-[11px] font-bold text-[#c8d8ea] whitespace-nowrap m-0">
                    Total PST completed: {pstLines.length} train{pstLines.length !== 1 ? "s" : ""} conducted from {pstLines[0]?.startTime} to {pstLines[pstLines.length - 1]?.startTime} hrs.
                  </p>
                  <p className="font-mono text-[11px] text-[#4a8ab5] whitespace-nowrap m-0">
                    Trains: {formatTrainList(pstLines.map((l) => l.trainKey))}.
                  </p>
                </div>

                {pstLines.map((entry) => (
                  <div key={entry.key} className="group flex items-center gap-2 min-w-0">
                    <p className="flex-1 min-w-0 overflow-x-auto font-mono text-[11px] text-[#c8d8ea] leading-5 whitespace-nowrap m-0 pr-2">
                      {entry.text}
                    </p>
                    <button
                      onClick={() => onRemove(entry.key)}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-[#3a5a7a] hover:text-red-400 transition-all flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prepLines.length > 0 && (
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 px-1">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[10px] font-black tracking-widest uppercase text-blue-400">
                  Train Prep ({prepLines.length})
                </span>
              </div>

              <div
                className="rounded-xl px-4 py-3 space-y-2 border border-blue-900/40 min-w-0"
                style={{ background: "#071828" }}
              >
                <div className="pb-2 mb-1 border-b border-blue-900/30 space-y-0.5 min-w-0 overflow-x-auto">
                  <p className="font-mono text-[11px] font-bold text-[#c8d8ea] whitespace-nowrap m-0">
                    Train Preparation at {label} Depot: Total {prepLines.length} train{prepLines.length !== 1 ? "s" : ""} completed from {prepLines[0]?.startTime} to {prepLines[prepLines.length - 1]?.startTime} hrs.
                  </p>
                  <p className="font-mono text-[11px] text-[#4a8ab5] whitespace-nowrap m-0">
                    Trains: {formatTrainList(prepLines.map((l) => l.trainKey))}.
                  </p>
                </div>

                {prepLines.map((entry) => (
                  <div key={entry.key} className="group flex items-center gap-2 min-w-0">
                    <p className="flex-1 min-w-0 overflow-x-auto font-mono text-[11px] text-[#c8d8ea] leading-5 whitespace-nowrap m-0 pr-2">
                      {entry.text}
                    </p>
                    <button
                      onClick={() => onRemove(entry.key)}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-[#3a5a7a] hover:text-red-400 transition-all flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PSTLogOutput({ logLines, onRemove, onClearDepot }) {
  const westLines = logLines.filter((l) => l.depot === "west");
  const eastLines = logLines.filter((l) => l.depot === "east");

  return (
    <div className="bg-[#0b1f33] rounded-2xl border border-[#2b4f6b] shadow-sm overflow-hidden">
      <div
        className="px-5 py-3 border-b border-[#1a3a56] flex items-center gap-3"
        style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}
      >
        <div className="w-7 h-7 rounded-lg bg-[#10263b] border border-[#2b4f6b] flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </div>

        <div className="flex-1">
          <p className="text-xs font-black text-white">PST / Train Prep Log</p>
          <p className="text-[10px] text-[#4a8ab5]">
            {logLines.length} {logLines.length === 1 ? "entry" : "entries"}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <PSTDepotBlock label="West" lines={westLines} onRemove={onRemove} onClearDepot={() => onClearDepot("west")} />
        <PSTDepotBlock label="East" lines={eastLines} onRemove={onRemove} onClearDepot={() => onClearDepot("east")} />
      </div>
    </div>
  );
}
