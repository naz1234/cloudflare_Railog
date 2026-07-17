import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Download, FileText, FileUp, Loader2, Moon, RefreshCw, Trash2 } from "lucide-react";
import { GlobalWorkerOptions, getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error Vite resolves this worker module to a public asset URL.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  NIGHT_SHIFT_ROSTER_PARSER_VERSION,
  parseBinJaafarRoster,
  summarizeBinJaafarNightShifts,
} from "@/lib/nightShiftRoster";
import {
  deleteSavedNightShiftRoster,
  loadSavedNightShiftRosters,
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

function getRosterIdentity(roster = {}) {
  return roster.id || roster.localKey || "";
}

function makeLocalRoster(file, parsed) {
  return {
    id: "",
    localKey: `local-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    file,
    fileName: file.name || "Night-Shift-Roster.pdf",
    mimeType: file.type || "application/pdf",
    size: Number(file.size || 0),
    parsed,
    parserVersion: NIGHT_SHIFT_ROSTER_PARSER_VERSION,
    uploadedAt: new Date().toISOString(),
    needsCloudRefresh: true,
  };
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

function NightShiftRosterWindow({
  roster,
  index,
  selectedYear,
  selectedMonth,
  periodLabel,
  isBusy,
  isDeleting,
  onDownload,
  onDelete,
}) {
  const summary = useMemo(
    () => summarizeBinJaafarNightShifts(roster.parsed, selectedYear, selectedMonth),
    [roster.parsed, selectedMonth, selectedYear]
  );
  const fileName = roster.fileName || roster.file?.name || "Night-Shift-Roster.pdf";
  const savedAcrossLaptops = Boolean(roster.id);

  return (
    <article className="overflow-hidden rounded-[20px] border border-[#315574] bg-[linear-gradient(145deg,rgba(10,34,56,0.96),rgba(6,24,41,0.98))] shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-3 border-b border-[#294963] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-sky-400/25 bg-sky-500/10 text-sky-200">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7f98b2]">PDF {index + 1} · separate result window</p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-[#edf4fb]" title={fileName}>{fileName}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#849bb5]">
              {formatFileSize(roster.size || roster.file?.size || 0)} · {savedAcrossLaptops ? "saved across laptops" : "local copy only"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDownload(roster)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 text-[10px] font-semibold text-emerald-100 transition hover:border-emerald-300/55 hover:bg-emerald-500/15"
          >
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDelete(roster)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/[0.06] px-3 text-[10px] font-semibold text-red-200 transition hover:border-red-300/50 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {savedAcrossLaptops ? "Delete cloud PDF" : "Remove PDF"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[.72fr_1.28fr]">
        <div className="rounded-2xl border border-[#2b506c] bg-[#081d30]/82 p-3.5" aria-live="polite">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dce8f6]">Selected month result</p>

          {!summary.periodFound ? (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3" role="status">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-[11px] leading-relaxed text-amber-100">This roster does not contain {periodLabel}.</p>
              </div>
            </div>
          ) : (
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

        <div className="rounded-2xl border border-[#2b506c] bg-[#081d30]/82 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dce8f6]">Detected overnight dates</p>
            {summary.periodFound && (
              <span className="rounded-full border border-[#34536d] bg-[#0b2942] px-2.5 py-1 text-[9px] font-semibold text-[#b9c9da]">
                {summary.nightShiftCount} N3-DC · {summary.rdotCount} NRDOT
              </span>
            )}
          </div>

          {!summary.periodFound ? (
            <div className="flex min-h-[150px] items-center justify-center text-center">
              <p className="max-w-[260px] text-[11px] leading-relaxed text-[#7f95ad]">This PDF has no dates for the selected month.</p>
            </div>
          ) : summary.entries.length ? (
            <div className="mt-3 grid max-h-[210px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-5 [scrollbar-color:#315574_transparent] [scrollbar-width:thin]">
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
    </article>
  );
}

export default function NightShiftPdfDetector({ selectedYear, selectedMonth, className = "" }) {
  const inputRef = useRef(null);
  const fallbackYearRef = useRef(selectedYear);
  const [rosters, setRosters] = useState([]);
  const [loadStatus, setLoadStatus] = useState("loading");
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [cloudStatus, setCloudStatus] = useState("loading");
  const [cloudMessage, setCloudMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const periodLabel = useMemo(
    () => getPeriodLabel(selectedYear, selectedMonth),
    [selectedMonth, selectedYear]
  );
  const savedCount = rosters.filter((roster) => roster.id).length;
  const hasPendingCloudSync = rosters.some((roster) => !roster.id || roster.needsCloudRefresh);
  const cloudHasError = cloudStatus === "error" || hasPendingCloudSync;
  const isBusy = loadStatus === "loading"
    || uploadStatus === "reading"
    || cloudStatus === "saving"
    || cloudStatus === "deleting";
  const cloudStatusLabel = cloudStatus === "loading"
    ? "Loading cloud"
    : cloudStatus === "saving"
      ? "Saving PDFs"
      : cloudStatus === "deleting"
        ? "Deleting PDF"
        : cloudHasError
          ? "Cloud sync issue"
          : savedCount
            ? `${savedCount} PDF${savedCount === 1 ? "" : "s"} saved`
            : "Cloud ready";

  const restoreFromCloud = useCallback(async () => {
    setLoadStatus("loading");
    setCloudStatus("loading");
    setCloudMessage("");

    try {
      const records = await loadSavedNightShiftRosters();
      const restored = [];
      const refreshErrors = [];

      for (const record of records) {
        const needsParserRefresh = !record.parsed
          || record.parserVersion !== NIGHT_SHIFT_ROSTER_PARSER_VERSION;
        const parsed = needsParserRefresh
          ? await parseNightShiftPdf(record.file, fallbackYearRef.current)
          : record.parsed;
        let currentRecord = { ...record, parsed };

        if (needsParserRefresh) {
          try {
            currentRecord = await saveNightShiftRoster({
              file: record.file,
              parsed,
              recordId: record.id,
            });
          } catch (error) {
            currentRecord.needsCloudRefresh = true;
            refreshErrors.push(error);
          }
        }

        restored.push(currentRecord);
      }

      setRosters(restored);
      setLoadStatus("ready");
      setCloudStatus(refreshErrors.length ? "error" : "ready");
      setCloudMessage(refreshErrors.length
        ? "Some saved PDFs were recalculated, but their cloud cache could not be refreshed. Select this badge to retry."
        : "");
    } catch (error) {
      setLoadStatus("error");
      setCloudStatus("error");
      setCloudMessage(error?.message || "Unable to load the saved PDFs from shared storage.");
    }
  }, []);

  useEffect(() => {
    restoreFromCloud();
  }, [restoreFromCloud]);

  const handleFile = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setUploadStatus("error");
      setUploadMessage("Please select a PDF roster file.");
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      setUploadStatus("error");
      setUploadMessage(`The PDF is larger than ${formatFileSize(MAX_PDF_SIZE)}. Please upload a smaller roster file for shared cloud storage.`);
      return;
    }

    setUploadStatus("reading");
    setUploadMessage("");
    setCloudStatus("saving");
    setCloudMessage("");

    try {
      const parsed = await parseNightShiftPdf(file, selectedYear);
      const localRoster = makeLocalRoster(file, parsed);

      try {
        const saved = await saveNightShiftRoster({ file, parsed });
        setRosters((current) => [saved, ...current]);
        setCloudStatus("ready");
      } catch (saveError) {
        setRosters((current) => [localRoster, ...current]);
        setCloudStatus("error");
        setCloudMessage(`${saveError?.message || "Cloud save failed."} This new result is available only on this laptop until you retry.`);
      }

      setUploadStatus("idle");
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage(error?.message || "This PDF could not be read. Please use the exported roster PDF.");
      setCloudStatus("ready");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = (roster) => {
    if (!roster.file) return;
    const url = URL.createObjectURL(roster.file);
    const link = document.createElement("a");
    link.href = url;
    link.download = roster.fileName || roster.file.name || "Night-Shift-Roster.pdf";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleRetryCloud = async () => {
    const pendingRosters = rosters.filter((roster) => !roster.id || roster.needsCloudRefresh);
    if (!pendingRosters.length) {
      await restoreFromCloud();
      return;
    }

    setCloudStatus("saving");
    setCloudMessage("");
    let nextRosters = [...rosters];
    const failures = [];

    for (const roster of pendingRosters) {
      try {
        const saved = await saveNightShiftRoster({
          file: roster.file,
          parsed: roster.parsed,
          recordId: roster.id,
        });
        const identity = getRosterIdentity(roster);
        nextRosters = nextRosters.map((current) => (
          getRosterIdentity(current) === identity ? saved : current
        ));
      } catch (error) {
        failures.push(error);
      }
    }

    setRosters(nextRosters);
    setCloudStatus(failures.length ? "error" : "ready");
    setCloudMessage(failures.length
      ? "One or more PDFs could not be saved. Select this badge to retry."
      : "");
  };

  const handleDelete = async (roster) => {
    const fileName = roster.fileName || roster.file?.name || "this PDF";
    const savedAcrossLaptops = Boolean(roster.id);
    const confirmed = window.confirm(
      savedAcrossLaptops
        ? `Delete "${fileName}" from shared cloud storage? Other laptops will stop loading this PDF after refresh. Other saved PDFs will remain.`
        : `Remove "${fileName}" from this laptop? Other saved PDFs will remain.`
    );
    if (!confirmed) return;

    const identity = getRosterIdentity(roster);
    setDeletingId(identity);
    setCloudStatus("deleting");
    setCloudMessage("");

    try {
      if (roster.id) await deleteSavedNightShiftRoster(roster.id);
      setRosters((current) => current.filter((item) => getRosterIdentity(item) !== identity));
      setCloudStatus("ready");
    } catch (error) {
      setCloudStatus("error");
      setCloudMessage(error?.message || "Unable to delete this shared PDF.");
    } finally {
      setDeletingId("");
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
            <p className="mt-1 text-[11px] text-[#9fb1c8]">Add multiple PDFs for staff ID 1000335. Every PDF gets its own result window and shared cloud copy.</p>
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
            onClick={cloudHasError ? handleRetryCloud : restoreFromCloud}
            title="Refresh all saved PDFs from shared cloud storage"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition disabled:cursor-wait disabled:opacity-70 ${cloudHasError
              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
              : savedCount
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/50"
                : "border-sky-400/25 bg-sky-500/10 text-sky-100 hover:border-sky-300/50"
            }`}
          >
            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cloud className="h-3 w-3" />}
            {cloudStatusLabel}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#2b506c] bg-[#0a2238]/88 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <FileUp className="h-4 w-4 text-sky-300" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dce8f6]">Add roster PDF</p>
              <p className="mt-1 text-[10px] text-[#8fa4bc]">Maximum {formatFileSize(MAX_PDF_SIZE)} each · adding a PDF does not replace the existing windows</p>
            </div>
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
            className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-sky-400/40 bg-sky-500/[0.06] px-4 text-[11px] font-semibold text-sky-100 transition hover:border-sky-300/65 hover:bg-sky-500/10 disabled:cursor-wait disabled:opacity-60"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {loadStatus === "loading"
              ? "Loading saved PDFs..."
              : uploadStatus === "reading"
                ? "Reading new PDF..."
                : cloudStatus === "saving"
                  ? "Saving PDFs..."
                  : rosters.length
                    ? "Add another PDF"
                    : "Choose roster PDF"}
          </button>
        </div>

        {uploadStatus === "error" && uploadMessage && (
          <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-2.5" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
              <p className="text-[10px] leading-relaxed text-red-100">{uploadMessage}</p>
            </div>
          </div>
        )}

        {cloudHasError && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5" role="status">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-relaxed text-amber-100">
                  {cloudMessage || "One or more PDFs are available locally but still need to be saved across laptops."}
                </p>
                <button
                  type="button"
                  onClick={handleRetryCloud}
                  className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-500/10 px-2.5 text-[9px] font-semibold text-amber-100 transition hover:border-amber-200/55 hover:bg-amber-500/15"
                >
                  <RefreshCw className="h-3 w-3" /> Retry cloud sync
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {loadStatus === "loading" && !rosters.length && (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-[#2b506c] bg-[#0a2238]/72 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-sky-300" />
            <p className="mt-2 text-[11px] text-[#a9bbcf]">Loading all saved PDF windows...</p>
          </div>
        )}

        {loadStatus !== "loading" && !rosters.length && (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#315574] bg-[#081d30]/55 text-center">
            <Moon className="h-6 w-6 text-[#58738f]" />
            <p className="mt-2 text-[11px] font-semibold text-[#a9bbcf]">No roster PDFs added yet</p>
            <p className="mt-1 max-w-[360px] text-[10px] leading-relaxed text-[#7f95ad]">Choose a PDF above. Every additional file will appear in a new output window without replacing the others.</p>
          </div>
        )}

        {rosters.map((roster, index) => {
          const identity = getRosterIdentity(roster);
          return (
            <NightShiftRosterWindow
              key={identity}
              roster={roster}
              index={index}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              periodLabel={periodLabel}
              isBusy={isBusy}
              isDeleting={deletingId === identity}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          );
        })}
      </div>
    </section>
  );
}
