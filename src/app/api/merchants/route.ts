import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { createMerchant, listMerchants } from "@/server/merchants/repository";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(1),
  category: z.string().min(1),
  connectorType: z.enum(["rest", "mcp", "web"]),
  connectorConfig: z.record(z.unknown()),
  isAdversarialDemo: z.boolean().optional(),
});

export async function GET() {
  const merchants = await listMerchants();
  return NextResponse.json({ merchants });
}

/** Connecting a website: the caller becomes that merchant's owner (never a client-supplied owner id). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    const merchant = await createMerchant({ ...parsed.data, ownerId: user.id });
    return NextResponse.json({ merchant }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
