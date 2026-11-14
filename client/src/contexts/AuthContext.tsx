import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, ApiError, restoreSession, setAccessToken } from '../lib/api';
import type { User } from '../types';

type Credentials = { identifier: string; password: string };
type Registration = { username: string; email: string; password: string };
type AuthValue = {
  user: User | null;
  ready: boolean;
  restoreError: string | null;
  retryRestore: () => Promise<void>;
  login: (values: Credentials) => Promise<void>;
  register: (values: Registration) => Promise<void>;
  verifyRegistration: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const retryRestore = useCallback(async () => {
    setReady(false);
    setRestoreError(null);
    try {
      const result = await restoreSession();
      setAccessToken(result.accessToken);
      setUser(result.user);
    } catch (error) {
      setAccessToken(null);
      setUser(null);
      if (!(error instanceof ApiError && error.status === 401)) {
        setRestoreError(error instanceof ApiError ? `The backend returned HTTP ${error.status}.` : 'The backend could not be reached. Your saved sign-in may still be active.');
      }
    } finally { setReady(true); }
  }, []);

  useEffect(() => {
    let active = true;
    restoreSession().then((result) => {
      if (!active) return;
      setAccessToken(result.accessToken);
      setUser(result.user);
      setRestoreError(null);
    }).catch((error: unknown) => {
      if (!active) return;
      setAccessToken(null);
      setUser(null);
      if (!(error instanceof ApiError && error.status === 401)) {
        setRestoreError(error instanceof ApiError ? `The backend returned HTTP ${error.status}.` : 'The backend could not be reached. Your saved sign-in may still be active.');
      }
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const login = useCallback(async (values: Credentials) => {
    const result = await apiRequest<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(values) });
    setAccessToken(result.accessToken);
    setUser(result.user);
    setRestoreError(null);
  }, []);

  const register = useCallback(async (values: Registration) => {
    await apiRequest<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(values) });
  }, []);

  const verifyRegistration = useCallback(async (email: string, code: string) => {
    const result = await apiRequest<{ accessToken: string; user: User }>('/auth/register/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
    setAccessToken(result.accessToken);
    setUser(result.user);
    setRestoreError(null);
  }, []);

  const logout = useCallback(async () => {
    try { await apiRequest<void>('/auth/logout', { method: 'POST' }); }
    finally { setAccessToken(null); setUser(null); setRestoreError(null); }
  }, []);

  const value = useMemo(() => ({ user, ready, restoreError, retryRestore, login, register, verifyRegistration, logout, updateUser: setUser }), [user, ready, restoreError, retryRestore, login, register, verifyRegistration, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be inside AuthProvider.');
  return value;
}
