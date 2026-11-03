import { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { formatWashDate } from '../lib/wsh2Records.js';
import { getWashBatchOptions, WSH2_BATCH_MAX_INPUT } from '../lib/wsh2BatchCompletion.js';

export default function Wsh2BatchCompletion({ rows, uploads, busy, blocked, onSubmit }) {
  const options = useMemo(() => getWashBatchOptions(rows, uploads), [rows, uploads]);
  const [selection, setSelection] = useState('');
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const option = options.find(item => item.key === selection);
  const disabled = busy || blocked || submitting || !options.length;

  async function submit(event) {
    event.preventDefault();
    if (disabled) return;
    setError(''); setSuccess('');
    if (!option) { setError('Choose an Excel file and date first.'); return; }
    setSubmitting(true);
    try {
      const result = await onSubmit({ uploadId: option.uploadId, date: option.date, input });
      setSuccess(`${result.updatedCount} train${result.updatedCount === 1 ? '' : 's'} marked Done · HVAC ON.`);
      setInput('');
    } catch (failure) { setError(failure.message); }
    finally { setSubmitting(false); }
  }

  return <section className="wsh2-batch-panel" aria-label="Batch wash completion">
    <header><h2><Check size={16} />Batch wash completion</h2><p>Mark several trains Done at once.</p></header>
    <form onSubmit={submit}>
      <label>Excel file / date<select aria-label="Batch wash Excel file and date" value={option ? selection : ''} disabled={disabled} onChange={event => { setSelection(event.target.value); setError(''); setSuccess(''); }}>
        <option value="">Select Excel file / date</option>
        {options.map(item => <option key={item.key} value={item.key}>{formatWashDate(item.date)} — {item.fileName} ({item.count} trains)</option>)}
      </select></label>
      <label>Train numbers<textarea aria-label="Completed wash train numbers" value={input} placeholder="01 02 03 04 05" rows={3} maxLength={WSH2_BATCH_MAX_INPUT} disabled={disabled} onChange={event => { setInput(event.target.value); setError(''); setSuccess(''); }} /></label>
      <p className="wsh2-batch-help">Only the selected file/date is updated. Wash details stay manual.</p>
      {error && <p role="alert" className="wsh2-batch-error">{error}</p>}
      {success && <p role="status" className="wsh2-batch-success">{success}</p>}
      <button type="submit" className="wsh2-primary" disabled={disabled}>{submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{submitting ? 'Submitting…' : 'Submit completed wash'}</button>
    </form>
  </section>;
}
