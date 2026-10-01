import type { CapabilityDefinition, ScopeCategory } from "@/server/capabilities/definitions";
import type { ContentFlag } from "@/server/offers/types";

export type PolicyDecisionKind = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyDecision {
  decision: PolicyDecisionKind;
  reason: string;
}

export type MerchantStatus = "pending_verification" | "domain_verified" | "authorized" | "revoked";

export interface PolicyContext {
  capability: CapabilityDefinition;
  merchantStatus: MerchantStatus;
  authorizationScopes: ScopeCategory[] | null; // null = no active authorization
  contentFlags?: ContentFlag[];
}

/** Pure, deterministic policy decision. No I/O — fully unit-testable. */
export function evaluatePolicy(ctx: PolicyContext): PolicyDecision {
  const { capability, merchantStatus, authorizationScopes } = ctx;

  if (merchantStatus === "revoked") {
    return { decision: "DENY", reason: "Merchant authorization has been revoked." };
  }
  if (merchantStatus !== "authorized" || authorizationScopes === null) {
    return { decision: "DENY", reason: "Merchant has not completed authorization." };
  }
  if (!authorizationScopes.includes(capability.requiredScope)) {
    return {
      decision: "DENY",
      reason: `Merchant authorization does not grant the '${capability.requiredScope}' scope required by '${capability.name}'.`,
    };
  }

  if (capability.riskLevel === "HIGH_RISK") {
    return {
      decision: "REQUIRE_APPROVAL",
      reason: "High-risk capabilities are never auto-executed in this POC; explicit human approval is required and is not wired up.",
    };
  }

  if (ctx.contentFlags && ctx.contentFlags.length > 0 && capability.riskLevel !== "READ") {
    return {
      decision: "DENY",
      reason: "Untrusted merchant content is present in this context; merchant content cannot authorize a write action.",
    };
  }

  return { decision: "ALLOW", reason: "Merchant is authorized for the required scope." };
}
