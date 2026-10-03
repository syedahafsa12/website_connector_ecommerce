import type { NextRequest } from "next/server";
import { getSupabaseAuthClient } from "./client";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

/**
 * Verifies the bearer token against Supabase Auth and returns the caller's
 * platform user id. Every endpoint that touches user-owned data (profile,
 * payment methods, approvals, saved items, merchant ownership) must call this
 * — the platform never trusts a user id supplied by the request body.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const header = req.headers.get("authorization");
  const token = header?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
  }
}
