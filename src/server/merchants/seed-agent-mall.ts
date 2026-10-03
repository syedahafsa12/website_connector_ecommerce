// Shared by scripts/seed-agent-mall.ts and the Agent Mall integration tests,
// so both drive merchants through the exact same create -> verify ->
// authorize sequence instead of two copies of this logic drifting apart.
//
// Seeds the 3 demo merchants the Agent Mall search/compare/visit flow is
// built against, and drives each one through domain verification +
// authorization so search_products/get_product actually return offers
// (evaluatePolicy denies everything until a merchant is `authorized` with
// an active grant for the `products` scope — see src/server/policy/engine.ts).
//
// Idempotent: re-running this only fills in whatever is missing for a given
// merchant (skips creation if the slug exists, skips verification/
// authorization if already authorized).
//
// Deliberately seeds only 3 of the 5 merchants scripts/seed.ts knows about:
//   - Northstar Running (rest) and Vertex Athletics (mcp) are the two
//     already-established product-catalog demo merchants.
//   - Urban Services (web) is added here as the third, to cover the web/
//     structured-data connector and a service-category catalog in the same
//     pass.
// Rogue Gear Co (adversarial-content demo) and Luna Apparel (needs an
// external standalone server running separately) are intentionally left for
// scripts/seed.ts / manual seeding — they aren't part of this "3 demo
// merchants" set.
import {
  createAuthorization,
  createDomainVerification,
  createMerchant,
  getActiveAuthorization,
  getMerchantBySlug,
  markVerificationResult,
  setMerchantStatus,
} from "./repository";
import { NORTHSTAR_SLUG, VERTEX_SLUG, URBAN_SLUG } from "@/demo-merchants/catalog";
import type { MerchantRow } from "./types";

const READ_SCOPES = ["products", "inventory", "shipping", "returns", "warranty"] as const;

export function agentMallMerchantSeeds(appBaseUrl: string) {
  return [
    {
      name: "Northstar Running",
      slug: NORTHSTAR_SLUG,
      domain: "northstar-demo.example",
      category: "Running shoes / apparel",
      connectorType: "rest" as const,
      connectorConfig: { baseUrl: `${appBaseUrl}/api/demo/merchant-a` },
    },
    {
      name: "Vertex Athletics",
      slug: VERTEX_SLUG,
      domain: "vertex-athletics-demo.example",
      category: "Running shoes / apparel",
      connectorType: "mcp" as const,
      connectorConfig: {
        command: process.env.MERCHANT_B_MCP_COMMAND ?? "npx",
        args: (process.env.MERCHANT_B_MCP_ARGS ?? "tsx,scripts/mcp-servers/merchant-b-server.ts").split(","),
      },
    },
    {
      name: "Urban Services",
      slug: URBAN_SLUG,
      domain: "urban-services-demo.example",
      category: "Running-shoe fitting & repair service",
      connectorType: "web" as const,
      connectorConfig: {
        baseUrl: appBaseUrl,
        pagePaths: ["/demo/merchant-c/services/us-001", "/demo/merchant-c/services/us-002"],
      },
    },
  ];
}

export async function seedAgentMallMerchants(appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000"): Promise<MerchantRow[]> {
  const seeded: MerchantRow[] = [];
  for (const m of agentMallMerchantSeeds(appBaseUrl)) {
    let merchant = await getMerchantBySlug(m.slug);
    if (!merchant) {
      merchant = await createMerchant(m);
    }

    const activeAuth = await getActiveAuthorization(merchant.id);
    if (!(activeAuth && merchant.status === "authorized")) {
      if (merchant.status === "pending_verification") {
        // Seed data is trusted platform data, not an unverified third-party
        // claim — so unlike the real flow (POST .../verification then a
        // DNS/well-known HTTP check), verification is recorded as already
        // satisfied rather than driving an HTTP round trip against our own
        // dev server.
        const verification = await createDomainVerification({ merchantId: merchant.id, method: "well_known_file" });
        await markVerificationResult(verification.id, true);
        await setMerchantStatus(merchant.id, "domain_verified");
      }
      if (!activeAuth) {
        await createAuthorization({ merchantId: merchant.id, scopes: [...READ_SCOPES] });
      }
      await setMerchantStatus(merchant.id, "authorized");
      merchant = (await getMerchantBySlug(m.slug))!;
    }

    seeded.push(merchant);
  }
  return seeded;
}
