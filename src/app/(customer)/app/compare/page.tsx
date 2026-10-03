"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiPost, ApiError } from "@/lib/api";
import type { CompareEntry, CompareResponse } from "@/lib/types";
import { ComparisonTable } from "../_components/comparison-table";

export default function ComparePage() {
  const params = useSearchParams();
  const [comparison, setComparison] = useState<CompareEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = params.get("items");
    const items = (raw ?? "")
      .split(",")
      .map((pair) => pair.split(":"))
      .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1])
      .map(([merchantId, productId]) => ({ merchantId, productId }));

    if (items.length < 2) {
      setError("Select at least two products from search results to compare.");
      setLoading(false);
      return;
    }

    apiPost<CompareResponse>("/api/agent/compare", { items })
      .then((res) => setComparison(res.comparison))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this comparison."))
      .finally(() => setLoading(false));
  }, [params]);

  return (
    <div>
      <h1 className="am-auth-title" style={{ marginBottom: 20 }}>Compare</h1>
      {loading && <p className="am-help-text">Comparing products…</p>}
      {error && (
        <div className="am-empty">
          <p>{error}</p>
          <Link href="/app/search" className="am-btn am-btn-primary" style={{ textDecoration: "none" }}>
            Back to search
          </Link>
        </div>
      )}
      {comparison && (
        <div className="am-card">
          <ComparisonTable comparison={comparison} />
        </div>
      )}
    </div>
  );
}
