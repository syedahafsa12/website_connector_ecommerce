import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { getApproval } from "@/server/approvals/repository";
import { getAuctionById, buyNow, AuctionAuthorizationError, AuctionNotFoundError, AuctionValidationError } from "@/server/auctions/service";

const schema = z.object({ approvalId: z.string().uuid() });

/** Same approval gate as bids, but for the `buy_now` action type — see src/app/api/auctions/[id]/bids/route.ts for why. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const auction = await getAuctionById(params.id);
    if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });

    const approval = await getApproval(user.id, parsed.data.approvalId);
    const approvalPayload = approval?.payload as { auctionId?: string } | undefined;
    const approvalMatches =
      approval &&
      approval.action_type === "buy_now" &&
      approval.status === "approved" &&
      approval.merchant_id === auction.merchant_id &&
      approvalPayload?.auctionId === params.id;
    if (!approvalMatches) {
      return NextResponse.json({ error: "Buy Now requires an approved buy_now approval for this exact auction." }, { status: 403 });
    }

    const result = await buyNow(user.id, params.id);
    return NextResponse.json({ auction: result.auction, settlement: result.settlement });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AuctionAuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof AuctionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
