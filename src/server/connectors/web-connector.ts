import * as cheerio from "cheerio";
import type { Offer } from "@/server/offers/types";
import { computeIsStale, placeholderImage } from "@/server/offers/types";
import { scanForUntrustedContent } from "@/server/security/content-scanner";
import type { MerchantConnector, SearchProductsInput } from "./types";

export interface WebConnectorConfig {
  baseUrl: string;
  pagePaths: string[]; // targeted, known pages — not a crawler
}

interface SchemaOrgOffer {
  price?: string;
  priceCurrency?: string;
  availability?: string;
}
interface SchemaOrgProperty {
  name?: string;
  value?: string;
}
interface SchemaOrgLd {
  "@type"?: string;
  name?: string;
  description?: string;
  image?: string;
  offers?: SchemaOrgOffer;
  additionalProperty?: SchemaOrgProperty[];
}

function propMap(ld: SchemaOrgLd): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of ld.additionalProperty ?? []) {
    if (p.name) map[p.name] = p.value ?? "";
  }
  return map;
}

async function fetchJsonLd(url: string): Promise<SchemaOrgLd | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Web connector fetch of ${url} failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const script = $('script[type="application/ld+json"]').first().html();
  if (!script) return null;
  return JSON.parse(script) as SchemaOrgLd;
}

function ldToOffer(merchantId: string, merchantName: string, ld: SchemaOrgLd): Offer {
  const props = propMap(ld);
  const title = ld.name ?? "";
  const description = ld.description ?? "";
  const contentFlags = [...scanForUntrustedContent("title", title), ...scanForUntrustedContent("description", description)];
  const retrievedAt = props.retrievedAt || new Date().toISOString();
  const windowDaysRaw = props.returnWindowDays;
  const warrantyMonthsRaw = props.warrantyMonths;
  const productId = props.productId ?? "";
  return {
    merchantId,
    merchantName,
    productId,
    title,
    description,
    category: ld["@type"] === "Service" ? "service" : "product",
    price: { amount: Number(ld.offers?.price ?? 0), currency: ld.offers?.priceCurrency ?? "USD" },
    image: ld.image ?? placeholderImage(merchantId, productId),
    attributes: {},
    availability: {
      inStock: ld.offers?.availability === "https://schema.org/InStock",
      quantity: null,
    },
    shipping: {
      isFree: false,
      cost: null,
      estimatedDays: null,
      available: props.shippingAvailable === "true",
    },
    returnPolicy: {
      windowDays: windowDaysRaw ? Number(windowDaysRaw) : null,
      isFreeReturns: props.freeReturns === "true",
      notes: props.returnNotes || undefined,
    },
    warranty: {
      months: warrantyMonthsRaw ? Number(warrantyMonthsRaw) : null,
      notes: props.warrantyNotes || undefined,
    },
    source: "web",
    retrievedAt,
    isStale: computeIsStale(retrievedAt),
    contentFlags,
  };
}

export class WebMerchantConnector implements MerchantConnector {
  readonly kind = "web" as const;

  constructor(
    readonly merchantId: string,
    private readonly merchantName: string,
    private readonly config: WebConnectorConfig,
  ) {}

  async searchProducts(_input: SearchProductsInput): Promise<Offer[]> {
    const offers: Offer[] = [];
    for (const path of this.config.pagePaths) {
      const ld = await fetchJsonLd(`${this.config.baseUrl}${path}`);
      if (ld) offers.push(ldToOffer(this.merchantId, this.merchantName, ld));
    }
    return offers;
  }

  private pathForProduct(productId: string): string {
    const match = this.config.pagePaths.find((p) => p.endsWith(`/${productId}`));
    if (!match) throw new Error(`No known page for product ${productId}`);
    return match;
  }

  async getProduct(productId: string): Promise<Offer> {
    const ld = await fetchJsonLd(`${this.config.baseUrl}${this.pathForProduct(productId)}`);
    if (!ld) throw new Error(`No structured data found for ${productId}`);
    return ldToOffer(this.merchantId, this.merchantName, ld);
  }

  async getInventory(productId: string) {
    const offer = await this.getProduct(productId);
    return { ...offer.availability, retrievedAt: offer.retrievedAt };
  }

  async getShipping(productId: string) {
    return (await this.getProduct(productId)).shipping;
  }

  async getReturns(productId: string) {
    return (await this.getProduct(productId)).returnPolicy;
  }

  async getWarranty(productId: string) {
    return (await this.getProduct(productId)).warranty;
  }
}
