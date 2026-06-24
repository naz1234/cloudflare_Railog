import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

const OVERTIME_STORAGE_KEY = "ovtOvertimeRecords_v1";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundOne(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function getMinutes(time = "") {
  const [hours, minutes] = String(time).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function calculateOvertimeHours(startTime, endTime, type = "RDOT") {
  const startMinutes = getMinutes(startTime);
  const endMinutes = getMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return 0;

  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;

  const durationHours = durationMinutes / 60;
  if (String(type).toUpperCase() === "RDOT") return roundOne(durationHours);
  return roundOne(Math.max(0, durationHours - 8.5));
}

function createRecordDraft(date = getLocalDateValue()) {
  return {
    date,
    type: "RDOT",
    startTime: "19:00",
    endTime: "07:00",
    remark: "",
  };
}

function normalizeRecord(record = {}) {
  const type = String(record.type || "RDOT").toUpperCase() === "OT" ? "OT" : "RDOT";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || ""))
    ? String(record.date)
    : getLocalDateValue();
  const startTime = /^\d{2}:\d{2}$/.test(String(record.startTime || "")) ? String(record.startTime) : "19:00";
  const endTime = /^\d{2}:\d{2}$/.test(String(record.endTime || "")) ? String(record.endTime) : "07:00";

  return {
    id: String(record.id || `ovt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    date,
    type,
    startTime,
    endTime,
    hours: calculateOvertimeHours(startTime, endTime, type),
    remark: String(record.remark || ""),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(OVERTIME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(OVERTIME_STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

function formatDate(dateValue) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (!year || !month || !day) return dateValue;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function OvertimeTracker() {
  const today = useMemo(() => new Date(), []);
  const [records, setRecords] = useState(() => loadRecords());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [draft, setDraft] = useState(() => createRecordDraft());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Local cache ready");

  const overtimeEntity = base44?.entities?.OvertimeRecord || null;
  const cloudReady = Boolean(
    overtimeEntity?.list && overtimeEntity?.create && overtimeEntity?.update && overtimeEntity?.delete
  );

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    let cancelled = false;

    const loadCloudRecords = async () => {
      if (!cloudReady) {
        setSyncStatus("Local cache only");
        return;
      }

      setSyncStatus("Syncing...");
      try {
        const remoteRecords = await overtimeEntity.list("-date");
        if (cancelled) return;

        const normalizedRemote = Array.isArray(remoteRecords) ? remoteRecords.map(normalizeRecord) : [];
        const localRecords = loadRecords();

        if (!normalizedRemote.length && localRecords.length && overtimeEntity.bulkCreate) {
          const uploaded = await overtimeEntity.bulkCreate(localRecords.map(({ id, ...record }) => record));
          if (cancelled) return;
          const normalizedUploaded = Array.isArray(uploaded) ? uploaded.map(normalizeRecord) : localRecords;
          setRecords(normalizedUploaded);
        } else {
          setRecords(normalizedRemote);
        }
        setSyncStatus("Cloud saved");
      } catch (error) {
        console.error("Overtime cloud load failed:", error);
        if (!cancelled) setSyncStatus("Local cache only");
      }
    };

    loadCloudRecords();
    return () => { cancelled = true; };
  }, [cloudReady, overtimeEntity]);

  const draftHours = useMemo(
    () => calculateOvertimeHours(draft.startTime, draft.endTime, draft.type),
    [draft.startTime, draft.endTime, draft.type]
  );

  const recordsForYear = useMemo(
    () => records.filter((record) => Number(record.date.slice(0, 4)) === selectedYear),
    [records, selectedYear]
  );

  const monthSummaries = useMemo(() => MONTHS.map((month, monthIndex) => {
    const monthRecords = recordsForYear.filter((record) => Number(record.date.slice(5, 7)) === monthIndex + 1);
    return {
      month,
      count: monthRecords.length,
      rdotCount: monthRecords.filter((record) => record.type === "RDOT").length,
      hours: roundOne(monthRecords.reduce((total, record) => total + Number(record.hours || 0), 0)),
    };
  }), [recordsForYear]);

  const visibleRecords = useMemo(() => recordsForYear
    .filter((record) => Number(record.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  [recordsForYear, selectedMonth]);

  const annualHours = useMemo(
    () => roundOne(recordsForYear.reduce((total, record) => total + Number(record.hours || 0), 0)),
    [recordsForYear]
  );
  const annualRdotCount = useMemo(
    () => recordsForYear.filter((record) => record.type === "RDOT").length,
    [recordsForYear]
  );

  const availableYears = useMemo(() => {
    const currentYear = today.getFullYear();
    const years = new Set([currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3, selectedYear]);
    records.forEach((record) => years.add(Number(record.date.slice(0, 4))));
    return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);
  }, [records, selectedYear, today]);

  const resetDraft = (date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`) => {
    setDraft(createRecordDraft(date));
    setEditingId(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!draft.date || !draft.startTime || !draft.endTime || saving) return;

    const now = new Date().toISOString();
    const existing = editingId ? records.find((record) => record.id === editingId) : null;
    const payload = normalizeRecord({
      ...(existing || {}),
      ...draft,
      id: editingId || `ovt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    setSaving(true);
    try {
      let savedRecord = payload;
      if (cloudReady) {
        const { id, ...cloudPayload } = payload;
        if (editingId && !String(editingId).startsWith("ovt-")) {
          savedRecord = normalizeRecord(await overtimeEntity.update(editingId, cloudPayload));
        } else {
          savedRecord = normalizeRecord(await overtimeEntity.create(cloudPayload));
        }
        setSyncStatus("Cloud saved");
      } else {
        setSyncStatus("Local cache only");
      }

      setRecords((current) => {
        if (editingId) {
          return current.map((record) => record.id === editingId ? savedRecord : record);
        }
        return [...current, savedRecord];
      });

      const [year, month] = draft.date.split("-").map(Number);
      setSelectedYear(year);
      setSelectedMonth(month - 1);
      resetDraft(draft.date);
    } catch (error) {
      console.error("Overtime save failed:", error);
      setSyncStatus("Local cache only");
      setRecords((current) => {
        if (editingId) return current.map((record) => record.id === editingId ? payload : record);
        return [...current, payload];
      });
      resetDraft(draft.date);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setDraft({
      date: record.date,
      type: record.type,
      startTime: record.startTime,
      endTime: record.endTime,
      remark: record.remark,
    });
  };

  const handleDelete = async (id) => {
    const removedRecord = records.find((record) => record.id === id);
    setRecords((current) => current.filter((record) => record.id !== id));
    if (editingId === id) resetDraft();

    if (cloudReady && !String(id).startsWith("ovt-")) {
      try {
        await overtimeEntity.delete(id);
        setSyncStatus("Cloud saved");
      } catch (error) {
        console.error("Overtime delete failed:", error);
        if (removedRecord) setRecords((current) => [...current, removedRecord]);
        setSyncStatus("Delete not synced");
      }
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Month", "Type", "Start", "End", "Overtime Hours", "Remark"],
      ...recordsForYear
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((record) => [
          record.date,
          MONTHS[Number(record.date.slice(5, 7)) - 1],
          record.type,
          record.startTime,
          record.endTime,
          record.hours.toFixed(1),
          record.remark,
        ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `overtime-${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-[#1d4869] bg-[#0a2238]/80 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#6db6e8]">Yearly overview</p>
            <h3 className="mt-1 text-[17px] font-normal text-white">Monthly Overtime Record</h3>
            <p className="mt-1 text-[11px] text-[#8dc7ed]">Record every RDOT or normal overtime entry from January to December.</p>
            <p className={`mt-1 text-[9px] font-semibold ${syncStatus === "Cloud saved" ? "text-emerald-300" : "text-amber-300"}`}>{syncStatus}</p>
          </div>
          <select
            value={selectedYear}
            onChange={(event) => {
              const year = Number(event.target.value);
              setSelectedYear(year);
              if (!editingId) resetDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
            }}
            className="h-10 rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[12px] font-semibold text-[#061827] outline-none focus:border-[#4f8ef7]"
            aria-label="Overtime year"
          >
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!recordsForYear.length}
            className="flex h-10 items-center gap-2 rounded-xl border border-[#2b4f6b] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#bceaff] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {monthSummaries.map((summary, monthIndex) => {
            const active = selectedMonth === monthIndex;
            return (
              <button
                key={summary.month}
                type="button"
                onClick={() => {
                  setSelectedMonth(monthIndex);
                  if (!editingId) resetDraft(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
                }}
                className={`rounded-2xl border px-3 py-3 text-left transition ${active
                  ? "border-[#69b9ef] bg-[#123b5d] shadow-[0_0_20px_rgba(79,142,247,0.18)]"
                  : "border-[#1d4869] bg-[#071d30] hover:border-[#376c90] hover:bg-[#0b2942]"
                }`}
              >
                <p className={`text-[11px] font-semibold ${active ? "text-white" : "text-[#bceaff]"}`}>{summary.month.slice(0, 3)}</p>
                <p className="mt-1 text-[17px] font-normal text-white">{summary.rdotCount} <span className="text-[9px] uppercase tracking-wide text-[#7eb8e0]">RDOT</span></p>
                <p className="mt-0.5 text-[10px] text-[#8dc7ed]">{summary.hours.toFixed(1)} hrs · {summary.count} record{summary.count === 1 ? "" : "s"}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-[#1d4869] bg-[#071d30] px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.18em] text-[#6db6e8]">Annual RDOT</p>
            <p className="mt-1 text-[20px] font-normal text-white">{annualRdotCount}</p>
          </div>
          <div className="rounded-2xl border border-[#1d4869] bg-[#071d30] px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.18em] text-[#6db6e8]">Annual OT hours</p>
            <p className="mt-1 text-[20px] font-normal text-white">{annualHours.toFixed(1)}</p>
          </div>
        </div>
      </section>

      <form onSubmit={handleSave} className="rounded-[24px] border border-[#1d4869] bg-[#061827]/90 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#6db6e8]">{editingId ? "Edit record" : "New record"}</p>
            <h3 className="mt-1 text-[16px] font-normal text-white">{MONTHS[selectedMonth]} {selectedYear}</h3>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={() => resetDraft()}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-[#2b4f6b] px-3 text-[10px] font-semibold text-[#bceaff] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a]"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className="col-span-2 block sm:col-span-1">
            <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-normal text-[#061827] outline-none focus:border-[#4f8ef7]"
            />
          </label>
          <label className="block">
            <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Type</span>
            <select
              value={draft.type}
              onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-semibold text-[#061827] outline-none focus:border-[#4f8ef7]"
            >
              <option value="RDOT">RDOT</option>
              <option value="OT">OT</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Start</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-normal text-[#061827] outline-none focus:border-[#4f8ef7]"
            />
          </label>
          <label className="block">
            <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">End</span>
            <input
              type="time"
              value={draft.endTime}
              onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))}
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-normal text-[#061827] outline-none focus:border-[#4f8ef7]"
            />
          </label>
          <div>
            <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Hours</span>
            <div className="mt-1.5 flex h-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-[15px] font-semibold text-emerald-200">
              {draftHours.toFixed(1)}
            </div>
          </div>
        </div>

        <label className="mt-3 block">
          <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Remark (optional)</span>
          <input
            value={draft.remark}
            onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))}
            placeholder="Example: Night shift / replacement duty"
            className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[12px] font-normal text-[#061827] outline-none placeholder:text-[#70839a] focus:border-[#4f8ef7]"
          />
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-[#7eb8e0]">
            RDOT uses the full shift duration. OT deducts 8.5 normal working hours.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#4f8ef7]/60 bg-[#1b5f93] px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_22px_rgba(79,142,247,0.18)] transition hover:bg-[#2476b4] active:scale-[0.99]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? "Saving" : editingId ? "Update" : "Add record"}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-[24px] border border-[#1d4869] bg-[#061827]/90 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between border-b border-[#1a3a56] px-4 py-3">
          <div>
            <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#6db6e8]">Records</p>
            <h3 className="mt-0.5 text-[15px] font-normal text-white">{MONTHS[selectedMonth]} {selectedYear}</h3>
          </div>
          <p className="rounded-full border border-[#2b4f6b] bg-[#0f2d4a] px-3 py-1.5 text-[10px] font-semibold text-[#bceaff]">
            {visibleRecords.length} entr{visibleRecords.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {!visibleRecords.length ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4f8ef7]/25 bg-[#0f2d4a] text-[#8dc7ed]">
              <Plus className="h-5 w-5" />
            </div>
            <p className="mt-3 text-[12px] text-[#8dc7ed]">No overtime recorded for this month.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#163952]">
            {visibleRecords.map((record) => (
              <div key={record.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#0a2238]">
                <div className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-xl border text-[10px] font-semibold ${record.type === "RDOT"
                  ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                }`}>
                  {record.type}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[12px] font-semibold text-white">{formatDate(record.date)}</p>
                    <span className="text-[10px] text-[#6db6e8]">{record.startTime} – {record.endTime}</span>
                  </div>
                  {record.remark && <p className="mt-0.5 truncate text-[10px] text-[#8dc7ed]">{record.remark}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[16px] font-semibold text-emerald-200">{Number(record.hours).toFixed(1)}</p>
                  <p className="text-[8px] uppercase tracking-wide text-[#6db6e8]">hours</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleEdit(record)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2b4f6b] text-[#8dc7ed] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white"
                  aria-label="Edit overtime record"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(record.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                  aria-label="Delete overtime record"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
