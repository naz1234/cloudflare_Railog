import { useEffect, useId, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Printer, X } from 'lucide-react';
import { formatWashDate, selectWashPrintRows, WSH2_PRINT_MAX_FILES } from '../lib/wsh2Records.js';

export default function Wsh2PrintDialog({ rows, uploads, busy, blocked, error, onClose, onPrint }) {
  const dialog = useRef(null);
  const titleId = useId();
  const helpId = useId();
  const [selected, setSelected] = useState([]);
  const liveIds = new Set(uploads.map((upload) => upload.id));
  const selectedIds = selected.filter((id) => liveIds.has(id));
  const selectionChanged = selectedIds.length !== selected.length;
  let selection = null;
  let validation = selectionChanged ? 'A selected Excel file was removed on another computer. Reset the selection and choose again.' : '';
  if (!selectionChanged && selectedIds.length) {
    try { selection = selectWashPrintRows(rows, uploads, selectedIds); }
    catch (failure) { validation = failure.message; }
  }

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  function toggle(id) {
    setSelected((current) => {
      const live = current.filter((item) => liveIds.has(item));
      return live.includes(id) ? live.filter((item) => item !== id) : live.length < WSH2_PRINT_MAX_FILES ? [...live, id] : live;
    });
  }

  return <dialog ref={dialog} className="wsh2-print-dialog" aria-labelledby={titleId} aria-describedby={helpId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (selection && !busy && !blocked) onPrint(selectedIds); }}>
      <header><div><span className="wsh2-eyebrow">ONE PAGE PRINT</span><h2 id={titleId}><Printer size={20} />Choose Excel files</h2></div>
        <button type="button" aria-label="Close print selector" disabled={busy} onClick={onClose}><X size={17} /></button></header>
      <p id={helpId}>Choose 1 or 2 uploaded Excel files for one A4 page. Saved checklist ticks and wash details are included.</p>
      <div className="wsh2-print-options">
        {uploads.map((upload) => {
          const count = rows.filter((row) => row.sourceUploadId === upload.id).length;
          const checked = selectedIds.includes(upload.id);
          const disabled = busy || (!checked && (!count || selectedIds.length >= WSH2_PRINT_MAX_FILES));
          return <label key={upload.id} className={`wsh2-print-file${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
            <input type="checkbox" aria-label={`Print ${upload.fileName}`} checked={checked} disabled={disabled} onChange={() => toggle(upload.id)} />
            <FileSpreadsheet size={21} aria-hidden="true" />
            <span className="wsh2-print-file-info"><strong>{upload.fileName}</strong>
              <span>{formatWashDate(upload.dateFrom)}{upload.dateFrom !== upload.dateTo ? ` – ${formatWashDate(upload.dateTo)}` : ''} · {count} current trains</span>
              {!count && <span>No current rows — replaced by another upload.</span>}</span>
          </label>;
        })}
        {!uploads.length && <p>No uploaded Excel files are available.</p>}
      </div>
      <p className="wsh2-print-summary" role="status">{selectedIds.length} / {WSH2_PRINT_MAX_FILES} files selected{selection ? ` · ${selection.rows.length} trains · 1 page` : ''}{selectedIds.length === WSH2_PRINT_MAX_FILES ? '. Deselect a file to choose another.' : ''}</p>
      {(validation || error || blocked) && <p className="wsh2-print-error" role="alert">{validation || error || 'Wait for shared updates to finish. If sync failed, close this window and refresh before printing.'}</p>}
      <footer>{selectionChanged && <button type="button" onClick={() => setSelected([])} disabled={busy}>Reset selection</button>}<button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="wsh2-primary" disabled={!selection || busy || blocked}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}{busy ? 'Preparing…' : 'Download Word'}</button></footer>
    </form>
  </dialog>;
}
