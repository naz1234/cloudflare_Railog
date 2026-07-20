import { useState, useEffect, useMemo, useRef } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error Vite resolves this worker module to a public asset URL.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  ArrowUpDown,
  ChevronDown,
  ClipboardCheck,
  ClipboardCopy,
  ClipboardList,
  Copy,
  Filter,
  Gauge,
  MoreVertical,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";

const TRAINSETS = Array.from({ length: 47 }, (_, i) => `TS${String(i + 1).padStart(2, "0")}`);
const ODO_STORAGE_KEY = "odoReadingState_v1";
const CMMS_ROW_Y_TOLERANCE = 2.5;
const CMMS_DATE_PATTERN = /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s+(?:AM|PM))/g;
const CMMS_MONTHS = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function formatCmmsReportTimestamp(value = "") {
  const match = /^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(value.trim());
  if (!match) return "";

  const [, monthKey, dayText, yearText, hourText, minuteText, meridiemText] = match;
  const month = CMMS_MONTHS[monthKey.slice(0, 1).toUpperCase() + monthKey.slice(1, 3).toLowerCase()];
  if (!month) return "";

  let hour = Number(hourText);
  const meridiem = meridiemText.toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;

  return `${Number(dayText)} ${month} ${yearText.slice(-2)}, ${String(hour).padStart(2, "0")}:${minuteText} hrs.`;
}

function formatTrainsetList(trainsets = []) {
  if (!trainsets.length) return "None";
  if (trainsets.length === 1) return trainsets[0];
  if (trainsets.length === 2) return `${trainsets[0]} and ${trainsets[1]}`;
  return `${trainsets.slice(0, -1).join(", ")}, and ${trainsets.at(-1)}`;
}

function buildCmmsOutput(report) {
  if (!report) return "";
  return [
    "L3 Train CMMS Status:",
    `Report - ${report.reportTimestamp}`,
    "",
    `Operation: ${report.operationCount} trains`,
    "",
    `Maintenance: ${report.maintenanceCount} trains`,
    `Trainsets under Maintenance: ${formatTrainsetList(report.maintenanceTrainsets)}.`,
  ].join("\n");
}

function groupCmmsTextRows(items = []) {
  const rows = [];

  items.forEach((item) => {
    const text = String(item?.str || "").trim();
    if (!text) return;

    const x = Number(item?.transform?.[4] || 0);
    const y = Number(item?.transform?.[5] || 0);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= CMMS_ROW_Y_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, text });
  });

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => row.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "));
}

async function parseCmmsHandoverPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const documentTask = getDocument({ data: arrayBuffer });
  const pdf = await documentTask.promise;
  const records = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = groupCmmsTextRows(textContent.items);

    lines.forEach((line) => {
      const trainMatch = line.match(/\bT(\d{4})\b/i);
      const statusMatch = line.match(/\b(Operation|Maintenance)\s*$/i);
      if (!trainMatch || !statusMatch) return;

      const dateMatches = [...line.matchAll(CMMS_DATE_PATTERN)];
      const endDate = dateMatches.at(-1)?.[1] || "";
      const trainDigits = trainMatch[1];
      records.push({
        trainNumber: `T${trainDigits.slice(-2)}`,
        status: statusMatch[1].toLowerCase(),
        endDate,
      });
    });
  }

  const uniqueRecords = [...new Map(records.map((record) => [record.trainNumber, record])).values()]
    .sort((left, right) => Number(left.trainNumber.slice(1)) - Number(right.trainNumber.slice(1)));

  if (!uniqueRecords.length) {
    throw new Error("No CMMS train status rows were found in this PDF.");
  }

  const endDateCounts = new Map();
  uniqueRecords.forEach(({ endDate }) => {
    if (endDate) endDateCounts.set(endDate, (endDateCounts.get(endDate) || 0) + 1);
  });
  const commonEndDate = [...endDateCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
  const reportTimestamp = formatCmmsReportTimestamp(commonEndDate);
  if (!reportTimestamp) {
    throw new Error("The CMMS report date and time could not be read from this PDF.");
  }

  const maintenanceTrainsets = uniqueRecords
    .filter((record) => record.status === "maintenance")
    .map((record) => record.trainNumber);

  return {
    fileName: file.name,
    reportTimestamp,
    operationCount: uniqueRecords.filter((record) => record.status === "operation").length,
    maintenanceCount: maintenanceTrainsets.length,
    maintenanceTrainsets,
    totalCount: uniqueRecords.length,
  };
}

function getNow() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const day = String(now.getDate()).padStart(2, "0");
  const month = now.toLocaleString("en-GB", { month: "long" });
  const year = now.getFullYear();
  return { time, dateStr: `${day} ${month} ${year}` };
}

function createEmptyMileageMap() {
  return Object.fromEntries(TRAINSETS.map((ts) => [ts, ""]));
}

function createEmptyWorkshopMap() {
  return Object.fromEntries(TRAINSETS.map((ts) => [ts, false]));
}

function loadState() {
  try {
    const raw = localStorage.getItem(ODO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeWithTrainsets(savedMap, fallbackValue) {
  return Object.fromEntries(TRAINSETS.map((ts) => [ts, savedMap?.[ts] ?? fallbackValue]));
}

function filterTrainsets(trainsets, searchTerm, filterMode, mileages, workshops) {
  const q = searchTerm.trim().toLowerCase();

  return trainsets.filter((ts) => {
    const mileage = mileages[ts] || "";
    const isWorkshop = !!workshops[ts];
    const matchesSearch =
      !q ||
      ts.toLowerCase().includes(q) ||
      mileage.toLowerCase().includes(q) ||
      String(TRAINSETS.indexOf(ts) + 1).padStart(2, "0").includes(q);

    if (!matchesSearch) return false;
    if (filterMode === "workshop") return isWorkshop;
    if (filterMode === "active") return !isWorkshop;
    if (filterMode === "recorded") return !isWorkshop && mileage.trim() !== "";
    if (filterMode === "pending") return !isWorkshop && mileage.trim() === "";
    return true;
  });
}

function statusForTrainset(ts, mileages, workshops) {
  if (workshops[ts]) return { label: "WORKSHOP", className: "text-amber-300 bg-amber-500/10 border-amber-400/25" };
  if ((mileages[ts] || "").trim()) return { label: "RECORDED", className: "text-emerald-300 bg-emerald-500/10 border-emerald-400/25" };
  return { label: "PENDING", className: "text-slate-400 bg-slate-500/10 border-slate-400/15" };
}

function FilterSelect({ value, onChange }) {
  return (
    <div className="relative w-full sm:w-60">
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-200" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-slate-600/80 bg-[#0b1d2d] pl-9 pr-9 text-xs font-bold text-slate-100 shadow-inner shadow-black/20 outline-none transition focus:border-indigo-400"
      >
        <option value="all">All Work Shops</option>
        <option value="active">Active Trainsets</option>
        <option value="workshop">Workshop Only</option>
        <option value="recorded">Recorded Mileage</option>
        <option value="pending">Pending Mileage</option>
      </select>
      <div className="pointer-events-none absolute right-0 top-1/2 h-6 w-10 -translate-y-1/2 border-l border-slate-700/80">
        <ChevronDown className="mx-auto mt-1 h-4 w-4 text-slate-300" />
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-600/80 bg-[#0b1d2d] pl-9 pr-3 text-xs font-medium text-slate-100 shadow-inner shadow-black/20 outline-none transition placeholder:text-slate-500 focus:border-indigo-400"
      />
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-400/60 bg-indigo-500/10 shadow-lg shadow-indigo-500/10">
        <Icon className="h-4 w-4 text-indigo-300" />
      </div>
      <div>
        <h2 className="text-lg font-black uppercase tracking-wide text-white md:text-[20px]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function OdoReading() {
  const saved = loadState();
  const [mileages, setMileages] = useState(() => mergeWithTrainsets(saved?.mileages, ""));
  const [workshops, setWorkshops] = useState(() => mergeWithTrainsets(saved?.workshops, false));
  const [now, setNow] = useState(getNow());
  const [copied, setCopied] = useState(false);
  const [inputSearch, setInputSearch] = useState("");
  const [outputSearch, setOutputSearch] = useState("");
  const [inputFilter, setInputFilter] = useState("all");
  const [outputFilter, setOutputFilter] = useState("all");
  const [cmmsReport, setCmmsReport] = useState(null);
  const [cmmsError, setCmmsError] = useState("");
  const [cmmsReading, setCmmsReading] = useState(false);
  const [cmmsCopied, setCmmsCopied] = useState(false);
  const inputRefs = useRef([]);
  const cmmsFileInputRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(getNow()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ODO_STORAGE_KEY, JSON.stringify({ mileages, workshops }));
    } catch {}
  }, [mileages, workshops]);

  const findNextEditableRow = (currentIndex, direction, nextMileages = mileages) => {
    let next = currentIndex + direction;

    while (next >= 0 && next < TRAINSETS.length) {
      const targetTs = TRAINSETS[next];
      const alreadyFilled = (nextMileages[targetTs] || "").length >= 6;

      if (!workshops[targetTs] && !alreadyFilled) {
        return next;
      }

      next += direction;
    }

    return -1;
  };

  const focusInputByIndex = (index) => {
    const el = inputRefs.current[index];

    if (el) {
      el.focus();
      el.select();
      el.scrollIntoView({ block: "nearest" });
    }
  };

  const smartMoveAfterSixDigits = (currentIndex, nextMileages) => {
    const rowBelow = findNextEditableRow(currentIndex, 1, nextMileages);
    const rowAbove = findNextEditableRow(currentIndex, -1, nextMileages);
    const targetIndex = rowBelow !== -1 ? rowBelow : rowAbove;

    if (targetIndex !== -1) {
      window.setTimeout(() => focusInputByIndex(targetIndex), 0);
    }
  };

  const handleMileageChange = (ts, val, index) => {
    const cleanValue = val.replace(/\D/g, "").slice(0, 6);

    setMileages((prev) => {
      const previousValue = prev[ts] || "";
      const nextMileages = { ...prev, [ts]: cleanValue };

      if (cleanValue.length === 6 && previousValue.length < 6) {
        smartMoveAfterSixDigits(index, nextMileages);
      }

      return nextMileages;
    });
  };

  const handleWorkshopToggle = (ts) => setWorkshops((prev) => ({ ...prev, [ts]: !prev[ts] }));

  const handleClearAll = () => {
    setMileages(createEmptyMileageMap());
    setWorkshops(createEmptyWorkshopMap());
  };

  const moveFocus = (currentIndex, direction) => {
    let next = currentIndex + direction;
    while (next >= 0 && next < TRAINSETS.length) {
      const targetTs = TRAINSETS[next];
      if (!workshops[targetTs]) {
        focusInputByIndex(next);
        return;
      }
      next += direction;
    }
  };

  const handleKeyDown = (e, index, ts) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(index, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(index, -1);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      moveFocus(index, 1);
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      moveFocus(index, -1);
    } else if (e.key === "Backspace" && !(mileages[ts] || "")) {
      e.preventDefault();
      moveFocus(index, -1);
    }
  };

  const { time: displayTime, dateStr: displayDate } = now;
  const nonWorkshopCount = TRAINSETS.filter((ts) => !workshops[ts]).length;
  const recordedCount = TRAINSETS.filter((ts) => !workshops[ts] && (mileages[ts] || "").trim()).length;

  const inputRows = useMemo(
    () => filterTrainsets(TRAINSETS, inputSearch, inputFilter, mileages, workshops),
    [inputSearch, inputFilter, mileages, workshops]
  );

  const outputRows = useMemo(
    () => filterTrainsets(TRAINSETS, outputSearch, outputFilter, mileages, workshops),
    [outputSearch, outputFilter, mileages, workshops]
  );

  const buildCopyText = () => {
    const header1 = `Trainset\t\tFinish ODO Reading at ${displayTime} Hrs (${displayDate})`;
    const rows = TRAINSETS.map((ts) => {
      const val = workshops[ts] ? "WORKSHOP" : mileages[ts] || "";
      return `${ts}\t:\t${val}`;
    });
    return [header1, "", ...rows].join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildCopyText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCmmsUpload = async (file) => {
    if (!file) return;
    setCmmsError("");
    setCmmsReading(true);

    try {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Please upload the CMMS handover report in PDF format.");
      }
      setCmmsReport(await parseCmmsHandoverPdf(file));
    } catch (error) {
      console.error("CMMS handover PDF import failed:", error);
      setCmmsReport(null);
      setCmmsError(error.message || "Unable to read this CMMS handover PDF.");
    } finally {
      setCmmsReading(false);
      if (cmmsFileInputRef.current) cmmsFileInputRef.current.value = "";
    }
  };

  const handleCmmsCopy = () => {
    if (!cmmsReport) return;
    navigator.clipboard.writeText(buildCmmsOutput(cmmsReport));
    setCmmsCopied(true);
    setTimeout(() => setCmmsCopied(false), 2000);
  };

  return (
    <div className="w-full min-w-0 text-slate-100">
      <div className="grid w-fit max-w-full grid-cols-[minmax(400px,500px)_minmax(350px,460px)_minmax(340px,420px)] items-start gap-1.5 overflow-x-auto">
        {/* LEFT: ODO INPUT */}
        <section className="min-w-0 rounded-2xl border border-slate-700/80 bg-[#061423]/95 p-2 shadow-2xl shadow-black/30 md:p-3">
          <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle icon={Gauge} title="ODO Input" />

            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-600/80 bg-white/[0.03] px-3 text-xs font-bold text-slate-300 transition-all hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          </div>

          <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <SearchBox value={inputSearch} onChange={setInputSearch} placeholder="Search trainset..." />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <FilterSelect value={inputFilter} onChange={setInputFilter} />
              <button
                type="button"
                className="flex h-9 w-full items-center justify-center rounded-lg border border-slate-600/80 bg-[#0b1d2d] text-slate-300 transition hover:border-indigo-400/70 hover:bg-indigo-500/10 sm:w-10"
                aria-label="Table settings"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-700/80 bg-[#081827] shadow-inner shadow-black/20">
            <div className="overflow-x-auto">
              <div className="min-w-[400px]">
                <div className="grid border-b border-slate-700/70 bg-gradient-to-r from-[#13263a] to-[#0b1d2d] text-[10px] font-bold uppercase tracking-wide text-slate-300" style={{ gridTemplateColumns: "42px 76px 168px 72px 24px" }}>
                  <div className="px-1.5 py-1.5">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-800/90 text-[11px] text-white">#</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                    Trainset <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                    Mileage <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="flex items-center justify-center gap-1.5 px-1.5 py-1.5">
                    Workshop <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="px-1.5 py-1.5" />
                </div>

                <div className="overflow-visible">
                  {inputRows.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm font-semibold text-slate-500">No trainsets found.</div>
                  ) : (
                    inputRows.map((ts) => {
                      const originalIndex = TRAINSETS.indexOf(ts);
                      const isWorkshop = workshops[ts];

                      return (
                        <div
                          key={ts}
                          className={`grid min-h-[30px] items-center border-b border-slate-700/60 transition-colors last:border-b-0 hover:bg-white/[0.04] ${
                            isWorkshop ? "bg-amber-500/[0.06]" : originalIndex % 2 === 0 ? "bg-[#071827]" : "bg-[#0b1c2c]"
                          }`}
                          style={{ gridTemplateColumns: "42px 76px 168px 72px 24px" }}
                        >
                          <div className="px-1.5">
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-indigo-400/20 bg-indigo-500/25 text-[10px] font-semibold text-indigo-100 shadow-sm shadow-indigo-500/10">
                              {String(originalIndex + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="px-1.5 text-[12px] font-medium text-slate-100">{ts}</div>
                          <div className="px-1.5">
                            <div className="flex h-7 overflow-hidden rounded-md border border-slate-600/70 bg-[#0b1b2a] shadow-inner shadow-black/20 focus-within:border-indigo-400/80">
                              <input
                                ref={(el) => {
                                  inputRefs.current[originalIndex] = el;
                                }}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={mileages[ts]}
                                onChange={(e) => handleMileageChange(ts, e.target.value, originalIndex)}
                                onKeyDown={(e) => handleKeyDown(e, originalIndex, ts)}
                                disabled={isWorkshop}
                                placeholder={isWorkshop ? "WORKSHOP" : "e.g. 205246"}
                                className="w-full bg-transparent px-1.5 text-[11px] font-medium text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:text-amber-300"
                              />
                            </div>
                          </div>
                          <div className="flex justify-center px-2">
                            <input
                              type="checkbox"
                              checked={isWorkshop}
                              onChange={() => handleWorkshopToggle(ts)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border border-slate-400 bg-transparent accent-indigo-500"
                            />
                          </div>
                          <div className="flex justify-center px-2 text-slate-400">
                            <MoreVertical className="h-3 w-3" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: ODO OUTPUT */}
        <section className="min-w-0 rounded-2xl border border-slate-700/80 bg-[#061423]/95 p-2 shadow-2xl shadow-black/30 md:p-3">
          <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle icon={ClipboardList} title="ODO Output" subtitle={`${displayTime} Hrs • ${displayDate}`} />

            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition-all shadow-lg ${
                copied
                  ? "border border-emerald-400/50 bg-emerald-500/20 text-emerald-100 shadow-emerald-500/10"
                  : "border border-indigo-400/50 bg-indigo-500 text-white shadow-indigo-500/25 hover:bg-indigo-400"
              }`}
            >
              {copied ? <ClipboardCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Output"}
            </button>
          </div>

          <div className="mb-2 grid grid-cols-1 gap-2 xl:grid-cols-[1fr_auto] xl:items-center">
            <SearchBox value={outputSearch} onChange={setOutputSearch} placeholder="Search output..." />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
              <FilterSelect value={outputFilter} onChange={setOutputFilter} />
              <div className="rounded-lg border border-slate-600/70 bg-[#0b1d2d] px-3 py-2 text-xs font-bold text-slate-200">
                Commercial: <span className="text-indigo-300">{nonWorkshopCount}</span>
              </div>
            </div>
          </div>

          <div className="mb-2 rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2">
            <p className="text-xs font-bold text-slate-100">
              Finish ODO Reading at <span className="text-indigo-200">{displayTime} Hrs ({displayDate})</span>
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              Recorded mileage: {recordedCount} / {nonWorkshopCount} active trainsets
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-700/80 bg-[#081827] shadow-inner shadow-black/20">
            <div className="overflow-x-auto">
              <div className="min-w-[350px]">
                <div className="grid border-b border-slate-700/70 bg-gradient-to-r from-[#13263a] to-[#0b1d2d] text-[10px] font-bold uppercase tracking-wide text-slate-300" style={{ gridTemplateColumns: "42px 76px 112px 86px" }}>
                  <div className="px-1.5 py-1.5">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-800/90 text-[11px] text-white">#</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                    Trainset <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                    Mileage <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="flex items-center justify-center gap-1.5 px-1.5 py-1.5">
                    Status <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                <div className="overflow-visible">
                  {outputRows.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm font-semibold text-slate-500">No output rows found.</div>
                  ) : (
                    outputRows.map((ts) => {
                      const originalIndex = TRAINSETS.indexOf(ts);
                      const isWorkshop = workshops[ts];
                      const value = isWorkshop ? "WORKSHOP" : mileages[ts] || "";
                      const status = statusForTrainset(ts, mileages, workshops);

                      return (
                        <div
                          key={ts}
                          className={`grid min-h-[30px] items-center border-b border-slate-700/60 transition-colors last:border-b-0 hover:bg-white/[0.04] ${
                            isWorkshop ? "bg-amber-500/[0.06]" : originalIndex % 2 === 0 ? "bg-[#071827]" : "bg-[#0b1c2c]"
                          }`}
                          style={{ gridTemplateColumns: "42px 76px 112px 86px" }}
                        >
                          <div className="px-1.5">
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-indigo-400/20 bg-indigo-500/25 text-[10px] font-semibold text-indigo-100 shadow-sm shadow-indigo-500/10">
                              {String(originalIndex + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="px-1.5 text-[12px] font-medium text-slate-100">{ts}</div>
                          <div className="px-1.5 font-mono text-[11px] font-medium">
                            {value ? (
                              <span className={isWorkshop ? "text-amber-300" : "text-slate-100"}>{value}</span>
                            ) : (
                              <span className="italic text-slate-500">—</span>
                            )}
                          </div>
                          <div className="flex justify-center px-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* FAR RIGHT: CMMS OUTPUT */}
        <section className="min-w-0 rounded-2xl border border-slate-700/80 bg-[#061423]/95 p-2 shadow-2xl shadow-black/30 md:p-3">
          <input
            ref={cmmsFileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => handleCmmsUpload(event.target.files?.[0])}
          />

          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle
              icon={ClipboardCopy}
              title="CMMS Output"
              subtitle={cmmsReport ? cmmsReport.reportTimestamp : "Upload train handover PDF"}
            />

            <button
              type="button"
              onClick={() => cmmsFileInputRef.current?.click()}
              disabled={cmmsReading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 text-xs font-black text-cyan-100 shadow-lg shadow-cyan-500/10 transition-all hover:border-cyan-300/70 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className={`h-4 w-4 ${cmmsReading ? "animate-pulse" : ""}`} />
              {cmmsReading ? "Reading…" : cmmsReport ? "Replace PDF" : "Upload PDF"}
            </button>
          </div>

          {cmmsError ? (
            <div className="mb-3 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2.5 text-[11px] font-semibold leading-5 text-rose-100">
              {cmmsError}
            </div>
          ) : null}

          {!cmmsReport ? (
            <button
              type="button"
              onClick={() => cmmsFileInputRef.current?.click()}
              disabled={cmmsReading}
              className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-cyan-400/30 bg-cyan-500/[0.04] px-6 py-8 text-center transition hover:border-cyan-300/55 hover:bg-cyan-500/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
                <ClipboardCopy className="h-6 w-6" />
              </span>
              <span className="mt-4 text-sm font-black text-slate-100">Upload CMMS handover PDF</span>
              <span className="mt-1.5 max-w-[270px] text-[10px] font-medium leading-5 text-slate-400">
                Generates the report time, Operation and Maintenance totals, and the maintenance trainset list.
              </span>
            </button>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-2 py-2.5 text-center">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-sky-200/75">Total</div>
                  <div className="mt-1 text-xl font-black text-sky-100">{cmmsReport.totalCount}</div>
                </div>
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-2 py-2.5 text-center">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-emerald-200/75">Operation</div>
                  <div className="mt-1 text-xl font-black text-emerald-100">{cmmsReport.operationCount}</div>
                </div>
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-2 py-2.5 text-center">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-amber-200/75">Maintenance</div>
                  <div className="mt-1 text-xl font-black text-amber-100">{cmmsReport.maintenanceCount}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-cyan-400/25 bg-[#081827] shadow-inner shadow-black/20">
                <div className="flex items-center justify-between gap-2 border-b border-cyan-400/20 bg-cyan-500/[0.08] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">Generated CMMS Log</div>
                    <div className="mt-0.5 truncate text-[9px] text-slate-500">{cmmsReport.fileName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCmmsCopy}
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black transition-all ${cmmsCopied ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100" : "border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25"}`}
                  >
                    {cmmsCopied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {cmmsCopied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <div className="space-y-4 px-3 py-3 text-[12px] leading-5 text-slate-200">
                  <div>
                    <div className="font-black text-cyan-100">L3 Train CMMS Status:</div>
                    <div className="font-semibold italic text-slate-300">Report - {cmmsReport.reportTimestamp}</div>
                  </div>
                  <div>
                    <span className="font-bold text-emerald-200">Operation:</span> {cmmsReport.operationCount} trains
                  </div>
                  <div>
                    <div><span className="font-bold text-amber-200">Maintenance:</span> {cmmsReport.maintenanceCount} trains</div>
                    <div className="mt-1 text-slate-300">
                      <span className="font-semibold">Trainsets under Maintenance:</span> {formatTrainsetList(cmmsReport.maintenanceTrainsets)}.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
