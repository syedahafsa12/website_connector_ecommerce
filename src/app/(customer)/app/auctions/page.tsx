"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { PublicAuction } from "@/lib/types";

function auctionImage(id: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(`auction-${id}`)}/480/480`;
}

function statusBadgeClass(status: PublicAuction["status"]) {
  if (status === "open") return "am-badge-success";
  if (status === "settled") return "am-badge-neutral";
  if (status === "ended") return "am-badge-warning";
  return "am-badge-neutral";
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<PublicAuction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);

  function load() {
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (onlyOpen) params.set("onlyOpen", "true");
    apiGet<{ auctions: PublicAuction[] }>(`/api/auctions?${params.toString()}`)
      .then((res) => setAuctions(res.auctions))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load auctions."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="am-auth-title" style={{ marginBottom: 4 }}>Auctions</h1>
      <p className="am-help-text" style={{ marginBottom: 20 }}>Bid or Buy Now on items from connected merchants.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="am-row"
        style={{ marginBottom: 24 }}
      >
        <input className="am-input" style={{ maxWidth: 320 }} placeholder="Search auctions" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="am-help-text" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Open only
        </label>
        <button type="submit" className="am-btn am-btn-secondary">Filter</button>
      </form>

      {error && <p className="am-error-text">{error}</p>}
      {auctions === null && !error && <p className="am-help-text">Loading auctions…</p>}
      {auctions !== null && auctions.length === 0 && <p className="am-empty">No auctions match that filter.</p>}

      <div className="am-grid">
        {auctions?.map((a) => (
          <Link key={a.id} href={`/app/auctions/${a.id}`} className="am-product-card" style={{ textDecoration: "none", color: "inherit" }}>
            <img className="am-product-image" src={auctionImage(a.id)} alt={a.title} loading="lazy" />
            <div className="am-product-body">
              <div className="am-row-between" style={{ gap: 6 }}>
                <span className="am-product-merchant">{a.merchant.name}</span>
                <span className={`am-badge ${statusBadgeClass(a.status)}`}>{a.status}</span>
              </div>
              <p className="am-product-title">{a.title}</p>
              <p className="am-help-text" style={{ margin: 0 }}>
                {a.currentBid !== null ? "Current bid" : "Starting bid"}: ${((a.currentBid ?? a.startingBid)).toFixed(2)} {a.currency}
              </p>
              {a.buyNowPrice !== null && (
                <p className="am-product-price">Buy Now: ${a.buyNowPrice.toFixed(2)}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
