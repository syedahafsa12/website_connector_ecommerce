import { createHmac, randomUUID } from "node:crypto";
import { query, queryOne, withPlatformScope } from "@/server/db/pool";
import { recordAuditEvent } from "@/server/audit/log";

const SIGNING_SECRET = process.env.REFERRAL_SIGNING_SECRET ?? "poc-dev-secret-do-not-use-in-production";

function signReferral(referralId: string): string {
  const sig = createHmac("sha256", SIGNING_SECRET).update(referralId).digest("base64url");
  return `${referralId}.${sig}`;
}

export function verifyReferralToken(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = createHmac("sha256", SIGNING_SECRET).update(id).digest("base64url");
  return sig === expected ? id : null;
}

interface ReferralRow {
  id: string;
  session_id: string;
  merchant_id: string;
  offer_id: string;
  status: string;
  referral_token: string;
}

async function addEvent(referralId: string, eventType: string, details: Record<string, unknown> = {}) {
  await query(`insert into referral_events (referral_id, event_type, details) values ($1,$2,$3)`, [
    referralId,
    eventType,
    JSON.stringify(details),
  ]);
}

/** Runs the full offer_presented -> offer_selected -> redirect_issued chain for a shopper's pick. */
export async function selectOffer(input: { sessionId: string; merchantId: string; offerId: string }) {
  return withPlatformScope(async (client) => {
    const id = randomUUID();
    const referralToken = signReferral(id);
    const insertRes = await client.query<ReferralRow>(
      `insert into referrals (id, session_id, merchant_id, offer_id, status, referral_token)
       values ($1,$2,$3,$4,'offer_presented',$5) returning *`,
      [id, input.sessionId, input.merchantId, input.offerId, referralToken],
    );
    const referral = insertRes.rows[0];
    if (!referral) throw new Error("failed to create referral");

    await addEvent(id, "offer_presented");
    await client.query(`update referrals set status='offer_selected', updated_at=now() where id=$1`, [id]);
    await addEvent(id, "offer_selected");
    await client.query(`update referrals set status='redirect_issued', updated_at=now() where id=$1`, [id]);
    await addEvent(id, "redirect_issued", { referralToken });

    await recordAuditEvent({
      merchantId: input.merchantId,
      sessionId: input.sessionId,
      actor: "shopper",
      eventType: "referral_created",
      result: "success",
      details: { referralId: id, offerId: input.offerId },
    });

    return { ...referral, status: "redirect_issued", referral_token: referralToken };
  });
}

export async function confirmLanding(referralId: string) {
  await query(`update referrals set status='landing_confirmed', updated_at=now() where id=$1`, [referralId]);
  await addEvent(referralId, "landing_confirmed");
  const referral = await queryOne<ReferralRow>(`select * from referrals where id=$1`, [referralId]);
  await recordAuditEvent({
    merchantId: referral?.merchant_id,
    sessionId: referral?.session_id,
    actor: "system",
    eventType: "referral_confirmed",
    result: "success",
    details: { referralId },
  });
  return referral;
}

export async function getReferralsForMerchant(merchantId: string) {
  return withPlatformScope(async (client) => {
    const res = await client.query(`select * from referrals where merchant_id=$1 order by created_at desc`, [merchantId]);
    return res.rows;
  });
}
