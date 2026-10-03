import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { resolveAgentSession, logToolCall } from "@/server/agent/sessions";
import { recordShoppingEvent } from "@/server/shopping-events/log";
import { getAuctionById, updateAuctionAsMerchant, AuctionAuthorizationError, AuctionNotFoundError, AuctionValidationError } from "@/server/auctions/service";
import { getMerchantById } from "@/server/merchants/repository";
import { toPublicAuction } from "@/server/auctions/view";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const sessionIdParam = req.nextUrl.searchParams.get("sessionId") ?? undefined;
    const session = await resolveAgentSession(user.id, sessionIdParam);

    const auction = await getAuctionById(params.id);
    if (!auction) return NextResponse.json({ error: "Auction not found." }, { status: 404 });
    const merchant = await getMerchantById(auction.merchant_id);
    if (!merchant) return NextResponse.json({ error: "Auction not found." }, { status: 404 });

    await recordShoppingEvent({ sessionId: session.id, userId: user.id, merchantId: merchant.id, eventType: "AUCTION_VIEW", payload: { auctionId: auction.id } });
    await logToolCall({ sessionId: session.id, userId: user.id, toolName: "get_auction", arguments: { auctionId: params.id }, resultStatus: "success", resultSummary: { auctionId: auction.id } });

    return NextResponse.json({ sessionId: session.id, auction: await toPublicAuction(auction, merchant) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startingPrice: z.number().positive().optional(),
  buyNowPrice: z.number().positive().nullable().optional(),
  status: z.literal("open").optional(),
});

/** Merchant-only. Starting-bid fields are rejected once the auction has a bid; buyNowPrice stays editable until the auction ends (see service.ts). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const auction = await updateAuctionAsMerchant(user.id, params.id, parsed.data);
    return NextResponse.json({ auction });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AuctionAuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof AuctionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
