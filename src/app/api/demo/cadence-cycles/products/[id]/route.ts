import { NextResponse } from "next/server";
import { CADENCE_CATALOG } from "@/demo-merchants/cadence-catalog";
import { findById, notFound, productWire } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const item = findById(CADENCE_CATALOG, params.id);
  if (!item) return notFound(params.id);
  return NextResponse.json(productWire(item));
}
