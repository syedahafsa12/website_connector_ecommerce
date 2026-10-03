import { randomUUID } from "node:crypto";
import { query, queryOne, withPlatformScope, withUserScope } from "@/server/db/pool";
import type { ScopeCategory } from "@/server/capabilities/definitions";
import type { AuthorizationRow, ConnectorType, MerchantRow } from "./types";

export async function createMerchant(input: {
  name: string;
  slug: string;
  domain: string;
  category: string;
  connectorType: ConnectorType;
  connectorConfig: unknown;
  isAdversarialDemo?: boolean;
  ownerId?: string | null;
}): Promise<MerchantRow> {
  const sql = `insert into merchants (name, slug, domain, category, connector_type, connector_config, is_adversarial_demo, owner_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`;
  const params = [
    input.name,
    input.slug,
    input.domain,
    input.category,
    input.connectorType,
    JSON.stringify(input.connectorConfig),
    input.isAdversarialDemo ?? false,
    input.ownerId ?? null,
  ];
  // RLS requires either a matching app.current_user_id (owned merchant) or
  // app.bypass_rls (unowned/demo/seed-script merchants) — see merchants_owner_insert.
  const row = input.ownerId
    ? await withUserScope(input.ownerId, (client) => client.query<MerchantRow>(sql, params).then((r) => r.rows[0]))
    : await withPlatformScope((client) => client.query<MerchantRow>(sql, params).then((r) => r.rows[0]));
  if (!row) throw new Error("failed to create merchant");
  return row;
}

export async function listMerchantsOwnedBy(ownerId: string): Promise<MerchantRow[]> {
  return query<MerchantRow>(`select * from merchants where owner_id = $1 order by created_at asc`, [ownerId]);
}

export async function getMerchantById(id: string): Promise<MerchantRow | undefined> {
  return queryOne<MerchantRow>(`select * from merchants where id = $1`, [id]);
}

export async function getMerchantBySlug(slug: string): Promise<MerchantRow | undefined> {
  return queryOne<MerchantRow>(`select * from merchants where slug = $1`, [slug]);
}

export async function listMerchants(): Promise<MerchantRow[]> {
  return query<MerchantRow>(`select * from merchants order by created_at asc`);
}

// domain_verifications and merchant_authorizations are owner-or-bypass only
// under RLS (see migrations/002_agent_mall_foundation.sql). The console's
// verification/authorization flows are platform-operator actions (actor:
// "system"/"merchant" in the audit trail, not yet gated behind a specific
// signed-in owner at the route level), so they run with app.bypass_rls — the
// same escape hatch the existing agent/capability-router code already uses.

export async function setMerchantStatus(id: string, status: MerchantRow["status"]): Promise<void> {
  await withPlatformScope((client) => client.query(`update merchants set status = $2, updated_at = now() where id = $1`, [id, status]));
}

export async function createDomainVerification(input: {
  merchantId: string;
  method: "dns_txt" | "well_known_file";
}): Promise<{ id: string; token: string }> {
  const token = `acp-verify-${randomUUID()}`;
  const row = await withPlatformScope((client) =>
    client
      .query<{ id: string; token: string }>(
        `insert into domain_verifications (merchant_id, method, token) values ($1,$2,$3) returning id, token`,
        [input.merchantId, input.method, token],
      )
      .then((r) => r.rows[0]),
  );
  if (!row) throw new Error("failed to create domain verification");
  return row;
}

export async function getLatestPendingVerification(merchantId: string) {
  return withPlatformScope((client) =>
    client
      .query<{ id: string; method: string; token: string; status: string }>(
        `select id, method, token, status from domain_verifications
         where merchant_id = $1 order by created_at desc limit 1`,
        [merchantId],
      )
      .then((r) => r.rows[0]),
  );
}

export async function markVerificationResult(id: string, verified: boolean): Promise<void> {
  await withPlatformScope((client) =>
    client.query(
      `update domain_verifications set status = $2, verified_at = case when $2 = 'verified' then now() else null end where id = $1`,
      [id, verified ? "verified" : "failed"],
    ),
  );
}

export async function createAuthorization(input: {
  merchantId: string;
  scopes: ScopeCategory[];
}): Promise<AuthorizationRow> {
  return withPlatformScope(async (client) => {
    await client.query(
      `update merchant_authorizations set status = 'revoked', revoked_at = now()
       where merchant_id = $1 and status = 'active'`,
      [input.merchantId],
    );
    const res = await client.query<AuthorizationRow>(
      `insert into merchant_authorizations (merchant_id, scopes) values ($1,$2) returning *`,
      [input.merchantId, input.scopes],
    );
    if (!res.rows[0]) throw new Error("failed to create authorization");
    return res.rows[0];
  });
}

export async function getActiveAuthorization(merchantId: string): Promise<AuthorizationRow | undefined> {
  return withPlatformScope((client) =>
    client
      .query<AuthorizationRow>(
        `select * from merchant_authorizations where merchant_id = $1 and status = 'active' order by authorized_at desc limit 1`,
        [merchantId],
      )
      .then((r) => r.rows[0]),
  );
}

export async function revokeAuthorization(merchantId: string): Promise<void> {
  await withPlatformScope((client) =>
    client.query(
      `update merchant_authorizations set status = 'revoked', revoked_at = now()
       where merchant_id = $1 and status = 'active'`,
      [merchantId],
    ),
  );
}
