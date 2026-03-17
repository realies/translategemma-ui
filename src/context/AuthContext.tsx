import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  beginOidcLogin,
  beginOidcLogout,
  clearOidcSession,
  completeOidcCallback,
  getStoredOidcSession,
  type OidcSession,
} from "~/lib/oidcClient";
import { getOidcConfig, type OidcPublicConfig } from "~/serverFunctions/oidcConfig";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  authEnabled: boolean;
  status: AuthStatus;
  userEmail: string | null;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUserEmail(session: OidcSession | null): string | null {
  if (!session) return null;
  return session.email;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<OidcPublicConfig | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const resolvedConfig = await getOidcConfig();

        setConfig(resolvedConfig);
        if (!resolvedConfig.enabled) {
          setAuthEnabled(false);
          setStatus("authenticated");
          setUserEmail(null);
          return;
        }

        setAuthEnabled(true);
        setStatus("loading");

        const callbackSession = await completeOidcCallback(resolvedConfig);

        const activeSession = callbackSession ?? getStoredOidcSession();
        setUserEmail(toUserEmail(activeSession));
        setStatus(activeSession ? "authenticated" : "unauthenticated");
      } catch (caughtError) {
        clearOidcSession();
        setStatus("unauthenticated");
        setUserEmail(null);
        setAuthEnabled(true);
        setError(caughtError instanceof Error ? caughtError.message : "Authentication error");
      }
    })();
  }, []);

  const login = useCallback(async () => {
    if (!config?.enabled) return;
    setError(null);
    await beginOidcLogin(config);
  }, [config]);

  const logout = useCallback(async () => {
    if (!config?.enabled) return;

    const currentSession = getStoredOidcSession();
    clearOidcSession();
    setStatus("unauthenticated");
    setUserEmail(null);
    setError(null);

    try {
      await beginOidcLogout(config, currentSession);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Logout failed");
    }
  }, [config]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authEnabled,
      status,
      userEmail,
      error,
      login,
      logout,
    }),
    [authEnabled, status, userEmail, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
