import { NextResponse } from "next/server";
import { confirmLanding } from "@/server/referral/ledger";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const referral = await confirmLanding(params.id);
  return NextResponse.json({ referral });
}
