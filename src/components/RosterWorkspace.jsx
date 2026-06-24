import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCopy,
  Database,
  Download,
  FileText,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  ROSTER_ROLE_ORDER,
  ensureRosterNames,
  formatRosterDate,
  getRosterEntryRole,
  parseRosterPdf,
  parseRosterQuestion,
  queryRoster,
} from "./roster/rosterParser";
import { deleteSavedRoster, loadSavedRoster, saveRoster } from "./roster/rosterStorage";

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
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3.5 text-[14px] font-bold transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

function EmptyRoster({ onUpload }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#315671] bg-[#081b2b] px-6 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-400/10 text-sky-200">
        <FileText className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-[16px] font-extrabold text-white">Upload the OCC roster PDF</h3>
      <p className="mx-auto mt-2 max-w-lg text-[11px] leading-5 text-[#8eabc0]">
        The original PDF and the detected controller schedule are saved in this browser, so they remain available after refresh.
      </p>
      <div className="mt-5 flex justify-center">
        <ActionButton icon={Upload} primary onClick={onUpload}>Upload Roster</ActionButton>
      </div>
      <p className="mt-3 text-[9px] text-[#58758b]">PDF format · original roster layout supported</p>
    </div>
  );
}

function ControllerRow({ person, entry, day }) {
  const role = getRosterEntryRole(person, day);
  const controllerName = person.displayName || person.rawName || person.name || "Controller name unavailable";
  const originalName = person.rawName && person.rawName !== controllerName
    ? person.rawName
    : person.rosterCode || "";
  const time = entry.timeStart && entry.timeEnd ? `${entry.timeStart}–${entry.timeEnd}` : entry.dutyCode || entry.raw;
  return (
    <div className="grid min-h-[66px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-white/5 bg-[#091d2d] px-4 py-3 transition-colors hover:border-[#315671] hover:bg-[#0b2235]">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="min-w-0 max-w-full truncate text-[15px] font-extrabold leading-5 text-white">{controllerName}</span>
          <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-black tracking-wide ${roleBadgeClass(role)}`}>{role}</span>
        </div>
        <div className="mt-1 truncate text-[12px] leading-4 text-[#7899ae]">{originalName}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[14px] font-bold tabular-nums text-[#e7f3fb]">{time || "—"}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-[#7897aa]">{entry.dutyCode || entry.shiftLabel}</div>
      </div>
    </div>
  );
}

function ShiftGroup({ shiftKey, rows, day }) {
  const style = SHIFT_STYLES[shiftKey] || SHIFT_STYLES.other;
  const label = shiftKey === "extension" && rows.length === 1 ? rows[0].entry.shiftLabel : style.label;
  return (
    <section className={`overflow-hidden rounded-2xl border bg-[#071827] ${style.border}`}>
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          <h4 className="text-[14px] font-black uppercase tracking-[0.13em] text-white">{label}</h4>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-black ${style.badge}`}>{rows.length}</span>
      </header>
      <div className="space-y-2.5 p-3">
        {rows.map(({ person, entry }) => <ControllerRow key={`${person.id}-${day}`} person={person} entry={entry} day={day} />)}
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

function buildCopyText(parsed, day, rows) {
  const date = formatRosterDate(parsed, day);
  const groups = groupRows(rows);
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
  lines.push(`Total: ${rows.filter(({ entry }) => entry.isWorking).length} personnel.`);
  return lines.join("\n").trim();
}

export default function RosterWorkspace() {
  const fileInputRef = useRef(null);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedDay, setSelectedDay] = useState(1);
  const [role, setRole] = useState("ALL");
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [includeRest, setIncludeRest] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = record?.parsed || null;

  useEffect(() => {
    let active = true;
    loadSavedRoster()
      .then((saved) => {
        if (!active || !saved) return;
        const repairedParsed = ensureRosterNames(saved.parsed);
        setRecord({ ...saved, parsed: repairedParsed });
        const now = new Date();
        const preferredDay = saved.parsed?.year === now.getFullYear() && saved.parsed?.month === now.getMonth() + 1
          ? now.getDate()
          : saved.parsed?.days?.[0] || 1;
        setSelectedDay(saved.parsed?.days?.includes(preferredDay) ? preferredDay : saved.parsed?.days?.[0] || 1);
      })
      .catch((storageError) => {
        if (active) setError(storageError.message || "Unable to restore the saved roster.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const rows = useMemo(() => queryRoster(parsed, {
    day: selectedDay,
    role,
    includeRest,
    search,
  }), [parsed, selectedDay, role, includeRest, search]);

  const groupedRows = useMemo(() => groupRows(rows), [rows]);
  const workingCount = rows.filter(({ entry }) => entry.isWorking).length;
  const currentDateLabel = parsed ? formatRosterDate(parsed, selectedDay) : "";

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
      await saveRoster({ file, parsed: parsedRoster });
      const saved = {
        id: "active",
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        size: file.size,
        updatedAt: new Date().toISOString(),
        fileBlob: file,
        parsed: parsedRoster,
      };
      setRecord(saved);
      const now = new Date();
      const preferredDay = parsedRoster.year === now.getFullYear() && parsedRoster.month === now.getMonth() + 1
        ? now.getDate()
        : parsedRoster.days[0];
      setSelectedDay(parsedRoster.days.includes(preferredDay) ? preferredDay : parsedRoster.days[0]);
      setRole("ALL");
      setSearch("");
      setQuestion("");
      setNotice(`${parsedRoster.people.length} roster personnel detected and saved.`);
    } catch (fileError) {
      console.error("Roster PDF import failed:", fileError);
      setError(fileError.message || "Unable to read this roster PDF.");
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = () => {
    if (!record?.fileBlob) return;
    const url = URL.createObjectURL(record.fileBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = record.fileName || "OCC-Roster.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    try {
      await deleteSavedRoster();
      setRecord(null);
      setConfirmDelete(false);
      setError("");
      setNotice("Roster removed from this browser.");
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete the saved roster.");
    }
  };

  const handleQuestion = () => {
    if (!parsed) return;
    const result = parseRosterQuestion(question, parsed);
    if (!result?.day) {
      setError("Include a date in the question, for example: Who is working on 2 June?");
      return;
    }
    if (result.month && result.month !== parsed.month) {
      setError(`The uploaded roster is for month ${parsed.month}, but the question requested month ${result.month}.`);
      return;
    }
    if (!parsed.days.includes(result.day)) {
      setError(`Day ${result.day} is not available in the uploaded roster.`);
      return;
    }
    setError("");
    setSelectedDay(result.day);
    setRole(result.role || "ALL");
    setSearch("");
    setNotice(`Showing ${result.role === "ALL" ? "all controllers" : result.role} for day ${result.day}.`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText(parsed, selectedDay, rows));
      setNotice("Roster result copied.");
    } catch {
      setError("Unable to copy the roster result.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-[#294b63] bg-[#071827]">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#8fb0c7]"><LoaderCircle className="h-4 w-4 animate-spin" /> Restoring roster…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => processFile(event.target.files?.[0])}
      />

      <section className="overflow-hidden rounded-2xl border border-[#294b63] bg-[#071827] shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1a3b52] bg-[linear-gradient(135deg,#0b2a43_0%,#071827_70%)] px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/10 text-sky-100">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-extrabold text-white">Controller Roster</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200">
                  <Database className="h-2.5 w-2.5" /> Persistent
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#7898ad]">Upload, retain, download, and query the monthly OCC roster.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={Upload} primary onClick={() => fileInputRef.current?.click()} disabled={processing}>
              {processing ? "Reading PDF…" : record ? "Replace Roster" : "Upload Roster"}
            </ActionButton>
            {record ? <ActionButton icon={Download} onClick={handleDownload}>Download Original</ActionButton> : null}
            {record ? (
              <ActionButton icon={Trash2} danger={confirmDelete} onClick={handleDelete}>
                {confirmDelete ? "Confirm Delete" : "Delete"}
              </ActionButton>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[10px] text-rose-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-[10px] text-emerald-100">
            <Check className="h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        <div className="p-4">
          {!record ? <EmptyRoster onUpload={() => fileInputRef.current?.click()} /> : (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="rounded-2xl border border-[#23465f] bg-[#091d2e] px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#315671] bg-[#0b2940] text-[#bfe3fa]">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-white">{record.fileName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#648399]">
                        <span>{bytesToLabel(record.size)}</span>
                        <span>{record.parsed?.people?.length || 0} personnel</span>
                        <span>{record.parsed?.days?.length || 0} days</span>
                        <span>Saved {dateTimeLabel(record.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3.5 py-3 text-[9px] font-semibold text-emerald-100">
                  <ShieldCheck className="h-4 w-4" /> Remains after refresh on this browser
                </div>
              </div>

              <section className="rounded-2xl border border-[#294b63] bg-[#081b2a] p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-200" />
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-white">Ask Roster</h3>
                    <p className="mt-0.5 text-[8px] text-[#65859a]">Example: Who is working on 2 June? · Show DC on 16 June</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#55778d]" />
                    <input
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") handleQuestion(); }}
                      placeholder="Who is working on 2 June?"
                      className="h-10 w-full rounded-xl border border-[#2b506a] bg-[#061522] pl-9 pr-3 text-[11px] text-white outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10 placeholder:text-[#456277]"
                    />
                  </div>
                  <ActionButton icon={ChevronRight} primary onClick={handleQuestion} disabled={!question.trim()}>Show Roster</ActionButton>
                </div>
              </section>

              <section className="rounded-2xl border border-[#294b63] bg-[#081b2a] p-3.5">
                <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_1.25fr_auto]">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-[#8eb0c5]">Date</span>
                    <select
                      value={selectedDay}
                      onChange={(event) => setSelectedDay(Number(event.target.value))}
                      className="h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[13px] font-semibold text-white outline-none focus:border-sky-400/60"
                    >
                      {parsed.days.map((day) => <option key={day} value={day}>{formatRosterDate(parsed, day)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-[#8eb0c5]">Controller Type</span>
                    <select
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[13px] font-semibold text-white outline-none focus:border-sky-400/60"
                    >
                      <option value="ALL">All Controllers</option>
                      {ROSTER_ROLE_ORDER.filter((item) => parsed.roles.includes(item)).map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-[#8eb0c5]">Search Name / Duty</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#55778d]" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search controller…"
                        className="h-11 w-full rounded-xl border border-[#2b506a] bg-[#061522] pl-9 pr-3 text-[13px] text-white outline-none focus:border-sky-400/60 placeholder:text-[#456277]"
                      />
                    </div>
                  </label>
                  <div className="flex items-end">
                    <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#2b506a] bg-[#061522] px-3 text-[12px] font-semibold text-[#c4d8e5]">
                      <input type="checkbox" checked={includeRest} onChange={(event) => setIncludeRest(event.target.checked)} className="accent-sky-500" />
                      Show rest/leave
                    </label>
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#294b63] bg-[linear-gradient(90deg,#0a253a,#071827)] px-3.5 py-3">
                <div>
                  <div className="text-[15px] font-extrabold text-white">{currentDateLabel}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#8eabbc]">
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {workingCount} working</span>
                    <span>·</span>
                    <span>{role === "ALL" ? "All controller types" : `${role} only`}</span>
                    {includeRest ? <><span>·</span><span>{rows.length - workingCount} rest/leave shown</span></> : null}
                  </div>
                </div>
                <ActionButton icon={ClipboardCopy} onClick={handleCopy} disabled={!rows.length}>Copy Result</ActionButton>
              </div>

              {groupedRows.length ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {groupedRows.map((group) => <ShiftGroup key={group.shiftKey} {...group} day={selectedDay} />)}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#315671] bg-[#081b2a] px-5 py-10 text-center">
                  <Users className="mx-auto h-7 w-7 text-[#52758d]" />
                  <div className="mt-3 text-[11px] font-bold text-[#bdd1de]">No matching controller found</div>
                  <div className="mt-1 text-[9px] text-[#58778c]">Change the date, role, search, or rest/leave filter.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
