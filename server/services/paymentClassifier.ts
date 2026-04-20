// Task #175 — Payment classifier.
//
// Pure function: turns (total, serviceType, customer choice, admin overrides)
// into a payment plan + deposit recommendation. Used by the pipeline
// payment.step and by the admin payment panel so both surfaces agree.

export type PaymentPlanKind =
  | "deposit_required"   // Square invoice for deposit must be paid before dispatch
  | "wallet_pay_now"     // customer is paying from JCMOVES USD wallet at booking
  | "pay_on_completion"  // Square invoice goes out at completion
  | "cash_or_btc";       // walk-in cash / BTC hash collected on site

export interface PaymentClassifierInput {
  finalTotal: number;
  serviceCodes: string[];
  /** Customer chose "Pay from JCMOVES wallet" on the review step. */
  payFromWallet?: boolean;
  /** Admin already marked the job cash-only (e.g. drive-by yard cleanup). */
  adminCashOverride?: boolean;
}

export interface PaymentPlan {
  kind: PaymentPlanKind;
  /** USD deposit required before crew can be offered the job. 0 when none. */
  depositAmount: number;
  /** Why this plan was chosen — surfaced in admin tooltip + pipeline log. */
  reason: string;
}

// Services that always require a deposit because they have unrecoverable
// labor or dump costs if the customer ghosts.
const DEPOSIT_REQUIRED_SERVICES = new Set([
  "moving",
  "long_distance_moving",
  "junk_removal",
  "demolition",
]);

// Above this total, ANY service requires a deposit even if it's not on the
// always-deposit list — protects against $1k+ exposure on optional services.
const DEPOSIT_THRESHOLD_USD = 400;

// Deposit is the lesser of 25% of the total or $250 — covers our exposure
// without scaring off price-sensitive customers.
const DEPOSIT_PCT = 0.25;
const DEPOSIT_CAP_USD = 250;

export function classifyPayment(input: PaymentClassifierInput): PaymentPlan {
  const total = Math.max(0, Number.isFinite(input.finalTotal) ? input.finalTotal : 0);
  const codes = (input.serviceCodes || []).map((c) => String(c).toLowerCase());

  if (input.adminCashOverride) {
    return { kind: "cash_or_btc", depositAmount: 0, reason: "admin marked cash/BTC on site" };
  }

  if (input.payFromWallet) {
    return { kind: "wallet_pay_now", depositAmount: 0, reason: "customer chose JCMOVES wallet pay" };
  }

  const hasDepositService = codes.some((c) => DEPOSIT_REQUIRED_SERVICES.has(c));
  const overThreshold = total >= DEPOSIT_THRESHOLD_USD;

  if (hasDepositService || overThreshold) {
    const raw = Math.round(total * DEPOSIT_PCT);
    const depositAmount = Math.max(50, Math.min(DEPOSIT_CAP_USD, raw));
    const why = hasDepositService
      ? `service in {${codes.filter((c) => DEPOSIT_REQUIRED_SERVICES.has(c)).join(",")}}`
      : `total $${total.toFixed(2)} ≥ $${DEPOSIT_THRESHOLD_USD}`;
    return {
      kind: "deposit_required",
      depositAmount,
      reason: `deposit gate (${why})`,
    };
  }

  return {
    kind: "pay_on_completion",
    depositAmount: 0,
    reason: `total $${total.toFixed(2)} below deposit threshold`,
  };
}
