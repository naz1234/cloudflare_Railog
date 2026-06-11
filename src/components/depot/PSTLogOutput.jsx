import { useState } from "react";

function normalizeLogType(entry = {}) {
  return (entry?.type || entry?.logType || entry?.category || "").toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
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
  return rawLocation.replace(/-/g, "–").replace(/^(WD|ED)–/i, (_, depot) => `${depot.toUpperCase()}–`);
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
  return rawLocation.replace(/-/g, "–").replace(/^(WD|ED)–/i, (_, depot) => `${depot.toUpperCase()}–`);
}

function getPSTTrainKey(entry = {}) {
  if (entry.trainKey) return normalizeTrainKey(entry.trainKey);
  const textMatch = (entry.text || "").match(/\bT\d{1,2}\b/i);
  return textMatch ? normalizeTrainKey(textMatch[0]) : "";
}

function getPSTAlarmText(entry = {}) {
  const status = (entry.alarmStatus || "").toString().trim().toLowerCase();
  if (status === "alarm") return "Alarm reported.";
  if (status === "no_alarm" || status === "no alarm") return "No alarm reported.";

  const text = (entry.text || "").toString();
  if (/No\s+alarm\s+reported\.?/i.test(text)) return "No alarm reported.";
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
      const group = { key: groupKey, startTime, endTime, location, alarmText, trainKeys: [], entries: [] };
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
    const completedText = group.endTime ? ` from ${group.startTime} to ${group.endTime} hrs` : "";
    const alarmText = group.alarmText ? ` ${group.alarmText}` : "";

    return {
      ...group,
      time: group.startTime,
      text: `${group.startTime} hrs – ${trainList} PST completed${locationText}${completedText}.${alarmText}`,
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

function getPSTDCSummary(totalCount = 0) {
  if (!totalCount) return "";
  return `DC checked and confirmed that PST was performed and updated for ${totalCount} train${totalCount !== 1 ? "s" : ""} at West and East Depot.`;
}

function getPSTSectionText(pstLines = [], depotLabel = "", totalPSTCount = pstLines.length) {
  if (!pstLines.length) return "";
  const groupedLines = buildGroupedPSTLogLines(pstLines);
  const trainList = getUniqueTrainKeys(pstLines, getPSTTrainKey).join(", ");
  return [
    `PST at ${depotLabel} Depot: Total ${pstLines.length} train${pstLines.length !== 1 ? "s" : ""} completed from ${getPSTStartTime(pstLines[0])} to ${getPSTSummaryEndTime(pstLines)} hrs.`,
    getPSTDCSummary(totalPSTCount),
    trainList ? `Train: ${trainList}` : "",
    "",
    ...groupedLines.map((group) => group.text),
  ].filter((line) => line !== null && line !== undefined).join("\n").trim();
}

function getPrepSectionText(prepLines = [], depotLabel = "") {
  if (!prepLines.length) return "";
  const groupedLines = buildGroupedPrepLogLines(prepLines);
  const trainList = getUniqueTrainKeys(prepLines, getPrepTrainKey).join(", ");
  return [
    `Train Preparation at ${depotLabel} Depot: Total ${prepLines.length} train${prepLines.length !== 1 ? "s" : ""} completed from ${getLogDisplayTime(prepLines[0])} to ${getLogDisplayTime(prepLines[prepLines.length - 1])} hrs.`,
    trainList ? `Train: ${trainList}` : "",
    ...groupedLines.map((group) => group.text),
  ].filter(Boolean).join("\n");
}


function TrainLogIcon() {
  return (
    <div className="pst-plain-main-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="14" rx="3" />
        <path d="M8 17l-2 3" />
        <path d="M16 17l2 3" />
        <path d="M8 7h8" />
        <path d="M8 11h.01" />
        <path d="M16 11h.01" />
      </svg>
    </div>
  );
}

function DepotLogIcon() {
  return (
    <div className="pst-plain-depot-icon" aria-hidden="true">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V9l7-4 7 4v12" />
        <path d="M9 21v-7h6v7" />
        <path d="M8 11h.01" />
        <path d="M12 11h.01" />
        <path d="M16 11h.01" />
      </svg>
    </div>
  );
}

function CopyButton({ text, label, disabled }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled || !text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className="pst-plain-button"
      title={`Copy ${label}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function ClearDepotButton({ depotLabel, disabled, onClear }) {
  const [confirm, setConfirm] = useState(false);

  const handleClear = () => {
    if (disabled || !onClear) return;
    if (!confirm) {
      setConfirm(true);
      window.setTimeout(() => setConfirm(false), 2200);
      return;
    }
    onClear();
    setConfirm(false);
  };

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={disabled}
      className={confirm ? "pst-plain-button pst-plain-danger" : "pst-plain-button"}
      title={`Clear ${depotLabel} Depot log`}
    >
      {confirm ? "Confirm" : "Clear"}
    </button>
  );
}

function PlainRows({ groups, onRemove }) {
  return (
    <div className="pst-plain-lines">
      {groups.map((group) => (
        <div className="pst-plain-row" key={group.key}>
          <span className="pst-plain-row-text">{group.text}</span>
          {onRemove && group.entries?.length > 0 && (
            <button
              type="button"
              className="pst-plain-remove"
              onClick={() => group.entries.forEach((entry) => onRemove(entry.key))}
              title="Remove this log line"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function PlainSection({ title, summary, dcLine, trainLine, groups, emptyText, onRemove }) {
  if (!groups.length) {
    return (
      <section className="pst-plain-section">
        <div className="pst-plain-title">{title}</div>
        <div className="pst-plain-empty">{emptyText}</div>
      </section>
    );
  }

  return (
    <section className="pst-plain-section">
      <div className="pst-plain-title">{title}</div>
      <div className="pst-plain-summary">{summary}</div>
      {dcLine && <div className="pst-plain-dc-summary">{dcLine}</div>}
      {trainLine && <div className="pst-plain-train">{trainLine}</div>}
      <PlainRows groups={groups} onRemove={onRemove} />
    </section>
  );
}

function DepotPlainBlock({ depotLabel, lines = [], totalPSTCount = 0, onRemove, onClearDepot }) {
  const pstLines = lines.filter(isPSTEntry);
  const prepLines = lines.filter(isPrepEntry);
  const groupedPSTLines = buildGroupedPSTLogLines(pstLines);
  const groupedPrepLines = buildGroupedPrepLogLines(prepLines);
  const pstTrainList = getUniqueTrainKeys(pstLines, getPSTTrainKey).join(", ");
  const prepTrainList = getUniqueTrainKeys(prepLines, getPrepTrainKey).join(", ");
  const pstSummary = pstLines.length
    ? `PST at ${depotLabel} Depot: Total ${pstLines.length} train${pstLines.length !== 1 ? "s" : ""} completed from ${getPSTStartTime(pstLines[0])} to ${getPSTSummaryEndTime(pstLines)} hrs.`
    : "";
  const pstDCSummary = pstLines.length ? getPSTDCSummary(totalPSTCount || pstLines.length) : "";

  const prepSummary = prepLines.length
    ? `Train Preparation at ${depotLabel} Depot: Total ${prepLines.length} train${prepLines.length !== 1 ? "s" : ""} completed from ${getLogDisplayTime(prepLines[0])} to ${getLogDisplayTime(prepLines[prepLines.length - 1])} hrs.`
    : "";

  return (
    <div className="pst-plain-depot">
      <div className="pst-plain-depot-header">
        <div className="pst-plain-depot-info">
          <DepotLogIcon />
          <div className="pst-plain-depot-text">
            <div className="pst-plain-depot-title">{depotLabel.toUpperCase()} DEPOT</div>
            <div className="pst-plain-count">{lines.length} {lines.length === 1 ? "entry" : "entries"}</div>
          </div>
        </div>
        <div className="pst-plain-depot-actions">
          <CopyButton text={getPSTSectionText(pstLines, depotLabel, totalPSTCount || pstLines.length)} label="PST" disabled={!pstLines.length} />
          <CopyButton text={getPrepSectionText(prepLines, depotLabel)} label="Train Prep" disabled={!prepLines.length} />
          <ClearDepotButton depotLabel={depotLabel} disabled={!lines.length} onClear={onClearDepot} />
        </div>
      </div>

      <PlainSection
        title="PST"
        summary={pstSummary}
        dcLine={pstDCSummary}
        trainLine={pstTrainList ? `Train: ${pstTrainList}` : ""}
        groups={groupedPSTLines}
        emptyText="No PST entries."
        onRemove={onRemove}
      />

      <PlainSection
        title="Train Prep"
        summary={prepSummary}
        trainLine={prepTrainList ? `Train: ${prepTrainList}` : ""}
        groups={groupedPrepLines}
        emptyText="No Train Prep entries."
        onRemove={onRemove}
      />
    </div>
  );
}

export default function PSTLogOutput({ logLines, onRemove, onClearDepot }) {
  const safeLogLines = Array.isArray(logLines) ? logLines : [];
  const westLines = safeLogLines.filter((line) => line.depot === "west");
  const eastLines = safeLogLines.filter((line) => line.depot === "east");
  const totalPSTCount = safeLogLines.filter(isPSTEntry).length;
  const scrollMainPageFromLog = (event) => {
    if (event.ctrlKey || event.metaKey) return;

    const deltaY = event.deltaY || 0;
    const deltaX = event.deltaX || 0;
    if (!deltaY && !deltaX) return;

    event.preventDefault();
    event.stopPropagation();

    let parent = event.currentTarget?.parentElement;
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
      return;
    }

    window.scrollBy({ top: deltaY, left: deltaX, behavior: "auto" });
  };

  return (
    <div className="pst-log-shell" onWheel={scrollMainPageFromLog}>
      <style>{`
        .pst-log-shell {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid rgba(79, 143, 198, 0.46);
          background: #061523;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 34px rgba(0,0,0,0.28);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        .pst-plain-header {
          position: relative;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 78px;
          padding: 14px 18px;
          overflow: hidden;
          border-bottom: 1px solid rgba(52, 128, 205, 0.58);
          background:
            radial-gradient(circle at 14% 0%, rgba(64, 142, 255, 0.28), transparent 32%),
            linear-gradient(135deg, #081832 0%, #0a2a55 52%, #051325 100%);
        }

        .pst-plain-header::before,
        .pst-plain-header::after {
          content: "";
          position: absolute;
          pointer-events: none;
          border-radius: 999px;
        }

        .pst-plain-header::before {
          width: 520px;
          height: 160px;
          right: -120px;
          top: -116px;
          border: 1px solid rgba(80, 147, 255, 0.34);
          transform: rotate(-17deg);
        }

        .pst-plain-header::after {
          width: 640px;
          height: 210px;
          right: -220px;
          top: -152px;
          border: 1px solid rgba(39, 112, 245, 0.24);
          transform: rotate(-17deg);
        }

        .pst-plain-header-left {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .pst-plain-main-icon {
          flex: 0 0 auto;
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          color: #ffffff;
          background: linear-gradient(135deg, #1d5fd1 0%, #0ea5e9 100%);
          box-shadow: 0 14px 26px rgba(14, 116, 222, 0.34), inset 0 1px 0 rgba(255,255,255,0.22);
        }

        .pst-plain-main-title {
          margin: 0;
          color: #f7fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          line-height: 1.04;
          font-weight: 850;
          letter-spacing: -0.03em;
          text-shadow: 0 2px 14px rgba(0,0,0,0.38);
        }

        .pst-plain-main-count {
          margin: 5px 0 0;
          color: #bdd2ec;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 11px;
          line-height: 1;
          font-weight: 650;
          letter-spacing: 0.01em;
        }

        .pst-plain-date-pill {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          padding: 8px 10px;
          border: 1px solid rgba(73, 151, 232, 0.32);
          border-radius: 999px;
          background: rgba(5, 17, 34, 0.38);
          color: #dceeff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          font-weight: 760;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
          white-space: nowrap;
        }

        .pst-log-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: auto;
          -webkit-overflow-scrolling: touch;
          padding: 10px;
          background: linear-gradient(180deg, rgba(8, 30, 50, 0.9) 0%, rgba(5, 17, 29, 0.98) 100%);
          scrollbar-width: thin;
          scrollbar-color: #3c7297 #061523;
        }

        .pst-log-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .pst-log-scroll::-webkit-scrollbar-track { background: #061523; }
        .pst-log-scroll::-webkit-scrollbar-thumb { background: #3c7297; border-radius: 999px; }

        .pst-plain-depot {
          overflow: hidden;
          border: 1px solid rgba(48, 91, 126, 0.68);
          border-radius: 14px;
          background: #06111d;
          margin-bottom: 10px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.18);
        }

        .pst-plain-depot:last-child {
          margin-bottom: 0;
        }

        .pst-plain-depot-header {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          flex-direction: column;
          gap: 8px;
          padding: 11px 13px;
          border-bottom: 1px solid rgba(48, 91, 126, 0.66);
          background:
            radial-gradient(circle at 4% 0%, rgba(54, 195, 225, 0.18), transparent 38%),
            linear-gradient(135deg, rgba(9, 31, 52, 0.98) 0%, rgba(8, 24, 41, 0.96) 100%);
        }

        .pst-plain-depot-info {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .pst-plain-depot-icon {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: #ffffff;
          background: linear-gradient(135deg, #214cdb 0%, #0ea5a5 100%);
          box-shadow: 0 10px 18px rgba(14, 165, 233, 0.22), inset 0 1px 0 rgba(255,255,255,0.2);
        }

        .pst-plain-depot-text {
          min-width: 0;
        }

        .pst-plain-depot-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .pst-plain-depot-title {
          color: #f3f8ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.05;
          font-weight: 850;
          letter-spacing: -0.01em;
        }

        .pst-plain-depot-actions {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pst-plain-depot-title-row .pst-plain-button,
        .pst-plain-depot-actions .pst-plain-button {
          height: 29px;
          padding: 0 10px;
          font-size: 12px;
        }

        .pst-plain-count {
          color: #a5b8cb;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1;
          margin-top: 5px;
          font-weight: 650;
        }

        .pst-plain-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          flex-wrap: wrap;
        }

        .pst-plain-button {
          height: 25px;
          padding: 0 9px;
          border: 1px solid rgba(91, 134, 169, 0.74);
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(17, 44, 72, 0.95), rgba(10, 31, 52, 0.98));
          color: #c8e6fb;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.07);
        }

        .pst-plain-button:hover:not(:disabled) {
          border-color: #65a7d1;
          color: #ffffff;
          background: linear-gradient(180deg, rgba(20, 68, 111, 0.98), rgba(12, 43, 72, 0.98));
        }

        .pst-plain-button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .pst-plain-danger {
          border-color: #ef4444 !important;
          background: #7f1d1d !important;
          color: #ffffff !important;
        }

        .pst-plain-section {
          padding: 5px 7px 7px;
          border-top: 1px solid rgba(35,71,100,0.52);
        }

        .pst-plain-section:first-of-type {
          border-top: 0;
        }

        .pst-plain-title {
          color: #69d2ff;
          font-size: 11px;
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .pst-plain-summary,
        .pst-plain-dc-summary,
        .pst-plain-train,
        .pst-plain-row-text,
        .pst-plain-empty {
          font-size: 11px;
          line-height: 1.42;
          color: #e8f0f7;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .pst-plain-summary {
          color: #f3f7fb;
          font-weight: 800;
          margin-bottom: 1px;
        }

        .pst-plain-dc-summary {
          color: #e8f0f7;
          margin-bottom: 1px;
        }

        .pst-plain-train {
          color: #c8d9e7;
          margin-bottom: 4px;
        }

        .pst-plain-lines {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .pst-plain-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 16px;
          gap: 4px;
          align-items: start;
          min-height: 16px;
        }

        .pst-plain-remove {
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 3px;
          background: transparent;
          color: #49677a;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          opacity: 0;
        }

        .pst-plain-row:hover .pst-plain-remove {
          opacity: 1;
        }

        .pst-plain-remove:hover {
          color: #ff7b8f;
          background: rgba(255,123,143,0.10);
        }

        .pst-plain-empty {
          color: #637f92;
          font-style: italic;
        }

        @media (max-width: 640px) {
          .pst-plain-header {
            align-items: flex-start;
            flex-direction: column;
            min-height: 0;
            padding: 12px;
          }

          .pst-plain-date-pill {
            align-self: flex-start;
          }

          .pst-plain-main-icon {
            width: 42px;
            height: 42px;
            border-radius: 12px;
          }

          .pst-plain-depot-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .pst-plain-depot-actions {
            justify-content: flex-start;
          }
        }
      `}</style>

      <header className="pst-plain-header">
        <div className="pst-plain-header-left">
          <TrainLogIcon />
          <div>
            <p className="pst-plain-main-title">PST / Train Prep Log</p>
            <p className="pst-plain-main-count">{safeLogLines.length} {safeLogLines.length === 1 ? "entry" : "entries"}</p>
          </div>
        </div>
        <div className="pst-plain-date-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
          </svg>
          {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </header>

      <div className="pst-log-scroll">
        <DepotPlainBlock
          depotLabel="West"
          lines={westLines}
          totalPSTCount={totalPSTCount}
          onRemove={onRemove}
          onClearDepot={() => onClearDepot?.("west")}
        />
        <DepotPlainBlock
          depotLabel="East"
          lines={eastLines}
          totalPSTCount={totalPSTCount}
          onRemove={onRemove}
          onClearDepot={() => onClearDepot?.("east")}
        />
      </div>
    </div>
  );
}
