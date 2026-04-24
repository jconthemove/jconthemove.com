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

import { storage } from "../storage";
import { db } from "../db";
import { fraudLogs, dailyCheckins } from "@shared/schema";
import { treasuryService } from "./treasury";
import { fraudDetectionService } from "./fraud-detection";
import { getEasternDateStr, getEasternDayStart } from "../utils/dateUtils";
import type { DailyCheckInResult } from "./gamification";
import { GAMIFICATION_REWARDS } from "./gamification";

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

      // 3) Make sure stats row exists.
      let employeeStats = await storage.getEmployeeStats(userId);
      if (!employeeStats) {
        employeeStats = await storage.createEmployeeStats({ userId });
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
          isNewRecord = newStreak > (employeeStats.longestStreak || 0);
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

      // 7) Persist user-side records.
      //    INVARIANT: only token_balance / total_earned move. cash_balance
      //    is NEVER touched here — that column may only be incremented on a
      //    real customer payment received. See the comment on
      //    walletAccounts.cashBalance in shared/schema.ts.
      try {
        const existingWallet = await storage.getWalletAccount(userId);
        if (existingWallet) {
          await storage.updateWalletAccount(userId, {
            tokenBalance: (
              parseFloat(existingWallet.tokenBalance || "0") + tokenAmountNum
            ).toFixed(8),
            totalEarned: (
              parseFloat(existingWallet.totalEarned || "0") + tokenAmountNum
            ).toFixed(8),
            lastActivity: new Date(),
          });
        } else {
          // createWalletAccount's insert schema omits balance columns, so
          // create the row first, then bump tokens via updateWalletAccount.
          // cash_balance defaults to 0.00 (invariant — never minted here).
          await storage.createWalletAccount({
            userId,
            walletAddress: `0xJCMOVES_${userId.substring(0, 8)}`,
          });
          await storage.updateWalletAccount(userId, {
            tokenBalance: tokenAmount,
            totalEarned: tokenAmount,
            lastActivity: new Date(),
          });
        }
      } catch (walletErr) {
        // Tokens have already been deducted from treasury at this point —
        // surface the failure so we don't silently swallow a wallet write.
        console.error("Wallet update error during daily check-in:", walletErr);
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord,
          treasuryBalance: distribution.remainingBalance,
          error: "Reward distributed but wallet update failed. Please contact support.",
        };
      }

      // History row. We write directly to db because the storage helper's
      // insert type omits streakCount / riskScore / rewardClaimed, and we
      // want all of those persisted for audit + the streak math next time.
      await db.insert(dailyCheckins).values({
        userId,
        checkinDate: today,
        deviceFingerprint: deviceFP,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        rewardClaimed: true,
        streakCount: newStreak,
        riskScore: fraudCheck.riskScore,
      });

      // Rewards-history row (for analytics / display only).
      await storage.createReward({
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

      // Points ledger.
      await storage.createPointTransaction({
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

      // Stats roll-up.
      await storage.updateEmployeeStats(userId, {
        totalPoints: (employeeStats.totalPoints || 0) + points,
        currentStreak: newStreak,
        longestStreak: Math.max(employeeStats.longestStreak || 0, newStreak),
        totalEarnedTokens: (
          parseFloat(employeeStats.totalEarnedTokens || "0") + tokenAmountNum
        ).toFixed(8),
        lastActivityDate: new Date(),
      });

      // 7-day-streak achievement (and any other daily-checkin achievements).
      try {
        const { gamificationService } = await import("./gamification");
        await (gamificationService as any).checkAndAwardAchievements?.(userId, {
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
