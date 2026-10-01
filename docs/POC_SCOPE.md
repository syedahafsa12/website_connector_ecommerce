# POC Scope

## What we are building

A vertical slice that proves the core architectural claim: heterogeneous merchant
integrations (REST, MCP, structured web data) can sit behind one capability contract that
a single shopping agent uses without knowing which mechanism a given merchant uses — with
real domain verification, real scoped authorization, a real policy boundary that blocks
high-risk actions (including under prompt injection), real referral attribution, and real
tenant-isolated merchant insight, backed by PostgreSQL with automated tests on every
security boundary.

## What we are deliberately not building

- Real payment processing, checkout, or order execution of any kind.
- Real auction/bidding settlement.
- A production identity provider (OAuth/OIDC) — merchant authorization uses our own
  controlled, scoped mechanism, structured so it can be replaced later.
- Production billing.
- A polished, finished-looking SaaS UI. The console is explicitly labeled a technical
  prototype.
- Large-scale infrastructure: no Kubernetes, no queues, no caches, no vector DB.
- A general-purpose web scraper or browser-automation connector. The web connector reads
  targeted `JSON-LD`/Schema.org blocks from pages we control.
- Multiple autonomous sub-agents or an agent swarm. One shopping agent.
- WebMCP, A2A, and other experimental protocols as anything other than optional,
  isolated, not-wired-in-by-default extension points.
- Redis, HydraDB, or any cache/store beyond PostgreSQL — nothing in this POC needs them.

## Architecture

See `docs/ARCHITECTURE.md`.

## Connector model

Three real, functioning integration mechanisms, one common `MerchantConnector` interface:

| Merchant | Category | Mechanism |
|---|---|---|
| Northstar Running | Running shoes / apparel | REST API |
| Vertex Athletics | Running shoes / apparel | MCP (official SDK) |
| Urban Services | Shoe-repair / coaching service | Structured web data (JSON-LD) |
| Rogue Gear Co | Running shoes (adversarial demo) | REST API, reused connector, deliberately malicious product copy |

## Capability model

Typed, versioned, Zod-validated capabilities with an explicit risk tier
(`READ` / `WRITE` / `HIGH_RISK`). See `docs/CAPABILITIES.md`.

## Security model

See `docs/SECURITY.md`. Summary: domain control is proven independently of legal
ownership claims; authorization is scoped and revocable; every capability call passes
through the policy engine before it can reach a connector; high-risk capabilities are
never auto-executed; merchant-supplied text is treated as data, flagged if it looks like
an injection attempt, and cannot authorize anything; tenant isolation between merchants is
enforced with PostgreSQL Row Level Security, not just application-level filtering.

## POC vs. production boundary

See `docs/POC_VS_PRODUCTION.md` for the per-component breakdown (what's simulated here,
what a production build would replace it with).
