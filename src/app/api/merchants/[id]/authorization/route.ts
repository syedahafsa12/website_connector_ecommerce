import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchant } from "@/server/merchants/authorization";

const scopeEnum = z.enum(["products", "inventory", "shipping", "returns", "warranty", "orders", "checkout"]);
const schema = z.object({ scopes: z.array(scopeEnum).min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    const authorization = await authorizeMerchant(params.id, parsed.data.scopes);
    return NextResponse.json({ authorization });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
