import { NextRequest, NextResponse } from "next/server";
import { NORTHSTAR_CATALOG } from "@/demo-merchants/catalog";
import { findProducts, productWire } from "@/demo-merchants/rest-handlers";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  const items = findProducts(NORTHSTAR_CATALOG, query).map(productWire);
  return NextResponse.json({ products: items });
}
