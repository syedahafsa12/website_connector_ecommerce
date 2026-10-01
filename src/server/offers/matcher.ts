import type { Offer } from "./types";

export interface Requirements {
  maxPrice?: number;
  color?: string;
  freeShippingOnly?: boolean;
  minReturnDays?: number;
  requireProduct?: boolean;
}

export interface MatchVerdict {
  decision: "selected" | "rejected";
  reasons: string[];
}

const PRODUCT_KEYWORDS = ["shoe", "shoes", "sneaker", "sneakers", "trainer", "trainers"];
const COLOR_WORDS = ["black", "blue", "red", "white", "gray", "grey", "green", "yellow", "orange", "purple"];

/** Deterministic, regex-based — the LLM narrates, but never decides pass/fail. */
export function parseRequirements(query: string): Requirements {
  const q = query.toLowerCase();
  const req: Requirements = {};

  const priceMatch = q.match(/under\s*\$?(\d+(?:\.\d+)?)/) ?? q.match(/less than\s*\$?(\d+(?:\.\d+)?)/);
  if (priceMatch?.[1]) req.maxPrice = Number(priceMatch[1]);

  const color = COLOR_WORDS.find((c) => q.includes(c));
  if (color) req.color = color;

  if (/free shipping/.test(q)) req.freeShippingOnly = true;

  const returnMatch = q.match(/(\d+)[- ]day(?:s)? return/);
  if (returnMatch?.[1]) req.minReturnDays = Number(returnMatch[1]);

  if (PRODUCT_KEYWORDS.some((k) => q.includes(k))) req.requireProduct = true;

  return req;
}

export function matchOffer(offer: Offer, req: Requirements): MatchVerdict {
  const reasons: string[] = [];

  if (req.requireProduct && offer.category !== "product") {
    reasons.push("this is a service booking, not a purchasable product matching the request");
  }
  if (!offer.availability.inStock) {
    reasons.push("out of stock");
  }
  if (req.maxPrice !== undefined && offer.price.amount > req.maxPrice) {
    reasons.push(`price $${offer.price.amount.toFixed(2)} exceeds the $${req.maxPrice} maximum`);
  }
  if (req.color && offer.attributes.color && offer.attributes.color.toLowerCase() !== req.color.toLowerCase()) {
    reasons.push(`color '${offer.attributes.color}' does not match requested '${req.color}'`);
  }
  if (req.freeShippingOnly && !offer.shipping.isFree) {
    reasons.push("shipping is not free");
  }
  if (req.minReturnDays !== undefined) {
    const window = offer.returnPolicy.windowDays;
    if (window === null || window < req.minReturnDays) {
      reasons.push(`return window (${window ?? "none"} days) is shorter than the required ${req.minReturnDays} days`);
    }
  }

  return { decision: reasons.length === 0 ? "selected" : "rejected", reasons };
}
