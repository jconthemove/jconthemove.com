/**
 * disburseJobTokens — Idempotent JCMOVES token disbursement service
 *
 * Payout rules (fires exactly once per job, guarded by tokensDisbursedAt):
 *  A) CUSTOMER earn — tokenAllocation (if set) OR earn_rate_per_dollar × totalPrice
 *  B) CREW flat      — worker_job_completion_bonus setting (default 500 JCMOVES) per member
 *  C) CREW hours     — 25 JCMOVES × confirmedHours per crew member
 *  D) REFERRAL bonus — first completed job referral bonus to the referrer
 */
import { db } from "../db";
import { rewards, rewardSettings, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";

const TOKEN_PRICE       = 0.00000508432;
const HOURS_RATE        = 25;   // JCMOVES per confirmed hour per crew member
const FALLBACK_FLAT     = 500;  // JCMOVES flat per worker if setting not found
const FALLBACK_EARN     = 50;   // JCMOVES per $1 if setting not found
const REFERRAL_BONUS    = 1000; // JCMOVES awarded to referrer on first confirmed job

export type DisbursementSummary = {
  customerTokens: number;
  perCrewFlatTokens: number;
  perCrewHoursTokens: number;
  crewIds: string[];
  customerId?: string;
  disbursedAt: Date;
};

async function getSetting(key: string): Promise<number | null> {
  const rows = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, key)).limit(1);
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
    await db.update(users)
      .set({ tierPoints: sqlFn`COALESCE(tier_points, 0) + ${pts}` } as any)
      .where(eq(users.id, userId));
  } catch (_) {}
}

export async function disburseJobTokens(leadId: string): Promise<DisbursementSummary | null> {
  const lead = await storage.getLead(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const alreadyDisbursed = (lead as any).tokensDisbursedAt || (lead as any).completionRewardedAt;
  if (alreadyDisbursed) {
    console.log(`ℹ️ Job ${leadId} already disbursed at ${alreadyDisbursed} — skipping`);
    return null;
  }

  const crewIds: string[] = ((lead as any).crewMembers?.length > 0)
    ? (lead as any).crewMembers
    : ((lead as any).assignedToUserId ? [(lead as any).assignedToUserId] : []);

  const flatReward     = (await getSetting("worker_job_completion_bonus")) ?? (await getSetting("employee_job_completed")) ?? FALLBACK_FLAT;
  const earnRate       = (await getSetting("earn_rate_per_dollar")) ?? FALLBACK_EARN;
  const confirmedHours = (lead as any).confirmedHours ? parseInt(String((lead as any).confirmedHours)) : 0;
  const hoursBonus     = HOURS_RATE * confirmedHours;
  const now            = new Date();

  const summary: DisbursementSummary = {
    customerTokens: 0,
    perCrewFlatTokens: flatReward,
    perCrewHoursTokens: hoursBonus,
    crewIds,
    disbursedAt: now,
  };

  // ── A. CREW: flat reward + hours bonus ───────────────────────────────────
  for (const memberId of crewIds) {
    try {
      const member = await storage.getUser(memberId).catch(() => null);
      if (!member) { console.log(`⚠️ Crew member ${memberId} not found — skipping`); continue; }

      await storage.creditWalletTokens(memberId, flatReward);
      await db.insert(rewards).values({
        userId: memberId,
        rewardType: "worker_job_completion_bonus",
        tokenAmount: flatReward.toFixed(8),
        cashValue: (flatReward * TOKEN_PRICE).toFixed(6),
        status: "confirmed",
        referenceId: leadId,
        metadata: { jobId: leadId, type: "flat", flatReward },
      });
      await awardPoints(memberId, "employee_job_done");

      if (hoursBonus > 0) {
        await storage.creditWalletTokens(memberId, hoursBonus);
        await db.insert(rewards).values({
          userId: memberId,
          rewardType: "worker_hours_bonus",
          tokenAmount: hoursBonus.toFixed(8),
          cashValue: (hoursBonus * TOKEN_PRICE).toFixed(6),
          status: "confirmed",
          referenceId: leadId,
          metadata: { jobId: leadId, type: "hours", confirmedHours, ratePerHour: HOURS_RATE },
        });
      }

      console.log(`🏆 Crew ${(member as any).email}: flat=${flatReward} + hours=${hoursBonus} JCMOVES`);

      try {
        const { notificationService } = await import("./notification");
        await notificationService.notifyRewardAvailable(memberId, "job completion", flatReward + hoursBonus);
      } catch (_) {}
    } catch (err) {
      console.error(`❌ Crew reward failed for ${memberId}:`, err);
    }
  }

  // ── B. CUSTOMER earn reward ──────────────────────────────────────────────
  try {
    const customerEmail = (lead as any).email || (lead as any).customerEmail;
    if (customerEmail) {
      const customer = await storage.getUserByEmail(customerEmail);
      if (customer) {
        const jobPrice = parseFloat((lead as any).totalPrice || (lead as any).basePrice || "0");

        // tokenAllocation overrides formula if set
        const explicitAlloc = (lead as any).tokenAllocation ? parseFloat((lead as any).tokenAllocation) : 0;
        const customerTokens = explicitAlloc > 0
          ? Math.round(explicitAlloc)
          : (jobPrice > 0 ? Math.round(jobPrice * earnRate) : 0);

        if (customerTokens > 0) {
          const prevSpend = parseFloat((customer as any).totalCompletedSpend || "0");
          const newSpend  = prevSpend + jobPrice;
          const newTier   = getTierFromSpend(newSpend);
          await db.update(users)
            .set({ loyaltyTier: newTier, totalCompletedSpend: newSpend.toFixed(2) } as any)
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
          console.log(`🎁 Customer ${(customer as any).email}: ${customerTokens} JCMOVES`);

          // ── C. REFERRAL BONUS (first completed job only) ─────────────────
          if ((customer as any).referredByUserId) {
            const prevJobs = await db.select().from(rewards)
              .where(and(eq(rewards.userId, customer.id), eq(rewards.rewardType, "loyalty_booking")));
            if (prevJobs.length === 1) {
              await storage.creditWalletTokens((customer as any).referredByUserId, REFERRAL_BONUS);
              await db.insert(rewards).values({
                userId: (customer as any).referredByUserId,
                rewardType: "referral_confirmed",
                tokenAmount: REFERRAL_BONUS.toFixed(8),
                cashValue: (REFERRAL_BONUS * TOKEN_PRICE).toFixed(6),
                status: "confirmed",
                metadata: { referredUserId: customer.id, jobId: leadId },
              });
              console.log(`🎉 Referral ${REFERRAL_BONUS} JCMOVES → ${(customer as any).referredByUserId}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Customer earn reward failed:", err);
  }

  // ── Mark as distributed (both fields for compatibility) ─────────────────
  await storage.updateLeadQuote(leadId, {
    completionRewardedAt: now,
    tokensDisbursedAt: now,
  });
  console.log(`✅ Job ${leadId} disbursement complete at ${now.toISOString()}`);
  return summary;
}
