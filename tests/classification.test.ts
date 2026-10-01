import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { discover } from "@/server/connect/discovery";
import { evaluate } from "@/server/connect/service";
import type { Connection } from "@/server/connect/types";

const blank = (): Connection => ({
  id: "t", input: "", url: "https://x.test/", origin: "https://x.test", host: "x.test", controlled: false, ecommerce: false, site: {}, token: "acv_x", createdAt: "",
  ownership: { verified: false, attempts: [] }, authorized: false, grantedScopes: [], candidates: [], signals: [], discoveryMethods: [], trace: [], flagsSeen: 0, cache: new Map(), accessToken: "cat_t", checkouts: {}, orders: {}, audit: [], chat: [], evidence: [],
});

/** A fake site: path -> HTML. Counts fetches so the sample can be shown to be bounded. */
function site(pages: Record<string, string>) {
  const hits: string[] = [];
  const get = async (url: string) => {
    const p = new URL(url).pathname;
    hits.push(p);
    const body = pages[p];
    const status = body === undefined ? 404 : 200;
    return { status, headers: { "content-type": p.endsWith(".xml") ? "application/xml" : "text/html" }, body: body ?? "", truncated: false,
      trace: { id: "r", at: "", purpose: "", method: "GET" as const, url, status, ms: 0, bytes: 0 } };
  };
  return { get, hits, home: pages["/"] ?? "" };
}
const run = async (pages: Record<string, string>) => {
  const s = site(pages); const c = blank();
  await discover(c, s.home, s.get as never);
  return { c, hits: s.hits, k: c.classification! };
};
const page = (title: string, body: string, head = "") => `<html><head><title>${title}</title>${head}</head><body>${body}</body></html>`;
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const lorem = "Our story, our people and what we care about. ".repeat(8);

// --- unfamiliar sites, none of which the classifier has any knowledge of ---
const cards = (n: number) => Array.from({ length: n }, (_, i) => `<div class="c"><a href="/items/handmade-thing-${1000 + i}"><img src="/i/${i}.jpg"><h3>Thing ${i}</h3><span>$${10 + i}.00</span></a></div>`).join("");
const itemPage = (i: number) => page(`Thing ${i}`, `<h1>Thing ${i}</h1><p>${lorem}</p><span>$${10 + i}.00</span><form action="/basket/add" method="post"><input type="hidden" name="sku" value="${i}"><button>Add</button></form>`);
const storeSite = () => {
  const pages: Record<string, string> = { "/": page("Kettle & Co", `<nav><a href="/basket">Basket</a></nav>${cards(8)}`) };
  for (let i = 0; i < 8; i++) pages[`/items/handmade-thing-${1000 + i}`] = itemPage(i);
  return pages;
};

describe("dynamic website classification (evidence, not names)", () => {
  it("unknown store with no schema.org data and no platform: recognised from listing cards, cart control and page structure", async () => {
    const { k, c } = await run(storeSite());
    expect(k.classification).toBe("ECOMMERCE");
    expect(k.confidence).toBeGreaterThan(0.7);
    expect(k.evidence.join(" ")).toMatch(/listing cards/);
    expect(k.capabilities).toEqual(expect.arrayContaining(["product.discovery", "offer.price", "cart.signal"]));
    expect(c.ecommerce).toBe(true);
  });

  it("store whose homepage has bare links: product structured data on sampled pages decides", async () => {
    const pages: Record<string, string> = { "/": page("Aurora Goods", `<p>${lorem}</p>` + Array.from({ length: 6 }, (_, i) => `<a href="/g/AB12CD3${i}EF">Item</a>`).join("")) };
    for (let i = 0; i < 6; i++) pages[`/g/AB12CD3${i}EF`] = page("Item", `<p>${lorem}</p>` + ld({ "@context": "https://schema.org", "@type": "Product", name: `Item ${i}`, sku: `s${i}`, offers: { "@type": "Offer", price: "25", priceCurrency: "USD", availability: "https://schema.org/InStock" } }));
    const { k } = await run(pages);
    expect(k.classification).toBe("ECOMMERCE");
    expect(k.capabilities).toContain("availability.signal");
  });

  it("marketplace: commerce evidence plus several independent sellers in offer data", async () => {
    const pages: Record<string, string> = { "/": page("Bazaar", `<p>${lorem}</p>` + Array.from({ length: 4 }, (_, i) => `<a href="/listing/${5000 + i}">x</a>`).join("")) };
    for (let i = 0; i < 4; i++) pages[`/listing/${5000 + i}`] = page("L", `<p>${lorem}</p>` + ld({ "@type": "Product", name: `L${i}`, offers: { "@type": "Offer", price: "9", priceCurrency: "USD", seller: { "@type": "Organization", name: `Seller ${i}` } } }));
    const { k } = await run(pages);
    expect(k.classification).toBe("MARKETPLACE");
    expect(k.capabilities).toContain("seller.discovery");
  });

  it("unknown service provider with business-profile data and no commerce", async () => {
    const pages: Record<string, string> = {
      "/": page("Northside Smiles", `<p>${lorem}</p><a href="tel:+15550100">Call</a><address>1 Main St</address>` + ["whitening", "implants", "braces", "checkups"].map((x) => `<a href="/treatments/${x}">${x}</a>`).join("") +
        ld({ "@context": "https://schema.org", "@type": "Dentist", name: "Northside Smiles", telephone: "+15550100", address: { "@type": "PostalAddress", streetAddress: "1 Main St" }, openingHours: "Mo-Fr 09:00-17:00" })),
    };
    for (const x of ["whitening", "implants", "braces", "checkups"]) pages[`/treatments/${x}`] = page(x, `<p>${lorem}</p>`);
    const { k, c } = await run(pages);
    expect(k.classification).toBe("SERVICE");
    expect(k.capabilities).toEqual(expect.arrayContaining(["service.discovery", "contact.discovery"]));
    expect(c.ecommerce).toBe(false);
  });

  it("unknown service provider with no structured data: appointment form, phone, address, enquiry form", async () => {
    const pages = { "/": page("Hartley & Moss", `<p>${lorem}</p><a href="tel:+15550111">Call us</a><address>2 High St</address>
      <form action="/book"><input type="date" name="d"><input type="time" name="t"><input type="email" name="e"></form>
      <form action="/enquire"><textarea name="m"></textarea><input type="email" name="email"></form>`) };
    const { k } = await run(pages);
    expect(k.classification).toBe("SERVICE");
    expect(k.capabilities).toContain("appointment.discovery");
  });

  it("content site: article markup, feed and dated URLs", async () => {
    const pages = { "/": page("The Ledger", `<article>a</article><article>b</article><article>c</article><a href="/2024/05/one">1</a><a href="/2024/06/two">2</a><a href="/2024/07/three">3</a><p>${lorem}</p>`, `<link rel="alternate" type="application/rss+xml" href="/feed">`) };
    const { k } = await run(pages);
    expect(k.classification).toBe("CONTENT");
  });

  it("a plain brochure site is OTHER, and an empty script shell is UNKNOWN", async () => {
    expect((await run({ "/": page("Quiet Co", `<p>${lorem}</p>`) })).k.classification).toBe("OTHER");
    expect((await run({ "/": page("App", `<div id="root"></div><script>render()</script>`) })).k.classification).toBe("UNKNOWN");
  });
});

describe("keywords are never the rule", () => {
  it("prose about shopping, booking, carts and checkout does not make a store or a service", async () => {
    const prose = "How to shop smart: add to cart, then checkout. Booking an appointment? Book now. Our shop, our booking policy. ".repeat(6);
    const { k, c } = await run({ "/": page("A blog about shopping", `<p>${prose}</p>`) });
    expect(["ECOMMERCE", "MARKETPLACE", "SERVICE"]).not.toContain(k.classification);
    expect(c.ecommerce).toBe(false);
  });

  it("a /products/ URL structure with no prices, offers or cart is not a store (software docs)", async () => {
    const pages: Record<string, string> = { "/": page("Docs", `<p>${lorem}</p>` + Array.from({ length: 8 }, (_, i) => `<a href="/products/tool-${i}">t</a>`).join("")) };
    for (let i = 0; i < 8; i++) pages[`/products/tool-${i}`] = page("Tool", `<p>${lorem}</p>`);
    expect((await run(pages)).k.classification).not.toBe("ECOMMERCE");
  });

  it("a price list for services (no cart, no offers, no listing cards) is not a store", async () => {
    const pages: Record<string, string> = { "/": page("Brightline Repairs", `<p>${lorem} Screen repair $89. Battery $49. Diagnostics $29.</p><a href="tel:+1555">Call</a><address>3 Elm</address>` + ["screen", "battery", "water", "data", "diagnostics"].map((x) => `<a href="/repairs/${x}">${x}</a>`).join("")) };
    for (const x of ["screen", "battery", "water", "data", "diagnostics"]) pages[`/repairs/${x}`] = page(x, `<p>${lorem} From $49.</p>`);
    const { k } = await run(pages);
    expect(k.classification).not.toBe("ECOMMERCE");
    expect(k.classification).not.toBe("MARKETPLACE");
  });
});

describe("classification is descriptive only", () => {
  it("a detected store is still untrusted: not verified, not authorized, nothing trusted", async () => {
    const { c } = await run(storeSite());
    const ev = evaluate(c);
    expect(c.classification?.classification).toBe("ECOMMERCE");
    expect(c.ownership.verified).toBe(false);
    expect(c.authorized).toBe(false);
    expect(ev.trust).not.toBe("trusted");
    expect(ev.status).not.toBe("CONNECTED");
  });

  it("the sample stays small even for a site with hundreds of pages", async () => {
    const pages: Record<string, string> = { "/": page("Big", `<p>${lorem}</p>` + Array.from({ length: 300 }, (_, i) => `<a href="/items/n-${i}">i</a>`).join("")) };
    for (let i = 0; i < 300; i++) pages[`/items/n-${i}`] = itemPage(i);
    pages["/sitemap.xml"] = `<urlset>${Array.from({ length: 300 }, (_, i) => `<url><loc>https://x.test/items/n-${i}</loc></url>`).join("")}</urlset>`;
    const { hits } = await run(pages);
    expect(hits.length).toBeLessThanOrEqual(16);
  });

  it("no domain names or brand rules in the classifier or discovery code", () => {
    for (const f of ["src/server/connect/classify.ts", "src/server/connect/discovery.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/amazon|ebay|etsy|walmart|alibaba|booking\.com/i);
    }
  });
});
