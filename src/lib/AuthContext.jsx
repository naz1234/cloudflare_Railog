import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext(null);

const AUTH_API = Object.freeze({
  session: '/api/auth/session',
  logout: '/api/auth/logout',
});

const AUTH_BROADCAST_CHANNEL = 'l3-dc-auth';

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return {};

  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  return { response, data: await parseResponse(response) };
}

function sessionUser(data = {}) {
  const name = String(data.user?.name || '').trim();
  const email = String(data.user?.email || '').trim();

  return {
    id: String(data.user?.id || email || name || 'l3-dc-session'),
    role: 'depot-controller',
    name: name || 'West Depot Staff',
    email,
    expiresAt: data.expiresAt || null,
  };
}

function buildLoginUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnTo = currentPath.startsWith('/login') ? '/' : currentPath;
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function redirectToLogin() {
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace(buildLoginUrl());
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  const authChannelRef = useRef(null);
  const checkInFlightRef = useRef(false);

  const clearClientState = useCallback(() => {
    setUser(null);
    setAuthError(null);
    setAuthChecked(true);
    queryClientInstance.clear();
  }, []);

  const broadcastLogout = useCallback(() => {
    authChannelRef.current?.postMessage({ type: 'logout' });
  }, []);

  const checkUserAuth = useCallback(async ({ silent = false } = {}) => {
    if (checkInFlightRef.current) return null;
    checkInFlightRef.current = true;
    if (!silent) setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const { response, data } = await authRequest(AUTH_API.session);
      if (response.ok && data.authenticated === true) {
        const nextUser = sessionUser(data);
        setUser(nextUser);
        return nextUser;
      }

      if (response.status === 401) {
        clearClientState();
        broadcastLogout();
        redirectToLogin();
      } else {
        setAuthError({ type: 'auth_unavailable', message: 'Secure login is temporarily unavailable. Please try again.' });
      }
      return null;
    } catch {
      setAuthError({
        type: 'auth_unavailable',
        message: 'Unable to reach secure login. Check your connection and try again.',
      });
      return null;
    } finally {
      setAuthChecked(true);
      if (!silent) setIsLoadingAuth(false);
      checkInFlightRef.current = false;
    }
  }, [broadcastLogout, clearClientState]);

  useEffect(() => {
    checkUserAuth();
    const handleFocus = () => checkUserAuth({ silent: true });
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkUserAuth]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    authChannelRef.current = channel;
    channel.addEventListener('message', (event) => {
      if (event.data?.type !== 'logout') return;
      clearClientState();
      redirectToLogin();
    });
    return () => {
      authChannelRef.current = null;
      channel.close();
    };
  }, [clearClientState]);

  useEffect(() => {
    const expiresAtMs = Date.parse(user?.expiresAt || '');
    if (!Number.isFinite(expiresAtMs)) return undefined;
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      clearClientState();
      broadcastLogout();
      redirectToLogin();
      return undefined;
    }
    const expiryTimer = window.setTimeout(() => {
      clearClientState();
      broadcastLogout();
      redirectToLogin();
    }, remainingMs);
    return () => window.clearTimeout(expiryTimer);
  }, [broadcastLogout, clearClientState, user?.expiresAt]);

  const logout = useCallback(async () => {
    const { response, data } = await authRequest(AUTH_API.logout, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(data.error?.message || 'Unable to end the secure session.');
    }
    clearClientState();
    broadcastLogout();
    if (data.logoutUrl === '/cdn-cgi/access/logout') {
      window.location.replace('/cdn-cgi/access/logout');
      return;
    }
    redirectToLogin();
  }, [broadcastLogout, clearClientState]);

  const navigateToLogin = useCallback(() => {
    clearClientState();
    redirectToLogin();
  }, [clearClientState]);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    appPublicSettings: { public_settings: {} },
    authChecked,
    logout,
    navigateToLogin,
    checkUserAuth,
    checkAppState: checkUserAuth,
  }), [
    authChecked,
    authError,
    checkUserAuth,
    isLoadingAuth,
    logout,
    navigateToLogin,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
