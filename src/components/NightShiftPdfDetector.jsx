import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Download, FileText, FileUp, Loader2, Moon, RefreshCw, Trash2 } from "lucide-react";
import { GlobalWorkerOptions, getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error Vite resolves this worker module to a public asset URL.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { parseBinJaafarRoster, summarizeBinJaafarNightShifts } from "@/lib/nightShiftRoster";
import {
  deleteSavedNightShiftRoster,
  loadSavedNightShiftRoster,
  MAX_PERSISTED_PDF_SIZE,
  saveNightShiftRoster,
} from "@/lib/nightShiftRosterStorage";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_SIZE = MAX_PERSISTED_PDF_SIZE;

function formatFileSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPeriodLabel(year, monthIndex) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(monthIndex), 1));
}

function formatEntryDate(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

function getCoveredPeriodLabel(dates = []) {
  const periods = Array.from(new Set(dates.map((date) => String(date).slice(0, 7))));
  if (!periods.length) return "the detected month";
  return periods.map((period) => {
    const [year, month] = period.split("-").map(Number);
    return getPeriodLabel(year, month - 1);
  }).join(" and ");
}

async function extractPdfPages(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data });

  try {
    const document = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => {
        if (!("str" in item) || !String(item.str || "").trim()) return [];
        const transform = Util.transform(viewport.transform, item.transform);
        return [{
          str: String(item.str || "").trim(),
          x: Number(transform[4] || 0),
          y: Number(transform[5] || 0),
          width: Number(item.width || 0),
          height: Number(item.height || 0),
        }];
      }));
    }

    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

async function parseNightShiftPdf(file, fallbackYear) {
  const pages = await extractPdfPages(file);
  const parsed = parseBinJaafarRoster(pages, fallbackYear);
  if (!parsed.staffFound) {
    throw new Error("Staff ID 1000335 (Bin Jaafar) was not found in this roster.");
  }
  if (!parsed.dateHeadersFound) {
    throw new Error("Roster dates could not be detected in this PDF.");
  }
  return parsed;
}

export default function NightShiftPdfDetector({ selectedYear, selectedMonth, className = "" }) {
  const inputRef = useRef(null);
  const fallbackYearRef = useRef(selectedYear);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [parsedRoster, setParsedRoster] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [cloudStatus, setCloudStatus] = useState("loading");
  const [cloudMessage, setCloudMessage] = useState("");
  const periodLabel = useMemo(
    () => getPeriodLabel(selectedYear, selectedMonth),
    [selectedMonth, selectedYear]
  );
  const summary = useMemo(
    () => parsedRoster
      ? summarizeBinJaafarNightShifts(parsedRoster, selectedYear, selectedMonth)
      : null,
    [parsedRoster, selectedMonth, selectedYear]
  );
  const coveredPeriodLabel = useMemo(
    () => getCoveredPeriodLabel(parsedRoster?.coveredDates),
    [parsedRoster]
  );
  const isBusy = status === "loading"
    || status === "reading"
    || cloudStatus === "saving"
    || cloudStatus === "deleting";
  const cloudStatusLabel = cloudStatus === "loading"
    ? "Loading cloud"
    : cloudStatus === "saving"
      ? "Saving cloud"
      : cloudStatus === "deleting"
        ? "Deleting cloud"
        : cloudStatus === "error"
          ? "Cloud sync issue"
          : savedRecord
            ? "Saved across laptops"
            : "Cloud ready";

  const restoreFromCloud = useCallback(async () => {
    setStatus("loading");
    setCloudStatus("loading");
    setMessage("");
    setCloudMessage("");

    try {
      const record = await loadSavedNightShiftRoster();
      if (!record) {
        setUploadedFile(null);
        setParsedRoster(null);
        setSavedRecord(null);
        setStatus("idle");
        setCloudStatus("ready");
        return;
      }

      const parsed = record.parsed || await parseNightShiftPdf(record.file, fallbackYearRef.current);
      setUploadedFile(record.file);
      setParsedRoster(parsed);
      setSavedRecord({ ...record, parsed });
      setStatus("ready");
      setCloudStatus("ready");
    } catch (error) {
      setStatus("idle");
      setCloudStatus("error");
      setCloudMessage(error?.message || "Unable to load the saved PDF from shared storage.");
    }
  }, []);

  useEffect(() => {
    restoreFromCloud();
  }, [restoreFromCloud]);

  const handleFile = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setStatus("error");
      setMessage("Please select a PDF roster file.");
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      setStatus("error");
      setMessage(`The PDF is larger than ${formatFileSize(MAX_PDF_SIZE)}. Please upload a smaller roster file for shared cloud storage.`);
      return;
    }

    setUploadedFile(file);
    setParsedRoster(null);
    setSavedRecord(null);
    setStatus("reading");
    setMessage("");
    setCloudStatus("saving");
    setCloudMessage("");

    try {
      const parsed = await parseNightShiftPdf(file, selectedYear);
      setParsedRoster(parsed);
      setStatus("ready");

      try {
        const saved = await saveNightShiftRoster({ file, parsed });
        setUploadedFile(saved.file || file);
        setSavedRecord(saved);
        setCloudStatus("ready");
      } catch (saveError) {
        setCloudStatus("error");
        setCloudMessage(`${saveError?.message || "Cloud save failed."} The result is available only on this laptop until you retry.`);
      }
    } catch (error) {
      setParsedRoster(null);
      setStatus("error");
      setCloudStatus(savedRecord ? "ready" : "error");
      setMessage(error?.message || "This PDF could not be read. Please use the exported roster PDF.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = () => {
    if (!uploadedFile) return;
    const url = URL.createObjectURL(uploadedFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = uploadedFile.name || savedRecord?.fileName || "Night-Shift-Roster.pdf";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleRetryCloud = async () => {
    if (!uploadedFile || !parsedRoster) {
      await restoreFromCloud();
      return;
    }

    setCloudStatus("saving");
    setCloudMessage("");

    try {
      const saved = await saveNightShiftRoster({ file: uploadedFile, parsed: parsedRoster });
      setUploadedFile(saved.file || uploadedFile);
      setSavedRecord(saved);
      setCloudStatus("ready");
    } catch (error) {
      setSavedRecord(null);
      setCloudStatus("error");
      setCloudMessage(`${error?.message || "Cloud save failed."} The result is still available only on this laptop.`);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm("Delete this overtime roster PDF from shared cloud storage? Other laptops will stop loading it after refresh. This cannot be undone.");
    if (!confirmed) return;

    setCloudStatus("deleting");
    setCloudMessage("");

    try {
      await deleteSavedNightShiftRoster();
      setUploadedFile(null);
      setParsedRoster(null);
      setSavedRecord(null);
      setStatus("idle");
      setMessage("");
      setCloudStatus("ready");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setCloudStatus("error");
      setCloudMessage(error?.message || "Unable to delete the shared PDF.");
    }
  };

  return (
    <section className={`${className} min-w-0 overflow-hidden rounded-[24px] border border-[#315574] bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_100%_100%,rgba(99,102,241,0.10),transparent_32%),linear-gradient(145deg,rgba(9,30,50,0.99),rgba(5,20,35,0.99))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.30)] sm:p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-sky-400/35 bg-sky-500/10 text-sky-200 shadow-[0_8px_22px_rgba(14,165,233,0.14)]">
            <Moon className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#e7eef8]">Night Shift PDF Detector</p>
            <p className="mt-1 text-[11px] text-[#9fb1c8]">Reads staff ID 1000335 (Bin Jaafar) only. The PDF is saved for access on your other laptops.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-[10px] font-semibold text-sky-100">
            Selected: {periodLabel}
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-200">
            1000335 · Bin Jaafar
          </span>
          <button
            type="button"
            disabled={isBusy}
            onClick={restoreFromCloud}
            title="Refresh the saved PDF from shared cloud storage"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition disabled:cursor-wait disabled:opacity-70 ${cloudStatus === "error"
            ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
            : savedRecord
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/50"
              : "border-sky-400/25 bg-sky-500/10 text-sky-100 hover:border-sky-300/50"
          }`}>
            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cloud className="h-3 w-3" />}
            {cloudStatusLabel}
          </button>
          {parsedRoster?.dateAdjustmentMonths === 1 && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-200">
              Monthly roster → next month
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_.72fr_1.23fr]">
        <div className="rounded-2xl border border-[#2b506c] bg-[#0a2238]/88 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dce8f6]">Upload roster PDF</p>
              <p className="mt-1 text-[10px] text-[#8fa4bc]">Maximum {formatFileSize(MAX_PDF_SIZE)} · saved to shared cloud storage</p>
            </div>
            <FileText className="h-4 w-4 text-sky-300" />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={isBusy}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <button
            type="button"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
            className="mt-3 flex min-h-[72px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-400/40 bg-sky-500/[0.06] px-3 text-[12px] font-semibold text-sky-100 transition hover:border-sky-300/65 hover:bg-sky-500/10 disabled:cursor-wait disabled:opacity-60"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {status === "loading"
              ? "Loading saved PDF..."
              : status === "reading" || cloudStatus === "saving"
                ? "Reading and saving PDF..."
                : uploadedFile
                  ? "Upload another PDF"
                  : "Choose roster PDF"}
          </button>

          {uploadedFile && (
            <div className="mt-3 rounded-xl border border-[#294963] bg-[#081d30]/80 p-2.5">
              <p className="truncate text-[11px] font-semibold text-[#e5eef8]" title={uploadedFile.name}>{uploadedFile.name}</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-[#849bb5]">
                {formatFileSize(uploadedFile.size)} · {savedRecord ? "saved across laptops" : "local copy only"}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 text-[10px] font-semibold text-emerald-100 transition hover:border-emerald-300/55 hover:bg-emerald-500/15"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleReset}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/[0.06] px-3 text-[10px] font-semibold text-red-200 transition hover:border-red-300/50 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete cloud PDF
                </button>
              </div>
            </div>
          )}

          {cloudStatus === "error" && cloudMessage && (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5" role="status">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] leading-relaxed text-amber-100">{cloudMessage}</p>
                  <button
                    type="button"
                    onClick={handleRetryCloud}
                    className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-500/10 px-2.5 text-[9px] font-semibold text-amber-100 transition hover:border-amber-200/55 hover:bg-amber-500/15"
                  >
                    <RefreshCw className="h-3 w-3" /> {uploadedFile && parsedRoster ? "Retry cloud save" : "Retry cloud load"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#2b506c] bg-[#0a2238]/88 p-3.5" aria-live="polite">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dce8f6]">Selected month result</p>

          {status === "loading" && (
            <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
              <Loader2 className="h-6 w-6 animate-spin text-sky-300" />
              <p className="mt-2 text-[11px] text-[#a9bbcf]">Loading the saved PDF from shared storage...</p>
            </div>
          )}

          {status === "idle" && (
            <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
              <Moon className="h-6 w-6 text-[#58738f]" />
              <p className="mt-2 text-[11px] text-[#8fa4bc]">Upload a roster to calculate {periodLabel} and save it for your other laptops.</p>
            </div>
          )}

          {status === "reading" && (
            <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
              <Loader2 className="h-6 w-6 animate-spin text-sky-300" />
              <p className="mt-2 text-[11px] text-[#a9bbcf]">Detecting staff ID 1000335 shifts and preparing cloud storage...</p>
            </div>
          )}

          {status === "error" && (
            <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3" role="alert">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <p className="text-[11px] leading-relaxed text-red-100">{message}</p>
              </div>
            </div>
          )}

          {status === "ready" && summary && !summary.periodFound && (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3" role="status">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-[11px] leading-relaxed text-amber-100">
                  {parsedRoster?.dateAdjustmentMonths === 1
                    ? `This monthly roster is counted in ${coveredPeriodLabel}. Select that month to view the shifts.`
                    : `This roster does not contain ${periodLabel}.`}
                </p>
              </div>
            </div>
          )}

          {status === "ready" && summary?.periodFound && (
            <div className="mt-3">
              <div className="flex items-end justify-between gap-3 rounded-xl border border-sky-400/25 bg-sky-500/[0.07] p-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.13em] text-[#92a9c2]">Normal night shifts</p>
                  <p className="mt-1 text-[30px] font-semibold leading-none text-sky-200">{summary.nightShiftCount}</p>
                  <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#7f98b2]">N3-DC only · by shift start date</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-2.5">
                  <p className="text-[16px] font-semibold text-indigo-200">{summary.nightShiftCount}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.11em] text-[#9eaed0]">N3-DC · counted</p>
                </div>
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5">
                  <p className="text-[16px] font-semibold text-amber-200">{summary.rdotCount}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.11em] text-[#b6a98c]">NRDOT · separate</p>
                </div>
              </div>
              {summary.rdotCount > 0 && (
                <p className="mt-2 text-[9px] leading-relaxed text-[#8fa4bc]">
                  NRDOT is shown for reference and is not added to the night-shift count. All overnight duties: {summary.overnightDutyCount}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#2b506c] bg-[#0a2238]/88 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dce8f6]">Detected overnight dates</p>
            {summary?.periodFound && (
              <span className="rounded-full border border-[#34536d] bg-[#0b2942] px-2.5 py-1 text-[9px] font-semibold text-[#b9c9da]">
                {summary.nightShiftCount} N3-DC · {summary.rdotCount} NRDOT
              </span>
            )}
          </div>

          {status !== "ready" || !summary?.periodFound ? (
            <div className="flex min-h-[150px] items-center justify-center text-center">
              <p className="max-w-[260px] text-[11px] leading-relaxed text-[#7f95ad]">Dates for the selected month will appear here after detection.</p>
            </div>
          ) : summary.entries.length ? (
            <div className="mt-3 grid max-h-[170px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4 [scrollbar-color:#315574_transparent] [scrollbar-width:thin]">
              {summary.entries.map((entry) => (
                <div
                  key={`${entry.date}-${entry.code}`}
                  className={`rounded-xl border px-2.5 py-2 ${entry.code === "NRDOT"
                    ? "border-amber-400/30 bg-amber-500/10"
                    : "border-indigo-400/25 bg-indigo-500/10"
                  }`}
                >
                  <p className="text-[11px] font-semibold text-[#eef4fb]">{formatEntryDate(entry.date)}</p>
                  <p className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${entry.code === "NRDOT" ? "text-amber-200" : "text-indigo-200"}`}>
                    {entry.code}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-300" />
              <p className="mt-2 text-[11px] text-[#9fb2c8]">No night duties found for {periodLabel}.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
