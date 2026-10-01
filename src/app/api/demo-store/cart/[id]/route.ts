import { NextResponse } from "next/server";
import { CommerceError, getCart } from "@/server/connect/demo-store";

export const dynamic = "force-dynamic";

export function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(getCart(params.id));
  } catch (e) {
    if (e instanceof CommerceError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
