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

function DepotSection({ label, lines, color, depot, onClearDepot }) {
  const [copiedType, setCopiedType] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const normalLines = lines.filter((line) => !isSweepingLine(line));
  const sweepingLines = lines.filter(isSweepingLine);
  const normalCopyText = buildNormalInsertionCopyText(normalLines, label);
  const sweepingCopyText = buildSweepingCopyText(sweepingLines, label);
  const copyTextValue = buildInsertionCopyText(lines, label);
  const isWest = color === "west";
  const accent = isWest ? "#a78bfa" : "#67e8f9";

  const handleCopy = async (type) => {
    const value = type === "sweep" ? sweepingCopyText : normalCopyText;
    if (!value) return;

    try {
      await copyText(value);
      setCopiedType(type);
      setTimeout(() => setCopiedType(""), 2000);
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
            onClick={() => handleCopy("sweep")}
            disabled={sweepingLines.length === 0}
            className="flex min-w-[88px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
          >
            {copiedType === "sweep" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copiedType === "sweep" ? "Copied" : "Sweep Only"}
          </button>

          <button
            type="button"
            onClick={() => handleCopy("insertion")}
            disabled={normalLines.length === 0}
            className="flex min-w-[98px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
          >
            {copiedType === "insertion" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copiedType === "insertion" ? "Copied" : "Insertion Only"}
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

      <div className="min-h-[92px] border-t border-[#1a3a56] bg-[#061321] px-3 py-2">
        {lines.length === 0 ? (
          <div className="flex min-h-[76px] items-center justify-center text-center text-[11px] font-semibold text-[#7eb8e0]">
            No entries
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] font-normal leading-[1.4] text-[#d8e7f7]">
            {copyTextValue}
          </pre>
        )}
      </div>
    </section>
  );
}

export default function InsertionLogOutput({ insertionLog, onClearDepot }) {
  const westLines = insertionLog.filter((line) => line.depot === "west");
  const eastLines = insertionLog.filter((line) => line.depot === "east");
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

      </div>

      <div className="grid gap-3 p-4">
        <DepotSection label="West" lines={westLines} color="west" depot="west" onClearDepot={onClearDepot} />
        <DepotSection label="East" lines={eastLines} color="east" depot="east" onClearDepot={onClearDepot} />
      </div>
    </section>
  );
}
