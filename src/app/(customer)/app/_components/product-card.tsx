"use client";

import Link from "next/link";
import type { Offer, Requirements } from "@/lib/types";
import { deriveMatchSummary } from "./match-summary";

export function ProductCard({
  offer,
  verdict,
  reasons,
  requirements,
  sessionId,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  offer: Offer;
  verdict: "selected" | "rejected";
  reasons: string[];
  requirements: Requirements;
  sessionId?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const summary = deriveMatchSummary(offer, requirements, reasons);
  const href = `/app/product/${offer.merchantId}/${offer.productId}${sessionId ? `?sessionId=${sessionId}` : ""}`;

  return (
    <Link href={href} className="am-product-card" style={{ textDecoration: "none", color: "inherit", position: "relative" }}>
      {selectable && (
        <label
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect?.();
          }}
          style={{ position: "absolute", top: 10, left: 10, zIndex: 1, background: "rgba(255,255,255,0.9)", borderRadius: 999, padding: 4, display: "flex" }}
        >
          <input type="checkbox" checked={selected} readOnly />
        </label>
      )}
      <img className="am-product-image" src={offer.image} alt={offer.title} loading="lazy" />
      <div className="am-product-body">
        <div className="am-row-between" style={{ gap: 6 }}>
          <span className="am-product-merchant">{offer.merchantName}</span>
          <span className={`am-badge ${verdict === "selected" ? "am-badge-success" : "am-badge-danger"}`}>
            {verdict === "selected" ? "Matched" : "Excluded"}
          </span>
        </div>
        <p className="am-product-title">{offer.title}</p>
        {offer.isStale && <span className="am-badge am-badge-warning" style={{ alignSelf: "flex-start" }}>Stale data</span>}
        {!offer.availability.inStock && <span className="am-badge am-badge-neutral" style={{ alignSelf: "flex-start" }}>Out of stock</span>}
        {offer.contentFlags.length > 0 && (
          <span className="am-badge am-badge-warning" style={{ alignSelf: "flex-start" }}>Flagged content</span>
        )}
        <p className="am-product-price">
          ${offer.price.amount.toFixed(2)} {offer.price.currency}
        </p>
        {summary.didNotMatch.length > 0 && (
          <p className="am-help-text" style={{ margin: 0 }}>{summary.didNotMatch[0]}</p>
        )}
      </div>
    </Link>
  );
}
