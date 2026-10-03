import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";

/**
 * Sessions here are stateless Supabase JWTs: the client discarding the token
 * is what actually "logs out". This endpoint just confirms the token was
 * valid at the time of the call (and gives the frontend one place to call).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser(req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
