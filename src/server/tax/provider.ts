/**
 * Clean estimate-only boundary for tax + shipping. This is explicitly NOT
 * production tax filing or a real carrier-rate lookup — it exists so the
 * demo can show a real, deterministic, testable number before a bid/Buy
 * Now, with a clear seam for a future Zamp (tax) or per-merchant shipping
 * integration to plug into without auction code changing.
 */
export interface EstimateInput {
  amount: number;
  currency: string;
  merchantId: string;
}

export interface TaxEstimate {
  amount: number;
  rate: number;
  /** Always "estimate" in this phase — never conflate with a filed/production tax calculation. */
  kind: "estimate";
}

export interface ShippingEstimate {
  amount: number;
  kind: "estimate";
}

export interface TaxProvider {
  readonly name: string;
  estimate(input: EstimateInput): Promise<TaxEstimate>;
}

export interface ShippingCalculator {
  readonly name: string;
  estimate(input: EstimateInput): Promise<ShippingEstimate>;
}

/** Flat demo rate — deterministic and good enough to demonstrate the seam. A future TaxProvider can be merchant- or jurisdiction-aware. */
const DEMO_TAX_RATE = 0.08;

export class DemoTaxProvider implements TaxProvider {
  readonly name = "demo";
  async estimate(input: EstimateInput): Promise<TaxEstimate> {
    return { amount: round2(input.amount * DEMO_TAX_RATE), rate: DEMO_TAX_RATE, kind: "estimate" };
  }
}

/** Flat demo shipping fee, free over a threshold — mirrors the shape of the real per-merchant policies this platform already models (merchant_policies / each demo catalog's own shipping terms), without wiring to any one of them specifically. */
const DEMO_FLAT_SHIPPING = 15;
const DEMO_FREE_SHIPPING_THRESHOLD = 500;

export class DemoShippingCalculator implements ShippingCalculator {
  readonly name = "demo";
  async estimate(input: EstimateInput): Promise<ShippingEstimate> {
    return { amount: input.amount >= DEMO_FREE_SHIPPING_THRESHOLD ? 0 : DEMO_FLAT_SHIPPING, kind: "estimate" };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let taxProvider: TaxProvider | undefined;
let shippingCalculator: ShippingCalculator | undefined;

/** Swap for a Zamp-backed TaxProvider (same interface) once that integration exists. */
export function getTaxProvider(): TaxProvider {
  taxProvider ??= new DemoTaxProvider();
  return taxProvider;
}

export function getShippingCalculator(): ShippingCalculator {
  shippingCalculator ??= new DemoShippingCalculator();
  return shippingCalculator;
}

export interface PriceBreakdown {
  subtotal: number;
  shipping: ShippingEstimate;
  tax: TaxEstimate;
  total: number;
  currency: string;
}

/** The one place "price + shipping + tax = total" is computed — auction and (later) checkout code both call this instead of each doing its own arithmetic. */
export async function estimateTotal(input: EstimateInput): Promise<PriceBreakdown> {
  const [shipping, tax] = await Promise.all([getShippingCalculator().estimate(input), getTaxProvider().estimate(input)]);
  return {
    subtotal: input.amount,
    shipping,
    tax,
    total: round2(input.amount + shipping.amount + tax.amount),
    currency: input.currency,
  };
}
