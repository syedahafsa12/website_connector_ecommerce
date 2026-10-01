import { NextResponse } from "next/server";
import { POLICIES } from "@/server/connect/demo-store";

export function GET() {
  return NextResponse.json({ shipping: POLICIES.shipping });
}
