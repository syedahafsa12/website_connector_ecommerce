import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/server/auth/session";
import { getProfile } from "@/server/profile/repository";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const profile = await getProfile(user.id);
  return NextResponse.json({ user, profile: profile ?? null });
}
