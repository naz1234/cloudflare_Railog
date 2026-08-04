import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, RotateCcw, Trash2, X } from "lucide-react";
import {
  getRemovalPdfDraftActionOptions,
  getRemovalPdfDraftGroups,
  removeRemovalPdfDraftLogEntry,
  removeRemovalPdfDraftRow,
  updateRemovalPdfDraftAction,
  updateRemovalPdfDraftLogEntry,
  updateRemovalPdfDraftRow,
} from "../../lib/removalPdfDraft";

function formatTrainNumber(row = {}) {
  const value = String(row?.trainsetNumber || row?.trainId || row?.key || row?.label || "")
    .replace(/^T/i, "")
    .replace(/[^0-9]/g, "");
  return value ? value.padStart(2, "0") : "-";
}

export default function RemovalPdfEditor({
  draft,
  onDraftChange,
  onClose,
  onReset,
  onDownload,
  onOpenEastNineAm,
  downloading = false,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const groups = getRemovalPdfDraftGroups(draft?.actionRows || []);
  const rowCount = groups.reduce((total, group) => total + group.rows.length, 0);
  const westCount = draft?.westLog?.entries?.length || 0;
  const eastCount = draft?.eastLog?.entries?.length || 0;

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

  const handleActionChange = (rowId, actionValue) => {
    onDraftChange?.(updateRemovalPdfDraftAction(draft, rowId, actionValue));
  };

  const handleFieldChange = (rowId, field, value) => {
    onDraftChange?.(updateRemovalPdfDraftRow(draft, rowId, field, value));
  };

  const handleRemove = (rowId) => {
    onDraftChange?.(removeRemovalPdfDraftRow(draft, rowId));
  };

  const handleLogFieldChange = (depot, rowId, field, value) => {
    onDraftChange?.(updateRemovalPdfDraftLogEntry(draft, depot, rowId, field, value));
  };

  const handleLogRemove = (depot, rowId) => {
    onDraftChange?.(removeRemovalPdfDraftLogEntry(draft, depot, rowId));
  };

  const renderDepotLogEditor = (depot, label) => {
    const logKey = depot === "east" ? "eastLog" : "westLog";
    const entries = Array.isArray(draft?.[logKey]?.entries) ? draft[logKey].entries : [];

    return (
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
                  <th className="w-[50px] px-1 py-1.5 text-center">Train</th>
                  <th className="w-[54px] px-1 py-1.5 text-center">TID</th>
                  <th className="w-[98px] px-1 py-1.5 text-center">Time</th>
                  <th className="px-1 py-1.5 text-left">Remark</th>
                  <th className="w-[46px] px-1 py-1.5 text-center">Remove</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.swpDraftId}>
                    <td className="px-1 py-1">
                      <input
                        value={formatTrainNumber(entry)}
                        onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "trainId", event.target.value)}
                        inputMode="numeric"
                        aria-label={`${label} train number for edited PDF`}
                        className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                        placeholder="00"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={entry.tid || ""}
                        onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "tid", event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                        inputMode="numeric"
                        aria-label={`${label} T${formatTrainNumber(entry)} TID for edited PDF`}
                        className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                        placeholder="-"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="time"
                        value={entry.time || ""}
                        onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "time", event.target.value)}
                        aria-label={`${label} T${formatTrainNumber(entry)} time for edited PDF`}
                        className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        value={entry.remark || ""}
                        onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "remark", event.target.value)}
                        aria-label={`${label} T${formatTrainNumber(entry)} remark for edited PDF`}
                        className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-2 text-[11px] font-semibold text-white outline-none transition-colors focus:border-cyan-400"
                        placeholder="Remark"
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleLogRemove(depot, entry.swpDraftId)}
                        className="theme-swp-editor-remove inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-400/45 bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/25"
                        aria-label={`Remove T${formatTrainNumber(entry)} from ${label} edited PDF table`}
                        title="Remove from edited PDF"
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
          <p className="px-3 py-5 text-center text-[9px] text-[#6f94ab]">No {label} rows in this edited copy.</p>
        )}
      </section>
    );
  };

  return createPortal(
    <div className="theme-swp-editor fixed inset-0 z-[20000] flex bg-[#020b13]/90 p-2 backdrop-blur-sm sm:p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swp-pdf-editor-title"
        tabIndex={-1}
        className="theme-swp-editor-window mx-auto flex h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#071827] shadow-[0_28px_90px_rgba(0,0,0,0.58)]"
      >
        <header className="theme-swp-editor-header flex flex-wrap items-center justify-between gap-3 border-b border-[#23506d] bg-[#0a2940] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="theme-swp-editor-title-icon flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-200">
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="swp-pdf-editor-title" className="text-[14px] font-black uppercase tracking-[0.16em] text-white">
                SWP PDF Editor
              </h2>
              <p className="mt-0.5 text-[11px] text-[#9cc5df]">
                Review, remove, or transfer requested trains before downloading a separate PDF.
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="theme-swp-editor-close inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-900/45 px-2.5 text-[10px] font-bold text-slate-200 transition-colors hover:border-red-400/70 hover:bg-red-950/40 hover:text-red-200"
            aria-label="Close SWP PDF Editor"
          >
            <X size={14} /> Close
          </button>
        </header>

        <div className="theme-swp-editor-notice mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-3 py-2 sm:mx-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200">Edited copy only</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-100/85">
              Changes here never update the Removal Summary, live records, or the normal PDF button.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">
            <span className="theme-swp-editor-count rounded-full border border-blue-400/35 bg-blue-400/10 px-2 py-1 text-blue-200">West {westCount}</span>
            <span className="theme-swp-editor-count rounded-full border border-violet-400/35 bg-violet-400/10 px-2 py-1 text-violet-200">East {eastCount}</span>
            <span className="theme-swp-editor-count rounded-full border border-cyan-400/35 bg-cyan-400/10 px-2 py-1 text-cyan-200">Requested {rowCount}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
          <div className="mb-3">
            <h3 className="theme-swp-editor-section-title text-[12px] font-black uppercase tracking-[0.14em] text-white">Removal tables</h3>
            <p className="mt-0.5 text-[10px] text-[#83a9c2]">Edit or remove the West and East rows shown on the left side of this PDF copy.</p>
          </div>

          <div className="grid min-w-0 gap-2 xl:grid-cols-2">
            {renderDepotLogEditor("west", "West Depot")}
            {renderDepotLogEditor("east", "East Depot")}
          </div>

          <div className="mb-3 mt-5 flex flex-wrap items-end justify-between gap-2 border-t border-[#224a65] pt-4">
            <div>
              <h3 className="theme-swp-editor-section-title text-[12px] font-black uppercase tracking-[0.14em] text-white">Requested train allocation</h3>
              <p className="mt-0.5 text-[10px] text-[#83a9c2]">Changing an action moves the train into that group and reconciles its linked West removal row. Deleting an allocation keeps its Removal Table entry.</p>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="theme-swp-editor-reset inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 text-[9px] font-bold text-amber-200 transition-colors hover:bg-amber-400/20"
            >
              <RotateCcw size={12} /> Reset from summary
            </button>
          </div>

          {groups.length ? (
            <div className="space-y-3">
              {groups.map((group) => (
                <section key={group.value} className="theme-swp-editor-group overflow-hidden rounded-xl border border-[#224a65] bg-[#061421]">
                  <div className="theme-swp-editor-group-header flex items-center justify-between gap-2 border-b border-[#224a65] bg-[#0a2438] px-3 py-2">
                    <span className="theme-swp-editor-action-pill rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em]" data-action={group.value}>
                      {group.label}
                    </span>
                    <span className="theme-swp-editor-group-count text-[10px] font-bold text-[#7fa5bd]">{group.rows.length} {group.rows.length === 1 ? "train" : "trains"}</span>
                  </div>

                  <div className="min-w-0 overflow-x-hidden">
                    <table className="theme-swp-editor-table w-full min-w-0 table-fixed border-collapse">
                      <thead>
                        <tr>
                          <th className="w-[56px] px-1 py-1.5 text-center">Train</th>
                          <th className="w-[64px] px-1 py-1.5 text-center">TID</th>
                          <th className="px-1 py-1.5 text-left">Remark request</th>
                          <th className="w-[155px] px-1 py-1.5 text-left">Allocation</th>
                          <th className="w-[46px] px-1 py-1.5 text-center">Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.swpDraftId}>
                            <td className="px-1 py-1 text-center text-[12px] font-black text-white">T{formatTrainNumber(row)}</td>
                            <td className="px-1 py-1">
                              <input
                                value={row.tid || ""}
                                onChange={(event) => handleFieldChange(row.swpDraftId, "tid", event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                                inputMode="numeric"
                                aria-label={`T${formatTrainNumber(row)} TID for edited PDF`}
                                className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1 text-center text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                                placeholder="-"
                              />
                            </td>
                            <td className="px-1 py-1">
                              <input
                                value={row.requestType || ""}
                                onChange={(event) => handleFieldChange(row.swpDraftId, "requestType", event.target.value)}
                                aria-label={`T${formatTrainNumber(row)} remark for edited PDF`}
                                className="theme-swp-editor-input h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-2 text-[11px] font-semibold text-white outline-none transition-colors focus:border-cyan-400"
                                placeholder="Remark request"
                              />
                            </td>
                            <td className="px-1 py-1">
                              <select
                                value={row.swpDraftActionValue}
                                onChange={(event) => handleActionChange(row.swpDraftId, event.target.value)}
                                aria-label={`T${formatTrainNumber(row)} allocation for edited PDF`}
                                className="theme-swp-editor-select h-7 w-full rounded-lg border border-[#2b5875] bg-[#071b2b] px-1.5 text-[11px] font-bold text-white outline-none transition-colors focus:border-cyan-400"
                              >
                                {getRemovalPdfDraftActionOptions(row).map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemove(row.swpDraftId)}
                                className="theme-swp-editor-remove inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-400/45 bg-red-500/10 text-red-200 transition-colors hover:bg-red-500/25"
                                aria-label={`Remove T${formatTrainNumber(row)} from Requested Train Allocation only`}
                                title="Remove from Requested Train Allocation only"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="theme-swp-editor-empty flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[#315a74] bg-[#061421] px-4 text-center">
              <FileText size={24} className="text-[#557f99]" />
              <p className="mt-3 text-[11px] font-bold text-[#a8c3d4]">No requested train rows remain</p>
              <p className="mt-1 text-[9px] text-[#6f94ab]">You can still download the edited PDF with the West and East removal tables.</p>
            </div>
          )}
        </div>

        <footer className="theme-swp-editor-footer flex flex-wrap items-center justify-between gap-2 border-t border-[#23506d] bg-[#061421] px-4 py-3 sm:px-5">
          <p className="text-[10px] leading-relaxed text-[#789db5]">The downloaded filename includes “edited” so it stays separate from the normal report.</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="theme-swp-editor-cancel inline-flex h-9 items-center rounded-lg border border-slate-500/50 bg-slate-900/40 px-4 text-[10px] font-bold text-slate-200 hover:bg-slate-800/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onOpenEastNineAm}
              className="theme-swp-ed9-open inline-flex h-9 items-center gap-2 rounded-lg border border-violet-300/55 bg-violet-500/20 px-4 text-[10px] font-black uppercase tracking-[0.08em] text-violet-100 shadow-[0_0_18px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:bg-violet-500/30"
            >
              <FileText size={14} /> ED 9AM REM
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="theme-swp-editor-download inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300/55 bg-emerald-500/20 px-4 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.16)] transition-all hover:-translate-y-0.5 hover:bg-emerald-500/30 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <Download size={14} /> {downloading ? "Preparing..." : "Download edited PDF"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
