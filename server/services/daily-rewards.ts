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

// Sentinel error thrown inside the persistence transaction when an in-tx
// re-check discovers another check-in landed for the same user since the
// pre-check ran. Treated as a recoverable "already checked in" outcome.
const DUPLICATE_CHECKIN_RACE = "DUPLICATE_CHECKIN_RACE";

// True America/New_York Eastern day boundary, DST-safe via Intl. The rest
// of the codebase still uses the (mislabeled) UTC-6 Central helpers in
// utils/dateUtils.ts; the unified rewards engine intentionally uses the
// real Eastern boundary the task requires. Local helpers so we don't
// disturb the other consumers of dateUtils (mining, etc.).
const EASTERN_TZ = "America/New_York";
const easternFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: EASTERN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function easternDateStrFor(d: Date): string {
  // en-CA produces YYYY-MM-DD which matches the existing checkin_date column.
  return easternFmt.format(d);
}
function easternToday(): string {
  return easternDateStrFor(new Date());
}
// DST-safe "previous Eastern calendar day". We derive from the `today`
// YYYY-MM-DD string and subtract ONE CALENDAR DAY (not 24 hours) using UTC
// math, so the spring-forward / fall-back DST transitions can never produce
// an off-by-one streak break. UTC is fine here because we're only doing
// calendar arithmetic on a date string already anchored to Eastern.
function easternYesterdayFromToday(todayStr: string): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000);
  return prev.toISOString().slice(0, 10);
}

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
      // 1) Already-checked-in-today guard. Compares the YYYY-MM-DD
      //    `checkin_date` column directly against today in true Eastern
      //    time, so a single user can only earn one daily reward per
      //    Eastern calendar day regardless of when their existing rows
      //    were written.
      const today = easternToday();
      const yesterdayStr = easternYesterdayFromToday(today);

      const [existingToday] = await db
        .select({
          streakCount: dailyCheckins.streakCount,
        })
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

      // 4) Streak calculation — true Eastern-day aware.
      const lastCheckIn = await storage.getLastCheckIn(userId);

      let newStreak = 1;
      let isNewRecord = false;

      if (lastCheckIn) {
        const lastDateStr = lastCheckIn.checkinDate;
        if (lastDateStr === today) {
          // Defensive: pre-check above already guarded this.
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

      // 6) Pre-flight: cheap, no-DB-write check that the treasury can
      //    cover this distribution at the current price. The actual
      //    treasury debit + safety re-check happens inside the persistence
      //    transaction below so it commits/rolls back atomically with the
      //    user-side writes.
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

      // 7) ONE atomic unit for the entire check-in: treasury debit, audit
      //    row, wallet credit, rewards row, points ledger, stats roll-up.
      //    Either every record commits together or nothing does — no
      //    orphan treasury debits, no broken streaks, no half-credited
      //    wallets.
      //
      //    Concurrency safety:
      //      - pg_advisory_xact_lock serializes concurrent requests for the
      //        SAME user, so two parallel /api/gamification/checkin posts
      //        from the same browser/tab can't double-spend.
      //      - In-tx re-read of dailyCheckins by (userId, checkinDate)
      //        provides a final guard that survives even if the lock is
      //        bypassed somehow.
      //      - Treasury debit and wallet credit both use FOR UPDATE / atomic
      //        SQL increments so cross-user races stay consistent.
      //
      //    INVARIANT: only token_balance / total_earned move on
      //    wallet_accounts. cash_balance is NEVER touched here — that
      //    column may only be incremented on a real customer payment
      //    received. See the comment on walletAccounts.cashBalance in
      //    shared/schema.ts.
      // Hoisted out of the tx so the success-return below can include the
      // post-debit treasury balance for the frontend.
      let distributionRemaining = 0;
      try {
        await db.transaction(async (tx) => {
          // 7a) Per-user advisory lock — serializes concurrent check-ins
          //     for THIS user only (other users are unaffected). Released
          //     automatically at commit/rollback.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${"daily_checkin:" + userId}, 0))`
          );

          // 7b) In-tx duplicate guard — a concurrent request that beat us
          //     to the lock has already inserted today's row.
          const dup = await tx
            .select({ id: dailyCheckins.id })
            .from(dailyCheckins)
            .where(
              and(
                eq(dailyCheckins.userId, userId),
                eq(dailyCheckins.checkinDate, today)
              )
            )
            .limit(1);
          if (dup.length > 0) {
            throw new Error(DUPLICATE_CHECKIN_RACE);
          }

          // 7c) Treasury debit — runs INSIDE the user-side tx so a
          //     downstream failure rolls the debit back too.
          const distribution = await treasuryService.distributeTokensInTransaction(
            tx,
            tokenAmountNum,
            `Daily check-in reward (${newStreak} day streak)`,
            "daily_checkin",
            userId
          );
          distributionRemaining = distribution.remainingBalance;

          // 7d) Audit history row (streakCount / riskScore / rewardClaimed
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

          // 7e) Wallet credit — atomic SQL increment to avoid the classic
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

          // 7f) Rewards-history row (analytics / display only).
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

          // 7g) Points ledger.
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

          // 7h) Stats roll-up — atomic SQL bumps so a parallel mutation
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
          // Lost the per-user advisory lock to another concurrent request
          // that already wrote today's row. Treasury was NOT debited
          // (everything was inside the same tx, all rolled back together).
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
        // Anything else — treasury preflight failure, FOR UPDATE deadlock,
        // wallet/stats write error — rolled back atomically. Surface a
        // generic error; the entire unit is consistent (nothing committed).
        console.error("Daily check-in persistence tx failed:", txErr);
        const stats = await treasuryService.getTreasuryStats().catch(() => null);
        return {
          success: false,
          points: 0,
          tokens: "0",
          streak: newStreak,
          isNewRecord,
          treasuryBalance: stats?.availableFunding ?? 0,
          error:
            txErr instanceof Error && txErr.message
              ? txErr.message
              : "Reward processing failed. Please try again shortly.",
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
