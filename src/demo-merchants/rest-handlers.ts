// Builds the wire-format JSON a REST demo-merchant "backend" exposes. This
// intentionally mirrors CatalogItem closely — it stands in for "whatever
// shape this external merchant's own API happens to use" (adapted to Offer[]
// by RestMerchantConnector, not consumed directly by the agent).
import { NextResponse } from "next/server";
import type { CatalogItem } from "./catalog";

export function findProducts(catalog: CatalogItem[], query: string | null) {
  if (!query) return catalog;
  const q = query.toLowerCase();
  return catalog.filter(
    (item) => item.title.toLowerCase().includes(q) || item.category.includes(q) || (item.color ?? "").includes(q),
  );
}

export function productWire(item: CatalogItem) {
  return {
    id: item.productId,
    title: item.title,
    description: item.description,
    category: item.category,
    price: item.price,
    currency: item.currency,
    color: item.color ?? null,
    quantity: item.quantity,
    shipping: item.shipping,
    returns: item.returns,
    warranty: item.warranty,
    retrievedAt: item.retrievedAtOverride ?? new Date().toISOString(),
  };
}

export function notFound(id: string) {
  return NextResponse.json({ error: `product ${id} not found` }, { status: 404 });
}

export function findById(catalog: CatalogItem[], id: string) {
  return catalog.find((p) => p.productId === id);
}

export function subResource(catalog: CatalogItem[], id: string, key: "inventory" | "shipping" | "returns" | "warranty") {
  const item = findById(catalog, id);
  if (!item) return notFound(id);
  const retrievedAt = item.retrievedAtOverride ?? new Date().toISOString();
  if (key === "inventory") {
    return NextResponse.json({ inStock: (item.quantity ?? 1) > 0, quantity: item.quantity, retrievedAt });
  }
  if (key === "shipping") return NextResponse.json(item.shipping);
  if (key === "returns") return NextResponse.json(item.returns);
  return NextResponse.json(item.warranty);
}
