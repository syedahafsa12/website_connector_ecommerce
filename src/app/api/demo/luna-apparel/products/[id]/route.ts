import { NextResponse } from "next/server";
import { LUNA_CATALOG } from "@/demo-merchants/luna-catalog";
import { findById, notFound, productWire } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const item = findById(LUNA_CATALOG, params.id);
  if (!item) return notFound(params.id);
  return NextResponse.json(productWire(item));
}
