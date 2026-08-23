import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { initCloudflareSchema } from '@/api/base44Client';
import ProtectedRoute from '@/components/ProtectedRoute';
// Add page imports here
import DepotStabling from "./pages/DepotStabling";

const AuthenticatedApp = () => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) initCloudflareSchema();
  }, [isAuthenticated]);

  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DepotStabling />} />
        <Route path="/depot-stabling" element={<DepotStabling />} />
        <Route path="/train-movement" element={<DepotStabling />} />
        <Route path="/pst-train-prep" element={<DepotStabling />} />
        <Route path="/insertion" element={<DepotStabling />} />
        <Route path="/train-washing" element={<DepotStabling />} />
        <Route path="/odo-reading" element={<DepotStabling />} />
        <Route path="/possession" element={<DepotStabling />} />
        <Route path="/alarm" element={<DepotStabling />} />
        <Route path="/overtime" element={<DepotStabling />} />
        <Route path="/ovt" element={<DepotStabling />} />
        <Route path="/ot" element={<DepotStabling />} />
        <Route path="/roster" element={<DepotStabling />} />
        <Route path="/ros" element={<DepotStabling />} />
        <Route path="/checklist" element={<DepotStabling />} />
        <Route path="/chk" element={<DepotStabling />} />
        <Route path="/sleep" element={<DepotStabling />} />
        <Route path="/slp" element={<DepotStabling />} />
        <Route path="/admin" element={<DepotStabling />} />
        <Route path="/adm" element={<DepotStabling />} />
        {/* Add your page Route elements here */}
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};


function App() {
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
