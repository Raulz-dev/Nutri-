import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { loginRequest, logoutRequest } from "./api";
import type { AuthSession, LoginCredentials } from "./types";

const SESSION_KEY = "mais-saude-session";

type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): AuthSession | null {
  const value = sessionStorage.getItem(SESSION_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as AuthSession;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokens = await loginRequest(credentials);
    const newSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    setSession(newSession);
  }, []);

  const logout = useCallback(async () => {
    const currentSession = readSession();
    try {
      if (currentSession) await logoutRequest(currentSession.refreshToken);
    } finally {
      sessionStorage.removeItem(SESSION_KEY);
      setSession(null);
    }
  }, []);

  const value = useMemo(
    () => ({ session, isAuthenticated: Boolean(session), login, logout }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
