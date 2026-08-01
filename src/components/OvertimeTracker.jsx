import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, BarChart3, Calculator, CalendarDays, Check, CircleDollarSign, Clock3, Download, FilePlus2, ListChecks, Loader2, MessageSquareText, Moon, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import NightShiftPdfDetector from "@/components/NightShiftPdfDetector";
import { resolveRecordTiming } from "@/lib/overtimeTiming";

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
    { startTime: "15:00", endTime: "03:00" },
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

function formatTimeWithMeridiem(time = "") {
  const [hours, minutes] = String(time).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(time || "");

  const displayHours = hours % 12 || 12;
  const meridiem = hours >= 12 ? "PM" : "AM";
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function getTimingLabel(startTime, endTime, showMeridiem = false) {
  if (showMeridiem) {
    return `${formatTimeWithMeridiem(startTime)} – ${formatTimeWithMeridiem(endTime)}`;
  }
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
  const { startTime, endTime } = resolveRecordTiming(record, defaultTiming);

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
  const allowancePendingSavesRef = useRef(/** @type {Map<string, ReturnType<typeof createAllowanceDraft>>} */ (new Map()));
  const allowanceRetryTimerRef = useRef(/** @type {number | null} */ (null));
  const timelineScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const activeMonthButtonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

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

  useEffect(() => () => {
    if (allowanceRetryTimerRef.current !== null) {
      window.clearTimeout(allowanceRetryTimerRef.current);
    }
  }, []);

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
    if (silent && (allowanceDirtyRef.current || allowancePendingSavesRef.current.size > 0)) return;

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

      if (!allowanceDirtyRef.current && allowancePendingSavesRef.current.size === 0) {
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

  const resolvedDraftTiming = useMemo(
    () => resolveRecordTiming(draft, getDefaultTiming(draft.type, draft.dayType)),
    [draft.startTime, draft.endTime, draft.type, draft.dayType]
  );
  const draftHours = useMemo(
    () => calculateOvertimeHours(resolvedDraftTiming.startTime, resolvedDraftTiming.endTime, draft.type, draft.dayType),
    [resolvedDraftTiming, draft.type, draft.dayType]
  );
  const draftTimingOptions = getTimingOptions(draft.dayType, draft.type);
  const draftTimingValue = getTimingValue(resolvedDraftTiming.startTime, resolvedDraftTiming.endTime);

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

  const selectedMonthSummary = monthSummaries[selectedMonth] || {
    month: MONTHS[selectedMonth],
    count: 0,
    rdotCount: 0,
    extensionCount: 0,
    hours: 0,
    noteCount: 0,
  };
  const salaryPeriod = useMemo(
    () => getNextMonthPeriod(selectedYear, selectedMonth),
    [selectedMonth, selectedYear]
  );
  const allowanceResult = useMemo(
    () => calculateAllowanceResult(allowanceDraft, selectedMonthSummary.hours),
    [allowanceDraft, selectedMonthSummary.hours]
  );
  const expectedSalary = useMemo(
    () => roundCurrency(
      parseAmount(allowanceDraft.salaryWithLaundry)
      + allowanceResult.nightAllowance
      + allowanceResult.expectedOvertime
    ),
    [allowanceDraft.salaryWithLaundry, allowanceResult.expectedOvertime, allowanceResult.nightAllowance]
  );
  const timelineMaxHours = useMemo(
    () => Math.max(1, ...monthSummaries.map((summary) => Number(summary.hours || 0))),
    [monthSummaries]
  );

  const monthNightTotals = useMemo(() => MONTHS.map((_, monthIndex) => {
    const savedCheck = getLatestAllowanceCheck(allowanceChecks, selectedYear, monthIndex + 1);
    return Math.max(0, Math.trunc(parseAmount(savedCheck?.nightDays)));
  }), [allowanceChecks, selectedYear]);

  useEffect(() => {
    const scrollRegion = timelineScrollRef.current;
    const activeMonthButton = activeMonthButtonRef.current;
    if (!scrollRegion || !activeMonthButton) return;

    const centeredLeft = activeMonthButton.offsetLeft
      - ((scrollRegion.clientWidth - activeMonthButton.offsetWidth) / 2);
    scrollRegion.scrollTo({ left: Math.max(0, centeredLeft), behavior: "auto" });
  }, [selectedMonth, selectedYear]);

  const visibleRecords = useMemo(() => recordsForYear
    .filter((record) => Number(record.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
  [recordsForYear, selectedMonth]);

  const visibleNotes = useMemo(() => notesForYear
    .filter((note) => Number(note.date.slice(5, 7)) === selectedMonth + 1)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
  [notesForYear, selectedMonth]);

  const visibleEntries = useMemo(() => [
    ...visibleNotes.map((note) => ({
      key: `note-${note.id}`,
      kind: "note",
      date: note.date,
      createdAt: note.createdAt,
      item: note,
    })),
    ...visibleRecords.map((record) => ({
      key: `record-${record.id}`,
      kind: "record",
      date: record.date,
      createdAt: record.createdAt,
      item: record,
    })),
  ],
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
    if (!draft.date || saving) return;

    const now = new Date().toISOString();
    const existing = editingId ? records.find((record) => record.id === editingId) : null;
    const existingTiming = resolveRecordTiming(existing, getDefaultTiming(draft.type, draft.dayType));
    const saveTiming = resolveRecordTiming(draft, existingTiming);
    if (!saveTiming.startTime || !saveTiming.endTime) return;
    const payload = normalizeRecord({
      ...(existing || {}),
      ...draft,
      startTime: saveTiming.startTime,
      endTime: saveTiming.endTime,
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
    const normalizedRecord = normalizeRecord(record);
    setEditingId(normalizedRecord.id);
    setDraft({
      date: normalizedRecord.date,
      dayType: normalizedRecord.dayType,
      type: normalizedRecord.type,
      startTime: normalizedRecord.startTime,
      endTime: normalizedRecord.endTime,
      remark: normalizedRecord.remark,
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
    const queuedWorkYear = Number(draftSnapshot.workYear) || selectedYear;
    const queuedWorkMonth = Number(draftSnapshot.workMonth) || (selectedMonth + 1);
    const queuedPeriodKey = `${queuedWorkYear}-${queuedWorkMonth}`;
    allowancePendingSavesRef.current.set(queuedPeriodKey, {
      ...draftSnapshot,
      workYear: queuedWorkYear,
      workMonth: queuedWorkMonth,
    });

    if (allowanceSyncInProgressRef.current) {
      if (allowanceRetryTimerRef.current === null) {
        allowanceRetryTimerRef.current = window.setTimeout(() => {
          allowanceRetryTimerRef.current = null;
          const pendingSnapshot = allowancePendingSavesRef.current.values().next().value;
          if (!pendingSnapshot) return;
          void saveAllowanceDraft(pendingSnapshot);
        }, 350);
      }
      return;
    }

    const nextPendingEntry = allowancePendingSavesRef.current.entries().next().value;
    const [nextPeriodKey, nextSnapshot] = nextPendingEntry || [queuedPeriodKey, draftSnapshot];
    allowancePendingSavesRef.current.delete(nextPeriodKey);
    const normalizedDraftSnapshot = {
      ...nextSnapshot,
      nightAllowance: String(calculateNightAllowance(nextSnapshot.nightDays)),
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
      const pendingSnapshot = allowancePendingSavesRef.current.values().next().value;
      if (pendingSnapshot) {
        if (allowanceRetryTimerRef.current !== null) {
          window.clearTimeout(allowanceRetryTimerRef.current);
          allowanceRetryTimerRef.current = null;
        }
        void saveAllowanceDraft(pendingSnapshot);
      }
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

  const allowanceStatusHeadline = allowanceResult.status === "CORRECT"
    ? "Correct amount"
    : allowanceResult.status === "SHORT"
      ? `SAR ${formatMoney(allowanceResult.difference)} short`
      : allowanceResult.status === "EXTRA"
        ? `SAR ${formatMoney(allowanceResult.difference)} extra`
        : "Waiting for salary input";
  const allowanceStatusDescription = allowanceResult.status === "WAITING"
    ? `Enter the ${MONTHS[salaryPeriod.monthIndex]} salary to compare it with the forecast.`
    : `${MONTHS[salaryPeriod.monthIndex]} ${salaryPeriod.year} salary compared with ${MONTHS[selectedMonth]} allowances.`;
  const allowanceStatusCardClass = allowanceResult.status === "CORRECT"
    ? "border-emerald-400/35 bg-emerald-500/[0.08]"
    : allowanceResult.status === "SHORT"
      ? "border-rose-400/40 bg-rose-500/[0.08]"
      : allowanceResult.status === "EXTRA"
        ? "border-amber-400/40 bg-amber-500/[0.08]"
        : "border-[#365779] bg-[#0b2137]/70";
  const forecastBreakdown = [
    {
      label: "Salary + laundry",
      value: parseAmount(allowanceDraft.salaryWithLaundry),
      helper: "Payroll basis",
    },
    {
      label: "Night allowance",
      value: allowanceResult.nightAllowance,
      helper: `${allowanceResult.nightDays} nights × SAR ${formatMoney(NIGHT_ALLOWANCE_RATE)}`,
    },
    {
      label: "Expected overtime",
      value: allowanceResult.expectedOvertime,
      helper: `${allowanceResult.overtimeHours.toFixed(1)} recorded hrs`,
    },
  ];
  const annualSummaryItems = [
    { label: "Total hours", value: annualHours.toFixed(1), detail: "", Icon: Clock3, tone: "text-cyan-300" },
    { label: "RDOT", value: annualRdotCount, detail: "", Icon: ArrowRight, tone: "text-violet-300" },
    { label: "Extensions", value: annualExtensionCount, detail: "", Icon: Clock3, tone: "text-[#a99cff]" },
    { label: "Highest night days", value: highestNightShift.total, detail: highestNightShift.monthLabel, Icon: Moon, tone: "text-emerald-300" },
    { label: "Highest extensions", value: highestExtensionOnly.total, detail: highestExtensionOnly.monthLabel, Icon: Clock3, tone: "text-amber-300" },
    { label: "Highest RDOT", value: highestRdotOnly.total, detail: highestRdotOnly.monthLabel, Icon: ArrowRight, tone: "text-sky-300" },
  ];

  const handleMonthSelect = (monthIndex) => {
    flushAllowanceBeforePeriodChange();
    setSelectedMonth(monthIndex);
    const monthDate = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    if (!editingId) resetDraft(monthDate);
    resetNoteDraft(monthDate);
  };

  return (
    <div className="theme-overtime-page grid gap-3 lg:grid-cols-10">
      <section
        data-testid="pay-forecast-hero"
        className="overtime-forecast-hero min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_8%_0%,rgba(16,185,129,0.12),transparent_32%),radial-gradient(circle_at_92%_8%,rgba(45,145,255,0.10),transparent_30%),linear-gradient(145deg,rgba(8,29,48,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.28)] sm:p-5 lg:col-span-10"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 shadow-[0_8px_24px_rgba(16,185,129,0.14)]">
              <CircleDollarSign aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9fb1c8]">Payroll forecast</p>
              <h2 className="mt-1 text-[20px] font-semibold leading-tight text-[#f5f8ff] sm:text-[24px]">
                {MONTHS[salaryPeriod.monthIndex]} {salaryPeriod.year} Pay Forecast
              </h2>
              <p className="mt-1 text-[12px] text-[#91a6be]">
                Forecast from {MONTHS[selectedMonth]} overtime and night-shift records.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedYear}
              onChange={(event) => handleYearChange(event.target.value)}
              className="h-11 min-w-[92px] rounded-xl border border-[#365779] bg-[#0b2137] px-3 text-[13px] font-semibold text-[#eef5ff] outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15"
              aria-label="Overtime year"
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button
              type="button"
              onClick={handleAddNextYear}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-[#365779] bg-[#0b2137] px-3 text-[12px] font-semibold text-[#dce8f7] transition hover:border-[#577a98] hover:bg-[#102b46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
              title={"Add and open " + (selectedYear + 1)}
              aria-label={"Add year " + (selectedYear + 1)}
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> Year
            </button>
            <button
              type="button"
              onClick={() => {
                const recordEntry = document.getElementById("overtime-record-entry");
                if (!recordEntry) return;
                recordEntry.focus({ preventScroll: true });
                recordEntry.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                  block: "start",
                });
              }}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-cyan-400/55 bg-cyan-500/10 px-3.5 text-[12px] font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> Add entry
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!recordsForYear.length}
              className="flex h-11 items-center gap-2 rounded-xl border border-[#365779] bg-[#0b2137] px-3.5 text-[12px] font-semibold text-[#dce8f7] transition hover:border-[#577a98] hover:bg-[#102b46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download aria-hidden="true" className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="overtime-cockpit-subpanel min-w-0 rounded-[20px] border border-[#315574] bg-[#071c30]/[72%] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-[#a9bbcf]">Expected salary</p>
                <p
                  className="overtime-cockpit-money mt-2 break-words text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-none tracking-[-0.035em] text-emerald-300"
                  aria-live="polite"
                  aria-label={"Expected salary, SAR " + formatMoney(expectedSalary)}
                >
                  SAR {formatMoney(expectedSalary)}
                </p>
              </div>
              <span className="overtime-cockpit-selection inline-flex items-center gap-1.5 rounded-full border border-violet-400/35 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200">
                {MONTHS[selectedMonth].slice(0, 3).toUpperCase()} {selectedYear}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                {MONTHS[salaryPeriod.monthIndex].slice(0, 3).toUpperCase()} {salaryPeriod.year}
              </span>
            </div>

            <div className="mt-5 grid gap-2.5 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
              {forecastBreakdown.map((item, index) => (
                <Fragment key={item.label}>
                  {index > 0 && <span aria-hidden="true" className="hidden items-center text-[22px] text-[#758ba4] md:flex">+</span>}
                  <div className="overtime-cockpit-subpanel rounded-[15px] border border-[#2d4d68] bg-[#0b2137]/75 p-3">
                    <p className="text-[11px] text-[#8fa6be]">{item.label}</p>
                    <p className={["mt-1.5 text-[18px] font-semibold", index === 0 ? "text-white" : "overtime-cockpit-money text-emerald-300"].join(" ")}>
                      SAR {formatMoney(item.value)}
                    </p>
                    <p className="mt-1 text-[10px] text-[#7890aa]">{item.helper}</p>
                  </div>
                </Fragment>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-[#8399b1]">
              Expected salary = salary + laundry + night allowance + overtime estimate.
            </p>
          </div>

          <div className="overtime-cockpit-subpanel min-w-0 rounded-[20px] border border-[#315574] bg-[#071c30]/[72%] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label htmlFor="overtime-salary-received" className="text-[12px] font-semibold text-[#dbe7f4]">
                  Actual salary received
                </label>
                <p className="mt-1 text-[10px] text-[#7f95ad]">Enter the full {MONTHS[salaryPeriod.monthIndex]} salary.</p>
              </div>
              <span className="overtime-cockpit-subpanel rounded-full border border-[#365779] bg-[#0b2137] px-2.5 py-1 text-[10px] font-semibold text-[#aebfd1]">
                {MONTHS[selectedMonth].slice(0, 3)} work → {MONTHS[salaryPeriod.monthIndex].slice(0, 3)} salary
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                id="overtime-salary-received"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={formatAmountInput(allowanceDraft.salaryReceived)}
                onChange={(event) => handleAllowanceFieldChange("salaryReceived", sanitizeDecimalInput(event.target.value))}
                placeholder={"Enter " + MONTHS[salaryPeriod.monthIndex] + " salary"}
                className="h-12 w-full rounded-[12px] border border-cyan-400/60 bg-[#102b46] px-3 text-[15px] font-semibold text-[#f4f8fd] outline-none transition placeholder:text-[#7890aa] hover:border-cyan-300 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
              />
              <button
                type="button"
                disabled={!allowanceResult.hasSalaryReceived}
                onClick={() => void saveAllowanceDraft({ ...allowanceDraft })}
                className="h-12 rounded-[12px] border border-cyan-300/60 bg-cyan-400 px-5 text-[13px] font-semibold text-[#061827] shadow-[0_8px_20px_rgba(34,211,238,0.16)] transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Compare
              </button>
            </div>

            <div
              id="overtime-comparison-result"
              data-status={allowanceResult.status.toLowerCase()}
              className={["mt-3 rounded-[15px] border px-3.5 py-3", allowanceStatusCardClass].join(" ")}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/25">
                  {allowanceResult.status === "CORRECT"
                    ? <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} />
                    : <Banknote aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-white">{allowanceStatusHeadline}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#9eb0c4]">{allowanceStatusDescription}</p>
                </div>
              </div>
            </div>

            <details data-testid="salary-bases-summary" className="mt-3 overflow-hidden rounded-[15px] border border-[#315574] bg-[#0b2137]/65">
              <summary className="cursor-pointer px-3.5 py-3 text-[11px] font-semibold text-[#d9e5f2] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/50">
                Basic Salary and Salary + Laundry
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-[#315574]/80 p-3 sm:grid-cols-2">
                <label htmlFor="overtime-basic-salary" className="min-w-0">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#8fa6be]">Basic salary</span>
                  <input
                    id="overtime-basic-salary"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={allowanceDraft.basicSalary}
                    onChange={(event) => handleAllowanceFieldChange("basicSalary", sanitizeDecimalInput(event.target.value))}
                    className="mt-1.5 h-11 w-full rounded-[10px] border border-[#405f7c] bg-[#102b46] px-3 text-[14px] font-semibold text-[#f4f8fd] outline-none focus:border-cyan-400/65 focus:ring-2 focus:ring-cyan-400/15"
                  />
                </label>
                <label htmlFor="overtime-salary-laundry" className="min-w-0">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#8fa6be]">Salary + laundry</span>
                  <input
                    id="overtime-salary-laundry"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={allowanceDraft.salaryWithLaundry}
                    onChange={(event) => handleAllowanceFieldChange("salaryWithLaundry", sanitizeDecimalInput(event.target.value))}
                    className="mt-1.5 h-11 w-full rounded-[10px] border border-[#405f7c] bg-[#102b46] px-3 text-[14px] font-semibold text-[#f4f8fd] outline-none focus:border-cyan-400/65 focus:ring-2 focus:ring-cyan-400/15"
                  />
                </label>
              </div>
            </details>

            <p
              className={["mt-3 flex items-center gap-1.5 text-[10px]", allowanceSyncStatus === "Live cloud" ? "text-emerald-300" : allowanceSyncStatus === "Saving live..." ? "text-sky-300" : "text-amber-300"].join(" ")}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" className={["h-1.5 w-1.5 rounded-full", allowanceSyncStatus === "Live cloud" ? "bg-emerald-400" : allowanceSyncStatus === "Saving live..." ? "bg-sky-400" : "bg-amber-400"].join(" ")} />
              {allowanceSyncStatus}
            </p>
          </div>
        </div>
      </section>

      <section
        data-testid="overtime-activity-timeline"
        className="overtime-timeline min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_8%_0%,rgba(45,145,255,0.10),transparent_34%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.25)] sm:p-5 lg:col-span-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
              <BarChart3 aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#93a8c0]">Yearly overview</p>
              <h3 className="mt-1 text-[17px] font-semibold text-[#eff5fc]">{selectedYear} Activity Timeline</h3>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#9eb0c4]" aria-label="Activity legend">
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Has activity</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-rose-400" />No activity</span>
          </div>
        </div>

        <div
          ref={timelineScrollRef}
          className="mt-4 overflow-x-auto pb-1 [scrollbar-color:#315574_transparent] [scrollbar-width:thin] lg:overflow-x-hidden"
          role="region"
          aria-label={"Scrollable " + selectedYear + " monthly overtime timeline"}
          tabIndex={0}
        >
          <div className="grid min-w-[720px] grid-cols-[58px_repeat(12,minmax(0,1fr))] gap-x-1 lg:min-w-0">
            <div
              aria-hidden="true"
              className="overtime-timeline-labels sticky left-0 z-20 grid grid-rows-[28px_124px_repeat(3,34px)] bg-[#071c30] pr-1.5 text-[11px] font-medium text-[#9fb1c8] shadow-[10px_0_14px_-14px_rgba(0,0,0,0.9)]"
            >
              <span />
              <span className="flex items-end gap-1 pb-3"><Clock3 className="h-3 w-3 text-cyan-300" />Hours</span>
              <span className="flex items-center gap-1 border-t border-[#294b66]/80"><ArrowRight className="h-3 w-3 text-violet-300" />RDOT</span>
              <span className="flex items-center gap-1 border-t border-[#294b66]/80"><Clock3 className="h-3 w-3 text-cyan-300" />EXT</span>
              <span className="flex items-center gap-1 border-t border-[#294b66]/80"><Moon className="h-3 w-3 text-emerald-300" />Nights</span>
            </div>
            {monthSummaries.map((summary, monthIndex) => {
              const active = selectedMonth === monthIndex;
              const totalNights = active ? allowanceResult.nightDays : monthNightTotals[monthIndex];
              const barHeight = summary.hours > 0 ? Math.max(8, Math.round((summary.hours / timelineMaxHours) * 100)) : 2;
              const hasActivity = summary.hours > 0
                || summary.rdotCount > 0
                || summary.extensionCount > 0
                || totalNights > 0;
              const activityLabel = hasActivity ? "Has activity" : "No activity";
              const activityDotClass = hasActivity ? "bg-emerald-400" : "bg-rose-400";

              return (
                <button
                  key={summary.month}
                  ref={active ? activeMonthButtonRef : null}
                  type="button"
                  aria-pressed={active}
                  aria-label={[summary.month, selectedYear, summary.hours.toFixed(1) + " hours", summary.rdotCount + " RDOT", summary.extensionCount + " extensions", totalNights + " night days", activityLabel].join(", ")}
                  onClick={() => handleMonthSelect(monthIndex)}
                  className={[
                    "group grid min-w-0 grid-rows-[28px_124px_repeat(3,34px)] overflow-hidden rounded-[10px] border text-center transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70",
                    active ? "overtime-cockpit-selection border-[#8169ff] bg-violet-500/[0.10] shadow-[0_0_0_1px_rgba(129,105,255,0.24),0_10px_24px_rgba(39,27,104,0.20)]" : "border-transparent hover:border-[#365779] hover:bg-[#0b2137]/55",
                  ].join(" ")}
                >
                  <span className={["flex items-center justify-center text-[11px] font-semibold", active ? "text-violet-200" : "text-[#cbd7e5]"].join(" ")}>{summary.month.slice(0, 3).toUpperCase()}</span>
                  <span className="flex min-h-0 flex-col justify-end px-0.5 pb-3">
                    <strong className={["text-[11px] font-semibold", active ? "text-violet-200" : "text-[#eef5ff]"].join(" ")}>{summary.hours.toFixed(1)}</strong>
                    <span className="mt-1 flex h-[76px] items-end justify-center">
                      <i
                        aria-hidden="true"
                        className={["overtime-cockpit-bar block w-full max-w-[20px] rounded-t-[4px] transition-all", active ? "bg-[linear-gradient(180deg,#9b87ff,#6d5ce7)]" : summary.hours > 0 ? "bg-[linear-gradient(180deg,#67e8f9,#22a9c8)]" : "bg-rose-400"].join(" ")}
                        style={{ height: String(barHeight) + "%" }}
                      />
                    </span>
                    <span aria-hidden="true" className="relative mt-2 block h-px w-full bg-[#315574]">
                      <i className={["overtime-activity-dot absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#071c30]", active ? "bg-violet-400" : activityDotClass].join(" ")} />
                    </span>
                  </span>
                  <span className="flex items-center justify-center border-t border-[#294b66]/80 text-[11px] font-semibold text-[#eef5ff]">{summary.rdotCount}</span>
                  <span className="flex items-center justify-center border-t border-[#294b66]/80 text-[11px] font-semibold text-[#eef5ff]">{summary.extensionCount}</span>
                  <span className="flex items-center justify-center border-t border-[#294b66]/80 text-[11px] font-semibold text-[#eef5ff]">{totalNights}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="overtime-cockpit-subpanel mt-2.5 flex items-start gap-2 rounded-[12px] border border-[#294b66] bg-[#0b2137]/55 px-3 py-2 text-[11px] leading-relaxed text-[#91a6be]">
          <ArrowRight aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
          {MONTHS[selectedMonth]} overtime hours and night days are included in {MONTHS[salaryPeriod.monthIndex]} {salaryPeriod.year} salary.
        </p>
      </section>

      <aside
        data-testid="selected-month-snapshot"
        className="overtime-snapshot min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_8%_0%,rgba(111,80,255,0.12),transparent_34%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.25)] sm:p-5 lg:col-span-3"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-violet-400/30 bg-violet-500/10 text-violet-200">
            <CalendarDays aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#93a8c0]">Selected month</p>
            <h3 className="mt-1 text-[18px] font-semibold text-[#eff5fc]">{MONTHS[selectedMonth]} Snapshot</h3>
          </div>
        </div>

        <div className="mt-5 border-b border-[#315574]/80 pb-4">
          <p className="text-[clamp(2.5rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.03em] text-violet-300">{allowanceResult.overtimeHours.toFixed(1)}</p>
          <p className="mt-1 text-[12px] text-[#91a6be]">recorded overtime hours</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="overtime-cockpit-subpanel rounded-[13px] border border-[#2d4d68] bg-[#0b2137]/65 p-3">
            <p className="text-[12px] text-[#8fa6be]">RDOT</p>
            <p className="mt-1 text-[18px] font-semibold text-white">{selectedMonthSummary.rdotCount || 0}</p>
          </div>
          <div className="overtime-cockpit-subpanel rounded-[13px] border border-[#2d4d68] bg-[#0b2137]/65 p-3">
            <p className="text-[12px] text-[#8fa6be]">Extensions</p>
            <p className="mt-1 text-[18px] font-semibold text-white">{selectedMonthSummary.extensionCount || 0}</p>
          </div>
          <label htmlFor="overtime-night-days" data-testid="night-days-allowance-summary" className="overtime-cockpit-subpanel rounded-[13px] border border-[#2d4d68] bg-[#0b2137]/65 p-3">
            <span className="text-[12px] text-[#8fa6be]">Night days</span>
            <input
              id="overtime-night-days"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={allowanceDraft.nightDays}
              onChange={(event) => handleAllowanceFieldChange("nightDays", sanitizeIntegerInput(event.target.value))}
              placeholder="0"
              className="mt-1.5 h-11 w-full rounded-[9px] border border-[#405f7c] bg-[#102b46] px-2.5 text-[15px] font-semibold text-[#f4f8fd] outline-none focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/15"
            />
          </label>
          <div className="overtime-cockpit-subpanel rounded-[13px] border border-[#2d4d68] bg-[#0b2137]/65 p-3">
            <p className="text-[12px] text-[#8fa6be]">Night rate</p>
            <p className="mt-1 text-[15px] font-semibold text-white">SAR {formatMoney(NIGHT_ALLOWANCE_RATE)}</p>
            <p className="mt-1 text-[11px] text-[#7890aa]">per night</p>
          </div>
        </div>

        <div data-testid="recorded-hours-expected-ot-summary" className="overtime-cockpit-subpanel mt-3 space-y-2 rounded-[15px] border border-[#365779] bg-[#0b2137]/65 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] text-[#afbed2]"><Calculator aria-hidden="true" className="h-4 w-4 text-cyan-300" />Expected overtime</span>
            <strong className="overtime-cockpit-money text-[15px] text-emerald-300">SAR {formatMoney(allowanceResult.expectedOvertime)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] text-[#afbed2]"><Moon aria-hidden="true" className="h-4 w-4 text-violet-300" />Night allowance</span>
            <strong className="overtime-cockpit-money text-[15px] text-emerald-300">SAR {formatMoney(allowanceResult.nightAllowance)}</strong>
          </div>
        </div>

        <p className="mt-3 rounded-[12px] border border-violet-400/25 bg-violet-500/[0.08] px-3 py-2.5 text-[11px] leading-relaxed text-violet-200">
          {MONTHS[selectedMonth]} work is included in {MONTHS[salaryPeriod.monthIndex]} {salaryPeriod.year} salary.
        </p>
      </aside>

      <section
        data-testid="overtime-annual-summary"
        className="overtime-annual-summary min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_16px_42px_rgba(0,0,0,0.22)] sm:p-5 lg:col-span-10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
            <BarChart3 aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#93a8c0]">Annual overview</p>
            <h3 className="mt-1 text-[18px] font-semibold text-[#eff5fc]">{selectedYear} Annual Summary</h3>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {annualSummaryItems.map(({ label, value, detail, Icon, tone }) => (
            <div key={label} className="overtime-cockpit-subpanel rounded-[15px] border border-[#2d4d68] bg-[#0b2137]/65 p-3">
              <Icon aria-hidden="true" className={["h-4 w-4", tone].join(" ")} />
              <p className="mt-3 text-[24px] font-semibold leading-none text-white">{value}</p>
              <p className="mt-1.5 text-[12px] text-[#91a6be]">{label}</p>
              {detail && <p className={["mt-1 text-[11px] font-semibold uppercase tracking-[0.1em]", tone].join(" ")}>{detail}</p>}
            </div>
          ))}
        </div>
      </section>

      <section id="overtime-record-entry" aria-labelledby="overtime-record-entry-title" tabIndex={-1} className="h-full min-w-0 scroll-mt-4 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_8%_0%,rgba(45,145,255,0.14),transparent_34%),radial-gradient(circle_at_92%_4%,rgba(112,77,255,0.13),transparent_32%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.30)] outline-none focus:ring-2 focus:ring-cyan-400/70 focus:ring-offset-2 focus:ring-offset-[#061827] sm:p-5 lg:col-span-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#6d72ff]/35 bg-[linear-gradient(145deg,#2697e9,#6b4ff3)] text-white shadow-[0_8px_22px_rgba(67,83,235,0.28)]">
            <FilePlus2 className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
          <div>
            <h3 id="overtime-record-entry-title" className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c0cee0]">
              {editingNoteId ? "Edit monthly note" : editingId ? "Edit duty record" : "New record"}
            </h3>
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
                  key={`duty-time-${editingId || "new"}-${draft.type}-${draft.dayType}`}
                  value={draftTimingValue}
                  onValueChange={(timingValue) => {
                    const [startTime, endTime] = timingValue.split("|");
                    setDraft((current) => ({ ...current, startTime, endTime }));
                  }}
                >
                  <SelectTrigger
                    data-testid="duty-timing-select"
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#294660] bg-[#102840] px-3 text-[13px] font-medium text-[#eff5fc] shadow-none outline-none transition duration-150 hover:border-[#5579a0] hover:bg-[#15324f] focus:border-[#646cff] focus:ring-2 focus:ring-[#646cff]/25 data-[state=open]:border-[#777eff] data-[state=open]:bg-[#15324f] data-[state=open]:ring-2 data-[state=open]:ring-[#646cff]/25 [&>svg]:text-[#9fb2c9] [&>svg]:opacity-100"
                    aria-label="Time"
                  >
                    <SelectValue placeholder="Select time">
                      {getTimingLabel(resolvedDraftTiming.startTime, resolvedDraftTiming.endTime, draft.type === "EXTENSION")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    viewportClassName="!h-auto max-h-[360px]"
                    className="z-[100] min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[#3b5874] bg-[#0b2238] p-1.5 text-[#eaf2fb] shadow-[0_14px_36px_rgba(0,0,0,0.48)]"
                  >
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
                            {getTimingLabel(option.startTime, option.endTime, draft.type === "EXTENSION")}
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

      <section className="h-full min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_92%_0%,rgba(45,145,255,0.12),transparent_34%),radial-gradient(circle_at_5%_100%,rgba(81,67,205,0.09),transparent_34%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] shadow-[0_20px_55px_rgba(0,0,0,0.30)] lg:col-span-4">
        <div className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#4fa9dc]/35 bg-[linear-gradient(145deg,#17678f,#16456f)] text-[#dff6ff] shadow-[0_8px_22px_rgba(13,94,145,0.22)]">
              <ListChecks className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#c0cee0]">Records &amp; notes</p>
              <p className="mt-1 text-[12px] text-[#9fb1c8]">RDOT and EXT count hours. NOTE is information only.</p>
            </div>
          </div>
          <p className="rounded-full border border-[#2c5873] bg-[#0b2942]/90 px-3 py-1.5 text-[11px] font-semibold text-[#d3dfed] shadow-inner shadow-black/20">
            <span className="text-emerald-300">{visibleEntries.length}</span> entr{visibleEntries.length === 1 ? "y" : "ies"}
          </p>
        </div>

        <div className="px-4 pb-3 pt-1.5 sm:px-5 sm:pb-4">
          {!visibleEntries.length ? (
            <div className="rounded-2xl border border-dashed border-[#294660] px-5 py-9 text-center">
              <Plus className="mx-auto h-5 w-5 text-[#8196ad]" />
              <p className="mt-3 text-[14px] text-[#91a4bb]">No duty records or monthly notes for this month.</p>
            </div>
          ) : (
            <div className="max-h-[430px] space-y-2.5 overflow-y-auto pr-1 [scrollbar-color:#315574_transparent] [scrollbar-width:thin]">
              {visibleEntries.map((entry, index) => {
                const showSectionSeparator = index === 0 || visibleEntries[index - 1].kind !== entry.kind;
                const sectionLabel = entry.kind === "note" ? "Notes" : "EXT / RDOT";
                const entrySeparator = showSectionSeparator ? (
                  <div className="flex items-center gap-2 pb-0.5 pt-1" aria-label={`${sectionLabel} section`}>
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-200">{sectionLabel}</span>
                    <div aria-hidden="true" className="h-px flex-1 bg-sky-300/35" />
                  </div>
                ) : null;

                if (entry.kind === "note") {
                  const note = entry.item;
                  return (
                    <div key={entry.key}>
                      {entrySeparator}
                      <div className="flex flex-wrap items-center gap-2 rounded-[13px] border border-emerald-400/40 bg-[radial-gradient(circle_at_8%_20%,rgba(52,211,153,0.20),transparent_48%),linear-gradient(145deg,rgba(12,54,48,0.96),rgba(6,27,40,0.99))] px-2.5 py-2 shadow-[0_6px_18px_rgba(38,199,129,0.08)] transition hover:border-[#55d7aa]/50 hover:shadow-[0_8px_20px_rgba(38,199,129,0.12)] sm:flex-nowrap">
                      <div className="flex h-8 w-[58px] shrink-0 items-center justify-center rounded-[9px] border border-[#55d7aa]/35 bg-[#1dbd79]/10 px-2 text-[11px] font-semibold text-[#76d5ae] shadow-[0_0_14px_rgba(38,199,129,0.10)]">
                        NOTE
                      </div>
                      <div className="min-w-[150px] flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <p className="text-[13px] font-semibold text-[#f1f5fb]">{formatDate(note.date)}</p>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#76d5ae]">Monthly note</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[12px] leading-[1.35] text-[#b5c2d3]">{note.note}</p>
                      </div>
                      <div className="ml-auto min-w-[62px] shrink-0 border-r border-[#2f6659]/75 pr-3 text-right">
                        <MessageSquareText className="ml-auto h-3.5 w-3.5 text-[#76d5ae]" />
                        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#76d5ae]">No hours</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleNoteEdit(note)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#315d55] text-[#afbed2] transition hover:border-[#55d7aa]/55 hover:bg-[#1dbd79]/10 hover:text-[#dffaf0]"
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
                    </div>
                  );
                }

                const record = entry.item;
                return (
                  <div key={entry.key}>
                    {entrySeparator}
                    <div className={`flex flex-wrap items-center gap-2 rounded-[13px] border px-2.5 py-2 transition sm:flex-nowrap ${
                      record.type === "EXTENSION"
                        ? "border-amber-400/35 bg-[radial-gradient(circle_at_8%_20%,rgba(251,191,36,0.15),transparent_50%),linear-gradient(145deg,rgba(52,39,16,0.92),rgba(11,29,44,0.98))] shadow-[0_6px_18px_rgba(245,158,11,0.08)] hover:border-amber-300/55 hover:shadow-[0_8px_20px_rgba(245,158,11,0.12)]"
                        : "border-[#3f4b83] bg-[radial-gradient(circle_at_8%_20%,rgba(99,102,241,0.13),transparent_50%),linear-gradient(145deg,rgba(27,33,72,0.86),rgba(7,27,45,0.96))] shadow-[0_6px_16px_rgba(79,70,229,0.08)] hover:border-[#6268b5] hover:shadow-[0_8px_20px_rgba(79,70,229,0.12)]"
                    }`}>
                    <div className={`flex h-8 w-[58px] shrink-0 items-center justify-center rounded-[9px] border px-2 text-[11px] font-semibold ${record.type === "RDOT"
                      ? "border-[#5b56c8]/50 bg-[#252459]/55 text-[#8f94ff]"
                      : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                    }`}>
                      {record.type === "EXTENSION" ? "EXT" : record.type}
                    </div>
                    <div className="min-w-[150px] flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <p className="text-[13px] font-semibold text-[#f1f5fb]">{formatDate(record.date)}</p>
                        <span className="text-[12px] text-[#79a9d2]">{record.startTime} – {record.endTime}</span>
                        <span className={`rounded-full border px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.09em] ${record.dayType === "RAMADAN"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                          : "border-sky-400/20 bg-sky-500/[0.08] text-sky-200"
                        }`}>
                          {record.dayType === "RAMADAN" ? "Ramadhan" : "Normal"}
                        </span>
                      </div>
                      {record.remark && <p className="mt-0.5 truncate text-[12px] leading-[1.35] text-[#b5c2d3]">{record.remark}</p>}
                    </div>
                    <div className="ml-auto min-w-[62px] shrink-0 border-r border-[#294660] pr-3 text-right">
                      <p className="text-[16px] font-semibold leading-none text-emerald-300">{Number(record.hours).toFixed(1)}</p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-[0.11em] text-[#8ea1b8]">Hours</p>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <NightShiftPdfDetector
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        className="lg:col-span-10"
      />
    </div>
  );
}
