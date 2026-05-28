import React, { useState, useEffect, useRef, useCallback } from "react";
import { REQUEST_COLORS, getCustomRequestColor } from "./MaintenancePanel";
import { base44 } from "@/api/base44Client";

const EMPTY_ROW = {
  trainId: "",
  trackingId: "",
  time: "",
  remark: "",
  manualEdited: false,
};

const STORAGE_KEY = "removal_cache_";

const TID_PRESETS = {
  west: [
    { label: "9am",  tids: [212,214,216,218,220,102,104,106,108,110] },
    { label: "7pm",  tids: [213,215,217,219,101,103,105,107,109,111,113,115,117,119,201,203,205] },
    { label: "12am", tids: [122,123,124,125,126,127,128,129,130,221] },
    { label: "Fri",  tids: [102,103,104,105,106,107,108,109,110,201] },
    { label: "Sat",  tids: [107,108,109,110,201,202,203,204,205,206] },
  ],
  east: [
    { label: "9am",  tids: [112,114,116,118,120,202,204,206,208,210] },
    { label: "7pm",  tids: [207,209,211] },
    { label: "12am", tids: [222,223,224,225,226,227,228,229,230,121] },
    { label: "Fri",  tids: [202,203,204,205,206,207,208,209,210,101] },
    { label: "Sat",  tids: [207,208,209,210,101,102,103,104,105,106] },
  ],
};

const TID_TIME_MAP = {
  west: {
    "9am":  { 212:"08:59",214:"09:05",216:"09:11",218:"09:17",220:"09:23",102:"09:29",104:"09:35",106:"09:41",108:"09:47",110:"09:53" },
    "7pm":  { 213:"19:02",215:"19:08",217:"19:14",219:"19:20",101:"19:26",103:"19:32",105:"19:38",107:"19:44",109:"19:50",111:"19:56",113:"20:02",115:"20:08",117:"20:14",119:"20:20",201:"20:26",203:"20:32",205:"20:38" },
    "12am": { 122:"00:03",123:"00:09",124:"00:15",125:"00:21",126:"00:27",127:"00:33",128:"00:39",129:"00:45",130:"00:51",221:"00:56" },
    "Fri":  { 102:"00:02",103:"00:08",104:"00:14",105:"00:20",106:"00:26",107:"00:32",108:"00:38",109:"00:44",110:"00:50",201:"00:56" },
    "Sat":  { 107:"00:02",108:"00:08",109:"00:14",110:"00:20",201:"00:26",202:"00:32",203:"00:38",204:"00:44",205:"00:50",206:"00:56" },
  },
  east: {
    "9am":  { 112:"08:59",114:"09:05",116:"09:11",118:"09:17",120:"09:23",202:"09:29",204:"09:35",206:"09:41",208:"09:47",210:"09:53" },
    "7pm":  { 207:"19:44",209:"19:50",211:"19:56" },
    "12am": { 222:"00:04",223:"00:10",224:"00:16",225:"00:22",226:"00:28",227:"00:34",228:"00:40",229:"00:46",230:"00:52",121:"00:56" },
    "Fri":  { 202:"00:02",203:"00:08",204:"00:14",205:"00:20",206:"00:26",207:"00:32",208:"00:38",209:"00:44",210:"00:50",101:"00:56" },
    "Sat":  { 207:"00:02",208:"00:08",209:"00:14",210:"00:20",101:"00:26",102:"00:32",103:"00:38",104:"00:44",105:"00:50",106:"00:56" },
  },
};

const buildTidTimeMap = (depot) => {
  const depotMap = TID_TIME_MAP[depot] || {};
  const flat = {};
  Object.values(depotMap).forEach((presetMap) => {
    Object.entries(presetMap).forEach(([tid, time]) => { flat[String(tid)] = time; });
  });
  return flat;
};

const COLS = ["trainId", "trackingId", "time"];

const createEmptyRows = (count) =>
  Array.from({ length: count }, () => ({ ...EMPTY_ROW }));

const normalizeSelection = (s) => {
  if (!s) return null;
  return {
    startRow: Math.min(s.startRow, s.endRow),
    endRow:   Math.max(s.startRow, s.endRow),
    startCol: Math.min(s.startCol, s.endCol),
    endCol:   Math.max(s.startCol, s.endCol),
  };
};

export default function RemovalList({ requests, depot: depotProp = "west", rowCount = 23 }) {
  const depotKey = String(depotProp || "west").trim().toLowerCase();

  // IMPORTANT: Do not load RemovalList from localStorage.
  // West ghost data can come from old browser cache before Base44 sync finishes.
  const [rows, setRows] = useState(() => createEmptyRows(rowCount));

  const [activeCell, setActiveCell] = useState(null);
  const [selection, setSelection]   = useState(null);

  const [copyFlash, setCopyFlash]   = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [dupFlash, setDupFlash]     = useState(null);
  const [syncState, setSyncState]   = useState({ status: "idle", lastSynced: "" });

  const isDragging   = useRef(false);
  const dragAnchor   = useRef(null);

  const inputRefs    = useRef({});
  const tableRef     = useRef(null);
  const saveTimer    = useRef(null);
  const isEditingRef = useRef(false);
  const isSavingRef  = useRef(false);
  const rowsRef      = useRef(rows);
  const pollInProgressRef = useRef(false);
  const didInitialSyncRef = useRef(false);
  const remoteBaselineSigRef = useRef(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const normalizeId = (val) => {
    if (!val?.trim()) return "";
    const clean = val.trim().toUpperCase();
    if (/^\d+$/.test(clean)) return String(parseInt(clean, 10));
    return clean;
  };

  const requestMap      = {};
  const requestColorMap = {};
  (requests || []).forEach((r) => {
    if (r.trainId?.trim()) {
      const key = normalizeId(r.trainId);
      if (!key) return;
      const displayType = r.requestType === "Other" ? (r.customType || "Other") : r.requestType;
      requestMap[key] = displayType;
      requestColorMap[key] = r.requestType === "Other"
        ? { bg: getCustomRequestColor(displayType), text: "#000000" }
        : (REQUEST_COLORS[r.requestType] || REQUEST_COLORS.Other);
    }
  });

  const computeRemark = (trainId) => {
    if (!trainId?.trim()) return "";
    return requestMap[normalizeId(trainId)] || "";
  };

  const tidTimeFlat = buildTidTimeMap(depotKey);

  const computeTime = (trackingId) => {
    if (!trackingId?.trim()) return "";
    return tidTimeFlat[String(parseInt(trackingId, 10))] || tidTimeFlat[trackingId.trim()] || "";
  };

  const isCellSelected = (row, col) => {
    const s = normalizeSelection(selection);
    if (!s) return false;
    return row >= s.startRow && row <= s.endRow && col >= s.startCol && col <= s.endCol;
  };

  const isActiveCell = (row, col) =>
    activeCell?.row === row && activeCell?.col === col;

  const focusCell = useCallback((row, col) => {
    isEditingRef.current = true;
    setActiveCell({ row, col });
    setSelection({ startRow: row, endRow: row, startCol: col, endCol: col });
    setTimeout(() => inputRefs.current[`${row}-${col}`]?.focus(), 0);
  }, []);

  const formatSyncTime = () =>
    new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  // Strict depot matching.
  // Do NOT treat blank depot as "west"; old legacy rows without a depot value
  // were the main reason WEST ghost data came back after refresh.
  const getRecordDepot = (record) =>
    String(record?.depot || "").trim().toLowerCase();

  const deleteOrQuarantineRow = async (record) => {
    try {
      if (base44.entities.RemovalListRow.delete) {
        await base44.entities.RemovalListRow.delete(record.id);
      } else {
        await base44.entities.RemovalListRow.update(record.id, {
          depot: "__cleared_legacy__",
          trainId: "",
          trackingId: "",
          time: "",
          rowIndex: 9999,
        });
      }
    } catch (err) {
      console.warn("Could not delete/quarantine ghost row", err);
    }
  };

  const normaliseDbRows = useCallback((records) => {
    const dbRows = createEmptyRows(rowCount);
    const depotRows = (records || [])
      .filter((r) => getRecordDepot(r) === depotKey)
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));

    depotRows.forEach((r) => {
      const index = Number(r.rowIndex ?? 0);
      if (Number.isNaN(index) || index < 0 || index >= rowCount) return;

      dbRows[index] = {
        ...EMPTY_ROW,
        trainId:    r.trainId    || "",
        trackingId: r.trackingId || "",
        time:       r.time       || "",
        manualEdited: false,
      };
    });

    return { dbRows, depotRows };
  }, [depotKey, rowCount]);

  const getRowsSignature = useCallback((list) => {
    return JSON.stringify(
      (list || []).slice(0, rowCount).map((r) => [
        r.trainId || "",
        r.trackingId || "",
        r.time || "",
      ])
    );
  }, [rowCount]);

  useEffect(() => {
    // Remove old cached rows so refresh always starts clean and waits for Base44.
    // This especially fixes old WEST cache such as TID 212 / 214 / 216 reappearing.
    localStorage.removeItem(STORAGE_KEY + depotKey);
  }, [depotKey]);

  const fetchRowsFromDB = useCallback(async ({ force = false } = {}) => {
    if (
      !force &&
      (isEditingRef.current || isSavingRef.current || saveTimer.current || pollInProgressRef.current)
    ) {
      return;
    }

    pollInProgressRef.current = true;

    try {
      setSyncState((prev) => ({ ...prev, status: "updating" }));

      const records = await base44.entities.RemovalListRow.list("rowIndex", 200);
      const { dbRows, depotRows } = normaliseDbRows(records);
      const dbSig = getRowsSignature(dbRows);

      if (depotRows.length === 0) {
        didInitialSyncRef.current = true;
        remoteBaselineSigRef.current = dbSig;
        setSyncState({ status: "synced", lastSynced: formatSyncTime() });
        return;
      }

      setRows((prev) => {
        if (!force && (isEditingRef.current || isSavingRef.current || saveTimer.current)) {
          return prev;
        }

        const currentSig = getRowsSignature(prev);
        if (currentSig === dbSig) {
          didInitialSyncRef.current = true;
          remoteBaselineSigRef.current = dbSig;
          return prev;
        }

        didInitialSyncRef.current = true;
        remoteBaselineSigRef.current = dbSig;
        console.log(`Row updated from: live DB sync — ${depotKey} removal`);

        return dbRows.map((row) => {
          const hasData = Boolean(row.trainId?.trim() || row.trackingId?.trim() || row.time?.trim());
          return { ...EMPTY_ROW, ...row, manualEdited: hasData };
        });
      });

      setSyncState({ status: "synced", lastSynced: formatSyncTime() });
    } catch (e) {
      console.error("RemovalList live sync failed", e);
      setSyncState((prev) => ({ status: "error", lastSynced: prev.lastSynced }));
    } finally {
      pollInProgressRef.current = false;
    }
  }, [depotKey, getRowsSignature, normaliseDbRows]);

  useEffect(() => {
    let cancelled = false;

    const runSync = (options) => {
      if (cancelled) return;
      fetchRowsFromDB(options);
    };

    runSync();
    const interval = setInterval(() => runSync(), 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchRowsFromDB]);

  const persistToDB = useCallback(async (newRows, options = {}) => {
    const { createBlankRows = false } = options;

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    isSavingRef.current = true;
    setSyncState((prev) => ({ ...prev, status: "saving" }));

    try {
      const rowsToSave = newRows
        .slice(0, rowCount)
        .map((row, i) => ({
          depot: depotKey,
          trainId:    row.trainId    || "",
          trackingId: row.trackingId || "",
          time:       row.time       || "",
          rowIndex:   i,
        }));

      const existing  = await base44.entities.RemovalListRow.list("rowIndex", 200);
      const depotRows = existing.filter((r) => getRecordDepot(r) === depotKey);

      // One-time cleanup for old WEST records that were saved before "depot" existed.
      // The old code treated blank depot as west, so those legacy rows can resurrect
      // WEST data even after the visible west rows are cleared.
      if (depotKey === "west") {
        const legacyWestGhostRows = existing.filter((r) => getRecordDepot(r) === "");
        for (const ghost of legacyWestGhostRows) {
          await deleteOrQuarantineRow(ghost);
        }
      }

      for (const row of rowsToSave) {
        const hasData = row.trainId.trim() || row.trackingId.trim() || row.time.trim();
        
        // FIX: Find ALL matching records in the DB to hunt down invisible ghost duplicates
        const matches = depotRows.filter((ex) => Number(ex.rowIndex ?? 0) === row.rowIndex);

        if (matches.length > 0) {
          // Update the primary record
          await base44.entities.RemovalListRow.update(matches[0].id, {
            trainId: row.trainId,
            trackingId: row.trackingId,
            time: row.time,
          });

          // Delete any extra ghost copies of this row that might overwrite the real data later
          for (let j = 1; j < matches.length; j++) {
            await deleteOrQuarantineRow(matches[j]);
          }
        } else if (hasData || createBlankRows) {
          await base44.entities.RemovalListRow.create(row);
        }
      }

      const extraRows = depotRows.filter((ex) => Number(ex.rowIndex ?? 0) >= rowCount);
      for (const ex of extraRows) {
        await deleteOrQuarantineRow(ex);
      }

      rowsRef.current = newRows;
      remoteBaselineSigRef.current = getRowsSignature(newRows);
      didInitialSyncRef.current = true;
      setSyncState({ status: "synced", lastSynced: formatSyncTime() });
    } catch (e) {
      console.error("DB Save failed", e);
      setSyncState((prev) => ({ status: "error", lastSynced: prev.lastSynced }));
    } finally {
      isSavingRef.current = false;
      saveTimer.current = null;
    }
  }, [depotKey, rowCount, getRowsSignature]);

  const scheduleDBSave = useCallback((nextRows) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    setSyncState((prev) => ({ ...prev, status: "pending" }));

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      persistToDB(nextRows);
    }, 1000);
  }, [persistToDB]);

  const updateRow = (i, field, value) => {
    console.log(`Row updated from: manual input — row ${i}, field "${field}"`);
    setRows((prev) => {
      const next = [...prev];
      const updated = { ...next[i], [field]: value, manualEdited: true };
      if (field === "trainId") updated.remark = computeRemark(value);
      if (field === "trackingId") {
        const autoTime = computeTime(value);
        const tidHasMapping = value.trim() !== "" && autoTime !== "";
        const hasManualTime = next[i].manualEdited && next[i].time && !tidHasMapping;
        if (!hasManualTime) {
          updated.time = autoTime;
        }
      }
      next[i] = updated;

      // If user manually clears a cell, save immediately.
      // This prevents refresh-before-autosave from restoring old WEST data.
      const isClearAction = value.trim() === "";
      if (isClearAction) {
        persistToDB(next);
      } else {
        scheduleDBSave(next);
      }

      return next;
    });
  };

  const commitTrainId = useCallback((i) => {
    setRows((prev) => {
      const value     = prev[i]?.trainId ?? "";
      const normalized = normalizeId(value);
      if (!normalized) return prev; 

      const isDup = prev.some((row, idx) => idx !== i && normalizeId(row.trainId) === normalized);
      if (!isDup) return prev; 

      console.log(`Row updated from: duplicate checker — row ${i} cleared (dup of "${normalized}")`);

      setDupFlash(i);
      setTimeout(() => {
        setRows((current) => {
          const next = [...current];
          next[i] = { ...next[i], trainId: "", remark: "" };
          // FIX: Save instantly when deleting a duplicate so refreshing doesn't resurrect it
          persistToDB(next);
          return next;
        });
        setDupFlash(null);
      }, 600);

      return prev; 
    });
  }, [persistToDB]); // Updated dependency to use direct save

  const deleteSelection = useCallback(() => {
    const s = normalizeSelection(selection);
    if (!s) return;
    console.log(`Row updated from: delete selection — rows ${s.startRow}-${s.endRow}`);
    setRows((prev) => {
      const next = [...prev];
      for (let r = s.startRow; r <= s.endRow; r++) {
        const updated = { ...next[r] };
        for (let c = s.startCol; c <= s.endCol; c++) {
          const field = COLS[c];
          if (!field) continue;
          updated[field] = "";
          if (field === "trainId") updated.remark = "";
        }
        const allColsCleared = s.startCol === 0 && s.endCol >= COLS.length - 1;
        if (allColsCleared) {
          updated.manualEdited = true; 
        }
        next[r] = updated;
      }
      // FIX: Force instant save to DB on explicit manual deletion. 
      // If the user hits F5 quickly after Backspace, this ensures the deletion is not lost.
      persistToDB(next);
      return next;
    });
  }, [selection, persistToDB]); // Updated dependency to use direct save

  const copySelection = useCallback(() => {
    const s = normalizeSelection(selection);
    if (!s) return;
    const lines = [];
    for (let r = s.startRow; r <= s.endRow; r++) {
      const cells = [];
      for (let c = s.startCol; c <= s.endCol; c++) {
        cells.push(rows[r]?.[COLS[c]] ?? "");
      }
      lines.push(cells.join("\t"));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 700);
    });
  }, [selection, rows]);

  const pasteIntoSelection = useCallback(async () => {
    const s = normalizeSelection(selection);
    if (!s) return;

    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return; 
    }
    if (!text) return;

    const pastedRows = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trimEnd()
      .split("\n")
      .map((line) => line.split("\t"));

    const anchorRow = s.startRow;
    const anchorCol = s.startCol;

    setRows((prev) => {
      const next = [...prev];

      pastedRows.forEach((pastedCells, dr) => {
        const targetRow = anchorRow + dr;
        if (targetRow >= rowCount) return;

        pastedCells.forEach((cellValue, dc) => {
          const targetCol = anchorCol + dc;
          if (targetCol >= COLS.length) return;

          const field = COLS[targetCol];
          const value = cellValue.trim();

          if (!next[targetRow]) return;

          const updatedRow = { ...next[targetRow], [field]: value, manualEdited: true };
          if (field === "trainId") updatedRow.remark = computeRemark(value);
          if (field === "trackingId") updatedRow.time = computeTime(value);
          next[targetRow] = updatedRow;
        });
      });

      console.log(`Row updated from: paste — anchor row ${anchorRow}, ${pastedRows.length} rows`);
      persistToDB(next); // Instant save on paste
      return next;
    });

    const endRow = Math.min(anchorRow + pastedRows.length - 1, rowCount - 1);
    const endCol = Math.min(anchorCol + (pastedRows[0]?.length ?? 1) - 1, COLS.length - 1);
    setSelection({ startRow: anchorRow, startCol: anchorCol, endRow, endCol });

    setPasteFlash(true);
    setTimeout(() => setPasteFlash(false), 700);
  }, [selection, rowCount, persistToDB]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const insideTable = tableRef.current?.contains(document.activeElement) || activeCell;

      if ((e.ctrlKey || e.metaKey) && e.key === "c" && insideTable) {
        const focused = document.activeElement;
        if (focused?.tagName === "INPUT" && focused.selectionStart !== focused.selectionEnd) return;
        if (selection) { e.preventDefault(); copySelection(); }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v" && insideTable) {
        const focused = document.activeElement;
        if (focused?.tagName === "INPUT") {
          e.preventDefault();
          pasteIntoSelection();
        }
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && insideTable && selection) {
        const focused = document.activeElement;
        const inputEditing =
          focused?.tagName === "INPUT" &&
          focused.value.length > 0 &&
          focused.selectionStart !== null; 
        const s = normalizeSelection(selection);
        const isMultiCell = s && (s.endRow > s.startRow || s.endCol > s.startCol);
        if (isMultiCell && !inputEditing) {
          e.preventDefault();
          deleteSelection();
          return;
        }
        if (!isMultiCell && e.key === "Delete" && (!focused || focused?.tagName !== "INPUT" || focused.value === "")) {
          e.preventDefault();
          deleteSelection();
          return;
        }
        return;
      }

      const move = (dr, dc, extendSel = false) => {
        if (!activeCell) return;
        const nr = Math.min(Math.max(activeCell.row + dr, 0), rows.length - 1);
        const nc = Math.min(Math.max(activeCell.col + dc, 0), COLS.length - 1);
        if (extendSel && selection) {
          setSelection((prev) => ({ ...prev, endRow: nr, endCol: nc }));
          setActiveCell({ row: nr, col: nc });
          setTimeout(() => inputRefs.current[`${nr}-${nc}`]?.focus(), 0);
        } else {
          focusCell(nr, nc);
        }
      };

      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        if (e.key === "Enter" && activeCell?.col === 0) commitTrainId(activeCell.row);
        move(1, 0, e.shiftKey);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1, 0, e.shiftKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        move(0, e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        move(0, 1, e.shiftKey);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(0, -1, e.shiftKey);
      } else if (e.key === "Escape") {
        isEditingRef.current = false;
        setSelection(null);
        setActiveCell(null);
        document.activeElement?.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCell, selection, rows, copySelection, pasteIntoSelection, deleteSelection, focusCell, commitTrainId]);

  useEffect(() => {
    const onDown = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        isEditingRef.current = false;
        setSelection(null);
        setActiveCell(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const onCellMouseDown = (e, row, col) => {
    if (e.button !== 0) return;
    e.preventDefault();

    isEditingRef.current = true;
    isDragging.current  = true;
    dragAnchor.current  = { row, col };

    window.getSelection()?.removeAllRanges();

    if (e.shiftKey && selection) {
      setSelection((prev) => ({ ...prev, endRow: row, endCol: col }));
    } else {
      setActiveCell({ row, col });
      setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    }

    setTimeout(() => inputRefs.current[`${row}-${col}`]?.focus(), 0);
  };

  const onCellMouseEnter = (row, col) => {
    if (!isDragging.current) return;
    window.getSelection()?.removeAllRanges();
    const anchor = dragAnchor.current;
    if (!anchor) return;
    setSelection({
      startRow: anchor.row,
      startCol: anchor.col,
      endRow:   row,
      endCol:   col,
    });
    setActiveCell({ row, col });
  };

  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false; };
    const onMouseMove = () => {
      if (isDragging.current) window.getSelection()?.removeAllRanges();
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  const handleFillPreset = (tids, label) => {
    console.log(`Row updated from: preset "${label}" — applying to ${tids.length} rows, skipping active manual rows`);
    const presetTimeMap = TID_TIME_MAP[depotKey]?.[label] || {};
    setRows((prev) => {
      const next = prev.map((row, i) => {
        if (row.manualEdited) return row;
        if (i >= tids.length) {
          return { ...row, trackingId: "", time: "", manualEdited: true };
        }
        const tid = tids[i];
        return {
          ...row,
          trackingId:   String(tid),
          time:         presetTimeMap[tid] || tidTimeFlat[String(tid)] || "",
          trainId:      "",
          remark:       "",
          manualEdited: true,
        };
      });
      persistToDB(next);
      return next;
    });
  };

  const clearAll = () => {
    console.log(`Row updated from: Clear All button — ${depotKey} removal`);
    
    const next = rowsRef.current.map((row) => ({
      ...row,
      trainId: "",
      trackingId: "",
      time: "",
      remark: "",
      manualEdited: false, 
    }));

    setRows(next);
    persistToDB(next, { createBlankRows: true });
  };

  const selNorm   = normalizeSelection(selection);
  const selCount  = selNorm ? (selNorm.endRow - selNorm.startRow + 1) * (selNorm.endCol - selNorm.startCol + 1) : 0;
  const multiSel  = selNorm && (selNorm.endRow > selNorm.startRow || selNorm.endCol > selNorm.startCol);

  return (
    <div className="bg-[#0b1f33] rounded-xl border border-[#2b4f6b] shadow-md overflow-hidden">
      <div className="flex items-center px-3 py-2 border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[12px] font-bold text-white uppercase">{depotKey} Removal</span>
          <span
            className="mt-1 text-[9px] font-mono rounded px-1.5 py-0.5 border"
            style={{
              color:
                syncState.status === "error"
                  ? "#f87171"
                  : syncState.status === "updating" || syncState.status === "saving" || syncState.status === "pending"
                  ? "#facc15"
                  : "#4ade80",
              borderColor:
                syncState.status === "error"
                  ? "rgba(248,113,113,0.35)"
                  : syncState.status === "updating" || syncState.status === "saving" || syncState.status === "pending"
                  ? "rgba(250,204,21,0.35)"
                  : "rgba(74,222,128,0.35)",
              background:
                syncState.status === "error"
                  ? "rgba(127,29,29,0.25)"
                  : syncState.status === "updating" || syncState.status === "saving" || syncState.status === "pending"
                  ? "rgba(113,63,18,0.25)"
                  : "rgba(20,83,45,0.22)",
            }}
          >
            {syncState.status === "updating"
              ? "Updating..."
              : syncState.status === "saving"
              ? "Saving..."
              : syncState.status === "pending"
              ? "Save pending"
              : syncState.status === "error"
              ? "Live sync issue"
              : syncState.lastSynced
              ? `Last synced ${syncState.lastSynced}`
              : "Live sync on"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {(multiSel || copyFlash || pasteFlash) && (
            <span className="text-[9px] font-mono transition-colors"
              style={{ color: pasteFlash ? "#a78bfa" : copyFlash ? "#4ade80" : "#4a8ab5" }}>
              {pasteFlash ? "✓ Pasted!" : copyFlash ? "✓ Copied!" : `${selCount} cell${selCount !== 1 ? "s" : ""}`}
            </span>
          )}
          <button
            onClick={clearAll}
            className="text-[9px] font-bold text-red-300 border border-red-800/60 rounded px-2 py-0.5 bg-red-950/20 hover:bg-red-950/50 hover:text-red-200 transition-colors"
            title="Clear Train ID, TID and Time for this depot and save the blank rows to database"
          >
            Clear All
          </button>
        </div>
      </div>

      {TID_PRESETS[depotKey] && (
        <div className="px-3 py-1.5 border-b border-[#1a3a56] bg-[#071828]">
          <div className="flex flex-wrap gap-1 items-center">
            {TID_PRESETS[depotKey].map((preset) => (
              <button key={preset.label} onClick={() => handleFillPreset(preset.tids, preset.label)}
                className="text-[10px] font-bold text-[#4f8ef7] bg-[#0a1e2e] border border-[#1e3a56] rounded px-1.5 py-0.5 hover:bg-[#0f2d4a] hover:border-[#2b4f6b]">
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <table
        ref={tableRef}
        className="w-full border-collapse table-fixed"
        style={{ userSelect: "none" }}
        onMouseLeave={() => { }}
      >
        <colgroup>
          <col style={{ width: "23%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "35%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
            <th className="py-1 text-center text-[10px] font-bold text-[#4a8ab5] border-r border-[#1a3a56] uppercase">Train ID</th>
            <th className="py-1 text-center text-[10px] font-bold text-[#4a8ab5] border-r border-[#1a3a56] uppercase">TID</th>
            <th className="py-1 text-center text-[10px] font-bold text-[#4a8ab5] border-r border-[#1a3a56] uppercase">Time</th>
            <th className="py-1 text-center text-[10px] font-bold text-[#4a8ab5] uppercase">Remark</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => {
            const displayRemark = computeRemark(row.trainId);
            return (
              <tr key={i} className="border-b border-[#0f2040] last:border-0" style={{ height: "14px" }}>
                {[0, 1, 2].map((col) => {
                  const field    = COLS[col];
                  const selected = isCellSelected(i, col);
                  const active   = isActiveCell(i, col);
                  const isDup    = dupFlash === i && col === 0;

                  const sn = normalizeSelection(selection);
                  const isTopEdge    = selected && i === sn?.startRow;
                  const isBottomEdge = selected && i === sn?.endRow;
                  const isLeftEdge   = selected && col === sn?.startCol;
                  const isRightEdge  = selected && col === sn?.endCol;

                  let bg = "#071828";
                  if (isDup)    bg = "rgba(239,68,68,0.18)";
                  else if (selected) bg = "rgba(79,142,247,0.12)";

                  let boxShadow = "none";
                  let outline   = "none";

                  if (isDup) {
                    outline = "2px solid #ef4444";
                  } else if (active) {
                    outline = "2px solid #2563eb";
                  } else if (selected) {
                    const shadows = [];
                    if (isTopEdge)    shadows.push("inset 0 1.5px 0 0 #3b82f6");
                    if (isBottomEdge) shadows.push("inset 0 -1.5px 0 0 #3b82f6");
                    if (isLeftEdge)   shadows.push("inset 1.5px 0 0 0 #3b82f6");
                    if (isRightEdge)  shadows.push("inset -1.5px 0 0 0 #3b82f6");
                    boxShadow = shadows.join(", ") || "none";
                  }

                  return (
                    <td
                      key={col}
                      className="p-0 border-r border-[#1a3a56]"
                      style={{
                        height: "14px",
                        background: bg,
                        outline,
                        outlineOffset: -1,
                        boxShadow,
                        position: "relative",
                        cursor: "cell",
                      }}
                      onMouseDown={(e) => onCellMouseDown(e, i, col)}
                      onMouseEnter={() => onCellMouseEnter(i, col)}
                    >
                      <input
                        ref={(el) => { inputRefs.current[`${i}-${col}`] = el; }}
                        type="text"
                        value={row[field]}
                        onChange={(e) => updateRow(i, field, e.target.value)}
                        onBlur={() => {
                          if (col === 0) commitTrainId(i);
                          setTimeout(() => {
                            if (!tableRef.current?.contains(document.activeElement)) {
                              isEditingRef.current = false;
                            }
                          }, 0);
                        }}
                        onKeyDown={(e) => { if (col === 0 && e.key === "Enter") commitTrainId(i); }}
                        onPaste={() => { if (col === 0) setTimeout(() => commitTrainId(i), 0); }}
                        onFocus={() => {
                          isEditingRef.current = true;
                          if (!isDragging.current) {
                            setActiveCell({ row: i, col });
                            setSelection({ startRow: i, endRow: i, startCol: col, endCol: col });
                          }
                        }}
                        className="w-full outline-none bg-transparent font-bold text-center"
                        style={{
                          color:      "#c8d8ea",
                          fontSize:   "12px",
                          lineHeight: "14px",
                          height:     "14px",
                          display:    "block",
                          padding:    "0 4px",
                          userSelect: "none",
                          cursor:     "cell",
                          caretColor: active ? "#2563eb" : "transparent",
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      />
                    </td>
                  );
                })}

                <td
                  className="px-1 font-bold text-center truncate"
                  style={{
                    color:      displayRemark ? "#f87171" : "#3a5a7a",
                    fontSize:   "12px",
                    lineHeight: "14px",
                    height:     "14px",
                    overflow:   "hidden",
                  }}
                >
                  {displayRemark || (
                    <span className="italic font-normal text-[12px]" style={{ color: "#2b4f6b" }}>auto</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-3 py-2 border-t border-[#1a3a56]" style={{ background: "linear-gradient(180deg,#0c2e4a 0%,#071e33 100%)" }}>
        {(() => {
          const removalIds = new Set(
            rows.map((r) => normalizeId(r.trainId)).filter(Boolean)
          );
          const missing = Object.keys(requestMap).filter((id) => !removalIds.has(id));

          return (
            <>
              <p className="text-[10px] font-bold text-[#4a8ab5] uppercase tracking-widest mb-1">
                Not in Removal List ({missing.length.toString().padStart(2, "0")})
              </p>
              {missing.length === 0 ? (
                <p className="text-[10px] text-[#3a5a7a] italic">All accounted for.</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {missing.map((id) => {
                    const color = requestColorMap[id] || REQUEST_COLORS.Other;
                    return (
                      <span
                        key={id}
                        className="px-1 py-0.5 rounded text-[10px] font-bold"
                        style={{ backgroundColor: color.bg, color: "#000000" }}
                      >
                        {id}{" "}
                        <span className="font-normal opacity-60">({requestMap[id]})</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
