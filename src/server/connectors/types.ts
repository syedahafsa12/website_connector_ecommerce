import type { InventoryInfo, Offer, ReturnsInfo, ShippingInfo, WarrantyInfo } from "@/server/offers/types";

export interface SearchProductsInput {
  query: string;
  filters?: {
    maxPrice?: number;
    color?: string;
    freeShippingOnly?: boolean;
    minReturnDays?: number;
  };
}

/**
 * Common contract every merchant integration mechanism implements. The
 * shopping agent and capability router only ever talk to this interface —
 * never to REST/MCP/web specifics directly.
 */
export interface MerchantConnector {
  readonly merchantId: string;
  readonly kind: "rest" | "mcp" | "web";
  searchProducts(input: SearchProductsInput): Promise<Offer[]>;
  getProduct(productId: string): Promise<Offer>;
  getInventory(productId: string): Promise<InventoryInfo & { retrievedAt: string }>;
  getShipping(productId: string): Promise<ShippingInfo>;
  getReturns(productId: string): Promise<ReturnsInfo>;
  getWarranty(productId: string): Promise<WarrantyInfo>;
}
