import { NextResponse } from "next/server";
import { getLatestPendingVerification, getMerchantBySlug } from "@/server/merchants/repository";

// Simulates "the merchant's own site" serving our verification file. In this
// controlled POC the demo merchants are hosted by this same app; the check in
// verification.ts still performs a real HTTP fetch + string compare against
// this endpoint, so the verification step is genuine, not short-circuited.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const merchant = await getMerchantBySlug(params.slug);
  if (!merchant) return new NextResponse("not found", { status: 404 });
  const verification = await getLatestPendingVerification(merchant.id);
  if (!verification) return new NextResponse("no verification challenge", { status: 404 });
  return new NextResponse(verification.token, { headers: { "content-type": "text/plain" } });
}
