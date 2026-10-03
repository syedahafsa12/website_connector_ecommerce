import { withPlatformScope } from "@/server/db/pool";
import { getMerchantInsights } from "@/server/insight/service";

export interface CriterionCount {
  criterion: string;
  count: number;
}

export interface MerchantAnalytics {
  searches: number;
  productViews: number;
  productsMatched: number;
  productsExcluded: number;
  productsCompared: number;
  uniqueVisits: number;
  merchantInteractions: number;
  auctionViews: number;
  auctionBids: number;
  auctionBuyNows: number;
  checkoutsStarted: number;
  checkoutsAbandoned: number;
  topRequestedCriteria: CriterionCount[];
  exclusions: CriterionCount[];
}

interface EventCountsRow {
  products_matched: string;
  products_excluded: string;
  products_compared: string;
  product_views: string;
  merchant_interactions: string;
  auction_views: string;
  auction_bids: string;
  auction_buy_nows: string;
  checkouts_started: string;
  checkouts_abandoned: string;
  searches: string;
}

/**
 * This platform's own criteria, flattened to plain labels — never the
 * identity of a competing merchant, auction, or website. `requirements` is
 * the deterministic filter object from offers/matcher.ts (parseRequirements
 * + the structured `filters` a search call can pass), already recorded per
 * (merchant, offer) in merchant_insights — nothing here reaches across to
 * another merchant's rows (merchant_insights_isolation RLS already scopes
 * that; see insight/service.ts).
 */
function extractCriteria(requirements: Record<string, unknown>): string[] {
  const labels: string[] = [];
  if (typeof requirements.color === "string") labels.push(requirements.color);
  if (typeof requirements.maxPrice === "number") labels.push(`maxPrice<=${requirements.maxPrice}`);
  if (requirements.freeShippingOnly === true) labels.push("freeShipping");
  if (typeof requirements.minReturnDays === "number") labels.push(`minReturnDays>=${requirements.minReturnDays}`);
  return labels;
}

function topN(counts: Map<string, number>, n = 10): CriterionCount[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([criterion, count]) => ({ criterion, count }));
}

/**
 * Merchant-scoped shopping/auction intelligence, built entirely from this
 * platform's own event stream (shopping_events) and per-merchant insight
 * log (merchant_insights) — never from another merchant's rows. The caller
 * (the route) must already have verified the requester owns `merchantId`;
 * this function itself also always filters explicitly by merchant_id
 * rather than relying solely on RLS, since shopping_events' RLS policy is
 * bypass-only (no per-merchant SELECT policy exists for it to lean on).
 */
export async function getMerchantAnalytics(merchantId: string): Promise<MerchantAnalytics> {
  const counts = await withPlatformScope((client) =>
    client
      .query<EventCountsRow>(
        `select
           count(*) filter (where event_type = 'PRODUCT_MATCHED') as products_matched,
           count(*) filter (where event_type = 'PRODUCT_EXCLUDED') as products_excluded,
           count(*) filter (where event_type = 'PRODUCT_COMPARED') as products_compared,
           count(*) filter (where event_type = 'PRODUCT_VIEWED') as product_views,
           count(*) filter (where event_type = 'MERCHANT_INTERACTION') as merchant_interactions,
           count(*) filter (where event_type = 'AUCTION_VIEW') as auction_views,
           count(*) filter (where event_type = 'AUCTION_BID') as auction_bids,
           count(*) filter (where event_type = 'AUCTION_BUY_NOW') as auction_buy_nows,
           count(*) filter (where event_type = 'CHECKOUT_STARTED') as checkouts_started,
           count(*) filter (where event_type = 'CHECKOUT_ABANDONED') as checkouts_abandoned,
           count(distinct session_id) filter (where event_type in ('PRODUCT_MATCHED','PRODUCT_EXCLUDED')) as searches
         from shopping_events
         where merchant_id = $1`,
        [merchantId],
      )
      .then((r) => r.rows[0]),
  );

  const uniqueVisitsRes = await withPlatformScope((client) =>
    client.query<{ count: string }>(`select count(*) from unique_visits where merchant_id = $1`, [merchantId]),
  );

  const insights = await getMerchantInsights(merchantId);
  const requested = new Map<string, number>();
  const excluded = new Map<string, number>();
  for (const row of insights as Array<{ requirements: Record<string, unknown>; decision: "selected" | "rejected" }>) {
    for (const criterion of extractCriteria(row.requirements ?? {})) {
      requested.set(criterion, (requested.get(criterion) ?? 0) + 1);
      if (row.decision === "rejected") excluded.set(criterion, (excluded.get(criterion) ?? 0) + 1);
    }
  }

  return {
    searches: Number(counts?.searches ?? 0),
    productViews: Number(counts?.product_views ?? 0),
    productsMatched: Number(counts?.products_matched ?? 0),
    productsExcluded: Number(counts?.products_excluded ?? 0),
    productsCompared: Number(counts?.products_compared ?? 0),
    uniqueVisits: Number(uniqueVisitsRes.rows[0]?.count ?? 0),
    merchantInteractions: Number(counts?.merchant_interactions ?? 0),
    auctionViews: Number(counts?.auction_views ?? 0),
    auctionBids: Number(counts?.auction_bids ?? 0),
    auctionBuyNows: Number(counts?.auction_buy_nows ?? 0),
    checkoutsStarted: Number(counts?.checkouts_started ?? 0),
    checkoutsAbandoned: Number(counts?.checkouts_abandoned ?? 0),
    topRequestedCriteria: topN(requested),
    exclusions: topN(excluded),
  };
}
