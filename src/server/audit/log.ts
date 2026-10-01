import { query } from "@/server/db/pool";

export type AuditActor = "agent" | "shopper" | "system" | "merchant";
export type AuditResult = "success" | "error" | "blocked";

export interface AuditEventInput {
  merchantId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  actor: AuditActor;
  eventType: string;
  capability?: string | null;
  result?: AuditResult | null;
  policyDecision?: string | null;
  details?: Record<string, unknown>;
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  await query(
    `insert into audit_events (merchant_id, session_id, task_id, actor, event_type, capability, result, policy_decision, details)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.merchantId ?? null,
      input.sessionId ?? null,
      input.taskId ?? null,
      input.actor,
      input.eventType,
      input.capability ?? null,
      input.result ?? null,
      input.policyDecision ?? null,
      JSON.stringify(input.details ?? {}),
    ],
  );
}

export async function listAuditEvents(limit = 100) {
  return query(`select * from audit_events order by occurred_at desc limit $1`, [limit]);
}
