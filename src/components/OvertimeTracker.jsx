import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, NotebookPen, Pencil, Plus, Save, Trash2, X } from "lucide-react";
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
    <div className="space-y-4">
      <section className="rounded-[24px] border border-[#1d4869] bg-[#0a2238]/80 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#6db6e8]">Yearly overview</p>
            <h3 className="mt-1 text-[17px] font-normal text-white">Monthly Extension & RDOT Record</h3>
            <p className="mt-1 text-[11px] text-[#8dc7ed]">Record every Extension or RDOT entry from January to December.</p>
            <p className={`mt-1 text-[9px] font-semibold ${syncStatus === "Cloud saved" ? "text-emerald-300" : "text-amber-300"}`}>{syncStatus}</p>
          </div>
          <select
            value={selectedYear}
            onChange={(event) => {
              const year = Number(event.target.value);
              setSelectedYear(year);
              if (!editingId) resetDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
              resetNoteDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
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
                  resetNoteDraft(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
                }}
                className={`rounded-2xl border px-3 py-3 text-left transition ${active
                  ? "border-[#69b9ef] bg-[#123b5d] shadow-[0_0_20px_rgba(79,142,247,0.18)]"
                  : "border-[#1d4869] bg-[#071d30] hover:border-[#376c90] hover:bg-[#0b2942]"
                }`}
              >
                <p className={`text-[13px] font-semibold ${active ? "text-white" : "text-[#bceaff]"}`}>{summary.month.slice(0, 3).toUpperCase()}</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <p className="text-[19px] font-normal text-white">{summary.rdotCount} <span className="text-[11px] uppercase tracking-wide text-[#7eb8e0]">RDOT</span></p>
                  <p className="text-[19px] font-normal text-white">{summary.extensionCount} <span className="text-[11px] uppercase tracking-wide text-[#7eb8e0]">EXT</span></p>
                </div>
                <p className="mt-0.5 text-[12px] text-[#8dc7ed]">{summary.hours.toFixed(1)} hrs · {summary.count} record{summary.count === 1 ? "" : "s"}</p>
                <p className="mt-0.5 text-[11px] text-[#6db6e8]">{summary.noteCount} monthly note{summary.noteCount === 1 ? "" : "s"}</p>
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
            <p className="text-[9px] uppercase tracking-[0.18em] text-[#6db6e8]">Annual recorded hours</p>
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

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1.6fr_0.8fr]">
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
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-semibold text-[#061827] outline-none focus:border-[#4f8ef7]"
            >
              <option value="RDOT">RDOT</option>
              <option value="EXTENSION">Extension</option>
            </select>
          </label>
          <label className="col-span-2 block sm:col-span-1">
            <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Timing</span>
            <select
              value={draftTimingValue}
              onChange={(event) => {
                const [startTime, endTime] = event.target.value.split("|");
                setDraft((current) => ({ ...current, startTime, endTime }));
              }}
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-semibold text-[#061827] outline-none focus:border-[#4f8ef7]"
            >
              {!draftTimingIsPreset && (
                <option value={draftTimingValue}>{getTimingLabel(draft.startTime, draft.endTime)} (previous)</option>
              )}
              {draftTimingOptions.map((option, index) => {
                const timingValue = getTimingValue(option.startTime, option.endTime);
                const showPairSeparator = draft.type === "EXTENSION" && (index === 2 || index === 4);

                return (
                  <Fragment key={timingValue}>
                    {showPairSeparator && (
                      <option disabled value={`separator-${index}`}>──────────────</option>
                    )}
                    <option value={timingValue}>
                      {getTimingLabel(option.startTime, option.endTime)}
                    </option>
                  </Fragment>
                );
              })}
            </select>
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
            RDOT uses the full selected shift duration. Extension deducts 8.5 normal working hours.
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a3a56] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
              <NotebookPen className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#6db6e8]">Monthly notes</p>
              <h3 className="mt-0.5 truncate text-[15px] font-normal text-white">{MONTHS[selectedMonth]} {selectedYear}</h3>
              <p className="mt-0.5 text-[9px] text-[#7eb8e0]">Saved to Cloudflare D1 and refreshed automatically across devices every 5 seconds.</p>
            </div>
          </div>
          <p className={`text-[9px] font-semibold ${noteSyncStatus === "Live cloud" ? "text-emerald-300" : "text-amber-300"}`}>
            {noteSyncStatus}
          </p>
        </div>

        <form onSubmit={handleNoteSave} className="border-b border-[#163952] p-4">
          <div className="grid gap-3 sm:grid-cols-[170px_1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Note date</span>
              <input
                type="date"
                value={noteDraft.date}
                min={`${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`}
                max={`${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, "0")}`}
                onChange={(event) => setNoteDraft((current) => ({ ...current, date: event.target.value }))}
                required
                className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-2.5 text-[12px] font-normal text-[#061827] outline-none focus:border-[#4f8ef7]"
              />
            </label>

            <label className="block">
              <span className="text-[9px] font-normal uppercase tracking-wide text-[#7eb8e0]">Note</span>
              <input
                value={noteDraft.note}
                onChange={(event) => setNoteDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="Example: Submit January Extension/RDOT form before 5 February"
                required
                className="mt-1.5 h-10 w-full rounded-xl border border-[#2b4f6b] bg-[#eef5ff] px-3 text-[12px] font-normal text-[#061827] outline-none placeholder:text-[#70839a] focus:border-[#4f8ef7]"
              />
            </label>

            <div className="flex gap-2">
              {editingNoteId && (
                <button
                  type="button"
                  onClick={() => resetNoteDraft()}
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-[#2b4f6b] px-3 text-[10px] font-semibold text-[#bceaff] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a]"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={noteSaving || !String(noteDraft.note || "").trim()}
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-700/40 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-700/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {noteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingNoteId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {noteSaving ? "Saving" : editingNoteId ? "Update note" : "Add note"}
              </button>
            </div>
          </div>
        </form>

        {!visibleNotes.length ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[11px] text-[#8dc7ed]">No monthly notes added yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#163952]">
            {visibleNotes.map((note) => (
              <div key={note.id} className="flex items-start gap-3 px-4 py-3 transition hover:bg-[#0a2238]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
                  <NotebookPen className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-white">{formatDate(note.date)}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#bceaff]">{note.note}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleNoteEdit(note)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2b4f6b] text-[#8dc7ed] transition hover:border-[#4f8ef7] hover:bg-[#0f2d4a] hover:text-white"
                  aria-label="Edit monthly note"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNoteDelete(note.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                  aria-label="Delete monthly note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

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
            <p className="mt-3 text-[12px] text-[#8dc7ed]">No Extension or RDOT recorded for this month.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#163952]">
            {visibleRecords.map((record) => (
              <div key={record.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#0a2238]">
                <div className={`flex h-10 w-20 shrink-0 items-center justify-center rounded-xl border px-2 text-[9px] font-semibold ${record.type === "RDOT"
                  ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                }`}>
                  {record.type === "EXTENSION" ? "Extension" : record.type}
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
                  aria-label="Edit Extension or RDOT record"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(record.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                  aria-label="Delete Extension or RDOT record"
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
