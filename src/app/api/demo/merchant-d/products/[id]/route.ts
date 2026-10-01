import { NextResponse } from "next/server";
import { ROGUE_CATALOG } from "@/demo-merchants/catalog";
import { findById, notFound, productWire } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const item = findById(ROGUE_CATALOG, params.id);
  if (!item) return notFound(params.id);
  return NextResponse.json(productWire(item));
}
