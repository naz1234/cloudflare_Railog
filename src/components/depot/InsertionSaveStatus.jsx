export default function InsertionSaveStatus({ depot, status, onRetry, onUseShared }) {
  if (!status) return null;
  const failed = status.phase === 'failed';
  const busy = ['pending', 'saving', 'loading'].includes(status.phase);
  const label = failed ? 'Failed' : busy ? 'Saving…' : 'Saved';
  const colors = failed ? 'border-red-400/60 bg-red-950/40 text-red-200' : busy ? 'border-amber-400/50 bg-amber-950/30 text-amber-200' : 'border-emerald-400/50 bg-emerald-950/30 text-emerald-200';
  return <span className="insertion-save-feedback inline-flex flex-wrap items-center gap-1.5 text-[10px]" data-insertion-save-depot={depot}>
    <span role="status" aria-live="polite" data-save-state={failed ? 'failed' : busy ? 'saving' : 'saved'} aria-label={`${depot === 'east' ? 'East' : 'West'} Depot: ${label}${status.error ? `. ${status.error}` : ''}`} title={status.error || (busy ? 'Waiting for shared storage confirmation' : 'Confirmed in shared storage. An orange Sync button only means the layout differs from Main.')} className={`rounded-full border px-2 py-1 font-semibold ${colors}`}>{label}</span>
    {failed && <button type="button" onClick={onRetry} className="rounded border border-sky-500/50 px-2 py-1 text-sky-200" aria-label={`Retry ${depot} depot save`}>{status.retryLabel || 'Retry save'}</button>}
    {failed && status.conflict && <button type="button" onClick={onUseShared} className="rounded border border-amber-500/50 px-2 py-1 text-amber-200" aria-label={`Use shared ${depot} depot values`}>Use shared</button>}
    {failed && <span className="insertion-save-error max-w-[260px] text-red-300">{status.error || 'Your input is kept.'}</span>}
  </span>;
}
