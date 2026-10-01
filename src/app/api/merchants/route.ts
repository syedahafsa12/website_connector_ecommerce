import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMerchant, listMerchants } from "@/server/merchants/repository";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(1),
  category: z.string().min(1),
  connectorType: z.enum(["rest", "mcp", "web"]),
  connectorConfig: z.record(z.unknown()),
  isAdversarialDemo: z.boolean().optional(),
});

export async function GET() {
  const merchants = await listMerchants();
  return NextResponse.json({ merchants });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const merchant = await createMerchant(parsed.data);
  return NextResponse.json({ merchant }, { status: 201 });
}
