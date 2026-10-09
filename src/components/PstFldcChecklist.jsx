import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import '../pstFldcChecklist.css';

export default function PstFldcChecklist({ depot, controller }) {
  const label = depot === 'west' ? 'West Depot' : 'East Depot';
  const draft = controller.drafts[depot];
  const count = controller.trainIds[depot].length;
  const confirmed = controller.isConfirmed(depot);
  const busy = controller.saving[depot];
  const inputLocked = !controller.loaded[depot] || busy === 'confirm';
  const ready = controller.loaded[depot];
  const error = controller.errors[depot];
  const canConfirm = ready && count > 0 && draft.by.trim() && draft.verified && !confirmed && !busy;
  return <section className="pst-fldc-checklist" aria-label={`${label} FLDC checklist`} data-depot={depot}>
    <div className="pst-fldc-heading"><ShieldCheck size={16} /><h3>FLDC Verification</h3><span>{confirmed ? count : 0} / {count}</span></div>
    <label className="pst-fldc-name"><span>Verified via FLDC by</span>
      <input type="text" value={draft.by} disabled={inputLocked} required aria-label={`${label} FLDC verifier name`} placeholder="Enter DC name / second DC name" onChange={(event) => controller.updateDraft(depot, { by: event.target.value })} />
    </label>
    <label className="pst-fldc-check">
      <input type="checkbox" aria-label={`Verified via FLDC — ${label}`} disabled={inputLocked} checked={draft.verified} onChange={(event) => controller.updateDraft(depot, { verified: event.target.checked })} />
      <span><strong>Verified via FLDC</strong><small>I confirm all {count} trains in {label} have been verified.</small></span>
    </label>
    <button type="button" className={`pst-fldc-confirm ${confirmed ? 'is-confirmed' : ''}`} disabled={!canConfirm} onClick={() => controller.confirm(depot)}>
      <Check size={14} />{busy ? 'Saving…' : confirmed ? `Confirmed all ${count} trains` : `Confirm all ${count} trains`}
    </button>
    {error ? <div role="alert" className="pst-fldc-error">{error}<button type="button" disabled={busy} onClick={() => controller.retry(depot)}>Retry</button></div>
      : <p role="status" className={`pst-fldc-status ${confirmed ? 'is-confirmed' : ''}`}>
        {!ready ? 'Loading verification…' : confirmed ? `Verified by ${draft.by.trim()} · included in columns L–M.` : count === 0 ? 'No trains in this depot to verify.' : 'Columns L–M stay blank until confirmed. Reconfirm when the depot train list changes.'}
      </p>}
  </section>;
}
