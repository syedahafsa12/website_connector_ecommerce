-- Auctions + agentic-commerce execution boundaries, on top of the
-- "schema only, no settlement/payment logic" skeleton migrations/002 left
-- for auctions/auction_orders. This migration fills that skeleton in rather
-- than replacing it: table names, RLS policies, and the approvals/
-- shopping_events tables from 002 are reused unchanged wherever they
-- already fit (approvals.action_type already had 'auction_bid'/'buy_now';
-- orders.product_external_id already established "reference a connector's
-- own product id by string, not a FK into the unused `products` cache
-- table" — auctions follows that same convention below).
--
-- No RLS policy changes: the existing policies on auctions/auction_bids/
-- auction_orders (migrations/002) already match what this phase needs —
-- public read on auctions, bypass-only (i.e. application-authorized) writes
-- on auctions/auction_bids, and self-scoped all-access on auction_orders.

-- --------------------------------------------------------------------------
-- 1. auctions — fill in the real lifecycle, Buy Now, and the product/
--    winner references the 002 skeleton didn't have yet.
-- --------------------------------------------------------------------------

alter table auctions drop constraint auctions_status_check;
alter table auctions alter column status set default 'draft';
alter table auctions add constraint auctions_status_check
  check (status in ('draft','open','ended','settled','cancelled'));

-- `starting_price` (002) *is* the starting bid — kept as-is rather than
-- renamed; the API surface exposes it as `startingBid`.
alter table auctions add column product_external_id text not null default '';
alter table auctions alter column product_external_id drop default;
alter table auctions add column buy_now_price numeric(12,2);
alter table auctions add column first_bid_at timestamptz;
alter table auctions add column winner_user_id uuid references auth.users(id) on delete set null;
alter table auctions add column cancelled_at timestamptz;
alter table auctions add column updated_at timestamptz not null default now();

comment on column auctions.first_bid_at is
  'Set once, by the first bid that exceeds starting_price. The 7-day timer (ends_at) is computed from this, server-side, at that moment — never trust a client-supplied ends_at.';

-- --------------------------------------------------------------------------
-- 2. auction_orders — this *is* the settlement record the brief calls
--    "auction_settlements"; it already had the right shape (one row per
--    paid auction outcome), just missing the money breakdown, which
--    provider produced the payment result, and which bid (if any) won.
-- --------------------------------------------------------------------------

alter table auction_orders add column shipping_amount numeric(12,2) not null default 0;
alter table auction_orders add column tax_amount numeric(12,2) not null default 0;
alter table auction_orders add column total_amount numeric(12,2) not null default 0;
alter table auction_orders add column settlement_type text not null default 'auction_win'
  check (settlement_type in ('auction_win','buy_now'));
alter table auction_orders add column payment_status text not null default 'authorized'
  check (payment_status in ('authorized','declined','succeeded','failed'));
alter table auction_orders add column winning_bid_id uuid references auction_bids(id) on delete set null;
-- One settlement per auction, ever — this is *the* idempotency guarantee
-- for /resolve and /buy-now: both insert with `on conflict (auction_id) do
-- nothing returning *`, so a duplicate resolve/buy-now call never creates a
-- second payment; it just returns the settlement that already exists.
alter table auction_orders add constraint auction_orders_auction_id_key unique (auction_id);

-- --------------------------------------------------------------------------
-- 3. shopping_events — add the auction-specific event types the merchant-
--    safe analytics (merchant_analytics view, 002) needs to cover auctions
--    too. No new table: this is the existing event stream.
-- --------------------------------------------------------------------------

alter table shopping_events drop constraint shopping_events_event_type_check;
alter table shopping_events add constraint shopping_events_event_type_check
  check (event_type in (
    'SEARCH','PRODUCT_MATCHED','PRODUCT_EXCLUDED','PRODUCT_COMPARED','MERCHANT_SELECTED',
    'VISIT_APPROVED','MERCHANT_VISITED','PRODUCT_VIEWED','CHECKOUT_STARTED','CHECKOUT_ABANDONED',
    'PURCHASE_APPROVED','PURCHASE_COMPLETED','MERCHANT_INTERACTION',
    'AUCTION_VIEW','AUCTION_BID','AUCTION_BUY_NOW'
  ));
