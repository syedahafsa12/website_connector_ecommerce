import type { Offer, Requirements } from "@/lib/types";

export interface MatchSummary {
  matched: string[];
  didNotMatch: string[];
}

/**
 * Turns the backend's deterministic verdict (offer + the requirements it was
 * checked against + its rejection reasons, if any) into a plain-language
 * "matched / didn't match" summary for the shopper. `didNotMatch` is just the
 * backend's own `reasons` array verbatim — never re-derived. `matched` is
 * built only from requirement keys that were actually present on the request
 * and are NOT already covered by a rejection reason, so nothing here is
 * invented beyond what the offer and requirements objects already say.
 */
export function deriveMatchSummary(offer: Offer, requirements: Requirements, reasons: string[]): MatchSummary {
  const matched: string[] = [];
  const reasonsText = reasons.join(" | ").toLowerCase();

  if (requirements.maxPrice !== undefined && !reasonsText.includes("exceeds")) {
    matched.push(`Under $${requirements.maxPrice}`);
  }
  if (requirements.color && !reasonsText.includes("does not match requested")) {
    matched.push(`Color: ${offer.attributes.color ?? requirements.color}`);
  }
  if (requirements.freeShippingOnly && !reasonsText.includes("not free")) {
    matched.push("Free shipping");
  }
  if (requirements.minReturnDays !== undefined && !reasonsText.includes("shorter than")) {
    matched.push(`${offer.returnPolicy.windowDays ?? requirements.minReturnDays}+ day returns`);
  }
  if (offer.availability.inStock && !reasonsText.includes("out of stock")) {
    matched.push("In stock");
  }

  return { matched, didNotMatch: reasons };
}
