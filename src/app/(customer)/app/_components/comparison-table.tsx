"use client";

import type { CompareEntry } from "@/lib/types";

export function ComparisonTable({ comparison }: { comparison: CompareEntry[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--am-border)" }}>
            <th style={{ padding: "8px 10px" }}>Product</th>
            <th style={{ padding: "8px 10px" }}>Merchant</th>
            <th style={{ padding: "8px 10px" }}>Price</th>
            <th style={{ padding: "8px 10px" }}>Warranty</th>
            <th style={{ padding: "8px 10px" }}>Shipping</th>
            <th style={{ padding: "8px 10px" }}>Returns</th>
            <th style={{ padding: "8px 10px" }}>Availability</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map((entry, i) => {
            const offer = entry.offer;
            if (!offer) {
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--am-border)" }}>
                  <td colSpan={7} className="am-error-text" style={{ padding: "8px 10px" }}>
                    {entry.merchantId}/{entry.productId}: {entry.error}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--am-border)" }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{offer.title}</td>
                <td style={{ padding: "8px 10px" }}>{offer.merchantName}</td>
                <td style={{ padding: "8px 10px" }}>${offer.price.amount.toFixed(2)}</td>
                <td style={{ padding: "8px 10px" }}>{offer.warranty.months !== null ? `${offer.warranty.months} mo` : "—"}</td>
                <td style={{ padding: "8px 10px" }}>{offer.shipping.isFree ? "Free" : offer.shipping.cost !== null ? `$${offer.shipping.cost.toFixed(2)}` : "—"}</td>
                <td style={{ padding: "8px 10px" }}>{offer.returnPolicy.windowDays !== null ? `${offer.returnPolicy.windowDays}d` : "—"}</td>
                <td style={{ padding: "8px 10px" }}>{offer.availability.inStock ? "In stock" : "Out of stock"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
