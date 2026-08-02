import { useMemo, useState } from "react";
import { Check, Clock3, Plus, Trash2, X } from "lucide-react";
import {
  addMinutesToPSTManualTime,
  buildPSTManualLogEntry,
  getPSTManualEntrySignature,
} from "../../lib/pstManualEntry";

const WEST_LOCATIONS = ["WD-ST15", "WD-ST14", "WD-ST13", "WD-ST12"];
const EAST_LOCATIONS = ["ED-ST02", "ED-ST03"];

function makeDraftRow() {
  const now = new Date();
  const startTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    id: globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "PST",
    depot: "west",
    trainId: "",
    road: "WD-ST15",
    startTime,
    endTime: addMinutesToPSTManualTime(startTime, 6),
    alarmStatus: "no_alarm",
    taName: "",
  };
}

function getEntryDetails(entry = {}) {
  if (entry.type === "Prep") return entry.taName ? `TA ${entry.taName}` : "Not stated";
  return entry.alarmStatus === "alarm" ? "Alarm reported" : "No alarm";
}

export default function PSTManualEntry({ logLines = [], onAddEntry, onRemoveEntry }) {
  const [draftRows, setDraftRows] = useState(() => [makeDraftRow()]);
  const [clearConfirming, setClearConfirming] = useState(false);
  const manualEntries = useMemo(
    () => (Array.isArray(logLines) ? logLines : []).filter((entry) => entry?.manualEntry),
    [logLines]
  );

  const updateDraft = (id, changes) => {
    setDraftRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const handleDepotChange = (row, depot) => {
    updateDraft(row.id, {
      depot,
      road: depot === "east" ? EAST_LOCATIONS[0] : WEST_LOCATIONS[0],
    });
  };

  const handleStartTimeChange = (row, startTime) => {
    updateDraft(row.id, {
      startTime,
      endTime: addMinutesToPSTManualTime(startTime, 6) || row.endTime,
    });
  };

  const handleAdd = (row) => {
    try {
      const entry = buildPSTManualLogEntry(row);
      const signature = getPSTManualEntrySignature(entry);
      const duplicate = logLines.some((candidate) => getPSTManualEntrySignature(candidate) === signature);
      if (duplicate) {
        alert("This PST / Train Prep entry already exists in the shared output.");
        return;
      }
      onAddEntry?.(entry);
      setDraftRows((rows) => {
        const remaining = rows.filter((item) => item.id !== row.id);
        return remaining.length ? remaining : [makeDraftRow()];
      });
    } catch (error) {
      alert(error?.message || "Unable to add the manual entry.");
    }
  };

  const handleClear = () => {
    if (!clearConfirming) {
      setClearConfirming(true);
      return;
    }
    manualEntries.forEach((entry) => onRemoveEntry?.(entry));
    setDraftRows([makeDraftRow()]);
    setClearConfirming(false);
  };

  const renderAddedRow = (entry) => (
    <tr key={entry.key} className="pst-manual-row is-added">
      <td><button type="button" onClick={() => onRemoveEntry?.(entry)} className="pst-manual-delete" aria-label={`Delete manual ${entry.type} entry for ${entry.trainKey}`}><Trash2 size={12} /></button></td>
      <td><span className={`pst-manual-type is-${entry.type === "PST" ? "pst" : "prep"}`}>{entry.type === "PST" ? "PST" : "Train Prep"}</span></td>
      <td>{entry.depot === "east" ? "East" : "West"}</td>
      <td className="pst-manual-train">{entry.trainKey}</td>
      <td>{entry.road}</td>
      <td>{entry.startTime || "\u2014"}</td>
      <td>{entry.endTime || entry.time || "\u2014"}</td>
      <td>{getEntryDetails(entry)}</td>
      <td><span className="pst-manual-added-status"><Check size={11} /> Added</span></td>
    </tr>
  );

  const renderDraftRow = (row) => {
    const locations = row.depot === "east" ? EAST_LOCATIONS : WEST_LOCATIONS;
    const isPST = row.type === "PST";
    return (
      <tr key={row.id} className="pst-manual-row is-draft">
        <td><button type="button" onClick={() => setDraftRows((rows) => rows.length === 1 ? [makeDraftRow()] : rows.filter((item) => item.id !== row.id))} className="pst-manual-delete" aria-label="Delete draft manual entry"><Trash2 size={12} /></button></td>
        <td>
          <select value={row.type} onChange={(event) => updateDraft(row.id, { type: event.target.value })} aria-label="Manual entry type">
            <option value="PST">PST</option>
            <option value="Prep">Train Prep</option>
          </select>
        </td>
        <td>
          <select value={row.depot} onChange={(event) => handleDepotChange(row, event.target.value)} aria-label="Manual entry depot">
            <option value="west">West</option>
            <option value="east">East</option>
          </select>
        </td>
        <td><input value={row.trainId} onChange={(event) => updateDraft(row.id, { trainId: event.target.value.toUpperCase() })} placeholder="T00" aria-label="Manual entry train ID" /></td>
        <td>
          <select value={row.road} onChange={(event) => updateDraft(row.id, { road: event.target.value })} aria-label="Manual entry location">
            {locations.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
        </td>
        <td>{isPST ? <input type="text" inputMode="numeric" maxLength={5} value={row.startTime} onChange={(event) => handleStartTimeChange(row, event.target.value)} placeholder="00:00" aria-label="PST start time" /> : <span className="pst-manual-not-applicable">{"\u2014"}</span>}</td>
        <td><input type="text" inputMode="numeric" maxLength={5} value={row.endTime} onChange={(event) => updateDraft(row.id, { endTime: event.target.value })} placeholder="00:00" aria-label="Completion time" /></td>
        <td>
          {isPST ? (
            <select value={row.alarmStatus} onChange={(event) => updateDraft(row.id, { alarmStatus: event.target.value })} aria-label="PST alarm status">
              <option value="no_alarm">No Alarm</option>
              <option value="alarm">Alarm Reported</option>
            </select>
          ) : (
            <input value={row.taName} onChange={(event) => updateDraft(row.id, { taName: event.target.value })} placeholder="TA name (optional)" aria-label="Train Prep completed by" />
          )}
        </td>
        <td><button type="button" onClick={() => handleAdd(row)} className="pst-manual-add-entry"><Plus size={11} /> Add</button></td>
      </tr>
    );
  };

  return (
    <section className="pst-manual-shell">
      <div className="pst-manual-header">
        <div className="pst-manual-heading">
          <span className="pst-manual-icon"><Clock3 size={15} /></span>
          <div>
            <h3>PST &amp; Train Prep Manual Entry</h3>
            <p>Add manual single entries to the shared PST / Train Prep Log Output.</p>
          </div>
        </div>
        <div className="pst-manual-actions">
          <span className="pst-manual-count">{manualEntries.length} added</span>
          <button type="button" onClick={() => setDraftRows((rows) => [...rows, makeDraftRow()])} className="pst-manual-add-row theme-movement-add-row-attention"><Plus size={12} /> Add Row</button>
          <button type="button" onClick={handleClear} onBlur={() => setClearConfirming(false)} className={`pst-manual-clear${clearConfirming ? " is-confirming" : ""}`}><X size={12} /> {clearConfirming ? "Confirm Clear" : "Clear"}</button>
        </div>
      </div>
      <div className="pst-manual-table-wrap">
        <table className="pst-manual-table">
          <thead><tr><th aria-label="Delete" /><th>Type</th><th>Depot</th><th>Train</th><th>Location</th><th>Start</th><th>Completion</th><th>Alarm / Completed By</th><th>Status</th></tr></thead>
          <tbody>{manualEntries.map(renderAddedRow)}{draftRows.map(renderDraftRow)}</tbody>
        </table>
      </div>
    </section>
  );
}
