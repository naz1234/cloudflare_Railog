import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const PRESENCE_POLL_INTERVAL_MS = 30_000;
const PRESENCE_REQUEST_TIMEOUT_MS = 8_000;

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

function normalizedPresenceUsers(users, currentUser) {
  const source = Array.isArray(users) ? users : [];
  const candidates = [
    ...(currentUser?.name ? [{ name: currentUser.name, lastSeenAt: null }] : []),
    ...source,
  ];
  const seen = new Set();

  return candidates.flatMap((entry) => {
    const name = String(entry?.name || '').trim().slice(0, 80);
    const identityKey = name.toLocaleLowerCase('en');
    if (!name || seen.has(identityKey)) return [];
    seen.add(identityKey);
    return [{
      name,
      lastSeenAt: typeof entry?.lastSeenAt === 'string' ? entry.lastSeenAt : null,
    }];
  });
}

export const SessionPresenceControl = () => {
  const { logout, user } = useAuth();
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [presenceSupported, setPresenceSupported] = useState(true);
  const [presenceUnavailable, setPresenceUnavailable] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(() => normalizedPresenceUsers([], user));

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;

    const pollPresence = async () => {
      if (cancelled || requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        PRESENCE_REQUEST_TIMEOUT_MS,
      );
      try {
        const response = await fetch('/api/auth/presence', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          method: 'GET',
          signal: controller.signal,
        });
        if (response.status === 404) {
          if (!cancelled) {
            setOnlineUsers(normalizedPresenceUsers([], user));
            setPresenceSupported(false);
            setPresenceUnavailable(false);
          }
          return;
        }
        if (!response.ok) throw new Error('presence_unavailable');
        const data = await response.json();
        if (data.ok !== true || !Array.isArray(data.users)) {
          throw new Error('invalid_presence_response');
        }
        if (!cancelled) {
          setOnlineUsers(normalizedPresenceUsers(data.users, user));
          setPresenceSupported(true);
          setPresenceUnavailable(false);
        }
      } catch {
        if (!cancelled) {
          setOnlineUsers(normalizedPresenceUsers([], user));
          setPresenceUnavailable(true);
        }
      } finally {
        window.clearTimeout(timeoutId);
        requestInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') pollPresence();
    };
    const intervalId = window.setInterval(pollPresence, PRESENCE_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', pollPresence);
    pollPresence();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', pollPresence);
    };
  }, [user]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-controls="session-presence-menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-[#2b4f6b] bg-[#071828] px-2.5 text-[10px] font-semibold text-[#b9e7d4] transition hover:border-emerald-400/70 hover:bg-[#0f2d4a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-95"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" aria-hidden="true" />
        <span>You're online</span>
        {presenceSupported && (
          <span className="text-emerald-300" aria-label={`${onlineUsers.length} staff online`}>
            · {onlineUsers.length} online
          </span>
        )}
        <ChevronDown className={`h-3 w-3 text-[#75a8c5] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <aside
          id="session-presence-menu"
          aria-label="Signed-in user and online staff"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[260] w-[min(270px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#2a5d79] bg-[#061b2c]/95 text-[#dff5ff] shadow-[0_16px_46px_rgba(0,0,0,0.42)] backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#244a62] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]" aria-hidden="true" />
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">
                {presenceSupported ? 'Online now' : 'Signed in'}
              </span>
            </div>
            {presenceSupported && (
              <span className="rounded-full border border-emerald-400/35 bg-emerald-950/60 px-2 py-0.5 text-[9px] font-bold text-emerald-200">
                {onlineUsers.length}
              </span>
            )}
          </div>

          {presenceSupported ? (
            <ul className="max-h-36 space-y-1 overflow-y-auto px-3 py-2" aria-label="Staff currently online" aria-live="polite">
              {onlineUsers.map((onlineUser) => {
                const isCurrentUser = onlineUser.name === user?.name;
                return (
                  <li key={onlineUser.name} className="flex min-w-0 items-center gap-2 text-[10px] text-[#c8e3f1]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate" title={onlineUser.name}>{onlineUser.name}</span>
                    {isCurrentUser && <span className="text-[7px] font-black uppercase tracking-[0.1em] text-cyan-300">You</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-2">
              <p className="truncate text-[10px] font-bold text-white" title={user?.name || ''}>{user?.name || 'West Depot Staff'}</p>
              {user?.email && <p className="mt-0.5 truncate font-mono text-[8px] text-[#78a2ba]" title={user.email}>{user.email}</p>}
            </div>
          )}

          {presenceSupported && presenceUnavailable && (
            <p className="border-t border-amber-400/20 bg-amber-950/20 px-3 py-1.5 text-[8px] text-amber-100">
              Online list will refresh automatically.
            </p>
          )}
          {logoutError && (
            <p role="alert" className="border-t border-rose-400/50 bg-[#27101a] px-3 py-2 text-[9px] font-semibold text-rose-100">
              {logoutError}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sign out of L3 DC Template"
            className="flex h-9 w-full items-center justify-center gap-2 border-t border-rose-400/30 bg-[#25111a]/70 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-rose-100 transition hover:bg-[#3a1522] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-rose-300 disabled:cursor-wait disabled:opacity-70"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </aside>
      )}
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

  return <Outlet />;
}
