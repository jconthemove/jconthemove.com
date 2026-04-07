/**
 * disburseJobTokens — Idempotent JCMOVES token disbursement service
 *
 * Payout rules (fires exactly once per job):
 *  A) CREW flat      — worker_job_completion_bonus setting (default 500 JCMOVES) per member
 *                      +25% bonus if the member is flagged in crewBonusFlags
 *  B) CREW hours     — 25 JCMOVES × confirmedHours per crew member (same +25% multiplier)
 *  C) CUSTOMER earn  — tokenAllocation (if set) OR earn_rate_per_dollar × totalPrice
 *  D) REFERRAL bonus — first completed job referral bonus to the referrer
 *
 * Idempotency (multi-level):
 *
 *  Level 1 — Job fast-path: skip immediately if tokens_disbursed_at is already set.
 *
 *  Level 2 — Concurrency guard: PostgreSQL advisory lock (pg_try_advisory_lock)
 *            ensures only ONE caller can proceed for a given lead at a time.
 *            All other concurrent calls receive null immediately.
 *
 *  Level 3 — Per-recipient guard: before each wallet credit, SELECT the rewards
 *            table to check if a row already exists for (leadId, userId, rewardType).
 *            The advisory lock ensures no concurrent call can insert between our
 *            SELECT and INSERT, so double-credit is impossible.
 *            Order: SELECT → INSERT reward row → credit wallet.
 *            If wallet credit fails after INSERT, the reward row acts as a sentinel:
 *            the next retry finds the row and skips both operations.
 *
 *  Level 4 — Completion stamp: tokens_disbursed_at is written only after all
 *            per-recipient operations either succeed or are confirmed already-done.
 */
import { db, pool } from "../db";
import { rewards, rewardSettings, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import type { Lead } from "@shared/schema";

const TOKEN_PRICE         = 0.00000508432;
const HOURS_RATE          = 25;    // JCMOVES per confirmed hour per crew member
const FALLBACK_FLAT       = 500;   // JCMOVES flat per worker if setting not found
const FALLBACK_EARN       = 15;    // JCMOVES per $1 if setting not found
const FALLBACK_COMPLETION = 1500;  // JCMOVES flat bonus for customer on job completion
const FALLBACK_REFERRAL   = 1000;  // JCMOVES awarded to referrer on first confirmed job
const BONUS_MULTIPLIER    = 1.25;  // +25% for bonus-flagged movers

export type DisbursementSummary = {
  customerTokens: number;
  perCrewFlatTokens: number;
  perCrewHoursTokens: number;
  crewIds: string[];
  customerId?: string;
  disbursedAt: Date;
};

async function getSetting(key: string): Promise<number | null> {
  const rows = await db
    .select()
    .from(rewardSettings)
    .where(eq(rewardSettings.settingKey, key))
    .limit(1);
  if (rows.length > 0 && rows[0].isActive) return parseFloat(rows[0].tokenAmount);
  return null;
}

function getTierFromSpend(totalSpend: number): string {
  if (totalSpend >= 5000) return "diamond";
  if (totalSpend >= 2000) return "platinum";
  if (totalSpend >= 1000) return "gold";
  if (totalSpend >= 500)  return "silver";
  return "bronze";
}

async function awardPoints(userId: string, action: string, count = 1): Promise<void> {
  const TIER_POINTS: Record<string, number> = {
    signup: 100, daily_login: 5, first_spin: 50, spin_play: 10, lottery_entry: 15,
    profile_complete: 75, review_submitted: 100, referral_signup: 200,
    referral_confirmed: 500, job_completed: 300, employee_job_done: 200,
    employee_lead_created: 50, per_100_spent: 25, staking: 20, checkin: 10,
  };
  const pts = (TIER_POINTS[action] ?? 0) * count;
  if (pts <= 0) return;
  try {
    const { sql: sqlFn } = await import("drizzle-orm");
    await db
      .update(users)
      .set({ tierPoints: sqlFn`COALESCE(tier_points, 0) + ${pts}` })
      .where(eq(users.id, userId));
  } catch (_) {}
}

/**
 * Checks if a reward row already exists for (leadId, userId, rewardType).
 * Used as a per-recipient idempotency guard under the advisory lock.
 * Safe from TOCTOU races because the advisory lock prevents concurrent callers.
 */
async function rewardAlreadyExists(
  leadId: string,
  userId: string,
  rewardType: string
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM rewards
     WHERE user_id = $1
       AND reward_type = $2
       AND reference_id = $3
     LIMIT 1`,
    [userId, rewardType, leadId]
  );
  return rows.length > 0;
}

/** Convert a leadId string to a stable 32-bit integer for PostgreSQL advisory lock. */
function leadIdToLockKey(leadId: string): number {
  let h = 0;
  for (let i = 0; i < leadId.length; i++) {
    h = (Math.imul(31, h) + leadId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function disburseJobTokens(leadId: string): Promise<DisbursementSummary | null> {
  const lead = await storage.getLead(leadId) as (Lead & {
    tokensDisbursedAt?: Date | string | null;
    confirmedHours?: number | null;
    crewBonusFlags?: Record<string, boolean> | null;
    email?: string;
  });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Level 1 — fast-path: skip if already fully disbursed
  if (lead.tokensDisbursedAt || lead.completionRewardedAt) {
    console.log(`ℹ️ Job ${leadId} already disbursed — skipping`);
    return null;
  }

  // Level 2 — concurrency guard: advisory lock (only one caller proceeds at a time)
  const lockKey = leadIdToLockKey(leadId);
  const lockResult = await pool.query("SELECT pg_try_advisory_lock($1) AS acquired", [lockKey]);
  if (!lockResult.rows[0]?.acquired) {
    console.log(`ℹ️ Job ${leadId} disbursement in-progress elsewhere — skipping`);
    return null;
  }

  try {
    // Re-check after acquiring lock (a concurrent caller may have just stamped)
    const freshLead = await storage.getLead(leadId) as typeof lead;
    if (freshLead?.tokensDisbursedAt || freshLead?.completionRewardedAt) {
      console.log(`ℹ️ Job ${leadId} disbursed by concurrent caller — skipping`);
      return null;
    }

    const crewIds: string[] = (lead.crewMembers && lead.crewMembers.length > 0)
      ? lead.crewMembers
      : (lead.assignedToUserId ? [lead.assignedToUserId] : []);

    const bonusFlags: Record<string, boolean> = (lead.crewBonusFlags as Record<string, boolean>) ?? {};

    const baseFlatReward    = (await getSetting("worker_job_completion_bonus"))
      ?? (await getSetting("employee_job_completed"))
      ?? FALLBACK_FLAT;
    const earnRate          = (await getSetting("earn_rate_per_dollar")) ?? FALLBACK_EARN;
    const completionBonus   = (await getSetting("customer_quote_completed")) ?? FALLBACK_COMPLETION;
    const referralBonus     = (await getSetting("referral_job_bonus"))    ?? FALLBACK_REFERRAL;
    const confirmedHrs = lead.confirmedHours ? Number(lead.confirmedHours) : 0;
    const baseHoursBonus = HOURS_RATE * confirmedHrs;
    const now = new Date();

    const summary: DisbursementSummary = {
      customerTokens: 0,
      perCrewFlatTokens: baseFlatReward,
      perCrewHoursTokens: baseHoursBonus,
      crewIds,
      disbursedAt: now,
    };

    let allSucceeded = true;

    // ── A. CREW: flat reward + hours bonus ────────────────────────────────────
    // For each member:
    //   1. SELECT to check if reward row already exists (idempotency check)
    //   2. If not: INSERT reward row, THEN credit wallet
    //   3. The advisory lock guarantees no concurrent caller interleaves here
    for (const memberId of crewIds) {
      try {
        const member = await storage.getUser(memberId).catch(() => null);
        if (!member) {
          console.log(`⚠️ Crew member ${memberId} not found — skipping`);
          continue;
        }

        const isBonus = bonusFlags[memberId] === true;
        const multiplier = isBonus ? BONUS_MULTIPLIER : 1;
        const flatReward = Math.round(baseFlatReward * multiplier);
        const hoursBonus = Math.round(baseHoursBonus * multiplier);

        // Flat reward
        const flatExists = await rewardAlreadyExists(leadId, memberId, "worker_job_completion_bonus");
        if (!flatExists) {
          await db.insert(rewards).values({
            userId: memberId,
            rewardType: "worker_job_completion_bonus",
            tokenAmount: flatReward.toFixed(8),
            cashValue: (flatReward * TOKEN_PRICE).toFixed(6),
            status: "confirmed",
            referenceId: leadId,
            metadata: { jobId: leadId, type: "flat", flatReward, isBonusMover: isBonus, multiplier },
          });
          await storage.creditWalletTokens(memberId, flatReward);
          await awardPoints(memberId, "employee_job_done");
          console.log(`🏆 Crew ${member.email}: flat=${flatReward} JCMOVES${isBonus ? " (+25%)" : ""}`);
        } else {
          console.log(`ℹ️ Crew ${member.email}: flat reward already exists — skipping`);
        }

        // Hours bonus
        if (hoursBonus > 0) {
          const hoursExists = await rewardAlreadyExists(leadId, memberId, "worker_hours_bonus");
          if (!hoursExists) {
            await db.insert(rewards).values({
              userId: memberId,
              rewardType: "worker_hours_bonus",
              tokenAmount: hoursBonus.toFixed(8),
              cashValue: (hoursBonus * TOKEN_PRICE).toFixed(6),
              status: "confirmed",
              referenceId: leadId,
              metadata: { jobId: leadId, type: "hours", confirmedHours: confirmedHrs, ratePerHour: HOURS_RATE, isBonusMover: isBonus, multiplier },
            });
            await storage.creditWalletTokens(memberId, hoursBonus);
            console.log(`🕐 Crew ${member.email}: hours=${hoursBonus} JCMOVES${isBonus ? " (+25%)" : ""}`);
          } else {
            console.log(`ℹ️ Crew ${member.email}: hours reward already exists — skipping`);
          }
        }

        try {
          const { notificationService } = await import("./notification");
          await notificationService.notifyRewardAvailable(memberId, "job completion", flatReward + hoursBonus);
        } catch (_) {}
      } catch (err) {
        console.error(`❌ Crew reward failed for ${memberId}:`, err);
        allSucceeded = false;
      }
    }

    // ── B. CUSTOMER rewards (flat completion bonus + per-dollar earn) ─────────
    try {
      const customerEmail = lead.email;
      if (customerEmail) {
        // Case-insensitive email lookup to avoid mismatch issues
        const emailLookup = await pool.query(
          `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [customerEmail.trim()]
        );
        const customer = emailLookup.rows[0] || null;

        if (customer) {
          const jobPrice   = parseFloat(lead.totalPrice || lead.basePrice || "0");
          const explicitAlloc = lead.tokenAllocation ? parseFloat(lead.tokenAllocation) : 0;

          // ── B1. Flat completion bonus (always awarded, configurable) ──────
          const completionExists = await rewardAlreadyExists(leadId, customer.id, "customer_quote_completed");
          if (!completionExists) {
            await db.insert(rewards).values({
              userId: customer.id,
              rewardType: "customer_quote_completed",
              tokenAmount: completionBonus.toFixed(8),
              cashValue: (completionBonus * TOKEN_PRICE).toFixed(6),
              status: "confirmed",
              referenceId: leadId,
              metadata: { jobId: leadId, type: "flat_completion" },
            });
            await storage.creditWalletTokens(customer.id, completionBonus);
            await awardPoints(customer.id, "job_completed");
            summary.customerTokens += completionBonus;
            summary.customerId = customer.id;
            console.log(`🎁 Customer ${customer.email}: flat completion bonus +${completionBonus} JCMOVES`);
          } else {
            console.log(`ℹ️ Customer ${customer.email}: flat completion bonus already exists — skipping`);
          }

          // ── B2. Per-dollar earn (tokenAllocation override OR rate × price) ─
          const earnTokens = explicitAlloc > 0
            ? Math.round(explicitAlloc)
            : (jobPrice > 0 ? Math.round(jobPrice * earnRate) : 0);

          if (earnTokens > 0) {
            const earnExists = await rewardAlreadyExists(leadId, customer.id, "loyalty_booking");
            if (!earnExists) {
              const prevSpend = parseFloat(customer.total_completed_spend || "0");
              const newSpend  = prevSpend + jobPrice;
              const newTier   = getTierFromSpend(newSpend);

              await db
                .update(users)
                .set({ loyaltyTier: newTier, totalCompletedSpend: newSpend.toFixed(2) })
                .where(eq(users.id, customer.id));

              await db.insert(rewards).values({
                userId: customer.id,
                rewardType: "loyalty_booking",
                tokenAmount: earnTokens.toFixed(8),
                cashValue: (earnTokens * TOKEN_PRICE).toFixed(6),
                status: "confirmed",
                referenceId: leadId,
                metadata: {
                  jobId: leadId,
                  jobPrice,
                  earnRate: explicitAlloc > 0 ? "override" : earnRate,
                  source: explicitAlloc > 0 ? "tokenAllocation" : "formula",
                },
              });
              await storage.creditWalletTokens(customer.id, earnTokens);
              const spentHundreds = Math.floor(jobPrice / 100);
              if (spentHundreds > 0) await awardPoints(customer.id, "per_100_spent", spentHundreds);

              summary.customerTokens += earnTokens;
              summary.customerId = customer.id;
              console.log(`🎁 Customer ${customer.email}: per-dollar earn +${earnTokens} JCMOVES (job $${jobPrice})`);
            } else {
              console.log(`ℹ️ Customer ${customer.email}: earn reward already exists — skipping`);
            }
          } else {
            console.log(`ℹ️ Customer ${customer.email}: no price on file — flat bonus only`);
          }

          // ── C. REFERRAL BONUS (first completed job only) ──────────────────
          if (customer.referred_by_user_id) {
            const prevJobs = await pool.query(
              `SELECT 1 FROM rewards WHERE user_id = $1 AND reward_type = 'loyalty_booking' LIMIT 2`,
              [customer.id]
            );
            if (prevJobs.rows.length <= 1) {
              const referralExists = await rewardAlreadyExists(
                leadId, customer.referred_by_user_id, "referral_confirmed"
              );
              if (!referralExists) {
                await db.insert(rewards).values({
                  userId: customer.referred_by_user_id,
                  rewardType: "referral_confirmed",
                  tokenAmount: referralBonus.toFixed(8),
                  cashValue: (referralBonus * TOKEN_PRICE).toFixed(6),
                  status: "confirmed",
                  referenceId: leadId,
                  metadata: { referredUserId: customer.id, jobId: leadId },
                });
                await storage.creditWalletTokens(customer.referred_by_user_id, referralBonus);
                console.log(`🎉 Referral ${referralBonus} JCMOVES → ${customer.referred_by_user_id}`);
              }
            }
          }
        } else {
          console.log(`⚠️ disburseJobTokens: no user account found for email "${customerEmail}" — flat completion bonus skipped`);
        }
      } else {
        console.log(`⚠️ disburseJobTokens: lead ${leadId} has no email — customer rewards skipped`);
      }
    } catch (err) {
      console.error("❌ Customer earn reward failed:", err);
      allSucceeded = false;
    }

    // Stamp completion timestamps only after all payouts succeed or are confirmed already-done
    if (allSucceeded) {
      await storage.updateLeadQuote(leadId, {
        completionRewardedAt: now,
        tokensDisbursedAt: now,
      });
      console.log(`✅ Job ${leadId} disbursement complete at ${now.toISOString()}`);
    } else {
      console.warn(`⚠️ Job ${leadId} had partial failures — not stamped; retry is safe`);
    }

    return summary;
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
  }
}
