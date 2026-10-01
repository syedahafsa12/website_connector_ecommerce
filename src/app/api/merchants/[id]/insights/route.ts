import { NextResponse } from "next/server";
import { getMerchantInsights } from "@/server/insight/service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const insights = await getMerchantInsights(params.id);
  return NextResponse.json({ insights });
}
