"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api";
import type { ApprovalRow } from "@/lib/types";

type Phase = "idle" | "confirming" | "working" | "error";

/**
 * Screen 8 — the platform never silently sends the shopper to a merchant
 * site. This always goes request-approval -> shopper confirms -> approve ->
 * /visit (which records the unique visit server-side) -> open the merchant's
 * site. There is no path here that opens `domain` without all four steps
 * completing in order.
 */
export function VisitMerchantButton({
  merchantId,
  merchantName,
  domain,
  sessionId,
  label = "Visit merchant",
  className = "am-btn am-btn-primary",
}: {
  merchantId: string;
  merchantName: string;
  domain: string;
  sessionId?: string;
  label?: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [approval, setApproval] = useState<ApprovalRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startRequest() {
    setError(null);
    setPhase("working");
    try {
      const res = await apiPost<{ approval: ApprovalRow }>("/api/approvals", {
        actionType: "merchant_visit",
        merchantId,
        sessionId,
      });
      setApproval(res.approval);
      setPhase("confirming");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the visit request.");
      setPhase("error");
    }
  }

  async function confirm() {
    if (!approval) return;
    setPhase("working");
    setError(null);
    try {
      await apiPost(`/api/approvals/${approval.id}/approve`);
      const visit = await apiPost<{ visit: unknown; isNewUniqueVisit: boolean }>(`/api/merchants/${merchantId}/visit`, {
        approvalId: approval.id,
      });
      window.open(`https://${domain}`, "_blank", "noopener,noreferrer");
      void visit;
      setPhase("idle");
      setApproval(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The merchant visit could not be completed.");
      setPhase("error");
    }
  }

  async function cancel() {
    if (approval) {
      apiPost(`/api/approvals/${approval.id}/reject`).catch(() => {});
    }
    setApproval(null);
    setPhase("idle");
    setError(null);
  }

  return (
    <>
      <button className={className} onClick={startRequest} disabled={phase === "working"}>
        {phase === "working" && !approval ? <span className="am-spinner" /> : label}
      </button>

      {(phase === "confirming" || (phase === "working" && approval)) && (
        <div className="am-modal-backdrop" role="dialog" aria-modal="true">
          <div className="am-modal">
            <h3 className="am-modal-title">You're about to visit {merchantName}</h3>
            <p className="am-modal-subtitle">
              You'll continue to their website ({domain}) to research or purchase this product. This platform only
              facilitates the handoff — the purchase itself happens on their site.
            </p>
            <div className="am-row" style={{ justifyContent: "flex-end" }}>
              <button className="am-btn am-btn-secondary" onClick={cancel} disabled={phase === "working"}>
                Cancel
              </button>
              <button className="am-btn am-btn-primary" onClick={confirm} disabled={phase === "working"}>
                {phase === "working" ? <span className="am-spinner" /> : "Continue to merchant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && phase === "error" && (
        <p className="am-error-text" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </>
  );
}
