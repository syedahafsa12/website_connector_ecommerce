"use client";

import { useEffect, useState } from "react";

type Merchant = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  category: string;
  status: string;
  connector_type: string;
  is_adversarial_demo: boolean;
};

type Offer = {
  merchantId: string;
  merchantName: string;
  productId: string;
  title: string;
  price: { amount: number; currency: string };
  verdict: "selected" | "rejected";
  reasons: string[];
  isStale: boolean;
  availability: { inStock: boolean };
  contentFlags: Array<{ field: string; excerpt: string }>;
};

type ChatResult = {
  reply: string;
  offers: Offer[];
  blockedAttempts: Array<{ capability: string; merchantId: string; reason: string; untrustedContentDetected: boolean }>;
  sessionId: string;
};

const ALL_SCOPES = ["products", "inventory", "shipping", "returns", "warranty", "orders", "checkout"] as const;
const DEFAULT_SCOPES = ["products", "inventory", "shipping", "returns", "warranty"];

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "request failed");
  return json;
}

function MerchantCard({ merchant, onChange }: { merchant: Merchant; onChange: () => void }) {
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [insights, setInsights] = useState<any[] | null>(null);

  async function startVerification() {
    setBusy(true);
    try {
      await api(`/api/merchants/${merchant.id}/verification`, { method: "POST", body: JSON.stringify({ method: "well_known_file" }) });
      setMessage("Verification challenge created.");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function checkVerification() {
    setBusy(true);
    try {
      const r = await api<{ verified: boolean; reason: string }>(`/api/merchants/${merchant.id}/verification/check`, { method: "POST" });
      setMessage(r.reason);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function authorize() {
    setBusy(true);
    try {
      await api(`/api/merchants/${merchant.id}/authorization`, { method: "POST", body: JSON.stringify({ scopes }) });
      setMessage("Authorization granted.");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api(`/api/merchants/${merchant.id}/revoke`, { method: "POST" });
      setMessage("Authorization revoked.");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function loadInsights() {
    const r = await api<{ insights: any[] }>(`/api/merchants/${merchant.id}/insights`);
    setInsights(r.insights);
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <strong>{merchant.name}</strong>{" "}
          {merchant.is_adversarial_demo && <span className="tag demo">ADVERSARIAL DEMO MERCHANT</span>}
          <div className="small">
            {merchant.domain} · {merchant.category} · connector: {merchant.connector_type.toUpperCase()}
          </div>
        </div>
        <span className={`tag status-${merchant.status}`}>{merchant.status.replace("_", " ")}</span>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {merchant.status === "pending_verification" && (
          <button disabled={busy} onClick={startVerification}>
            Start domain verification
          </button>
        )}
        {(merchant.status === "pending_verification") && (
          <button disabled={busy} className="secondary" onClick={checkVerification}>
            Check verification
          </button>
        )}
        {(merchant.status === "domain_verified" || merchant.status === "authorized") && (
          <>
            <button disabled={busy} onClick={authorize}>
              {merchant.status === "authorized" ? "Re-authorize" : "Authorize connection"}
            </button>
          </>
        )}
        {merchant.status === "authorized" && (
          <button disabled={busy} className="danger" onClick={revoke}>
            Revoke connection
          </button>
        )}
        <button className="secondary" onClick={loadInsights}>
          View merchant insight
        </button>
      </div>

      {(merchant.status === "domain_verified" || merchant.status === "authorized") && (
        <div style={{ marginTop: 8 }}>
          <div className="small">Authorize access to:</div>
          {ALL_SCOPES.map((s) => (
            <label key={s} className="small" style={{ marginRight: 10 }}>
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) =>
                  setScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                }
              />{" "}
              {s}
            </label>
          ))}
        </div>
      )}

      {message && <div className="small" style={{ marginTop: 8 }}>{message}</div>}

      {insights && (
        <div className="mono" style={{ marginTop: 10, maxHeight: 160, overflow: "auto" }}>
          {insights.length === 0 && <div className="small">No insight records yet for this merchant.</div>}
          {insights.map((i) => (
            <div key={i.id} className="small" style={{ marginBottom: 4 }}>
              [{i.decision}] {(i.reasons ?? []).join("; ") || "matched requirements"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, sessionId, onSelected }: { offer: Offer; sessionId: string; onSelected: (info: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [referral, setReferral] = useState<any>(null);

  async function select() {
    setBusy(true);
    try {
      const r = await api<{ referral: any }>("/api/referrals/select", {
        method: "POST",
        body: JSON.stringify({ sessionId, merchantId: offer.merchantId, offerId: offer.productId }),
      });
      setReferral(r.referral);
      onSelected(`Referral created for ${offer.merchantName} — status: ${r.referral.status}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmLanding() {
    if (!referral) return;
    await api(`/api/referrals/${referral.id}/confirm-landing`, { method: "POST" });
    setReferral({ ...referral, status: "landing_confirmed" });
  }

  return (
    <div className="offer">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>
          {offer.title} — {offer.merchantName}
        </strong>
        <span className={`tag ${offer.verdict}`}>{offer.verdict.toUpperCase()}</span>
      </div>
      <div className="small">
        ${offer.price.amount.toFixed(2)} {offer.price.currency} ·{" "}
        {offer.availability.inStock ? "in stock" : "OUT OF STOCK"} {offer.isStale && "· ⚠ STALE DATA"}
      </div>
      {offer.reasons.length > 0 && <div className="small">Reasons: {offer.reasons.join("; ")}</div>}
      {offer.contentFlags.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <span className="tag flag">UNTRUSTED MERCHANT CONTENT DETECTED</span>
          <div className="small">"{offer.contentFlags[0]?.excerpt}"</div>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        {!referral && (
          <button disabled={busy} onClick={select}>
            Select this merchant
          </button>
        )}
        {referral && referral.status !== "landing_confirmed" && (
          <button disabled={busy} className="secondary" onClick={confirmLanding}>
            Simulate landing confirmation
          </button>
        )}
        {referral && <div className="small mono">referral status: {referral.status}</div>}
      </div>
    </div>
  );
}

export default function Home() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [query, setQuery] = useState("Find me black running shoes under $150 with free shipping and at least a 30-day return policy.");
  const [chat, setChat] = useState<ChatResult | null>(null);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [sessionId] = useState(() => crypto.randomUUID());

  async function refreshMerchants() {
    const r = await api<{ merchants: Merchant[] }>("/api/merchants");
    setMerchants(r.merchants);
  }
  async function refreshAudit() {
    const r = await api<{ events: any[] }>("/api/audit?limit=40");
    setAudit(r.events);
  }

  useEffect(() => {
    refreshMerchants();
    refreshAudit();
  }, []);

  async function ask() {
    setThinking(true);
    setChat(null);
    try {
      const r = await api<ChatResult>("/api/agent/chat", { method: "POST", body: JSON.stringify({ query, sessionId }) });
      setChat(r);
    } catch (err) {
      setChat({ reply: `Error: ${err instanceof Error ? err.message : String(err)}`, offers: [], blockedAttempts: [], sessionId });
    } finally {
      setThinking(false);
      refreshAudit();
    }
  }

  return (
    <div className="container">
      <h1>Agentic Commerce — Engineering Console</h1>
      <p className="small">
        A vertical slice: heterogeneous merchant connectors (REST / MCP / structured web data) behind one capability
        contract, one shopping agent, a policy boundary, referral attribution, and merchant insight. See{" "}
        <span className="mono">docs/DEMO_SCRIPT.md</span> for the full walkthrough.
      </p>

      <div className="card">
        <h2>1–2–3. Connected Merchants (domain verification → authorization → connector)</h2>
        {merchants.map((m) => (
          <MerchantCard key={m.id} merchant={m} onChange={refreshMerchants} />
        ))}
        {merchants.length === 0 && <div className="small">No merchants yet — run `npm run seed`.</div>}
      </div>

      <div className="card">
        <h2>7–10. Shopper — Ask the agent</h2>
        <textarea style={{ width: "100%" }} rows={2} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button disabled={thinking} onClick={ask}>
            {thinking ? "Searching…" : "Ask agent"}
          </button>
        </div>

        {chat && (
          <div style={{ marginTop: 12 }}>
            <p>{chat.reply}</p>

            {chat.blockedAttempts.length > 0 && (
              <div className="card" style={{ borderColor: "#b3261e" }}>
                <strong>HIGH-RISK ACTION BLOCKED</strong>
                {chat.blockedAttempts.map((b, i) => (
                  <div key={i} className="small">
                    {b.untrustedContentDetected && <span className="tag flag">UNTRUSTED MERCHANT CONTENT DETECTED</span>}
                    <div>
                      {b.capability} on merchant {b.merchantId}: {b.reason}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {note && <div className="small">{note}</div>}
            {chat.offers.map((o, i) => (
              <OfferCard key={i} offer={o} sessionId={chat.sessionId} onSelected={setNote} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Audit log</h2>
        <div className="mono" style={{ maxHeight: 260, overflow: "auto" }}>
          {audit.map((e) => (
            <div key={e.id} className="small" style={{ marginBottom: 4 }}>
              {new Date(e.occurred_at).toLocaleTimeString()} · {e.actor} · {e.event_type}
              {e.capability ? ` · ${e.capability}` : ""}
              {e.policy_decision ? ` · ${e.policy_decision}` : ""} · {e.result}
            </div>
          ))}
        </div>
        <button className="secondary" onClick={refreshAudit} style={{ marginTop: 8 }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
