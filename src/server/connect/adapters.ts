import * as cheerio from "cheerio";
import { scanForUntrustedContent } from "@/server/security/content-scanner";
import { SiteError, assertOk, type Fetched } from "./net";
import type { Candidate, Cap, Cart, Checkout, Connection, Flag, Order, Product, Source } from "./types";

/** Origin-locked, traced GET supplied by the service. Adapters never see raw fetch. */
export type PostInit = { method: "GET" | "POST"; body?: unknown; headers?: Record<string, string> };
export type Getter = (url: string, purpose: string, accept?: string, init?: PostInit) => Promise<Fetched>;

export type CatalogItem = Product & { inStock: boolean | null; quantity?: number | null };

// ---------- untrusted-content handling ----------
export function stripHtml(html: string): string {
  return cheerio.load(`<div>${html}</div>`).text().replace(/\s+/g, " ").trim();
}

/** Everything coming from a website passes through here: scanned, truncated, never interpreted as instructions. */
export function sanitize(value: unknown, field: string, flags: Flag[]): unknown {
  if (typeof value === "string") {
    const hits = scanForUntrustedContent(field, value);
    if (hits.length) {
      flags.push(...hits.map((h) => ({ field: h.field, excerpt: h.excerpt })));
      return "[withheld: flagged as possible instruction injection]";
    }
    return value.slice(0, 600);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((v, i) => sanitize(v, `${field}[${i}]`, flags));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, field ? `${field}.${k}` : k, flags)]));
  }
  return value;
}

const parseJson = (f: Fetched, what: string): unknown => {
  if (f.truncated) throw new SiteError("TOO_LARGE", `${what} exceeded the response size cap.`);
  try { return JSON.parse(f.body); } catch { throw new SiteError("UNSUPPORTED_DATA", `${what} did not return valid JSON (content-type: ${f.headers["content-type"] ?? "unknown"}).`); }
};

// ---------- tolerant normalization: real stores use many shapes ----------
const num = (v: unknown): number | undefined => {
  if (typeof v === "object" && v) { const o = v as Record<string, unknown>; return num(o.amount ?? o.value ?? o.price); }
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Image URLs are only ever shown to the user's browser, never fetched by the platform. https, or the site's own origin. */
export function safeImage(src: unknown, origin: string): string | undefined {
  const raw = typeof src === "string" ? src : typeof src === "object" && src ? str((src as Record<string, unknown>).url ?? (src as Record<string, unknown>).src) : undefined;
  if (!raw || raw.length > 600) return undefined;
  try {
    const u = new URL(raw, origin + "/");
    if (u.protocol === "https:" || (u.protocol === "http:" && u.origin === origin)) return u.toString();
  } catch { /* ignore */ }
  return undefined;
}

/** A product link shown to the shopper (never fetched by the platform): https, or the sites own origin. */
export const safeLink = safeImage;

function stockOf(r: Record<string, unknown>): { inStock: boolean | null; quantity?: number | null } {
  const q = typeof r.quantity === "number" ? r.quantity : typeof r.stock === "number" ? r.stock : undefined;
  for (const k of ["inStock", "in_stock", "is_in_stock", "available", "isAvailable"]) if (typeof r[k] === "boolean") return { inStock: r[k] as boolean, quantity: q };
  const a = r.availability;
  if (typeof a === "boolean") return { inStock: a, quantity: q };
  if (typeof a === "string") return { inStock: /out|sold|unavail|discontinued/i.test(a) ? false : /in[_ ]?stock|available|limited/i.test(a) ? true : null, quantity: q };
  return { inStock: q === undefined ? null : q > 0, quantity: q };
}

/** Normalize one product-like object from any JSON source. Returns null if it doesn't look like a product. */
export function toItem(r: unknown, origin: string): CatalogItem | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const name = str(o.name) ?? str(o.title);
  if (!name) return null;
  const id = String(o.id ?? o.sku ?? o.handle ?? o.slug ?? name).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
  const colors = Array.isArray(o.colors) ? (o.colors as unknown[]) : [];
  const color = str(o.color) ?? (colors.map((c) => (typeof c === "string" ? c : str((c as Record<string, unknown>)?.name))).filter(Boolean).join(", ") || undefined);
  const firstColorImg = colors.map((c) => (c as Record<string, unknown>)?.image).find((x) => typeof x === "string");
  const imgs = Array.isArray(o.images) ? (o.images as unknown[])[0] : undefined;
  const offer = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
  const variants: Array<{ name: string; values: string[] }> = [];
  const strs = (a: unknown) => (Array.isArray(a) ? (a as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20) : []);
  if (strs(o.sizes).length) variants.push({ name: "Size", values: strs(o.sizes) });
  const colorNames = colors.map((c) => (typeof c === "string" ? c : str((c as Record<string, unknown>)?.name))).filter((x): x is string => !!x);
  if (colorNames.length) variants.push({ name: "Color", values: colorNames.slice(0, 20) });
  if (Array.isArray(o.options)) {
    for (const opt of o.options as Array<Record<string, unknown>>) {
      const n = str(opt?.name);
      const v = strs(opt?.values);
      if (n && v.length && !variants.some((x) => x.name.toLowerCase() === n.toLowerCase())) variants.push({ name: n, values: v });
    }
  }
  const tags = Array.isArray(o.tags) ? (o.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 12) : undefined;
  return {
    id, name,
    price: num(o.price ?? offer?.price ?? o.priceAmount),
    currency: str(o.currency) ?? str(o.priceCurrency) ?? str(offer?.priceCurrency),
    color,
    category: str(o.category) ?? str(o.product_type) ?? str(o.type),
    description: stripHtml(String(o.description ?? o.body_html ?? o.short_description ?? "")).slice(0, 400) || undefined,
    material: str(o.material),
    tags,
    url: safeLink(o.url ?? o.permalink ?? o.link, origin),
    variants: variants.length ? variants : undefined,
    image: safeImage(o.image ?? imgs ?? o.thumbnail ?? firstColorImg, origin),
    ...stockOf(o),
  };
}

/** Find the product array in a response: bare array, or under products/items/results/data/list. */
export function extractList(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const k of ["products", "items", "results", "data", "list", "edges", "nodes"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
      if (o[k] && typeof o[k] === "object") { const inner = extractList(o[k]); if (inner) return inner; }
    }
  }
  return null;
}

function itemsFrom(json: unknown, origin: string, what: string): CatalogItem[] {
  const list = extractList(json);
  if (!list) throw new SiteError("UNSUPPORTED_DATA", `${what} did not contain a list of products.`);
  const items = list.slice(0, 200).map((x) => toItem(x, origin)).filter((x): x is CatalogItem => !!x);
  if (list.length && !items.length) throw new SiteError("UNSUPPORTED_DATA", `${what} returned items that don't look like products.`);
  return items;
}

/** Turn any policy payload into short readable text per section. */
export function describe(v: unknown, depth = 0): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => describe(x, depth + 1)).filter(Boolean).join("; ");
  if (typeof v === "object" && depth < 3) {
    const o = v as Record<string, unknown>;
    const lead = ["notes", "description", "summary", "text"].map((k) => str(o[k])).filter(Boolean) as string[];
    // Prefer the merchant's own prose; fall back to flattening raw fields only when there is none.
    const prose = [...lead, ...Object.entries(o).filter(([k, x]) => !["notes", "description", "summary", "text", "label"].includes(k) && typeof x === "string").map(([, x]) => (x as string).trim())].filter(Boolean);
    if (prose.length) return [...new Set(prose)].join(" ");
    const rest = Object.entries(o)
      .filter(([k]) => !["notes", "description", "summary", "text", "label"].includes(k))
      .map(([k, x]) => {
        const d = describe(x, depth + 1);
        return d ? `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${d}` : "";
      }).filter(Boolean);
    const label = str(o.label);
    return [...lead, ...(rest.length ? [(label ? `${label}: ` : "") + rest.join(", ")] : [])].join(" ").trim();
  }
  return "";
}

export function policiesFrom(json: unknown): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new SiteError("UNSUPPORTED_DATA", "Policies were not returned as an object.");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>).slice(0, 12)) {
    const d = describe(v).slice(0, 500);
    if (d) out[k] = d;
  }
  if (!Object.keys(out).length) throw new SiteError("UNSUPPORTED_DATA", "No readable policy text was returned.");
  return out;
}

// ---------- catalog sources ----------
async function shopifyCatalog(conn: Connection, get: Getter): Promise<CatalogItem[]> {
  const f = await get(`${conn.origin}/products.json?limit=50`, "discovery:shopify-products.json", "application/json");
  assertOk(f, "Shopify /products.json");
  const data = parseJson(f, "Shopify /products.json") as { products?: Array<Record<string, unknown>> };
  if (!Array.isArray(data.products)) throw new SiteError("UNSUPPORTED_DATA", "Shopify /products.json had no products list.");
  return data.products.map((p): CatalogItem => {
    const variants: any[] = Array.isArray(p.variants) ? (p.variants as any[]) : [];
    const prices = variants.map((v) => num(v.price)).filter((x): x is number => x !== undefined);
    const colorOpt = (Array.isArray(p.options) ? (p.options as any[]) : []).find((o) => /colou?r/i.test(String(o?.name)));
    const known = variants.filter((v) => typeof v.available === "boolean");
    const img = Array.isArray(p.images) ? (p.images as any[])[0]?.src : (p.image as any)?.src;
    return {
      id: String(p.handle ?? p.id), name: String(p.title ?? ""),
      price: prices.length ? Math.min(...prices) : undefined,
      color: colorOpt ? (colorOpt.values ?? []).join(", ") : undefined,
      category: p.product_type ? String(p.product_type) : undefined,
      description: stripHtml(String(p.body_html ?? "")).slice(0, 400),
      image: safeImage(img, conn.origin!),
      url: safeLink(`/products/${p.handle}`, conn.origin!),
      variants: (Array.isArray(p.options) ? (p.options as any[]) : []).filter((o) => o?.name && Array.isArray(o.values)).map((o) => ({ name: String(o.name), values: (o.values as unknown[]).map(String).slice(0, 20) })),
      inStock: known.length ? known.some((v) => v.available) : null,
    };
  });
}

async function wooCatalog(conn: Connection, get: Getter): Promise<CatalogItem[]> {
  const f = await get(`${conn.origin}/wp-json/wc/store/v1/products?per_page=50`, "discovery:woocommerce-store-api", "application/json");
  assertOk(f, "WooCommerce Store API");
  const list = parseJson(f, "WooCommerce Store API");
  if (!Array.isArray(list)) throw new SiteError("UNSUPPORTED_DATA", "WooCommerce Store API did not return a list.");
  return (list as Array<Record<string, any>>).map((p): CatalogItem => {
    const minor = num(p.prices?.currency_minor_unit) ?? 2;
    const raw = num(p.prices?.price);
    const colorAttr = (Array.isArray(p.attributes) ? p.attributes : []).find((a: any) => /colou?r/i.test(String(a?.name)));
    return {
      id: String(p.id), name: stripHtml(String(p.name ?? "")),
      price: raw === undefined ? undefined : raw / 10 ** minor,
      currency: p.prices?.currency_code ? String(p.prices.currency_code) : undefined,
      color: colorAttr ? (colorAttr.terms ?? []).map((t: any) => t.name).join(", ") : undefined,
      category: p.categories?.[0]?.name ? String(p.categories[0].name) : undefined,
      description: stripHtml(String(p.short_description || p.description || "")).slice(0, 400),
      image: safeImage(p.images?.[0]?.src, conn.origin!),
      url: safeLink(p.permalink, conn.origin!),
      inStock: typeof p.is_in_stock === "boolean" ? p.is_in_stock : null,
    };
  });
}

/** Walk arbitrary JSON-LD and collect Product nodes. */
export function jsonLdNodes(html: string): { products: any[]; types: string[] } {
  const $ = cheerio.load(html);
  const products: any[] = [];
  const types = new Set<string>();
  const visit = (n: any, depth: number) => {
    if (!n || typeof n !== "object" || depth > 6) return;
    if (Array.isArray(n)) return n.slice(0, 200).forEach((x) => visit(x, depth + 1));
    const t = ([] as string[]).concat(n["@type"] ?? []).map(String);
    t.forEach((x) => types.add(x));
    if (t.some((x) => /^(Product|ProductGroup|IndividualProduct)$/.test(x))) products.push(n);
    for (const k of ["@graph", "itemListElement", "item", "mainEntity", "hasVariant"]) if (n[k]) visit(n[k], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { visit(JSON.parse($(el).text()), 0); } catch { /* malformed JSON-LD is ignored, not trusted */ }
  });
  return { products, types: [...types] };
}

function microdataCatalog(html: string, origin: string): CatalogItem[] {
  const $ = cheerio.load(html);
  const out: CatalogItem[] = [];
  $('[itemtype*="schema.org/Product"]').slice(0, 60).each((i, el) => {
    const prop = (n: string) => { const e = $(el).find(`[itemprop="${n}"]`).first(); return e.attr("content") ?? e.attr("href") ?? e.attr("src") ?? e.text(); };
    const it = toItem({ id: prop("sku") || `item-${i + 1}`, name: prop("name"), price: prop("price"), priceCurrency: prop("priceCurrency"), description: prop("description"), image: prop("image"), availability: prop("availability") }, origin);
    if (it) out.push(it);
  });
  return out;
}

/** Product arrays hidden in framework state (e.g. __NEXT_DATA__) or inline JSON blobs. */
function embeddedCatalog(html: string, origin: string): CatalogItem[] {
  const $ = cheerio.load(html);
  let best: CatalogItem[] = [];
  let budget = 30000;
  const walk = (n: unknown, depth: number) => {
    if (budget-- < 0 || depth > 9 || !n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      if (n.length >= 2 && n.length <= 300) {
        const items = n.map((x) => toItem(x, origin)).filter((x): x is CatalogItem => !!x);
        const priced = items.filter((x) => x.price !== undefined).length;
        if (items.length >= 2 && priced >= items.length * 0.6 && items.length > best.length) best = items;
      }
      n.slice(0, 300).forEach((x) => walk(x, depth + 1));
    } else Object.values(n as object).forEach((x) => walk(x, depth + 1));
  };
  $('script#__NEXT_DATA__, script[type="application/json"]').slice(0, 6).each((_, el) => {
    const t = $(el).text();
    if (t.length > 1_000_000) return;
    try { walk(JSON.parse(t), 0); } catch { /* ignore */ }
  });
  return best;
}

export function jsonLdCatalog(html: string, origin = "https://invalid.example"): CatalogItem[] {
  const ld = jsonLdNodes(html).products.slice(0, 100).map((p, i) => {
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers?.offers?.[0] ?? p.offers;
    return toItem({ ...p, id: p.sku ?? p.productID ?? `item-${i + 1}`, category: typeof p.category === "string" ? p.category : p.category?.name, price: offer?.price ?? offer?.lowPrice, priceCurrency: offer?.priceCurrency, availability: offer?.availability }, origin);
  }).filter((x): x is CatalogItem => !!x);
  return ld.length ? ld : microdataCatalog(html, origin);
}

export const structuredPageCatalog = (html: string, origin: string) => {
  const a = jsonLdCatalog(html, origin);
  return a.length ? { items: a, via: "JSON-LD structured data" as const } : { items: embeddedCatalog(html, origin), via: "Embedded page data" as const };
};

const TTL = 30_000;
export async function loadCatalog(conn: Connection, source: Source, get: Getter): Promise<CatalogItem[]> {
  const key = `cat:${source.kind}`;
  const hit = conn.cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as CatalogItem[];
  let items: CatalogItem[];
  if (source.kind === "shopify") items = await shopifyCatalog(conn, get);
  else if (source.kind === "woocommerce") items = await wooCatalog(conn, get);
  else if (source.kind === "json-api") {
    const f = await get(source.listUrl, "gateway:product-api", "application/json");
    assertOk(f, "Product API");
    items = itemsFrom(parseJson(f, "Product API"), conn.origin!, "Product API");
  } else if (source.kind === "json-ld") {
    items = [];
    for (const u of [source.pageUrl, ...(source.pageUrls ?? [])].slice(0, 5)) {
      const f = await get(u, "gateway:structured-page", "text/html");
      assertOk(f, "Page");
      items.push(...structuredPageCatalog(f.body, conn.origin!).items);
    }
  } else throw new SiteError("UNSUPPORTED_DATA", "Not a catalog source.");
  conn.cache.set(key, { at: Date.now(), value: items });
  return items;
}

export function matchProducts(items: CatalogItem[], a: { q?: string; color?: string; max_price?: number }): CatalogItem[] {
  const tokens = (a.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).map((t) => (t.length > 3 ? t.replace(/s$/, "") : t));
  const scored = items
    .map((p) => {
      const hay = `${p.name} ${p.category ?? ""} ${p.description ?? ""} ${p.color ?? ""} ${p.material ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
      return { p, hits: tokens.filter((t) => hay.includes(t)).length };
    })
    .filter(({ p }) => {
      if (a.color && !`${p.color ?? ""} ${p.name} ${p.description ?? ""}`.toLowerCase().includes(a.color)) return false;
      if (a.max_price !== undefined && (p.price === undefined || p.price > a.max_price)) return false;
      return true;
    });
  // Everything that matches all keywords wins; if nothing does, fall back to partial matches (ranked) so "bike lock" still finds "U-Lock".
  const full = scored.filter((x) => x.hits === tokens.length);
  const pool = tokens.length === 0 || full.length ? full : scored.filter((x) => x.hits > 0).sort((x, y) => y.hits - x.hits);
  return pool.map((x) => x.p).sort((x, y) => (x.price ?? Infinity) - (y.price ?? Infinity));
}

// ---------- commerce state: tolerant parsing of cart / checkout / order responses ----------
const unwrapKey = (j: unknown, ...keys: string[]) => {
  if (j && typeof j === "object" && !Array.isArray(j)) {
    const o = j as Record<string, unknown>;
    for (const k of keys) if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) return o[k];
  }
  return j;
};
function lines(o: Record<string, unknown>): Cart["items"] {
  const raw = (o.items ?? o.lines ?? o.line_items) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((x) => {
    const i = (x ?? {}) as Record<string, unknown>;
    const v = str(i.variant) ?? ([str(i.size), str(i.color)].filter(Boolean).join(" / ") || undefined);
    return { productId: String(i.productId ?? i.product_id ?? i.id ?? i.sku ?? ""), name: str(i.name) ?? str(i.title), quantity: num(i.quantity ?? i.qty) ?? 1, price: num(i.price ?? i.unitPrice), variant: v };
  });
}
const objOrThrow = (j: unknown, what: string): Record<string, unknown> => {
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new SiteError("UNSUPPORTED_DATA", `${what} did not return an object.`);
  return j as Record<string, unknown>;
};
export function toCart(json: unknown): Cart {
  const o = objOrThrow(unwrapKey(json, "cart", "data"), "Cart");
  const id = str(o.id) ?? str(o.cartId);
  if (!id) throw new SiteError("UNSUPPORTED_DATA", "Cart response had no id.");
  return { id, items: lines(o), subtotal: num(o.subtotal ?? o.total), currency: str(o.currency) };
}
export function toCheckout(json: unknown): Checkout {
  const o = objOrThrow(unwrapKey(json, "checkout", "data"), "Checkout");
  const id = str(o.id) ?? str(o.checkoutId);
  if (!id) throw new SiteError("UNSUPPORTED_DATA", "Checkout response had no id.");
  const ship = o.shipping && typeof o.shipping === "object" ? (o.shipping as Record<string, unknown>) : undefined;
  const shipping = num(ship?.amount ?? ship?.cost ?? (typeof o.shipping === "object" ? undefined : o.shipping) ?? o.shippingCost);
  return {
    id, cartId: str(o.cartId), items: lines(o), subtotal: num(o.subtotal), currency: str(o.currency),
    shipping: shipping ?? null, shippingNote: str(o.shippingNote) ?? str(ship?.note) ?? str(ship?.label),
    tax: num(o.tax) ?? null, taxNote: str(o.taxNote), total: num(o.total), status: str(o.status) ?? "created", expiresAt: str(o.expiresAt),
  };
}
export function toOrder(json: unknown): Order {
  const o = objOrThrow(unwrapKey(json, "order", "data"), "Order");
  const id = str(o.id) ?? str(o.orderId);
  if (!id) throw new SiteError("UNSUPPORTED_DATA", "Order response had no id.");
  return { id, status: str(o.status) ?? "created", paymentStatus: str(o.paymentStatus ?? o.payment_status), total: num(o.total), currency: str(o.currency), note: str(o.note) };
}

// ---------- explicit-manifest source: declared endpoints, tolerant of response shape ----------
export type OpArgs = {
  id?: string; q?: string; color?: string; max_price?: number;
  productId?: string; quantity?: number; variant?: string; cartId?: string; checkoutId?: string; orderId?: string;
  shipping?: Record<string, string>;
  approval?: { token: string; approvedAt: string; amount?: number };
};

const ID = /^[A-Za-z0-9_.-]{1,120}$/;
function bodyFor(cap: Cap, a: OpArgs): Record<string, unknown> {
  if (cap === "cart.add") {
    if (!a.productId || !ID.test(a.productId)) throw new SiteError("OUT_OF_SCOPE", "Invalid product id.");
    const q = Math.floor(a.quantity ?? 1);
    if (!(q >= 1 && q <= 20)) throw new SiteError("OUT_OF_SCOPE", "Quantity must be 1-20.");
    return { productId: a.productId, quantity: q, ...(a.variant ? { variant: String(a.variant).slice(0, 80) } : {}), ...(a.cartId ? { cartId: a.cartId } : {}) };
  }
  if (cap === "checkout.start") {
    if (!a.cartId || !ID.test(a.cartId)) throw new SiteError("OUT_OF_SCOPE", "There is no cart to check out.");
    return { cartId: a.cartId, ...(a.shipping ? { shipping: a.shipping } : {}) };
  }
  if (cap === "order.place") {
    if (!a.checkoutId || !ID.test(a.checkoutId) || !a.approval) throw new SiteError("OUT_OF_SCOPE", "Order needs a checkout and shopper approval.");
    return { checkoutId: a.checkoutId, approval: a.approval };
  }
  return {};
}

async function manifestGet(conn: Connection, c: Candidate, cap: Cap, args: OpArgs, get: Getter): Promise<{ json: unknown; pathname: string }> {
  const src = c.source as Extract<Source, { kind: "manifest" }>;
  let path = src.path;
  if (path.includes("{id}")) {
    const idv = cap === "cart.read" ? args.cartId : cap === "order.read" ? args.orderId : args.id;
    if (!idv || !ID.test(idv)) throw new SiteError("OUT_OF_SCOPE", "Invalid id.");
    path = path.replace("{id}", encodeURIComponent(idv));
  }
  const url = new URL(path, conn.origin);
  if (url.origin !== conn.origin) throw new SiteError("OUT_OF_SCOPE", "Endpoint rejected because it is outside the allowed site scope.");
  if (cap === "catalog.read") {
    // Servers disagree on parameter names; unknown params are ignored, and results are re-filtered locally.
    const term = (args.q ?? "").split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0];
    if (term) { url.searchParams.set("q", term); url.searchParams.set("query", term); }
    if (args.color) url.searchParams.set("color", args.color);
    if (args.max_price !== undefined) { url.searchParams.set("max_price", String(args.max_price)); url.searchParams.set("maxPrice", String(args.max_price)); }
  }
  const post = src.method === "POST";
  const authed = post || cap === "cart.read" || cap === "order.read";
  const headers: Record<string, string> = authed ? { authorization: `Bearer ${conn.accessToken}`, "x-platform-connection": conn.id } : {};
  if (cap === "order.place" && args.approval) headers["x-shopper-approval"] = args.approval.token;
  const f = post
    ? await get(url.toString(), `gateway:${cap}`, "application/json", { method: "POST", body: bodyFor(cap, args), headers })
    : await get(url.toString(), `gateway:${cap}`, "application/json", authed ? { method: "GET", headers } : undefined);
  if (f.status >= 400 && authed) {
    // Merchants explain action failures ("Only 3 available"); relay that text (it is scanned downstream as untrusted).
    let m: unknown;
    try { m = (JSON.parse(f.body) as { error?: unknown }).error; } catch { /* not JSON */ }
    if (typeof m === "string" && m) throw new SiteError("HTTP_ERROR", m.slice(0, 200), { status: f.status });
  }
  assertOk(f, `Endpoint ${url.pathname}`);
  return { json: parseJson(f, `Endpoint ${url.pathname}`), pathname: url.pathname };
}

// ---------- the gateway's operation surface ----------
export type OpResult =
  | { cap: "catalog.read"; products: CatalogItem[] }
  | { cap: "product.read"; product: CatalogItem }
  | { cap: "inventory.read"; id: string; in_stock: boolean | null; quantity?: number | null }
  | { cap: "policy.read"; policies: Record<string, string> }
  | { cap: "shipping.read"; shipping: string }
  | { cap: "cart.read" | "cart.add"; cart: Cart }
  | { cap: "checkout.start"; checkout: Checkout }
  | { cap: "order.place" | "order.read"; order: Order };

const unwrap = (j: unknown) => unwrapKey(j, "product", "item", "data", "result");

export async function runOp(conn: Connection, c: Candidate, cap: Cap, args: OpArgs, get: Getter): Promise<OpResult> {
  const src = c.source!;
  const origin = conn.origin!;
  if (src.kind === "manifest") {
    const { json, pathname } = await manifestGet(conn, c, cap, args, get);
    const what = `Endpoint ${pathname}`;
    if (cap === "catalog.read") return { cap, products: matchProducts(itemsFrom(json, origin, what), args) };
    if (cap === "product.read") {
      const it = toItem(unwrap(json), origin);
      if (!it) throw new SiteError("UNSUPPORTED_DATA", `${what} did not return a product.`);
      return { cap, product: it };
    }
    if (cap === "inventory.read") {
      const o = unwrap(json);
      if (!o || typeof o !== "object") throw new SiteError("UNSUPPORTED_DATA", `${what} did not return availability.`);
      const s = stockOf(o as Record<string, unknown>);
      if (s.inStock === null && s.quantity === undefined) throw new SiteError("UNSUPPORTED_DATA", `${what} did not state availability.`);
      return { cap, id: String(args.id ?? ""), in_stock: s.inStock, quantity: s.quantity };
    }
    if (cap === "policy.read") return { cap, policies: policiesFrom(json) };
    if (cap === "shipping.read") {
      const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
      const text = describe(o.shipping ?? o).slice(0, 700);
      if (!text) throw new SiteError("UNSUPPORTED_DATA", `${what} did not contain shipping information.`);
      return { cap, shipping: text };
    }
    if (cap === "cart.read" || cap === "cart.add") return { cap, cart: toCart(json) };
    if (cap === "checkout.start") return { cap, checkout: toCheckout(json) };
    if (cap === "order.place" || cap === "order.read") return { cap, order: toOrder(json) };
    throw new SiteError("OUT_OF_SCOPE", `No operation for ${cap}.`);
  }
  const items = await loadCatalog(conn, src, get);
  if (cap === "catalog.read") return { cap, products: matchProducts(items, args) };
  const one = items.find((p) => p.id === args.id);
  if (!one) throw new SiteError("HTTP_ERROR", `No product "${args.id}" in this website's catalog.`, { status: 404 });
  if (cap === "product.read") return { cap, product: one };
  if (cap === "inventory.read") return { cap, id: one.id, in_stock: one.inStock, quantity: one.quantity };
  throw new SiteError("OUT_OF_SCOPE", `${src.kind} does not provide ${cap}.`);
}
