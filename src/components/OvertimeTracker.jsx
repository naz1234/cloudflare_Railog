import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "ovtOvertimeRecords_v1";
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function roundOne(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function getDurationHours(startTime = "", endTime = "") {
  const startMatch = String(startTime).match(/^(\d{1,2}):(\d{2})$/);
  const endMatch = String(endTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!startMatch || !endMatch) return 0;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  return roundOne(durationMinutes / 60);
}

function calculateOvertimeHours(type = "OT", startTime = "", endTime = "") {
  const duration = getDurationHours(startTime, endTime);
  if (!duration) return 0;
  if (String(type).toUpperCase() === "RDOT") return duration;
  return roundOne(Math.max(0, duration - 8.5));
}

function normalizeRecord(record = {}, index = 0) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || ""))
    ? String(record.date)
    : new Date().toISOString().slice(0, 10);
  const type = String(record.type || "OT").toUpperCase() === "RDOT" ? "RDOT" : "OT";
  const startTime = String(record.startTime || "19:00");
  const endTime = String(record.endTime || "07:00");
  const automaticHours = calculateOvertimeHours(type, startTime, endTime);
  const parsedHours = Number(record.hours);

  return {
    id: record.id || `local-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    date,
    type,
    startTime,
    endTime,
    hours: Number.isFinite(parsedHours) ? roundOne(Math.max(0, parsedHours)) : automaticHours,
    remark: String(record.remark || ""),
    createdAt: record.createdAt || record.created_date || new Date().toISOString(),
    updatedAt: record.updatedAt || record.updated_date || new Date().toISOString(),
  };
}

function loadLocalRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function saveLocalRecords(records = []) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Keep the page usable even when browser storage is unavailable.
  }
}

function formatDate(dateValue = "") {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatHours(value) {
  return `${roundOne(value).toFixed(1)} hrs`;
}

function createDefaultForm(year, monthIndex) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const selectedMonth = Number.isInteger(monthIndex) ? monthIndex : currentMonth;
  const day = year === currentYear && selectedMonth === currentMonth
    ? now.getDate()
    : 1;
  const safeDate = new Date(year, selectedMonth, day, 12, 0, 0);

  return {
    date: `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, "0")}-${String(safeDate.getDate()).padStart(2, "0")}`,
    type: "RDOT",
    startTime: "19:00",
    endTime: "07:00",
    hours: "12.0",
    remark: "",
  };
}

export default function OvertimeTracker() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [records, setRecords] = useState(loadLocalRecords);
  const [form, setForm] = useState(() => createDefaultForm(today.getFullYear(), today.getMonth()));
  const [editingId, setEditingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("Loading saved overtime records…");
  const [error, setError] = useState("");

  const persistLocal = useCallback((nextRecords) => {
    setRecords(nextRecords);
    saveLocalRecords(nextRecords);
  }, []);

  const loadRemoteRecords = useCallback(async () => {
    const entity = base44?.entities?.OvertimeRecord;
    if (!entity?.list) {
      setIsLoading(false);
      setSaveStatus("Saved on this device");
      return;
    }

    setIsLoading(true);
    try {
      const remoteRecords = await entity.list("-date");
      const normalized = (Array.isArray(remoteRecords) ? remoteRecords : []).map(normalizeRecord);
      persistLocal(normalized);
      setSaveStatus("Synced with D1 database");
    } catch (loadError) {
      console.warn("Unable to load overtime records from D1:", loadError);
      setSaveStatus("D1 unavailable — showing records saved on this device");
    } finally {
      setIsLoading(false);
    }
  }, [persistLocal]);

  useEffect(() => {
    loadRemoteRecords();
  }, [loadRemoteRecords]);

  useEffect(() => {
    if (editingId) return;
    setForm(createDefaultForm(selectedYear, selectedMonth));
    setError("");
  }, [selectedYear, selectedMonth, editingId]);

  const selectedYearRecords = useMemo(() => records.filter((record) => (
    Number(String(record.date).slice(0, 4)) === selectedYear
  )), [records, selectedYear]);

  const monthlyStats = useMemo(() => MONTH_NAMES.map((name, monthIndex) => {
    const monthRecords = selectedYearRecords.filter((record) => (
      Number(String(record.date).slice(5, 7)) === monthIndex + 1
    ));
    return {
      name,
      monthIndex,
      count: monthRecords.length,
      rdotCount: monthRecords.filter((record) => record.type === "RDOT").length,
      hours: roundOne(monthRecords.reduce((sum, record) => sum + Number(record.hours || 0), 0)),
    };
  }), [selectedYearRecords]);

  const selectedMonthRecords = useMemo(() => selectedYearRecords
    .filter((record) => Number(String(record.date).slice(5, 7)) === selectedMonth + 1)
    .sort((left, right) => String(right.date).localeCompare(String(left.date))), [selectedYearRecords, selectedMonth]);

  const yearlyStats = useMemo(() => ({
    entries: selectedYearRecords.length,
    rdotCount: selectedYearRecords.filter((record) => record.type === "RDOT").length,
    otCount: selectedYearRecords.filter((record) => record.type === "OT").length,
    hours: roundOne(selectedYearRecords.reduce((sum, record) => sum + Number(record.hours || 0), 0)),
  }), [selectedYearRecords]);

  const selectedStats = monthlyStats[selectedMonth] || { count: 0, rdotCount: 0, hours: 0 };
  const automaticHours = calculateOvertimeHours(form.type, form.startTime, form.endTime);

  const updateForm = (field, value) => {
    setForm((previous) => {
      const next = { ...previous, [field]: value };
      if (["type", "startTime", "endTime"].includes(field)) {
        next.hours = calculateOvertimeHours(next.type, next.startTime, next.endTime).toFixed(1);
      }
      return next;
    });
    setError("");
  };

  const resetForm = () => {
    setEditingId("");
    setForm(createDefaultForm(selectedYear, selectedMonth));
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const hours = Number(form.hours);
    if (!form.date || !form.startTime || !form.endTime) {
      setError("Date, start time and end time are required.");
      return;
    }
    if (!Number.isFinite(hours) || hours < 0) {
      setError("Enter a valid overtime hour value.");
      return;
    }

    const payload = {
      date: form.date,
      type: form.type,
      startTime: form.startTime,
      endTime: form.endTime,
      hours: roundOne(hours),
      remark: form.remark.trim(),
      updatedAt: new Date().toISOString(),
    };

    setIsSaving(true);
    setError("");
    const entity = base44?.entities?.OvertimeRecord;

    try {
      if (editingId) {
        const current = records.find((record) => record.id === editingId);
        const updatedRecord = entity?.update && !String(editingId).startsWith("local-")
          ? normalizeRecord(await entity.update(editingId, payload))
          : normalizeRecord({ ...current, ...payload, id: editingId });
        persistLocal(records.map((record) => record.id === editingId ? updatedRecord : record));
        setSaveStatus(entity?.update ? "Record updated and synced with D1" : "Record updated on this device");
      } else {
        const localRecord = normalizeRecord({
          ...payload,
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        });
        const createdRecord = entity?.create
          ? normalizeRecord(await entity.create(payload))
          : localRecord;
        persistLocal([createdRecord, ...records]);
        setSaveStatus(entity?.create ? "Record saved and synced with D1" : "Record saved on this device");
      }

      const savedDate = new Date(`${form.date}T00:00:00`);
      if (!Number.isNaN(savedDate.getTime())) {
        setSelectedYear(savedDate.getFullYear());
        setSelectedMonth(savedDate.getMonth());
      }
      setEditingId("");
      setForm(createDefaultForm(
        Number(String(form.date).slice(0, 4)) || selectedYear,
        Math.max(0, (Number(String(form.date).slice(5, 7)) || selectedMonth + 1) - 1),
      ));
    } catch (saveError) {
      console.error("Unable to save overtime record:", saveError);
      setError(saveError?.message || "Unable to save the overtime record.");
      setSaveStatus("Save failed — existing records remain available");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      date: record.date,
      type: record.type,
      startTime: record.startTime,
      endTime: record.endTime,
      hours: Number(record.hours || 0).toFixed(1),
      remark: record.remark || "",
    });
    setError("");
  };

  const handleDelete = async (record) => {
    const approved = window.confirm(`Delete ${record.type} record for ${formatDate(record.date)}?`);
    if (!approved) return;

    setIsSaving(true);
    setError("");
    try {
      const entity = base44?.entities?.OvertimeRecord;
      if (entity?.delete && !String(record.id).startsWith("local-")) {
        await entity.delete(record.id);
      }
      persistLocal(records.filter((item) => item.id !== record.id));
      if (editingId === record.id) resetForm();
      setSaveStatus(entity?.delete ? "Record deleted from D1" : "Record deleted from this device");
    } catch (deleteError) {
      console.error("Unable to delete overtime record:", deleteError);
      setError(deleteError?.message || "Unable to delete this overtime record.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-[#1d4869] bg-[#0a2238]/88 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-[#6db6e8]">Yearly overtime register</p>
            <h3 className="mt-1 text-[17px] font-normal text-white">January – December {selectedYear}</h3>
            <p className="mt-1 text-[10px] text-[#8dc7ed]">Record every OT and RDOT duty so the monthly count is always visible.</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-[#2b4f6b] bg-[#061827]/75 p-1.5">
            <button
              type="button"
              onClick={() => setSelectedYear((year) => year - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#8bd5ff] transition hover:bg-[#123651] hover:text-white"
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[54px] text-center text-[13px] font-semibold text-white">{selectedYear}</span>
            <button
              type="button"
              onClick={() => setSelectedYear((year) => year + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#8bd5ff] transition hover:bg-[#123651] hover:text-white"
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#2b4f6b] bg-[#061827]/70 px-3 py-3">
            <p className="text-[9px] uppercase tracking-[0.16em] text-[#6db6e8]">Total entries</p>
            <p className="mt-1 text-[21px] font-semibold text-white">{yearlyStats.entries}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-3">
            <p className="text-[9px] uppercase tracking-[0.16em] text-emerald-200">RDOT duties</p>
            <p className="mt-1 text-[21px] font-semibold text-emerald-100">{yearlyStats.rdotCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-3">
            <p className="text-[9px] uppercase tracking-[0.16em] text-amber-200">Normal OT</p>
            <p className="mt-1 text-[21px] font-semibold text-amber-100">{yearlyStats.otCount}</p>
          </div>
          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-3 py-3">
            <p className="text-[9px] uppercase tracking-[0.16em] text-sky-200">Total hours</p>
            <p className="mt-1 text-[21px] font-semibold text-sky-100">{yearlyStats.hours.toFixed(1)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {monthlyStats.map((month) => {
            const active = selectedMonth === month.monthIndex;
            return (
              <button
                key={month.name}
                type="button"
                onClick={() => setSelectedMonth(month.monthIndex)}
                className={`rounded-2xl border px-3 py-3 text-left transition ${active
                  ? "border-[#62b8ef] bg-[#123b5c] shadow-[0_0_20px_rgba(98,184,239,0.14)]"
                  : "border-[#234967] bg-[#071c2e]/75 hover:border-[#3e789f] hover:bg-[#0d2a43]"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-[11px] font-semibold ${active ? "text-white" : "text-[#bceaff]"}`}>{month.name}</p>
                  {month.rdotCount > 0 && (
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-200">
                      {month.rdotCount} RDOT
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="text-[10px] text-[#75acd0]">{month.count} {month.count === 1 ? "entry" : "entries"}</p>
                  <p className="text-[12px] font-semibold text-[#d8f2ff]">{month.hours.toFixed(1)} hrs</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="rounded-[24px] border border-[#1d4869] bg-[#0a2238]/88 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-[#6db6e8]">{editingId ? "Edit record" : "New record"}</p>
              <h3 className="mt-1 text-[16px] font-normal text-white">{editingId ? "Update overtime" : "Add overtime"}</h3>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#2b4f6b] text-[#8bd5ff] transition hover:bg-[#123651] hover:text-white"
                aria-label="Cancel editing"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <label className="mt-4 block text-[9px] font-normal uppercase tracking-[0.14em] text-[#7eb8e0]">
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) => updateForm("date", event.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[13px] text-[#061827] outline-none transition focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {["RDOT", "OT"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => updateForm("type", type)}
                className={`h-10 rounded-xl border text-[11px] font-semibold transition ${form.type === type
                  ? type === "RDOT"
                    ? "border-emerald-300/55 bg-emerald-500/20 text-emerald-100"
                    : "border-amber-300/55 bg-amber-500/20 text-amber-100"
                  : "border-[#2b4f6b] bg-[#071c2e] text-[#79afd2] hover:border-[#417aa1]"}`}
              >
                {form.type === type && <Check className="mr-1 inline h-3.5 w-3.5" />}
                {type}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-[9px] font-normal uppercase tracking-[0.14em] text-[#7eb8e0]">
              Start
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => updateForm("startTime", event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[13px] text-[#061827] outline-none transition focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
              />
            </label>
            <label className="block text-[9px] font-normal uppercase tracking-[0.14em] text-[#7eb8e0]">
              End
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => updateForm("endTime", event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[13px] text-[#061827] outline-none transition focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
              />
            </label>
          </div>

          <label className="mt-3 block text-[9px] font-normal uppercase tracking-[0.14em] text-[#7eb8e0]">
            Overtime hours
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.hours}
              onChange={(event) => updateForm("hours", event.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[13px] text-[#061827] outline-none transition focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
            />
          </label>
          <p className="mt-1.5 flex items-center gap-1.5 text-[9px] text-[#6fa4c7]">
            <Clock3 className="h-3 w-3" />
            Auto calculation: {form.type === "RDOT" ? "full shift" : "shift minus 8.5 hrs"} = {automaticHours.toFixed(1)} hrs. You may edit it.
          </p>

          <label className="mt-3 block text-[9px] font-normal uppercase tracking-[0.14em] text-[#7eb8e0]">
            Remark (optional)
            <input
              value={form.remark}
              onChange={(event) => updateForm("remark", event.target.value)}
              placeholder="Example: Night shift / replacement"
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[12px] text-[#061827] outline-none transition placeholder:text-[#7890a1] focus:border-[#4f8ef7] focus:ring-2 focus:ring-[#4f8ef7]/25"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[10px] leading-relaxed text-red-200">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#4f8ef7]/60 bg-[#1b5f93] text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_0_22px_rgba(79,142,247,0.2)] transition hover:bg-[#2476b4] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? "Update record" : "Add record"}
          </button>
        </form>

        <div className="rounded-[24px] border border-[#1d4869] bg-[#0a2238]/88 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-[#6db6e8]">Monthly records</p>
              <h3 className="mt-1 text-[16px] font-normal text-white">{MONTH_NAMES[selectedMonth]} {selectedYear}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold text-emerald-200">{selectedStats.rdotCount} RDOT</span>
              <span className="rounded-full border border-sky-300/25 bg-sky-500/10 px-2.5 py-1 text-[9px] font-semibold text-sky-200">{selectedStats.hours.toFixed(1)} hrs</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#234967] bg-[#071c2e]/65 px-3 py-2">
            <p className="min-w-0 truncate text-[9px] text-[#75acd0]">{saveStatus}</p>
            <button
              type="button"
              onClick={loadRemoteRecords}
              disabled={isLoading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-semibold text-[#8bd5ff] transition hover:bg-[#123651] hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              Sync
            </button>
          </div>

          {selectedMonthRecords.length === 0 ? (
            <div className="mt-4 flex min-h-[250px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#2b4f6b] bg-[#071c2e]/45 px-6 text-center">
              <CalendarDays className="h-8 w-8 text-[#4f83a5]" />
              <p className="mt-3 text-[13px] font-semibold text-[#d8f2ff]">No overtime recorded yet</p>
              <p className="mt-1 max-w-[330px] text-[10px] leading-relaxed text-[#75acd0]">Add each RDOT or OT duty on the left. This month card will automatically show the count and total hours.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {selectedMonthRecords.map((record) => (
                <div key={record.id} className="group rounded-2xl border border-[#234967] bg-[#071c2e]/72 p-3 transition hover:border-[#3d7195] hover:bg-[#0b2941]">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 min-w-[54px] shrink-0 items-center justify-center rounded-xl border text-[10px] font-semibold ${record.type === "RDOT"
                      ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-200"
                      : "border-amber-300/30 bg-amber-500/12 text-amber-200"}`}
                    >
                      {record.type}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="text-[12px] font-semibold text-white">{formatDate(record.date)}</p>
                        <p className="text-[13px] font-semibold text-[#bceaff]">{formatHours(record.hours)}</p>
                      </div>
                      <p className="mt-1 text-[10px] text-[#75acd0]">{record.startTime} – {record.endTime} · Shift duration {getDurationHours(record.startTime, record.endTime).toFixed(1)} hrs</p>
                      {record.remark && <p className="mt-1.5 break-words text-[10px] leading-relaxed text-[#a7cce4]">{record.remark}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(record)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-[#74b9e7] transition hover:bg-[#153b58] hover:text-white"
                        aria-label={`Edit ${record.type} record`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-rose-300 transition hover:bg-rose-500/15 hover:text-rose-100"
                        aria-label={`Delete ${record.type} record`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
