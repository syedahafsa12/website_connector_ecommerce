import { NextResponse } from "next/server";
import { PRODUCTS } from "@/server/connect/demo-store";

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = PRODUCTS.find((x) => x.id === params.id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { stock: _stock, ...rest } = p;
  return NextResponse.json({ ...rest, currency: "USD", image: `/demo-store/art/${p.id}`, url: `/demo-store/products/${p.id}` });
}
