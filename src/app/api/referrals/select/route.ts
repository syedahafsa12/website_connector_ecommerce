import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { selectOffer } from "@/server/referral/ledger";

const schema = z.object({ sessionId: z.string(), merchantId: z.string().uuid(), offerId: z.string() });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const referral = await selectOffer(parsed.data);
  return NextResponse.json({ referral });
}
