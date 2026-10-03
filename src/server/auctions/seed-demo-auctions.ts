// Seeds a handful of demo auctions on real Cadence Cycles / Luna Apparel
// products (see src/demo-merchants/{cadence,luna}-catalog.ts) — no
// fabricated products, just real catalog items offered as auctions. Uses
// repo.createAuction directly (platform-authorized, like
// seedAgentMallMerchants) rather than service.createAuctionForMerchant,
// because the demo merchants have no owner_id (they're platform-seeded,
// not user-connected) — the *public* POST /api/auctions route still
// enforces real merchant ownership; this is seed-only.
import { getMerchantBySlug } from "@/server/merchants/repository";
import { createAuction, searchAuctions } from "./repository";
import { CADENCE_SLUG } from "@/demo-merchants/cadence-catalog";
import { LUNA_SLUG } from "@/demo-merchants/luna-catalog";
import type { AuctionRow } from "./types";

interface DemoAuctionSeed {
  productExternalId: string;
  title: string;
  description: string;
  startingPrice: number;
  buyNowPrice: number;
}

const CADENCE_AUCTIONS: DemoAuctionSeed[] = [
  { productExternalId: "bike-101", title: "Auction: Verdant City Cruiser", description: "Step-through steel frame city bicycle with fenders, chain guard and a rear rack.", startingPrice: 350, buyNowPrice: 480 },
  { productExternalId: "bike-104", title: "Auction: Crimson Road Racer", description: "Carbon-fork road bike with 22-speed groupset.", startingPrice: 750, buyNowPrice: 950 },
  { productExternalId: "bike-105", title: "Auction: Slate Gravel Explorer", description: "Drop-bar gravel bicycle with 40mm tyre clearance.", startingPrice: 550, buyNowPrice: 700 },
];

const LUNA_AUCTIONS: DemoAuctionSeed[] = [
  { productExternalId: "premium-hoodie-v23", title: "Auction: Premium Hoodie V23", description: "Heavy-weight organic cotton fleece hoodie with a double-lined hood.", startingPrice: 60, buyNowPrice: 95 },
  { productExternalId: "ribbed-lounge-set", title: "Auction: Ribbed Lounge Set", description: "Ribbed knit long-sleeve top and matching wide-leg knit trousers.", startingPrice: 90, buyNowPrice: 140 },
  { productExternalId: "soft-knit-cardigan", title: "Auction: Soft Knit Cardigan", description: "Fine-gauge merino cardigan with ribbed cuffs and horn-effect buttons.", startingPrice: 70, buyNowPrice: 110 },
];

async function seedForMerchant(slug: string, seeds: DemoAuctionSeed[]): Promise<AuctionRow[]> {
  const merchant = await getMerchantBySlug(slug);
  if (!merchant) throw new Error(`Seed merchant '${slug}' not found — run seed:agent-mall first.`);

  const existing = await searchAuctions({ merchantId: merchant.id });
  const existingByProduct = new Map(existing.map((a) => [a.product_external_id, a]));

  const result: AuctionRow[] = [];
  for (const seed of seeds) {
    const already = existingByProduct.get(seed.productExternalId);
    if (already) {
      result.push(already);
      continue;
    }
    const auction = await createAuction({
      merchantId: merchant.id,
      productExternalId: seed.productExternalId,
      title: seed.title,
      description: seed.description,
      startingPrice: seed.startingPrice,
      buyNowPrice: seed.buyNowPrice,
      currency: "USD",
      status: "open",
    });
    result.push(auction);
  }
  return result;
}

export async function seedDemoAuctions(): Promise<AuctionRow[]> {
  const cadence = await seedForMerchant(CADENCE_SLUG, CADENCE_AUCTIONS);
  const luna = await seedForMerchant(LUNA_SLUG, LUNA_AUCTIONS);
  return [...cadence, ...luna];
}
