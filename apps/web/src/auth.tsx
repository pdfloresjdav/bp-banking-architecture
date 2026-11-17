import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

interface AuthState {
  authenticated: boolean;
  csrf: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.session();
      setAuthenticated(s.authenticated);
      setCsrf(s.csrf ?? null);
    } catch {
      setAuthenticated(false);
      setCsrf(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(() => {
    // Redirect to the BFF, which starts OIDC Authorization Code + PKCE against Keycloak.
    window.location.href = '/auth/login';
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAuthenticated(false);
    setCsrf(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ authenticated, csrf, loading, refresh, login, logout }),
    [authenticated, csrf, loading, refresh, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
