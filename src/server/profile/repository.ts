import { withUserScope } from "@/server/db/pool";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<ProfileRow | undefined> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<ProfileRow>(`select * from profiles where id = $1`, [userId]);
    return res.rows[0];
  });
}

export async function updateProfile(
  userId: string,
  input: { fullName?: string; phone?: string; address?: Record<string, unknown> },
): Promise<ProfileRow> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<ProfileRow>(
      `update profiles set
         full_name = coalesce($2, full_name),
         phone = coalesce($3, phone),
         address = coalesce($4, address),
         updated_at = now()
       where id = $1
       returning *`,
      [userId, input.fullName ?? null, input.phone ?? null, input.address ? JSON.stringify(input.address) : null],
    );
    if (!res.rows[0]) throw new Error("profile not found");
    return res.rows[0];
  });
}

export interface PaymentMethodRow {
  id: string;
  user_id: string;
  provider: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
}

const PAYMENT_METHOD_COLUMNS = "id, user_id, provider, brand, last4, exp_month, exp_year, is_default, created_at";

export async function listPaymentMethods(userId: string): Promise<PaymentMethodRow[]> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<PaymentMethodRow>(
      `select ${PAYMENT_METHOD_COLUMNS} from payment_methods where user_id = $1 order by created_at desc`,
      [userId],
    );
    return res.rows;
  });
}

/** Sandbox/tokenized reference only — the raw card number never reaches this platform. */
export async function addPaymentMethod(
  userId: string,
  input: { token: string; brand?: string; last4?: string; expMonth?: number; expYear?: number; isDefault?: boolean },
): Promise<PaymentMethodRow> {
  return withUserScope(userId, async (client) => {
    if (input.isDefault) {
      await client.query(`update payment_methods set is_default = false where user_id = $1`, [userId]);
    }
    const res = await client.query<PaymentMethodRow>(
      `insert into payment_methods (user_id, provider, token, brand, last4, exp_month, exp_year, is_default)
       values ($1, 'sandbox', $2, $3, $4, $5, $6, $7)
       returning ${PAYMENT_METHOD_COLUMNS}`,
      [userId, input.token, input.brand ?? null, input.last4 ?? null, input.expMonth ?? null, input.expYear ?? null, input.isDefault ?? false],
    );
    if (!res.rows[0]) throw new Error("failed to add payment method");
    return res.rows[0];
  });
}

export async function removePaymentMethod(userId: string, id: string): Promise<void> {
  await withUserScope(userId, async (client) => {
    await client.query(`delete from payment_methods where id = $1 and user_id = $2`, [id, userId]);
  });
}

export interface SavedWebsiteRow {
  id: string;
  user_id: string;
  merchant_id: string;
  created_at: string;
}

export async function listSavedWebsites(userId: string) {
  return withUserScope(userId, async (client) => {
    const res = await client.query(
      `select sw.id, sw.merchant_id, sw.created_at, m.name, m.slug, m.domain, m.status
       from saved_websites sw join merchants m on m.id = sw.merchant_id
       where sw.user_id = $1 order by sw.created_at desc`,
      [userId],
    );
    return res.rows;
  });
}

export async function saveWebsite(userId: string, merchantId: string): Promise<SavedWebsiteRow> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<SavedWebsiteRow>(
      `insert into saved_websites (user_id, merchant_id) values ($1, $2)
       on conflict (user_id, merchant_id) do update set user_id = excluded.user_id
       returning id, user_id, merchant_id, created_at`,
      [userId, merchantId],
    );
    if (!res.rows[0]) throw new Error("failed to save website");
    return res.rows[0];
  });
}

export async function unsaveWebsite(userId: string, id: string): Promise<void> {
  await withUserScope(userId, async (client) => {
    await client.query(`delete from saved_websites where id = $1 and user_id = $2`, [id, userId]);
  });
}
