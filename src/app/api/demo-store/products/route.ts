import { NextResponse } from "next/server";
import { PRODUCTS } from "@/server/connect/demo-store";

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const color = sp.get("color")?.toLowerCase();
  const max = sp.get("max_price") ? Number(sp.get("max_price")) : undefined;
  const products = PRODUCTS.filter((p) => {
    const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
    return q.every((t) => hay.includes(t)) && (!color || p.color === color) && (max === undefined || p.price <= max);
  })
    .sort((a, b) => a.price - b.price)
    .map(({ id, name, category, color, price }) => ({ id, name, category, color, price, currency: "USD", image: `/demo-store/art/${id}` }));
  return NextResponse.json({ products });
}
