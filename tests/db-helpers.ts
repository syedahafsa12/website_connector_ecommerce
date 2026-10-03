// Test support for System 1 (the DB-backed merchant/agent-mall stack under
// src/server/{merchants,agent,approvals,visits,...}), which — unlike System
// 2 (src/server/connect) — talks to real PostgreSQL and so needs a real
// database to run against. `npm test` points this at a local Postgres
// instance (see package.json's `pretest`/README) rather than the hosted
// Supabase project: fast, disposable, and isolated from real data.
import { randomUUID } from "node:crypto";
import { query } from "@/server/db/pool";
import { seedAgentMallMerchants } from "@/server/merchants/seed-agent-mall";
import type { MerchantRow } from "@/server/merchants/types";

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

/** Seeds (once per test run) the 3 demo merchants and returns them, keyed by slug for convenience. */
export async function ensureAgentMallMerchants(): Promise<Record<"northstar-running" | "vertex-athletics" | "urban-services", MerchantRow>> {
  merchantsPromise ??= seedAgentMallMerchants();
  const merchants = await merchantsPromise;
  const bySlug = Object.fromEntries(merchants.map((m) => [m.slug, m])) as Record<string, MerchantRow>;
  return bySlug as Record<"northstar-running" | "vertex-athletics" | "urban-services", MerchantRow>;
}

/** Builds an `Authorization: Bearer <token>` header the mocked `@/server/auth/session` resolves back to that exact user. */
export function authHeader(user: TestUser): HeadersInit {
  return { authorization: `Bearer ${user.id}`, "content-type": "application/json" };
}
