import * as cheerio from "cheerio";
import { z } from "zod";
import { SiteError, assertOk } from "./net";
import { jsonLdNodes, loadCatalog, safeImage, structuredPageCatalog, stripHtml, type Getter } from "./adapters";
import type { Candidate, Cap, Connection } from "./types";
import { applyOpinion, classify, groupTemplates, internalPaths, modelSecondOpinion, pageFacts, type PageFacts, type Profile } from "./classify";

/**
 * Platform vocabulary: the only capability ids a manifest may use (with common aliases), the scope each belongs to,
 * and the HTTP method it may use. This is a shared vocabulary, not a list of sites.
 * READ capabilities use GET. ACT capabilities (cart / checkout / order) use POST and exist only for authorized merchants.
 */
type Entry = { cap: Cap; scope: string; method: "GET" | "POST" };
const MANIFEST_IDS: Record<string, Entry> = {};
const alias = (cap: Cap, scope: string, method: Entry["method"], ...ids: string[]) => ids.forEach((i) => (MANIFEST_IDS[i] = { cap, scope, method }));
alias("catalog.read", "catalog:read", "GET", "search_products", "list_products", "search_catalog", "search");
alias("product.read", "catalog:read", "GET", "get_product", "get_product_details", "product_details");
alias("inventory.read", "inventory:read", "GET", "check_availability", "get_inventory", "check_inventory", "check_stock");
alias("policy.read", "policies:read", "GET", "get_policies", "get_store_policies");
alias("shipping.read", "policies:read", "GET", "get_shipping_policy", "get_shipping_info", "get_shipping");
alias("cart.read", "commerce:act", "GET", "get_cart", "view_cart");
alias("cart.add", "commerce:act", "POST", "add_to_cart", "cart_add");
alias("checkout.start", "commerce:act", "POST", "begin_checkout", "start_checkout", "create_checkout");
alias("order.place", "commerce:act", "POST", "place_order", "submit_order", "create_order");
alias("order.read", "commerce:act", "GET", "get_order_status", "get_order", "track_order");

const ManifestSchema = z.object({
  schema: z.string().optional(),
  store: z.object({ name: z.string().optional() }).passthrough().optional(),
  capabilities: z.array(z.object({
    id: z.string().max(80),
    scope: z.string().optional(),
    risk: z.string().optional(),
    method: z.string().optional(),
    path: z.string().max(300),
    description: z.string().optional(),
  })).max(50),
});

export const MANIFEST_MEDIA_TYPE = "application/agentic-capabilities+json";
/** Conventional places a merchant might publish a capability list. */
const MANIFEST_PATHS = ["/.well-known/agentic-capabilities.json", "/api/capabilities", "/capabilities.json"];

/** Declared endpoint paths must be plain same-site absolute paths (optionally with an {id} placeholder). */
function checkPath(path: string): string | null {
  const msg = `Endpoint rejected because it is outside the allowed site scope (${path.slice(0, 80)}).`;
  if (/\.\.|%2e|%2f|\\|[\u0000-\u001f]/i.test(path)) return msg;
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path)) return msg;
  return null;
}

function manifestCandidates(raw: unknown, manifestUrl: string): Candidate[] {
  const m = ManifestSchema.safeParse(raw);
  if (!m.success) throw new SiteError("UNSUPPORTED_DATA", `Manifest at ${manifestUrl} does not match the capability manifest format: ${m.error.issues[0]?.path.join(".") || "root"} — ${m.error.issues[0]?.message}`);
  return m.data.capabilities.map((c): Candidate => {
    const known = MANIFEST_IDS[c.id];
    const method = (c.method ?? "GET").toUpperCase();
    const base: Candidate = {
      cap: known?.cap ?? null,
      declaredId: c.id,
      via: "explicit manifest",
      declared: { risk: c.risk, method: c.method, path: c.path, scope: c.scope },
    };
    const reject = (rejected: string) => ({ ...base, rejected });
    if (!known) {
      return reject(method === "GET" ? `Rejected: "${c.id}" is not in the platform capability allowlist.` : `Rejected: state-changing action "${c.id}" is not a supported commerce action.`);
    }
    if (method !== known.method) return reject(`Rejected: ${c.id} must use ${known.method}, declared ${method}.`);
    const isAction = known.method === "POST";
    if (isAction ? !["action", "write"].includes(c.risk ?? "") : c.risk !== "read") return reject(`Rejected: declared risk "${c.risk ?? "none"}" does not match ${c.id}.`);
    const pathProblem = checkPath(c.path);
    if (pathProblem) return reject(pathProblem);
    if (c.scope !== known.scope) return reject(`Rejected: declared scope "${c.scope ?? "none"}" does not match expected "${known.scope}".`);
    return { ...base, source: { kind: "manifest", manifestUrl, path: c.path, method: known.method } };
  });
}

const j = (s: string) => s.replace(/\s+/g, " ");
const PRODUCT_PATH = /\/(products?|p|item|items|shop|collections\/[^/]+\/products|catalog|store)\/[^/?#]+|\/[^/]*\d{4,}\.html?$/i;

/** Run every discovery approach. Never throws for "nothing found". */
export async function discover(conn: Connection, html: string, get: Getter): Promise<void> {
  const origin = conn.origin!;
  const $ = cheerio.load(html);
  conn.candidates = [];
  conn.signals = [];
  conn.discoveryMethods = [];
  conn.ecommerce = false;
  conn.classification = undefined;
  conn.platform = undefined;
  const note = (s: string) => conn.signals.push(s);
  const ev = (step: string, ok: boolean, detail: string) => conn.evidence.push({ step, ok, detail });
  const rel = (href?: string) => safeImage(href, origin);
  // One bounded, same-origin page sample shared by product-page probing and classification (each URL is fetched at most once).
  const fetched = new Map<string, Promise<string | null>>();
  const fetchPage = (u: string, purpose: string) => {
    let r = fetched.get(u);
    if (!r) fetched.set(u, (r = get(u, purpose, "text/html").then((f) => (f.status === 200 ? f.body : null)).catch((e) => { if (e instanceof SiteError) return null; throw e; })));
    return r;
  };
  let smP: Promise<string[]> | undefined;
  const sitemap = () => (smP ??= sitemapUrls(origin, conn.url!, get, note));

  // ---- site identity (for the store preview) ----
  conn.site = {
    icon: rel($('link[rel~="icon"], link[rel="apple-touch-icon"]').first().attr("href")),
    image: rel($('meta[property="og:image"]').attr("content")),
    description: ($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "").slice(0, 180) || undefined,
  };

  ev("HTML parsed", true, `${$("a[href]").length} links${$("title").first().text() ? `, title “${$("title").first().text().trim().slice(0, 60)}”` : ""}`);
  // ---- ecommerce signals on the page itself ----
  // Visible text and accessibility labels only: script/style contents (framework state, CSS) must not count as "prices on page".
  const body = $("body").clone();
  body.find("script, style, noscript, template").remove();
  const labels = $("[aria-label], [title]").map((_, el) => `${$(el).attr("aria-label") ?? ""} ${$(el).attr("title") ?? ""}`).get().join(" ");
  const text = `${body.text()} ${labels}`;
  const sig: string[] = [];
  if ($("a[href]").toArray().some((el) => /\/(cart|basket|bag|checkout)(\/|$|\?)/i.test($(el).attr("href") ?? ""))) sig.push("cart link");
  if (/add to (cart|bag|basket)|shopping (cart|bag)|\bcheckout\b|\bcart\b/i.test(text)) sig.push("cart / checkout language");
  if (/[$€£]\s?\d{1,5}(?:[.,]\d{2})?/.test(text)) sig.push("prices on page");
  if ($('meta[property="og:type"][content="product"]').length) { sig.push("product page markup"); note("OpenGraph og:type=product present"); }
  const ld = jsonLdNodes(html);
  if (ld.types.length) note(`JSON-LD types on page: ${ld.types.slice(0, 8).join(", ")}`);
  if (ld.types.some((t) => /^(Product|ProductGroup|Offer|AggregateOffer|Store|OnlineStore|ItemList)$/.test(t))) sig.push("commerce structured data");
  if (/cdn\.shopify\.com|Shopify\.(shop|theme)|myshopify\.com/i.test(html)) { conn.platform = "Shopify"; sig.push("Shopify"); }
  else if (/woocommerce|wp-content\/plugins\/woocommerce/i.test(html)) { conn.platform = "WooCommerce"; sig.push("WooCommerce"); }
  if (/navigator\.modelContext|registerTool\(/.test(html)) note("WebMCP signal: page references navigator.modelContext. WebMCP is a browser-runtime API; a browser-based connector would be needed — not implemented.");
  const gen = $('meta[name="generator"]').attr("content");
  if (gen) note(`Generator: ${j(gen).slice(0, 60)}`);
  if (sig.length) note(`Ecommerce signals: ${sig.join(", ")}`);
  conn.ecommerce = sig.length > 0;
  ev("Ecommerce signals", sig.length > 0, sig.length ? sig.join(", ") : "none found on the page");
  ev("Platform markers", !!conn.platform, conn.platform ? `${conn.platform} detected` : "no Shopify / WooCommerce markers");
  ev("Structured data types", ld.types.length > 0, ld.types.length ? `JSON-LD: ${ld.types.slice(0, 8).join(", ")}` : "no JSON-LD on the page");

  // ---- 1. explicit capability manifest: <link> advertisement + conventional locations ----
  const urls = new Set<string>();
  $(`link[rel~="alternate"][type="${MANIFEST_MEDIA_TYPE}"]`).each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const u = new URL(href, conn.url);
      if (u.origin !== origin) note(`Manifest link ignored — outside allowed site scope: ${u.origin}`);
      else urls.add(u.toString());
    } catch { note("Manifest link ignored — malformed href"); }
  });
  for (const p of MANIFEST_PATHS) urls.add(`${origin}${p}`);
  let manifestFound = false;
  for (const mu of urls) {
    try {
      const f = await get(mu, "discovery:manifest", "application/json");
      const path = new URL(mu).pathname;
      if (f.status >= 400 || f.status === 0) { ev(`Capability manifest ${path}`, false, `HTTP ${f.status}`); continue; }
      assertOk(f, "Manifest");
      let raw: unknown;
      try { raw = JSON.parse(f.body); } catch { ev(`Capability manifest ${path}`, false, "not JSON (HTML fallback page)"); continue; } // an HTML fallback page is not a manifest
      if (!raw || typeof raw !== "object" || !("capabilities" in raw)) { ev(`Capability manifest ${path}`, false, "JSON without a capability list"); continue; }
      const before = conn.candidates.length;
      conn.candidates.push(...manifestCandidates(raw, mu));
      const added = conn.candidates.slice(before);
      ev(`Capability manifest ${path}`, true, `${added.length} declared · ${added.filter((x) => !x.rejected).length} accepted · ${added.filter((x) => x.rejected).length} rejected`);
      manifestFound = true;
      note(`Capability manifest found: ${mu}`);
    } catch (e) {
      if (e instanceof SiteError) note(`Manifest ${mu}: ${e.message}`); else throw e;
    }
  }
  if (manifestFound) conn.ecommerce = true;

  const addCatalog = (via: Candidate["via"], source: NonNullable<Candidate["source"]>, hasStock: boolean) => {
    const add = (cap: Cap) => conn.candidates.push({ cap, declaredId: cap, via, source });
    add("catalog.read"); add("product.read");
    if (hasStock) add("inventory.read");
  };

  // ---- 2. recognised platform APIs (probed only when the page signals the platform) ----
  if (conn.platform === "Shopify") {
    try {
      const items = await loadCatalog(conn, { kind: "shopify" }, get);
      if (items.length) { addCatalog("Shopify public API", { kind: "shopify" }, items.some((p) => p.inStock !== null)); note(`Shopify /products.json returned ${items.length} products`); ev("Shopify storefront API", true, `/products.json → ${items.length} products`); }
      else note("Shopify /products.json returned no products");
    } catch (e) { if (e instanceof SiteError) { note(`Shopify /products.json not usable: ${e.message}`); ev("Shopify storefront API", false, e.message); } else throw e; }
  }
  if (conn.platform === "WooCommerce") {
    try {
      const items = await loadCatalog(conn, { kind: "woocommerce" }, get);
      if (items.length) { addCatalog("WooCommerce Store API", { kind: "woocommerce" }, items.some((p) => p.inStock !== null)); note(`WooCommerce Store API returned ${items.length} products`); ev("WooCommerce Store API", true, `${items.length} products`); }
    } catch (e) { if (e instanceof SiteError) { note(`WooCommerce Store API not usable: ${e.message}`); ev("WooCommerce Store API", false, e.message); } else throw e; }
  }

  // ---- 3. structured data on the entered page (JSON-LD / microdata / embedded framework state) ----
  const page = structuredPageCatalog(html, origin);
  if (page.items.length) {
    conn.cache.set("cat:json-ld", { at: Date.now(), value: page.items });
    addCatalog(page.via, { kind: "json-ld", pageUrl: conn.url! }, page.items.some((p) => p.inStock !== null));
    note(`${page.via}: ${page.items.length} products on ${conn.url}`);
    ev("Product data on the page", true, `${page.via}: ${page.items.length} products`);
    conn.ecommerce = true;
  } else ev("Product data on the page", false, "no Product JSON-LD, microdata or embedded product state");

  // ---- 4. a plain JSON product API, only when the site already looks like a store ----
  if ((conn.ecommerce || manifestFound) && !conn.candidates.some((c) => c.cap === "catalog.read" && c.via !== "explicit manifest")) {
    for (const p of ["/api/products"]) {
      try {
        const listUrl = `${origin}${p}`;
        const items = await loadCatalog(conn, { kind: "json-api", listUrl }, get);
        if (items.length) {
          conn.cache.set("cat:json-api", { at: Date.now(), value: items });
          addCatalog("Public product API", { kind: "json-api", listUrl }, items.some((x) => x.inStock !== null));
          note(`Public product API ${p} returned ${items.length} products`);
          ev("Public product API", true, `${p} → ${items.length} products`);
          conn.ecommerce = true;
          break;
        }
      } catch (e) { if (!(e instanceof SiteError)) throw e; }
    }
  }

  // ---- 5. product pages: homepage links, then sitemap, sampled for structured product data ----
  if (!conn.candidates.some((c) => c.cap === "catalog.read")) {
    const found = new Set<string>();
    $("a[href]").each((_, el) => {
      try { const u = new URL($(el).attr("href")!, conn.url); if (u.origin === origin && PRODUCT_PATH.test(u.pathname)) found.add(u.origin + u.pathname); } catch { /* ignore */ }
    });
    if (found.size < 3) {
      const listed = (await sitemap()).filter((u) => PRODUCT_PATH.test(new URL(u).pathname)).slice(0, 400);
      if (listed.length) note(`Sitemap lists ${listed.length}+ product pages`);
      for (const u of listed) found.add(u);
    }
    const all = [...found];
    // sample evenly across the list so we don't only see one corner of the catalog
    const pages = all.length <= 4 ? all : [0, 1, 2, 3].map((i) => all[Math.floor((i * all.length) / 4)]!);
    if (pages.length) {
      const items = [];
      for (const pu of pages) {
        const body = await fetchPage(pu, "discovery:product-page");
        if (body) items.push(...structuredPageCatalog(body, origin).items);
      }
      if (items.length) {
        conn.cache.set("cat:json-ld", { at: Date.now(), value: items });
        addCatalog("JSON-LD structured data", { kind: "json-ld", pageUrl: pages[0]!, pageUrls: pages.slice(1) }, items.some((p) => p.inStock !== null));
        note(`Product pages: structured data for ${items.length} product(s) across ${pages.length} sampled pages`);
        ev("Product pages / sitemap", true, `${all.length} product URLs found · ${pages.length} sampled · ${items.length} products with structured data`);
        conn.ecommerce = true;
      } else { note(`Sampled ${pages.length} product page(s); no structured product data`); ev("Product pages / sitemap", false, `${pages.length} product page(s) sampled, no structured product data`); }
    } else ev("Product pages / sitemap", false, "no product URLs found on the page, robots.txt or sitemap");
  }

  // ---- 6. classification: what does this site expose? (descriptive only; never read by verification, authorization or the gateway) ----
  await classifySite(conn, html, $, { get, fetched, fetchPage, sitemap, note, ev });

  conn.discoveryMethods = [...new Set(conn.candidates.map((c) => c.via))];
  if (!conn.platform && conn.ecommerce) conn.platform = "Online store";
  ev("Result", conn.discoveryMethods.length > 0, conn.discoveryMethods.length ? `usable via ${conn.discoveryMethods.join(", ")}` : conn.ecommerce ? "looks like a store, but no machine-readable commerce data was found" : "not recognised as an online store");
  note("Methods checked: capability manifest (link + conventional paths), Shopify/WooCommerce APIs, structured page data, product API, product pages/sitemap, WebMCP markers.");
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);

type Sampler = {
  get: Getter;
  fetched: Map<string, Promise<string | null>>;
  fetchPage: (u: string, purpose: string) => Promise<string | null>;
  sitemap: () => Promise<string[]>;
  note: (s: string) => void;
  ev: (step: string, ok: boolean, detail: string) => void;
};

const MAX_SAMPLE_PAGES = 6;

/** Build an evidence profile from the homepage plus a small sample of the site's own pages, classify it, and record the result. */
async function classifySite(conn: Connection, html: string, _$: cheerio.CheerioAPI, s: Sampler): Promise<void> {
  const origin = conn.origin!;
  const home = pageFacts(html, conn.url!, origin);
  const homePaths = internalPaths(html, conn.url!, origin);
  const smUrls = await s.sitemap();
  const smPaths = smUrls.map((u) => new URL(u).pathname);
  const linkTemplates = groupTemplates(homePaths);
  const sitemapTemplates = groupTemplates(smPaths);

  // Sample one page from each of the most repeated page structures (links first, then sitemap), never the whole site.
  // The dominant structure gets a few pages spread across it (so differences between listings, e.g. sellers, are visible).
  const pick = (paths: string[], t: { template: string }[]) => t.flatMap((x, i) => {
    const of = paths.filter((p) => groupTemplates([p])[0]?.template === x.template);
    const n = i === 0 ? 3 : 1;
    return Array.from({ length: Math.min(n, of.length) }, (_, j) => of[Math.floor((j * of.length) / Math.min(n, of.length))]!);
  });
  const want = [...pick(homePaths, linkTemplates.slice(0, 3)), ...pick(smPaths, sitemapTemplates.slice(0, 3))];
  for (const path of want) {
    if (s.fetched.size >= MAX_SAMPLE_PAGES) break;
    const u = origin + path;
    if (!s.fetched.has(u)) await s.fetchPage(u, "discovery:sample-page");
  }
  const samples: PageFacts[] = [];
  for (const [u, p] of s.fetched) { const b = await p; if (b && samples.length < MAX_SAMPLE_PAGES) samples.push(pageFacts(b, u, origin)); }

  const profile: Profile = {
    host: conn.host ?? "", home, samples, platform: conn.platform,
    machineReadableCommerce: conn.candidates.some((c) => !c.rejected && !!c.cap),
    linkTemplates, sitemapTemplates, sitemapTotal: smUrls.length,
    datedUrls: [...homePaths, ...smPaths].filter((p) => /\/(19|20)\d{2}\/\d{1,2}(\/|$)/.test(p)).length,
  };
  const { ambiguity, ...det } = classify(profile);
  let result = det;
  if (ambiguity.ambiguous) {
    const op = await modelSecondOpinion(profile, det);
    if (op) result = applyOpinion(det, op, profile);
    else s.note(`Classification evidence is limited (${ambiguity.reason}); no model second opinion used.`);
  }
  conn.classification = result;
  // The page-level wording checks above only steer which public endpoints are worth probing; what the site IS comes from the evidence profile.
  conn.ecommerce = (result.classification === "ECOMMERCE" || result.classification === "MARKETPLACE") && result.confidence >= 0.5;
  s.note(`Classification: ${result.classification} (${Math.round(result.confidence * 100)}%) from ${1 + samples.length} page(s) and ${smUrls.length} sitemap URL(s)`);
  s.ev("Classification", result.classification !== "UNKNOWN", `${result.classification} · ${Math.round(result.confidence * 100)}% · ${result.evidence.slice(0, 3).join("; ") || "no evidence"}`);
}

/** URLs from robots.txt/sitemap.xml, descending one level into sitemap indexes (preferring the entered locale). */
async function sitemapUrls(origin: string, entry: string, get: Getter, note: (s: string) => void): Promise<string[]> {
  const seeds = new Set<string>();
  try {
    const f = await get(`${origin}/robots.txt`, "discovery:robots", "text/plain");
    if (f.status === 200) for (const m of f.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) { try { const u = new URL(m[1]!); if (u.origin === origin) seeds.add(u.toString()); } catch { /* ignore */ } }
  } catch (e) { if (!(e instanceof SiteError)) throw e; note("robots.txt not readable"); }
  seeds.add(`${origin}/sitemap.xml`);
  const seg = new URL(entry).pathname.split("/").filter(Boolean)[0] ?? "";
  const localeRe = /^[a-z]{2}([-_][a-z]{2})?$/i.test(seg) ? new RegExp(seg.replace(/[-_]/, "[-_]"), "i") : null;
  const sameOrigin = (u: string) => { try { return new URL(u).origin === origin; } catch { return false; } };
  const fetchXml = async (u: string) => {
    try { const f = await get(u, "discovery:sitemap", "application/xml,text/xml"); return f.status === 200 ? f.body : null; }
    catch (e) { if (!(e instanceof SiteError)) throw e; return null; }
  };
  for (const sm of [...seeds].slice(0, 2)) {
    let xml = await fetchXml(sm);
    if (!xml) continue;
    if (/<sitemapindex/i.test(xml)) {
      const kids = locs(xml).filter(sameOrigin);
      const pick = (localeRe && kids.find((k) => localeRe.test(k))) || kids.find((k) => /product/i.test(k)) || kids[0];
      xml = pick ? await fetchXml(pick) : null;
      if (!xml) continue;
    }
    const urls = locs(xml).filter(sameOrigin).slice(0, 1000);
    if (urls.length) return urls;
  }
  return [];
}

export { stripHtml };
