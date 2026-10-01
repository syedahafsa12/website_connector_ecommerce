import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Server-only secret. Never sent to a browser or to a model. */
export function secret(): string {
  if (process.env.CONNECT_SECRET) return process.env.CONNECT_SECRET;
  // Serverless instances have no shared disk: without a fixed secret every instance would invent its own and nothing could be verified.
  if (process.env.VERCEL) throw new Error("CONNECT_SECRET is not set on the server. Add it to the project environment variables (any long random string) and redeploy.");
  const file = path.join(process.cwd(), ".connect-secret");
  try { return fs.readFileSync(file, "utf8").trim(); } catch { /* first run */ }
  const s = randomBytes(32).toString("hex");
  try { fs.writeFileSync(file, s, { mode: 0o600 }); } catch { /* read-only fs: secret lasts for this process */ }
  return s;
}
const mac = (data: string) => createHmac("sha256", secret()).update(data).digest("hex");

/** Stable per-origin ownership token: a merchant publishes it once and can re-verify any time. */
export const tokenFor = (origin: string) => "acv_" + mac(`ownership|${origin}`).slice(0, 24);

export type Approval = { token: string; approvedAt: string; expiresAt: string; amount: number; currency?: string };

const payload = (connectionId: string, checkoutId: string, amount: number, currency: string | undefined, expiresAt: string) =>
  `approval|${connectionId}|${checkoutId}|${amount.toFixed(2)}|${currency ?? ""}|${expiresAt}`;

/** Issued only when the shopper presses "Confirm purchase". Binds the exact checkout, amount and an expiry. */
export function signApproval(connectionId: string, checkoutId: string, amount: number, currency?: string, ttlMs = 5 * 60_000): Approval {
  const now = Date.now();
  const expiresAt = new Date(now + ttlMs).toISOString();
  return { token: mac(payload(connectionId, checkoutId, amount, currency, expiresAt)), approvedAt: new Date(now).toISOString(), expiresAt, amount, currency };
}

/** Used by the platform gateway and by merchant endpoints that share the key. */
export function verifyApproval(connectionId: string, checkoutId: string, a: Approval | undefined, expect?: { amount?: number; currency?: string }): boolean {
  if (!a || typeof a.token !== "string" || typeof a.amount !== "number" || !a.expiresAt) return false;
  if (Date.parse(a.expiresAt) < Date.now()) return false;
  if (expect?.amount !== undefined && Math.abs(expect.amount - a.amount) > 0.001) return false;
  const want = Buffer.from(mac(payload(connectionId, checkoutId, a.amount, a.currency, a.expiresAt)));
  const got = Buffer.from(a.token);
  return want.length === got.length && timingSafeEqual(want, got);
}
