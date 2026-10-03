import { describe, expect, it, vi } from "vitest";
import { authHeader, createOwnedTestMerchant, createTestUser, forceAuctionEndsAtForTest, type TestUser } from "./db-helpers";

vi.mock("@/server/auth/session", () => {
  class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
    }
  }
  const resolve = (req: Request) => {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    return token ? { id: token, email: `${token}@test.local` } : null;
  };
  return {
    UnauthorizedError,
    getAuthenticatedUser: async (req: Request) => resolve(req),
    requireAuthenticatedUser: async (req: Request) => {
      const user = resolve(req);
      if (!user) throw new UnauthorizedError();
      return user;
    },
  };
});

const { POST: search } = await import("@/app/api/agent/search/route");
const { POST: createAuctionRoute, GET: searchAuctionsRoute } = await import("@/app/api/auctions/route");
const { GET: getAuctionRoute } = await import("@/app/api/auctions/[id]/route");
const { POST: bidRoute } = await import("@/app/api/auctions/[id]/bids/route");
const { POST: buyNowRoute } = await import("@/app/api/auctions/[id]/buy-now/route");
const { POST: resolveRoute } = await import("@/app/api/auctions/[id]/resolve/route");
const { GET: resultRoute } = await import("@/app/api/auctions/[id]/result/route");
const { POST: createApprovalRoute } = await import("@/app/api/approvals/route");
const { POST: approveRoute } = await import("@/app/api/approvals/[id]/approve/route");
const { POST: visitMerchantRoute } = await import("@/app/api/merchants/[id]/visit/route");
const { NextRequest } = await import("next/server");

function req(method: string, url: string, user: TestUser, body?: unknown) {
  return new NextRequest(url, { method, headers: authHeader(user), body: body !== undefined ? JSON.stringify(body) : undefined });
}
const BASE = "http://test.local";

async function approve(buyer: TestUser, actionType: "merchant_visit" | "auction_bid" | "buy_now", merchantId: string, payload: Record<string, unknown>) {
  const createRes = await createApprovalRoute(req("POST", `${BASE}/api/approvals`, buyer, { actionType, merchantId, payload }));
  const { approval } = await createRes.json();
  const approveRes = await approveRoute(req("POST", `${BASE}/api/approvals/${approval.id}/approve`, buyer, {}), { params: { id: approval.id } });
  return (await approveRes.json()).approval;
}

describe("end-to-end: signup -> search -> auction discovery -> merchant approval -> visit -> bid -> resolve -> settlement", () => {
  it("walks a shopper through the full bid path", async () => {
    const owner = await createTestUser("e2e-merchant-owner");
    const merchant = await createOwnedTestMerchant(owner.id);
    const createRes = await createAuctionRoute(
      req("POST", `${BASE}/api/auctions`, owner, { merchantId: merchant.id, productExternalId: "e2e-product", title: "E2E Auction", startingPrice: 200, buyNowPrice: 400 }),
    );
    const { auction } = await createRes.json();

    // 1. signup -> a real platform user
    const shopper = await createTestUser("e2e-shopper");

    // 2. search products (existing, unchanged behavior)
    const productSearch = await search(req("POST", `${BASE}/api/agent/search`, shopper, { query: "" }));
    expect(productSearch.status).toBe(200);

    // 3. find the auction
    const auctionSearch = await searchAuctionsRoute(req("GET", `${BASE}/api/auctions?merchantId=${merchant.id}`, shopper));
    const { auctions } = await auctionSearch.json();
    expect(auctions.some((a: any) => a.id === auction.id)).toBe(true);

    // 4. get the auction (compare/refine stand-in — detail view)
    const detail = await getAuctionRoute(req("GET", `${BASE}/api/auctions/${auction.id}`, shopper), { params: { id: auction.id } });
    expect((await detail.json()).auction.startingBid).toBe(200);

    // 5. request + approve merchant navigation
    const visitApproval = await approve(shopper, "merchant_visit", merchant.id, { auctionId: auction.id });
    expect(visitApproval.status).toBe("approved");

    // 6. record the unique visit (merchant page)
    const visitRes = await visitMerchantRoute(req("POST", `${BASE}/api/merchants/${merchant.id}/visit`, shopper, { approvalId: visitApproval.id }), { params: { id: merchant.id } });
    expect((await visitRes.json()).isNewUniqueVisit).toBe(true);

    // 7. the shopper chooses to bid -> request + approve the bid (amount, tax/shipping are shown to the user before this approval in the real UI)
    const bidApproval = await approve(shopper, "auction_bid", merchant.id, { auctionId: auction.id, amount: 250 });
    expect(bidApproval.status).toBe("approved");

    // 8. the bid executes only now, after approval
    const bidRes = await bidRoute(req("POST", `${BASE}/api/auctions/${auction.id}/bids`, shopper, { approvalId: bidApproval.id, amount: 250 }), { params: { id: auction.id } });
    expect(bidRes.status).toBe(201);
    const bidBody = await bidRes.json();
    expect(bidBody.auction.first_bid_at).toBeTruthy();

    // 9. the auction eventually resolves (fast-forwarded here instead of waiting 7 real days)
    await forceAuctionEndsAtForTest(auction.id, new Date(Date.now() - 1000));
    const resolveRes = await resolveRoute(req("POST", `${BASE}/api/auctions/${auction.id}/resolve`, shopper), { params: { id: auction.id } });
    const resolveBody = await resolveRes.json();
    expect(resolveBody.auction.status).toBe("settled");
    expect(resolveBody.auction.winner_user_id).toBe(shopper.id);

    // 10. settlement is real, deterministic, and demo-paid
    expect(resolveBody.settlement.payment_status).toBe("succeeded");
    expect(Number(resolveBody.settlement.amount)).toBe(250);
    expect(Number(resolveBody.settlement.total_amount)).toBe(
      Number(resolveBody.settlement.amount) + Number(resolveBody.settlement.shipping_amount) + Number(resolveBody.settlement.tax_amount),
    );

    const resultRes = await resultRoute(req("GET", `${BASE}/api/auctions/${auction.id}/result`, shopper), { params: { id: auction.id } });
    const resultBody = await resultRes.json();
    expect(resultBody.winnerUserId).toBe(shopper.id);
    expect(resultBody.settlement.id).toBe(resolveBody.settlement.id);
  }, 30_000);
});

describe("end-to-end: auction -> Buy Now -> approval -> tax/shipping -> demo payment -> settlement", () => {
  it("walks a shopper through the full Buy Now path", async () => {
    const owner = await createTestUser("e2e-buynow-owner");
    const merchant = await createOwnedTestMerchant(owner.id);
    const createRes = await createAuctionRoute(
      req("POST", `${BASE}/api/auctions`, owner, { merchantId: merchant.id, productExternalId: "e2e-product-2", title: "E2E Buy Now Auction", startingPrice: 150, buyNowPrice: 300 }),
    );
    const { auction } = await createRes.json();
    const shopper = await createTestUser("e2e-buynow-shopper");

    const visitApproval = await approve(shopper, "merchant_visit", merchant.id, { auctionId: auction.id });
    await visitMerchantRoute(req("POST", `${BASE}/api/merchants/${merchant.id}/visit`, shopper, { approvalId: visitApproval.id }), { params: { id: merchant.id } });

    const buyNowApproval = await approve(shopper, "buy_now", merchant.id, { auctionId: auction.id, buyNowPrice: 300 });
    expect(buyNowApproval.status).toBe("approved");

    const buyNowRes = await buyNowRoute(req("POST", `${BASE}/api/auctions/${auction.id}/buy-now`, shopper, { approvalId: buyNowApproval.id }), { params: { id: auction.id } });
    expect(buyNowRes.status).toBe(200);
    const body = await buyNowRes.json();
    expect(body.auction.status).toBe("settled");
    expect(body.settlement.settlement_type).toBe("buy_now");
    expect(body.settlement.payment_status).toBe("succeeded");
    expect(Number(body.settlement.amount)).toBe(300);
  });
});
