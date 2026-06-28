import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ClipboardCopy,
  Database,
  Download,
  FileText,
  History,
  LoaderCircle,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Users,
} from "lucide-react";
import {
  ROSTER_ROLE_ORDER,
  ensureRosterNames,
  formatRosterDate,
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

const PDFJS_VERSION = "3.11.174";
const PDFJS_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

let pdfJsPromise = null;

function loadPdfJs() {
  if (window.pdfjsLib?.getDocument) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-railog-pdfjs="${PDFJS_VERSION}"]`);
    const finish = () => {
      if (!window.pdfjsLib?.getDocument) {
        reject(new Error("The PDF reader could not be loaded. Check the internet connection and try again."));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load the PDF reader.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PDFJS_SCRIPT;
    script.async = true;
    script.dataset.railogPdfjs = PDFJS_VERSION;
    script.onload = finish;
    script.onerror = () => reject(new Error("Unable to load the PDF reader."));
    document.head.appendChild(script);
  });

  return pdfJsPromise;
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
    border: "border-slate-400/25",
    badge: "border-slate-300/30 bg-slate-400/10 text-slate-100",
    dot: "bg-slate-300",
  },
  rest: {
    label: "Rest / Leave",
    border: "border-rose-400/20",
    badge: "border-rose-300/25 bg-rose-400/10 text-rose-100",
    dot: "bg-rose-300",
  },
};

function ActionButton({ children, icon: Icon, onClick, disabled = false, primary = false, danger = false, title }) {
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
      className={`theme-roster-action-btn ${primary ? "is-primary" : ""} ${danger ? "is-danger" : ""} inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
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

  return (
    <span
      title={time ? `${controllerName} · ${time}` : controllerName}
      className={`theme-roster-role-badge theme-roster-name-pill is-${String(role).toLowerCase()} inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${roleBadgeClass(role)}`}
    >
      <span className="truncate">{controllerName}</span>
    </span>
  );
}

function ShiftGroup({ shiftKey, rows, day }) {
  const style = SHIFT_STYLES[shiftKey] || SHIFT_STYLES.other;
  const label = shiftKey === "extension" && rows.length === 1 ? rows[0].entry.shiftLabel : style.label;
  const timeLabels = [...new Set(rows.map(({ entry }) => (
    entry.timeStart && entry.timeEnd
      ? `${entry.timeStart}–${entry.timeEnd}`
      : entry.dutyCode || entry.shiftLabel || ""
  )).filter(Boolean))];

  return (
    <section className={`theme-roster-shift-group theme-roster-horizontal-shift is-${shiftKey} overflow-hidden rounded-2xl border bg-[#071827] ${style.border}`}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[820px] grid-cols-[130px_repeat(6,minmax(115px,1fr))]">
          <div className="theme-roster-horizontal-shift-cell flex min-h-[112px] flex-col justify-center border-r border-white/10 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${style.dot}`} />
              <h4 className="theme-roster-horizontal-shift-title text-[13px] font-black uppercase tracking-[0.1em] text-white">{label}</h4>
            </div>
            <div className="theme-roster-time-label mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#7897aa]">Working time</div>
            <div className="theme-roster-horizontal-times mt-2 flex flex-col gap-1.5 text-[11px] font-semibold tabular-nums text-[#9bb7c9]">
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
              <div key={role} className="theme-roster-horizontal-role-cell min-w-0 border-r border-white/10 px-3 py-3 last:border-r-0">
                <div className={`theme-roster-role-badge is-${role.toLowerCase()} mb-2 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black tracking-wide ${roleBadgeClass(role)}`}>
                  {role}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {roleRows.length
                    ? roleRows.map(({ person, entry }) => (
                      <HorizontalPersonPill key={`${person.id}-${day}-${entry.dutyCode || entry.shiftKey}`} person={person} entry={entry} day={day} />
                    ))
                    : <span className="theme-roster-horizontal-empty text-[11px] text-[#55758b]">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SpecialLeaveTable({ rows, day }) {
  const leaveGroups = ["TOIL", "AL", "RD"]
    .map((leaveType) => ({
      leaveType,
      rows: rows.filter(({ entry }) => getSpecialLeaveType(entry) === leaveType),
    }))
    .filter((group) => group.rows.length);

  if (!leaveGroups.length) return null;

  return (
    <section className="theme-roster-leave-table overflow-hidden rounded-2xl border border-rose-400/25 bg-[#071827]">
      <div className="theme-roster-leave-table-header flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-[13px] font-black uppercase tracking-[0.12em] text-white">TOIL / AL / RD</div>
          <div className="mt-1 text-[10px] text-[#7897aa]">Personnel on time off in lieu, annual leave, or rest day</div>
        </div>
        <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2.5 py-0.5 text-[11px] font-black text-rose-100">{rows.length}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="theme-roster-leave-grid grid grid-cols-[130px_repeat(6,minmax(115px,1fr))] border-b border-white/10">
            <div className="theme-roster-leave-heading border-r border-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#8ba4b7]">Leave</div>
            {HORIZONTAL_ROLE_ORDER.map((role) => (
              <div key={role} className="theme-roster-leave-heading border-r border-white/10 px-3 py-2.5 last:border-r-0">
                <span className={`theme-roster-role-badge is-${role.toLowerCase()} inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black tracking-wide ${roleBadgeClass(role)}`}>{role}</span>
              </div>
            ))}
          </div>

          {leaveGroups.map(({ leaveType, rows: leaveRows }) => (
            <div key={leaveType} className="theme-roster-leave-grid grid grid-cols-[130px_repeat(6,minmax(115px,1fr))] border-b border-white/10 last:border-b-0">
              <div className={`theme-roster-leave-type is-${leaveType.toLowerCase()} flex min-h-[72px] items-center border-r border-white/10 px-4 py-3`}>
                <span className="rounded-full border px-3 py-1 text-[11px] font-black">{leaveType}</span>
              </div>
              {HORIZONTAL_ROLE_ORDER.map((role) => {
                const roleRows = leaveRows.filter(({ person }) => getRosterEntryRole(person, day) === role);
                return (
                  <div key={role} className="theme-roster-leave-cell min-w-0 border-r border-white/10 px-3 py-3 last:border-r-0">
                    <div className="flex flex-wrap gap-1.5">
                      {roleRows.length
                        ? roleRows.map(({ person, entry }) => (
                          <HorizontalPersonPill key={`${person.id}-${day}-${leaveType}-${entry.dutyCode || entry.raw}`} person={person} entry={entry} day={day} />
                        ))
                        : <span className="theme-roster-horizontal-empty text-[11px] text-[#55758b]">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function groupRows(rows) {
  const order = ["early", "late", "night", "extension", "training", "other", "rest"];
  return order
    .map((shiftKey) => ({ shiftKey, rows: rows.filter(({ entry }) => entry.shiftKey === shiftKey) }))
    .filter((group) => group.rows.length);
}

function buildCopyText(parsed, day, rows, specialLeaveRows = []) {
  const date = formatRosterDate(parsed, day);
  const normalRows = rows.filter(({ entry }) => !getSpecialLeaveType(entry));
  const groups = groupRows(normalRows);
  const lines = [`Controllers working on ${date}:`, ""];
  groups.forEach(({ shiftKey, rows: group }) => {
    const style = SHIFT_STYLES[shiftKey] || SHIFT_STYLES.other;
    const heading = shiftKey === "extension" && group.length === 1 ? group[0].entry.shiftLabel : style.label;
    lines.push(heading);
    group.forEach(({ person, entry }) => {
      const role = getRosterEntryRole(person, day);
      const time = entry.timeStart && entry.timeEnd ? ` (${entry.timeStart}–${entry.timeEnd})` : entry.dutyCode ? ` (${entry.dutyCode})` : "";
      lines.push(`- ${person.displayName} [${role}]${time}`);
    });
    lines.push("");
  });
  if (specialLeaveRows.length) {
    lines.push("TOIL / AL / RD");
    ["TOIL", "AL", "RD"].forEach((leaveType) => {
      const leaveRows = specialLeaveRows.filter(({ entry }) => getSpecialLeaveType(entry) === leaveType);
      if (!leaveRows.length) return;
      lines.push(leaveType);
      leaveRows.forEach(({ person }) => {
        const role = getRosterEntryRole(person, day);
        lines.push(`- ${person.displayName} [${role}]`);
      });
    });
    lines.push("");
  }

  lines.push(`Total working: ${normalRows.filter(({ entry }) => entry.isWorking).length} personnel.`);
  return lines.join("\n").trim();
}


function MiniButton({ icon: Icon, label, onClick, danger = false, confirm = false, disabled = false }) {
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
      className={`theme-roster-mini-btn ${danger ? "is-danger" : ""} ${confirm ? "is-confirm" : ""} inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${tone}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span>{confirm ? "Confirm" : label}</span>
    </button>
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
    if (!target?.versionKey || !target.fileBlob || parsedVersion >= 7) return undefined;
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
        setNotice("Roster updated to remove excluded personnel and stale shift times.");
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText(parsed, selectedDateRef, regularRows, specialLeaveRows));
      setNotice("Roster result copied.");
    } catch {
      setError("Unable to copy the roster result.");
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

      <section className="theme-roster-shell overflow-hidden rounded-2xl border border-[#294b63] bg-[#071827] shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
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
              <p className="mt-1 text-[10px] text-[#7898ad]">Upload and manage roster versions on the left. The selected roster output is shown on the right.</p>
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

        <div className="grid items-start gap-4 p-4 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-3">
            <section className="theme-roster-upload-panel rounded-2xl border border-[#294b63] bg-[#081b2a] p-3.5">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-sky-200" />
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-white">Upload New Version</h3>
                  <p className="mt-0.5 text-[10px] text-[#65859a]">Older versions remain saved below.</p>
                </div>
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.1em] text-[#8eb0c5]">Remark shown as pill</span>
                <input
                  value={uploadRemark}
                  onChange={(event) => setUploadRemark(event.target.value)}
                  placeholder="Example: Revised June roster"
                  maxLength={80}
                  className="h-10 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[11px] text-white outline-none focus:border-sky-400/60 placeholder:text-[#456277]"
                />
              </label>
              <ActionButton icon={Upload} primary onClick={() => fileInputRef.current?.click()} disabled={processing}>
                {processing ? "Reading PDF…" : "Upload Roster PDF"}
              </ActionButton>
            </section>

            <section className="theme-roster-history-panel overflow-hidden rounded-2xl border border-[#294b63] bg-[#081b2a]">
              <header className="theme-roster-history-header flex items-center justify-between border-b border-[#1d4058] px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-sky-200" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-white">Saved Versions</h3>
                </div>
                <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-2 py-0.5 text-[9px] font-black text-sky-100">{records.length}</span>
              </header>

              {!records.length ? (
                <div className="px-4 py-8 text-center">
                  <FileText className="mx-auto h-7 w-7 text-[#52758d]" />
                  <div className="mt-3 text-[10px] font-bold text-[#bdd1de]">No roster version saved</div>
                  <div className="mt-1 text-[8px] text-[#58778c]">Upload the first PDF above.</div>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-290px)] min-h-[180px] space-y-2 overflow-y-auto p-2.5">
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
                        className={`theme-roster-version-card ${selected ? "is-selected" : ""} cursor-pointer rounded-xl border p-3 transition duration-200 ${selected
                          ? "border-[#2f6659] bg-[radial-gradient(circle_at_10%_20%,rgba(50,218,151,0.13),transparent_50%),linear-gradient(145deg,rgba(11,40,43,0.94),rgba(6,23,39,0.98))] shadow-[0_0_0_1px_rgba(85,215,170,0.24),0_0_22px_rgba(38,199,129,0.18),0_12px_30px_rgba(0,0,0,0.22)]"
                          : "border-[#23465f] bg-[#091d2e] hover:border-[#37627e]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-extrabold text-white">{item.fileName}</div>
                            <div className="mt-1 text-[10px] text-[#6f8fa4]">Uploaded {dateTimeLabel(item.uploadedAt)}</div>
                          </div>
                          {index === 0 ? <span className="theme-roster-latest-pill shrink-0 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-100">Latest</span> : null}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.remark ? (
                            <span className="theme-roster-remark-pill max-w-full truncate rounded-full border border-amber-300/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-100">{item.remark}</span>
                          ) : (
                            <span className="theme-roster-no-remark-pill rounded-full border border-slate-300/20 bg-slate-400/[0.06] px-2 py-0.5 text-[10px] text-slate-300">No remark</span>
                          )}
                          <span className="theme-roster-personnel-pill rounded-full border border-[#315671] bg-[#0a253b] px-2 py-0.5 text-[10px] text-[#9fb9ca]">{item.parsed?.people?.length || 0} personnel</span>
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
                            <div className="mt-2 flex gap-1.5">
                              <MiniButton icon={Save} label="Save" onClick={() => saveRemarkEdit(item)} />
                              <MiniButton icon={X} label="Cancel" onClick={() => setEditingRemarkId("")} />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
                            <MiniButton icon={Download} label="Download" onClick={() => handleDownload(item)} />
                            <MiniButton icon={Pencil} label="Remark" onClick={() => startRemarkEdit(item)} />
                            <MiniButton icon={Trash2} label="Delete" danger confirm={confirming} onClick={() => handleDeleteVersion(item)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          <main className="theme-roster-main min-w-0 rounded-2xl border border-[#294b63] bg-[#071827] p-3.5">
            {!record ? <EmptyRoster onUpload={() => fileInputRef.current?.click()} /> : (
              <div className="space-y-4">
                <div className="theme-roster-selected-file flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#23465f] bg-[#091d2e] px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="theme-roster-file-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#315671] bg-[#0b2940] text-[#bfe3fa]">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="truncate text-[11px] font-bold text-white">{record.fileName}</div>
                        {record.remark ? <span className="theme-roster-remark-pill max-w-[280px] truncate rounded-full border border-amber-300/35 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-100">{record.remark}</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#648399]">
                        <span>{bytesToLabel(record.size)}</span>
                        <span>{record.parsed?.people?.length || 0} personnel</span>
                        <span>{record.parsed?.days?.length || 0} days</span>
                        <span>Uploaded {dateTimeLabel(record.uploadedAt)}</span>
                        <span>{record.cloudSynced === false ? "Local cache" : "Cloud synced"}</span>
                      </div>
                    </div>
                  </div>
                  <ActionButton icon={Download} onClick={() => handleDownload(record)}>Download Selected</ActionButton>
                </div>

                <section className="theme-roster-filter-panel rounded-2xl border border-[#294b63] bg-[#081b2a] p-3.5">
                  <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_1.25fr]">
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[#8eb0c5]">Date</span>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className={`theme-roster-control is-date ${dateExists ? "is-valid" : "is-invalid"} h-11 w-full rounded-xl border bg-[#061522] px-3 text-[12px] font-semibold text-white outline-none [color-scheme:dark] ${dateExists ? "border-[#2b506a] focus:border-sky-400/60" : "border-rose-400/70 focus:border-rose-300"}`}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[#8eb0c5]">Controller Type</span>
                      <select
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                        className="theme-roster-control h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[12px] font-semibold text-white outline-none focus:border-sky-400/60"
                      >
                        <option value="ALL">All Controllers</option>
                        {ROSTER_ROLE_ORDER.filter((item) => parsed.roles.includes(item)).map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[#8eb0c5]">Search Name / Duty</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#55778d]" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search controller…"
                          className="theme-roster-control h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] pl-9 pr-3 text-[12px] text-white outline-none focus:border-sky-400/60 placeholder:text-[#456277]"
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

                <div className="theme-roster-result-header flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#294b63] bg-[linear-gradient(90deg,#0a253a,#071827)] px-3.5 py-3">
                  <div>
                    <div className="text-[14px] font-extrabold text-white">{currentDateLabel}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#8eabbc]">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {workingCount} working</span>
                      <span>·</span>
                      <span>{role === "ALL" ? "All controller types" : `${role} only`}</span>
                      {specialLeaveRows.length ? <><span>·</span><span>{specialLeaveRows.length} TOIL/AL/RD</span></> : null}
                    </div>
                  </div>
                  <ActionButton icon={ClipboardCopy} onClick={handleCopy} disabled={!dateExists || (!regularRows.length && !specialLeaveRows.length)}>Copy Result</ActionButton>
                </div>

                {!dateExists ? (
                  <div className="theme-roster-empty-result is-error rounded-2xl border border-dashed border-rose-400/30 bg-rose-500/[0.04] px-5 py-10 text-center">
                    <CalendarDays className="mx-auto h-7 w-7 text-rose-300/70" />
                    <div className="mt-3 text-[11px] font-bold text-rose-100">Date not available in this roster</div>
                    <div className="mt-1 text-[9px] text-rose-200/65">Enter a date included in {rosterCoverageLabel} or select another roster version.</div>
                  </div>
                ) : (groupedRows.length || specialLeaveRows.length) ? (
                  <div className="space-y-3">
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
    </div>
  );
}
