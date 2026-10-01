import { resolveTxt } from "node:dns/promises";
import { recordAuditEvent } from "@/server/audit/log";
import {
  createDomainVerification,
  getLatestPendingVerification,
  getMerchantById,
  markVerificationResult,
  setMerchantStatus,
} from "./repository";

/**
 * Domain CONTROL verification only — this proves the caller can publish
 * content the domain serves. It is explicitly NOT a legal-ownership check;
 * the UI and audit trail must never claim otherwise.
 */
export async function startDomainVerification(merchantId: string, method: "dns_txt" | "well_known_file") {
  const verification = await createDomainVerification({ merchantId, method });
  await recordAuditEvent({
    merchantId,
    actor: "system",
    eventType: "domain_verification_started",
    result: "success",
    details: { method },
  });
  return verification;
}

async function checkWellKnown(domainSlug: string, expectedToken: string): Promise<boolean> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/.well-known/agentic-commerce/${domainSlug}`, { cache: "no-store" });
  if (!res.ok) return false;
  const text = (await res.text()).trim();
  return text === expectedToken;
}

async function checkDnsTxt(domain: string, expectedToken: string): Promise<boolean> {
  try {
    const records = await resolveTxt(`_agentic-commerce-challenge.${domain}`);
    return records.some((chunks) => chunks.join("").trim() === expectedToken);
  } catch {
    return false;
  }
}

export async function checkDomainVerification(merchantId: string): Promise<{ verified: boolean; reason: string }> {
  const merchant = await getMerchantById(merchantId);
  if (!merchant) throw new Error("merchant not found");
  const verification = await getLatestPendingVerification(merchantId);
  if (!verification || verification.status !== "pending") {
    return { verified: false, reason: "No pending verification challenge for this merchant." };
  }

  const verified =
    verification.method === "well_known_file"
      ? await checkWellKnown(merchant.slug, verification.token)
      : await checkDnsTxt(merchant.domain, verification.token);

  await markVerificationResult(verification.id, verified);
  if (verified) {
    await setMerchantStatus(merchantId, "domain_verified");
  }
  await recordAuditEvent({
    merchantId,
    actor: "system",
    eventType: "domain_verification_checked",
    result: verified ? "success" : "error",
    details: { method: verification.method },
  });

  return {
    verified,
    reason: verified
      ? "Domain control verified. This confirms control of the domain, not legal or business ownership."
      : "Challenge token was not found at the expected location.",
  };
}
