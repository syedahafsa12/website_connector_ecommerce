import { z } from "zod";

export type RiskLevel = "READ" | "WRITE" | "HIGH_RISK";
export type ScopeCategory = "products" | "inventory" | "shipping" | "returns" | "warranty" | "orders" | "checkout";

const money = z.object({ amount: z.number(), currency: z.string() });
const merchantScoped = z.object({ merchantId: z.string().uuid(), productId: z.string() });

export const searchProductsInput = z.object({
  query: z.string(),
  filters: z
    .object({
      maxPrice: z.number().optional(),
      color: z.string().optional(),
      freeShippingOnly: z.boolean().optional(),
      minReturnDays: z.number().optional(),
    })
    .optional(),
});

export interface CapabilityDefinition {
  name: string;
  version: string;
  riskLevel: RiskLevel;
  requiredScope: ScopeCategory;
  description: string;
  inputSchema: z.ZodTypeAny;
}

export const CAPABILITIES = {
  search_products: {
    name: "search_products",
    version: "1.0.0",
    riskLevel: "READ",
    requiredScope: "products",
    description: "Search a merchant's catalog for matching products or services.",
    inputSchema: searchProductsInput,
  },
  get_product: {
    name: "get_product",
    version: "1.0.0",
    riskLevel: "READ",
    requiredScope: "products",
    description: "Fetch full detail for one product from one merchant.",
    inputSchema: merchantScoped,
  },
  get_inventory: {
    name: "get_inventory",
    version: "1.0.0",
    riskLevel: "READ",
    requiredScope: "inventory",
    description: "Live-verify stock/availability for one product.",
    inputSchema: merchantScoped,
  },
  get_shipping: {
    name: "get_shipping",
    version: "1.0.0",
    riskLevel: "READ",
    requiredScope: "shipping",
    description: "Fetch shipping terms for one product.",
    inputSchema: merchantScoped,
  },
  get_returns: {
    name: "get_returns",
    version: "1.0.0",
    riskLevel: "READ",
    requiredScope: "returns",
    description: "Fetch return policy for one product.",
    inputSchema: merchantScoped,
  },
  get_warranty: {
    name: "get_warranty",
    version: "1.0.0",
    riskLevel: "READ",
    requiredScope: "warranty",
    description: "Fetch warranty terms for one product.",
    inputSchema: merchantScoped,
  },
  create_cart: {
    name: "create_cart",
    version: "1.0.0",
    riskLevel: "WRITE",
    requiredScope: "checkout",
    description: "Create a cart (POC: not implemented by any connector).",
    inputSchema: z.object({ merchantId: z.string().uuid(), items: z.array(z.object({ productId: z.string(), qty: z.number() })) }),
  },
  update_cart: {
    name: "update_cart",
    version: "1.0.0",
    riskLevel: "WRITE",
    requiredScope: "checkout",
    description: "Update a cart (POC: not implemented by any connector).",
    inputSchema: z.object({ cartId: z.string(), items: z.array(z.object({ productId: z.string(), qty: z.number() })) }),
  },
  start_checkout: {
    name: "start_checkout",
    version: "1.0.0",
    riskLevel: "WRITE",
    requiredScope: "checkout",
    description: "Start checkout (POC: not implemented by any connector).",
    inputSchema: z.object({ cartId: z.string() }),
  },
  place_order: {
    name: "place_order",
    version: "1.0.0",
    riskLevel: "HIGH_RISK",
    requiredScope: "orders",
    description: "Place an order. Always blocked by policy in this POC.",
    inputSchema: z.object({ merchantId: z.string().uuid(), productId: z.string() }),
  },
  submit_bid: {
    name: "submit_bid",
    version: "1.0.0",
    riskLevel: "HIGH_RISK",
    requiredScope: "orders",
    description: "Submit an auction bid. Always blocked by policy in this POC.",
    inputSchema: z.object({ merchantId: z.string().uuid(), productId: z.string(), amount: money }),
  },
  buy_now: {
    name: "buy_now",
    version: "1.0.0",
    riskLevel: "HIGH_RISK",
    requiredScope: "orders",
    description: "Buy Now. Always blocked by policy in this POC.",
    inputSchema: z.object({ merchantId: z.string().uuid(), productId: z.string() }),
  },
  cancel_order: {
    name: "cancel_order",
    version: "1.0.0",
    riskLevel: "HIGH_RISK",
    requiredScope: "orders",
    description: "Cancel an order. Always blocked by policy in this POC.",
    inputSchema: z.object({ merchantId: z.string().uuid(), orderId: z.string() }),
  },
  refund: {
    name: "refund",
    version: "1.0.0",
    riskLevel: "HIGH_RISK",
    requiredScope: "orders",
    description: "Issue a refund. Always blocked by policy in this POC.",
    inputSchema: z.object({ merchantId: z.string().uuid(), orderId: z.string() }),
  },
} satisfies Record<string, CapabilityDefinition>;

export type CapabilityName = keyof typeof CAPABILITIES;
