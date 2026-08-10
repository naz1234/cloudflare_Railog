import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  buildChecklistScopeKey,
  createChecklistItem,
  DUTY_CHECKLIST_SHIFTS,
  getChecklistLocalDate,
  getChecklistRecordUpdatedMs,
  getChecklistShiftLabel,
  normalizeChecklistItems,
  selectLatestChecklistRecord,
} from "@/lib/checklistRecords";

const CHECKLIST_CACHE_KEY = "chkDutyChecklistCache_v1";
const CHECKLIST_POLL_INTERVAL_MS = 5_000;

function getChecklistEntity() {
  return base44?.entities?.ChecklistRecord || null;
}

function isChecklistEntityReady(entity = getChecklistEntity()) {
  return Boolean(entity?.filter && entity?.create && entity?.update);
}

function loadChecklistCache(scopeKey) {
  try {
    const cache = JSON.parse(localStorage.getItem(CHECKLIST_CACHE_KEY) || "{}");
    return normalizeChecklistItems(cache?.[scopeKey]?.items || []);
  } catch {
    return [];
  }
}

function saveChecklistCache(scopeKey, items, updatedAt = new Date().toISOString()) {
  try {
    const cache = JSON.parse(localStorage.getItem(CHECKLIST_CACHE_KEY) || "{}");
    cache[scopeKey] = { items: normalizeChecklistItems(items), updatedAt };
    localStorage.setItem(CHECKLIST_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Incognito may block localStorage. Cloud sync remains the source of truth.
  }
}

function formatSyncTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChecklistItemRow({ item, onToggle, onEdit, onDelete }) {
  return (
    <li className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:border-sky-300 dark:border-[#294b63] dark:bg-[#071827] dark:hover:border-cyan-400/60">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-label={item.completed ? `Mark ${item.text} incomplete` : `Mark ${item.text} complete`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
          item.completed
            ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.30)]"
            : "border-slate-300 bg-slate-50 text-transparent hover:border-emerald-400 dark:border-[#3d617a] dark:bg-[#0b2137]"
        }`}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>

      <span className={`min-w-0 flex-1 break-words text-[14px] leading-5 ${
        item.completed
          ? "text-slate-400 line-through dark:text-[#6f8aa0]"
          : "text-slate-800 dark:text-slate-100"
      }`}>
        {item.text}
      </span>

      <button
        type="button"
        onClick={() => onEdit(item)}
        title="Edit checklist item"
        aria-label={`Edit ${item.text}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 active:scale-90 dark:border-[#294b63] dark:text-[#8fb7d1] dark:hover:border-cyan-400 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-200"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        title="Delete checklist item"
        aria-label={`Delete ${item.text}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 text-rose-500 transition hover:border-rose-400 hover:bg-rose-50 active:scale-90 dark:border-rose-400/30 dark:bg-rose-500/5 dark:text-rose-300 dark:hover:bg-rose-500/15"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function ChecklistWorkspace() {
  const [selectedDate, setSelectedDate] = useState(() => getChecklistLocalDate());
  const [selectedShift, setSelectedShift] = useState("late");
  const [items, setItems] = useState([]);
  const [newItemText, setNewItemText] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [editText, setEditText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading live checklist...");

  const scopeKey = useMemo(
    () => buildChecklistScopeKey(selectedDate, selectedShift),
    [selectedDate, selectedShift],
  );
  const currentScopeRef = useRef(scopeKey);
  const recordIdsRef = useRef(new Map());
  const appliedUpdatedMsRef = useRef(new Map());
  const saveQueueRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const loadSequenceRef = useRef(0);

  useEffect(() => {
    currentScopeRef.current = scopeKey;
  }, [scopeKey]);

  const applyRemoteRecord = useCallback((record, requestedScope, force = false) => {
    if (!record || currentScopeRef.current !== requestedScope) return false;
    const remoteUpdatedMs = getChecklistRecordUpdatedMs(record);
    const appliedUpdatedMs = appliedUpdatedMsRef.current.get(requestedScope) || 0;
    if (!force && remoteUpdatedMs <= appliedUpdatedMs) return false;

    const normalizedItems = normalizeChecklistItems(record.items);
    recordIdsRef.current.set(requestedScope, record.id);
    appliedUpdatedMsRef.current.set(requestedScope, remoteUpdatedMs);
    setItems(normalizedItems);
    saveChecklistCache(requestedScope, normalizedItems, record.updatedAt || record.updated_date);
    setSyncStatus(`Live synced${formatSyncTime(record.updatedAt || record.updated_date) ? ` ${formatSyncTime(record.updatedAt || record.updated_date)}` : ""}`);
    return true;
  }, []);

  const fetchScopeRecord = useCallback(async (requestedScope, force = false) => {
    const entity = getChecklistEntity();
    if (!isChecklistEntityReady(entity)) {
      if (currentScopeRef.current === requestedScope) setSyncStatus("Local cache only · cloud unavailable");
      return null;
    }

    const records = await entity.filter({ scopeKey: requestedScope });
    const latest = selectLatestChecklistRecord(records, requestedScope);
    if (latest) applyRemoteRecord(latest, requestedScope, force);
    return latest;
  }, [applyRemoteRecord]);

  useEffect(() => {
    const requestedScope = scopeKey;
    const sequence = ++loadSequenceRef.current;
    const cachedItems = loadChecklistCache(requestedScope);
    setItems(cachedItems);
    setLoaded(false);
    setSaving(false);
    setEditingItem(null);
    setEditText("");
    setSyncStatus("Loading live checklist...");

    let cancelled = false;
    (async () => {
      try {
        const latest = await fetchScopeRecord(requestedScope, true);
        if (!latest && currentScopeRef.current === requestedScope) {
          setSyncStatus(cachedItems.length ? "Local cache ready · no cloud copy yet" : "Live ready · no items yet");
        }
      } catch (error) {
        console.error("Checklist live load failed:", error);
        if (currentScopeRef.current === requestedScope) setSyncStatus("Cloud unavailable · local cache ready");
      } finally {
        if (!cancelled && sequence === loadSequenceRef.current) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchScopeRecord, scopeKey]);

  useEffect(() => {
    if (!loaded) return undefined;
    const requestedScope = scopeKey;
    const intervalId = window.setInterval(async () => {
      if (pendingSavesRef.current > 0 || currentScopeRef.current !== requestedScope) return;
      try {
        await fetchScopeRecord(requestedScope, false);
      } catch (error) {
        console.error("Checklist polling failed:", error);
      }
    }, CHECKLIST_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchScopeRecord, loaded, scopeKey]);

  const persistItems = useCallback((nextItems) => {
    const requestedScope = currentScopeRef.current;
    const [date, shift] = requestedScope.split(":");
    const normalizedItems = normalizeChecklistItems(nextItems);
    const updatedAt = new Date().toISOString();
    const version = (appliedUpdatedMsRef.current.get(requestedScope) || 0) + 1;

    setItems(normalizedItems);
    saveChecklistCache(requestedScope, normalizedItems, updatedAt);
    setSaving(true);
    setSyncStatus("Saving live...");
    pendingSavesRef.current += 1;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => null)
      .then(async () => {
        const entity = getChecklistEntity();
        if (!isChecklistEntityReady(entity)) throw new Error("Checklist cloud entity unavailable");

        const payload = {
          scopeKey: requestedScope,
          date,
          shift,
          shiftLabel: getChecklistShiftLabel(shift),
          items: normalizedItems,
          updatedAt,
        };

        let recordId = recordIdsRef.current.get(requestedScope) || null;
        if (!recordId) {
          const records = await entity.filter({ scopeKey: requestedScope });
          const latest = selectLatestChecklistRecord(records, requestedScope);
          recordId = latest?.id || null;
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

        if (savedRecord?.id) recordIdsRef.current.set(requestedScope, savedRecord.id);
        appliedUpdatedMsRef.current.set(
          requestedScope,
          Math.max(version, getChecklistRecordUpdatedMs(savedRecord), Date.parse(updatedAt) || Date.now()),
        );
        if (currentScopeRef.current === requestedScope) {
          setSyncStatus(`Live saved ${formatSyncTime(savedRecord?.updatedAt || updatedAt)}`);
        }
      })
      .catch((error) => {
        console.error("Checklist live save failed:", error);
        if (currentScopeRef.current === requestedScope) {
          setSyncStatus("Saved locally · cloud retry needed");
        }
      })
      .finally(() => {
        pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
        if (currentScopeRef.current === requestedScope && pendingSavesRef.current === 0) setSaving(false);
      });
  }, []);

  const addItem = useCallback((event) => {
    event.preventDefault();
    const cleanText = newItemText.trim();
    if (!cleanText || !loaded) return;
    persistItems([...items, createChecklistItem(cleanText)]);
    setNewItemText("");
  }, [items, loaded, newItemText, persistItems]);

  const toggleItem = useCallback((id) => {
    const now = new Date().toISOString();
    persistItems(items.map((item) => (
      item.id === id ? { ...item, completed: !item.completed, updatedAt: now } : item
    )));
  }, [items, persistItems]);

  const deleteItem = useCallback((id) => {
    persistItems(items.filter((item) => item.id !== id));
    if (editingItem?.id === id) {
      setEditingItem(null);
      setEditText("");
    }
  }, [editingItem?.id, items, persistItems]);

  const startEdit = useCallback((item) => {
    setEditingItem(item);
    setEditText(item.text);
  }, []);

  const saveEdit = useCallback((event) => {
    event.preventDefault();
    const cleanText = editText.trim();
    if (!editingItem || !cleanText) return;
    const now = new Date().toISOString();
    persistItems(items.map((item) => (
      item.id === editingItem.id ? { ...item, text: cleanText, updatedAt: now } : item
    )));
    setEditingItem(null);
    setEditText("");
  }, [editText, editingItem, items, persistItems]);

  const clearCompleted = useCallback(() => {
    persistItems(items.filter((item) => !item.completed));
  }, [items, persistItems]);

  const refreshNow = useCallback(async () => {
    if (pendingSavesRef.current > 0) return;
    setSyncStatus("Refreshing live checklist...");
    try {
      const latest = await fetchScopeRecord(scopeKey, true);
      if (!latest) setSyncStatus("Live ready · no items yet");
    } catch (error) {
      console.error("Checklist refresh failed:", error);
      setSyncStatus("Cloud unavailable · local cache ready");
    }
  }, [fetchScopeRecord, scopeKey]);

  const completedCount = items.filter((item) => item.completed).length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const selectedShiftLabel = getChecklistShiftLabel(selectedShift);

  return (
    <section className="mx-auto w-full max-w-[980px] space-y-4 pb-10">
      <header className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-[#315574] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.12),transparent_32%),linear-gradient(145deg,#092139,#061827)] dark:shadow-[0_20px_55px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-[#294b63]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-cyan-400/35 dark:bg-cyan-400/10 dark:text-cyan-200">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-wide text-slate-900 dark:text-white">CHK — Duty Checklist</h1>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200">
                Protected
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-[#8fb7d1]">Plan what must be completed for each duty shift. Changes sync across browsers and laptops.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-600 dark:border-[#315574] dark:bg-[#071827] dark:text-[#9bc7e4]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5 text-emerald-500" />}
            {syncStatus}
          </div>
          <button
            type="button"
            onClick={refreshNow}
            disabled={!loaded || saving}
            title="Refresh from cloud"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#315574] dark:text-[#9bc7e4] dark:hover:border-cyan-400 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-200"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-[230px_1fr_190px]">
          <label className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#294b63] dark:bg-[#071827]">
            <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-[#7eb8e0]"><CalendarDays className="h-3.5 w-3.5" /> Duty date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || getChecklistLocalDate())}
              disabled={saving}
              className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-[13px] text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:opacity-60 dark:border-[#315574] dark:bg-[#0b2137] dark:text-white dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-[#294b63] dark:bg-[#071827]">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-[#7eb8e0]">Duty shift</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {DUTY_CHECKLIST_SHIFTS.map((shift) => {
                const selected = selectedShift === shift.value;
                return (
                  <button
                    key={shift.value}
                    type="button"
                    onClick={() => setSelectedShift(shift.value)}
                    disabled={saving}
                    className={`h-10 rounded-xl border px-2 text-[11px] font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
                      selected
                        ? "border-sky-500 bg-sky-500 text-white shadow-[0_5px_15px_rgba(14,165,233,0.20)] dark:border-cyan-400 dark:bg-cyan-400/15 dark:text-cyan-100"
                        : "border-slate-300 bg-white text-slate-600 hover:border-sky-300 dark:border-[#315574] dark:bg-[#0b2137] dark:text-[#9bc7e4] dark:hover:border-cyan-400/60"
                    }`}
                  >
                    {shift.label.replace(" Shift", "")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-400/25 dark:bg-[#082b2e]">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Progress</span>
            <div className="mt-1 flex items-end justify-between gap-3">
              <strong className="text-[26px] font-semibold leading-none text-slate-900 dark:text-white">{progress}%</strong>
              <span className="text-[10px] text-slate-500 dark:text-[#91adbf]">{completedCount} of {items.length}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-[#0b2137]">
              <span className="block h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] dark:border-[#315574] dark:bg-[#061827] dark:shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-[#294b63]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-cyan-300">{selectedShiftLabel}</p>
            <h2 className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-white">Checklist notes</h2>
          </div>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={clearCompleted}
              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 active:scale-[0.98] dark:border-rose-400/30 dark:bg-rose-500/5 dark:text-rose-300 dark:hover:bg-rose-500/15"
            >
              Clear completed
            </button>
          )}
        </div>

        <form onSubmit={addItem} className="mt-4 flex gap-2">
          <input
            value={newItemText}
            onChange={(event) => setNewItemText(event.target.value)}
            placeholder={`Add something to do during ${selectedShiftLabel.toLowerCase()}...`}
            disabled={!loaded}
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:opacity-60 dark:border-[#315574] dark:bg-[#0b2137] dark:text-white dark:placeholder:text-[#58768c] dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20"
          />
          <button
            type="submit"
            disabled={!loaded || !newItemText.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-sky-600 bg-sky-600 px-4 text-[11px] font-semibold text-white shadow-[0_7px_18px_rgba(2,132,199,0.20)] transition hover:bg-sky-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:border-cyan-400 dark:bg-cyan-400/15 dark:text-cyan-100 dark:hover:bg-cyan-400/25"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
        </form>

        {!loaded ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-[12px] text-slate-500 dark:text-[#8fb7d1]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading checklist...
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 text-center dark:border-[#315574] dark:bg-[#071827]/60">
            <CheckCircle2 className="h-8 w-8 text-slate-300 dark:text-[#456980]" />
            <p className="mt-3 text-[14px] font-medium text-slate-700 dark:text-slate-200">Nothing added for this duty yet.</p>
            <p className="mt-1 max-w-md text-[11px] leading-5 text-slate-500 dark:text-[#7f9fb5]">Add your own checks, for example reviewing the removal plan, checking handover notes, or completing shift reports.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                onToggle={toggleItem}
                onEdit={startEdit}
                onDelete={deleteItem}
              />
            ))}
          </ul>
        )}
      </section>

      {editingItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" onMouseDown={() => setEditingItem(null)} role="presentation">
          <form
            onSubmit={saveEdit}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] dark:border-[#315574] dark:bg-[#071e33]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-cyan-300">Edit checklist item</p>
                <h3 className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-white">Update duty note</h3>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 dark:border-[#315574] dark:text-[#9bc7e4]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              rows={4}
              className="mt-4 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-[13px] leading-5 text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-[#315574] dark:bg-[#0b2137] dark:text-white dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingItem(null)} className="h-10 rounded-xl border border-slate-300 px-4 text-[11px] font-semibold text-slate-600 dark:border-[#315574] dark:text-[#9bc7e4]">Cancel</button>
              <button type="submit" disabled={!editText.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-cyan-400/20 dark:text-cyan-100">
                <Check className="h-4 w-4" /> Save item
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
