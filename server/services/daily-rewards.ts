// Unified daily rewards engine. Replaces server/services/daily-checkin.ts
// and gamification.performDailyCheckIn. Pays JCMOVES tokens only —
// cash_balance is never touched (see walletAccounts.cashBalance comment).

import { and, eq, sql } from "drizzle-orm";
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
import type { DailyCheckInResult } from "./gamification";
import { GAMIFICATION_REWARDS, gamificationService } from "./gamification";

const DUPLICATE_CHECKIN_RACE = "DUPLICATE_CHECKIN_RACE";

// True America/New_York Eastern day boundary (DST-safe via Intl).
// Uses formatToParts so we don't depend on locale-dependent string format.
const easternFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function easternToday(): string {
  const parts = easternFmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Calendar-day arithmetic on the Eastern-anchored date string so DST
// transitions can't produce an off-by-one streak break.
function easternYesterdayFromToday(todayStr: string): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000);
  return prev.toISOString().slice(0, 10);
}

const BASE_CHECKIN_USD = 0.25;
const TOKEN_STREAK_PER_DAY = 0.1;
const TOKEN_STREAK_CAP = 2.5;

function tokenStreakMultiplier(streak: number): number {
  if (streak <= 1) return 1.0;
  return Math.min(1.0 + (streak - 1) * TOKEN_STREAK_PER_DAY, TOKEN_STREAK_CAP);
}

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
  async checkIn(
    userId: string,
    ctx: DailyCheckInContext = { ipAddress: "unknown", userAgent: "unknown" }
  ): Promise<DailyCheckInResult> {
    try {
      const today = easternToday();
      const yesterdayStr = easternYesterdayFromToday(today);

      const [existingToday] = await db
        .select({ streakCount: dailyCheckins.streakCount })
        .from(dailyCheckins)
        .where(
          and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.checkinDate, today))
        )
        .limit(1);

      if (existingToday) {
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: existingToday.streakCount || 1,
          isNewRecord: false,
          treasuryBalance: 0,
          error: "Already checked in today! Come back tomorrow.",
        };
      }

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

      let userStats = await storage.getEmployeeStats(userId);
      if (!userStats) {
        userStats = await storage.createEmployeeStats({ userId });
      }

      const lastCheckIn = await storage.getLastCheckIn(userId);

      let newStreak = 1;
      let isNewRecord = false;

      if (lastCheckIn) {
        const lastDateStr = lastCheckIn.checkinDate;
        if (lastDateStr === today) {
          newStreak = lastCheckIn.streakCount || 1;
        } else if (lastDateStr === yesterdayStr) {
          newStreak = (lastCheckIn.streakCount || 0) + 1;
          isNewRecord = newStreak > (userStats.longestStreak || 0);
        } else {
          newStreak = 1;
        }
      }

      const tokenMult = tokenStreakMultiplier(newStreak);
      const usdValue = BASE_CHECKIN_USD * tokenMult;

      const pointsMult = Math.min(
        Math.pow(GAMIFICATION_REWARDS.DAILY_CHECKIN.STREAK_MULTIPLIER, newStreak - 1),
        GAMIFICATION_REWARDS.DAILY_CHECKIN.MAX_STREAK_BONUS
      );
      const points = Math.floor(GAMIFICATION_REWARDS.DAILY_CHECKIN.BASE_POINTS * pointsMult);

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

      // Treasury safety/funding gating happens inside the tx via
      // distributeTokensInTransaction; failure there throws and rolls back.

      // Single atomic unit: per-user advisory lock + dup re-check + treasury
      // debit + audit row + wallet credit + rewards/points/stats writes.
      // INVARIANT: cash_balance is never touched here.
      let distributionRemaining = 0;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${"daily_checkin:" + userId}, 0))`
          );

          const dup = await tx
            .select({ id: dailyCheckins.id })
            .from(dailyCheckins)
            .where(
              and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.checkinDate, today))
            )
            .limit(1);
          if (dup.length > 0) {
            throw new Error(DUPLICATE_CHECKIN_RACE);
          }

          const distribution = await treasuryService.distributeTokensInTransaction(
            tx,
            tokenAmountNum,
            `Daily check-in reward (${newStreak} day streak)`,
            "daily_checkin",
            userId
          );
          distributionRemaining = distribution.remainingBalance;

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
          return {
            success: false,
            points: 0,
            tokens: "0",
            streak: newStreak,
            isNewRecord: false,
            treasuryBalance: 0,
            error: "Already checked in today! Come back tomorrow.",
          };
        }
        console.error("Daily check-in persistence tx failed:", txErr);
        const stats = await treasuryService.getTreasuryStats().catch(() => null);
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord,
          treasuryBalance: stats?.availableFunding ?? 0,
          error: "Reward processing failed. Please try again shortly.",
        };
      }

      // Achievements run after commit; underlying check is idempotent.
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
        treasuryBalance: distributionRemaining,
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
