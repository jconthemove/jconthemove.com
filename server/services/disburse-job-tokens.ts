/**
 * disburseJobTokens — Idempotent JCMOVES token disbursement service
 *
 * Payout rules (fires exactly once per job, guarded by tokensDisbursedAt):
 *  A) CREW flat      — worker_job_completion_bonus setting (default 500 JCMOVES) per member
 *                      +25% bonus if the member is flagged in crewBonusFlags
 *  B) CREW hours     — 25 JCMOVES × confirmedHours per crew member (same +25% multiplier)
 *  C) CUSTOMER earn  — tokenAllocation (if set) OR earn_rate_per_dollar × totalPrice
 *  D) REFERRAL bonus — first completed job referral bonus to the referrer
 *
 * Idempotency (multi-level):
 *  1. Job-level fast-path: skip immediately if tokens_disbursed_at is already set.
 *  2. Concurrency guard: PostgreSQL advisory lock prevents two concurrent calls
 *     for the same lead from both proceeding simultaneously.
 *  3. Per-recipient guard: before each wallet credit + reward insert, check if a
 *     reward row already exists for (jobId, userId, rewardType). If it does, skip —
 *     meaning retries cannot double-credit any recipient.
 *  4. Job-level completion stamp: tokens_disbursed_at is written only after all
 *     per-recipient writes either succeed or are confirmed already-done.
 */
import { db, pool } from "../db";
import { rewards, rewardSettings, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import type { Lead } from "@shared/schema";

const TOKEN_PRICE    = 0.00000508432;
const HOURS_RATE     = 25;   // JCMOVES per confirmed hour per crew member
const FALLBACK_FLAT  = 500;  // JCMOVES flat per worker if setting not found
const FALLBACK_EARN  = 50;   // JCMOVES per $1 if setting not found
const REFERRAL_BONUS = 1000; // JCMOVES awarded to referrer on first confirmed job
const BONUS_MULTIPLIER = 1.25; // +25% for bonus-flagged movers

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

/** Checks if a reward already exists for this (leadId, userId, rewardType) triplet. */
async function rewardAlreadyExists(leadId: string, userId: string, rewardType: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM rewards
     WHERE user_id = $1 AND reward_type = $2
       AND (metadata->>'jobId' = $3 OR metadata->>'leadId' = $3 OR reference_id = $3)
     LIMIT 1`,
    [userId, rewardType, leadId]
  );
  return rows.length > 0;
}

/** Convert a leadId string to a stable 32-bit integer for use as advisory lock key. */
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

  // Fast-path idempotency: skip if job was fully stamped
  if (lead.tokensDisbursedAt || lead.completionRewardedAt) {
    console.log(`ℹ️ Job ${leadId} already disbursed — skipping`);
    return null;
  }

  // Concurrency guard: advisory lock prevents parallel calls from both proceeding
  const lockKey = leadIdToLockKey(leadId);
  const lockResult = await pool.query("SELECT pg_try_advisory_lock($1) AS acquired", [lockKey]);
  if (!lockResult.rows[0]?.acquired) {
    console.log(`ℹ️ Job ${leadId} disbursement already in-progress (advisory lock held) — skipping`);
    return null;
  }

  try {
    // Re-check after acquiring lock (concurrent call may have just finished)
    const freshLead = await storage.getLead(leadId) as typeof lead;
    if (freshLead?.tokensDisbursedAt || freshLead?.completionRewardedAt) {
      console.log(`ℹ️ Job ${leadId} disbursed by concurrent caller — skipping`);
      return null;
    }

    const crewIds: string[] = (lead.crewMembers && lead.crewMembers.length > 0)
      ? lead.crewMembers
      : (lead.assignedToUserId ? [lead.assignedToUserId] : []);

    const bonusFlags: Record<string, boolean> = (lead.crewBonusFlags as Record<string, boolean>) ?? {};

    const baseFlatReward = (await getSetting("worker_job_completion_bonus"))
      ?? (await getSetting("employee_job_completed"))
      ?? FALLBACK_FLAT;
    const earnRate     = (await getSetting("earn_rate_per_dollar")) ?? FALLBACK_EARN;
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

    // ── A. CREW: flat reward + hours bonus ───────────────────────────────────
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

        // Per-recipient idempotency: skip if flat reward already inserted for this member + job
        const flatAlreadyDone = await rewardAlreadyExists(leadId, memberId, "worker_job_completion_bonus");
        if (!flatAlreadyDone) {
          await storage.creditWalletTokens(memberId, flatReward);
          await db.insert(rewards).values({
            userId: memberId,
            rewardType: "worker_job_completion_bonus",
            tokenAmount: flatReward.toFixed(8),
            cashValue: (flatReward * TOKEN_PRICE).toFixed(6),
            status: "confirmed",
            referenceId: leadId,
            metadata: { jobId: leadId, type: "flat", flatReward, isBonusMover: isBonus, multiplier },
          });
          await awardPoints(memberId, "employee_job_done");
          console.log(`🏆 Crew ${member.email}: flat=${flatReward} JCMOVES${isBonus ? " (+25% bonus)" : ""}`);
        } else {
          console.log(`ℹ️ Crew ${member.email}: flat reward already exists — skipping`);
        }

        if (hoursBonus > 0) {
          const hoursAlreadyDone = await rewardAlreadyExists(leadId, memberId, "worker_hours_bonus");
          if (!hoursAlreadyDone) {
            await storage.creditWalletTokens(memberId, hoursBonus);
            await db.insert(rewards).values({
              userId: memberId,
              rewardType: "worker_hours_bonus",
              tokenAmount: hoursBonus.toFixed(8),
              cashValue: (hoursBonus * TOKEN_PRICE).toFixed(6),
              status: "confirmed",
              referenceId: leadId,
              metadata: { jobId: leadId, type: "hours", confirmedHours: confirmedHrs, ratePerHour: HOURS_RATE, isBonusMover: isBonus, multiplier },
            });
            console.log(`🕐 Crew ${member.email}: hours=${hoursBonus} JCMOVES${isBonus ? " (+25% bonus)" : ""}`);
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

    // ── B. CUSTOMER earn reward ──────────────────────────────────────────────
    try {
      const customerEmail = lead.email;
      if (customerEmail) {
        const customer = await storage.getUserByEmail(customerEmail);
        if (customer) {
          const jobPrice = parseFloat(lead.totalPrice || lead.basePrice || "0");
          const explicitAlloc = lead.tokenAllocation ? parseFloat(lead.tokenAllocation) : 0;
          const customerTokens = explicitAlloc > 0
            ? Math.round(explicitAlloc)
            : (jobPrice > 0 ? Math.round(jobPrice * earnRate) : 0);

          if (customerTokens > 0) {
            const customerAlreadyDone = await rewardAlreadyExists(leadId, customer.id, "loyalty_booking");
            if (!customerAlreadyDone) {
              const prevSpend = parseFloat(customer.totalCompletedSpend || "0");
              const newSpend  = prevSpend + jobPrice;
              const newTier   = getTierFromSpend(newSpend);

              await db
                .update(users)
                .set({ loyaltyTier: newTier, totalCompletedSpend: newSpend.toFixed(2) })
                .where(eq(users.id, customer.id));

              await storage.creditWalletTokens(customer.id, customerTokens);
              await db.insert(rewards).values({
                userId: customer.id,
                rewardType: "loyalty_booking",
                tokenAmount: customerTokens.toFixed(8),
                cashValue: (customerTokens * TOKEN_PRICE).toFixed(6),
                status: "confirmed",
                metadata: {
                  jobId: leadId,
                  jobPrice,
                  earnRate: explicitAlloc > 0 ? "override" : earnRate,
                  source: explicitAlloc > 0 ? "tokenAllocation" : "formula",
                },
              });

              await awardPoints(customer.id, "job_completed");
              const spentHundreds = Math.floor(jobPrice / 100);
              if (spentHundreds > 0) await awardPoints(customer.id, "per_100_spent", spentHundreds);

              summary.customerTokens = customerTokens;
              summary.customerId = customer.id;
              console.log(`🎁 Customer ${customer.email}: ${customerTokens} JCMOVES`);

              // ── C. REFERRAL BONUS (first completed job only) ─────────────
              if (customer.referredByUserId) {
                const prevJobs = await db
                  .select()
                  .from(rewards)
                  .where(and(eq(rewards.userId, customer.id), eq(rewards.rewardType, "loyalty_booking")));
                const referralAlreadyDone = await rewardAlreadyExists(leadId, customer.referredByUserId, "referral_confirmed");
                if (prevJobs.length === 1 && !referralAlreadyDone) {
                  await storage.creditWalletTokens(customer.referredByUserId, REFERRAL_BONUS);
                  await db.insert(rewards).values({
                    userId: customer.referredByUserId,
                    rewardType: "referral_confirmed",
                    tokenAmount: REFERRAL_BONUS.toFixed(8),
                    cashValue: (REFERRAL_BONUS * TOKEN_PRICE).toFixed(6),
                    status: "confirmed",
                    metadata: { referredUserId: customer.id, jobId: leadId },
                  });
                  console.log(`🎉 Referral ${REFERRAL_BONUS} JCMOVES → ${customer.referredByUserId}`);
                }
              }
            } else {
              console.log(`ℹ️ Customer ${customer.email}: earn reward already exists — skipping`);
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ Customer earn reward failed:", err);
      allSucceeded = false;
    }

    // Stamp completion timestamps ONLY when all writes either succeeded or were confirmed already-done.
    // Per-recipient idempotency above ensures retries are safe — no double-credit possible.
    if (allSucceeded) {
      await storage.updateLeadQuote(leadId, {
        completionRewardedAt: now,
        tokensDisbursedAt: now,
      });
      console.log(`✅ Job ${leadId} disbursement fully complete at ${now.toISOString()}`);
    } else {
      console.warn(`⚠️ Job ${leadId} had partial failures — tokens_disbursed_at NOT stamped; retries are still possible (per-recipient guards prevent double-credits)`);
    }

    return summary;
  } finally {
    // Always release the advisory lock
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
  }
}
