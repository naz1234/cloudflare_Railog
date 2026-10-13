import React from 'react';
import { ClipboardCheck, Copy, Download, FileSpreadsheet } from 'lucide-react';
import PstFldcChecklist from './PstFldcChecklist';
import '../pstExcelFormatLog.css';

export default function PstExcelFormatLogPanel({
  depot, completedBy, onCompletedByChange, fldcController,
  liveStatus, liveHealthy, liveStatusClass, liveDebug,
  downloadingDepot, copyingDepot, copiedDepot, onDownload, onCopy,
}) {
  const depotLabel = depot === 'west' ? 'West Depot' : 'East Depot';
  const shortLabel = depot === 'west' ? 'WD' : 'ED';
  const busy = Boolean(downloadingDepot || copyingDepot);
  const groups = [{ key: depot, title: depotLabel, shortLabel }, { key: 'combined', title: 'Combined', shortLabel: 'combined WD and ED' }];

  return (
    <section className="pst-excel-format-panel" data-pst-excel-design="fluent" data-depot={depot}
      data-pst-live-status-class={liveStatusClass || ''} aria-label={`${depotLabel} PST Excel Format Log`}>
      <header className="pst-excel-format-header">
        <FileSpreadsheet aria-hidden="true" className="pst-excel-format-icon" strokeWidth={1.6} />
        <div className="pst-excel-format-heading">
          <h2>PST Excel Format Log</h2>
          <p className="pst-excel-sync" role="status">
            <span aria-hidden="true" className={`pst-excel-sync-dot ${liveHealthy ? 'is-healthy' : 'is-warning'}`} />
            {liveStatus}
          </p>
          {liveDebug && <p className="pst-excel-sync-debug">{liveDebug}</p>}
        </div>
      </header>

      <div className="pst-excel-completed-section">
        <label className="pst-excel-completed-label" htmlFor={`pst-excel-completed-by-${depot}`}>Completed By</label>
        <span className="pst-excel-depot-badge">{depotLabel}</span>
        <input id={`pst-excel-completed-by-${depot}`} className="pst-excel-completed-input" type="text"
          value={completedBy || ''} onChange={(event) => onCompletedByChange(depot, event.target.value)}
          aria-label={`${depotLabel} PST completed by name`} placeholder={`${depotLabel} name`} />
      </div>

      <PstFldcChecklist depot={depot} controller={fldcController} />

      <footer className="pst-excel-export-groups" aria-label={`${depotLabel} Excel actions`}>
        {groups.map((group) => (
          <div key={group.key} className={`pst-excel-export-group ${group.key === 'combined' ? 'is-combined' : 'is-depot'}`}>
            <h3>{group.title}</h3>
            <button type="button" className="pst-excel-export-button" disabled={busy} onClick={() => onDownload(group.key)}
              aria-label={`Download ${group.shortLabel} PST and Train Prep Excel report to paste into the official ELOG`}
              title={`Download ${group.title} PST and Train Prep Excel report to paste into the official ELOG`}>
              <Download size={16} aria-hidden="true" />
              <span>{downloadingDepot === group.key ? 'Preparing…' : 'Download Excel'}</span>
            </button>
            <button type="button" className={`pst-excel-export-button ${copiedDepot === group.key ? 'is-copied' : ''}`}
              data-copy-state={copiedDepot === group.key ? 'copied' : copyingDepot === group.key ? 'copying' : 'idle'}
              disabled={busy} onClick={() => onCopy(group.key)}
              aria-label={`Copy ${group.shortLabel} PST and Train Prep Excel rows 3 to 49`}
              title={`Copy ${group.title} Excel output rows 3 to 49 for direct paste into A3:M49, including FLDC verification`}>
              {copiedDepot === group.key ? <ClipboardCheck size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span aria-live="polite">{copyingDepot === group.key ? 'Copying…' : copiedDepot === group.key ? 'Copied A3:M49' : 'Copy Output'}</span>
            </button>
          </div>
        ))}
      </footer>
    </section>
  );
}
