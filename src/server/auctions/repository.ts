import type { PoolClient } from "pg";
import { query, queryOne, withPlatformScope, withUserScope } from "@/server/db/pool";
import type { AuctionBidRow, AuctionRow, AuctionSettlementRow, AuctionStatus, SettlementType } from "./types";

// Row-level writes to auctions/auction_bids are bypass-only under RLS (see
// migrations/002's auctions_platform_write/update and
// auction_bids_platform_write policies) — the same convention
// recordUniqueVisit/createMerchant already follow for platform-authorized,
// application-checked writes. Every function here that writes is called
// only after src/server/auctions/service.ts has already verified the
// caller is allowed to do this; this file does not re-derive authorization.

export interface CreateAuctionInput {
  merchantId: string;
  productExternalId: string;
  title: string;
  description?: string;
  startingPrice: number;
  buyNowPrice?: number | null;
  currency?: string;
  status?: "draft" | "open";
}

export async function createAuction(input: CreateAuctionInput): Promise<AuctionRow> {
  const row = await withPlatformScope((client) =>
    client
      .query<AuctionRow>(
        `insert into auctions (merchant_id, product_external_id, title, description, starting_price, buy_now_price, currency, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [
          input.merchantId,
          input.productExternalId,
          input.title,
          input.description ?? "",
          input.startingPrice,
          input.buyNowPrice ?? null,
          input.currency ?? "USD",
          input.status ?? "draft",
        ],
      )
      .then((r) => r.rows[0]),
  );
  if (!row) throw new Error("failed to create auction");
  return row;
}

export async function getAuctionById(id: string): Promise<AuctionRow | undefined> {
  return queryOne<AuctionRow>(`select * from auctions where id = $1`, [id]);
}


export interface AuctionSearchFilters {
  query?: string;
  merchantId?: string;
  status?: AuctionStatus;
  maxPrice?: number;
  onlyOpen?: boolean;
}

export async function searchAuctions(filters: AuctionSearchFilters): Promise<AuctionRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.query) {
    params.push(`%${filters.query}%`);
    conditions.push(`(title ilike $${params.length} or description ilike $${params.length})`);
  }
  if (filters.merchantId) {
    params.push(filters.merchantId);
    conditions.push(`merchant_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  } else if (filters.onlyOpen) {
    conditions.push(`status in ('open','draft')`);
  }
  if (filters.maxPrice !== undefined) {
    params.push(filters.maxPrice);
    conditions.push(`starting_price <= $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return query<AuctionRow>(`select * from auctions ${where} order by created_at desc`, params);
}

/** Only while mutable (see service.ts's canModifyBeforeFirstBid) — enforced by the caller, not here. */
export async function updateAuctionConfig(
  id: string,
  patch: { title?: string; description?: string; startingPrice?: number; buyNowPrice?: number | null },
): Promise<AuctionRow> {
  const row = await withPlatformScope((client) =>
    client
      .query<AuctionRow>(
        `update auctions set
           title = coalesce($2, title),
           description = coalesce($3, description),
           starting_price = coalesce($4, starting_price),
           buy_now_price = $5,
           updated_at = now()
         where id = $1
         returning *`,
        [id, patch.title ?? null, patch.description ?? null, patch.startingPrice ?? null, patch.buyNowPrice === undefined ? null : patch.buyNowPrice],
      )
      .then((r) => r.rows[0]),
  );
  if (!row) throw new Error("auction not found");
  return row;
}

/** `buy_now_price` alone is editable even after bidding starts (while still open) — a separate, narrower update than updateAuctionConfig's starting_price path. */
export async function updateBuyNowPrice(id: string, buyNowPrice: number | null): Promise<AuctionRow> {
  const row = await withPlatformScope((client) =>
    client.query<AuctionRow>(`update auctions set buy_now_price = $2, updated_at = now() where id = $1 returning *`, [id, buyNowPrice]).then((r) => r.rows[0]),
  );
  if (!row) throw new Error("auction not found");
  return row;
}

export async function cancelAuction(id: string): Promise<AuctionRow | undefined> {
  return withPlatformScope((client) =>
    client
      .query<AuctionRow>(
        `update auctions set status = 'cancelled', cancelled_at = now(), updated_at = now()
         where id = $1 and status in ('draft','open') and first_bid_at is null
         returning *`,
        [id],
      )
      .then((r) => r.rows[0]),
  );
}

export async function openAuction(id: string): Promise<AuctionRow | undefined> {
  return withPlatformScope((client) =>
    client.query<AuctionRow>(`update auctions set status = 'open', updated_at = now() where id = $1 and status = 'draft' returning *`, [id]).then((r) => r.rows[0]),
  );
}

export async function getHighestBid(auctionId: string): Promise<AuctionBidRow | undefined> {
  return queryOne<AuctionBidRow>(`select * from auction_bids where auction_id = $1 order by amount desc, created_at asc limit 1`, [auctionId]);
}

export interface PlaceBidResult {
  bid: AuctionBidRow;
  auction: AuctionRow;
}

export type BidValidator = (auction: AuctionRow, highestBidAmount: number | null) => { ok: true; isFirstBid: boolean } | { ok: false; reason: string };

/**
 * The one place a bid is ever inserted. Locks the auction row for the
 * duration of the transaction (`for update`), so two concurrent bids on the
 * same auction are strictly serialized — the second one's `validate` call
 * always sees the first one's effect, never a stale highest-bid read. This
 * is what makes "bid must exceed the current highest bid" race-free without
 * any extra locking primitives.
 */
export async function placeBidTransactional(
  auctionId: string,
  userId: string,
  amount: number,
  currency: string,
  validate: BidValidator,
): Promise<PlaceBidResult | { error: string }> {
  return withPlatformScope(async (client: PoolClient) => {
    const lockedRes = await client.query<AuctionRow>(`select * from auctions where id = $1 for update`, [auctionId]);
    const locked = lockedRes.rows[0];
    if (!locked) return { error: "Auction not found." };

    const highestRes = await client.query<{ max: string | null }>(`select max(amount) as max from auction_bids where auction_id = $1`, [auctionId]);
    const highestBidAmount = highestRes.rows[0]?.max ? Number(highestRes.rows[0].max) : null;

    const verdict = validate(locked, highestBidAmount);
    if (!verdict.ok) return { error: verdict.reason };

    let auction = locked;
    if (verdict.isFirstBid) {
      const updated = await client.query<AuctionRow>(
        `update auctions set status = 'open', first_bid_at = now(), ends_at = now() + interval '7 days', updated_at = now() where id = $1 returning *`,
        [auctionId],
      );
      auction = updated.rows[0]!;
    }

    const bidRes = await client.query<AuctionBidRow>(
      `insert into auction_bids (auction_id, user_id, amount, currency, status) values ($1,$2,$3,$4,'placed') returning *`,
      [auctionId, userId, amount, currency],
    );
    return { bid: bidRes.rows[0]!, auction };
  });
}

export async function markAuctionEnded(id: string, winnerUserId: string | null): Promise<AuctionRow | undefined> {
  return withPlatformScope((client) =>
    client
      .query<AuctionRow>(
        `update auctions set status = 'ended', winner_user_id = $2, updated_at = now() where id = $1 and status = 'open' returning *`,
        [id, winnerUserId],
      )
      .then((r) => r.rows[0]),
  );
}

export interface CreateSettlementInput {
  auctionId: string;
  userId: string;
  winningBidId: string | null;
  amount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  settlementType: SettlementType;
  paymentStatus: "authorized" | "declined" | "succeeded" | "failed";
}

/** Idempotent: a second call for the same auction returns the settlement that already exists instead of creating another one. */
export async function createSettlement(input: CreateSettlementInput): Promise<{ settlement: AuctionSettlementRow; created: boolean }> {
  return withPlatformScope(async (client) => {
    const inserted = await client.query<AuctionSettlementRow>(
      `insert into auction_orders (auction_id, user_id, amount, shipping_amount, tax_amount, total_amount, currency, status, settlement_type, payment_status, winning_bid_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (auction_id) do nothing
       returning *`,
      [
        input.auctionId,
        input.userId,
        input.amount,
        input.shippingAmount,
        input.taxAmount,
        input.totalAmount,
        input.currency,
        input.paymentStatus === "succeeded" || input.paymentStatus === "authorized" ? "completed" : "cancelled",
        input.settlementType,
        input.paymentStatus,
        input.winningBidId,
      ],
    );
    if (inserted.rows[0]) return { settlement: inserted.rows[0], created: true };

    const existing = await client.query<AuctionSettlementRow>(`select * from auction_orders where auction_id = $1`, [input.auctionId]);
    if (!existing.rows[0]) throw new Error("expected existing settlement not found");
    return { settlement: existing.rows[0], created: false };
  });
}

export async function getSettlementByAuction(auctionId: string): Promise<AuctionSettlementRow | undefined> {
  return queryOne<AuctionSettlementRow>(`select * from auction_orders where auction_id = $1`, [auctionId]);
}

/**
 * Returns the caller's own bids on this auction, plus every bid if the
 * caller owns the auction's merchant. Explicitly filtered here rather than
 * left to the `auction_bids_read` RLS policy alone — the role this app
 * connects as has BYPASSRLS (confirmed live), so that policy is a no-op for
 * this connection and an unfiltered query here would leak every bidder's
 * identity and amount to any authenticated shopper.
 */
export async function listBidsForAuctionAsUser(userId: string, auctionId: string): Promise<AuctionBidRow[]> {
  return withUserScope(userId, async (client) => {
    const res = await client.query<AuctionBidRow>(
      `select b.* from auction_bids b
       join auctions a on a.id = b.auction_id
       join merchants m on m.id = a.merchant_id
       where b.auction_id = $1 and (b.user_id = $2 or m.owner_id = $2)
       order by b.amount desc, b.created_at asc`,
      [auctionId, userId],
    );
    return res.rows;
  });
}
