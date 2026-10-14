import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  MoonStar,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import "../copyFeedbackSlate.css";
import "../outputWindowsSlate.css";
import "../sleepLogSlate.css";
import {
  SLEEP_EXCEL_COPY_SHIFTS,
  buildSleepModeExcelClipboardText,
  buildSleepModeExcelFileName,
  createSleepModeExcelBytes,
} from "@/lib/sleepModeExcel";
import {
  buildSleepModeGroupedText,
  clearSleepModeTrainLogs,
  createSleepModeLogEntry,
  formatSleepTimeInput,
  getSleepModeDepot,
  getSleepModeRecordUpdatedMs,
  groupSleepModeLogs,
  normalizeSleepLogTime,
  normalizeSleepModeLogs,
  normalizeSleepTrainId,
  selectLatestSleepModeRecord,
} from "@/lib/sleepModeLog";

const SLEEP_MODE_RECORD_KEY = "sleep-mode-main";
const SLEEP_MODE_CACHE_KEY = "slpSleepModeCache_v1";
const SLEEP_MODE_POLL_MS = 5_000;

function useSleepLogActionFeedback() {
  const [actionStatuses, setActionStatuses] = useState({});
  const timersRef = useRef(new Map());
  const attemptsRef = useRef(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    const attempts = attemptsRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
      attempts.clear();
    };
  }, []);

  const runActionWithFeedback = useCallback(async (key, action, successStatus) => {
    const attempt = (attemptsRef.current.get(key) || 0) + 1;
    attemptsRef.current.set(key, attempt);
    clearTimeout(timersRef.current.get(key));
    setActionStatuses((current) => ({ ...current, [key]: "pending" }));
    let succeeded = false;
    try {
      succeeded = await action() !== false;
    } catch (error) {
      console.error("Sleep Mode action failed:", error);
    }
    if (!mountedRef.current || attemptsRef.current.get(key) !== attempt) return succeeded;
    setActionStatuses((current) => ({ ...current, [key]: succeeded ? successStatus : "failed" }));
    timersRef.current.set(key, setTimeout(() => {
      setActionStatuses((current) => ({ ...current, [key]: "" }));
      timersRef.current.delete(key);
    }, 2500));
    return succeeded;
  }, []);

  return { actionStatuses, runActionWithFeedback };
}

const DEPOT_LAYOUTS = {
  west: {
    label: "West Depot",
    shortLabel: "WD",
    roads: ["WD-ST15", "WD-ST14", "WD-ST13", "WD-ST12"],
    blockLabels: ["BLOCK 7", "BLOCK 6", "BLOCK 5", "BLOCK 4", "BLOCK 3", "BLOCK 2", "BLOCK 1"],
    blockIndices: [6, 5, 4, 3, 2, 1, 0],
  },
  east: {
    label: "East Depot",
    shortLabel: "ED",
    roads: ["ED-ST02", "ED-ST03"],
    blockLabels: ["BLOCK 1", "BLOCK 2", "BLOCK 3", "BLOCK 4", "BLOCK 5", "BLOCK 6", "BLOCK 7"],
    blockIndices: [0, 1, 2, 3, 4, 5, 6],
  },
};

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getSleepModeEntity() {
  return base44?.entities?.SleepModeLog || null;
}

function isSleepModeEntityReady(entity = getSleepModeEntity()) {
  return Boolean(entity?.filter && entity?.create && entity?.update);
}

function loadSleepModeCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(SLEEP_MODE_CACHE_KEY) || "{}");
    return normalizeSleepModeLogs(cached.logs || []);
  } catch {
    return [];
  }
}

function saveSleepModeCache(logs, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(SLEEP_MODE_CACHE_KEY, JSON.stringify({
      recordKey: SLEEP_MODE_RECORD_KEY,
      logs: normalizeSleepModeLogs(logs),
      updatedAt,
    }));
  } catch {
    // Cloud sync remains available when local storage is blocked.
  }
}

function formatSyncTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getCellKey(depot, road, blockIndex, trainId) {
  return `${depot}:${road}:${blockIndex}:${trainId}`;
}

function collectDepotCells(depot, data = {}) {
  const layout = DEPOT_LAYOUTS[depot];
  if (!layout) return [];

  return layout.roads.flatMap((road) => layout.blockIndices.map((blockIndex, displayIndex) => {
    const trainId = normalizeSleepTrainId(data?.[road]?.[blockIndex]?.trainId || "");
    return {
      depot,
      road,
      blockIndex,
      displayIndex,
      trainId,
      key: trainId ? getCellKey(depot, road, blockIndex, trainId) : `${depot}:${road}:${blockIndex}:empty`,
    };
  }));
}

function DepotSleepPanel({
  depot,
  data,
  selectedKeys,
  latestModeByTrain,
  logDraft,
  loaded,
  saving,
  onToggle,
  onSelectDepot,
  onClearDepot,
  onClearTrain,
  onTimeChange,
  onRemarkChange,
  onUseCurrentTime,
  onAddLogs,
}) {
  const layout = DEPOT_LAYOUTS[depot];
  const cells = useMemo(() => collectDepotCells(depot, data), [data, depot]);
  const occupiedCells = cells.filter((cell) => cell.trainId);
  const selectedCount = occupiedCells.filter((cell) => selectedKeys.has(cell.key)).length;
  const selectedAll = occupiedCells.length > 0 && selectedCount === occupiedCells.length;
  const canSubmitLog = Boolean(normalizeSleepLogTime(logDraft?.time)) && Boolean(logDraft?.timeConfirmed);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#28506d] dark:bg-[#061827]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#21435e] dark:bg-[#09243a]">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-700 dark:border-violet-400/35 dark:bg-violet-400/10 dark:text-violet-200">
              {layout.shortLabel}
            </span>
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">{layout.label} Stabling</h2>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-[#8eb5d1]">Select trains to record Sleep or Wake-up mode.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:border-[#315574] dark:bg-[#071827] dark:text-[#a9c7da]">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={() => onSelectDepot(depot, occupiedCells)}
            disabled={!occupiedCells.length}
            className="h-8 rounded-lg border border-violet-300 bg-violet-50 px-3 text-[10px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-40 dark:border-violet-400/40 dark:bg-violet-400/10 dark:text-violet-200 dark:hover:bg-violet-400/20"
          >
            {selectedAll ? "Selected All" : "Select All"}
          </button>
          <button
            type="button"
            onClick={() => onClearDepot(depot)}
            disabled={!selectedCount}
            className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 dark:border-[#315574] dark:bg-[#071827] dark:text-[#9bc7e4] dark:hover:border-rose-400/50 dark:hover:text-rose-200"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="overflow-x-auto p-3">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[76px_repeat(7,minmax(76px,1fr))] gap-1">
            <div />
            {layout.blockLabels.map((label) => (
              <div key={label} className="slp-stabling-block-label px-1 py-1 text-center font-bold uppercase text-slate-500 dark:text-[#78b9df]">
                {label}
              </div>
            ))}

            {layout.roads.flatMap((road) => {
              const roadCells = layout.blockIndices.map((blockIndex) => cells.find(
                (cell) => cell.road === road && cell.blockIndex === blockIndex,
              ));
              return [
                <div key={`${road}:label`} className="slp-stabling-road-label flex min-h-[74px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-2 font-black text-slate-700 dark:border-[#24445e] dark:bg-[#0a2a43] dark:text-[#b8e2fa]">
                  {road}
                </div>,
                ...roadCells.map((cell) => {
                  const isSelected = cell?.trainId && selectedKeys.has(cell.key);
                  const latestMode = cell?.trainId ? latestModeByTrain.get(cell.trainId) : "";
                  return cell?.trainId ? (
                    <div key={cell.key} className="relative min-w-0">
                      <button
                        type="button"
                        onClick={() => onToggle(cell.key)}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? "Deselect" : "Select"} T${cell.trainId} at ${road}`}
                        data-sleep-mode={latestMode || "ready"}
                        className={`slp-stabling-train-card relative flex h-full min-h-[74px] w-full flex-col items-center justify-center rounded-lg border px-1 py-2 transition active:scale-[0.97] ${
                          isSelected
                            ? "border-violet-500 bg-violet-100 text-violet-950 shadow-[0_0_0_2px_rgba(139,92,246,0.16)] dark:border-violet-300 dark:bg-violet-400/20 dark:text-white"
                            : "border-slate-300 bg-white text-slate-900 hover:border-violet-400 hover:bg-violet-50 dark:border-[#2b5674] dark:bg-[#0a2134] dark:text-white dark:hover:border-violet-400/70 dark:hover:bg-violet-400/10"
                        }`}
                      >
                        {isSelected && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-violet-600 dark:text-violet-200" strokeWidth={3} />}
                        <span className="slp-stabling-train-id font-black">{cell.trainId}</span>
                        <span data-mode={latestMode || "ready"} className={`slp-stabling-mode-pill mt-1 rounded-full px-2 py-0.5 font-semibold uppercase ${
                          latestMode === "sleep"
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200"
                            : latestMode === "wake"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                              : "bg-slate-100 text-slate-500 dark:bg-[#102f47] dark:text-[#759ab2]"
                        }`}
                        >
                          {latestMode === "sleep" ? "Sleep" : latestMode === "wake" ? "Wake" : "Ready"}
                        </span>
                      </button>
                      {latestMode && (
                        <button
                          type="button"
                          onClick={() => onClearTrain(cell.trainId)}
                          disabled={!loaded || saving}
                          className="slp-stabling-train-clear"
                          aria-label={`Clear Sleep/Wake-up logs for T${cell.trainId}`}
                          title={`Clear T${cell.trainId} logs and reset to Ready`}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div key={cell.key} className="flex min-h-[74px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[9px] text-slate-300 dark:border-[#21435e] dark:bg-[#071827] dark:text-[#375a71]">
                      —
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      </div>

      <footer data-sleep-entry-controls={depot} className="border-t border-slate-200 bg-slate-50/60 px-3 py-3 dark:border-[#21435e] dark:bg-[#071827]">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full min-w-[140px] sm:w-[150px]">
            <div className="flex h-[54px] flex-col justify-center rounded-xl border border-sky-400 bg-sky-50/70 px-3 shadow-[0_0_0_2px_rgba(56,189,248,0.08)] transition focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200 dark:border-[#3486d9] dark:bg-[#0a2240] dark:shadow-[0_0_12px_rgba(59,130,246,0.16)] dark:focus-within:border-[#5da8ff] dark:focus-within:ring-blue-500/20">
              <label htmlFor={`slp-log-time-${depot}`} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-sky-800 dark:text-white">
                <Clock3 className="h-3.5 w-3.5 text-sky-600 dark:text-[#62a9ff]" /> Time
              </label>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <input
                  id={`slp-log-time-${depot}`}
                  value={logDraft?.time || ""}
                  inputMode="numeric"
                  maxLength={5}
                  onChange={(event) => onTimeChange(depot, formatSleepTimeInput(event.target.value))}
                  onBlur={() => {
                    const normalized = normalizeSleepLogTime(logDraft?.time);
                    if (normalized && normalized !== logDraft?.time) onTimeChange(depot, normalized);
                  }}
                  placeholder="00:00"
                  aria-label={`${layout.label} sleep or wake-up log time`}
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-[#4f7394]"
                />
                <button
                  type="button"
                  onClick={() => onUseCurrentTime(depot)}
                  title="Use current time and enable logging"
                  aria-label={`Set ${layout.label} SLP time to the current time`}
                  className="theme-movement-time-refresh inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/20 text-emerald-600 shadow-[0_0_8px_rgba(52,211,153,0.22)] transition hover:border-emerald-500 hover:bg-emerald-500/35 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 dark:text-emerald-300 dark:hover:border-emerald-300 dark:hover:text-white"
                >
                  <RefreshCw size={10} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <label className="min-w-[180px] flex-1">
            <span className="flex h-[54px] flex-col justify-center rounded-xl border border-slate-300 bg-white/80 px-3 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200 dark:border-[#315574] dark:bg-[#0a2134] dark:focus-within:border-violet-400 dark:focus-within:ring-violet-400/20">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-white">
                <MessageSquareText className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" /> Remark optional
              </span>
              <input
                value={logDraft?.remark || ""}
                onChange={(event) => onRemarkChange(depot, event.target.value.slice(0, 160))}
                placeholder="Add remark"
                aria-label={`${layout.label} sleep or wake-up remark`}
                className="mt-1 w-full bg-transparent text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-[#4f7394]"
              />
            </span>
          </label>

          <button type="button" onClick={() => onAddLogs(depot, "sleep")} disabled={!selectedCount || !canSubmitLog || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-500 bg-indigo-600 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-[0_7px_18px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
            <MoonStar className="h-4 w-4" /> Log Sleep
          </button>
          <button type="button" onClick={() => onAddLogs(depot, "wake")} disabled={!selectedCount || !canSubmitLog || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-500 bg-amber-500 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-[0_7px_18px_rgba(245,158,11,0.20)] transition hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
            <Sun className="h-4 w-4" /> Log Wake-up
          </button>
        </div>
      </footer>
    </section>
  );
}

function SleepLogGroup({ mode, entries, saving, onDelete }) {
  if (!entries.length) return null;
  const isSleep = mode === "sleep";
  const title = isSleep ? "Sleep Mode" : "Wake-up Mode";

  return (
    <section data-sleep-log-mode={mode} className="sleep-log-text-group">
      <h4 className="sleep-log-mode-title">{title}</h4>
      <ul className="sleep-log-lines">
        {entries.map((entry) => (
          <li key={entry.id} className="sleep-log-line">
            <button type="button" onClick={() => onDelete(entry.id)} disabled={saving} aria-label={`Delete ${entry.text}`} title="Delete log entry" className="sleep-log-line-delete"><Trash2 size={12} /></button>
            <p className="sleep-log-line-text">{entry.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SleepLogOutputPanel({
  depot,
  logs,
  loaded,
  saving,
  confirmClear,
  copyStatus = "",
  excelCopyStatuses = {},
  clearStatus = "",
  onDownload,
  onCopy,
  onCopyExcel,
  onClear,
  onDelete,
}) {
  const layout = DEPOT_LAYOUTS[depot];
  const groupedLogs = useMemo(() => groupSleepModeLogs(logs), [logs]);
  const copied = copyStatus === "copied";
  const cleared = clearStatus === "cleared";
  const copying = copyStatus === "pending";
  const clearing = clearStatus === "pending";

  return (
    <section
      data-sleep-log-depot={depot}
      aria-label={`${layout.label} Log Output`}
      className="theme-sleep-log-output"
    >
      <header className="sleep-log-card-header">
        <div className="sleep-log-depot-heading">
          <span className="sleep-log-depot-dot" data-depot={depot} aria-hidden="true" />
          <h3 className="sleep-log-depot-title">{layout.label} Sleep / Wake-up Log</h3>
          <span className="sleep-log-entry-count">{logs.length} entr{logs.length === 1 ? "y" : "ies"}</span>
        </div>
        <div className="sleep-log-card-actions">
          <button type="button" onClick={() => onDownload(depot)} disabled={!logs.length} className="slate-window-action" data-slp-excel-action="download"><Download size={14} /> Download Excel</button>
          {SLEEP_EXCEL_COPY_SHIFTS.map(({ key, label, range }) => {
            const status = excelCopyStatuses[`copy-excel-${depot}-${key}`] || "";
            const pending = status === "pending";
            return (
              <button
                key={key}
                type="button"
                onClick={() => onCopyExcel(depot, key)}
                disabled={!loaded || !logs.length || pending}
                data-copy-state={status || "idle"}
                aria-busy={pending}
                aria-label={`${layout.label}: copy ${label} Shift Excel (${range})`}
                title={`Paste into ${range}: 47 train rows, Date through Remarks`}
                className="slate-window-action slate-copy-feedback"
                data-slp-excel-action={key}
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span aria-live="polite">{pending ? `Copying ${label}...` : status === "copied" ? `${label} copied` : status === "failed" ? `${label} copy failed` : `Copy ${label} Excel`}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => onCopy(depot)} disabled={!logs.length || copying} data-copy-state={copyStatus || "idle"} aria-busy={copying} className="slate-window-action slate-copy-feedback">
            {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span aria-live="polite">{copying ? "Copying..." : copied ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy All"}</span>
          </button>
          <button type="button" onClick={() => onClear(depot)} disabled={!logs.length || saving || clearing} data-action-state={clearStatus || "idle"} aria-busy={clearing} className="slate-window-action slate-action-feedback">
            {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cleared ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span aria-live="polite">{clearing ? "Clearing..." : cleared ? "Cleared" : clearStatus === "failed" ? "Sync pending" : confirmClear ? `Confirm ${layout.shortLabel}` : "Clear All"}</span>
          </button>
        </div>
      </header>
      <div className="sleep-log-card-body">
        {!loaded ? (
          <div className="sleep-log-empty"><Loader2 className="h-4 w-4 animate-spin" /> Loading {layout.label} log...</div>
        ) : logs.length ? (
          <div className="sleep-log-text">
            <SleepLogGroup mode="sleep" entries={groupedLogs.sleep} saving={saving} onDelete={onDelete} />
            <SleepLogGroup mode="wake" entries={groupedLogs.wake} saving={saving} onDelete={onDelete} />
          </div>
        ) : (
          <div className="sleep-log-empty">
            <FileText size={16} aria-hidden="true" />
            <p>No {layout.label} entries yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function SleepModeWorkspace({ westData = {}, eastData = {} }) {
  const [logs, setLogs] = useState(() => loadSleepModeCache());
  const [selectedKeyList, setSelectedKeyList] = useState([]);
  const [logDrafts, setLogDrafts] = useState(() => {
    return {
      west: { time: "00:00", remark: "", timeConfirmed: false },
      east: { time: "00:00", remark: "", timeConfirmed: false },
    };
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading live Sleep log...");
  const [confirmClearDepot, setConfirmClearDepot] = useState("");
  const [trainToClear, setTrainToClear] = useState("");
  const { actionStatuses, runActionWithFeedback } = useSleepLogActionFeedback();

  const recordIdRef = useRef(null);
  const appliedUpdatedMsRef = useRef(0);
  const pendingSavesRef = useRef(0);
  const saveQueueRef = useRef(Promise.resolve());
  const selectedKeys = useMemo(() => new Set(selectedKeyList), [selectedKeyList]);
  const allCells = useMemo(() => [
    ...collectDepotCells("west", westData),
    ...collectDepotCells("east", eastData),
  ], [eastData, westData]);
  const occupiedKeys = useMemo(() => new Set(allCells.filter((cell) => cell.trainId).map((cell) => cell.key)), [allCells]);

  useEffect(() => {
    setSelectedKeyList((current) => current.filter((key) => occupiedKeys.has(key)));
  }, [occupiedKeys]);

  const applyRemoteRecord = useCallback((record, force = false) => {
    if (!record) return false;
    const remoteUpdatedMs = getSleepModeRecordUpdatedMs(record);
    if (!force && remoteUpdatedMs <= appliedUpdatedMsRef.current) return false;
    const normalizedLogs = normalizeSleepModeLogs(record.logs);
    recordIdRef.current = record.id || recordIdRef.current;
    appliedUpdatedMsRef.current = remoteUpdatedMs;
    setLogs(normalizedLogs);
    saveSleepModeCache(normalizedLogs, record.updatedAt || record.updated_date);
    setSyncStatus(`Live synced${formatSyncTime(record.updatedAt || record.updated_date) ? ` ${formatSyncTime(record.updatedAt || record.updated_date)}` : ""}`);
    return true;
  }, []);

  const fetchLatest = useCallback(async (force = false) => {
    const entity = getSleepModeEntity();
    if (!isSleepModeEntityReady(entity)) {
      setSyncStatus("Local cache only \u00b7 cloud unavailable");
      return null;
    }
    const records = await entity.filter({ recordKey: SLEEP_MODE_RECORD_KEY });
    const latest = selectLatestSleepModeRecord(records, SLEEP_MODE_RECORD_KEY);
    if (latest) applyRemoteRecord(latest, force);
    return latest;
  }, [applyRemoteRecord]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await fetchLatest(true);
        if (!latest) setSyncStatus(logs.length ? "Local cache ready \u00b7 no cloud copy yet" : "Live ready \u00b7 no logs yet");
      } catch (error) {
        console.error("Sleep Mode live load failed:", error);
        setSyncStatus("Cloud unavailable \u00b7 local cache ready");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchLatest]);

  useEffect(() => {
    if (!loaded) return undefined;
    const intervalId = window.setInterval(async () => {
      if (pendingSavesRef.current > 0) return;
      try {
        await fetchLatest(false);
      } catch (error) {
        console.error("Sleep Mode polling failed:", error);
      }
    }, SLEEP_MODE_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchLatest, loaded]);

  const persistLogs = useCallback((nextLogs) => {
    const normalizedLogs = normalizeSleepModeLogs(nextLogs);
    const updatedAt = new Date().toISOString();
    setLogs(normalizedLogs);
    saveSleepModeCache(normalizedLogs, updatedAt);
    setSaving(true);
    setSyncStatus("Saving live...");
    pendingSavesRef.current += 1;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => null)
      .then(async () => {
        const entity = getSleepModeEntity();
        if (!isSleepModeEntityReady(entity)) throw new Error("Sleep Mode cloud entity unavailable");
        const payload = { recordKey: SLEEP_MODE_RECORD_KEY, logs: normalizedLogs, updatedAt };
        let recordId = recordIdRef.current;
        if (!recordId) {
          const records = await entity.filter({ recordKey: SLEEP_MODE_RECORD_KEY });
          recordId = selectLatestSleepModeRecord(records, SLEEP_MODE_RECORD_KEY)?.id || null;
        }
        let savedRecord;
        if (recordId) {
          try {
            savedRecord = await entity.update(recordId, payload);
          } catch (error) {
            if (error?.status !== 404) throw error;
            savedRecord = await entity.create(payload);
          }
        } else {
          savedRecord = await entity.create(payload);
        }
        recordIdRef.current = savedRecord?.id || recordId;
        appliedUpdatedMsRef.current = Math.max(
          getSleepModeRecordUpdatedMs(savedRecord),
          Date.parse(updatedAt) || Date.now(),
        );
        setSyncStatus(`Live saved ${formatSyncTime(savedRecord?.updatedAt || updatedAt)}`);
        return true;
      })
      .catch((error) => {
        console.error("Sleep Mode live save failed:", error);
        setSyncStatus("Saved locally \u00b7 cloud retry needed");
        return false;
      })
      .finally(() => {
        pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
        if (pendingSavesRef.current === 0) setSaving(false);
      });
    return saveQueueRef.current;
  }, []);

  const latestModeByTrain = useMemo(() => {
    const result = new Map();
    logs.forEach((entry) => entry.trainIds.forEach((trainId) => result.set(trainId, entry.mode)));
    return result;
  }, [logs]);

  const selectedCells = useMemo(
    () => allCells.filter((cell) => cell.trainId && selectedKeys.has(cell.key)),
    [allCells, selectedKeys],
  );
  const logsByDepot = useMemo(() => {
    const groupedLogs = { west: [], east: [] };
    logs.forEach((entry) => {
      const depot = getSleepModeDepot(entry.location);
      if (groupedLogs[depot]) groupedLogs[depot].push(entry);
    });
    return groupedLogs;
  }, [logs]);

  const toggleSelection = useCallback((key) => {
    setSelectedKeyList((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  }, []);

  const selectDepot = useCallback((depot, cells) => {
    const keys = cells.map((cell) => cell.key);
    setSelectedKeyList((current) => Array.from(new Set([...current, ...keys])));
  }, []);

  const clearDepotSelection = useCallback((depot) => {
    setSelectedKeyList((current) => current.filter((key) => !key.startsWith(`${depot}:`)));
  }, []);

  const updateLogDraft = useCallback((depot, updates) => {
    if (!DEPOT_LAYOUTS[depot]) return;
    setLogDrafts((current) => ({
      ...current,
      [depot]: { ...current[depot], ...updates },
    }));
  }, []);

  const addSelectedLogs = useCallback((depot, mode) => {
    const depotSelectedCells = selectedCells.filter((cell) => cell.depot === depot);
    const logDraft = logDrafts[depot] || {};
    const normalizedTime = normalizeSleepLogTime(logDraft.time);
    if (!depotSelectedCells.length || !normalizedTime || !logDraft.timeConfirmed) return;
    const groups = new Map();
    depotSelectedCells.forEach((cell) => {
      if (!groups.has(cell.road)) groups.set(cell.road, []);
      groups.get(cell.road).push(cell.trainId);
    });
    const nowMs = Date.now();
    const newLogs = Array.from(groups.entries()).map(([location, trainIds], index) => createSleepModeLogEntry({
      time: normalizedTime,
      trainIds,
      location,
      mode,
      remark: logDraft.remark,
    }, { now: new Date(nowMs + index).toISOString() }));
    persistLogs([...logs, ...newLogs]);
    setSelectedKeyList((current) => current.filter((key) => !key.startsWith(`${depot}:`)));
    setLogDrafts((current) => ({
      ...current,
      [depot]: { time: "00:00", remark: "", timeConfirmed: false },
    }));
  }, [logDrafts, logs, persistLogs, selectedCells]);

  const clearTrainLogs = useCallback((trainId) => {
    const normalizedTrainId = normalizeSleepTrainId(trainId);
    if (!loaded || saving || pendingSavesRef.current > 0 || !latestModeByTrain.has(normalizedTrainId)) return;
    if (normalizedTrainId !== trainToClear) return;
    persistLogs(clearSleepModeTrainLogs(logs, normalizedTrainId));
    setSelectedKeyList((current) => current.filter((key) => !key.endsWith(`:${normalizedTrainId}`)));
    setConfirmClearDepot("");
    setTrainToClear("");
  }, [latestModeByTrain, loaded, logs, persistLogs, saving, trainToClear]);

  const copyLogs = useCallback(async (depot) => {
    const depotLogs = logsByDepot[depot] || [];
    if (!depotLogs.length) return;
    await runActionWithFeedback(`copy-${depot}`, async () => {
      await navigator.clipboard.writeText(buildSleepModeGroupedText(depotLogs));
      return true;
    }, "copied");
  }, [logsByDepot, runActionWithFeedback]);

  const downloadExcel = useCallback((depot) => {
    const depotLogs = logsByDepot[depot] || [];
    const layout = DEPOT_LAYOUTS[depot];
    if (!depotLogs.length || !layout) return;
    const bytes = createSleepModeExcelBytes(depotLogs);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildSleepModeExcelFileName(depotLogs, undefined, layout.shortLabel);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }, [logsByDepot]);

  const copyExcel = useCallback(async (depot, shiftKey) => {
    if (!loaded || !DEPOT_LAYOUTS[depot] || !SLEEP_EXCEL_COPY_SHIFTS.some(({ key }) => key === shiftKey)) return;
    const depotLogs = logsByDepot[depot] || [];
    if (!depotLogs.length) return;
    await runActionWithFeedback(`copy-excel-${depot}-${shiftKey}`, async () => {
      await navigator.clipboard.writeText(buildSleepModeExcelClipboardText(depotLogs, shiftKey));
      return true;
    }, "copied");
  }, [loaded, logsByDepot, runActionWithFeedback]);

  const handleClearLogs = useCallback(async (depot) => {
    if (!DEPOT_LAYOUTS[depot] || saving || !logsByDepot[depot]?.length) return;
    if (confirmClearDepot !== depot) {
      setConfirmClearDepot(depot);
      window.setTimeout(() => setConfirmClearDepot((current) => current === depot ? "" : current), 3_000);
      return;
    }
    setConfirmClearDepot("");
    await runActionWithFeedback(`clear-${depot}`, () => persistLogs(logs.filter((entry) => getSleepModeDepot(entry.location) !== depot)), "cleared");
  }, [confirmClearDepot, logs, logsByDepot, persistLogs, runActionWithFeedback, saving]);

  const deleteLog = useCallback((entryId) => {
    persistLogs(logs.filter((entry) => entry.id !== entryId));
  }, [logs, persistLogs]);

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-4 pb-10" aria-label="Sleep Mode workspace">
      <div className="grid gap-4 xl:grid-cols-2">
        <DepotSleepPanel depot="west" data={westData} selectedKeys={selectedKeys} latestModeByTrain={latestModeByTrain} logDraft={logDrafts.west} loaded={loaded} saving={saving} onToggle={toggleSelection} onSelectDepot={selectDepot} onClearDepot={clearDepotSelection} onClearTrain={setTrainToClear} onTimeChange={(depot, value) => updateLogDraft(depot, { time: value, timeConfirmed: Boolean(normalizeSleepLogTime(value)) })} onRemarkChange={(depot, value) => updateLogDraft(depot, { remark: value })} onUseCurrentTime={(depot) => updateLogDraft(depot, { time: getCurrentTime(), timeConfirmed: true })} onAddLogs={addSelectedLogs} />
        <DepotSleepPanel depot="east" data={eastData} selectedKeys={selectedKeys} latestModeByTrain={latestModeByTrain} logDraft={logDrafts.east} loaded={loaded} saving={saving} onToggle={toggleSelection} onSelectDepot={selectDepot} onClearDepot={clearDepotSelection} onClearTrain={setTrainToClear} onTimeChange={(depot, value) => updateLogDraft(depot, { time: value, timeConfirmed: Boolean(normalizeSleepLogTime(value)) })} onRemarkChange={(depot, value) => updateLogDraft(depot, { remark: value })} onUseCurrentTime={(depot) => updateLogDraft(depot, { time: getCurrentTime(), timeConfirmed: true })} onAddLogs={addSelectedLogs} />
      </div>

      <section className="theme-sleep-log-window" data-window-design="compact-slate" aria-label="Sleep / Wake-up Log Output">
        <header className="slate-window-header">
          <div className="slate-window-heading">
            <div className="slate-window-title-icon" aria-hidden="true"><FileText size={15} /></div>
            <div className="min-w-0">
              <h2 className="slate-window-title">Sleep / Wake-up Log Output</h2>
              <p className="slate-window-subtitle">Recorded from SLP</p>
            </div>
          </div>
        </header>
        <div className="slate-window-body sleep-log-depot-list">
          {(["west", "east"]).map((depot) => (
            <SleepLogOutputPanel
              key={depot}
              depot={depot}
              logs={logsByDepot[depot]}
              loaded={loaded}
              saving={saving}
              confirmClear={confirmClearDepot === depot}
              copyStatus={actionStatuses[`copy-${depot}`]}
              excelCopyStatuses={actionStatuses}
              clearStatus={actionStatuses[`clear-${depot}`]}
              onDownload={downloadExcel}
              onCopy={copyLogs}
              onCopyExcel={copyExcel}
              onClear={handleClearLogs}
              onDelete={deleteLog}
            />
          ))}
        </div>
      </section>
      <AlertDialog open={Boolean(trainToClear)} onOpenChange={(open) => { if (!open) setTrainToClear(""); }}>
        <AlertDialogContent className="border-slate-300 bg-white text-slate-900 dark:border-[#315574] dark:bg-[#0a2134] dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear T{trainToClear} logs?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 dark:text-[#a9c7da]">
              Remove all Sleep/Wake-up logs for T{trainToClear} and reset it to Ready.
              Other trains in grouped entries will be kept. The train will remain in stabling.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!loaded || saving} onClick={() => clearTrainLogs(trainToClear)} className="bg-rose-600 text-white hover:bg-rose-700">
              Clear T{trainToClear}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <span className="sr-only" role="status">{syncStatus}</span>
    </section>
  );
}
