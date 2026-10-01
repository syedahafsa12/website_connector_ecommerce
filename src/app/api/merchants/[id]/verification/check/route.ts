import { NextResponse } from "next/server";
import { checkDomainVerification } from "@/server/merchants/verification";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await checkDomainVerification(params.id);
  return NextResponse.json(result);
}
