import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { resolveAgentSession, logToolCall } from "@/server/agent/sessions";
import { runGetProduct } from "@/server/agent/product-search";

const sessionSchema = z.object({ sessionId: z.string().uuid().optional() });

/** Live detail for one product from one merchant, normalized the same way search_products results are. */
export async function GET(req: NextRequest, { params }: { params: { merchantId: string; productId: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = sessionSchema.safeParse({ sessionId: req.nextUrl.searchParams.get("sessionId") ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const session = await resolveAgentSession(user.id, parsed.data.sessionId);
    const args = { merchantId: params.merchantId, productId: params.productId };

    try {
      const offer = await runGetProduct(params.merchantId, params.productId, { sessionId: session.id, taskId: randomUUID(), actor: "shopper" });
      await logToolCall({ sessionId: session.id, userId: user.id, toolName: "get_product", arguments: args, resultStatus: "success", resultSummary: { productId: offer.productId } });
      return NextResponse.json({ sessionId: session.id, offer });
    } catch (err) {
      await logToolCall({ sessionId: session.id, userId: user.id, toolName: "get_product", arguments: args, resultStatus: "error", resultSummary: { error: err instanceof Error ? err.message : String(err) } });
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
