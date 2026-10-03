export type AuctionStatus = "draft" | "open" | "ended" | "settled" | "cancelled";

export interface AuctionRow {
  id: string;
  merchant_id: string;
  product_external_id: string;
  title: string;
  description: string;
  starting_price: string; // numeric comes back as string from pg
  buy_now_price: string | null;
  currency: string;
  status: AuctionStatus;
  starts_at: string;
  first_bid_at: string | null;
  ends_at: string | null;
  cancelled_at: string | null;
  winner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type BidStatus = "placed" | "winning" | "outbid" | "rejected";

export interface AuctionBidRow {
  id: string;
  auction_id: string;
  user_id: string;
  amount: string;
  currency: string;
  status: BidStatus;
  created_at: string;
}

export type SettlementType = "auction_win" | "buy_now";
export type SettlementPaymentStatus = "authorized" | "declined" | "succeeded" | "failed";
export type SettlementStatus = "pending" | "completed" | "cancelled" | "refunded";

/** `auction_orders` — this is the settlement record (see migrations/003). */
export interface AuctionSettlementRow {
  id: string;
  auction_id: string;
  user_id: string;
  amount: string;
  shipping_amount: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  status: SettlementStatus;
  settlement_type: SettlementType;
  payment_status: SettlementPaymentStatus;
  winning_bid_id: string | null;
  created_at: string;
}
