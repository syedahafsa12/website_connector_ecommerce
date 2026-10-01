import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ShoppingAgent } from "@/server/agent/shopping-agent";
import { getModelProvider } from "@/server/agent/provider-factory";

const schema = z.object({ query: z.string().min(1), sessionId: z.string().optional() });

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
