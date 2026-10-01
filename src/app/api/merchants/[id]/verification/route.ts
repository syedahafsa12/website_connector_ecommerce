import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startDomainVerification } from "@/server/merchants/verification";

const schema = z.object({ method: z.enum(["dns_txt", "well_known_file"]) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const verification = await startDomainVerification(params.id, parsed.data.method);
  return NextResponse.json({ verification });
}
