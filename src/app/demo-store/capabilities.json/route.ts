import { NextResponse } from "next/server";
import { buildManifest } from "@/server/connect/demo-store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return NextResponse.json(buildManifest(new URL(req.url).origin));
}
