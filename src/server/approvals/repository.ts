import { withUserScope } from "@/server/db/pool";

export type ApprovalActionType = "merchant_visit" | "purchase" | "auction_bid" | "buy_now";
export type ApprovalStatus = "requested" | "pending" | "approved" | "rejected";

export interface ApprovalRow {
  id: string;
  user_id: string;
  session_id: string | null;
  merchant_id: string | null;
  action_type: ApprovalActionType;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export async function createApproval(
  userId: string,
  input: { sessionId?: string | null; merchantId?: string | null; actionType: ApprovalActionType; payload?: Record<string, unknown> },
): Promise<ApprovalRow> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<ApprovalRow>(
      `insert into approvals (user_id, session_id, merchant_id, action_type, payload, status)
       values ($1,$2,$3,$4,$5,'pending') returning *`,
      [userId, input.sessionId ?? null, input.merchantId ?? null, input.actionType, JSON.stringify(input.payload ?? {})],
    );
    if (!res.rows[0]) throw new Error("failed to create approval");
    return res.rows[0];
  });
}

export async function listApprovals(userId: string, status?: ApprovalStatus): Promise<ApprovalRow[]> {
  return withUserScope(userId, async (client) => {
    const res = status
      ? await client.query<ApprovalRow>(`select * from approvals where user_id = $1 and status = $2 order by requested_at desc`, [userId, status])
      : await client.query<ApprovalRow>(`select * from approvals where user_id = $1 order by requested_at desc`, [userId]);
    return res.rows;
  });
}

export async function getApproval(userId: string, id: string): Promise<ApprovalRow | undefined> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<ApprovalRow>(`select * from approvals where id = $1 and user_id = $2`, [id, userId]);
    return res.rows[0];
  });
}

/**
 * Transitions a 'pending' approval to 'approved'/'rejected'. Scoped to the
 * owning user both by RLS (withUserScope) and by the `user_id = $3` /
 * `status = 'pending'` guard, so this can never decide someone else's
 * approval or re-decide one already settled — the only way an approval
 * becomes 'approved' is this one, user-initiated, state transition.
 */
export async function decideApproval(userId: string, id: string, decision: "approved" | "rejected"): Promise<ApprovalRow | undefined> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<ApprovalRow>(
      `update approvals set status = $1, decided_at = now(), decided_by = $2
       where id = $3 and user_id = $2 and status = 'pending'
       returning *`,
      [decision, userId, id],
    );
    return res.rows[0];
  });
}
