import { useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";

function formatSentenceList(values = []) {
  const items = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function isSweepingLine(line = {}) {
  return Boolean(line?.isSweeping);
}

function getSweepSignal(line = {}) {
  const savedSignal = String(line?.signal || "").trim();
  if (savedSignal) return savedSignal;
  return String(line?.text || "").match(/to signal\s+([^\s.]+)/i)?.[1] || "";
}

function buildNormalInsertionCopyText(lines, depotLabel) {
  if (lines.length === 0) return "";

  const depotName = depotLabel === "West" ? "West Depot" : "East Depot";
  const destination = depotLabel === "West" ? "3A1P1" : "3K1P2";
  const tidsWithValue = lines.filter((line) => line.tid !== null && line.tid !== undefined);
  const tidRange = tidsWithValue.length > 0
    ? ` (TID ${tidsWithValue[0].tid}–${tidsWithValue[tidsWithValue.length - 1].tid})`
    : "";
  const header = `Insertion from ${depotName} to ${destination}${tidRange}.`;
  const trainList = lines.map((line) => line.trainKey).join(", ");
  const totalLine = `Total of ${lines.length} train${lines.length !== 1 ? "s" : ""}: ${trainList}.`;

  return [header, totalLine, "", ...lines.map((line) => line.text)].join("\n");
}

function buildSweepingCopyText(lines, depotLabel) {
  if (lines.length === 0) return "";

  const depotName = depotLabel === "West" ? "West Depot" : "East Depot";
  const trainList = formatSentenceList(lines.map((line) => line.trainKey));
  const signalList = formatSentenceList(lines.map(getSweepSignal));
  const destinationText = signalList ? ` to ${signalList}` : "";
  const header = `Insertion train ${trainList} from ${depotName}${destinationText}.`;

  return [header, "", ...lines.map((line) => line.text)].join("\n");
}

function buildInsertionCopyText(lines, depotLabel) {
  if (lines.length === 0) return "";

  const normalLines = lines.filter((line) => !isSweepingLine(line));
  const sweepingLines = lines.filter(isSweepingLine);
  const normalText = buildNormalInsertionCopyText(normalLines, depotLabel);
  const sweepingText = buildSweepingCopyText(sweepingLines, depotLabel);

  return [normalText, sweepingText].filter(Boolean).join("\n\n");
}

async function copyText(text) {
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function LogEntryRow({ entry, onRemove }) {
  return (
    <div className="group flex items-start gap-2 border-b border-[#12304a]/70 px-3 py-1.5 last:border-b-0">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#f4f8ff]">
        {entry.text}
      </p>
      <button
        type="button"
        onClick={() => onRemove(entry.key)}
        title="Delete this log"
        aria-label="Delete this log"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-red-400 opacity-80 transition-all hover:border-red-500/60 hover:bg-red-950/35 hover:text-red-300 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DepotSection({ label, lines, color, depot, onRemove, onClearDepot }) {
  const [depotCopied, setDepotCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const copyTextValue = buildInsertionCopyText(lines, label);
  const normalLines = lines.filter((line) => !isSweepingLine(line));
  const sweepingLines = lines.filter(isSweepingLine);
  const normalHeaderLines = buildNormalInsertionCopyText(normalLines, label).split("\n");
  const sweepingHeader = buildSweepingCopyText(sweepingLines, label).split("\n")[0] || "";
  const isWest = color === "west";
  const accent = isWest ? "#a78bfa" : "#67e8f9";

  const handleCopy = async () => {
    try {
      await copyText(copyTextValue);
      setDepotCopied(true);
      setTimeout(() => setDepotCopied(false), 2000);
    } catch (error) {
      console.error("Insertion log copy failed:", error);
    }
  };

  const handleClear = () => {
    if (confirmClear) {
      onClearDepot(depot);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: `${accent}55`,
        background: isWest
          ? "linear-gradient(180deg,rgba(35,18,77,0.58),rgba(6,24,39,0.94))"
          : "linear-gradient(180deg,rgba(8,73,86,0.48),rgba(6,24,39,0.94))",
        boxShadow: `0 0 24px ${accent}18, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div className="border-b px-3 py-2.5" style={{ borderColor: `${accent}3a`, background: `linear-gradient(90deg, ${accent}17, transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}88` }} />
          <h3 className="text-[12px] font-black uppercase tracking-wide text-white">{label} Depot</h3>
          <span className="rounded-md border px-1.5 py-0.5 text-[9px] font-black" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}1c`, color: accent }}>
            {lines.length} {lines.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-start gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={lines.length === 0}
            className="flex min-w-[82px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
          >
            {depotCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {depotCopied ? "Copied" : "Copy"}
          </button>

          {lines.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02]"
              style={{
                borderColor: confirmClear ? "rgba(248,113,113,0.85)" : `${accent}55`,
                color: confirmClear ? "#fecaca" : accent,
                backgroundColor: confirmClear ? "rgba(127,29,29,0.36)" : `${accent}14`,
              }}
            >
              <Trash2 className="h-3 w-3" />
              {confirmClear ? "Confirm?" : "Clear"}
            </button>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="flex min-h-[92px] items-center justify-center px-3 text-center text-[11px] font-semibold text-[#7eb8e0]">
          No entries
        </div>
      ) : (
        <div className="bg-[#041727]">
          {normalLines.length > 0 && (
            <div>
              <div className="border-b border-[#1d4869] bg-[#061827] px-3 py-2">
                <p className="font-mono text-[11px] font-bold leading-[1.25] text-[#f4f8ff]">{normalHeaderLines[0]}</p>
                <p className="font-mono text-[11px] leading-[1.25] text-[#8ea8c0]">{normalHeaderLines[1]}</p>
              </div>
              {normalLines.map((entry) => <LogEntryRow key={entry.key} entry={entry} onRemove={onRemove} />)}
            </div>
          )}

          {sweepingLines.length > 0 && (
            <div className={normalLines.length > 0 ? "border-t border-[#1d4869]" : ""}>
              <div className="border-b border-[#1d4869] bg-[#061827] px-3 py-2">
                <p className="font-mono text-[11px] font-bold leading-[1.25] text-[#f4f8ff]">{sweepingHeader}</p>
              </div>
              {sweepingLines.map((entry) => <LogEntryRow key={entry.key} entry={entry} onRemove={onRemove} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function InsertionLogOutput({ insertionLog, onRemove, onClearDepot }) {
  const westLines = insertionLog.filter((line) => line.depot === "west");
  const eastLines = insertionLog.filter((line) => line.depot === "east");
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    const westText = buildInsertionCopyText(westLines, "West");
    const eastText = buildInsertionCopyText(eastLines, "East");

    try {
      await copyText([westText, eastText].filter(Boolean).join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Insertion log copy all failed:", error);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#2b4f6b] bg-[#071e33] shadow-[0_14px_30px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="border-b border-[#1a3a56] px-4 py-3" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/25 text-blue-300 shadow-[0_0_14px_rgba(59,130,246,0.22)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="5 12 12 5 19 12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>
          </div>
          <div>
            <h2 className="text-[17px] font-black leading-tight text-white">Insertion Log Output</h2>
            <p className="mt-0.5 text-[11px] font-medium text-[#58a6ff]">
              {insertionLog.length} {insertionLog.length === 1 ? "entry" : "entries"}
            </p>
          </div>
        </div>

        {insertionLog.length > 0 && (
          <div className="mt-2 flex items-center justify-start">
            <button
              type="button"
              onClick={copyAll}
              className="flex min-w-[82px] items-center justify-center gap-1 rounded-lg border border-blue-400/55 bg-blue-400/10 px-2 py-1 text-[10px] font-bold text-blue-200 transition-all hover:scale-[1.02]"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy All"}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 p-4">
        <DepotSection label="West" lines={westLines} color="west" depot="west" onRemove={onRemove} onClearDepot={onClearDepot} />
        <DepotSection label="East" lines={eastLines} color="east" depot="east" onRemove={onRemove} onClearDepot={onClearDepot} />
      </div>
    </section>
  );
}
