export default function Wsh2PendingWashSummary({ rows }) {
  if (!rows.length) return null;
  const pendingRows = rows.filter((row) => !row.completed);

  return <div className={`wsh2-pending-wash${pendingRows.length ? '' : ' is-complete'}`} role="status" aria-live="polite" aria-atomic="true">
    {pendingRows.length ? <>
      <strong>Pending wash ({pendingRows.length}):</strong>
      <span>{pendingRows.map((row) => String(row.trainNumber).replace(/^L3-MV-3(\d{2})$/i, '$1')).join(', ')}</span>
    </> : <span>All trains completed wash.</span>}
  </div>;
}
