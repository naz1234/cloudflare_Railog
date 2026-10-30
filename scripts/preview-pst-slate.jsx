import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PSTTabContent } from '../src/pages/DepotStabling';
import { base44 } from './preview-compact-slate-api';
import { savePstFldcVerification, getPstFldcDate } from '../src/lib/pstFldcVerification';
import '../src/index.css';
import '../src/pstCompletionColors.css';

const rows = ids => ids.map(trainId => ({ trainId }));
const initialData = {
  'WD-ST15': rows(['', '31', '45', '08', '26', '40', '04']),
  'WD-ST14': rows(['18', '36', '15', '28', '20', '47', '42']),
  'WD-ST13': rows(['16', '12', '35', '37', '01', '21', '11']),
  'WD-ST12': rows(['', '10', '33', '29', '17', '02', '34']),
  'ED-ST02': rows(['05', '06', '07', '', '', '', '']),
  'ED-ST03': rows(['19', '22', '', '', '', '', '']),
};
const entries = Object.entries(initialData).flatMap(([road, blocks]) => blocks.flatMap(({trainId}, bi) => trainId ? [{key: `${road}-${bi}`, trainKey: trainId, road}] : []));
const initialPst = Object.fromEntries(entries.filter(entry => !['22', '47'].includes(entry.trainKey)).map(entry => [entry.key, { trainKey: entry.trainKey, done: entry.trainKey !== '40', confirming: entry.trainKey === '40', startTime: '05:57', endTime: '06:03' }]));
const initialPrep = Object.fromEntries(entries.filter(entry => !['22', '47', '40'].includes(entry.trainKey)).map(entry => [entry.key, { trainKey: entry.trainKey, done: true, endTime: '01:37' }]));
await savePstFldcVerification(base44.entities.PSTTrainPrep, { depot: 'west', date: getPstFldcDate(), by: 'WEST DEMO DC', trainIds: ['04', '26', '08', '45', '31'], status: 'Yes' });
await savePstFldcVerification(base44.entities.PSTTrainPrep, { depot: 'east', date: getPstFldcDate(), by: 'EAST DEMO DC', trainIds: ['05'], status: 'Yes' });
const noop = () => {};

function Preview() {
  const [theme, setTheme] = useState('dark');
  const [data, setData] = useState(initialData);
  const [pstState, setPst] = useState(initialPst);
  const [prepState, setPrep] = useState(initialPrep);
  const [taNameState, setTa] = useState({});
  const [completedByNames, setNames] = useState({ west: 'WEST DEMO DC', east: 'EAST DEMO DC' });
  const [apuMismatchTrainIds, setApu] = useState({west: ['04'], east: []});
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  const clearDepot = (setter, depot) => setter(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(depot === 'west' ? 'WD' : 'ED'))));
  return <div className="app-shell" data-active-page="pst" data-mobile-workspace-view="trains" data-mobile-req-depot="west">
    <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', color: theme === 'dark' ? '#e1ecf5' : '#0b2443', fontSize: 12}}>
      <strong>Local PST preview · sample data only</strong>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{padding: '7px 12px', border: '1px solid #4e7198', borderRadius: 8}}>Switch to {theme === 'dark' ? 'light' : 'dark'} mode</button>
      <button onClick={() => document.querySelector('[data-mobile-depot="east"]').scrollIntoView({block: 'start'})}>East Depot ↓</button>
    </div>
    <div className="flex"><main style={{padding: 20, width: '100%', minWidth: 0}}><div>
      <PSTTabContent westData={data} eastData={data} maintenanceMap={{}} pstRequests={[]} pstState={pstState} prepState={prepState} logLines={[]}
        taNameState={taNameState} completedByNames={completedByNames} apuMismatchTrainIds={apuMismatchTrainIds}
        pstLiveStatusText="Local samples" pstLiveStatusClass="is-synced" westPSTStablingDirty
        onCompletedByChange={(depot, value) => setNames(current => ({...current, [depot]: value}))}
        onAPUMismatchTrainIdsChange={(depot, ids) => setApu(current => ({...current, [depot]: ids}))}
        onPSTTick={(road, bi, trainKey) => setPst(current => ({...current, [`${road}-${bi}`]: current[`${road}-${bi}`]?.done ? {} : {trainKey, done: Boolean(current[`${road}-${bi}`]?.confirming), confirming: !current[`${road}-${bi}`]?.confirming, startTime: '05:57', endTime: '06:03'}}))}
        onPSTStartTimeChange={(road, bi, trainKey, startTime) => setPst(current => ({...current, [`${road}-${bi}`]: {...current[`${road}-${bi}`], trainKey, startTime}}))}
        onPrepTick={(road, bi, trainKey) => setPrep(current => ({...current, [`${road}-${bi}`]: {trainKey, done: !current[`${road}-${bi}`]?.done, endTime: '01:37'}}))}
        onPrepCompletionTimeChange={(road, bi, trainKey, endTime) => setPrep(current => ({...current, [`${road}-${bi}`]: {...current[`${road}-${bi}`], trainKey, endTime}}))}
        onTaNameChange={(road, bi, value) => setTa(current => ({...current, [`${road}-${bi}`]: value}))}
        onEditablePSTTrainIdChange={(_depot, road, bi, trainId) => setData(current => ({...current, [road]: current[road].map((block, index) => index === bi ? {trainId} : block)}))}
        onClearDepotPSTOnly={depot => clearDepot(setPst, depot)} onClearDepotPrepOnly={depot => clearDepot(setPrep, depot)}
        onClearPSTStablingTrains={noop} onRefreshPSTStabling={noop} onUndoPSTStabling={noop} onRedoPSTStabling={noop}
        onAddPSTRequest={noop} onRemovePSTRequest={noop} onClearPSTRequests={noop} onRenamePSTRequestGroup={noop} onDeletePSTRequestGroup={noop} onTogglePSTRequestGroupHidden={noop}
        onRemoveLog={noop} onAddManualLog={noop} onRemoveManualLog={noop} onClearDepotLog={noop}
      />
    </div></main></div>
  </div>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Preview />);
