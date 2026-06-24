import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, Download, FilePlus2, ListChecks, Loader2, MessageSquareText, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

const OVERTIME_STORAGE_KEY = "ovtOvertimeRecords_v1";
const OVERTIME_NOTE_STORAGE_KEY = "ovtMonthlyNotes_v1";
const NOTE_LIVE_REFRESH_MS = 5000;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TIMING_OPTIONS = {
  EXTENSION: [
    { startTime: "07:00", endTime: "19:00" },
    { startTime: "19:00", endTime: "07:00" },
    { startTime: "15:00", endTime: "23:00" },
    { startTime: "03:00", endTime: "15:00" },
    { startTime: "23:00", endTime: "11:00" },
    { startTime: "11:00", endTime: "23:00" },
  ],
  RDOT: [
    { startTime: "07:00", endTime: "15:30" },
    { startTime: "15:00", endTime: "23:30" },
    { startTime: "23:00", endTime: "07:30" },
  ],
};

function getDefaultTiming(type = "RDOT") {
  return TIMING_OPTIONS[type]?.[0] || TIMING_OPTIONS.RDOT[0];
}

function getTimingValue(startTime, endTime) {
  return `${startTime}|${endTime}`;
}

function getTimingLabel(startTime, endTime) {
  return `${startTime} – ${endTime}`;
}

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
  const timing = getDefaultTiming("RDOT");
  return {
    date,
    type: "RDOT",
    startTime: timing.startTime,
    endTime: timing.endTime,
    remark: "",
  };
}

function normalizeRecord(record = {}) {
  const rawType = String(record.type || "RDOT").toUpperCase();
  const type = rawType === "OT" || rawType === "EXTENSION" ? "EXTENSION" : "RDOT";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || ""))
    ? String(record.date)
    : getLocalDateValue();
  const defaultTiming = getDefaultTiming(type);
  const startTime = /^\d{2}:\d{2}$/.test(String(record.startTime || "")) ? String(record.startTime) : defaultTiming.startTime;
  const endTime = /^\d{2}:\d{2}$/.test(String(record.endTime || "")) ? String(record.endTime) : defaultTiming.endTime;

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

function createNoteDraft(date = getLocalDateValue()) {
  return {
    date,
    note: "",
  };
}

function normalizeNote(note = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(note.date || ""))
    ? String(note.date)
    : getLocalDateValue();

  return {
    id: String(note.id || `ovt-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    date,
    note: String(note.note || "").trim(),
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  };
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(OVERTIME_NOTE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeNote).filter((item) => item.note) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(OVERTIME_NOTE_STORAGE_KEY, JSON.stringify(notes));
  } catch {}
}

function getNoteFingerprint(note = {}) {
  return [note.date, note.note, note.createdAt].map((value) => String(value || "")).join("|");
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
  const [notes, setNotes] = useState(() => loadNotes());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [draft, setDraft] = useState(() => createRecordDraft());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState(() => createNoteDraft());
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Local cache ready");
  const [noteSyncStatus, setNoteSyncStatus] = useState("Local cache ready");
  const noteSyncInProgressRef = useRef(false);

  const overtimeEntity = base44?.entities?.OvertimeRecord || null;
  const overtimeNoteEntity = base44?.entities?.OvertimeMonthlyNote || null;
  const cloudReady = Boolean(
    overtimeEntity?.list && overtimeEntity?.create && overtimeEntity?.update && overtimeEntity?.delete
  );
  const noteCloudReady = Boolean(
    overtimeNoteEntity?.list && overtimeNoteEntity?.create && overtimeNoteEntity?.update && overtimeNoteEntity?.delete
  );

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

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

  const refreshCloudNotes = useCallback(async ({ migrateLocal = false, silent = false } = {}) => {
    if (!noteCloudReady || noteSyncInProgressRef.current) return;

    noteSyncInProgressRef.current = true;
    if (!silent) setNoteSyncStatus("Syncing...");

    try {
      let remoteNotes = await overtimeNoteEntity.list("-date");
      let normalizedRemote = Array.isArray(remoteNotes)
        ? remoteNotes.map(normalizeNote).filter((item) => item.note)
        : [];

      if (migrateLocal && overtimeNoteEntity.bulkCreate) {
        const localNotes = loadNotes();
        const remoteFingerprints = new Set(normalizedRemote.map(getNoteFingerprint));
        const localToUpload = !normalizedRemote.length
          ? localNotes
          : localNotes.filter((note) => (
            String(note.id).startsWith("ovt-note-")
            && !remoteFingerprints.has(getNoteFingerprint(note))
          ));

        if (localToUpload.length) {
          await overtimeNoteEntity.bulkCreate(localToUpload.map(({ id, ...note }) => note));
          remoteNotes = await overtimeNoteEntity.list("-date");
          normalizedRemote = Array.isArray(remoteNotes)
            ? remoteNotes.map(normalizeNote).filter((item) => item.note)
            : normalizedRemote;
        }
      }

      setNotes(normalizedRemote);
      setNoteSyncStatus("Live cloud");
    } catch (error) {
      console.error("Overtime monthly note live sync failed:", error);
      setNoteSyncStatus("Local cache only");
    } finally {
      noteSyncInProgressRef.current = false;
    }
  }, [noteCloudReady, overtimeNoteEntity]);

  useEffect(() => {
    if (!noteCloudReady) {
      setNoteSyncStatus("Local cache only");
      return undefined;
    }

    refreshCloudNotes({ migrateLocal: true });

    const intervalId = window.setInterval(() => {
      refreshCloudNotes({ migrateLocal: true, silent: true });
    }, NOTE_LIVE_REFRESH_MS);

    const handleFocus = () => refreshCloudNotes({ migrateLocal: true, silent: true });
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleFocus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [noteCloudReady, refreshCloudNotes]);

  const draftHours = useMemo(
    () => calculateOvertimeHours(draft.startTime, draft.endTime, draft.type),
    [draft.startTime, draft.endTime, draft.type]
  );
  const draftTimingOptions = TIMING_OPTIONS[draft.type] || TIMING_OPTIONS.RDOT;
  const draftTimingValue = getTimingValue(draft.startTime, draft.endTime);
  const draftTimingIsPreset = draftTimingOptions.some(
    (option) => getTimingValue(option.startTime, option.endTime) === draftTimingValue
  );

  const recordsForYear = useMemo(
    () => records.filter((record) => Number(record.date.slice(0, 4)) === selectedYear),
    [records, selectedYear]
  );

  const notesForYear = useMemo(
    () => notes.filter((note) => Number(note.date.slice(0, 4)) === selectedYear),
    [notes, selectedYear]
  );

  const monthSummaries = useMemo(() => MONTHS.map((month, monthIndex) => {
    const monthRecords = recordsForYear.filter((record) => Number(record.date.slice(5, 7)) === monthIndex + 1);
    const monthNotes = notesForYear.filter((note) => Number(note.date.slice(5, 7)) === monthIndex + 1);
    return {
      month,
      count: monthRecords.length,
      rdotCount: monthRecords.filter((record) => record.type === "RDOT").length,
      extensionCount: monthRecords.filter((record) => record.type === "EXTENSION").length,
      hours: roundOne(monthRecords.reduce((total, record) => total + Number(record.hours || 0), 0)),
      noteCount: monthNotes.length,
    };
  }), [notesForYear, recordsForYear]);

  const visibleRecords = useMemo(() => recordsForYear
    .filter((record) => Number(record.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  [recordsForYear, selectedMonth]);

  const visibleNotes = useMemo(() => notesForYear
    .filter((note) => Number(note.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  [notesForYear, selectedMonth]);

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
    notes.forEach((note) => years.add(Number(note.date.slice(0, 4))));
    return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);
  }, [notes, records, selectedYear, today]);

  const resetDraft = (date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`) => {
    setDraft(createRecordDraft(date));
    setEditingId(null);
  };

  const resetNoteDraft = (date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`) => {
    setNoteDraft(createNoteDraft(date));
    setEditingNoteId(null);
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

  const handleNoteSave = async (event) => {
    event.preventDefault();
    const cleanNote = String(noteDraft.note || "").trim();
    if (!noteDraft.date || !cleanNote || noteSaving) return;

    const now = new Date().toISOString();
    const existing = editingNoteId ? notes.find((note) => note.id === editingNoteId) : null;
    const payload = normalizeNote({
      ...(existing || {}),
      ...noteDraft,
      note: cleanNote,
      id: editingNoteId || `ovt-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    setNoteSaving(true);
    try {
      let savedNote = payload;
      if (noteCloudReady) {
        const { id, ...cloudPayload } = payload;
        if (editingNoteId && !String(editingNoteId).startsWith("ovt-note-")) {
          savedNote = normalizeNote(await overtimeNoteEntity.update(editingNoteId, cloudPayload));
        } else {
          savedNote = normalizeNote(await overtimeNoteEntity.create(cloudPayload));
        }
        setNoteSyncStatus("Live cloud");
      } else {
        setNoteSyncStatus("Local cache only");
      }

      setNotes((current) => {
        if (editingNoteId) {
          return current.map((note) => note.id === editingNoteId ? savedNote : note);
        }
        return [...current, savedNote];
      });

      const [year, month] = noteDraft.date.split("-").map(Number);
      setSelectedYear(year);
      setSelectedMonth(month - 1);
      resetNoteDraft(noteDraft.date);
    } catch (error) {
      console.error("Overtime monthly note save failed:", error);
      setNoteSyncStatus("Local cache only");
      setNotes((current) => {
        if (editingNoteId) return current.map((note) => note.id === editingNoteId ? payload : note);
        return [...current, payload];
      });
      resetNoteDraft(noteDraft.date);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleNoteEdit = (note) => {
    setEditingNoteId(note.id);
    setNoteDraft({ date: note.date, note: note.note });
  };

  const handleNoteDelete = async (id) => {
    const removedNote = notes.find((note) => note.id === id);
    setNotes((current) => current.filter((note) => note.id !== id));
    if (editingNoteId === id) resetNoteDraft();

    if (noteCloudReady && !String(id).startsWith("ovt-note-")) {
      try {
        await overtimeNoteEntity.delete(id);
        setNoteSyncStatus("Live cloud");
      } catch (error) {
        console.error("Overtime monthly note delete failed:", error);
        if (removedNote) setNotes((current) => [...current, removedNote]);
        setNoteSyncStatus("Delete not synced");
      }
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Month", "Type", "Start", "End", "Recorded Hours", "Remark"],
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
    link.download = `extension-rdot-${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-[#28455f] bg-[radial-gradient(circle_at_85%_5%,rgba(43,93,141,0.18),transparent_32%),linear-gradient(145deg,rgba(9,29,48,0.98),rgba(5,20,35,0.98))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-[#68b9f1]" strokeWidth={1.8} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b8c9df]">Yearly overview</p>
            </div>
            <h3 className="mt-3 text-[22px] font-semibold leading-tight text-[#f5f8ff] sm:text-[24px]">
              Monthly Extension &amp; RDOT Record
            </h3>
            <p className="mt-2 text-[12px] leading-relaxed text-[#afbed2]">
              Record every Extension or RDOT entry from January to December.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="font-medium text-emerald-300">Learn more</span>
              <span className={syncStatus === "Cloud saved" ? "text-emerald-300/90" : "text-amber-300"}>{syncStatus}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <select
              value={selectedYear}
              onChange={(event) => {
                const year = Number(event.target.value);
                setSelectedYear(year);
                if (!editingId) resetDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
                resetNoteDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
              }}
              className="h-12 min-w-[102px] rounded-2xl border border-[#294660] bg-[#0b2137] px-4 text-[13px] font-semibold text-[#eef5ff] outline-none transition focus:border-[#6a72ff] focus:ring-2 focus:ring-[#6a72ff]/20"
              aria-label="Overtime year"
              style={{ colorScheme: "dark" }}
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!recordsForYear.length}
              className="flex h-12 items-center gap-2 rounded-2xl border border-[#294660] bg-[#0b2137] px-4 text-[12px] font-medium text-[#dce8f7] transition hover:border-[#5776a0] hover:bg-[#102b46] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {monthSummaries.map((summary, monthIndex) => {
            const active = selectedMonth === monthIndex;
            return (
              <button
                key={summary.month}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelectedMonth(monthIndex);
                  if (!editingId) resetDraft(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
                  resetNoteDraft(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
                }}
                className={`min-h-[148px] rounded-[18px] border p-4 text-left transition duration-200 ${active
                  ? "border-[#646cff] bg-[linear-gradient(145deg,rgba(40,56,99,0.72),rgba(11,31,51,0.94))] shadow-[0_0_0_1px_rgba(100,108,255,0.32),0_14px_34px_rgba(20,32,95,0.24)]"
                  : "border-[#203d58] bg-[linear-gradient(145deg,rgba(10,31,51,0.82),rgba(6,23,39,0.90))] hover:-translate-y-0.5 hover:border-[#365d80] hover:bg-[#0b2942]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className={`h-4 w-4 ${active ? "text-[#91a8ff]" : "text-[#9fb1c8]"}`} strokeWidth={1.8} />
                  <p className="text-[13px] font-semibold text-[#f4f7fc]">{summary.month.slice(0, 3).toUpperCase()}</p>
                </div>

                <div className="mt-4 flex items-center">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[24px] font-medium leading-none text-white">{summary.rdotCount}</span>
                    <span className="text-[12px] text-[#aebbd0]">RDOT</span>
                  </div>
                  <div className="mx-4 h-7 w-px bg-[#34516c]" />
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[24px] font-medium leading-none text-white">{summary.extensionCount}</span>
                    <span className="text-[12px] text-[#aebbd0]">EXT</span>
                  </div>
                </div>

                <p className="mt-4 text-[12px] text-[#acbbcf]">
                  {summary.hours.toFixed(1)} hrs <span className="mx-1.5 text-[#68819b]">•</span> {summary.count} record{summary.count === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-[12px] text-[#acbbcf]">
                  {summary.noteCount} monthly note{summary.noteCount === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="flex min-h-[84px] items-center gap-5 rounded-[18px] border border-[#203d58] bg-[linear-gradient(145deg,rgba(9,29,49,0.82),rgba(6,22,38,0.92))] px-5 py-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#66b9f5]">
              <Clock3 className="h-9 w-9" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.20em] text-[#afbed2]">Annual RDOT</p>
              <p className="mt-1 text-[25px] font-medium leading-none text-white">{annualRdotCount}</p>
            </div>
          </div>
          <div className="flex min-h-[84px] items-center gap-5 rounded-[18px] border border-[#203d58] bg-[linear-gradient(145deg,rgba(9,29,49,0.82),rgba(6,22,38,0.92))] px-5 py-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#aabedb]">
              <Clock3 className="h-9 w-9" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.20em] text-[#afbed2]">Annual recorded hours</p>
              <p className="mt-1 text-[25px] font-medium leading-none text-white">{annualHours.toFixed(1)}</p>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSave} className="rounded-[24px] border border-[#28455f] bg-[radial-gradient(circle_at_90%_0%,rgba(50,80,123,0.13),transparent_35%),linear-gradient(145deg,rgba(8,27,45,0.98),rgba(5,20,35,0.98))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.26)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#55708d] bg-[#0e2943] text-[#c6d7eb]">
              <FilePlus2 className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#afbed2]">{editingId ? "Edit record" : "New record"}</p>
              <p className="mt-1 text-[11px] text-[#9eb0c6]">Log a new RDOT or Extension entry.</p>
            </div>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={() => resetDraft()}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-[#294660] bg-[#0b2137] px-3 text-[10px] font-semibold text-[#c9d8e9] transition hover:border-[#607fa5] hover:bg-[#102b46]"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1.1fr_.8fr]">
          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              required
              className="mt-2 h-12 w-full rounded-2xl border border-[#294660] bg-[#102840] px-4 text-[13px] font-medium text-[#eff5fc] outline-none transition focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
              style={{ colorScheme: "dark" }}
            />
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Type</span>
            <select
              value={draft.type}
              onChange={(event) => {
                const type = event.target.value;
                const timing = getDefaultTiming(type);
                setDraft((current) => ({
                  ...current,
                  type,
                  startTime: timing.startTime,
                  endTime: timing.endTime,
                }));
              }}
              className="mt-2 h-12 w-full rounded-2xl border border-[#294660] bg-[#102840] px-4 text-[13px] font-medium text-[#eff5fc] outline-none transition focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
              style={{ colorScheme: "dark" }}
            >
              <option value="RDOT">RDOT</option>
              <option value="EXTENSION">Extension</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Time</span>
            <select
              value={draftTimingValue}
              onChange={(event) => {
                const [startTime, endTime] = event.target.value.split("|");
                setDraft((current) => ({ ...current, startTime, endTime }));
              }}
              required
              className="mt-2 h-12 w-full rounded-2xl border border-[#294660] bg-[#102840] px-4 text-[13px] font-medium text-[#eff5fc] outline-none transition focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
              style={{ colorScheme: "dark" }}
            >
              {!draftTimingIsPreset && (
                <option value={draftTimingValue}>{getTimingLabel(draft.startTime, draft.endTime)} (previous)</option>
              )}
              {draftTimingOptions.map((option, index) => {
                const timingValue = getTimingValue(option.startTime, option.endTime);
                const showPairSeparator = draft.type === "EXTENSION" && (index === 2 || index === 4);
                return (
                  <Fragment key={timingValue}>
                    {showPairSeparator && <option disabled value={`separator-${index}`}>──────────────</option>}
                    <option value={timingValue}>{getTimingLabel(option.startTime, option.endTime)}</option>
                  </Fragment>
                );
              })}
            </select>
          </label>

          <div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Hours</span>
            <div className="mt-2 flex h-12 items-center justify-center rounded-2xl border border-emerald-400/45 bg-emerald-500/10 text-[17px] font-semibold text-emerald-300 shadow-[inset_0_0_18px_rgba(16,185,129,0.04)]">
              {draftHours.toFixed(1)}
            </div>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Remark (optional)</span>
          <input
            value={draft.remark}
            onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))}
            placeholder="Example: Night shift / replacement duty"
            className="mt-2 h-12 w-full rounded-2xl border border-[#294660] bg-[#102840] px-4 text-[13px] font-normal text-[#eff5fc] outline-none placeholder:text-[#8295ad] focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
          />
        </label>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-relaxed text-[#9babc0]">
            RDOT uses the full selected shift duration. Extension deducts 8.5 normal working hours.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#7179ff]/70 bg-[linear-gradient(135deg,#5a55ed,#465ee9)] px-5 text-[13px] font-semibold text-white shadow-[0_10px_25px_rgba(72,78,220,0.28)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            {saving ? "Saving" : editingId ? "Update Record" : "Add Record"}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-[24px] border border-[#28455f] bg-[radial-gradient(circle_at_90%_0%,rgba(50,80,123,0.13),transparent_35%),linear-gradient(145deg,rgba(8,27,45,0.98),rgba(5,20,35,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.26)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-5 sm:px-6 sm:pt-6">
          <div className="flex min-w-0 items-start gap-4">
            <MessageSquareText className="mt-0.5 h-7 w-7 shrink-0 text-[#61baff]" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#afbed2]">Monthly notes</p>
              <p className="mt-1 text-[11px] text-[#9eb0c6]">Save notes for the selected month.</p>
              <p className={`mt-1 text-[9px] font-semibold ${noteSyncStatus === "Live cloud" ? "text-emerald-300" : "text-amber-300"}`}>{noteSyncStatus}</p>
            </div>
          </div>
          <p className="rounded-full border border-[#243f59] bg-[#0e2740] px-4 py-2 text-[11px] font-medium text-[#d6e2f0]">
            {MONTHS[selectedMonth]} {selectedYear}
          </p>
        </div>

        <form onSubmit={handleNoteSave} className="px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
          <div className="grid gap-3 lg:grid-cols-[205px_1fr_auto] lg:items-end">
            <label className="block">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Date</span>
              <input
                type="date"
                value={noteDraft.date}
                min={`${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`}
                max={`${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, "0")}`}
                onChange={(event) => setNoteDraft((current) => ({ ...current, date: event.target.value }))}
                required
                className="mt-2 h-12 w-full rounded-2xl border border-[#294660] bg-[#102840] px-4 text-[13px] font-medium text-[#eff5fc] outline-none focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
                style={{ colorScheme: "dark" }}
              />
            </label>

            <label className="block">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Note</span>
              <input
                value={noteDraft.note}
                onChange={(event) => setNoteDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="Example: Submit January Extension/RDOT form before 5 February"
                required
                className="mt-2 h-12 w-full rounded-2xl border border-[#294660] bg-[#102840] px-4 text-[13px] font-normal text-[#eff5fc] outline-none placeholder:text-[#8295ad] focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
              />
            </label>

            <div className="flex gap-2">
              {editingNoteId && (
                <button
                  type="button"
                  onClick={() => resetNoteDraft()}
                  className="flex h-12 items-center gap-1.5 rounded-2xl border border-[#294660] bg-[#0b2137] px-3 text-[10px] font-semibold text-[#c9d8e9] transition hover:border-[#607fa5] hover:bg-[#102b46]"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={noteSaving || !String(noteDraft.note || "").trim()}
                className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#294660] bg-[#0d2740] px-5 text-[11px] font-medium text-[#dce8f7] transition hover:border-[#5776a0] hover:bg-[#12324f] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {noteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingNoteId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {noteSaving ? "Saving" : editingNoteId ? "Update Note" : "Add Note"}
              </button>
            </div>
          </div>
        </form>

        <div className="border-t border-[#1a354e] px-4 py-3 sm:px-6">
          {!visibleNotes.length ? (
            <div className="py-5 text-center">
              <p className="text-[11px] text-[#91a4bb]">No monthly notes added yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNotes.map((note) => (
                <div key={note.id} className="flex items-center gap-3 rounded-2xl border border-[#203d58] bg-[#0a2238]/70 px-3 py-3 transition hover:border-[#345d80] hover:bg-[#0c2943]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-500/10 text-emerald-300">
                    <MessageSquareText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[#f1f5fb]">{formatDate(note.date)}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#b5c2d3]">{note.note}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNoteEdit(note)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#294660] text-[#afbed2] transition hover:border-[#5d7ea5] hover:bg-[#12314e] hover:text-white"
                    aria-label="Edit monthly note"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNoteDelete(note.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                    aria-label="Delete monthly note"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[#28455f] bg-[radial-gradient(circle_at_90%_0%,rgba(50,80,123,0.13),transparent_35%),linear-gradient(145deg,rgba(8,27,45,0.98),rgba(5,20,35,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.26)]">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#55708d] bg-[#0e2943] text-[#c6d7eb]">
              <ListChecks className="h-4.5 w-4.5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#afbed2]">Records</p>
              <p className="mt-1 text-[11px] text-[#9eb0c6]">View all RDOT and Extension entries.</p>
            </div>
          </div>
          <p className="rounded-full border border-[#203b55] bg-[#0d2740] px-4 py-2 text-[11px] font-medium text-[#d3dfed]">
            <span className="text-emerald-300">{visibleRecords.length}</span> entr{visibleRecords.length === 1 ? "y" : "ies"}
          </p>
        </div>

        <div className="px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
          {!visibleRecords.length ? (
            <div className="rounded-2xl border border-dashed border-[#294660] px-5 py-9 text-center">
              <Plus className="mx-auto h-5 w-5 text-[#8196ad]" />
              <p className="mt-3 text-[12px] text-[#91a4bb]">No Extension or RDOT recorded for this month.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleRecords.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#203d58] bg-[#0a2238]/70 px-3 py-3 transition hover:border-[#345d80] hover:bg-[#0c2943] sm:flex-nowrap">
                  <div className={`flex h-11 w-[78px] shrink-0 items-center justify-center rounded-xl border px-2 text-[11px] font-semibold ${record.type === "RDOT"
                    ? "border-[#5b56c8]/50 bg-[#252459]/55 text-[#8f94ff]"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                  }`}>
                    {record.type === "EXTENSION" ? "EXT" : record.type}
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                      <p className="text-[13px] font-semibold text-[#f1f5fb]">{formatDate(record.date)}</p>
                      <span className="text-[12px] text-[#79a9d2]">{record.startTime} – {record.endTime}</span>
                    </div>
                    {record.remark && <p className="mt-1 truncate text-[11px] text-[#b5c2d3]">{record.remark}</p>}
                  </div>
                  <div className="ml-auto min-w-[74px] shrink-0 border-r border-[#294660] pr-4 text-right">
                    <p className="text-[18px] font-semibold leading-none text-emerald-300">{Number(record.hours).toFixed(1)}</p>
                    <p className="mt-1 text-[8px] uppercase tracking-[0.12em] text-[#8ea1b8]">Hours</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEdit(record)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#294660] text-[#afbed2] transition hover:border-[#5d7ea5] hover:bg-[#12314e] hover:text-white"
                    aria-label="Edit Extension or RDOT record"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(record.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                    aria-label="Delete Extension or RDOT record"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
