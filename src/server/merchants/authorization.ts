import type { ScopeCategory } from "@/server/capabilities/definitions";
import { recordAuditEvent } from "@/server/audit/log";
import { createAuthorization, getMerchantById, revokeAuthorization, setMerchantStatus } from "./repository";

export async function authorizeMerchant(merchantId: string, scopes: ScopeCategory[]) {
  const merchant = await getMerchantById(merchantId);
  if (!merchant) throw new Error("merchant not found");
  if (merchant.status === "pending_verification") {
    throw new Error("Merchant must complete domain control verification before authorization.");
  }
  const authorization = await createAuthorization({ merchantId, scopes });
  await setMerchantStatus(merchantId, "authorized");
  await recordAuditEvent({
    merchantId,
    actor: "merchant",
    eventType: "authorization_created",
    result: "success",
    details: { scopes },
  });
  return authorization;
}

export async function revokeMerchant(merchantId: string) {
  await revokeAuthorization(merchantId);
  await setMerchantStatus(merchantId, "revoked");
  await recordAuditEvent({
    merchantId,
    actor: "merchant",
    eventType: "authorization_revoked",
    result: "success",
    details: {},
  });
}
