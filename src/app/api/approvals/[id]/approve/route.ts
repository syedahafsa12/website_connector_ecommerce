import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { decideApproval } from "@/server/approvals/repository";
import { recordShoppingEvent } from "@/server/shopping-events/log";

/** The only way an approval's status becomes 'approved' — never set by the agent, only by the shopper. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const approval = await decideApproval(user.id, params.id, "approved");
    if (!approval) return NextResponse.json({ error: "Approval not found, not yours, or already decided." }, { status: 404 });

    if (approval.action_type === "merchant_visit") {
      await recordShoppingEvent({
        sessionId: approval.session_id,
        userId: user.id,
        merchantId: approval.merchant_id,
        eventType: "VISIT_APPROVED",
        payload: { approvalId: approval.id },
      });
    }

    return NextResponse.json({ approval });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
