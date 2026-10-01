import { NextResponse } from "next/server";
import { CommerceError, getOrder } from "@/server/connect/demo-store";

export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: { id: string } }) {
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return NextResponse.json({ error: "Authorization required." }, { status: 401 });
  try {
    return NextResponse.json(getOrder(params.id));
  } catch (e) {
    if (e instanceof CommerceError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
