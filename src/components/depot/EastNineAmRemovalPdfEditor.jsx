import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  addRemovalPdfDraftLogEntry,
  removeRemovalPdfDraftLogEntry,
  updateRemovalPdfDraftLogEntry,
} from "../../lib/removalPdfDraft";

function formatTrainNumber(row = {}) {
  const value = String(row?.trainsetNumber || row?.trainId || row?.key || row?.label || "")
    .replace(/^T/i, "")
    .replace(/[^0-9]/g, "");
  return value ? value.padStart(2, "0") : "";
}

function formatTrainAria(row = {}) {
  const trainNumber = formatTrainNumber(row);
  return trainNumber ? `T${trainNumber}` : "new train";
}

export default function EastNineAmRemovalPdfEditor({
  draft,
  onDraftChange,
  onBack,
  onClose,
  onReset,
  onDownload,
  getRemarkStyle,
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

  const getRemarkCssVariables = (remark = "") => {
    const style = getRemarkStyle?.(remark) || {};
    return /** @type {any} */ ({
      "--swp-remark-fill": style.fill || "#f1f5f9",
      "--swp-remark-stroke": style.stroke || "#94a3b8",
    });
  };

  const renderTable = ({ depot, label, entries, emptyText }) => (
    <section className="theme-swp-paper-section" data-pdf-section={depot === "east" ? "east" : "off-peak"}>
      <div className="theme-swp-paper-section-heading">
        <strong>{label.toUpperCase()} - Total: {entries.length}</strong>
        <button
          type="button"
          onClick={() => onDraftChange?.(addRemovalPdfDraftLogEntry(draft, depot))}
          className="theme-swp-paper-add"
          data-pdf-control="add"
          aria-label={`Add ${label} row`}
        >
          <Plus size={12} /> Add row
        </button>
      </div>

      <table className="theme-swp-editor-table theme-swp-paper-table">
        <thead>
          <tr>
            <th className="theme-swp-paper-no">No</th>
            <th className="theme-swp-paper-train">Train</th>
            <th className="theme-swp-paper-tid">TID</th>
            <th className="theme-swp-paper-time">Time</th>
            <th>Remark</th>
            <th className="theme-swp-paper-control"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {entries.length ? entries.map((entry, index) => (
            <tr key={entry.swpDraftId}>
              <td className="theme-swp-paper-row-number">{String(index + 1).padStart(2, "0")}</td>
              <td>
                <input
                  value={formatTrainNumber(entry)}
                  onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "trainId", event.target.value)}
                  inputMode="numeric"
                  aria-label={`${label} train number for ED 9AM PDF`}
                  className="theme-swp-editor-input theme-swp-paper-cell-input text-center font-bold"
                  placeholder="00"
                />
              </td>
              <td>
                <input
                  value={entry.tid || ""}
                  onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "tid", event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  inputMode="numeric"
                  aria-label={`${label} ${formatTrainAria(entry)} TID for ED 9AM PDF`}
                  className="theme-swp-editor-input theme-swp-paper-cell-input text-center"
                  placeholder="-"
                />
              </td>
              <td>
                <input
                  type="text"
                  value={entry.time || ""}
                  onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "time", event.target.value.replace(/[^0-9:]/g, "").slice(0, 5))}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="00:00"
                  aria-label={`${label} ${formatTrainAria(entry)} time for ED 9AM PDF`}
                  className="theme-swp-editor-input theme-swp-paper-cell-input text-center"
                />
              </td>
              <td>
                <input
                  value={entry.remark || ""}
                  onChange={(event) => handleFieldChange(depot, entry.swpDraftId, "remark", event.target.value)}
                  aria-label={`${label} ${formatTrainAria(entry)} remark for ED 9AM PDF`}
                  className="theme-swp-editor-input theme-swp-paper-cell-input theme-swp-paper-remark-input"
                  style={getRemarkCssVariables(entry.remark)}
                  placeholder="Remark"
                />
              </td>
              <td className="theme-swp-paper-control-cell">
                <button
                  type="button"
                  onClick={() => handleRemove(depot, entry.swpDraftId)}
                  className="theme-swp-editor-remove theme-swp-paper-remove"
                  data-pdf-control="remove"
                  aria-label={`Remove ${formatTrainAria(entry)} from ${label} ED 9AM PDF`}
                  title="Remove from ED 9AM PDF"
                >
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={6} className="theme-swp-paper-empty">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
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
        className="theme-swp-editor-window mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#071827] shadow-[0_28px_90px_rgba(0,0,0,0.58)]"
        data-pdf-editor="ed9"
      >
        <header className="theme-swp-editor-header flex flex-wrap items-center justify-between gap-3 border-b border-[#23506d] bg-[#0a2940] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="theme-swp-editor-title-icon flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-200">
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="ed-nine-am-removal-editor-title" className="text-[14px] font-black uppercase tracking-[0.16em] text-white">ED 9AM REM</h2>
              <p className="mt-0.5 text-[11px] text-[#9cc5df]">Edit directly in a preview that follows the ED 9AM PDF layout.</p>
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
            <span className="theme-swp-editor-count rounded-full border px-2 py-1">Removal {eastEntries.length}</span>
            <span className="theme-swp-editor-count rounded-full border px-2 py-1">Off peak {offPeakEntries.length}</span>
          </div>
        </div>

        <div className="theme-swp-paper-viewport min-h-0 flex-1 overflow-auto" data-pdf-viewport>
          <article className="theme-swp-paper theme-swp-paper-ed9" data-pdf-page>
            <div className="theme-swp-paper-title-row">
              <h3 className="theme-swp-paper-title">EAST DEPOT 9AM REMOVAL &amp; OFF-PEAK TRAINS</h3>
              <button type="button" onClick={onReset} className="theme-swp-paper-reset" aria-label="Reset ED 9AM copy">
                <RotateCcw size={12} /> Reset copy
              </button>
            </div>
            <div className="theme-swp-paper-layout theme-swp-paper-ed9-layout">
              {renderTable({
                depot: "east",
                label: "East Depot Removal",
                entries: eastEntries,
                emptyText: "No East Depot 9AM removal rows in this copy.",
              })}
              {renderTable({
                depot: "west",
                label: "Off-Peak Trains",
                entries: offPeakEntries,
                emptyText: "No populated off-peak trains were found.",
              })}
            </div>
          </article>
        </div>

        <footer className="theme-swp-editor-footer flex flex-wrap items-center justify-between gap-2 border-t border-[#23506d] bg-[#061421] px-4 py-3 sm:px-5">
          <p className="text-[10px] leading-relaxed text-[#789db5]">The separate allocation section is not included in this page or PDF.</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onBack} className="theme-swp-ed9-back inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold">
              <ArrowLeft size={14} /> Back to SWP
            </button>
            <button type="button" onClick={onDownload} disabled={downloading} className="theme-swp-editor-download inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300/55 bg-emerald-500/20 px-4 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-100 transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">
              <Download size={14} /> {downloading ? "Preparing..." : "Download ED 9AM REM PDF"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
