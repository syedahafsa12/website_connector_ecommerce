import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { resolveAgentSession, logToolCall } from "@/server/agent/sessions";
import { runCompareProducts } from "@/server/agent/product-search";

const schema = z.object({
  items: z.array(z.object({ merchantId: z.string().uuid(), productId: z.string().min(1) })).min(2).max(6),
  sessionId: z.string().uuid().optional(),
});

/** Side-by-side comparison of 2-6 specific products, each re-fetched live from its own merchant. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const session = await resolveAgentSession(user.id, parsed.data.sessionId);

    const comparison = await runCompareProducts(parsed.data.items, { sessionId: session.id, taskId: randomUUID(), actor: "shopper" });
    const resultStatus = comparison.every((c) => !c.error) ? "success" : "error";
    await logToolCall({
      sessionId: session.id,
      userId: user.id,
      toolName: "compare_products",
      arguments: parsed.data,
      resultStatus,
      resultSummary: { items: comparison.map((c) => ({ merchantId: c.merchantId, productId: c.productId, ok: !c.error })) },
    });

    return NextResponse.json({ sessionId: session.id, comparison });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
