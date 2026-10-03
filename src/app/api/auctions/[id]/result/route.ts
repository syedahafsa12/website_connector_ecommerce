import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { getAuctionById, getSettlementByAuction, AuctionNotFoundError } from "@/server/auctions/service";

/** Winner/status is public (same as the auction row); the money breakdown in `settlement` is only included for the actual buyer. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const auction = await getAuctionById(params.id);
    if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });

    const settlement = await getSettlementByAuction(params.id);
    return NextResponse.json({
      status: auction.status,
      winnerUserId: auction.winner_user_id,
      settlement: settlement && settlement.user_id === user.id ? settlement : null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
