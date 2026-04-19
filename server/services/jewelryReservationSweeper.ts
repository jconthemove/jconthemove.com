import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { jewelryItems, walletAccounts, rewards } from "@shared/schema";

export interface ReleaseResult {
  refundedUsd: number;
  userId: string;
}

/**
 * Release a pending jewelry reservation: flips the item back to active,
 * refunds the held JCMOVES USD credit to the customer's wallet, marks
 * the original `wallet_balance_redemption` reward as cancelled, and
 * records a `wallet_balance_redemption_refund` audit row.
 *
 * Idempotent: returns null if the item is no longer in `pending_balance`
 * (e.g. another sweeper tick or a manual cancel already released it).
 *
 * Lifted out of server/routes.ts (Task #147) so the periodic sweeper
 * (Task #151) and the manual cancel endpoint share a single source of
 * truth.
 */
export async function releasePendingJewelryReservation(
  itemId: string,
  reason: string,
): Promise<ReleaseResult | null> {
  return await db.transaction(async (tx) => {
    // Atomic single-winner release: the conditional UPDATE … RETURNING
    // pattern guarantees that if two callers race (sweeper tick +
    // manual cancel, or two overlapping sweeps), only the one whose
    // UPDATE actually transitions the row out of `pending_balance`
    // gets a returned row — the loser sees an empty array and exits
    // without double-refunding the wallet or duplicating audit rows.
    const released = await tx.update(jewelryItems)
      .set({
        status: "active",
        inStock: true,
        pendingCreditUserId: null,
        pendingCreditCents: null,
        pendingExpiresAt: null,
        pendingSquareOrderId: null,
      })
      .where(and(
        eq(jewelryItems.id, itemId),
        eq(jewelryItems.status, "pending_balance"),
      ))
      .returning({
        pendingCreditUserId: jewelryItems.pendingCreditUserId,
        pendingCreditCents: jewelryItems.pendingCreditCents,
      });
    if (released.length === 0) return null;
    const item = released[0];
    if (!item.pendingCreditUserId) return null;
    const refundCents = parseFloat(item.pendingCreditCents || "0");
    const refundUserId = item.pendingCreditUserId;

    if (refundCents > 0) {
      await tx.update(walletAccounts)
        .set({
          cashBalance: sql`(${walletAccounts.cashBalance})::numeric + ${refundCents.toFixed(2)}::numeric`,
          lastActivity: new Date(),
        })
        .where(eq(walletAccounts.userId, refundUserId));

      await tx.update(rewards)
        .set({ status: "cancelled" })
        .where(and(
          eq(rewards.userId, refundUserId),
          eq(rewards.rewardType, "wallet_balance_redemption"),
          eq(rewards.referenceId, itemId),
          eq(rewards.status, "pending"),
        ));
      await tx.insert(rewards).values({
        userId: refundUserId,
        rewardType: "wallet_balance_redemption_refund",
        tokenAmount: "0",
        cashValue: refundCents.toFixed(6),
        status: "confirmed",
        referenceId: itemId,
        metadata: {
          referenceType: "jewelry",
          referenceId: itemId,
          refundUsd: refundCents.toFixed(2),
          reason,
        },
      });
    }

    return { refundedUsd: refundCents, userId: refundUserId };
  });
}

export interface SweepResult {
  scanned: number;
  released: number;
  refundedUsdTotal: number;
  failures: Array<{ itemId: string; error: string }>;
}

// Module-level run lock so a slow sweep cannot overlap with the next
// scheduled tick (compounds race risk against the cancel endpoint and
// payment-complete). The atomic UPDATE-RETURNING in
// releasePendingJewelryReservation already prevents double-refunds
// even if this guard is bypassed; this just keeps logs/metrics sane.
let sweepRunning = false;

/**
 * Find every jewelry item whose pending_balance reservation has expired
 * and release each one. Designed to be called periodically by the
 * scheduler in server/index.ts; safe to call concurrently with the
 * customer-initiated cancel endpoint because release is idempotent.
 *
 * Returns `null` if a previous sweep is still running.
 */
export async function runJewelryReservationSweep(): Promise<SweepResult | null> {
  if (sweepRunning) return null;
  sweepRunning = true;
  try {
    return await sweepInternal();
  } finally {
    sweepRunning = false;
  }
}

async function sweepInternal(): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, released: 0, refundedUsdTotal: 0, failures: [] };
  const now = new Date();

  const expired = await db.select({ id: jewelryItems.id })
    .from(jewelryItems)
    .where(and(
      eq(jewelryItems.status, "pending_balance"),
      lt(jewelryItems.pendingExpiresAt, now),
    ));

  result.scanned = expired.length;
  for (const row of expired) {
    try {
      const released = await releasePendingJewelryReservation(row.id, "expired_sweep");
      if (released) {
        result.released += 1;
        result.refundedUsdTotal += released.refundedUsd;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.failures.push({ itemId: row.id, error: msg });
    }
  }

  return result;
}
