import React, { useEffect, useState } from 'react';
import { Check, Copy, ShieldCheck, Trash2 } from 'lucide-react';
import { buildPstFldcChecklistLog } from '../lib/pstFldcVerification';
import '../pstFldcChecklist.css';

export default function PstFldcChecklist({ depot, controller }) {
  const [copyStatus, setCopyStatus] = useState('');
  const label = depot === 'west' ? 'West Depot' : 'East Depot';
  const draft = controller.drafts[depot];
  const trainIds = controller.trainIds[depot];
  const selected = new Set(controller.getSelectedTrainIds(depot));
  const count = trainIds.length;
  const confirmed = controller.isConfirmed(depot);
  const busy = controller.saving[depot];
  const ready = controller.loaded[depot];
  const error = controller.errors[depot];
  const inputLocked = !ready || busy === 'confirm';
  const canTick = ready && draft.by.trim() && !busy && !error;
  const generatedLog = buildPstFldcChecklistLog(controller.exportVerifications[depot]);

  useEffect(() => { setCopyStatus(''); }, [generatedLog]);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(''), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const copyLog = async () => {
    if (!generatedLog || busy) return;
    try {
      await navigator.clipboard.writeText(generatedLog);
      setCopyStatus('copied');
    } catch { setCopyStatus('failed'); }
  };

  return <section className="pst-fldc-checklist" aria-label={label + ' FLDC checklist'} data-depot={depot} aria-busy={Boolean(busy)}>
    <div className="pst-fldc-heading"><ShieldCheck size={24} aria-hidden="true" /><div><h3>FLDC Checker</h3><p>Tick each train after verifying its PST via FLDC.</p></div><span className={'pst-fldc-count ' + (confirmed ? 'is-confirmed' : '')}>{selected.size} selected</span></div>
    <label className="pst-fldc-name"><span>Verified via FLDC by</span>
      <input type="text" value={draft.by} disabled={inputLocked} required aria-label={label + ' FLDC verifier name'} placeholder="Enter DC name / second DC name" onChange={(event) => controller.updateDraft(depot, { by: event.target.value })} />
    </label>
    <div className="pst-fldc-trains" role="group" aria-label={label + ' PST trains to verify'}>
      {trainIds.map((id) => <button key={id} type="button" role="checkbox" aria-checked={selected.has(id)}
        aria-label={'Verify T' + id + ' via FLDC at ' + label} disabled={!canTick}
        className={'pst-fldc-train ' + (selected.has(id) ? 'is-selected' : '')} onClick={() => controller.toggleTrain(depot, id)}>
        <span className="pst-fldc-train-check" aria-hidden="true">{selected.has(id) && <Check size={9} />}</span>T{id}
      </button>)}
    </div>
    {!count && <p className="pst-fldc-status">No started or completed PST records in this depot to verify.</p>}
    <div className="pst-fldc-generated">
      <div className="pst-fldc-generated-heading"><span>Generated log</span><div>
        <button type="button" className={'pst-fldc-copy ' + (copyStatus === 'copied' ? 'is-copied' : '')} onClick={copyLog} disabled={!generatedLog || Boolean(busy)}><Copy size={11} aria-hidden="true" />{copyStatus === 'copied' ? 'Copied!' : 'Copy Log'}</button>
        <button type="button" className="pst-fldc-clear" onClick={() => controller.clear(depot)} disabled={!ready || Boolean(busy) || !selected.size}><Trash2 size={11} aria-hidden="true" />Clear</button>
      </div></div>
      {generatedLog ? <pre className="pst-fldc-log">{generatedLog}</pre> : <p className="pst-fldc-placeholder">{busy ? 'Saving verification…' : error ? 'Verification not saved. Retry before copying or exporting.' : 'Enter your name, then tick the trains you have verified.'}</p>}
    </div>
    {copyStatus && <p className="pst-fldc-status" role="status">{copyStatus === 'copied' ? 'FLDC log copied.' : 'Unable to copy the log. Please try again.'}</p>}
    {error ? <div role="alert" className="pst-fldc-error">{error}<button type="button" disabled={Boolean(busy)} onClick={() => controller.retry(depot)}>Retry</button></div>
      : <p role="status" className={'pst-fldc-status ' + (confirmed ? 'is-confirmed' : '')}>
        {!ready ? 'Loading verification…' : busy ? 'Saving…' : selected.size + ' of ' + count + ' PST trains verified. Only saved ticks are included in Excel columns L–M. Untick or Clear to remove verification.'}
      </p>}
  </section>;
}
