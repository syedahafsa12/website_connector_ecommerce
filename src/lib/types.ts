// Re-exports of backend types for the customer frontend. Type-only — nothing
// here pulls server runtime code into the client bundle (isolatedModules
// erases `import type` / `export type` at compile time).
export type { Offer, Money, ShippingInfo, ReturnsInfo, WarrantyInfo, InventoryInfo, ContentFlag } from "@/server/offers/types";
export type { PublicAuction } from "@/server/auctions/view";
export type { AuctionEstimate } from "@/server/auctions/service";
export type { AuctionBidRow, AuctionSettlementRow, AuctionStatus } from "@/server/auctions/types";
export type { ApprovalRow, ApprovalActionType, ApprovalStatus } from "@/server/approvals/repository";
export type { MerchantRow, MerchantStatus } from "@/server/merchants/types";
export type { ProfileRow } from "@/server/profile/repository";
export type { Requirements } from "@/server/offers/matcher";

export interface NormalizedOffer {
  offer: import("@/server/offers/types").Offer;
  verdict: "selected" | "rejected";
  reasons: string[];
}

export interface MerchantSearchOutcome {
  merchantId: string;
  merchantName: string;
  offers: NormalizedOffer[];
  blocked?: string;
  error?: string;
}

export interface SearchResponse {
  sessionId: string;
  requirements: import("@/server/offers/matcher").Requirements;
  merchants: MerchantSearchOutcome[];
  offers: NormalizedOffer[];
}

export interface CompareEntry {
  merchantId: string;
  productId: string;
  offer?: import("@/server/offers/types").Offer;
  error?: string;
}

export interface CompareResponse {
  sessionId: string;
  comparison: CompareEntry[];
}
