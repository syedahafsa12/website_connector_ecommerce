export interface Money {
  amount: number;
  currency: string;
}

export interface ShippingInfo {
  isFree: boolean;
  cost: number | null;
  estimatedDays: number | null;
  available: boolean;
}

export interface ReturnsInfo {
  windowDays: number | null;
  isFreeReturns: boolean;
  notes?: string;
}

export interface WarrantyInfo {
  months: number | null;
  notes?: string;
}

export interface InventoryInfo {
  inStock: boolean;
  quantity: number | null;
}

export interface ContentFlag {
  field: string;
  pattern: string;
  excerpt: string;
}

export type ConnectorKind = "rest" | "mcp" | "web";

/**
 * The normalized shape every connector must produce, regardless of the
 * underlying integration mechanism. This is the foundation the agent, the
 * requirement matcher, and merchant insight all build on.
 */
export interface Offer {
  merchantId: string;
  merchantName: string;
  productId: string;
  title: string;
  description: string;
  category: "product" | "service";
  price: Money;
  attributes: Record<string, string>;
  availability: InventoryInfo;
  shipping: ShippingInfo;
  returnPolicy: ReturnsInfo;
  warranty: WarrantyInfo;
  source: ConnectorKind;
  retrievedAt: string;
  isStale: boolean;
  contentFlags: ContentFlag[];
}

export const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export function computeIsStale(retrievedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(retrievedAt).getTime() > STALE_THRESHOLD_MS;
}
