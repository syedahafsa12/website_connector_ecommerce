import { getMerchantById } from "@/server/merchants/repository";
import { getPaymentProvider } from "@/server/payments/provider";
import { estimateTotal } from "@/server/tax/provider";
import { recordShoppingEvent } from "@/server/shopping-events/log";
import { withPlatformScope } from "@/server/db/pool";
import * as repo from "./repository";
import type { AuctionBidRow, AuctionRow, AuctionSettlementRow } from "./types";

export class AuctionAuthorizationError extends Error {}
export class AuctionValidationError extends Error {}
export class AuctionNotFoundError extends Error {
  constructor() {
    super("Auction not found.");
  }
}

async function requireAuction(id: string): Promise<AuctionRow> {
  const auction = await repo.getAuctionById(id);
  if (!auction) throw new AuctionNotFoundError();
  return auction;
}

/** Never trusts a client-supplied merchant_id — the caller must actually own the merchant row. */
async function assertOwnsMerchant(userId: string, merchantId: string): Promise<void> {
  const merchant = await getMerchantById(merchantId);
  if (!merchant || merchant.owner_id !== userId) {
    throw new AuctionAuthorizationError("You do not own this merchant.");
  }
}

async function assertOwnsAuctionMerchant(userId: string, auction: AuctionRow): Promise<void> {
  await assertOwnsMerchant(userId, auction.merchant_id);
}

/** "Before the first valid bid" — the one rule that gates starting-bid changes and cancellation, for both 'draft' and 'open' (not-yet-bid-on) auctions. */
function canModifyBeforeFirstBid(auction: AuctionRow): boolean {
  return auction.first_bid_at === null && (auction.status === "draft" || auction.status === "open");
}

function isLive(auction: AuctionRow): boolean {
  return auction.status === "draft" || auction.status === "open";
}

export async function createAuctionForMerchant(
  userId: string,
  input: { merchantId: string; productExternalId: string; title: string; description?: string; startingPrice: number; buyNowPrice?: number | null; currency?: string; draft?: boolean },
): Promise<AuctionRow> {
  await assertOwnsMerchant(userId, input.merchantId);
  if (input.startingPrice <= 0) throw new AuctionValidationError("startingPrice must be positive.");
  if (input.buyNowPrice != null && input.buyNowPrice <= input.startingPrice) {
    throw new AuctionValidationError("buyNowPrice must be greater than startingPrice.");
  }
  return repo.createAuction({
    merchantId: input.merchantId,
    productExternalId: input.productExternalId,
    title: input.title,
    description: input.description,
    startingPrice: input.startingPrice,
    buyNowPrice: input.buyNowPrice,
    currency: input.currency,
    status: input.draft ? "draft" : "open",
  });
}

export async function updateAuctionAsMerchant(
  userId: string,
  auctionId: string,
  patch: { title?: string; description?: string; startingPrice?: number; buyNowPrice?: number | null; status?: "open" },
): Promise<AuctionRow> {
  const auction = await requireAuction(auctionId);
  await assertOwnsAuctionMerchant(userId, auction);

  if (patch.status === "open" && auction.status === "draft") {
    const opened = await repo.openAuction(auctionId);
    if (opened) return opened;
  }

  const touchesStartingBid = patch.title !== undefined || patch.description !== undefined || patch.startingPrice !== undefined;
  if (touchesStartingBid) {
    if (!canModifyBeforeFirstBid(auction)) {
      throw new AuctionValidationError("Cannot change title/description/startingPrice after the first bid has been placed.");
    }
    if (patch.startingPrice !== undefined && patch.startingPrice <= 0) throw new AuctionValidationError("startingPrice must be positive.");
    return repo.updateAuctionConfig(auctionId, patch);
  }

  if (patch.buyNowPrice !== undefined) {
    // Buy Now stays editable after bidding starts — only locked once a Buy Now has actually been accepted (auction no longer "live").
    if (!isLive(auction)) throw new AuctionValidationError("Cannot change buyNowPrice once the auction has ended.");
    const floor = Math.max(Number(auction.starting_price), await getCurrentHighestBidAmount(auctionId) ?? 0);
    if (patch.buyNowPrice !== null && patch.buyNowPrice <= floor) {
      throw new AuctionValidationError("buyNowPrice must be greater than the starting price and the current highest bid.");
    }
    return repo.updateBuyNowPrice(auctionId, patch.buyNowPrice);
  }

  return auction;
}

export async function cancelAuctionAsMerchant(userId: string, auctionId: string): Promise<AuctionRow> {
  const auction = await requireAuction(auctionId);
  await assertOwnsAuctionMerchant(userId, auction);
  if (!canModifyBeforeFirstBid(auction)) {
    throw new AuctionValidationError("Cannot cancel an auction that already has a bid.");
  }
  const cancelled = await repo.cancelAuction(auctionId);
  if (!cancelled) throw new AuctionValidationError("Auction could not be cancelled (already has a bid, or already ended).");
  return cancelled;
}

async function getCurrentHighestBidAmount(auctionId: string): Promise<number | null> {
  const highest = await repo.getHighestBid(auctionId);
  return highest ? Number(highest.amount) : null;
}

export interface PlaceBidOutcome {
  bid: AuctionBidRow;
  auction: AuctionRow;
}

/**
 * Deterministic, server-owned bid placement. The caller (the API route)
 * must have already confirmed this specific bid was approved — this
 * function is the EXECUTION step of intelligence -> policy -> execution,
 * not the policy decision itself, but it still re-verifies everything a
 * stale/forged approval could never guarantee (current price, auction
 * state, merchant identity) because those can change between approval and
 * execution and must never be trusted from the client.
 */
export async function placeBid(userId: string, auctionId: string, amount: number, currency?: string): Promise<PlaceBidOutcome> {
  if (!(amount > 0)) throw new AuctionValidationError("Bid amount must be positive.");

  // Pre-flight checks that don't need the row lock (merchant identity never changes mid-auction).
  const preAuction = await requireAuction(auctionId);
  const merchant = await getMerchantById(preAuction.merchant_id);
  if (merchant?.owner_id === userId) throw new AuctionAuthorizationError("A merchant cannot bid on its own auction.");
  if (currency && currency !== preAuction.currency) throw new AuctionValidationError(`Currency must be ${preAuction.currency}.`);

  const result = await repo.placeBidTransactional(auctionId, userId, amount, currency ?? preAuction.currency, (auction, highestBidAmount) => {
    if (!isLive(auction)) return { ok: false, reason: "Auction is not open for bidding." };
    if (auction.ends_at && new Date(auction.ends_at).getTime() <= Date.now()) return { ok: false, reason: "Auction has expired." };
    const floor = highestBidAmount ?? Number(auction.starting_price);
    if (!(amount > floor)) {
      return { ok: false, reason: highestBidAmount === null ? "Bid must exceed the starting price." : "Bid must exceed the current highest bid." };
    }
    return { ok: true, isFirstBid: highestBidAmount === null };
  });

  if ("error" in result) throw new AuctionValidationError(result.error);

  await recordShoppingEvent({ userId, merchantId: preAuction.merchant_id, eventType: "AUCTION_BID", payload: { auctionId, amount } });
  return result;
}

/**
 * Deterministic resolution: the backend decides the winner from persisted
 * bids, never from a frontend timer. Idempotent — resolving an
 * already-ended auction just returns its current state. Restricted to
 * someone with actual standing on this auction (the merchant that owns it,
 * or a bidder on it) — resolution can't change the deterministic outcome,
 * but it's not a public action either.
 */
export async function resolveAuctionIfDue(userId: string, auctionId: string): Promise<{ auction: AuctionRow; settlement: AuctionSettlementRow | null }> {
  const auction = await requireAuction(auctionId);
  const merchant = await getMerchantById(auction.merchant_id);
  const bids = await repo.listBidsForAuctionAsUser(userId, auctionId);
  const hasStanding = merchant?.owner_id === userId || bids.some((b) => b.user_id === userId);
  if (!hasStanding) throw new AuctionAuthorizationError("You have no standing on this auction.");

  if (auction.status === "ended" || auction.status === "settled") {
    const settlement = await repo.getSettlementByAuction(auctionId);
    return { auction, settlement: settlement ?? null };
  }
  if (auction.status !== "open") {
    return { auction, settlement: null };
  }

  // No bid has ever landed, so there is no timer (ends_at is null) — the
  // only standing caller possible here is the merchant owner (a bidder
  // can't have standing with zero bids), and their resolve call is a
  // deterministic, explicit "close this out with no winner" — the only way
  // a never-bid auction can ever leave 'open'.
  if (auction.first_bid_at === null) {
    const ended = await repo.markAuctionEnded(auctionId, null);
    return { auction: ended ?? auction, settlement: null };
  }

  const isExpired = auction.ends_at !== null && new Date(auction.ends_at).getTime() <= Date.now();
  if (!isExpired) {
    return { auction, settlement: null };
  }

  const highest = await repo.getHighestBid(auctionId);
  if (!highest) {
    const ended = await repo.markAuctionEnded(auctionId, null);
    return { auction: ended ?? auction, settlement: null };
  }

  const ended = await repo.markAuctionEnded(auctionId, highest.user_id);
  if (!ended) {
    // Someone else resolved it concurrently — return whatever is there now (idempotent).
    const current = await requireAuction(auctionId);
    const settlement = await repo.getSettlementByAuction(auctionId);
    return { auction: current, settlement: settlement ?? null };
  }

  const settlement = await settleAuction(ended, highest.user_id, Number(highest.amount), highest.id, "auction_win");
  await recordShoppingEvent({ userId: highest.user_id, merchantId: ended.merchant_id, eventType: "AUCTION_BID", payload: { auctionId, resolved: true, won: true } });
  return { auction: settlement.auction, settlement: settlement.settlement };
}

export interface BuyNowOutcome {
  auction: AuctionRow;
  settlement: AuctionSettlementRow;
}

export async function buyNow(userId: string, auctionId: string): Promise<BuyNowOutcome> {
  const auction = await requireAuction(auctionId);
  const merchant = await getMerchantById(auction.merchant_id);
  if (merchant?.owner_id === userId) throw new AuctionAuthorizationError("A merchant cannot Buy Now its own auction.");
  if (auction.buy_now_price === null) throw new AuctionValidationError("This auction has no Buy Now price.");
  if (!isLive(auction)) {
    // Already ended (by someone else, or by this same caller retrying) — idempotent read-back.
    const settlement = await repo.getSettlementByAuction(auctionId);
    if (settlement && settlement.user_id === userId && settlement.settlement_type === "buy_now") {
      return { auction, settlement };
    }
    throw new AuctionValidationError("Auction has already ended.");
  }

  const ended = await repo.markAuctionEnded(auctionId, userId);
  if (!ended) {
    // Lost the race to another Buy Now / resolution — report whatever actually happened.
    const current = await requireAuction(auctionId);
    const settlement = await repo.getSettlementByAuction(auctionId);
    if (settlement && settlement.user_id === userId && settlement.settlement_type === "buy_now") {
      return { auction: current, settlement };
    }
    throw new AuctionValidationError("Auction has already ended.");
  }

  const result = await settleAuction(ended, userId, Number(auction.buy_now_price), null, "buy_now");
  await recordShoppingEvent({ userId, merchantId: auction.merchant_id, eventType: "AUCTION_BUY_NOW", payload: { auctionId, amount: auction.buy_now_price } });
  return result;
}

/** Shared by resolve (auction_win) and buyNow (buy_now): price breakdown -> demo payment charge -> idempotent settlement row -> 'settled' status. */
async function settleAuction(
  endedAuction: AuctionRow,
  buyerId: string,
  amount: number,
  winningBidId: string | null,
  settlementType: "auction_win" | "buy_now",
): Promise<{ auction: AuctionRow; settlement: AuctionSettlementRow }> {
  const breakdown = await estimateTotal({ amount, currency: endedAuction.currency, merchantId: endedAuction.merchant_id });
  const payment = await getPaymentProvider().charge({
    idempotencyKey: `auction:${endedAuction.id}`,
    amount: breakdown.total,
    currency: endedAuction.currency,
  });
  const paymentStatus = payment.status === "AUTHORIZED" || payment.status === "SUCCEEDED" ? "succeeded" : "declined";

  const { settlement } = await repo.createSettlement({
    auctionId: endedAuction.id,
    userId: buyerId,
    winningBidId,
    amount,
    shippingAmount: breakdown.shipping.amount,
    taxAmount: breakdown.tax.amount,
    totalAmount: breakdown.total,
    currency: endedAuction.currency,
    settlementType,
    paymentStatus,
  });

  // 'settled' means payment succeeded; a declined demo payment leaves the
  // auction 'ended' with a settlement row that honestly records the decline
  // — the auction is still over (no further bids), it just didn't get paid.
  if (paymentStatus !== "succeeded") return { auction: endedAuction, settlement };
  const finalized = await markSettled(endedAuction.id);
  return { auction: finalized ?? endedAuction, settlement };
}

async function markSettled(auctionId: string): Promise<AuctionRow | undefined> {
  return withPlatformScope((client) =>
    client.query<AuctionRow>(`update auctions set status = 'settled', updated_at = now() where id = $1 and status = 'ended' returning *`, [auctionId]).then((r) => r.rows[0]),
  );
}

export { searchAuctions, getAuctionById, getHighestBid, listBidsForAuctionAsUser, getSettlementByAuction } from "./repository";
