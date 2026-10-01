# Agentic Mall — merchant connection (`/connect`)

A merchant website becomes a **store in the mall** only after it proves ownership and authorizes the platform.
Shoppers' Agents then discover, read, compare and (with shopper approval) act on that store.

```
Website → Ownership → Authorization → Capabilities → Connected → Agent
```

## Discovery is not trust
| State | Meaning |
|---|---|
| PUBLIC_DATA_DISCOVERED | Ecommerce data is publicly readable. **Not** a merchant connection: read-only, unverified, no actions. |
| REQUIRES_VERIFICATION | A merchant capability list was found, but ownership is unproven. Nothing is usable. |
| REQUIRES_AUTHORIZATION | Ownership verified; the merchant has not yet chosen what Agents may do. |
| CONNECTED | Ownership verified **and** authorization granted **and** the capability is allowed (the only route to "trusted"). |
| UNSUPPORTED / FAILED | Nothing usable / could not reach or read the site. |

Ownership: a platform token (stable per origin) published as a `<meta>` tag, a `/.well-known/agentic-commerce-verification.txt` file, or a DNS TXT record. Never credentials.

## Capability model: DISCOVER · READ · COMPARE · ACT
| Class | Capabilities | Gate |
|---|---|---|
| READ | catalog, product, inventory, policy, shipping | public tier or trusted tier |
| ACT (low) | `cart.add`, `cart.read` | trusted tier + `commerce:act` scope |
| ACT (medium) | `checkout.start` (nothing is charged) | trusted tier + `commerce:act` |
| ACT (high) | `order.place` | trusted tier + `commerce:act` + **signed shopper approval** bound to the exact checkout, amount, connection and expiry |
| COMPARE | search across every trusted store in the shopper's mall | trusted stores only |

The language model has **no tool** that can place an order. Only the shopper pressing *Confirm purchase* causes the platform to sign an approval and call the merchant's `place_order` endpoint; the merchant verifies the signature itself. Unsupported state-changing actions a site advertises (e.g. refunds) are rejected.

## Agent
Server-side Mistral tool-calling loop (`src/server/connect/agent.ts`). Tools are derived from what the connection allows and execute through the gateway (`service.ts › invoke`): trust tier, scope, policy, audit, origin lock, size/time caps, SSRF protection. Tool output is scanned for injection, truncated, and handed to the model as untrusted data. The API key lives in `.env.local` only.

## Merchant side
A merchant publishes a manifest (`/api/capabilities`, `/.well-known/agentic-capabilities.json`, or a `<link rel="alternate" type="application/agentic-capabilities+json">`). Read capabilities use GET; actions (`add_to_cart`, `begin_checkout`, `place_order`) use POST with `risk: "action"` and scope `commerce:act`. Responses are parsed tolerantly (many shapes accepted).

## Not built (future)
Payment processing, auctions/bidding, services, WebMCP/browser connectors, merchant-side validation of the platform access token (the demo merchants check its presence and verify approval signatures), persistent storage, revocation UI.

## Agent tools and enforcement
Tools offered to the model: `search_products` (all authorized stores), `get_product`, `get_product_variants`, `get_inventory`, `get_shipping_policy`, `get_return_policy`, `get_store_policy`, `compare_products`, `show_products`, plus (trusted connections) `add_to_cart`, `view_cart`, `prepare_checkout`, `get_order_status`.
Every tool is offered regardless of what the merchant enabled; **the backend decides on each call** (`service.ts › invoke`). A call for a capability the merchant did not authorize is rejected before any request reaches the website, the model is told `authorized:false`, and the denial is audited and shown to the shopper ("Access check"). If every lookup in a turn was refused, a server-side guard prevents the reply from claiming the store "doesn't sell" something. Access can be changed at any time in Connection details; it takes effect on the next call.
