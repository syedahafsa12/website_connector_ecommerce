// Luna Apparel's real catalog — ported verbatim from its own repository
// (github.com/syedahafsa12/lunastore, data/products.json + data/policies.json),
// which is the real data backing https://lunastore-wine.vercel.app/. That
// site is a static deployment (no package.json/vercel.json, no serverless
// entry point for its own server.js), so its dynamic `/api/agent/*` adapter
// described in that repo's server.js never actually runs on Vercel — we
// port the same transform it defines (agentProductWire/publicProduct) here
// instead, so the real product facts still reach the platform through the
// existing RestMerchantConnector contract untouched.
//
// This is a point-in-time copy, not a live fetch: this sandbox's network
// policy currently blocks reaching lunastore-wine.vercel.app at all (see the
// PR description). Once that's allowlisted, swapping NEXT_PUBLIC_LUNA_URL
// (or this whole module) for a live `fetch` of /data/products.json is a
// small, isolated change — it doesn't touch any connector code.
import type { CatalogItem } from "./catalog";

export const LUNA_SLUG = "luna-apparel";
// NEXT_PUBLIC_LUNA_URL is the canonical "where is the real Luna site"
// setting elsewhere in this deployment — reused here only to build real
// product photo URLs (the data itself is the ported catalog below, not a
// live fetch from this URL).
const LUNA_SITE_BASE_URL = process.env.NEXT_PUBLIC_LUNA_URL ?? "https://lunastore-wine.vercel.app";

interface LunaColor {
  name: string;
  hex: string;
  image: string;
}
interface LunaProduct {
  id: string;
  name: string;
  price: number;
  description: string;
  material: string;
  category: string;
  tags: string[];
  sizes: string[];
  colors: LunaColor[];
  featured: boolean;
  quantity: number;
  availability: boolean;
}

// Real data, from data/products.json in the lunastore repo.
const LUNA_PRODUCTS: LunaProduct[] = [
  { id: "premium-hoodie-v23", name: "Premium Hoodie V23", price: 88, description: "Designed for everyday luxury. Crafted from heavy-weight organic cotton fleece with a double-lined hood, relaxed shoulders, and a clean, structured silhouette. Features seamless side pockets and ribbed trims.", material: "100% Organic Cotton Fleece (450 GSM)", category: "outerwear", tags: ["hoodie", "outerwear", "organic cotton", "bestseller"], sizes: ["XS", "S", "M", "L", "XL"], colors: [{ name: "Oatmeal Beige", hex: "#E6DFD3", image: "assets/hoodie-beige.png" }, { name: "Charcoal Grey", hex: "#4A4B4D", image: "assets/hoodie-charcoal.png" }], featured: true, quantity: 34, availability: true },
  { id: "essential-hoodie", name: "Essential Hoodie", price: 68, description: "A medium-weight French terry hoodie designed for layered comfort. Features a classic tailored fit, traditional kangaroo pocket, and durable flatlock seams. Pre-washed for maximum softness.", material: "80% Organic Cotton, 20% Recycled Polyester French Terry (320 GSM)", category: "outerwear", tags: ["hoodie", "outerwear", "everyday", "layering"], sizes: ["XS", "S", "M", "L", "XL"], colors: [{ name: "Charcoal Grey", hex: "#4A4B4D", image: "assets/hoodie-charcoal.png" }, { name: "Oatmeal Beige", hex: "#E6DFD3", image: "assets/hoodie-beige.png" }], featured: false, quantity: 51, availability: true },
  { id: "organic-linen-shirt", name: "Organic Linen Shirt", price: 72, description: "Crafted from breathable, premium organic flax linen. Pre-washed for a soft hand-feel and a relaxed, laid-back structure that only gets better with wear. Features tonal buttons and a classic point collar.", material: "100% Organic Flax Linen", category: "shirts", tags: ["shirt", "linen", "natural fiber", "breathable"], sizes: ["S", "M", "L", "XL"], colors: [{ name: "Flax Cream", hex: "#EAE6DF", image: "assets/linen-shirt.png" }, { name: "Chalk White", hex: "#F9F9FB", image: "assets/linen-shirt.png" }], featured: true, quantity: 19, availability: true },
  { id: "classic-oxford-shirt", name: "Classic Oxford Shirt", price: 85, description: "A tailored wardrobe staple cut from brushed cotton oxford cloth. Structured collar, mother-of-pearl buttons, and a slightly relaxed fit make it equally suited to the studio or the office.", material: "100% Brushed Cotton Oxford Cloth", category: "shirts", tags: ["shirt", "oxford", "cotton", "office", "classic"], sizes: ["S", "M", "L", "XL"], colors: [{ name: "Chalk White", hex: "#F9F9FB", image: "assets/linen-shirt.png" }, { name: "Flax Cream", hex: "#EAE6DF", image: "assets/linen-shirt.png" }], featured: false, quantity: 24, availability: true },
  { id: "relaxed-cotton-tee", name: "Relaxed Cotton Tee", price: 45, description: "The perfect everyday t-shirt. Cut from ultra-soft, long-staple Pima cotton with a relaxed fit and a durable ribbed crewneck that maintains its shape wash after wash.", material: "100% Premium Pima Cotton (200 GSM)", category: "basics", tags: ["tee", "basics", "cotton", "everyday"], sizes: ["XS", "S", "M", "L", "XL"], colors: [{ name: "Off-White", hex: "#F5F5F3", image: "assets/cotton-tee.png" }, { name: "Charcoal", hex: "#3C3D3E", image: "assets/cotton-tee.png" }, { name: "Flax", hex: "#DDD8CE", image: "assets/cotton-tee.png" }], featured: true, quantity: 67, availability: true },
  { id: "everyday-linen-pants", name: "Everyday Linen Pants", price: 78, description: "Easy, relaxed trousers cut from lightweight organic flax linen. Designed with an elastic drawstring waist, functional side pockets, and a straight-leg cut for optimal airflow and ease.", material: "100% Organic Flax Linen", category: "pants", tags: ["pants", "linen", "natural fiber", "straight-leg"], sizes: ["S", "M", "L", "XL"], colors: [{ name: "Flax Cream", hex: "#EAE6DF", image: "assets/linen-pants.png" }, { name: "Charcoal", hex: "#444445", image: "assets/linen-pants.png" }], featured: false, quantity: 28, availability: true },
  { id: "ribbed-lounge-set", name: "Ribbed Lounge Set", price: 120, description: "The ultimate leisure uniform. Includes a ribbed knit long-sleeve top and matching wide-leg knit trousers. Made from a premium cotton-silk blend that offers drape, softness, and light stretch.", material: "85% Organic Cotton, 15% Silk Ribbed Knit", category: "sets", tags: ["lounge", "set", "knitwear", "cotton-silk"], sizes: ["XS", "S", "M", "L"], colors: [{ name: "Oatmeal Beige", hex: "#E4DFD6", image: "assets/lounge-set.png" }, { name: "Charcoal Grey", hex: "#4A4A4C", image: "assets/lounge-set.png" }], featured: true, quantity: 12, availability: true },
  { id: "soft-knit-cardigan", name: "Soft Knit Cardigan", price: 98, description: "A fine-gauge merino cardigan built for transitional layering. Features a relaxed drape, ribbed cuffs and hem, and horn-effect buttons. This season's colorway has sold out faster than expected.", material: "100% Merino Wool Knit", category: "outerwear", tags: ["cardigan", "knitwear", "merino wool", "layering"], sizes: ["S", "M", "L"], colors: [{ name: "Oatmeal Beige", hex: "#E4DFD6", image: "assets/lounge-set.png" }], featured: false, quantity: 0, availability: false },
];

// Real policies, from data/policies.json in the lunastore repo.
const LUNA_POLICIES = {
  shipping: { freeShippingThreshold: 150, standard: { estimatedDaysMax: 5, cost: 6.95 } },
  returns: { windowDays: 30, freeReturns: true, condition: "Items must be unworn, unwashed, and in original packaging with tags attached." },
};

/** Mirrors lunastore/server.js's own `agentProductWire` — material folded into the description, one representative color, as that server's adapter already does for this exact contract. */
function toLunaCatalogItem(p: LunaProduct): CatalogItem {
  const isFree = p.price >= LUNA_POLICIES.shipping.freeShippingThreshold;
  return {
    productId: p.id,
    title: p.name,
    description: `${p.description} Material: ${p.material}.`,
    category: "product",
    price: p.price,
    currency: "USD",
    color: p.colors[0]?.name,
    image: p.colors[0]?.image ? `${LUNA_SITE_BASE_URL}/${p.colors[0].image}` : undefined,
    quantity: p.quantity,
    shipping: { isFree, cost: isFree ? null : LUNA_POLICIES.shipping.standard.cost, estimatedDays: LUNA_POLICIES.shipping.standard.estimatedDaysMax, available: true },
    returns: { windowDays: LUNA_POLICIES.returns.windowDays, isFreeReturns: LUNA_POLICIES.returns.freeReturns, notes: LUNA_POLICIES.returns.condition },
    warranty: { months: null, notes: "Not applicable to apparel; covered by the 30-day return policy instead." },
  };
}

export const LUNA_CATALOG: CatalogItem[] = LUNA_PRODUCTS.map(toLunaCatalogItem);
