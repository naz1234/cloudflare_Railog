import { useEffect, useState } from "react";

const PST_LOG_STYLE_STORAGE_KEY = "pstLogOutputStyle_v1";
const ELOG_1 = "elog1";
const ELOG_2 = "elog2";

function normalizeLogType(entry = {}) {
  return (entry?.type || entry?.logType || entry?.category || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isPSTEntry(entry = {}) {
  const normalizedType = normalizeLogType(entry);
  const text = (entry?.text || "").toString();
  return normalizedType === "pst" || /\bPST\b/i.test(text);
}

function isPrepEntry(entry = {}) {
  const normalizedType = normalizeLogType(entry);
  const text = (entry?.text || "").toString();
  return (
    normalizedType === "prep" ||
    normalizedType === "trainprep" ||
    normalizedType === "trainpreparation" ||
    /train\s+prep(?:aration)?/i.test(text)
  );
}

function formatTrainList(trainKeys = []) {
  if (trainKeys.length === 0) return "";
  if (trainKeys.length === 1) return trainKeys[0];
  return `${trainKeys.slice(0, -1).join(", ")} and ${trainKeys[trainKeys.length - 1]}`;
}

function normalizeTrainKey(value = "") {
  const text = value.toString().trim().toUpperCase().replace(/\s+/g, "");
  const match = text.match(/^T?(\d+)$/);
  if (!match) return text;
  return `T${match[1].padStart(2, "0")}`;
}

function getLogDisplayTime(entry = {}) {
  const directTime = entry.endTime || entry.time || entry.startTime;
  if (directTime) return directTime;
  const match = (entry.text || "").match(/(\d{1,2}:\d{2})\s*hrs/i);
  return match ? match[1].padStart(5, "0") : "";
}

function getPrepLocation(entry = {}) {
  const directRoad = (entry.road || "").toString().trim();
  const textMatch = (entry.text || "").match(/completed\s+at\s+([A-Z]{2}[–-][A-Z0-9]+)/i);
  const rawLocation = directRoad || (textMatch ? textMatch[1] : "");
  if (!rawLocation) return "";
  return rawLocation
    .replace(/-/g, "–")
    .replace(/^(WD|ED)–/i, (_, depot) => `${depot.toUpperCase()}–`);
}

function getPrepTAName(entry = {}) {
  const explicitName = (entry.taName || "").toString().trim();
  const textMatch = (entry.text || "").match(/(?:Performed\s+by|by)\s+TA\s+(.+?)\.?$/i);
  const rawName = explicitName || (textMatch ? textMatch[1] : "");
  const cleanName = rawName.replace(/^TA\b\s*/i, "").replace(/\.$/, "").trim();
  return cleanName ? `TA ${cleanName}` : "";
}

function getPrepTrainKey(entry = {}) {
  if (entry.trainKey) return normalizeTrainKey(entry.trainKey);
  const match = (entry.text || "").match(/\bT\d{1,2}\b/i);
  return match ? normalizeTrainKey(match[0]) : "";
}

function buildGroupedPrepLogLines(prepLines = []) {
  const groups = [];
  const groupMap = new Map();

  prepLines.forEach((entry) => {
    const time = getLogDisplayTime(entry);
    const location = getPrepLocation(entry);
    const taName = getPrepTAName(entry);
    const trainKey = getPrepTrainKey(entry);
    const groupKey = `${time}||${location}||${taName}`;

    if (!groupMap.has(groupKey)) {
      const group = { key: groupKey, time, location, taName, trainKeys: [], entries: [] };
      groupMap.set(groupKey, group);
      groups.push(group);
    }

    const group = groupMap.get(groupKey);
    if (trainKey && !group.trainKeys.includes(trainKey)) group.trainKeys.push(trainKey);
    group.entries.push(entry);
  });

  return groups.map((group) => {
    const trainList = formatTrainList(group.trainKeys);
    const locationText = group.location ? ` at ${group.location}` : "";
    const taText = group.taName ? ` by ${group.taName}` : "";
    return {
      ...group,
      text: `${group.time} hrs – ${trainList} completed${locationText}${taText}.`,
    };
  });
}

function getPSTStartTime(entry = {}) {
  const directTime = (entry.startTime || entry.time || "").toString().trim();
  if (directTime) return directTime;
  const textMatch = (entry.text || "").match(/^(\d{1,2}:\d{2})\s*hrs/i);
  return textMatch ? textMatch[1].padStart(5, "0") : "";
}

function getPSTEndTime(entry = {}) {
  const directTime = (entry.endTime || "").toString().trim();
  if (directTime) return directTime;
  const textMatch = (entry.text || "").match(/Completed\s+at\s+(\d{1,2}:\d{2})\s*hrs/i);
  return textMatch ? textMatch[1].padStart(5, "0") : getPSTStartTime(entry);
}

function getPSTLocation(entry = {}) {
  const directRoad = (entry.road || "").toString().trim();
  const textMatch = (entry.text || "").match(/PST\s+commenced\s+at\s+([A-Z]{2}[–-][A-Z0-9]+)\s+for/i);
  const rawLocation = directRoad || (textMatch ? textMatch[1] : "");
  if (!rawLocation) return "";
  return rawLocation
    .replace(/-/g, "–")
    .replace(/^(WD|ED)–/i, (_, depot) => `${depot.toUpperCase()}–`);
}

function getPSTTrainKey(entry = {}) {
  if (entry.trainKey) return normalizeTrainKey(entry.trainKey);
  const textMatch = (entry.text || "").match(/\bT\d{1,2}\b/i);
  return textMatch ? normalizeTrainKey(textMatch[0]) : "";
}

function getPSTAlarmText(entry = {}) {
  const status = (entry.alarmStatus || "").toString().trim().toLowerCase();
  if (status === "alarm") return "Alarm reported.";

  const text = (entry.text || "").toString();
  if (/No\s+alarm\s+reported\.?/i.test(text)) return "";
  if (/Alarm\s+reported\.?/i.test(text)) return "Alarm reported.";
  return "";
}

function buildGroupedPSTLogLines(pstLines = []) {
  const groups = [];
  const groupMap = new Map();

  pstLines.forEach((entry) => {
    const startTime = getPSTStartTime(entry);
    const endTime = getPSTEndTime(entry);
    const location = getPSTLocation(entry);
    const alarmText = getPSTAlarmText(entry);
    const trainKey = getPSTTrainKey(entry);
    const groupKey = `${startTime}||${location}||${endTime}||${alarmText}`;

    if (!groupMap.has(groupKey)) {
      const group = {
        key: groupKey,
        startTime,
        endTime,
        location,
        alarmText,
        trainKeys: [],
        entries: [],
      };
      groupMap.set(groupKey, group);
      groups.push(group);
    }

    const group = groupMap.get(groupKey);
    if (trainKey && !group.trainKeys.includes(trainKey)) group.trainKeys.push(trainKey);
    group.entries.push(entry);
  });

  return groups.map((group) => {
    const trainList = formatTrainList(group.trainKeys);
    const locationText = group.location ? ` at ${group.location}` : "";
    const completedText = group.endTime ? ` and completed at ${group.endTime} hrs` : "";
    const alarmText = group.alarmText ? ` ${group.alarmText}` : "";

    return {
      ...group,
      time: group.startTime,
      text: `${group.startTime} hrs – ${trainList} PST started${locationText}${completedText}.${alarmText}`,
    };
  });
}

function getPSTSummaryEndTime(pstLines = []) {
  if (pstLines.length === 0) return "";
  const lastEntry = pstLines[pstLines.length - 1];
  return getPSTEndTime(lastEntry) || getPSTStartTime(lastEntry);
}

function getUniqueTrainKeys(lines = [], extractor) {
  const keys = [];
  lines.forEach((line) => {
    const trainKey = extractor(line);
    if (trainKey && !keys.includes(trainKey)) keys.push(trainKey);
  });
  return keys;
}

function formatTrainCount(totalCount = 0) {
  return `${totalCount} train${totalCount !== 1 ? "s" : ""}`;
}

function buildPSTNoteBlock(westTotal = 0, eastTotal = 0) {
  return [
    "Note: DC checked the train status and confirmed that the HVAC was enabled, Maximum Speed was set to “None,” and CC was localized and operational.",
    `DC checked and confirmed that PST was completed successfully for ${formatTrainCount(westTotal)} at West Depot.`,
    `DC cross-checked and confirmed that PST was completed successfully for ${formatTrainCount(eastTotal)} at East Depot.`,
  ].join("\n");
}

function getPSTSectionText(pstLines = [], depotLabel = "", westTotal = 0, eastTotal = 0) {
  if (!pstLines.length) return "";
  const groupedLines = buildGroupedPSTLogLines(pstLines);
  return [
    `PST at ${depotLabel} Depot: A total of ${formatTrainCount(pstLines.length)} completed PST from ${getPSTStartTime(pstLines[0])} to ${getPSTSummaryEndTime(pstLines)} hrs.`,
    "",
    ...groupedLines.map((group) => group.text),
    "",
    buildPSTNoteBlock(westTotal, eastTotal),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .trim();
}

function getPrepSectionText(prepLines = [], depotLabel = "") {
  if (!prepLines.length) return "";
  const groupedLines = buildGroupedPrepLogLines(prepLines);
  const trainList = getUniqueTrainKeys(prepLines, getPrepTrainKey).join(", ");
  return [
    `Train Preparation at ${depotLabel} Depot: Total ${prepLines.length} train${prepLines.length !== 1 ? "s" : ""} completed from ${getLogDisplayTime(prepLines[0])} to ${getLogDisplayTime(prepLines[prepLines.length - 1])} hrs.`,
    trainList ? `Train: ${trainList}` : "",
    "",
    ...groupedLines.map((group) => group.text),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .trim();
}

function formatELogTime(value = "") {
  const digits = value.toString().replace(/\D/g, "").slice(0, 4);
  if (!digits) return "--:--H";

  const paddedTime = digits.padStart(4, "0");
  return `${paddedTime.slice(0, 2)}:${paddedTime.slice(2)}H`;
}

function getELogLocationTitle(location = "") {
  const normalized = location.toString().trim().toUpperCase().replace(/[–—]/g, "-");
  const stablingMatch = normalized.match(/(?:WD|ED)?-?ST(?:ABLING)?\s*0*(\d+)/i);
  if (stablingMatch) return `STABLING ${Number(stablingMatch[1])}`;

  const transferTrackMatch = normalized.match(/(?:WD|ED)?-?(?:TRANSFER\s*TRACK|TT)\s*0*(\d+)/i);
  if (transferTrackMatch) return `TRANSFER TRACK ${Number(transferTrackMatch[1])}`;

  const tempMatch = normalized.match(/(?:WD|ED)?-?TEMP(?:ORARY)?\s*0*(\d+)/i);
  if (tempMatch) return `TEMPORARY ${Number(tempMatch[1])}`;

  return normalized.replace(/^(WD|ED)-/, "").replace(/-/g, " ") || "LOCATION NOT SET";
}

function buildELog2Text(pstLines = [], depotLabel = "") {
  if (!pstLines.length) return "";

  const locationGroups = [];
  const locationMap = new Map();

  pstLines.forEach((entry) => {
    const location = getPSTLocation(entry);
    const title = getELogLocationTitle(location);

    if (!locationMap.has(title)) {
      const group = { title, entries: [] };
      locationMap.set(title, group);
      locationGroups.push(group);
    }

    locationMap.get(title).entries.push(entry);
  });

  const sections = locationGroups.map((group) => {
    const lines = group.entries.map((entry) => {
      const startTime = formatELogTime(getPSTStartTime(entry));
      const endTime = formatELogTime(getPSTEndTime(entry));
      const trainKey = getPSTTrainKey(entry) || "T--";
      return `${startTime} – ${trainKey} started and completed at ${endTime}.`;
    });

    return [group.title, ...lines].join("\n");
  });

  const totalTrains = getUniqueTrainKeys(pstLines, getPSTTrainKey).length;

  const noteBlock = [
    'Note: DC checked train status - HVAC enabled, Maximum Speed "None", CC - localized/operational.',
    `DC's checked PST completed successfully for ${depotLabel || "the selected"} Depot trains. Total trains ${totalTrains}.`,
  ].join("\n");

  return [...sections, noteBlock].join("\n\n");
}

function DocumentLogIcon() {
  return (
    <div className="pst-clean-title-icon" aria-hidden="true">
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

const PST_ACTION_TOOLTIP_ACCENTS = {
  pst: "#34d399",
  prep: "#60a5fa",
  clear: "#f87171",
  elog: "#22d3ee",
};

function PSTActionTooltip({ message, variant = "elog", placement = "top" }) {
  if (!message) return null;

  const accentColor = PST_ACTION_TOOLTIP_ACCENTS[variant] || PST_ACTION_TOOLTIP_ACCENTS.elog;
  const isTopPlacement = placement === "top";
  const verticalClass = isTopPlacement
    ? "bottom-[calc(100%+6px)]"
    : "top-[calc(100%+6px)]";
  const originClass = isTopPlacement ? "origin-bottom" : "origin-top";
  const arrowClass = isTopPlacement
    ? "-bottom-1 border-b border-r"
    : "-top-1 border-l border-t";

  return (
    <span className={`pointer-events-none absolute left-1/2 z-[160] -translate-x-1/2 ${verticalClass}`}>
      <span
        role="tooltip"
        className={`pst-action-tooltip-bubble relative block w-max max-w-[280px] ${originClass} whitespace-normal rounded-lg border bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-slate-900 shadow-xl opacity-0 scale-95 transition-all duration-150`}
        style={{ borderColor: accentColor }}
      >
        <span
          className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white ${arrowClass}`}
          style={{ borderColor: accentColor }}
        />
        <span className="relative z-10">{message}</span>
      </span>
    </span>
  );
}

function CopyButton({ text, label, disabled, variant = "pst", tooltip }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled || !text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const tooltipMessage = tooltip || label;

  return (
    <span className="pst-action-tooltip-trigger relative inline-flex overflow-visible">
      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled}
        className={`pst-clean-action pst-clean-action-${variant}${copied ? " pst-clean-action-copied" : ""}`}
        aria-label={tooltipMessage}
      >
        <CopyIcon copied={copied} />
        {copied ? "Copied" : label}
      </button>
      <PSTActionTooltip message={tooltipMessage} variant={variant} />
    </span>
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

  const tooltipMessage = `Clear all ${depotLabel} Depot PST and Train Prep logs`;

  return (
    <span className="pst-action-tooltip-trigger relative inline-flex overflow-visible">
      <button
        type="button"
        onClick={handleClear}
        disabled={disabled}
        className={`pst-clean-action pst-clean-action-clear${confirming ? " pst-clean-action-danger" : ""}`}
        aria-label={tooltipMessage}
      >
        <ClearIcon />
        {confirming ? "Confirm" : "Clear"}
      </button>
      <PSTActionTooltip message={tooltipMessage} variant="clear" />
    </span>
  );
}

function SectionTextBlock({ title, text, emptyText, variant = "pst" }) {
  const sectionClassName = `pst-clean-section pst-clean-section-${variant}`;

  if (!text) {
    return (
      <div className={`pst-clean-empty-section ${sectionClassName}`}>
        <div className="pst-clean-section-title">{title}</div>
        <div className="pst-clean-empty-text">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className={`pst-clean-text-section ${sectionClassName}`}>
      <div className="pst-clean-section-title">{title}</div>
      <pre className="pst-clean-pre">{text}</pre>
    </div>
  );
}

function DepotLogCard({ depotLabel, lines = [], onClearDepot, logStyle = ELOG_1, westPSTTotal = 0, eastPSTTotal = 0 }) {
  const pstLines = lines.filter(isPSTEntry);
  const prepLines = lines.filter(isPrepEntry);
  const pstText = logStyle === ELOG_2
    ? buildELog2Text(pstLines, depotLabel)
    : getPSTSectionText(pstLines, depotLabel, westPSTTotal, eastPSTTotal);
  const prepText = getPrepSectionText(prepLines, depotLabel);
  const hasEntries = lines.length > 0;
  const dotColor = depotLabel.toLowerCase() === "west" ? "#d946ef" : "#22d3ee";
  const cardClassName = logStyle === ELOG_2 ? "pst-clean-card pst-elog2-card" : "pst-clean-card";
  const headerClassName = logStyle === ELOG_2
    ? "pst-clean-card-header pst-elog2-card-header"
    : "pst-clean-card-header";

  return (
    <div className={cardClassName}>
      <div className={headerClassName}>
        <div className="pst-clean-card-title-wrap">
          <span
            className="pst-clean-dot"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 10px ${dotColor}` }}
            aria-hidden="true"
          />
          <div className="pst-clean-card-title">
            {depotLabel.toUpperCase()} DEPOT PST / TRAIN PREP LOG
          </div>
        </div>

        <div className="pst-clean-actions">
          <CopyButton text={pstText} label="Copy PST" disabled={!pstLines.length} variant="pst" tooltip={`Copy ${depotLabel} Depot PST log`} />
          <CopyButton text={prepText} label="Copy Train Prep" disabled={!prepLines.length} variant="prep" tooltip={`Copy ${depotLabel} Depot Train Prep log`} />
          <ClearDepotButton depotLabel={depotLabel} disabled={!hasEntries} onClear={onClearDepot} />
        </div>
      </div>

      <div className="pst-clean-card-body">
        {hasEntries ? (
          <>
            <SectionTextBlock title="PST" text={pstText} emptyText="No PST entries." variant="pst" />
            <SectionTextBlock title="Train Prep" text={prepText} emptyText="No Train Prep entries." variant="prep" />
          </>
        ) : (
          <div className="pst-clean-empty-card">
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

function ELogStyleButton({ active, children, onClick, tooltip }) {
  return (
    <span className="pst-action-tooltip-trigger relative inline-flex overflow-visible">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={tooltip}
        className={active ? "pst-elog-style-button pst-elog-style-button-active" : "pst-elog-style-button"}
      >
        {children}
      </button>
      <PSTActionTooltip message={tooltip} variant="elog" placement="bottom" />
    </span>
  );
}

export default function PSTLogOutput({ logLines, onClearDepot }) {
  const safeLogLines = Array.isArray(logLines) ? logLines : [];
  const westLines = safeLogLines.filter((line) => line.depot === "west");
  const eastLines = safeLogLines.filter((line) => line.depot === "east");
  const westPSTTotal = westLines.filter(isPSTEntry).length;
  const eastPSTTotal = eastLines.filter(isPSTEntry).length;
  const [logStyle, setLogStyle] = useState(() => {
    try {
      return localStorage.getItem(PST_LOG_STYLE_STORAGE_KEY) === ELOG_2 ? ELOG_2 : ELOG_1;
    } catch {
      return ELOG_1;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PST_LOG_STYLE_STORAGE_KEY, logStyle);
    } catch {
      // Local storage may be unavailable in private browsing. The selector still works for this session.
    }
  }, [logStyle]);

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
    <section className="pst-clean-shell" onWheel={scrollMainPageFromLog}>
      <style>{`
        .pst-clean-shell {
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

        .pst-clean-shell::-webkit-scrollbar { width: 8px; height: 8px; }
        .pst-clean-shell::-webkit-scrollbar-track { background: #061523; }
        .pst-clean-shell::-webkit-scrollbar-thumb { background: #3c7297; border-radius: 999px; }

        .pst-clean-title-row {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }

        .pst-clean-title-icon {
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

        .pst-clean-title-copy {
          min-width: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .pst-clean-heading-line {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pst-clean-title {
          color: #ffffff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .pst-clean-subtitle {
          color: #58a6ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          font-weight: 500;
        }

        .pst-elog-style-picker {
          margin-left: 0;
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 3px;
          padding: 3px;
          border: 1px solid #2b4f6b;
          border-radius: 8px;
          background: rgba(4, 18, 30, 0.84);
        }

        .pst-elog-style-button {
          height: 26px;
          min-width: 62px;
          padding: 0 10px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: #6f9ab8;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 11px;
          line-height: 1;
          font-weight: 400;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: 120ms ease;
        }

        .pst-elog-style-button:hover {
          color: #d8efff;
          background: rgba(26, 70, 104, 0.46);
        }

        .pst-elog-style-button-active {
          border-color: #4f8ef7;
          background: linear-gradient(180deg, rgba(48, 112, 184, 0.88), rgba(25, 72, 126, 0.92));
          color: #ffffff;
          box-shadow: 0 0 12px rgba(79, 142, 247, 0.20);
        }

        .pst-clean-cards {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pst-clean-card {
          position: relative;
          z-index: 1;
          overflow: visible;
          border: 1px solid #1a3a56;
          border-radius: 10px;
          background: #061827;
        }

        .pst-clean-card:hover,
        .pst-clean-card:focus-within {
          z-index: 40;
        }

        .pst-clean-card-header {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: 7px;
          padding: 6px 10px;
          background: linear-gradient(90deg, #0d4d75 0%, #0b5f88 55%, #0d4d75 100%);
          border-radius: 9px 9px 0 0;
        }

        .pst-elog2-card {
          border-color: rgba(251, 191, 36, 0.35);
        }

        .pst-elog2-card-header {
          background: linear-gradient(90deg, #5f4308 0%, #7a580c 55%, #5f4308 100%);
        }

        .pst-clean-card-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .pst-clean-dot {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 999px;
        }

        .pst-clean-card-title {
          color: #ffffff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }

        .pst-clean-actions {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: 4px;
        }

        .pst-action-tooltip-trigger {
          position: relative;
          z-index: 30;
          display: inline-flex;
          overflow: visible;
        }

        .pst-action-tooltip-bubble {
          max-width: min(280px, calc(100vw - 32px));
        }

        .pst-action-tooltip-trigger:hover .pst-action-tooltip-bubble,
        .pst-action-tooltip-trigger:focus-visible .pst-action-tooltip-bubble,
        .pst-action-tooltip-trigger:has(:focus-visible) .pst-action-tooltip-bubble {
          opacity: 1;
          transform: scale(1);
        }

        .pst-clean-action {
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

        .pst-clean-action:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(125,190,232,0.72);
          color: #ffffff;
          background: rgba(19,63,100,0.88);
        }

        .pst-clean-action-pst {
          border-color: rgba(52,211,153,0.72);
          background: rgba(6,78,59,0.72);
          color: #a7f3d0;
          box-shadow: 0 0 10px rgba(16,185,129,0.14);
        }

        .pst-clean-action-pst:hover:not(:disabled) {
          border-color: rgba(110,231,183,0.92);
          background: rgba(5,100,75,0.90);
          color: #ecfdf5;
        }

        .pst-clean-action-prep {
          border-color: rgba(96,165,250,0.74);
          background: rgba(30,64,175,0.58);
          color: #bfdbfe;
          box-shadow: 0 0 10px rgba(59,130,246,0.14);
        }

        .pst-clean-action-prep:hover:not(:disabled) {
          border-color: rgba(147,197,253,0.94);
          background: rgba(30,82,185,0.88);
          color: #eff6ff;
        }

        .pst-clean-action-clear {
          border-color: rgba(248,113,113,0.74);
          background: rgba(127,29,29,0.62);
          color: #fecaca;
          box-shadow: 0 0 10px rgba(239,68,68,0.12);
        }

        .pst-clean-action-clear:hover:not(:disabled) {
          border-color: rgba(252,165,165,0.94);
          background: rgba(153,27,27,0.88);
          color: #fff1f2;
        }

        .pst-clean-action:disabled {
          opacity: 0.42;
          cursor: not-allowed;
        }

        .pst-clean-action-copied {
          border-color: rgba(34,197,94,0.48);
          background: rgba(34,197,94,0.18);
          color: #86efac;
          box-shadow: 0 0 12px rgba(34,197,94,0.16);
        }

        .pst-clean-action-danger {
          border-color: rgba(248,113,113,0.72);
          background: rgba(127,29,29,0.90);
          color: #fecaca;
        }

        .pst-clean-card-body {
          min-height: 76px;
          padding: 8px 10px 9px;
          border-top: 1px solid #1a3a56;
          background: #061321;
          border-radius: 0 0 9px 9px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        .pst-clean-section {
          padding: 8px 9px;
          border: 1px solid transparent;
          border-radius: 8px;
        }

        .pst-clean-section-pst {
          border-color: rgba(52,211,153,0.28);
          background: linear-gradient(135deg, rgba(6,78,59,0.40) 0%, rgba(6,19,33,0.96) 100%);
          box-shadow: inset 3px 0 0 rgba(52,211,153,0.58);
        }

        .pst-clean-section-prep {
          border-color: rgba(96,165,250,0.30);
          background: linear-gradient(135deg, rgba(30,64,175,0.36) 0%, rgba(6,19,33,0.96) 100%);
          box-shadow: inset 3px 0 0 rgba(96,165,250,0.60);
        }

        .pst-clean-section-pst .pst-clean-section-title {
          color: #6ee7b7;
        }

        .pst-clean-section-prep .pst-clean-section-title {
          color: #93c5fd;
        }

        .pst-clean-text-section + .pst-clean-text-section,
        .pst-clean-text-section + .pst-clean-empty-section,
        .pst-clean-empty-section + .pst-clean-text-section,
        .pst-clean-empty-section + .pst-clean-empty-section {
          margin-top: 8px;
        }

        .pst-clean-section-title {
          margin-bottom: 4px;
          color: #69d2ff;
          font-size: 10px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }

        .pst-clean-pre {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          color: #d8e7f7;
          font-size: 11px;
          line-height: 1.4;
          font-weight: 400;
        }

        .pst-clean-empty-text {
          color: #52708a;
          font-size: 10px;
          line-height: 1.4;
          font-style: italic;
        }

        .pst-clean-empty-card {
          min-height: 58px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: #315d82;
          font-size: 10px;
          font-weight: 500;
        }

        @media (max-width: 640px) {
          .pst-clean-shell { padding: 9px; }
          .pst-clean-title-row { align-items: center; }
          .pst-clean-card-header { align-items: flex-start; }
          .pst-clean-actions { width: 100%; }
          .pst-elog-style-picker { width: auto; margin-left: 0; }
          .pst-elog-style-button { flex: 0 0 auto; }
        }
      `}</style>

      <div className="pst-clean-title-row">
        <DocumentLogIcon />
        <div className="pst-clean-title-copy">
          <div className="pst-clean-heading-line">
            <div className="pst-clean-title">PST / Train Prep Log Output</div>
            <div className="pst-elog-style-picker" aria-label="PST log style">
              <ELogStyleButton active={logStyle === ELOG_1} onClick={() => setLogStyle(ELOG_1)} tooltip="Show grouped PST and Train Prep log format">
                ELOG-1
              </ELogStyleButton>
              <ELogStyleButton active={logStyle === ELOG_2} onClick={() => setLogStyle(ELOG_2)} tooltip="Show PST log grouped by stabling location">
                ELOG-2
              </ELogStyleButton>
            </div>
          </div>
          <div className="pst-clean-subtitle">Auto-generated from PST / Train Prep</div>
        </div>
      </div>

      <div className="pst-clean-cards">
        <DepotLogCard
          depotLabel="West"
          lines={westLines}
          onClearDepot={() => onClearDepot?.("west")}
          logStyle={logStyle}
          westPSTTotal={westPSTTotal}
          eastPSTTotal={eastPSTTotal}
        />
        <DepotLogCard
          depotLabel="East"
          lines={eastLines}
          onClearDepot={() => onClearDepot?.("east")}
          logStyle={logStyle}
          westPSTTotal={westPSTTotal}
          eastPSTTotal={eastPSTTotal}
        />
      </div>
    </section>
  );
}
