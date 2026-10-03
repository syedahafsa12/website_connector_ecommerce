"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "./api";
import { clearSession, loadSession, saveSession, type StoredUser } from "./auth-storage";

interface AuthResponseSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

interface SignupResult {
  requiresEmailConfirmation: boolean;
}

interface AuthContextValue {
  user: StoredUser | null;
  /** undefined while the initial session check is still running. */
  status: "loading" | "authenticated" | "anonymous";
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<SignupResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "anonymous">("loading");

  useEffect(() => {
    const existing = loadSession();
    if (!existing) {
      setStatus("anonymous");
      return;
    }
    // The token could have expired while this tab was closed — confirm it against the backend.
    apiFetch<{ user: StoredUser }>("/api/auth/me")
      .then((res) => {
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch(() => {
        clearSession();
        setUser(null);
        setStatus("anonymous");
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ user: StoredUser; session: AuthResponseSession }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveSession({ ...res.session, user: res.user });
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName?: string): Promise<SignupResult> => {
    const res = await apiFetch<{ user: StoredUser | null; session: AuthResponseSession | null }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
    if (res.session && res.user) {
      saveSession({ ...res.session, user: res.user });
      setUser(res.user);
      setStatus("authenticated");
      return { requiresEmailConfirmation: false };
    }
    // Supabase project has email confirmation required — no session issued yet.
    return { requiresEmailConfirmation: true };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort — the token is stateless, so discarding it locally is what actually matters.
    }
    clearSession();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ user, status, login, signup, logout }), [user, status, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
