import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-[#041523]" role="status" aria-label="Checking secure session">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1b435d] border-t-cyan-300"></div>
  </div>
);

const LoginRedirect = () => {
  useEffect(() => {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const returnTo = currentPath.startsWith('/login') ? '/' : currentPath;
    window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  return <DefaultFallback />;
};

const AuthUnavailable = ({ message, onRetry }) => (
  <main className="fixed inset-0 grid place-items-center bg-[#041523] px-5 text-[#eaf6ff]">
    <section className="w-full max-w-sm rounded-2xl border border-[#28546f] bg-[#071f33] p-6 text-center shadow-2xl">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300">West Depot Secure Access</p>
      <h1 className="mt-3 text-lg font-extrabold text-white">Login service unavailable</h1>
      <p className="mt-2 text-xs leading-6 text-[#9db7c9]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 h-10 rounded-lg border border-cyan-400 bg-cyan-700 px-5 text-[11px] font-bold text-white transition hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        Retry secure login
      </button>
    </section>
  </main>
);

const LogoutControl = () => {
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
    } catch {
      setLogoutError('Sign out failed. Please try again.');
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[190] flex flex-col items-end gap-2">
      {logoutError && (
        <p role="alert" className="max-w-[230px] rounded-lg border border-rose-400/70 bg-[#27101a] px-3 py-2 text-[10px] font-semibold text-rose-100 shadow-xl">
          {logoutError}
        </p>
      )}
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        aria-label="Sign out of L3 DC Template"
        className="flex h-9 items-center gap-2 rounded-lg border border-rose-400/70 bg-[#071828]/95 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-rose-100 shadow-[0_8px_28px_rgba(0,0,0,0.36)] backdrop-blur transition hover:border-rose-300 hover:bg-[#3a1522] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:cursor-wait disabled:opacity-70"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        {isLoggingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
};

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) return <AuthUnavailable message={authError.message} onRetry={checkUserAuth} />;

  if (!isAuthenticated) return unauthenticatedElement || <LoginRedirect />;

  return (
    <>
      <Outlet />
      <LogoutControl />
    </>
  );
}
