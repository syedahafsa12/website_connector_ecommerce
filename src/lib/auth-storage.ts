// Client-side only. Supabase sessions here are stateless bearer JWTs — there
// is no server-side session store, so "logging out" is just discarding what
// we hold. See src/server/auth/session.ts for how the backend verifies these.
const STORAGE_KEY = "agent-mall.session";

export interface StoredUser {
  id: string;
  email: string | null;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: StoredUser;
}

export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private browsing, quota) — session just won't persist across reloads.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
