import { query, withMerchantScope } from "@/server/db/pool";
import { recordAuditEvent } from "@/server/audit/log";

export async function recordInsight(input: {
  sessionId: string;
  merchantId: string;
  requirements: Record<string, unknown>;
  decision: "selected" | "rejected";
  reasons: string[];
}): Promise<void> {
  await query(
    `insert into merchant_insights (session_id, merchant_id, requirements, decision, reasons)
     values ($1,$2,$3,$4,$5)`,
    [input.sessionId, input.merchantId, JSON.stringify(input.requirements), input.decision, input.reasons],
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
 * Deliberately does NOT filter by merchant_id in the WHERE clause — isolation
 * is enforced by the `merchant_insights_isolation` RLS policy via the
 * `app.current_merchant_id` session GUC that withMerchantScope sets. If RLS
 * were ever disabled, this query would (correctly) start returning every
 * merchant's rows, which is exactly what the isolation test checks for.
 */
export async function getMerchantInsights(merchantId: string) {
  return withMerchantScope(merchantId, async (client) => {
    const res = await client.query(`select * from merchant_insights order by created_at desc`);
    return res.rows;
  });
}
