import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Droplets, FileSpreadsheet, Loader2, Printer, RefreshCw, Trash2, Upload } from 'lucide-react';
import { formatWashDate, formatWashTime, groupWashRows, WSH2_LOCATIONS, WSH2_MAX_FILE_BYTES } from '../lib/wsh2Records.js';
import '../wsh2.css';

const API = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api/wsh2`;
async function request(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(API, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal, ...options });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'WSH2 request failed.'), { data, status: response.status });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Shared storage took too long to respond. Refresh before retrying.');
    throw error;
  } finally { clearTimeout(timer); }
}

function WashRow({ row, index, pending, onChange }) {
  const location = String(row.location || '').trim().toUpperCase();
  return <tr className={row.completed ? 'wsh2-completed' : ''}>
    <td className="wsh2-number">{index + 1}</td>
    <th scope="row"><span className="wsh2-train">{row.trainNumber}</span></th>
    <td className="wsh2-time">{formatWashTime(row.nextWash)}</td>
    <td><select aria-label={`Location for ${row.trainNumber} on ${row.date}`} disabled={pending} value={WSH2_LOCATIONS.includes(location) ? location : ''} onChange={(event) => onChange({ location: event.target.value })}>
      {!WSH2_LOCATIONS.includes(location) && <option value="" disabled>{row.location ? `${row.location} (choose)` : 'Select location'}</option>}
      {WSH2_LOCATIONS.map((value) => <option key={value}>{value}</option>)}
    </select></td>
    <td className="wsh2-done-cell"><button type="button" role="checkbox" aria-checked={row.completed} disabled={pending}
      aria-label={`Wash completed for ${row.trainNumber} on ${row.date}`}
      className={`wsh2-tick ${row.completed ? 'is-done' : ''}`}
      onClick={() => onChange({ completed: !row.completed })}>
      {pending ? <Loader2 size={15} className="animate-spin" /> : row.completed ? <Check size={16} strokeWidth={3} /> : <span className="wsh2-empty-tick" />}
      <span>{row.completed ? 'Done' : 'Tick'}</span>
    </button></td>
    <td><button type="button" role="checkbox" aria-checked={row.hvac === 'ON'} disabled={pending}
      aria-label={`Confirm HVAC ON after washing ${row.trainNumber} on ${row.date}`}
      className={`wsh2-tick ${row.hvac === 'ON' ? 'is-done' : ''}`}
      onClick={() => onChange({ hvac: row.hvac === 'ON' ? '' : 'ON' })}>
      {pending ? <Loader2 size={15} className="animate-spin" /> : row.hvac === 'ON' ? <Check size={16} strokeWidth={3} /> : <span className="wsh2-empty-tick" />}
      <span>{row.hvac === 'ON' ? 'ON' : 'Tick'}</span>
    </button></td>
    <td><div className="wsh2-wash-options"><select aria-label={`Wash type for ${row.trainNumber} on ${row.date}`} disabled={pending} value={row.washType} onChange={(event) => onChange({ washType: event.target.value })}><option value="">Select type</option><option>Partial</option><option>Full</option></select>
      <select aria-label={`Depot for ${row.trainNumber} on ${row.date}`} disabled={pending} value={row.depot} onChange={(event) => onChange({ depot: event.target.value })}><option value="">Select depot</option><option value="west">West Depot</option><option value="east">East Depot</option></select></div></td>
  </tr>;
}

export default function Wsh2Workspace() {
  const [rows, setRows] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [dcMark, setDcMark] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pending, setPending] = useState(new Set());
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncFailed, setSyncFailed] = useState(false);
  const fileInput = useRef(null);
  const rowsRef = useRef([]);
  const pendingRef = useRef(new Set());
  const fileMutation = useRef(false);
  const sequence = useRef(0);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const replaceRows = useCallback((next) => { rowsRef.current = next; setRows(next); }, []);

  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    const startedEpoch = epoch.current;
    try {
      const data = await request();
      if (!mounted.current || fileMutation.current || seq !== sequence.current || startedEpoch !== epoch.current) return;
      const current = new Map(rowsRef.current.map((row) => [row.id, row]));
      replaceRows(data.rows.map((row) => pendingRef.current.has(row.id) || (current.get(row.id)?.revision || 0) > row.revision ? current.get(row.id) || row : row));
      setUploads(data.uploads);
      setSyncFailed(false);
      setLoadError('');
    } catch (failure) {
      if (mounted.current && seq === sequence.current) { setSyncFailed(true); setLoadError(failure.message); }
    } finally { if (mounted.current) setLoading(false); }
  }, [replaceRows]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('focus', onVisible); window.removeEventListener('online', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  useEffect(() => {
    if (!confirmDelete || deleting) return;
    const timer = setTimeout(() => setConfirmDelete(null), 15000);
    return () => clearTimeout(timer);
  }, [confirmDelete, deleting]);

  async function changeRow(id, changes) {
    if (fileMutation.current || pendingRef.current.has(id)) return;
    const row = rowsRef.current.find((item) => item.id === id);
    if (!row) return;
    pendingRef.current.add(id); setPending(new Set(pendingRef.current)); epoch.current++;
    setError('');
    try {
      const data = await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, revision: row.revision, changes }) });
      replaceRows(rowsRef.current.map((item) => item.id === id ? data.row : item));
      setSyncFailed(false);
      return data.row;
    } catch (failure) {
      if (failure.data?.row) replaceRows(rowsRef.current.map((item) => item.id === id ? failure.data.row : item));
      setError(failure.message);
      if (failure.status !== 409) setSyncFailed(true);
      return failure.data?.row || rowsRef.current.find((item) => item.id === id);
    } finally { pendingRef.current.delete(id); setPending(new Set(pendingRef.current)); epoch.current++; }
  }

  async function uploadFiles(files) {
    if (!files.length || fileMutation.current || pendingRef.current.size) return;
    if (files.length > 10) { setError('Choose up to 10 Excel files at a time.'); return; }
    fileMutation.current = true; epoch.current++;
    setUploading(true); setConfirmDelete(null); setError(''); setNotice('');
    const messages = [], failures = [];
    for (const file of files) {
      try {
        if (!/\.xlsx$/i.test(file.name) || file.size > WSH2_MAX_FILE_BYTES) throw new Error('Choose an .xlsx file smaller than 5 MB.');
        const form = new FormData(); form.append('file', file);
        const result = await request({ method: 'POST', body: form });
        messages.push(`${file.name}: ${result.alreadyImported ? 'already imported, ticks preserved' : `${result.rowCount} entries imported`}`);
      } catch (failure) { failures.push(`${file.name}: ${failure.message}`); }
    }
    epoch.current++; fileMutation.current = false; setUploading(false); setNotice(messages.join(' · ')); await refresh();
    if (failures.length) setError(failures.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  }

  async function deleteUpload(upload) {
    if (fileMutation.current || pendingRef.current.size || confirmDelete !== upload.id) return;
    fileMutation.current = true; epoch.current++;
    setDeleting(upload.id); setError(''); setNotice('');
    try {
      const result = await request({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: upload.id, confirm: true }) });
      replaceRows(rowsRef.current.filter((row) => row.sourceUploadId !== upload.id));
      setUploads((current) => current.filter((item) => item.id !== upload.id));
      setNotice(`${upload.fileName} deleted from shared storage. ${result.removedRows} checklist rows removed. Rows supplied by other uploads are kept.`);
    } catch (failure) {
      setError(`${failure.message} Refresh and retry the deletion if the file is still listed.`);
    } finally {
      epoch.current++; fileMutation.current = false; setDeleting(null); setConfirmDelete(null); await refresh();
    }
  }

  const groups = useMemo(() => groupWashRows(rows), [rows]);
  const doneCount = rows.filter((row) => row.completed).length;
  const filesBusy = uploading || Boolean(deleting) || pending.size > 0;

  async function printWord() {
    setPrinting(true); setError('');
    try {
      const { buildWsh2Docx } = await import('../lib/wsh2Docx.js');
      const bytes = buildWsh2Docx(rows, { dcMark, depotLabel: 'West and East Depot' });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = document.createElement('a'); link.href = url; link.download = `WSH2-${groups[0].date}-to-${groups.at(-1).date}.docx`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice('Word checklist downloaded. Open it in Word and print. It includes the dates and rows currently shown.');
    } catch (failure) { setError(failure.message); } finally { setPrinting(false); }
  }

  return <section className="wsh2-workspace" aria-label="WSH2 wash checklist">
    <header className="wsh2-heading"><div className="wsh2-heading-title"><span className="wsh2-icon"><Droplets size={24} /></span><div><div className="wsh2-eyebrow">WSH2</div><h1>Wash checklist</h1><p>Daily train washes, shared across depots.</p></div></div>
      <div className="wsh2-actions"><input ref={fileInput} type="file" multiple accept=".xlsx" className="wsh2-file-input" aria-label="Upload wash Excel files" disabled={filesBusy} onChange={(event) => uploadFiles([...event.target.files])} />
        <button type="button" className="wsh2-primary" disabled={filesBusy} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{uploading ? 'Importing…' : 'Upload Excel'}</button>
        <button type="button" onClick={printWord} disabled={!rows.length || printing || filesBusy || syncFailed}>{printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}Print / Word</button>
        <button type="button" aria-label="Refresh shared wash checklist" title="Refresh shared wash checklist" onClick={refresh}><RefreshCw size={16} /></button>
      </div>
    </header>
    <div className="wsh2-toolbar">
      <div className="wsh2-count"><strong>{doneCount}<span> / {rows.length}</span></strong><span>washes completed</span></div>
    </div>
    {(error || loadError) && <div role="alert" className="wsh2-message is-error">{error || loadError}<button type="button" onClick={() => { setError(''); setLoadError(''); refresh(); }}>Refresh</button></div>}
    {notice && <div role="status" className="wsh2-message">{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}
    <section className="wsh2-sources" aria-label="Uploaded Excel files"><header><h2><FileSpreadsheet size={16} />Uploaded Excel files <span>{uploads.length}</span></h2><p>All uploaded dates are shown below, shared by West and East.</p></header>
      {uploads.length ? <ul>{uploads.map((upload) => <li key={upload.id}><div className="wsh2-source-info"><strong>{upload.fileName}</strong><span>{formatWashDate(upload.dateFrom)}{upload.dateFrom !== upload.dateTo ? ` – ${formatWashDate(upload.dateTo)}` : ''} · {upload.currentRowCount === upload.rowCount ? `${upload.rowCount} trains` : `${upload.rowCount} imported · ${upload.currentRowCount} current rows`}</span>
        {confirmDelete === upload.id && <p className="wsh2-delete-warning" role="status">Delete this file and its {upload.currentRowCount} current rows, including completion ticks, for everyone? This cannot be undone. Other uploads are kept.</p>}</div>
        <div className="wsh2-source-actions"><a href={`${API}?download=${encodeURIComponent(upload.id)}`} download aria-label={`Download original ${upload.fileName}`}><Download size={15} />Excel</a>
          <button type="button" className="wsh2-delete" disabled={filesBusy} aria-label={`${confirmDelete === upload.id ? 'Confirm delete' : 'Delete'} ${upload.fileName}`} onClick={() => confirmDelete === upload.id ? deleteUpload(upload) : setConfirmDelete(upload.id)}>{deleting === upload.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{deleting === upload.id ? 'Deleting…' : confirmDelete === upload.id ? 'Confirm?' : 'Delete'}</button>
          {confirmDelete === upload.id && <button type="button" disabled={Boolean(deleting)} aria-label={`Cancel deleting ${upload.fileName}`} onClick={() => setConfirmDelete(null)}>Cancel</button>}</div>
      </li>)}</ul> : <p className="wsh2-no-sources">{loading ? 'Loading files…' : 'No Excel files uploaded yet.'}</p>}
    </section>
    {loading ? <div className="wsh2-empty"><Loader2 size={25} className="animate-spin" /><p>Loading shared wash schedule…</p></div> : !rows.length ? <div className="wsh2-empty"><FileSpreadsheet size={34} /><h2>Upload your wash Excel files</h2><p>Import one or more reports with Train Number and Next Wash columns.<br />Uploading again preserves completed washes.</p></div> : <div className="wsh2-paper">
      {groups.map((group) => <section className="wsh2-date-group" key={group.date} aria-label={`Wash schedule ${formatWashDate(group.date)}`}><header><h2>{formatWashDate(group.date)}</h2><span>{group.rows.filter((row) => row.completed).length} of {group.rows.length} done</span></header>
        <div className="wsh2-table-scroll" tabIndex={0} role="region" aria-label={`Wash table ${formatWashDate(group.date)}`}><table><colgroup><col style={{ width: '4%' }} /><col style={{ width: '16%' }} /><col style={{ width: '20%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} /><col style={{ width: '29%' }} /></colgroup><thead><tr><th scope="col">#</th><th scope="col">Train Number</th><th scope="col">Next Wash</th><th scope="col">Location</th><th scope="col">DONE</th><th scope="col">HVAC ON<span>Confirm after wash</span></th><th scope="col">PARTIAL / FULL <span>WD or ED</span></th></tr></thead><tbody>
          {group.rows.map((row, index) => <WashRow key={row.id} row={row} index={index} pending={pending.has(row.id) || uploading || Boolean(deleting)} onChange={(changes) => changeRow(row.id, changes)} />)}
        </tbody></table></div></section>)}
      <footer className="wsh2-paper-footer"><span>Print / Word exports these {rows.length} rows in the paper layout.</span><label>DC MARK<input maxLength={60} placeholder="Name for print (optional)" value={dcMark} onChange={(event) => setDcMark(event.target.value)} /></label></footer>
    </div>}
  </section>;
}
