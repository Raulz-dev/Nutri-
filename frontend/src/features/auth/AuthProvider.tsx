import { registerActor } from "../demo/store";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getCurrentUser } from "../users/api";
import type { User } from "../users/types";
import { loginRequest, logoutRequest } from "./api";
import type { AuthSession, LoginCredentials } from "./types";

const SESSION_KEY = "mais-saude-session";

type AuthContextValue = {
  session: AuthSession | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
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
  const [session, setSession] = useState<AuthSession | null>(readSession);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(session));

  useEffect(() => {
    if (!session) {
      setCurrentUser(null);
      setIsLoading(false);
      return;
    }
    if (currentUser) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    getCurrentUser(session.accessToken)
      .then((user) => {
        if (active) {
          setCurrentUser(user);
          try {
            registerActor(user);
          } catch {
          }
        }
      })
      .catch(() => {
        if (!active) return;
        sessionStorage.removeItem(SESSION_KEY);
        setSession(null);
        setCurrentUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokens = await loginRequest(credentials);
    const newSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    try {
      const user = await getCurrentUser(newSession.accessToken);
      setCurrentUser(user);
      setSession(newSession);
      try {
        registerActor(user);
      } catch {
      }
      return user;
    } catch (error) {
      sessionStorage.removeItem(SESSION_KEY);
      setSession(null);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    const currentSession = readSession();
    try {
      if (currentSession) await logoutRequest(currentSession.refreshToken);
    } finally {
      sessionStorage.removeItem(SESSION_KEY);
      setSession(null);
      setCurrentUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      currentUser,
      isAuthenticated: Boolean(session && currentUser),
      isLoading,
      login,
      logout,
    }),
    [session, currentUser, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
