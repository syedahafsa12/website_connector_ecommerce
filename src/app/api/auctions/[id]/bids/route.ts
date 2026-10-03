import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { getApproval } from "@/server/approvals/repository";
import { getAuctionById, placeBid, listBidsForAuctionAsUser, AuctionAuthorizationError, AuctionNotFoundError, AuctionValidationError } from "@/server/auctions/service";

const schema = z.object({ approvalId: z.string().uuid(), amount: z.number().positive(), currency: z.string().optional() });

/**
 * A bid executes only once an *approved* `auction_bid` approval exists for
 * this exact auction and this exact amount — the agent has no path to this
 * effect on its own, same gate as /api/merchants/:id/visit for navigation.
 * Even then, placeBid() re-derives the current price and auction state
 * server-side rather than trusting anything from the approval payload
 * except "the user agreed to bid this amount."
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const auction = await getAuctionById(params.id);
    if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });

    const approval = await getApproval(user.id, parsed.data.approvalId);
    const approvalPayload = approval?.payload as { auctionId?: string; amount?: number } | undefined;
    const approvalMatches =
      approval &&
      approval.action_type === "auction_bid" &&
      approval.status === "approved" &&
      approval.merchant_id === auction.merchant_id &&
      approvalPayload?.auctionId === params.id &&
      Number(approvalPayload?.amount) === parsed.data.amount;
    if (!approvalMatches) {
      return NextResponse.json({ error: "Placing a bid requires an approved auction_bid approval for this exact auction and amount." }, { status: 403 });
    }

    const result = await placeBid(user.id, params.id, parsed.data.amount, parsed.data.currency);
    return NextResponse.json({ bid: result.bid, auction: result.auction }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AuctionAuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof AuctionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** RLS-scoped: your own bids, plus every bid if you own the auction's merchant. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const bids = await listBidsForAuctionAsUser(user.id, params.id);
    return NextResponse.json({ bids });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
