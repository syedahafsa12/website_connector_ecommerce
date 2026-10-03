import { beforeAll, describe, expect, it, vi } from "vitest";
import { ensureAgentMallMerchants, authHeader, createTestUser, type TestUser } from "./db-helpers";

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

// Imported after the mock so the route modules pick up the mocked auth session.
const { POST: search } = await import("@/app/api/agent/search/route");
const { GET: getProduct } = await import("@/app/api/agent/products/[merchantId]/[productId]/route");
const { POST: compare } = await import("@/app/api/agent/compare/route");
const { NextRequest } = await import("next/server");

let merchants: Awaited<ReturnType<typeof ensureAgentMallMerchants>>;
let shopper: TestUser;

beforeAll(async () => {
  // The REST and web connectors fetch from APP_BASE_URL over real HTTP —
  // `next start` (or `next dev`) must already be running there for this
  // test file to pass. See tests/README.md.
  merchants = await ensureAgentMallMerchants();
  shopper = await createTestUser("products");
}, 30_000);

function postJson(url: string, body: unknown, user: TestUser) {
  return new NextRequest(url, { method: "POST", headers: authHeader(user), body: JSON.stringify(body) });
}

describe("POST /api/agent/search — normalized cross-merchant search", () => {
  it("rejects an unauthenticated request", async () => {
    const req = new NextRequest("http://test.local/api/agent/search", { method: "POST", body: JSON.stringify({ query: "" }) });
    const res = await search(req);
    expect(res.status).toBe(401);
  });

  it("fans out to every authorized merchant and returns normalized offers", async () => {
    const res = await search(postJson("http://test.local/api/agent/search", { query: "" }, shopper));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeTruthy();

    const bySlugOfferCount = new Map(body.merchants.map((m: any) => [m.merchantId, m.offers.length]));
    expect(bySlugOfferCount.get(merchants["northstar-running"].id)).toBeGreaterThan(0);
    expect(bySlugOfferCount.get(merchants["vertex-athletics"].id)).toBeGreaterThan(0);
    expect(bySlugOfferCount.get(merchants["urban-services"].id)).toBeGreaterThan(0);

    // every offer is in the normalized shape the frontend is told to expect
    for (const entry of body.offers) {
      const offer = entry.offer;
      expect(offer).toMatchObject({
        merchantId: expect.any(String),
        merchantName: expect.any(String),
        productId: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        image: expect.stringContaining("http"),
        price: { amount: expect.any(Number), currency: expect.any(String) },
        attributes: expect.any(Object),
        availability: { inStock: expect.any(Boolean) },
        shipping: expect.any(Object),
        warranty: expect.any(Object),
      });
      expect(["number", "null"]).toContain(offer.availability.quantity === null ? "null" : typeof offer.availability.quantity);
      expect(["selected", "rejected"]).toContain(entry.verdict);
    }
  });

  it("deterministically filters by price (no LLM round trip needed)", async () => {
    // Blank query = "browse every catalog"; maxPrice is passed as a structured
    // filter rather than folded into connector-level keyword search, since
    // the demo REST/MCP connectors match `query` against product titles
    // verbatim and would otherwise return nothing for a full sentence.
    const res = await search(postJson("http://test.local/api/agent/search", { query: "", filters: { maxPrice: 140 } }, shopper));
    expect(res.status).toBe(200);
    const body = await res.json();
    const selected = body.offers.filter((o: any) => o.verdict === "selected");
    expect(selected.every((o: any) => o.offer.price.amount <= 140)).toBe(true);
    const rejectedOverBudget = body.offers.find((o: any) => o.offer.price.amount > 140);
    expect(rejectedOverBudget.verdict).toBe("rejected");
    expect(rejectedOverBudget.reasons.join(" ")).toMatch(/exceeds/);
  });
});

describe("GET /api/agent/products/[merchantId]/[productId]", () => {
  it("fetches one normalized product live from its merchant", async () => {
    const northstar = merchants["northstar-running"];
    const req = new NextRequest(`http://test.local/api/agent/products/${northstar.id}/np-001`, { headers: authHeader(shopper) });
    const res = await getProduct(req, { params: { merchantId: northstar.id, productId: "np-001" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offer).toMatchObject({ merchantId: northstar.id, productId: "np-001", title: "Northstar Pulse Runner" });
    expect(body.offer.image).toMatch(/^https?:\/\//);
  });

  it("reports an error (not a thrown exception) for an unknown product", async () => {
    const northstar = merchants["northstar-running"];
    const req = new NextRequest(`http://test.local/api/agent/products/${northstar.id}/does-not-exist`, { headers: authHeader(shopper) });
    const res = await getProduct(req, { params: { merchantId: northstar.id, productId: "does-not-exist" } });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/agent/compare", () => {
  it("builds a side-by-side from live per-merchant data across connector types", async () => {
    const northstar = merchants["northstar-running"];
    const vertex = merchants["vertex-athletics"];
    const urban = merchants["urban-services"];
    const res = await compare(
      postJson(
        "http://test.local/api/agent/compare",
        { items: [{ merchantId: northstar.id, productId: "np-001" }, { merchantId: vertex.id, productId: "va-001" }, { merchantId: urban.id, productId: "us-001" }] },
        shopper,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comparison).toHaveLength(3);
    expect(body.comparison.every((c: any) => !c.error && c.offer)).toBe(true);
    expect(body.comparison.map((c: any) => c.offer.source)).toEqual(["rest", "mcp", "web"]);
  });

  it("reports a bad ref's error without failing the whole comparison", async () => {
    const northstar = merchants["northstar-running"];
    const res = await compare(
      postJson(
        "http://test.local/api/agent/compare",
        { items: [{ merchantId: northstar.id, productId: "np-001" }, { merchantId: northstar.id, productId: "no-such-product" }] },
        shopper,
      ),
    );
    const body = await res.json();
    expect(body.comparison[0].offer).toBeTruthy();
    expect(body.comparison[1].error).toBeTruthy();
  });
});
