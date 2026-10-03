"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { ApprovalRow, AuctionBidRow, AuctionEstimate, AuctionSettlementRow, PublicAuction } from "@/lib/types";
import { VisitMerchantButton } from "../../_components/visit-merchant-button";

function auctionImage(id: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(`auction-${id}`)}/640/640`;
}

type PendingAction = { kind: "bid"; amount: number } | { kind: "buy_now" };

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [auction, setAuction] = useState<PublicAuction | null>(null);
  const [bids, setBids] = useState<AuctionBidRow[]>([]);
  const [result, setResult] = useState<{ status: string; winnerUserId: string | null; settlement: AuctionSettlementRow | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bidAmount, setBidAmount] = useState("");
  const [bidEstimate, setBidEstimate] = useState<AuctionEstimate | null>(null);
  const [buyNowEstimate, setBuyNowEstimate] = useState<AuctionEstimate | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [pendingApproval, setPendingApproval] = useState<ApprovalRow | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiGet<{ auction: PublicAuction }>(`/api/auctions/${id}`);
      setAuction(res.auction);
      if (res.auction.status === "ended" || res.auction.status === "settled") {
        const r = await apiGet<{ status: string; winnerUserId: string | null; settlement: AuctionSettlementRow | null }>(`/api/auctions/${id}/result`);
        setResult(r);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load this auction.");
    }
    try {
      const b = await apiGet<{ bids: AuctionBidRow[] }>(`/api/auctions/${id}/bids`);
      setBids(b.bids);
    } catch {
      // bid history is a nice-to-have; a failure here shouldn't block the page
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function previewBid() {
    setPreviewError(null);
    setBidEstimate(null);
    const amount = Number(bidAmount);
    if (!(amount > 0)) {
      setPreviewError("Enter a bid amount first.");
      return;
    }
    try {
      const est = await apiPost<AuctionEstimate>(`/api/auctions/${id}/estimate`, { action: "bid", amount });
      setBidEstimate(est);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Could not estimate this bid.");
    }
  }

  async function previewBuyNow() {
    setPreviewError(null);
    try {
      const est = await apiPost<AuctionEstimate>(`/api/auctions/${id}/estimate`, { action: "buy_now" });
      setBuyNowEstimate(est);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Could not estimate Buy Now.");
    }
  }

  async function requestApproval(action: PendingAction) {
    setActionError(null);
    setActionResult(null);
    setActionBusy(true);
    try {
      const payload = action.kind === "bid" ? { auctionId: id, amount: action.amount } : { auctionId: id };
      const res = await apiPost<{ approval: ApprovalRow }>("/api/approvals", {
        actionType: action.kind === "bid" ? "auction_bid" : "buy_now",
        payload,
      });
      setPendingApproval(res.approval);
      setPendingAction(action);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not start this request.");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmAction() {
    if (!pendingApproval || !pendingAction) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await apiPost(`/api/approvals/${pendingApproval.id}/approve`);
      if (pendingAction.kind === "bid") {
        await apiPost(`/api/auctions/${id}/bids`, { approvalId: pendingApproval.id, amount: pendingAction.amount });
        setActionResult(`Your bid of $${pendingAction.amount.toFixed(2)} was placed.`);
      } else {
        const res = await apiPost<{ settlement: AuctionSettlementRow }>(`/api/auctions/${id}/buy-now`, { approvalId: pendingApproval.id });
        setActionResult(
          res.settlement.payment_status === "succeeded"
            ? `Purchased for $${Number(res.settlement.total_amount).toFixed(2)} (demo payment).`
            : `Buy Now completed, but the demo payment was declined.`,
        );
      }
      setPendingApproval(null);
      setPendingAction(null);
      setBidEstimate(null);
      setBuyNowEstimate(null);
      setBidAmount("");
      await load();
    } catch (err) {
      // Stale/invalid state (price moved, auction ended, already outbid) — report honestly and refresh real state.
      setActionError(err instanceof ApiError ? err.message : "This action could not be completed.");
      setPendingApproval(null);
      setPendingAction(null);
      await load();
    } finally {
      setActionBusy(false);
    }
  }

  function cancelAction() {
    if (pendingApproval) apiPost(`/api/approvals/${pendingApproval.id}/reject`).catch(() => {});
    setPendingApproval(null);
    setPendingAction(null);
  }

  if (loadError) return <p className="am-error-text">{loadError}</p>;
  if (!auction) return <p className="am-help-text">Loading auction…</p>;

  const isLive = auction.status === "open" || auction.status === "draft";
  const merchantDomain = new URL(auction.merchantUrl).host;

  return (
    <div className="am-product-detail-grid">
      <img src={auctionImage(auction.id)} alt={auction.title} style={{ width: "100%", borderRadius: 16, border: "1px solid var(--am-border)", aspectRatio: "1/1", objectFit: "cover" }} />

      <div>
        <p className="am-product-merchant" style={{ fontSize: 13 }}>{auction.merchant.name}</p>
        <h1 style={{ fontSize: 26, margin: "4px 0 12px" }}>{auction.title}</h1>
        <div className="am-row" style={{ marginBottom: 16 }}>
          <span className="am-badge am-badge-neutral">{auction.status}</span>
          {auction.endsAt && <span className="am-help-text">Ends {new Date(auction.endsAt).toLocaleString()}</span>}
        </div>
        <p style={{ fontSize: 14, color: "var(--am-text-muted)", marginBottom: 20 }}>{auction.description}</p>

        <div className="am-row" style={{ marginBottom: 20 }}>
          <div className="am-card-flat">
            <p className="am-help-text" style={{ margin: "0 0 4px" }}>{auction.currentBid !== null ? "Current bid" : "Starting bid"}</p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>${(auction.currentBid ?? auction.startingBid).toFixed(2)} {auction.currency}</p>
          </div>
          {auction.buyNowPrice !== null && (
            <div className="am-card-flat">
              <p className="am-help-text" style={{ margin: "0 0 4px" }}>Buy Now</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>${auction.buyNowPrice.toFixed(2)}</p>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <VisitMerchantButton
            merchantId={auction.merchant.id}
            merchantName={auction.merchant.name}
            domain={merchantDomain}
            label="Visit merchant to research this item"
            className="am-btn am-btn-secondary"
          />
        </div>

        {result?.settlement && (
          <div className="am-card-flat" style={{ marginBottom: 20, borderLeft: "3px solid var(--am-success-text)" }}>
            <p className="am-section-title">Result</p>
            <p style={{ margin: "0 0 4px" }}>
              {result.winnerUserId ? "You won this auction." : "This auction ended."} <span className="am-badge am-badge-warning">Simulated demo payment — no real money moved</span>
            </p>
            <div className="am-breakdown-row"><span>Item</span><span>${Number(result.settlement.amount).toFixed(2)}</span></div>
            <div className="am-breakdown-row"><span>Shipping</span><span>${Number(result.settlement.shipping_amount).toFixed(2)}</span></div>
            <div className="am-breakdown-row"><span>Tax</span><span>${Number(result.settlement.tax_amount).toFixed(2)}</span></div>
            <div className="am-breakdown-row total"><span>Total</span><span>${Number(result.settlement.total_amount).toFixed(2)}</span></div>
            <p className="am-help-text" style={{ marginTop: 8 }}>Payment: {result.settlement.payment_status}</p>
          </div>
        )}

        {isLive && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="am-card">
              <p className="am-section-title">Place a bid</p>
              <div className="am-row">
                <input
                  className="am-input"
                  style={{ maxWidth: 160 }}
                  type="number"
                  min={0}
                  placeholder="Amount"
                  value={bidAmount}
                  onChange={(e) => {
                    setBidAmount(e.target.value);
                    setBidEstimate(null);
                  }}
                />
                <button className="am-btn am-btn-secondary" onClick={previewBid} type="button">Preview</button>
                <button
                  className="am-btn am-btn-primary"
                  type="button"
                  disabled={!bidEstimate || actionBusy}
                  onClick={() => requestApproval({ kind: "bid", amount: Number(bidAmount) })}
                >
                  Request to place bid
                </button>
              </div>
              {bidEstimate && <EstimateBreakdown estimate={bidEstimate} />}
            </div>

            {auction.buyNowPrice !== null && (
              <div className="am-card">
                <p className="am-section-title">Buy Now</p>
                <div className="am-row">
                  <button className="am-btn am-btn-secondary" onClick={previewBuyNow} type="button">Preview</button>
                  <button className="am-btn am-btn-primary" type="button" disabled={!buyNowEstimate || actionBusy} onClick={() => requestApproval({ kind: "buy_now" })}>
                    Request Buy Now
                  </button>
                </div>
                {buyNowEstimate && <EstimateBreakdown estimate={buyNowEstimate} />}
              </div>
            )}

            {previewError && <p className="am-error-text">{previewError}</p>}
          </div>
        )}

        {actionResult && <p style={{ color: "var(--am-success-text)", marginTop: 12 }}>{actionResult}</p>}
        {actionError && <p className="am-error-text" style={{ marginTop: 12 }}>{actionError}</p>}

        {bids.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <p className="am-section-title">Bid history</p>
            <ul className="am-match-list">
              {bids.map((b) => (
                <li key={b.id} className="am-match-item">
                  ${Number(b.amount).toFixed(2)} {b.currency} — {b.status} — {new Date(b.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {pendingApproval && pendingAction && (
        <div className="am-modal-backdrop" role="dialog" aria-modal="true">
          <div className="am-modal">
            <h3 className="am-modal-title">
              {pendingAction.kind === "bid" ? `Confirm your $${pendingAction.amount.toFixed(2)} bid` : "Confirm Buy Now"}
            </h3>
            <p className="am-modal-subtitle">
              The price can move before you act — this confirms what the platform will submit right now, and {auction.merchant.name} still has to accept it.
            </p>
            <ApprovalBreakdown payload={pendingApproval.payload} />
            <div className="am-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="am-btn am-btn-secondary" onClick={cancelAction} disabled={actionBusy}>Cancel</button>
              <button className="am-btn am-btn-primary" onClick={confirmAction} disabled={actionBusy}>
                {actionBusy ? <span className="am-spinner" /> : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EstimateBreakdown({ estimate }: { estimate: AuctionEstimate }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="am-breakdown-row"><span>Item</span><span>${estimate.itemAmount.toFixed(2)}</span></div>
      <div className="am-breakdown-row"><span>Shipping</span><span>${estimate.shippingAmount.toFixed(2)}</span></div>
      <div className="am-breakdown-row"><span>Tax</span><span>${estimate.taxAmount.toFixed(2)}</span></div>
      <div className="am-breakdown-row total"><span>Total</span><span>${estimate.totalAmount.toFixed(2)}</span></div>
    </div>
  );
}

function ApprovalBreakdown({ payload }: { payload: Record<string, unknown> }) {
  const total = payload.estimatedTotal as number | undefined;
  const shipping = payload.estimatedShipping as number | undefined;
  const tax = payload.estimatedTax as number | undefined;
  const amount = (payload.amount as number | undefined) ?? (payload.buyNowPrice as number | undefined);
  if (total === undefined) return null;
  return (
    <div>
      {amount !== undefined && <div className="am-breakdown-row"><span>Item</span><span>${amount.toFixed(2)}</span></div>}
      {shipping !== undefined && <div className="am-breakdown-row"><span>Shipping</span><span>${shipping.toFixed(2)}</span></div>}
      {tax !== undefined && <div className="am-breakdown-row"><span>Tax</span><span>${tax.toFixed(2)}</span></div>}
      <div className="am-breakdown-row total"><span>Total</span><span>${total.toFixed(2)}</span></div>
    </div>
  );
}
