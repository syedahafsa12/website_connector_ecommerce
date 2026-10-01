import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * Runs `fn` inside a transaction with `app.bypass_rls` set, for orchestration
 * code (agent, capability router, audit, referral) that legitimately needs
 * cross-merchant access. See migrations/001_init.sql for the RLS policies
 * this session GUC interacts with.
 */
export async function withPlatformScope<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.bypass_rls', 'true', true)");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside a transaction scoped to a single merchant's RLS context —
 * used by merchant-facing endpoints (e.g. the merchant insight view) so that
 * isolation is enforced by PostgreSQL, not by an application-level `WHERE`.
 */
export async function withMerchantScope<T>(
  merchantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_merchant_id', $1, true)", [merchantId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
