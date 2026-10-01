# Architecture — Agentic Commerce Platform (Vertical Slice)

## 1. What this proves

> "How are you going to connect websites? Will you be able to connect all websites?"

Answer: **not through one magic protocol.** Different merchants are connected through
different integration mechanisms behind one common capability contract. The shopping
agent never knows or cares whether a given merchant is REST, MCP, or structured web data.

```
MERCHANT WEBSITE
      |
DOMAIN CONTROL VERIFICATION      (proves control of the domain, NOT legal ownership)
      |
MERCHANT AUTHORIZATION           (explicit, scoped consent — separate from domain control)
      |
MERCHANT CONNECTOR                (REST | MCP | Web/structured — pluggable)
      |
COMMON CAPABILITY CONTRACT        (typed, versioned, zod-validated)
      |
CAPABILITY ROUTER + POLICY ENGINE (every tool call passes through here)
      |
SHOPPING AGENT                    (one agent, model-provider abstraction)
```

## 2. High-level system

```
                         SHOPPER
                            |
                            v
                    SHOPPING AGENT            (src/server/agent)
                            |
                            v
                    AGENT RUNTIME             (tool-call loop, model-provider abstraction)
                            |
                            v
                    POLICY / CONTROL          (src/server/policy)
                            |
                            v
                   CAPABILITY ROUTER          (src/server/capabilities/router.ts)
                            |
             +--------------+---------------+-----------------+
             v               v               v                 v
        REST CONNECTOR  MCP CONNECTOR   WEB CONNECTOR      (adversarial: REST connector,
             |               |               |               reused, flagged content)
             v               v               v
      Northstar Running  Vertex Athletics  Urban Services   Rogue Gear Co
             |
             v
       REFERRAL LEDGER  --------------------------------->  MERCHANT INTELLIGENCE
             |
             v
        AUDIT LOG  (every capability call, policy decision, and block is recorded)
```

Cross-cutting concerns (authorization, tenant isolation, audit, validation, error handling)
are implemented as shared modules under `src/server/*`, not bolted onto individual routes.

## 3. Architectural boundaries (non-negotiable)

These distinctions are enforced in code, not just in naming:

- **Agent ≠ Policy** — the agent proposes a tool call; it cannot execute one.
- **Policy ≠ Connector** — the policy engine decides ALLOW / DENY / REQUIRE_APPROVAL; it
  never talks to a merchant.
- **Connector ≠ Merchant** — a connector is our adapter; the merchant is an external system
  we do not control.
- **Domain verification ≠ legal ownership** — the UI never claims "ownership verified."
- **Domain verification ≠ authorization** — verifying DNS/`.well-known` control only unlocks
  the authorization step; it grants zero capabilities by itself.
- **Authorization ≠ capability** — authorization grants *scopes* (e.g. `products`,
  `shipping`); capabilities are individually validated against those scopes at call time.
- **Data ≠ instructions** — merchant-supplied text (descriptions, etc.) is passed to the
  model as tool-result data, flagged if it contains adversarial-looking instructional
  content, and is never treated as authorization for anything.
- **Search result ≠ permission to purchase / Model decision ≠ authorization to execute** —
  high-risk capabilities (`place_order`, `submit_bid`, `buy_now`, `cancel_order`, `refund`)
  are always intercepted by the policy engine before reaching any connector.

## 4. Modules

| Module | Path | Responsibility |
|---|---|---|
| DB / migrations | `src/server/db` | Single `pg` pool, typed query helpers, RLS-aware session roles |
| Merchant registry | `src/server/merchants` | Merchant CRUD, domain verification, authorization, revocation |
| Capability contracts | `src/server/capabilities` | Zod-typed `CapabilityDefinition`s + the router that enforces policy before invoking a connector |
| Connectors | `src/server/connectors` | `MerchantConnector` interface + `RestMerchantConnector`, `McpMerchantConnector`, `WebMerchantConnector` |
| Policy engine | `src/server/policy` | Pure functions: `(capability, authorization, context) -> ALLOW\|DENY\|REQUIRE_APPROVAL` |
| Untrusted-content scanner | `src/server/security` | Heuristic scan of merchant-supplied text for prompt-injection patterns |
| Shopping agent | `src/server/agent` | Model-provider abstraction + tool-calling loop; tools are capability-router calls, nothing else |
| Offer normalization / matching | `src/server/offers` | Deterministic `Offer` shape + requirement matcher (not left to model judgement) |
| Referral ledger | `src/server/referral` | `offer_presented -> offer_selected -> redirect_issued -> landing_confirmed` |
| Merchant insight | `src/server/insight` | Aggregate accept/reject reasons, scoped per merchant via RLS |
| Audit log | `src/server/audit` | Structured event log, one row per meaningful action |
| Demo merchants | `src/demo-merchants` | The 4 controlled merchant backends (REST x2, MCP, Web/JSON-LD) |
| UI | `src/app` | Next.js App Router prototype console |

## 5. Why these technology choices (and not the others)

See `docs/POC_VS_PRODUCTION.md` for the full per-component POC vs. production breakdown.
Short version: Next.js + TypeScript + PostgreSQL + Zod + one Anthropic-backed agent behind
a provider interface + the official MCP SDK for the one MCP merchant. No Redis, no
HydraDB, no agent swarm, no mandatory WebMCP/A2A, no general-purpose browser automation.
Every one of those was evaluated against "does this solve a real requirement of this POC"
and left out because the requirement is already met by the stack above.

## 6. Data flow for a single search

1. Shopper submits a natural-language query to `POST /api/agent/chat`.
2. The agent (via the model provider) decides to call the `search_products` tool.
3. The capability router looks up the `search_products` capability definition, validates
   the input against its Zod schema, and asks the policy engine for a decision **per
   connected+authorized merchant**.
4. For every `ALLOW`, the router calls that merchant's connector concurrently
   (`Promise.allSettled`), each returning zero or more normalized `Offer`s.
5. Offers are merged, each is scanned for untrusted-content patterns, and each is run
   through the deterministic requirement matcher against the shopper's parsed
   requirements — this produces the ACCEPT/REJECT + reason per merchant, not the model.
6. The tool result (offers + match verdicts) goes back to the model, which writes the
   natural-language comparison shown to the shopper.
7. Every step above writes an `audit_events` row. Selecting an offer creates a
   `referrals` row and `referral_events` rows. A rejected/accepted verdict feeds
   `merchant_insights`.
