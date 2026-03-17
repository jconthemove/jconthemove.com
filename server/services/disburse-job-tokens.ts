/**
 * disburseJobTokens — Idempotent JCMOVES token disbursement service
 *
 * Called when a job transitions to "completed".  All payouts are guarded by
 * `completionRewardedAt` so they run exactly once per job.
 *
 * Payout rules:
 *  A) CUSTOMER  — earn_rate_per_dollar × totalPrice  (configurable in admin settings)
 *  B) CREW flat — employee_job_completed setting per crew member  (default 500 JCMOVES)
 *  C) CREW hours — 25 JCMOVES × confirmedHours per crew member
 *  D) CREW referral-creator bonus — 10 % of tokenAllocation to job creator (if not in crew)
 *  E) CUSTOMER referral — first-job referral bonus to the referrer
 */
import { db } from "../db";
import { rewards, rewardSettings, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";

const TOKEN_PRICE = 0.00000508432;
const HOURS_RATE = 25; // JCMOVES per confirmed hour per crew member
const FALLBACK_FLAT_REWARD = 500;
const FALLBACK_EARN_RATE = 50; // JCMOVES per $1

type DisbursementSummary = {
  customerTokens: number;
  perCrewFlatTokens: number;
  perCrewHoursTokens: number;
  crewIds: string[];
  customerId?: string;
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
  if (totalSpend >= 500) return "silver";
  return "bronze";
}

async function awardPoints(userId: string, action: string, count = 1) {
  try {
    // Inline minimal tier points award (avoids circular import from routes.ts)
    const TIER_POINTS: Record<string, number> = {
      signup: 100,
      daily_login: 5,
      first_spin: 50,
      spin_play: 10,
      lottery_entry: 15,
      profile_complete: 75,
      review_submitted: 100,
      referral_signup: 200,
      referral_confirmed: 500,
      job_completed: 300,
      employee_job_done: 200,
      employee_lead_created: 50,
      per_100_spent: 25,
      staking: 20,
      checkin: 10,
    };
    const pts = (TIER_POINTS[action] || 0) * count;
    if (pts <= 0) return;
    const { db: dbConn } = await import("../db");
    const { users: usersTable } = await import("@shared/schema");
    const { eq, sql: sqlFn } = await import("drizzle-orm");
    await dbConn.update(usersTable)
      .set({ tierPoints: sqlFn`COALESCE(tier_points, 0) + ${pts}` } as any)
      .where(eq(usersTable.id, userId));
  } catch (_) {}
}

export async function disburseJobTokens(leadId: string): Promise<DisbursementSummary | null> {
  const lead = await storage.getLead(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.completionRewardedAt) {
    console.log(`ℹ️ Job ${leadId} already disbursed at ${lead.completionRewardedAt} — skipping`);
    return null;
  }

  const crewIds: string[] = (lead.crewMembers && lead.crewMembers.length > 0)
    ? lead.crewMembers
    : (lead.assignedToUserId ? [lead.assignedToUserId] : []);

  const flatReward = (await getSetting("employee_job_completed")) ?? FALLBACK_FLAT_REWARD;
  const earnRate  = (await getSetting("earn_rate_per_dollar"))    ?? FALLBACK_EARN_RATE;
  const confirmedHours = lead.confirmedHours ? parseInt(String(lead.confirmedHours)) : 0;
  const hoursBonus = HOURS_RATE * confirmedHours;

  const summary: DisbursementSummary = {
    customerTokens: 0,
    perCrewFlatTokens: flatReward,
    perCrewHoursTokens: hoursBonus,
    crewIds,
  };

  // ── A. CREW: flat reward + hours bonus ───────────────────────────────────
  for (const memberId of crewIds) {
    try {
      const member = await storage.getUser(memberId).catch(() => null);
      if (!member) { console.log(`⚠️ Crew member ${memberId} not found — skipping`); continue; }

      // Flat reward
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

      // Hours bonus
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

      console.log(`🏆 Crew ${member.email}: flat=${flatReward} + hours=${hoursBonus} JCMOVES`);

      try {
        const { notificationService } = await import("./notification");
        await notificationService.notifyRewardAvailable(memberId, "job completion", flatReward + hoursBonus);
      } catch (_) {}
    } catch (err) {
      console.error(`❌ Crew reward failed for ${memberId}:`, err);
    }
  }

  // ── B. JOB CREATOR BONUS (10 % of tokenAllocation if creator not in crew) ─
  if (lead.tokenAllocation && parseFloat(lead.tokenAllocation) > 0 && crewIds.length > 0) {
    const totalAlloc = parseFloat(lead.tokenAllocation);
    const creatorId = lead.createdByUserId;
    const creatorInCrew = creatorId && crewIds.includes(creatorId);

    let crewAlloc = totalAlloc;
    if (creatorId && !creatorInCrew) {
      const creatorBonus = totalAlloc * 0.1;
      crewAlloc = totalAlloc * 0.9;
      await storage.creditWalletTokens(creatorId, creatorBonus);
      await db.insert(rewards).values({
        userId: creatorId,
        rewardType: "job_creation_bonus",
        tokenAmount: creatorBonus.toFixed(8),
        cashValue: (creatorBonus * TOKEN_PRICE).toFixed(6),
        status: "confirmed",
        referenceId: leadId,
        metadata: { totalAlloc, pct: "10%", jobId: leadId },
      });
    }

    const perWorker = crewAlloc / crewIds.length;
    for (const memberId of crewIds) {
      try {
        await storage.creditWalletTokens(memberId, perWorker);
        await db.insert(rewards).values({
          userId: memberId,
          rewardType: "job_allocation_share",
          tokenAmount: perWorker.toFixed(8),
          cashValue: (perWorker * TOKEN_PRICE).toFixed(6),
          status: "confirmed",
          referenceId: leadId,
          metadata: { jobId: leadId, totalAlloc, crewSize: crewIds.length },
        });
      } catch (err) {
        console.error(`❌ Allocation share failed for ${memberId}:`, err);
      }
    }
  }

  // ── C. CUSTOMER earn reward ──────────────────────────────────────────────
  try {
    const customerEmail = (lead as any).email || (lead as any).customerEmail;
    if (customerEmail) {
      const customer = await storage.getUserByEmail(customerEmail);
      if (customer) {
        const jobPrice = parseFloat((lead as any).totalPrice || (lead as any).basePrice || "0");
        const customerTokens = jobPrice > 0 ? Math.round(jobPrice * earnRate) : 0;
        if (customerTokens > 0) {
          const prevSpend = parseFloat((customer as any).totalCompletedSpend || "0");
          const newSpend = prevSpend + jobPrice;
          const newTier = getTierFromSpend(newSpend);
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
            metadata: { jobId: leadId, jobPrice, earnRate },
          });
          await awardPoints(customer.id, "job_completed");
          const spentHundreds = Math.floor(jobPrice / 100);
          if (spentHundreds > 0) await awardPoints(customer.id, "per_100_spent", spentHundreds);
          summary.customerTokens = customerTokens;
          summary.customerId = customer.id;
          console.log(`🎁 Customer ${customer.email}: ${customerTokens} JCMOVES (${earnRate}/$ × $${jobPrice})`);

          // ── D. REFERRAL BONUS (first completed job only) ───────────────
          if (customer.referredByUserId) {
            const prevJobs = await db.select().from(rewards)
              .where(and(eq(rewards.userId, customer.id), eq(rewards.rewardType, "loyalty_booking")));
            if (prevJobs.length === 1) {
              const REFERRAL_BONUS = 1000;
              await storage.creditWalletTokens(customer.referredByUserId, REFERRAL_BONUS);
              await db.insert(rewards).values({
                userId: customer.referredByUserId,
                rewardType: "referral_confirmed",
                tokenAmount: REFERRAL_BONUS.toFixed(8),
                cashValue: (REFERRAL_BONUS * TOKEN_PRICE).toFixed(6),
                status: "confirmed",
                metadata: { referredUserId: customer.id, jobId: leadId },
              });
              console.log(`🎉 Referral bonus ${REFERRAL_BONUS} JCMOVES to ${customer.referredByUserId}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("❌ Customer earn reward failed:", err);
  }

  // ── Mark as distributed ──────────────────────────────────────────────────
  await storage.updateLeadQuote(leadId, { completionRewardedAt: new Date() });
  console.log(`✅ Job ${leadId} disbursement complete`);
  return summary;
}
