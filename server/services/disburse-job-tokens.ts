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
 * Idempotency (multi-level, no double-credit possible under any failure scenario):
 *
 *  Level 1 — Job fast-path: skip if tokens_disbursed_at already set on lead.
 *
 *  Level 2 — Concurrency guard: PostgreSQL advisory lock (pg_try_advisory_lock)
 *            prevents two concurrent calls from both proceeding.
 *
 *  Level 3 — DB-level unique constraint: `uq_reward_per_user_per_ref` on
 *            (user_id, reward_type, reference_id WHERE reference_id IS NOT NULL).
 *            Each payout uses `INSERT ... ON CONFLICT DO NOTHING RETURNING id`.
 *            Wallet credit runs ONLY IF the insert returned a row (new insert).
 *            If the reward row already existed the wallet is untouched.
 *            This makes the reward insert + wallet credit effectively atomic:
 *            a partial failure between them cannot cause double-credit on retry.
 *
 *  Level 4 — Completion stamp: tokens_disbursed_at written after all payouts
 *            either succeed or are confirmed already-done (fast exit on retry).
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

/**
 * Inserts a reward row using DB-level idempotency (ON CONFLICT DO NOTHING).
 * Returns true if a new row was inserted, false if it already existed.
 * The caller should ONLY credit the wallet when this returns true.
 *
 * Relies on the `uq_reward_per_user_per_ref` unique index on
 * (user_id, reward_type, reference_id) WHERE reference_id IS NOT NULL.
 */
async function insertRewardIfNew(
  userId: string,
  rewardType: string,
  referenceId: string,
  tokenAmount: number,
  cashValue: number,
  metadata: Record<string, unknown>
): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO rewards (id, user_id, reward_type, token_amount, cash_value, status, reference_id, metadata)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'confirmed', $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      userId,
      rewardType,
      tokenAmount.toFixed(8),
      cashValue.toFixed(6),
      referenceId,
      JSON.stringify(metadata),
    ]
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

  // Level 1 — fast-path idempotency: job already fully stamped
  if (lead.tokensDisbursedAt || lead.completionRewardedAt) {
    console.log(`ℹ️ Job ${leadId} already disbursed — skipping`);
    return null;
  }

  // Level 2 — concurrency guard: advisory lock prevents parallel invocations
  const lockKey = leadIdToLockKey(leadId);
  const lockResult = await pool.query("SELECT pg_try_advisory_lock($1) AS acquired", [lockKey]);
  if (!lockResult.rows[0]?.acquired) {
    console.log(`ℹ️ Job ${leadId} disbursement already in-progress (advisory lock held) — skipping`);
    return null;
  }

  try {
    // Re-check after acquiring lock (concurrent call may have just stamped)
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
    // For each crew member:
    //   1. insertRewardIfNew() attempts INSERT ... ON CONFLICT DO NOTHING RETURNING id
    //   2. If a new row was inserted (true) → credit wallet
    //   3. If row already existed (false) → skip credit (idempotent, no double-credit)
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

        // Flat reward — Level 3 idempotency via DB unique constraint
        const flatInserted = await insertRewardIfNew(
          memberId,
          "worker_job_completion_bonus",
          `${leadId}::flat`,
          flatReward,
          flatReward * TOKEN_PRICE,
          { jobId: leadId, type: "flat", flatReward, isBonusMover: isBonus, multiplier }
        );
        if (flatInserted) {
          await storage.creditWalletTokens(memberId, flatReward);
          await awardPoints(memberId, "employee_job_done");
          console.log(`🏆 Crew ${member.email}: flat=${flatReward} JCMOVES${isBonus ? " (+25%)" : ""}`);
        } else {
          console.log(`ℹ️ Crew ${member.email}: flat reward already exists — skipping`);
        }

        if (hoursBonus > 0) {
          const hoursInserted = await insertRewardIfNew(
            memberId,
            "worker_hours_bonus",
            `${leadId}::hours`,
            hoursBonus,
            hoursBonus * TOKEN_PRICE,
            { jobId: leadId, type: "hours", confirmedHours: confirmedHrs, ratePerHour: HOURS_RATE, isBonusMover: isBonus, multiplier }
          );
          if (hoursInserted) {
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
            const customerInserted = await insertRewardIfNew(
              customer.id,
              "loyalty_booking",
              `${leadId}::earn`,
              customerTokens,
              customerTokens * TOKEN_PRICE,
              {
                jobId: leadId,
                jobPrice,
                earnRate: explicitAlloc > 0 ? "override" : earnRate,
                source: explicitAlloc > 0 ? "tokenAllocation" : "formula",
              }
            );

            if (customerInserted) {
              const prevSpend = parseFloat(customer.totalCompletedSpend || "0");
              const newSpend  = prevSpend + jobPrice;
              const newTier   = getTierFromSpend(newSpend);

              await db
                .update(users)
                .set({ loyaltyTier: newTier, totalCompletedSpend: newSpend.toFixed(2) })
                .where(eq(users.id, customer.id));

              await storage.creditWalletTokens(customer.id, customerTokens);
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
                // Only award referral bonus if this is the customer's first earn reward
                if (prevJobs.length === 1) {
                  const referralInserted = await insertRewardIfNew(
                    customer.referredByUserId,
                    "referral_confirmed",
                    `${leadId}::referral`,
                    REFERRAL_BONUS,
                    REFERRAL_BONUS * TOKEN_PRICE,
                    { referredUserId: customer.id, jobId: leadId }
                  );
                  if (referralInserted) {
                    await storage.creditWalletTokens(customer.referredByUserId, REFERRAL_BONUS);
                    console.log(`🎉 Referral ${REFERRAL_BONUS} JCMOVES → ${customer.referredByUserId}`);
                  }
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

    // Stamp completion timestamps only after all payouts succeed or are confirmed already-done.
    // DB-level unique constraint guarantees no double-credit under any retry scenario.
    if (allSucceeded) {
      await storage.updateLeadQuote(leadId, {
        completionRewardedAt: now,
        tokensDisbursedAt: now,
      });
      console.log(`✅ Job ${leadId} disbursement fully complete at ${now.toISOString()}`);
    } else {
      console.warn(`⚠️ Job ${leadId} had partial failures — tokens_disbursed_at NOT stamped; retries are safe (unique constraint prevents double-credit)`);
    }

    return summary;
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
  }
}
