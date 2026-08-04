import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, FileText, RotateCcw, Trash2, X } from "lucide-react";
import {
  removeRemovalPdfDraftLogEntry,
  updateRemovalPdfDraftLogEntry,
} from "../../lib/removalPdfDraft";

function formatTrainNumber(row = {}) {
  const value = String(row?.trainsetNumber || row?.trainId || row?.key || row?.label || "")
    .replace(/^T/i, "")
    .replace(/[^0-9]/g, "");
  return value ? value.padStart(2, "0") : "-";
}

export default function EastNineAmRemovalPdfEditor({
  draft,
  onDraftChange,
  onBack,
  onClose,
  onReset,
  onDownload,
  downloading = false,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const eastEntries = Array.isArray(draft?.eastLog?.entries) ? draft.eastLog.entries : [];
  const offPeakEntries = Array.isArray(draft?.westLog?.entries) ? draft.westLog.entries : [];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!draft || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backgroundRoot = document.getElementById("root");
    const previousRootInert = backgroundRoot?.inert;
    const previousAriaHidden = backgroundRoot?.getAttribute("aria-hidden");
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const getFocusableElements = () => Array.from(
      dialogRef.current?.querySelectorAll(focusableSelector) || [],
    ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (!focusableElements.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === firstElement || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    if (backgroundRoot) {
      backgroundRoot.inert = true;
      backgroundRoot.setAttribute("aria-hidden", "true");
    }
    window.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      (closeButtonRef.current || dialogRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (backgroundRoot) {
        backgroundRoot.inert = Boolean(previousRootInert);
        if (previousAriaHidden === null) backgroundRoot.removeAttribute("aria-hidden");
        else backgroundRoot.setAttribute("aria-hidden", previousAriaHidden);
      }
      previousActiveElement?.focus?.();
    };
  }, [Boolean(draft)]);

  if (!draft || typeof document === "undefined") return null;

  const handleFieldChange = (depot, rowId, field, value) => {
    onDraftChange?.(updateRemovalPdfDraftLogEntry(draft, depot, rowId, field, value));
  };

  const handleRemove = (depot, rowId) => {
    onDraftChange?.(removeRemovalPdfDraftLogEntry(draft, depot, rowId));
  };

  const renderTable = ({
    depot,
    label,
    entries,
    showTime,
    emptyText,
  }) => (
    <section className="theme-swp-editor-group min-w-0 overflow-hidden rounded-xl border border-[#224a65] bg-[#061421]">
      <div className="theme-swp-editor-group-header flex items-center justify-between gap-2 border-b border-[#224a65] bg-[#0a2438] px-3 py-2">
        <span className="theme-swp-editor-depot-label text-[10px] font-black uppercase tracking-[0.1em] text-white">{label}</span>
        <span className="theme-swp-editor-group-count text-[10px] font-bold text-[#7fa5bd]">{entries.length} {entries.length === 1 ? "row" : "rows"}</span>
      </div>

      {entries.length ? (
        <div className="min-w-0 overflow-x-hidden">
          <table className="theme-swp-editor-table w-full min-w-0 table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-[58px] px-1 py-1.5 text-center">Train</th>
                <th className="w-[62px] px-1 py-1.5 text-center">TID</th>
                {showTime && <th className="w-[104px] px-1 py-1.5 text-center">Time</th>}
                <th className="px-1 py-1.5 text-left">Remark</th>
                <th className="w-[48px] px-1 py-1.5 text-center">Remove</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.swpDraftId}>
                  <td className="px-1 py-1">
                    <input
                      value={formatTrainNumber(entry)}
                      onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "trainId", event.target.value)}
                      inputMode="numeric"
                      aria-label={`${label} train number for ED 9AM PDF`}
                      className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                      placeholder="00"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={entry.tid || ""}
                      onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "tid", event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                      inputMode="numeric"
                      aria-label={`${label} T${formatTrainNumber(entry)} TID for ED 9AM PDF`}
                      className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                      placeholder="-"
                    />
                  </td>
                  {showTime && (
                    <td className="px-1 py-1">
                      <input
                        type="time"
                        value={entry.time || ""}
                        onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "time", event.target.value)}
                        aria-label={`${label} T${formatTrainNumber(entry)} time for ED 9AM PDF`}
                        className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                      />
                    </td>
                  )}
                  <td className="px-1 py-1">
                    <input
                      value={entry.remark || ""}
                      onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "remark", event.target.value)}
                      aria-label={`${label} T${formatTrainNumber(entry)} remark for ED 9AM PDF`}
                      className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-2 text-[11px] font-semibold text-white outline-none transition-colors focus:border-cyan-400"
                      placeholder="Remark"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemove(depot, entry.swpDraftId)}
                      className="theme-swp-editor-remove inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-400/45 bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/25"
                      aria-label={`Remove T${formatTrainNumber(entry)} from ${label} ED 9AM PDF`}
                      title="Remove from ED 9AM PDF"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-5 text-center text-[9px] text-[#6f94ab]">{emptyText}</p>
      )}
    </section>
  );

  return createPortal(
    <div className="theme-swp-editor fixed inset-0 z-[20000] flex bg-[#020b13]/90 p-2 backdrop-blur-sm sm:p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ed-nine-am-removal-editor-title"
        tabIndex={-1}
        className="theme-swp-editor-window mx-auto flex h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#071827] shadow-[0_28px_90px_rgba(0,0,0,0.58)]"
      >
        <header className="theme-swp-editor-header flex flex-wrap items-center justify-between gap-3 border-b border-[#23506d] bg-[#0a2940] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="theme-swp-editor-title-icon flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-200">
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="ed-nine-am-removal-editor-title" className="text-[14px] font-black uppercase tracking-[0.16em] text-white">ED 9AM REM</h2>
              <p className="mt-0.5 text-[11px] text-[#9cc5df]">Edit East Depot removal and off-peak trains before downloading a separate PDF.</p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="theme-swp-editor-close inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-900/45 px-2.5 text-[10px] font-bold text-slate-200 transition-colors hover:border-red-400/70 hover:bg-red-950/40 hover:text-red-200"
            aria-label="Close ED 9AM REM Editor"
          >
            <X size={14} /> Close
          </button>
        </header>

        <div className="theme-swp-editor-notice mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-3 py-2 sm:mx-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200">East 9AM copy only</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-100/85">Changes stay separate from SWP, Removal Summary, and the normal PDF.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">
            <span className="theme-swp-editor-count rounded-full border border-cyan-400/35 bg-cyan-400/10 px-2 py-1 text-cyan-200">Removal {eastEntries.length}</span>
            <span className="theme-swp-editor-count rounded-full border border-violet-400/35 bg-violet-400/10 px-2 py-1 text-violet-200">Off peak {offPeakEntries.length}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="theme-swp-editor-section-title text-[12px] font-black uppercase tracking-[0.14em] text-white">Removal tables</h3>
              <p className="mt-0.5 text-[10px] text-[#83a9c2]">East Depot trains scheduled for the 9AM removal.</p>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="theme-swp-editor-reset inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 text-[9px] font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
            >
              <RotateCcw size={12} /> Reset ED 9AM copy
            </button>
          </div>

          {renderTable({
            depot: "east",
            label: "East Depot",
            entries: eastEntries,
            showTime: true,
            emptyText: "No East Depot 9AM removal rows in this copy.",
          })}

          <div className="mb-3 mt-5 border-t border-[#224a65] pt-4">
            <h3 className="theme-swp-editor-section-title text-[12px] font-black uppercase tracking-[0.14em] text-white">Off peak tables</h3>
            <p className="mt-0.5 text-[10px] text-[#83a9c2]">Populated 9AM reference trains whose TIDs are not scheduled for West or East removal.</p>
          </div>

          {renderTable({
            depot: "west",
            label: "Off-Peak Trains",
            entries: offPeakEntries,
            showTime: false,
            emptyText: "No populated off-peak trains were found.",
          })}
        </div>

        <footer className="theme-swp-editor-footer flex flex-wrap items-center justify-between gap-2 border-t border-[#23506d] bg-[#061421] px-4 py-3 sm:px-5">
          <p className="text-[10px] leading-relaxed text-[#789db5]">The separate allocation section is not included in this page or PDF.</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onBack}
              className="theme-swp-ed9-back inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-900/40 px-3 text-[10px] font-bold text-slate-200 hover:bg-slate-800/70"
            >
              <ArrowLeft size={14} /> Back to SWP
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="theme-swp-editor-download inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300/55 bg-emerald-500/20 px-4 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.16)] transition-all hover:-translate-y-0.5 hover:bg-emerald-500/30 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <Download size={14} /> {downloading ? "Preparing..." : "Download ED 9AM REM PDF"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
