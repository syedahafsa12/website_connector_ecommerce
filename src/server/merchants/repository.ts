import { randomUUID } from "node:crypto";
import { query, queryOne } from "@/server/db/pool";
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
}): Promise<MerchantRow> {
  const row = await queryOne<MerchantRow>(
    `insert into merchants (name, slug, domain, category, connector_type, connector_config, is_adversarial_demo)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [
      input.name,
      input.slug,
      input.domain,
      input.category,
      input.connectorType,
      JSON.stringify(input.connectorConfig),
      input.isAdversarialDemo ?? false,
    ],
  );
  if (!row) throw new Error("failed to create merchant");
  return row;
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

export async function setMerchantStatus(id: string, status: MerchantRow["status"]): Promise<void> {
  await query(`update merchants set status = $2, updated_at = now() where id = $1`, [id, status]);
}

export async function createDomainVerification(input: {
  merchantId: string;
  method: "dns_txt" | "well_known_file";
}): Promise<{ id: string; token: string }> {
  const token = `acp-verify-${randomUUID()}`;
  const row = await queryOne<{ id: string; token: string }>(
    `insert into domain_verifications (merchant_id, method, token) values ($1,$2,$3) returning id, token`,
    [input.merchantId, input.method, token],
  );
  if (!row) throw new Error("failed to create domain verification");
  return row;
}

export async function getLatestPendingVerification(merchantId: string) {
  return queryOne<{ id: string; method: string; token: string; status: string }>(
    `select id, method, token, status from domain_verifications
     where merchant_id = $1 order by created_at desc limit 1`,
    [merchantId],
  );
}

export async function markVerificationResult(id: string, verified: boolean): Promise<void> {
  await query(
    `update domain_verifications set status = $2, verified_at = case when $2 = 'verified' then now() else null end where id = $1`,
    [id, verified ? "verified" : "failed"],
  );
}

export async function createAuthorization(input: {
  merchantId: string;
  scopes: ScopeCategory[];
}): Promise<AuthorizationRow> {
  await query(
    `update merchant_authorizations set status = 'revoked', revoked_at = now()
     where merchant_id = $1 and status = 'active'`,
    [input.merchantId],
  );
  const row = await queryOne<AuthorizationRow>(
    `insert into merchant_authorizations (merchant_id, scopes) values ($1,$2) returning *`,
    [input.merchantId, input.scopes],
  );
  if (!row) throw new Error("failed to create authorization");
  return row;
}

export async function getActiveAuthorization(merchantId: string): Promise<AuthorizationRow | undefined> {
  return queryOne<AuthorizationRow>(
    `select * from merchant_authorizations where merchant_id = $1 and status = 'active' order by authorized_at desc limit 1`,
    [merchantId],
  );
}

export async function revokeAuthorization(merchantId: string): Promise<void> {
  await query(
    `update merchant_authorizations set status = 'revoked', revoked_at = now()
     where merchant_id = $1 and status = 'active'`,
    [merchantId],
  );
}
