import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import ActionTooltip from '@/components/ActionTooltip';
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

function normalizedPresenceUsers(users) {
  const source = Array.isArray(users) ? users : [];
  const seen = new Set();

  return source.flatMap((entry) => {
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

function presenceInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/[._\s-]+/u)
    .filter(Boolean);

  if (parts.length > 1) {
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  return (parts[0] || 'WD').slice(0, 2).toUpperCase();
}

export const SessionPresenceControl = () => {
  const { logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [presenceSupported, setPresenceSupported] = useState(true);
  const [presenceUnavailable, setPresenceUnavailable] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

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
            setOnlineUsers([]);
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
          setOnlineUsers(normalizedPresenceUsers(data.users));
          setPresenceSupported(true);
          setPresenceUnavailable(false);
        }
      } catch {
        if (!cancelled) {
          setOnlineUsers([]);
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
    <aside aria-label="Signed-in user and online staff" className="theme-session-presence relative flex h-8 min-w-0 max-w-[min(28rem,42vw)] items-center rounded-lg border border-[#2b4f6b] bg-[#071828] text-[#dff5ff] shadow-[0_0_14px_rgba(52,211,153,0.08)]">
      <div
        className="flex h-full shrink-0 items-center gap-1.5 border-r border-[#244a62] px-2.5"
        title={presenceUnavailable ? 'Online list will refresh automatically.' : undefined}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${presenceUnavailable ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.65)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]'}`}
          aria-hidden="true"
        />
        <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.1em] text-emerald-200">
          {presenceSupported ? 'Online now' : 'Signed in'}
        </span>
        {presenceSupported && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-950/60 px-1.5 text-[9px] font-bold text-emerald-200" aria-label={`${onlineUsers.length} staff online`}>
            {onlineUsers.length}
          </span>
        )}
      </div>

      <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Staff currently online" aria-live="polite">
        {onlineUsers.map((onlineUser) => {
          const isCurrentUser = onlineUser.name === user?.name;
          return (
            <li key={onlineUser.name} className="shrink-0">
              <ActionTooltip
                message={onlineUser.name}
                placement="bottom"
                sideOffset={8}
                wrapperClassName="shrink-0 rounded-full"
                triggerProps={{
                  tabIndex: 0,
                  'aria-label': `${onlineUser.name}${isCurrentUser ? ', you' : ''}`,
                }}
              >
                <span
                  className={`theme-presence-avatar relative flex h-6 w-6 items-center justify-center rounded-full border bg-[#0a2a42] font-mono text-[8px] font-black tracking-wide text-cyan-100 transition-colors hover:border-cyan-300 hover:bg-[#103b5c] ${isCurrentUser ? 'border-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'border-[#2f6f91]'}`}
                >
                  {presenceInitials(onlineUser.name)}
                  <span className="theme-presence-avatar-dot absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#071828] bg-emerald-400" aria-hidden="true" />
                </span>
              </ActionTooltip>
            </li>
          );
        })}
      </ul>

      <div className="group relative h-full shrink-0 border-l border-rose-400/20">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label="Sign out of L3 DC Template"
          className="flex h-full w-8 items-center justify-center rounded-r-lg text-rose-300 transition hover:bg-[#3a1522] hover:text-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-rose-300 disabled:cursor-wait disabled:opacity-70"
        >
          <LogOut className={`h-3.5 w-3.5 ${isLoggingOut ? 'animate-pulse' : ''}`} aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="pointer-events-none invisible absolute right-0 top-[calc(100%+0.45rem)] z-[280] whitespace-nowrap rounded-md border border-rose-400/30 bg-[#25111a] px-2 py-1 text-[9px] font-semibold text-rose-100 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          {isLoggingOut ? 'Signing out…' : 'Sign out'}
        </span>
      </div>

      {presenceSupported && presenceUnavailable && (
        <span className="sr-only" role="status">Online list will refresh automatically.</span>
      )}
      {logoutError && (
        <p role="alert" className="absolute left-0 top-[calc(100%+0.45rem)] z-[280] rounded-md border border-rose-400/50 bg-[#27101a] px-3 py-2 text-[9px] font-semibold text-rose-100 shadow-lg">
          {logoutError}
        </p>
      )}
    </aside>
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
