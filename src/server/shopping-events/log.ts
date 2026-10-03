import { query } from "@/server/db/pool";

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

/** Feeds the `merchant_analytics` view (migrations/002) — every number there is a real count of these rows. */
export async function recordShoppingEvent(input: {
  sessionId?: string | null;
  userId?: string | null;
  merchantId?: string | null;
  eventType: ShoppingEventType;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `insert into shopping_events (session_id, user_id, merchant_id, event_type, payload)
     values ($1,$2,$3,$4,$5)`,
    [input.sessionId ?? null, input.userId ?? null, input.merchantId ?? null, input.eventType, JSON.stringify(input.payload ?? {})],
  );
}
