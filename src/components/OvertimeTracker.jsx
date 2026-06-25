import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Calculator, CalendarDays, Check, Clock3, Download, FilePlus2, ListChecks, Loader2, MessageSquareText, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

const OVERTIME_STORAGE_KEY = "ovtOvertimeRecords_v1";
const OVERTIME_NOTE_STORAGE_KEY = "ovtMonthlyNotes_v1";
const ALLOWANCE_STORAGE_KEY = "ovtAllowanceChecks_v1";
const SELECTED_YEAR_STORAGE_KEY = "ovtSelectedYear_v1";
const EXTRA_YEARS_STORAGE_KEY = "ovtExtraYears_v1";
const NOTE_LIVE_REFRESH_MS = 5000;
const ALLOWANCE_LIVE_REFRESH_MS = 5000;
const ALLOWANCE_AUTOSAVE_DELAY_MS = 800;
const DEFAULT_BASIC_SALARY = 15000;
const DEFAULT_SALARY_WITH_LAUNDRY = 15100;
const NIGHT_ALLOWANCE_RATE = 45;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const NORMAL_TIMING_OPTIONS = {
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

const RAMADAN_TIMING_OPTIONS = {
  EXTENSION: [
    { startTime: "07:00", endTime: "15:30" },
    { startTime: "15:00", endTime: "23:30" },
    { startTime: "23:00", endTime: "07:30" },
  ],
  RDOT: [
    { startTime: "07:00", endTime: "15:30" },
    { startTime: "15:00", endTime: "23:30" },
    { startTime: "23:00", endTime: "07:30" },
  ],
};

function normalizeDayType(value = "NORMAL") {
  const normalized = String(value || "NORMAL").toUpperCase();
  return normalized === "RAMADAN" || normalized === "RAMADHAN" ? "RAMADAN" : "NORMAL";
}

function getTimingOptions(dayType = "NORMAL", type = "RDOT") {
  const options = normalizeDayType(dayType) === "RAMADAN"
    ? RAMADAN_TIMING_OPTIONS
    : NORMAL_TIMING_OPTIONS;
  return options[type] || options.RDOT;
}

function getDefaultTiming(type = "RDOT", dayType = "NORMAL") {
  return getTimingOptions(dayType, type)[0];
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

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getHighestMonthlyPerformance(values = []) {
  const normalizedValues = MONTHS.map((_, index) => Math.max(0, Number(values[index] || 0)));
  const total = Math.max(0, ...normalizedValues);

  if (total <= 0) {
    return {
      total: 0,
      monthLabel: "No record",
      fullMonthLabel: "No record",
    };
  }

  const matchingMonths = normalizedValues
    .map((value, index) => value === total ? MONTHS[index].slice(0, 3).toUpperCase() : null)
    .filter(Boolean);

  return {
    total,
    monthLabel: matchingMonths.length <= 2
      ? matchingMonths.join(" & ")
      : `${matchingMonths[0]} +${matchingMonths.length - 1}`,
    fullMonthLabel: matchingMonths.join(", "),
  };
}

function getMinutes(time = "") {
  const [hours, minutes] = String(time).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
}

function calculateOvertimeHours(startTime, endTime, type = "RDOT", dayType = "NORMAL") {
  const startMinutes = getMinutes(startTime);
  const endMinutes = getMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return 0;

  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;

  const durationHours = durationMinutes / 60;
  if (String(type).toUpperCase() === "RDOT") return roundOne(durationHours);
  const baseHours = normalizeDayType(dayType) === "RAMADAN" ? 6 : 8.5;
  return roundOne(Math.max(0, durationHours - baseHours));
}

function createRecordDraft(date = getLocalDateValue()) {
  const dayType = "NORMAL";
  const timing = getDefaultTiming("RDOT", dayType);
  return {
    date,
    dayType,
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
  const dayType = normalizeDayType(record.dayType || record.day_type);
  const defaultTiming = getDefaultTiming(type, dayType);
  const startTime = /^\d{2}:\d{2}$/.test(String(record.startTime || "")) ? String(record.startTime) : defaultTiming.startTime;
  const endTime = /^\d{2}:\d{2}$/.test(String(record.endTime || "")) ? String(record.endTime) : defaultTiming.endTime;

  return {
    id: String(record.id || `ovt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    date,
    dayType,
    type,
    startTime,
    endTime,
    hours: calculateOvertimeHours(startTime, endTime, type, dayType),
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

function getNextMonthPeriod(workYear, workMonthIndex) {
  const date = new Date(Number(workYear), Number(workMonthIndex) + 1, 1);
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
  };
}

function createAllowanceDraft(workYear, workMonthIndex) {
  return {
    workYear: Number(workYear),
    workMonth: Number(workMonthIndex) + 1,
    basicSalary: String(DEFAULT_BASIC_SALARY),
    salaryWithLaundry: String(DEFAULT_SALARY_WITH_LAUNDRY),
    salaryReceived: "",
    nightDays: "",
    nightAllowance: "0",
  };
}

function calculateNightAllowance(nightDays) {
  const days = Math.max(0, Math.trunc(parseAmount(nightDays)));
  return days * NIGHT_ALLOWANCE_RATE;
}

function normalizeAllowanceCheck(check = {}) {
  const now = new Date();
  const workYear = Number(check.workYear || check.work_year) || now.getFullYear();
  const rawMonth = Number(check.workMonth || check.work_month) || (now.getMonth() + 1);
  const workMonth = Math.min(12, Math.max(1, rawMonth));
  const salaryPeriod = getNextMonthPeriod(workYear, workMonth - 1);
  const nightDays = String(check.nightDays ?? check.night_days ?? "");

  return {
    id: String(check.id || `ovt-allowance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    workYear,
    workMonth,
    salaryYear: Number(check.salaryYear || check.salary_year) || salaryPeriod.year,
    salaryMonth: Number(check.salaryMonth || check.salary_month) || (salaryPeriod.monthIndex + 1),
    basicSalary: String(check.basicSalary ?? check.basic_salary ?? DEFAULT_BASIC_SALARY),
    salaryWithLaundry: String(check.salaryWithLaundry ?? check.salary_with_laundry ?? DEFAULT_SALARY_WITH_LAUNDRY),
    salaryReceived: String(check.salaryReceived ?? check.salary_received ?? ""),
    nightDays,
    nightAllowance: String(calculateNightAllowance(nightDays)),
    createdAt: check.createdAt || new Date().toISOString(),
    updatedAt: check.updatedAt || check.createdAt || new Date().toISOString(),
  };
}

function loadAllowanceChecks() {
  try {
    const raw = localStorage.getItem(ALLOWANCE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeAllowanceCheck) : [];
  } catch {
    return [];
  }
}

function saveAllowanceChecks(checks) {
  try {
    localStorage.setItem(ALLOWANCE_STORAGE_KEY, JSON.stringify(checks));
  } catch {}
}

function loadSelectedYear(fallbackYear) {
  try {
    const savedYear = Number(localStorage.getItem(SELECTED_YEAR_STORAGE_KEY));
    return Number.isInteger(savedYear) && savedYear >= 2000 && savedYear <= 2200
      ? savedYear
      : fallbackYear;
  } catch {
    return fallbackYear;
  }
}

function loadExtraYears() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXTRA_YEARS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2200)
      : [];
  } catch {
    return [];
  }
}

function getAllowancePeriodKey(check = {}) {
  return `${Number(check.workYear || check.work_year) || 0}-${Number(check.workMonth || check.work_month) || 0}`;
}

function getAllowanceUpdatedTime(check = {}) {
  const value = Date.parse(check.updatedAt || check.updated_date || check.createdAt || check.created_date || 0);
  return Number.isFinite(value) ? value : 0;
}

function dedupeAllowanceChecks(checks = []) {
  const byPeriod = new Map();

  (Array.isArray(checks) ? checks : []).map(normalizeAllowanceCheck).forEach((check) => {
    const key = getAllowancePeriodKey(check);
    const current = byPeriod.get(key);
    if (!current || getAllowanceUpdatedTime(check) >= getAllowanceUpdatedTime(current)) {
      byPeriod.set(key, check);
    }
  });

  return Array.from(byPeriod.values());
}

function upsertAllowanceCheck(checks = [], nextCheck = {}) {
  const normalized = normalizeAllowanceCheck(nextCheck);
  const key = getAllowancePeriodKey(normalized);
  const withoutPeriod = (Array.isArray(checks) ? checks : []).filter((check) => getAllowancePeriodKey(check) !== key);
  return [...withoutPeriod, normalized];
}

function getLatestAllowanceCheck(checks = [], workYear, workMonth) {
  return (Array.isArray(checks) ? checks : [])
    .filter((check) => Number(check.workYear) === Number(workYear) && Number(check.workMonth) === Number(workMonth))
    .sort((left, right) => getAllowanceUpdatedTime(right) - getAllowanceUpdatedTime(left))[0] || null;
}

function calculateAllowanceResult(values = {}, overtimeHoursValue = 0) {
  const basicSalary = parseAmount(values.basicSalary);
  const salaryWithLaundry = parseAmount(values.salaryWithLaundry);
  const salaryReceived = parseAmount(values.salaryReceived);
  const nightDays = Math.max(0, Math.trunc(parseAmount(values.nightDays)));
  const nightAllowance = calculateNightAllowance(nightDays);
  const overtimeHours = Number(overtimeHoursValue || 0);
  const expectedOvertime = roundCurrency(
    basicSalary > 0 ? (basicSalary / 192 * 1.5) * overtimeHours : 0
  );
  const totalAllowanceReceived = roundCurrency(salaryReceived - salaryWithLaundry);
  const remainingForOvertime = roundCurrency(totalAllowanceReceived - nightAllowance);
  const differenceValue = roundCurrency(remainingForOvertime - expectedOvertime);
  const hasSalaryReceived = String(values.salaryReceived || "").trim() !== "" && salaryReceived > 0;
  let status = "WAITING";
  if (hasSalaryReceived) {
    if (differenceValue === 0) status = "CORRECT";
    else if (differenceValue > 0) status = "EXTRA";
    else status = "SHORT";
  }

  return {
    overtimeHours,
    expectedOvertime,
    totalAllowanceReceived,
    nightDays,
    nightAllowance,
    remainingForOvertime,
    difference: Math.abs(differenceValue),
    status,
    hasSalaryReceived,
  };
}

function parseAmount(value) {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function sanitizeDecimalInput(value, maximumDecimals = 2) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const decimalIndex = cleaned.indexOf(".");
  const wholeRaw = (decimalIndex >= 0 ? cleaned.slice(0, decimalIndex) : cleaned).replace(/\./g, "");
  const decimalRaw = decimalIndex >= 0
    ? cleaned.slice(decimalIndex + 1).replace(/\./g, "").slice(0, maximumDecimals)
    : "";
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");

  return decimalIndex >= 0 ? `${whole || "0"}.${decimalRaw}` : whole;
}

function sanitizeIntegerInput(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
}

function formatAmountInput(value) {
  const normalized = String(value ?? "").replace(/,/g, "");
  if (!normalized) return "";

  const hasDecimal = normalized.includes(".");
  const [wholeRaw, decimal = ""] = normalized.split(".");
  const wholeDigits = String(wholeRaw || "0").replace(/\D/g, "") || "0";
  const formattedWhole = wholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return hasDecimal ? `${formattedWhole}.${decimal}` : formattedWhole;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
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
  const [allowanceChecks, setAllowanceChecks] = useState(() => loadAllowanceChecks());
  const [selectedYear, setSelectedYear] = useState(() => loadSelectedYear(today.getFullYear()));
  const [extraYears, setExtraYears] = useState(() => loadExtraYears());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [draft, setDraft] = useState(() => createRecordDraft());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState(() => createNoteDraft());
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Local cache ready");
  const [noteSyncStatus, setNoteSyncStatus] = useState("Local cache ready");
  const [allowanceDraft, setAllowanceDraft] = useState(() => createAllowanceDraft(today.getFullYear(), today.getMonth()));
  const [allowanceDirty, setAllowanceDirty] = useState(false);
  const [allowanceSyncStatus, setAllowanceSyncStatus] = useState("Local cache ready");
  const noteSyncInProgressRef = useRef(false);
  const allowanceSyncInProgressRef = useRef(false);
  const allowanceDirtyRef = useRef(false);
  const allowanceDraftRef = useRef(allowanceDraft);
  const allowanceChecksRef = useRef(allowanceChecks);

  const overtimeEntity = base44?.entities?.OvertimeRecord || null;
  const overtimeNoteEntity = base44?.entities?.OvertimeMonthlyNote || null;
  const allowanceEntity = base44?.entities?.OvertimeAllowanceCheck || null;
  const cloudReady = Boolean(
    overtimeEntity?.list && overtimeEntity?.create && overtimeEntity?.update && overtimeEntity?.delete
  );
  const noteCloudReady = Boolean(
    overtimeNoteEntity?.list && overtimeNoteEntity?.create && overtimeNoteEntity?.update && overtimeNoteEntity?.delete
  );
  const allowanceCloudReady = Boolean(
    allowanceEntity?.list && allowanceEntity?.create && allowanceEntity?.update && allowanceEntity?.delete
  );

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_YEAR_STORAGE_KEY, String(selectedYear));
    } catch {}
  }, [selectedYear]);

  useEffect(() => {
    try {
      localStorage.setItem(EXTRA_YEARS_STORAGE_KEY, JSON.stringify(extraYears));
    } catch {}
  }, [extraYears]);

  useEffect(() => {
    const compactChecks = dedupeAllowanceChecks(allowanceChecks);
    allowanceChecksRef.current = compactChecks;
    saveAllowanceChecks(compactChecks);
  }, [allowanceChecks]);

  useEffect(() => {
    allowanceDraftRef.current = allowanceDraft;
  }, [allowanceDraft]);

  useEffect(() => {
    allowanceDirtyRef.current = allowanceDirty;
  }, [allowanceDirty]);

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

  const refreshCloudAllowanceChecks = useCallback(async ({ migrateLocal = false, silent = false } = {}) => {
    if (!allowanceCloudReady || allowanceSyncInProgressRef.current) return;
    if (silent && allowanceDirtyRef.current) return;

    allowanceSyncInProgressRef.current = true;
    if (!silent) setAllowanceSyncStatus("Syncing...");

    try {
      let remoteChecks = await allowanceEntity.list("-updatedAt");
      let normalizedRemote = dedupeAllowanceChecks(remoteChecks);

      if (migrateLocal) {
        const localChecks = dedupeAllowanceChecks(loadAllowanceChecks());

        for (const localCheck of localChecks) {
          const remoteMatch = getLatestAllowanceCheck(
            normalizedRemote,
            localCheck.workYear,
            localCheck.workMonth
          );
          const localIsNewer = getAllowanceUpdatedTime(localCheck) > getAllowanceUpdatedTime(remoteMatch || {});
          const { id: _localId, ...cloudPayload } = localCheck;

          if (!remoteMatch) {
            const created = normalizeAllowanceCheck(await allowanceEntity.create(cloudPayload));
            normalizedRemote = upsertAllowanceCheck(normalizedRemote, created);
          } else if (localIsNewer) {
            const updated = normalizeAllowanceCheck(await allowanceEntity.update(remoteMatch.id, cloudPayload));
            normalizedRemote = upsertAllowanceCheck(normalizedRemote, updated);
          }
        }

        remoteChecks = await allowanceEntity.list("-updatedAt");
        normalizedRemote = dedupeAllowanceChecks(remoteChecks);
      }

      if (!allowanceDirtyRef.current) {
        setAllowanceChecks(normalizedRemote);
      }
      setAllowanceSyncStatus("Live cloud");
    } catch (error) {
      console.error("Overtime allowance check live sync failed:", error);
      setAllowanceSyncStatus("Local saved");
    } finally {
      allowanceSyncInProgressRef.current = false;
    }
  }, [allowanceCloudReady, allowanceEntity]);

  useEffect(() => {
    if (!allowanceCloudReady) {
      setAllowanceSyncStatus("Local saved");
      return undefined;
    }

    refreshCloudAllowanceChecks({ migrateLocal: true });

    const intervalId = window.setInterval(() => {
      refreshCloudAllowanceChecks({ migrateLocal: true, silent: true });
    }, ALLOWANCE_LIVE_REFRESH_MS);

    const handleFocus = () => refreshCloudAllowanceChecks({ migrateLocal: true, silent: true });
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
  }, [allowanceCloudReady, refreshCloudAllowanceChecks]);

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
    () => calculateOvertimeHours(draft.startTime, draft.endTime, draft.type, draft.dayType),
    [draft.startTime, draft.endTime, draft.type, draft.dayType]
  );
  const draftTimingOptions = getTimingOptions(draft.dayType, draft.type);
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

  const activeAllowanceCheck = useMemo(
    () => getLatestAllowanceCheck(allowanceChecks, selectedYear, selectedMonth + 1),
    [allowanceChecks, selectedMonth, selectedYear]
  );

  useEffect(() => {
    if (allowanceDirty) return;

    setAllowanceDraft(activeAllowanceCheck
      ? {
          workYear: activeAllowanceCheck.workYear,
          workMonth: activeAllowanceCheck.workMonth,
          basicSalary: activeAllowanceCheck.basicSalary,
          salaryWithLaundry: activeAllowanceCheck.salaryWithLaundry,
          salaryReceived: activeAllowanceCheck.salaryReceived,
          nightDays: activeAllowanceCheck.nightDays,
          nightAllowance: activeAllowanceCheck.nightAllowance,
        }
      : createAllowanceDraft(selectedYear, selectedMonth));
  }, [activeAllowanceCheck?.id, activeAllowanceCheck?.updatedAt, allowanceDirty, selectedMonth, selectedYear]);

  const selectedMonthSummary = monthSummaries[selectedMonth] || { hours: 0 };
  const salaryPeriod = useMemo(
    () => getNextMonthPeriod(selectedYear, selectedMonth),
    [selectedMonth, selectedYear]
  );
  const allowanceResult = useMemo(
    () => calculateAllowanceResult(allowanceDraft, selectedMonthSummary.hours),
    [allowanceDraft, selectedMonthSummary.hours]
  );

  const monthAllowanceStatuses = useMemo(() => MONTHS.map((_, monthIndex) => {
    const savedCheck = getLatestAllowanceCheck(allowanceChecks, selectedYear, monthIndex + 1);
    return calculateAllowanceResult(savedCheck || {}, monthSummaries[monthIndex]?.hours || 0).status;
  }), [allowanceChecks, monthSummaries, selectedYear]);

  const monthNightTotals = useMemo(() => MONTHS.map((_, monthIndex) => {
    const savedCheck = getLatestAllowanceCheck(allowanceChecks, selectedYear, monthIndex + 1);
    return Math.max(0, Math.trunc(parseAmount(savedCheck?.nightDays)));
  }), [allowanceChecks, selectedYear]);

  const visibleRecords = useMemo(() => recordsForYear
    .filter((record) => Number(record.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
  [recordsForYear, selectedMonth]);

  const visibleNotes = useMemo(() => notesForYear
    .filter((note) => Number(note.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
  [notesForYear, selectedMonth]);

  const visibleEntries = useMemo(() => [
    ...visibleRecords.map((record) => ({
      key: `record-${record.id}`,
      kind: "record",
      date: record.date,
      createdAt: record.createdAt,
      item: record,
    })),
    ...visibleNotes.map((note) => ({
      key: `note-${note.id}`,
      kind: "note",
      date: note.date,
      createdAt: note.createdAt,
      item: note,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
  [visibleNotes, visibleRecords]);

  const annualHours = useMemo(
    () => roundOne(recordsForYear.reduce((total, record) => total + Number(record.hours || 0), 0)),
    [recordsForYear]
  );
  const annualRdotCount = useMemo(
    () => recordsForYear.filter((record) => record.type === "RDOT").length,
    [recordsForYear]
  );
  const annualExtensionCount = useMemo(
    () => recordsForYear.filter((record) => record.type === "EXTENSION").length,
    [recordsForYear]
  );
  const highestNightShift = useMemo(
    () => getHighestMonthlyPerformance(monthNightTotals),
    [monthNightTotals]
  );
  const highestExtensionOnly = useMemo(
    () => getHighestMonthlyPerformance(monthSummaries.map((summary) => summary.extensionCount)),
    [monthSummaries]
  );
  const highestRdotOnly = useMemo(
    () => getHighestMonthlyPerformance(monthSummaries.map((summary) => summary.rdotCount)),
    [monthSummaries]
  );

  const availableYears = useMemo(() => {
    const currentYear = today.getFullYear();
    const years = new Set([currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3, selectedYear, ...extraYears]);
    records.forEach((record) => years.add(Number(record.date.slice(0, 4))));
    notes.forEach((note) => years.add(Number(note.date.slice(0, 4))));
    return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);
  }, [extraYears, notes, records, selectedYear, today]);

  const handleYearChange = (nextYear) => {
    const year = Number(nextYear);
    if (!Number.isInteger(year)) return;
    flushAllowanceBeforePeriodChange();
    setSelectedYear(year);
    setExtraYears((current) => current.includes(year) ? current : [...current, year]);
    if (!editingId) resetDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
    resetNoteDraft(`${year}-${String(selectedMonth + 1).padStart(2, "0")}-01`);
  };

  const handleAddNextYear = () => {
    handleYearChange(selectedYear + 1);
  };

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
      dayType: record.dayType,
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

  const saveAllowanceDraft = useCallback(async (draftSnapshot) => {
    if (allowanceSyncInProgressRef.current) {
      window.setTimeout(() => {
        if (allowanceDirtyRef.current) {
          void saveAllowanceDraft(draftSnapshot);
        }
      }, 350);
      return;
    }

    const normalizedDraftSnapshot = {
      ...draftSnapshot,
      nightAllowance: String(calculateNightAllowance(draftSnapshot.nightDays)),
    };
    const workYear = Number(normalizedDraftSnapshot.workYear) || selectedYear;
    const workMonth = Number(normalizedDraftSnapshot.workMonth) || (selectedMonth + 1);
    const salaryPeriodForDraft = getNextMonthPeriod(workYear, workMonth - 1);
    const now = new Date().toISOString();
    const existingLocal = getLatestAllowanceCheck(allowanceChecksRef.current, workYear, workMonth);
    const payload = normalizeAllowanceCheck({
      ...(existingLocal || {}),
      ...normalizedDraftSnapshot,
      id: existingLocal?.id || `ovt-allowance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workYear,
      workMonth,
      salaryYear: salaryPeriodForDraft.year,
      salaryMonth: salaryPeriodForDraft.monthIndex + 1,
      createdAt: existingLocal?.createdAt || now,
      updatedAt: now,
    });

    const snapshotSignature = JSON.stringify({
      workYear,
      workMonth,
      basicSalary: payload.basicSalary,
      salaryWithLaundry: payload.salaryWithLaundry,
      salaryReceived: payload.salaryReceived,
      nightDays: payload.nightDays,
      nightAllowance: payload.nightAllowance,
    });

    setAllowanceChecks((current) => upsertAllowanceCheck(current, payload));
    allowanceChecksRef.current = upsertAllowanceCheck(allowanceChecksRef.current, payload);
    allowanceSyncInProgressRef.current = true;
    setAllowanceSyncStatus(allowanceCloudReady ? "Saving live..." : "Local saved");

    try {
      let savedCheck = payload;

      if (allowanceCloudReady) {
        const remoteMatches = await allowanceEntity.filter({ workYear, workMonth });
        const remoteExisting = getLatestAllowanceCheck(remoteMatches, workYear, workMonth);
        const { id: _id, ...cloudPayload } = payload;

        if (remoteExisting?.id) {
          savedCheck = normalizeAllowanceCheck(await allowanceEntity.update(remoteExisting.id, cloudPayload));
        } else {
          savedCheck = normalizeAllowanceCheck(await allowanceEntity.create(cloudPayload));
        }

        setAllowanceChecks((current) => upsertAllowanceCheck(current, savedCheck));
        allowanceChecksRef.current = upsertAllowanceCheck(allowanceChecksRef.current, savedCheck);
        setAllowanceSyncStatus("Live cloud");
      }

      const currentDraft = allowanceDraftRef.current;
      const currentSignature = JSON.stringify({
        workYear: Number(currentDraft.workYear) || selectedYear,
        workMonth: Number(currentDraft.workMonth) || (selectedMonth + 1),
        basicSalary: String(currentDraft.basicSalary ?? ""),
        salaryWithLaundry: String(currentDraft.salaryWithLaundry ?? ""),
        salaryReceived: String(currentDraft.salaryReceived ?? ""),
        nightDays: String(currentDraft.nightDays ?? ""),
        nightAllowance: String(calculateNightAllowance(currentDraft.nightDays)),
      });

      if (currentSignature === snapshotSignature) {
        setAllowanceDirty(false);
        allowanceDirtyRef.current = false;
      }
    } catch (error) {
      console.error("Overtime allowance check live save failed:", error);
      setAllowanceSyncStatus("Local saved");
      setAllowanceDirty(false);
      allowanceDirtyRef.current = false;
    } finally {
      allowanceSyncInProgressRef.current = false;
    }
  }, [allowanceCloudReady, allowanceEntity, selectedMonth, selectedYear]);

  const handleAllowanceFieldChange = useCallback((field, value) => {
    const now = new Date().toISOString();
    const nextDraftBase = {
      ...allowanceDraftRef.current,
      [field]: value,
      workYear: selectedYear,
      workMonth: selectedMonth + 1,
    };
    const nextDraft = {
      ...nextDraftBase,
      nightAllowance: String(calculateNightAllowance(nextDraftBase.nightDays)),
    };
    const existing = getLatestAllowanceCheck(allowanceChecksRef.current, selectedYear, selectedMonth + 1);
    const localCheck = normalizeAllowanceCheck({
      ...(existing || {}),
      ...nextDraft,
      id: existing?.id || `ovt-allowance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    allowanceDraftRef.current = nextDraft;
    allowanceChecksRef.current = upsertAllowanceCheck(allowanceChecksRef.current, localCheck);
    saveAllowanceChecks(allowanceChecksRef.current);
    allowanceDirtyRef.current = true;
    setAllowanceDraft(nextDraft);
    setAllowanceChecks((current) => upsertAllowanceCheck(current, localCheck));
    setAllowanceDirty(true);
    setAllowanceSyncStatus(allowanceCloudReady ? "Saving live..." : "Local saved");
  }, [allowanceCloudReady, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!allowanceDirty) return undefined;

    const snapshot = { ...allowanceDraft };
    const timeoutId = window.setTimeout(() => {
      saveAllowanceDraft(snapshot);
    }, ALLOWANCE_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [allowanceDirty, allowanceDraft, saveAllowanceDraft]);

  const flushAllowanceBeforePeriodChange = useCallback(() => {
    if (!allowanceDirtyRef.current) return;
    const snapshot = { ...allowanceDraftRef.current };
    setAllowanceDirty(false);
    allowanceDirtyRef.current = false;
    void saveAllowanceDraft(snapshot);
  }, [saveAllowanceDraft]);

  const exportCsv = () => {
    const rows = [
      ["Date", "Month", "Day Type", "Type", "Start", "End", "Recorded Hours", "Remark"],
      ...recordsForYear
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((record) => [
          record.date,
          MONTHS[Number(record.date.slice(5, 7)) - 1],
          record.dayType === "RAMADAN" ? "Ramadhan" : "Normal Day",
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
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.28fr)_minmax(360px,0.92fr)]">
      <div className="min-w-0 space-y-4">
        <section className="min-w-0 overflow-hidden rounded-[24px] border border-[#2b4c68] bg-[radial-gradient(circle_at_8%_0%,rgba(66,135,255,0.13),transparent_32%),radial-gradient(circle_at_92%_0%,rgba(111,80,255,0.13),transparent_30%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#5d7cff]/35 bg-[linear-gradient(145deg,#2e9df1,#6752f4)] text-white shadow-[0_8px_24px_rgba(71,97,255,0.30)]">
                <CalendarDays className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#afc0d7]">Yearly overview</p>
                <h3 className="mt-1.5 truncate text-[19px] font-semibold leading-tight text-[#f5f8ff] sm:text-[21px]">
                  Monthly Extension &amp; RDOT Record
                </h3>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
            <select
              value={selectedYear}
              onChange={(event) => handleYearChange(event.target.value)}
              className="h-10 min-w-[92px] rounded-xl border border-[#294660] bg-[#0b2137] px-3 text-[12px] font-semibold text-[#eef5ff] outline-none transition focus:border-[#6a72ff] focus:ring-2 focus:ring-[#6a72ff]/20"
              aria-label="Overtime year"
              style={{ colorScheme: "dark" }}
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button
              type="button"
              onClick={handleAddNextYear}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-[#294660] bg-[#0b2137] px-3 text-[11px] font-medium text-[#dce8f7] transition hover:border-[#5776a0] hover:bg-[#102b46]"
              title={`Add and open ${selectedYear + 1}`}
              aria-label={`Add year ${selectedYear + 1}`}
            >
              <Plus className="h-3.5 w-3.5" /> Year
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!recordsForYear.length}
              className="flex h-10 items-center gap-2 rounded-xl border border-[#294660] bg-[#0b2137] px-3.5 text-[11px] font-medium text-[#dce8f7] transition hover:border-[#5776a0] hover:bg-[#102b46] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {monthSummaries.map((summary, monthIndex) => {
            const active = selectedMonth === monthIndex;
            const allowanceStatus = active ? allowanceResult.status : monthAllowanceStatuses[monthIndex];
            const totalNights = active ? allowanceResult.nightDays : monthNightTotals[monthIndex];
            const allowanceStatusLabel = allowanceStatus === "CORRECT"
              ? "Correct allowance amount"
              : allowanceStatus === "SHORT"
                ? "Allowance amount is short"
                : allowanceStatus === "EXTRA"
                  ? "Allowance amount is extra"
                  : "";
            return (
                <button
                key={summary.month}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  flushAllowanceBeforePeriodChange();
                  setSelectedMonth(monthIndex);
                  if (!editingId) resetDraft(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
                  resetNoteDraft(`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`);
                }}
                className={`min-h-[128px] rounded-[18px] border px-3 py-2.5 text-left shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition duration-200 ${active
                  ? "border-[#8169ff] bg-[radial-gradient(circle_at_20%_0%,rgba(117,92,255,0.24),transparent_42%),linear-gradient(145deg,rgba(26,43,76,0.98),rgba(8,27,47,0.99))] shadow-[0_0_0_1px_rgba(129,105,255,0.30),0_0_22px_rgba(89,62,255,0.22),0_12px_30px_rgba(0,0,0,0.22)]"
                  : "border-[#294b66] bg-[linear-gradient(145deg,rgba(12,35,57,0.94),rgba(6,23,39,0.98))] hover:-translate-y-0.5 hover:border-[#467493] hover:bg-[#0c2a44] hover:shadow-[0_14px_32px_rgba(0,0,0,0.24)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] ${active
                      ? "bg-[#5b4bd6]/45 text-[#d5d2ff]"
                      : "bg-[#123859] text-[#8dc7f4]"
                    }`}>
                      <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </span>
                    <p className="text-[12px] font-semibold text-[#f4f7fc]">{summary.month.slice(0, 3).toUpperCase()}</p>
                  </div>
                  {allowanceStatus !== "WAITING" && (
                    <span
                      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${allowanceStatus === "CORRECT"
                        ? "border-emerald-300/80 bg-[#58c96b] shadow-[0_0_8px_rgba(88,201,107,0.55)]"
                        : "border-red-300/90 bg-[#941c24] shadow-[0_0_8px_rgba(148,28,36,0.65)]"
                      }`}
                      title={allowanceStatusLabel}
                      aria-label={allowanceStatusLabel}
                    >
                      {allowanceStatus === "CORRECT"
                        ? <Check className="h-3 w-3 stroke-[3.5] text-white" />
                        : <X className="h-3 w-3 stroke-[3.5] text-white" />}
                    </span>
                  )}
                </div>

                <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center">
                  <div className="text-center">
                    <span className="block text-[21px] font-medium leading-none text-white">{summary.rdotCount}</span>
                    <span className="mt-1 block text-[9px] font-medium text-[#aebbd0]">RDOT</span>
                  </div>
                  <div className={`mx-2 h-9 w-px ${active ? "bg-[#695dde]/70" : "bg-[#3a566f]"}`} />
                  <div className="text-center">
                    <span className="block text-[21px] font-medium leading-none text-white">{summary.extensionCount}</span>
                    <span className="mt-1 block text-[9px] font-medium text-[#aebbd0]">EXT</span>
                  </div>
                </div>

                <div className="mt-2.5 border-t border-[#284761]/70 pt-2 text-[13px] font-medium text-white">
                  <p className="grid grid-cols-[74px_8px_1fr] items-baseline">
                    <span>Total Hour</span>
                    <span>:</span>
                    <span>{summary.hours.toFixed(1)} hrs</span>
                  </p>
                  <p className="mt-1 grid grid-cols-[74px_8px_1fr] items-baseline">
                    <span>Total Night</span>
                    <span>:</span>
                    <span>{totalNights}</span>
                  </p>
                </div>
                </button>
            );
            })}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[24px] border border-[#274660] bg-[radial-gradient(circle_at_0%_100%,rgba(37,117,181,0.12),transparent_38%),radial-gradient(circle_at_100%_0%,rgba(92,64,195,0.11),transparent_34%),linear-gradient(145deg,rgba(8,28,47,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.26)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#92a9c3]">Annual summary</p>
              <h4 className="mt-1 text-[15px] font-semibold text-[#eef5ff]">Performance overview</h4>
            </div>
            <span className="rounded-full border border-[#345671] bg-[#0c2943]/85 px-3 py-1 text-[10px] font-semibold text-[#c4d6ea] shadow-inner shadow-black/20">
              {selectedYear}
            </span>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-h-[82px] items-center gap-3.5 rounded-[18px] border border-[#265779] bg-[radial-gradient(circle_at_10%_20%,rgba(41,144,255,0.12),transparent_50%),linear-gradient(145deg,rgba(10,35,58,0.96),rgba(6,23,39,0.98))] px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#49a9ee]/35 bg-[#168ee4]/12 text-[#66b9f5] shadow-[0_0_18px_rgba(58,160,235,0.15)]">
                <Clock3 className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#afbed2]">Annual total RDOT</p>
                <p className="mt-1.5 text-[22px] font-semibold leading-none text-white">{annualRdotCount}</p>
              </div>
            </div>

            <div className="flex min-h-[82px] items-center gap-3.5 rounded-[18px] border border-[#4d447e] bg-[radial-gradient(circle_at_10%_20%,rgba(133,91,255,0.14),transparent_50%),linear-gradient(145deg,rgba(20,30,61,0.96),rgba(7,22,40,0.98))] px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#9b85ff]/35 bg-[#7865ff]/12 text-[#a99cff] shadow-[0_0_18px_rgba(126,91,255,0.16)]">
                <Clock3 className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#afbed2]">Annual total Extension</p>
                <p className="mt-1.5 text-[22px] font-semibold leading-none text-white">{annualExtensionCount}</p>
              </div>
            </div>

            <div className="flex min-h-[82px] items-center gap-3.5 rounded-[18px] border border-[#315f6b] bg-[radial-gradient(circle_at_10%_20%,rgba(55,213,187,0.12),transparent_50%),linear-gradient(145deg,rgba(9,37,53,0.96),rgba(6,23,39,0.98))] px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#54d6c6]/35 bg-[#20bba8]/10 text-[#76ddd0] shadow-[0_0_18px_rgba(55,201,184,0.14)]">
                <Clock3 className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="max-w-[190px] text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.15em] text-[#afbed2]">
                  Annual total hours for RDOT + EXT
                </p>
                <p className="mt-1.5 text-[22px] font-semibold leading-none text-white">{annualHours.toFixed(1)}</p>
              </div>
            </div>

            <div className="flex min-h-[82px] items-center gap-3.5 rounded-[18px] border border-[#66552d] bg-[radial-gradient(circle_at_10%_20%,rgba(255,187,52,0.13),transparent_50%),linear-gradient(145deg,rgba(42,35,24,0.92),rgba(7,23,39,0.98))] px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f2be58]/35 bg-[#d99616]/10 text-[#f1bf61] shadow-[0_0_18px_rgba(226,161,38,0.14)]">
                <CalendarDays className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.15em] text-[#afbed2]">Highest performed night shift</p>
                <p className="mt-1.5 text-[17px] font-semibold leading-none text-white">Total {highestNightShift.total}</p>
                <p
                  className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#9fb2c9]"
                  title={highestNightShift.fullMonthLabel}
                >
                  {highestNightShift.total > 0 ? `at ${highestNightShift.monthLabel}` : highestNightShift.monthLabel}
                </p>
              </div>
            </div>

            <div className="flex min-h-[82px] items-center gap-3.5 rounded-[18px] border border-[#2f6659] bg-[radial-gradient(circle_at_10%_20%,rgba(50,218,151,0.13),transparent_50%),linear-gradient(145deg,rgba(11,40,43,0.94),rgba(6,23,39,0.98))] px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#55d7aa]/35 bg-[#1dbd79]/10 text-[#76d5ae] shadow-[0_0_18px_rgba(38,199,129,0.14)]">
                <ListChecks className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.15em] text-[#afbed2]">Highest performed EXT only</p>
                <p className="mt-1.5 text-[17px] font-semibold leading-none text-white">Total {highestExtensionOnly.total}</p>
                <p
                  className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#9fb2c9]"
                  title={highestExtensionOnly.fullMonthLabel}
                >
                  {highestExtensionOnly.total > 0 ? `at ${highestExtensionOnly.monthLabel}` : highestExtensionOnly.monthLabel}
                </p>
              </div>
            </div>

            <div className="flex min-h-[82px] items-center gap-3.5 rounded-[18px] border border-[#315d78] bg-[radial-gradient(circle_at_10%_20%,rgba(54,167,244,0.13),transparent_50%),linear-gradient(145deg,rgba(10,36,58,0.95),rgba(6,23,39,0.98))] px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.16)] sm:col-span-2 xl:col-span-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#5ab6ef]/35 bg-[#2499e3]/10 text-[#70c7f3] shadow-[0_0_18px_rgba(46,157,226,0.14)]">
                <ListChecks className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.15em] text-[#afbed2]">Highest performed RDOT only</p>
                <p className="mt-1.5 text-[17px] font-semibold leading-none text-white">Total {highestRdotOnly.total}</p>
                <p
                  className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#9fb2c9]"
                  title={highestRdotOnly.fullMonthLabel}
                >
                  {highestRdotOnly.total > 0 ? `at ${highestRdotOnly.monthLabel}` : highestRdotOnly.monthLabel}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="min-w-0 self-start overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_12%_0%,rgba(16,185,129,0.14),transparent_34%),radial-gradient(circle_at_92%_8%,rgba(45,145,255,0.10),transparent_32%),linear-gradient(145deg,rgba(8,29,48,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.28)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-emerald-400/30 bg-[linear-gradient(145deg,rgba(16,185,129,0.28),rgba(5,73,65,0.72))] text-emerald-200 shadow-[0_8px_24px_rgba(16,185,129,0.18)]">
              <Calculator className="h-5 w-5" strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.20em] text-[#eef5fc]">Allowance check</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#9fb1c8]">
                Uses {MONTHS[selectedMonth].slice(0, 3)} {selectedYear} recorded hours.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-semibold text-emerald-200 shadow-[inset_0_0_12px_rgba(16,185,129,0.05)]">
            {MONTHS[salaryPeriod.monthIndex].slice(0, 3)} Salary
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <label className="rounded-[16px] border border-[#31506b] bg-[linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a9bad0]">
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200">
                <Banknote className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              Basic salary
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={allowanceDraft.basicSalary}
              onChange={(event) => handleAllowanceFieldChange("basicSalary", sanitizeDecimalInput(event.target.value))}
              className="mt-2 h-10 w-full rounded-[11px] border border-[#35536e] bg-[#102b46] px-3 text-[14px] font-semibold text-[#f4f8fd] outline-none transition hover:border-[#456681] focus:border-emerald-400/65 focus:ring-2 focus:ring-emerald-400/15"
            />
          </label>

          <label className="rounded-[16px] border border-[#31506b] bg-[linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a9bad0]">
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-sky-400/20 bg-sky-500/[0.08] text-sky-200">
                <ListChecks className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              Salary + laundry
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={allowanceDraft.salaryWithLaundry}
              onChange={(event) => handleAllowanceFieldChange("salaryWithLaundry", sanitizeDecimalInput(event.target.value))}
              className="mt-2 h-10 w-full rounded-[11px] border border-[#35536e] bg-[#102b46] px-3 text-[14px] font-semibold text-[#f4f8fd] outline-none transition hover:border-[#456681] focus:border-emerald-400/65 focus:ring-2 focus:ring-emerald-400/15"
            />
          </label>
        </div>

        <label className="mt-2.5 block rounded-[16px] border border-[#31506b] bg-[linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a9bad0]">
            Salary received in {MONTHS[salaryPeriod.monthIndex]}
          </span>
          <div className="relative mt-2">
            <input
              type="text"
              inputMode="decimal"
              value={formatAmountInput(allowanceDraft.salaryReceived)}
              onChange={(event) => handleAllowanceFieldChange("salaryReceived", sanitizeDecimalInput(event.target.value))}
              placeholder={`Enter ${MONTHS[salaryPeriod.monthIndex]} salary`}
              className="h-11 w-full rounded-[12px] border border-emerald-400/75 bg-[linear-gradient(135deg,rgba(220,252,231,0.98),rgba(167,243,208,0.92))] px-3 pr-11 text-[15px] font-bold text-[#07131f] caret-[#07131f] shadow-[0_0_0_1px_rgba(52,211,153,0.12),0_0_14px_rgba(16,185,129,0.20)] outline-none transition placeholder:text-[#44534f]/65 hover:border-emerald-300 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/20"
            />
            {allowanceResult.hasSalaryReceived && (
              <span className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_5px_14px_rgba(5,150,105,0.28)]">
                <Check className="h-4 w-4" strokeWidth={2.4} />
              </span>
            )}
          </div>
        </label>

        <label className="mt-2.5 block rounded-[16px] border border-[#31506b] bg-[linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a9bad0]">
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-violet-400/25 bg-violet-500/[0.10] text-violet-200">
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              Night days
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/[0.07] px-2 py-1 text-[9px] font-medium text-[#b8c9db]">
              Fixed rate: <span className="font-semibold text-emerald-300">SAR {formatMoney(NIGHT_ALLOWANCE_RATE)}</span> / night
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={allowanceDraft.nightDays}
            onChange={(event) => handleAllowanceFieldChange("nightDays", sanitizeIntegerInput(event.target.value))}
            placeholder="0"
            className="mt-2 h-10 w-full rounded-[11px] border border-[#35536e] bg-[#102b46] px-3 text-[14px] font-semibold text-[#f4f8fd] outline-none placeholder:text-[#70859e] transition hover:border-[#456681] focus:border-emerald-400/65 focus:ring-2 focus:ring-emerald-400/15"
          />
        </label>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <div className="flex min-h-[88px] items-center gap-3 rounded-[16px] border border-[#31506b] bg-[radial-gradient(circle_at_12%_20%,rgba(45,145,255,0.13),transparent_48%),linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/25 bg-sky-500/[0.10] text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.10)]">
              <Clock3 className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.13em] text-[#a9bad0]">Recorded hours</p>
              <p className="mt-1.5 text-[20px] font-semibold leading-none text-white">{allowanceResult.overtimeHours.toFixed(1)}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#88a0b9]">Hours</p>
            </div>
          </div>

          <div className="flex min-h-[88px] items-center gap-3 rounded-[16px] border border-[#395170] bg-[radial-gradient(circle_at_12%_20%,rgba(139,92,246,0.14),transparent_48%),linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/[0.10] text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.10)]">
              <Calculator className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.13em] text-[#a9bad0]">Expected OT</p>
              <p className="mt-1.5 truncate text-[15px] font-semibold leading-none text-[#7dd3fc]" title={`SAR ${formatMoney(allowanceResult.expectedOvertime)}`}>
                SAR {formatMoney(allowanceResult.expectedOvertime)}
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#88a0b9]">Amount</p>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3 rounded-[16px] border border-[#31506b] bg-[radial-gradient(circle_at_8%_35%,rgba(45,145,255,0.12),transparent_42%),linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/25 bg-sky-500/[0.10] text-sky-200">
            <CalendarDays className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase leading-relaxed tracking-[0.12em] text-[#a9bad0]">
              Night allowance should receive ({allowanceResult.nightDays} {allowanceResult.nightDays === 1 ? "day" : "days"})
            </p>
            <p className="mt-1 text-[16px] font-semibold text-[#e6f1fc]">SAR {formatMoney(allowanceResult.nightAllowance)}</p>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3 rounded-[16px] border border-[#3d4e73] bg-[radial-gradient(circle_at_8%_35%,rgba(139,92,246,0.13),transparent_42%),linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))] p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/[0.10] text-violet-200">
            <Banknote className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase leading-relaxed tracking-[0.12em] text-[#a9bad0]">
              Remaining for overtime
            </p>
            <p className="text-[9px] leading-relaxed text-[#7f95ad]">After deduct night + laundry allowance</p>
            <p className="mt-1 text-[16px] font-semibold text-[#7dd3fc]">
              {allowanceResult.hasSalaryReceived ? `SAR ${formatMoney(allowanceResult.remainingForOvertime)}` : "Waiting"}
            </p>
          </div>
        </div>

        <div className={`mt-2.5 rounded-[18px] border p-3.5 transition ${allowanceResult.status === "EXTRA"
          ? "border-emerald-400/35 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.20),transparent_48%),linear-gradient(145deg,rgba(5,63,55,0.88),rgba(6,34,45,0.98))] shadow-[0_10px_28px_rgba(5,150,105,0.12)]"
          : allowanceResult.status === "SHORT"
            ? "border-red-400/80 bg-[linear-gradient(135deg,rgba(254,226,226,0.98),rgba(252,165,165,0.90))] shadow-[0_0_0_1px_rgba(248,113,113,0.16),0_0_14px_rgba(239,68,68,0.24)]"
            : allowanceResult.status === "CORRECT"
              ? "border-emerald-400/80 bg-[linear-gradient(135deg,rgba(220,252,231,0.98),rgba(167,243,208,0.92))] shadow-[0_0_0_1px_rgba(52,211,153,0.12),0_0_14px_rgba(16,185,129,0.22)]"
              : "border-[#31506b] bg-[linear-gradient(145deg,rgba(12,40,65,0.92),rgba(8,29,49,0.98))]"
        }`}>
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border ${allowanceResult.status === "EXTRA"
              ? "border-emerald-300/35 bg-emerald-500/20 text-emerald-100"
              : allowanceResult.status === "SHORT"
                ? "border-red-700/20 bg-red-700/10 text-[#4a0b0b]"
                : allowanceResult.status === "CORRECT"
                  ? "border-emerald-700/20 bg-emerald-700/15 text-[#064e3b]"
                  : "border-[#3c5871] bg-[#102b46] text-[#91a5bd]"
            }`}>
              {allowanceResult.status === "CORRECT" || allowanceResult.status === "EXTRA"
                ? <Check className="h-5 w-5" strokeWidth={2.3} />
                : <Banknote className="h-5 w-5" strokeWidth={1.9} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${allowanceResult.status === "CORRECT"
                ? "text-[#064e3b]"
                : allowanceResult.status === "SHORT"
                  ? "text-[#4a0b0b]"
                  : "text-[#e7f1fb]"
              }`}>
                {allowanceResult.status === "WAITING" ? "Waiting for salary input" : `Allowance ${allowanceResult.status.toLowerCase()}`}
              </p>
              {allowanceResult.hasSalaryReceived && (
                <p className={`mt-1.5 text-[18px] font-semibold ${allowanceResult.status === "CORRECT"
                  ? "text-[#07131f]"
                  : allowanceResult.status === "SHORT"
                    ? "text-[#4a0b0b]"
                    : "text-white"
                }`}>
                  {allowanceResult.status === "CORRECT" ? "Correct amount" : `SAR ${formatMoney(allowanceResult.difference)}`}
                </p>
              )}
              <p className={`mt-1.5 text-[10px] leading-relaxed ${allowanceResult.status === "CORRECT"
                ? "text-[#1f4b3e]"
                : allowanceResult.status === "SHORT"
                  ? "text-[#681f1f]"
                  : "text-[#a4b6ca]"
              }`}>
                {MONTHS[salaryPeriod.monthIndex]} {salaryPeriod.year} salary checks {MONTHS[selectedMonth]} night and overtime allowances.
              </p>
              <p className={`mt-1 text-[9px] leading-relaxed ${allowanceResult.status === "CORRECT"
                ? "text-[#356052]"
                : allowanceResult.status === "SHORT"
                  ? "text-[#7a2b2b]"
                  : "text-[#8298b0]"
              }`}>
                Night allowance: {allowanceResult.nightDays} night days × SAR {formatMoney(NIGHT_ALLOWANCE_RATE)} = SAR {formatMoney(allowanceResult.nightAllowance)}. Remaining OT: received salary − (salary + laundry) − night allowance.
              </p>
            </div>
          </div>
        </div>

        <p className={`mt-2.5 flex items-center justify-center gap-1.5 text-center text-[10px] ${allowanceSyncStatus === "Live cloud"
          ? "text-emerald-300"
          : allowanceSyncStatus === "Saving live..."
            ? "text-sky-300"
            : "text-amber-300"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${allowanceSyncStatus === "Live cloud"
            ? "bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.75)]"
            : allowanceSyncStatus === "Saving live..."
              ? "bg-sky-400"
              : "bg-amber-400"
          }`} />
          {allowanceSyncStatus}
        </p>
      </aside>

      <section className="h-full min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_8%_0%,rgba(45,145,255,0.14),transparent_34%),radial-gradient(circle_at_92%_4%,rgba(112,77,255,0.13),transparent_32%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.30)] sm:p-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#6d72ff]/35 bg-[linear-gradient(145deg,#2697e9,#6b4ff3)] text-white shadow-[0_8px_22px_rgba(67,83,235,0.28)]">
            <FilePlus2 className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c0cee0]">
              {editingNoteId ? "Edit monthly note" : editingId ? "Edit duty record" : "New record"}
            </p>
            <p className="mt-1 text-[11px] text-[#9fb1c8]">
              Add a duty record or a separate monthly note below.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[18px] border border-[#365774] bg-[radial-gradient(circle_at_100%_0%,rgba(93,73,225,0.10),transparent_36%),linear-gradient(145deg,rgba(9,31,52,0.94),rgba(7,25,43,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-violet-400/30 bg-violet-500/[0.12] text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.10)]">
                <Clock3 className="h-4 w-4" strokeWidth={1.9} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#edf2fa]">RDOT / Extension record</p>
                <p className="mt-0.5 text-[10px] text-[#97a9bf]">Duty entry used for counts and recorded hours.</p>
              </div>
            </div>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-violet-200 shadow-[inset_0_0_12px_rgba(139,92,246,0.05)]">
              Counts hours
            </span>
          </div>

          <form onSubmit={handleSave}>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.05fr_1fr_.9fr_1.1fr_.7fr]">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Date</span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                  required
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-medium text-[#eff5fc] outline-none transition focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/20"
                  style={{ colorScheme: "dark" }}
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Day Type</span>
                <Select
                  value={draft.dayType}
                  onValueChange={(dayType) => {
                    setDraft((current) => ({
                      ...current,
                      dayType,
                    }));
                  }}
                >
                  <SelectTrigger
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-medium text-[#eff5fc] shadow-none outline-none transition duration-150 hover:border-[#5579a0] hover:bg-[#15324f] focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/25 data-[state=open]:border-[#777eff] data-[state=open]:bg-[#15324f] data-[state=open]:ring-2 data-[state=open]:ring-[#646cff]/25 [&>svg]:text-[#9fb2c9] [&>svg]:opacity-100"
                    aria-label="Day Type"
                  >
                    <SelectValue placeholder="Select day type" />
                  </SelectTrigger>
                  <SelectContent
                    position="item-aligned"
                    className="z-[100] min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[#3b5874] bg-[#0b2238] p-1.5 text-[#eaf2fb] shadow-[0_14px_36px_rgba(0,0,0,0.48)]"
                  >
                    <SelectItem
                      value="NORMAL"
                      className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#dbe8f6] transition-colors data-[highlighted]:bg-[#5963f2] data-[highlighted]:text-white data-[state=checked]:bg-[#303b78] data-[state=checked]:text-white"
                    >
                      Normal Day
                    </SelectItem>
                    <SelectItem
                      value="RAMADAN"
                      className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#dbe8f6] transition-colors data-[highlighted]:bg-[#5963f2] data-[highlighted]:text-white data-[state=checked]:bg-[#303b78] data-[state=checked]:text-white"
                    >
                      Ramadhan
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Type</span>
                <Select
                  value={draft.type}
                  onValueChange={(type) => {
                    setDraft((current) => ({
                      ...current,
                      type,
                    }));
                  }}
                >
                  <SelectTrigger
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-medium text-[#eff5fc] shadow-none outline-none transition duration-150 hover:border-[#5579a0] hover:bg-[#15324f] focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/25 data-[state=open]:border-[#777eff] data-[state=open]:bg-[#15324f] data-[state=open]:ring-2 data-[state=open]:ring-[#646cff]/25 [&>svg]:text-[#9fb2c9] [&>svg]:opacity-100"
                    aria-label="Type"
                  >
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent
                    position="item-aligned"
                    className="z-[100] min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[#3b5874] bg-[#0b2238] p-1.5 text-[#eaf2fb] shadow-[0_14px_36px_rgba(0,0,0,0.48)]"
                  >
                    <SelectItem
                      value="RDOT"
                      className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#dbe8f6] transition-colors data-[highlighted]:bg-[#5963f2] data-[highlighted]:text-white data-[state=checked]:bg-[#303b78] data-[state=checked]:text-white"
                    >
                      RDOT
                    </SelectItem>
                    <SelectItem
                      value="EXTENSION"
                      className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#dbe8f6] transition-colors data-[highlighted]:bg-[#5963f2] data-[highlighted]:text-white data-[state=checked]:bg-[#303b78] data-[state=checked]:text-white"
                    >
                      Extension
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Time</span>
                <Select
                  value={draftTimingValue}
                  onValueChange={(timingValue) => {
                    const [startTime, endTime] = timingValue.split("|");
                    setDraft((current) => ({ ...current, startTime, endTime }));
                  }}
                >
                  <SelectTrigger
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-medium text-[#eff5fc] shadow-none outline-none transition duration-150 hover:border-[#5579a0] hover:bg-[#15324f] focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/25 data-[state=open]:border-[#777eff] data-[state=open]:bg-[#15324f] data-[state=open]:ring-2 data-[state=open]:ring-[#646cff]/25 [&>svg]:text-[#9fb2c9] [&>svg]:opacity-100"
                    aria-label="Time"
                  >
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent
                    position="item-aligned"
                    className="z-[100] min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[#3b5874] bg-[#0b2238] p-1.5 text-[#eaf2fb] shadow-[0_14px_36px_rgba(0,0,0,0.48)]"
                  >
                    {!draftTimingIsPreset && (
                      <SelectItem
                        value={draftTimingValue}
                        className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#dbe8f6] transition-colors data-[highlighted]:bg-[#5963f2] data-[highlighted]:text-white data-[state=checked]:bg-[#303b78] data-[state=checked]:text-white"
                      >
                        {getTimingLabel(draft.startTime, draft.endTime)} (previous)
                      </SelectItem>
                    )}
                    {draftTimingOptions.map((option, index) => {
                      const timingValue = getTimingValue(option.startTime, option.endTime);
                      const showPairSeparator = draft.dayType === "NORMAL" && draft.type === "EXTENSION" && (index === 2 || index === 4);
                      return (
                        <Fragment key={timingValue}>
                          {showPairSeparator && <SelectSeparator className="mx-2 my-1.5 bg-[#2d4a65]" />}
                          <SelectItem
                            value={timingValue}
                            className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#dbe8f6] transition-colors data-[highlighted]:bg-[#5963f2] data-[highlighted]:text-white data-[state=checked]:bg-[#303b78] data-[state=checked]:text-white"
                          >
                            {getTimingLabel(option.startTime, option.endTime)}
                          </SelectItem>
                        </Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </label>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Hours</span>
                <div className="mt-1.5 flex h-10 items-center justify-center rounded-xl border border-emerald-400/45 bg-emerald-500/10 text-[16px] font-semibold text-emerald-300 shadow-[inset_0_0_18px_rgba(16,185,129,0.04)]">
                  {draftHours.toFixed(1)}
                </div>
              </div>
            </div>

            <label className="mt-3.5 block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Remark (optional)</span>
              <input
                value={draft.remark}
                onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))}
                placeholder="Example: Night shift / replacement duty"
                className="mt-1.5 h-10 w-full rounded-xl border border-[#31516d] bg-[#102840]/95 px-3 text-[14px] font-normal text-[#eff5fc] outline-none transition placeholder:text-[#8295ad] hover:border-[#456987] focus:border-[#747aff] focus:ring-2 focus:ring-[#646cff]/20"
              />
            </label>

            <div className="mt-3.5 flex flex-col gap-3 border-t border-[#294963]/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[520px] text-[11px] leading-relaxed text-[#9babc0]">
                RDOT uses the full selected shift duration. Extension deducts {draft.dayType === "RAMADAN" ? "6 Ramadhan working hours" : "8.5 normal working hours"}.
              </p>
              <div className="flex gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => resetDraft()}
                    className="flex h-10 items-center gap-1.5 rounded-xl border border-[#294660] bg-[#0b2137] px-3 text-[11px] font-semibold text-[#c9d8e9] transition hover:border-[#607fa5] hover:bg-[#102b46]"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#7f7bff]/75 bg-[linear-gradient(135deg,#6757f2,#465ee9)] px-4 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(72,78,220,0.28)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
                  {saving ? "Saving" : editingId ? "Update Duty Record" : "Add Duty Record"}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="mt-3 rounded-[18px] border border-cyan-400/25 bg-[radial-gradient(circle_at_0%_100%,rgba(34,211,238,0.08),transparent_45%),linear-gradient(145deg,rgba(7,34,51,0.94),rgba(5,27,43,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.08)]">
                <MessageSquareText className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#edf2fa]">Monthly note</p>
                <p className="mt-0.5 text-[10px] text-[#97a9bf]">General dated note only. It does not add RDOT, EXT or hours.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                Note only · no hours
              </span>
              <span className={`text-[10px] font-semibold ${noteSyncStatus === "Live cloud" ? "text-emerald-300" : "text-amber-300"}`}>
                {noteSyncStatus}
              </span>
            </div>
          </div>

          <form onSubmit={handleNoteSave} className="mt-3">
            <div className="grid gap-2.5 lg:grid-cols-[180px_1fr_auto] lg:items-end">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Note date</span>
                <input
                  type="date"
                  value={noteDraft.date}
                  min={`${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`}
                  max={`${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(new Date(selectedYear, selectedMonth + 1, 0).getDate()).padStart(2, "0")}`}
                  onChange={(event) => setNoteDraft((current) => ({ ...current, date: event.target.value }))}
                  required
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-medium text-[#eff5fc] outline-none focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15"
                  style={{ colorScheme: "dark" }}
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9eafc5]">Monthly note text</span>
                <input
                  value={noteDraft.note}
                  onChange={(event) => setNoteDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Example: DCC did not change take to night"
                  required
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-normal text-[#eff5fc] outline-none placeholder:text-[#8295ad] focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15"
                />
              </label>

              <div className="flex gap-2">
                {editingNoteId && (
                  <button
                    type="button"
                    onClick={() => resetNoteDraft()}
                    className="flex h-10 items-center gap-1.5 rounded-xl border border-[#294660] bg-[#0b2137] px-3 text-[11px] font-semibold text-[#c9d8e9] transition hover:border-[#607fa5] hover:bg-[#102b46]"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={noteSaving || !String(noteDraft.note || "").trim()}
                  className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-300/55 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {noteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingNoteId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {noteSaving ? "Saving" : editingNoteId ? "Update Monthly Note" : "Add Monthly Note"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="h-full min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_92%_0%,rgba(45,145,255,0.12),transparent_34%),radial-gradient(circle_at_5%_100%,rgba(81,67,205,0.09),transparent_34%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] shadow-[0_20px_55px_rgba(0,0,0,0.30)]">
        <div className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#4fa9dc]/35 bg-[linear-gradient(145deg,#17678f,#16456f)] text-[#dff6ff] shadow-[0_8px_22px_rgba(13,94,145,0.22)]">
              <ListChecks className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c0cee0]">Records &amp; notes</p>
              <p className="mt-1 text-[11px] text-[#9fb1c8]">RDOT and EXT count hours. NOTE is information only.</p>
            </div>
          </div>
          <p className="rounded-full border border-[#2c5873] bg-[#0b2942]/90 px-3 py-1.5 text-[10px] font-semibold text-[#d3dfed] shadow-inner shadow-black/20">
            <span className="text-emerald-300">{visibleEntries.length}</span> entr{visibleEntries.length === 1 ? "y" : "ies"}
          </p>
        </div>

        <div className="px-4 pb-3 pt-1.5 sm:px-5 sm:pb-4">
          {!visibleEntries.length ? (
            <div className="rounded-2xl border border-dashed border-[#294660] px-5 py-9 text-center">
              <Plus className="mx-auto h-5 w-5 text-[#8196ad]" />
              <p className="mt-3 text-[13px] text-[#91a4bb]">No duty records or monthly notes for this month.</p>
            </div>
          ) : (
            <div className="max-h-[430px] space-y-1.5 overflow-y-auto pr-1 [scrollbar-color:#315574_transparent] [scrollbar-width:thin]">
              {visibleEntries.map((entry) => {
                if (entry.kind === "note") {
                  const note = entry.item;
                  return (
                    <div key={entry.key} className="flex flex-wrap items-center gap-2 rounded-[13px] border border-cyan-400/20 bg-[linear-gradient(145deg,rgba(7,38,55,0.78),rgba(7,29,47,0.86))] px-2.5 py-2 shadow-[0_6px_16px_rgba(0,0,0,0.10)] transition hover:border-cyan-300/35 hover:bg-cyan-500/[0.06] sm:flex-nowrap">
                      <div className="flex h-8 w-[58px] shrink-0 items-center justify-center rounded-[9px] border border-cyan-400/30 bg-cyan-500/10 px-2 text-[10px] font-semibold text-cyan-200">
                        NOTE
                      </div>
                      <div className="min-w-[150px] flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <p className="text-[12px] font-semibold text-[#f1f5fb]">{formatDate(note.date)}</p>
                          <span className="text-[9px] font-semibold uppercase tracking-[0.11em] text-cyan-300">Monthly note</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-[1.35] text-[#b5c2d3]">{note.note}</p>
                      </div>
                      <div className="ml-auto min-w-[62px] shrink-0 border-r border-[#294660] pr-3 text-right">
                        <MessageSquareText className="ml-auto h-3.5 w-3.5 text-cyan-300" />
                        <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.11em] text-cyan-200">No hours</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleNoteEdit(note)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#31516d] text-[#afbed2] transition hover:border-cyan-300/50 hover:bg-cyan-500/10 hover:text-white"
                        aria-label="Edit monthly note"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNoteDelete(note.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                        aria-label="Delete monthly note"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                }

                const record = entry.item;
                return (
                  <div key={entry.key} className="flex flex-wrap items-center gap-2 rounded-[13px] border border-[#274b67] bg-[linear-gradient(145deg,rgba(10,35,58,0.82),rgba(7,27,45,0.90))] px-2.5 py-2 shadow-[0_6px_16px_rgba(0,0,0,0.10)] transition hover:border-[#3b6788] hover:bg-[#0c2943] sm:flex-nowrap">
                    <div className={`flex h-8 w-[58px] shrink-0 items-center justify-center rounded-[9px] border px-2 text-[10px] font-semibold ${record.type === "RDOT"
                      ? "border-[#5b56c8]/50 bg-[#252459]/55 text-[#8f94ff]"
                      : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                    }`}>
                      {record.type === "EXTENSION" ? "EXT" : record.type}
                    </div>
                    <div className="min-w-[150px] flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <p className="text-[12px] font-semibold text-[#f1f5fb]">{formatDate(record.date)}</p>
                        <span className="text-[11px] text-[#79a9d2]">{record.startTime} – {record.endTime}</span>
                        <span className={`rounded-full border px-1.5 py-[2px] text-[8px] font-semibold uppercase tracking-[0.09em] ${record.dayType === "RAMADAN"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                          : "border-sky-400/20 bg-sky-500/[0.08] text-sky-200"
                        }`}>
                          {record.dayType === "RAMADAN" ? "Ramadhan" : "Normal"}
                        </span>
                      </div>
                      {record.remark && <p className="mt-0.5 truncate text-[11px] leading-[1.35] text-[#b5c2d3]">{record.remark}</p>}
                    </div>
                    <div className="ml-auto min-w-[62px] shrink-0 border-r border-[#294660] pr-3 text-right">
                      <p className="text-[15px] font-semibold leading-none text-emerald-300">{Number(record.hours).toFixed(1)}</p>
                      <p className="mt-0.5 text-[8px] uppercase tracking-[0.11em] text-[#8ea1b8]">Hours</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEdit(record)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#31516d] text-[#afbed2] transition hover:border-[#5d7ea5] hover:bg-[#12314e] hover:text-white"
                      aria-label="Edit Extension or RDOT record"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(record.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-400/20 text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100"
                      aria-label="Delete Extension or RDOT record"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
