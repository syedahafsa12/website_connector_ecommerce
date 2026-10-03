"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { MerchantRow } from "@/lib/types";

const EXAMPLE_PROMPTS = [
  "Black running shoes under $150 with free shipping",
  "A lightweight city bike under $700",
  "A gift under $100 with a 30-day return policy",
];

export default function AgentMallHome() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [stores, setStores] = useState<MerchantRow[] | null>(null);

  useEffect(() => {
    apiGet<{ merchants: MerchantRow[] }>("/api/merchants")
      .then((res) => setStores(res.merchants.filter((m) => m.status === "authorized" && !m.is_adversarial_demo)))
      .catch(() => setStores([]));
  }, []);

  function goSearch(q: string) {
    if (!q.trim()) return;
    router.push(`/app/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div>
      <section className="am-hero">
        <h1 className="am-hero-title">One agent. Multiple connected stores.</h1>
        <p className="am-hero-subtitle">
          Tell your agent what you're looking for — it searches every connected merchant, compares real offers, and
          only acts with your approval.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            goSearch(query);
          }}
        >
          <div className="am-search-pill">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you looking for?"
              aria-label="Search the Agent Mall"
            />
            <button type="submit" className="am-btn am-btn-primary">
              Search
            </button>
          </div>
        </form>

        <div className="am-example-prompts">
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} className="am-example-chip" onClick={() => goSearch(p)} type="button">
              {p}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 48 }}>
        <div className="am-row-between">
          <h2 className="am-section-title" style={{ margin: 0 }}>Connected stores</h2>
        </div>
        {stores === null && <p className="am-help-text">Loading connected stores…</p>}
        {stores !== null && stores.length === 0 && <p className="am-help-text">No stores connected yet.</p>}
        {stores !== null && stores.length > 0 && (
          <div className="am-row" style={{ marginTop: 12 }}>
            {stores.map((s) => (
              <span key={s.id} className="am-badge am-badge-neutral" style={{ textTransform: "none", fontSize: 13, padding: "8px 14px" }}>
                {s.name} · {s.category}
              </span>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <Link href="/app/auctions" style={{ textDecoration: "none" }}>
          <div className="am-card am-row-between" style={{ cursor: "pointer" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Live auctions</h3>
              <p className="am-help-text" style={{ margin: 0 }}>Bid or Buy Now on items from connected merchants.</p>
            </div>
            <span className="am-btn am-btn-secondary">Browse auctions →</span>
          </div>
        </Link>
      </section>
    </div>
  );
}
