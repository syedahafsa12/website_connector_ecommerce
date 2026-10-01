import type { Offer } from "@/server/offers/types";
import { computeIsStale } from "@/server/offers/types";
import { scanForUntrustedContent } from "@/server/security/content-scanner";
import type { MerchantConnector, SearchProductsInput } from "./types";

interface RestProductWire {
  id: string;
  title: string;
  description: string;
  category: "product" | "service";
  price: number;
  currency: string;
  color: string | null;
  quantity: number | null;
  shipping: { isFree: boolean; cost: number | null; estimatedDays: number | null; available: boolean };
  returns: { windowDays: number | null; isFreeReturns: boolean; notes?: string };
  warranty: { months: number | null; notes?: string };
  retrievedAt: string;
}

function toOffer(merchantId: string, merchantName: string, wire: RestProductWire): Offer {
  const contentFlags = [
    ...scanForUntrustedContent("title", wire.title),
    ...scanForUntrustedContent("description", wire.description),
  ];
  return {
    merchantId,
    merchantName,
    productId: wire.id,
    title: wire.title,
    description: wire.description,
    category: wire.category,
    price: { amount: wire.price, currency: wire.currency },
    attributes: wire.color ? { color: wire.color } : {},
    availability: { inStock: (wire.quantity ?? 1) > 0, quantity: wire.quantity },
    shipping: wire.shipping,
    returnPolicy: wire.returns,
    warranty: wire.warranty,
    source: "rest",
    retrievedAt: wire.retrievedAt,
    isStale: computeIsStale(wire.retrievedAt),
    contentFlags,
  };
}

export class RestMerchantConnector implements MerchantConnector {
  readonly kind = "rest" as const;

  constructor(
    readonly merchantId: string,
    private readonly merchantName: string,
    private readonly baseUrl: string,
  ) {}

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`REST connector call to ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async searchProducts(input: SearchProductsInput): Promise<Offer[]> {
    const params = new URLSearchParams();
    if (input.query) params.set("query", input.query);
    const { products } = await this.getJson<{ products: RestProductWire[] }>(`/products?${params.toString()}`);
    return products.map((p) => toOffer(this.merchantId, this.merchantName, p));
  }

  async getProduct(productId: string): Promise<Offer> {
    const wire = await this.getJson<RestProductWire>(`/products/${productId}`);
    return toOffer(this.merchantId, this.merchantName, wire);
  }

  async getInventory(productId: string) {
    return this.getJson<{ inStock: boolean; quantity: number | null; retrievedAt: string }>(
      `/products/${productId}/inventory`,
    );
  }

  async getShipping(productId: string) {
    return this.getJson<Offer["shipping"]>(`/products/${productId}/shipping`);
  }

  async getReturns(productId: string) {
    return this.getJson<Offer["returnPolicy"]>(`/products/${productId}/returns`);
  }

  async getWarranty(productId: string) {
    return this.getJson<Offer["warranty"]>(`/products/${productId}/warranty`);
  }
}
