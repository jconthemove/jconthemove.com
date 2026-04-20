// Task #175 — Single source of truth for the per-job payment status pill.
//
// Crew job cards, customer "My Jobs", and the admin payment panel all read
// from this so a job can never look "paid" in one place and "awaiting" in
// another.

import { pool } from "../db";

export type PaymentStatusKey =
  | "deposit_paid"      // green: deposit collected, ready to dispatch
  | "fully_paid"        // green: invoice paid in full
  | "wallet_paid"       // green: paid from JCMOVES wallet
  | "awaiting_deposit"  // yellow: deposit invoice sent, not yet paid
  | "pay_on_completion" // blue: invoice goes out at completion
  | "cash_on_site"      // gray: walk-in cash / BTC at job
  | "unknown";          // gray: no payment info yet

export interface PaymentStatus {
  key: PaymentStatusKey;
  label: string;
  /** Tailwind color tokens — keeps the pill component dumb. */
  color: "green" | "yellow" | "blue" | "gray";
}

const TABLE: Record<PaymentStatusKey, Omit<PaymentStatus, "key">> = {
  deposit_paid:      { label: "Deposit paid",       color: "green"  },
  fully_paid:        { label: "Paid in full",       color: "green"  },
  wallet_paid:       { label: "Paid (JCMOVES)",     color: "green"  },
  awaiting_deposit:  { label: "Awaiting deposit",   color: "yellow" },
  pay_on_completion: { label: "Pay on completion",  color: "blue"   },
  cash_on_site:      { label: "Cash on site",       color: "gray"   },
  unknown:           { label: "—",                  color: "gray"   },
};

export function makeStatus(key: PaymentStatusKey): PaymentStatus {
  return { key, ...TABLE[key] };
}

/** Loads the latest known payment status for a leads-row job. Wraps the
 *  raw DB shape so callers don't sprinkle column names everywhere. The
 *  payment_plan / payment_paid_at columns are added at boot via the
 *  self-healing migration in server/index.ts so a fresh deploy never
 *  500's on this query. */
export async function deriveLeadPaymentStatus(leadId: string): Promise<PaymentStatus> {
  try {
    const { rows } = await pool.query<{
      deposit_required: boolean | null;
      deposit_paid: boolean | null;
      payment_plan: string | null;
      payment_paid_at: Date | null;
      status: string | null;
    }>(
      `SELECT
          deposit_required,
          deposit_paid,
          payment_plan,
          payment_paid_at,
          status
         FROM leads
        WHERE id = $1
        LIMIT 1`,
      [leadId],
    );
    if (rows.length === 0) return makeStatus("unknown");
    const r = rows[0];

    if (r.payment_paid_at != null) {
      return r.payment_plan === "wallet_pay_now"
        ? makeStatus("wallet_paid")
        : makeStatus("fully_paid");
    }
    if (r.payment_plan === "wallet_pay_now") return makeStatus("wallet_paid");
    if (r.payment_plan === "cash_or_btc") return makeStatus("cash_on_site");
    if (r.deposit_required) {
      return r.deposit_paid ? makeStatus("deposit_paid") : makeStatus("awaiting_deposit");
    }
    if (r.payment_plan === "pay_on_completion") return makeStatus("pay_on_completion");
    return makeStatus("unknown");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[paymentStatus] derive failed:", e instanceof Error ? e.message : e);
    return makeStatus("unknown");
  }
}
