import { useState } from "react";
import { X } from "lucide-react";

function formatTrainList(trainKeys) {
  if (trainKeys.length === 0) return "";
  if (trainKeys.length === 1) return trainKeys[0];
  return trainKeys.slice(0, -1).join(", ") + " and " + trainKeys[trainKeys.length - 1];
}

function getLogDisplayTime(entry = {}) {
  const directTime = entry.endTime || entry.time || entry.startTime;
  if (directTime) return directTime;
  const match = (entry.text || "").match(/(\d{1,2}:\d{2})\s*hrs/i);
  return match ? match[1] : "";
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
  if (entry.trainKey) return entry.trainKey;
  const match = (entry.text || "").match(/\b(T\d{1,2})\b/i);
  return match ? match[1].toUpperCase().replace(/^T(\d)$/, "T0$1") : "";
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
  return textMatch ? textMatch[1] : "";
}

function getPSTEndTime(entry = {}) {
  const directTime = (entry.endTime || "").toString().trim();
  if (directTime) return directTime;

  const textMatch = (entry.text || "").match(/Completed\s+at\s+(\d{1,2}:\d{2})\s*hrs/i);
  return textMatch ? textMatch[1] : getPSTStartTime(entry);
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
  if (entry.trainKey) return entry.trainKey;
  const textMatch = (entry.text || "").match(/\b(T\d{1,2})\b/i);
  return textMatch ? textMatch[1].toUpperCase().replace(/^T(\d)$/, "T0$1") : "";
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

function buildPSTCopyText(pstLines) {
  if (pstLines.length === 0) return "";
  const groupedLines = buildGroupedPSTLogLines(pstLines);
  const firstTime = getPSTStartTime(pstLines[0]);
  const lastTime = getPSTSummaryEndTime(pstLines);

  return [
    `Total PST completed: ${pstLines.length} train${pstLines.length !== 1 ? "s" : ""} conducted from ${firstTime} to ${lastTime} hrs.`,
    "",
    ...groupedLines.map((group) => group.text),
  ].join("\n");
}

function buildPrepCopyText(prepLines, depotLabel) {
  if (prepLines.length === 0) return "";
  const groupedLines = buildGroupedPrepLogLines(prepLines);
  const firstTime = getLogDisplayTime(prepLines[0]);
  const lastTime = getLogDisplayTime(prepLines[prepLines.length - 1]);

  return [
    `Train Preparation at ${depotLabel} Depot: Total ${prepLines.length} train${prepLines.length !== 1 ? "s" : ""} completed from ${firstTime} to ${lastTime} hrs.`,
    "",
    ...groupedLines.map((group) => group.text),
  ].join("\n");
}

function stripLeadingTime(line = "") {
  return line.replace(/^\s*\d{1,2}:\d{2}\s*hrs\s*[–-]\s*/i, "");
}

function IconMenu({ color = "currentColor" }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function IconDepot({ color = "currentColor" }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V9l7-4 7 4v12" />
      <path d="M9 21v-7h6v7" />
      <path d="M8 10h8" />
    </svg>
  );
}

function IconClock({ color = "currentColor" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconCheck({ color = "currentColor" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.2 2.2 4.8-5" />
    </svg>
  );
}

function IconTrain({ color = "currentColor" }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M8 17l-2 4" />
      <path d="M18 21l-2-4" />
      <path d="M9 7h6" />
      <path d="M8 12h.01M16 12h.01" />
    </svg>
  );
}

function IconCopy({ color = "currentColor" }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash({ color = "currentColor" }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

function CopyBtn({ text, label, disabled, accent = "#58a6ff" }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      disabled={disabled}
      className="pst-copy-button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        minHeight: 22,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${copied ? "#22c55e" : `${accent}55`}`,
        background: copied
          ? "linear-gradient(135deg, rgba(34,197,94,0.95), rgba(22,163,74,0.9))"
          : `linear-gradient(135deg, ${accent}24, rgba(255,255,255,0.045))`,
        color: copied ? "#ffffff" : "#dce9f7",
        fontSize: 10,
        fontWeight: 750,
        letterSpacing: "0.01em",
        boxShadow: disabled ? "none" : `0 0 10px ${accent}14, inset 0 1px 0 rgba(255,255,255,0.06)`,
        opacity: disabled ? 0.42 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform .15s ease, border-color .15s ease, background .15s ease",
        whiteSpace: "nowrap",
      }}
    >
      <IconCopy color="currentColor" />
      {copied ? "Copied" : label}
    </button>
  );
}

function SectionTitle({ title, count, accent, type }) {
  const icon = type === "prep" ? <IconTrain color={accent} /> : <IconCheck color={accent} />;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 1px 4px",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: accent,
          boxShadow: `0 0 8px ${accent}`,
          flexShrink: 0,
        }}
      />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: accent }}>
        {icon}
      </span>
      <span
        className="pst-section-title"
        style={{
          color: accent,
          fontSize: 11.5,
          fontWeight: 850,
          letterSpacing: "0.11em",
          textTransform: "uppercase",
          lineHeight: 1.1,
        }}
      >
        {title} ({count})
      </span>
    </div>
  );
}

function SummaryBar({ children, accent, type }) {
  return (
    <div
      className="pst-summary-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        minHeight: 28,
        padding: "5px 9px",
        borderRadius: 10,
        border: `1px solid ${accent}3d`,
        background: `linear-gradient(135deg, ${accent}12, rgba(255,255,255,0.035))`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: `1px solid ${accent}66`,
          background: `${accent}17`,
          color: accent,
        }}
      >
        {type === "prep" ? <IconTrain color="currentColor" /> : <IconCheck color="currentColor" />}
      </span>
      <p className="pst-summary-text" style={{ margin: 0, color: "#e5edf7", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 10.8, fontWeight: 750, lineHeight: 1.28 }}>
        {children}
      </p>
    </div>
  );
}

function LogRow({ group, accent, type, onRemove }) {
  const time = type === "pst" ? group.startTime : group.time;
  const body = stripLeadingTime(group.text);

  return (
    <div
      className="pst-log-row group"
      style={{
        display: "grid",
        gridTemplateColumns: "91px minmax(0,1fr) 20px",
        alignItems: "start",
        gap: 7,
        minHeight: 26,
        padding: "4px 7px",
        borderRadius: 6,
        border: "1px solid rgba(43,79,107,0.32)",
        background: "linear-gradient(90deg, rgba(6,19,32,0.92), rgba(8,31,50,0.68))",
      }}
    >
      <div
        className="pst-row-time"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: accent,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 10.8,
          fontWeight: 850,
          lineHeight: 1.3,
          whiteSpace: "nowrap",
        }}
      >
        <IconClock color="currentColor" />
        {time || "--:--"} hrs
      </div>

      <p
        className="pst-log-line-text"
        style={{
          margin: 0,
          color: "#cbd8e6",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 10.8,
          fontWeight: 600,
          lineHeight: 1.32,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {body}
      </p>

      <button
        type="button"
        onClick={() => group.entries.forEach((entry) => onRemove(entry.key))}
        title={group.entries.length > 1 ? `Remove ${type === "pst" ? "grouped PST entries" : "grouped Train Prep entries"}` : `Remove ${type === "pst" ? "PST entry" : "Train Prep entry"}`}
        className="pst-remove-button"
        style={{
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          border: "1px solid rgba(43,79,107,0.35)",
          background: "rgba(255,255,255,0.025)",
          color: "#526e8c",
          opacity: 0.38,
          cursor: "pointer",
          transition: "opacity .15s ease, color .15s ease, border-color .15s ease",
        }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function EmptyDepot({ label }) {
  return (
    <div
      style={{
        minHeight: 74,
        borderRadius: 12,
        border: "1px dashed rgba(74,138,181,0.35)",
        background: "rgba(7,24,40,0.76)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: "#5f7d9c",
      }}
    >
      <IconMenu color="#5f7d9c" />
      <span style={{ fontSize: 10.5, fontWeight: 700 }}>No entries for {label} Depot</span>
    </div>
  );
}

function PSTDepotBlock({ label, lines, onRemove, onClearDepot }) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const pstLines = safeLines.filter((l) => l.type === "PST");
  const prepLines = safeLines.filter((l) => l.type === "Prep");
  const groupedPSTLines = buildGroupedPSTLogLines(pstLines);
  const groupedPrepLines = buildGroupedPrepLogLines(prepLines);
  const isWest = label === "West";
  const [confirmClear, setConfirmClear] = useState(false);
  const depotAccent = isWest ? "#c084fc" : "#22d3ee";
  const depotAccentAlt = isWest ? "#7c3aed" : "#0891b2";
  const pstAccent = "#22c55e";
  const prepAccent = "#38bdf8";

  const handleDepotClear = () => {
    if (confirmClear) {
      onClearDepot?.();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <section
      className="pst-depot-card"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
        border: `1px solid ${depotAccent}36`,
        background: "linear-gradient(145deg, rgba(9,28,47,0.98), rgba(5,16,28,0.98))",
        boxShadow: `0 10px 18px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px ${depotAccent}10`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: `linear-gradient(180deg, ${depotAccent}, ${depotAccentAlt})`,
          boxShadow: `0 0 16px ${depotAccent}55`,
        }}
      />

      <div style={{ padding: "10px 10px 10px 15px" }}>
        <div
          className="pst-depot-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${depotAccent}55`,
                color: depotAccent,
                background: `radial-gradient(circle at 35% 28%, ${depotAccent}33, ${depotAccentAlt}18 58%, rgba(6,18,31,0.92))`,
                boxShadow: `0 0 14px ${depotAccent}20, inset 0 1px 0 rgba(255,255,255,0.07)`,
                flexShrink: 0,
              }}
            >
              <IconDepot color="currentColor" />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <h3
                  className="pst-depot-title"
                  style={{
                    margin: 0,
                    color: depotAccent,
                    fontSize: 14,
                    fontWeight: 900,
                    letterSpacing: "0.10em",
                    lineHeight: 1.1,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    textShadow: `0 0 18px ${depotAccent}30`,
                  }}
                >
                  {label} Depot
                </h3>

                <span
                  style={{
                    color: depotAccent,
                    fontSize: 10.5,
                    fontWeight: 750,
                    letterSpacing: "0.02em",
                    opacity: 0.85,
                    whiteSpace: "nowrap",
                  }}
                >
                  {safeLines.length} {safeLines.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                <CopyBtn text={buildPSTCopyText(pstLines)} label="PST" disabled={pstLines.length === 0} accent={depotAccent} />
                <CopyBtn text={buildPrepCopyText(prepLines, label)} label="Train Prep" disabled={prepLines.length === 0} accent={prepAccent} />
              </div>
            </div>
          </div>

          {safeLines.length > 0 && (
            <button
              type="button"
              onClick={handleDepotClear}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                minHeight: 24,
                padding: "0 8px",
                borderRadius: 999,
                border: `1px solid ${confirmClear ? "#ef4444" : "rgba(74,138,181,0.36)"}`,
                background: confirmClear ? "linear-gradient(135deg,#dc2626,#991b1b)" : "rgba(255,255,255,0.025)",
                color: confirmClear ? "#ffffff" : "#8ca6c2",
                fontSize: 10,
                fontWeight: 750,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title={`Clear all ${label} Depot PST / Train Prep log entries`}
            >
              <IconTrash color="currentColor" />
              {confirmClear ? "Confirm" : "Clear"}
            </button>
          )}
        </div>

        {safeLines.length === 0 ? (
          <EmptyDepot label={label} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pstLines.length > 0 && (
              <section
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(34,197,94,0.22)",
                  background: "linear-gradient(180deg, rgba(6,20,33,0.86), rgba(4,14,24,0.92))",
                  padding: 7,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <SectionTitle title="PST" count={pstLines.length} accent={pstAccent} type="pst" />
                <SummaryBar accent={pstAccent} type="pst">
                  Total PST completed: {pstLines.length} train{pstLines.length !== 1 ? "s" : ""} conducted from {getPSTStartTime(pstLines[0])} to {getPSTSummaryEndTime(pstLines)} hrs.
                </SummaryBar>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                  {groupedPSTLines.map((group) => (
                    <LogRow key={group.key} group={group} accent={pstAccent} type="pst" onRemove={onRemove} />
                  ))}
                </div>
              </section>
            )}

            {prepLines.length > 0 && (
              <section
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(56,189,248,0.22)",
                  background: "linear-gradient(180deg, rgba(6,20,33,0.86), rgba(4,14,24,0.92))",
                  padding: 7,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <SectionTitle title="Train Prep" count={prepLines.length} accent={prepAccent} type="prep" />
                <SummaryBar accent={prepAccent} type="prep">
                  Train Preparation at {label} Depot: Total {prepLines.length} train{prepLines.length !== 1 ? "s" : ""} completed from {getLogDisplayTime(prepLines[0])} to {getLogDisplayTime(prepLines[prepLines.length - 1])} hrs.
                </SummaryBar>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                  {groupedPrepLines.map((group) => (
                    <LogRow key={group.key} group={group} accent={prepAccent} type="prep" onRemove={onRemove} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function PSTLogOutput({ logLines, onRemove, onClearDepot }) {
  const safeLogLines = Array.isArray(logLines) ? logLines : [];
  const westLines = safeLogLines.filter((l) => l.depot === "west");
  const eastLines = safeLogLines.filter((l) => l.depot === "east");

  return (
    <div
      className="pst-log-shell"
      style={{
        borderRadius: 14,
        border: "1px solid rgba(79,142,247,0.30)",
        background: "linear-gradient(180deg, rgba(8,31,51,0.98), rgba(4,14,24,0.99))",
        boxShadow: "0 24px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}
    >
      <style>{`
        .pst-log-shell button:hover:not(:disabled) { transform: translateY(-1px); }
        .pst-log-row:hover { border-color: rgba(88,166,255,0.38) !important; background: linear-gradient(90deg, rgba(8,28,47,0.96), rgba(10,43,69,0.78)) !important; }
        .pst-log-row:hover .pst-remove-button { opacity: 1 !important; color: #fb7185 !important; border-color: rgba(251,113,133,0.35) !important; }
        @media (max-width: 640px) {
          .pst-depot-header { align-items: flex-start !important; flex-direction: column !important; }
          .pst-log-row { grid-template-columns: 1fr 24px !important; }
          .pst-row-time { grid-column: 1 / 2; }
          .pst-log-line-text { grid-column: 1 / 2; }
          .pst-remove-button { grid-column: 2 / 3; grid-row: 1 / 3; }
        }
      `}</style>

      <header
        className="pst-log-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          borderBottom: "1px solid rgba(43,79,107,0.72)",
          background: "linear-gradient(135deg, rgba(10,42,68,0.98), rgba(6,22,37,0.98))",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(79,142,247,0.45)",
            color: "#7da9ff",
            background: "linear-gradient(135deg, rgba(79,142,247,0.18), rgba(6,18,31,0.68))",
            boxShadow: "0 0 12px rgba(79,142,247,0.16), inset 0 1px 0 rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <IconMenu color="currentColor" />
        </div>

        <div style={{ minWidth: 0 }}>
          <p
            className="pst-log-title-main"
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: 14.5,
              fontWeight: 900,
              letterSpacing: "0.04em",
              lineHeight: 1.1,
            }}
          >
            PST / Train Prep Log
          </p>
          <p style={{ margin: "2px 0 0", color: "#7cc7ff", fontSize: 10.5, fontWeight: 650, lineHeight: 1.15 }}>
            {safeLogLines.length} {safeLogLines.length === 1 ? "entry" : "entries"}
          </p>
        </div>
      </header>

      <div
        className="pst-log-scroll"
        style={{
          maxHeight: "calc(100vh - 56px)",
          overflowY: "auto",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(88,166,255,0.42) rgba(7,24,40,0.9)",
        }}
      >
        <PSTDepotBlock label="West" lines={westLines} onRemove={onRemove} onClearDepot={() => onClearDepot("west")} />
        <PSTDepotBlock label="East" lines={eastLines} onRemove={onRemove} onClearDepot={() => onClearDepot("east")} />
      </div>
    </div>
  );
}
