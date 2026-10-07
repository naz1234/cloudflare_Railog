import { createRoot } from 'react-dom/client';
import { RemovalScanPage } from './components/depot/RemovalScan';

// A separate entry point deliberately has no AuthProvider, application router,
// operational API client, staff-presence polling or dashboard dependencies.
try {
  document.documentElement.dataset.appTheme = localStorage.getItem('l3DcTheme_v1') === 'light' ? 'light' : 'dark';
} catch { /* The standalone scanner also works when storage is unavailable. */ }
document.documentElement.style.colorScheme = document.documentElement.dataset.appTheme;
createRoot(document.getElementById('root')).render(<RemovalScanPage />);
