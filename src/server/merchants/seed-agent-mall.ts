// Shared by scripts/seed-agent-mall.ts and the Agent Mall integration tests,
// so both drive merchants through the exact same create -> verify ->
// authorize sequence instead of two copies of this logic drifting apart.
//
// Seeds the demo merchants the Agent Mall search/compare/visit flow is
// built against, and drives each one through domain verification +
// authorization so search_products/get_product actually return offers
// (evaluatePolicy denies everything until a merchant is `authorized` with
// an active grant for the `products` scope — see src/server/policy/engine.ts).
//
// The active roster is now the two REAL merchant websites:
//   - Cadence Cycles (rest) — real catalog from github.com/syedahafsa12/bike_website,
//     served through src/app/api/demo/cadence-cycles (see src/demo-merchants/cadence-catalog.ts
//     for why this mirrors rather than live-fetches/scrapes the deployed site).
//   - Luna Apparel (rest) — real catalog from github.com/syedahafsa12/lunastore,
//     served through src/app/api/demo/luna-apparel (see src/demo-merchants/luna-catalog.ts).
//
// Northstar Running, Vertex Athletics, and Urban Services — the original 3
// placeholder/fabricated demo merchants — are retired (status 'revoked')
// rather than deleted: their tables, routes, connector config, and catalog
// data are untouched and still work, they're just no longer part of the
// active search roster. A third real merchant slot is intentionally left
// open (nothing seeded for it yet) until a real third store is chosen.
//
// Idempotent: re-running this only fills in whatever is missing for a given
// merchant (skips creation if the slug exists, skips verification/
// authorization if already authorized; a merchant already revoked is left
// revoked rather than re-revoked).
import {
  createAuthorization,
  createDomainVerification,
  createMerchant,
  getActiveAuthorization,
  getMerchantBySlug,
  markVerificationResult,
  setMerchantStatus,
} from "./repository";
import { revokeMerchant } from "./authorization";
import { NORTHSTAR_SLUG, VERTEX_SLUG, URBAN_SLUG } from "@/demo-merchants/catalog";
import { CADENCE_SLUG } from "@/demo-merchants/cadence-catalog";
import { LUNA_SLUG } from "@/demo-merchants/luna-catalog";
import type { MerchantRow } from "./types";

const READ_SCOPES = ["products", "inventory", "shipping", "returns", "warranty"] as const;
const RETIRED_PLACEHOLDER_SLUGS = [NORTHSTAR_SLUG, VERTEX_SLUG, URBAN_SLUG] as const;

export function agentMallMerchantSeeds(appBaseUrl: string) {
  return [
    {
      name: "Cadence Cycles",
      slug: CADENCE_SLUG,
      domain: "bike-website-mu.vercel.app",
      category: "Bicycles, helmets, locks, apparel & bags",
      connectorType: "rest" as const,
      connectorConfig: { baseUrl: `${appBaseUrl}/api/demo/cadence-cycles` },
    },
    {
      name: "Luna Apparel",
      slug: LUNA_SLUG,
      domain: "lunastore-wine.vercel.app",
      category: "Premium minimalist fashion (DTC)",
      connectorType: "rest" as const,
      connectorConfig: { baseUrl: `${appBaseUrl}/api/demo/luna-apparel` },
    },
  ];
}

async function retireIfActive(slug: string): Promise<void> {
  const merchant = await getMerchantBySlug(slug);
  if (!merchant || merchant.status === "revoked") return;
  await revokeMerchant(merchant.id);
}

export async function retireLegacyPlaceholderMerchants(): Promise<void> {
  for (const slug of RETIRED_PLACEHOLDER_SLUGS) {
    await retireIfActive(slug);
  }
}

export async function seedAgentMallMerchants(appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000"): Promise<MerchantRow[]> {
  await retireLegacyPlaceholderMerchants();

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
