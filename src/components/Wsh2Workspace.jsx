import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cloud, Download, Droplets, FileSpreadsheet, Loader2, Printer, RefreshCw, Upload } from 'lucide-react';
import { formatWashDate, formatWashTime, groupWashRows, WSH2_MAX_FILE_BYTES } from '../lib/wsh2Records.js';
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

function LocationInput({ row, disabled, onChange }) {
  const [text, setText] = useState(row.location);
  const focused = useRef(false);
  const editingRevision = useRef(row.revision);
  const cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setText(row.location); }, [row.location, row.revision]);
  return <input aria-label={`Location for ${row.trainNumber} on ${row.date}`} maxLength={40} value={text} disabled={disabled}
    onFocus={() => { focused.current = true; editingRevision.current = row.revision; cancelled.current = false; }} onChange={(event) => setText(event.target.value)}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setText(row.location); event.currentTarget.blur(); } }}
    onBlur={async () => {
      focused.current = false;
      if (!cancelled.current && text.trim() !== row.location) {
        const savedRow = await onChange({ location: text.trim() }, editingRevision.current);
        setText(savedRow?.location ?? row.location);
      }
    }} />;
}

function WashRow({ row, index, pending, onChange, workingDepot }) {
  return <tr className={row.completed ? 'wsh2-completed' : ''}>
    <td className="wsh2-number">{index + 1}</td>
    <th scope="row"><span className="wsh2-train">{row.trainNumber}</span></th>
    <td className="wsh2-time">{formatWashTime(row.nextWash)}</td>
    <td><LocationInput row={row} disabled={pending} onChange={onChange} /></td>
    <td className="wsh2-done-cell"><button type="button" role="checkbox" aria-checked={row.completed} disabled={pending}
      aria-label={`Wash completed for ${row.trainNumber} on ${row.date}`}
      className={`wsh2-tick ${row.completed ? 'is-done' : ''}`}
      onClick={() => onChange({ completed: !row.completed, ...(!row.completed && !row.depot ? { depot: workingDepot } : {}) })}>
      {pending ? <Loader2 size={15} className="animate-spin" /> : row.completed ? <Check size={16} strokeWidth={3} /> : <span className="wsh2-empty-tick" />}
      <span>{row.completed ? 'Done' : 'Tick'}</span>
    </button></td>
    <td><select aria-label={`HVAC for ${row.trainNumber} on ${row.date}`} disabled={pending} value={row.hvac} onChange={(event) => onChange({ hvac: event.target.value })}><option value="">—</option><option>ON</option><option>OFF</option></select></td>
    <td><div className="wsh2-wash-options"><select aria-label={`Wash type for ${row.trainNumber} on ${row.date}`} disabled={pending} value={row.washType} onChange={(event) => onChange({ washType: event.target.value })}><option value="">Select type</option><option>Partial</option><option>Full</option></select>
      <select aria-label={`Depot for ${row.trainNumber} on ${row.date}`} disabled={pending} value={row.depot} onChange={(event) => onChange({ depot: event.target.value })}><option value="">Select depot</option><option value="west">West Depot</option><option value="east">East Depot</option></select></div></td>
  </tr>;
}

export default function Wsh2Workspace({ localPreview = false }) {
  const [rows, setRows] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [workingDepot, setWorkingDepot] = useState('west');
  const [depotFilter, setDepotFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dcMark, setDcMark] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pending, setPending] = useState(new Set());
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncTime, setSyncTime] = useState('');
  const [syncFailed, setSyncFailed] = useState(false);
  const fileInput = useRef(null);
  const rowsRef = useRef([]);
  const pendingRef = useRef(new Set());
  const sequence = useRef(0);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const replaceRows = useCallback((next) => { rowsRef.current = next; setRows(next); }, []);

  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    const startedEpoch = epoch.current;
    try {
      const data = await request();
      if (!mounted.current || seq !== sequence.current || startedEpoch !== epoch.current) return;
      const current = new Map(rowsRef.current.map((row) => [row.id, row]));
      replaceRows(data.rows.map((row) => pendingRef.current.has(row.id) || (current.get(row.id)?.revision || 0) > row.revision ? current.get(row.id) || row : row));
      setUploads(data.uploads);
      setSyncTime(data.serverTime);
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

  async function changeRow(id, changes, editingRevision) {
    if (pendingRef.current.has(id)) return;
    const row = rowsRef.current.find((item) => item.id === id);
    pendingRef.current.add(id); setPending(new Set(pendingRef.current)); epoch.current++;
    setError('');
    try {
      const data = await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, revision: editingRevision ?? row.revision, changes }) });
      replaceRows(rowsRef.current.map((item) => item.id === id ? data.row : item));
      setSyncTime(data.row.updatedAt); setSyncFailed(false);
      return data.row;
    } catch (failure) {
      if (failure.data?.row) replaceRows(rowsRef.current.map((item) => item.id === id ? failure.data.row : item));
      setError(failure.message);
      if (failure.status !== 409) setSyncFailed(true);
      return failure.data?.row || rowsRef.current.find((item) => item.id === id);
    } finally { pendingRef.current.delete(id); setPending(new Set(pendingRef.current)); epoch.current++; }
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    if (files.length > 10) { setError('Choose up to 10 Excel files at a time.'); return; }
    setUploading(true); setError(''); setNotice('');
    const messages = [], failures = [];
    for (const file of files) {
      try {
        if (!/\.xlsx$/i.test(file.name) || file.size > WSH2_MAX_FILE_BYTES) throw new Error('Choose an .xlsx file smaller than 5 MB.');
        const form = new FormData(); form.append('file', file);
        const result = await request({ method: 'POST', body: form });
        messages.push(`${file.name}: ${result.alreadyImported ? 'already imported, ticks preserved' : `${result.rowCount} entries imported`}`);
      } catch (failure) { failures.push(`${file.name}: ${failure.message}`); }
    }
    epoch.current++; setUploading(false); setNotice(messages.join(' · ')); await refresh();
    if (failures.length) setError(failures.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  }

  const visibleRows = useMemo(() => rows.filter((row) => (!from || row.date >= from) && (!to || row.date <= to)
    && (depotFilter === 'all' || (depotFilter === 'unassigned' ? !row.depot : row.depot === depotFilter))
    && (statusFilter === 'all' || row.completed === (statusFilter === 'done'))), [rows, from, to, depotFilter, statusFilter]);
  const groups = useMemo(() => groupWashRows(visibleRows), [visibleRows]);
  const doneCount = visibleRows.filter((row) => row.completed).length;

  async function printWord() {
    setPrinting(true); setError('');
    try {
      const { buildWsh2Docx } = await import('../lib/wsh2Docx.js');
      const bytes = buildWsh2Docx(visibleRows, { dcMark, depotLabel: depotFilter === 'west' ? 'West Depot' : depotFilter === 'east' ? 'East Depot' : 'West and East Depot' });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = document.createElement('a'); link.href = url; link.download = `WSH2-${groups[0].date}-to-${groups.at(-1).date}.docx`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice('Word checklist downloaded. Open it in Word and print. It includes the dates and rows currently shown.');
    } catch (failure) { setError(failure.message); } finally { setPrinting(false); }
  }

  return <section className="wsh2-workspace" aria-label="WSH2 wash checklist">
    <header className="wsh2-heading"><div className="wsh2-heading-title"><span className="wsh2-icon"><Droplets size={24} /></span><div><div className="wsh2-eyebrow">WSH2</div><h1>Wash checklist</h1><p>Daily train washes, shared across depots.</p></div></div>
      <div className="wsh2-actions"><input ref={fileInput} type="file" multiple accept=".xlsx" className="wsh2-file-input" aria-label="Upload wash Excel files" disabled={uploading} onChange={(event) => uploadFiles([...event.target.files])} />
        <button type="button" className="wsh2-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{uploading ? 'Importing…' : 'Upload Excel'}</button>
        <button type="button" onClick={printWord} disabled={!visibleRows.length || printing || pending.size > 0 || uploading || syncFailed}>{printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}Print / Word</button>
        <button type="button" aria-label="Refresh shared wash checklist" title="Refresh shared wash checklist" onClick={refresh}><RefreshCw size={16} /></button>
      </div>
    </header>
    <div className="wsh2-toolbar">
      <label>Working depot<select value={workingDepot} onChange={(event) => setWorkingDepot(event.target.value)}><option value="west">West Depot</option><option value="east">East Depot</option></select></label>
      <p className="wsh2-depot-hint">Used when you tick a train with no depot selected.</p>
      <div className={`wsh2-sync ${syncFailed ? 'is-error' : ''}`} role="status">{loading || pending.size || uploading ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={15} />}<span>{loading ? 'Loading…' : pending.size ? 'Saving…' : syncFailed ? 'Not synced — retry' : `${localPreview ? 'Local D1 + R2' : 'Shared D1 + R2'}${syncTime ? ` · ${new Date(syncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span></div>
    </div>
    {(error || loadError) && <div role="alert" className="wsh2-message is-error">{error || loadError}<button type="button" onClick={() => { setError(''); setLoadError(''); refresh(); }}>Refresh</button></div>}
    {notice && <div role="status" className="wsh2-message">{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}
    <div className="wsh2-filters">
      <label>From<input type="date" aria-label="Wash date from" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>To<input type="date" aria-label="Wash date to" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label>Show depot<select value={depotFilter} onChange={(event) => setDepotFilter(event.target.value)}><option value="all">All depots</option><option value="west">West Depot</option><option value="east">East Depot</option><option value="unassigned">Not selected</option></select></label>
      <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All washes</option><option value="pending">Pending</option><option value="done">Completed</option></select></label>
      <div className="wsh2-count"><strong>{doneCount}<span> / {visibleRows.length}</span></strong><span>washes completed</span></div>
    </div>
    {loading ? <div className="wsh2-empty"><Loader2 size={25} className="animate-spin" /><p>Loading shared wash schedule…</p></div> : !rows.length ? <div className="wsh2-empty"><FileSpreadsheet size={34} /><h2>Upload your wash Excel files</h2><p>Import one or more reports with Train Number and Next Wash columns.<br />Uploading again preserves completed washes.</p></div> : !groups.length ? <div className="wsh2-empty"><p>No washes match these filters.</p><button type="button" onClick={() => { setFrom(''); setTo(''); setDepotFilter('all'); setStatusFilter('all'); }}>Show all washes</button></div> : <div className="wsh2-paper">
      {groups.map((group) => <section className="wsh2-date-group" key={group.date} aria-label={`Wash schedule ${formatWashDate(group.date)}`}><header><h2>{formatWashDate(group.date)}</h2><span>{group.rows.filter((row) => row.completed).length} of {group.rows.length} done</span></header>
        <div className="wsh2-table-scroll" tabIndex={0} role="region" aria-label={`Wash table ${formatWashDate(group.date)}`}><table><colgroup><col style={{ width: '4%' }} /><col style={{ width: '16%' }} /><col style={{ width: '20%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} /><col style={{ width: '29%' }} /></colgroup><thead><tr><th scope="col">#</th><th scope="col">Train Number</th><th scope="col">Next Wash</th><th scope="col">Location</th><th scope="col">DONE</th><th scope="col">HVAC</th><th scope="col">PARTIAL / FULL <span>WD or ED</span></th></tr></thead><tbody>
          {group.rows.map((row, index) => <WashRow key={row.id} row={row} index={index} pending={pending.has(row.id)} workingDepot={workingDepot} onChange={(changes, editingRevision) => changeRow(row.id, changes, editingRevision)} />)}
        </tbody></table></div></section>)}
      <footer className="wsh2-paper-footer"><span>Print / Word exports these {visibleRows.length} rows in the paper layout.</span><label>DC MARK<input maxLength={60} placeholder="Name for print (optional)" value={dcMark} onChange={(event) => setDcMark(event.target.value)} /></label></footer>
    </div>}
    {uploads.length > 0 && <details className="wsh2-sources"><summary><FileSpreadsheet size={16} />Uploaded Excel files <span>{uploads.length}</span></summary><ul>{uploads.map((upload) => <li key={upload.id}><div><strong>{upload.fileName}</strong><span>{upload.rowCount} entries · {formatWashDate(upload.dateFrom)}{upload.dateFrom !== upload.dateTo ? ` – ${formatWashDate(upload.dateTo)}` : ''}</span></div><a href={`${API}?download=${encodeURIComponent(upload.id)}`} download aria-label={`Download original ${upload.fileName}`}><Download size={15} />Original Excel</a></li>)}</ul></details>}
  </section>;
}
