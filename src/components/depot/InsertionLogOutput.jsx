import { useState } from "react";

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
  const tidsWithValue = lines.filter((line) => line.tid !== null && line.tid !== undefined && String(line.tid).trim() !== "");
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

async function copyText(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function DocumentLogIcon() {
  return (
    <div className="insertion-clean-title-icon" aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="14" y2="17" />
      </svg>
    </div>
  );
}

function CopyIcon({ copied = false }) {
  return copied ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function CopyButton({ text, label, disabled }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled || !text) return;

    try {
      const success = await copyText(text);
      if (!success) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Insertion log copy failed:", error);
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className={copied ? "insertion-clean-action insertion-clean-action-copied" : "insertion-clean-action"}
      title={label}
    >
      <CopyIcon copied={copied} />
      {copied ? "Copied" : label}
    </button>
  );
}

function ClearDepotButton({ depotLabel, disabled, onClear }) {
  const [confirming, setConfirming] = useState(false);

  const handleClear = () => {
    if (disabled || !onClear) return;

    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 2200);
      return;
    }

    onClear();
    setConfirming(false);
  };

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={disabled}
      className={confirming ? "insertion-clean-action insertion-clean-action-danger" : "insertion-clean-action"}
      title={`Clear ${depotLabel} Depot log`}
    >
      <ClearIcon />
      {confirming ? "Confirm" : "Clear"}
    </button>
  );
}

function SectionTextBlock({ title, text, emptyText }) {
  if (!text) {
    return (
      <div className="insertion-clean-empty-section">
        <div className="insertion-clean-section-title">{title}</div>
        <div className="insertion-clean-empty-text">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="insertion-clean-text-section">
      <div className="insertion-clean-section-title">{title}</div>
      <pre className="insertion-clean-pre">{text}</pre>
    </div>
  );
}

function DepotLogCard({ depotLabel, lines = [], depot, onClearDepot }) {
  const normalLines = lines.filter((line) => !isSweepingLine(line));
  const sweepingLines = lines.filter(isSweepingLine);
  const normalText = buildNormalInsertionCopyText(normalLines, depotLabel);
  const sweepingText = buildSweepingCopyText(sweepingLines, depotLabel);
  const hasEntries = lines.length > 0;
  const dotColor = depotLabel.toLowerCase() === "west" ? "#d946ef" : "#22d3ee";

  return (
    <div className="insertion-clean-card">
      <div className="insertion-clean-card-header">
        <div className="insertion-clean-card-title-wrap">
          <span
            className="insertion-clean-dot"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 10px ${dotColor}` }}
            aria-hidden="true"
          />
          <div className="insertion-clean-card-title">
            {depotLabel.toUpperCase()} DEPOT INSERTION LOG
          </div>
        </div>

        <div className="insertion-clean-actions">
          <CopyButton text={sweepingText} label="Sweep Only" disabled={!sweepingLines.length} />
          <CopyButton text={normalText} label="Insertion Only" disabled={!normalLines.length} />
          <ClearDepotButton
            depotLabel={depotLabel}
            disabled={!hasEntries}
            onClear={() => onClearDepot?.(depot)}
          />
        </div>
      </div>

      <div className="insertion-clean-card-body">
        {hasEntries ? (
          <>
            <SectionTextBlock title="Insertion" text={normalText} emptyText="No insertion entries." />
            <SectionTextBlock title="Sweep" text={sweepingText} emptyText="No Sweep entries." />
          </>
        ) : (
          <div className="insertion-clean-empty-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>No entries for {depotLabel} Depot</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InsertionLogOutput({ insertionLog, onClearDepot }) {
  const safeInsertionLog = Array.isArray(insertionLog) ? insertionLog : [];
  const westLines = safeInsertionLog.filter((line) => line.depot === "west");
  const eastLines = safeInsertionLog.filter((line) => line.depot === "east");

  const scrollMainPageFromLog = (event) => {
    if (event.ctrlKey || event.metaKey) return;

    const deltaY = event.deltaY || 0;
    const deltaX = event.deltaX || 0;
    if (!deltaY && !deltaX) return;

    const target = event.currentTarget;
    const canScrollInside = target.scrollHeight > target.clientHeight + 1;
    const movingDown = deltaY > 0;
    const atTop = target.scrollTop <= 0;
    const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1;

    if (canScrollInside && !((movingDown && atBottom) || (!movingDown && atTop))) return;

    event.preventDefault();
    event.stopPropagation();

    let parent = target.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY || "");
      const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX || "");
      const hasVerticalRoom = parent.scrollHeight > parent.clientHeight + 1;
      const hasHorizontalRoom = parent.scrollWidth > parent.clientWidth + 1;

      if ((canScrollY && hasVerticalRoom) || (canScrollX && hasHorizontalRoom)) {
        parent.scrollTop += deltaY;
        parent.scrollLeft += deltaX;
        return;
      }

      parent = parent.parentElement;
    }

    const pageScroller = document.scrollingElement || document.documentElement || document.body;
    if (pageScroller) {
      pageScroller.scrollTop += deltaY;
      pageScroller.scrollLeft += deltaX;
    }
  };

  return (
    <section className="insertion-clean-shell" onWheel={scrollMainPageFromLog}>
      <style>{`
        .insertion-clean-shell {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 12px;
          border: 1px solid #2b4f6b;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(12,46,74,0.58) 0%, rgba(7,24,40,0.98) 100%);
          box-shadow: 0 16px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04);
          scrollbar-width: thin;
          scrollbar-color: #3c7297 #061523;
        }

        .insertion-clean-shell::-webkit-scrollbar { width: 8px; height: 8px; }
        .insertion-clean-shell::-webkit-scrollbar-track { background: #061523; }
        .insertion-clean-shell::-webkit-scrollbar-thumb { background: #3c7297; border-radius: 999px; }

        .insertion-clean-title-row {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .insertion-clean-title-icon {
          width: 32px;
          height: 32px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #2b4f6b;
          border-radius: 999px;
          background: #10263b;
          box-shadow: 0 2px 8px rgba(0,0,0,0.20);
        }

        .insertion-clean-title {
          color: #ffffff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .insertion-clean-subtitle {
          color: #58a6ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          font-weight: 500;
        }

        .insertion-clean-cards {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .insertion-clean-card {
          overflow: hidden;
          border: 1px solid #1a3a56;
          border-radius: 10px;
          background: #061827;
        }

        .insertion-clean-card-header {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: 7px;
          padding: 6px 10px;
          background: linear-gradient(90deg, #0d4d75 0%, #0b5f88 55%, #0d4d75 100%);
        }

        .insertion-clean-card-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .insertion-clean-dot {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 999px;
        }

        .insertion-clean-card-title {
          color: #ffffff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }

        .insertion-clean-actions {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: 4px;
        }

        .insertion-clean-action {
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 0 7px;
          border: 1px solid rgba(74,138,181,0.55);
          border-radius: 6px;
          background: rgba(15,45,74,0.75);
          color: #b5d9ee;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 9px;
          line-height: 1;
          font-weight: 850;
          white-space: nowrap;
          cursor: pointer;
          transition: transform 120ms ease, border-color 120ms ease, color 120ms ease, background 120ms ease;
        }

        .insertion-clean-action:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(125,190,232,0.72);
          color: #ffffff;
          background: rgba(19,63,100,0.88);
        }

        .insertion-clean-action:disabled {
          opacity: 0.42;
          cursor: not-allowed;
        }

        .insertion-clean-action-copied {
          border-color: rgba(34,197,94,0.48);
          background: rgba(34,197,94,0.18);
          color: #86efac;
          box-shadow: 0 0 12px rgba(34,197,94,0.16);
        }

        .insertion-clean-action-danger {
          border-color: rgba(248,113,113,0.72);
          background: rgba(127,29,29,0.90);
          color: #fecaca;
        }

        .insertion-clean-card-body {
          min-height: 76px;
          padding: 8px 10px 9px;
          border-top: 1px solid #1a3a56;
          background: #061321;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        .insertion-clean-text-section + .insertion-clean-text-section,
        .insertion-clean-text-section + .insertion-clean-empty-section,
        .insertion-clean-empty-section + .insertion-clean-text-section,
        .insertion-clean-empty-section + .insertion-clean-empty-section {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(43,79,107,0.66);
        }

        .insertion-clean-section-title {
          margin-bottom: 4px;
          color: #69d2ff;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }

        .insertion-clean-pre {
          margin: 0;
          overflow: visible;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          color: #d8e7f7;
          font-family: inherit;
          font-size: 10px;
          line-height: 1.42;
          font-weight: 500;
        }

        .insertion-clean-empty-section {
          color: #668da9;
        }

        .insertion-clean-empty-text {
          font-size: 10px;
          line-height: 1.4;
          font-style: italic;
        }

        .insertion-clean-empty-card {
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: #668da9;
          font-size: 10px;
          font-weight: 700;
        }

        @media (max-width: 700px) {
          .insertion-clean-shell { padding: 8px; }
          .insertion-clean-card-header { padding: 7px 8px; }
          .insertion-clean-card-body { padding: 8px; }
          .insertion-clean-title { font-size: 12px; }
          .insertion-clean-action { height: 23px; padding: 0 6px; font-size: 8px; }
        }
      `}</style>

      <div className="insertion-clean-title-row">
        <DocumentLogIcon />
        <div>
          <div className="insertion-clean-title">Insertion Log Output</div>
          <div className="insertion-clean-subtitle">Auto-generated from Insertion</div>
        </div>
      </div>

      <div className="insertion-clean-cards">
        <DepotLogCard
          depotLabel="West"
          lines={westLines}
          depot="west"
          onClearDepot={onClearDepot}
        />
        <DepotLogCard
          depotLabel="East"
          lines={eastLines}
          depot="east"
          onClearDepot={onClearDepot}
        />
      </div>
    </section>
  );
}
