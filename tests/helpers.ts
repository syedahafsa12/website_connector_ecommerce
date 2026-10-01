import http from "node:http";
import type { AddressInfo } from "node:net";
import { tokenFor, verifyApproval } from "@/server/connect/trust";

export const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));

type P = { id: string; name: string; price: number; quantity: number; category: string; description: string; colors?: Array<{ name: string }>; sizes?: string[] };
type Cart = { id: string; items: Array<{ productId: string; name: string; price: number; quantity: number }> };

/** A small, real HTTP merchant website: manifest, catalog, policies, cart, checkout, and an order endpoint that enforces shopper approval. */
export function merchant(opts: { name: string; products: P[]; policies?: Record<string, unknown> }) {
  let origin = "";
  const hits: Record<string, number> = {};
  const carts = new Map<string, Cart>();
  const checkouts = new Map<string, { id: string; total: number; status: string }>();
  const orders: Array<Record<string, unknown>> = [];
  const manifest = {
    schema: "agentic-capabilities/0.1",
    capabilities: [
      { id: "search_products", scope: "catalog:read", risk: "read", method: "GET", path: "/api/products" },
      { id: "get_product", scope: "catalog:read", risk: "read", method: "GET", path: "/api/products/{id}" },
      { id: "check_availability", scope: "inventory:read", risk: "read", method: "GET", path: "/api/products/{id}/availability" },
      { id: "get_policies", scope: "policies:read", risk: "read", method: "GET", path: "/api/policies" },
      { id: "add_to_cart", scope: "commerce:act", risk: "action", method: "POST", path: "/api/cart/items" },
      { id: "begin_checkout", scope: "commerce:act", risk: "action", method: "POST", path: "/api/checkout" },
      { id: "place_order", scope: "commerce:act", risk: "action", method: "POST", path: "/api/orders" },
    ],
  };
  const body = (req: http.IncomingMessage) => new Promise<any>((res) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { res(JSON.parse(s || "{}")); } catch { res({}); } }); });
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, origin);
    const p = u.pathname;
    hits[p] = (hits[p] ?? 0) + 1;
    const send = (status: number, j: unknown, type = "application/json") => { res.writeHead(status, { "content-type": type }); res.end(typeof j === "string" ? j : JSON.stringify(j)); };
    if (p === "/") return send(200, `<html><head><title>${opts.name}</title><meta name="agentic-commerce-verification" content="${tokenFor(origin)}"></head><body>Add to cart $10</body></html>`, "text/html");
    if (p === "/api/capabilities") return send(200, manifest);
    if (p === "/api/policies") return send(200, opts.policies ?? { returns: { notes: `${opts.name} accepts returns within 30 days.` }, shipping: { notes: "Free shipping over $100." }, warranty: { notes: "1 year warranty." } });
    if (p === "/api/products") {
      const q = (u.searchParams.get("query") ?? "").toLowerCase();
      const max = u.searchParams.get("maxPrice") ? Number(u.searchParams.get("maxPrice")) : Infinity;
      return send(200, { products: opts.products.filter((x) => (!q || `${x.name} ${x.category} ${x.description}`.toLowerCase().includes(q)) && x.price <= max).map((x) => ({ ...x, currency: "USD", inStock: x.quantity > 0, url: `/p/${x.id}` })) });
    }
    let m = p.match(/^\/api\/products\/([^/]+)(\/availability)?$/);
    if (m) { const x = opts.products.find((q) => q.id === m![1]); if (!x) return send(404, { error: "no" }); return send(200, m[2] ? { id: x.id, inStock: x.quantity > 0, quantity: x.quantity } : { ...x, currency: "USD", inStock: x.quantity > 0, url: `/p/${x.id}` }); }
    if (p === "/api/cart/items" && req.method === "POST") {
      const b = await body(req); const x = opts.products.find((q) => q.id === b.productId);
      if (!x) return send(404, { error: "Unknown product." });
      const cart: Cart = (b.cartId && carts.get(b.cartId)) || { id: "cart_" + carts.size, items: [] };
      cart.items.push({ productId: x.id, name: x.name, price: x.price, quantity: b.quantity ?? 1 }); carts.set(cart.id, cart);
      return send(200, { id: cart.id, items: cart.items, currency: "USD" });
    }
    if (p === "/api/checkout" && req.method === "POST") {
      const b = await body(req); const c = carts.get(b.cartId); if (!c) return send(400, { error: "The cart is empty." });
      const sub = c.items.reduce((t, i) => t + i.price * i.quantity, 0);
      const co = { id: "chk_" + checkouts.size, total: sub + 5, status: "awaiting_confirmation" }; checkouts.set(co.id, co);
      return send(200, { ...co, items: c.items, subtotal: sub, shipping: 5, tax: null, currency: "USD", cartId: c.id });
    }
    if (p === "/api/orders" && req.method === "POST") {
      const b = await body(req); const co = checkouts.get(b.checkoutId);
      if (!co) return send(404, { error: "Unknown checkout." });
      if (!verifyApproval(String(req.headers["x-platform-connection"]), co.id, b.approval, { amount: co.total, currency: "USD" })) return send(403, { error: "Shopper approval is missing or invalid." });
      co.status = "completed"; const o = { id: "ord_" + orders.length, status: "pending_payment", total: co.total, currency: "USD" }; orders.push(o);
      return send(201, o);
    }
    return send(404, { error: "not found" });
  });
  return {
    server, hits, orders,
    async start() { const port = await listen(server); origin = `http://127.0.0.1:${port}`; return origin; },
    get origin() { return origin; },
  };
}

/** A storefront that looks like Shopify (platform markers + /products.json) — no domain is configured anywhere. */
export function shopifyLike() {
  let origin = "";
  const server = http.createServer((req, res) => {
    const p = new URL(req.url!, origin).pathname;
    if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<html><head><title>Wool Co</title><script src="https://cdn.shopify.com/s/files/x.js"></script></head><body>Add to cart · Shop wool $98</body></html>`); }
    if (p === "/products.json") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ products: [{ id: 1, handle: "wool-runner", title: "Wool Runner", product_type: "shoes", body_html: "<p>Soft wool.</p>", options: [{ name: "Size", values: ["8", "9"] }], variants: [{ price: "98.00", available: true }], images: [] }] })); }
    res.writeHead(404); res.end();
  });
  return { server, async start() { const port = await listen(server); origin = `http://127.0.0.1:${port}`; return origin; } };
}

/** A plain page with nothing machine-readable. */
export function plainSite() {
  let origin = "";
  const server = http.createServer((req, res) => { res.writeHead(req.url === "/" ? 200 : 404, { "content-type": "text/html" }); res.end("<html><head><title>Hello</title></head><body>Welcome. Contact us.</body></html>"); });
  return { server, async start() { const port = await listen(server); origin = `http://127.0.0.1:${port}`; return origin; } };
}

type Step = { tool_calls?: Array<{ name: string; args: object }>; content?: string };
/** A model endpoint that follows a script, so the Agent's real tool loop runs offline. */
export function mockMistral(script: Step[]) {
  const seen: any[] = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    let s = ""; req.on("data", (c) => (s += c));
    req.on("end", () => {
      const body = JSON.parse(s); seen.push({ auth: req.headers.authorization, body });
      const step = script[Math.min(n++, script.length - 1)]!;
      const message = step.tool_calls
        ? { role: "assistant", content: "", tool_calls: step.tool_calls.map((t, i) => ({ id: `c${n}${i}`, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })) }
        : { role: "assistant", content: step.content ?? "ok" };
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });
  return { server, seen };
}
