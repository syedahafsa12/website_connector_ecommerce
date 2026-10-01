"use client";

import type { ReactNode } from "react";
import type { view } from "@/server/connect/service";

export type View = ReturnType<typeof view>;

// ---------- icons (stroke, 1.75) ----------
const P: Record<string, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  box: <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7 12 12l8.7-5M12 22V12" />,
  doc: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6" />,
  cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  store: <><path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" /><path d="M9 20v-6h6v6" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  alert: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  link: <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};
export function Icon({ n, s = 18, sw = 1.75 }: { n: string; s?: number; sw?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[n]}
    </svg>
  );
}

// ---------- vocabulary ----------
/** What a merchant is asked to authorize. Raw scope names are kept out of the main UI. */
export const ACCESS = [
  { id: "catalog", scope: "catalog:read", icon: "bag", title: "Catalog", desc: "Products, details and prices", caps: ["catalog.read", "product.read"] },
  { id: "inventory", scope: "inventory:read", icon: "box", title: "Inventory", desc: "Stock availability", caps: ["inventory.read"] },
  { id: "policies", scope: "policies:read", icon: "doc", title: "Policies", desc: "Shipping, returns and store policies", caps: ["policy.read", "shipping.read"] },
  { id: "commerce", scope: "commerce:act", icon: "cart", title: "Commerce", desc: "Cart, checkout and orders", note: "Shopper approval required for purchases", caps: ["cart.read", "cart.add", "checkout.start", "order.place", "order.read"] },
] as const;

/** Short names used in the agent's activity line. */
export const FRIENDLY: Record<string, string> = {
  "catalog.read": "Catalog", "product.read": "Product details", "inventory.read": "Inventory", "policy.read": "Policies", "shipping.read": "Shipping",
  "cart.add": "Cart", "cart.read": "Cart", "checkout.start": "Checkout", "order.read": "Orders", "order.place": "Order",
};

export type Tone = "green" | "violet" | "amber" | "gray" | "red" | "blue";
export const TONE: Record<Tone, string> = { green: "#14803c", violet: "#6d4fd6", amber: "#a15c07", gray: "#77766f", red: "#c23b3b", blue: "#2b44ff" };

export function badge(v: View): { tone: Tone; label: string; sub: string } {
  switch (v.status) {
    case "CONNECTED": return { tone: "green", label: "Connected", sub: "Trusted connection" };
    case "PUBLIC_DATA_DISCOVERED": return { tone: "violet", label: "Public data", sub: "Not verified" };
    case "REQUIRES_VERIFICATION": return { tone: "amber", label: "Verification required", sub: "Ready to verify" };
    case "REQUIRES_AUTHORIZATION": return { tone: "blue", label: "Authorization needed", sub: "Ownership verified" };
    case "UNSUPPORTED": {
      const k = v.classification?.classification;
      if (k === "ECOMMERCE" || k === "MARKETPLACE") return { tone: "violet", label: k === "MARKETPLACE" ? "Marketplace detected" : "Ecommerce detected", sub: "Not verified · not trusted" };
      if (k === "SERVICE") return { tone: "violet", label: "Service business detected", sub: "Not verified · not trusted" };
      if (k === "CONTENT") return { tone: "gray", label: "Content site detected", sub: "Nothing to connect" };
      if (k === "UNKNOWN") return v.classification?.blocked ? { tone: "amber", label: "Bot protection", sub: "Couldn’t read this site" } : { tone: "gray", label: "Couldn’t identify", sub: "Not enough readable content" };
      return { tone: "gray", label: "No commerce found", sub: "Nothing to connect" };
    }
    default: return { tone: "red", label: "Couldn’t connect", sub: friendlyError(v).title };
  }
}

/** What public discovery recognised. Descriptive only: it is never a trust or authorization state. */
export function detected(v: View): { title: string; text: string; provable: boolean } | null {
  const c = v.classification;
  if (!c || c.confidence < 0.5) return null;
  const why = c.evidence.slice(0, 3).join("; ");
  const tail = " Ownership has not been verified. This is not a trusted connection.";
  if (c.classification === "ECOMMERCE" || c.classification === "MARKETPLACE") return { title: "ECOMMERCE / MARKETPLACE DETECTED", text: `Public commerce signals were discovered (${why}).${tail}`, provable: true };
  if (c.classification === "SERVICE") return { title: "SERVICE BUSINESS DETECTED", text: `Public service signals were discovered (${why}).${tail}`, provable: true };
  if (c.classification === "CONTENT") return { title: "CONTENT WEBSITE DETECTED", text: `This looks like a content website (${why}). There is no commerce to connect.`, provable: false };
  return null;
}

export function friendlyError(v: View): { title: string; hint: string } {
  switch (v.fatal?.code) {
    case "DNS_FAILED": return { title: "We couldn’t find that website", hint: "Check the address for typos." };
    case "TIMEOUT": return { title: "That website took too long to respond", hint: "It may be down or blocking automated access." };
    case "REDIRECT_BLOCKED": return { title: "That address redirects to another site", hint: "We only follow redirects within the same site." };
    case "HTTP_ERROR": {
      const guard = /bot protection/.test(v.fatal?.message ?? "");
      const by = /server: ([^)]+)/.exec(v.fatal?.message ?? "")?.[1];
      return guard
        ? { title: "This website has bot protection", hint: `It refused our automated, read-only request${by ? ` (protection layer: ${by})` : ""}, so we couldn’t read the site to tell what it is. We never try to bypass bot protection. You can still connect it if you own it: add the ownership tag, or ask the site to allow our request.` }
        : { title: "The website declined our request", hint: "It may require sign-in or block automated access. We don’t try to bypass that." };
    }
    case "TLS_ERROR": return { title: "We couldn’t establish a secure connection", hint: "The site’s certificate could not be trusted." };
    case "INVALID_URL": case "UNSUPPORTED_SCHEME": case "CREDENTIALS_IN_URL": case "NONSTANDARD_PORT": case "BLOCKED_ADDRESS":
      return { title: "That isn’t a public website address", hint: "Enter a normal https:// address." };
    case "UNSUPPORTED_DATA": return { title: "That page isn’t a website we can read", hint: "It returned something other than a web page." };
    default: return { title: "We couldn’t reach that website", hint: "Try again, or try another site." };
  }
}

export function formatPrice(p?: number | null, cur?: string) {
  if (p === undefined || p === null) return null;
  const n = Number.isInteger(p) ? String(p) : p.toFixed(2);
  const sym: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  if (!cur) return n;
  return sym[cur] ? `${sym[cur]}${n}` : `${n} ${cur}`;
}

/** Visual identity for a store: its real favicon when available, otherwise its initial. */
export function Brand({ v, size = 40 }: { v: { name: string; site: { icon?: string } }; size?: number }) {
  return (
    <span className="cx-brandmark" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {v.site.icon ? <img src={v.site.icon} alt="" referrerPolicy="no-referrer" /> : v.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// ---------- the architecture drawing: the product story as a single line ----------
export const FLOW = [
  { id: "website", label: "Website", icon: "globe" },
  { id: "ownership", label: "Ownership", icon: "shield" },
  { id: "authorization", label: "Authorization", icon: "lock" },
  { id: "capabilities", label: "Capabilities", icon: "box" },
  { id: "connected", label: "Connected", icon: "link" },
  { id: "agent", label: "Agent", icon: "user" },
] as const;

export function Flow({ active, compact = false }: { active: number; compact?: boolean }) {
  return (
    <ol className={`cx-flow ${compact ? "compact" : ""}`} aria-label="Connection progress">
      {FLOW.map((f, i) => (
        <li key={f.id} className={i < active ? "done" : i === active ? "on" : ""}>
          <span className="node">{i < active ? <Icon n="check" s={14} sw={2.4} /> : <Icon n={f.icon} s={14} />}</span>
          <span className="lbl">{f.label}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------- connection details (the technical proof lives here) ----------
export function Drawer({ v, onClose, onRediscover, onScopes, busy }: { v: View; onClose: () => void; onRediscover: () => void; onScopes: (scopes: string[]) => void; busy: boolean }) {
  const b = badge(v);
  const rejected = v.capabilities.filter((c) => c.state === "rejected");
  const live = v.capabilities.filter((c) => c.state !== "rejected");
  const groups = ACCESS.map((g) => ({ g, caps: live.filter((c) => c.cap && (g.caps as readonly string[]).includes(c.cap)) })).filter((x) => x.caps.length);
  return (
    <>
      <div className="cx-scrim" onClick={onClose} />
      <aside className="cx-drawer" role="dialog" aria-label="Connection details">
        <div className="cx-dhead">
          <div><h3>Connection details</h3><div className="sub">{v.name} · {v.host}</div></div>
          <button className="cx-icon" onClick={onClose} aria-label="Close"><Icon n="x" /></button>
        </div>

        <div className="cx-dsec"><h6>Trust</h6>
          <div className="cx-kv">
            <div>Status</div><div style={{ color: TONE[b.tone] }}>{b.label}</div>
            <div>Trust</div><div>{v.trust === "trusted" ? "Verified merchant" : v.trust === "public" ? "Public data — not a merchant connection" : "No usable access"}</div>
            <div>Ownership</div><div>{v.ownership.verified ? `Verified (${v.ownership.attempts.find((a) => a.ok)?.method ?? "token"})` : "Not verified"}</div>
            <div>Authorization</div><div>{v.authorization.authorized ? `Granted · ${v.authorization.granted.join(", ") || "no scopes"}` : "Not granted"}</div>
            <div>Discovery</div><div>{v.discovery.methods.join(", ") || "none found"}</div>
            {v.fatal && <><div>Failure</div><div>{v.fatal.code}: {v.fatal.message}</div></>}
          </div>
        </div>

        {v.authorization.authorized && (
          <div className="cx-dsec"><h6>Access granted to Agents</h6>
            {ACCESS.filter((g) => v.capabilities.some((c) => c.state !== "rejected" && (g.caps as readonly string[]).includes(c.cap ?? ""))).map((g) => {
              const on = (v.authorization.granted as string[]).includes(g.scope);
              const next = on ? v.authorization.granted.filter((s) => s !== g.scope) : [...v.authorization.granted, g.scope];
              return (
                <button key={g.id} className="cx-li link" role="switch" aria-checked={on} disabled={busy} onClick={() => onScopes(next)}>
                  <span className="ic"><Icon n={g.icon} s={16} /></span>
                  <span className="tx"><b>{g.title}</b><small>{g.desc}</small></span>
                  <span className={`cx-toggle ${on ? "on" : ""}`} />
                </button>
              );
            })}
            <small className="cx-muted">Changes apply immediately: the backend rejects any Agent call for access that is switched off.</small>
          </div>
        )}

        <div className="cx-dsec"><h6>Discovery evidence</h6>
          {v.discovery.evidence.map((e, i) => (
            <div className="cx-row" key={i}>
              <span className="s" style={{ color: e.ok ? TONE.green : TONE.gray }}>{e.ok ? "✓" : "–"}</span>
              <div><b style={{ fontWeight: 550 }}>{e.step}</b><small>{e.detail}</small></div>
            </div>
          ))}
        </div>

        <div className="cx-dsec"><h6>Capabilities</h6>
          {groups.length === 0 && <div className="cx-muted">None found.</div>}
          {groups.map(({ g, caps }) => (
            <div className="cx-row" key={g.id}>
              <span className="s" style={{ color: caps.some((c) => c.state === "enabled") ? TONE.green : caps.some((c) => c.state === "public") ? TONE.violet : TONE.amber }}>
                {caps.some((c) => c.state === "enabled") ? "✓" : caps.some((c) => c.state === "public") ? "◐" : "…"}
              </span>
              <div>
                <b>{g.title}</b>
                {caps.map((c, i) => <small key={i}><span className="cx-mono">{c.cap}</span> — {c.reason}</small>)}
              </div>
            </div>
          ))}
          {rejected.length > 0 && <h6 style={{ marginTop: 18 }}>Rejected ({rejected.length})</h6>}
          {rejected.map((c, i) => <div className="cx-row" key={i}><span className="s" style={{ color: TONE.red }}>✕</span><div><span className="cx-mono">{c.declaredId}</span><small>{c.reason}</small></div></div>)}
        </div>

        <div className="cx-dsec"><h6>Audit</h6>
          {v.audit.length === 0 && <div className="cx-muted">No activity yet.</div>}
          {v.audit.map((a, i) => (
            <div className="cx-row" key={i}>
              <span className="s" style={{ color: a.result === "denied" || a.result === "error" ? TONE.red : TONE.green }}>{a.result === "denied" || a.result === "error" ? "✕" : "✓"}</span>
              <div><b style={{ fontWeight: 550 }}>{a.action}</b> <span className="cx-muted">· {a.actor} · {a.at.slice(11, 19)}</span>{a.detail && <small>{a.detail}</small>}</div>
            </div>
          ))}
          {v.commerce.orders.length > 0 && <small className="cx-muted">Orders: {v.commerce.orders.map((o) => `${o.id} (${o.status})`).join(", ")}</small>}
        </div>

        <div className="cx-dsec"><h6>Security</h6>
          <div className="cx-kv">
            <div>Untrusted content</div><div>{v.flagsSeen} injection pattern match(es) withheld</div>
            <div>Scope</div><div>Same-origin only · redirects restricted · private networks blocked</div>
            <div>Last request</div><div className="cx-mono">{v.last ? `${v.last.method} ${v.last.url}` : "none"}</div>
            <div>Response</div><div className="cx-mono">{v.last ? `${v.last.status} · ${v.last.ms} ms` : "—"}</div>
            <div>Request ID</div><div className="cx-mono">{v.last?.id ?? "—"}</div>
          </div>
        </div>

        {v.discovery.signals.length > 0 && (
          <div className="cx-dsec"><h6>Discovery signals</h6>{v.discovery.signals.map((s, i) => <div key={i} className="cx-mono cx-muted">• {s}</div>)}</div>
        )}
        {v.trace.length > 0 && (
          <div className="cx-dsec"><h6>Request trace</h6>
            <div className="cx-trace cx-mono">{v.trace.map((t) => <div key={t.id}>{t.at.slice(11, 19)} {t.id} {String(t.status).padEnd(9)} {String(t.ms).padStart(5)}ms {t.method} {t.purpose} {t.url}{t.note ? ` — ${t.note}` : ""}</div>)}</div>
          </div>
        )}
        {!v.fatal && <div className="cx-dsec"><button className="cx-btn ghost sm" disabled={busy} onClick={onRediscover}>Re-run discovery</button></div>}
      </aside>
    </>
  );
}
