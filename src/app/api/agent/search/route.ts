import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { resolveAgentSession, logToolCall } from "@/server/agent/sessions";
import { runProductSearch } from "@/server/agent/product-search";

const schema = z.object({
  query: z.string(), // "" is a deliberate "browse everything" search, not invalid input
  filters: z
    .object({
      maxPrice: z.number().optional(),
      color: z.string().optional(),
      freeShippingOnly: z.boolean().optional(),
      minReturnDays: z.number().optional(),
    })
    .optional(),
  sessionId: z.string().uuid().optional(),
});

/** Normalized cross-merchant search, directly callable by the frontend (no LLM round trip required). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const session = await resolveAgentSession(user.id, parsed.data.sessionId);
    const taskId = randomUUID();

    try {
      const result = await runProductSearch(
        { query: parsed.data.query, filters: parsed.data.filters },
        { sessionId: session.id, taskId, actor: "shopper" },
      );
      await logToolCall({
        sessionId: session.id,
        userId: user.id,
        toolName: "search_products",
        arguments: parsed.data,
        resultStatus: "success",
        resultSummary: { merchantCount: result.merchants.length, offerCount: result.offers.length },
      });
      return NextResponse.json({ sessionId: session.id, ...result });
    } catch (err) {
      await logToolCall({
        sessionId: session.id,
        userId: user.id,
        toolName: "search_products",
        arguments: parsed.data,
        resultStatus: "error",
        resultSummary: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
