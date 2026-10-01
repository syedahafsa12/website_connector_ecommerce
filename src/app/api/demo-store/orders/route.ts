import { NextResponse } from "next/server";
import { CommerceError, placeOrder } from "@/server/connect/demo-store";
import type { Approval } from "@/server/connect/trust";

export const dynamic = "force-dynamic";

// The merchant verifies the shopper's signed approval itself; a bearer token alone can never place an order.
export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.json({ error: "Authorization required." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const approval = b.approval as Approval | undefined;
  if (!approval || req.headers.get("x-shopper-approval") !== approval.token) return NextResponse.json({ error: "Shopper approval required." }, { status: 403 });
  try {
    return NextResponse.json(placeOrder(String(b.checkoutId ?? ""), approval, req.headers.get("x-platform-connection")), { status: 201 });
  } catch (e) {
    if (e instanceof CommerceError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
