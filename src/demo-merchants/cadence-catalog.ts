// Cadence Cycles' real catalog — ported verbatim from its own repository
// (github.com/syedahafsa12/bike_website, src/data/store.ts), which is the
// real data backing https://bike-website-mu.vercel.app/. That site is a
// Next.js storefront with no JSON API and no schema.org/JSON-LD markup on
// its product pages (confirmed by reading its page components) — nothing
// machine-readable is actually served, so neither RestMerchantConnector nor
// the existing WebMerchantConnector (which specifically looks for
// `<script type="application/ld+json">`) can extract anything from the live
// pages as they stand. We port the real product/policy data instead of
// inventing a new catalog, and serve it through the same REST adapter
// pattern every other demo merchant here already uses.
//
// This is a point-in-time copy, not a live fetch or scrape: this sandbox's
// network policy currently blocks reaching bike-website-mu.vercel.app at
// all (see the PR description). Live-scraping its rendered HTML would also
// need a new parsing strategy added to the web connector (no JSON-LD to
// reuse) — a real follow-up, but out of scope for "don't rebuild the
// connector system."
import type { CatalogItem } from "./catalog";

export const CADENCE_SLUG = "cadence-cycles";

interface CadenceProduct {
  id: string;
  name: string;
  category: "bicycle" | "helmet" | "lock" | "apparel" | "bag";
  color: string;
  price: number;
  stock: number;
  description: string;
}

// Real data, from src/data/store.ts in the bike_website repo.
const CADENCE_PRODUCTS: CadenceProduct[] = [
  { id: "bike-101", name: "Verdant City Cruiser", category: "bicycle", color: "green", price: 429, stock: 6, description: "Step-through steel frame city bicycle with fenders, chain guard and a rear rack." },
  { id: "bike-102", name: "Mint Commuter 7-Speed", category: "bicycle", color: "green", price: 389, stock: 0, description: "Lightweight aluminium commuter with 7-speed gearing and disc brakes." },
  { id: "bike-103", name: "Emerald Trail Hardtail", category: "bicycle", color: "green", price: 349, stock: 3, description: "Entry-level hardtail trail bike. Great value for new riders." },
  { id: "bike-104", name: "Crimson Road Racer", category: "bicycle", color: "red", price: 899, stock: 2, description: "Carbon-fork road bike with 22-speed groupset." },
  { id: "bike-105", name: "Slate Gravel Explorer", category: "bicycle", color: "grey", price: 649, stock: 4, description: "Drop-bar gravel bicycle with 40mm tyre clearance." },
  { id: "helm-201", name: "Apex Commuter Helmet", category: "helmet", color: "blue", price: 59, stock: 25, description: "MIPS-equipped commuter helmet with rear light." },
  { id: "lock-301", name: "Steel U-Lock", category: "lock", color: "black", price: 39, stock: 40, description: "16mm hardened steel U-lock with two keys." },
  { id: "wear-501", name: "Organic Cotton Cycling Cap", category: "apparel", color: "white", price: 24, stock: 30, description: "Breathable cycling cap made from 100% organic cotton." },
  { id: "wear-502", name: "Organic Cotton Commuter Tee", category: "apparel", color: "green", price: 45, stock: 0, description: "Everyday tee made from GOTS-certified organic cotton." },
  { id: "bag-401", name: "Waterproof Pannier Pair", category: "bag", color: "black", price: 79, stock: 11, description: "Roll-top waterproof panniers, 20L each." },
];

// Real policy text, from src/data/store.ts's POLICIES export:
//   returns:  "30-day returns on unused bicycles in original packaging. Accessories: 14 days."
//   shipping: "Free standard shipping over $100, otherwise a flat $12. Bicycles ship fully assembled within 3 business days."
//   warranty: "Frames carry a 5-year warranty. Components carry a 1-year warranty."
// These are prose, not a structured API — the fields below are our best
// faithful structuring of that real text, not new facts. Where the real
// text doesn't name a category (e.g. it never says returns are free of
// charge, or whether apparel carries any warranty), we keep the exact
// wording in `notes` rather than asserting something it doesn't say.
function toCadenceCatalogItem(p: CadenceProduct): CatalogItem {
  const isFree = p.price >= 100;
  const isBicycle = p.category === "bicycle";
  return {
    productId: p.id,
    title: p.name,
    description: p.description,
    category: "product",
    price: p.price,
    currency: "USD",
    color: p.color,
    quantity: p.stock,
    shipping: {
      isFree,
      cost: isFree ? null : 12,
      estimatedDays: isBicycle ? 3 : null,
      available: true,
    },
    returns: {
      windowDays: isBicycle ? 30 : 14,
      isFreeReturns: false, // the real policy never states return shipping is free
      notes: isBicycle
        ? "30-day returns on unused bicycles in original packaging."
        : "Accessories: 14-day returns.",
    },
    warranty:
      isBicycle
        ? { months: 60, notes: "Frame: 5-year warranty. Components: 1-year warranty." }
        : p.category === "apparel"
          ? { months: null, notes: "Not explicitly covered by Cadence Cycles' frame/component warranty policy." }
          : { months: 12, notes: "Components carry a 1-year warranty." },
  };
}

export const CADENCE_CATALOG: CatalogItem[] = CADENCE_PRODUCTS.map(toCadenceCatalogItem);
