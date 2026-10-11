import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCurrentUser } from "../users/api";
import type { User } from "../users/types";
import { loginRequest, logoutRequest } from "./api";
import {
  clearAccessToken,
  refreshAccess,
  setAccessToken,
} from "../../lib/http-client";
import type { AuthSession, LoginCredentials } from "./types";

type AuthContextValue = {
  session: AuthSession | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
};
export const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const epoch = useRef(0);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const forget = useCallback(() => {
    epoch.current += 1;
    clearAccessToken();
    setSession(null);
    setCurrentUser(null);
  }, []);
  useEffect(() => {
    sessionStorage.removeItem("mais-saude-session");
    let active = true;
    const started = epoch.current;
    refreshAccess()
      .then(async (token) => {
        const user = await getCurrentUser(token);
        if (active && started === epoch.current) {
          setSession({ accessToken: token });
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (active && started === epoch.current) forget();
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    window.addEventListener("nutri-session-ended", forget);
    return () => {
      active = false;
      window.removeEventListener("nutri-session-ended", forget);
    };
  }, [forget]);
  const login = useCallback(async (credentials: LoginCredentials) => {
    epoch.current += 1;
    clearAccessToken();
    const tokens = await loginRequest(credentials);
    setAccessToken(tokens.access_token);
    const user = await getCurrentUser(tokens.access_token);
    setCurrentUser(user);
    setSession({ accessToken: tokens.access_token });
    return user;
  }, []);
  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      forget();
    }
  }, [forget]);
  const reloadUser = useCallback(async () => {
    if (session) setCurrentUser(await getCurrentUser(session.accessToken));
  }, [session]);
  const value = useMemo(
    () => ({
      session,
      currentUser,
      isAuthenticated: Boolean(session && currentUser),
      isLoading,
      login,
      logout,
      reloadUser,
    }),
    [session, currentUser, isLoading, login, logout, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
