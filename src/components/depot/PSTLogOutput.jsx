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
  const groupedPSTLines = buildGroupedPSTLogLines(pstLines);
  const groupedPrepLines = buildGroupedPrepLogLines(prepLines);
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
                <div className="pb-2 mb-1 border-b border-emerald-900/40 space-y-0.5 min-w-0">
                  <p className="pst-log-wrap-line font-mono text-[11px] font-bold text-[#c8d8ea] whitespace-normal break-words m-0">
                    Total PST completed: {pstLines.length} train{pstLines.length !== 1 ? "s" : ""} conducted from {getPSTStartTime(pstLines[0])} to {getPSTSummaryEndTime(pstLines)} hrs.
                  </p>
                </div>

                {groupedPSTLines.map((group) => (
                  <div key={group.key} className="group flex items-center gap-2 min-w-0">
                    <p className="pst-log-wrap-line flex-1 min-w-0 font-mono text-[11px] text-[#c8d8ea] leading-5 whitespace-normal break-words m-0 pr-2">
                      {group.text}
                    </p>
                    <button
                      onClick={() => group.entries.forEach((entry) => onRemove(entry.key))}
                      title={group.entries.length > 1 ? "Remove grouped PST entries" : "Remove PST entry"}
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
                <div className="pb-2 mb-1 border-b border-blue-900/30 space-y-0.5 min-w-0">
                  <p className="pst-log-wrap-line font-mono text-[11px] font-bold text-[#c8d8ea] whitespace-normal break-words m-0">
                    Train Preparation at {label} Depot: Total {prepLines.length} train{prepLines.length !== 1 ? "s" : ""} completed from {getLogDisplayTime(prepLines[0])} to {getLogDisplayTime(prepLines[prepLines.length - 1])} hrs.
                  </p>
                </div>

                {groupedPrepLines.map((group) => (
                  <div key={group.key} className="group flex items-center gap-2 min-w-0">
                    <p className="pst-log-wrap-line flex-1 min-w-0 font-mono text-[11px] text-[#c8d8ea] leading-5 whitespace-normal break-words m-0 pr-2">
                      {group.text}
                    </p>
                    <button
                      onClick={() => group.entries.forEach((entry) => onRemove(entry.key))}
                      title={group.entries.length > 1 ? "Remove grouped Train Prep entries" : "Remove Train Prep entry"}
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
