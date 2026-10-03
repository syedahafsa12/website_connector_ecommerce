import { withPlatformScope } from "@/server/db/pool";

export type ShoppingEventType =
  | "SEARCH"
  | "PRODUCT_MATCHED"
  | "PRODUCT_EXCLUDED"
  | "PRODUCT_COMPARED"
  | "MERCHANT_SELECTED"
  | "VISIT_APPROVED"
  | "MERCHANT_VISITED"
  | "PRODUCT_VIEWED"
  | "CHECKOUT_STARTED"
  | "CHECKOUT_ABANDONED"
  | "PURCHASE_APPROVED"
  | "PURCHASE_COMPLETED"
  | "MERCHANT_INTERACTION"
  | "AUCTION_VIEW"
  | "AUCTION_BID"
  | "AUCTION_BUY_NOW";

/**
 * Feeds the merchant-safe shopping/auction event stream read by
 * src/server/merchants/analytics.ts. `shopping_events` is bypass-only under
 * RLS (shopping_events_platform_only, migrations/002) — this is
 * system-of-record logging done on the caller's behalf after the request
 * has already been authorized by the route, the same convention
 * recordUniqueVisit/createMerchant use, so it must run under
 * withPlatformScope rather than the unscoped `query()` (which RLS would
 * otherwise reject outside of a role with an unconditional bypass).
 */
export async function recordShoppingEvent(input: {
  sessionId?: string | null;
  userId?: string | null;
  merchantId?: string | null;
  eventType: ShoppingEventType;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await withPlatformScope((client) =>
    client.query(
      `insert into shopping_events (session_id, user_id, merchant_id, event_type, payload)
       values ($1,$2,$3,$4,$5)`,
      [input.sessionId ?? null, input.userId ?? null, input.merchantId ?? null, input.eventType, JSON.stringify(input.payload ?? {})],
    ),
  );
}
