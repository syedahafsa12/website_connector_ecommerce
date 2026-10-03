"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiPost, ApiError } from "@/lib/api";
import type { CompareEntry, CompareResponse, MerchantSearchOutcome, NormalizedOffer, Requirements, SearchResponse } from "@/lib/types";
import Link from "next/link";
import { ProductCard } from "../_components/product-card";
import { AgentTrace, type TraceStep } from "../_components/agent-trace";
import { ComparisonTable } from "../_components/comparison-table";

interface Filters {
  maxPrice?: number;
  color?: string;
  freeShippingOnly?: boolean;
  minReturnDays?: number;
}

interface SearchTurn {
  kind: "search";
  queryText: string;
  requirements: Requirements;
  offers: NormalizedOffer[];
  merchants: MerchantSearchOutcome[];
}
interface CompareTurn {
  kind: "compare";
  queryText: string;
  comparison: CompareEntry[];
}
interface ErrorTurn {
  kind: "error";
  queryText: string;
  message: string;
}
type Turn = { id: string; role: "user"; text: string } | ({ id: string; role: "agent" } & (SearchTurn | CompareTurn | ErrorTurn));

const COMPARE_PATTERN = /\b(which|compare|comparison|better|vs\.?|versus)\b/i;

export default function SearchPage() {
  const params = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [compareKeys, setCompareKeys] = useState<Set<string>>(new Set());
  const accumulatedQuery = useRef("");
  const sessionId = useRef<string | undefined>(undefined);
  const lastOffers = useRef<NormalizedOffer[]>([]);
  const ranInitial = useRef(false);

  function toggleCompare(merchantId: string, productId: string) {
    const key = `${merchantId}:${productId}`;
    setCompareKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 6) next.add(key);
      return next;
    });
  }

  useEffect(() => {
    const initial = params.get("q");
    if (initial && !ranInitial.current) {
      ranInitial.current = true;
      void runSearch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function runSearch(text: string) {
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id: `${id}-u`, role: "user", text }]);
    accumulatedQuery.current = accumulatedQuery.current ? `${accumulatedQuery.current}. ${text}` : text;
    setLoading(true);
    try {
      const res = await apiPost<SearchResponse>("/api/agent/search", {
        query: accumulatedQuery.current,
        filters,
        sessionId: sessionId.current,
      });
      sessionId.current = res.sessionId;
      lastOffers.current = res.offers;
      setTurns((t) => [...t, { id: `${id}-a`, role: "agent", kind: "search", queryText: text, requirements: res.requirements, offers: res.offers, merchants: res.merchants }]);
    } catch (err) {
      setTurns((t) => [...t, { id: `${id}-a`, role: "agent", kind: "error", queryText: text, message: err instanceof ApiError ? err.message : "Something went wrong searching connected stores." }]);
    } finally {
      setLoading(false);
    }
  }

  async function runCompare(text: string) {
    const id = crypto.randomUUID();
    setTurns((t) => [...t, { id: `${id}-u`, role: "user", text }]);
    const items = lastOffers.current
      .filter((o) => o.verdict === "selected")
      .slice(0, 6)
      .map((o) => ({ merchantId: o.offer.merchantId, productId: o.offer.productId }));

    setLoading(true);
    try {
      const res = await apiPost<CompareResponse>("/api/agent/compare", { items, sessionId: sessionId.current });
      sessionId.current = res.sessionId;
      setTurns((t) => [...t, { id: `${id}-a`, role: "agent", kind: "compare", queryText: text, comparison: res.comparison }]);
    } catch (err) {
      setTurns((t) => [...t, { id: `${id}-a`, role: "agent", kind: "error", queryText: text, message: err instanceof ApiError ? err.message : "Could not compare those products." }]);
    } finally {
      setLoading(false);
    }
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const matchCount = lastOffers.current.filter((o) => o.verdict === "selected").length;
    if (COMPARE_PATTERN.test(text) && matchCount >= 2) {
      void runCompare(text);
    } else {
      void runSearch(text);
    }
  }

  const trace: TraceStep[] = loading
    ? [{ label: "Searching connected stores…", state: "active" }]
    : [];

  return (
    <div>
      <h1 className="am-auth-title" style={{ marginBottom: 20 }}>Search</h1>

      <div className="am-card" style={{ marginBottom: 20 }}>
        <p className="am-section-title" style={{ marginBottom: 10 }}>Refine</p>
        <div className="am-row">
          <div className="am-field" style={{ marginBottom: 0, width: 130 }}>
            <label className="am-label">Max price</label>
            <input
              className="am-input"
              type="number"
              min={0}
              value={filters.maxPrice ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div className="am-field" style={{ marginBottom: 0, width: 140 }}>
            <label className="am-label">Color</label>
            <input
              className="am-input"
              type="text"
              value={filters.color ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value || undefined }))}
            />
          </div>
          <div className="am-field" style={{ marginBottom: 0, width: 150 }}>
            <label className="am-label">Min return days</label>
            <input
              className="am-input"
              type="number"
              min={0}
              value={filters.minReturnDays ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, minReturnDays: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div className="am-field" style={{ marginBottom: 0 }}>
            <label className="am-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={!!filters.freeShippingOnly}
                onChange={(e) => setFilters((f) => ({ ...f, freeShippingOnly: e.target.checked || undefined }))}
              />
              Free shipping only
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {turns.map((turn) => {
          if (turn.role === "user") {
            return (
              <div key={turn.id} className="am-row-between" style={{ background: "var(--am-surface-muted)", borderRadius: 12, padding: "10px 16px" }}>
                <strong style={{ fontSize: 14 }}>{turn.text}</strong>
              </div>
            );
          }
          if (turn.kind === "error") {
            return (
              <p key={turn.id} className="am-error-text">{turn.message}</p>
            );
          }
          if (turn.kind === "compare") {
            return (
              <div key={turn.id} className="am-card">
                <p className="am-section-title">Comparison</p>
                <ComparisonTable comparison={turn.comparison} />
              </div>
            );
          }
          const selected = turn.offers.filter((o) => o.verdict === "selected");
          const rejected = turn.offers.filter((o) => o.verdict === "rejected");
          const issues = turn.merchants.filter((m) => m.blocked || m.error);
          return (
            <div key={turn.id}>
              <p className="am-help-text" style={{ marginBottom: 12 }}>
                Searched {turn.merchants.length} connected store{turn.merchants.length === 1 ? "" : "s"} · {selected.length} matched
                {rejected.length > 0 ? `, ${rejected.length} excluded` : ""}.
              </p>
              {issues.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {issues.map((m) => (
                    <p key={m.merchantId} className="am-help-text" style={{ margin: "2px 0" }}>
                      Couldn't search {m.merchantName}: {m.blocked ?? m.error}
                    </p>
                  ))}
                </div>
              )}
              {turn.offers.length === 0 ? (
                <p className="am-empty">No offers found for that request.</p>
              ) : (
                <div className="am-grid">
                  {[...selected, ...rejected].map((o, i) => {
                    const key = `${o.offer.merchantId}:${o.offer.productId}`;
                    return (
                      <ProductCard
                        key={`${key}-${i}`}
                        offer={o.offer}
                        verdict={o.verdict}
                        reasons={o.reasons}
                        requirements={turn.requirements}
                        sessionId={sessionId.current}
                        selectable={o.verdict === "selected"}
                        selected={compareKeys.has(key)}
                        onToggleSelect={() => toggleCompare(o.offer.merchantId, o.offer.productId)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {loading && <AgentTrace steps={trace} />}

        {turns.length === 0 && !loading && (
          <p className="am-empty">Ask your agent what you're looking for below.</p>
        )}
      </div>

      {compareKeys.size >= 2 && (
        <div className="am-row-between am-card" style={{ position: "sticky", bottom: 86, marginTop: 16, background: "var(--am-text)", color: "#fff", border: "none" }}>
          <span style={{ fontSize: 13 }}>{compareKeys.size} selected to compare</span>
          <Link
            href={`/app/compare?items=${encodeURIComponent([...compareKeys].join(","))}`}
            className="am-btn am-btn-primary"
            style={{ textDecoration: "none" }}
          >
            Compare now →
          </Link>
        </div>
      )}

      <form onSubmit={onSend} style={{ position: "sticky", bottom: 16, marginTop: 28 }}>
        <div className="am-search-pill">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={turns.length === 0 ? "What are you looking for?" : "Refine — e.g. \"only black ones\" or \"show me something cheaper\""}
          />
          <button type="submit" className="am-btn am-btn-primary" disabled={loading}>
            {loading ? <span className="am-spinner" /> : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

