/**
 * The only payment abstraction auction/checkout code is allowed to depend
 * on. Nothing outside this file knows what "Demo" means — swapping in a
 * real Payroc-backed provider later is a matter of implementing this same
 * interface and changing which one gets constructed, not touching auction
 * logic. No raw card data ever passes through here: `token` is always a
 * sandbox/tokenized reference (see profile/repository.ts's payment_methods,
 * which already enforces that at the DB layer).
 */
export type PaymentResultStatus = "AUTHORIZED" | "DECLINED" | "SUCCEEDED" | "FAILED";

export interface PaymentChargeInput {
  /** Idempotency key — the same key must always resolve to the same result, never charge twice. */
  idempotencyKey: string;
  amount: number;
  currency: string;
  paymentMethodToken?: string | null;
}

export interface PaymentResult {
  status: PaymentResultStatus;
  providerReference: string;
  reason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  charge(input: PaymentChargeInput): Promise<PaymentResult>;
}

/**
 * Deterministic sandbox provider for this demo phase. Succeeds for any
 * positive amount with a token; declines a handful of named sentinel
 * tokens so tests (and a future demo UI) can exercise the failure path
 * without depending on real randomness or a real processor.
 */
const DECLINE_SENTINEL_TOKENS = new Set(["demo-decline", "sandbox-declined-card"]);

export class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo";

  async charge(input: PaymentChargeInput): Promise<PaymentResult> {
    if (input.amount <= 0) {
      return { status: "FAILED", providerReference: `demo_${input.idempotencyKey}`, reason: "Amount must be positive." };
    }
    if (input.paymentMethodToken && DECLINE_SENTINEL_TOKENS.has(input.paymentMethodToken)) {
      return { status: "DECLINED", providerReference: `demo_${input.idempotencyKey}`, reason: "Demo provider sentinel decline." };
    }
    return { status: "SUCCEEDED", providerReference: `demo_${input.idempotencyKey}` };
  }
}

let provider: PaymentProvider | undefined;

/** Swap this for a PayrocPaymentProvider (same interface) once that integration exists — nothing else changes. */
export function getPaymentProvider(): PaymentProvider {
  provider ??= new DemoPaymentProvider();
  return provider;
}
