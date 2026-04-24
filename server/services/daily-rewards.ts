// Unified Daily Rewards Engine — single source of truth for the
// "daily check-in" feature.
//
// Replaces the previous two parallel systems:
//   - server/services/daily-checkin.ts (had fraud detection, was dead code)
//   - server/services/gamification.ts → performDailyCheckIn (was live but had
//     a hidden ReferenceError on `now` that silently broke check-ins)
//
// Pays JCMOVES TOKENS only — never touches wallet_accounts.cash_balance.
// See the invariant comment on walletAccounts.cashBalance in shared/schema.ts.

import { and, eq, gte, sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import {
  fraudLogs,
  dailyCheckins,
  rewards,
  walletAccounts,
  pointTransactions,
  employeeStats as employeeStatsTable,
} from "@shared/schema";
import { treasuryService } from "./treasury";
import { fraudDetectionService } from "./fraud-detection";
import { getEasternDateStr, getEasternDayStart } from "../utils/dateUtils";
import type { DailyCheckInResult } from "./gamification";
import { GAMIFICATION_REWARDS, gamificationService } from "./gamification";

// Sentinel error thrown inside the persistence transaction when an in-tx
// re-check discovers another check-in landed for the same user since the
// pre-check ran. Treated as a recoverable "already checked in" outcome.
const DUPLICATE_CHECKIN_RACE = "DUPLICATE_CHECKIN_RACE";

// Base USD value of one daily check-in BEFORE the streak token multiplier
// is applied. Kept at the same $0.25 anchor that the live system used so
// payouts don't suddenly balloon.
const BASE_CHECKIN_USD = 0.25;

// Token streak multiplier — "state of the art" middle ground:
// the longer you check in, the more JCMOVES you get, but capped so the
// treasury can't be drained by a long-streak account.
//
// Curve: linear +10% per day past day 1, capped at 2.5x at day 16+.
//   day 1  → 1.00x ($0.25)
//   day 2  → 1.10x
//   day 7  → 1.60x
//   day 14 → 2.30x
//   day 16+ → 2.50x  (cap)
//
// Points keep their existing exponential 1.1^n curve capped at 3.0x — no
// change to the gamification math, only to the token payout.
const TOKEN_STREAK_PER_DAY = 0.1;
const TOKEN_STREAK_CAP = 2.5;

function tokenStreakMultiplier(streak: number): number {
  if (streak <= 1) return 1.0;
  return Math.min(1.0 + (streak - 1) * TOKEN_STREAK_PER_DAY, TOKEN_STREAK_CAP);
}

// What the caller passes in from the HTTP layer so we can do fraud /
// abuse analysis the same way the old daily-checkin.ts service did.
export interface DailyCheckInContext {
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: {
    userAgent: string;
    screenResolution?: string;
    timezone?: string;
    language?: string;
    platform?: string;
  };
}

export class DailyRewardsService {
  /**
   * Process a daily check-in attempt for the given user.
   *
   * Backward-compatible response shape — matches what
   * gamificationService.performDailyCheckIn used to return so the existing
   * /api/gamification/checkin endpoint and all frontend callers (Earn Tasks
   * button, mobile lead manager, spin wheel) keep working with no edits.
   */
  async checkIn(
    userId: string,
    ctx: DailyCheckInContext = { ipAddress: "unknown", userAgent: "unknown" }
  ): Promise<DailyCheckInResult> {
    try {
      // 1) Already-checked-in-today guard (Eastern day boundary).
      const todayEasternStart = getEasternDayStart();
      const recentCheckIn = await storage.getRecentCheckIn(userId, todayEasternStart);

      if (recentCheckIn) {
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: recentCheckIn.streakCount || 1,
          isNewRecord: false,
          treasuryBalance: 0,
          error: "Already checked in today! Come back tomorrow.",
        };
      }

      // 2) Fraud / abuse analysis. Ported from the old daily-checkin.ts so
      //    rapid repeats from suspicious IPs / device fingerprints are still
      //    blocked the way they used to be.
      const deviceFP = ctx.deviceFingerprint
        ? fraudDetectionService.generateDeviceFingerprint(ctx.deviceFingerprint)
        : "unknown";

      const fraudCheck = await fraudDetectionService.analyzeCheckinAttempt({
        userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        deviceFingerprint: deviceFP,
        timestamp: new Date(),
      });

      if (fraudCheck.riskScore > 0) {
        try {
          await db.insert(fraudLogs).values({
            userId,
            eventType: "daily_checkin_attempt",
            riskScore: fraudCheck.riskScore,
            details: {
              reasons: fraudCheck.reasons,
              deviceFingerprint: deviceFP,
              timestamp: new Date().toISOString(),
            },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            actionTaken: fraudCheck.actionTaken,
          });
        } catch (logErr) {
          // Never block a legitimate check-in just because the audit log
          // write failed.
          console.error("fraud_logs insert failed:", logErr);
        }
      }

      if (fraudCheck.blocked) {
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: 0,
          isNewRecord: false,
          treasuryBalance: 0,
          error: "Check-in temporarily unavailable. Please try again later or contact support.",
        };
      }

      // 3) Make sure stats row exists. (Renamed local to avoid shadowing
      //    the imported employee_stats table reference used inside the tx.)
      let userStats = await storage.getEmployeeStats(userId);
      if (!userStats) {
        userStats = await storage.createEmployeeStats({ userId });
      }

      // 4) Streak calculation — Eastern-day aware.
      const today = getEasternDateStr();
      const lastCheckIn = await storage.getLastCheckIn(userId);

      let newStreak = 1;
      let isNewRecord = false;

      if (lastCheckIn) {
        const lastDateStr = lastCheckIn.checkinDate;

        // "Yesterday" in Eastern days = the date one day before today.
        const yesterday = new Date(todayEasternStart.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (lastDateStr === today) {
          // Defensive: getRecentCheckIn already guarded this, but keep consistent.
          newStreak = lastCheckIn.streakCount || 1;
        } else if (lastDateStr === yesterdayStr) {
          newStreak = (lastCheckIn.streakCount || 0) + 1;
          isNewRecord = newStreak > (userStats.longestStreak || 0);
        } else {
          newStreak = 1;
        }
      }

      // 5) Reward math — tokens scale with streak, points scale with streak,
      //    USD value of payout is BASE_CHECKIN_USD × tokenStreakMultiplier.
      const tokenMult = tokenStreakMultiplier(newStreak);
      const usdValue = BASE_CHECKIN_USD * tokenMult;

      const pointsMult = Math.min(
        Math.pow(GAMIFICATION_REWARDS.DAILY_CHECKIN.STREAK_MULTIPLIER, newStreak - 1),
        GAMIFICATION_REWARDS.DAILY_CHECKIN.MAX_STREAK_BONUS
      );
      const points = Math.floor(GAMIFICATION_REWARDS.DAILY_CHECKIN.BASE_POINTS * pointsMult);

      // Real-time JCMOVES price → tokens.
      const currentPrice = await treasuryService.getCurrentTokenPrice();
      if (!currentPrice.price || currentPrice.price <= 0) {
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord: false,
          treasuryBalance: 0,
          error: "Token price unavailable. Please try again shortly.",
        };
      }
      const tokenAmount = (usdValue / currentPrice.price).toFixed(8);
      const tokenAmountNum = parseFloat(tokenAmount);

      // 6) Treasury check + distribution.
      const canDistribute = await treasuryService.canDistributeTokens(tokenAmountNum);
      if (!canDistribute.canDistribute) {
        const stats = await treasuryService.getTreasuryStats().catch(() => null);
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord,
          treasuryBalance: stats?.availableFunding ?? 0,
          error: canDistribute.reason || "Daily rewards are temporarily unavailable due to insufficient funding.",
        };
      }

      const distribution = await treasuryService.distributeTokens(
        tokenAmountNum,
        `Daily check-in reward (${newStreak} day streak)`,
        "daily_checkin",
        userId
      );

      if (!distribution.success) {
        const stats = await treasuryService.getTreasuryStats().catch(() => null);
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord,
          treasuryBalance: stats?.availableFunding ?? 0,
          error: distribution.error || "Token distribution failed",
        };
      }

      // 7) Persist user-side records in a SINGLE database transaction so we
      //    never leave partial state (e.g. wallet credited but no
      //    daily_checkins row, breaking tomorrow's streak math, or a
      //    points ledger entry without a matching wallet credit).
      //
      //    INVARIANT: only token_balance / total_earned move. cash_balance
      //    is NEVER touched here — that column may only be incremented on a
      //    real customer payment received. See the comment on
      //    walletAccounts.cashBalance in shared/schema.ts.
      //
      //    Treasury distribution above is its own atomic operation. If this
      //    tx rolls back the treasury debit is stranded and surfaced as a
      //    failure — better than corrupting user-side state.
      try {
        await db.transaction(async (tx) => {
          // 7a) In-tx re-check to close the race window between the
          //     pre-check and the persistence writes. Two concurrent
          //     requests for the same user would both pass the pre-check
          //     and both reach this point; only one will see an empty
          //     result here.
          const dup = await tx
            .select({ id: dailyCheckins.id })
            .from(dailyCheckins)
            .where(
              and(
                eq(dailyCheckins.userId, userId),
                gte(dailyCheckins.createdAt, todayEasternStart)
              )
            )
            .limit(1);
          if (dup.length > 0) {
            throw new Error(DUPLICATE_CHECKIN_RACE);
          }

          // 7b) Audit history row (streakCount / riskScore / rewardClaimed
          //     are not in the public InsertDailyCheckin type, so we write
          //     directly via the tx).
          await tx.insert(dailyCheckins).values({
            userId,
            checkinDate: today,
            deviceFingerprint: deviceFP,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            rewardClaimed: true,
            streakCount: newStreak,
            riskScore: fraudCheck.riskScore,
          });

          // 7c) Wallet credit — atomic SQL increment to avoid the classic
          //     read-modify-write lost-update bug under concurrency.
          //     cashBalance is intentionally absent from both branches.
          const existingWallet = await tx
            .select({ userId: walletAccounts.userId })
            .from(walletAccounts)
            .where(eq(walletAccounts.userId, userId))
            .limit(1);
          if (existingWallet.length > 0) {
            await tx
              .update(walletAccounts)
              .set({
                tokenBalance: sql`${walletAccounts.tokenBalance} + ${tokenAmount}::numeric`,
                totalEarned: sql`${walletAccounts.totalEarned} + ${tokenAmount}::numeric`,
                lastActivity: new Date(),
              })
              .where(eq(walletAccounts.userId, userId));
          } else {
            await tx.insert(walletAccounts).values({
              userId,
              walletAddress: `0xJCMOVES_${userId.substring(0, 8)}`,
              tokenBalance: tokenAmount,
              totalEarned: tokenAmount,
              lastActivity: new Date(),
            });
          }

          // 7d) Rewards-history row (analytics / display only).
          await tx.insert(rewards).values({
            userId,
            rewardType: "daily_checkin",
            tokenAmount,
            cashValue: usdValue.toFixed(4),
            status: "confirmed",
            metadata: {
              streakCount: newStreak,
              tokenStreakMultiplier: tokenMult.toFixed(2),
              pointsStreakMultiplier: pointsMult.toFixed(2),
              riskScore: fraudCheck.riskScore,
              deviceFingerprint: deviceFP,
              treasuryTransactionId: distribution.transactionId,
              tokenPriceUsd: currentPrice.price,
            },
          });

          // 7e) Points ledger.
          await tx.insert(pointTransactions).values({
            userId,
            points,
            transactionType: "daily_checkin",
            description: `Daily check-in - ${newStreak} day streak`,
            metadata: {
              streak: newStreak,
              tokenAmount,
              tokenStreakMultiplier: tokenMult.toFixed(2),
              pointsStreakMultiplier: pointsMult.toFixed(2),
            },
          });

          // 7f) Stats roll-up — atomic SQL bumps so a parallel mutation
          //     elsewhere can't clobber this update.
          await tx
            .update(employeeStatsTable)
            .set({
              totalPoints: sql`${employeeStatsTable.totalPoints} + ${points}`,
              currentStreak: newStreak,
              longestStreak: sql`GREATEST(${employeeStatsTable.longestStreak}, ${newStreak})`,
              totalEarnedTokens: sql`${employeeStatsTable.totalEarnedTokens} + ${tokenAmount}::numeric`,
              lastActivityDate: new Date(),
            })
            .where(eq(employeeStatsTable.userId, userId));
        });
      } catch (txErr) {
        if (txErr instanceof Error && txErr.message === DUPLICATE_CHECKIN_RACE) {
          // Lost the race — another concurrent request just persisted
          // today's check-in. Treasury was already debited above; log so
          // ops can reconcile.
          console.warn(
            `[daily-rewards] duplicate check-in race for user ${userId}; treasury distribution ${distribution.transactionId} is now orphaned and needs reconciliation.`
          );
          return {
            success: false,
            points: 0,
            tokens: "0",
            streak: newStreak,
            isNewRecord: false,
            treasuryBalance: distribution.remainingBalance,
            error: "Already checked in today! Come back tomorrow.",
          };
        }
        // Treasury was debited above; user-side writes rolled back.
        console.error("Daily check-in persistence tx failed:", txErr);
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord,
          treasuryBalance: distribution.remainingBalance,
          error: "Reward processing failed. Please contact support.",
        };
      }

      // 8) Achievements run AFTER the transaction commits. Achievement
      //    awards are themselves idempotent (the underlying check verifies
      //    the badge isn't already held) so a partial failure here can be
      //    retried on the next check-in without double-awarding.
      try {
        await gamificationService.checkAndAwardAchievements(userId, {
          type: "daily_checkin",
          streak: newStreak,
          isNewRecord,
        });
      } catch (achErr) {
        console.error("Achievement check failed:", achErr);
      }

      return {
        success: true,
        points,
        tokens: tokenAmount,
        streak: newStreak,
        isNewRecord,
        treasuryBalance: distribution.remainingBalance,
      };
    } catch (error) {
      console.error("Daily check-in error:", error);
      return {
        success: false,
        points: 0,
        tokens: "0",
        streak: 0,
        isNewRecord: false,
        treasuryBalance: 0,
        error: "Check-in failed due to a technical error. Please try again.",
      };
    }
  }
}

export const dailyRewardsService = new DailyRewardsService();
