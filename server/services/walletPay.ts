// Task #175 — Atomic JCMOVES wallet + token settlement for a booking.
//
// Used by POST /api/bookings when the customer chose "Pay from wallet"
// or "Apply tokens" on the /book review step. Executes the wallet
// debit, the token deduction, the booking status flip, and the lead
// payment_paid_at stamp in one Postgres transaction so a partial
// failure cannot strand a charge or persist a "discounted" booking
// without the discount.

import { pool } from "../db";
import {
  validateRedemption,
  tokensToDollars,
} from "../../shared/tokenRedemptionRules";

export interface SettleBookingPaymentInput {
  userId: string;
  /** Booking row id (and matching lead id when present). */
  bookingId: string;
  /** Lead id when the booking has a paired lead/job. */
  leadId?: string | null;
  /** Total USD owed AFTER any token discount has been applied. */
  amountUsd: number;
  /** When true, debit `amountUsd` from the user's wallet cash balance. */
  payFromWallet: boolean;
  /** Tokens the customer chose to redeem (already validated client-side
   *  but re-validated here against the customer's actual balance + tier). */
  applyTokens?: number;
  /** Customer JCMOVES tier — used to compute the redemption cap. */
  customerTier?: string | null;
  /** Subtotal BEFORE token discount — used to enforce the tier cap. */
  preDiscountSubtotal?: number;
}

export interface SettleBookingPaymentResult {
  ok: boolean;
  walletCharged: number;
  tokensRedeemed: number;
  tokenDiscountUsd: number;
  newCashBalance: number;
  newTokenBalance: number;
  reason?: string;
}

/**
 * Atomically settle a booking. All side effects (wallet debit, token
 * deduction, booking status flip, ledger writes, lead paid stamp) happen
 * in one transaction. On any failure NOTHING is committed.
 */
export async function settleBookingPayment(
  input: SettleBookingPaymentInput,
): Promise<SettleBookingPaymentResult> {
  const empty: SettleBookingPaymentResult = {
    ok: true,
    walletCharged: 0,
    tokensRedeemed: 0,
    tokenDiscountUsd: 0,
    newCashBalance: 0,
    newTokenBalance: 0,
  };
  const wantsWallet = input.payFromWallet === true;
  const wantsTokens = !!input.applyTokens && input.applyTokens > 0;
  if (!wantsWallet && !wantsTokens) return empty;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the wallet row so concurrent debits can't oversell.
    const { rows: walletRows } = await client.query<{
      id: string;
      cash_balance: string;
      token_balance: string;
    }>(
      `SELECT id, cash_balance, token_balance
         FROM wallet_accounts
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    if (walletRows.length === 0) {
      await client.query("ROLLBACK");
      return { ...empty, ok: false, reason: "no wallet account" };
    }
    const wallet = walletRows[0];
    let cash = Number(wallet.cash_balance ?? 0);
    let tokens = Number(wallet.token_balance ?? 0);

    // ── Token redemption ──────────────────────────────────────────────
    let tokensRedeemed = 0;
    let tokenDiscountUsd = 0;
    if (wantsTokens) {
      const subtotalForCap = input.preDiscountSubtotal ?? input.amountUsd;
      const validation = validateRedemption(
        input.applyTokens!,
        subtotalForCap,
        input.customerTier ?? null,
      );
      if (!validation.valid) {
        await client.query("ROLLBACK");
        return { ...empty, ok: false, reason: validation.message ?? "token redemption invalid" };
      }
      tokensRedeemed = validation.effectiveTokens;
      tokenDiscountUsd = +tokensToDollars(tokensRedeemed).toFixed(2);
      if (tokens < tokensRedeemed) {
        await client.query("ROLLBACK");
        return {
          ...empty,
          ok: false,
          reason: `insufficient token balance (${tokens} < ${tokensRedeemed})`,
        };
      }
      tokens -= tokensRedeemed;
    }

    // ── Cash debit ────────────────────────────────────────────────────
    let charged = 0;
    if (wantsWallet) {
      const owed = +Math.max(0, input.amountUsd).toFixed(2);
      if (owed > 0) {
        if (cash < owed) {
          await client.query("ROLLBACK");
          return {
            ...empty,
            ok: false,
            reason: `insufficient balance ($${cash.toFixed(2)} < $${owed.toFixed(2)})`,
          };
        }
        cash = +(cash - owed).toFixed(2);
        charged = owed;
      }
    }

    // ── Persist new wallet balances ────────────────────────────────────
    await client.query(
      `UPDATE wallet_accounts
          SET cash_balance = $2,
              token_balance = $3,
              last_activity = NOW()
        WHERE id = $1`,
      [wallet.id, cash.toFixed(2), tokens.toFixed(2)],
    );

    // ── Ledger rows (best-effort if wallet_ledger table is missing) ───
    if (charged > 0) {
      try {
        await client.query(
          `INSERT INTO wallet_ledger
             (user_id, kind, amount_usd, balance_after, ref_type, ref_id, note)
           VALUES ($1, 'booking_pay', $2, $3, 'lead', $4, $5)`,
          [
            input.userId,
            (-charged).toFixed(2),
            cash.toFixed(2),
            input.leadId ?? input.bookingId,
            `booking pay ${input.bookingId}`,
          ],
        );
      } catch {
        console.log(
          `[walletPay] ledger insert skipped (table missing) — user=${input.userId} amount=${charged.toFixed(2)} ref=${input.bookingId}`,
        );
      }
    }
    if (tokensRedeemed > 0) {
      try {
        await client.query(
          `INSERT INTO wallet_ledger
             (user_id, kind, amount_usd, balance_after, ref_type, ref_id, note)
           VALUES ($1, 'token_redemption', $2, $3, 'lead', $4, $5)`,
          [
            input.userId,
            (-tokenDiscountUsd).toFixed(2),
            cash.toFixed(2),
            input.leadId ?? input.bookingId,
            `redeemed ${tokensRedeemed} JCMOVES on booking ${input.bookingId}`,
          ],
        );
      } catch {
        console.log(
          `[walletPay] token-redemption ledger insert skipped — user=${input.userId} tokens=${tokensRedeemed} ref=${input.bookingId}`,
        );
      }
    }

    // ── Booking status / lead paid stamp ──────────────────────────────
    if (charged > 0) {
      await client.query(
        `UPDATE bookings SET status = 'confirmed' WHERE id = $1`,
        [input.bookingId],
      );
      if (input.leadId) {
        await client.query(
          `UPDATE leads
              SET deposit_paid = true,
                  payment_paid_at = NOW()
            WHERE id = $1`,
          [input.leadId],
        );
      }
    }

    await client.query("COMMIT");
    return {
      ok: true,
      walletCharged: charged,
      tokensRedeemed,
      tokenDiscountUsd,
      newCashBalance: cash,
      newTokenBalance: tokens,
    };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    console.error("[walletPay] error:", e instanceof Error ? e.message : e);
    return { ...empty, ok: false, reason: e instanceof Error ? e.message : "settle failed" };
  } finally {
    client.release();
  }
}

// Back-compat: a thin alias kept for any caller still using the original
// charge-only entry point. New callers should use settleBookingPayment.
export async function chargeWalletForBooking(input: {
  userId: string;
  jobRef: string;
  amountUsd: number;
}): Promise<{ ok: boolean; charged: number; newCashBalance: number; reason?: string }> {
  const r = await settleBookingPayment({
    userId: input.userId,
    bookingId: input.jobRef,
    amountUsd: input.amountUsd,
    payFromWallet: true,
  });
  return {
    ok: r.ok,
    charged: r.walletCharged,
    newCashBalance: r.newCashBalance,
    reason: r.reason,
  };
}
