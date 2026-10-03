import type { MerchantRow } from "@/server/merchants/types";
import { getHighestBid } from "./repository";
import type { AuctionRow } from "./types";

/** The normalized, agent-friendly shape every auction search/detail response uses. */
export interface PublicAuction {
  id: string;
  merchant: { id: string; name: string };
  merchantUrl: string;
  productId: string;
  title: string;
  description: string;
  startingBid: number;
  currentBid: number | null;
  buyNowPrice: number | null;
  currency: string;
  status: AuctionRow["status"];
  startsAt: string;
  firstBidAt: string | null;
  endsAt: string | null;
  winnerUserId: string | null;
}

export async function toPublicAuction(auction: AuctionRow, merchant: MerchantRow): Promise<PublicAuction> {
  const highest = await getHighestBid(auction.id);
  return {
    id: auction.id,
    merchant: { id: merchant.id, name: merchant.name },
    merchantUrl: `https://${merchant.domain}`,
    productId: auction.product_external_id,
    title: auction.title,
    description: auction.description,
    startingBid: Number(auction.starting_price),
    currentBid: highest ? Number(highest.amount) : null,
    buyNowPrice: auction.buy_now_price !== null ? Number(auction.buy_now_price) : null,
    currency: auction.currency,
    status: auction.status,
    startsAt: auction.starts_at,
    firstBidAt: auction.first_bid_at,
    endsAt: auction.ends_at,
    winnerUserId: auction.winner_user_id,
  };
}
