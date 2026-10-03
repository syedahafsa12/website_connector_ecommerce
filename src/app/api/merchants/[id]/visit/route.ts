import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { getApproval } from "@/server/approvals/repository";
import { recordMerchantVisit } from "@/server/visits/repository";
import { recordShoppingEvent } from "@/server/shopping-events/log";

const schema = z.object({ approvalId: z.string().uuid() });

/**
 * Records a merchant visit — and the unique-visit it may create — but ONLY
 * once an approval for exactly this (user, merchant, merchant_visit) already
 * exists with status 'approved'. There is no path in this handler that
 * records a visit without that check passing first: the agent cannot reach
 * this effect by itself, no matter what it calls or claims.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const approval = await getApproval(user.id, parsed.data.approvalId);
    if (!approval || approval.action_type !== "merchant_visit" || approval.merchant_id !== params.id || approval.status !== "approved") {
      return NextResponse.json(
        { error: "Merchant navigation requires an approved merchant_visit approval for this merchant and this shopper." },
        { status: 403 },
      );
    }

    const result = await recordMerchantVisit({
      merchantId: params.id,
      visitorSubjectId: user.id,
      sessionId: approval.session_id,
      approvalId: approval.id,
    });
    if ("rejected" in result) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    const { visit, isNewUniqueVisit, visitPackage } = result;

    await recordShoppingEvent({
      sessionId: approval.session_id,
      userId: user.id,
      merchantId: params.id,
      eventType: "MERCHANT_VISITED",
      payload: { approvalId: approval.id, isNewUniqueVisit },
    });

    return NextResponse.json({
      visit,
      isNewUniqueVisit,
      visitPackage: { id: visitPackage.id, visitsUsed: visitPackage.visits_used, visitLimit: visitPackage.visit_limit },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
