import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAuthClient } from "@/server/auth/client";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { email, password, fullName } = parsed.data;

  const { data, error } = await getSupabaseAuthClient().auth.signUp({
    email,
    password,
    options: fullName ? { data: { full_name: fullName } } : undefined,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(
    {
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      session: data.session
        ? { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at }
        : null, // null if email confirmation is required before a session is issued
    },
    { status: 201 },
  );
}
