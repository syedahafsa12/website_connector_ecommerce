import { NextResponse } from "next/server";
import { PRODUCTS } from "@/server/connect/demo-store";

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = PRODUCTS.find((x) => x.id === params.id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: p.id, in_stock: p.stock > 0, quantity: p.stock });
}
