import { recordAuditEvent } from "@/server/audit/log";
import { buildConnector } from "@/server/connectors/factory";
import type { SearchProductsInput } from "@/server/connectors/types";
import { getActiveAuthorization, getMerchantById, listMerchants } from "@/server/merchants/repository";
import type { MerchantRow } from "@/server/merchants/types";
import type { Offer } from "@/server/offers/types";
import { evaluatePolicy, type PolicyDecisionKind } from "@/server/policy/engine";
import { CAPABILITIES, type CapabilityName } from "./definitions";

export interface CapabilityCallContext {
  sessionId: string;
  taskId?: string;
  actor: "agent" | "shopper" | "system";
}

export interface CapabilityCallResult<T = unknown> {
  ok: boolean;
  decision: PolicyDecisionKind | "ERROR";
  reason: string;
  result?: T;
}

async function decideForMerchant(capabilityName: CapabilityName, merchantId: string) {
  const capability = CAPABILITIES[capabilityName];
  const merchant = await getMerchantById(merchantId);
  if (!merchant) {
    return { decision: "DENY" as PolicyDecisionKind, reason: "Merchant not found.", merchant: undefined };
  }
  const auth = await getActiveAuthorization(merchantId);
  const decision = evaluatePolicy({
    capability,
    merchantStatus: merchant.status,
    authorizationScopes: auth ? auth.scopes : null,
  });
  return { ...decision, merchant };
}

async function invoke(connector: ReturnType<typeof buildConnector>, capabilityName: CapabilityName, input: Record<string, unknown>) {
  switch (capabilityName) {
    case "search_products":
      return connector.searchProducts(input as unknown as SearchProductsInput);
    case "get_product":
      return connector.getProduct(input.productId as string);
    case "get_inventory":
      return connector.getInventory(input.productId as string);
    case "get_shipping":
      return connector.getShipping(input.productId as string);
    case "get_returns":
      return connector.getReturns(input.productId as string);
    case "get_warranty":
      return connector.getWarranty(input.productId as string);
    default:
      throw new Error(`Capability '${capabilityName}' has no connector implementation in this POC.`);
  }
}

/** Every capability call — from the agent or from the UI — goes through this one function. */
export async function callCapability(
  capabilityName: CapabilityName,
  merchantId: string,
  rawInput: Record<string, unknown>,
  ctx: CapabilityCallContext,
): Promise<CapabilityCallResult> {
  const capability = CAPABILITIES[capabilityName];
  const parsed = capability.inputSchema.safeParse({ merchantId, ...rawInput });
  if (!parsed.success) {
    return { ok: false, decision: "ERROR", reason: `Invalid input: ${parsed.error.message}` };
  }

  const { decision, reason, merchant } = await decideForMerchant(capabilityName, merchantId);

  await recordAuditEvent({
    merchantId,
    sessionId: ctx.sessionId,
    taskId: ctx.taskId,
    actor: ctx.actor,
    eventType: "policy_decision",
    capability: capabilityName,
    policyDecision: decision,
    result: decision === "ALLOW" ? "success" : "blocked",
    details: { reason, riskLevel: capability.riskLevel },
  });

  if (decision !== "ALLOW") {
    await recordAuditEvent({
      merchantId,
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      actor: ctx.actor,
      eventType: "policy_block",
      capability: capabilityName,
      policyDecision: decision,
      result: "blocked",
      details: { reason },
    });
    return { ok: false, decision, reason };
  }
  if (!merchant) {
    return { ok: false, decision: "DENY", reason: "Merchant not found." };
  }

  await recordAuditEvent({
    merchantId,
    sessionId: ctx.sessionId,
    taskId: ctx.taskId,
    actor: ctx.actor,
    eventType: "connector_call",
    capability: capabilityName,
    result: "success",
    details: { connectorKind: merchant.connector_type, stage: "start" },
  });

  try {
    const connector = buildConnector(merchant);
    const result = await invoke(connector, capabilityName, rawInput);
    return { ok: true, decision: "ALLOW", reason: "Capability call succeeded.", result };
  } catch (err) {
    await recordAuditEvent({
      merchantId,
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      actor: ctx.actor,
      eventType: "connector_call",
      capability: capabilityName,
      result: "error",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, decision: "ERROR", reason: `Connector call failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface MerchantSearchResult {
  merchant: MerchantRow;
  offers: Offer[];
  blocked?: string;
  error?: string;
}

/** Fans out search_products concurrently to every merchant; the agent only ever calls this one function. */
export async function searchAcrossMerchants(
  input: SearchProductsInput,
  ctx: CapabilityCallContext,
): Promise<MerchantSearchResult[]> {
  const merchants = (await listMerchants()).filter((m) => m.status === "authorized");
  await recordAuditEvent({
    sessionId: ctx.sessionId,
    taskId: ctx.taskId,
    actor: ctx.actor,
    eventType: "agent_request",
    capability: "search_products",
    result: "success",
    details: { query: input.query, filters: input.filters, merchantCount: merchants.length },
  });

  const settled = await Promise.allSettled(
    merchants.map(async (merchant): Promise<MerchantSearchResult> => {
      const call = await callCapability("search_products", merchant.id, input as unknown as Record<string, unknown>, ctx);
      if (!call.ok) return { merchant, offers: [], blocked: call.reason };
      return { merchant, offers: (call.result as Offer[]) ?? [] };
    }),
  );

  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const merchant = merchants[i];
    return { merchant: merchant as MerchantRow, offers: [], error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  });
}
