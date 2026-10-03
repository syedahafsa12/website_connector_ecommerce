import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { createApproval, listApprovals, type ApprovalStatus } from "@/server/approvals/repository";
import { getAuctionById } from "@/server/auctions/service";
import { getMerchantById } from "@/server/merchants/repository";
import { estimateTotal } from "@/server/tax/provider";

const actionTypeEnum = z.enum(["merchant_visit", "purchase", "auction_bid", "buy_now"]);
const statusEnum = z.enum(["requested", "pending", "approved", "rejected"]);

const createSchema = z.object({
  actionType: actionTypeEnum,
  merchantId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * For auction_bid/buy_now, the stored payload is never just whatever the
 * client sent: the auction, merchant, and tax/shipping/total are always
 * re-derived server-side (via the same TaxProvider/ShippingCalculator the
 * /estimate endpoint uses) so what the user is shown has a real, computed
 * breakdown behind it. This step only checks that the request is
 * well-formed (the auction/merchant exist, a bid amount or Buy Now price is
 * present) — it deliberately does NOT re-check whether the amount would
 * currently win. That eligibility check (auction open, not expired, amount
 * beats the current price) belongs only to GET-time /estimate and, as the
 * actual authority, to bid/buy-now execution: an approval captures what the
 * user agreed to at request time, and the price can legitimately move
 * before they act on it. Rejecting the approval request itself for a
 * since-moved price would just force the user to redo the approval step for
 * no safety benefit — execution re-validates everything regardless, so a
 * stale or already-losing approval can never bypass it.
 */
async function buildConsequentialAuctionPayload(
  actionType: "auction_bid" | "buy_now",
  rawPayload: Record<string, unknown> | undefined,
): Promise<{ merchantId: string; payload: Record<string, unknown> } | { error: string; status: number }> {
  const auctionId = typeof rawPayload?.auctionId === "string" ? rawPayload.auctionId : undefined;
  if (!auctionId) return { error: "payload.auctionId is required for auction_bid/buy_now approvals.", status: 400 };

  const auction = await getAuctionById(auctionId);
  if (!auction) return { error: "Auction not found.", status: 404 };
  const merchant = await getMerchantById(auction.merchant_id);
  if (!merchant) return { error: "Auction not found.", status: 404 };

  let itemAmount: number;
  if (actionType === "auction_bid") {
    itemAmount = Number(rawPayload?.amount);
    if (!(itemAmount > 0)) return { error: "payload.amount must be a positive number for an auction_bid approval.", status: 400 };
  } else {
    if (auction.buy_now_price === null) return { error: "This auction has no Buy Now price.", status: 400 };
    itemAmount = Number(auction.buy_now_price);
  }

  const estimate = await estimateTotal({ amount: itemAmount, currency: auction.currency, merchantId: auction.merchant_id });
  return {
    merchantId: auction.merchant_id,
    payload: {
      auctionId,
      ...(actionType === "auction_bid" ? { amount: itemAmount } : { buyNowPrice: itemAmount }),
      auction: { id: auction.id, title: auction.title },
      merchant: { id: merchant.id, name: merchant.name },
      currency: estimate.currency,
      estimatedShipping: estimate.shipping.amount,
      estimatedTax: estimate.tax.amount,
      estimatedTotal: estimate.total,
    },
  };
}

/**
 * Every high-risk agent action (starting with merchant navigation) goes
 * through this request -> decide flow. The agent can request an approval;
 * only the authenticated shopper, via /approve or /reject, can settle it.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    let { merchantId, payload } = parsed.data;
    if (parsed.data.actionType === "auction_bid" || parsed.data.actionType === "buy_now") {
      const built = await buildConsequentialAuctionPayload(parsed.data.actionType, payload);
      if ("error" in built) return NextResponse.json({ error: built.error }, { status: built.status });
      merchantId = built.merchantId;
      payload = built.payload;
    }

    const approval = await createApproval(user.id, { ...parsed.data, merchantId, payload });
    return NextResponse.json({ approval }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const statusParam = req.nextUrl.searchParams.get("status");
    const parsedStatus = statusParam ? statusEnum.safeParse(statusParam) : undefined;
    if (statusParam && !parsedStatus?.success) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    const approvals = await listApprovals(user.id, parsedStatus?.data as ApprovalStatus | undefined);
    return NextResponse.json({ approvals });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
