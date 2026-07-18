import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error Vite resolves this worker module to a public asset URL.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ClipboardCopy,
  Clock3,
  Database,
  Download,
  FileText,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
  Users,
} from "lucide-react";
import {
  ROSTER_ROLE_ORDER,
  ROSTER_PARSER_VERSION,
  ensureRosterNames,
  getRosterEntryRole,
  parseRosterPdf,
  queryRoster,
} from "./roster/rosterParser";
import {
  deleteSavedRoster,
  loadSavedRosters,
  saveRoster,
  sortRosterVersions,
  updateRosterParsed,
  updateRosterRemark,
} from "./roster/rosterStorage";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function loadPdfJs() {
  return Promise.resolve({ getDocument, Util });
}

function bytesToLabel(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function dateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
  return { year, month, day, date };
}

function formatInputDate(value, locale = "en-GB") {
  const parsedDate = parseDateInputValue(value);
  if (!parsedDate) return "Select a date";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate.date);
}

function formatRosterCoverage(parsed, locale = "en-GB") {
  if (!parsed) return "this roster";
  const dateKeys = Array.isArray(parsed.dates) ? parsed.dates.filter(Boolean).sort() : [];
  const startKey = parsed.startDate || dateKeys[0];
  const endKey = parsed.endDate || dateKeys[dateKeys.length - 1];
  const start = parseDateInputValue(startKey || "");
  const end = parseDateInputValue(endKey || "");

  if (start && end) {
    const sameDate = startKey === endKey;
    const sameMonth = start.year === end.year && start.month === end.month;
    if (sameDate) {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(start.date);
    }
    if (sameMonth) {
      const monthYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(start.date);
      return `${start.day}-${end.day} ${monthYear}`;
    }
    const startLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", ...(start.year !== end.year ? { year: "numeric" } : {}) }).format(start.date);
    const endLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(end.date);
    return `${startLabel}-${endLabel}`;
  }

  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(parsed.year, (parsed.month || 1) - 1, 1),
  );
}

function roleBadgeClass(role) {
  const classes = {
    DM: "border-violet-400/35 bg-violet-400/10 text-violet-200",
    TCC: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
    TC: "border-sky-400/35 bg-sky-400/10 text-sky-200",
    DC: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
    EFC: "border-amber-400/35 bg-amber-400/10 text-amber-200",
    SC: "border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-200",
  };
  return classes[role] || "border-slate-400/30 bg-slate-400/10 text-slate-200";
}

const SHIFT_STYLES = {
  early: {
    label: "Early Shift",
    border: "border-amber-400/25",
    badge: "border-amber-300/35 bg-amber-400/10 text-amber-100",
    dot: "bg-amber-300",
  },
  late: {
    label: "Late Shift",
    border: "border-sky-400/25",
    badge: "border-sky-300/35 bg-sky-400/10 text-sky-100",
    dot: "bg-sky-300",
  },
  night: {
    label: "Night Shift",
    border: "border-indigo-400/25",
    badge: "border-indigo-300/35 bg-indigo-400/10 text-indigo-100",
    dot: "bg-indigo-300",
  },
  extension: {
    label: "Extension Shift",
    border: "border-orange-400/25",
    badge: "border-orange-300/35 bg-orange-400/10 text-orange-100",
    dot: "bg-orange-300",
  },
  training: {
    label: "Training",
    border: "border-teal-400/25",
    badge: "border-teal-300/35 bg-teal-400/10 text-teal-100",
    dot: "bg-teal-300",
  },
  other: {
    label: "Other Duty",
    border: "border-purple-400/30",
    badge: "border-purple-300/35 bg-purple-400/10 text-purple-100",
    dot: "bg-purple-300",
  },
  rest: {
    label: "Rest / Leave",
    border: "border-rose-400/20",
    badge: "border-rose-300/25 bg-rose-400/10 text-rose-100",
    dot: "bg-rose-300",
  },
};

function ActionButton({ children, icon: Icon, onClick, disabled = false, primary = false, danger = false, title, compact = false }) {
  const className = danger
    ? "border-rose-400/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
    : primary
      ? "border-sky-300/50 bg-sky-500/20 text-white hover:bg-sky-500/30"
      : "border-[#315671] bg-[#0a253b] text-[#d9eaf7] hover:bg-[#0e304c]";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`theme-roster-action-btn ${primary ? "is-primary" : ""} ${danger ? "is-danger" : ""} inline-flex items-center justify-center border font-bold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 ${compact ? "h-9 gap-1.5 rounded-lg px-3 text-[11px]" : "h-11 gap-2 rounded-xl px-3.5 text-[13px]"} ${className}`}
    >
      {Icon ? <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null}
      {children}
    </button>
  );
}

function EmptyRoster({ onUpload }) {
  return (
    <div className="theme-roster-empty rounded-2xl border border-dashed border-[#315671] bg-[#081b2b] px-6 py-12 text-center">
      <div className="theme-roster-empty-icon mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/10 text-sky-200">
        <FileText className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-[16px] font-extrabold text-white">Upload the OCC roster PDF</h3>
      <p className="mx-auto mt-2 max-w-lg text-[11px] leading-5 text-[#8eabc0]">
        The original PDF and detected controller schedule are saved to Cloudflare D1, so they remain after refresh and can be opened from another laptop.
      </p>
      <div className="mt-5 flex justify-center">
        <ActionButton icon={Upload} primary onClick={onUpload}>Upload Roster</ActionButton>
      </div>
      <p className="mt-3 text-[9px] text-[#58758b]">PDF format · original roster layout supported</p>
    </div>
  );
}

const HORIZONTAL_ROLE_ORDER = ["DM", "TCC", "TC", "DC", "EFC", "SC"];

function getSpecialLeaveType(entry) {
  const code = String(entry?.dutyCode || entry?.raw || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (/^TOIL\b/.test(code)) return "TOIL";
  if (/^(?:CF\s+)?AL\b/.test(code)) return "AL";
  if (/^WR\b/.test(code)) return "RD";
  return "";
}

function HorizontalPersonPill({ person, entry, day }) {
  const role = getRosterEntryRole(person, day);
  const controllerName = person.displayName || person.rawName || person.name || "Controller name unavailable";
  const time = entry.timeStart && entry.timeEnd
    ? `${entry.timeStart}–${entry.timeEnd}`
    : entry.dutyCode || entry.raw || "";
  const isExtension = entry.shiftKey === "extension";
  const titleParts = [controllerName, time, isExtension ? "Extension duty" : ""].filter(Boolean);

  return (
    <span
      title={titleParts.join(" · ")}
      className={`theme-roster-name-pill is-${String(role).toLowerCase()} inline-flex max-w-full items-center px-1 py-0.5 text-[11px] font-semibold leading-4 ${isExtension ? "flex-col gap-0.5" : "gap-1.5"}`}
    >
      <span className={isExtension ? "max-w-full whitespace-normal break-words text-center" : "truncate"}>{controllerName}</span>
      {isExtension ? (
        <span className="shrink-0 rounded-full border border-orange-300/45 bg-orange-400/15 px-1.5 py-px text-[8px] font-black uppercase tracking-wide text-orange-100">
          Extension
        </span>
      ) : null}
    </span>
  );
}

function ShiftGroup({ shiftKey, rows, day }) {
  const style = SHIFT_STYLES[shiftKey] || SHIFT_STYLES.other;
  const label = style.label;
  const timeLabels = [...new Set(rows.map(({ entry }) => (
    entry.timeStart && entry.timeEnd
      ? `${entry.timeStart}–${entry.timeEnd}`
      : entry.dutyCode || entry.shiftLabel || ""
  )).filter(Boolean))];

  return (
    <section className={`theme-roster-shift-group theme-roster-horizontal-shift is-${shiftKey} overflow-hidden rounded-[18px] border bg-[#071827] ${style.border}`}>
      <div className="theme-roster-shift-grid grid grid-cols-[142px_repeat(6,minmax(118px,1fr))]">
        <div className="theme-roster-horizontal-shift-cell flex min-h-[118px] flex-col items-center justify-center border-r border-white/10 px-2.5 py-4 text-center">
          <h4 className="theme-roster-horizontal-shift-title text-[13px] font-black uppercase leading-[1.15] tracking-[0.06em] text-white">{label}</h4>
          <div className="theme-roster-horizontal-times mt-3 flex flex-col items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[#9bb7c9]">
            {timeLabels.length
              ? timeLabels.map((time) => (
                <div key={time} className="theme-roster-time-pill inline-flex w-fit items-center rounded-full border px-2.5 py-1">
                  {time}
                </div>
              ))
              : <div className="theme-roster-time-pill is-empty inline-flex w-fit items-center rounded-full border px-2.5 py-1">—</div>}
          </div>
        </div>

        {HORIZONTAL_ROLE_ORDER.map((role) => {
          const roleRows = rows.filter(({ person }) => getRosterEntryRole(person, day) === role);
          return (
            <div key={role} className="theme-roster-horizontal-role-cell flex min-w-0 flex-col items-center border-r border-white/10 px-3 py-4 last:border-r-0">
              <div className={`theme-roster-role-heading is-${role.toLowerCase()}`}>
                <span className="theme-roster-role-heading-label">{role}</span>
                <span className="theme-roster-role-divider" aria-hidden="true" />
              </div>
              <div className="theme-roster-horizontal-names flex w-full flex-1 flex-col items-center justify-start gap-1.5">
                {roleRows.length
                  ? roleRows.map(({ person, entry }) => (
                    <HorizontalPersonPill key={`${person.id}-${day}-${entry.dutyCode || entry.shiftKey}`} person={person} entry={entry} day={day} />
                  ))
                  : <span className="theme-roster-horizontal-empty mt-1 text-[11px] text-[#55758b]">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SpecialLeaveTable({ rows, day }) {
  const leaveIcons = {
    TOIL: Clock3,
    AL: UserRound,
    RD: CalendarDays,
  };

  const leaveGroups = ["TOIL", "AL", "RD"]
    .map((leaveType) => ({
      leaveType,
      rows: rows.filter(({ entry }) => getSpecialLeaveType(entry) === leaveType),
    }))
    .filter((group) => group.rows.length);

  if (!leaveGroups.length) return null;

  return (
    <section className="theme-roster-leave-table overflow-hidden rounded-[18px] border border-rose-400/25 bg-[#071827]">
      <div className="theme-roster-leave-table-header flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="theme-roster-leave-header-icon flex h-8 w-8 items-center justify-center rounded-lg border border-pink-300/25 bg-pink-400/10 text-pink-200">
            <Users className="h-4 w-4" />
          </div>
          <div className="text-[14px] font-black uppercase tracking-[0.08em] text-white">TOIL / AL / RD</div>
        </div>
        <span className="theme-roster-leave-total rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-[11px] font-black text-rose-100">{rows.length}</span>
      </div>

      <div className="theme-roster-leave-list divide-y divide-white/10 px-4">
        {leaveGroups.map(({ leaveType, rows: leaveRows }) => {
          const LeaveIcon = leaveIcons[leaveType] || CalendarDays;
          return (
            <div key={leaveType} className="theme-roster-leave-row grid grid-cols-[118px_minmax(0,1fr)] items-center gap-4 py-3">
              <div className={`theme-roster-leave-type is-${leaveType.toLowerCase()} flex items-center gap-3`}>
                <span className="theme-roster-leave-icon flex h-8 w-8 items-center justify-center rounded-lg border">
                  <LeaveIcon className="h-4 w-4" />
                </span>
                <span className="theme-roster-leave-label text-[11px] font-black">{leaveType}</span>
              </div>
              <div className="theme-roster-leave-cell min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {leaveRows.map(({ person, entry }) => (
                    <HorizontalPersonPill key={`${person.id}-${day}-${leaveType}-${entry.dutyCode || entry.raw}`} person={person} entry={entry} day={day} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function rosterDisplayShiftKey(entry) {
  if (entry?.shiftKey !== "extension") return entry?.shiftKey || "other";

  const extensionLabel = String(entry.shiftLabel || "").toLowerCase();
  if (extensionLabel.startsWith("early")) return "early";
  if (extensionLabel.startsWith("late")) return "late";
  if (extensionLabel.startsWith("night")) return "night";

  const startHour = Number(String(entry.timeStart || "").split(":")[0]);
  if (!Number.isFinite(startHour)) return "other";
  if (startHour >= 18 || startHour < 5) return "night";
  return startHour < 12 ? "early" : "late";
}

function groupRows(rows) {
  const order = ["early", "late", "night", "training", "other", "rest"];
  return order
    .map((shiftKey) => ({ shiftKey, rows: rows.filter(({ entry }) => rosterDisplayShiftKey(entry) === shiftKey) }))
    .filter((group) => group.rows.length);
}

function MiniButton({ icon: Icon, label, onClick, danger = false, confirm = false, disabled = false, compact = false }) {
  const tone = danger
    ? confirm
      ? "border-rose-300/60 bg-rose-500/25 text-rose-50"
      : "border-rose-400/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
    : "border-[#315671] bg-[#0a253b] text-[#d9eaf7] hover:bg-[#0e304c]";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`theme-roster-mini-btn ${danger ? "is-danger" : ""} ${confirm ? "is-confirm" : ""} inline-flex items-center justify-center rounded-lg border font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${compact ? "h-7 gap-1 px-2 text-[8px]" : "h-8 gap-1.5 px-2.5 text-[9px]"} ${tone}`}
    >
      {Icon ? <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> : null}
      <span>{confirm ? "Confirm" : label}</span>
    </button>
  );
}


function rosterEntryForDate(person, dateKey) {
  if (!person?.entries || !dateKey) return null;
  if (person.entries[dateKey]) return person.entries[dateKey];
  const parts = parseDateInputValue(dateKey);
  return parts ? person.entries[parts.day] || null : null;
}

function rosterRangeDates(fromDate, toDate) {
  const from = parseDateInputValue(fromDate);
  const to = parseDateInputValue(toDate);
  if (!from || !to || from.date > to.date) return [];
  const dates = [];
  const cursor = new Date(from.year, from.month - 1, from.day);
  while (cursor <= to.date && dates.length < 370) {
    dates.push(localDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function scheduleEntryStatus(entry) {
  if (!entry) return { label: "Not in roster", tone: "missing", isWorking: false };
  const leaveType = getSpecialLeaveType(entry);
  if (leaveType) return { label: leaveType, tone: leaveType.toLowerCase(), isWorking: false };
  if (entry.isRest) {
    const label = String(entry.dutyCode || entry.shiftLabel || "Rest / Leave").trim();
    return { label, tone: "rest", isWorking: false };
  }
  if (entry.isWorking) {
    return { label: entry.shiftLabel || "Working", tone: entry.shiftKey || "working", isWorking: true };
  }
  return { label: entry.dutyCode || entry.shiftLabel || "No duty", tone: "other", isWorking: false };
}

function scheduleStatusClass(tone) {
  const classes = {
    early: "is-early",
    late: "is-late",
    night: "is-night",
    extension: "is-extension",
    training: "is-training",
    other: "is-other",
    working: "is-working",
    toil: "is-toil",
    al: "is-al",
    rd: "is-rd",
    rest: "is-rest",
    missing: "is-missing",
  };
  return classes[tone] || "is-other";
}

function StaffSchedulePanel({ parsed, rosterKey }) {
  const rosterDates = useMemo(() => (
    Array.isArray(parsed?.dates) ? [...parsed.dates].filter(Boolean).sort() : []
  ), [parsed]);
  const people = useMemo(() => (
    [...(parsed?.people || [])].sort((a, b) => String(a.displayName || a.rawName || "").localeCompare(String(b.displayName || b.rawName || "")))
  ), [parsed]);
  const [staffId, setStaffId] = useState("");
  const [compareStaffIds, setCompareStaffIds] = useState([""]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    const today = localDateInputValue();
    const defaultFrom = rosterDates.includes(today) ? today : rosterDates[0] || "";
    const fromIndex = Math.max(0, rosterDates.indexOf(defaultFrom));
    const defaultTo = rosterDates[Math.min(fromIndex + 5, Math.max(0, rosterDates.length - 1))] || defaultFrom;
    setStaffId("");
    setCompareStaffIds([""]);
    setFromDate(defaultFrom);
    setToDate(defaultTo);
    setCopiedKey("");
    setCopyError("");
  }, [rosterKey, rosterDates.join("|")]);

  const rangeError = useMemo(() => {
    if (!parsed) return "";
    if (!staffId && !compareStaffIds.some(Boolean) && !fromDate && !toDate) return "";
    const from = parseDateInputValue(fromDate);
    const to = parseDateInputValue(toDate);
    if (!from || !to) return "Enter a valid From and To date.";
    if (from.date > to.date) return "The From date cannot be after the To date.";
    if (!rosterDates.length || fromDate < rosterDates[0] || toDate > rosterDates[rosterDates.length - 1]) {
      return `Choose a date range within ${formatRosterCoverage(parsed)}.`;
    }
    return "";
  }, [parsed, staffId, compareStaffIds, fromDate, toDate, rosterDates]);

  const buildResult = (selectedStaffId) => {
    if (!selectedStaffId || !parsed || rangeError) return null;
    const person = people.find((item) => item.id === selectedStaffId);
    if (!person) return null;
    const rosterDateSet = new Set(rosterDates);
    const rows = rosterRangeDates(fromDate, toDate).map((dateKey) => {
      const entry = rosterDateSet.has(dateKey) ? rosterEntryForDate(person, dateKey) : null;
      return { dateKey, entry, status: scheduleEntryStatus(entry) };
    });
    return { person, rows, fromDate, toDate };
  };

  const primaryResult = useMemo(
    () => buildResult(staffId),
    [staffId, parsed, rangeError, people, rosterDates, fromDate, toDate],
  );
  const compareResults = useMemo(
    () => compareStaffIds.map((selectedStaffId, index) => ({
      index,
      staffId: selectedStaffId,
      result: buildResult(selectedStaffId),
    })).filter((item) => item.result),
    [compareStaffIds, parsed, rangeError, people, rosterDates, fromDate, toDate],
  );

  const selectedCompareIds = compareStaffIds.filter(Boolean);
  const canAddCompare = Boolean(
    staffId
    && selectedCompareIds.length < Math.max(0, people.length - 1)
    && compareStaffIds.every(Boolean)
  );

  const updateCompareStaff = (index, nextStaffId) => {
    setCompareStaffIds((current) => current.map((value, itemIndex) => (
      itemIndex === index ? nextStaffId : value
    )));
    setCopiedKey("");
    setCopyError("");
  };

  const addCompareStaff = () => {
    if (!canAddCompare) return;
    setCompareStaffIds((current) => [...current, ""]);
  };

  const removeCompareStaff = (index) => {
    setCompareStaffIds((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [""];
    });
    setCopiedKey("");
    setCopyError("");
  };

  const resetStaffSchedule = () => {
    setStaffId("");
    setCompareStaffIds([""]);
    setFromDate("");
    setToDate("");
    setCopiedKey("");
    setCopyError("");
  };

  const scheduleLine = ({ dateKey, entry, status }) => {
    const date = parseDateInputValue(dateKey)?.date;
    const dateLabel = date
      ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date)
      : dateKey;
    if (status.isWorking) {
      const time = entry?.timeStart && entry?.timeEnd ? `, ${entry.timeStart}–${entry.timeEnd}` : "";
      return `${dateLabel}: ${status.label}${time}`;
    }
    if (status.tone === "other" && entry?.dutyCode) return `${dateLabel}: ${status.label}, ${entry.dutyCode}`;
    return `${dateLabel}: ${status.label}`;
  };

  const copySchedule = async (result, resultKey) => {
    if (!result) return;
    const title = `${result.person.displayName || result.person.rawName} — ${result.rows.length}-Day Schedule`;
    const lines = [title, ...result.rows.map(scheduleLine)];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyError("");
      setCopiedKey(resultKey);
      window.setTimeout(() => setCopiedKey(""), 1800);
    } catch {
      setCopyError("Unable to copy the staff schedule.");
    }
  };

  const renderScheduleResult = (result, resultKey, comparison = false, comparisonNumber = 0) => {
    if (!result) return null;
    const start = parseDateInputValue(result.fromDate)?.date;
    const end = parseDateInputValue(result.toDate)?.date;
    const comparisonTone = comparison ? `comparison-tone-${((comparisonNumber - 1) % 6) + 1}` : "";
    return (
      <div className={`theme-roster-staff-result-block ${comparison ? "is-comparison" : "is-primary"} ${comparisonTone} min-w-0 overflow-hidden rounded-xl border border-[#1d4058] bg-[#071827]`}>
        <div className="theme-roster-staff-result-head border-b border-[#1d4058] px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="theme-roster-staff-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/10 text-sky-100">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[13px] font-medium leading-5 text-white">
                    {result.person.displayName || result.person.rawName}
                  </div>
                  {comparison ? (
                    <span className="theme-roster-compare-pill shrink-0 rounded-full border border-violet-300/30 bg-violet-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-violet-100">Compare {comparisonNumber}</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-normal text-[#7897aa]">
                  <span>{result.rows.length}-Day Schedule</span>
                  <span className="opacity-50">•</span>
                  <span>{start ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(start) : ""} – {end ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(end) : ""}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copySchedule(result, resultKey)}
              className="theme-roster-copy-schedule inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#315671] bg-[#0a253b] px-2.5 text-[9px] font-bold text-[#d9eaf7] hover:bg-[#0e304c]"
            >
              {copiedKey === resultKey ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copiedKey === resultKey ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="theme-roster-schedule-scroll p-3">
          <div className="theme-roster-schedule-list space-y-1.5">
            {result.rows.map((row) => {
              const date = parseDateInputValue(row.dateKey)?.date;
              const dateLabel = date
                ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date)
                : row.dateKey;
              const time = row.status.isWorking && row.entry?.timeStart && row.entry?.timeEnd
                ? `${row.entry.timeStart}–${row.entry.timeEnd}`
                : "";
              return (
                <div key={row.dateKey} className={`theme-roster-schedule-item ${scheduleStatusClass(row.status.tone)} flex min-h-[34px] items-center gap-1.5 rounded-xl border px-2.5 py-1`}>
                  <div className="theme-roster-schedule-date inline-flex h-[26px] min-w-[54px] shrink-0 items-center justify-center rounded-full border px-2 text-[9px] font-normal tabular-nums">
                    {dateLabel}
                  </div>
                  <span className="theme-roster-schedule-separator shrink-0 text-[9px] font-normal opacity-45">:</span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap">
                    <span className="theme-roster-schedule-dot h-1.5 w-1.5 shrink-0 rounded-full" />
                    {time ? (
                      <>
                        <span className="truncate text-[10px] font-normal leading-4">{row.status.label}</span>
                        <span className="theme-roster-schedule-comma shrink-0 opacity-45">,</span>
                        <span className="theme-roster-schedule-time shrink-0 rounded-full border px-2.5 py-[3px] text-[9px] font-normal tabular-nums">
                          {time}
                        </span>
                      </>
                    ) : (
                      <span className="theme-roster-schedule-time is-status shrink-0 rounded-full border px-2.5 py-[3px] text-[9px] font-normal">
                        {row.status.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="theme-roster-staff-schedule xl:w-max xl:min-w-[420px]">
      <section className="overflow-hidden rounded-2xl border border-[#294b63] bg-[#081b2a] shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
        <header className="theme-roster-staff-schedule-header border-b border-[#1d4058] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/10 text-sky-100">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-white">Staff Schedule</h3>
                <p className="mt-0.5 text-[10px] text-[#7897aa]">Updates automatically when staff or dates change.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetStaffSchedule}
              disabled={!staffId && !compareStaffIds.some(Boolean) && !fromDate && !toDate}
              title="Clear staff, comparisons and dates"
              aria-label="Reset staff schedule"
              className="theme-roster-reset-schedule inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-300/25 bg-rose-400/10 px-2.5 text-[9px] font-bold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </header>

        <div className="space-y-3 p-3.5">
          <label className="theme-roster-staff-name-card block rounded-[18px] border border-[#2f6659] bg-[radial-gradient(circle_at_10%_20%,rgba(50,218,151,0.13),transparent_50%),linear-gradient(145deg,rgba(11,40,43,0.94),rgba(6,23,39,0.98))] p-3.5 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase leading-[1.35] tracking-[0.15em] text-[#afbed2]">Staff Name</span>
            <select
              value={staffId}
              onChange={(event) => {
                const nextStaffId = event.target.value;
                setStaffId(nextStaffId);
                setCompareStaffIds((current) => current.map((value) => value === nextStaffId ? "" : value));
                setCopiedKey("");
                setCopyError("");
              }}
              disabled={!parsed}
              className="theme-roster-control theme-roster-ext-control h-11 w-full rounded-xl border border-[#376d60] bg-[#061a20] px-3 text-[12px] font-semibold text-white outline-none focus:border-emerald-300/70 disabled:opacity-50"
            >
              <option value="">Select staff…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.displayName || person.rawName}</option>
              ))}
            </select>
          </label>

          <div className="theme-roster-compare-controls rounded-xl border border-[#24465f] bg-[#071827]/55 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#8eb0c5]">Compare Staff</span>
              <button
                type="button"
                onClick={addCompareStaff}
                disabled={!canAddCompare}
                className="theme-roster-add-compare inline-flex h-7 items-center gap-1 rounded-lg border border-violet-300/30 bg-violet-400/10 px-2 text-[9px] font-black text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add Compare
              </button>
            </div>
            <div className="space-y-2">
              {compareStaffIds.map((selectedCompareId, index) => (
                <div key={`compare-control-${index}`} className="grid grid-cols-[minmax(0,1fr)_32px] gap-2">
                  <select
                    value={selectedCompareId}
                    onChange={(event) => updateCompareStaff(index, event.target.value)}
                    disabled={!parsed || !staffId}
                    aria-label={`Compare staff ${index + 1}`}
                    className="theme-roster-control h-10 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[11px] font-semibold text-white outline-none focus:border-violet-400/60 disabled:opacity-50"
                  >
                    <option value="">Select comparison {index + 1}…</option>
                    {people.filter((person) => (
                      person.id !== staffId
                      && (!compareStaffIds.includes(person.id) || person.id === selectedCompareId)
                    )).map((person) => (
                      <option key={person.id} value={person.id}>{person.displayName || person.rawName}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCompareStaff(index)}
                    title={`Remove comparison ${index + 1}`}
                    aria-label={`Remove comparison ${index + 1}`}
                    className="theme-roster-remove-compare flex h-10 w-8 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#8eb0c5]">From Date</span>
              <input
                type="date"
                value={fromDate}
                min={rosterDates[0] || undefined}
                max={rosterDates[rosterDates.length - 1] || undefined}
                onChange={(event) => { setFromDate(event.target.value); setCopiedKey(""); setCopyError(""); }}
                disabled={!parsed}
                className="theme-roster-control h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[10px] font-semibold text-white outline-none [color-scheme:dark] focus:border-sky-400/60 disabled:opacity-50"
              />
            </label>

            <label className="block min-w-0">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#8eb0c5]">To Date</span>
              <input
                type="date"
                value={toDate}
                min={rosterDates[0] || undefined}
                max={rosterDates[rosterDates.length - 1] || undefined}
                onChange={(event) => { setToDate(event.target.value); setCopiedKey(""); setCopyError(""); }}
                disabled={!parsed}
                className="theme-roster-control h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[10px] font-semibold text-white outline-none [color-scheme:dark] focus:border-sky-400/60 disabled:opacity-50"
              />
            </label>
          </div>

          {rangeError || copyError ? (
            <div className="theme-roster-staff-error flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[10px] font-semibold text-rose-100">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {rangeError || copyError}
            </div>
          ) : null}
        </div>

        <div className="theme-roster-staff-output border-t border-[#1d4058]">
          {!staffId ? (
            <div className="theme-roster-staff-empty flex min-h-[150px] flex-col items-center justify-center px-4 py-8 text-center">
              <Users className="h-6 w-6 text-[#52758d]" />
              <div className="mt-2 text-[11px] font-bold text-[#bdd1de]">Schedule output</div>
              <div className="mt-1 text-[9px] leading-4 text-[#58778c]">Select a staff member. The schedule appears automatically.</div>
            </div>
          ) : rangeError ? null : (
            <div className="theme-roster-staff-results-row flex gap-3 p-3">
              <div className="theme-roster-staff-result-column min-w-[310px] flex-[0_0_310px]">
                {renderScheduleResult(primaryResult, "primary")}
              </div>
              {compareResults.map(({ index, result }, compareIndex) => (
                <div key={`compare-result-${index}-${result.person.id}`} className="theme-roster-staff-result-column min-w-[310px] flex-[0_0_310px]">
                  {renderScheduleResult(result, `compare-${index}`, true, compareIndex + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

function repairRosterVersions(records = []) {
  return sortRosterVersions((Array.isArray(records) ? records : []).map((item) => ({
    ...item,
    parsed: ensureRosterNames(item.parsed),
  })));
}

function rosterListSignature(records = []) {
  return records
    .map((item) => `${item.versionKey}:${item.updatedAt || ""}:${item.remark || ""}`)
    .join("|");
}

export default function RosterWorkspace() {
  const fileInputRef = useRef(null);
  const recordsRef = useRef([]);
  const selectedIdRef = useRef("");
  const processingRef = useRef(false);
  const upgradedVersionsRef = useRef(new Set());
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadRemark, setUploadRemark] = useState("");
  const [editingRemarkId, setEditingRemarkId] = useState("");
  const [editingRemark, setEditingRemark] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => localDateInputValue());
  const [role, setRole] = useState("ALL");
  const [search, setSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState("Connecting to Cloudflare D1…");

  const record = useMemo(
    () => records.find((item) => item.versionKey === selectedId) || records[0] || null,
    [records, selectedId],
  );
  const parsed = record?.parsed || null;

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    let active = true;
    loadSavedRosters()
      .then((savedRecords) => {
        if (!active) return;
        const restored = repairRosterVersions(savedRecords);
        setRecords(restored);
        recordsRef.current = restored;
        const latestId = restored[0]?.versionKey || "";
        setSelectedId(latestId);
        selectedIdRef.current = latestId;
        if (!restored.length) {
          setSyncStatus("Live storage ready · no roster uploaded");
        } else if (restored.some((item) => item.cloudSynced === false)) {
          setSyncStatus("Roster history ready · some versions are local only");
        } else {
          setSyncStatus(`${restored.length} saved version${restored.length === 1 ? "" : "s"} · live sync ready`);
        }
      })
      .catch((storageError) => {
        if (active) {
          setError(storageError.message || "Unable to restore the saved roster versions.");
          setSyncStatus("Cloud sync unavailable");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    const refreshFromCloud = async () => {
      if (!active || processingRef.current) return;
      try {
        const refreshed = repairRosterVersions(await loadSavedRosters());
        if (!active) return;
        const oldRecords = recordsRef.current;
        const oldLatestId = oldRecords[0]?.versionKey || "";
        const newLatestId = refreshed[0]?.versionKey || "";
        const changed = rosterListSignature(refreshed) !== rosterListSignature(oldRecords);

        if (changed) {
          setRecords(refreshed);
          recordsRef.current = refreshed;
          const currentSelected = selectedIdRef.current;
          const selectedStillExists = refreshed.some((item) => item.versionKey === currentSelected);
          const followLatest = !currentSelected || currentSelected === oldLatestId || !selectedStillExists;
          const nextSelected = followLatest ? newLatestId : currentSelected;
          setSelectedId(nextSelected);
          selectedIdRef.current = nextSelected;
          if (newLatestId && newLatestId !== oldLatestId) {
            setNotice("A newer roster version was loaded and placed at the top.");
          }
        }

        setSyncStatus(refreshed.length
          ? `${refreshed.length} saved version${refreshed.length === 1 ? "" : "s"} · live sync ready`
          : "Live storage ready · no roster uploaded");
      } catch {
        if (active) setSyncStatus("Local roster history ready · cloud sync unavailable");
      }
    };

    const handleFocus = () => refreshFromCloud();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshFromCloud();
    };
    const timer = window.setInterval(refreshFromCloud, 60000);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!parsed) return;
    setSelectedDate(localDateInputValue());
    setRole("ALL");
    setSearch("");
  }, [record?.versionKey]);

  useEffect(() => {
    let active = true;
    const target = record;
    const parsedVersion = Number(target?.parsed?.version || 0);
    if (!target?.versionKey || !target.fileBlob || parsedVersion >= ROSTER_PARSER_VERSION) return undefined;
    if (upgradedVersionsRef.current.has(target.versionKey)) return undefined;
    upgradedVersionsRef.current.add(target.versionKey);

    const upgradeSavedRoster = async () => {
      processingRef.current = true;
      try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await target.fileBlob.arrayBuffer();
        const upgradedParsed = await parseRosterPdf(arrayBuffer, target.fileName, pdfjsLib);
        const updated = await updateRosterParsed(target, upgradedParsed);
        if (!active) return;
        const nextRecords = repairRosterVersions(recordsRef.current.map((item) => (
          item.versionKey === target.versionKey ? updated : item
        )));
        setRecords(nextRecords);
        recordsRef.current = nextRecords;
        setNotice("Roster data updated with the latest PDF parser.");
        if (updated.cloudSynced === false && updated.syncError) setError(updated.syncError);
      } catch (upgradeError) {
        if (active) setError(upgradeError.message || "Unable to update this saved roster format. Re-upload the original PDF.");
      } finally {
        processingRef.current = false;
      }
    };

    upgradeSavedRoster();
    return () => { active = false; };
  }, [record?.versionKey, record?.parsed?.version]);

  const selectedDateParts = useMemo(() => parseDateInputValue(selectedDate), [selectedDate]);
  const selectedDateRef = useMemo(() => {
    if (!parsed || !selectedDateParts) return null;
    if (Array.isArray(parsed.dates) && parsed.dates.length) {
      return parsed.dates.includes(selectedDate) ? selectedDate : null;
    }
    if (Number(parsed.year) !== selectedDateParts.year || Number(parsed.month) !== selectedDateParts.month) return null;
    return parsed.days?.some((day) => Number(day) === selectedDateParts.day) ? selectedDateParts.day : null;
  }, [parsed, selectedDate, selectedDateParts]);
  const dateExists = selectedDateRef !== null;

  const rows = useMemo(() => queryRoster(parsed, {
    dateKey: typeof selectedDateRef === "string" ? selectedDateRef : null,
    day: typeof selectedDateRef === "number" ? selectedDateRef : null,
    role,
    includeRest: false,
    search,
  }), [parsed, selectedDateRef, role, search]);

  const allDateRows = useMemo(() => queryRoster(parsed, {
    dateKey: typeof selectedDateRef === "string" ? selectedDateRef : null,
    day: typeof selectedDateRef === "number" ? selectedDateRef : null,
    role,
    includeRest: true,
    search,
  }), [parsed, selectedDateRef, role, search]);

  const specialLeaveRows = useMemo(
    () => allDateRows.filter(({ entry }) => Boolean(getSpecialLeaveType(entry))),
    [allDateRows],
  );
  const regularRows = useMemo(
    () => rows.filter(({ entry }) => !getSpecialLeaveType(entry)),
    [rows],
  );
  const groupedRows = useMemo(() => groupRows(regularRows), [regularRows]);
  const workingCount = regularRows.filter(({ entry }) => entry.isWorking).length;
  const currentDateLabel = formatInputDate(selectedDate);
  const rosterCoverageLabel = formatRosterCoverage(parsed);

  const processFile = async (file) => {
    setError("");
    setNotice("");
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload the OCC roster in PDF format.");
      return;
    }

    setProcessing(true);
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const parsedRoster = await parseRosterPdf(arrayBuffer, file.name, pdfjsLib);
      const saved = { ...await saveRoster({ file, parsed: parsedRoster, remark: uploadRemark }), parsed: ensureRosterNames(parsedRoster) };
      const nextRecords = sortRosterVersions([
        saved,
        ...recordsRef.current.filter((item) => item.versionKey !== saved.versionKey),
      ]);
      setRecords(nextRecords);
      recordsRef.current = nextRecords;
      setSelectedId(saved.versionKey);
      selectedIdRef.current = saved.versionKey;
      setUploadRemark("");
      setSyncStatus(saved.cloudSynced === false
        ? "New version saved locally · cloud sync unavailable"
        : `${nextRecords.length} saved version${nextRecords.length === 1 ? "" : "s"} · live sync ready`);
      setNotice(saved.cloudSynced === false
        ? `${parsedRoster.people.length} personnel detected. This version is currently saved only in this browser.`
        : `New roster version saved at the top with ${parsedRoster.people.length} personnel.`);
    } catch (fileError) {
      console.error("Roster PDF import failed:", fileError);
      setError(fileError.message || "Unable to read this roster PDF.");
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = (targetRecord) => {
    if (!targetRecord?.fileBlob) {
      setError("The original PDF is unavailable for this roster version.");
      return;
    }
    const url = URL.createObjectURL(targetRecord.fileBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = targetRecord.fileName || "OCC-Roster.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDeleteVersion = async (targetRecord) => {
    if (confirmDeleteId !== targetRecord.versionKey) {
      setConfirmDeleteId(targetRecord.versionKey);
      window.setTimeout(() => setConfirmDeleteId((current) => current === targetRecord.versionKey ? "" : current), 4000);
      return;
    }

    try {
      const result = await deleteSavedRoster(targetRecord);
      const nextRecords = recordsRef.current.filter((item) => item.versionKey !== targetRecord.versionKey);
      setRecords(nextRecords);
      recordsRef.current = nextRecords;
      if (selectedIdRef.current === targetRecord.versionKey) {
        const nextSelected = nextRecords[0]?.versionKey || "";
        setSelectedId(nextSelected);
        selectedIdRef.current = nextSelected;
      }
      setConfirmDeleteId("");
      setError("");
      setSyncStatus(nextRecords.length
        ? `${nextRecords.length} saved version${nextRecords.length === 1 ? "" : "s"} · live sync ready`
        : "Live storage ready · no roster uploaded");
      setNotice(result.cloudDeleted ? "Roster version deleted from shared history." : "Roster version deleted from this browser.");
      if (!result.cloudDeleted && result.error) setError(result.error);
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this roster version.");
    }
  };

  const startRemarkEdit = (targetRecord) => {
    setEditingRemarkId(targetRecord.versionKey);
    setEditingRemark(targetRecord.remark || "");
  };

  const saveRemarkEdit = async (targetRecord) => {
    try {
      const updated = await updateRosterRemark(targetRecord, editingRemark);
      const nextRecords = sortRosterVersions(recordsRef.current.map((item) => (
        item.versionKey === targetRecord.versionKey ? { ...updated, parsed: ensureRosterNames(updated.parsed) } : item
      )));
      setRecords(nextRecords);
      recordsRef.current = nextRecords;
      setEditingRemarkId("");
      setEditingRemark("");
      setNotice(updated.cloudSynced === false ? "Remark saved locally." : "Remark saved to the shared roster version.");
      if (updated.cloudSynced === false && updated.syncError) setError(updated.syncError);
    } catch (remarkError) {
      setError(remarkError.message || "Unable to save the roster remark.");
    }
  };


  if (loading) {
    return (
      <div className="theme-roster-loading flex min-h-[280px] items-center justify-center rounded-2xl border border-[#294b63] bg-[#071827]">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8fb0c7]"><LoaderCircle className="h-4 w-4 animate-spin" /> Restoring roster history…</div>
      </div>
    );
  }

  return (
    <div className="theme-roster-page space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => processFile(event.target.files?.[0])}
      />

      <div className="grid items-start gap-4 xl:w-max xl:min-w-full xl:grid-cols-[1080px_max-content]">
      <section className="theme-roster-shell min-w-0 overflow-hidden rounded-2xl border border-[#294b63] bg-[#071827] shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
        <div className="theme-roster-topbar flex flex-wrap items-center justify-between gap-4 border-b border-[#1a3b52] bg-[linear-gradient(135deg,#0b2a43_0%,#071827_70%)] px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="theme-roster-title-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/10 text-sky-100">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-extrabold text-white">Controller Roster</h2>
                <span className="theme-roster-live-badge inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200">
                  <Database className="h-2.5 w-2.5" /> Live D1
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#7898ad]">Upload and manage roster versions above. The selected roster output is shown below.</p>
            </div>
          </div>
          <div className="theme-roster-sync-badge flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-[9px] font-semibold text-emerald-100">
            <ShieldCheck className="h-4 w-4" /> {syncStatus}
          </div>
        </div>

        {error ? (
          <div className="theme-roster-alert is-error mx-4 mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[10px] text-rose-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div className="theme-roster-alert is-notice mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-[10px] text-emerald-100">
            <Check className="h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 p-3.5">
          <aside className="grid items-stretch gap-2.5 lg:w-fit lg:max-w-full lg:grid-cols-[300px_270px]">
            <section className="theme-roster-upload-panel h-full rounded-xl border border-[#294b63] bg-[#081b2a] p-2.5">
              <div className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-sky-200" />
                <h3 className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-white">Upload New Version</h3>
              </div>
              <div className="mt-2 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block min-w-0">
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-[#8eb0c5]">Remark shown as pill</span>
                  <input
                    value={uploadRemark}
                    onChange={(event) => setUploadRemark(event.target.value)}
                    placeholder="Example: Revised June roster"
                    maxLength={80}
                    className="h-9 w-full min-w-0 rounded-lg border border-[#2b506a] bg-[#061522] px-2.5 text-[10px] text-white outline-none focus:border-sky-400/60 placeholder:text-[#456277]"
                  />
                </label>
                <ActionButton compact icon={Upload} primary onClick={() => fileInputRef.current?.click()} disabled={processing}>
                  {processing ? "Reading…" : "Upload PDF"}
                </ActionButton>
              </div>
            </section>

            <section className="theme-roster-history-panel h-full min-w-0 overflow-hidden rounded-xl border border-[#294b63] bg-[#081b2a]">
              <header className="theme-roster-history-header flex items-center justify-between border-b border-[#1d4058] px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-sky-200" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-white">Saved Versions</h3>
                </div>
                <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-1.5 py-px text-[8px] font-black text-sky-100">{records.length}</span>
              </header>

              {!records.length ? (
                <div className="flex min-h-[96px] flex-col items-center justify-center px-3 py-4 text-center">
                  <FileText className="mx-auto h-5 w-5 text-[#52758d]" />
                  <div className="mt-2 text-[9px] font-bold text-[#bdd1de]">No roster version saved</div>
                  <div className="mt-0.5 text-[8px] text-[#58778c]">Use Upload New Version to add the first PDF.</div>
                </div>
              ) : (
                <div className="flex min-h-[96px] gap-2 overflow-x-auto p-2">
                  {records.map((item, index) => {
                    const selected = item.versionKey === record?.versionKey;
                    const editing = editingRemarkId === item.versionKey;
                    const confirming = confirmDeleteId === item.versionKey;
                    return (
                      <div
                        key={item.versionKey}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(item.versionKey)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(item.versionKey); }}
                        className={`theme-roster-version-card ${selected ? "is-selected" : ""} min-w-[245px] flex-[0_0_245px] cursor-pointer rounded-lg border p-2.5 transition duration-200 ${selected
                          ? "border-[#2f6659] bg-[radial-gradient(circle_at_10%_20%,rgba(50,218,151,0.13),transparent_50%),linear-gradient(145deg,rgba(11,40,43,0.94),rgba(6,23,39,0.98))] shadow-[0_0_0_1px_rgba(85,215,170,0.24),0_0_22px_rgba(38,199,129,0.18),0_12px_30px_rgba(0,0,0,0.22)]"
                          : "border-[#23465f] bg-[#091d2e] hover:border-[#37627e]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-extrabold text-white">{item.fileName}</div>
                            <div className="mt-0.5 text-[9px] text-[#6f8fa4]">Uploaded {dateTimeLabel(item.uploadedAt)}</div>
                          </div>
                          {index === 0 ? <span className="theme-roster-latest-pill shrink-0 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-1.5 py-px text-[8px] font-black uppercase tracking-wide text-emerald-100">Latest</span> : null}
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.remark ? (
                            <span className="theme-roster-remark-pill max-w-full truncate rounded-full border border-amber-300/35 bg-amber-400/10 px-1.5 py-px text-[9px] font-bold text-amber-100">{item.remark}</span>
                          ) : (
                            <span className="theme-roster-no-remark-pill rounded-full border border-slate-300/20 bg-slate-400/[0.06] px-1.5 py-px text-[9px] text-slate-300">No remark</span>
                          )}
                          <span className="theme-roster-personnel-pill rounded-full border border-[#315671] bg-[#0a253b] px-1.5 py-px text-[9px] text-[#9fb9ca]">{item.parsed?.people?.length || 0} personnel</span>
                        </div>

                        {editing ? (
                          <div className="theme-roster-remark-editor mt-2 rounded-lg border border-[#315671] bg-[#061522] p-2" onClick={(event) => event.stopPropagation()}>
                            <input
                              autoFocus
                              value={editingRemark}
                              onChange={(event) => setEditingRemark(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") saveRemarkEdit(item);
                                if (event.key === "Escape") setEditingRemarkId("");
                              }}
                              maxLength={80}
                              placeholder="Roster remark"
                              className="h-8 w-full rounded-lg border border-[#2b506a] bg-[#081b2a] px-2.5 text-[10px] text-white outline-none focus:border-sky-400/60"
                            />
                            <div className="mt-1.5 flex gap-1">
                              <MiniButton compact icon={Save} label="Save" onClick={() => saveRemarkEdit(item)} />
                              <MiniButton compact icon={X} label="Cancel" onClick={() => setEditingRemarkId("")} />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
                            <MiniButton compact icon={Download} label="Download" onClick={() => handleDownload(item)} />
                            <MiniButton compact icon={Pencil} label="Remark" onClick={() => startRemarkEdit(item)} />
                            <MiniButton compact icon={Trash2} label="Delete" danger confirm={confirming} onClick={() => handleDeleteVersion(item)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          <main className="theme-roster-main min-w-0 rounded-2xl border border-[#294b63] bg-[#071827] p-3">
            {!record ? <EmptyRoster onUpload={() => fileInputRef.current?.click()} /> : (
              <div className="space-y-3">
                <section className="theme-roster-filter-panel theme-roster-ext-card rounded-[16px] border border-[#2f6659] bg-[radial-gradient(circle_at_10%_20%,rgba(50,218,151,0.13),transparent_50%),linear-gradient(145deg,rgba(11,40,43,0.94),rgba(6,23,39,0.98))] p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
                  <div className="grid gap-2.5 md:grid-cols-[1fr_0.8fr_1.25fr]">
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.13em] text-[#afbed2]">Date</span>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className={`theme-roster-control theme-roster-ext-control is-date ${dateExists ? "is-valid" : "is-invalid"} h-9 w-full rounded-lg border bg-[#061a20] px-2.5 text-[11px] font-semibold text-white outline-none [color-scheme:dark] ${dateExists ? "border-[#376d60] focus:border-emerald-300/70" : "border-rose-400/70 focus:border-rose-300"}`}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.13em] text-[#afbed2]">Controller Type</span>
                      <select
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                        className="theme-roster-control theme-roster-ext-control h-9 w-full rounded-lg border border-[#376d60] bg-[#061a20] px-2.5 text-[11px] font-semibold text-white outline-none focus:border-emerald-300/70"
                      >
                        <option value="ALL">All Controllers</option>
                        {ROSTER_ROLE_ORDER.filter((item) => parsed.roles.includes(item)).map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.13em] text-[#afbed2]">Search Name / Duty</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#76d5ae]" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search controller…"
                          className="theme-roster-control theme-roster-ext-control h-9 w-full rounded-lg border border-[#376d60] bg-[#061a20] pl-8 pr-2.5 text-[11px] text-white outline-none focus:border-emerald-300/70 placeholder:text-[#5d7f76]"
                        />
                      </div>
                    </label>
                  </div>
                </section>

                {!selectedDateParts ? (
                  <div className="theme-roster-date-alert is-warning flex items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2.5 text-[10px] font-semibold text-amber-100">
                    <AlertCircle className="h-4 w-4 shrink-0" /> Enter a valid date to view the roster.
                  </div>
                ) : !dateExists ? (
                  <div className="theme-roster-date-alert is-error flex items-start gap-2 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2.5 text-rose-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="text-[12px] font-bold">{currentDateLabel} does not exist in this roster.</div>
                      <div className="mt-0.5 text-[11px] text-rose-200/75">This uploaded roster contains dates for {rosterCoverageLabel}. Enter another date or select a different roster version.</div>
                    </div>
                  </div>
                ) : null}

                <div className="theme-roster-result-header flex items-center gap-2.5 rounded-[16px] border border-[#294b63] bg-[linear-gradient(90deg,#0a253a,#071827)] px-3 py-2.5">
                  <div className="theme-roster-result-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-400/10 text-sky-200">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-extrabold text-white">{currentDateLabel}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#8eabbc]">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {workingCount} working</span>
                      <span className="theme-roster-meta-dot">•</span>
                      <span>{role === "ALL" ? "All controller types" : `${role} only`}</span>
                      {specialLeaveRows.length ? <><span className="theme-roster-meta-dot">•</span><span>{specialLeaveRows.length} TOIL/AL/RD</span></> : null}
                    </div>
                  </div>
                </div>

                {!dateExists ? (
                  <div className="theme-roster-empty-result is-error rounded-2xl border border-dashed border-rose-400/30 bg-rose-500/[0.04] px-5 py-10 text-center">
                    <CalendarDays className="mx-auto h-7 w-7 text-rose-300/70" />
                    <div className="mt-3 text-[11px] font-bold text-rose-100">Date not available in this roster</div>
                    <div className="mt-1 text-[9px] text-rose-200/65">Enter a date included in {rosterCoverageLabel} or select another roster version.</div>
                  </div>
                ) : (groupedRows.length || specialLeaveRows.length) ? (
                  <div className="theme-roster-daily-board space-y-3 rounded-[22px] border p-3">
                    {groupedRows.map((group) => <ShiftGroup key={group.shiftKey} {...group} day={selectedDateRef} />)}
                    {specialLeaveRows.length ? <SpecialLeaveTable rows={specialLeaveRows} day={selectedDateRef} /> : null}
                  </div>
                ) : (
                  <div className="theme-roster-empty-result rounded-2xl border border-dashed border-[#315671] bg-[#081b2a] px-5 py-10 text-center">
                    <Users className="mx-auto h-7 w-7 text-[#52758d]" />
                    <div className="mt-3 text-[11px] font-bold text-[#bdd1de]">No matching controller found</div>
                    <div className="mt-1 text-[9px] text-[#58778c]">Change the controller type or search.</div>
                  </div>
                )}

              </div>
            )}
          </main>
        </div>
      </section>
      <div className="xl:sticky xl:top-3">
        <StaffSchedulePanel parsed={parsed} rosterKey={record?.versionKey || ""} />
      </div>
      </div>
    </div>
  );
}
