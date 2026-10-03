import { clearSession, loadSession } from "./auth-storage";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Every authenticated call to our own backend goes through this. It attaches
 * the Supabase bearer token the same way the backend expects
 * (see src/server/auth/session.ts) and normalizes error handling. A 401
 * means the token is gone/expired — there is no refresh endpoint on this
 * backend, so we just clear the stale session and let the caller redirect to
 * /login rather than silently failing.
 */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const session = loadSession();
  const headers = new Headers(opts.headers);
  headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.accessToken}`);

  const res = await fetch(path, { ...opts, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) clearSession();
    const message = (body && typeof body === "object" && "error" in body && typeof body.error === "string") ? body.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined });
}
