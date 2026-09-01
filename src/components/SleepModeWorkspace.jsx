import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble,
  Check,
  Clock3,
  Cloud,
  Copy,
  Download,
  Loader2,
  MessageSquareText,
  MoonStar,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildSleepModeExcelFileName, createSleepModeExcelBytes } from "@/lib/sleepModeExcel";
import {
  createSleepModeLogEntry,
  formatSleepTimeInput,
  getSleepModeDepot,
  getSleepModeRecordUpdatedMs,
  normalizeSleepLogTime,
  normalizeSleepModeLogs,
  normalizeSleepTrainId,
  selectLatestSleepModeRecord,
} from "@/lib/sleepModeLog";

const SLEEP_MODE_RECORD_KEY = "sleep-mode-main";
const SLEEP_MODE_CACHE_KEY = "slpSleepModeCache_v1";
const SLEEP_MODE_POLL_MS = 5_000;

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

function DepotSleepPanel({ depot, data, selectedKeys, latestModeByTrain, onToggle, onSelectDepot, onClearDepot }) {
  const layout = DEPOT_LAYOUTS[depot];
  const cells = useMemo(() => collectDepotCells(depot, data), [data, depot]);
  const occupiedCells = cells.filter((cell) => cell.trainId);
  const selectedCount = occupiedCells.filter((cell) => selectedKeys.has(cell.key)).length;
  const selectedAll = occupiedCells.length > 0 && selectedCount === occupiedCells.length;

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
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => onToggle(cell.key)}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? "Deselect" : "Select"} T${cell.trainId} at ${road}`}
                      data-sleep-mode={latestMode || "ready"}
                      className={`slp-stabling-train-card relative flex min-h-[74px] flex-col items-center justify-center rounded-lg border px-1 py-2 transition active:scale-[0.97] ${
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
    </section>
  );
}

function SleepLogOutputPanel({
  depot,
  logs,
  loaded,
  saving,
  confirmClear,
  onDownload,
  onCopy,
  onClear,
  onDelete,
}) {
  const layout = DEPOT_LAYOUTS[depot];
  const isWest = depot === "west";
  const badgeClass = isWest
    ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/35 dark:bg-violet-400/10 dark:text-violet-200"
    : "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/35 dark:bg-cyan-400/10 dark:text-cyan-200";

  return (
    <section
      data-sleep-log-depot={depot}
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#315574] dark:bg-[#061827]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#21435e] dark:bg-[#09243a]">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${badgeClass}`}>
              {layout.shortLabel}
            </span>
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">{layout.label} Log Output</h2>
          </div>
          <p className="mt-1 text-[9px] text-slate-500 dark:text-[#7fa5bd]">
            {logs.length} Sleep / Wake-up log entr{logs.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onDownload(depot)} disabled={!logs.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[9px] font-semibold text-emerald-700 disabled:opacity-40 dark:border-emerald-400/35 dark:bg-emerald-400/10 dark:text-emerald-200"><Download className="h-3.5 w-3.5" /> Download Excel</button>
          <button type="button" onClick={() => onCopy(depot)} disabled={!logs.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 text-[9px] font-semibold text-sky-700 disabled:opacity-40 dark:border-sky-400/35 dark:bg-sky-400/10 dark:text-sky-200"><Copy className="h-3.5 w-3.5" /> Copy All</button>
          <button type="button" onClick={() => onClear(depot)} disabled={!logs.length || saving} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 text-[9px] font-semibold text-rose-700 disabled:opacity-40 dark:border-rose-400/35 dark:bg-rose-400/10 dark:text-rose-200"><Trash2 className="h-3.5 w-3.5" /> {confirmClear ? `Confirm ${layout.shortLabel}` : "Clear All"}</button>
        </div>
      </header>
      <div className="min-h-[150px] p-3">
        {!loaded ? (
          <div className="flex min-h-[130px] items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-[#8fb7d1]"><Loader2 className="h-4 w-4 animate-spin" /> Loading {layout.label} log...</div>
        ) : logs.length ? (
          <ul className="space-y-2">
            {logs.map((entry) => (
              <li key={entry.id} className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${entry.mode === "sleep" ? "border-indigo-200 bg-indigo-50 dark:border-indigo-400/25 dark:bg-indigo-400/[0.07]" : "border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[0.07]"}`}>
                {entry.mode === "sleep" ? <MoonStar className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" /> : <Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />}
                <p className="min-w-0 flex-1 font-mono text-[12px] leading-5 text-slate-800 dark:text-slate-100">{entry.text}</p>
                <button type="button" onClick={() => onDelete(entry.id)} disabled={saving} aria-label={`Delete ${entry.text}`} title="Delete log entry" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-100 disabled:opacity-40 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/15"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-[130px] flex-col items-center justify-center text-center">
            <BedDouble className="h-8 w-8 text-slate-300 dark:text-[#456980]" />
            <p className="mt-3 text-[13px] font-medium text-slate-700 dark:text-slate-200">No {layout.label} entries yet.</p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-[#7f9fb5]">Select trains from {layout.shortLabel} stabling and add the required mode.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function SleepModeWorkspace({ westData = {}, eastData = {} }) {
  const [logs, setLogs] = useState(() => loadSleepModeCache());
  const [selectedKeyList, setSelectedKeyList] = useState([]);
  const [logTime, setLogTime] = useState(() => getCurrentTime());
  const [logRemark, setLogRemark] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading live Sleep log...");
  const [confirmClearDepot, setConfirmClearDepot] = useState("");

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
      })
      .catch((error) => {
        console.error("Sleep Mode live save failed:", error);
        setSyncStatus("Saved locally \u00b7 cloud retry needed");
      })
      .finally(() => {
        pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
        if (pendingSavesRef.current === 0) setSaving(false);
      });
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

  const addSelectedLogs = useCallback((mode) => {
    const normalizedTime = normalizeSleepLogTime(logTime);
    if (!selectedCells.length || !normalizedTime) return;
    const groups = new Map();
    selectedCells.forEach((cell) => {
      if (!groups.has(cell.road)) groups.set(cell.road, []);
      groups.get(cell.road).push(cell.trainId);
    });
    const nowMs = Date.now();
    const newLogs = Array.from(groups.entries()).map(([location, trainIds], index) => createSleepModeLogEntry({
      time: normalizedTime,
      trainIds,
      location,
      mode,
      remark: logRemark,
    }, { now: new Date(nowMs + index).toISOString() }));
    persistLogs([...logs, ...newLogs]);
    setSelectedKeyList([]);
    setLogTime(getCurrentTime());
    setLogRemark("");
  }, [logRemark, logTime, logs, persistLogs, selectedCells]);

  const copyLogs = useCallback(async (depot) => {
    const depotLogs = logsByDepot[depot] || [];
    if (!depotLogs.length) return;
    try {
      await navigator.clipboard.writeText(depotLogs.map((entry) => entry.text).join("\n"));
    } catch (error) {
      console.error("Sleep Mode log copy failed:", error);
    }
  }, [logsByDepot]);

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

  const refreshNow = useCallback(async () => {
    if (pendingSavesRef.current > 0) return;
    setSyncStatus("Refreshing live Sleep log...");
    try {
      const latest = await fetchLatest(true);
      if (!latest) setSyncStatus("Live ready \u00b7 no logs yet");
    } catch (error) {
      console.error("Sleep Mode refresh failed:", error);
      setSyncStatus("Cloud unavailable \u00b7 local cache ready");
    }
  }, [fetchLatest]);

  const handleClearLogs = useCallback((depot) => {
    if (!DEPOT_LAYOUTS[depot]) return;
    if (confirmClearDepot !== depot) {
      setConfirmClearDepot(depot);
      window.setTimeout(() => setConfirmClearDepot((current) => current === depot ? "" : current), 3_000);
      return;
    }
    persistLogs(logs.filter((entry) => getSleepModeDepot(entry.location) !== depot));
    setConfirmClearDepot("");
  }, [confirmClearDepot, logs, persistLogs]);

  const deleteLog = useCallback((entryId) => {
    persistLogs(logs.filter((entry) => entry.id !== entryId));
  }, [logs, persistLogs]);

  const validLogTime = Boolean(normalizeSleepLogTime(logTime));

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-4 pb-10">
      <header className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-[#315574] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(139,92,246,0.12),transparent_32%),linear-gradient(145deg,#092139,#061827)] dark:shadow-[0_20px_55px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/35 dark:bg-violet-400/10 dark:text-violet-200">
            <BedDouble className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-wide text-slate-900 dark:text-white">SLP — Sleep Mode</h1>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">Live</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-[#8fb7d1]">Select trains from live stabling, then record Sleep or Wake-up mode by location.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-600 dark:border-[#315574] dark:bg-[#071827] dark:text-[#9bc7e4]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5 text-emerald-500" />}
            {syncStatus}
          </div>
          <button type="button" onClick={refreshNow} disabled={!loaded || saving} title="Refresh Sleep log from cloud" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-40 dark:border-[#315574] dark:text-[#9bc7e4] dark:hover:border-violet-400 dark:hover:text-violet-200">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <DepotSleepPanel depot="west" data={westData} selectedKeys={selectedKeys} latestModeByTrain={latestModeByTrain} onToggle={toggleSelection} onSelectDepot={selectDepot} onClearDepot={clearDepotSelection} />
        <DepotSleepPanel depot="east" data={eastData} selectedKeys={selectedKeys} latestModeByTrain={latestModeByTrain} onToggle={toggleSelection} onSelectDepot={selectDepot} onClearDepot={clearDepotSelection} />
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#315574] dark:bg-[#071827]">
        <label className="block w-full min-w-[150px] sm:w-[190px]">
          <span className="flex h-[58px] flex-col justify-center rounded-xl border border-sky-400 bg-sky-50/70 px-3 shadow-[0_0_0_2px_rgba(56,189,248,0.08)] transition focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200 dark:border-[#3486d9] dark:bg-[#0a2240] dark:shadow-[0_0_12px_rgba(59,130,246,0.16)] dark:focus-within:border-[#5da8ff] dark:focus-within:ring-blue-500/20">
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-sky-800 dark:text-white">
              <Clock3 className="h-3.5 w-3.5 text-sky-600 dark:text-[#62a9ff]" /> Time
            </span>
            <input
              value={logTime}
              inputMode="numeric"
              maxLength={5}
              onChange={(event) => setLogTime(formatSleepTimeInput(event.target.value))}
              onBlur={() => setLogTime((current) => normalizeSleepLogTime(current) || current)}
              placeholder="00:00"
              aria-label="Sleep or wake-up log time"
              className="mt-1 w-full bg-transparent text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-[#4f7394]"
            />
          </span>
        </label>
        <label className="block min-w-[260px] flex-[1.4]">
          <span className="flex h-[58px] flex-col justify-center rounded-xl border border-slate-300 bg-slate-50/70 px-3 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200 dark:border-[#315574] dark:bg-[#0a2134] dark:focus-within:border-violet-400 dark:focus-within:ring-violet-400/20">
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-white">
              <MessageSquareText className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" /> Remark optional
            </span>
            <input
              value={logRemark}
              onChange={(event) => setLogRemark(event.target.value.slice(0, 160))}
              placeholder="Add remark"
              aria-label="Sleep or wake-up remark"
              className="mt-1 w-full bg-transparent text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-[#4f7394]"
            />
          </span>
        </label>
        <div className="min-w-[160px] flex-1">
          <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{selectedCells.length} train{selectedCells.length === 1 ? "" : "s"} selected</p>
          <p className="mt-1 text-[9px] text-slate-500 dark:text-[#759ab2]">Trains on the same stabling road are combined into one log line.</p>
        </div>
        <button type="button" onClick={() => addSelectedLogs("sleep")} disabled={!selectedCells.length || !validLogTime || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-500 bg-indigo-600 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_7px_18px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
          <MoonStar className="h-4 w-4" /> Log Sleep
        </button>
        <button type="button" onClick={() => addSelectedLogs("wake")} disabled={!selectedCells.length || !validLogTime || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-500 bg-amber-500 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-950 shadow-[0_7px_18px_rgba(245,158,11,0.20)] transition hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
          <Sun className="h-4 w-4" /> Log Wake-up
        </button>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {(["west", "east"]).map((depot) => (
          <SleepLogOutputPanel
            key={depot}
            depot={depot}
            logs={logsByDepot[depot]}
            loaded={loaded}
            saving={saving}
            confirmClear={confirmClearDepot === depot}
            onDownload={downloadExcel}
            onCopy={copyLogs}
            onClear={handleClearLogs}
            onDelete={deleteLog}
          />
        ))}
      </div>
    </section>
  );
}
