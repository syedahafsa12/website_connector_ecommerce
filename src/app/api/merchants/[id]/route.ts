import { NextResponse } from "next/server";
import { getActiveAuthorization, getMerchantById } from "@/server/merchants/repository";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const merchant = await getMerchantById(params.id);
  if (!merchant) return NextResponse.json({ error: "not found" }, { status: 404 });
  const authorization = await getActiveAuthorization(params.id);
  return NextResponse.json({ merchant, authorization: authorization ?? null });
}
