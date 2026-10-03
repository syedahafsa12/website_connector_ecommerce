// Test support for System 1 (the DB-backed merchant/agent-mall stack under
// src/server/{merchants,agent,approvals,visits,...}), which — unlike System
// 2 (src/server/connect) — talks to real PostgreSQL and so needs a real
// database to run against. `npm test` points this at a local Postgres
// instance (see package.json's `pretest`/README) rather than the hosted
// Supabase project: fast, disposable, and isolated from real data.
import { randomUUID } from "node:crypto";
import { query, withPlatformScope } from "@/server/db/pool";
import { seedAgentMallMerchants } from "@/server/merchants/seed-agent-mall";
import { seedDemoAuctions } from "@/server/auctions/seed-demo-auctions";
import { createMerchant } from "@/server/merchants/repository";
import type { MerchantRow } from "@/server/merchants/types";
import type { AuctionRow } from "@/server/auctions/types";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/agentic_commerce_test";
process.env.APP_BASE_URL ??= "http://localhost:3000";

export interface TestUser {
  id: string;
  email: string;
}

/** Inserts a bare-minimum auth.users row — enough to satisfy every user_id FK (approvals, profiles, ...). */
export async function createTestUser(label = "shopper"): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id}@test.local`;
  await query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  return { id, email };
}

let merchantsPromise: Promise<MerchantRow[]> | undefined;

/** Seeds (once per test run) the 2 real demo merchants and returns them, keyed by slug for convenience. */
export async function ensureAgentMallMerchants(): Promise<Record<"cadence-cycles" | "luna-apparel", MerchantRow>> {
  merchantsPromise ??= seedAgentMallMerchants();
  const merchants = await merchantsPromise;
  const bySlug = Object.fromEntries(merchants.map((m) => [m.slug, m])) as Record<string, MerchantRow>;
  return bySlug as Record<"cadence-cycles" | "luna-apparel", MerchantRow>;
}

/** Builds an `Authorization: Bearer <token>` header the mocked `@/server/auth/session` resolves back to that exact user. */
export function authHeader(user: TestUser): HeadersInit {
  return { authorization: `Bearer ${user.id}`, "content-type": "application/json" };
}

let auctionsPromise: Promise<AuctionRow[]> | undefined;

/** Seeds (once per test run) the demo auctions on real Cadence/Luna products. */
export async function ensureDemoAuctions(): Promise<AuctionRow[]> {
  auctionsPromise ??= seedDemoAuctions();
  return auctionsPromise;
}

/** Test-only: makes a test user the owner of a merchant, so merchant-authorized auction actions can be exercised. Real signup never does this — see POST /api/merchants, which always sets the caller as owner. */
export async function setMerchantOwnerForTest(merchantId: string, userId: string): Promise<void> {
  await withPlatformScope((client) => client.query(`update merchants set owner_id = $2, updated_at = now() where id = $1`, [merchantId, userId]));
}

/** Test-only: fast-forwards an auction's ends_at into the past (instead of waiting 7 real days) so expiration/resolution logic can be exercised deterministically. */
export async function forceAuctionEndsAtForTest(auctionId: string, endsAt: Date): Promise<void> {
  await withPlatformScope((client) => client.query(`update auctions set ends_at = $2, updated_at = now() where id = $1`, [auctionId, endsAt.toISOString()]));
}

/** A fresh, isolated merchant owned by the given test user — so auction-ownership tests don't have to mutate the shared Cadence/Luna rows. */
export async function createOwnedTestMerchant(ownerId: string): Promise<MerchantRow> {
  const slug = `test-merchant-${randomUUID()}`;
  return createMerchant({
    name: "Test Merchant",
    slug,
    domain: `${slug}.example`,
    category: "Test",
    connectorType: "rest",
    connectorConfig: { baseUrl: "http://localhost:3000/api/demo/test-merchant" },
    ownerId,
  });
}
