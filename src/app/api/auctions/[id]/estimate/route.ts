import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { estimateAuctionAction, AuctionNotFoundError, AuctionValidationError } from "@/server/auctions/service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bid"), amount: z.number().positive() }),
  z.object({ action: z.literal("buy_now") }),
]);

/**
 * Read-only price breakdown for a proposed bid or Buy Now — shown to the
 * user before they request/approve the real action. Never places a bid,
 * never ends the auction, never charges anything, never records a visit or
 * settlement. See service.estimateAuctionAction.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuthenticatedUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const estimate = await estimateAuctionAction(params.id, parsed.data.action, parsed.data.action === "bid" ? parsed.data.amount : undefined);
    return NextResponse.json(estimate);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AuctionNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AuctionValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
