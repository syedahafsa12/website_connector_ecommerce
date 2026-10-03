import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { cancelAuctionAsMerchant, AuctionAuthorizationError, AuctionNotFoundError, AuctionValidationError } from "@/server/auctions/service";

/** Merchant-only, and only before the first bid — see service.canModifyBeforeFirstBid. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const auction = await cancelAuctionAsMerchant(user.id, params.id);
    return NextResponse.json({ auction });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AuctionAuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof AuctionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
