import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { decideApproval } from "@/server/approvals/repository";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const approval = await decideApproval(user.id, params.id, "rejected");
    if (!approval) return NextResponse.json({ error: "Approval not found, not yours, or already decided." }, { status: 404 });
    return NextResponse.json({ approval });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
