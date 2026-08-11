import { Fragment, useCallback, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertCircle,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  CloudDownload,
  Clock3,
  Copy,
  FileArchive,
  FileSpreadsheet,
  Info,
  Loader2,
  MapPin,
  Search,
  TrainFront,
  Upload,
  X,
} from "lucide-react";
import { analyzeMaspoArchive } from "../../lib/maspoArchiveReader";
import { normalizeMaspoTrainQuery } from "../../lib/maspoTrainMovement";

const STATUS_STYLES = {
  Completed: "border-emerald-400/55 bg-emerald-500/15 text-emerald-200",
  Pending: "border-amber-400/55 bg-amber-500/15 text-amber-200",
  Cancelled: "border-red-400/55 bg-red-500/15 text-red-200",
  "Movement logged": "border-sky-400/55 bg-sky-500/15 text-sky-200",
  Recorded: "border-slate-400/55 bg-slate-500/15 text-slate-200",
};

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.Recorded;
}

function displaySourceName(path = "") {
  return String(path).split(/[\\/]/).filter(Boolean).at(-1) || "Excel workbook";
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export default function MaspoTrainMovementChecker() {
  const fileInputRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const trainInputRef = useRef(null);
  const analysisRequestRef = useRef(0);
  const [archiveFile, setArchiveFile] = useState(null);
  const [trainInput, setTrainInput] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedReference, setCopiedReference] = useState("");

  const selectFile = useCallback((file) => {
    if (!file) return;
    analysisRequestRef.current += 1;
    setArchiveFile(file);
    setAnalysis(null);
    setError("");
    setCopied(false);
    setCopiedReference("");
  }, []);

  const clearChecker = useCallback(() => {
    analysisRequestRef.current += 1;
    setArchiveFile(null);
    setTrainInput("");
    setAnalysis(null);
    setError("");
    setDragging(false);
    setWorking(false);
    setCopied(false);
    setCopiedReference("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.requestAnimationFrame(() => uploadButtonRef.current?.focus());
  }, []);

  const clearTrainQuery = useCallback(() => {
    analysisRequestRef.current += 1;
    setTrainInput("");
    setAnalysis(null);
    setError("");
    setCopied(false);
    setCopiedReference("");
    window.requestAnimationFrame(() => trainInputRef.current?.focus());
  }, []);

  const runAnalysis = useCallback(async (event) => {
    event?.preventDefault?.();
    if (!archiveFile) {
      setError("Choose a MASPO ZIP, RAR, or Excel file first.");
      return;
    }
    if (!normalizeMaspoTrainQuery(trainInput)) {
      setError("Enter a valid train set, such as 07 or TS07.");
      return;
    }

    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    setWorking(true);
    setError("");
    setAnalysis(null);
    setCopied(false);
    setCopiedReference("");
    try {
      const nextAnalysis = await analyzeMaspoArchive(archiveFile, trainInput);
      if (analysisRequestRef.current !== requestId) return;
      setAnalysis(nextAnalysis);
    } catch (analysisError) {
      if (analysisRequestRef.current !== requestId) return;
      console.error("MASPO train movement analysis failed:", analysisError);
      setError(analysisError?.message || "The MASPO archive could not be analyzed.");
    } finally {
      if (analysisRequestRef.current === requestId) setWorking(false);
    }
  }, [archiveFile, trainInput]);

  const copySummary = useCallback(async () => {
    if (!analysis?.summaryText) return;
    await copyText(analysis.summaryText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [analysis]);

  const copyReference = useCallback(async (reference) => {
    if (!reference) return;
    await copyText(reference);
    setCopiedReference(reference);
    window.setTimeout(() => {
      setCopiedReference((current) => current === reference ? "" : current);
    }, 1800);
  }, []);

  const latest = analysis?.latest || null;
  const timeline = analysis?.timeline || [];

  return (
    <section aria-busy={working} className="theme-maspo-train-checker overflow-hidden rounded-2xl border border-[#2379a8] bg-[#03111d] shadow-[0_18px_42px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <header className="theme-maspo-train-checker-header flex flex-col gap-4 border-b border-[#245e83] bg-[linear-gradient(100deg,#06233a,#03111d_72%)] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan-400/60 bg-cyan-500/10 text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.16)]">
            <TrainFront className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight text-white sm:text-xl">Check Train Maspo TR movement</h2>
            <p className="mt-1 text-[11px] font-medium text-[#b4cadb] sm:text-xs">Upload MASPO Excel logs and check one train across every workbook and worksheet.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {analysis && (
            <div className="theme-maspo-train-checker-summary flex min-h-12 flex-wrap items-center overflow-hidden rounded-xl border border-[#315978] bg-[#041522] text-[11px] font-bold text-sky-100">
              <span className="flex items-center gap-2 px-4 py-3"><CalendarDays className="h-4 w-4 text-cyan-300" /> {analysis.parsedWorkbookCount} Excel {analysis.parsedWorkbookCount === 1 ? "file" : "files"}</span>
              <span className="border-l border-[#315978] px-4 py-3">{timeline.length} {analysis.train} {timeline.length === 1 ? "entry" : "entries"} found</span>
            </div>
          )}
          {(archiveFile || analysis) && (
            <button
              type="button"
              onClick={clearChecker}
              className="theme-maspo-train-checker-clear inline-flex h-12 items-center gap-2 rounded-xl border border-red-400/55 bg-red-500/10 px-4 text-[11px] font-black text-red-300 transition-colors hover:bg-red-500/20"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.9fr)]">
        <div className="min-w-0">
          <button
            ref={uploadButtonRef}
            type="button"
            disabled={working}
            className={`theme-maspo-train-checker-upload flex min-h-28 w-full cursor-pointer items-center gap-4 rounded-xl border border-dashed px-5 py-4 text-left transition-colors ${dragging ? "is-dragging border-sky-300 bg-sky-500/15" : "border-sky-500/65 bg-[#031522] hover:border-cyan-300 hover:bg-[#062039]"}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (working) return;
              selectFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-sky-400/45 bg-sky-500/10 text-cyan-300">
              {archiveFile ? <FileArchive className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-white sm:text-base">{archiveFile?.name || "Upload ZIP, RAR, or Excel"}</span>
              <span className="mt-2 block text-[11px] leading-relaxed text-[#a5bfd2]">Excel names, sheet names, and column positions may differ.</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-[#a5bfd2]">Files are analyzed in this browser and are not saved.</span>
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            disabled={working}
            accept=".zip,.rar,.xlsx,.xls,.xlsm,.xlsb,application/zip,application/vnd.rar"
            className="hidden"
            aria-label="Upload MASPO ZIP, RAR, or Excel file"
            onChange={(event) => {
              selectFile(event.target.files[0]);
              event.target.value = "";
            }}
          />
          <DialogPrimitive.Root>
            <div className="theme-maspo-train-checker-guide mt-3 flex flex-col gap-3 rounded-xl border border-[#315978] bg-[#062039] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-400/45 bg-sky-500/10 text-cyan-300">
                  <CloudDownload className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-white">Need to download the MASPO folder?</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#9eb5ca]">OneDrive saves the folder as a ZIP file. Upload that ZIP here.</p>
                </div>
              </div>
              <DialogPrimitive.Trigger asChild>
                <button
                  type="button"
                  className="theme-maspo-train-checker-guide-button inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-400/55 bg-sky-500/10 px-4 text-[10px] font-black text-sky-100 transition-colors hover:bg-sky-500/25"
                  aria-label="Open picture guide for downloading the MASPO ZIP file from OneDrive"
                >
                  <CircleHelp className="h-4 w-4" /> View download guide
                </button>
              </DialogPrimitive.Trigger>
            </div>

            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-[300] bg-[#020b14]/85 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content className="theme-maspo-download-guide fixed left-1/2 top-1/2 z-[310] grid max-h-[94vh] w-[calc(100vw-1rem)] max-w-[1520px] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-hidden rounded-2xl border border-[#3d6e98] bg-[#03111d] p-3 text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)] focus:outline-none sm:p-4">
                <div className="pr-10 text-left">
                  <DialogPrimitive.Title className="theme-maspo-download-guide-title text-sm font-black text-white sm:text-base">How to download the MASPO ZIP</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="theme-maspo-download-guide-description mt-1 text-[10px] leading-relaxed text-[#9eb5ca] sm:text-xs">
                    Follow steps 4–6, then return to this checker and upload the ZIP file from Downloads.
                  </DialogPrimitive.Description>
                </div>
                <div className="theme-maspo-download-guide-frame min-h-0 overflow-auto rounded-xl border border-[#315978] bg-white">
                  <img
                    src="/guides/maspo-zip-download-guide.png"
                    alt="Picture guide showing steps 4 to 6: select Download in OneDrive, wait while the browser downloads the MASPO folder as a ZIP file, then find the ZIP file in Downloads."
                    className="block h-auto w-full min-w-[920px] max-w-none"
                  />
                </div>
                <p className="theme-maspo-download-guide-description text-[9px] text-[#7899b1] sm:hidden">Scroll sideways to read each step.</p>
                <DialogPrimitive.Close
                  className="theme-maspo-download-guide-close absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-500/50 bg-slate-900/55 text-slate-200 transition-colors hover:border-red-400/70 hover:bg-red-950/50 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-sky-400/70"
                  aria-label="Close MASPO ZIP download guide"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <p className="mt-3 text-[10px] text-[#8eabc0]">
            RAR extraction license details: <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer" className="font-bold text-sky-300 underline decoration-sky-500/50 underline-offset-2">third-party notices</a>.
          </p>
        </div>

        <form onSubmit={runAnalysis} className="theme-maspo-train-checker-controls flex min-w-0 flex-col justify-between gap-5 rounded-xl border border-[#315978] bg-[linear-gradient(145deg,#062039,#03111d)] p-4 sm:p-5">
          <div>
            <label htmlFor="maspo-train-query" className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-200">Train set</label>
            <div className="theme-maspo-train-checker-query relative mt-3 min-w-0">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center justify-center border-r border-[#315978] text-sky-300">
                <Search className="h-5 w-5" />
              </span>
              <input
                ref={trainInputRef}
                id="maspo-train-query"
                aria-describedby="maspo-train-query-help"
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={8}
                disabled={working}
                value={trainInput}
                onChange={(event) => {
                  analysisRequestRef.current += 1;
                  setTrainInput(event.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 8));
                  setError("");
                  setAnalysis(null);
                }}
                placeholder="07 or TS07"
                className="h-14 w-full min-w-0 rounded-xl border border-[#315978] bg-[#031522] pl-[4.25rem] pr-12 text-base font-black uppercase text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
              />
              {trainInput && (
                <button type="button" onClick={clearTrainQuery} disabled={working} className="theme-maspo-train-checker-query-clear absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#86a9c2] transition-colors hover:text-red-300 disabled:opacity-50" aria-label="Clear train set">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <p id="maspo-train-query-help" className="mt-2 text-[10px] font-semibold text-[#91aec2]">
              Search example: 07 &bull; 7 &bull; T07 &bull; TS07
            </p>
          </div>
          <button
            type="submit"
            disabled={working || !archiveFile || !normalizeMaspoTrainQuery(trainInput)}
            className="theme-maspo-train-checker-submit inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-cyan-400/65 bg-[linear-gradient(100deg,rgba(8,145,178,0.32),rgba(14,116,144,0.5))] px-4 text-sm font-black text-white transition-all hover:bg-cyan-500/35 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {working ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            {working ? "Checking logs..." : "Check movement"}
          </button>
        </form>
      </div>

      <div aria-live="polite" className="px-4 pb-4">
        {error && (
          <div role="alert" className="theme-maspo-train-checker-error flex items-start gap-2 rounded-xl border border-amber-400/45 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {analysis && (
          <div className="theme-maspo-train-checker-results overflow-hidden rounded-2xl border border-[#2379a8] bg-[#03111d] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
            <div className="theme-maspo-train-checker-results-header flex flex-col gap-4 rounded-xl border border-[#1d638d] bg-[linear-gradient(135deg,#06233a,#041522)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/55 bg-cyan-500/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.14)]">
                  <TrainFront className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-black text-white sm:text-xl">{analysis.train} Movement Check</h3>
                    {latest && (
                      <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${statusStyle(latest.status)}`}>
                        {latest.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#b2c9da]">
                    {timeline.length} {timeline.length === 1 ? "movement" : "movements"} found
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copySummary}
                  className="theme-maspo-train-checker-copy inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-400/55 bg-sky-500/10 px-4 text-[11px] font-black text-sky-100 transition-colors hover:bg-sky-500/20"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy result"}
                </button>
                <span className="theme-maspo-train-checker-chronological inline-flex h-10 items-center gap-2 rounded-xl border border-sky-400/45 bg-sky-500/10 px-4 text-[11px] font-black text-sky-100">
                  <ArrowUpDown className="h-4 w-4" /> Chronological
                </span>
              </div>
            </div>

            {timeline.length && latest ? (
              <>
                <section aria-labelledby="maspo-latest-movement-heading" className="theme-maspo-train-checker-latest mt-3 rounded-xl border border-cyan-400/80 bg-[linear-gradient(120deg,rgba(3,28,43,0.98),rgba(4,20,34,0.98))] p-4 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_minmax(145px,0.75fr)_minmax(170px,0.8fr)_minmax(220px,1.25fr)_auto_minmax(210px,1fr)] xl:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan-400/75 bg-cyan-500/10 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.16)]"><TrainFront className="h-7 w-7" /></span>
                      <div className="min-w-0">
                        <p id="maspo-latest-movement-heading" className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Latest Movement</p>
                        <p className="mt-1 break-words text-2xl font-black text-white sm:text-3xl">{latest.route || "Route not stated"}</p>
                      </div>
                    </div>
                    <div className="theme-maspo-train-checker-latest-metric min-w-0 border-t border-[#20506d] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                      <p className="flex items-center gap-2 text-xs font-black text-white"><CalendarDays className="h-4 w-4 shrink-0 text-sky-300" /> {latest.dateRangeDisplay || latest.dateDisplay || "Date not stated"}</p>
                      <p className="mt-1 pl-6 text-[8px] font-black uppercase tracking-[0.12em] text-[#7899b1]">Date</p>
                    </div>
                    <div className="theme-maspo-train-checker-latest-metric min-w-0 border-t border-[#20506d] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                      <p className="flex items-center gap-2 text-xs font-black text-white"><Clock3 className="h-4 w-4 shrink-0 text-sky-300" /> {latest.timeRange || "Time not stated"}</p>
                      <p className="mt-1 pl-6 text-[8px] font-black uppercase tracking-[0.12em] text-[#7899b1]">Time</p>
                    </div>
                    <div className="theme-maspo-train-checker-latest-metric min-w-0 border-t border-[#20506d] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                      <p className="flex items-center gap-2 text-xs font-black text-white"><MapPin className="h-4 w-4 shrink-0 text-sky-300" /> <span className="break-words">{latest.areaDetail || "Area flow not stated"}</span></p>
                      <p className="mt-1 pl-6 text-[8px] font-black uppercase tracking-[0.12em] text-[#7899b1]">Area flow</p>
                    </div>
                    <span className="w-fit rounded-xl border border-blue-400/65 bg-blue-500/10 px-3 py-2 text-[11px] font-black text-blue-100">{latest.planStatus || "Plan not stated"}</span>
                    <div className="theme-maspo-train-checker-reference flex min-w-0 items-stretch overflow-hidden rounded-xl border border-[#315978] bg-[#041522]">
                      <div className="min-w-0 flex-1 px-3 py-2.5">
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-300">Movement ref</p>
                        <p className="mt-1 break-all font-mono text-xs font-black text-cyan-300">{latest.reference}</p>
                      </div>
                      <button type="button" onClick={() => copyReference(latest.reference)} className="theme-maspo-train-checker-ref-copy inline-flex w-11 shrink-0 items-center justify-center border-l border-[#315978] text-sky-200 transition-colors hover:bg-sky-500/15" aria-label={`Copy movement reference ${latest.reference}`}>
                        {copiedReference === latest.reference ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="maspo-movement-history-heading" className="theme-maspo-train-checker-history mt-3 overflow-hidden rounded-xl border border-[#245e83] bg-[#041522]">
                  <div className="theme-maspo-train-checker-history-heading flex flex-wrap items-center justify-between gap-3 border-b border-[#315978] bg-[#062039] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-400/45 bg-sky-500/10 text-sky-200"><TrainFront className="h-4 w-4" /></span>
                      <h4 id="maspo-movement-history-heading" className="text-xs font-black uppercase tracking-[0.04em] text-white">Movement History</h4>
                    </div>
                    <p className="flex items-center gap-1.5 text-[10px] font-bold text-[#9eb5ca]">Oldest → Latest <ArrowUpDown className="h-3.5 w-3.5" /></p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] border-collapse text-left" aria-label={`Chronological movement history for ${analysis.train}`}>
                      <thead className="theme-maspo-train-checker-history-columns bg-[#07243d] text-[9px] font-black uppercase tracking-[0.12em] text-[#9fc4dd]">
                        <tr>
                          <th scope="col" className="w-20 border-r border-[#23445f] px-4 py-3 text-center">No.</th>
                          <th scope="col" className="px-4 py-3">Date</th>
                          <th scope="col" className="px-4 py-3">From → To</th>
                          <th scope="col" className="px-4 py-3">Area flow</th>
                          <th scope="col" className="px-4 py-3">Movement type</th>
                          <th scope="col" className="px-4 py-3">Time</th>
                          <th scope="col" className="px-4 py-3">Movement ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.map((record, index) => (
                          <Fragment key={record.id}>
                            <tr className="theme-maspo-train-checker-history-row border-t border-[#23445f] bg-[#041522] text-xs text-white">
                              <td className="border-r border-[#23445f] px-4 py-3 text-center"><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-500 px-2 font-black text-white shadow-[0_0_14px_rgba(14,165,233,0.42)]">{String(index + 1).padStart(2, "0")}</span></td>
                              <td className="whitespace-nowrap px-4 py-3 font-bold"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-sky-300" />{record.dateRangeDisplay || record.dateDisplay || "Date not stated"}</span></td>
                              <td className="px-4 py-3 text-sm font-black">{record.route || "Route not stated"}</td>
                              <td className="px-4 py-3 font-semibold">{record.areaDetail || "Area flow not stated"}</td>
                              <td className="px-4 py-3"><span className="inline-flex rounded-lg border border-blue-400/65 bg-blue-500/10 px-2.5 py-1 font-black text-blue-100">{record.planStatus || "Plan not stated"}</span></td>
                              <td className="whitespace-nowrap px-4 py-3 font-black"><span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-sky-300" />{record.timeRange || "Time not stated"}</span></td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="break-all font-mono font-black text-cyan-300">{record.reference}</span>
                                  <button type="button" onClick={() => copyReference(record.reference)} className="theme-maspo-train-checker-ref-copy inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#315978] text-sky-200 transition-colors hover:bg-sky-500/15" aria-label={`Copy movement reference ${record.reference}`}>
                                    {copiedReference === record.reference ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            <tr className="theme-maspo-train-checker-history-source border-t border-[#17364d] bg-[#031522]">
                              <td aria-hidden="true" className="border-r border-[#23445f]" />
                              <td colSpan={6} className="px-4 py-2 text-[9px] font-semibold text-[#7fa3bb]">
                                <span className="flex min-w-0 items-center gap-2" title={`${record.fileName} · ${record.sheetName} · Row ${record.rowNumber}`}>
                                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-sky-300" /><span className="truncate">{displaySourceName(record.fileName)}</span><span aria-hidden="true">•</span><span>{record.sheetName}</span><span aria-hidden="true">•</span><span>Row {record.rowNumber}</span>
                                </span>
                              </td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="theme-maspo-train-checker-note mt-3 flex items-start gap-2 rounded-xl border border-[#245e83] bg-[#041522] px-4 py-3 text-[10px] text-[#9eb5ca]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  <p><span className="font-black text-white">Note:</span> Results prioritize detailed MASPO movement entries. Handover logs may provide supporting status but do not replace a matched movement reference.</p>
                </div>
              </>
            ) : (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                <FileSpreadsheet className="h-6 w-6 text-[#6689a3]" />
                <p className="text-xs font-bold text-[#9eb5ca]">No matching MASPO movement record was found.</p>
                <p className="text-[10px] text-[#6f91aa]">{analysis.parsedWorkbookCount} Excel workbooks and {analysis.sheetsScanned} worksheets were checked.</p>
              </div>
            )}

            {analysis.warnings.length > 0 && (
              <div className="theme-maspo-train-checker-warning border-t border-[#23445f] px-4 py-2 text-[10px] font-semibold text-amber-200">
                {analysis.warnings.join(" ")}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
