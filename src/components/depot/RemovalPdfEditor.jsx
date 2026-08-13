import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Download, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  addRemovalPdfDraftLogEntry,
  addRemovalPdfDraftRow,
  filterRemovalPdfDraftActionRows,
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
  return value ? value.padStart(2, "0") : "";
}

function formatTrainAria(row = {}) {
  const trainNumber = formatTrainNumber(row);
  return trainNumber ? `T${trainNumber}` : "new train";
}

function AllocationSelect({ row, onChange }) {
  const options = getRemovalPdfDraftActionOptions(row);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === row.swpDraftActionValue));
  const selectedOption = options[selectedIndex] || options[0];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [placement, setPlacement] = useState("bottom");
  const controlId = useId().replace(/:/g, "");
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);

  const openMenu = (nextIndex = selectedIndex) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    const menuHeight = options.length * 27 + 10;
    const spaceBelow = rect ? window.innerHeight - rect.bottom : menuHeight;
    setPlacement(spaceBelow < menuHeight && (rect?.top || 0) > menuHeight ? "top" : "bottom");
    setActiveIndex(Math.max(0, nextIndex));
    setOpen(true);
  };

  const chooseOption = (option) => {
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const handleKeyDown = (event) => {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? options.length - 1 : selectedIndex);
      return;
    }
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseOption(options[activeIndex]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div
      className="theme-swp-allocation"
      data-open={open ? "true" : "false"}
      data-placement={placement}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className="theme-swp-allocation-trigger"
        data-action={selectedOption?.value || "removal"}
        data-pdf-control="allocation"
        aria-label={`${formatTrainAria(row)} allocation for edited PDF`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${controlId}-menu`}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className="theme-swp-allocation-dot" aria-hidden="true" />
        <span className="theme-swp-allocation-label">{selectedOption?.label || "Allocation"}</span>
        <ChevronDown className="theme-swp-allocation-chevron" size={12} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={`${controlId}-menu`}
          role="listbox"
          aria-label={`${formatTrainAria(row)} allocation options`}
          className="theme-swp-allocation-menu"
        >
          {options.map((option, index) => {
            const selected = option.value === selectedOption?.value;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={index === activeIndex ? 0 : -1}
                className="theme-swp-allocation-option"
                data-action={option.value}
                data-active={index === activeIndex ? "true" : "false"}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
              >
                <span className="theme-swp-allocation-dot" aria-hidden="true" />
                <span>{option.label}</span>
                {selected && <Check className="theme-swp-allocation-check" size={12} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RemovalPdfEditor({
  draft,
  onDraftChange,
  onClose,
  onResetRequested,
  onDownload,
  onOpenEastNineAm,
  getRemarkStyle,
  downloading = false,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [showShiftRemovals, setShowShiftRemovals] = useState(false);
  const allRequestedRows = Array.isArray(draft?.actionRows) ? draft.actionRows : [];
  const visibleActionRows = filterRemovalPdfDraftActionRows(allRequestedRows, {
    includeShiftRemovals: showShiftRemovals,
  });
  const groups = getRemovalPdfDraftGroups(visibleActionRows);
  const requestedRows = groups.flatMap((group) => group.rows);
  const hiddenShiftRemovalCount = allRequestedRows.length - visibleActionRows.length;
  const rowCount = requestedRows.length;
  const pendingWashingCount = requestedRows.filter((row) => /\bwash(?:ing)?\b/i.test(row?.requestType || "")).length;
  const westCount = draft?.westLog?.entries?.length || 0;
  const eastCount = draft?.eastLog?.entries?.length || 0;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (draft) setShowShiftRemovals(false);
  }, [Boolean(draft)]);

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

  const getRemarkCssVariables = (remark = "") => {
    const style = getRemarkStyle?.(remark) || {};
    return /** @type {any} */ ({
      "--swp-remark-fill": style.fill || "#f1f5f9",
      "--swp-remark-stroke": style.stroke || "#94a3b8",
    });
  };

  const renderDepotLogEditor = (depot, label) => {
    const logKey = depot === "east" ? "eastLog" : "westLog";
    const entries = Array.isArray(draft?.[logKey]?.entries) ? draft[logKey].entries : [];

    return (
      <section className="theme-swp-paper-section" data-pdf-section={depot}>
        <div className="theme-swp-paper-section-heading">
          <div>
            <strong>{label.toUpperCase()} - Total: {entries.length}</strong>
          </div>
          <button
            type="button"
            onClick={() => onDraftChange?.(addRemovalPdfDraftLogEntry(draft, depot))}
            className="theme-swp-paper-add"
            data-pdf-control="add"
            aria-label={`Add ${label} removal row`}
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
                    onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "trainId", event.target.value)}
                    inputMode="numeric"
                    aria-label={`${label} train number for edited PDF`}
                    className="theme-swp-editor-input theme-swp-paper-cell-input text-center font-bold"
                    placeholder="00"
                  />
                </td>
                <td>
                  <input
                    value={entry.tid || ""}
                    onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "tid", event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    inputMode="numeric"
                    aria-label={`${label} ${formatTrainAria(entry)} TID for edited PDF`}
                    className="theme-swp-editor-input theme-swp-paper-cell-input text-center"
                    placeholder="-"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={entry.time || ""}
                    onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "time", event.target.value.replace(/[^0-9:]/g, "").slice(0, 5))}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="00:00"
                    aria-label={`${label} ${formatTrainAria(entry)} time for edited PDF`}
                    className="theme-swp-editor-input theme-swp-paper-cell-input text-center"
                  />
                </td>
                <td>
                  <input
                    value={entry.remark || ""}
                    onChange={(event) => handleLogFieldChange(depot, entry.swpDraftId, "remark", event.target.value)}
                    aria-label={`${label} ${formatTrainAria(entry)} remark for edited PDF`}
                    className="theme-swp-editor-input theme-swp-paper-cell-input theme-swp-paper-remark-input"
                    style={getRemarkCssVariables(entry.remark)}
                    placeholder="Remark"
                  />
                </td>
                <td className="theme-swp-paper-control-cell">
                  <button
                    type="button"
                    onClick={() => handleLogRemove(depot, entry.swpDraftId)}
                    className="theme-swp-editor-remove theme-swp-paper-remove"
                    data-pdf-control="remove"
                    aria-label={`Remove ${formatTrainAria(entry)} from ${label} edited PDF table`}
                    title="Remove from edited PDF"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="theme-swp-paper-empty">No {label} rows in this edited copy.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    );
  };

  return createPortal(
    <div className="theme-swp-editor fixed inset-0 z-[20000] flex p-2 backdrop-blur-sm sm:p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swp-pdf-editor-title"
        tabIndex={-1}
        className="theme-swp-editor-window mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border shadow-[0_28px_90px_rgba(0,0,0,0.58)]"
        data-pdf-editor="swp"
      >
        <header className="theme-swp-editor-header flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="theme-swp-editor-title-icon flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border">
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="swp-pdf-editor-title" className="text-[14px] font-black uppercase tracking-[0.16em] text-white">DC PDF Editor</h2>
              <p className="mt-0.5 text-[11px]">Edit directly in a preview that follows the downloaded PDF layout.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="theme-swp-editor-close inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-900/45 px-2.5 text-[10px] font-bold text-slate-200 transition-colors hover:border-red-400/70 hover:bg-red-950/40 hover:text-red-200"
            aria-label="Close DC PDF Editor"
          >
            <X size={14} /> Close
          </button>
        </header>

        <div className="theme-swp-editor-notice mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 sm:mx-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.12em]">Edited copy only</div>
            <p className="mt-0.5 text-[11px] leading-relaxed">
              Changes here never update the Removal Summary, live records, or the normal PDF button.
              <span className="mt-0.5 block">Removal Tables and Requested Train Allocation stay independent in this edited copy.</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">
            <span className="theme-swp-editor-count rounded-full border px-2 py-1">West {westCount}</span>
            <span className="theme-swp-editor-count rounded-full border px-2 py-1">East {eastCount}</span>
            <span className="theme-swp-editor-count rounded-full border px-2 py-1">Requested {rowCount}</span>
          </div>
        </div>

        <div className="theme-swp-paper-viewport min-h-0 flex-1 overflow-auto" data-pdf-viewport>
          <article className="theme-swp-paper" data-pdf-page>
            <h3 className="theme-swp-paper-title">DEPOT REMOVAL SUMMARY</h3>
            <div className="theme-swp-paper-layout">
              <div className="theme-swp-paper-column">
                {renderDepotLogEditor("west", "West Depot")}
                {renderDepotLogEditor("east", "East Depot")}
              </div>

              <section className="theme-swp-paper-requested" data-pdf-section="requested">
                <div className="theme-swp-paper-section-heading theme-swp-paper-requested-heading">
                  <div>
                    <strong>REQUESTED TRAIN - Total: {rowCount}</strong>
                    <span>PENDING WASHING - Total: {pendingWashingCount}</span>
                  </div>
                  <div className="theme-swp-paper-heading-actions">
                    {hiddenShiftRemovalCount > 0 || showShiftRemovals ? (
                      <button
                        type="button"
                        className="theme-swp-paper-shift-toggle"
                        data-pdf-control="shift-removals"
                        aria-pressed={showShiftRemovals}
                        onClick={() => setShowShiftRemovals((visible) => !visible)}
                      >
                        {showShiftRemovals ? "Hide shift removals" : `Show shift removals (${hiddenShiftRemovalCount})`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDraftChange?.(addRemovalPdfDraftRow(draft))}
                      className="theme-swp-paper-add"
                      data-pdf-control="add"
                      aria-label="Add requested train allocation row"
                    >
                      <Plus size={12} /> Add train
                    </button>
                    <button
                      type="button"
                      onClick={onResetRequested}
                      aria-label="Reset Requested Train Allocation only"
                      title="Reset Requested Train Allocation only"
                      className="theme-swp-paper-reset"
                    >
                      <RotateCcw size={12} /> Reset
                    </button>
                  </div>
                </div>

                {groups.length > 0 && (
                  <div className="theme-swp-paper-request-summary" aria-label="Requested train summary">
                    {groups.map((group) => (
                      <div key={group.value} className="theme-swp-paper-request-summary-row">
                        <span className="theme-swp-editor-action-pill" data-action={group.value}>{group.label}</span>
                        <span>:</span>
                        <span>{group.rows.map((row) => `T${formatTrainNumber(row) || "--"}`).join(", ")}</span>
                      </div>
                    ))}
                  </div>
                )}

                <table className="theme-swp-editor-table theme-swp-paper-table theme-swp-paper-request-table">
                  <thead>
                    <tr>
                      <th className="theme-swp-paper-train">Train</th>
                      <th className="theme-swp-paper-tid">TID</th>
                      <th>Remark request</th>
                      <th className="theme-swp-paper-allocation">Allocation</th>
                      <th className="theme-swp-paper-control"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestedRows.length ? requestedRows.map((row) => (
                      <tr key={row.swpDraftId}>
                        <td>
                          <input
                            value={formatTrainNumber(row)}
                            onChange={(event) => handleFieldChange(row.swpDraftId, "trainsetNumber", event.target.value)}
                            inputMode="numeric"
                            aria-label={`${formatTrainAria(row)} train number for edited PDF`}
                            className="theme-swp-editor-input theme-swp-paper-cell-input text-center font-bold"
                            placeholder="00"
                          />
                        </td>
                        <td>
                          <input
                            value={row.tid || ""}
                            onChange={(event) => handleFieldChange(row.swpDraftId, "tid", event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                            inputMode="numeric"
                            aria-label={`${formatTrainAria(row)} TID for edited PDF`}
                            className="theme-swp-editor-input theme-swp-paper-cell-input text-center"
                            placeholder="-"
                          />
                        </td>
                        <td>
                          <input
                            value={row.requestType || ""}
                            onChange={(event) => handleFieldChange(row.swpDraftId, "requestType", event.target.value)}
                            aria-label={`${formatTrainAria(row)} remark for edited PDF`}
                            className="theme-swp-editor-input theme-swp-paper-cell-input theme-swp-paper-remark-input"
                            style={getRemarkCssVariables(row.requestType)}
                            placeholder="Remark request"
                          />
                        </td>
                        <td className="theme-swp-paper-allocation-cell">
                          <AllocationSelect
                            row={row}
                            onChange={(actionValue) => handleActionChange(row.swpDraftId, actionValue)}
                          />
                        </td>
                        <td className="theme-swp-paper-control-cell">
                          <button
                            type="button"
                            onClick={() => handleRemove(row.swpDraftId)}
                            className="theme-swp-editor-remove theme-swp-paper-remove"
                            data-pdf-control="remove"
                            aria-label={`Remove ${formatTrainAria(row)} from Requested Train Allocation only`}
                            title="Remove from Requested Train Allocation only"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="theme-swp-paper-empty">
                          {hiddenShiftRemovalCount > 0
                            ? "Shift removal rows are hidden. Use Show shift removals to display them."
                            : "No requested train rows remain. Use Add train to create one."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>
          </article>
        </div>

        <footer className="theme-swp-editor-footer flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-5">
          <p className="text-[10px] leading-relaxed">The downloaded filename includes “edited” so it stays separate from the normal report.</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="theme-swp-editor-cancel inline-flex h-9 items-center rounded-lg border px-4 text-[10px] font-bold">Cancel</button>
            <button type="button" onClick={onOpenEastNineAm} className="theme-swp-ed9-open inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[10px] font-black uppercase tracking-[0.08em] transition-all hover:-translate-y-0.5">
              <FileText size={14} /> ED 9AM REM
            </button>
            <button type="button" onClick={() => onDownload?.({ includeShiftRemovals: showShiftRemovals })} disabled={downloading} className="theme-swp-editor-download inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[10px] font-black uppercase tracking-[0.08em] transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">
              <Download size={14} /> {downloading ? "Preparing..." : "Download edited PDF"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
