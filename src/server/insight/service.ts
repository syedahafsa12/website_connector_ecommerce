import { withMerchantScope, withPlatformScope } from "@/server/db/pool";
import { recordAuditEvent } from "@/server/audit/log";

/** System-of-record write on the caller's behalf, after the request is already authorized — see recordShoppingEvent for why this needs withPlatformScope rather than the unscoped `query()`. */
export async function recordInsight(input: {
  sessionId: string;
  merchantId: string;
  requirements: Record<string, unknown>;
  decision: "selected" | "rejected";
  reasons: string[];
}): Promise<void> {
  await withPlatformScope((client) =>
    client.query(
      `insert into merchant_insights (session_id, merchant_id, requirements, decision, reasons)
       values ($1,$2,$3,$4,$5)`,
      [input.sessionId, input.merchantId, JSON.stringify(input.requirements), input.decision, input.reasons],
    ),
  );
  await recordAuditEvent({
    merchantId: input.merchantId,
    sessionId: input.sessionId,
    actor: "system",
    eventType: "merchant_insight_recorded",
    result: "success",
    details: { decision: input.decision, reasons: input.reasons },
  });
}

/**
 * Explicitly filtered by merchant_id — this cannot rely on the
 * `merchant_insights_isolation` RLS policy alone, because the role this app
 * connects as has BYPASSRLS (confirmed live: `select rolbypassrls from
 * pg_roles where rolname = current_user` returns true for the configured
 * DATABASE_URL), which makes every RLS policy in this schema a no-op for
 * this connection regardless of the `app.current_merchant_id` GUC. Without
 * this WHERE clause, any merchant owner could read every other merchant's
 * insight rows through /api/merchants/:id/insights and
 * /api/merchants/:id/analytics.
 */
export async function getMerchantInsights(merchantId: string) {
  return withMerchantScope(merchantId, async (client) => {
    const res = await client.query(`select * from merchant_insights where merchant_id = $1 order by created_at desc`, [merchantId]);
    return res.rows;
  });
}
