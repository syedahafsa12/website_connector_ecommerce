import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { getMerchantById } from "@/server/merchants/repository";
import { getMerchantAnalytics } from "@/server/merchants/analytics";

/**
 * Merchant-owner only. Read-only, merchant-scoped shopping/auction
 * intelligence — see src/server/merchants/analytics.ts for exactly what
 * goes into it (and why no competitor identity ever can).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const merchant = await getMerchantById(params.id);
    if (!merchant || merchant.owner_id !== user.id) return NextResponse.json({ error: "You do not own this merchant." }, { status: 403 });

    const analytics = await getMerchantAnalytics(params.id);
    return NextResponse.json(analytics);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
