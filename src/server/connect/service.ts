import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import * as cheerio from "cheerio";
import { discover } from "./discovery";
import { runOp, sanitize, type Getter, type OpArgs, type OpResult } from "./adapters";
import { signApproval, tokenFor, verifyApproval, type Approval } from "./trust";
import { SiteError, assertOk, newId, parseSiteUrl, safeGet, type TraceEntry } from "./net";
import { ACTION_CAPS, CAPS, IMPACT, SCOPES, scopeOf, type AuditEntry, type CapState, type Cap, type Connection, type ConnStatus, type Flag, type Scope } from "./types";

export { tokenFor };

export const META_NAME = "agentic-commerce-verification";
export const WELL_KNOWN_FILE = "/.well-known/agentic-commerce-verification.txt";
export const DNS_PREFIX = "_agentic-commerce-challenge";

// ---------- in-memory state (no database); each connection is fully isolated from the others ----------
const g = globalThis as unknown as { __conns?: Map<string, Connection> };
const conns = (g.__conns ??= new Map<string, Connection>());

export function getConn(id: string) {
  const c = conns.get(id);
  if (!c) throw new Error("Unknown connection id.");
  return c;
}
export function resetAll() {
  conns.clear();
}

export function audit(conn: Connection, actor: AuditEntry["actor"], action: string, result: AuditEntry["result"], detail?: string) {
  conn.audit.push({ at: new Date().toISOString(), actor, action, result, detail: detail?.slice(0, 200) });
  if (conn.audit.length > 200) conn.audit.shift();
}

function pushTrace(conn: Connection, t: TraceEntry) {
  conn.trace.push(t);
  if (conn.trace.length > 200) conn.trace.shift();
}

/** The only fetcher adapters/discovery get: locked to the connection's own origin, always traced. POST only for authorized actions. */
function makeGet(conn: Connection, collect?: (t: TraceEntry) => void, allowPost = false): Getter {
  return async (url, purpose, accept, init) => {
    const u = new URL(url);
    const deny = (note: string) => {
      const t: TraceEntry = { id: newId("req"), at: new Date().toISOString(), purpose, method: init?.method ?? "GET", url, status: "DENIED", ms: 0, bytes: 0, note };
      pushTrace(conn, t); collect?.(t);
      return new SiteError("OUT_OF_SCOPE", "Endpoint rejected because it is outside the allowed site scope.");
    };
    if (u.origin !== conn.origin) throw deny("outside allowed site scope");
    if (init?.method === "POST" && !allowPost) throw deny("write not permitted for this call");
    return safeGet(url, { purpose, accept, method: init?.method, body: init?.body, headers: init?.headers, allowLocal: conn.controlled || !!conn.local, onTrace: (t) => { pushTrace(conn, t); collect?.(t); } });
  };
}

/** Operator opt-in for testing local sites (exact origins, comma separated). Loopback is allowed but the site is never trusted automatically. */
function localAllowed(origin: string) {
  return (process.env.CONNECT_ALLOW_LOCAL ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(origin);
}

const CONTROLLED_PATH = /^\/(demo-store|fixtures\/)/;
function isControlled(raw: string, requestOrigin: string) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return u.origin === requestOrigin && CONTROLLED_PATH.test(u.pathname);
  } catch { return false; }
}

// ---------- step 1: register + probe + public discovery ----------
export async function startConnection(raw: string, requestOrigin: string): Promise<Connection> {
  // A scheme-less entry that targets this app's own demo sites inherits the app's scheme (http in dev).
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `${new URL(requestOrigin).protocol}//${raw.trim()}`;
  const controlled = isControlled(withScheme, requestOrigin);
  if (controlled) raw = withScheme;
  const conn: Connection = {
    id: randomBytes(5).toString("hex"), input: raw.trim().slice(0, 300), controlled, ecommerce: false, site: {},
    token: "", createdAt: new Date().toISOString(),
    ownership: { verified: false, attempts: [] }, authorized: false, grantedScopes: [],
    candidates: [], signals: [], discoveryMethods: [], trace: [], flagsSeen: 0, cache: new Map(),
    accessToken: "cat_" + randomBytes(20).toString("hex"), checkouts: {}, orders: {}, audit: [], chat: [], evidence: [],
  };
  conns.set(conn.id, conn);
  if (conns.size > 50) conns.delete(conns.keys().next().value!);

  try {
    let probeUrl: URL | null = null;
    try { probeUrl = new URL(withScheme); } catch { /* parseSiteUrl reports it */ }
    conn.local = !controlled && !!probeUrl && localAllowed(probeUrl.origin);
    if (conn.local) raw = withScheme;
    const u = parseSiteUrl(raw, controlled || conn.local);
    conn.url = u.toString();
    conn.origin = u.origin;
    conn.host = u.hostname;
    conn.token = tokenFor(u.origin);
    await probe(conn);
  } catch (e) {
    setFatal(conn, e);
  }
  return conn;
}

function setFatal(conn: Connection, e: unknown) {
  if (e instanceof SiteError) conn.fatal = { code: e.code, message: e.message, suggestedUrl: e.extra.location };
  else conn.fatal = { code: "NETWORK_ERROR", message: `Unexpected error: ${(e as Error).message}` };
}

function deriveName(html: string, host?: string): string {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (og) return og.slice(0, 40);
  let ld: string | undefined;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    if (!ld && typeof o.name === "string" && types.some((t) => /^(Organization|WebSite|Store|OnlineStore|Corporation)$/.test(t))) ld = o.name.trim();
    if (o["@graph"]) walk(o["@graph"]);
  };
  $('script[type="application/ld+json"]').each((_, el) => { try { walk(JSON.parse($(el).text())); } catch { /* ignore malformed */ } });
  if (ld && ld.length <= 40) return ld;
  const parts = ($("title").first().text() || host || "").split(/\s[|–—-]\s|:\s/).map((x) => x.trim()).filter(Boolean);
  const pick = parts[0] && parts[0].length <= 30 ? parts[0] : parts.filter((x) => x.length <= 30).sort((x, y) => x.length - y.length)[0] ?? parts[0] ?? host ?? "Website";
  return pick.slice(0, 40);
}

/** A redirect is followed during entry only if it stays on the same site: same host (ignoring www), https never downgraded, same port, no credentials. */
export function sameSite(from: URL, to: URL) {
  const strip = (h: string) => h.replace(/^www\./, "");
  if (to.username || to.password) return false;
  if (from.protocol === "https:" && to.protocol !== "https:") return false;
  if (to.protocol !== "https:" && to.protocol !== "http:") return false;
  return strip(from.hostname) === strip(to.hostname) && (to.port === from.port || to.port === "");
}

async function probe(conn: Connection) {
  const get = makeGet(conn);
  const notes: string[] = [];
  let f = await get(conn.url!, "probe:homepage", "text/html");
  for (let hop = 0; hop < 3 && f.status >= 300 && f.status < 400; hop++) {
    let next: URL;
    try { next = new URL(String(f.headers.location ?? ""), conn.url); } catch { break; }
    if (!sameSite(new URL(conn.url!), next)) break; // cross-site redirects stay blocked (assertOk reports it)
    parseSiteUrl(next.toString(), !!(conn.controlled || conn.local)); // same SSRF rules for every hop
    notes.push(`Followed same-site redirect: ${conn.url} → ${next.toString()}`);
    conn.url = next.toString(); conn.origin = next.origin; conn.host = next.hostname; conn.token = tokenFor(next.origin);
    f = await get(conn.url, "probe:homepage", "text/html");
  }
  assertOk(f, "Website");
  const ct = String(f.headers["content-type"] ?? "");
  if (!/html|xml/i.test(ct)) throw new SiteError("UNSUPPORTED_DATA", `Website returned unsupported data: content-type "${ct || "none"}" (expected an HTML page).`);
  conn.fatal = undefined;
  conn.siteName = deriveName(f.body, conn.host);
  conn.evidence = [{ step: "HTTP fetch", ok: true, detail: `GET ${conn.url} → ${f.status} ${ct.split(";")[0]}, ${Math.round(f.body.length / 1024)} KB${f.truncated ? " (truncated at size cap)" : ""}` }, ...notes.map((n) => ({ step: "Redirect", ok: true, detail: n }))];
  await discover(conn, f.body, get);
  conn.signals.unshift(...notes);
  if (!process.env.VITEST) console.log(`[discovery] ${conn.host}: ` + conn.evidence.map((e) => `${e.ok ? "✓" : "✗"} ${e.step}`).join(" → "));
  if (f.truncated) conn.signals.push("Homepage exceeded the size cap; only the first part was analysed.");
}

export async function rediscover(id: string) {
  const conn = getConn(id);
  conn.cache.clear();
  if (!conn.url) throw new Error("Nothing to re-test: the URL was never accepted.");
  try { await probe(conn); } catch (e) { setFatal(conn, e); }
  return conn;
}

// ---------- step 2: ownership verification ----------
export async function verifyOwnership(id: string) {
  const conn = getConn(id);
  if (!conn.origin || conn.fatal) throw new Error("Website is not reachable; nothing to verify.");
  const get = makeGet(conn);
  const attempts: Connection["ownership"]["attempts"] = [];
  const fail = (e: unknown) => (e instanceof SiteError ? e.message : (e as Error).message);

  try {
    const f = await get(conn.url!, "verify:meta-tag", "text/html");
    assertOk(f, "Page");
    const found = cheerio.load(f.body)(`meta[name="${META_NAME}"]`).attr("content")?.trim() ?? null;
    attempts.push({ method: "meta tag", ok: found === conn.token, detail: found ? (found === conn.token ? "Token matches" : "A verification tag exists but its token does not match this connection") : `No <meta name="${META_NAME}"> found on ${conn.url}` });
  } catch (e) { attempts.push({ method: "meta tag", ok: false, detail: fail(e) }); }

  if (!attempts[0]!.ok) {
    try {
      const f = await get(`${conn.origin}${WELL_KNOWN_FILE}`, "verify:well-known-file", "text/plain");
      const ok = f.status === 200 && f.body.trim() === conn.token;
      attempts.push({ method: "well-known file", ok, detail: ok ? "Token matches" : f.status === 200 ? "File exists but token does not match" : `HTTP ${f.status} at ${WELL_KNOWN_FILE}` });
    } catch (e) { attempts.push({ method: "well-known file", ok: false, detail: fail(e) }); }
  }

  if (!attempts.some((a) => a.ok)) {
    if (conn.controlled) attempts.push({ method: "DNS TXT", ok: false, detail: "Not available for this site" });
    else {
      const name = `${DNS_PREFIX}.${conn.host}`;
      const t0 = Date.now();
      try {
        const recs = await txtRecords(conn, name);
        const ok = recs.some((r) => r === conn.token);
        attempts.push({ method: "DNS TXT", ok, detail: ok ? "Token matches" : recs.length ? `TXT record(s) found at ${name} but none match` : `No TXT record at ${name}` });
        pushTrace(conn, { id: newId("req"), at: new Date().toISOString(), purpose: "verify:dns-txt", method: "DNS", url: name, status: ok ? "MATCH" : "NO MATCH", ms: Date.now() - t0, bytes: 0 });
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code ?? "ERROR";
        attempts.push({ method: "DNS TXT", ok: false, detail: code === "ENODATA" || code === "ENOTFOUND" ? `No TXT record at ${name}` : `DNS lookup failed (${code})` });
        pushTrace(conn, { id: newId("req"), at: new Date().toISOString(), purpose: "verify:dns-txt", method: "DNS", url: name, status: code, ms: Date.now() - t0, bytes: 0 });
      }
    }
  }
  conn.ownership.attempts = attempts;
  const win = attempts.find((a) => a.ok);
  conn.ownership.verified = !!win;
  conn.ownership.method = win?.method;
  if (!win) { conn.authorized = false; conn.grantedScopes = []; }
  return conn;
}

/** TXT lookup via the system resolver; if the resolver itself is unusable, fall back to a fixed DNS-over-HTTPS resolver. */
async function txtRecords(conn: Connection, name: string): Promise<string[]> {
  try {
    const recs = await Promise.race([resolveTxt(name), new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "TIMEOUT" })), 4000))]);
    return recs.map((r) => r.join("").trim());
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    const f = await safeGet(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { purpose: "verify:dns-txt (DoH fallback)", accept: "application/dns-json", maxBytes: 20_000, onTrace: (t) => pushTrace(conn, t) });
    const j = JSON.parse(f.body) as { Answer?: Array<{ type: number; data: string }> };
    return (j.Answer ?? []).filter((a) => a.type === 16).map((a) => a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, "").trim());
  }
}

// ---------- step 3: merchant authorization ----------
export function authorize(id: string, scopes: string[]) {
  const conn = getConn(id);
  if (!conn.ownership.verified) throw new Error("Ownership verification required before the merchant can authorize a connection.");
  conn.grantedScopes = scopes.filter((s): s is Scope => s in SCOPES);
  conn.authorized = true;
  audit(conn, "platform", "merchant authorization granted", "ok", conn.grantedScopes.join(", "));
  return conn;
}

// ---------- classification: the single source of truth for "what can the Agent use?" ----------
export type CapView = { cap: Cap | null; label: string; declaredId: string; via: string; state: CapState; reason: string; declared?: object };

/**
 * TRUST BOUNDARY. A capability reaches one of two access tiers, never blurred:
 *   trusted  = ownership verified AND merchant authorization granted AND scope granted  → the only route to CONNECTED
 *   public   = reachable website, public read-only structured data, NO ownership/authorization → untrusted testing mode
 * Everything else is awaiting_authorization or rejected and unusable (fail closed).
 */
export function evaluate(conn: Connection) {
  const usable = new Map<Cap, Connection["candidates"][number]>();
  const mode = new Map<Cap, "trusted" | "public">();
  const seenTrusted = new Set<Cap>();
  const seenPublic = new Set<Cap>();
  const owner = conn.ownership.verified;
  const results: CapView[] = new Array(conn.candidates.length);
  // Merchant-declared (manifest) sources are considered before public ones, so they win a trusted slot.
  const order = conn.candidates.map((_, i) => i).sort((x, y) => Number(conn.candidates[x]!.via !== "explicit manifest") - Number(conn.candidates[y]!.via !== "explicit manifest"));
  for (const i of order) {
    const c = conn.candidates[i]!;
    const label = c.cap ? CAPS[c.cap] : c.declaredId;
    const mk = (state: CapState, reason: string): CapView => ({ cap: c.cap, label, declaredId: c.declaredId, via: c.via, state, reason, declared: c.declared });
    if (c.rejected || !c.cap || !c.source) { results[i] = mk("rejected", c.rejected ?? "Rejected"); continue; }
    const scope = scopeOf(c.cap)!;
    const publicSource = c.via !== "explicit manifest";
    if (owner && conn.authorized) {
      if (!conn.grantedScopes.includes(scope)) { results[i] = mk("awaiting_authorization", `Capability discovered but not authorized: scope ${scope} not granted by merchant.`); continue; }
      if (seenTrusted.has(c.cap)) { results[i] = mk("rejected", "Superseded: another authorized source already provides this capability."); continue; }
      seenTrusted.add(c.cap); usable.set(c.cap, c); mode.set(c.cap, "trusted");
      results[i] = mk("enabled", ACTION_CAPS.has(c.cap) ? "TRUSTED — owner-authorized action (shopper approval applies)." : "TRUSTED — owner-authorized.");
      continue;
    }
    // Not (owner + authorized). Merchant-declared surfaces are never honoured here.
    if (!publicSource) { results[i] = mk("awaiting_authorization", owner ? "Capability discovered but not authorized: merchant has not granted scopes yet." : "Capability discovered but not authorized: website ownership not verified."); continue; }
    if (seenPublic.has(c.cap)) { results[i] = mk("rejected", "Superseded: another public source already provides this capability."); continue; }
    seenPublic.add(c.cap); usable.set(c.cap, c); mode.set(c.cap, "public");
    results[i] = mk("public", "UNTRUSTED public data — read-only, no ownership or authorization.");
  }
  const caps = results;

  const trusted = [...mode.values()].filter((m) => m === "trusted").length;
  const pub = [...mode.values()].filter((m) => m === "public").length;
  const trust: "trusted" | "public" | "none" = trusted ? "trusted" : pub ? "public" : "none";
  const discovered = caps.filter((c) => c.state !== "rejected").length;
  let status: ConnStatus;
  let headline: string;
  if (conn.fatal) { status = "FAILED"; headline = conn.fatal.message; }
  else if (trusted) { status = "CONNECTED"; headline = `Connected (trusted): ownership verified, merchant authorized, ${trusted} capabilit${trusted > 1 ? "ies" : "y"} allowed.`; }
  else if (pub) { status = "PUBLIC_DATA_DISCOVERED"; headline = `Public data discovered — NOT connected. ${conn.ownership.verified ? "Ownership is verified but the merchant has not authorized a connection." : "Ownership is not verified and nothing is authorized."} The Agent can only read this site in untrusted public-data mode.`; }
  else if (discovered) { status = conn.ownership.verified ? "REQUIRES_AUTHORIZATION" : "REQUIRES_VERIFICATION"; headline = conn.ownership.verified ? "Ownership verified. Merchant authorization (scope grant) is required before any capability is enabled." : "Website requires ownership verification. Capabilities were discovered but none are authorized."; }
  else { status = "UNSUPPORTED"; headline = conn.candidates.length ? "Website reachable. It advertises capabilities, but every one was rejected (see reasons below)." : "Website reachable, but no machine-readable commerce capabilities found."; }
  return { status, headline, caps, enabled: usable, mode, trust };
}

// ---------- the capability gateway: the ONLY path from the Agent to a website ----------
export type CallResult = {
  cap: Cap;
  mode?: "trusted" | "public";
  ok: boolean;
  request: string;
  traceIds: string[];
  status?: number | string;
  result?: OpResult;
  flags: Flag[];
  error?: { code: string; message: string };
};

export type Ctx = { actor: "agent" | "shopper" | "platform" };

/**
 * Policy decision point for every capability call.
 *   READ  : any enabled capability (trusted or public tier).
 *   ACT   : trusted tier only. cart.add = low impact, checkout.start = medium (nothing is charged),
 *           order.place = HIGH impact: only callable by the shopper actor with a signed approval bound to the exact checkout and amount.
 */
export async function invoke(id: string, cap: Cap, input: OpArgs = {}, ctx: Ctx = { actor: "agent" }): Promise<CallResult> {
  const conn = getConn(id);
  const args: OpArgs = { ...input };
  const ev = evaluate(conn);
  const cand = ev.enabled.get(cap);
  const deny = (code: string, message: string): CallResult => {
    const t: TraceEntry = { id: newId("req"), at: new Date().toISOString(), purpose: `gateway:${cap}`, method: "GET", url: "(not sent)", status: "DENIED", ms: 0, bytes: 0, note: message };
    pushTrace(conn, t);
    audit(conn, ctx.actor, cap, "denied", message);
    return { cap, ok: false, request: "(not sent)", traceIds: [t.id], status: "DENIED", flags: [], error: { code, message } };
  };
  if (!cand) return deny("NOT_AUTHORIZED", `Capability ${cap} is not enabled for this connection (fail closed).`);
  const isAction = ACTION_CAPS.has(cap);
  if (isAction && ev.mode.get(cap) !== "trusted") return deny("NOT_AUTHORIZED", `${cap} requires a trusted, merchant-authorized connection.`);

  if (cap === "cart.add" || cap === "cart.read") args.cartId ??= conn.cartId;
  if (cap === "checkout.start") args.cartId ??= conn.cartId;
  if (cap === "order.read" && (!args.orderId || !conn.orders[args.orderId])) return deny("NOT_AUTHORIZED", "Only orders placed through this connection can be read.");
  if (cap === "order.place") {
    const co = args.checkoutId ? conn.checkouts[args.checkoutId] : undefined;
    if (ctx.actor !== "shopper") return deny("APPROVAL_REQUIRED", "Placing an order requires the shopper's explicit approval.");
    if (!co || co.total === undefined) return deny("NOT_AUTHORIZED", "No pending checkout to approve.");
    if (!verifyApproval(conn.id, co.id, args.approval as Approval | undefined, { amount: co.total, currency: co.currency })) return deny("APPROVAL_INVALID", "The shopper approval is missing, expired, or does not match this checkout.");
  }

  const mine: TraceEntry[] = [];
  try {
    let raw: OpResult;
    try {
      raw = await runOp(conn, cand, cap, args, makeGet(conn, (t) => mine.push(t), isAction));
    } catch (first) {
      // The merchant lost our cart (e.g. it restarted): start a fresh one instead of failing the shopper.
      if (cap === "cart.add" && args.cartId && first instanceof SiteError && /unknown cart/i.test(first.message)) {
        conn.cartId = undefined;
        raw = await runOp(conn, cand, cap, { ...args, cartId: undefined }, makeGet(conn, (t) => mine.push(t), isAction));
      } else throw first;
    }
    const flags: Flag[] = [];
    const result = sanitize(raw, "", flags) as OpResult;
    conn.flagsSeen += flags.length;
    // remember merchant-side commerce state created through this connection
    if (result.cap === "cart.add" || result.cap === "cart.read") conn.cartId = result.cart.id;
    if (result.cap === "checkout.start") conn.checkouts[result.checkout.id] = result.checkout;
    if (result.cap === "order.place") {
      conn.orders[result.order.id] = result.order; conn.cartId = undefined;
      const done = conn.checkouts[String(args.checkoutId)];
      if (done) done.status = "completed";
    }
    if (isAction) audit(conn, ctx.actor, cap, "ok", IMPACT[cap] ? `impact ${IMPACT[cap]}` : undefined);
    const last = mine[mine.length - 1];
    const lastUrl = last ? new URL(last.url) : null;
    return { cap, mode: ev.mode.get(cap), ok: true, request: lastUrl ? `${last!.method} ${lastUrl.pathname}${lastUrl.search}` : "(served from a ≤30s cache of an earlier fetch)", traceIds: mine.map((t) => t.id), status: last?.status ?? "cache", result, flags };
  } catch (e) {
    const raw = e instanceof SiteError ? e : new SiteError("NETWORK_ERROR", (e as Error).message);
    const err = Object.assign(raw, { message: String(sanitize(raw.message, "error", [])) }); // merchant-supplied text is untrusted
    if (isAction) audit(conn, ctx.actor, cap, "error", err.message);
    const last = mine[mine.length - 1];
    return { cap, ok: false, request: last ? `${last.method} ${new URL(last.url).pathname}` : "(not sent)", traceIds: mine.map((t) => t.id), status: last?.status, flags: [], error: { code: err.code, message: err.message } };
  }
}

/** The ONLY way an order is placed: the shopper confirms an exact pending checkout in the UI. */
export async function approvePurchase(id: string, checkoutId: string): Promise<CallResult> {
  const conn = getConn(id);
  const co = conn.checkouts[checkoutId];
  if (!co || co.total === undefined) throw new Error("There is no pending checkout to confirm.");
  if (co.status === "completed") throw new Error("This checkout has already been completed.");
  const approval = signApproval(conn.id, co.id, co.total, co.currency);
  audit(conn, "shopper", "approved purchase", "ok", `${co.id} · ${co.total}${co.currency ? " " + co.currency : ""}`);
  return invoke(id, "order.place", { checkoutId: co.id, approval }, { actor: "shopper" });
}

// ---------- view model for the UI ----------
/** A small sample of what the site publicly exposes (from catalogs already fetched; never from manifest endpoints). */
function topCategories(cats: Array<string | undefined>) {
  const n = new Map<string, number>();
  for (const c of cats) if (c) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 4);
}

function previewOf(conn: Connection) {
  for (const [k, v] of conn.cache) {
    const items = k.startsWith("cat:") ? (v.value as Array<{ name: string; price?: number; currency?: string; image?: string; category?: string }>) : [];
    if (items.length) return { total: items.length, products: items.slice(0, 4).map((p) => ({ name: p.name, price: p.price, currency: p.currency, image: p.image })), categories: topCategories(items.map((p) => p.category)), prices: items.map((p) => p.price).filter((n): n is number => typeof n === "number") };
  }
  return null;
}

export function view(conn: Connection) {
  const ev = evaluate(conn);
  const last = [...conn.trace].reverse().find((t) => t.status !== "DENIED") ?? conn.trace[conn.trace.length - 1];
  const owner = conn.ownership;
  const granted = conn.grantedScopes;
  return {
    id: conn.id,
    input: conn.input,
    url: conn.url,
    host: conn.host,
    name: conn.siteName ?? conn.host ?? conn.input.slice(0, 40),
    ecommerce: conn.ecommerce,
    classification: conn.classification,
    platform: conn.platform,
    site: conn.site,
    preview: previewOf(conn),
    status: ev.status,
    headline: ev.headline,
    fatal: conn.fatal,
    ownership: {
      verified: owner.verified,
      text: owner.verified ? `Verified via ${owner.method}` : owner.attempts.length ? "Verification attempted — NOT verified" : "Not verified — entering a URL does not prove ownership",
      attempts: owner.attempts,
      token: conn.token,
      instructions: conn.host && !conn.fatal ? {
        meta: `<meta name="${META_NAME}" content="${conn.token}">`,
        metaWhere: conn.url,
        file: { path: `${conn.origin}${WELL_KNOWN_FILE}`, content: conn.token },
        dns: conn.controlled ? null : { name: `${DNS_PREFIX}.${conn.host}`, type: "TXT", value: conn.token },
      } : null,
    },
    authorization: {
      text: conn.authorized ? `Owner-authorized scopes: ${granted.join(", ") || "none"}` : ev.trust === "public" ? "None — untrusted public-data mode only (no ownership, no authorization)" : "None",
      authorized: conn.authorized,
      granted,
    },
    discovery: { methods: conn.discoveryMethods, signals: conn.signals, evidence: conn.evidence },
    capabilities: ev.caps,
    enabledCaps: [...ev.enabled.keys()],
    trust: ev.trust,
    last: last ? { id: last.id, method: last.method, url: last.url, status: last.status, ms: last.ms, purpose: last.purpose, note: last.note } : null,
    trace: conn.trace.slice(-40).reverse(),
    audit: conn.audit.slice(-40).reverse(),
    commerce: { cartId: conn.cartId ?? null, orders: Object.values(conn.orders) },
    flagsSeen: conn.flagsSeen,
    createdAt: conn.createdAt,
  };
}

/** After a trusted connection, read the catalog once (through the gateway) so the UI can show a preview and tailored prompts. */
export async function warmPreview(id: string) {
  const conn = getConn(id);
  if (evaluate(conn).trust !== "trusted") return;
  const r = await invoke(id, "catalog.read", {});
  if (r.ok && r.result?.cap === "catalog.read" && r.result.products.length) conn.cache.set("cat:manifest", { at: Date.now(), value: r.result.products });
}

export const listViews = () => [...conns.values()].reverse().map(view);

/** Connections currently trusted (verified + authorized): the stores that make up the shopper's mall. */
export const trustedConnections = () => {
  const byOrigin = new Map<string, Connection>(); // one entry per site: the most recent connection wins
  for (const c of conns.values()) if (evaluate(c).trust === "trusted" && c.origin) byOrigin.set(c.origin, c);
  return [...byOrigin.values()];
};

/** A shopper explicitly chose to visit the merchant: the only moment a human visit is recorded. */
export function recordVisit(id: string, url: string) {
  const conn = getConn(id);
  audit(conn, "shopper", "approved visit to merchant", "ok", url);
}
