import { NextRequest, NextResponse } from "next/server";
import { listAuditEvents } from "@/server/audit/log";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "100");
  const events = await listAuditEvents(limit);
  return NextResponse.json({ events });
}
