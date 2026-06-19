'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthOrganization {
  id: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  organization: AuthOrganization | null;
  orgRole: string | null;
}

interface AuthContextValue extends AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser, organization: AuthOrganization | null, orgRole?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'ls_token';
const USER_KEY = 'ls_user';
const ORG_KEY = 'ls_org';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    organization: null,
    orgRole: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const user = localStorage.getItem(USER_KEY);
      const org = localStorage.getItem(ORG_KEY);
      if (token && user) {
        setState({
          token,
          user: JSON.parse(user),
          organization: org ? JSON.parse(org) : null,
          orgRole: null,
        });
      }
    } catch {
      // corrupted storage — clear it
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ORG_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    (token: string, user: AuthUser, organization: AuthOrganization | null, orgRole?: string) => {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (organization) localStorage.setItem(ORG_KEY, JSON.stringify(organization));
      setState({ token, user, organization, orgRole: orgRole ?? null });
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORG_KEY);
    setState({ token: null, user: null, organization: null, orgRole: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, isLoading, isAuthenticated: !!state.token, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
