import { NextResponse } from "next/server";
import { NORTHSTAR_CATALOG } from "@/demo-merchants/catalog";
import { findById, notFound, productWire } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const item = findById(NORTHSTAR_CATALOG, params.id);
  if (!item) return notFound(params.id);
  return NextResponse.json(productWire(item));
}
