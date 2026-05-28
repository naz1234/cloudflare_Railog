import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { initCloudflareSchema } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
// Add page imports here
import DepotStabling from "./pages/DepotStabling";

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<DepotStabling />} />
      <Route path="/depot-stabling" element={<DepotStabling />} />
      <Route path="/train-movement" element={<DepotStabling />} />
      <Route path="/pst-train-prep" element={<DepotStabling />} />
      <Route path="/insertion" element={<DepotStabling />} />
      <Route path="/train-washing" element={<DepotStabling />} />
      <Route path="/odo-reading" element={<DepotStabling />} />
      <Route path="/possession" element={<DepotStabling />} />
      {/* Add your page Route elements here */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  useEffect(() => {
    // Creates the D1 table automatically when the app is opened after deployment.
    initCloudflareSchema();
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App