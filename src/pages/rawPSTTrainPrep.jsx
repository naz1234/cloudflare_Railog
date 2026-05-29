import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Copy, ClipboardCheck, X } from "lucide-react";
// ClipboardCheck used in CopyButton below

const WEST_ROADS = ["WD-ST15", "WD-ST14", "WD-ST13", "WD-ST12"];
const EAST_ROADS = ["ED-ST02", "ED-ST03"];
const NUM_BLOCKS = 7;
const PST_STORAGE_KEY = "pstTrainPrepState_v1";

const MAINT_STYLES = {
  UNFIT: { cellBg: "#fff1f2", trainColor: "#be123c", badgeBg: "#fecaca", badgeBorder: "#fca5a5" },
  "RST CM": { cellBg: "#fff7ed", trainColor: "#c2410c", badgeBg: "#FFA500", badgeBorder: "#fb923c" },
  "RST PM": { cellBg: "#ecfdf5", trainColor: "#047857", badgeBg: "#90EE90", badgeBorder: "#86efac" },
  WASH: { cellBg: "#eaf8ff", trainColor: "#0e7490", badgeBg: "#ADD8E6", badgeBorder: "#7dd3fc" },
  "TLC Comms": { cellBg: "#e8f1ff", trainColor: "#2563eb", badgeBg: "#bfdbfe", badgeBorder: "#93c5fd" },
  "ML Fault": { cellBg: "#fff7ed", trainColor: "#c2410c", badgeBg: "#fed7aa", badgeBorder: "#fdba74" },
  "HVAC TESTING": { cellBg: "#fdf2f8", trainColor: "#be185d", badgeBg: "#FFB6C1", badgeBorder: "#f9a8d4" },
  "Deep Cleaning": { cellBg: "#faf5ff", trainColor: "#7e22ce", badgeBg: "#DDA0DD", badgeBorder: "#d8b4fe" },
  "INBOUND (G to C)": { cellBg: "#fefce8", trainColor: "#a16207", badgeBg: "#FFFF99", badgeBorder: "#fde047" },
  "CC Tech/Func. Alarm": { cellBg: "#fffbeb", trainColor: "#b45309", badgeBg: "#fde68a", badgeBorder: "#f59e0b" },
  "Door Issue": { cellBg: "#fef2f2", trainColor: "#b91c1c", badgeBg: "#fca5a5", badgeBorder: "#ef4444" },
  Training: { cellBg: "#f5f3ff", trainColor: "#6d28d9", badgeBg: "#c4b5fd", badgeBorder: "#8b5cf6" },
  "APU alarm": { cellBg: "#f0fdfa", trainColor: "#0f766e", badgeBg: "#99f6e4", badgeBorder: "#14b8a6" },
  Other: { cellBg: "#f8fafc", trainColor: "#475569", badgeBg: "#D3D3D3", badgeBorder: "#cbd5e1" },
};

function normalizeTrainId(value) {
  if (!value) return "";
  const cleaned = value.toString().trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";
  if (/^\d+$/.test(cleaned)) return `T${cleaned}`;
  return cleaned;
}

function displayTrainId(value) {
  const normalized = normalizeTrainId(value);
  return normalized ? normalized : "";
}

function emptyBlocks() {
  return Array.from({ length: NUM_BLOCKS }, () => ({ trainId: "", extraRemark: "" }));
}


function loadSavedPSTTrainPrepState() {
  try {
    const raw = localStorage.getItem(PST_STORAGE_KEY);
    if (!raw) return { pstState: {}, prepState: {}, logLines: [] };
    const parsed = JSON.parse(raw);
    return {
      pstState: parsed?.pstState && typeof parsed.pstState === "object" ? parsed.pstState : {},
      prepState: parsed?.prepState && typeof parsed.prepState === "object" ? parsed.prepState : {},
      logLines: Array.isArray(parsed?.logLines) ? parsed.logLines : [],
    };
  } catch (error) {
    console.warn("Unable to load saved PST / Train Prep state", error);
    return { pstState: {}, prepState: {}, logLines: [] };
  }
}

function savePSTTrainPrepState(pstState, prepState, logLines) {
  try {
    localStorage.setItem(PST_STORAGE_KEY, JSON.stringify({ pstState, prepState, logLines }));
  } catch (error) {
    console.warn("Unable to save PST / Train Prep state", error);
  }
}

function initRoads(roads) {
  return Object.fromEntries(roads.map((r) => [r, emptyBlocks()]));
}

function buildMaintenanceMap(requests) {
  const map = {};
  (requests || []).forEach((req) => {
    const key = normalizeTrainId(req.trainId);
    if (!key) return;
    const typeKey = req.requestType === "Other" ? "Other" : req.requestType;
    const displayType = req.requestType === "Other" ? req.customType || "Other" : req.requestType;
    const styles = MAINT_STYLES[typeKey] || MAINT_STYLES.Other;
    if (!map[key]) map[key] = [];
    map[key].push({ typeKey, displayType, ...styles });
  });
  return map;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function Badge({ text, bg, border }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap"
      style={{ backgroundColor: bg, color: "#000", border: `1px solid ${border}` }}
    >
      {text}
    </span>
  );
}

function EmptyCornerCell() {
  return <th className="w-[72px]" style={{ background: "transparent", border: "none" }} />;
}

function RoadLabelCell({ label, labelSide, isFirst, isLast, rowLine }) {
  return (
    <td
      className="text-center align-middle font-black text-[11px] tracking-tight"
      style={{
        background: "linear-gradient(180deg, #083654 0%, #06263f 100%)",
        color: "#f8fbff",
        borderTop: isFirst ? "none" : "1px solid rgba(255,255,255,0.25)",
        borderBottom: rowLine,
        borderRight: labelSide === "left" ? "1px solid rgba(255,255,255,0.25)" : "1px solid #cbd5e1",
        borderLeft: labelSide === "right" ? "1px solid rgba(255,255,255,0.25)" : undefined,
        whiteSpace: "nowrap",
        width: 72,
        minWidth: 72,
        borderTopLeftRadius: labelSide === "left" && isFirst ? 12 : undefined,
        borderTopRightRadius: labelSide === "right" && isFirst ? 12 : undefined,
        borderBottomLeftRadius: labelSide === "left" && isLast ? 12 : undefined,
        borderBottomRightRadius: labelSide === "right" && isLast ? 12 : undefined,
      }}
    >
      {label}
    </td>
  );
}

// PST / Train Prep cell — shows train, maintenance badges, and tick buttons
function PSTCell({
  block,
  bi,
  i,
  labelSide,
  isLast,
  isFirstBlock,
  isLastBlock,
  maintenanceMap,
  pstState,
  prepState,
  onPSTTick,
  onPrepTick,
  road,
}) {
  const val = block?.trainId || "";
  const key = normalizeTrainId(val);
  const displayVal = displayTrainId(val);
  const maintList = key ? maintenanceMap[key] || [] : [];
  const primaryMaint = maintList[0] || null;

  const rowLine = isLast ? "1px solid #cbd5e1" : "2px solid #cbd5e1";

  const isWestBottomRightCorner = labelSide === "left" && isLast && isLastBlock;
  const isEastBottomLeftCorner = labelSide === "right" && isLast && isFirstBlock;

  let cellBg = "#ffffff";
  let trainColor = "#071b3a";
  if (primaryMaint) {
    cellBg = primaryMaint.cellBg;
    trainColor = primaryMaint.trainColor;
  }

  const [taName, setTaName] = useState("");

  const cellKey = `${road}-${bi}`;
  const pst = pstState[cellKey];
  const prep = prepState[cellKey];

  const isPstDone = pst?.done;
  const isPrepStarted = prep?.started;
  const isPrepDone = prep?.done;

  let overlayBg = cellBg;
  if (isPstDone) overlayBg = "#ecfdf5";
  else if (isPrepDone) overlayBg = "#e0f2fe";
  else if (isPrepStarted) overlayBg = "#fefce8";

  return (
    <td
      className="p-0 align-top"
      style={{
        backgroundColor: overlayBg,
        borderLeft: "1px solid #d1d9e6",
        borderRight: labelSide === "left" && isLastBlock ? "1px solid #d1d9e6" : undefined,
        borderBottom: rowLine,
        borderBottomRightRadius: isWestBottomRightCorner ? 12 : undefined,
        borderBottomLeftRadius: isEastBottomLeftCorner ? 12 : undefined,
      }}
    >
      <div className="flex flex-col items-center justify-start gap-1 min-h-[90px] px-1 py-2">
        {/* Train ID */}
        <div
          className={key ? "w-full text-center text-base font-black leading-none" : "w-full text-center text-base font-light text-slate-400 leading-none"}
          style={{ color: key ? trainColor : undefined }}
        >
          {displayVal || "–"}
        </div>

        {/* Maintenance badges */}
        {maintList.map((item) => (
          <Badge key={item.displayType} text={item.displayType} bg={item.badgeBg} border={item.badgeBorder} />
        ))}

        {key && (
          <div className="flex flex-col gap-1 w-full mt-1">
            {/* PST button */}
            <button
              onClick={() => onPSTTick(road, bi, key, road)}
              className={`w-full text-[9px] font-bold rounded px-1 py-0.5 border transition-all leading-tight ${
                isPstDone
                  ? "bg-green-100 border-green-300 text-green-700"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {isPstDone ? `✓ PST ${pst.startTime}→${pst.endTime}` : "PST"}
            </button>

            {/* Train Prep button + TA name input */}
            {isPrepStarted && !isPrepDone && (
              <input
                value={taName}
                onChange={(e) => setTaName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="TA name"
                className="w-full text-[9px] rounded border border-yellow-300 bg-yellow-50 px-1 py-0.5 outline-none text-slate-700 placeholder:text-slate-400"
              />
            )}
            <button
              onClick={() => { onPrepTick(road, bi, key, road, taName); if (!isPrepStarted) setTaName(""); }}
              className={`w-full text-[9px] font-bold rounded px-1 py-0.5 border transition-all leading-tight ${
                isPrepDone
                  ? "bg-blue-100 border-blue-300 text-blue-700"
                  : isPrepStarted
                  ? "bg-yellow-100 border-yellow-300 text-yellow-700"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
              }`}
            >
              {isPrepDone
                ? `✓ Prep ${prep.startTime}→${prep.endTime}`
                : isPrepStarted
                ? `⏱ Complete Prep`
                : "Train Prep"}
            </button>
          </div>
        )}
      </div>
    </td>
  );
}

function PSTStablingSection({ title, blockLabels, blockIndices, roads, data, labelSide, maintenanceMap, pstState, prepState, onPSTTick, onPrepTick }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 shadow-sm flex items-center justify-center flex-shrink-0">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#071b3a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <h2 className="text-base leading-none font-black text-[#071b3a] tracking-widest uppercase">{title}</h2>
      </div>

      <div className="overflow-hidden rounded-xl">
        <table className="border-separate border-spacing-0 w-full table-fixed text-xs">
          <thead>
            <tr>
              {labelSide === "left" && <EmptyCornerCell />}
              {blockLabels.map((label, i) => {
                const isLastBlock = i === blockLabels.length - 1;
                return (
                  <th
                    key={label}
                    className="h-9 text-center text-[10px] font-black tracking-widest"
                    style={{
                      background: "linear-gradient(180deg, #113a5a 0%, #082b46 100%)",
                      color: "#eaf3ff",
                      borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.25)" : undefined,
                      borderRight: labelSide === "left" && isLastBlock ? "1px solid #d1d9e6" : undefined,
                      borderBottom: "1px solid #cbd5e1",
                      borderTopLeftRadius: labelSide === "left" && i === 0 ? 12 : undefined,
                      borderTopRightRadius: labelSide === "right" && isLastBlock ? 12 : undefined,
                    }}
                  >
                    {label}
                  </th>
                );
              })}
              {labelSide === "right" && <EmptyCornerCell />}
            </tr>
          </thead>
          <tbody>
            {roads.map((road, ri) => {
              const rowLine = ri === roads.length - 1 ? "1px solid #cbd5e1" : "2px solid #cbd5e1";
              const labelCell = (
                <RoadLabelCell
                  label={road}
                  labelSide={labelSide}
                  isFirst={ri === 0}
                  isLast={ri === roads.length - 1}
                  rowLine={rowLine}
                />
              );
              return (
                <tr key={road}>
                  {labelSide === "left" && labelCell}
                  {blockIndices.map((bi, i) => (
                    <PSTCell
                      key={bi}
                      block={data[road]?.[bi]}
                      bi={bi}
                      i={i}
                      road={road}
                      labelSide={labelSide}
                      isLast={ri === roads.length - 1}
                      isFirstBlock={i === 0}
                      isLastBlock={i === blockIndices.length - 1}
                      maintenanceMap={maintenanceMap}
                      pstState={pstState}
                      prepState={prepState}
                      onPSTTick={onPSTTick}
                      onPrepTick={onPrepTick}
                    />
                  ))}
                  {labelSide === "right" && labelCell}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CopyButton({ lines, label = "Copy", disabled }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (disabled) return;
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-white/40 bg-white text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function PSTActivityBlock({ title, entries, emptyText, onRemove, tone }) {
  const isPST = tone === "pst";
  const titleColor = isPST ? "text-emerald-700" : "text-blue-600";
  const dotColor = isPST ? "bg-emerald-500" : "bg-blue-400";
  const bgColor = isPST ? "bg-green-50 border-green-100" : "bg-white border-slate-100";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-1">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className={`text-[10px] font-black tracking-widest uppercase ${titleColor}`}>
          {title} ({entries.length})
        </span>
      </div>
      <div className={`rounded-xl border ${bgColor} px-4 py-3 min-h-[48px]`}>
        {entries.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">{emptyText}</p>
        ) : (
          <div className="space-y-0" style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {entries.map((entry) => (
              <div key={entry.key} className="group flex items-start gap-2">
                <p className="flex-1 font-mono text-[8px] text-slate-900 leading-6 whitespace-pre-wrap">{entry.text}</p>
                <button onClick={() => onRemove(entry.key)} className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-red-400 transition-all mt-1 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PSTDepotSection({ label, entries, onRemove }) {
  const pstEntries = entries.filter((e) => e.type === "PST");
  const prepEntries = entries.filter((e) => e.type === "Prep");
  const isWest = label === "West";
  const dotColor = isWest ? "bg-purple-500" : "bg-cyan-400";
  const borderColor = isWest ? "border-purple-200" : "border-cyan-200";
  const bgColor = isWest ? "bg-purple-50" : "bg-cyan-50";
  const titleColor = isWest ? "text-purple-700" : "text-cyan-700";
  const pstSummary = `Total: ${pstEntries.length} trains PST performed.`;
  const prepSummary = `Total: ${prepEntries.length} trains Train Prep performed.`;

  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <h3 className={`text-xs font-black tracking-widest uppercase ${titleColor}`}>{label} Depot</h3>
          <span className="text-[10px] text-slate-400 font-medium">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton lines={[...pstEntries.map((e) => e.text), "", pstSummary]} label="PST" disabled={pstEntries.length === 0} />
          <CopyButton lines={[...prepEntries.map((e) => e.text), "", prepSummary]} label="Train Prep" disabled={prepEntries.length === 0} />
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01"/></svg>
          <span className="text-[11px] font-medium">No entries for {label} Depot</span>
        </div>
      ) : (
        <div className="space-y-3">
          <PSTActivityBlock title="PST" entries={pstEntries} emptyText="No PST entries." onRemove={onRemove} tone="pst" />
          <PSTActivityBlock title="Train Prep" entries={prepEntries} emptyText="No Train Prep entries." onRemove={onRemove} tone="prep" />
        </div>
      )}
    </div>
  );
}

function PSTLogOutput({ logLines, onRemove }) {
  const westLines = logLines.filter((l) => l.depot === "west");
  const eastLines = logLines.filter((l) => l.depot === "east");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </div>
        <div>
          <p className="text-xs font-black text-slate-700">PST / Train Prep Log</p>
          <p className="text-[10px] text-slate-400">{logLines.length} {logLines.length === 1 ? "entry" : "entries"}</p>
          <p className="text-[40px] font-black text-red-600">TESTING</p>
        </div>
      </div>
      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <PSTDepotSection label="West" entries={westLines} onRemove={onRemove} />
        <PSTDepotSection label="East" entries={eastLines} onRemove={onRemove} />
      </div>
    </div>
  );
}

export default function PSTTrainPrep() {
  const [westData, setWestData] = useState(initRoads(WEST_ROADS));
  const [eastData, setEastData] = useState(initRoads(EAST_ROADS));
  const [requests, setRequests] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // pstState: { [road-bi]: { done, startTime, endTime, trainId, road } }
  const savedPSTTrainPrepState = loadSavedPSTTrainPrepState();

  const [pstState, setPstState] = useState(savedPSTTrainPrepState.pstState);
  // prepState: { [road-bi]: { started, done, startTime, endTime, trainId, road } }
  const [prepState, setPrepState] = useState(savedPSTTrainPrepState.prepState);

  // Log lines: { key, text, type, depot }
  const [logLines, setLogLines] = useState(savedPSTTrainPrepState.logLines);

  useEffect(() => {
    Promise.all([
      base44.entities.DepotStabling.list(),
      base44.entities.MaintenanceRequest.list(),
    ]).then(([stablingRecords, maintenanceRecords]) => {
      if (stablingRecords.length > 0) {
        const newWest = initRoads(WEST_ROADS);
        const newEast = initRoads(EAST_ROADS);
        stablingRecords.forEach((rec) => {
          const blocks = (rec.blocks || emptyBlocks()).map((b) => ({
            trainId: b.trainId || "",
            extraRemark: b.extraRemark || "",
          }));
          if (rec.depot === "west" && newWest[rec.road]) newWest[rec.road] = blocks;
          if (rec.depot === "east" && newEast[rec.road]) newEast[rec.road] = blocks;
        });
        setWestData(newWest);
        setEastData(newEast);
      }
      setRequests(maintenanceRecords || []);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    savePSTTrainPrepState(pstState, prepState, logLines);
  }, [pstState, prepState, logLines]);

  const maintenanceMap = buildMaintenanceMap(requests);

  const getDepotFromRoad = (road) => WEST_ROADS.includes(road) ? "west" : "east";

  const handlePSTTick = (road, bi, trainKey, roadLabel) => {
    const cellKey = `${road}-${bi}`;
    if (pstState[cellKey]?.done) {
      setPstState((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
      setLogLines((prev) => prev.filter((l) => l.key !== `pst-${cellKey}`));
      return;
    }
    const now = new Date();
    const startTime = formatTime(now);
    const endTime = formatTime(addMinutes(now, 6));
    const line = `${startTime} hrs – ${trainKey} PST started at ${roadLabel} and completed at ${endTime} hrs.`;
    const depot = getDepotFromRoad(road);
    setPstState((prev) => ({ ...prev, [cellKey]: { done: true, startTime, endTime } }));
    setLogLines((prev) => [
      ...prev.filter((l) => l.key !== `pst-${cellKey}`),
      { key: `pst-${cellKey}`, text: line, type: "PST", depot },
    ]);
  };

  const handlePrepTick = (road, bi, trainKey, roadLabel, taName = "") => {
    const cellKey = `${road}-${bi}`;
    const current = prepState[cellKey];

    if (current?.done) {
      setPrepState((prev) => { const n = { ...prev }; delete n[cellKey]; return n; });
      setLogLines((prev) => prev.filter((l) => l.key !== `prep-${cellKey}`));
      return;
    }

    if (!current?.started) {
      const startTime = formatTime(new Date());
      setPrepState((prev) => ({ ...prev, [cellKey]: { started: true, done: false, startTime } }));
    } else {
      const endTime = formatTime(new Date());
      const taStr = taName.trim() ? ` Performed by TA ${taName.trim()}.` : "";
      const line = `${current.startTime} hrs – ${trainKey} Train preparation started at ${roadLabel}. Completed (at ${endTime} hrs)${taStr}`;
      const depot = getDepotFromRoad(road);
      setPrepState((prev) => ({ ...prev, [cellKey]: { ...prev[cellKey], done: true, endTime } }));
      setLogLines((prev) => [
        ...prev.filter((l) => l.key !== `prep-${cellKey}`),
        { key: `prep-${cellKey}`, text: line, type: "Prep", depot },
      ]);
    }
  };

  const handleRemoveLog = (key) => {
    setLogLines((prev) => prev.filter((l) => l.key !== key));
    const parts = key.replace(/^(pst|prep)-/, "");
    if (key.startsWith("pst-")) {
      setPstState((prev) => { const n = { ...prev }; delete n[parts]; return n; });
    } else {
      setPrepState((prev) => { const n = { ...prev }; delete n[parts]; return n; });
    }
  };

  const navLink = "flex items-center px-4 text-sm font-semibold text-slate-500 hover:text-[#071b3a] border-b-2 border-transparent transition-colors";
  const navLinkActive = "flex items-center px-4 text-sm font-bold text-[#071b3a] border-b-2 border-[#071b3a]";

  if (!loaded) {
    return (
      <div className="h-screen bg-[#f4f6f8] flex items-center justify-center">
        <div className="w-7 h-7 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen font-inter bg-[#f1f5f9] flex flex-col overflow-hidden">
      <header className="h-[56px] bg-white border-b border-[#e2e8f0] shadow-sm flex-shrink-0 z-20">
        <div className="max-w-[1800px] mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#334155] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                  <circle cx="9" cy="16" r="1" />
                  <circle cx="15" cy="16" r="1" />
                </svg>
              </div>
              <span className="text-sm font-bold text-[#1e293b] tracking-tight">TrainLog</span>
            </div>
            <nav className="flex items-center gap-0.5 bg-[#f1f5f9] p-0.5 rounded-lg border border-[#e2e8f0]">
              <Link to="/" className="px-3 py-1.5 rounded-md text-xs font-medium text-[#64748b] hover:text-[#334155] hover:bg-white transition-colors">Train Log</Link>
              <Link to="/depot-stabling" className="px-3 py-1.5 rounded-md text-xs font-medium text-[#64748b] hover:text-[#334155] hover:bg-white transition-colors">Depot Stabling</Link>
              <Link to="/mainline-trains" className="px-3 py-1.5 rounded-md text-xs font-medium text-[#64748b] hover:text-[#334155] hover:bg-white transition-colors">Mainline Trains</Link>
              <Link to="/pst-train-prep" className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-[#334155] shadow-sm border border-[#e2e8f0]">PST / Train Prep</Link>
              <Link to="/possession" className="px-3 py-1.5 rounded-md text-xs font-medium text-[#64748b] hover:text-[#334155] hover:bg-white transition-colors">Possession</Link>
            </nav>
          </div>
          <div className="flex items-center gap-2 bg-[#f1f5f9] border border-[#e2e8f0] px-3 py-1.5 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-[#64748b]">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full px-5 py-5 overflow-auto">
        <div
          className="grid gap-5 items-start w-full"
          style={{ gridTemplateColumns: "minmax(400px, 500px) minmax(600px, 1fr)" }}
        >
          {/* Stabling tables — kept smaller */}
          <div className="space-y-5 min-w-0">
            <PSTStablingSection
              title="WEST DEPOT STABLING — PST / TRAIN PREP"
              blockLabels={["BLOCK 7","BLOCK 6","BLOCK 5","BLOCK 4","BLOCK 3","BLOCK 2","BLOCK 1"]}
              blockIndices={[6, 5, 4, 3, 2, 1, 0]}
              roads={WEST_ROADS}
              data={westData}
              labelSide="left"
              maintenanceMap={maintenanceMap}
              pstState={pstState}
              prepState={prepState}
              onPSTTick={handlePSTTick}
              onPrepTick={handlePrepTick}
            />

            <PSTStablingSection
              title="EAST DEPOT STABLING — PST / TRAIN PREP"
              blockLabels={["BLOCK 1","BLOCK 2","BLOCK 3","BLOCK 4","BLOCK 5","BLOCK 6","BLOCK 7"]}
              blockIndices={[0, 1, 2, 3, 4, 5, 6]}
              roads={EAST_ROADS}
              data={eastData}
              labelSide="right"
              maintenanceMap={maintenanceMap}
              pstState={pstState}
              prepState={prepState}
              onPSTTick={handlePSTTick}
              onPrepTick={handlePrepTick}
            />
          </div>

          {/* Log Panel — expanded to use the empty space */}
          <div className="sticky top-0 min-w-0 w-full">
            <PSTLogOutput logLines={logLines} onRemove={handleRemoveLog} />
          </div>
        </div>
      </main>
    </div>
  );
}
