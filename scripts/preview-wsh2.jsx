import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, Sun, TrainFront } from 'lucide-react';
import Wsh2Workspace from '../src/components/Wsh2Workspace';
import '../src/index.css';

function Preview() {
  const [light, setLight] = useState(false);
  function toggle() {
    document.documentElement.dataset.appTheme = light ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', light);
    setLight(!light);
  }
  return <div style={{ minHeight: '100vh', background: light ? '#f1f5f9' : '#061523', color: light ? '#17334a' : '#e2edf5' }}>
    <header style={{ padding: '16px 24px', borderBottom: `1px solid ${light ? '#cbdbe6' : '#294a61'}`, display: 'flex', alignItems: 'center', gap: 10 }}><TrainFront size={24} color={light ? '#087e92' : '#64d8e3'} /><strong>L3 Depot</strong><span style={{ fontSize: 12, opacity: .65 }}>AWP · Local preview</span><button type="button" aria-label={`Switch to ${light ? 'dark' : 'light'} mode`} onClick={toggle} style={{ marginLeft: 'auto', padding: 8, cursor: 'pointer' }}>{light ? <Moon size={19} /> : <Sun size={19} />}</button></header>
    <main style={{ padding: '24px clamp(12px, 3vw, 48px)' }}><Wsh2Workspace localPreview /></main>
  </div>;
}
createRoot(document.getElementById('root')).render(<Preview />);
