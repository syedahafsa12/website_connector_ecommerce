import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { createApproval, listApprovals, type ApprovalStatus } from "@/server/approvals/repository";

const actionTypeEnum = z.enum(["merchant_visit", "purchase", "auction_bid", "buy_now"]);
const statusEnum = z.enum(["requested", "pending", "approved", "rejected"]);

const createSchema = z.object({
  actionType: actionTypeEnum,
  merchantId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * Every high-risk agent action (starting with merchant navigation) goes
 * through this request -> decide flow. The agent can request an approval;
 * only the authenticated shopper, via /approve or /reject, can settle it.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    const approval = await createApproval(user.id, parsed.data);
    return NextResponse.json({ approval }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const statusParam = req.nextUrl.searchParams.get("status");
    const parsedStatus = statusParam ? statusEnum.safeParse(statusParam) : undefined;
    if (statusParam && !parsedStatus?.success) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    const approvals = await listApprovals(user.id, parsedStatus?.data as ApprovalStatus | undefined);
    return NextResponse.json({ approvals });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
