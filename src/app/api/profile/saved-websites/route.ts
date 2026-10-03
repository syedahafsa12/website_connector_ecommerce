import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { listSavedWebsites, saveWebsite } from "@/server/profile/repository";

const createSchema = z.object({ merchantId: z.string().uuid() });

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    return NextResponse.json({ savedWebsites: await listSavedWebsites(user.id) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    const saved = await saveWebsite(user.id, parsed.data.merchantId);
    return NextResponse.json({ saved }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
