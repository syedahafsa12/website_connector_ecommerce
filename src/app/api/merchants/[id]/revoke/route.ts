import { NextResponse } from "next/server";
import { revokeMerchant } from "@/server/merchants/authorization";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await revokeMerchant(params.id);
  return NextResponse.json({ ok: true });
}
