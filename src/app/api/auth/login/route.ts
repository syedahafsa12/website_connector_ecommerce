import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAuthClient } from "@/server/auth/client";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword(parsed.data);
  if (error || !data.session) return NextResponse.json({ error: error?.message ?? "Invalid credentials." }, { status: 401 });

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at },
  });
}
