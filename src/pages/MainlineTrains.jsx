import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const NAV_LINKS = [
  { to: "/", label: "Train Log" },
  { to: "/depot-stabling", label: "Depot Stabling" },
  { to: "/possession", label: "Possession" },
];

// Mainline table removed — west/east only

const WEST_ROWS = 20;
const EAST_ROWS = 14;

const TID_PRESETS = {
  west: [
    {
      label: "Removal (from 9am)",
      tids: [212, 214, 216, 218, 220, 102, 104, 106, 108, 110],
    },
    {
      label: "Removal (from 7pm)",
      tids: [213, 215, 217, 219, 101, 103, 105, 107, 109, 111, 113, 115, 117, 119, 201, 203, 205],
    },
    {
      label: "Removal (from 12am)",
      tids: [122, 123, 124, 125, 126, 127, 128, 129, 130, 221],
    },
    {
      label: "Removal (Friday)",
      tids: [102, 103, 104, 105, 106, 107, 108, 109, 110, 201],
    },
    {
      label: "Removal (SAT)",
      tids: [107, 108, 109, 110, 201, 202, 203, 204, 205, 206],
    },
  ],
  east: [
    {
      label: "Removal (from 9am)",
      tids: [112, 114, 116, 118, 120, 202, 204, 206, 208, 210],
    },
    {
      label: "Removal (from 7pm)",
      tids: [207, 209, 211],
    },
    {
      label: "Removal (from 12am)",
      tids: [222, 223, 224, 225, 226, 227, 228, 229, 230, 121],
    },
    {
      label: "Removal (Friday)",
      tids: [202, 203, 204, 205, 206, 207, 208, 209, 210, 101],
    },
    {
      label: "Removal (SAT)",
      tids: [207, 208, 209, 210, 101, 102, 103, 104, 105, 106],
    },
  ],
};

function emptyRows(count) {
  return Array.from({ length: count }, () => ({ trainId: "", tid: "" }));
}

function fillRows(dbRows, count) {
  const result = emptyRows(count);
  dbRows.forEach((r) => {
    if (r.rowIndex >= 0 && r.rowIndex < count) {
      result[r.rowIndex] = { trainId: r.trainId || "", tid: r.tid || "" };
    }
  });
  return result;
}

const COLS = ["trainId", "tid"];

function TrainTable({ title, titleBg, tableKey, data, setData, saveTimers, persistTable, dataRef, isDirty, tidBg = "#fbbf24", onClear, scrollable = true, presets = [], mainlineRows = null }) {
  const rows = data[tableKey];

  const [selection, setSelection] = useState(null); // { startRow, startCol, endRow, endCol }
  const [activeCell, setActiveCell] = useState(null); // { row, col }
  const [dragging, setDragging] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  const isDragging = useRef(false);
  const dragStart = useRef(null);
  const tableRef = useRef(null);
  const inputRefs = useRef({});

  const [dupWarning, setDupWarning] = useState(null); // { row, col }

  const handleChange = (i, field, value) => {
    setDupWarning(null);
    isDirty.current[tableKey] = true;
    setData((prev) => {
      const updatedRows = prev[tableKey].map((row, idx) =>
        idx === i ? { ...row, [field]: value } : row
      );
      return { ...prev, [tableKey]: updatedRows };
    });
    if (saveTimers.current[tableKey]) clearTimeout(saveTimers.current[tableKey]);
    saveTimers.current[tableKey] = setTimeout(() => {
      saveTimers.current[tableKey] = null;
      persistTable(tableKey, dataRef.current[tableKey]);
    }, 1500);
  };

  const handleBlur = (i, field, value) => {
    const keysToCheck = ["west", "east"];
    const allRows = keysToCheck.flatMap((key) =>
      (dataRef.current[key] || []).map((row, idx) => ({ ...row, _key: key, _idx: idx }))
    );
    const isDuplicate = value.trim() !== "" && allRows.some(({ trainId, tid, _key, _idx }) => {
      if (_key === tableKey && _idx === i) return false;
      const fieldValue = field === "trainId" ? (trainId || "") : (tid || "");
      return fieldValue.trim() === value.trim();
    });
    if (isDuplicate) {
      setDupWarning({ row: i, col: COLS.indexOf(field) });
      setTimeout(() => setDupWarning(null), 1500);
      setData((prev) => {
        const updatedRows = prev[tableKey].map((row, idx) =>
          idx === i ? { ...row, [field]: "" } : row
        );
        return { ...prev, [tableKey]: updatedRows };
      });
      if (saveTimers.current[tableKey]) clearTimeout(saveTimers.current[tableKey]);
      saveTimers.current[tableKey] = setTimeout(() => {
        saveTimers.current[tableKey] = null;
        persistTable(tableKey, dataRef.current[tableKey]);
      }, 1500);
    }
    // No flush on normal blur — let the debounce timer handle it naturally
  };

  const normalizeSelection = (s) => {
    if (!s) return null;
    return {
      startRow: Math.min(s.startRow, s.endRow),
      endRow: Math.max(s.startRow, s.endRow),
      startCol: Math.min(s.startCol, s.endCol),
      endCol: Math.max(s.startCol, s.endCol),
    };
  };

  const isCellSelected = (row, col) => {
    const s = normalizeSelection(selection);
    if (!s) return false;
    return row >= s.startRow && row <= s.endRow && col >= s.startCol && col <= s.endCol;
  };

  const isActiveCell = (row, col) =>
    activeCell && activeCell.row === row && activeCell.col === col;

  // ── Copy ──────────────────────────────────────────────
  const copySelection = useCallback(() => {
    const s = normalizeSelection(selection);
    if (!s) return;
    const lines = [];
    for (let r = s.startRow; r <= s.endRow; r++) {
      const cells = [];
      for (let c = s.startCol; c <= s.endCol; c++) {
        cells.push(rows[r][COLS[c]] || "");
      }
      lines.push(cells.join("\t"));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 700);
    });
  }, [selection, rows]);

  // ── Keyboard ──────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const insideTable = tableRef.current?.contains(document.activeElement);
      if (!insideTable && !activeCell) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const focused = document.activeElement;
        // Let browser handle native text copy inside an input
        if (focused?.tagName === "INPUT" && focused.selectionStart !== focused.selectionEnd) return;
        if (selection) { e.preventDefault(); copySelection(); }
        return;
      }

      if (!activeCell) return;

      const move = (dr, dc) => {
        const nr = Math.min(Math.max(activeCell.row + dr, 0), rows.length - 1);
        const nc = Math.min(Math.max(activeCell.col + dc, 0), COLS.length - 1);
        setActiveCell({ row: nr, col: nc });
        setSelection({ startRow: nr, endRow: nr, startCol: nc, endCol: nc });
        inputRefs.current[`${nr}-${nc}`]?.focus();
      };

      if (e.key === "ArrowDown" || e.key === "Enter")  { e.preventDefault(); move(1, 0); }
      else if (e.key === "ArrowUp")                     { e.preventDefault(); move(-1, 0); }
      else if (e.key === "Tab")                         { e.preventDefault(); move(0, 1); }
      else if (e.key === "ArrowRight")                  { move(0, 1); }
      else if (e.key === "ArrowLeft")                   { move(0, -1); }
      else if (e.key === "Escape") {
        setSelection(null);
        setActiveCell(null);
        document.activeElement?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCell, selection, copySelection, rows.length]);

  // ── Mouse drag ────────────────────────────────────────
  // Key fix: during drag, inputs get pointer-events:none so onMouseEnter
  // fires reliably on the TD even when cursor passes over inputs.

  const startDrag = (e, row, col) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging.current = true;
    setDragging(true);
    dragStart.current = { row, col };
    setActiveCell({ row, col });
    setSelection({ startRow: row, endRow: row, startCol: col, endCol: col });
    // Manually focus the input since e.preventDefault() blocks native focus
    setTimeout(() => inputRefs.current[`${row}-${col}`]?.focus(), 0);
  };

  const extendDrag = (row, col) => {
    if (!isDragging.current) return;
    setSelection({
      startRow: dragStart.current.row,
      startCol: dragStart.current.col,
      endRow: row,
      endCol: col,
    });
  };

  // Global mouseup — end drag
  useEffect(() => {
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setDragging(false);
      // Do NOT re-focus here — focusing the start cell would collapse the multi-cell selection
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  // Click outside clears selection
  useEffect(() => {
    const onDown = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setSelection(null);
        setActiveCell(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const [presetDupWarning, setPresetDupWarning] = useState(null); // label of conflicting preset

  const handleFillPreset = (tids, label) => {
    // Mainline can duplicate west/east. Only west and east cannot duplicate each other.
    if (tableKey !== "mainline") {
      const otherValues = new Set(
        Object.entries(dataRef.current)
          .filter(([key]) => key !== tableKey && key !== "mainline")
          .flatMap(([, tableRows]) =>
            tableRows.map((row) => row.tid).filter((v) => v && v.trim() !== "")
          )
      );
      const duplicates = tids.filter((tid) => otherValues.has(String(tid)));
      if (duplicates.length > 0) {
        setPresetDupWarning(`Duplicate TIDs found in other depot: ${duplicates.join(", ")}`);
        setTimeout(() => setPresetDupWarning(null), 3000);
        return;
      }
    }

    setPresetDupWarning(null);
    isDirty.current[tableKey] = true;
    setData((prev) => {
      const updatedRows = prev[tableKey].map((row, i) => ({
        ...row,
        tid: i < tids.length ? String(tids[i]) : "",
      }));
      const next = { ...prev, [tableKey]: updatedRows };
      if (saveTimers.current[tableKey]) clearTimeout(saveTimers.current[tableKey]);
      saveTimers.current[tableKey] = setTimeout(() => {
        persistTable(tableKey, next[tableKey]);
      }, 1000);
      return next;
    });
  };

  // Detect which preset matches the current TID column
  const activePreset = presets.find((preset) => {
    const filledTids = rows.map((r) => r.tid).filter((t) => t && t.trim() !== "");
    if (filledTids.length === 0 || filledTids.length !== preset.tids.length) return false;
    return preset.tids.every((tid, i) => String(tid) === String(filledTids[i] || "").trim());
  });

  const selNorm = normalizeSelection(selection);
  const selCount = selNorm ? selNorm.endRow - selNorm.startRow + 1 : 0;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${scrollable ? "overflow-hidden" : ""}`} style={{ userSelect: "none" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
        <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M9 11V7a3 3 0 0 1 6 0v4" />
            <circle cx="9" cy="16" r="1" />
            <circle cx="15" cy="16" r="1" />
          </svg>
        </div>
        <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">{title}</span>
        <div className="ml-auto flex items-center gap-2">
          {selection && selCount > 1 && (
            <span className="text-[10px] font-mono transition-colors" style={{ color: copyFlash ? "#16a34a" : "#94a3b8" }}>
              {copyFlash ? "✓ Copied!" : `Count : ${selCount}`}
            </span>
          )}
          <button
            onClick={() => onClear("trainId")}
            className="text-[10px] font-semibold text-red-400 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50 transition-colors"
          >
            Clear Train ID
          </button>
          <button
            onClick={() => onClear("tid")}
            className="text-[10px] font-semibold text-red-400 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50 transition-colors"
          >
            Clear TID
          </button>
        </div>
      </div>
      {presets.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">Fill TIDs:</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleFillPreset(preset.tids, preset.label)}
                  className="text-[10px] font-semibold border rounded px-2 py-0.5 transition-colors whitespace-nowrap"
                  style={activePreset?.label === preset.label
                    ? { background: "rgba(16,185,129,0.12)", color: "#059669", borderColor: "#6ee7b7" }
                    : { color: "#2563eb", borderColor: "#bfdbfe", background: "transparent" }
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {activePreset && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1"
                style={{ background: "rgba(16,185,129,0.10)", color: "#059669" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                {activePreset.label}
              </span>
            )}
          </div>
          {presetDupWarning && (
            <div className="mt-1.5 text-[10px] font-semibold text-red-500">
              ⚠ {presetDupWarning}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div ref={tableRef} style={{ cursor: dragging ? "cell" : "default", ...(scrollable && { maxHeight: "420px", overflowY: "auto" }) }}>
        <table className="w-full border-collapse text-xs table-fixed">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                style={{ background: "#f8fafc", color: "#475569", borderRight: "1px solid #e2e8f0", width: "55%" }}>
                Train ID
              </th>
              <th className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                style={{ background: "#f8fafc", color: "#475569" }}>
                TID
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isEvenRow = i % 2 === 0;
              const rowBaseBg = isEvenRow ? "#ffffff" : "#f8fafc";
              return (
              <tr key={i} className="last:border-0">
                {COLS.map((field, col) => {
                  const selected = isCellSelected(i, col);
                  const active = isActiveCell(i, col);
                  const isDup = dupWarning && dupWarning.row === i && dupWarning.col === col;

                  // For depot tables: compute trainId via INDEX-MATCH from mainline (like Excel formula)
                  // =IF(COUNTIF(mainline.tid, this.tid)>0, INDEX(mainline.trainId, MATCH(this.tid, mainline.tid, 0)), "")
                  let displayValue = row[field];
                  let isAutofilled = false;
                  if (mainlineRows && field === "trainId" && row.tid && row.tid.trim() !== "") {
                    const matchedRow = mainlineRows.find(
                      (mr) => String(mr.tid || "").trim() === String(row.tid || "").trim()
                    );
                    if (matchedRow) {
                      displayValue = matchedRow.trainId || "";
                      isAutofilled = true;
                    }
                  }
                  return (
                    <td
                      key={col}
                      className="p-0"
                      style={{
                        borderRight: col === 0 ? "1px solid #e2e8f0" : "none",
                        borderBottom: "1px solid #f1f5f9",
                        position: "relative",
                        background: isDup ? "rgba(239,68,68,0.10)" : isAutofilled ? "rgba(16,185,129,0.07)" : selected ? "rgba(59,130,246,0.10)" : rowBaseBg,
                        outline: isDup ? "2px solid #ef4444" : active ? "2px solid #3b82f6" : selected ? "1px solid rgba(59,130,246,0.35)" : "none",
                        outlineOffset: -1,
                      }}
                      onMouseDown={(e) => startDrag(e, i, col)}
                      onMouseEnter={() => extendDrag(i, col)}
                    >
                      <input
                        ref={(el) => { inputRefs.current[`${i}-${col}`] = el; }}
                        type="text"
                        value={displayValue}
                        readOnly={isAutofilled}
                        onChange={(e) => !isAutofilled && handleChange(i, field, e.target.value)}
                        onBlur={(e) => !isAutofilled && handleBlur(i, field, e.target.value)}
                        onFocus={() => {
                          if (isDragging.current) return;
                          const s = normalizeSelection(selection);
                          const isMulti = s && (s.endRow > s.startRow || s.endCol > s.startCol);
                          if (!isMulti) {
                            setActiveCell({ row: i, col });
                            setSelection({ startRow: i, endRow: i, startCol: col, endCol: col });
                          }
                        }}
                        style={{
                          pointerEvents: dragging ? "none" : "auto",
                          userSelect: dragging ? "none" : "text",
                          width: "100%",
                          padding: "0 8px",
                          fontSize: 10,
                          lineHeight: "15px",
                          fontWeight: col === 0 ? 700 : 600,
                          textAlign: "center",
                          color: isAutofilled ? "#059669" : "#475569",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          cursor: isAutofilled ? "default" : dragging ? "cell" : "text",
                        }}
                      />
                      {isAutofilled && (
                        <span style={{
                          position: "absolute",
                          top: 0, left: 0, right: 0, bottom: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          paddingRight: 4,
                          pointerEvents: "all",
                          cursor: "help",
                          zIndex: 2,
                        }}
                          title={`Auto-filled from Mainline — TID ${row.tid} is matched. Edit Train ID in the Mainline table.`}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.75 }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MainlineTrains() {
  const location = useLocation();
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({
    west: emptyRows(WEST_ROWS),
    east: emptyRows(EAST_ROWS),
  });
  const saveTimers = useRef({});
  const isSaving = useRef({});
  const pendingSave = useRef({});
  const isDirty = useRef({});
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    base44.entities.MainlineTrainRow.list("rowIndex", 200).then((records) => {
      const byType = (type) =>
        (records || []).filter((r) => r.tableType === type).sort((a, b) => a.rowIndex - b.rowIndex);
      setData({
        west: fillRows(byType("west"), WEST_ROWS),
        east: fillRows(byType("east"), EAST_ROWS),
      });
      setLoaded(true);
    });
  }, []);

  const persistTable = useCallback(async (tableKey, rowsSnapshot) => {
    // Use snapshot if provided, otherwise fall back to latest ref
    const rows = rowsSnapshot || dataRef.current[tableKey];
    // Store latest snapshot so a pending save uses the most recent data
    pendingSave.current[tableKey] = rows;
    if (isSaving.current[tableKey]) return;
    isSaving.current[tableKey] = true;
    try {
      while (pendingSave.current[tableKey]) {
        const toFlush = pendingSave.current[tableKey];
        pendingSave.current[tableKey] = null;
        const existing = await base44.entities.MainlineTrainRow.filter({ tableType: tableKey });
        await Promise.all(existing.map((r) => base44.entities.MainlineTrainRow.delete(r.id).catch(() => {})));
        const toSave = toFlush
          .map((row, i) => ({ tableType: tableKey, trainId: row.trainId || "", tid: row.tid || "", rowIndex: i }))
          .filter((r) => r.trainId.trim() || r.tid.trim());
        if (toSave.length > 0) {
          await base44.entities.MainlineTrainRow.bulkCreate(toSave);
        }
        isDirty.current[tableKey] = false;
      }
    } finally {
      isSaving.current[tableKey] = false;
    }
  }, []);

  // Flush any pending saves when user switches tabs or navigates away
  useEffect(() => {
    const flushAll = () => {
      ["west", "east"].forEach((key) => {
        // Cancel any pending debounce timer
        if (saveTimers.current[key]) {
          clearTimeout(saveTimers.current[key]);
          saveTimers.current[key] = null;
        }
        // Flush if there's unsaved data (dirty) OR a save is still in progress
        if (isDirty.current[key] || pendingSave.current[key]) {
          persistTable(key, dataRef.current[key]);
        }
      });
    };
    document.addEventListener("visibilitychange", flushAll);
    document.addEventListener("pagehide", flushAll);
    window.addEventListener("beforeunload", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", flushAll);
      document.removeEventListener("pagehide", flushAll);
      window.removeEventListener("beforeunload", flushAll);
    };
  }, [persistTable]);

  if (!loaded) {
    return (
      <div className="h-screen bg-[#f4f6f8] flex items-center justify-center">
        <div className="w-7 h-7 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  const clearTable = async (tableKey, field) => {
    const rowCount = tableKey === "west" ? WEST_ROWS : EAST_ROWS;
    if (field) {
      // Clear only the specified column in state
      setData((prev) => ({
        ...prev,
        [tableKey]: prev[tableKey].map((row) => ({ ...row, [field]: "" })),
      }));
      // Persist: re-save rows with that field blanked
      const existing = await base44.entities.MainlineTrainRow.filter({ tableType: tableKey });
      await Promise.all(existing.map((r) => base44.entities.MainlineTrainRow.delete(r.id).catch(() => {})));
      const updatedRows = dataRef.current[tableKey].map((row) => ({ ...row, [field]: "" }));
      const toSave = updatedRows
        .map((row, i) => ({ tableType: tableKey, trainId: row.trainId || "", tid: row.tid || "", rowIndex: i }))
        .filter((r) => r.trainId.trim() || r.tid.trim());
      if (toSave.length > 0) await base44.entities.MainlineTrainRow.bulkCreate(toSave);
    } else {
      const existing = await base44.entities.MainlineTrainRow.filter({ tableType: tableKey });
      await Promise.all(existing.map((r) => base44.entities.MainlineTrainRow.delete(r.id).catch(() => {})));
      setData((prev) => ({ ...prev, [tableKey]: emptyRows(rowCount) }));
    }
  };

  const tableProps = { data, setData, saveTimers, persistTable, dataRef, isDirty };

  return (
    <div className="min-h-screen font-inter bg-[#f1f5f9]">
      <header className="h-[56px] bg-white border-b border-[#e2e8f0] shadow-sm sticky top-0 z-20">
        <div className="max-w-[1800px] mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#334155] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                  <circle cx="9" cy="16" r="1" />
                  <circle cx="15" cy="16" r="1" />
                </svg>
              </div>
              <span className="text-sm font-bold text-[#1e293b] tracking-tight">TrainLog</span>
            </div>
            <nav className="flex items-center gap-0.5 bg-[#f1f5f9] p-0.5 rounded-lg border border-[#e2e8f0]">
              {NAV_LINKS.map(({ to, label }) => (
                <Link key={to} to={to} className={`px-3 py-1.5 rounded-md text-xs transition-colors ${location.pathname === to ? "font-semibold bg-white text-[#334155] shadow-sm border border-[#e2e8f0]" : "font-medium text-[#64748b] hover:text-[#334155] hover:bg-white"}`}>{label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 bg-[#f1f5f9] border border-[#e2e8f0] px-3 py-1.5 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-[#64748b]">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-5 py-6">
        <div className="grid grid-cols-2 gap-6 items-start">
          <TrainTable {...tableProps} title="West Depot Rem." tableKey="west" onClear={(field) => clearTable("west", field)} presets={TID_PRESETS.west} />
          <TrainTable {...tableProps} title="East Depot Rem." tableKey="east" onClear={(field) => clearTable("east", field)} presets={TID_PRESETS.east} />
        </div>
      </main>
    </div>
  );
}