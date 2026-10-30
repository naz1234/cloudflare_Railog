import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InsertionStablingSection } from '../src/pages/DepotStabling';
import '../src/index.css';

const noop = () => {};
const westData = { 'WD-ST15': ['', '', '', '', '26', '40', '04'].map(trainId => ({trainId})) };
const eastData = { 'ED-ST02': ['05', '06', '07', '', '', '', ''].map(trainId => ({trainId})) };
function Preview() {
  const [theme, setTheme] = useState('dark');
  const [dirty, setDirty] = useState({west: true, east: true});
  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  return <div className="app-shell" data-active-page="insertion">
    <nav style={{display: 'flex', gap: 16, alignItems: 'center', padding: 20, color: theme === 'dark' ? '#e1ecf5' : '#0b2443'}}>
      <span>Local INS preview · sample data only</span>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Switch to {theme === 'dark' ? 'light' : 'dark'} mode</button>
      <button onClick={() => setDirty({west: true, east: true})}>Reset sample sync state</button>
    </nav>
    <main className="theme-insertion-page" style={{display: 'grid', gap: 24, padding: 20}}>
      {['west','east'].map(depot => {
        const isWest = depot === 'west';
        const indices = isWest ? [6,5,4,3,2,1,0] : [0,1,2,3,4,5,6];
        return <InsertionStablingSection key={depot} title={isWest ? 'West Depot stabling' : 'East Depot stabling'}
          roads={[isWest ? 'WD-ST15' : 'ED-ST02']} data={isWest ? westData : eastData}
          blockIndices={indices} blockLabels={indices.map(index => `BLOCK ${index+1}`)} labelSide={isWest ? 'left' : 'right'}
          maintenanceMap={{}} insertionLog={[]} tidInputs={{}} onTidChange={noop}
          onInsertionTick={noop} onInsertionTimeUpdate={noop} onInsertionRemarkUpdate={noop} onSweepUpdate={noop}
          getTidScheduledTime={() => ''} isStablingDirty={dirty[depot]} stablingEditable
          onEditableTrainIdChange={noop} onRefreshStabling={() => setDirty(current => ({...current, [depot]: false}))}
          onUndoStabling={noop} onRedoStabling={noop} />;
      })}
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<Preview />);
