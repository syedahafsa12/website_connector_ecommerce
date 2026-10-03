import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { resolveAuctionIfDue, AuctionAuthorizationError, AuctionNotFoundError } from "@/server/auctions/service";

/**
 * Deterministic, backend-owned resolution: resolves against persisted bids
 * and the server-computed `ends_at`, never a client timer. Idempotent —
 * calling this on an already-ended/settled auction just returns its
 * current state, and never creates a second settlement (auction_orders has
 * a unique constraint on auction_id; see migrations/003).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const result = await resolveAuctionIfDue(user.id, params.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AuctionAuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
