import type { TraceEntry } from "./net";
import type { Classification } from "./classify";

/** The platform's small common capability model. Everything a site exposes is normalized into this. */
export const CAPS = {
  "catalog.read": "Search / list products",
  "product.read": "Read product details",
  "inventory.read": "Check availability",
  "policy.read": "Read store policies",
  "shipping.read": "Read shipping policy",
  "order.read": "Read order status",
  "cart.read": "View the cart",
  "cart.add": "Add to cart",
  "checkout.start": "Start checkout",
  "order.place": "Place an order",
} as const;
export type Cap = keyof typeof CAPS;

/** ACT capabilities change merchant state. They exist only in the trusted tier, behind scope + policy. */
export const ACTION_CAPS: ReadonlySet<Cap> = new Set<Cap>(["cart.add", "checkout.start", "order.place"]);
/** Impact decides the gate: low = agent may act; medium = agent prepares, nothing is charged; high = shopper must approve. */
export const IMPACT: Partial<Record<Cap, "low" | "medium" | "high">> = { "cart.add": "low", "checkout.start": "medium", "order.place": "high" };

/** Scopes a merchant can grant. order.read is deliberately not grantable in this prototype (customer data). */
export const SCOPES = {
  "catalog:read": { label: "Read the product catalog", caps: ["catalog.read", "product.read"] as Cap[] },
  "inventory:read": { label: "Read stock levels", caps: ["inventory.read"] as Cap[] },
  "policies:read": { label: "Read store policies and shipping", caps: ["policy.read", "shipping.read"] as Cap[] },
  "commerce:act": { label: "Cart, checkout and purchases (shopper approval required)", caps: ["cart.read", "cart.add", "checkout.start", "order.place", "order.read"] as Cap[] },
} as const;
export type Scope = keyof typeof SCOPES;
export const scopeOf = (cap: Cap): Scope | null => (Object.keys(SCOPES) as Scope[]).find((s) => (SCOPES[s].caps as Cap[]).includes(cap)) ?? null;

export type Product = {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  color?: string;
  category?: string;
  description?: string;
  url?: string;
  variants?: Array<{ name: string; values: string[] }>;
  image?: string;
  material?: string;
  tags?: string[];
};

export type Flag = { field: string; excerpt: string };

/** Where a capability's data comes from. Each kind has a tiny adapter in adapters.ts. */
export type Source =
  | { kind: "manifest"; manifestUrl: string; path: string; method?: "GET" | "POST" }
  | { kind: "shopify" }
  | { kind: "woocommerce" }
  | { kind: "json-ld"; pageUrl: string; pageUrls?: string[] }
  | { kind: "json-api"; listUrl: string };

export type Candidate = {
  /** Normalized capability, or null when the site's id was not recognised. */
  cap: Cap | null;
  /** The id/label as the website declared it. */
  declaredId: string;
  via: "explicit manifest" | "Shopify public API" | "WooCommerce Store API" | "JSON-LD structured data" | "Public product API" | "Embedded page data";
  source?: Source;
  declared?: { risk?: string; method?: string; path?: string; scope?: string };
  /** Set at discovery time when the capability can never be exposed. */
  rejected?: string;
};

export type CapState = "enabled" | "public" | "awaiting_authorization" | "rejected";

export type ConnStatus = "CONNECTED" | "PUBLIC_DATA_DISCOVERED" | "REQUIRES_VERIFICATION" | "REQUIRES_AUTHORIZATION" | "UNSUPPORTED" | "FAILED";

export type VerifyAttempt = { method: "meta tag" | "well-known file" | "DNS TXT"; ok: boolean; detail: string };

export type Cart = { id: string; items: Array<{ productId: string; name?: string; quantity: number; price?: number; variant?: string }>; subtotal?: number; currency?: string };
export type Checkout = { id: string; cartId?: string; items: Cart["items"]; subtotal?: number; shipping?: number | null; shippingNote?: string; tax?: number | null; taxNote?: string; total?: number; currency?: string; status: string; expiresAt?: string };
export type Order = { id: string; status: string; paymentStatus?: string; total?: number; currency?: string; note?: string };
export type AuditEntry = { at: string; actor: "agent" | "shopper" | "platform"; action: string; result: "allowed" | "denied" | "ok" | "error"; detail?: string };
export type ChatMsg = { role: "user" | "assistant"; content: string };

export type Connection = {
  id: string;
  /** Bumped each time the state is sealed; the newest copy wins when state comes back from the browser. */
  rev?: number;
  input: string;
  url?: string;
  origin?: string;
  host?: string;
  siteName?: string;
  /** Operator-allowed local origin (CONNECT_ALLOW_LOCAL); loopback permitted but NOT trusted. */
  local?: boolean;
  ecommerce: boolean;
  /** What the site publicly exposes (descriptive). Not a trust or authorization input. */
  classification?: Classification;
  platform?: string;
  site: { icon?: string; image?: string; description?: string };
  /** Platform-owned demo sites (loopback allowed, verification can be simulated). */
  controlled: boolean;
  token: string;
  createdAt: string;
  fatal?: { code: string; message: string; suggestedUrl?: string };
  ownership: { verified: boolean; method?: string; attempts: VerifyAttempt[] };
  authorized: boolean;
  grantedScopes: Scope[];
  candidates: Candidate[];
  signals: string[];
  discoveryMethods: string[];
  trace: TraceEntry[];
  flagsSeen: number;
  cache: Map<string, { at: number; value: unknown }>;
  /** Credential presented to the merchant on authorized requests (opaque, per connection). */
  accessToken: string;
  cartId?: string;
  checkouts: Record<string, Checkout>;
  orders: Record<string, Order>;
  audit: AuditEntry[];
  chat: ChatMsg[];
  /** What discovery actually did and found, step by step (shown under Connection details). */
  evidence: Array<{ step: string; ok: boolean; detail: string }>;
};
