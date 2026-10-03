import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { resolveAgentSession, logToolCall } from "@/server/agent/sessions";
import { recordShoppingEvent } from "@/server/shopping-events/log";
import { createAuctionForMerchant, searchAuctions, AuctionAuthorizationError, AuctionValidationError } from "@/server/auctions/service";
import { getMerchantById } from "@/server/merchants/repository";
import { toPublicAuction } from "@/server/auctions/view";

const searchSchema = z.object({
  query: z.string().optional(),
  merchantId: z.string().uuid().optional(),
  status: z.enum(["draft", "open", "ended", "settled", "cancelled"]).optional(),
  maxPrice: z.coerce.number().optional(),
  onlyOpen: z.coerce.boolean().optional(),
  sessionId: z.string().uuid().optional(),
});

/** Normalized, agent-friendly auction search — same request/session/logging pattern as POST /api/agent/search. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = searchSchema.safeParse(params);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const session = await resolveAgentSession(user.id, parsed.data.sessionId);
    const auctions = await searchAuctions(parsed.data);
    const merchantCache = new Map<string, Awaited<ReturnType<typeof getMerchantById>>>();
    const results = [];
    for (const auction of auctions) {
      let merchant = merchantCache.get(auction.merchant_id);
      if (merchant === undefined) {
        merchant = await getMerchantById(auction.merchant_id);
        merchantCache.set(auction.merchant_id, merchant);
      }
      if (!merchant) continue;
      results.push(await toPublicAuction(auction, merchant));
    }

    await recordShoppingEvent({ sessionId: session.id, userId: user.id, eventType: "AUCTION_VIEW", payload: { query: parsed.data.query ?? null, resultCount: results.length } });
    await logToolCall({ sessionId: session.id, userId: user.id, toolName: "search_auctions", arguments: parsed.data, resultStatus: "success", resultSummary: { count: results.length } });

    return NextResponse.json({ sessionId: session.id, auctions: results });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

const createSchema = z.object({
  merchantId: z.string().uuid(),
  productExternalId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  startingPrice: z.number().positive(),
  buyNowPrice: z.number().positive().optional(),
  currency: z.string().optional(),
  draft: z.boolean().optional(),
});

/** A merchant creates an auction for one of its own products — ownership is verified server-side, never trusted from the request body. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const auction = await createAuctionForMerchant(user.id, parsed.data);
    return NextResponse.json({ auction }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionAuthorizationError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof AuctionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
