"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentProduct, AgentResult, Cell, CompareRow, PendingApproval } from "@/server/connect/agent";
import { ACCESS, badge, Brand, detected, Drawer, Flow, formatPrice, friendlyError, FRIENDLY, Icon, TONE, type View } from "./ui";

type Decision = { state: "pending" | "confirming" | "done" | "cancelled" | "error"; order?: { id: string; status: string; paymentStatus?: string; total?: number; currency?: string; note?: string }; error?: string };
type Turn = { user: string; reply: string; products: AgentProduct[]; comparison?: CompareRow[]; steps: AgentResult["steps"]; approval?: PendingApproval; tools: AgentResult["tools"]; mode: AgentResult["mode"]; decision?: Decision };
type Phase = "home" | "checking" | "store" | "verify" | "verified" | "authorize" | "connecting" | "connected" | "agent";

async function post<T>(action: string, body: object = {}): Promise<T> {
  const res = await fetch(`/api/connect/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}

/** Where a connection belongs in the flow, derived purely from backend state. */
function phaseFor(v: View): Phase {
  if (v.fatal) return "home";
  if (v.trust === "trusted") return "connected";
  if (v.ownership.verified) return "authorize";
  return "store";
}
const FLOW_AT: Partial<Record<Phase, number>> = { checking: 0, store: 1, verify: 1, verified: 2, authorize: 2, connecting: 3, connected: 4, agent: 5 };
const CHECKS = ["Website reachable", "Ecommerce platform detected", "Store catalog found", "Connection method available"];

const plural = (w: string) => (/(wear|s|apparel|clothing|footwear|jewelry)$/i.test(w) ? w : `${w}s`);
const foundGroups = (v: View) => ACCESS.filter((g) => v.capabilities.some((c) => c.state !== "rejected" && (g.caps as readonly string[]).includes(c.cap ?? "")));

function promptsFor(v: View, mall: number): string[] {
  const has = (c: string) => (v.enabledCaps as string[]).includes(c);
  const out: string[] = [];
  if (has("catalog.read")) {
    const cat = v.preview?.categories[0];
    const prices = [...(v.preview?.prices ?? [])].sort((a, b) => a - b);
    if (cat && prices.length) {
      const med = prices[Math.floor(prices.length / 2)]!;
      out.push(`Show me ${plural(cat)} under $${med < 100 ? Math.ceil((med * 1.5) / 10) * 10 : Math.ceil((med * 1.5) / 50) * 50}`);
    } else out.push("Show me what you have");
  }
  if (has("inventory.read")) out.push("What’s currently in stock?");
  if (has("policy.read") || has("shipping.read")) out.push("What’s your return policy?");
  if (has("cart.add") && v.preview?.products[0]) out.push(`I want the ${v.preview.products[0].name}`);
  if (mall > 1) out.push("Which store has the cheapest option?");
  return out.slice(0, 5);
}

export default function ConnectPage() {
  const [origin, setOrigin] = useState("");
  const [url, setUrl] = useState("");
  const [conns, setConns] = useState<View[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("home");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [turns, setTurns] = useState<Record<string, Turn[]>>({});
  const [msg, setMsg] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [recent, setRecent] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [off, setOff] = useState<string[]>([]);
  const [prog, setProg] = useState(2);
  const [checkStep, setCheckStep] = useState(0);
  const [checkHost, setCheckHost] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const luna = process.env.NEXT_PUBLIC_LUNA_URL ?? "";

  useEffect(() => {
    setOrigin(window.location.origin);
    post<{ connections: View[] }>("list").then((r) => setConns(r.connections)).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  const sel = conns.find((c) => c.id === selId) ?? null;
  const trustedStores = [...new Map(conns.filter((c) => c.trust === "trusted").reverse().map((c) => [c.url, c] as const)).values()];
  const upsert = (c: View) => setConns((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [c, ...l]));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  const select = (v: View) => { setSelId(v.id); setPhase(phaseFor(v)); setUrl(v.input); setErr(""); setVerifyFailed(false); setOff([]); setRecent(false); };
  const fresh = () => { setSelId(null); setPhase("home"); setUrl(""); setErr(""); setRecent(false); setTimeout(() => inputRef.current?.focus(), 50); };

  const test = (target: string) => {
    if (busy) return;
    setUrl(target); setSelId(null); setErr(""); setCheckStep(0); setRecent(false);
    try { setCheckHost(new URL(/^[a-z]+:\/\//i.test(target) ? target : `https://${target}`).host); } catch { setCheckHost(target.slice(0, 40)); }
    setPhase("checking");
    return run("start", async () => {
      const v = (await post<{ connection: View }>("start", { url: target })).connection;
      upsert(v); setSelId(v.id);
      if (v.fatal) { setPhase("home"); return; }
      for (let i = 1; i <= CHECKS.length; i++) { setCheckStep(i); await wait(420); }
      await wait(250);
      setPhase(phaseFor(v));
    });
  };
  const checkResult = (i: number) => {
    if (!sel) return true;
    const live = sel.capabilities.filter((c) => c.state !== "rejected");
    return [!sel.fatal, sel.ecommerce, live.some((c) => c.cap === "catalog.read" || c.cap === "product.read") || !!sel.preview, live.length > 0][i]!;
  };

  const verify = () => run("verify", async () => {
    const r = await post<{ connection: View }>("verify", { id: sel!.id });
    upsert(r.connection);
    if (r.connection.ownership.verified) { setPhase("verified"); setVerifyFailed(false); } else setVerifyFailed(true);
  });
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1400); } catch { /* clipboard unavailable */ }
  };

  const det = sel ? detected(sel) : null;
  const groups = sel ? foundGroups(sel).filter((g) => g.id !== "commerce" || sel.capabilities.some((c) => c.cap === "cart.add" && c.state !== "rejected")) : [];
  const picked = groups.filter((g) => !off.includes(g.scope));

  const authorize = async () => {
    if (busy || !sel) return;
    setBusy("authorize"); setErr(""); setPhase("connecting"); setProg(2);
    const id = sel.id;
    const timers = [setTimeout(() => setProg(3), 700), setTimeout(() => setProg(4), 1500)];
    try {
      const [a] = await Promise.all([
        post<{ connection: View }>("authorize", { id, scopes: picked.map((g) => g.scope) }).then(() => post<{ connection: View }>("rediscover", { id })),
        wait(2200),
      ]);
      upsert(a.connection); setProg(5); await wait(350);
      setPhase(phaseFor(a.connection) === "connected" ? "connected" : "authorize");
      if (a.connection.fatal) setErr(a.connection.fatal.message);
    } catch (e) { setErr((e as Error).message); setPhase("authorize"); }
    timers.forEach(clearTimeout);
    setBusy("");
  };

  const patchTurn = (id: string, idx: number, fn: (t: Turn) => Turn) =>
    setTurns((t) => { const l = [...(t[id] ?? [])]; if (l[idx]) l[idx] = fn(l[idx]!); return { ...t, [id]: l }; });

  const ask = (text: string) => {
    if (!sel || !text.trim()) return;
    const id = sel.id;
    setMsg("");
    setTurns((t) => ({ ...t, [id]: [...(t[id] ?? []), { user: text, reply: "", products: [], steps: [], tools: [], mode: sel.trust }] }));
    return run("agent", async () => {
      const r = await post<AgentResult & { connection: View }>("agent", { id, message: text });
      upsert(r.connection);
      setTurns((t) => { const l = [...(t[id] ?? [])]; l[l.length - 1] = { user: text, reply: r.reply, products: r.products, comparison: r.comparison, steps: r.steps ?? [], approval: r.approval, tools: r.tools, mode: r.mode, decision: r.approval ? { state: "pending" } : undefined }; return { ...t, [id]: l }; });
    });
  };

  const confirm = async (turnIdx: number) => {
    const t = turns[sel!.id]?.[turnIdx];
    if (!t?.approval) return;
    const ap = t.approval;
    patchTurn(sel!.id, turnIdx, (x) => ({ ...x, decision: { state: "confirming" } }));
    try {
      const r = await post<{ ok: boolean; order: Decision["order"] | null; error: { message: string } | null; connection: View }>("confirm", { id: ap.connectionId, checkoutId: ap.checkoutId });
      upsert(r.connection);
      patchTurn(sel!.id, turnIdx, (x) => ({ ...x, decision: r.ok && r.order ? { state: "done", order: r.order } : { state: "error", error: r.error?.message ?? "The merchant could not complete the order." } }));
    } catch (e) { patchTurn(sel!.id, turnIdx, (x) => ({ ...x, decision: { state: "error", error: (e as Error).message } })); }
  };

  const visit = async (p: AgentProduct) => {
    if (!p.url) return;
    try { await post("visit", { id: p.storeId, url: p.url }); } catch { /* audit is best-effort; the shopper's click still proceeds */ }
    window.open(p.url, "_blank", "noopener,noreferrer");
  };

  const setScopes = (scopes: string[]) => run("scopes", async () => {
    const r = await post<{ connection: View }>("authorize", { id: sel!.id, scopes });
    upsert(r.connection);
  });
  const cell = (c: Cell) => ("value" in c ? <span>{c.value}</span> : <span className="miss">{c.missing === "not authorized" ? "Not authorized" : "Not available"}</span>);
  const reset = async () => { await post("reset"); setConns([]); setTurns({}); fresh(); };
  const rediscover = () => run("rediscover", async () => { const r = await post<{ connection: View }>("rediscover", { id: sel!.id }); upsert(r.connection); });

  const examples: Array<[string, string]> = [["Cadence Cycles", `${origin}/demo-store`], ...(luna ? ([["Luna Apparel", luna]] as Array<[string, string]>) : []), ["Allbirds", "https://www.allbirds.com"]];
  const flowAt = FLOW_AT[phase];
  const sb = sel ? badge(sel) : null;
  const money = (n?: number | null, cur?: string) => formatPrice(n, cur) ?? "—";

  return (
    <div className="cx-root">
      <header className="cx-top">
        <button className="cx-wordmark" onClick={fresh}><i><Icon n="store" s={13} /></i>Agentic Mall</button>
        <div className="cx-tools">
          {sel && <button className="cx-textbtn" onClick={() => setDrawer(true)}><Icon n="code" s={15} />Connection details</button>}
          <button className="cx-textbtn" onClick={() => setRecent((r) => !r)}>Stores {conns.length > 0 && <span className="cx-count">{conns.length}</span>}</button>
          {recent && (
            <div className="cx-pop">
              {conns.length === 0 && <div className="none">No stores yet.</div>}
              {[...new Map(conns.map((c) => [c.url ?? c.id, c] as const)).values()].slice(0, 8).map((c) => {
                const b = badge(c);
                return (
                  <button key={c.id} className={`item ${c.id === selId ? "on" : ""}`} onClick={() => select(c)}>
                    <Brand v={c} size={30} />
                    <span><b>{c.name}</b><small style={{ color: TONE[b.tone] }}>{b.label}</small></span>
                  </button>
                );
              })}
              <button className="cx-textbtn" style={{ margin: "6px 4px 2px" }} onClick={fresh}><Icon n="plus" s={14} />Connect a store</button>
              {conns.length > 0 && <button className="cx-textbtn" style={{ margin: "0 4px 4px" }} onClick={reset}>Clear all</button>}
            </div>
          )}
        </div>
      </header>

      <main className="cx-main">
        {/* ---------- connect a store ---------- */}
        {phase === "home" && (
          <section className="cx-screen" key="home">
            <div className="cx-eyebrow">Connect a store</div>
            <h1 className="cx-h1">Make your website a store in the mall.</h1>
            <p className="cx-lead">Prove you own it, choose what Agents can do, and shoppers’ Agents can search it and buy from it.</p>
            <form className="cx-field" onSubmit={(e) => { e.preventDefault(); if (url.trim()) test(url.trim()); }}>
              <Icon n="globe" s={18} />
              <input ref={inputRef} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com" autoFocus spellCheck={false} />
              <button className="cx-btn" type="submit" disabled={!!busy || !url.trim()}>Connect <Icon n="arrow" s={15} /></button>
            </form>
            {sel?.fatal && (
              <div className="cx-alert">
                <span style={{ color: TONE.red }}><Icon n="alert" s={20} /></span>
                <div>
                  <b>{friendlyError(sel).title}</b><p>{friendlyError(sel).hint}</p>
                  {sel.fatal.suggestedUrl && <div className="act"><button className="cx-btn ghost sm" disabled={!!busy} onClick={() => test(sel.fatal!.suggestedUrl!)}>Try {sel.fatal.suggestedUrl.replace(/^https?:\/\//, "")}</button></div>}
                </div>
              </div>
            )}
            {err && !sel?.fatal && <div className="cx-note">{err}</div>}
            <div className="cx-examples">
              <span>Try</span>
              {examples.map(([l, u]) => <button key={l} disabled={!!busy || !origin} onClick={() => test(u)}>{l}</button>)}
            </div>
            <Flow active={-1} />
          </section>
        )}

        {/* ---------- checking ---------- */}
        {phase === "checking" && (
          <section className="cx-screen" key="checking">
            <Flow active={0} compact />
            <div className="cx-eyebrow">{checkHost}</div>
            <h2 className="cx-h2">Checking your website</h2>
            <div className="cx-checks">
              {CHECKS.map((t, i) => {
                const done = checkStep > i; const ok = done && checkResult(i);
                return <div key={t} className={done ? (ok ? "show" : "miss") : ""}><span className="ck">{done ? <Icon n={ok ? "check" : "x"} s={12} sw={2.6} /> : checkStep === i ? <span className="cx-spin" /> : null}</span>{t}</div>;
              })}
            </div>
          </section>
        )}

        {/* ---------- store detected ---------- */}
        {phase === "store" && sel && sb && (
          <section className="cx-screen" key="store">
            <Flow active={FLOW_AT.store!} compact />
            <div className="cx-storehead">
              <Brand v={sel} size={52} />
              <div style={{ flex: 1 }}>
                <h2>{sel.name}</h2>
                <div className="host">{sel.host}{sel.platform && sel.ecommerce ? ` · ${sel.platform}` : ""}</div>
              </div>
              <span className="cx-status" style={{ color: TONE[sb.tone] }}><i />{sb.label}</span>
            </div>
            {sel.preview && (
              <div className="cx-thumbs">
                {sel.preview.products.map((p) => (
                  <div className="cx-thumb" key={p.name}>
                    <div className="im">{p.image ? <img src={p.image} alt="" referrerPolicy="no-referrer" loading="lazy" /> : p.name.slice(0, 1)}</div>
                    <b>{p.name}</b><small>{formatPrice(p.price, p.currency) ?? ""}</small>
                  </div>
                ))}
              </div>
            )}
            {foundGroups(sel).length > 0 && (
              <div className="cx-list">
                {foundGroups(sel).map((g) => (
                  <div className="cx-li" key={g.id}>
                    <span className="ic"><Icon n={g.icon} s={17} /></span>
                    <span className="tx"><b>{g.title}</b><small>{g.desc}</small></span>
                    <span className="end"><Icon n="check" s={14} sw={2.4} />Found</span>
                  </div>
                ))}
              </div>
            )}
            {sel.trust === "public" && <div className="cx-callout violet"><Icon n="shield" s={17} /><span>Ownership hasn’t been verified, so this isn’t a trusted merchant connection. You can explore the public data, but nothing can be done on the owner’s behalf.</span></div>}
            {sel.status === "REQUIRES_VERIFICATION" && <div className="cx-callout amber"><Icon n="lock" s={17} /><span>Before we can create a trusted connection, you’ll need to prove you control this website.</span></div>}
            {sel.status === "UNSUPPORTED" && det && sel.capabilities.length === 0 && <div className="cx-callout violet"><Icon n="shield" s={17} /><span><b>{det.title}</b><br />{det.text}</span></div>}
            {sel.status === "UNSUPPORTED" && !(det && sel.capabilities.length === 0) && <div className="cx-callout"><Icon n="alert" s={17} /><span>{sel.capabilities.length > 0 ? "This site advertises capabilities, but none passed our checks, so nothing can be connected." : sel.ecommerce ? "This looks like a store, but it doesn’t publish product data the platform can read yet." : sel.classification?.blocked ? "This website has bot protection. It showed our automated, read-only request a challenge page instead of its real content, so we can’t tell what it is. We never try to bypass bot protection. If you own this site, you can still prove ownership." : sel.classification?.classification === "UNKNOWN" ? "We couldn’t read enough of this website to tell what it is — it may block automated access or render only in a browser. Nothing was assumed." : "This doesn’t look like an online store, and no commerce data was found."}</span></div>}
            <div className="cx-cta">
              {sel.status === "UNSUPPORTED" ? (
                <>{det?.provable && <button className="cx-btn" onClick={() => setPhase("verify")}>Prove ownership <Icon n="arrow" s={15} /></button>}<button className={det?.provable ? "cx-btn ghost" : "cx-btn"} onClick={fresh}>Try another website</button><button className="cx-btn ghost" onClick={() => setDrawer(true)}>Why?</button></>
              ) : (
                <>
                  <button className="cx-btn" onClick={() => setPhase("verify")}>{sel.trust === "public" ? "Verify ownership" : "Continue"} <Icon n="arrow" s={15} /></button>
                  {sel.trust === "public" && <button className="cx-btn ghost" onClick={() => setPhase("agent")}>Explore public data</button>}
                </>
              )}
            </div>
          </section>
        )}

        {/* ---------- verify ownership ---------- */}
        {phase === "verify" && sel && (
          <section className="cx-screen" key="verify">
            <Flow active={FLOW_AT.verify!} compact />
            <div className="cx-eyebrow">{sel.name}</div>
            <h2 className="cx-h2">Verify you own {sel.host}</h2>
            <p className="cx-lead">Publish the token on your site by any one of these methods. We check it directly.</p>
            <div style={{ marginTop: 22 }}>
              {([
                ["meta tag", "Meta tag", "Add a verification tag to your site", "tag", sel.ownership.instructions?.meta ?? "", sel.ownership.instructions?.meta ?? ""],
                ["well-known file", "Verification file", "Publish a verification file", "doc", sel.ownership.instructions ? `${sel.ownership.instructions.file.path}\n${sel.ownership.instructions.file.content}` : "", sel.ownership.instructions?.file.content ?? ""],
                ["DNS TXT", "DNS record", "Add a verification record", "globe", sel.ownership.instructions?.dns ? `${sel.ownership.instructions.dns.type}  ${sel.ownership.instructions.dns.name}\n${sel.ownership.instructions.dns.value}` : "", sel.ownership.instructions?.dns?.value ?? ""],
              ] as const).filter(([k]) => k !== "DNS TXT" || sel.ownership.instructions?.dns).map(([key, title, desc, icon, code, copyText]) => {
                const a = sel.ownership.attempts.find((x) => x.method === key);
                const st = verifyFailed && a ? (a.ok ? "ok" : "bad") : "";
                return (
                  <div key={key} className={`cx-method ${st}`}>
                    <div className="head">
                      <span className="st">{st === "bad" ? <Icon n="x" s={13} sw={2.6} /> : <Icon n={st === "ok" ? "check" : icon} s={13} sw={2.2} />}</span>
                      <div className="grow"><h4>{title}</h4><p>{desc}</p></div>
                      <button className="cx-textbtn" onClick={() => setOpen(open === key ? null : key)}>{open === key ? "Hide" : "Show"}</button>
                    </div>
                    {open === key && <div className="cx-code"><span>{code}</span><button className="cx-copy" onClick={() => copy(key, copyText)} aria-label="Copy"><Icon n={copied === key ? "check" : "copy"} s={15} /></button></div>}
                  </div>
                );
              })}
            </div>
            {verifyFailed && <div className="cx-note">We couldn’t find the token yet. Publish it using one of the methods above, then try again.</div>}
            {err && <div className="cx-note">{err}</div>}
            <div className="cx-cta">
              <button className="cx-btn" disabled={!!busy} onClick={verify}>{busy === "verify" ? <><span className="cx-spin" style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,.4)" }} />Verifying…</> : <>Verify ownership <Icon n="arrow" s={15} /></>}</button>
              <button className="cx-textbtn" onClick={() => setPhase("store")}>Back</button>
            </div>
          </section>
        )}

        {phase === "verified" && sel && (
          <section className="cx-screen" key="verified">
            <Flow active={FLOW_AT.verified!} compact />
            <div className="cx-eyebrow">{sel.name}</div>
            <h2 className="cx-h2">Ownership verified</h2>
            <p className="cx-lead">{sel.host} is confirmed as yours.</p>
            <div className="cx-cta"><button className="cx-btn" onClick={() => setPhase("authorize")}>Continue <Icon n="arrow" s={15} /></button></div>
          </section>
        )}

        {/* ---------- authorize ---------- */}
        {phase === "authorize" && sel && (
          <section className="cx-screen" key="authorize">
            <Flow active={FLOW_AT.authorize!} compact />
            <div className="cx-storehead"><Brand v={sel} size={44} /><div><h2 style={{ fontSize: 26 }}>Authorize Agentic Mall</h2><div className="host">to access {sel.name}</div></div></div>
            <div className="cx-list">
              {groups.map((g) => {
                const on = !off.includes(g.scope);
                return (
                  <button key={g.id} className={`cx-li link ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => setOff((o) => (o.includes(g.scope) ? o.filter((x) => x !== g.scope) : [...o, g.scope]))}>
                    <span className="ic"><Icon n={g.icon} s={17} /></span>
                    <span className="tx"><b>{g.title}</b><small>{g.desc}{"note" in g && g.note ? ` · ${g.note}` : ""}</small></span>
                    <span className={`cx-toggle ${on ? "on" : ""}`} />
                  </button>
                );
              })}
              {groups.length === 0 && <div className="cx-note" style={{ color: "var(--ink3)" }}>Nothing to authorize.</div>}
            </div>
            {err && <div className="cx-note">{err}</div>}
            <div className="cx-cta">
              <button className="cx-btn accent" disabled={!!busy || picked.length === 0} onClick={authorize}>Authorize <Icon n="arrow" s={15} /></button>
              <button className="cx-textbtn" onClick={fresh}>Cancel</button>
            </div>
          </section>
        )}

        {/* ---------- connecting ---------- */}
        {phase === "connecting" && (
          <section className="cx-screen" key="connecting">
            <div className="cx-eyebrow">{sel?.name}</div>
            <h2 className="cx-h2">Connecting</h2>
            <Flow active={prog} />
          </section>
        )}

        {/* ---------- connected ---------- */}
        {phase === "connected" && sel && (
          <section className="cx-screen" key="connected">
            <Flow active={FLOW_AT.connected!} compact />
            <div className="cx-storehead">
              <Brand v={sel} size={52} />
              <div style={{ flex: 1 }}><h2>{sel.name}</h2><div className="host">{sel.host}</div></div>
              <span className="cx-status" style={{ color: TONE.green }}><i />Connected</span>
            </div>
            <div className="cx-list">
              <div className="cx-li"><span className="ic"><Icon n="shield" s={17} /></span><span className="tx"><b>Website verified</b><small>Ownership confirmed by {sel.ownership.attempts.find((a) => a.ok)?.method ?? "token"}</small></span><span className="end"><Icon n="check" s={14} sw={2.4} /></span></div>
              {ACCESS.filter((g) => g.caps.some((c) => (sel.enabledCaps as string[]).includes(c))).map((g) => (
                <div className="cx-li" key={g.id}><span className="ic"><Icon n={g.icon} s={17} /></span><span className="tx"><b>{g.id === "commerce" ? "Checkout" : g.title}</b><small>{g.id === "commerce" ? "Cart, checkout and orders · shopper approves purchases" : g.desc}</small></span><span className="end"><Icon n="check" s={14} sw={2.4} /></span></div>
              ))}
            </div>
            {trustedStores.length > 1 && <p className="cx-muted" style={{ marginTop: 18, fontSize: 14 }}>In your mall: {trustedStores.map((s) => s.name).join(" · ")}</p>}
            <div className="cx-cta">
              <button className="cx-btn" onClick={() => setPhase("agent")}>Open Agent <Icon n="arrow" s={15} /></button>
              <button className="cx-btn ghost" onClick={() => setDrawer(true)}>Connection details</button>
            </div>
          </section>
        )}

        {/* ---------- agent ---------- */}
        {phase === "agent" && sel && (
          <section className="cx-screen" key="agent">
            <div className="cx-agenthead">
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Brand v={sel} size={40} />
                <div><h2>{sel.name}</h2><div className="sub">{sel.trust === "trusted" && trustedStores.length > 1 ? `Searching ${trustedStores.length} stores: ${trustedStores.map((s) => s.name).join(", ")}` : "Ask about products, stock, policies — or buy."}</div></div>
              </div>
              <span className="cx-status" style={{ color: sel.trust === "trusted" ? TONE.green : TONE.violet }}><i />{sel.trust === "trusted" ? "Trusted connection" : "Public data · unverified"}</span>
            </div>
            <div className="cx-chat">
              <div className="cx-msgs">
                {(turns[sel.id] ?? []).length === 0 && <div className="cx-empty"><b>What are you looking for?</b>Your Agent works with {sel.name}’s real catalog.</div>}
                {(turns[sel.id] ?? []).map((t, i) => {
                  const pending = !t.reply;
                  const used = [...new Set(t.tools.filter((x) => x.ok).map((x) => FRIENDLY[x.name] ?? ""))].filter(Boolean);
                  const d = t.decision;
                  return (
                    <div key={i} style={{ display: "contents" }}>
                      <div className="cx-user">{t.user}</div>
                      <div className="cx-bot">
                        <span className="av"><Icon n="user" s={14} /></span>
                        <div className="body">
                          {pending ? <span className="cx-typing"><i /><i /><i /></span> : <div className="txt">{t.reply.replace(/\*\*/g, "")}</div>}
                          {t.products.length > 0 && (
                            <div className="cx-prods">
                              {t.products.map((p) => (
                                <div className="cx-prod" key={`${p.storeId}:${p.id}`}>
                                  <div className="img">{p.image ? <img src={p.image} alt="" referrerPolicy="no-referrer" loading="lazy" /> : p.name.slice(0, 1)}</div>
                                  <h5>{p.name}</h5>
                                  <div className="meta">
                                    {p.price !== undefined && <span>{formatPrice(p.price, p.currency)}</span>}
                                    {p.inStock === true && <span className="stock in">In stock</span>}
                                    {p.inStock === false && <span className="stock out">Out of stock</span>}
                                  </div>
                                  {trustedStores.length > 1 && <div className="store">{p.storeName}</div>}
                                  {p.flagged && <div className="warn">Unsafe text removed</div>}
                                  {p.url && <button className="visit" onClick={() => visit(p)}>View on store <Icon n="arrow" s={13} /></button>}
                                </div>
                              ))}
                            </div>
                          )}
                          {t.comparison && (
                            <div className="cx-compare">
                              <table>
                                <thead><tr><th />{t.comparison.map((r, k) => (
                                  <th key={k}>
                                    <div className="cimg">{r.image ? <img src={r.image} alt="" referrerPolicy="no-referrer" loading="lazy" /> : r.name.slice(0, 1)}</div>
                                    <b>{r.name}</b><span>{r.store}</span>
                                  </th>))}</tr></thead>
                                <tbody>
                                  <tr><td>Price</td>{t.comparison.map((r, k) => <td key={k}>{cell(r.price)}</td>)}</tr>
                                  <tr><td>Availability</td>{t.comparison.map((r, k) => <td key={k}>{cell(r.availability)}</td>)}</tr>
                                  <tr><td>Key features</td>{t.comparison.map((r, k) => <td key={k}>{r.features.length ? r.features.map((f, j) => <div key={j}>{f}</div>) : <span className="miss">Not available</span>}</td>)}</tr>
                                  <tr><td>Shipping</td>{t.comparison.map((r, k) => <td key={k}>{cell(r.shipping)}</td>)}</tr>
                                  <tr><td>Returns</td>{t.comparison.map((r, k) => <td key={k}>{cell(r.returns)}</td>)}</tr>
                                  <tr><td>Warranty</td>{t.comparison.map((r, k) => <td key={k}>{cell(r.warranty)}</td>)}</tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                          {!pending && t.products.length > 1 && !t.comparison && <button className="cx-textbtn" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => ask("Compare these")}>Compare these</button>}
                          {t.approval && d && (
                            <div className="cx-approval">
                              <div className="hd"><b>Ready to purchase</b><span>{t.approval.storeName}</span></div>
                              <div className="items">
                                {t.approval.items.map((it, k) => (
                                  <div className="ln" key={k}><span>{it.name ?? it.productId}{it.quantity > 1 ? ` × ${it.quantity}` : ""}{it.variant && <small>{it.variant}</small>}</span><span>{money(it.price !== undefined ? it.price * it.quantity : undefined, t.approval!.currency)}</span></div>
                                ))}
                              </div>
                              <div className="sums">
                                <div className="ln"><span>Subtotal</span><span>{money(t.approval.subtotal, t.approval.currency)}</span></div>
                                <div className="ln"><span>Shipping{t.approval.shippingNote && <small>{t.approval.shippingNote}</small>}</span><span>{t.approval.shipping === 0 ? "Free" : money(t.approval.shipping, t.approval.currency)}</span></div>
                                <div className="ln"><span>Tax{t.approval.taxNote && <small>{t.approval.taxNote}</small>}</span><span>{t.approval.tax != null ? money(t.approval.tax, t.approval.currency) : "—"}</span></div>
                              </div>
                              <div className="total"><span>Total</span><span>{money(t.approval.total, t.approval.currency)}</span></div>
                              {d.state === "pending" || d.state === "confirming" ? (
                                <div className="ft">
                                  <button className="cx-btn accent" disabled={d.state === "confirming"} onClick={() => confirm(i)}>{d.state === "confirming" ? "Placing order…" : "Confirm purchase"}</button>
                                  <button className="cx-btn ghost" disabled={d.state === "confirming"} onClick={() => patchTurn(sel.id, i, (x) => ({ ...x, decision: { state: "cancelled" } }))}>Cancel</button>
                                  <small>Nothing is ordered until you confirm.</small>
                                </div>
                              ) : null}
                              {d.state === "cancelled" && <div className="ft"><small>Purchase cancelled. Nothing was ordered.</small></div>}
                              {d.state === "done" && d.order && (
                                <div className="cx-order" style={{ margin: 12, maxWidth: "none" }}>
                                  <b><Icon n="check" s={16} sw={2.4} />Order created · {d.order.id}</b>
                                  <p>{d.order.status === "pending_payment" ? "Awaiting payment" : d.order.status}. {d.order.note ?? "No payment has been taken."}</p>
                                </div>
                              )}
                              {d.state === "error" && <div className="cx-order err" style={{ margin: 12, maxWidth: "none" }}><b><Icon n="alert" s={16} />Couldn’t place the order</b><p>{d.error}</p></div>}
                            </div>
                          )}
                          {!pending && t.steps.length > 0 && (
                            <details className="cx-steps">
                              <summary>{t.steps.some((x) => x.denied) ? "Access check" : "How I found this"} · {t.steps.length} step{t.steps.length > 1 ? "s" : ""}</summary>
                              {t.steps.map((x, k) => (
                                <div key={k} className={x.denied ? "denied" : x.ok ? "ok" : "fail"}><i>{x.denied ? "✕" : x.ok ? "✓" : "–"}</i><span><b>{x.store}</b> {x.summary}</span></div>
                              ))}
                            </details>
                          )}
                          {!pending && used.length > 0 && t.steps.length === 0 && <div className="cx-used">Used: {used.join(" · ")}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="cx-compose">
                <div className="cx-prompts">{promptsFor(sel, trustedStores.length).map((p) => <button key={p} disabled={!!busy} onClick={() => ask(p)}>{p}</button>)}</div>
                <form className="cx-bar" onSubmit={(e) => { e.preventDefault(); ask(msg); }}>
                  <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Message your Agent about ${sel.name}…`} />
                  <button className="cx-send" type="submit" disabled={!!busy || !msg.trim()} aria-label="Send"><Icon n="send" s={16} /></button>
                </form>
              </div>
            </div>
          </section>
        )}
      </main>
      {drawer && sel && <Drawer v={sel} onClose={() => setDrawer(false)} onRediscover={rediscover} onScopes={setScopes} busy={!!busy} />}
    </div>
  );
}
