import { useCallback, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Copy,
  FileSpreadsheet,
  Loader2,
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
  const analysisRequestRef = useRef(0);
  const [archiveFile, setArchiveFile] = useState(null);
  const [trainInput, setTrainInput] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectFile = useCallback((file) => {
    if (!file) return;
    analysisRequestRef.current += 1;
    setArchiveFile(file);
    setAnalysis(null);
    setError("");
    setCopied(false);
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
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.requestAnimationFrame(() => uploadButtonRef.current?.focus());
  }, []);

  const runAnalysis = useCallback(async (event) => {
    event?.preventDefault?.();
    if (!archiveFile) {
      setError("Choose a MASPO ZIP, RAR, or Excel file first.");
      return;
    }
    if (!normalizeMaspoTrainQuery(trainInput)) {
      setError("Enter a valid train number, such as T31 or TS27.");
      return;
    }

    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    setWorking(true);
    setError("");
    setAnalysis(null);
    setCopied(false);
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

  const latest = analysis?.latest || null;
  const timeline = analysis?.timeline || [];

  return (
    <section aria-busy={working} className="theme-maspo-train-checker overflow-hidden rounded-xl border border-[#3d6e98] bg-[#061827] shadow-[0_14px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <header className="theme-maspo-train-checker-header flex flex-col gap-3 border-b border-[#315978] bg-[linear-gradient(90deg,rgba(56,189,248,0.18),rgba(6,24,39,0.96))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/45 bg-sky-400/10 text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.16)]">
            <TrainFront className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black leading-tight text-white">Check Train Maspo TR movement</h2>
            <p className="mt-0.5 text-[10px] font-semibold text-sky-200/85">Upload MASPO Excel logs and check one train across every workbook and worksheet.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {analysis && (
            <span className="rounded-full border border-sky-400/45 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-100">
              {analysis.parsedWorkbookCount} Excel · {analysis.matchCount} matching refs
            </span>
          )}
          {(archiveFile || analysis) && (
            <button
              type="button"
              onClick={clearChecker}
              className="theme-maspo-train-checker-clear inline-flex items-center gap-1 rounded-lg border border-red-400/45 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-bold text-red-200 transition-colors hover:bg-red-500/20"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <div className="min-w-0">
          <button
            ref={uploadButtonRef}
            type="button"
            disabled={working}
            className={`theme-maspo-train-checker-upload flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-left transition-colors ${dragging ? "is-dragging border-sky-300 bg-sky-500/15" : "border-[#376584] bg-[#041522] hover:border-sky-400/75 hover:bg-[#082036]"}`}
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
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/45 bg-sky-500/10 text-sky-200">
              {archiveFile ? <Archive className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-sky-100">{archiveFile?.name || "Upload ZIP, RAR, or Excel"}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-[#9eb5ca]">Excel names, sheet names, and column positions may differ. Files are analyzed in this browser and are not saved.</span>
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
            <div className="theme-maspo-train-checker-guide mt-2 flex flex-col gap-2 rounded-xl border border-[#315978] bg-[#071e33] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-400/40 bg-sky-500/10 text-sky-200">
                  <CircleHelp className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-sky-100">Need to download the MASPO folder?</p>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-[#8eabc0]">OneDrive saves the folder as a ZIP file. Upload that ZIP here.</p>
                </div>
              </div>
              <DialogPrimitive.Trigger asChild>
                <button
                  type="button"
                  className="theme-maspo-train-checker-guide-button inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-sky-400/55 bg-sky-500/15 px-3 text-[10px] font-bold text-sky-100 transition-colors hover:bg-sky-500/25"
                  aria-label="Open picture guide for downloading the MASPO ZIP file from OneDrive"
                >
                  <CircleHelp className="h-3.5 w-3.5" /> View download guide
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
          <p className="mt-1.5 text-[9px] text-[#7899b1]">
            RAR extraction license details: <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer" className="font-bold text-sky-300 underline decoration-sky-500/50 underline-offset-2">third-party notices</a>.
          </p>
        </div>

        <form onSubmit={runAnalysis} className="theme-maspo-train-checker-controls flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-[#315978] bg-[#041522] p-3">
          <div>
            <label htmlFor="maspo-train-query" className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-200">Train set</label>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#315978] bg-[#071e33] text-sky-300">
                <Search className="h-4 w-4" />
              </span>
              <input
                id="maspo-train-query"
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
                placeholder="T31 or TS27"
                className="h-9 min-w-0 flex-1 rounded-lg border border-[#315978] bg-[#071e33] px-3 text-sm font-bold uppercase text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={working || !archiveFile || !normalizeMaspoTrainQuery(trainInput)}
            className="theme-maspo-train-checker-submit inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-sky-400/65 bg-sky-500/20 px-4 text-xs font-black text-sky-100 transition-all hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
          <div className="theme-maspo-train-checker-results overflow-hidden rounded-xl border border-[#315978] bg-[#03111d]">
            <div className="theme-maspo-train-checker-results-header flex flex-col gap-3 border-b border-[#23445f] bg-[#071e33] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-white">{analysis.train} movement result</h3>
                  {latest && (
                    <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${statusStyle(latest.status)}`}>
                      {latest.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-[#9eb5ca]">
                  {latest ? `${latest.route || "Route not stated"} · Latest ref ${latest.reference}` : `No matching MASPO reference for ${analysis.train}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={copySummary}
                className="theme-maspo-train-checker-copy inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-sky-400/55 bg-sky-500/15 px-3 text-[10px] font-bold text-sky-100 transition-colors hover:bg-sky-500/25"
              >
                {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy result"}
              </button>
            </div>

            {timeline.length ? (
              <div className="grid gap-2 p-3 md:grid-cols-2">
                {timeline.map((record) => (
                  <article key={record.id} className="theme-maspo-train-checker-record min-w-0 rounded-xl border border-[#284b66] bg-[#051a2a] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-black text-white">{record.route || "Route not stated"}</p>
                        <p className="mt-1 text-[10px] font-semibold text-[#9eb5ca]">
                          {[record.dateRangeDisplay || record.dateDisplay, record.timeRange, record.planStatus].filter(Boolean).join(" · ") || "Date and time not stated"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${statusStyle(record.status)}`}>
                        {record.status}
                      </span>
                    </div>

                    <div className="theme-maspo-train-checker-reference mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#315978] bg-[#041522] px-3 py-2">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-300">Reference number</p>
                        <p className="mt-0.5 font-mono text-xs font-black text-white">{record.reference}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-semibold text-[#86a9c2]">
                        <Clock3 className="h-3 w-3" /> Row {record.rowNumber}
                      </div>
                    </div>

                    <p className="mt-2 flex min-w-0 items-center gap-1.5 truncate text-[9px] text-[#7899b1]" title={`${record.fileName} · ${record.sheetName}`}>
                      <FileSpreadsheet className="h-3 w-3 shrink-0" />
                      <span className="truncate">{displaySourceName(record.fileName)} · {record.sheetName}</span>
                    </p>
                  </article>
                ))}
              </div>
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
