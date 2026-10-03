"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { MerchantRow, Offer } from "@/lib/types";
import { VisitMerchantButton } from "../../../_components/visit-merchant-button";

export default function ProductDetailPage() {
  const { merchantId, productId } = useParams<{ merchantId: string; productId: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") ?? undefined;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [merchant, setMerchant] = useState<MerchantRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ sessionId: string; offer: Offer }>(`/api/agent/products/${merchantId}/${productId}${sessionId ? `?sessionId=${sessionId}` : ""}`),
      apiGet<{ merchant: MerchantRow }>(`/api/merchants/${merchantId}`),
    ])
      .then(([productRes, merchantRes]) => {
        if (cancelled) return;
        setOffer(productRes.offer);
        setMerchant(merchantRes.merchant);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load this product.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [merchantId, productId, sessionId]);

  if (loading) {
    return <p className="am-help-text">Loading product…</p>;
  }
  if (error || !offer) {
    return <p className="am-error-text">{error ?? "Product not found."}</p>;
  }

  return (
    <div className="am-product-detail-grid">
      <img src={offer.image} alt={offer.title} style={{ width: "100%", borderRadius: 16, border: "1px solid var(--am-border)", aspectRatio: "1 / 1", objectFit: "cover" }} />

      <div>
        <p className="am-product-merchant" style={{ fontSize: 13 }}>{offer.merchantName}</p>
        <h1 style={{ fontSize: 26, margin: "4px 0 12px", letterSpacing: "-0.01em" }}>{offer.title}</h1>

        <div className="am-row" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 700 }}>${offer.price.amount.toFixed(2)} {offer.price.currency}</span>
          {offer.availability.inStock ? (
            <span className="am-badge am-badge-success">In stock{offer.availability.quantity !== null ? ` · ${offer.availability.quantity} left` : ""}</span>
          ) : (
            <span className="am-badge am-badge-neutral">Out of stock</span>
          )}
          {offer.isStale && <span className="am-badge am-badge-warning">Stale data</span>}
        </div>

        {offer.contentFlags.length > 0 && (
          <div className="am-card-flat" style={{ marginBottom: 16, borderLeft: "3px solid var(--am-danger-text)" }}>
            <span className="am-badge am-badge-danger" style={{ marginBottom: 6 }}>Untrusted content detected</span>
            <p className="am-help-text" style={{ margin: 0 }}>
              This listing contains text that looks like an attempt to influence the agent. It's shown here as data only — it never changes what the agent does.
            </p>
          </div>
        )}

        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--am-text-muted)", marginBottom: 20 }}>{offer.description}</p>

        {Object.keys(offer.attributes).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p className="am-section-title">Attributes</p>
            <div className="am-row">
              {Object.entries(offer.attributes).map(([k, v]) => (
                <span key={k} className="am-badge am-badge-neutral" style={{ textTransform: "none" }}>{k}: {v}</span>
              ))}
            </div>
          </div>
        )}

        <div className="am-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 24 }}>
          <PolicyCard title="Shipping" value={offer.shipping.isFree ? "Free" : offer.shipping.cost !== null ? `$${offer.shipping.cost.toFixed(2)}` : "Unavailable"}
            detail={offer.shipping.estimatedDays !== null ? `${offer.shipping.estimatedDays} day(s)` : !offer.shipping.available ? "Not available" : undefined} />
          <PolicyCard title="Returns" value={offer.returnPolicy.windowDays !== null ? `${offer.returnPolicy.windowDays}-day window` : "No returns"}
            detail={offer.returnPolicy.isFreeReturns ? "Free returns" : offer.returnPolicy.notes} />
          <PolicyCard title="Warranty" value={offer.warranty.months !== null ? `${offer.warranty.months} months` : "None stated"} detail={offer.warranty.notes} />
        </div>

        {merchant && (
          <VisitMerchantButton merchantId={merchant.id} merchantName={merchant.name} domain={merchant.domain} sessionId={sessionId} label="Continue to merchant to purchase" />
        )}
      </div>
    </div>
  );
}

function PolicyCard({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <div className="am-card-flat">
      <p className="am-help-text" style={{ margin: "0 0 4px" }}>{title}</p>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{value}</p>
      {detail && <p className="am-help-text" style={{ margin: "2px 0 0" }}>{detail}</p>}
    </div>
  );
}
