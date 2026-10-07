import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Camera, Check, Image, Loader2, QrCode, Upload, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { summarizeRemovalScan } from '@/lib/removalImageAssignments';
import './RemovalScan.css';

export async function removalScanRequest(id, token, options = {}) {
  const response = await fetch(`/api/removal-scan${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    ...options,
    headers: {
      ...(token ? { 'X-Removal-Scan-Token': token } : {}),
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to connect. Please sign in and try again.');
  return payload;
}

async function preparePhoto(file) {
  if (!file.size) throw new Error('This photo is empty. Choose another image.');
  if (file.size <= 4 * 1024 * 1024 && /\.(png|jpe?g|bmp|tiff?)$/i.test(file.name)) return file;
  const url = URL.createObjectURL(file);
  try {
    const photo = new window.Image();
    photo.src = url;
    await photo.decode();
    const scale = Math.min(1, 3200 / Math.max(photo.width, photo.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(photo.width * scale);
    canvas.height = Math.round(photo.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.8, 0.65]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob?.size <= 4 * 1024 * 1024) return new File([blob], 'train-table.jpg', { type: 'image/jpeg' });
    }
    throw new Error('This photo is too large. Choose a smaller image.');
  } catch (error) {
    if (error.message?.includes('too large')) throw error;
    throw new Error('This image format cannot be read on this device. Use a JPG, PNG, or a camera photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function RemovalScanUploader({ id, token }) {
  const camera = useRef(null), gallery = useRef(null);
  const localDemo = import.meta.env.DEV && window.location.pathname === '/compact-slate-preview';
  const uploadActiveRef = useRef(false);
  const mutationRef = useRef(0);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    let stopped = false, timer;
    const controller = new AbortController();
    const poll = async () => {
      const mutation = mutationRef.current;
      try {
        const value = await removalScanRequest(id, token, { signal: controller.signal });
        if (stopped) return;
        if (!uploadActiveRef.current && mutation === mutationRef.current) setSession(value);
        if (!['applied', 'cancelled'].includes(value.status)) timer = setTimeout(poll, 2500);
      } catch (err) {
        if (!stopped) setError(err.message);
      }
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [id, token]);

  const uploadFile = async (file) => {
    if (!file || busy) return;
    uploadActiveRef.current = true;
    mutationRef.current += 1;
    setBusy(true); setError(''); setReviewed(false); setFileName(file.name);
    setSession((current) => ({ ...current, status: 'reading', extraction: null }));
    try {
      const form = new FormData();
      form.append('image', await preparePhoto(file));
      const result = await removalScanRequest(id, token, { method: 'POST', body: form });
      setSession((current) => ({ ...current, ...result }));
    } catch (err) {
      setError(err.message);
      setSession((current) => ({ ...current, status: 'error', extraction: null }));
    } finally { uploadActiveRef.current = false; setBusy(false); }
  };

  const upload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    uploadFile(file);
  };

  const confirm = async () => {
    mutationRef.current += 1;
    uploadActiveRef.current = true;
    setBusy(true); setError('');
    try {
      const result = await removalScanRequest(id, token, { method: 'PATCH', body: JSON.stringify({ action: 'confirm', reviewed }) });
      setSession((current) => ({ ...current, ...result }));
    } catch (err) { setError(err.message); }
    finally { uploadActiveRef.current = false; setBusy(false); }
  };

  const extraction = session?.extraction;
  const summary = extraction ? summarizeRemovalScan(session.target.rows, extraction.rows) : null;
  const finished = ['applied', 'cancelled', 'ready'].includes(session?.status);
  return <div className="removal-scan-surface removal-scan-uploader">
    {session?.target && <p className="removal-scan-period">{session.target.timetable} · {session.target.period}</p>}
    <p className="removal-scan-muted">Include the complete Vehicle ID and Tracking ID columns. Vehicle 301 becomes train 01.</p>
    <input ref={camera} type="file" accept="image/*" capture="environment" onChange={upload} hidden aria-label="Take train table photo" />
    <input ref={gallery} type="file" accept="image/*" onChange={upload} hidden aria-label="Choose train table image" />
    {!finished && <div className="removal-scan-choices">
      <button type="button" disabled={busy || !session || session.status === 'reading'} onClick={() => camera.current.click()}><Camera size={22} />Take photo</button>
      <button type="button" disabled={busy || !session || session.status === 'reading'} onClick={() => gallery.current.click()}><Image size={22} />Choose from gallery</button>
    </div>}
    {localDemo && !finished && <button type="button" className="removal-scan-secondary" disabled={busy || !session} onClick={() => uploadFile(new File(['local example'], 'example-table.png', { type: 'image/png' }))}>Try example table (local demo)</button>}
    {(busy || session?.status === 'reading') && <p role="status" className="removal-scan-status"><Loader2 className="animate-spin" size={18} />{session?.status === 'reading' ? 'Reading train numbers and TIDs…' : 'Sending update…'}</p>}
    {error && <p role="alert" className="removal-scan-error">{error}</p>}
    {extraction && !finished && <>
      <div className="removal-scan-review-heading"><h3>Review detected trains</h3><span>{extraction.rows.length} read</span></div>
      {fileName && <p className="removal-scan-filename">{fileName}</p>}
      {extraction.uncertain && <p className="removal-scan-warning">Some text may be unclear. Check every detected number against your photo.</p>}
      <div className="removal-scan-table"><table><thead><tr><th>Vehicle</th><th>Train</th><th>Tracking ID</th></tr></thead><tbody>
        {extraction.rows.map((row) => <tr key={row.trainId}><td>{row.vehicleId}</td><td>{row.trainId}</td><td>{row.tid || <span className="removal-scan-muted">No TID</span>}</td></tr>)}
      </tbody></table></div>
      <p className="removal-scan-impact"><strong>{summary.matched}</strong> TIDs matched · <strong>{summary.cleared}</strong> existing train assignments will clear.</p>
      <p className="removal-scan-muted">TIDs missing from this picture will have their train numbers cleared in this period. Timetable TIDs and times stay in place.</p>
      {summary.unmatched.length > 0 && <p className="removal-scan-warning">TIDs outside this period: {summary.unmatched.join(', ')}.</p>}
      <label className="removal-scan-confirm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I checked the numbers and included the complete table.</label>
      <button className="removal-scan-primary" type="button" disabled={!reviewed || busy} onClick={confirm}><Check size={17} />Update Removal summary</button>
    </>}
    {session?.status === 'ready' && <p role="status" className="removal-scan-status"><Loader2 className="animate-spin" size={18} />Waiting for the computer to save the update. Keep its QR window open.</p>}
    {session?.status === 'applied' && <p role="status" className="removal-scan-success"><Check size={20} />Removal summary updated and saved. You can close this page.</p>}
    {session?.status === 'cancelled' && <p className="removal-scan-warning">This QR was closed. Open a new QR on the computer.</p>}
  </div>;
}

export default function RemovalScanButton({ getTarget, onApply, disabled = false }) {
  const [open, setOpen] = useState(false), [session, setSession] = useState(null);
  const [qr, setQr] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [uploadHere, setUploadHere] = useState(false), [working, setWorking] = useState(false);
  const [retry, setRetry] = useState(0);
  const targetRef = useRef(null), applyRef = useRef(onApply), appliedRef = useRef(false);
  const lifecycleRef = useRef(0);
  applyRef.current = onApply;
  const preview = import.meta.env.DEV && window.location.pathname === '/compact-slate-preview';
  const scanUrl = session ? `${window.location.origin}/${preview ? 'compact-slate-preview' : ''}#/removal-scan?id=${session.id}&token=${session.token}` : '';

  const start = async () => {
    const lifecycle = ++lifecycleRef.current;
    setOpen(true); setError(''); setStatus('Creating your QR…'); setWorking(true); setUploadHere(false);
    appliedRef.current = false; setSession(null); setQr('');
    try {
      targetRef.current = getTarget();
      const result = await removalScanRequest('', '', { method: 'POST', body: JSON.stringify({ target: targetRef.current.target }) });
      if (lifecycle !== lifecycleRef.current) {
        await removalScanRequest(result.id, '', { method: 'DELETE' });
        return;
      }
      setSession(result); setStatus('Waiting for a photo');
    } catch (err) { if (lifecycle === lifecycleRef.current) setError(err.message); }
    finally { if (lifecycle === lifecycleRef.current) setWorking(false); }
  };

  useEffect(() => {
    if (!scanUrl) return;
    let stopped = false;
    QRCode.toDataURL(scanUrl, { width: 280, margin: 4, errorCorrectionLevel: 'M' })
      .then((value) => { if (!stopped) setQr(value); }).catch(() => setError('Unable to generate the QR. Use upload on this device.'));
    return () => { stopped = true; };
  }, [scanUrl]);

  useEffect(() => {
    if (!open || !session?.id) return;
    let stopped = false, timer;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const result = await removalScanRequest(session.id, '', { signal: controller.signal });
        if (stopped) return;
        const labels = { waiting: 'Waiting for a photo', reading: 'Reading the photo…', review: 'Review the detected trains on your phone', ready: 'Saving Removal summary…', applied: 'Removal summary updated and saved', error: 'Try another photo on your phone', cancelled: 'This QR was cancelled' };
        setStatus(labels[result.status] || 'Waiting');
        if (result.status === 'ready') {
          setWorking(true);
          if (!appliedRef.current) {
            await applyRef.current(result.extraction.rows, targetRef.current, session.id);
            appliedRef.current = true;
          }
          await removalScanRequest(session.id, '', { method: 'PATCH', body: JSON.stringify({ action: 'apply' }) });
          setStatus('Removal summary updated and saved'); setWorking(false);
          return;
        }
        if (!['applied', 'cancelled'].includes(result.status)) timer = setTimeout(poll, 2000);
      } catch (err) {
        if (!stopped) { setError(err.message); setWorking(false); }
      }
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [open, session?.id, retry]);

  const close = () => {
    if (working) return;
    lifecycleRef.current += 1;
    if (session?.id && !appliedRef.current) removalScanRequest(session.id, '', { method: 'DELETE' }).catch(() => {});
    setOpen(false); setSession(null);
  };

  return <>
    <button type="button" className="theme-train-rem-export removal-scan-trigger" disabled={disabled} onClick={start} title="Scan train assignments from a photo"><QrCode size={14} />QR</button>
    <Dialog.Root open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="removal-scan-overlay" />
      <Dialog.Content className="removal-scan-surface removal-scan-dialog" onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }} onPointerDownOutside={(event) => { if (working) event.preventDefault(); }}>
        <Dialog.Title className="removal-scan-title"><QrCode size={23} />Scan train assignments</Dialog.Title>
        <Dialog.Description className="removal-scan-muted">Scan with your phone, then take a photo or choose one from your gallery.</Dialog.Description>
        {session && <p className="removal-scan-period">{session.target.timetable} · {session.target.period}</p>}
        {preview && <p className="removal-scan-warning">Local demo uses the example table. Phone scanning needs the deployed site.</p>}
        {!uploadHere && qr && <img className="removal-scan-qr" src={qr} width="280" height="280" alt="QR code for uploading a train tracking table" />}
        {!uploadHere && session && <>
          <p className="removal-scan-muted">Valid for 15 minutes. Sign in on your phone if asked. Keep this window open.</p>
          <a className="removal-scan-link" href={scanUrl} target="_blank" rel="noreferrer">Open upload page</a>
          <button className="removal-scan-secondary" type="button" onClick={() => setUploadHere(true)}><Upload size={16} />Upload on this device</button>
        </>}
        <p role="status" className="removal-scan-status">{working && <Loader2 className="animate-spin" size={16} />}{status}</p>
        {error && <p role="alert" className="removal-scan-error">{error}</p>}
        {error && session && <button type="button" className="removal-scan-secondary" onClick={() => { setError(''); setRetry((value) => value + 1); }}>Retry update</button>}
        {uploadHere && session && <RemovalScanUploader id={session.id} token={session.token} />}
        <Dialog.Close className="removal-scan-close" aria-label="Close scanner" disabled={working}><X size={18} /></Dialog.Close>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

export function RemovalScanPage() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const id = params.get('id'), token = params.get('token');
  return <main className="removal-scan-page"><section className="removal-scan-surface removal-scan-phone">
    <div className="removal-scan-title"><QrCode size={25} /><h1>Removal summary</h1></div>
    <p className="removal-scan-muted">Scan train assignments</p>
    {import.meta.env.DEV && <p className="removal-scan-warning">Local demo: example OCR results only.</p>}
    {id && token ? <RemovalScanUploader key={`${id}:${token}`} id={id} token={token} /> : <p role="alert" className="removal-scan-error">Scan the QR from Removal summary to open an upload session.</p>}
  </section></main>;
}
