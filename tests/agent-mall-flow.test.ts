import { beforeAll, describe, expect, it, vi } from "vitest";
import { authHeader, createTestUser, ensureAgentMallMerchants, type TestUser } from "./db-helpers";

// "Signup" here means a real auth.users row exists and this platform's own
// authorization boundary (@/server/auth/session) resolves a bearer token
// back to it — exactly what a real signup + login produces. Supabase Auth
// itself (issuing/verifying the JWT) is already covered by its own hosted
// tests, not re-tested here; see the PR that added signup/login/me.
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
const { POST: compare } = await import("@/app/api/agent/compare/route");
const { POST: createApproval, GET: listApprovals } = await import("@/app/api/approvals/route");
const { POST: approve } = await import("@/app/api/approvals/[id]/approve/route");
const { POST: reject } = await import("@/app/api/approvals/[id]/reject/route");
const { POST: visitMerchant } = await import("@/app/api/merchants/[id]/visit/route");
const { NextRequest } = await import("next/server");

function post(url: string, body: unknown, user: TestUser) {
  return new NextRequest(url, { method: "POST", headers: authHeader(user), body: JSON.stringify(body) });
}
function get(url: string, user: TestUser) {
  return new NextRequest(url, { headers: authHeader(user) });
}

let merchants: Awaited<ReturnType<typeof ensureAgentMallMerchants>>;

beforeAll(async () => {
  merchants = await ensureAgentMallMerchants();
}, 30_000);

describe("full flow: signup -> search -> results -> compare -> approval -> merchant visit -> unique visit", () => {
  it("walks one shopper through the whole path, then proves visits are idempotent per (package, merchant, visitor)", async () => {
    // 1. "signup" — a real platform user exists.
    const shopper = await createTestUser("flow-shopper");

    // 2. search — results come back normalized, across every authorized merchant.
    const searchRes = await search(post("http://test.local/api/agent/search", { query: "" }, shopper));
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    const sessionId = searchBody.sessionId as string;
    expect(sessionId).toBeTruthy();

    const cadence = merchants["cadence-cycles"];
    const luna = merchants["luna-apparel"];
    const cadenceOffer = searchBody.offers.find((o: any) => o.offer.merchantId === cadence.id && o.offer.productId === "bike-101");
    const lunaOffer = searchBody.offers.find((o: any) => o.offer.merchantId === luna.id && o.offer.productId === "premium-hoodie-v23");
    expect(cadenceOffer).toBeTruthy();
    expect(lunaOffer).toBeTruthy();

    // 3. compare — the two candidates side by side.
    const compareRes = await compare(
      post("http://test.local/api/agent/compare", { sessionId, items: [{ merchantId: cadence.id, productId: "bike-101" }, { merchantId: luna.id, productId: "premium-hoodie-v23" }] }, shopper),
    );
    expect(compareRes.status).toBe(200);
    const compareBody = await compareRes.json();
    expect(compareBody.comparison.every((c: any) => c.offer)).toBe(true);

    // The shopper picks Northstar. Visiting it is gated: the agent cannot
    // just navigate there on its own — it must request approval first, and
    // the merchant-visit endpoint refuses without an approved one.
    const blockedRes = await visitMerchant(post(`http://test.local/api/merchants/${cadence.id}/visit`, { approvalId: "00000000-0000-0000-0000-000000000000" }, shopper), { params: { id: cadence.id } });
    expect(blockedRes.status).toBe(403);

    // 4. approval — request, then list it back as pending.
    const approvalRes = await createApproval(post("http://test.local/api/approvals", { actionType: "merchant_visit", merchantId: cadence.id, sessionId }, shopper));
    expect(approvalRes.status).toBe(201);
    const { approval } = await approvalRes.json();
    expect(approval.status).toBe("pending");

    const listRes = await listApprovals(get("http://test.local/api/approvals?status=pending", shopper));
    const { approvals } = await listRes.json();
    expect(approvals.map((a: any) => a.id)).toContain(approval.id);

    // the agent cannot approve its own request — only the authenticated shopper's own call can, and only this one request/decide path exists.
    const approveRes = await approve(post(`http://test.local/api/approvals/${approval.id}/approve`, {}, shopper), { params: { id: approval.id } });
    expect(approveRes.status).toBe(200);
    const approved = (await approveRes.json()).approval;
    expect(approved.status).toBe("approved");

    // re-deciding an already-decided approval is refused (no double-approve, no flip to rejected after the fact)
    const reDecideRes = await reject(post(`http://test.local/api/approvals/${approval.id}/reject`, {}, shopper), { params: { id: approval.id } });
    expect(reDecideRes.status).toBe(404);

    // 5. merchant visit — now that it's approved, navigation is recorded as a unique visit.
    const firstVisitRes = await visitMerchant(post(`http://test.local/api/merchants/${cadence.id}/visit`, { approvalId: approval.id }, shopper), { params: { id: cadence.id } });
    expect(firstVisitRes.status).toBe(200);
    const firstVisit = await firstVisitRes.json();
    expect(firstVisit.isNewUniqueVisit).toBe(true);
    expect(firstVisit.visitPackage.visitsUsed).toBeGreaterThan(0);

    // 6. the same shopper "visiting" again under the same approval/package must NOT create a second unique visit.
    const secondVisitRes = await visitMerchant(post(`http://test.local/api/merchants/${cadence.id}/visit`, { approvalId: approval.id }, shopper), { params: { id: cadence.id } });
    expect(secondVisitRes.status).toBe(200);
    const secondVisit = await secondVisitRes.json();
    expect(secondVisit.isNewUniqueVisit).toBe(false);
    expect(secondVisit.visit.id).toBe(firstVisit.visit.id);
    expect(secondVisit.visitPackage.visitsUsed).toBe(firstVisit.visitPackage.visitsUsed); // unchanged — no double count

    // 7. a different shopper visiting the same merchant IS a new unique visit.
    const otherShopper = await createTestUser("flow-shopper-2");
    const otherApprovalRes = await createApproval(post("http://test.local/api/approvals", { actionType: "merchant_visit", merchantId: cadence.id }, otherShopper));
    const { approval: otherApproval } = await otherApprovalRes.json();
    await approve(post(`http://test.local/api/approvals/${otherApproval.id}/approve`, {}, otherShopper), { params: { id: otherApproval.id } });
    const otherVisitRes = await visitMerchant(post(`http://test.local/api/merchants/${cadence.id}/visit`, { approvalId: otherApproval.id }, otherShopper), { params: { id: cadence.id } });
    const otherVisit = await otherVisitRes.json();
    expect(otherVisit.isNewUniqueVisit).toBe(true);
    expect(otherVisit.visit.id).not.toBe(firstVisit.visit.id);
    expect(otherVisit.visitPackage.visitsUsed).toBe(firstVisit.visitPackage.visitsUsed + 1);
  }, 30_000);

  it("rejects a pending approval, and a rejected approval never unlocks a visit", async () => {
    const shopper = await createTestUser("flow-rejector");
    const cadence = merchants["cadence-cycles"];
    const approvalRes = await createApproval(post("http://test.local/api/approvals", { actionType: "merchant_visit", merchantId: cadence.id }, shopper));
    const { approval } = await approvalRes.json();

    const rejectRes = await reject(post(`http://test.local/api/approvals/${approval.id}/reject`, {}, shopper), { params: { id: approval.id } });
    expect((await rejectRes.json()).approval.status).toBe("rejected");

    const visitRes = await visitMerchant(post(`http://test.local/api/merchants/${cadence.id}/visit`, { approvalId: approval.id }, shopper), { params: { id: cadence.id } });
    expect(visitRes.status).toBe(403);
  });

  it("one shopper's approval can't be used to visit as another shopper, or against a different merchant", async () => {
    const owner = await createTestUser("flow-owner");
    const intruder = await createTestUser("flow-intruder");
    const cadence = merchants["cadence-cycles"];
    const luna = merchants["luna-apparel"];

    const approvalRes = await createApproval(post("http://test.local/api/approvals", { actionType: "merchant_visit", merchantId: cadence.id }, owner));
    const { approval } = await approvalRes.json();
    await approve(post(`http://test.local/api/approvals/${approval.id}/approve`, {}, owner), { params: { id: approval.id } });

    // another user can't even see it (getApproval is scoped by user_id), so the visit attempt 403s
    const asIntruder = await visitMerchant(post(`http://test.local/api/merchants/${cadence.id}/visit`, { approvalId: approval.id }, intruder), { params: { id: cadence.id } });
    expect(asIntruder.status).toBe(403);

    // the owner can't reuse their own approved merchant_visit approval against a different merchant
    const wrongMerchant = await visitMerchant(post(`http://test.local/api/merchants/${luna.id}/visit`, { approvalId: approval.id }, owner), { params: { id: luna.id } });
    expect(wrongMerchant.status).toBe(403);
  });
});
