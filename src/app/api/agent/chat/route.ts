import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ShoppingAgent } from "@/server/agent/shopping-agent";
import { getModelProvider } from "@/server/agent/provider-factory";

const schema = z.object({ query: z.string().min(1), sessionId: z.string().optional() });

/**
 * Freeform LLM chat endpoint for the engineering console — NOT used by the
 * Agent Mall frontend, which calls the deterministic /api/agent/{search,compare,products}
 * endpoints directly and never invokes an LLM. Requires ANTHROPIC_API_KEY
 * (see provider-factory.ts); unset in this environment, so this endpoint
 * currently 500s with "ANTHROPIC_API_KEY is not set" if called.
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    const agent = new ShoppingAgent(getModelProvider());
    const result = await agent.handleQuery(parsed.data.query, parsed.data.sessionId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
