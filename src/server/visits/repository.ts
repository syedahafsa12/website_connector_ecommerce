import { withPlatformScope } from "@/server/db/pool";

export interface VisitPackageRow {
  id: string;
  merchant_id: string;
  visit_limit: number;
  visits_used: number;
  status: "active" | "exhausted" | "expired" | "cancelled";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

export interface UniqueVisitRow {
  id: string;
  package_id: string;
  merchant_id: string;
  visitor_subject_id: string;
  session_id: string | null;
  approval_id: string | null;
  first_visit_at: string;
}

// No visit-package management API exists yet (out of scope for this pass —
// merchants don't yet have a way to buy/configure one). Lazily provisioning
// one with a high ceiling keeps the unique-visit mechanics fully working
// for every merchant today without blocking on that follow-up API.
const DEFAULT_VISIT_LIMIT = 1_000_000;

export async function findOrCreateActiveVisitPackage(merchantId: string): Promise<VisitPackageRow> {
  return withPlatformScope(async (client) => {
    const existing = await client.query<VisitPackageRow>(
      `select * from visit_packages
       where merchant_id = $1 and status = 'active' and visits_used < visit_limit
       order by created_at asc limit 1`,
      [merchantId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const created = await client.query<VisitPackageRow>(
      `insert into visit_packages (merchant_id, visit_limit) values ($1, $2) returning *`,
      [merchantId, DEFAULT_VISIT_LIMIT],
    );
    if (!created.rows[0]) throw new Error("failed to create visit package");
    return created.rows[0];
  });
}

export interface RecordVisitResult {
  visit: UniqueVisitRow;
  isNewUniqueVisit: boolean;
  visitPackage: VisitPackageRow;
}

/**
 * Deterministic unique-visit recording. The `unique (package_id, merchant_id,
 * visitor_subject_id)` constraint (migrations/002) is the actual source of
 * truth for "unique" — this function just makes the two outcomes (first
 * visit vs. repeat visit) explicit to the caller instead of racing a
 * check-then-insert. `visits_used` is only ever incremented on a genuine
 * first insert, inside the same transaction as that insert.
 */
export async function recordUniqueVisit(input: {
  packageId: string;
  merchantId: string;
  visitorSubjectId: string;
  sessionId?: string | null;
  approvalId?: string | null;
}): Promise<RecordVisitResult> {
  return withPlatformScope(async (client) => {
    const inserted = await client.query<UniqueVisitRow>(
      `insert into unique_visits (package_id, merchant_id, visitor_subject_id, session_id, approval_id)
       values ($1,$2,$3,$4,$5)
       on conflict (package_id, merchant_id, visitor_subject_id) do nothing
       returning *`,
      [input.packageId, input.merchantId, input.visitorSubjectId, input.sessionId ?? null, input.approvalId ?? null],
    );

    if (inserted.rows[0]) {
      const updated = await client.query<VisitPackageRow>(
        `update visit_packages
         set visits_used = visits_used + 1,
             status = case when visits_used + 1 >= visit_limit then 'exhausted' else status end
         where id = $1
         returning *`,
        [input.packageId],
      );
      if (!updated.rows[0]) throw new Error("visit package disappeared mid-transaction");
      return { visit: inserted.rows[0], isNewUniqueVisit: true, visitPackage: updated.rows[0] };
    }

    const existingVisit = await client.query<UniqueVisitRow>(
      `select * from unique_visits where package_id = $1 and merchant_id = $2 and visitor_subject_id = $3`,
      [input.packageId, input.merchantId, input.visitorSubjectId],
    );
    const existingPackage = await client.query<VisitPackageRow>(`select * from visit_packages where id = $1`, [input.packageId]);
    if (!existingVisit.rows[0] || !existingPackage.rows[0]) throw new Error("expected existing unique visit not found");
    return { visit: existingVisit.rows[0], isNewUniqueVisit: false, visitPackage: existingPackage.rows[0] };
  });
}
