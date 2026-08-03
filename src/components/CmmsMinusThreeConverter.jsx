import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import {
  buildCmmsMinusThreeFileName,
  createCmmsMinusThreeWorkbook,
  findCmmsMinusThreeRows,
  formatCmmsAdjustedText,
} from "../lib/cmmsMinusThreeConverter";

export default function CmmsMinusThreeConverter() {
  const [rows, setRows] = useState([]);
  const [excludedRowIds, setExcludedRowIds] = useState([]);
  const [deductionMinutes, setDeductionMinutes] = useState(3);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const excludedRowIdSet = useMemo(() => new Set(excludedRowIds), [excludedRowIds]);
  const convertedRows = useMemo(() => rows.map((row) => ({
    ...row,
    outputText: formatCmmsAdjustedText(row.nextWashValue, deductionMinutes),
  })), [deductionMinutes, rows]);
  const includedRows = useMemo(
    () => convertedRows.filter((row) => !excludedRowIdSet.has(row.id)),
    [convertedRows, excludedRowIdSet],
  );
  const excludedRows = useMemo(
    () => convertedRows.filter((row) => excludedRowIdSet.has(row.id)),
    [convertedRows, excludedRowIdSet],
  );

  const clearConverter = useCallback(() => {
    setRows([]);
    setExcludedRowIds([]);
    setDeductionMinutes(3);
    setFileName("");
    setError("");
    setDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const processFile = useCallback((file) => {
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const resultBuffer = event.target?.result;
        if (!(resultBuffer instanceof ArrayBuffer)) throw new Error("Unable to read this CMMS Excel file.");
        const workbook = XLSX.read(new Uint8Array(resultBuffer), { type: "array", cellDates: false });
        const result = findCmmsMinusThreeRows(workbook, XLSX);
        setRows(result.rows);
        setExcludedRowIds(result.rows.filter((row) => row.isMaintenance).map((row) => row.id));
        setFileName(file.name);
      } catch (uploadError) {
        console.error("CMMS time deduction conversion failed:", uploadError);
        setRows([]);
        setExcludedRowIds([]);
        setFileName(file.name);
        setError(uploadError?.message || "Unable to read this CMMS Excel file.");
      }
    };
    reader.onerror = () => {
      setRows([]);
      setExcludedRowIds([]);
      setFileName(file.name);
      setError("Unable to read this CMMS Excel file.");
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const toggleRowIncluded = useCallback((rowId) => {
    setExcludedRowIds((current) => (
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]
    ));
  }, []);

  const downloadOutput = useCallback(() => {
    if (!includedRows.length) return;
    const workbook = createCmmsMinusThreeWorkbook(includedRows, XLSX, deductionMinutes);
    XLSX.writeFile(workbook, buildCmmsMinusThreeFileName(fileName), {
      bookType: "xlsx",
      cellStyles: true,
    });
  }, [deductionMinutes, fileName, includedRows]);

  return (
    <section className="theme-washing-panel theme-washing-minus-three-panel overflow-hidden rounded-2xl border border-[#65508f] bg-[#0b1f33] shadow-md">
      <header
        className="theme-washing-header theme-washing-header-violet flex flex-col gap-3 border-b border-[#4d3c70] px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
        style={{ background: "linear-gradient(180deg,#2b1b4d 0%,#15142f 100%)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-500/50 bg-violet-500/10">
            <FileSpreadsheet className="h-4 w-4 text-violet-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase leading-tight tracking-widest text-white">Subtract 2 or 3 CMMS Time Entries</h2>
            <p className="text-[10px] text-violet-200/85">Choose the deduction, review every train, and omit any train that should not be included.</p>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className="rounded-full border border-violet-400/45 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold text-violet-100">
              {includedRows.length} included · {excludedRows.length} excluded
            </span>
            <button
              type="button"
              onClick={downloadOutput}
              disabled={!includedRows.length}
              className="theme-washing-minus-three-download inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/55 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-3.5 w-3.5" /> Download Output Excel
            </button>
            <button
              type="button"
              onClick={clearConverter}
              className="theme-washing-minus-three-clear inline-flex items-center gap-1.5 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        )}
      </header>

      <div className="p-5">
        <button
          type="button"
          className={`theme-washing-upload-zone theme-washing-minus-three-upload flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 transition-colors ${dragging ? "is-dragging border-violet-400 bg-violet-500/15" : "border-[#514071] bg-[#0b1728] hover:border-violet-400/70 hover:bg-[#141a34]"}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            processFile(event.dataTransfer.files[0]);
          }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-400/45 bg-violet-500/10">
            <Upload className="h-4 w-4 text-violet-200" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-xs font-bold text-violet-100">{fileName || "Upload CMMS washing Excel"}</span>
            <span className="mt-0.5 block text-[10px] text-[#9eb5ca]">Required: Train Number, Description, Next Wash. Train Location is used to detect MAINT.</span>
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          aria-label="Upload CMMS Excel for two-or-three-minute conversion"
          onChange={(event) => {
            processFile(event.target.files[0]);
            event.target.value = "";
          }}
        />

        {error && (
          <p className="theme-washing-minus-three-error mt-3 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">{error}</p>
        )}

        {rows.length > 0 && (
          <div className="mt-4">
            <div className="theme-washing-minus-three-controls mb-3 flex flex-col gap-3 rounded-xl border border-[#4d3c70] bg-[#0b1728] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-200">Time deduction</p>
                <div className="mt-1.5 flex items-center gap-2" role="group" aria-label="CMMS time deduction">
                  {[2, 3].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={deductionMinutes === minutes}
                      onClick={() => setDeductionMinutes(minutes)}
                      className="theme-washing-minus-three-deduction rounded-lg border border-violet-400/45 px-3 py-1.5 text-xs font-bold text-violet-100 transition-colors"
                    >
                      –{minutes} minutes
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setExcludedRowIds([])}
                  className="theme-washing-minus-three-secondary rounded-lg border border-slate-500/60 bg-slate-500/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-200"
                >
                  Include all
                </button>
                <button
                  type="button"
                  onClick={() => setExcludedRowIds(rows.filter((row) => row.isMaintenance).map((row) => row.id))}
                  className="theme-washing-minus-three-secondary rounded-lg border border-amber-500/55 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-200"
                >
                  Exclude MAINT
                </button>
              </div>
            </div>

            {excludedRows.length > 0 && (
              <div className="theme-washing-minus-three-exclusions mb-3 rounded-xl border border-amber-500/45 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">Trains not included in output</p>
                <ul className="mt-1.5 space-y-1 text-[11px] text-amber-100">
                  {excludedRows.map((row) => (
                    <li key={row.id}>
                      <span className="font-bold">{row.trainNumber}</span>
                      {row.isMaintenance
                        ? ` — not included because Train Location is ${row.trainLocation || "MAINT"}.`
                        : " — manually excluded by the user."}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-white">Converted Preview</h3>
                <p className="mt-0.5 text-[10px] text-[#9eb5ca]">Tick only the trains to include. Output values use Excel Text cell format.</p>
              </div>
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-cyan-100">
                Example: {convertedRows[0].outputText}
              </span>
            </div>

            <div className="theme-washing-minus-three-table-wrap max-h-[360px] overflow-auto rounded-xl border border-[#4d3c70] bg-[#081725]">
              <table className="theme-washing-minus-three-table w-full min-w-[620px] table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-[1]">
                  <tr>
                    <th className="w-[66px] px-2 py-2 text-center">Include</th>
                    <th className="w-[118px] px-2 py-2">Train Number</th>
                    <th className="w-[132px] px-2 py-2">Details</th>
                    <th className="w-[148px] px-2 py-2">Next Wash</th>
                    <th className="w-[156px] px-2 py-2">Output –{deductionMinutes} Time</th>
                  </tr>
                </thead>
                <tbody>
                  {convertedRows.map((row) => {
                    const isIncluded = !excludedRowIdSet.has(row.id);
                    return (
                      <tr key={row.id} className={`${isIncluded ? "" : "is-excluded"} ${row.isMaintenance ? "is-maintenance" : ""}`}>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleRowIncluded(row.id)}
                            aria-label={`${isIncluded ? "Exclude" : "Include"} ${row.trainNumber}`}
                            className="theme-washing-minus-three-checkbox h-4 w-4 cursor-pointer accent-violet-500"
                          />
                        </td>
                        <td className="px-2 py-2 font-semibold text-white">{row.trainNumber}</td>
                        <td className="px-2 py-2 text-[#c8d8ea]">
                          <span className="block truncate">{row.description || "–"}</span>
                          {row.trainLocation && (
                            <span className={`mt-0.5 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${row.isMaintenance ? "border-amber-400/55 bg-amber-500/10 text-amber-200" : "border-slate-500/55 bg-slate-500/10 text-slate-300"}`}>
                              {row.trainLocation}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 font-mono text-[#c8d8ea]">{row.nextWashText}</td>
                        <td className="px-2 py-2 font-mono font-bold text-violet-100">{row.outputText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
