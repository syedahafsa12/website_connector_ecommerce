import { NextResponse } from "next/server";
import { CommerceError, createCheckout } from "@/server/connect/demo-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.json({ error: "Authorization required." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(createCheckout(String(b.cartId ?? "")));
  } catch (e) {
    if (e instanceof CommerceError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
