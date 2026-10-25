import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/resources';
import { apiErrorMessage } from '../services/api';
import { clearToken, getToken, storeToken } from '../services/session';

const AuthContext = createContext(null);

/**
 * Session lifecycle:
 *  - On load, if a token exists we ask the server who it belongs to. Until that
 *    answer arrives, `loading` is true and no protected data is rendered.
 *  - The user object lives in memory only. Nothing about the user is persisted.
 *  - Logout (and a 401 from the server) clears the token and the in-memory user.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await authApi.me();
        if (!cancelled) setUser(res.data.data);
      } catch {
        clearToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password, remember) => {
    try {
      const res = await authApi.login(email, password);
      const { token, user: signedIn } = res.data.data;
      storeToken(token, remember);
      setUser(signedIn);
      return { success: true, user: signedIn };
    } catch (err) {
      return { success: false, message: apiErrorMessage(err), status: err.response?.status };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getToken()) await authApi.logout();
    } catch {
      // Ignore: the local session is cleared regardless.
    }
    clearToken();
    setUser(null);
  }, []);

  /** Called after a password change issues a fresh token. */
  const replaceSession = useCallback((token, nextUser, remember = true) => {
    storeToken(token, remember);
    setUser(nextUser);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, replaceSession, setUser }), [user, loading, login, logout, replaceSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
