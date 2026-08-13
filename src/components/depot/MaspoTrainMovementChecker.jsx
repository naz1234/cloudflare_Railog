import { useCallback, useRef, useState } from "react";
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
    window.requestAnimationFrame(() => trainInputRef.current?.focus());
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
  const normalizedTrainQuery = normalizeMaspoTrainQuery(trainInput);

  return (
    <section aria-busy={working} className="theme-maspo-train-checker overflow-hidden rounded-2xl border border-violet-500/70 bg-[#100b1a] shadow-[0_18px_42px_rgba(0,0,0,0.3),0_0_24px_rgba(168,85,247,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <header className="theme-maspo-train-checker-header flex flex-col gap-4 border-b border-violet-500/45 bg-[linear-gradient(100deg,#24143a,#100b1a_72%)] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-violet-400/60 bg-violet-500/10 text-violet-300 shadow-[0_0_22px_rgba(168,85,247,0.18)]">
            <TrainFront className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black leading-tight text-white">Check Train Maspo TR movement</h2>
            <p className="mt-0.5 text-[9px] font-semibold text-violet-200/85">Upload MASPO Excel logs and check one train across every workbook and worksheet.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {analysis && (
            <div className="theme-maspo-train-checker-summary flex min-h-12 flex-wrap items-center overflow-hidden rounded-xl border border-violet-500/45 bg-[#170f25] text-[9px] font-black text-violet-100">
              <span className="flex items-center gap-2 px-4 py-3"><CalendarDays className="h-4 w-4 text-violet-300" /> {analysis.parsedWorkbookCount} Excel {analysis.parsedWorkbookCount === 1 ? "file" : "files"}</span>
              <span className="border-l border-violet-500/45 px-4 py-3">{timeline.length} {analysis.train} {timeline.length === 1 ? "entry" : "entries"} found</span>
            </div>
          )}
          {(archiveFile || analysis) && (
            <button
              type="button"
              onClick={clearChecker}
              className="theme-maspo-train-checker-clear inline-flex h-12 items-center gap-2 rounded-xl border border-red-400/55 bg-red-500/10 px-4 text-[9px] font-black text-red-300 transition-colors hover:bg-red-500/20"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
      </header>

      <div className="theme-maspo-train-checker-flow grid gap-3 p-4 sm:p-5">
        <button
          ref={uploadButtonRef}
          type="button"
          disabled={working}
          className={`theme-maspo-train-checker-flow-step theme-maspo-train-checker-upload flex min-h-[112px] w-full cursor-pointer flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-all ${dragging ? "is-dragging border-violet-300 bg-violet-500/15" : "border-violet-500/65 bg-[#170f25] hover:border-violet-300 hover:bg-[#211334]"}`}
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
          <span className="flex w-full items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-violet-100">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-400/70 text-[10px] text-violet-300">1</span>
              Upload file
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] ${archiveFile ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-violet-400/60 bg-violet-500/15 text-violet-200"}`}>
              {archiveFile ? "Done" : "Current"}
            </span>
          </span>
          <span className="flex w-full min-w-0 items-center gap-4 border-t border-violet-500/25 pt-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/45 bg-violet-500/10 text-violet-300">
              {archiveFile ? <FileArchive className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white">{archiveFile?.name || "Upload ZIP, RAR, or Excel"}</span>
              <span className="mt-1 block text-[9px] leading-relaxed text-violet-200/75">Excel names, sheet names, and column positions may differ.</span>
              <span className="mt-0.5 block text-[9px] leading-relaxed text-violet-200/75">Files are analyzed in this browser and are not saved.</span>
            </span>
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
          <div className="theme-maspo-train-checker-guide flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <CloudDownload className="h-4 w-4 shrink-0 text-violet-300" />
              <p className="text-[9px] font-semibold text-violet-200/75">Need the MASPO folder ZIP from OneDrive?</p>
            </div>
            <DialogPrimitive.Trigger asChild>
              <button
                type="button"
                className="theme-maspo-train-checker-guide-button inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-violet-400/55 bg-violet-500/10 px-2.5 text-[8px] font-black text-violet-100 transition-colors hover:bg-violet-500/25"
                aria-label="Open picture guide for downloading the MASPO ZIP file from OneDrive"
              >
                <CircleHelp className="h-3.5 w-3.5" /> View download guide
              </button>
            </DialogPrimitive.Trigger>
          </div>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[300] bg-[#100b1a]/88 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content className="theme-maspo-download-guide fixed left-1/2 top-1/2 z-[310] grid max-h-[94vh] w-[calc(100vw-1rem)] max-w-[1520px] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-hidden rounded-2xl border border-violet-500/55 bg-[#100b1a] p-3 text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)] focus:outline-none sm:p-4">
              <div className="pr-10 text-left">
                <DialogPrimitive.Title className="theme-maspo-download-guide-title text-[15px] font-black text-white">How to download the MASPO ZIP</DialogPrimitive.Title>
                <DialogPrimitive.Description className="theme-maspo-download-guide-description mt-1 text-[10px] leading-relaxed text-violet-200/75">
                  Follow steps 4–6, then return to this checker and upload the ZIP file from Downloads.
                </DialogPrimitive.Description>
              </div>
              <div className="theme-maspo-download-guide-frame min-h-0 overflow-auto rounded-xl border border-violet-500/45 bg-white">
                <img
                  src="/guides/maspo-zip-download-guide.png"
                  alt="Picture guide showing steps 4 to 6: select Download in OneDrive, wait while the browser downloads the MASPO folder as a ZIP file, then find the ZIP file in Downloads."
                  className="block h-auto w-full min-w-[920px] max-w-none"
                />
              </div>
              <p className="theme-maspo-download-guide-description text-[9px] text-violet-300/70 sm:hidden">Scroll sideways to read each step.</p>
              <DialogPrimitive.Close
                className="theme-maspo-download-guide-close absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-400/40 bg-violet-950/55 text-violet-100 transition-colors hover:border-red-400/70 hover:bg-red-950/50 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-violet-400/70"
                aria-label="Close MASPO ZIP download guide"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {archiveFile && (
          <form onSubmit={runAnalysis} className="grid gap-3">
            <div className="theme-maspo-train-checker-flow-step theme-maspo-train-checker-controls flex min-h-[96px] flex-col justify-center rounded-xl border border-violet-500/55 bg-[#170f25] px-4 py-3 shadow-[0_0_18px_rgba(168,85,247,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="maspo-train-query" className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-violet-100">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-400/70 text-[10px] text-violet-300">2</span>
                Train set
              </label>
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] ${normalizedTrainQuery ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-violet-400/60 bg-violet-500/15 text-violet-200"}`}>
                {normalizedTrainQuery ? "Done" : "Current"}
              </span>
            </div>
            <div className="theme-maspo-train-checker-query relative mt-1.5 flex h-7 min-w-0 items-center gap-2 border-0 bg-transparent">
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
                className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] font-semibold uppercase text-white outline-none placeholder:text-violet-300/45"
              />
              {trainInput && (
                <button type="button" onClick={clearTrainQuery} disabled={working} className="theme-maspo-train-checker-query-clear inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-violet-300 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" aria-label="Clear train set">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p id="maspo-train-query-help" className="mt-0.5 text-[8px] font-semibold text-violet-300/70">
              Search example: 07 &bull; 7 &bull; T07 &bull; TS07
            </p>
            </div>
            {normalizedTrainQuery && (
            <button
              type="submit"
              disabled={working}
              className="theme-maspo-train-checker-flow-step theme-maspo-train-checker-submit flex min-h-[96px] w-full flex-col justify-center rounded-xl border border-violet-400/65 bg-[linear-gradient(110deg,rgba(126,34,206,0.34),rgba(76,29,149,0.56))] px-4 py-3 text-left text-white transition-all hover:border-violet-300 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-300/80 text-[10px]">3</span>
                  {working ? "Checking logs" : "Check movement"}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] ${analysis ? "border-emerald-300/70 bg-emerald-400/15 text-emerald-100" : "border-violet-300/70 bg-violet-400/15"}`}>
                    {analysis ? "Done" : "Current"}
                  </span>
                  {working ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                </span>
              </span>
              <span className="mt-1.5 text-[9px] font-semibold text-violet-100/75">Search the uploaded MASPO files for this train.</span>
            </button>
            )}
          </form>
        )}
      </div>
      <p className="px-4 pb-4 text-[9px] text-violet-300/65 sm:px-5 sm:pb-5">
        RAR extraction license details: <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer" className="font-bold text-violet-300 underline decoration-violet-500/50 underline-offset-2">third-party notices</a>.
      </p>

      <div aria-live="polite" className="px-4 pb-4">
        {error && (
          <div role="alert" className="theme-maspo-train-checker-error flex items-start gap-2 rounded-xl border border-amber-400/45 bg-amber-500/10 px-3 py-2.5 text-[10px] font-semibold text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {analysis && (
          <div className="theme-maspo-train-checker-results theme-maspo-train-checker-results-reference overflow-hidden rounded-2xl border border-[#22313c] bg-[#02080e] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.36)]">
            <div className="theme-maspo-train-checker-results-header flex flex-col gap-3 rounded-xl border border-[#20313d] bg-[linear-gradient(135deg,#07131c,#030a10)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-950/60 text-violet-300">
                  <TrainFront className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-black uppercase leading-tight text-white">{analysis.train} Movement Check</h3>
                    {latest && (
                      <span className={`rounded-md border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${statusStyle(latest.status)}`}>
                        {latest.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] font-semibold text-[#c2ccd4]">
                    {timeline.length} {timeline.length === 1 ? "movement" : "movements"} found
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copySummary}
                  className="theme-maspo-train-checker-copy inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-500/35 bg-violet-950/25 px-3.5 text-[10px] font-semibold text-white transition-colors hover:border-violet-400/65 hover:bg-violet-950/50"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <span className="theme-maspo-train-checker-chronological inline-flex h-9 items-center gap-2 rounded-lg border border-[#2a3a45] bg-[#071018] px-3.5 text-[10px] font-semibold text-white">
                  <ArrowUpDown className="h-4 w-4" /> Chronological
                </span>
              </div>
            </div>

            {timeline.length && latest ? (
              <>
                <section aria-labelledby="maspo-latest-movement-heading" className="theme-maspo-train-checker-latest mt-3 rounded-xl border border-[#24343f] bg-[linear-gradient(120deg,#07131b,#030a10)] p-3.5 shadow-none">
                  <div className="grid grid-cols-2 gap-y-4 lg:grid-cols-[minmax(160px,1fr)_minmax(125px,0.8fr)_minmax(115px,0.75fr)_minmax(190px,1.2fr)_minmax(95px,auto)_minmax(175px,1fr)] lg:items-center">
                    <div className="col-span-2 min-w-0 pr-3 lg:col-span-1">
                      <p id="maspo-latest-movement-heading" className="text-[10px] font-black uppercase tracking-[0.11em] text-violet-300">Latest Movement</p>
                      <p className="mt-2 break-words text-[15px] font-black leading-none text-white">{latest.route || "Route not stated"}</p>
                    </div>
                    <div className="theme-maspo-train-checker-latest-metric min-w-0 border-l border-[#24343f] px-3">
                      <p className="flex items-center gap-2 text-[11px] font-semibold text-white"><CalendarDays className="h-4 w-4 shrink-0 text-[#d5e0e8]" /> {latest.dateRangeDisplay || latest.dateDisplay || "Date not stated"}</p>
                      <p className="mt-1.5 pl-6 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8c9ba6]">Date</p>
                    </div>
                    <div className="theme-maspo-train-checker-latest-metric min-w-0 border-l border-[#24343f] px-3">
                      <p className="flex items-center gap-2 text-[11px] font-semibold text-white"><Clock3 className="h-4 w-4 shrink-0 text-[#d5e0e8]" /> {latest.timeRange || "Time not stated"}</p>
                      <p className="mt-1.5 pl-6 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8c9ba6]">Time</p>
                    </div>
                    <div className="theme-maspo-train-checker-latest-metric col-span-2 min-w-0 border-l border-[#24343f] px-3 lg:col-span-1">
                      <p className="flex items-center gap-2 text-[11px] font-semibold text-white"><MapPin className="h-4 w-4 shrink-0 text-[#d5e0e8]" /> <span className="break-words">{latest.areaDetail || "Area flow not stated"}</span></p>
                      <p className="mt-1.5 pl-6 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8c9ba6]">Area flow</p>
                    </div>
                    <div className="self-center text-center">
                      <span className="inline-flex rounded-md border border-blue-500/55 bg-blue-950/65 px-2.5 py-1.5 text-[10px] font-semibold text-blue-100">{latest.planStatus || "Plan not stated"}</span>
                      <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8c9ba6]">Type</p>
                    </div>
                    <div className="theme-maspo-train-checker-reference col-span-2 flex min-w-0 items-center border-l border-[#24343f] pl-3 lg:col-span-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#8c9ba6]">Movement ref</p>
                        <p className="mt-1.5 break-all font-mono text-[11px] font-semibold text-violet-300">{latest.reference}</p>
                      </div>
                      <button type="button" onClick={() => copyReference(latest.reference)} className="theme-maspo-train-checker-ref-copy inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/35 bg-violet-950/25 text-[#d5e0e8] transition-colors hover:border-violet-400/65 hover:text-violet-200" aria-label={`Copy movement reference ${latest.reference}`}>
                        {copiedReference === latest.reference ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="maspo-movement-history-heading" className="theme-maspo-train-checker-history mt-3 overflow-hidden rounded-xl border border-[#24343f] bg-[#030a10]">
                  <h4 id="maspo-movement-history-heading" className="sr-only">Movement History</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] border-collapse text-left" aria-label={`Chronological movement history for ${analysis.train}`}>
                      <thead className="theme-maspo-train-checker-history-columns bg-[#0b161e] text-[10px] font-bold text-[#c4ced6]">
                        <tr>
                          <th scope="col" className="w-14 border-r border-[#24343f] px-3 py-3 text-center">No.</th>
                          <th scope="col" className="border-r border-[#24343f] px-3 py-3">Date</th>
                          <th scope="col" className="border-r border-[#24343f] px-3 py-3">From → To</th>
                          <th scope="col" className="border-r border-[#24343f] px-3 py-3">Area flow</th>
                          <th scope="col" className="border-r border-[#24343f] px-3 py-3">Type</th>
                          <th scope="col" className="border-r border-[#24343f] px-3 py-3">Time</th>
                          <th scope="col" className="px-3 py-3">Movement ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeline.map((record, index) => {
                          const sourceLabel = `${displaySourceName(record.fileName)} · ${record.sheetName} · Row ${record.rowNumber}`;
                          return (
                            <tr key={record.id} title={`Source: ${sourceLabel}`} className="theme-maspo-train-checker-history-row border-t border-[#24343f] bg-[#030a10] text-[11px] text-white">
                              <td className="border-r border-[#24343f] px-3 py-3.5 text-center"><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-violet-600 px-2 text-[10px] font-black text-white shadow-[0_0_12px_rgba(139,92,246,0.30)]">{String(index + 1).padStart(2, "0")}</span></td>
                              <td className="whitespace-nowrap border-r border-[#24343f] px-3 py-3.5 font-medium"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#d5e0e8]" />{record.dateRangeDisplay || record.dateDisplay || "Date not stated"}</span><span className="sr-only">Source: {sourceLabel}</span></td>
                              <td className="border-r border-[#24343f] px-3 py-3.5 font-semibold">{record.route || "Route not stated"}</td>
                              <td className="border-r border-[#24343f] px-3 py-3.5 font-medium">{record.areaDetail || "Area flow not stated"}</td>
                              <td className="border-r border-[#24343f] px-3 py-3.5"><span className="inline-flex rounded-md border border-emerald-700/65 bg-emerald-950/75 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-100">{record.planStatus || "Plan not stated"}</span></td>
                              <td className="whitespace-nowrap border-r border-[#24343f] px-3 py-3.5 font-medium"><span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#d5e0e8]" />{record.timeRange || "Time not stated"}</span></td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="break-all font-mono text-[11px] font-medium text-violet-300">{record.reference}</span>
                                  <button type="button" onClick={() => copyReference(record.reference)} className="theme-maspo-train-checker-ref-copy inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/35 bg-violet-950/25 text-[#d5e0e8] transition-colors hover:border-violet-400/65 hover:text-violet-200" aria-label={`Copy movement reference ${record.reference}`}>
                                    {copiedReference === record.reference ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="theme-maspo-train-checker-note mt-3 flex items-start gap-3 rounded-xl border border-[#24343f] bg-[#030a10] px-4 py-3 text-[10px] leading-relaxed text-[#c2ccd4]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  <p><span className="font-black text-white">Note:</span> Results prioritize detailed MASPO movement entries. Handover logs may provide supporting status but do not replace a matched movement reference.</p>
                </div>
              </>
            ) : (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                <FileSpreadsheet className="h-6 w-6 text-[#6689a3]" />
                <p className="text-[11px] font-semibold text-[#9eb5ca]">No matching MASPO movement record was found.</p>
                <p className="text-[9px] text-[#6f91aa]">{analysis.parsedWorkbookCount} Excel workbooks and {analysis.sheetsScanned} worksheets were checked.</p>
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
