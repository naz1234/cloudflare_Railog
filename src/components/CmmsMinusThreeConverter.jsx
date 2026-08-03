import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import {
  buildCmmsMinusThreeFileName,
  createCmmsMinusThreeWorkbook,
  findCmmsMinusThreeRows,
  formatCmmsAdjustedText,
  matchCmmsMaintenanceRows,
  normalizeCmmsTrainId,
  parseCmmsMaintenanceTrainIds,
} from "../lib/cmmsMinusThreeConverter";

export default function CmmsMinusThreeConverter() {
  const [rows, setRows] = useState([]);
  const [manualExcludedRowIds, setManualExcludedRowIds] = useState([]);
  const [maintenanceTrainInput, setMaintenanceTrainInput] = useState("");
  const [submittedMaintenanceTrainIds, setSubmittedMaintenanceTrainIds] = useState([]);
  const [maintenanceInputError, setMaintenanceInputError] = useState("");
  const [deductionMinutes, setDeductionMinutes] = useState(3);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const convertedRows = useMemo(() => rows.map((row) => ({
    ...row,
    outputText: formatCmmsAdjustedText(row.nextWashValue, deductionMinutes),
  })), [deductionMinutes, rows]);
  const maintenanceMatch = useMemo(
    () => matchCmmsMaintenanceRows(convertedRows, submittedMaintenanceTrainIds),
    [convertedRows, submittedMaintenanceTrainIds],
  );
  const submittedMaintenanceTrainIdSet = useMemo(
    () => new Set(submittedMaintenanceTrainIds),
    [submittedMaintenanceTrainIds],
  );
  const maintenanceRowIdSet = useMemo(
    () => new Set(maintenanceMatch.matchedRows.map((row) => row.id)),
    [maintenanceMatch.matchedRows],
  );
  const excludedRowIdSet = useMemo(
    () => new Set([...manualExcludedRowIds, ...maintenanceRowIdSet]),
    [maintenanceRowIdSet, manualExcludedRowIds],
  );
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
    setManualExcludedRowIds([]);
    setMaintenanceTrainInput("");
    setSubmittedMaintenanceTrainIds([]);
    setMaintenanceInputError("");
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
        setManualExcludedRowIds([]);
        setMaintenanceTrainInput("");
        setSubmittedMaintenanceTrainIds([]);
        setMaintenanceInputError("");
        setFileName(file.name);
      } catch (uploadError) {
        console.error("CMMS time deduction conversion failed:", uploadError);
        setRows([]);
        setManualExcludedRowIds([]);
        setMaintenanceTrainInput("");
        setSubmittedMaintenanceTrainIds([]);
        setMaintenanceInputError("");
        setFileName(file.name);
        setError(uploadError?.message || "Unable to read this CMMS Excel file.");
      }
    };
    reader.onerror = () => {
      setRows([]);
      setManualExcludedRowIds([]);
      setMaintenanceTrainInput("");
      setSubmittedMaintenanceTrainIds([]);
      setMaintenanceInputError("");
      setFileName(file.name);
      setError("Unable to read this CMMS Excel file.");
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const submitMaintenanceTrains = useCallback((event) => {
    event.preventDefault();
    const trainIds = parseCmmsMaintenanceTrainIds(maintenanceTrainInput);
    if (maintenanceTrainInput.trim() && !trainIds.length) {
      setMaintenanceInputError("Enter train IDs using spaces, for example: 02 16 36 41 42.");
      return;
    }

    const submittedIdSet = new Set(trainIds);
    setSubmittedMaintenanceTrainIds(trainIds);
    setMaintenanceTrainInput(trainIds.join(" "));
    setMaintenanceInputError("");
    setManualExcludedRowIds((current) => current.filter((rowId) => {
      const row = rows.find((item) => item.id === rowId);
      return !row || !submittedIdSet.has(normalizeCmmsTrainId(row.trainNumber));
    }));
  }, [maintenanceTrainInput, rows]);

  const toggleRowIncluded = useCallback((rowId) => {
    if (maintenanceRowIdSet.has(rowId)) return;
    setManualExcludedRowIds((current) => (
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]
    ));
  }, [maintenanceRowIdSet]);

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
            <p className="text-[10px] text-violet-200/85">Choose the deduction, then submit the train IDs that are in MAINT.</p>
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
            <span className="mt-0.5 block text-[10px] text-[#9eb5ca]">Required: Train Number, Description and Next Wash. MAINT trains are entered by the user after upload.</span>
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
            <div className="theme-washing-minus-three-controls mb-3 grid gap-3 rounded-xl border border-[#4d3c70] bg-[#0b1728] p-3 lg:grid-cols-[210px_minmax(0,1fr)]">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-200">Time deduction</p>
                <div className="mt-1.5 flex items-center gap-2" role="group" aria-label="CMMS time deduction">
                  {[2, 3].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={deductionMinutes === minutes}
                      onClick={() => setDeductionMinutes(minutes)}
                      className="theme-washing-minus-three-deduction whitespace-nowrap rounded-lg border border-violet-400/45 px-3 py-1.5 text-xs font-bold text-violet-100 transition-colors"
                    >
                      –{minutes} minutes
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={submitMaintenanceTrains} className="theme-washing-maint-entry min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="cmms-maint-trains" className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">Train IDs in MAINT</label>
                  <button
                    type="button"
                    onClick={() => setManualExcludedRowIds([])}
                    className="theme-washing-minus-three-secondary rounded-lg border border-slate-500/60 bg-slate-500/10 px-2.5 py-1 text-[10px] font-bold text-slate-200"
                  >
                    Include available trains
                  </button>
                </div>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="cmms-maint-trains"
                    type="text"
                    value={maintenanceTrainInput}
                    onChange={(event) => setMaintenanceTrainInput(event.target.value)}
                    placeholder="02 16 36 41 42"
                    autoComplete="off"
                    className="theme-washing-maint-input min-w-0 flex-1 rounded-lg border border-amber-400/50 bg-[#081725] px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-400/20"
                  />
                  <button
                    type="submit"
                    className="theme-washing-maint-submit rounded-lg border border-amber-400/65 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/25"
                  >
                    Submit MAINT trains
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-[#9eb5ca]">Use spaces between train IDs. Submit again to replace the MAINT list.</p>
              </form>
            </div>

            {maintenanceInputError && (
              <p className="theme-washing-minus-three-error mb-3 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs text-red-100">{maintenanceInputError}</p>
            )}

            {submittedMaintenanceTrainIds.length > 0 && (
              <div className="theme-washing-maint-result mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">Submitted MAINT list</p>
                <p className="mt-1 text-[11px] text-emerald-100">
                  {maintenanceMatch.matchedRows.length} train{maintenanceMatch.matchedRows.length === 1 ? "" : "s"} matched and excluded: {maintenanceMatch.matchedRows.map((row) => `T${normalizeCmmsTrainId(row.trainNumber)}`).join(", ") || "None"}.
                </p>
                {maintenanceMatch.unmatchedIds.length > 0 && (
                  <p className="mt-1 text-[11px] text-amber-200">No uploaded CMMS row found for: {maintenanceMatch.unmatchedIds.map((trainId) => `T${trainId}`).join(", ")}.</p>
                )}
              </div>
            )}

            {excludedRows.length > 0 && (
              <div className="theme-washing-minus-three-exclusions mb-3 rounded-xl border border-amber-500/45 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">Trains not included in output</p>
                <ul className="mt-1.5 space-y-1 text-[11px] text-amber-100">
                  {excludedRows.map((row) => {
                    const trainId = normalizeCmmsTrainId(row.trainNumber);
                    return (
                      <li key={row.id}>
                        <span className="font-bold">{row.trainNumber} (Train {trainId})</span>
                        {submittedMaintenanceTrainIdSet.has(trainId)
                          ? ` — not included because Train ${trainId} was submitted as MAINT.`
                          : " — manually excluded by the user."}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-white">Converted Preview</h3>
                <p className="mt-0.5 text-[10px] text-[#9eb5ca]">Submitted MAINT trains stay unticked. Other trains can be included or excluded manually.</p>
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
                    const isSubmittedMaintenance = maintenanceRowIdSet.has(row.id);
                    const trainId = normalizeCmmsTrainId(row.trainNumber);
                    const showSourceLocation = row.trainLocation && !row.isMaintenance;
                    return (
                      <tr key={row.id} className={`${isIncluded ? "" : "is-excluded"} ${isSubmittedMaintenance ? "is-maintenance" : ""}`}>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            disabled={isSubmittedMaintenance}
                            onChange={() => toggleRowIncluded(row.id)}
                            aria-label={isSubmittedMaintenance ? `Train ${trainId} submitted as MAINT` : `${isIncluded ? "Exclude" : "Include"} ${row.trainNumber}`}
                            title={isSubmittedMaintenance ? "Remove this train from the submitted MAINT list to include it." : undefined}
                            className="theme-washing-minus-three-checkbox h-4 w-4 cursor-pointer accent-violet-500 disabled:cursor-not-allowed disabled:opacity-55"
                          />
                        </td>
                        <td className="px-2 py-2 font-semibold text-white">{row.trainNumber}</td>
                        <td className="px-2 py-2 text-[#c8d8ea]">
                          <span className="block truncate">{row.description || "–"}</span>
                          {isSubmittedMaintenance ? (
                            <span className="mt-0.5 inline-flex rounded-full border border-amber-400/55 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">MAINT · T{trainId}</span>
                          ) : showSourceLocation ? (
                            <span className="mt-0.5 inline-flex rounded-full border border-slate-500/55 bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">{row.trainLocation}</span>
                          ) : null}
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
