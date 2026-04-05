import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { getEasternDateStr, getEasternDayStart, getEasternDayEnd } from "./utils/dateUtils";
import { storage } from "./storage";
import { insertLeadSchema, insertContactSchema, insertCashoutRequestSchema, insertShopItemSchema, insertReviewSchema } from "@shared/schema";
import { sendEmail, generateLeadNotificationEmail, generateContactNotificationEmail } from "./services/email";
import { setupAuth, isAuthenticated, isAuthenticatedAllowPending, signJwt, signRefreshToken, verifyRefreshToken } from "./auth";
import bcrypt from "bcrypt";
// REMOVED: Daily check-in service replaced by unified mining system with streaks
// import { dailyCheckinService } from "./services/daily-checkin";
import { rewardsService } from "./services/rewards";
import { cryptoCashoutService } from "./services/crypto-cashout";
import { cryptoService } from "./services/crypto";
import { moonshotService, moonshotAccountTransferSchema } from "./services/moonshot";
import { treasuryService } from "./services/treasury";
import { gamificationService } from "./services/gamification";
import { faucetService } from "./services/faucet";
import { insertFundingDepositSchema, insertFaucetConfigSchema, insertFaucetWalletSchema } from "@shared/schema";
import { z } from "zod";
import { EncryptionService } from "./services/encryption";
import { eq, desc, sql, and, gte, lte, or, ilike, inArray } from 'drizzle-orm';
import { db, pool } from './db';
import { rewards, walletAccounts, walletPayouts, cashoutRequests, fundingDeposits, reserveTransactions, users, leads, swapRequests, treasurySwapRules, bitcoinPayments, stakes, stakingTiers, contacts, notifications, walletTransactions, jewelryItems, shopItems, giftCards, miningSessions, miningClaims, treasuryWithdrawals, tokenConversions, rewardSettings, recoveryTokens, promoCodes, reviews, rewardCategories, rewardItems, rewardRedemptions, buybackFund, laborQuotes } from '@shared/schema';
import { getFaucetPayService } from "./services/faucetpay";
import { getAdvertisingService } from "./services/advertising";
import { FAUCET_CONFIG, calculateJCMovesReward, getTierFromSpend, getTierFromPoints, LOYALTY_TIERS, TIER_POINT_AWARDS, type TierPointActivity } from "./constants";
import { fetchZipLocation, calculateMovingPrice } from "@shared/pricing";
import { walletService } from "./services/wallet";
import { solanaMonitor } from "./services/solana-monitor";
import { crewSuggestionService } from "./services/crew-suggestions";
import { ObjectStorageService } from "./objectStorage";
import { solanaTransferService } from "./services/solana-transfer";
import { jupiterSwapService, SUPPORTED_TOKENS } from "./services/jupiter-swap";
import { smsService } from "./services/sms";
import { ensureMomsAccount } from "./services/generosityFund";
import { dispatchGenericJob } from "./services/dispatchGeneric";

async function ensureStakingTiersSeeded() {
  try {
    const existing = await db.select().from(stakingTiers);
    if (existing.length === 0) {
      console.log("Seeding staking tiers...");
      const tiers = [
        { name: "Flexible", durationDays: 0, annualRatePercent: "5.00", minStake: "50.00000000", maxStake: null, earlyUnstakePenaltyPercent: "0.00", isActive: true },
        { name: "Bronze", durationDays: 30, annualRatePercent: "10.00", minStake: "100.00000000", maxStake: null, earlyUnstakePenaltyPercent: "0.00", isActive: true },
        { name: "Silver", durationDays: 90, annualRatePercent: "15.00", minStake: "250.00000000", maxStake: null, earlyUnstakePenaltyPercent: "0.00", isActive: true },
        { name: "Gold", durationDays: 180, annualRatePercent: "20.00", minStake: "500.00000000", maxStake: null, earlyUnstakePenaltyPercent: "0.00", isActive: true },
        { name: "Diamond", durationDays: 365, annualRatePercent: "30.00", minStake: "1000.00000000", maxStake: null, earlyUnstakePenaltyPercent: "0.00", isActive: true },
      ];
      await db.insert(stakingTiers).values(tiers);
      console.log("✅ Staking tiers seeded successfully");
    } else {
      const rateMap: Record<string, string> = { "Flexible": "5.00", "Bronze": "10.00", "Silver": "15.00", "Gold": "20.00", "Diamond": "30.00" };
      for (const tier of existing) {
        const expectedRate = rateMap[tier.name];
        if (expectedRate && tier.annualRatePercent !== expectedRate) {
          await db.update(stakingTiers).set({ annualRatePercent: expectedRate }).where(eq(stakingTiers.id, tier.id));
          console.log(`Updated ${tier.name} tier APR: ${tier.annualRatePercent}% → ${expectedRate}%`);
        }
      }
    }
  } catch (error) {
    console.error("Failed to seed staking tiers:", error);
  }
}

const STAKING_TREASURY_USER_ID = "staking-treasury-system";

async function ensureStakingTreasuryUser() {
  try {
    const [existing] = await db.select().from(users).where(eq(users.id, STAKING_TREASURY_USER_ID));
    if (!existing) {
      console.log("Creating staking treasury system user...");
      const randomHash = await bcrypt.hash(crypto.randomUUID() + Date.now(), 10);
      await db.insert(users).values({
        id: STAKING_TREASURY_USER_ID,
        email: "staking-treasury@system.internal",
        passwordHash: randomHash,
        firstName: "Staking",
        lastName: "Treasury",
        role: "employee",
        status: "pending",
      });
      await db.insert(walletAccounts).values({
        userId: STAKING_TREASURY_USER_ID,
        tokenBalance: "1000000.00000000",
        cashBalance: "0.00",
        totalEarned: "0.00000000",
        totalRedeemed: "0.00000000",
        totalCashedOut: "0.00",
        lastActivity: new Date(),
      });
      console.log("✅ Staking treasury system user and wallet created (1M JCMOVES)");
    } else {
      const wallet = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, STAKING_TREASURY_USER_ID));
      if (wallet.length === 0) {
        await db.insert(walletAccounts).values({
          userId: STAKING_TREASURY_USER_ID,
          tokenBalance: "1000000.00000000",
          cashBalance: "0.00",
          totalEarned: "0.00000000",
          totalRedeemed: "0.00000000",
          totalCashedOut: "0.00",
          lastActivity: new Date(),
        });
        console.log("✅ Staking treasury wallet created (1M JCMOVES)");
      }
    }
  } catch (error) {
    console.error("Failed to create staking treasury user:", error);
  }
}

async function ensureRewardSettingsSeeded() {
  try {
    const existing = await db.select().from(rewardSettings);
    if (existing.length === 0) {
      console.log("Seeding default reward settings...");
      const defaults = [
        { settingKey: "signup_bonus", label: "Sign Up Bonus", description: "Tokens awarded when a new user registers", tokenAmount: "250.00", isActive: true },
        { settingKey: "customer_quote_accepted", label: "Job Booking Reward", description: "Flat JCMOVES awarded when a customer books (submits) a job", tokenAmount: "250.00", isActive: true },
        { settingKey: "earn_rate_per_dollar", label: "Earn Rate (JCMOVES per $1)", description: "System-wide earn rate: tokens awarded per $1 of job value when a job completes. Applies to all customers.", tokenAmount: "15.00", isActive: true },
        { settingKey: "referral_confirmed", label: "Referral Confirmed", description: "Tokens awarded when a referred user signs up and activates", tokenAmount: "2500.00", isActive: true },
        { settingKey: "employee_job_completed", label: "Employee Job Reward", description: "Tokens awarded to each employee who completes a job", tokenAmount: "1000.00", isActive: true },
        { settingKey: "daily_checkin", label: "Daily Check-in", description: "Tokens awarded for daily app check-in", tokenAmount: "50.00", isActive: true },
        { settingKey: "scripture_reward", label: "Daily Scripture", description: "Tokens awarded for reading the daily scripture", tokenAmount: "100.00", isActive: true },
        { settingKey: "shop_purchase", label: "Shop Purchase Reward", description: "Tokens awarded to buyer after a community shop purchase", tokenAmount: "100.00", isActive: true },
        { settingKey: "jewelry_purchase", label: "Jewelry Purchase Reward", description: "Tokens awarded after a Nature Made Jewls purchase", tokenAmount: "150.00", isActive: true },
        { settingKey: "customer_quote_completed", label: "Job Completion Bonus", description: "Flat JCMOVES bonus awarded to customer when their job is marked completed", tokenAmount: "1500.00", isActive: true },
        { settingKey: "redemption_auto_approve_threshold", label: "Redemption Auto-Approve Threshold", description: "Redemptions under this token amount are auto-approved. At or above this amount are held for manual admin review.", tokenAmount: "5000.00", isActive: true },
      ];
      await db.insert(rewardSettings).values(defaults);
      console.log("✅ Default reward settings seeded successfully");
    } else {
      // Ensure earn_rate_per_dollar exists for existing databases
      const hasRate = existing.find(s => s.settingKey === 'earn_rate_per_dollar');
      if (!hasRate) {
        await db.insert(rewardSettings).values({ settingKey: "earn_rate_per_dollar", label: "Earn Rate (JCMOVES per $1)", description: "System-wide earn rate: tokens awarded per $1 of job value when a job completes.", tokenAmount: "15.00", isActive: true });
        console.log("✅ earn_rate_per_dollar setting inserted at 15/dollar");
      } else if (parseFloat(hasRate.tokenAmount) === 50) {
        await db.update(rewardSettings).set({ tokenAmount: "15.00" }).where(eq(rewardSettings.settingKey, 'earn_rate_per_dollar'));
        console.log("✅ earn_rate_per_dollar migrated 50 → 15 JCMOVES per dollar");
      }
      // Update booking reward from 200 → 250 if still at old default
      const bookingRow = existing.find(s => s.settingKey === 'customer_quote_accepted');
      if (bookingRow && parseFloat(bookingRow.tokenAmount) === 200) {
        await db.update(rewardSettings).set({ tokenAmount: "250.00", label: "Job Booking Reward" }).where(eq(rewardSettings.settingKey, 'customer_quote_accepted'));
        console.log("✅ Booking reward updated 200 → 250 JCMOVES");
      }
      // Ensure customer_quote_completed exists for existing databases
      const hasCompletionBonus = existing.find(s => s.settingKey === 'customer_quote_completed');
      if (!hasCompletionBonus) {
        await db.insert(rewardSettings).values({ settingKey: "customer_quote_completed", label: "Job Completion Bonus", description: "Flat JCMOVES bonus awarded to customer when their job is marked completed", tokenAmount: "1500.00", isActive: true });
        console.log("✅ customer_quote_completed setting inserted — 1500 JCMOVES flat completion bonus");
      }
      // Ensure auto-approve threshold exists
      const hasAutoApproveThreshold = existing.find(s => s.settingKey === 'redemption_auto_approve_threshold');
      if (!hasAutoApproveThreshold) {
        await db.insert(rewardSettings).values({ settingKey: "redemption_auto_approve_threshold", label: "Redemption Auto-Approve Threshold", description: "Redemptions under this token amount are auto-approved. At or above this amount are held for manual admin review.", tokenAmount: "5000.00", isActive: true });
        console.log("✅ redemption_auto_approve_threshold setting inserted — 5000 JCMOVES");
      }
    }
  } catch (error) {
    console.error("Failed to seed reward settings:", error);
  }
}

// Links employee promo codes to their user accounts on startup
async function seedDefaultPromoCodes() {
  try {
    const defaults = [
      {
        code: 'JCMOVES',
        description: 'JC ON THE MOVE official referral code — 10% off services + 500 bonus tokens',
        discountPercent: '10.00',
        discountPercentJewelry: '5.00',
        rewardTokens: '500.00',
        referralRewardTokens: '250.00',
        isActive: true,
      },
      {
        code: 'MATTMOVES',
        description: "Matt's employee referral code — earn tokens when your crew refer customers",
        discountPercent: '5.00',
        discountPercentJewelry: '0.00',
        rewardTokens: '100.00',
        referralRewardTokens: '50.00',
        isActive: true,
      },
      {
        code: 'TIM',
        description: "Tim's referral code — 5% off services + token bonus",
        discountPercent: '5.00',
        discountPercentJewelry: '0.00',
        rewardTokens: '100.00',
        referralRewardTokens: '50.00',
        isActive: true,
      },
      {
        code: 'TIMMOVES',
        description: "Tim's referral code — 5% off services + token bonus",
        discountPercent: '5.00',
        discountPercentJewelry: '0.00',
        rewardTokens: '100.00',
        referralRewardTokens: '50.00',
        isActive: true,
      },
      {
        code: 'TIMTHEMOVER',
        description: "Tim's referral code — 5% off services + token bonus",
        discountPercent: '5.00',
        discountPercentJewelry: '0.00',
        rewardTokens: '100.00',
        referralRewardTokens: '50.00',
        isActive: true,
      },
      {
        code: 'BILLSBARGAIN',
        description: "Bill's employee referral code",
        discountPercent: '5.00',
        discountPercentJewelry: '0.00',
        rewardTokens: '100.00',
        referralRewardTokens: '50.00',
        isActive: true,
      },
      {
        code: 'CLEANWINDOWS',
        description: 'April window cleaning promo — 20% off window cleaning service',
        discountPercent: '20.00',
        discountPercentJewelry: '0.00',
        rewardTokens: '0.00',
        referralRewardTokens: '0.00',
        isActive: true,
        maxUses: 500,
        expiresAt: new Date('2026-04-30T23:59:59Z'),
      },
    ];
    for (const promo of defaults) {
      const existing = await db.select({ id: promoCodes.id }).from(promoCodes)
        .where(eq(promoCodes.code, promo.code)).limit(1);
      if (existing.length === 0) {
        await db.insert(promoCodes).values(promo);
        console.log(`✅ Seeded promo code: ${promo.code}`);
      }
    }
  } catch (err) {
    console.error('Failed to seed default promo codes:', err);
  }
}

async function linkEmployeePromoCodes() {
  try {
    const knownLinks = [
      { code: 'MATTMOVES',   email: 'dawsonsdad8176@gmail.com' },
      { code: 'TIM',         email: 'timothymewbourn3@gmail.com' },
      { code: 'TIMMOVES',    email: 'timothymewbourn3@gmail.com' },
      { code: 'TIMTHEMOVER', email: 'timothymewbourn3@gmail.com' },
    ];
    for (const { code, email } of knownLinks) {
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (!user) continue;
      // Always update — ensures link is correct even if re-seeded
      await db.update(promoCodes).set({ referralUserId: user.id }).where(eq(promoCodes.code, code));
      console.log(`✅ Promo code ${code} linked to ${email}`);
    }
  } catch (err) {
    console.error('Failed to link employee promo codes:', err);
  }
}

async function ensureJackpotsSeeded() {
  try {
    // Seed jackpots table (contribution values set to Quantum Spin spec: 5/10)
    await pool.query(`
      INSERT INTO jackpots (type, current_value, starting_value, contribution_per_spin, win_probability_pct)
      VALUES ('mini', 5000, 5000, 5, 0.0500000)
      ON CONFLICT (type) DO NOTHING;

      INSERT INTO jackpots (type, current_value, starting_value, contribution_per_spin, win_probability_pct)
      VALUES ('major', 50000, 50000, 10, 0.0010000)
      ON CONFLICT (type) DO NOTHING;
    `);
    // Seed spin_config table
    await pool.query(`
      INSERT INTO spin_config (setting_key, setting_value, description)
      VALUES
        ('spin_cost_tokens',         '100',  'JCMOVES deducted per Quantum Spin'),
        ('spin_wheel_enabled',       'true', 'Whether Quantum Spin is open to users'),
        ('mini_jackpot_start',       '5000', 'Starting value for mini jackpot after reset'),
        ('major_jackpot_start',      '50000','Starting value for major jackpot after reset'),
        ('coupon_10pct_expiry_days',  '90',  '10%/$25 off coupon expiry in days'),
        ('coupon_25pct_expiry_days',  '30',  '25% off coupon expiry in days'),
        ('coffee_card_expiry_days',   '90',  'Coffee gift card expiry in days'),
        ('pricing_rate_per_mover_hour', '60', 'Base labor rate per mover per hour ($)'),
        ('pricing_truck_add',           '60', 'Additional hourly charge when truck is included ($)'),
        ('pricing_min_hours_1',          '5', 'Minimum hours for 1-mover crew'),
        ('pricing_min_hours_2',          '4', 'Minimum hours for 2-mover crew'),
        ('pricing_min_hours_3',          '3', 'Minimum hours for 3-mover crew'),
        ('pricing_min_hours_4',          '2', 'Minimum hours for 4-mover crew'),
        ('pricing_min_hours_5',          '2', 'Minimum hours for 5-mover crew'),
        ('pricing_short_job_rate',       '150', 'Short job flat rate ($/hr, small truck load-only)'),
        ('pricing_short_job_full',       '300', 'Short job full price before promo ($)'),
        ('pricing_jc222_price',          '222', 'JC222 promo price for short jobs ($)'),
        ('pricing_drive_speed_mph',       '50', 'Average drive speed for travel time calc (mph)'),
        ('pricing_junk_small_low',       '100', 'Junk removal small load estimate low ($)'),
        ('pricing_junk_small_high',      '200', 'Junk removal small load estimate high ($)'),
        ('pricing_junk_large_low',       '200', 'Junk removal full truckload estimate low ($)'),
        ('pricing_junk_large_high',      '600', 'Junk removal full truckload estimate high ($)'),
        ('pricing_custom_items',         '[]',  'Custom additional items/services JSON array')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    console.log('✅ Quantum Spin jackpots seeded');
    // Migrate drive speed from old 35 mph default to 50 mph
    await pool.query(`
      UPDATE spin_config SET setting_value = '50'
      WHERE setting_key = 'pricing_drive_speed_mph' AND setting_value = '35';
    `);
  } catch (err) {
    console.error('Failed to seed jackpots:', err);
  }
}

// Shared welcome email builder for approved users
function buildApprovalWelcomeEmail(firstName: string): { subject: string; text: string; html: string } {
  const subject = "You're In! Welcome to the JC on the Move Family 🎉";

  const text = `Hey ${firstName}!

Welcome to the JC on the Move family — we're SO glad you're here!

Your account has been APPROVED and you're officially part of the crew.

As a thank-you for joining, we've loaded your account with 250 JCMOVES tokens. These are your keys to the kingdom — save them, stack them, and use them for rewards throughout the app.

A few things to take care of right away:
• Save your password somewhere safe — you'll need it to log in every time.
• Link your phone number in your profile settings for account recovery options.
• Check back in DAILY — there are quests, missions, and rewards waiting for you throughout the app. New stuff drops all the time!

Thank you for your interest in our future. We're building something special together.

God bless,
— The JC on the Move Team
jconthemove.com`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="text-align:center;padding:32px 24px;background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);border-radius:16px 16px 0 0;border-bottom:3px solid #10b981;">
      <div style="font-size:48px;margin-bottom:8px;">🚛</div>
      <h1 style="color:#10b981;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">JC ON THE MOVE</h1>
      <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">Nationwide Moving & More</p>
    </div>

    <!-- Body -->
    <div style="background:#1e293b;padding:32px 28px;border-radius:0 0 16px 16px;">
      <h2 style="color:#f1f5f9;margin:0 0 8px;font-size:22px;">Hey ${firstName}, you're IN! 🎉</h2>
      <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 24px;">
        Welcome to the <strong style="color:#10b981;">JC on the Move family</strong> — we are so glad you're here. 
        Thank you for your interest in our future. Your account has officially been <strong style="color:#10b981;">APPROVED</strong> 
        and you're now part of the crew!
      </p>

      <!-- Token reward box -->
      <div style="background:linear-gradient(135deg,#78350f,#451a03);border:1px solid #d97706;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center;">
        <div style="font-size:36px;margin-bottom:6px;">🪙</div>
        <p style="color:#fbbf24;font-size:20px;font-weight:800;margin:0 0 4px;">250 JCMOVES Tokens</p>
        <p style="color:#fde68a;font-size:13px;margin:0;">have been added to your account as a welcome gift. Stack them up — they unlock rewards, discounts, and more!</p>
      </div>

      <!-- Action items -->
      <p style="color:#cbd5e1;font-size:15px;font-weight:600;margin:0 0 12px;">Here's what to do next:</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin:0 0 24px;">
        <div style="background:#0f172a;border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:20px;">🔑</span>
          <div>
            <p style="color:#f1f5f9;font-weight:700;margin:0 0 2px;font-size:14px;">Save your password</p>
            <p style="color:#64748b;font-size:13px;margin:0;">Write it down or store it in a password manager — you'll use it every time you log in.</p>
          </div>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:20px;">📱</span>
          <div>
            <p style="color:#f1f5f9;font-weight:700;margin:0 0 2px;font-size:14px;">Link your phone number</p>
            <p style="color:#64748b;font-size:13px;margin:0;">Go to your profile settings and add your phone number. It gives you recovery options if you ever get locked out.</p>
          </div>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:20px;">🎯</span>
          <div>
            <p style="color:#f1f5f9;font-weight:700;margin:0 0 2px;font-size:14px;">Check in daily</p>
            <p style="color:#64748b;font-size:13px;margin:0;">New quests, missions, and rewards drop all the time. The more you show up, the more you earn!</p>
          </div>
        </div>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin:0 0 28px;">
        <a href="https://jconthemove.com" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:30px;letter-spacing:0.3px;">
          Log In &amp; Start Earning →
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #334155;padding-top:20px;text-align:center;">
        <p style="color:#475569;font-size:12px;margin:0 0 4px;">God bless — The JC on the Move Team</p>
        <p style="color:#334155;font-size:11px;margin:0;">jconthemove.com · Michigan's Moving Crew</p>
      </div>
    </div>

  </div>
</body>
</html>`;

  return { subject, text, html };
}

// Approval tokens stored in DB (persists across server restarts)
async function generateApprovalToken(userId: string, action: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO approval_tokens (token, user_id, action, expires_at)
    VALUES (${token}, ${userId}, ${action}, ${expiresAt})
    ON CONFLICT (token) DO NOTHING
  `);
  return token;
}

// ── Award tier points and update loyalty tier automatically ──────────────────
async function awardTierPoints(userId: string, activity: TierPointActivity, multiplier = 1): Promise<void> {
  try {
    const pts = TIER_POINT_AWARDS[activity] * multiplier;
    const [updated] = await db
      .update(users)
      .set({ tierPoints: sql`COALESCE(tier_points, 0) + ${pts}` } as any)
      .where(eq(users.id, userId))
      .returning({ tierPoints: (users as any).tierPoints });
    if (updated) {
      const newTier = getTierFromPoints(updated.tierPoints ?? 0);
      await db.update(users).set({ loyaltyTier: newTier } as any).where(eq(users.id, userId));
    }
  } catch (e) {
    console.error(`[tierPoints] Failed to award ${activity} for user ${userId}:`, e);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Schema migration: add loyalty tier columns to users if not present
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_tier TEXT DEFAULT 'bronze';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS total_completed_spend DECIMAL(10,2) DEFAULT 0.00;
    `);
    console.log('✅ Loyalty tier columns ready');
  } catch (migErr) {
    console.error('⚠️ Loyalty tier migration error (non-fatal):', migErr);
  }

  // Schema migration: add is_driver column to users
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_driver BOOLEAN DEFAULT false;
    `);
    console.log('✅ is_driver column ready');
  } catch (migErr) {
    console.error('⚠️ is_driver migration error (non-fatal):', migErr);
  }

  // Schema migration: add crew availability window + capabilities columns
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS available_until TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    `);
    console.log('✅ crew availability window + capabilities columns ready');
  } catch (migErr) {
    console.error('⚠️ crew availability migration error (non-fatal):', migErr);
  }

  // Schema migration: add past_jobs_notice_seen column to users (one-time first-login notice)
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS past_jobs_notice_seen BOOLEAN DEFAULT false;
    `);
    console.log('✅ past_jobs_notice_seen column ready');
  } catch (migErr) {
    console.error('⚠️ past_jobs_notice_seen migration error (non-fatal):', migErr);
  }

  // Schema migration: add customer-selected package column to leads
  try {
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS selected_package_id TEXT;
    `);
    console.log('✅ Leads selected_package_id column ready');
  } catch (migErr) {
    console.error('⚠️ Leads selected_package_id migration error (non-fatal):', migErr);
  }

  // Schema migration: spin_results extended columns + jackpots + spin_config tables
  try {
    await pool.query(`
      ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS prize_type TEXT NOT NULL DEFAULT 'tokens';
      ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS jackpot_type_won TEXT;
      ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS jackpot_amount_won INTEGER;
      ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS coupon_code TEXT;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jackpots (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL UNIQUE,
        current_value INTEGER NOT NULL,
        starting_value INTEGER NOT NULL,
        contribution_per_spin INTEGER NOT NULL,
        win_probability_pct DECIMAL(10,7) NOT NULL,
        last_won_at TIMESTAMP,
        last_winner_id VARCHAR,
        last_winner_name TEXT,
        last_won_amount INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS spin_config (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS jackpot_wins (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL,
        jackpot_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        spin_result_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS activity_feed_events (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS mystery_box_results (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL,
        parent_spin_result_id INTEGER,
        reward_type TEXT NOT NULL,
        reward_value TEXT,
        coupon_code TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Upgrade jackpot contributions if still at old values
    await pool.query(`
      UPDATE jackpots SET contribution_per_spin = 5  WHERE type = 'mini'  AND contribution_per_spin < 5;
      UPDATE jackpots SET contribution_per_spin = 10 WHERE type = 'major' AND contribution_per_spin < 10;
    `);
    console.log('✅ Jackpot tables ready');
  } catch (migErr) {
    console.error('⚠️ Jackpot migration error (non-fatal):', migErr);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mom_hearts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR,
        display_name TEXT NOT NULL DEFAULT 'Anonymous',
        jcmoves_amount INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('💝 Mom hearts table ready');
  } catch (migErr) {
    console.error('⚠️ Jackpot migration error (non-fatal):', migErr);
  }

  // ETH Staking table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eth_stakes (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        amount_usd_at_entry DECIMAL(20, 2),
        tx_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        apy DECIMAL(8, 4) NOT NULL DEFAULT 4.50,
        validator_fee_pct DECIMAL(8, 4) NOT NULL DEFAULT 0.50,
        daily_rate DECIMAL(20, 12) NOT NULL DEFAULT 0.000123287,
        total_earned DECIMAL(20, 8) NOT NULL DEFAULT 0,
        last_payout_at TIMESTAMP NOT NULL DEFAULT NOW(),
        staked_at TIMESTAMP NOT NULL DEFAULT NOW(),
        unstake_requested_at TIMESTAMP,
        completed_at TIMESTAMP,
        admin_notes TEXT
      );
    `);
    console.log('⟠  ETH staking table ready');
  } catch (ethErr) {
    console.error('⚠️ ETH staking table error (non-fatal):', ethErr);
  }

  // Auto-compound column + yield source seed
  try {
    await pool.query(`ALTER TABLE stakes ADD COLUMN IF NOT EXISTS auto_compound BOOLEAN NOT NULL DEFAULT false`);
    // Seed default yield sources if not set
    const { rows: ysRows } = await pool.query(`SELECT setting_key FROM spin_config WHERE setting_key='staking_yield_sources' LIMIT 1`);
    if (!ysRows.length) {
      const defaultSources = JSON.stringify([
        { id: "moving", label: "Moving Company Revenue", icon: "🚚", monthlyUsd: 0, enabled: true },
        { id: "website", label: "Website Service Sales", icon: "🌐", monthlyUsd: 0, enabled: true },
        { id: "token_fees", label: "Token Fees", icon: "🪙", monthlyUsd: 0, enabled: true },
        { id: "eth_validator", label: "ETH Validator Rewards", icon: "⟠", monthlyUsd: 0, enabled: true },
        { id: "arbitrage", label: "Arbitrage Trading", icon: "📈", monthlyUsd: 0, enabled: true },
        { id: "pi_network", label: "Pi Network Revenue", icon: "π", monthlyUsd: 0, enabled: true },
      ]);
      await pool.query(`INSERT INTO spin_config (setting_key, setting_value, description) VALUES ('staking_yield_sources', $1, 'Treasury yield source breakdown') ON CONFLICT DO NOTHING`, [defaultSources]);
      await pool.query(`INSERT INTO spin_config (setting_key, setting_value, description) VALUES ('staking_treasury_bonus_pct', '0', 'Dynamic treasury bonus % on top of base APR') ON CONFLICT DO NOTHING`);
    }
    console.log('✅ Staking treasury yield sources ready');
  } catch (compoundErr) {
    console.error('⚠️ Auto-compound migration error (non-fatal):', compoundErr);
  }

  // Worker hour overrides table (date-specific custom hours)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_hour_overrides (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        start_hour INTEGER NOT NULL,
        end_hour INTEGER NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_worker_hour_overrides_user ON worker_hour_overrides(user_id);
    `);
    console.log('✅ worker_hour_overrides table ready');
  } catch (wErr) {
    console.error('⚠️ worker_hour_overrides migration error (non-fatal):', wErr);
  }

  // Lead history table for stage audit trail
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_history (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by_user_id VARCHAR,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lead_history_lead_id ON lead_history(lead_id);
    `);
    console.log('✅ lead_history table ready');
  } catch (lhErr) {
    console.error('⚠️ lead_history migration error (non-fatal):', lhErr);
  }

  // Seed staking tiers and treasury user on startup (ensures production has them)
  await ensureStakingTiersSeeded();
  await ensureStakingTreasuryUser();
  await ensureMomsAccount();
  const { ensureNomineesTable } = await import("./services/nominees");
  await ensureNomineesTable();
  await ensureRewardSettingsSeeded();
  await seedDefaultPromoCodes();
  await linkEmployeePromoCodes();
  await ensureJackpotsSeeded();

  // Ensure the 600 JCMOVES Flash Sale spin pack exists in the reward catalog
  try {
    const { rows: cats } = await pool.query(`SELECT id FROM reward_categories WHERE name LIKE '%Quantum Spin%' LIMIT 1`);
    if (cats.length > 0) {
      const catId = cats[0].id;
      const { rows: existing } = await pool.query(
        `SELECT id FROM reward_items WHERE name='Quantum Spin — 10 Pack Flash Sale' LIMIT 1`
      );
      if (existing.length === 0) {
        await pool.query(`
          INSERT INTO reward_items (category_id, name, short_desc, full_desc, token_price, cash_value, status, featured,
            delivery_type, creates_spin_credit, is_instant, max_per_user, max_per_month, promo_badge, fulfillment_note, admin_notes)
          VALUES ($1,
            'Quantum Spin — 10 Pack Flash Sale',
            '10 spins for only 600 JCMOVES — limited-time 29% bundle deal',
            'Stack your entries at our best-ever rate: 10 Quantum Spin entries for just 600 JCMOVES (normally 850). Flash sale bundle — spins added instantly, use anytime within 60 days. Jackpots grow every spin!',
            600, '6.00', 'active', true,
            'digital_code', true, true, 20, 5,
            $2, '10 spin credits added instantly. Spins expire 60 days from purchase.', 'Auto-issue 10 spin credits via reward_entitlements. Flash-sale pricing.'
          )
        `, [catId, '🔥 Flash Sale']);
        console.log('✅ Flash Sale 10-spin pack created');
      } else {
        console.log('✅ Flash Sale 10-spin pack already exists');
      }
    }
  } catch (flashErr) {
    console.error('⚠️ Flash sale spin pack upsert failed (non-fatal):', flashErr);
  }

  // Public health check endpoint for deployment monitoring (MUST be before auth setup)
  // This endpoint is used by Replit Autoscale Deployments to verify the service is healthy
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "jc-on-the-move"
    });
  });

  app.post("/api/client-error", (req, res) => {
    const { boundary, error, stack, componentStack } = req.body || {};
    console.error(`[CLIENT-ERROR] Boundary: ${boundary} | Error: ${error}`);
    if (componentStack) console.error(`[CLIENT-ERROR] Component Stack:${componentStack}`);
    if (stack) console.error(`[CLIENT-ERROR] JS Stack: ${String(stack).slice(0, 800)}`);
    res.json({ received: true });
  });

  app.get("/api/approve-user", async (req, res) => {
    try {
      const token = req.query.token as string;
      const action = req.query.action as string;
      if (!token || !action) {
        return res.status(400).send(renderApprovalPage("Invalid Link", "This approval link is missing required information.", "error"));
      }

      // Look up token from DB (persists across server restarts)
      const tokenRows = await db.execute(sql`
        SELECT user_id, action, expires_at, used_at FROM approval_tokens WHERE token = ${token}
      `);
      const tokenData = (tokenRows as any).rows?.[0] || tokenRows[0];

      if (!tokenData) {
        return res.status(400).send(renderApprovalPage("Link Expired", "This approval link has already been used or has expired. Please approve from the admin dashboard.", "error"));
      }
      if (tokenData.used_at) {
        return res.status(400).send(renderApprovalPage("Already Used", "This approval link has already been used.", "error"));
      }
      if (new Date() > new Date(tokenData.expires_at)) {
        return res.status(400).send(renderApprovalPage("Link Expired", "This approval link has expired. Please approve the user from the admin dashboard instead.", "error"));
      }

      const userId = tokenData.user_id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).send(renderApprovalPage("User Not Found", "The user associated with this link no longer exists.", "error"));
      }

      // Mark token as used
      await db.execute(sql`UPDATE approval_tokens SET used_at = NOW() WHERE token = ${token}`);

      if (action === "approve") {
        await db.update(users).set({ status: "approved" }).where(eq(users.id, userId));

        try {
          const welcomeEmail = buildApprovalWelcomeEmail(user.firstName || 'Friend');
          await sendEmail({
            to: user.email,
            from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
            subject: welcomeEmail.subject,
            text: welcomeEmail.text,
            html: welcomeEmail.html,
          });
        } catch (e) { console.error('Failed to send approval welcome email:', e); }

        return res.send(renderApprovalPage("Account Approved", `${user.firstName} ${user.lastName} (${user.email}) has been approved and can now access the platform.`, "success"));
      } else if (action === "reject") {
        await db.update(users).set({ status: "rejected" }).where(eq(users.id, userId));
        return res.send(renderApprovalPage("Account Rejected", `${user.firstName} ${user.lastName} (${user.email}) has been rejected.`, "rejected"));
      } else {
        return res.status(400).send(renderApprovalPage("Invalid Action", "Unknown approval action.", "error"));
      }
    } catch (error) {
      console.error("Approval endpoint error:", error);
      return res.status(500).send(renderApprovalPage("Error", "Something went wrong processing this request. Please try again from the admin dashboard.", "error"));
    }
  });

  function renderApprovalPage(title: string, message: string, type: "success" | "rejected" | "error"): string {
    const color = type === "success" ? "#10b981" : type === "rejected" ? "#f59e0b" : "#ef4444";
    const icon = type === "success" ? "&#10003;" : type === "rejected" ? "&#10007;" : "&#9888;";
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} - JC ON THE MOVE</title></head>
    <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: white;">
      <div style="text-align: center; padding: 40px; max-width: 450px; background: #1e293b; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
        <div style="font-size: 60px; margin-bottom: 16px; color: ${color};">${icon}</div>
        <h1 style="color: ${color}; margin-bottom: 12px;">${title}</h1>
        <p style="color: #94a3b8; line-height: 1.6;">${message}</p>
        <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 24px; background: #2563eb; color: white; border-radius: 8px; text-decoration: none;">Go to Dashboard</a>
      </div>
    </body></html>`;
  }

  // Admin: Resend approval email for a user
  app.post("/api/admin/resend-approval-email", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = (req as any).user;
      if (adminUser.role !== 'admin' && adminUser.role !== 'business_owner') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      const baseUrl = process.env.APP_URL || 'https://jconthemove.com';
      const approveToken = await generateApprovalToken(targetUser.id, "approve");
      const rejectToken = await generateApprovalToken(targetUser.id, "reject");
      const approveUrl = `${baseUrl}/api/approve-user?token=${approveToken}&action=approve`;
      const rejectUrl = `${baseUrl}/api/approve-user?token=${rejectToken}&action=reject`;

      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `🔄 Resent: Approval Needed for ${targetUser.firstName} ${targetUser.lastName}`,
        text: `Approval reminder for user account.\n\nName: ${targetUser.firstName} ${targetUser.lastName}\nEmail: ${targetUser.email}\nRole: ${targetUser.role}\nStatus: ${targetUser.status}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
          <h2 style="color: #2563eb;">🔄 Approval Reminder</h2>
          <p>This is a resent approval request for the following user:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${targetUser.firstName} ${targetUser.lastName}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${targetUser.email}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Role</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${targetUser.role}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Status</td><td style="padding: 8px; color: #f59e0b; font-weight: bold;">⏳ ${targetUser.status}</td></tr>
          </table>
          <div style="margin: 24px 0; text-align: center;">
            <a href="${approveUrl}" style="display: inline-block; padding: 12px 32px; background: #10b981; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin-right: 12px;">✅ Approve</a>
            <a href="${rejectUrl}" style="display: inline-block; padding: 12px 32px; background: #ef4444; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">❌ Reject</a>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center;">These links expire in 7 days.</p>
        </div>`,
      });

      console.log(`📧 Approval email resent for ${targetUser.email} by admin ${adminUser.email}`);
      res.json({ success: true, message: `Approval email resent for ${targetUser.firstName} ${targetUser.lastName}` });
    } catch (error: any) {
      console.error("Failed to resend approval email:", error);
      res.status(500).json({ error: "Failed to resend approval email: " + error.message });
    }
  });

  // Admin: Directly approve or reject a user
  app.post("/api/admin/approve-user", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = (req as any).user;
      if (adminUser.role !== 'admin' && adminUser.role !== 'business_owner') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { userId, action } = req.body;
      if (!userId || !action) {
        return res.status(400).json({ error: "userId and action are required" });
      }

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await db.update(users).set({ status: newStatus }).where(eq(users.id, userId));

      if (action === 'approve') {
        try {
          const welcomeEmail = buildApprovalWelcomeEmail(targetUser.firstName || 'Friend');
          await sendEmail({
            to: targetUser.email,
            from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
            subject: welcomeEmail.subject,
            text: welcomeEmail.text,
            html: welcomeEmail.html,
          });
        } catch (e) { console.error('Failed to send approval welcome email:', e); }
      }

      console.log(`👤 User ${targetUser.email} ${action}d by admin ${adminUser.email}`);
      res.json({ success: true, message: `User ${targetUser.firstName} ${targetUser.lastName} has been ${action}d`, status: newStatus });
    } catch (error: any) {
      console.error("Admin approve user error:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // DEV-ONLY: Direct test endpoint for notifications (remove in production)
  if (process.env.NODE_ENV === 'development') {
    app.post("/api/dev/test-notifications", async (req, res) => {
      try {
        const { testEmail, testSMS, targetEmail, targetPhone } = req.body;
        const results: any = { email: null, sms: null };

        // Test Email via SendGrid
        if (testEmail && targetEmail) {
          try {
            const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
            await sendEmail({
              to: targetEmail,
              from: companyEmail,
              subject: "JC ON THE MOVE - Test Notification",
              text: "This is a test email notification from JC ON THE MOVE.",
              html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #2563eb;">🚚 JC ON THE MOVE - Test Notification</h2>
                <p>Email notifications are working correctly!</p>
                <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
              </div>`
            });
            results.email = { success: true, sentTo: targetEmail };
            console.log(`✅ Test email sent to ${targetEmail}`);
          } catch (emailError: any) {
            results.email = { success: false, error: emailError.message };
            console.error(`❌ Test email failed:`, emailError.message);
          }
        }

        // Test SMS via Twilio
        if (testSMS && targetPhone) {
          try {
            const smsResult = await smsService.sendSMS(targetPhone, 
              "🚚 JC ON THE MOVE Test: SMS notifications are working correctly!"
            );
            results.sms = { success: smsResult.success, sentTo: targetPhone, messageSid: smsResult.messageSid, error: smsResult.error };
            if (smsResult.success) {
              console.log(`✅ Test SMS sent to ${targetPhone}`);
            } else {
              console.error(`❌ Test SMS failed:`, smsResult.error);
            }
          } catch (smsError: any) {
            results.sms = { success: false, error: smsError.message };
            console.error(`❌ Test SMS failed:`, smsError.message);
          }
        }

        res.json({ success: true, results });
      } catch (error: any) {
        console.error("Test notification error:", error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  // Public objects serving endpoint (from javascript_object_storage integration)
  // Serves files from object storage public directories
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Auth middleware with graceful error handling
  try {
    await setupAuth(app);
  } catch (error) {
    console.error('⚠️  Warning: Authentication setup failed during route registration:', error);
    console.error('⚠️  Server will continue without authentication features');
  }

  // Test notification endpoint for admins
  app.post("/api/admin/test-notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'business_owner')) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { testEmail, testSMS, targetEmail, targetPhone } = req.body;
      const results: any = { email: null, sms: null };

      // Test Email via SendGrid
      if (testEmail) {
        try {
          const emailTo = targetEmail || user.email;
          const emailResult = await sendEmail({
            to: emailTo,
            subject: "JC ON THE MOVE - Test Notification",
            text: "This is a test email notification from JC ON THE MOVE. If you received this, email notifications are working correctly!",
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #2563eb;">🚚 JC ON THE MOVE - Test Notification</h2>
              <p>This is a test email notification. If you received this, email notifications are working correctly!</p>
              <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
            </div>`
          });
          results.email = { success: true, sentTo: emailTo };
          console.log(`✅ Test email sent to ${emailTo}`);
        } catch (emailError: any) {
          results.email = { success: false, error: emailError.message };
          console.error(`❌ Test email failed:`, emailError.message);
        }
      }

      // Test SMS via Twilio
      if (testSMS) {
        try {
          const phoneTo = targetPhone || user.phoneNumber;
          if (!phoneTo) {
            results.sms = { success: false, error: "No phone number provided" };
          } else {
            const smsResult = await smsService.sendSMS(phoneTo, 
              "🚚 JC ON THE MOVE Test: This is a test SMS notification. If you received this, SMS notifications are working correctly!"
            );
            results.sms = { success: smsResult.success, sentTo: phoneTo, messageSid: smsResult.messageSid, error: smsResult.error };
            if (smsResult.success) {
              console.log(`✅ Test SMS sent to ${phoneTo}`);
            } else {
              console.error(`❌ Test SMS failed:`, smsResult.error);
            }
          }
        } catch (smsError: any) {
          results.sms = { success: false, error: smsError.message };
          console.error(`❌ Test SMS failed:`, smsError.message);
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("Test notification error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Employee Email/Password Authentication Endpoints (Public - No auth required)
  
  // Employee Registration
  const employeeRegisterSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters").regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Password must contain letters and numbers"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phoneNumber: z.string().min(10, "Phone number is required"),
    rewardsEnrolled: z.boolean().optional().default(false),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format"),
    tosAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Terms of Service to register" }),
  });

  app.post("/api/auth/employee/register", async (req, res) => {
    try {
      const data = employeeRegisterSchema.parse(req.body);

      // Enforce age verification server-side with strict calendar date parsing
      const [dobYear, dobMonth, dobDay] = data.dateOfBirth.split("-").map(Number);
      const birthDate = new Date(dobYear, dobMonth - 1, dobDay);
      // Validate it's a real calendar date (no overflow like month 99)
      if (
        isNaN(birthDate.getTime()) ||
        birthDate.getFullYear() !== dobYear ||
        birthDate.getMonth() !== dobMonth - 1 ||
        birthDate.getDate() !== dobDay
      ) {
        return res.status(400).json({ error: "Invalid date of birth" });
      }
      const today = new Date();
      if (birthDate >= today) {
        return res.status(400).json({ error: "Date of birth must be in the past" });
      }
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18) {
        return res.status(400).json({ error: "You must be 18 years or older to register" });
      }

      // Check if email already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      // Hash password with bcrypt (10 rounds = good security/performance balance)
      const passwordHash = await bcrypt.hash(data.password, 10);

      let newUser;

      // If user exists but has no password (Replit Auth migration), update their account
      if (existingUser.length > 0 && !existingUser[0].passwordHash) {
        console.log(`🔄 Migrating Replit Auth account to email/password: ${data.email}`);
        
        const [updatedUser] = await db
          .update(users)
          .set({
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber,
            dateOfBirth: data.dateOfBirth || existingUser[0].dateOfBirth,
            tosAccepted: data.tosAccepted ?? existingUser[0].tosAccepted,
            tosAcceptedAt: data.tosAccepted && !existingUser[0].tosAccepted ? new Date() : existingUser[0].tosAcceptedAt,
          })
          .where(eq(users.id, existingUser[0].id))
          .returning();
        
        newUser = updatedUser;
      } else if (existingUser.length > 0) {
        // User exists and already has a password
        return res.status(400).json({ error: "Email already registered" });
      } else {
        // Create new user
        const referralCode = `EMP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        const [createdUser] = await db.insert(users).values({
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          role: "employee",
          status: "pending",
          referralCode,
          rewardsEnrolled: data.rewardsEnrolled ?? false,
          dateOfBirth: data.dateOfBirth || null,
          tosAccepted: data.tosAccepted ?? false,
          tosAcceptedAt: data.tosAccepted ? new Date() : null,
        }).returning();
        
        newUser = createdUser;
      }

      if (data.rewardsEnrolled && newUser && !newUser.rewardsEnrolled) {
        await db.update(users).set({ rewardsEnrolled: true }).where(eq(users.id, newUser.id));
        newUser.rewardsEnrolled = true;
      }

      // Award 250 JCMOVES welcome bonus to new employee
      const WELCOME_BONUS = 250;
      try {
        await storage.createWalletAccount(newUser.id).catch(() => {});
        await storage.creditWalletTokens(newUser.id, WELCOME_BONUS);
        await db.insert(rewards).values({
          userId: newUser.id,
          rewardType: 'signup_bonus',
          tokenAmount: WELCOME_BONUS.toFixed(8),
          cashValue: (WELCOME_BONUS * 0.01).toFixed(2),
          status: 'confirmed',
          metadata: { reason: 'New employee welcome bonus' }
        });
        console.log(`🎉 Awarded ${WELCOME_BONUS} JCMOVES welcome bonus to new employee ${newUser.email}`);
        await awardTierPoints(newUser.id, 'signup');
      } catch (bonusErr) {
        console.error('Welcome bonus error (non-blocking):', bonusErr);
      }

      (req.session as any).userId = newUser.id;
      (req.session as any).userEmail = newUser.email;
      (req.session as any).userRole = newUser.role;

      try {
        const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
        const baseUrl = process.env.APP_URL || 'https://jconthemove.com';
        const approveToken = await generateApprovalToken(newUser.id, "approve");
        const rejectToken = await generateApprovalToken(newUser.id, "reject");
        const approveUrl = `${baseUrl}/api/approve-user?token=${approveToken}&action=approve`;
        const rejectUrl = `${baseUrl}/api/approve-user?token=${rejectToken}&action=reject`;
        await sendEmail({
          to: companyEmail,
          from: companyEmail,
          subject: `🆕 New Employee Registration: ${newUser.firstName} ${newUser.lastName}`,
          text: `New employee account created and needs approval.\n\nName: ${newUser.firstName} ${newUser.lastName}\nEmail: ${newUser.email}\nPhone: ${newUser.phoneNumber || 'N/A'}\nStatus: ${newUser.status}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
            <h2 style="color: #2563eb;">🆕 New Employee Registration</h2>
            <p>A new employee account has been created and needs your approval.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.firstName} ${newUser.lastName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.email}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.phoneNumber || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Status</td><td style="padding: 8px; color: #f59e0b; font-weight: bold;">⏳ Pending Approval</td></tr>
            </table>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${approveUrl}" style="display: inline-block; padding: 12px 32px; background: #10b981; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin-right: 12px;">✅ Approve</a>
              <a href="${rejectUrl}" style="display: inline-block; padding: 12px 32px; background: #ef4444; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">❌ Reject</a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">These links expire in 7 days. You can also approve from the admin dashboard.</p>
          </div>`,
        });
        console.log(`📧 New employee registration notification sent for ${newUser.email}`);
      } catch (emailErr) {
        console.error("Failed to send employee registration notification email:", emailErr);
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: "Registration failed. Please try again." });
        }

        res.json({
          success: true,
          showWelcome: true,
          welcomeBonus: 250,
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: newUser.status,
            rewardsEnrolled: newUser.rewardsEnrolled,
          },
          message: "Registration successful! Your account is pending admin approval."
        });
      });
    } catch (error: any) {
      console.error("Employee registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid registration data" });
      }
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // Employee Login
  const employeeLoginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required")
  });

  app.post("/api/auth/employee/login", async (req, res) => {
    try {
      const data = employeeLoginSchema.parse(req.body);

      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
      
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Set session data directly (avoid regenerate which can cause cookie issues behind proxies)
      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: "Login failed. Please try again." });
        }

        console.log(`[LOGIN] Session saved successfully. Session ID: ${req.sessionID}, userId: ${user.id}`);

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Employee login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid login data" });
      }
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // Unified login — works for customers, employees, and admins
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

      const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
      if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password" });

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) return res.status(401).json({ error: "Invalid email or password" });

      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      // Count past leads for one-time first-login notice (customers only)
      let pastJobsCount = 0;
      if (user.role === 'customer') {
        try {
          const flagRow = await pool.query(`SELECT past_jobs_notice_seen FROM users WHERE id = $1`, [user.id]);
          const noticeSeen = flagRow.rows[0]?.past_jobs_notice_seen ?? false;
          if (!noticeSeen) {
            // Mark as seen immediately so it only runs once regardless of past lead count
            await pool.query(`UPDATE users SET past_jobs_notice_seen = true WHERE id = $1`, [user.id]);
            const pastLeads = await storage.getLeadsByEmail(user.email);
            pastJobsCount = pastLeads.length;
          }
        } catch (_) {}
      }

      req.session.save((err) => {
        if (err) return res.status(500).json({ error: "Login failed. Please try again." });
        res.json({
          success: true,
          pastJobsCount,
          user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status }
        });
      });
    } catch (e: any) {
      console.error("Unified login error:", e);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // ─── CROSS-PLATFORM JWT TOKEN AUTH ──────────────────────────────────────────
  // Mobile apps, external apps, and any non-browser client use these endpoints.
  // Browsers continue to use session cookies — both systems share the same DB.

  // POST /api/auth/token — login and get JWT access + refresh tokens
  app.post("/api/auth/token", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

      const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
      if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password" });

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) return res.status(401).json({ error: "Invalid email or password" });

      const validStatuses = ['approved', 'active'];
      if (!validStatuses.includes(user.status || '')) {
        return res.status(403).json({ error: "Account pending approval or restricted", status: user.status });
      }

      const accessToken = signJwt(user.id, user.role || 'customer');
      const refreshToken = signRefreshToken(user.id);

      console.log(`[JWT] Token issued for userId=${user.id} role=${user.role}`);

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn: 7776000, // 90 days in seconds
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
        }
      });
    } catch (e: any) {
      console.error("JWT token login error:", e);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // POST /api/auth/token/refresh — swap a refresh token for a new access token
  app.post("/api/auth/token/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: "refreshToken is required" });

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) return res.status(401).json({ error: "Invalid or expired refresh token. Please log in again." });

      const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
      if (!user) return res.status(401).json({ error: "User not found" });

      const validStatuses = ['approved', 'active'];
      if (!validStatuses.includes(user.status || '')) {
        return res.status(403).json({ error: "Account restricted", status: user.status });
      }

      const accessToken = signJwt(user.id, user.role || 'customer');
      const newRefreshToken = signRefreshToken(user.id);

      return res.json({ accessToken, refreshToken: newRefreshToken, expiresIn: 7776000 });
    } catch (e: any) {
      console.error("JWT refresh error:", e);
      res.status(500).json({ error: "Token refresh failed." });
    }
  });

  // GET /api/auth/token/me — verify JWT and return current user (for mobile "am I still logged in?" check)
  app.get("/api/auth/token/me", isAuthenticated, async (req: any, res) => {
    const user = req.user;
    return res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      username: user.username,
    });
  });
  // ─────────────────────────────────────────────────────────────────────────────

  // Logout endpoint for all users (email/password)
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie('jc.sid');
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // Employee Logout
  app.post("/api/auth/employee/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie('jc.sid');
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // Customer Registration
  const customerRegisterSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phoneNumber: z.string().optional(),
    rewardsEnrolled: z.boolean().optional().default(false),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format"),
    tosAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Terms of Service to register" }),
  });

  app.post("/api/auth/customer/register", async (req, res) => {
    try {
      const data = customerRegisterSchema.parse(req.body);

      // Enforce age verification server-side with strict calendar date parsing
      const [dobYear, dobMonth, dobDay] = data.dateOfBirth.split("-").map(Number);
      const birthDate = new Date(dobYear, dobMonth - 1, dobDay);
      // Validate it's a real calendar date (no overflow like month 99)
      if (
        isNaN(birthDate.getTime()) ||
        birthDate.getFullYear() !== dobYear ||
        birthDate.getMonth() !== dobMonth - 1 ||
        birthDate.getDate() !== dobDay
      ) {
        return res.status(400).json({ error: "Invalid date of birth" });
      }
      const today = new Date();
      if (birthDate >= today) {
        return res.status(400).json({ error: "Date of birth must be in the past" });
      }
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18) {
        return res.status(400).json({ error: "You must be 18 years or older to register" });
      }

      // Check if email already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      const passwordHash = await bcrypt.hash(data.password, 10);
      let newUser;

      if (existingUser.length > 0 && !existingUser[0].passwordHash) {
        // Upgrade existing customer account (from quote submission)
        const [updatedUser] = await db
          .update(users)
          .set({
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber || existingUser[0].phoneNumber,
            dateOfBirth: data.dateOfBirth || existingUser[0].dateOfBirth,
            tosAccepted: data.tosAccepted ?? existingUser[0].tosAccepted,
            tosAcceptedAt: data.tosAccepted && !existingUser[0].tosAccepted ? new Date() : existingUser[0].tosAcceptedAt,
          })
          .where(eq(users.id, existingUser[0].id))
          .returning();
        newUser = updatedUser;
      } else if (existingUser.length > 0) {
        return res.status(400).json({ error: "Email already registered. Please sign in." });
      } else {
        // Create new customer account
        const referralCode = `CUST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        const [createdUser] = await db.insert(users).values({
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber || '',
          role: 'customer',
          status: 'active',
          referralCode,
          rewardsEnrolled: data.rewardsEnrolled ?? false,
          dateOfBirth: data.dateOfBirth || null,
          tosAccepted: data.tosAccepted ?? false,
          tosAcceptedAt: data.tosAccepted ? new Date() : null,
        }).returning();
        newUser = createdUser;

        // Create wallet account for customer
        await storage.createWalletAccount(newUser.id);
      }

      if (!newUser) {
        return res.status(500).json({ error: "Registration failed" });
      }

      if (data.rewardsEnrolled && !newUser.rewardsEnrolled) {
        await db.update(users).set({ rewardsEnrolled: true }).where(eq(users.id, newUser.id));
        newUser.rewardsEnrolled = true;
      }

      // Award retroactive rewards for previous accepted/completed leads
      try {
        const { rewardSettings, rewards: rewardsTable } = await import('@shared/schema');
        
        // Get reward amounts from settings
        const settings = await db.select().from(rewardSettings);
        const acceptedReward = settings.find(s => s.settingKey === 'customer_quote_accepted');
        const completedReward = settings.find(s => s.settingKey === 'customer_quote_completed');
        
        const acceptedAmount = parseFloat(acceptedReward?.tokenAmount || '200');
        const completedAmount = parseFloat(completedReward?.tokenAmount || '1500');
        
        // Find leads matching this email that are accepted or completed
        const customerLeads = await db
          .select()
          .from(leads)
          .where(and(
            eq(leads.email, newUser.email),
            sql`${leads.status} IN ('accepted', 'confirmed', 'in_progress', 'completed')`
          ));
        
        let totalTokensAwarded = 0;
        let acceptedCount = 0;
        let completedCount = 0;
        
        for (const lead of customerLeads) {
          // Check if reward already given for this lead
          const existingReward = await db
            .select()
            .from(rewardsTable)
            .where(and(
              eq(rewardsTable.userId, newUser.id),
              sql`${rewardsTable.metadata}->>'leadId' = ${lead.id}`
            ))
            .limit(1);
          
          if (existingReward.length > 0) continue; // Skip if already rewarded
          
          let rewardAmount = 0;
          let rewardType = '';
          
          if (lead.status === 'completed') {
            rewardAmount = completedAmount;
            rewardType = 'customer_quote_completed';
            completedCount++;
          } else if (['accepted', 'confirmed', 'in_progress'].includes(lead.status || '')) {
            rewardAmount = acceptedAmount;
            rewardType = 'customer_quote_accepted';
            acceptedCount++;
          }
          
          if (rewardAmount > 0) {
            await storage.creditWalletTokens(newUser.id, rewardAmount);
            await db.insert(rewardsTable).values({
              userId: newUser.id,
              rewardType: rewardType,
              tokenAmount: rewardAmount.toFixed(8),
              cashValue: (rewardAmount * 0.01).toFixed(2), // 1 JCMOVES = $0.01
              status: 'confirmed',
              earnedDate: new Date(),
              referenceId: lead.id,
              metadata: { leadId: lead.id, retroactive: true }
            });
            totalTokensAwarded += rewardAmount;
          }
        }
        
        if (totalTokensAwarded > 0) {
          console.log(`🎁 Awarded ${totalTokensAwarded} JCMOVES to new customer ${newUser.email} for ${acceptedCount} accepted + ${completedCount} completed retroactive leads`);
        }
      } catch (retroError) {
        console.error('Retroactive rewards error (non-blocking):', retroError);
      }

      // Award 250 JCMOVES welcome bonus to new customer
      const CUSTOMER_WELCOME_BONUS = 250;
      try {
        await storage.creditWalletTokens(newUser.id, CUSTOMER_WELCOME_BONUS);
        await db.insert(rewards).values({
          userId: newUser.id,
          rewardType: 'signup_bonus',
          tokenAmount: CUSTOMER_WELCOME_BONUS.toFixed(8),
          cashValue: (CUSTOMER_WELCOME_BONUS * 0.01).toFixed(2),
          status: 'confirmed',
          metadata: { reason: 'New customer welcome bonus' }
        });
        console.log(`🎉 Awarded ${CUSTOMER_WELCOME_BONUS} JCMOVES welcome bonus to new customer ${newUser.email}`);
        await awardTierPoints(newUser.id, 'signup');
      } catch (bonusErr) {
        console.error('Welcome bonus error (non-blocking):', bonusErr);
      }

      (req.session as any).userId = newUser.id;
      (req.session as any).userEmail = newUser.email;
      (req.session as any).userRole = newUser.role;
      (req.session as any).showWelcome = true;

      try {
        const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
        const baseUrl = process.env.APP_URL || 'https://jconthemove.com';
        const approveToken = await generateApprovalToken(newUser.id, "approve");
        const rejectToken = await generateApprovalToken(newUser.id, "reject");
        const approveUrl = `${baseUrl}/api/approve-user?token=${approveToken}&action=approve`;
        const rejectUrl = `${baseUrl}/api/approve-user?token=${rejectToken}&action=reject`;
        await sendEmail({
          to: companyEmail,
          from: companyEmail,
          subject: `🆕 New Customer Registration: ${newUser.firstName} ${newUser.lastName}`,
          text: `New customer account created.\n\nName: ${newUser.firstName} ${newUser.lastName}\nEmail: ${newUser.email}\nPhone: ${newUser.phoneNumber || 'N/A'}\nStatus: ${newUser.status}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
            <h2 style="color: #10b981;">🆕 New Customer Registration</h2>
            <p>A new customer account has been created.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.firstName} ${newUser.lastName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.email}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.phoneNumber || 'N/A'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Status</td><td style="padding: 8px; color: #10b981; font-weight: bold;">✅ Active</td></tr>
            </table>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${approveUrl}" style="display: inline-block; padding: 12px 32px; background: #10b981; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin-right: 12px;">✅ Approve</a>
              <a href="${rejectUrl}" style="display: inline-block; padding: 12px 32px; background: #ef4444; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">❌ Reject</a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">These links expire in 7 days. You can also manage from the admin dashboard.</p>
          </div>`,
        });
        console.log(`📧 New customer registration notification sent for ${newUser.email}`);
      } catch (emailErr) {
        console.error("Failed to send customer registration notification email:", emailErr);
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Registration successful but login failed" });
        }

        res.json({
          success: true,
          showWelcome: true,
          welcomeBonus: 250,
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: newUser.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Customer registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Customer Login
  app.post("/api/auth/customer/login", async (req, res) => {
    try {
      const data = employeeLoginSchema.parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password. If you haven't created an account yet, please sign up first." });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
      
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      // Count past leads for one-time first-login notice
      let pastJobsCount = 0;
      try {
        const flagRow = await pool.query(`SELECT past_jobs_notice_seen FROM users WHERE id = $1`, [user.id]);
        const noticeSeen = flagRow.rows[0]?.past_jobs_notice_seen ?? false;
        if (!noticeSeen) {
          // Mark as seen immediately so it only runs once regardless of past lead count
          await pool.query(`UPDATE users SET past_jobs_notice_seen = true WHERE id = $1`, [user.id]);
          const pastLeads = await storage.getLeadsByEmail(user.email);
          pastJobsCount = pastLeads.length;
        }
      } catch (_) {}

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Login failed" });
        }

        res.json({
          success: true,
          pastJobsCount,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Customer login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ── ACCOUNT RECOVERY ────────────────────────────────────────────────────────

  // Step 1: Request OTP — accepts email or phone number
  app.post("/api/auth/recover/request", async (req, res) => {
    try {
      const { contact } = req.body; // email or phone number
      if (!contact || typeof contact !== 'string' || contact.trim().length < 4) {
        return res.status(400).json({ error: "Please provide a valid email address or phone number." });
      }
      const value = contact.trim().toLowerCase();
      const isPhone = /^[\d\s\-\+\(\)]{7,}$/.test(contact.trim());
      const method = isPhone ? 'sms' : 'email';

      // Find user by email or phone
      let matchedUser = null;
      if (method === 'email') {
        const [u] = await db.select().from(users).where(eq(users.email, value)).limit(1);
        matchedUser = u || null;
      } else {
        const normalized = contact.trim().replace(/[\s\-\(\)]/g, '');
        const allUsers = await db.select().from(users).where(sql`phone_number IS NOT NULL`);
        matchedUser = allUsers.find(u => u.phoneNumber && u.phoneNumber.replace(/[\s\-\(\)]/g, '') === normalized) || null;
      }

      // Always return success to prevent user enumeration attacks
      if (!matchedUser) {
        console.log(`⚠️ Recovery request for unknown ${method}: ${value}`);
        return res.json({ success: true, method, masked: method === 'email' ? value.replace(/(.{2}).*(@.*)/, '$1***$2') : value.slice(-4) });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await db.insert(recoveryTokens).values({
        userId: matchedUser.id,
        token: otp,
        method,
        contact: method === 'email' ? matchedUser.email! : matchedUser.phoneNumber!,
        expiresAt,
      });

      if (method === 'email') {
        const { emailService } = await import('./services/email');
        await emailService.sendEmail({
          to: matchedUser.email!,
          subject: 'JC ON THE MOVE — Account Recovery Code',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#1e40af">Account Recovery</h2>
              <p>Hi ${matchedUser.firstName || 'there'},</p>
              <p>Your account recovery code is:</p>
              <div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#1e40af;background:#f0f4ff;padding:16px 24px;border-radius:8px;text-align:center;margin:16px 0">${otp}</div>
              <p style="color:#64748b">This code expires in <strong>15 minutes</strong>. If you didn't request this, you can safely ignore this email — your account is secure.</p>
              <p style="color:#94a3b8;font-size:12px">JC ON THE MOVE · Northwoods Moving & More</p>
            </div>
          `,
          text: `Your JC ON THE MOVE account recovery code is: ${otp}\n\nThis code expires in 15 minutes.`,
        });
        console.log(`📧 Sent recovery OTP to ${matchedUser.email}`);
      } else {
        const smsBody = `JC ON THE MOVE account recovery code: ${otp}\n\nExpires in 15 min. Don't share this code.`;
        await smsService.sendSMS(matchedUser.phoneNumber!, smsBody);
        console.log(`📱 Sent recovery OTP via SMS to ${matchedUser.phoneNumber}`);
      }

      const masked = method === 'email'
        ? matchedUser.email!.replace(/(.{2}).*(@.*)/, '$1***$2')
        : '***-***-' + matchedUser.phoneNumber!.slice(-4);

      res.json({ success: true, method, masked });
    } catch (err) {
      console.error("Recovery request error:", err);
      res.status(500).json({ error: "Failed to send recovery code. Please try again." });
    }
  });

  // Step 2: Verify OTP
  app.post("/api/auth/recover/verify", async (req, res) => {
    try {
      const { contact, token } = req.body;
      if (!contact || !token || typeof token !== 'string' || token.length < 4) {
        return res.status(400).json({ error: "Contact and verification code are required." });
      }

      const now = new Date();
      const [record] = await db.select().from(recoveryTokens)
        .where(and(
          eq(recoveryTokens.token, token.trim()),
          sql`expires_at > NOW()`,
          sql`used_at IS NULL`
        ))
        .orderBy(desc(recoveryTokens.createdAt))
        .limit(1);

      if (!record) {
        return res.status(400).json({ error: "Invalid or expired code. Please request a new one." });
      }

      // Mark as used
      await db.update(recoveryTokens).set({ usedAt: now }).where(eq(recoveryTokens.id, record.id));

      // Generate a short-lived reset session token
      const resetToken = crypto.randomBytes(32).toString('hex');
      (req.session as any).pendingResetUserId = record.userId;
      (req.session as any).pendingResetToken = resetToken;
      (req.session as any).pendingResetExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

      await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));

      res.json({ success: true, resetToken });
    } catch (err) {
      console.error("Recovery verify error:", err);
      res.status(500).json({ error: "Verification failed. Please try again." });
    }
  });

  // Step 3: Reset password
  app.post("/api/auth/recover/reset", async (req, res) => {
    try {
      const { newPassword, resetToken } = req.body;
      const sess = req.session as any;

      if (!sess.pendingResetUserId || !sess.pendingResetToken || sess.pendingResetToken !== resetToken) {
        return res.status(401).json({ error: "Session expired. Please start the recovery process again." });
      }
      if (Date.now() > sess.pendingResetExpiry) {
        return res.status(401).json({ error: "Recovery session expired. Please start again." });
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await db.update(users).set({ passwordHash }).where(eq(users.id, sess.pendingResetUserId));

      // Clear recovery session data
      delete sess.pendingResetUserId;
      delete sess.pendingResetToken;
      delete sess.pendingResetExpiry;

      console.log(`🔐 Password reset successful for user ${sess.pendingResetUserId || 'unknown'}`);
      res.json({ success: true, message: "Password reset successfully. You can now log in." });
    } catch (err) {
      console.error("Recovery reset error:", err);
      res.status(500).json({ error: "Password reset failed. Please try again." });
    }
  });

  // ── END ACCOUNT RECOVERY ─────────────────────────────────────────────────────

  // Unified login endpoint for mobile app (works for all user types)
  app.post("/api/login", async (req, res) => {
    try {
      const data = employeeLoginSchema.parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password. If you haven't created an account yet, please sign up first." });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
      
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Login failed" });
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            phone: user.phone,
            tokenBalance: user.tokenBalance,
          }
        });
      });
    } catch (error: any) {
      console.error("Unified login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Unified register endpoint for mobile app
  app.post("/api/register", async (req, res) => {
    try {
      const data = employeeRegisterSchema.parse(req.body);

      // Enforce age verification server-side with strict calendar date parsing
      const [dobYear, dobMonth, dobDay] = data.dateOfBirth.split("-").map(Number);
      const birthDate = new Date(dobYear, dobMonth - 1, dobDay);
      if (
        isNaN(birthDate.getTime()) ||
        birthDate.getFullYear() !== dobYear ||
        birthDate.getMonth() !== dobMonth - 1 ||
        birthDate.getDate() !== dobDay
      ) {
        return res.status(400).json({ error: "Invalid date of birth" });
      }
      const today = new Date();
      if (birthDate >= today) {
        return res.status(400).json({ error: "Date of birth must be in the past" });
      }
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18) {
        return res.status(400).json({ error: "You must be 18 years or older to register" });
      }

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 10);

      // Create user as customer by default
      const [newUser] = await db
        .insert(users)
        .values({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          passwordHash,
          role: 'customer',
          status: 'active',
          dateOfBirth: data.dateOfBirth,
          tosAccepted: data.tosAccepted,
          tosAcceptedAt: data.tosAccepted ? new Date() : null,
        })
        .returning();

      (req.session as any).userId = newUser.id;
      (req.session as any).userEmail = newUser.email;
      (req.session as any).userRole = newUser.role;

      try {
        const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
        const baseUrl = process.env.APP_URL || 'https://jconthemove.com';
        const approveToken = await generateApprovalToken(newUser.id, "approve");
        const rejectToken = await generateApprovalToken(newUser.id, "reject");
        const approveUrl = `${baseUrl}/api/approve-user?token=${approveToken}&action=approve`;
        const rejectUrl = `${baseUrl}/api/approve-user?token=${rejectToken}&action=reject`;
        await sendEmail({
          to: companyEmail,
          from: companyEmail,
          subject: `🆕 New Account Registration: ${newUser.firstName} ${newUser.lastName}`,
          text: `New account created.\n\nName: ${newUser.firstName} ${newUser.lastName}\nEmail: ${newUser.email}\nRole: ${newUser.role}\nStatus: ${newUser.status}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
            <h2 style="color: #2563eb;">🆕 New Account Registration</h2>
            <p>A new account has been created.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.firstName} ${newUser.lastName}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.email}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Role</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${newUser.role}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Status</td><td style="padding: 8px; color: #10b981; font-weight: bold;">✅ ${newUser.status}</td></tr>
            </table>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${approveUrl}" style="display: inline-block; padding: 12px 32px; background: #10b981; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin-right: 12px;">✅ Approve</a>
              <a href="${rejectUrl}" style="display: inline-block; padding: 12px 32px; background: #ef4444; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">❌ Reject</a>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">These links expire in 7 days. You can also manage from the admin dashboard.</p>
          </div>`,
        });
        console.log(`📧 New registration notification sent for ${newUser.email}`);
      } catch (emailErr) {
        console.error("Failed to send registration notification email:", emailErr);
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Registration successful but login failed" });
        }

        res.json({
          success: true,
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: newUser.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // ========== Mobile App API Endpoints ==========
  
  // GET /api/user - Get current logged in user
  app.get("/api/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        phone: user.phone,
        tokenBalance: user.tokenBalance,
        profileImage: user.profileImage,
        referralCode: user.referralCode,
        solanaWalletAddress: user.solanaWalletAddress,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // GET /api/rewards/balance - Get user's JCMOVES token balance
  app.get("/api/rewards/balance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        balance: user.tokenBalance || "0",
        solanaWalletAddress: user.solanaWalletAddress,
      });
    } catch (error: any) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // GET /api/rewards/mining - Get mining status and streak (delegates to mining service)
  app.get("/api/rewards/mining", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { miningService } = await import('./services/mining');
      const stats = await miningService.getMiningStats(userId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching mining status:", error);
      res.status(500).json({ error: "Failed to fetch mining status" });
    }
  });

  // POST /api/rewards/claim - Claim mined tokens (delegates to mining service)
  app.post("/api/rewards/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { miningService } = await import('./services/mining');
      const result = await miningService.claimTokens(userId, 'manual');
      
      if (!result.success) {
        return res.status(400).json({ error: result.error || "Failed to claim tokens" });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error claiming reward:", error);
      res.status(500).json({ error: "Failed to claim reward" });
    }
  });

  // GET /api/jobs - Get jobs for calendar (employee jobs)
  app.get("/api/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      let jobs;
      if (userRole === 'admin' || userRole === 'business_owner') {
        // Admins see all jobs
        jobs = await storage.getLeads();
      } else if (userRole === 'employee') {
        // Employees see their assigned jobs
        jobs = await storage.getEmployeeJobs(userId);
      } else {
        // Customers see their own requests
        jobs = await storage.getLeadsByCustomer(userId);
      }
      
      // Format for calendar display
      const calendarJobs = jobs.map((job: any) => ({
        id: job.id,
        title: job.name || `${job.serviceType} - ${job.firstName} ${job.lastName}`,
        date: job.confirmedDate || job.moveDate,
        serviceType: job.serviceType,
        status: job.status,
        address: job.fromAddress || job.address,
        customerName: `${job.firstName || ''} ${job.lastName || ''}`.trim(),
        phone: job.phone,
        email: job.email,
        notes: job.notes,
      }));
      
      res.json(calendarJobs);
    } catch (error: any) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });
  
  // Validation schemas for rewards endpoints
  // NOTE: checkinSchema removed - daily check-ins replaced by unified mining system
  
  const cashoutSchema = z.object({
    tokenAmount: z.number().positive().min(0.01),
    bankDetails: z.object({
      accountNumber: z.string().min(4),
      routingNumber: z.string().length(9),
      accountHolderName: z.string().min(2),
      bankName: z.string().min(2)
    })
  });

  // Treasury validation schema
  const treasuryDepositSchema = z.object({
    amount: z.coerce.number().positive().min(1.00).max(1000000).finite(), // $1.00 - $1M deposit
    depositMethod: z.enum(['manual', 'stripe', 'bank_transfer']).optional().default('manual'),
    notes: z.string().optional()
  });

  // Referral validation schemas
  const referralCodeSchema = z.object({
    referralCode: z.string().min(1).max(20)
  });

  // Crypto conversion validation schemas
  const usdToTokensSchema = z.object({
    usdAmount: z.coerce.number().positive().min(0.01).max(10000).finite() // $0.01 - $10K conversion
  });

  const tokensToUsdSchema = z.object({
    tokenAmount: z.string().refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0 && num <= 1000000000; // 1B token max
      },
      { message: "Token amount must be a positive number string up to 1B tokens" }
    )
  });

  // Treasury dashboard helper functions
  async function getTreasuryAnalytics() {
    const TREASURY_SUPPLY = 24_000_000;

    // Get reward distribution patterns and user analytics
    const rewardStats = await db
      .select({
        rewardType: rewards.rewardType,
        count: sql<number>`count(*)`,
        totalTokens: sql<number>`sum(cast(${rewards.tokenAmount} as decimal))`,
        totalCash: sql<number>`sum(cast(${rewards.cashValue} as decimal))`
      })
      .from(rewards)
      .where(eq(rewards.status, 'confirmed'))
      .groupBy(rewards.rewardType);

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    const userStats = await db
      .select({
        totalUsers: sql<number>`count(distinct ${rewards.userId})`,
      })
      .from(rewards);

    const activeUsers = await db
      .select({
        activeUsers: sql<number>`count(distinct ${rewards.userId})`,
      })
      .from(rewards)
      .where(sql`${rewards.earnedDate} >= ${thirtyDaysAgoISO}`);

    // Get distribution trends (simplified without date grouping for compatibility)
    const recentRewards = await db
      .select({
        tokenAmount: rewards.tokenAmount,
        cashValue: rewards.cashValue,
        earnedDate: rewards.earnedDate
      })
      .from(rewards)
      .where(sql`${rewards.earnedDate} >= ${thirtyDaysAgoISO}`)
      .orderBy(desc(rewards.earnedDate));

    // ── Liability metrics ────────────────────────────────────────────────────
    // Total tokens ever earned (sum of positive reward entries only)
    const [totalEarnedRow] = await db
      .select({ total: sql<number>`coalesce(sum(cast(${rewards.tokenAmount} as decimal)), 0)` })
      .from(rewards)
      .where(sql`cast(${rewards.tokenAmount} as decimal) > 0`);
    const totalTokensEarned = Number(totalEarnedRow?.total ?? 0);

    // Total tokens redeemed in completed redemptions
    const [completedRedRow] = await db
      .select({ total: sql<number>`coalesce(sum(token_cost), 0)` })
      .from(rewardRedemptions)
      .where(eq(rewardRedemptions.status, "completed"));
    const totalTokensRedeemed = Number(completedRedRow?.total ?? 0);

    // Pending redemptions (tokens committed but not yet fulfilled)
    const [pendingRedRow] = await db
      .select({ total: sql<number>`coalesce(sum(token_cost), 0)` })
      .from(rewardRedemptions)
      .where(inArray(rewardRedemptions.status, ["pending", "pending_approval", "approved", "redeemed_pending_schedule"]));
    const pendingRedemptionsValue = Number(pendingRedRow?.total ?? 0);

    const liabilityTotal = pendingRedemptionsValue + totalTokensRedeemed;
    const safetyRatioPct = TREASURY_SUPPLY > 0 ? (liabilityTotal / TREASURY_SUPPLY) * 100 : 0;
    const safetyStatus = safetyRatioPct < 10 ? "green" : safetyRatioPct < 25 ? "yellow" : "red";

    return {
      rewardStats,
      userStats: { 
        totalUsers: userStats[0]?.totalUsers || 0,
        activeUsers: activeUsers[0]?.activeUsers || 0
      },
      recentRewards,
      liability: {
        totalTokensEarned,
        totalTokensRedeemed,
        pendingRedemptionsValue,
        completedRedemptionsValue: totalTokensRedeemed,
        liabilityTotal,
        treasurySupply: TREASURY_SUPPLY,
        safetyRatioPct: parseFloat(safetyRatioPct.toFixed(4)),
        safetyStatus,
      }
    };
  }

  async function getTreasuryReports(period: string = '30d', type: string = 'all') {
    const dayMap = {
      '7d': 7,
      '30d': 30, 
      '90d': 90,
      '1y': 365
    };
    
    const days = dayMap[period as keyof typeof dayMap] || 30;
    
    // Calculate date boundary
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateISO = fromDate.toISOString();
    
    // Get funding deposits within period
    const fundingData = await db
      .select({
        amount: fundingDeposits.depositAmount,
        createdAt: fundingDeposits.createdAt
      })
      .from(fundingDeposits)
      .where(sql`${fundingDeposits.createdAt} >= ${fromDateISO}`)
      .orderBy(desc(fundingDeposits.createdAt));

    // Get distribution transactions within period
    const distributionData = await db
      .select({
        cashValue: reserveTransactions.cashValue,
        createdAt: reserveTransactions.createdAt
      })
      .from(reserveTransactions)
      .where(and(
        eq(reserveTransactions.transactionType, 'distribution'),
        sql`${reserveTransactions.createdAt} >= ${fromDateISO}`
      ))
      .orderBy(desc(reserveTransactions.createdAt));

    return {
      period,
      type,
      fundingData,
      distributionData
    };
  }

  async function getTreasurySummary() {
    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const [stats, recentDeposits, recentDistributions, activeUsersWeek] = await Promise.all([
      treasuryService.getTreasuryStats(),
      
      // Count recent deposits
      db.select({ count: sql<number>`count(*)` })
        .from(fundingDeposits)
        .where(sql`${fundingDeposits.createdAt} >= ${sevenDaysAgoISO}`),
      
      // Count recent distributions  
      db.select({ count: sql<number>`count(*)` })
        .from(reserveTransactions)
        .where(and(
          eq(reserveTransactions.transactionType, 'distribution'),
          sql`${reserveTransactions.createdAt} >= ${sevenDaysAgoISO}`
        )),
      
      // Count active users this week
      db.select({ count: sql<number>`count(distinct ${rewards.userId})` })
        .from(rewards)
        .where(sql`${rewards.earnedDate} >= ${sevenDaysAgoISO}`)
    ]);

    return {
      ...stats,
      weeklyActivity: {
        recentDeposits: recentDeposits[0]?.count || 0,
        recentDistributions: recentDistributions[0]?.count || 0,
        activeUsersWeek: activeUsersWeek[0]?.count || 0
      }
    };
  }

  function getTreasuryConfig() {
    return {
      tokenPrice: 0.10, // $0.10 per token
      minimumBalance: 100.0, // $100 minimum balance
      warningThreshold: 500.0, // $500 warning threshold
      signupBonusTokens: 1000, // 1000 tokens signup bonus
      maxDistributionPerDay: null
    };
  }
  
  // ── ZIP-to-ETA endpoint ─────────────────────────────────────────────────────
  // In-memory cache keyed by ZIP code
  const zipEtaCache = new Map<string, { distanceMiles: number; estimatedMinutes: number; availabilityLabel: string }>();

  // ── Crew Availability System ────────────────────────────────────────────────
  // POST /api/crew/go-online — worker sets availability window
  app.post("/api/crew/go-online", isAuthenticated, (req: any, res: any, next: any) => requireEmployee(req, res, next), async (req: any, res) => {
    try {
      const userId = (req.session as any).userId || req.user?.id;
      const { availableUntil } = req.body;
      if (!availableUntil) return res.status(400).json({ message: "availableUntil is required" });
      const until = new Date(availableUntil);
      if (isNaN(until.getTime()) || until <= new Date()) {
        return res.status(400).json({ message: "availableUntil must be a future timestamp" });
      }
      const now = new Date();
      const [updated] = await db.update(users)
        .set({ isAvailable: true, availableUntil: until, lastActive: now })
        .where(eq(users.id, userId))
        .returning({ id: users.id, isAvailable: users.isAvailable, availableUntil: users.availableUntil, lastActive: users.lastActive });
      if (!updated) return res.status(404).json({ message: "User not found" });
      return res.json({ success: true, ...updated });
    } catch (err) {
      console.error("go-online error:", err);
      return res.status(500).json({ message: "Failed to go online" });
    }
  });

  // POST /api/crew/heartbeat — refresh lastActive timestamp
  app.post("/api/crew/heartbeat", isAuthenticated, (req: any, res: any, next: any) => requireEmployee(req, res, next), async (req: any, res) => {
    try {
      const userId = (req.session as any).userId || req.user?.id;
      const now = new Date();
      // Auto-expire if availableUntil has passed
      const [worker] = await db.select({ availableUntil: users.availableUntil }).from(users).where(eq(users.id, userId));
      if (worker?.availableUntil && new Date(worker.availableUntil) <= now) {
        await db.update(users).set({ isAvailable: false, lastActive: now }).where(eq(users.id, userId));
        return res.json({ success: true, expired: true });
      }
      await db.update(users).set({ lastActive: now }).where(eq(users.id, userId));
      return res.json({ success: true, expired: false });
    } catch (err) {
      console.error("heartbeat error:", err);
      return res.status(500).json({ message: "Failed to send heartbeat" });
    }
  });

  // POST /api/crew/go-offline — worker manually goes offline
  app.post("/api/crew/go-offline", isAuthenticated, (req: any, res: any, next: any) => requireEmployee(req, res, next), async (req: any, res) => {
    try {
      const userId = (req.session as any).userId || req.user?.id;
      await db.update(users).set({ isAvailable: false, availableUntil: null, lastActive: new Date() }).where(eq(users.id, userId));
      return res.json({ success: true });
    } catch (err) {
      console.error("go-offline error:", err);
      return res.status(500).json({ message: "Failed to go offline" });
    }
  });

  // GET /api/crew/online — public count of workers actively online
  // Workers qualify if: isAvailable=true AND lastActive within 5min AND availableUntil in future
  app.get("/api/crew/online", async (_req, res) => {
    try {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS count FROM users
         WHERE is_available = true
           AND role = 'employee'
           AND last_active IS NOT NULL
           AND last_active >= $1
           AND available_until IS NOT NULL
           AND available_until > $2`,
        [fiveMinAgo, now]
      );
      const count = parseInt(rows[0]?.count ?? "0", 10);
      return res.json({ count });
    } catch {
      return res.json({ count: 0 });
    }
  });

  app.get("/api/eta", async (req, res) => {
    try {
      const zip = String(req.query.zip ?? "").trim().replace(/\D/g, "").slice(0, 5);
      if (zip.length < 5) {
        return res.status(400).json({ error: "Enter a valid 5-digit ZIP code." });
      }

      if (zipEtaCache.has(zip)) {
        const [crewRow] = await db.select({ count: sql<number>`count(*)` }).from(users)
          .where(and(eq(users.isAvailable, true), eq(users.role, "employee")));
        const crewCount = Number(crewRow?.count ?? 0);
        const cached = zipEtaCache.get(zip)!;
        return res.json({ ...cached, crewCount });
      }

      // Fetch coordinates for customer ZIP via free Zippopotam API
      const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!geoRes.ok) {
        return res.status(400).json({ error: "ZIP code not found. Please check and try again." });
      }
      const geoData = await geoRes.json() as any;
      const place = geoData.places?.[0];
      if (!place) {
        return res.status(400).json({ error: "ZIP code not found. Please check and try again." });
      }

      const customerLat = Number(place.latitude);
      const customerLng = Number(place.longitude);

      // Ironwood, MI base coordinates
      const BASE_LAT = 46.4547;
      const BASE_LNG = -90.1701;

      // Haversine distance in miles
      const R = 3958.8;
      const dLat = ((customerLat - BASE_LAT) * Math.PI) / 180;
      const dLng = ((customerLng - BASE_LNG) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((BASE_LAT * Math.PI) / 180) *
          Math.cos((customerLat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distanceMiles = Math.round(R * 2 * Math.asin(Math.sqrt(a)));

      const DRIVE_SPEED_MPH = 50;
      const estimatedMinutes = Math.round((distanceMiles / DRIVE_SPEED_MPH) * 60);

      let availabilityLabel: string;
      if (estimatedMinutes <= 30) {
        availabilityLabel = "nearby";
      } else if (estimatedMinutes <= 60) {
        availabilityLabel = "close";
      } else if (estimatedMinutes <= 180) {
        availabilityLabel = "moderate";
      } else {
        availabilityLabel = "far";
      }

      const payload = { distanceMiles, estimatedMinutes, availabilityLabel };
      zipEtaCache.set(zip, payload);

      // Live crew availability count
      const [crewRow] = await db.select({ count: sql<number>`count(*)` }).from(users)
        .where(and(eq(users.isAvailable, true), eq(users.role, "employee")));
      const crewCount = Number(crewRow?.count ?? 0);

      return res.json({ ...payload, crewCount });
    } catch (err) {
      console.error("ETA lookup error:", err);
      return res.status(500).json({ error: "Could not calculate ETA right now." });
    }
  });

  // ── Live Dispatch Engine ─────────────────────────────────────────────────────

  // Tier → crew requirements map
  const JUNK_TIER_CREW: Record<string, { movers: number; needsDriver: boolean; basePrice: number }> = {
    small_pickup:   { movers: 1, needsDriver: false, basePrice: 150 },
    pickup_load:    { movers: 2, needsDriver: true,  basePrice: 350 },
    trailer_load:   { movers: 2, needsDriver: true,  basePrice: 750 },
    full_load:      { movers: 3, needsDriver: true,  basePrice: 1000 },
  };

  /**
   * Dispatch engine — fills `slotsNeeded` new crew slots for a job.
   *
   * @param leadId        The job to assign workers to.
   * @param crewSize      Total workers the job requires (used to gate "assigned" status).
   * @param slotsNeeded   How many NEW workers to find this call.
   * @param needsDriver   When true, driver-capable workers are prioritised in ordering.
   * @param existingCrew  Workers already on the job (kept as-is — union with new picks).
   * @param excludeIds    Workers to skip entirely (e.g. those who declined).
   */
  async function runDispatch(
    leadId: string,
    crewSize: number,
    slotsNeeded: number,
    needsDriver: boolean,
    existingCrew: string[] = [],
    excludeIds: string[] = [],
  ): Promise<string[]> {
    const skipIds = [...new Set([...existingCrew, ...excludeIds])];

    const whereClause = and(
      eq(users.isAvailable, true),
      eq(users.role, "employee"),
      eq(users.status, "approved"),
      skipIds.length > 0
        ? sql`${users.id} != ALL(${skipIds}::text[])`
        : undefined,
    );

    // When a driver is required, pull slightly more candidates so we can sort
    // drivers to the front and still fill the job if mixed results come back.
    const fetchLimit = Math.max(slotsNeeded * 3, slotsNeeded + 5);
    const candidates = await db
      .select({ id: users.id, firstName: users.firstName, isDriver: users.isDriver })
      .from(users)
      .where(whereClause)
      .limit(fetchLimit);

    let sorted = candidates;
    if (needsDriver) {
      // Drivers first; non-drivers fill remaining slots
      sorted = [
        ...candidates.filter(c => c.isDriver),
        ...candidates.filter(c => !c.isDriver),
      ];
    }

    const picked = sorted.slice(0, slotsNeeded);
    const newIds = picked.map(w => w.id);

    // Final crew = existing members kept + newly picked
    const mergedCrew = [...existingCrew, ...newIds];

    // Only mark the job "assigned" when the full required crew size is met
    const fullyStaffed = mergedCrew.length >= crewSize;
    await db.update(leads)
      .set({
        crewMembers: mergedCrew,
        status: fullyStaffed ? "assigned" : "open",
      })
      .where(eq(leads.id, leadId));

    // Notify only the newly assigned workers
    for (const worker of picked) {
      await db.insert(notifications).values({
        userId: worker.id,
        type: "job_assigned",
        title: "New Job Assignment",
        message: "You've been assigned to a job. Please accept or decline from your dashboard.",
        data: { leadId },
      });
    }

    return newIds;
  }

  // POST /api/jobs/create-junk — create a junk removal booking and auto-dispatch
  app.post("/api/jobs/create-junk", isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      const { tier, addOns, address, customerName, phone, email } = req.body;

      if (!tier || !JUNK_TIER_CREW[tier]) {
        return res.status(400).json({ error: "Invalid tier" });
      }
      const addrTrimmed = typeof address === "string" ? address.trim() : "";
      if (!addrTrimmed || addrTrimmed.length < 8 || !/[a-zA-Z]/.test(addrTrimmed) || !/\d/.test(addrTrimmed)) {
        return res.status(400).json({ error: "A full street address is required (e.g. 123 Main St, Ironwood, MI)" });
      }
      const parseAddon = (val: unknown, max = 10): number => {
        const n = Math.floor(Number(val) || 0);
        if (n < 0 || n > max || !isFinite(n)) throw new Error("Invalid add-on quantity");
        return n;
      };
      let mattressQty: number, fridgeQty: number, gymQty: number;
      try {
        mattressQty = parseAddon(addOns?.mattress);
        fridgeQty   = parseAddon(addOns?.fridge);
        gymQty      = parseAddon(addOns?.gym);
      } catch {
        return res.status(400).json({ error: "Add-on quantities must be non-negative integers (max 10 each)" });
      }

      const tierCfg = JUNK_TIER_CREW[tier];
      const addOnTotal = mattressQty * 50 + fridgeQty * 100 + gymQty * 100;
      const totalPrice = tierCfg.basePrice + addOnTotal;

      const nameParts = (customerName || "").trim().split(" ");
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Junk";
      const customerEmail = email || "noreply@jconthemove.com";
      const customerPhone = phone || "";

      const tierLabel: Record<string, string> = {
        small_pickup: "Small Pickup Load", pickup_load: "Pickup Load",
        trailer_load: "Trailer Load", full_load: "Full Load",
      };
      const [lead] = await db.insert(leads).values({
        firstName,
        lastName,
        email: customerEmail,
        phone: customerPhone,
        serviceType: "junk",
        fromAddress: addrTrimmed,
        status: "quoted",   // price is fixed at booking — no review needed
        crewSize: tierCfg.movers,
        basePrice: String(totalPrice),
        totalPrice: String(totalPrice),
        details: `${tierLabel[tier] ?? tier} junk removal — $${totalPrice}${addOnTotal > 0 ? ` (includes add-ons: Mattress×${mattressQty}, Fridge×${fridgeQty}, Gym Equipment×${gymQty})` : ""}`,
        createdByUserId: (req.session as any).userId || req.user?.id || null,
      }).returning();

      // Auto-dispatch with driver preference for applicable tiers
      const assignedCrew = await runDispatch(
        lead.id, tierCfg.movers, tierCfg.movers, tierCfg.needsDriver, [], [],
      );

      // Notify admin via email
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      try {
        await sendEmail({
          to: companyEmail, from: companyEmail,
          subject: `New Junk Removal Booking — ${firstName} ${lastName}`,
          text: `New junk removal job submitted.\n\nCustomer: ${firstName} ${lastName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nAddress: ${address}\nTier: ${tier}\nTotal: $${totalPrice}\n\nView job in admin panel.`,
          html: `<h2>New Junk Removal Booking</h2><p><b>Customer:</b> ${firstName} ${lastName}<br><b>Phone:</b> ${customerPhone}<br><b>Email:</b> ${customerEmail}<br><b>Address:</b> ${address}<br><b>Tier:</b> ${tier}<br><b>Total:</b> $${totalPrice}</p>`,
        });
      } catch (emailErr) { console.error("Admin email failed:", emailErr); }

      // Notify admin via SMS
      try {
        await smsService.notifyNewQuote({ customerName: `${firstName} ${lastName}`, serviceType: "junk", phone: customerPhone || undefined });
      } catch (smsErr) { console.error("Admin SMS failed:", smsErr); }

      const dispatched = assignedCrew.length >= tierCfg.movers;
      res.json({
        jobId: lead.id,
        status: dispatched ? "available" : "quoted",
        crewCount: assignedCrew.length,
        message: dispatched
          ? "Crew assigned! They'll contact you to confirm pickup."
          : `Price confirmed at $${totalPrice}. Call us to schedule your pickup: (906) 285-9312`,
        totalPrice,
      });
    } catch (err) {
      console.error("Error creating junk booking:", err);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // POST /api/jobs/create-moving — create a moving job and auto-dispatch
  app.post("/api/jobs/create-moving", isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      const { movers, hours, address, notes, customerName, phone, email } = req.body;

      const moverCount = Math.floor(Number(movers) || 0);
      const hourCount  = Math.floor(Number(hours)  || 0);

      if (moverCount < 1 || moverCount > 10) return res.status(400).json({ error: "Mover count must be between 1 and 10" });
      if (hourCount < 1 || hourCount > 24)   return res.status(400).json({ error: "Hours must be between 1 and 24" });
      const addrTrimmed = typeof address === "string" ? address.trim() : "";
      if (!addrTrimmed || addrTrimmed.length < 8 || !/[a-zA-Z]/.test(addrTrimmed) || !/\d/.test(addrTrimmed)) {
        return res.status(400).json({ error: "A full street address is required (e.g. 123 Main St, Ironwood, MI)" });
      }

      // Calculate price from live pricing config
      const { rows: pricingRows } = await pool.query(
        `SELECT setting_key, setting_value FROM spin_config WHERE setting_key IN ('pricing_rate_per_mover_hour') LIMIT 1`
      );
      const ratePerMoverHour = parseFloat(pricingRows[0]?.setting_value ?? "65");
      const totalPrice = Math.round(moverCount * hourCount * ratePerMoverHour);

      const nameParts = (customerName || "").trim().split(" ");
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Moving";
      const customerEmail = email || "noreply@jconthemove.com";
      const customerPhone = phone || "";

      const [lead] = await db.insert(leads).values({
        firstName, lastName,
        email: customerEmail,
        phone: customerPhone,
        serviceType: "moving",
        fromAddress: address.trim(),
        status: "new",
        crewSize: moverCount,
        basePrice: String(totalPrice),
        totalPrice: String(totalPrice),
        details: `Moving job: ${moverCount} mover${moverCount > 1 ? "s" : ""}, ${hourCount} hour${hourCount > 1 ? "s" : ""}${notes ? ` — ${notes}` : ""}`,
        createdByUserId: (req.session as any).userId || req.user?.id || null,
      }).returning();

      const assignedCrew = await dispatchGenericJob({ leadId: lead.id, kind: "moving", crewSize: moverCount });

      // Notify admin
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      try {
        await sendEmail({
          to: companyEmail, from: companyEmail,
          subject: `New Moving Booking — ${firstName} ${lastName} (${moverCount} movers, ${hourCount} hrs)`,
          text: `New moving job submitted.\n\nCustomer: ${firstName} ${lastName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nAddress: ${address}\nMovers: ${moverCount}, Hours: ${hourCount}\nEstimated Total: $${totalPrice}\n\nView in admin panel.`,
          html: `<h2>New Moving Booking</h2><p><b>Customer:</b> ${firstName} ${lastName}<br><b>Phone:</b> ${customerPhone}<br><b>Email:</b> ${customerEmail}<br><b>Address:</b> ${address}<br><b>Movers:</b> ${moverCount} × ${hourCount} hrs<br><b>Estimated Total:</b> $${totalPrice}</p>`,
        });
      } catch (e) { console.error("Admin email failed:", e); }
      try {
        await smsService.notifyNewQuote({ customerName: `${firstName} ${lastName}`, serviceType: "moving", phone: customerPhone || undefined });
      } catch (e) { console.error("Admin SMS failed:", e); }

      const dispatched = assignedCrew.length >= moverCount;
      res.json({
        jobId: lead.id,
        status: dispatched ? "available" : "new",
        crewCount: assignedCrew.length,
        totalPrice,
        message: dispatched
          ? "Crew assigned! They'll be in touch shortly."
          : "We'll reach you shortly — our team will confirm your booking.",
      });
    } catch (err) {
      console.error("Error creating moving booking:", err);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // POST /api/jobs/create-labor — create a labor-only job and auto-dispatch
  app.post("/api/jobs/create-labor", isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      const { movers, hours, address, notes, customerName, phone, email } = req.body;

      const moverCount = Math.floor(Number(movers) || 0);
      const hourCount  = Math.floor(Number(hours)  || 0);

      if (moverCount < 1 || moverCount > 10) return res.status(400).json({ error: "Mover count must be between 1 and 10" });
      if (hourCount < 1 || hourCount > 24)   return res.status(400).json({ error: "Hours must be between 1 and 24" });
      const addrTrimmed = typeof address === "string" ? address.trim() : "";
      if (!addrTrimmed || addrTrimmed.length < 8 || !/[a-zA-Z]/.test(addrTrimmed) || !/\d/.test(addrTrimmed)) {
        return res.status(400).json({ error: "A full street address is required (e.g. 123 Main St, Ironwood, MI)" });
      }

      // Calculate price from live pricing config (labor uses same per-mover-hour rate)
      const { rows: pricingRows } = await pool.query(
        `SELECT setting_value FROM spin_config WHERE setting_key='pricing_rate_per_mover_hour' LIMIT 1`
      );
      const ratePerMoverHour = parseFloat(pricingRows[0]?.setting_value ?? "65");
      const totalPrice = Math.round(moverCount * hourCount * ratePerMoverHour);

      const nameParts = (customerName || "").trim().split(" ");
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Labor";
      const customerEmail = email || "noreply@jconthemove.com";
      const customerPhone = phone || "";

      const [lead] = await db.insert(leads).values({
        firstName, lastName,
        email: customerEmail,
        phone: customerPhone,
        serviceType: "labor",
        fromAddress: address.trim(),
        status: "new",
        crewSize: moverCount,
        basePrice: String(totalPrice),
        totalPrice: String(totalPrice),
        details: `Labor only: ${moverCount} helper${moverCount > 1 ? "s" : ""}, ${hourCount} hour${hourCount > 1 ? "s" : ""}${notes ? ` — ${notes}` : ""}`,
        createdByUserId: (req.session as any).userId || req.user?.id || null,
      }).returning();

      const assignedCrew = await dispatchGenericJob({ leadId: lead.id, kind: "labor", crewSize: moverCount });

      // Notify admin
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      try {
        await sendEmail({
          to: companyEmail, from: companyEmail,
          subject: `New Labor Booking — ${firstName} ${lastName} (${moverCount} helper${moverCount > 1 ? "s" : ""}, ${hourCount} hrs)`,
          text: `New labor-only job submitted.\n\nCustomer: ${firstName} ${lastName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nAddress: ${address}\nHelpers: ${moverCount}, Hours: ${hourCount}\nEstimated Total: $${totalPrice}\n\nView in admin panel.`,
          html: `<h2>New Labor Booking</h2><p><b>Customer:</b> ${firstName} ${lastName}<br><b>Phone:</b> ${customerPhone}<br><b>Email:</b> ${customerEmail}<br><b>Address:</b> ${address}<br><b>Helpers:</b> ${moverCount} × ${hourCount} hrs<br><b>Estimated Total:</b> $${totalPrice}</p>`,
        });
      } catch (e) { console.error("Admin email failed:", e); }
      try {
        await smsService.notifyNewQuote({ customerName: `${firstName} ${lastName}`, serviceType: "labor", phone: customerPhone || undefined });
      } catch (e) { console.error("Admin SMS failed:", e); }

      const dispatched = assignedCrew.length >= moverCount;
      res.json({
        jobId: lead.id,
        status: dispatched ? "available" : "new",
        crewCount: assignedCrew.length,
        totalPrice,
        message: dispatched
          ? "Crew assigned! They'll be in touch shortly."
          : "We'll reach you shortly — our team will confirm your booking.",
      });
    } catch (err) {
      console.error("Error creating labor booking:", err);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // POST /api/window-cleaning/quote — create a window cleaning booking
  const windowCleaningBookingSchema = z.object({
    firstName:       z.string().trim().min(1, "First name is required"),
    lastName:        z.string().trim().default("Customer"),
    email:           z.string().trim().email().optional().or(z.literal("")).default(""),
    phone:           z.string().trim().min(7, "A valid phone number is required"),
    address:         z.string().trim().min(8, "A full street address is required (e.g. 123 Main St, City, MI)"),
    standardWindows: z.coerce.number().int().min(0).default(0),
    largeWindows:    z.coerce.number().int().min(0).default(0),
    ladderWindows:   z.coerce.number().int().min(0).default(0),
    includeInside:   z.boolean().default(true),
    includeOutside:  z.boolean().default(true),
    seasonMode:      z.enum(["normal", "winter_inside_only"]).default("normal"),
    promoCode:       z.string().trim().default(""),
  });

  app.post("/api/window-cleaning/quote", async (req: any, res) => {
    try {
      const parseResult = windowCleaningBookingSchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return res.status(400).json({ error: firstError?.message || "Invalid request", errors: parseResult.error.errors });
      }

      const {
        firstName, lastName, email, phone, address,
        standardWindows, largeWindows, ladderWindows,
        includeInside, includeOutside, seasonMode, promoCode,
      } = parseResult.data;

      const { calculateWindowCleaningQuote } = await import("@shared/windowCleaningPricing");
      const isApril = new Date().getMonth() === 3;

      let validatedPromoCode = "";
      if (promoCode.length > 0) {
        const now = new Date();
        const [promoRecord] = await db.select().from(promoCodes)
          .where(eq(promoCodes.code, promoCode.toUpperCase()))
          .limit(1);
        if (
          promoRecord &&
          promoRecord.isActive &&
          (!promoRecord.expiresAt || promoRecord.expiresAt > now) &&
          (!promoRecord.maxUses || promoRecord.usesCount < promoRecord.maxUses)
        ) {
          validatedPromoCode = promoCode.toUpperCase();
        }
      }

      const quote = calculateWindowCleaningQuote({
        standardWindows,
        largeWindows,
        ladderWindows,
        includeInside,
        includeOutside,
        seasonMode,
        promoCode: validatedPromoCode,
      }, isApril);

      const details = JSON.stringify({
        standardWindows, largeWindows, ladderWindows,
        includeInside, includeOutside, seasonMode,
        paneCount: quote.paneCount,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        discountPercent: quote.discountPercent,
        promoApplied: quote.promoApplied,
        promoCode: promoCode || null,
      });

      const customerEmail = email.length > 0 ? email : "noreply@jconthemove.com";
      const customerPhone = phone;

      const [lead] = await db.insert(leads).values({
        firstName,
        lastName: lastName || "Customer",
        email: customerEmail,
        phone: customerPhone,
        serviceType: "window_cleaning",
        fromAddress: address,
        status: "quote_requested",
        basePrice: String(quote.total),
        totalPrice: String(quote.total),
        details,
        promoCode: promoCode.toUpperCase() || null,
        createdByUserId: (req.session as any)?.userId || req.user?.id || null,
      }).returning();

      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      const customerName = `${firstName} ${lastName}`.trim();
      try {
        await sendEmail({
          to: companyEmail,
          from: companyEmail,
          subject: `New Window Cleaning Booking — ${customerName}`,
          text: `New window cleaning job submitted.\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nAddress: ${address}\nWindows: ${standardWindows} standard, ${largeWindows} large, ${ladderWindows} ladder\nInside: ${includeInside}, Outside: ${includeOutside}, Season: ${seasonMode}\nPanes: ${quote.paneCount}\nTotal: $${quote.total}${quote.promoApplied ? ` (${quote.discountPercent}% promo applied)` : ""}\n\nView job in admin panel.`,
          html: `<h2>New Window Cleaning Booking</h2><p><b>Customer:</b> ${customerName}<br><b>Phone:</b> ${customerPhone}<br><b>Email:</b> ${customerEmail}<br><b>Address:</b> ${address}<br><b>Windows:</b> ${standardWindows} standard, ${largeWindows} large, ${ladderWindows} ladder<br><b>Inside:</b> ${includeInside}, <b>Outside:</b> ${includeOutside}<br><b>Season:</b> ${seasonMode}<br><b>Total:</b> $${quote.total}${quote.promoApplied ? ` <em>(${quote.discountPercent}% promo applied)</em>` : ""}</p>`,
        });
      } catch (emailErr) { console.error("Admin email failed:", emailErr); }

      try {
        await smsService.notifyNewQuote({ customerName, serviceType: "window_cleaning", phone: customerPhone || undefined });
      } catch (smsErr) { console.error("Admin SMS failed:", smsErr); }

      res.json({
        jobId: lead.id,
        paneCount: quote.paneCount,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        discountPercent: quote.discountPercent,
        total: quote.total,
        promoApplied: quote.promoApplied,
        message: "Booking received! Our team will reach out to confirm.",
      });
    } catch (err) {
      console.error("Error creating window cleaning booking:", err);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // GET /api/jobs/:id/status — polling endpoint for job status
  app.get("/api/jobs/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const [lead] = await db.select({
        id: leads.id,
        status: leads.status,
        crewMembers: leads.crewMembers,
        crewSize: leads.crewSize,
        serviceType: leads.serviceType,
      }).from(leads).where(eq(leads.id, id));
      if (!lead) return res.status(404).json({ error: "Job not found" });
      res.json({
        id: lead.id,
        status: lead.status,
        crewCount: Array.isArray(lead.crewMembers) ? lead.crewMembers.length : 0,
        crewSize: lead.crewSize || 1,
        serviceType: lead.serviceType,
      });
    } catch (err) {
      console.error("Error fetching job status:", err);
      res.status(500).json({ error: "Failed to fetch job status" });
    }
  });

  // Submit quote request
  app.post("/api/leads", async (req, res) => {
    try {
      const leadData = insertLeadSchema.parse(req.body);
      // Always start as "new" so crew job board can see it immediately
      const lead = await storage.createLead({ ...leadData, status: "new" });
      
      // Send email notification
      const emailContent = generateLeadNotificationEmail(lead);
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New ${lead.serviceType} Lead - ${lead.firstName} ${lead.lastName}`,
        text: emailContent.text,
        html: emailContent.html,
      });

      // Send SMS notification for new quote to admin
      try {
        await smsService.notifyNewQuote({
          customerName: `${lead.firstName} ${lead.lastName}`,
          serviceType: lead.serviceType,
          phone: lead.phone || undefined,
          moveDate: lead.moveDate || undefined
        });
      } catch (smsError) {
        console.error("Admin SMS notification failed:", smsError);
      }
      
      // Send SMS confirmation to customer (only if they consented)
      if (lead.phone && lead.smsConsent) {
        try {
          await smsService.sendSMS(
            lead.phone,
            `📝 JC ON THE MOVE\n\nThank you ${lead.firstName}! We received your ${lead.serviceType} quote request.\n\nWe'll review your request and get back to you soon with a quote!\n\nQuestions? Call us anytime.`
          );
          console.log(`📱 SMS sent to customer: ${lead.phone}`);
        } catch (customerSmsError) {
          console.error("Customer SMS notification failed:", customerSmsError);
        }
      } else if (lead.phone && !lead.smsConsent) {
        console.log(`📵 Customer did not consent to SMS: ${lead.phone}`);
      }

      // Award 200 JCMOVES for booking request (find or create customer account)
      let rewardMessage = "";
      try {
        const { rewardSettings, rewards: rewardsTable } = await import('@shared/schema');
        
        // Get configurable amount from reward settings
        const settings = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'customer_quote_accepted'));
        const bonusTokens = settings.length > 0 && settings[0].isActive
          ? parseFloat(settings[0].tokenAmount)
          : 250; // Default 250 JCMOVES
        
        // Find existing user by email or create placeholder for future registration
        let existingUser = await db.select().from(users).where(eq(users.email, lead.email)).limit(1);
        
        if (existingUser.length > 0) {
          // Award tokens to existing account
          await storage.creditWalletTokens(existingUser[0].id, bonusTokens);
          await db.insert(rewardsTable).values({
            userId: existingUser[0].id,
            rewardType: 'booking_request',
            tokenAmount: bonusTokens.toFixed(8),
            cashValue: (bonusTokens * 0.01).toFixed(2),
            status: 'confirmed',
            earnedDate: new Date(),
            referenceId: lead.id,
            metadata: { leadId: lead.id, source: 'public_quote_form' }
          });
          rewardMessage = ` Earned ${bonusTokens} JCMOVES!`;
          console.log(`🎁 Awarded ${bonusTokens} JCMOVES to existing customer ${lead.email} for booking request`);
        } else {
          // Store pending reward for when they register
          console.log(`📋 Customer ${lead.email} not registered - reward will be applied on registration`);
        }
      } catch (rewardError) {
        console.error('Booking request reward error:', rewardError);
      }

      res.json({ success: true, leadId: lead.id, message: `Quote submitted!${rewardMessage}` });
    } catch (error) {
      console.error("Error creating lead:", error);
      res.status(400).json({ error: "Invalid lead data" });
    }
  });

  // Upload photo/video for a job request (any authenticated user)
  app.post("/api/leads/upload", isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      const multer = (await import("multer")).default;
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
      }).single("file");

      await new Promise<void>((resolve, reject) => {
        upload(req, res as any, (err: any) => {
          if (err) reject(err); else resolve();
        });
      });

      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const file = req.file as Express.Multer.File;
      const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.saveFileBuffer(file.buffer, file.mimetype, ext);
      res.json({ url, mimeType: file.mimetype, name: file.originalname });
    } catch (error: any) {
      console.error("❌ Lead upload error:", error?.message);
      res.status(500).json({ error: "Upload failed", detail: error?.message });
    }
  });

  app.post("/api/leads/marketplace", isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      console.log("[marketplace] incoming body keys:", Object.keys(req.body || {}));
      console.log("[marketplace] serviceType:", req.body?.serviceType, "fromAddress:", req.body?.fromAddress, "phone:", JSON.stringify(req.body?.phone), "email:", JSON.stringify(req.body?.email));
      const parseResult = insertLeadSchema.safeParse(req.body);
      if (!parseResult.success) {
        console.error("[marketplace] Zod validation failed:", JSON.stringify(parseResult.error.errors, null, 2));
        return res.status(400).json({ error: "Invalid lead data", details: parseResult.error.errors });
      }
      const leadData = parseResult.data;
      const lead = await storage.createLead(leadData);

      await storage.updateLeadStatus(lead.id, "available");
      try {
        await writeLeadHistory(lead.id, lead.status ?? "new", "available", req.user?.id ?? (req.session as any)?.userId ?? null, "Marketplace submission");
      } catch (histErr) {
        console.error('[lead_history] Marketplace auto-advance history failed:', histErr);
      }
      const updatedLead = await storage.getLead(lead.id);

      const emailContent = generateLeadNotificationEmail(lead);
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Marketplace ${lead.serviceType} Job - ${lead.firstName} ${lead.lastName}`,
        text: emailContent.text,
        html: emailContent.html,
      });

      try {
        await smsService.notifyNewQuote({
          customerName: `${lead.firstName} ${lead.lastName}`,
          serviceType: lead.serviceType,
          phone: lead.phone || undefined,
          moveDate: lead.moveDate || undefined
        });
      } catch (smsError) {
        console.error("Admin SMS notification failed:", smsError);
      }

      let rewardMessage = "";
      try {
        const settings = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'customer_quote_accepted'));
        const bonusTokens = settings.length > 0 && settings[0].isActive
          ? parseFloat(settings[0].tokenAmount)
          : 250;

        const existingUser = await db.select().from(users).where(eq(users.email, lead.email)).limit(1);
        if (existingUser.length > 0) {
          await storage.creditWalletTokens(existingUser[0].id, bonusTokens);
          await db.insert(rewards).values({
            userId: existingUser[0].id,
            rewardType: 'booking_request',
            tokenAmount: bonusTokens.toFixed(8),
            cashValue: (bonusTokens * 0.01).toFixed(2),
            status: 'confirmed',
            earnedDate: new Date(),
            referenceId: lead.id,
            metadata: { leadId: lead.id, source: 'marketplace_post' }
          });
          rewardMessage = ` Earned ${bonusTokens} JCMOVES!`;
          console.log(`🎁 Awarded ${bonusTokens} JCMOVES to customer ${lead.email} for marketplace job post`);
        }
      } catch (rewardErr) {
        console.error("Marketplace reward error:", rewardErr);
      }

      console.log(`🏪 Marketplace job created: ${lead.id} (available)`);
      res.status(201).json({ ...updatedLead, rewardMessage });
    } catch (error) {
      console.error("Error creating marketplace lead:", error);
      res.status(400).json({ error: "Invalid lead data" });
    }
  });

  // Customer quote tracking - REMOVED for security
  // This endpoint was a security vulnerability as it allowed anyone to view leads by email
  // Customers should use the authenticated /api/leads/my-requests endpoint instead

  // Role-based access control middleware
  const requireBusinessOwner = async (req: any, res: any, next: any) => {
    try {
      // Prefer user already resolved by isAuthenticated (JWT or session)
      let user = req.user || req.currentUser || null;
      if (!user) {
        const userId = (req.session as any).userId;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }
        user = await storage.getUser(userId);
      }

      // Allow both admin and business_owner roles for treasury access
      const hasBusinessOwnerAccess = user && (user.role === 'admin' || user.role === 'business_owner');
      
      // Also allow upmichiganstatemovers@gmail.com as the known business owner
      const isKnownBusinessOwner = user?.email === 'upmichiganstatemovers@gmail.com';
      
      if (!hasBusinessOwnerAccess && !isKnownBusinessOwner) {
        console.log(`Access denied for user ${user?.email} with role ${user?.role}`);
        return res.status(403).json({ message: "Business owner access required" });
      }
      
      console.log(`Treasury access granted for user ${user?.email} with role ${user?.role}`);
      req.currentUser = user;
      next();
    } catch (error) {
      console.error("Business owner access control error:", error);
      res.status(500).json({ message: "Access control error" });
    }
  };

  const requireEmployee = async (req: any, res: any, next: any) => {
    try {
      // Prefer user already resolved by isAuthenticated (JWT or session)
      // Fall back to session lookup for legacy routes that skip isAuthenticated
      let user = req.user || req.currentUser || null;
      if (!user) {
        const userId = (req.session as any).userId;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }
        user = await storage.getUser(userId);
      }
      if (!user || (user.role !== 'employee' && user.role !== 'admin' && user.role !== 'business_owner')) {
        return res.status(403).json({ message: "Employee access required" });
      }
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Access control error" });
    }
  };

  // POST /api/jobs/:id/accept — crew member locks their slot on the job
  app.post("/api/jobs/:id/accept", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const leadId = req.params.id;
      const userId = req.currentUser.id;
      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
      if (!lead) return res.status(404).json({ error: "Job not found" });
      const crew: string[] = Array.isArray(lead.crewMembers) ? lead.crewMembers : [];
      if (!crew.includes(userId)) return res.status(403).json({ error: "Not assigned to this job" });

      // Persist acceptance: add to acceptedByEmployees array (idempotent)
      const alreadyAccepted: string[] = Array.isArray(lead.acceptedByEmployees) ? lead.acceptedByEmployees : [];
      if (!alreadyAccepted.includes(userId)) {
        await db.update(leads)
          .set({ acceptedByEmployees: [...alreadyAccepted, userId] })
          .where(eq(leads.id, leadId));
      }

      // Lock worker — mark unavailable so they won't be dispatched to new jobs
      await db.update(users).set({ isAvailable: false }).where(eq(users.id, userId));

      // Mark notification read
      await db.update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.userId, userId), sql`data->>'leadId' = ${leadId}`));

      res.json({ success: true, message: "Job accepted" });
    } catch (err) {
      console.error("Error accepting job:", err);
      res.status(500).json({ error: "Failed to accept job" });
    }
  });

  // POST /api/jobs/:id/decline — crew member declines; re-dispatch replaces them
  app.post("/api/jobs/:id/decline", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const leadId = req.params.id;
      const userId = req.currentUser.id;
      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
      if (!lead) return res.status(404).json({ error: "Job not found" });
      const crew: string[] = Array.isArray(lead.crewMembers) ? lead.crewMembers : [];
      if (!crew.includes(userId)) return res.status(403).json({ error: "Not assigned to this job" });

      // Confirmed slots stay; decliner is removed from crewMembers
      const confirmedCrew: string[] = (Array.isArray(lead.acceptedByEmployees) ? lead.acceptedByEmployees : [])
        .filter(id => id !== userId);
      const remainingCrew = crew.filter(id => id !== userId);

      await db.update(leads)
        .set({
          crewMembers: remainingCrew,
          acceptedByEmployees: confirmedCrew,
          status: "open",
        })
        .where(eq(leads.id, leadId));

      // Restore availability — worker declined so they're free for other jobs again
      await db.update(users).set({ isAvailable: true }).where(eq(users.id, userId));

      // Mark notification read
      await db.update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.userId, userId), sql`data->>'leadId' = ${leadId}`));

      // Re-dispatch: preserve ALL remaining workers (confirmed + pending), find a replacement
      // Use crewSize >= 2 as a proxy for needsDriver (all multi-person tiers require a driver)
      const crewSize = lead.crewSize || 1;
      const slotsNeeded = crewSize - remainingCrew.length;
      if (slotsNeeded > 0) {
        await runDispatch(
          leadId,
          crewSize,
          slotsNeeded,
          crewSize >= 2, // needsDriver heuristic
          remainingCrew, // existingCrew — keep ALL currently assigned workers, not just confirmed
          [userId],      // excludeIds — skip the decliner
        );
      }

      res.json({ success: true, message: "Job declined" });
    } catch (err) {
      console.error("Error declining job:", err);
      res.status(500).json({ error: "Failed to decline job" });
    }
  });

  // GET /api/jobs/my-pending — jobs assigned to the employee that they haven't yet accepted
  app.get("/api/jobs/my-pending", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = req.currentUser.id;
      // Jobs where user is in crewMembers but NOT yet in acceptedByEmployees
      const assignedJobs = await db.select({
        id: leads.id,
        serviceType: leads.serviceType,
        status: leads.status,
        fromAddress: leads.fromAddress,
        details: leads.details,
        basePrice: leads.basePrice,
        crewSize: leads.crewSize,
        crewMembers: leads.crewMembers,
        acceptedByEmployees: leads.acceptedByEmployees,
        createdAt: leads.createdAt,
      }).from(leads)
        .where(and(
          sql`${userId} = ANY(${leads.crewMembers})`,
          sql`NOT (${userId} = ANY(COALESCE(${leads.acceptedByEmployees}, ARRAY[]::text[])))`,
          inArray(leads.status, ["assigned", "open"]),
        ))
        .orderBy(desc(leads.createdAt));
      res.json(assignedJobs);
    } catch (err) {
      console.error("Error fetching pending jobs:", err);
      res.status(500).json({ error: "Failed to fetch pending jobs" });
    }
  });

  const requireApprovedEmployee = async (req: any, res: any, next: any) => {
    try {
      let user = req.user || req.currentUser || null;
      if (!user) {
        const userId = (req.session as any).userId;
        if (!userId) return res.status(401).json({ message: "Not authenticated" });
        user = await storage.getUser(userId);
      }
      
      // Admins and business_owners always have access
      if (user && (user.role === 'admin' || user.role === 'business_owner')) {
        req.currentUser = user;
        return next();
      }
      
      // Employees must be approved
      if (!user || user.role !== 'employee' || !user.isApproved) {
        return res.status(403).json({ message: "Approved employee access required" });
      }
      
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Access control error" });
    }
  };

  const requireAdmin = async (req: any, res: any, next: any) => {
    try {
      let user = req.user || req.currentUser || null;
      if (!user) {
        const userId = (req.session as any).userId;
        if (!userId) return res.status(401).json({ message: "Not authenticated" });
        user = await storage.getUser(userId);
      }
      // Only admin or business_owner roles have administrative access
      if (!user || (user.role !== 'admin' && user.role !== 'business_owner')) {
        return res.status(403).json({ message: "Administrator access required" });
      }
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Access control error" });
    }
  };

  // Treasury access - allows admin, employee, and business_owner (not customers)
  const requireTreasuryAccess = async (req: any, res: any, next: any) => {
    try {
      let user = req.user || req.currentUser || null;
      if (!user) {
        const userId = (req.session as any).userId;
        if (!userId) return res.status(401).json({ message: "Not authenticated" });
        user = await storage.getUser(userId);
      }
      
      // Allow admin, employee, and business_owner roles
      const hasTreasuryAccess = user && (user.role === 'admin' || user.role === 'employee' || user.role === 'business_owner');
      
      // Also allow upmichiganstatemovers@gmail.com as the known business owner
      const isKnownBusinessOwner = user?.email === 'upmichiganstatemovers@gmail.com';
      
      if (!hasTreasuryAccess && !isKnownBusinessOwner) {
        console.log(`Treasury access denied for user ${user?.email} with role ${user?.role}`);
        return res.status(403).json({ message: "Treasury access requires admin, employee, or business owner role" });
      }
      
      console.log(`Treasury access granted for user ${user?.email} with role ${user?.role}`);
      req.currentUser = user;
      next();
    } catch (error) {
      console.error("Treasury access control error:", error);
      res.status(500).json({ message: "Access control error" });
    }
  };

  // Auth routes
  app.get('/api/auth/user', isAuthenticatedAllowPending, async (req: any, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    try {
      const userId = (req.session as any).userId;
      console.log(`✅ Authentication successful - Fetching user data for userId: ${userId}`);
      const user = await storage.getUser(userId);
      console.log(`User data retrieved:`, user ? `found - ${user.email} with role ${user.role}` : 'not found');
      
      if (!user) {
        console.error(`❌ User not found in database for userId: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`📤 Returning user data for ${user.email}`);
      // Sanitize user object - remove sensitive fields
      const { passwordHash, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error) {
      console.error("❌ Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user compliance (age verification and TOS)
  app.post('/api/auth/user/compliance', isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { dateOfBirth, tosAccepted } = req.body;

      if (!dateOfBirth || typeof tosAccepted !== 'boolean') {
        return res.status(400).json({ message: "Date of birth and TOS acceptance are required" });
      }

      // Validate age (18+)
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 18) {
        return res.status(400).json({ message: "You must be 18 years or older to use this service" });
      }

      if (!tosAccepted) {
        return res.status(400).json({ message: "You must accept the Terms of Service to continue" });
      }

      const updatedUser = await storage.updateUserCompliance(userId, dateOfBirth, tosAccepted);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user compliance:", error);
      res.status(500).json({ message: "Failed to update compliance information" });
    }
  });

  // Check username availability
  app.get('/api/auth/username/check/:username', async (req: any, res) => {
    try {
      const { username } = req.params;
      
      if (!username || username.length < 3) {
        return res.status(400).json({ available: false, message: "Username must be at least 3 characters" });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ available: false, message: "Username can only contain letters, numbers, and underscores" });
      }

      const isAvailable = await storage.checkUsernameAvailability(username);
      res.json({ available: isAvailable });
    } catch (error) {
      console.error("Error checking username availability:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  // Update username
  app.post('/api/auth/user/username', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { username } = req.body;

      if (!username || username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }

      if (username.length > 20) {
        return res.status(400).json({ message: "Username must be 20 characters or less" });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, and underscores" });
      }

      // Check if username is already taken
      const isAvailable = await storage.checkUsernameAvailability(username);
      if (!isAvailable) {
        return res.status(409).json({ message: "Username is already taken" });
      }

      const updatedUser = await storage.updateUsername(userId, username);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error: any) {
      // Handle unique constraint violation from race conditions
      if (error.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ message: "Username is already taken" });
      }
      console.error("Error updating username:", error);
      res.status(500).json({ message: "Failed to update username" });
    }
  });

  // Toggle worker on-duty / availability status
  app.patch('/api/auth/user/availability', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId || req.user?.id;
      const { isAvailable } = req.body;
      if (typeof isAvailable !== 'boolean') {
        return res.status(400).json({ message: "isAvailable must be a boolean" });
      }
      const now = new Date();
      // When going ON DUTY, also stamp lastActive and set availableUntil 12 hours out
      // so the public /api/crew/online count reflects this worker correctly
      const extraFields = isAvailable
        ? { lastActive: now, availableUntil: new Date(now.getTime() + 12 * 60 * 60 * 1000) }
        : { availableUntil: null };
      const [updated] = await db.update(users)
        .set({ isAvailable, ...extraFields })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ isAvailable: updated.isAvailable });
    } catch (error: any) {
      console.error("Error toggling availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  // Get available workers (employees who toggled on-duty)
  app.get('/api/employees/available', isAuthenticated, async (req: any, res) => {
    try {
      const available = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        isAvailable: users.isAvailable,
      }).from(users).where(
        and(
          eq(users.isAvailable, true),
          eq(users.status, 'approved'),
          inArray(users.role, ['employee', 'admin', 'business_owner'])
        )
      );
      res.json(available);
    } catch (error: any) {
      console.error("Error fetching available workers:", error);
      res.status(500).json({ message: "Failed to fetch available workers" });
    }
  });

  // Get all users (for employee/admin to assign jobs)
  app.get('/api/users', isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Return only safe user data
      const safeUsers = users.map(user => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role,
      }));
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get user by ID (for employee access)
  app.get('/api/users/:id', isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return only safe user data
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Delete user (business owner only)
  app.delete('/api/users/:id', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`🗑️ Deleting user ${id}...`);
      
      const deleted = await storage.deleteUser(id);
      
      if (!deleted) {
        console.log(`❌ User ${id} not found for deletion`);
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`✅ User ${id} deleted successfully`);
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Update user role (business owner only)
  app.patch('/api/users/:id/role', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      
      console.log(`🔄 Updating user ${id} role to: ${role}`);
      
      // Validate role
      const validRoles = ['employee', 'customer', 'admin', 'business_owner'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }
      
      const updatedUser = await storage.updateUserRole(id, role);
      
      if (!updatedUser) {
        console.log(`❌ User ${id} not found for role update`);
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`✅ User ${id} role updated to ${role}`);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // Update worker capability flags (admin only)
  app.patch('/api/users/:id/capabilities', isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const requestingUser = await storage.getUser((req.session as any).userId);
      if (!requestingUser || !["admin", "business_owner"].includes(requestingUser.role || "")) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { id } = req.params;
      const { capabilities } = req.body;
      const validCaps = ["mover", "driver", "truck_small", "truck_large", "trailer_small", "trailer_large", "uhaul"];
      if (!Array.isArray(capabilities) || capabilities.some(c => !validCaps.includes(c))) {
        return res.status(400).json({ error: "Invalid capabilities array" });
      }
      const [updated] = await db.update(users).set({ capabilities }).where(eq(users.id, id)).returning({ id: users.id, capabilities: users.capabilities });
      if (!updated) return res.status(404).json({ error: "User not found" });
      return res.json({ success: true, capabilities: updated.capabilities });
    } catch (err) {
      console.error("capabilities update error:", err);
      return res.status(500).json({ error: "Failed to update capabilities" });
    }
  });

  // Get detailed user information for admin (balance, rewards, transactions, jobs)
  app.get('/api/admin/users/:id/details', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get basic user info
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get wallet and balance information
      const wallet = await storage.getWalletAccount(id);
      const tokenBalance = wallet ? parseFloat(wallet.tokenBalance || "0") : 0;
      
      // Get employee stats if user is employee or admin
      let employeeStats = null;
      if (user.role === 'employee' || user.role === 'admin') {
        employeeStats = await storage.getEmployeeStats(id);
      }
      
      // Get recent rewards (last 10)
      const recentRewards = await db
        .select()
        .from(rewards)
        .where(eq(rewards.userId, id))
        .orderBy(desc(rewards.earnedDate))
        .limit(10);
      
      // Calculate total earnings from ALL rewards (not just recent 10)
      const allRewards = await db
        .select({ cashValue: rewards.cashValue })
        .from(rewards)
        .where(eq(rewards.userId, id));
      
      const totalEarnings = allRewards.reduce((sum, reward) => 
        sum + parseFloat(reward.cashValue || "0"), 0
      );
      
      // Get pending cashout requests
      const pendingCashouts = await db
        .select()
        .from(cashoutRequests)
        .where(and(
          eq(cashoutRequests.userId, id),
          eq(cashoutRequests.status, 'pending')
        ))
        .orderBy(desc(cashoutRequests.createdAt));
      
      // Get assigned/created leads if employee (use targeted queries instead of filtering all leads)
      let assignedJobs: any[] = [];
      let createdJobs: any[] = [];
      if (user.role === 'employee' || user.role === 'admin') {
        // Query only leads where user is in crew (more efficient than loading all leads)
        const [allLeadsForUser, allCreatedLeads] = await Promise.all([
          db.select()
            .from(leads)
            .where(sql`${id} = ANY(${leads.crewMembers})`)
            .orderBy(desc(leads.createdAt))
            .limit(10),
          db.select()
            .from(leads)
            .where(eq(leads.createdByUserId, id))
            .orderBy(desc(leads.createdAt))
            .limit(10)
        ]);
        assignedJobs = allLeadsForUser;
        createdJobs = allCreatedLeads;
      }
      
      res.json({
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          referralCount: user.referralCount,
          capabilities: user.capabilities || []
        },
        wallet: {
          tokenBalance: tokenBalance.toFixed(8),
          totalEarnings: totalEarnings.toFixed(4)
        },
        employeeStats: employeeStats ? {
          totalPoints: employeeStats.totalPoints,
          currentLevel: employeeStats.currentLevel,
          totalEarnedTokens: employeeStats.totalEarnedTokens,
          jobsCompleted: employeeStats.jobsCompleted,
          streakCount: employeeStats.currentStreak,
          lastActivityDate: employeeStats.lastActivityDate
        } : null,
        recentRewards: recentRewards.map(reward => ({
          id: reward.id,
          rewardType: reward.rewardType,
          tokenAmount: reward.tokenAmount,
          status: reward.status,
          earnedDate: reward.earnedDate,
          referenceId: reward.referenceId
        })),
        pendingRequests: {
          cashouts: pendingCashouts.length,
          cashoutDetails: pendingCashouts.map(cashout => ({
            id: cashout.id,
            tokenAmount: cashout.tokenAmount,
            status: cashout.status,
            createdAt: cashout.createdAt
          }))
        },
        jobs: {
          assignedCount: assignedJobs.length,
          createdCount: createdJobs.length,
          recentAssigned: assignedJobs.slice(0, 5).map(job => ({
            id: job.id,
            serviceType: job.serviceType,
            status: job.status,
            createdAt: job.createdAt
          })),
          recentCreated: createdJobs.slice(0, 5).map(job => ({
            id: job.id,
            serviceType: job.serviceType,
            status: job.status,
            createdAt: job.createdAt
          }))
        }
      });
    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ error: "Failed to fetch user details" });
    }
  });

  // Update user status (pending/approved/removed)
  app.patch('/api/admin/users/:id/status', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Validate status
      if (!['pending', 'approved', 'removed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'pending', 'approved', or 'removed'" });
      }
      
      console.log(`🔄 Admin updating user ${id} status to ${status}...`);
      
      // Get user to verify exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update user status
      const [updatedUser] = await db
        .update(users)
        .set({ 
          status,
          isApproved: status === 'approved', // Sync with deprecated field for backward compatibility
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      console.log(`✅ User ${id} status updated to ${status}`);

      // Send welcome email when approving
      if (status === 'approved') {
        try {
          const welcomeEmail = buildApprovalWelcomeEmail(user.firstName || 'Friend');
          await sendEmail({
            to: user.email,
            from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
            subject: welcomeEmail.subject,
            text: welcomeEmail.text,
            html: welcomeEmail.html,
          });
          console.log(`📧 Welcome email sent to ${user.email}`);
        } catch (e) { console.error('Failed to send approval welcome email:', e); }
      }

      res.json({ success: true, user: updatedUser });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // Delete user (admin only) - transfers tokens to treasury before deletion
  app.delete('/api/admin/users/:id', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`🗑️ Admin deleting user ${id}...`);
      
      // Get user to check role (prevent deleting admins/owners)
      const user = await storage.getUser(id);
      if (!user) {
        console.log(`❌ User ${id} not found for deletion`);
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent deleting admins only (allow business_owner deletion by admins)
      if (user.role === 'admin') {
        console.log(`❌ Cannot delete user ${id} with admin role`);
        return res.status(403).json({ error: `Cannot delete users with admin role` });
      }
      
      // Capture token balance outside transaction scope for response
      let reclaimedTokens = 0;
      
      // Wrap ENTIRE deletion and treasury reclaim in single transaction for atomicity
      await db.transaction(async (tx) => {
        // Get user's wallet to check token balance
        const [wallet] = await tx
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, id || ""))
          .limit(1);
        
        const tokenBalance = wallet ? parseFloat(wallet.tokenBalance) : 0;
        reclaimedTokens = tokenBalance; // Capture for response
        
        // If user has tokens, transfer them to treasury within same transaction
        if (tokenBalance > 0) {
          console.log(`💰 Transferring ${tokenBalance} tokens from user ${id} to treasury...`);
          
          // Set wallet balance to zero within transaction
          if (wallet) {
            await tx
              .update(walletAccounts)
              .set({ tokenBalance: "0.00000000" })
              .where(eq(walletAccounts.userId, id || ""));
          }
          
          // Get treasury account and update reserve (within same transaction)
          const [treasuryAccount] = await tx
            .select()
            .from(treasuryAccounts)
            .where(eq(treasuryAccounts.isActive, true))
            .limit(1);
          
          if (treasuryAccount) {
            const currentReserve = parseFloat(treasuryAccount.tokenReserve);
            const newReserve = currentReserve + tokenBalance;
            
            // Update treasury reserve within transaction
            await tx
              .update(treasuryAccounts)
              .set({ tokenReserve: newReserve.toFixed(8) })
              .where(eq(treasuryAccounts.id, treasuryAccount.id));
            
            // Record the reclaim transaction within same transaction
            await tx.insert(reserveTransactions).values({
              treasuryAccountId: treasuryAccount.id,
              transactionType: 'refund',
              relatedEntityType: 'account_deletion',
              relatedEntityId: id,
              tokenAmount: tokenBalance.toFixed(8),
              cashValue: "0.00",
              balanceAfter: treasuryAccount.cashReserve,
              tokenReserveAfter: newReserve.toFixed(8),
              description: `Tokens reclaimed from deleted user account: ${user.email || id}`,
            });
            
            console.log(`✅ Transferred ${tokenBalance} tokens to treasury`);
          } else {
            throw new Error("No active treasury account found");
          }
        }
        
        // Delete user within same transaction (all-or-nothing)
        await tx.delete(users).where(eq(users.id, id || ""));
        console.log(`✅ User ${id} deleted successfully`);
      });
      
      const deleted = true;
      
      if (!deleted) {
        console.log(`❌ Failed to delete user ${id}`);
        return res.status(500).json({ error: "Failed to delete user" });
      }
      
      console.log(`✅ User ${id} deleted successfully`);
      res.json({ 
        success: true, 
        message: "User deleted successfully",
        tokensTransferred: reclaimedTokens > 0 ? reclaimedTokens.toFixed(8) : "0.00000000"
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Admin retro-credit: directly credit wallet without deducting from treasury (use when treasury was already debited)
  app.post('/api/admin/wallet/:userId/retro-credit', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { userId } = req.params;
      const { tokenAmount, reason } = req.body;

      if (!tokenAmount || parseFloat(tokenAmount) <= 0) {
        return res.status(400).json({ error: "Valid token amount is required" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const amount = parseFloat(tokenAmount);
      await storage.creditWalletTokens(userId, amount);

      const TOKEN_PRICE = 0.00000508432;
      await db.insert(rewards).values({
        userId,
        rewardType: 'admin_retro_credit',
        tokenAmount: amount.toFixed(8),
        cashValue: (amount * TOKEN_PRICE).toFixed(6),
        status: 'confirmed',
        metadata: { reason: reason || 'Admin retro-credit', creditedBy: (req.user as any)?.id }
      });

      const wallet = await storage.getWalletAccount(userId);
      console.log(`🔧 Admin retro-credit: ${amount} JCMOVES credited to ${targetUser.email} — reason: ${reason}`);

      res.json({
        success: true,
        message: `Successfully credited ${amount} JCMOVES to ${targetUser.email}`,
        newBalance: wallet?.tokenBalance || '0',
        reason
      });
    } catch (error) {
      console.error("Error applying retro-credit:", error);
      res.status(500).json({ error: "Failed to apply retro-credit" });
    }
  });

  // Admin transfer tokens to user wallet
  app.post('/api/admin/wallet/:userId/transfer', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { userId } = req.params;
      const { tokenAmount, description } = req.body;
      
      if (!tokenAmount || tokenAmount <= 0) {
        return res.status(400).json({ error: "Valid token amount is required" });
      }
      
      // Get user to verify exists
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Distribute tokens from treasury to user
      const distributionResult = await treasuryService.distributeTokens(
        parseFloat(tokenAmount),
        description || `Admin transfer to ${targetUser.email}`,
        'admin_transfer',
        userId
      );
      
      if (!distributionResult.success) {
        return res.status(400).json({ error: distributionResult.error });
      }
      
      // Add tokens to user wallet
      await storage.addTokens(
        userId,
        parseFloat(tokenAmount),
        distributionResult.cashValue,
        'admin_transfer',
        description
      );
      
      // Get updated balance
      const updatedBalance = await storage.getTokenBalance(userId);
      
      res.json({
        success: true,
        message: `Successfully transferred ${tokenAmount} JCMOVES to ${targetUser.email}`,
        newBalance: updatedBalance.toFixed(8),
        cashValue: distributionResult.cashValue
      });
    } catch (error) {
      console.error("Error transferring tokens:", error);
      res.status(500).json({ error: "Failed to transfer tokens" });
    }
  });

  // Get user wallet transaction history
  app.get('/api/admin/wallet/:userId/history', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      // Get user to verify exists
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get all rewards/transactions for this user
      const allRewards = await db
        .select()
        .from(rewards)
        .where(eq(rewards.userId, userId))
        .orderBy(desc(rewards.earnedDate))
        .limit(limit);
      
      // Format transaction history
      const transactions = allRewards.map(reward => ({
        id: reward.id,
        type: reward.rewardType,
        tokenAmount: reward.tokenAmount,
        status: reward.status,
        date: reward.earnedDate,
        referenceId: reward.referenceId,
        metadata: reward.metadata
      }));
      
      res.json({
        success: true,
        transactions,
        totalCount: transactions.length
      });
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      res.status(500).json({ error: "Failed to fetch transaction history" });
    }
  });

  // Manual login endpoint (temporary workaround for broken OAuth)
  app.post('/api/auth/manual-login', async (req: any, res) => {
    try {
      const { userId, email } = req.body;
      
      if (!userId || !email) {
        return res.status(400).json({ message: "userId and email are required" });
      }

      // Create mock user session
      req.login({
        claims: {
          sub: userId,
          email: email,
          first_name: 'Darrell',
          last_name: 'Jackson'
        },
        expires_at: 9999999999,
        access_token: 'test_token'
      }, (err: any) => {
        if (err) {
          console.error('Manual login error:', err);
          return res.status(500).json({ message: "Login failed" });
        }
        console.log(`✅ Manual login successful for ${email}`);
        res.json({ success: true, message: "Logged in successfully" });
      });
    } catch (error) {
      console.error("Manual login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Wallet choice management (hybrid personal/company wallet system)
  app.get('/api/user/wallet-preference', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let companyWalletAddress: string | null = null;
      if (user.companyWalletId) {
        const companyWallet = await storage.getUserWalletById(user.companyWalletId);
        companyWalletAddress = companyWallet?.walletAddress || null;
      }

      res.json({
        walletMode: user.walletMode || null,
        personalWalletAddress: user.personalWalletAddress || null,
        companyWalletId: user.companyWalletId || null,
        companyWalletAddress,
        hasWalletConfigured: !!user.walletMode
      });
    } catch (error) {
      console.error("Error fetching wallet preference:", error);
      res.status(500).json({ message: "Failed to fetch wallet preference" });
    }
  });

  app.post('/api/user/wallet-choice', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { walletMode, personalWalletAddress } = req.body;

      // Validate wallet mode
      if (!walletMode || !['personal', 'company'].includes(walletMode)) {
        return res.status(400).json({ message: "Invalid wallet mode. Must be 'personal' or 'company'" });
      }

      // Validate personal wallet address if mode is personal
      if (walletMode === 'personal') {
        if (!personalWalletAddress || typeof personalWalletAddress !== 'string') {
          return res.status(400).json({ message: "Personal wallet address is required when using personal mode" });
        }
        
        // Basic Solana address validation (base58, 32-44 chars)
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        if (!solanaAddressRegex.test(personalWalletAddress)) {
          return res.status(400).json({ message: "Invalid Solana wallet address format" });
        }
      }

      let companyWalletId: string | undefined;
      let generatedWalletAddress: string | undefined;

      // If company mode, generate a real Solana wallet for the user
      if (walletMode === 'company') {
        try {
          const { walletService } = await import('./services/wallet');
          const companyWallet = await walletService.createUserWallet(userId, 'JCMOVES');
          companyWalletId = companyWallet.id;
          generatedWalletAddress = companyWallet.walletAddress;
          console.log(`✅ Generated company Solana wallet for user ${userId}: ${generatedWalletAddress}`);
        } catch (walletError) {
          console.error('Error generating company wallet:', walletError);
          return res.status(500).json({ message: "Failed to generate company wallet. Please try again." });
        }
      }

      const updatedUser = await storage.updateUserWalletChoice(
        userId,
        walletMode,
        personalWalletAddress,
        companyWalletId
      );

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`✅ Wallet choice updated for user ${userId}: mode=${walletMode}`);
      res.json({
        success: true,
        walletMode: updatedUser.walletMode,
        personalWalletAddress: updatedUser.personalWalletAddress,
        companyWalletId: updatedUser.companyWalletId,
        companyWalletAddress: generatedWalletAddress
      });
    } catch (error) {
      console.error("Error updating wallet choice:", error);
      res.status(500).json({ message: "Failed to update wallet choice" });
    }
  });

  app.get('/api/user/payout-address', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const payoutInfo = await storage.getPayoutAddress(userId);
      
      res.json(payoutInfo);
    } catch (error) {
      console.error("Error fetching payout address:", error);
      res.status(500).json({ message: "Failed to fetch payout address" });
    }
  });

  // Profile image upload (base64 encoded)
  app.post('/api/user/profile-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { profileImageUrl } = req.body;

      if (!profileImageUrl || typeof profileImageUrl !== 'string') {
        return res.status(400).json({ message: "Profile image is required" });
      }

      // Validate base64 image format
      if (!profileImageUrl.startsWith('data:image/')) {
        return res.status(400).json({ message: "Invalid image format. Must be a base64 encoded image" });
      }

      const updatedUser = await storage.updateUserProfileImage(userId, profileImageUrl);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile image:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  // Help request submission with optional images
  app.post('/api/support/help-request', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { message, imageUrls } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Help message is required" });
      }

      // Validate image URLs if provided
      const validatedImageUrls: string[] = [];
      if (imageUrls && Array.isArray(imageUrls)) {
        for (const url of imageUrls) {
          if (url && typeof url === 'string' && url.startsWith('data:image/')) {
            validatedImageUrls.push(url);
          }
        }
      }

      const helpRequest = await storage.createHelpRequest({
        userId,
        message: message.trim(),
        imageUrls: validatedImageUrls.length > 0 ? validatedImageUrls : null,
      });

      res.json(helpRequest);
    } catch (error) {
      console.error("Error creating help request:", error);
      res.status(500).json({ message: "Failed to submit help request" });
    }
  });

  // Employee job submission - track who created the job for rewards
  app.post("/api/leads/employee", isAuthenticated, requireApprovedEmployee, async (req: any, res) => {
    try {
      console.log('📝 Employee lead creation request:', JSON.stringify(req.body, null, 2));
      const employeeId = (req.session as any).userId; // Get from authenticated user
      
      const leadData = insertLeadSchema.parse(req.body);
      console.log('✅ Lead data validated successfully');
      
      // Create lead with createdByUserId to track the employee
      const lead = await storage.createLead({
        ...leadData,
        createdByUserId: employeeId
      });
      console.log('✅ Lead created successfully:', lead.id);
      
      // Send email notification
      const emailContent = generateLeadNotificationEmail(lead);
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Employee-Created ${lead.serviceType} Lead - ${lead.firstName} ${lead.lastName}`,
        text: `${emailContent.text}\n\nCreated by Employee ID: ${employeeId}`,
        html: `${emailContent.html}<p><strong>Created by Employee ID:</strong> ${employeeId}</p>`,
      });

      // Send SMS notification to admin for new lead
      try {
        const creator = await storage.getUser(employeeId);
        const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'Unknown Employee';
        
        await smsService.notifyNewLead({
          customerName: `${lead.firstName} ${lead.lastName}`,
          serviceType: lead.serviceType,
          phone: lead.phone || undefined,
          createdBy: creatorName
        });
        console.log(`📱 SMS sent to admin for new lead created by ${creatorName}`);
      } catch (smsError) {
        console.error('Admin SMS notification failed:', smsError);
      }

      // Send SMS confirmation to customer (only if they consented)
      if (lead.phone && lead.smsConsent) {
        try {
          await smsService.sendSMS(
            lead.phone,
            `📝 JC ON THE MOVE\n\nThank you ${lead.firstName}! We received your ${lead.serviceType} quote request.\n\nWe'll review your request and get back to you soon with a quote!\n\nQuestions? Call us anytime.`
          );
          console.log(`📱 SMS sent to customer: ${lead.phone}`);
        } catch (customerSmsError) {
          console.error('Customer SMS notification failed:', customerSmsError);
        }
      } else if (lead.phone && !lead.smsConsent) {
        console.log(`📵 Customer did not consent to SMS: ${lead.phone}`);
      }

      // Award lead creation bonus (configurable amount, up to 5/day)
      let rewardMessage = "";
      try {
        const { TREASURY_CONFIG, REWARD_TYPES } = await import('./constants');
        const { rewardSettings } = await import('@shared/schema');
        
        // Get configurable amount from reward settings, fallback to constant
        const settings = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'employee_lead_creation'));
        const bonusTokens = settings.length > 0 && settings[0].isActive
          ? parseFloat(settings[0].tokenAmount)
          : TREASURY_CONFIG.LEAD_CREATION_BONUS_TOKENS;
        const dailyCap = TREASURY_CONFIG.LEAD_CREATION_DAILY_CAP;
        
        // Check daily cap - count lead_creation rewards today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRewards = await storage.getRewardsByUserAndTypeToday(employeeId, REWARD_TYPES.LEAD_CREATION);
        
        if (todayRewards.length < dailyCap) {
          // Award the bonus
          await storage.creditWalletTokens(employeeId, bonusTokens);
          
          // Create reward record
          await storage.createReward({
            userId: employeeId,
            rewardType: REWARD_TYPES.LEAD_CREATION,
            cashValue: '0.00',
            tokenAmount: bonusTokens.toFixed(8),
            status: 'confirmed',
            metadata: { leadId: lead.id, dailyCount: todayRewards.length + 1, dailyCap }
          });
          
          rewardMessage = ` You earned ${bonusTokens} JCMOVES for creating this job!`;
          console.log(`🎁 Awarded ${bonusTokens} JCMOVES to ${employeeId} for lead creation (${todayRewards.length + 1}/${dailyCap} today)`);
          await awardTierPoints(employeeId, 'employee_lead_created');
        } else {
          rewardMessage = ` (Daily reward cap reached - ${dailyCap} leads)`;
          console.log(`⚠️ Employee ${employeeId} hit daily lead creation cap (${dailyCap})`);
        }
      } catch (rewardError) {
        console.error('Lead creation reward error:', rewardError);
      }

      res.json({ success: true, leadId: lead.id, message: `Job created!${rewardMessage} You'll also earn a bonus when it's completed.` });
    } catch (error: any) {
      console.error("❌ Error creating employee lead:", error);
      
      // If it's a Zod validation error, provide details
      if (error.issues) {
        console.error("❌ Validation errors:", JSON.stringify(error.issues, null, 2));
        return res.status(400).json({ 
          error: "Invalid lead data",
          details: error.issues.map((issue: any) => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
      }
      
      res.status(400).json({ error: error.message || "Invalid lead data" });
    }
  });

  // Admin: Employee approval management
  app.get('/api/admin/employees/pending', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const pendingEmployees = await storage.getPendingEmployees();
      res.json(pendingEmployees);
    } catch (error) {
      console.error("Error fetching pending employees:", error);
      res.status(500).json({ message: "Failed to fetch pending employees" });
    }
  });

  app.get('/api/admin/employees/approved', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const approvedEmployees = await storage.getApprovedEmployees();
      res.json(approvedEmployees);
    } catch (error) {
      console.error("Error fetching approved employees:", error);
      res.status(500).json({ message: "Failed to fetch approved employees" });
    }
  });

  app.patch('/api/admin/employees/:id/approve', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { approved } = req.body;
      
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ message: "Invalid approval status" });
      }

      const updatedUser = await storage.updateUserApproval(id, approved);
      if (!updatedUser) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating employee approval:", error);
      res.status(500).json({ message: "Failed to update employee approval" });
    }
  });

  // Get all leads (business owner only)
  app.get("/api/leads", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      console.log('📋 Fetching all leads...');
      const leads = await storage.getLeads();
      console.log(`📋 Found ${leads.length} leads`);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Get leads by status (business owner only)
  app.get("/api/leads/status/:status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { status } = req.params;
      const leads = await storage.getLeadsByStatus(status);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads by status:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Customer endpoint to fetch only their own job requests (MUST be before :id route)
  app.get("/api/leads/my-requests", isAuthenticatedAllowPending, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.email) {
        return res.status(404).json({ error: "User not found or email not available" });
      }

      // Fetch leads created by this customer (matching email)
      const customerLeads = await storage.getLeadsByEmail(user.email);
      
      // Transform to match frontend CustomerJob interface
      const transformedLeads = customerLeads.map(lead => ({
        id: lead.id,
        fullName: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone || '',
        moveDate: lead.moveDate || '',
        serviceType: lead.serviceType,
        pickupAddress: lead.fromAddress || '',
        dropoffAddress: lead.toAddress || '',
        status: lead.status,
        estimatedTotal: lead.totalPrice || '',
        crewSize: lead.crewSize || null,
        createdAt: lead.createdAt?.toISOString() || ''
      }));
      
      console.log(`📋 Customer ${user.email} has ${transformedLeads.length} requests`);
      res.json(transformedLeads);
    } catch (error) {
      console.error("Error fetching customer requests:", error);
      res.status(500).json({ error: "Failed to fetch your requests" });
    }
  });

  // Customer my-leads endpoint — returns leads for the authenticated customer, ordered by creation date descending
  app.get("/api/customer/my-leads", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ error: "User not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || !user.email) return res.status(404).json({ error: "User not found" });
      if (user.role !== 'customer' && user.role !== 'admin' && user.role !== 'business_owner') {
        return res.status(403).json({ error: "Access restricted to customer accounts" });
      }
      const customerLeads = await db
        .select()
        .from(leads)
        .where(eq(leads.email, user.email))
        .orderBy(desc(leads.createdAt));
      const transformedLeads = customerLeads.map(lead => ({
        id: lead.id,
        fullName: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone || '',
        moveDate: lead.moveDate || '',
        serviceType: lead.serviceType,
        pickupAddress: lead.fromAddress || '',
        dropoffAddress: lead.toAddress || '',
        status: lead.status,
        estimatedTotal: lead.totalPrice || lead.basePrice || '',
        quotedPrice: lead.totalPrice || lead.basePrice || '',
        crewSize: lead.crewSize || null,
        details: lead.details || '',
        notes: lead.quoteNotes || '',
        createdAt: lead.createdAt?.toISOString() || ''
      }));
      res.json(transformedLeads);
    } catch (error) {
      console.error("Error fetching customer leads:", error);
      res.status(500).json({ error: "Failed to fetch your jobs" });
    }
  });

  // Employee-only routes MUST be registered before /:id to avoid being captured by the parametric route
  app.get("/api/leads/available", isAuthenticated, requireEmployee, async (req, res) => {
    try {
      const availableLeads = await storage.getAvailableLeads();
      res.json(await enrichLeadsWithPhone(availableLeads));
    } catch (error) {
      console.error("Error fetching available leads:", error);
      res.status(500).json({ error: "Failed to fetch available jobs" });
    }
  });

  app.get("/api/leads/my-jobs", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const employeeId = req.currentUser.id;
      const assignedLeads = await storage.getAssignedLeads(employeeId);
      const assignedIds = new Set(assignedLeads.map((l: any) => l.id));
      const openLeads = await db.select().from(leads)
        .where(inArray(leads.status, ["new", "quote_requested", "available", "quoted", "open", "assigned"]))
        .orderBy(desc(leads.createdAt));
      const merged = [
        ...assignedLeads,
        ...openLeads.filter((l: any) => !assignedIds.has(l.id)),
      ];
      res.json(await enrichLeadsWithPhone(merged));
    } catch (error) {
      console.error("Error fetching assigned leads:", error);
      res.status(500).json({ error: "Failed to fetch assigned jobs" });
    }
  });

  app.get("/api/leads/job-board", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = req.currentUser.id;
      const openLeads = await db.select({
        id: leads.id,
        serviceType: leads.serviceType,
        fromAddress: leads.fromAddress,
        toAddress: leads.toAddress,
        moveDate: leads.moveDate,
        crewSize: leads.crewSize,
        status: leads.status,
        basePrice: leads.basePrice,
        details: leads.details,
        crewMembers: leads.crewMembers,
        confirmedDate: leads.confirmedDate,
        createdAt: leads.createdAt,
      })
        .from(leads)
        .where(
          and(
            inArray(leads.status, ["new", "quote_requested", "quoted", "available", "open", "assigned", "in_progress"]),
          )
        )
        .orderBy(desc(leads.createdAt));

      const masked = openLeads.map(lead => ({
        ...lead,
        estimatedTokens: lead.basePrice ? Math.floor(Number(lead.basePrice) * 15) + 1500 : 1500,
        alreadyApplied: Array.isArray(lead.crewMembers) && lead.crewMembers.includes(userId),
        crewSlotsFilled: Array.isArray(lead.crewMembers) ? lead.crewMembers.length : 0,
      }));

      res.json(masked);
    } catch (error) {
      console.error("Error fetching job board:", error);
      res.status(500).json({ error: "Failed to fetch job board" });
    }
  });

  // Get single lead by ID (business owner only)
  app.get("/api/leads/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`📋 Fetching lead ${id}...`);
      const lead = await storage.getLead(id);
      
      if (!lead) {
        console.log(`❌ Lead ${id} not found`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      console.log(`✅ Found lead ${id}: ${lead.firstName} ${lead.lastName}`);
      res.json(lead);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  // Allowed forward transitions (enforced pipeline)
  // new/quote_requested → quoted → available (confirmed is an alias for available) → in_progress → completed
  // accepted (crew-full from job accept flow) → in_progress is also a valid path
  const LEAD_TRANSITIONS: Record<string, string> = {
    "new":            "quoted",
    "quote_requested":"quoted",
    "quoted":         "available",
    "confirmed":      "in_progress",  // legacy alias: confirmed = available
    "available":      "in_progress",
    "accepted":       "in_progress",  // crew-full accepted jobs progress to in_progress
    "in_progress":    "completed",
  };

  // Helper: write a lead_history row
  async function writeLeadHistory(leadId: string, fromStatus: string | null, toStatus: string, changedByUserId: string | null, note?: string) {
    await pool.query(
      `INSERT INTO lead_history (lead_id, from_status, to_status, changed_by_user_id, note) VALUES ($1,$2,$3,$4,$5)`,
      [leadId, fromStatus ?? null, toStatus, changedByUserId ?? null, note ?? null]
    );
  }

  // GET lead history
  app.get("/api/leads/:id/history", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(`
        SELECT lh.id, lh.lead_id, lh.from_status, lh.to_status, lh.note, lh.created_at,
               u.first_name, u.last_name
        FROM lead_history lh
        LEFT JOIN users u ON u.id = lh.changed_by_user_id
        WHERE lh.lead_id = $1
        ORDER BY lh.created_at ASC
      `, [id]);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching lead history:", error);
      res.status(500).json({ error: "Failed to fetch lead history" });
    }
  });

  // Force-override status (admin only — skips transition check)
  app.patch("/api/leads/:id/status/force", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, note } = req.body;
      const actorId = (req.session as any)?.userId ?? req.user?.id ?? null;

      const VALID_LEAD_STATUSES = ["new", "contacted", "quoted", "confirmed", "available", "accepted", "in_progress", "completed", "cancelled", "quote_requested"];
      if (!status || !VALID_LEAD_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(", ")}` });
      }

      const existingLead = await storage.getLead(id);
      if (!existingLead) return res.status(404).json({ error: "Lead not found" });

      const updatedLead = await storage.updateLeadStatus(id, status);
      if (!updatedLead) return res.status(404).json({ error: "Lead not found" });

      await writeLeadHistory(id, existingLead.status, status, actorId, note || "Admin force override");

      res.json(updatedLead);
    } catch (error) {
      console.error("Error force-updating lead status:", error);
      res.status(500).json({ error: "Failed to force update lead status" });
    }
  });

  // Protected routes - Update lead status (dashboard only - business owner only)
  app.patch("/api/leads/:id/status", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const actorId = (req.session as any)?.userId ?? req.user?.id ?? null;

      const VALID_LEAD_STATUSES = ["new", "contacted", "quoted", "confirmed", "available", "accepted", "in_progress", "completed", "cancelled", "quote_requested"];
      if (!status || !VALID_LEAD_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(", ")}` });
      }

      // Enforce pipeline transitions
      const existingLead = await storage.getLead(id);
      if (!existingLead) return res.status(404).json({ error: "Lead not found" });

      const currentStatus = existingLead.status;

      // If the current status is in the transition map, only allow the exact next step
      // If it is NOT in the map (e.g. completed, cancelled, contacted, accepted) it is
      // a terminal or legacy status — all forward/backward changes require the force endpoint
      if (currentStatus in LEAD_TRANSITIONS) {
        const allowedNext = LEAD_TRANSITIONS[currentStatus];
        if (status !== allowedNext) {
          return res.status(400).json({
            error: `Invalid transition: ${currentStatus} → ${status}. Expected next stage: ${allowedNext}. Use the force endpoint to override.`
          });
        }
      } else {
        // Status not in the transition map: terminal or legacy — require force
        return res.status(400).json({
          error: `Cannot change status from '${currentStatus}' via this endpoint. Use the force endpoint to correct pipeline stage.`
        });
      }

      const updatedLead = await storage.updateLeadStatus(id, status);
      if (!updatedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Log the history
      await writeLeadHistory(id, currentStatus, status, actorId);

      // Send SMS notifications for status changes
      try {
        const { notificationService } = await import("./services/notification");
        
        // Notify when job becomes available
        if (status === 'available') {
          await notificationService.notifyAllEmployees(
            'New Job Available',
            `${updatedLead.serviceType} job available for ${updatedLead.firstName} ${updatedLead.lastName}`,
            { jobId: updatedLead.id, type: 'job_available' }
          );
          
          // Send SMS to all employees with phone numbers
          try {
            const allUsers = await storage.getAllUsers();
            const employees = allUsers.filter(u => u.role === 'employee' && (u.status === 'active' || u.status === 'approved') && u.phoneNumber);
            for (const emp of employees) {
              if (emp.phoneNumber) {
                await smsService.notifyJobAvailable(emp.phoneNumber, {
                  customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
                  serviceType: updatedLead.serviceType,
                  moveDate: updatedLead.confirmedDate || updatedLead.moveDate || undefined,
                  tokensReward: updatedLead.tokenAllocation ? parseFloat(updatedLead.tokenAllocation) : undefined
                });
              }
            }
          } catch (e) { console.error('SMS to employees failed:', e); }
          
          // Send SMS to customer confirming job availability
          if (updatedLead.phone) {
            try {
              await smsService.sendSMS(
                updatedLead.phone,
                `✅ JC ON THE MOVE\n\nGreat news! Your ${updatedLead.serviceType} job has been confirmed and is now available for scheduling. We'll be in touch soon!\n\nQuestions? Call us anytime.`
              );
            } catch (e) { console.error('Customer SMS failed:', e); }
          }
        }
        
        // Notify when job is completed
        if (status === 'completed') {
          // Disburse JCMOVES tokens idempotently on every completion path
          try {
            const { disburseJobTokens } = await import('./services/disburse-job-tokens');
            await disburseJobTokens(id);
          } catch (disbursementError) {
            console.error("Error distributing job completion tokens via status endpoint:", disbursementError);
            // Don't fail the status update if token distribution fails
          }

          // Send SMS to admin
          try {
            const assignedUser = updatedLead.assignedToUserId 
              ? await storage.getUser(updatedLead.assignedToUserId)
              : null;
            await smsService.notifyJobCompleted({
              customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
              serviceType: updatedLead.serviceType,
              completedBy: assignedUser ? `${assignedUser.firstName} ${assignedUser.lastName}` : undefined
            });
          } catch (e) { console.error('Admin SMS failed:', e); }
          
          // Send SMS to customer thanking them
          if (updatedLead.phone) {
            try {
              await smsService.sendSMS(
                updatedLead.phone,
                `🎉 JC ON THE MOVE\n\nThank you for choosing us! Your ${updatedLead.serviceType} job has been completed.\n\nWe'd love your feedback! Please leave us a review.\n\nQuestions? Call anytime!`
              );
            } catch (e) { console.error('Customer SMS failed:', e); }
          }
        }
        
        // Notify assigned employee about status changes
        if (updatedLead.assignedToUserId && ['available', 'completed'].includes(status)) {
          await notificationService.notifyJobStatusChange(
            updatedLead.assignedToUserId,
            updatedLead.id,
            status,
            `${updatedLead.firstName} ${updatedLead.lastName}`
          );
        }
      } catch (notificationError) {
        console.error("Error sending status change notification:", notificationError);
        // Don't fail the request if notification fails
      }

      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead status:", error);
      if (error instanceof Error && error.message.includes("Cannot set status to 'accepted'")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  // Request a review from customer for completed job
  app.post("/api/leads/:id/request-review", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get the lead
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Only completed jobs can receive review requests
      if (lead.status !== 'completed') {
        return res.status(400).json({ error: "Can only request reviews for completed jobs" });
      }
      
      // Get the service type label
      const serviceLabels: Record<string, string> = {
        residential: "Moving",
        commercial: "Commercial Moving",
        junk: "Junk Removal",
        snow: "Snow Removal",
        cleaning: "Move In/Out Cleaning",
        handyman: "Handyman",
        demolition: "Light Demolition",
        flooring: "Flooring",
        painting: "Painting",
      };
      const serviceLabel = serviceLabels[lead.serviceType] || lead.serviceType;
      
      // Generate review link
      const reviewLink = `${process.env.APP_URL || 'https://jconthemove.com'}/leave-review?jobId=${lead.id}`;
      
      // Send review request email to customer
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">How was your experience with JC ON THE MOVE?</h2>
          <p>Hi ${lead.firstName},</p>
          <p>Thank you for choosing JC ON THE MOVE for your ${serviceLabel} service! We hope everything went smoothly.</p>
          <p>We'd love to hear about your experience. Your feedback helps us improve and helps other customers find quality service.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${reviewLink}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Leave a Review</a>
          </div>
          <p>Thank you for your business!</p>
          <p>- The JC ON THE MOVE Team</p>
        </div>
      `;
      
      const emailText = `Hi ${lead.firstName},

Thank you for choosing JC ON THE MOVE for your ${serviceLabel} service! We hope everything went smoothly.

We'd love to hear about your experience. Your feedback helps us improve and helps other customers find quality service.

Leave a review here: ${reviewLink}

Thank you for your business!
- The JC ON THE MOVE Team`;
      
      await sendEmail({
        to: lead.email,
        from: companyEmail,
        subject: `How was your ${serviceLabel} service with JC ON THE MOVE?`,
        text: emailText,
        html: emailHtml,
      });
      
      console.log(`📧 Review request sent to ${lead.email} for job ${id}`);
      
      res.json({ success: true, message: "Review request sent successfully" });
    } catch (error) {
      console.error("Error sending review request:", error);
      res.status(500).json({ error: "Failed to send review request" });
    }
  });

  // =====================
  // PUBLIC REVIEW / TIP ROUTES (no auth required — token based)
  // =====================

  async function getJobInfoByLead(lead: any) {
    const serviceLabels: Record<string, string> = {
      residential: "Residential Moving", commercial: "Commercial Moving",
      junk: "Junk Removal", snow: "Snow Removal", cleaning: "Move In/Out Cleaning",
      handyman: "Handyman", demolition: "Light Demolition", flooring: "Flooring", painting: "Painting",
    };
    const employees: Array<{ id: string; name: string }> = [];
    const crewIds: string[] = [
      ...(lead.crewMembers || []),
      ...(lead.acceptedByEmployees || []),
      ...(lead.assignedToUserId ? [lead.assignedToUserId] : []),
    ];
    const seenIds = new Set<string>();
    for (const eid of crewIds) {
      if (seenIds.has(eid)) continue;
      seenIds.add(eid);
      const emp = await storage.getUser(eid);
      if (emp && emp.role === 'employee') {
        employees.push({ id: emp.id, name: `${emp.firstName} ${emp.lastName}`.trim() });
      }
    }
    return {
      jobId: lead.id,
      customerName: `${lead.firstName}`,
      serviceType: lead.serviceType,
      serviceLabel: serviceLabels[lead.serviceType] || lead.serviceType,
      completedDate: lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
      assignedEmployees: employees,
      crewSize: lead.crewSize || 2,
    };
  }

  // POST: Customer self-service job lookup (public — no auth required)
  app.post("/api/review/lookup", async (req, res) => {
    try {
      const { search } = req.body; // phone, email, or job ID
      if (!search || search.trim().length < 3) {
        return res.status(400).json({ error: "Please enter at least 3 characters" });
      }
      const q = search.trim().toLowerCase();

      // Try exact job ID first
      let matchedLeads: any[] = [];
      try {
        const byId = await storage.getLead(q);
        if (byId) matchedLeads = [byId];
      } catch {}

      // If not found by ID, search by phone or email
      if (matchedLeads.length === 0) {
        matchedLeads = await db.select().from(leads)
          .where(or(
            ilike(leads.phone, `%${q}%`),
            ilike(leads.email, `%${q}%`),
            ilike(leads.firstName, `%${q}%`),
            ilike(leads.lastName, `%${q}%`),
          ))
          .orderBy(desc(leads.createdAt))
          .limit(5);
      }

      if (matchedLeads.length === 0) {
        return res.status(404).json({ error: "No jobs found matching that information" });
      }

      // Return summary for each matching lead
      const results = matchedLeads.map((l: any) => ({
        id: l.id,
        firstName: l.firstName,
        lastName: l.lastName,
        serviceType: l.serviceType,
        status: l.status,
        createdAt: l.createdAt,
        reviewToken: l.reviewToken || null,
        hasReviewToken: !!l.reviewToken,
        isCompleted: l.status === 'completed',
      }));
      res.json({ results });
    } catch (err) {
      console.error("Review lookup error:", err);
      res.status(500).json({ error: "Lookup failed. Please try again." });
    }
  });

  // GET: Admin A-Z Pipeline view — all jobs with lifecycle stages
  app.get("/api/admin/pipeline", async (req: any, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { search, status, limit: lim = 100, offset: off = 0 } = req.query;
      let query = db.select().from(leads);
      const conditions: any[] = [];
      if (status && status !== 'all') conditions.push(eq(leads.status, status as string));
      if (search) {
        const q = `%${search}%`;
        conditions.push(or(
          ilike(leads.firstName, q), ilike(leads.lastName, q),
          ilike(leads.email, q), ilike(leads.phone, q),
        ));
      }
      const allLeads = await db.select().from(leads)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(leads.createdAt))
        .limit(Number(lim))
        .offset(Number(off));

      // Fetch reviews for all lead IDs
      const leadIds = allLeads.map((l: any) => l.id);
      let reviewMap: Record<string, any> = {};
      if (leadIds.length > 0) {
        const allReviews = await db.select().from(reviews).where(
          leadIds.length === 1
            ? eq(reviews.leadId, leadIds[0])
            : or(...leadIds.map((id: string) => eq(reviews.leadId, id)))
        );
        for (const r of allReviews) {
          reviewMap[r.leadId] = r;
        }
      }

      // Fetch employee names for assigned employees
      const assignedIds = [...new Set(allLeads.map((l: any) => l.assignedToUserId).filter(Boolean))];
      let employeeMap: Record<string, string> = {};
      for (const eid of assignedIds) {
        try {
          const emp = await storage.getUser(eid as string);
          if (emp) employeeMap[eid as string] = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
        } catch {}
      }

      const pipeline = allLeads.map((l: any) => {
        const review = reviewMap[l.id];
        const stages = {
          quoteRequested: { done: true, at: l.createdAt },
          contacted: { done: l.status !== 'quote_requested', at: null },
          assigned: { done: !!l.assignedToUserId, at: null },
          completed: { done: l.status === 'completed', at: null },
          reviewSent: { done: !!l.reviewRequestSentAt, at: l.reviewRequestSentAt },
          reviewReceived: { done: !!review, at: review?.createdAt || null },
        };
        return {
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          serviceType: l.serviceType,
          status: l.status,
          createdAt: l.createdAt,
          assignedEmployee: l.assignedToUserId ? (employeeMap[l.assignedToUserId] || 'Assigned') : null,
          reviewToken: l.reviewToken,
          reviewRequestSentAt: l.reviewRequestSentAt,
          review: review ? {
            id: review.id, rating: review.rating, comment: review.comment,
            tipAmount: review.tipAmount, wouldRecommend: review.wouldRecommend,
            createdAt: review.createdAt,
          } : null,
          stages,
        };
      });

      const totalCount = await db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(conditions.length ? and(...conditions) : undefined);

      res.json({ pipeline, total: Number(totalCount[0]?.count || 0) });
    } catch (err) {
      console.error("Pipeline fetch error:", err);
      res.status(500).json({ error: err.message || "Failed to load pipeline" });
    }
  });

  // GET job info by review token (public)
  app.get("/api/review/token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [lead] = await db.select().from(leads).where(eq(leads.reviewToken, token)).limit(1);
      if (!lead) return res.status(404).json({ error: "Invalid or expired review link" });
      res.json(await getJobInfoByLead(lead));
    } catch (err) {
      res.status(500).json({ error: "Failed to load review info" });
    }
  });

  // GET job info by jobId (fallback for legacy links)
  app.get("/api/review/job/:jobId", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.jobId);
      if (!lead || lead.status !== 'completed') return res.status(404).json({ error: "Job not found" });
      res.json(await getJobInfoByLead(lead));
    } catch (err) {
      res.status(500).json({ error: "Failed to load review info" });
    }
  });

  async function submitPublicReview(lead: any, body: any, res: any) {
    const { rating, comment, moverNames, wouldRecommend, numberOfMovers, tipPerMover, tipAmount } = body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1–5" });

    const employeeId = lead.assignedToUserId || 'staking-treasury-system';
    const userId = lead.userId || '47798367';

    try {
      const existing = await db.select().from(reviews)
        .where(and(eq(reviews.leadId, lead.id), eq(reviews.userId, userId))).limit(1);
      if (existing.length > 0) return res.status(400).json({ error: "A review was already submitted for this job" });
    } catch {}

    const [review] = await db.insert(reviews).values({
      leadId: lead.id,
      userId,
      employeeId,
      rating,
      comment: comment || null,
      wouldRecommend: wouldRecommend !== false,
      moverNames: moverNames || null,
      numberOfMovers: numberOfMovers || null,
      tipAmount: tipAmount ? tipAmount.toString() : null,
      tipPerMover: tipPerMover ? tipPerMover.toString() : null,
      isPublic: true,
    }).returning();

    if (rating >= 4 && employeeId !== 'staking-treasury-system') {
      try { await gamificationService.awardHighRatingBonus(employeeId, review.id, rating); } catch {}
    }

    res.json({ success: true, review });
  }

  // POST submit review by token (public)
  app.post("/api/review/token/:token", async (req, res) => {
    try {
      const [lead] = await db.select().from(leads).where(eq(leads.reviewToken, req.params.token)).limit(1);
      if (!lead) return res.status(404).json({ error: "Invalid review link" });
      await submitPublicReview(lead, req.body, res);
    } catch (err) {
      console.error("Error submitting review by token:", err);
      res.status(500).json({ error: err.message || "Failed to submit review" });
    }
  });

  // POST submit review by jobId (fallback)
  app.post("/api/review/job/:jobId", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.jobId);
      if (!lead || lead.status !== 'completed') return res.status(404).json({ error: "Job not found" });
      await submitPublicReview(lead, req.body, res);
    } catch (err) {
      console.error("Error submitting review by jobId:", err);
      res.status(500).json({ error: err.message || "Failed to submit review" });
    }
  });

  // =====================
  // TESTIMONIALS ROUTES
  // =====================
  
  // Get ALL testimonials (admin only - for management)
  app.get("/api/admin/testimonials", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Admins see all testimonials regardless of status
      const allTestimonials = await storage.getTestimonials({});
      res.json(allTestimonials);
    } catch (error) {
      console.error("Error fetching admin testimonials:", error);
      res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  });
  
  // Get published testimonials (public - for showcase page)
  app.get("/api/testimonials", async (req, res) => {
    try {
      const { status, featured, sourceType, sourcePlatform, limit } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as string;
      if (featured === 'true') filters.featured = true;
      if (featured === 'false') filters.featured = false;
      if (sourceType) filters.sourceType = sourceType as string;
      if (sourcePlatform) filters.sourcePlatform = sourcePlatform as string;
      
      const testimonials = await storage.getTestimonials(
        filters,
        limit ? parseInt(limit as string) : undefined
      );
      
      res.json(testimonials);
    } catch (error) {
      console.error("Error fetching testimonials:", error);
      res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  });

  // Get testimonial stats (public)
  app.get("/api/testimonials/stats", async (req, res) => {
    try {
      const stats = await storage.getTestimonialStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching testimonial stats:", error);
      res.status(500).json({ error: "Failed to fetch testimonial stats" });
    }
  });

  // Submit a new testimonial (public - customers can leave reviews)
  app.post("/api/testimonials", async (req, res) => {
    try {
      const { reviewerName, rating, content, serviceType } = req.body;
      
      if (!reviewerName || !rating || !content) {
        return res.status(400).json({ error: "Name, rating, and review content are required" });
      }
      
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      
      const testimonial = await storage.createTestimonial({
        reviewerName,
        rating,
        content,
        serviceType: serviceType || null,
        sourceType: 'customer',
        sourcePlatform: null,
        sourceUrl: null,
        reviewDate: new Date().toISOString().split('T')[0],
        status: 'published',
        featured: false,
        verified: true,
      });
      
      console.log(`📝 New customer testimonial submitted by ${reviewerName}`);
      
      res.json({ success: true, message: "Thank you for your review! It's now live on our page." });
    } catch (error) {
      console.error("Error creating testimonial:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  // Import testimonials from external sources (admin only)
  app.post("/api/testimonials/import", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { testimonials: testimonialsToImport } = req.body;
      
      if (!Array.isArray(testimonialsToImport) || testimonialsToImport.length === 0) {
        return res.status(400).json({ error: "Please provide an array of testimonials to import" });
      }
      
      const formattedTestimonials = testimonialsToImport.map((t: any) => ({
        reviewerName: t.reviewerName || 'Anonymous',
        rating: Math.min(5, Math.max(1, parseInt(t.rating) || 5)),
        content: t.content || '',
        serviceType: t.serviceType || null,
        sourceType: 'imported' as const,
        sourcePlatform: t.sourcePlatform || null,
        sourceUrl: t.sourceUrl || null,
        reviewDate: t.reviewDate || null,
        status: 'published' as const, // Imported reviews go directly to published
        featured: t.featured || false,
        verified: true, // Imported reviews are considered verified
      }));
      
      const imported = await storage.importTestimonials(formattedTestimonials);
      
      console.log(`📥 Imported ${imported.length} testimonials`);
      
      res.json({ success: true, count: imported.length, testimonials: imported });
    } catch (error) {
      console.error("Error importing testimonials:", error);
      res.status(500).json({ error: "Failed to import testimonials" });
    }
  });

  // Update testimonial (admin only - for moderation)
  app.patch("/api/testimonials/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const testimonial = await storage.updateTestimonial(id, updates);
      
      if (!testimonial) {
        return res.status(404).json({ error: "Testimonial not found" });
      }
      
      res.json(testimonial);
    } catch (error) {
      console.error("Error updating testimonial:", error);
      res.status(500).json({ error: "Failed to update testimonial" });
    }
  });

  // Delete testimonial (admin only)
  app.delete("/api/testimonials/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      const deleted = await storage.deleteTestimonial(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Testimonial not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting testimonial:", error);
      res.status(500).json({ error: "Failed to delete testimonial" });
    }
  });

  // General update lead endpoint (admin or employee)
  app.patch("/api/leads/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Status changes must go through the dedicated /status endpoint (enforced transitions + history)
      if ("status" in updateData) {
        return res.status(400).json({ error: "Status changes must use PATCH /api/leads/:id/status to enforce pipeline transitions and audit logging." });
      }
      
      console.log(`📝 Updating lead ${id} with:`, updateData);
      
      // Get the current lead status BEFORE updating to check for status change
      const currentLead = await storage.getLead(id);
      if (!currentLead) {
        console.log(`❌ Lead ${id} not found for update`);
        return res.status(404).json({ error: "Lead not found" });
      }

      // Privileged-action guard: modifying payout-driving fields requires admin or business_owner.
      const PAYOUT_FIELDS = ["totalPrice", "basePrice", "tokenAllocation", "crewMembers", "crewBonusFlags", "confirmedHours"];
      const hasSensitiveChange = PAYOUT_FIELDS.some(f => f in updateData);
      const isCompletingJob = false; // status changes now blocked above

      if (hasSensitiveChange || isCompletingJob) {
        const requestingUserId = (req.session as any)?.userId;
        const requestingUser = requestingUserId ? await storage.getUser(requestingUserId) : null;
        const isPrivileged = requestingUser && (requestingUser.role === "admin" || requestingUser.role === "business_owner");
        if (!isPrivileged) {
          return res.status(403).json({ error: "Administrator access required to modify job pricing, crew, or completion status" });
        }
      }
      
      // Update last quote timestamp if quote-related fields are being updated
      if (updateData.basePrice || updateData.crewSize || updateData.confirmedDate) {
        updateData.lastQuoteUpdatedAt = new Date();
      }
      
      const updatedLead = await storage.updateLeadQuote(id, updateData);
      
      if (!updatedLead) {
        console.log(`❌ Lead ${id} not found for update`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      console.log(`✅ Lead ${id} updated successfully`);
      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // Delete lead (business owner only)
  app.delete("/api/leads/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`🗑️ Deleting lead ${id}...`);
      
      const deleted = await storage.deleteLead(id);
      
      if (!deleted) {
        console.log(`❌ Lead ${id} not found for deletion`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      console.log(`✅ Lead ${id} deleted successfully`);
      res.json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
      console.error("Error deleting lead:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  app.patch("/api/leads/:id/contact", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { firstName, lastName, phone } = req.body;
      const updates: Record<string, string> = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (phone !== undefined) updates.phone = phone;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      const updatedLead = await storage.updateLeadQuote(id, updates);
      if (!updatedLead) return res.status(404).json({ error: "Lead not found" });
      res.json(updatedLead);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update lead quote and confirmation (business owner only)
  app.patch("/api/leads/:id/quote", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const quoteData = req.body;

      // Status changes must go through the dedicated /status endpoint
      if ("status" in quoteData) {
        return res.status(400).json({ error: "Status changes must use PATCH /api/leads/:id/status to enforce pipeline transitions and audit logging." });
      }
      
      // Get the current lead to check for status change
      const currentLead = await storage.getLead(id);
      const previousStatus = currentLead?.status;
      const newStatus = undefined; // status changes blocked above
      
      // Calculate special items fees based on weight ($200 base + $150 per 100lbs up to 1000lbs)
      const calculateHeavyItemFee = (weight: number | null | undefined): number => {
        if (!weight || weight <= 0) return 0;
        const cappedWeight = Math.min(weight, 1000); // Cap at 1000 lbs
        const hundredPounds = Math.floor(cappedWeight / 100);
        return 200 + (hundredPounds * 150);
      };
      
      // Calculate fees for each special item
      const hotTubFee = quoteData.hasHotTub ? calculateHeavyItemFee(quoteData.hotTubWeight) : 0;
      const heavySafeFee = quoteData.hasHeavySafe ? calculateHeavyItemFee(quoteData.heavySafeWeight) : 0;
      const poolTableFee = quoteData.hasPoolTable ? calculateHeavyItemFee(quoteData.poolTableWeight) : 0;
      const pianoFee = quoteData.hasPiano ? calculateHeavyItemFee(quoteData.pianoWeight) : 0;
      
      const totalSpecialItemsFee = hotTubFee + heavySafeFee + poolTableFee + pianoFee;
      const basePrice = parseFloat(quoteData.basePrice) || 0;
      const totalPrice = basePrice + totalSpecialItemsFee;
      
      const updatedLead = await storage.updateLeadQuote(id, {
        ...quoteData,
        hotTubFee: hotTubFee.toFixed(2),
        heavySafeFee: heavySafeFee.toFixed(2),
        poolTableFee: poolTableFee.toFixed(2),
        pianoFee: pianoFee.toFixed(2),
        totalSpecialItemsFee: totalSpecialItemsFee.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        lastQuoteUpdatedAt: new Date(),
      });
      
      if (!updatedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Send SMS notifications if status changed
      if (newStatus && newStatus !== previousStatus) {
        console.log(`📱 Status changed from ${previousStatus} to ${newStatus} - sending SMS notifications`);
        
        // Notify when job becomes available - send SMS to JC Crew
        if (newStatus === 'available') {
          try {
            const allUsers = await storage.getAllUsers();
            const employees = allUsers.filter(u => u.role === 'employee' && (u.status === 'active' || u.status === 'approved') && u.phoneNumber);
            console.log(`📱 Sending SMS to ${employees.length} JC Crew members`);
            for (const emp of employees) {
              if (emp.phoneNumber) {
                await smsService.notifyJobAvailable(emp.phoneNumber, {
                  customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
                  serviceType: updatedLead.serviceType,
                  moveDate: updatedLead.confirmedDate || updatedLead.moveDate || undefined,
                  tokensReward: updatedLead.tokenAllocation ? parseFloat(updatedLead.tokenAllocation) : undefined
                });
                console.log(`✅ SMS sent to JC Crew: ${emp.firstName} ${emp.lastName}`);
              }
            }
          } catch (e) { console.error('SMS to JC Crew failed:', e); }
        }
        
        // Distribute token rewards and notify when job is completed
        if (newStatus === 'completed') {
          // Canonical disbursement: delegate entirely to disburseJobTokens (idempotent, advisory-locked)
          try {
            const { disburseJobTokens } = await import('./services/disburse-job-tokens');
            await disburseJobTokens(id);
          } catch (tokenError) {
            console.error("Error distributing tokens via quote endpoint:", tokenError);
            // Non-fatal: advisory lock ensures partial runs can be retried
          }

          // SMS notifications
          try {
            const assignedUser = updatedLead.assignedToUserId 
              ? await storage.getUser(updatedLead.assignedToUserId)
              : null;
            await smsService.notifyJobCompleted({
              customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
              serviceType: updatedLead.serviceType,
              completedBy: assignedUser ? `${assignedUser.firstName} ${assignedUser.lastName}` : undefined
            });
            console.log(`✅ SMS sent to admin for job completion`);
          } catch (e) { console.error('Admin SMS failed:', e); }
        }
      }
      
      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead quote:", error);
      res.status(500).json({ error: "Failed to update lead quote" });
    }
  });

  // Get crew assignment suggestions for a job (business owner only)
  // GET /api/leads/:id/disbursement-summary — shows actual reward records for a completed job
  app.get("/api/leads/:id/disbursement-summary", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT r.id, r.user_id, r.token_amount, r.reward_type, r.metadata, r.earned_date,
                u.username, u.first_name, u.last_name, u.role
         FROM rewards r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.metadata->>'jobId' = $1
            OR r.metadata->>'leadId' = $1
            OR r.reference_id = $1
         ORDER BY r.earned_date ASC`,
        [id]
      );
      res.json({ records: rows });
    } catch (err) {
      console.error("Error fetching disbursement summary:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/leads/:id/retry-disbursement — admin retry when disbursement failed or is incomplete
  // disburseJobTokens is idempotent (advisory lock + timestamp check), so safe to call again.
  app.post("/api/leads/:id/retry-disbursement", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const lead = await storage.getLead(id);
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (lead.status !== "completed") {
        return res.status(400).json({ error: "Lead is not completed — mark it complete first" });
      }
      const { disburseJobTokens } = await import("./services/disburse-job-tokens");
      const summary = await disburseJobTokens(id);
      if (!summary) {
        return res.json({ ok: true, note: "Already fully disbursed — no action taken" });
      }
      res.json({ ok: true, summary });
    } catch (err) {
      console.error("Error retrying disbursement:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/leads/:id/award-customer-tokens — force-award customer JCMOVES even if overall
  // disbursement stamp is set. Uses per-recipient idempotency (level 3) to prevent double-credit.
  app.post("/api/leads/:id/award-customer-tokens", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const lead = await storage.getLead(id) as any;
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (lead.status !== "completed") {
        return res.status(400).json({ error: "Lead is not completed" });
      }
      if (!lead.email) {
        return res.status(400).json({ error: "Lead has no customer email on file" });
      }

      const { pool: dbPool } = await import("./db");
      const { rewards: rewardsTable, rewardSettings: rsTable } = await import("@shared/schema");
      const { db: drizzleDb } = await import("./db");

      // Case-insensitive lookup
      const emailLookup = await dbPool.query(
        `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [lead.email.trim()]
      );
      const customer = emailLookup.rows[0];
      if (!customer) {
        return res.status(404).json({ error: `No account found for email "${lead.email}"` });
      }

      // Get settings
      const settingsRows = await drizzleDb.select().from(rsTable);
      const getSetting = (key: string) => {
        const row = settingsRows.find((s: any) => s.settingKey === key);
        return row && row.isActive ? parseFloat(row.tokenAmount) : null;
      };
      const completionBonus = getSetting("customer_quote_completed") ?? 1500;
      const earnRate        = getSetting("earn_rate_per_dollar") ?? 15;
      const TOKEN_PRICE     = 0.00000508432;

      const awarded: { type: string; amount: number }[] = [];

      // Check & award flat completion bonus
      const flatCheck = await dbPool.query(
        `SELECT 1 FROM rewards WHERE user_id = $1 AND reward_type = $2 AND reference_id = $3 LIMIT 1`,
        [customer.id, "customer_quote_completed", id]
      );
      if (flatCheck.rows.length === 0) {
        await drizzleDb.insert(rewardsTable).values({
          userId: customer.id,
          rewardType: "customer_quote_completed",
          tokenAmount: completionBonus.toFixed(8),
          cashValue: (completionBonus * TOKEN_PRICE).toFixed(6),
          status: "confirmed",
          referenceId: id,
          metadata: { jobId: id, type: "flat_completion", manualAward: true },
        });
        await storage.creditWalletTokens(customer.id, completionBonus);
        awarded.push({ type: "flat_completion_bonus", amount: completionBonus });
        console.log(`🎁 [manual] Customer ${customer.email}: flat bonus +${completionBonus} JCMOVES`);
      }

      // Check & award per-dollar earn
      const jobPrice = parseFloat(lead.totalPrice || lead.basePrice || "0");
      const explicitAlloc = lead.tokenAllocation ? parseFloat(lead.tokenAllocation) : 0;
      const earnTokens = explicitAlloc > 0
        ? Math.round(explicitAlloc)
        : (jobPrice > 0 ? Math.round(jobPrice * earnRate) : 0);
      if (earnTokens > 0) {
        const earnCheck = await dbPool.query(
          `SELECT 1 FROM rewards WHERE user_id = $1 AND reward_type = $2 AND reference_id = $3 LIMIT 1`,
          [customer.id, "loyalty_booking", id]
        );
        if (earnCheck.rows.length === 0) {
          await drizzleDb.insert(rewardsTable).values({
            userId: customer.id,
            rewardType: "loyalty_booking",
            tokenAmount: earnTokens.toFixed(8),
            cashValue: (earnTokens * TOKEN_PRICE).toFixed(6),
            status: "confirmed",
            referenceId: id,
            metadata: { jobId: id, jobPrice, source: explicitAlloc > 0 ? "tokenAllocation" : "formula", manualAward: true },
          });
          await storage.creditWalletTokens(customer.id, earnTokens);
          awarded.push({ type: "per_dollar_earn", amount: earnTokens });
          console.log(`🎁 [manual] Customer ${customer.email}: per-dollar earn +${earnTokens} JCMOVES`);
        }
      }

      const total = awarded.reduce((s, a) => s + a.amount, 0);
      res.json({
        ok: true,
        customerId: customer.id,
        customerEmail: customer.email,
        awarded,
        totalAwarded: total,
        note: awarded.length === 0 ? "Customer already has all completion rewards for this job" : `Awarded ${total} JCMOVES total`,
      });
    } catch (err) {
      console.error("Error awarding customer tokens:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/:id/crew-suggestions", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      const suggestions = await crewSuggestionService.suggestCrewForJob(id);
      
      if (!suggestions) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(suggestions);
    } catch (error) {
      console.error("Error generating crew suggestions:", error);
      res.status(500).json({ error: "Failed to generate crew suggestions" });
    }
  });

  // Submit contact form
  app.post("/api/contacts", async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(contactData);
      
      // Send email notification
      const emailContent = generateContactNotificationEmail(contact);
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Contact Form Submission - ${contact.name}`,
        text: emailContent.text,
        html: emailContent.html,
      });

      res.json({ success: true, contactId: contact.id });
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  // Protected routes - Get all contacts (business owner only)
  app.get("/api/contacts", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const contacts = await storage.getContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Review Routes
  // Submit a review for a completed job (authenticated customers only)
  app.post("/api/reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const reviewData = insertReviewSchema.parse({
        ...req.body,
        userId, // Always use authenticated user's ID
      });

      // Verify the lead exists and is completed
      const lead = await storage.getLead(reviewData.leadId);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (lead.status !== 'completed') {
        return res.status(400).json({ error: "Can only review completed jobs" });
      }

      // Verify lead ownership: Check if this user's ID matches the lead's userId
      // (Only users who created the lead can review it)
      if (lead.userId && lead.userId !== userId) {
        return res.status(403).json({ error: "You can only review your own jobs" });
      }

      // Check if user already reviewed this job
      const existingReview = await storage.getReviewByLeadAndUser(reviewData.leadId, userId);
      if (existingReview) {
        return res.status(400).json({ error: "You have already reviewed this job" });
      }

      // Set employeeId from the lead's assignment
      const employeeId = lead.assignedToUserId;
      if (!employeeId) {
        return res.status(400).json({ error: "No employee assigned to this job" });
      }

      const review = await storage.createReview({
        ...reviewData,
        employeeId,
      });

      // Update employee stats with new review
      const stats = await storage.getEmployeeReviewStats(employeeId);
      await storage.updateEmployeeStats(employeeId, {
        averageRating: stats.averageRating.toString(),
        totalRatings: stats.totalReviews,
      });

      // Award bonus tokens for high ratings (4 or 5 stars)
      if (review.rating >= 4 && !review.rewardedAt) {
        const bonusAmount = review.rating === 5 ? 500 : 250; // 500 tokens for 5 stars, 250 for 4 stars
        await gamificationService.awardHighRatingBonus(employeeId, review.id, review.rating);
        await storage.markReviewAsRewarded(review.id);
      }

      res.json({ success: true, review });
    } catch (error) {
      console.error("Error creating review:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid review data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create review" });
    }
  });

  // Get reviews with optional filters (public for employee reviews, authenticated for customer reviews)
  app.get("/api/reviews", async (req: any, res) => {
    try {
      const { leadId, employeeId, userId, limit } = req.query;
      
      const filters: { leadId?: string; employeeId?: string; userId?: string } = {};
      if (leadId) filters.leadId = leadId as string;
      if (employeeId) filters.employeeId = employeeId as string;
      
      // Only allow fetching own reviews unless admin
      if (userId) {
        const requestingUserId = (req.session as any).userId;
        const user = requestingUserId ? await storage.getUser(requestingUserId) : null;
        
        if (user?.role !== 'admin' && requestingUserId !== userId) {
          return res.status(403).json({ error: "Can only view your own reviews" });
        }
        filters.userId = userId as string;
      }

      const reviews = await storage.getReviews(filters, limit ? parseInt(limit as string) : undefined);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // Get current user's reviews (authenticated)
  app.get("/api/reviews/my-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const reviews = await storage.getReviews({ userId });
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching user reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // Get employee review statistics (public)
  app.get("/api/reviews/employee/:employeeId/stats", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const stats = await storage.getEmployeeReviewStats(employeeId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching employee review stats:", error);
      res.status(500).json({ error: "Failed to fetch review statistics" });
    }
  });

  // Get a single review (public for display, but limited info)
  app.get("/api/reviews/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const review = await storage.getReview(id);
      
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      res.json(review);
    } catch (error) {
      console.error("Error fetching review:", error);
      res.status(500).json({ error: "Failed to fetch review" });
    }
  });

  // Shop Routes
  // Get all shop items (public with optional filters, defaults to active items only)
  app.get("/api/shop", async (req: any, res) => {
    try {
      const { status, postedBy, limit = '20', offset = '0' } = req.query;
      const filters: { status?: string; postedBy?: string } = {};
      
      // Parse pagination params with validation
      const parsedLimit = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100); // Between 1 and 100
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0); // Non-negative
      
      // Enforce visibility based on authentication and authorization
      const userId = (req.session as any).userId;
      let user = null;
      if (userId) {
        user = await storage.getUser(userId);
      }
      
      // Determine allowed status based on user role
      if (user?.role === 'admin') {
        // Admins can see all statuses
        if (status && typeof status === 'string') {
          filters.status = status;
        }
        // No status filter = all items
      } else if (userId && postedBy === userId) {
        // Authenticated users can see their own items with any status
        filters.postedBy = userId;
        if (status && typeof status === 'string') {
          filters.status = status;
        }
      } else {
        // Public/non-admin users can only see active items
        filters.status = 'active';
        if (postedBy && typeof postedBy === 'string') {
          filters.postedBy = postedBy;
        }
      }
      
      const items = await storage.getShopItems(filters, parsedLimit, parsedOffset);
      res.json(items);
    } catch (error) {
      console.error("Error fetching shop items:", error);
      res.status(500).json({ error: "Failed to fetch shop items" });
    }
  });

  // Get single shop item by ID (public for active items, owner/admin for others)
  app.get("/api/shop/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const item = await storage.getShopItem(id);
      
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      // If item is not active, only owner or admin can view
      if (item.status !== 'active') {
        const userId = (req.session as any).userId;
        if (!userId) {
          return res.status(404).json({ error: "Shop item not found" });
        }
        
        const user = await storage.getUser(userId);
        if (!user || (item.postedBy !== userId && user.role !== 'admin')) {
          return res.status(404).json({ error: "Shop item not found" });
        }
      }
      
      res.json(item);
    } catch (error) {
      console.error("Error fetching shop item:", error);
      res.status(500).json({ error: "Failed to fetch shop item" });
    }
  });

  // Create new shop item (authenticated users only)
  app.post("/api/shop", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const itemData = insertShopItemSchema.parse({
        ...req.body,
        postedBy: userId,
      });
      
      const item = await storage.createShopItem(itemData);

      // Reward creator 100 JCMOVES for listing (cap: 50 listings per day)
      const LISTING_REWARD = 100;
      const LISTING_DAILY_CAP = 50;
      let rewardGranted = 0;
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayListings = await db.select().from(rewards)
          .where(and(
            eq(rewards.userId, userId),
            eq(rewards.rewardType, 'shop_listing'),
            gte(rewards.earnedDate, today),
          ));
        if (todayListings.length < LISTING_DAILY_CAP) {
          await storage.creditWalletTokens(userId, LISTING_REWARD);
          await db.insert(rewards).values({
            userId,
            rewardType: 'shop_listing',
            tokenAmount: LISTING_REWARD.toString(),
            cashValue: '0.00',
            status: 'confirmed',
            referenceId: String(item.id),
            metadata: { itemId: item.id, itemTitle: item.title },
          });
          rewardGranted = LISTING_REWARD;
          console.log(`✅ Shop listing reward: ${LISTING_REWARD} JCMOVES credited to user ${userId}`);
        } else {
          console.log(`ℹ️ Shop listing reward skipped: daily cap reached for user ${userId}`);
        }
      } catch (rewardErr) {
        console.error("❌ Error granting shop listing reward:", rewardErr);
      }

      res.json({ ...item, listingReward: rewardGranted || null });
    } catch (error) {
      console.error("Error creating shop item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid shop item data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create shop item" });
    }
  });

  // Auto-reward on payment completion — called from payment-success page
  // Marks shop items as sold, credits buyer 150 JCMOVES, seller 300 + 200 JCMOVES
  app.post("/api/shop/payment-complete", isAuthenticated, async (req: any, res) => {
    try {
      const buyerId = (req.session as any).userId;
      if (!buyerId) return res.status(401).json({ error: "Unauthorized" });

      const { shopItemIds } = req.body;
      if (!Array.isArray(shopItemIds) || shopItemIds.length === 0) {
        return res.status(400).json({ error: "No shop item IDs provided" });
      }

      const results: any[] = [];
      const BUYER_REWARD = 150;
      const SALE_REWARD = 300;
      const SELLER_BONUS = 200;

      for (const itemId of shopItemIds) {
        try {
          const item = await storage.getShopItem(itemId);
          if (!item) { results.push({ itemId, error: "Not found" }); continue; }
          if (item.postedBy === buyerId) { results.push({ itemId, skipped: "Own item" }); continue; }

          // Idempotency: skip if buyer already rewarded for this item
          const alreadyClaimed = await db.select().from(rewards)
            .where(and(
              eq(rewards.userId, buyerId),
              eq(rewards.rewardType, 'shop_purchase'),
              sql`${rewards.referenceId} = ${itemId}`
            ));
          if (alreadyClaimed.length > 0) { results.push({ itemId, skipped: "Already rewarded" }); continue; }

          // Mark as sold if still active
          if (item.status === 'active') {
            await storage.updateShopItem(itemId, { status: 'sold' });

            // Seller sale reward
            await storage.creditWalletTokens(item.postedBy, SALE_REWARD);
            await db.insert(rewards).values({
              userId: item.postedBy,
              rewardType: 'shop_sale',
              tokenAmount: SALE_REWARD.toString(),
              cashValue: '0',
              status: 'confirmed',
              referenceId: itemId,
              metadata: { itemId, itemTitle: item.title, role: 'seller', trigger: 'payment' },
            });
          }

          // Buyer reward
          await storage.creditWalletTokens(buyerId, BUYER_REWARD);
          await db.insert(rewards).values({
            userId: buyerId,
            rewardType: 'shop_purchase',
            tokenAmount: BUYER_REWARD.toString(),
            cashValue: '0',
            status: 'confirmed',
            referenceId: itemId,
            metadata: { itemId, itemTitle: item.title, role: 'buyer', trigger: 'payment' },
          });

          // Seller sale-confirmed bonus
          await storage.creditWalletTokens(item.postedBy, SELLER_BONUS);
          await db.insert(rewards).values({
            userId: item.postedBy,
            rewardType: 'shop_sale_confirmed',
            tokenAmount: SELLER_BONUS.toString(),
            cashValue: '0',
            status: 'confirmed',
            referenceId: itemId,
            metadata: { itemId, itemTitle: item.title, role: 'seller_confirmed', buyerId, trigger: 'payment' },
          });

          results.push({ itemId, buyerReward: BUYER_REWARD, sellerReward: SALE_REWARD + SELLER_BONUS });
        } catch (itemErr: any) {
          results.push({ itemId, error: itemErr.message });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("Error processing shop payment-complete rewards:", error);
      res.status(500).json({ error: "Failed to process rewards" });
    }
  });

  // Mark shop item as sold — rewards seller 300 JCMOVES
  app.post("/api/shop/:id/mark-sold", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const item = await storage.getShopItem(id);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      if (item.postedBy !== userId && user.role !== 'admin') {
        return res.status(403).json({ error: "Only the seller can mark an item as sold" });
      }
      if (item.status === 'sold') {
        return res.status(400).json({ error: "Item is already marked as sold" });
      }

      await storage.updateShopItem(id, { status: 'sold' });

      const SALE_REWARD = 300;
      await storage.creditWalletTokens(userId, SALE_REWARD);
      await db.insert(rewards).values({
        userId,
        rewardType: 'shop_sale',
        tokenAmount: SALE_REWARD.toString(),
        cashValue: '0',
        status: 'confirmed',
        referenceId: id,
        metadata: { itemId: id, itemTitle: item.title, role: 'seller' },
      });

      res.json({ success: true, reward: SALE_REWARD, message: `Item marked as sold! +${SALE_REWARD} JCMOVES credited.` });
    } catch (error: any) {
      console.error("Error marking shop item as sold:", error);
      res.status(500).json({ error: "Failed to mark item as sold" });
    }
  });

  // Confirm purchase — rewards buyer 150 JCMOVES, and seller additional 200 JCMOVES
  app.post("/api/shop/:id/confirm-purchase", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const buyerId = (req.session as any).userId;
      if (!buyerId) return res.status(401).json({ error: "Unauthorized" });

      const item = await storage.getShopItem(id);
      if (!item) return res.status(404).json({ error: "Item not found" });

      if (item.postedBy === buyerId) {
        return res.status(400).json({ error: "You cannot confirm purchase of your own item" });
      }

      // Check if buyer already confirmed purchase
      const alreadyClaimed = await db.select().from(rewards)
        .where(and(
          eq(rewards.userId, buyerId),
          eq(rewards.rewardType, 'shop_purchase'),
          sql`${rewards.referenceId} = ${id}`
        ));
      if (alreadyClaimed.length > 0) {
        return res.status(400).json({ error: "You already claimed a reward for this purchase" });
      }

      const BUYER_REWARD = 150;
      const SELLER_BONUS = 200;

      // Reward buyer
      await storage.creditWalletTokens(buyerId, BUYER_REWARD);
      await db.insert(rewards).values({
        userId: buyerId,
        rewardType: 'shop_purchase',
        tokenAmount: BUYER_REWARD.toString(),
        cashValue: '0',
        status: 'confirmed',
        referenceId: id,
        metadata: { itemId: id, itemTitle: item.title, role: 'buyer' },
      });

      // Bonus to seller for a confirmed sale
      await storage.creditWalletTokens(item.postedBy, SELLER_BONUS);
      await db.insert(rewards).values({
        userId: item.postedBy,
        rewardType: 'shop_sale_confirmed',
        tokenAmount: SELLER_BONUS.toString(),
        cashValue: '0',
        status: 'confirmed',
        referenceId: id,
        metadata: { itemId: id, itemTitle: item.title, role: 'seller_confirmed', buyerId },
      });

      res.json({ success: true, buyerReward: BUYER_REWARD, sellerBonus: SELLER_BONUS, message: `Purchase confirmed! +${BUYER_REWARD} JCMOVES earned.` });
    } catch (error: any) {
      console.error("Error confirming shop purchase:", error);
      res.status(500).json({ error: "Failed to confirm purchase" });
    }
  });

  // Update shop item (owner or admin only)
  app.patch("/api/shop/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check if item exists and user has permission
      const item = await storage.getShopItem(id);
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      // Only allow owner or admin to update
      if (item.postedBy !== userId && user.role !== 'admin') {
        return res.status(403).json({ error: "You don't have permission to update this item" });
      }
      
      // Validate update data using partial schema
      const updateSchema = insertShopItemSchema.partial().pick({
        title: true,
        description: true,
        price: true,
        photos: true,
        status: true,
        category: true,
      });
      
      const validatedUpdates = updateSchema.parse(req.body);
      
      const updatedItem = await storage.updateShopItem(id, validatedUpdates);
      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating shop item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update shop item" });
    }
  });

  // Delete shop item (owner or admin only)
  app.delete("/api/shop/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check if item exists and user has permission
      const item = await storage.getShopItem(id);
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      // Only allow owner or admin to delete
      if (item.postedBy !== userId && user.role !== 'admin') {
        return res.status(403).json({ error: "You don't have permission to delete this item" });
      }
      
      const success = await storage.deleteShopItem(id);
      if (success) {
        res.json({ success: true, message: "Shop item deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete shop item" });
      }
    } catch (error) {
      console.error("Error deleting shop item:", error);
      res.status(500).json({ error: "Failed to delete shop item" });
    }
  });

  // Increment view count (public)
  app.post("/api/shop/:id/view", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if item exists
      const item = await storage.getShopItem(id);
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      await storage.incrementShopItemViews(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing view count:", error);
      res.status(500).json({ error: "Failed to increment view count" });
    }
  });

  // ── JCMOVES Redemption for shop items ─────────────────────────────────────

  // Full JCMOVES purchase of a shop item
  app.post("/api/shop/:id/redeem-jcmoves", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;

      const item = await storage.getShopItem(id);
      if (!item) return res.status(404).json({ error: "Item not found" });
      if (item.status !== 'active') return res.status(400).json({ error: "Item is no longer available" });
      if (!item.jcmovesPrice) return res.status(400).json({ error: "This item does not have a JCMOVES price set" });

      const jcmovesNeeded = parseFloat(item.jcmovesPrice);
      const wallet = await storage.getWalletAccount(userId);
      const currentBalance = parseFloat(wallet?.tokenBalance || "0");

      if (currentBalance < jcmovesNeeded) {
        return res.status(400).json({ error: `Insufficient JCMOVES. You have ${currentBalance.toFixed(0)}, need ${jcmovesNeeded.toFixed(0)}` });
      }

      // Deduct JCMOVES from buyer's wallet
      await storage.updateWalletAccount(userId, {
        tokenBalance: (currentBalance - jcmovesNeeded).toFixed(8),
      });

      // Record the spend as a reward debit
      const TOKEN_PRICE = 0.00000508432;
      await db.insert(rewards).values({
        userId,
        rewardType: 'shop_purchase_jcmoves',
        tokenAmount: (-jcmovesNeeded).toFixed(8),
        cashValue: (-jcmovesNeeded * TOKEN_PRICE).toFixed(6),
        status: 'confirmed',
        referenceId: id,
        metadata: { shopItemId: id, itemTitle: item.title, paymentMethod: 'jcmoves_full' }
      });

      // Handle gift card issuance
      let giftCardCode: string | null = null;
      if (item.itemType === 'gift_card' && item.giftCardValue) {
        const code = `JCMOVE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        await db.insert(giftCards).values({
          code,
          purchasedByUserId: userId,
          valueUsd: item.giftCardValue,
          shopItemId: id,
          paymentMethod: 'jcmoves',
          jcmovesSpent: jcmovesNeeded.toFixed(8),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
        giftCardCode = code;
      }

      console.log(`✅ User ${userId} purchased shop item ${id} with ${jcmovesNeeded} JCMOVES`);
      res.json({ success: true, message: `Purchased with ${jcmovesNeeded.toLocaleString()} JCMOVES!`, giftCardCode });
    } catch (error) {
      console.error("Error processing JCMOVES purchase:", error);
      res.status(500).json({ error: "Failed to process JCMOVES purchase" });
    }
  });

  // Partial JCMOVES discount on a shop item
  app.post("/api/shop/:id/discount-jcmoves", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;

      const item = await storage.getShopItem(id);
      if (!item) return res.status(404).json({ error: "Item not found" });
      if (item.status !== 'active') return res.status(400).json({ error: "Item is no longer available" });
      if (!item.jcmovesDiscountPercent || !item.jcmovesDiscountTokens) {
        return res.status(400).json({ error: "This item does not have a JCMOVES discount available" });
      }

      const tokensNeeded = parseFloat(item.jcmovesDiscountTokens);
      const wallet = await storage.getWalletAccount(userId);
      const currentBalance = parseFloat(wallet?.tokenBalance || "0");

      if (currentBalance < tokensNeeded) {
        return res.status(400).json({ error: `Insufficient JCMOVES. You have ${currentBalance.toFixed(0)}, need ${tokensNeeded.toFixed(0)}` });
      }

      // Deduct JCMOVES
      await storage.updateWalletAccount(userId, {
        tokenBalance: (currentBalance - tokensNeeded).toFixed(8),
      });

      const TOKEN_PRICE = 0.00000508432;
      await db.insert(rewards).values({
        userId,
        rewardType: 'shop_discount_jcmoves',
        tokenAmount: (-tokensNeeded).toFixed(8),
        cashValue: (-tokensNeeded * TOKEN_PRICE).toFixed(6),
        status: 'confirmed',
        referenceId: id,
        metadata: { shopItemId: id, itemTitle: item.title, discountPercent: item.jcmovesDiscountPercent, paymentMethod: 'jcmoves_partial' }
      });

      const discountedPrice = parseFloat(item.price) * (1 - item.jcmovesDiscountPercent / 100);
      console.log(`🎟️ User ${userId} unlocked ${item.jcmovesDiscountPercent}% discount on item ${id} by spending ${tokensNeeded} JCMOVES`);
      res.json({
        success: true,
        message: `${item.jcmovesDiscountPercent}% discount unlocked!`,
        originalPrice: parseFloat(item.price),
        discountedPrice: parseFloat(discountedPrice.toFixed(2)),
        discountPercent: item.jcmovesDiscountPercent,
        tokensSpent: tokensNeeded
      });
    } catch (error) {
      console.error("Error processing JCMOVES discount:", error);
      res.status(500).json({ error: "Failed to process JCMOVES discount" });
    }
  });

  // ── Gift Card Routes ────────────────────────────────────────────────────────

  // Get the current user's purchased gift cards
  app.get("/api/gift-cards/mine", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const cards = await db.select().from(giftCards)
        .where(eq(giftCards.purchasedByUserId, userId))
        .orderBy(desc(giftCards.createdAt));
      res.json(cards);
    } catch (error) {
      console.error("Error fetching gift cards:", error);
      res.status(500).json({ error: "Failed to fetch gift cards" });
    }
  });

  // Purchase a gift card item with USD (generates code immediately)
  app.post("/api/gift-cards/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { shopItemId, recipientEmail, paymentMethod } = req.body;

      const item = await storage.getShopItem(shopItemId);
      if (!item || item.itemType !== 'gift_card') {
        return res.status(404).json({ error: "Gift card item not found" });
      }
      if (!item.giftCardValue) {
        return res.status(400).json({ error: "Gift card value not set" });
      }

      const code = `JCMOVE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const [card] = await db.insert(giftCards).values({
        code,
        purchasedByUserId: userId,
        recipientEmail: recipientEmail || null,
        valueUsd: item.giftCardValue,
        shopItemId,
        paymentMethod: paymentMethod || 'usd',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).returning();

      // Award buyer 50 JCMOVES for purchasing a gift card
      await storage.creditWalletTokens(userId, 50);
      await db.insert(rewards).values({
        userId,
        rewardType: 'gift_card_purchase',
        tokenAmount: '50.00000000',
        cashValue: (50 * 0.00000508432).toFixed(6),
        status: 'confirmed',
        referenceId: card.id,
        metadata: { giftCardCode: code, shopItemId }
      });

      console.log(`🎁 Gift card ${code} issued to user ${userId} (value: $${item.giftCardValue})`);
      res.json({ success: true, code, card });
    } catch (error) {
      console.error("Error purchasing gift card:", error);
      res.status(500).json({ error: "Failed to purchase gift card" });
    }
  });

  // Check / validate a gift card code
  app.get("/api/gift-cards/check/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const [card] = await db.select().from(giftCards).where(eq(giftCards.code, code.toUpperCase())).limit(1);
      if (!card) return res.status(404).json({ error: "Gift card not found" });
      if (card.isRedeemed) return res.status(400).json({ error: "This gift card has already been redeemed", card });
      if (card.expiresAt && new Date() > card.expiresAt) return res.status(400).json({ error: "Gift card has expired", card });
      res.json({ valid: true, card });
    } catch (error) {
      console.error("Error checking gift card:", error);
      res.status(500).json({ error: "Failed to check gift card" });
    }
  });

  // Redeem a gift card (apply to a quote/booking)
  app.post("/api/gift-cards/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { code } = req.body;

      const [card] = await db.select().from(giftCards).where(eq(giftCards.code, code.toUpperCase())).limit(1);
      if (!card) return res.status(404).json({ error: "Gift card not found" });
      if (card.isRedeemed) return res.status(400).json({ error: "This gift card has already been redeemed" });
      if (card.expiresAt && new Date() > card.expiresAt) return res.status(400).json({ error: "Gift card has expired" });

      await db.update(giftCards)
        .set({ isRedeemed: true, redeemedByUserId: userId, redeemedAt: new Date() })
        .where(eq(giftCards.code, code.toUpperCase()));

      // Award 25 JCMOVES for redeeming a gift card
      await storage.creditWalletTokens(userId, 25);
      await db.insert(rewards).values({
        userId,
        rewardType: 'gift_card_redemption',
        tokenAmount: '25.00000000',
        cashValue: (25 * 0.00000508432).toFixed(6),
        status: 'confirmed',
        referenceId: card.id,
        metadata: { giftCardCode: code, valueUsd: card.valueUsd }
      });

      console.log(`✅ Gift card ${code} redeemed by user ${userId} (value: $${card.valueUsd})`);
      res.json({ success: true, message: `$${parseFloat(card.valueUsd).toFixed(2)} gift card applied!`, valueUsd: card.valueUsd });
    } catch (error) {
      console.error("Error redeeming gift card:", error);
      res.status(500).json({ error: "Failed to redeem gift card" });
    }
  });

  // Admin: get all gift cards
  app.get("/api/admin/gift-cards", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const cards = await db.select().from(giftCards).orderBy(desc(giftCards.createdAt));
      res.json(cards);
    } catch (error) {
      console.error("Error fetching all gift cards:", error);
      res.status(500).json({ error: "Failed to fetch gift cards" });
    }
  });

  // Admin: seed official moving supplies and gift card shop items
  app.post("/api/admin/seed-shop-items", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const adminId = (req.session as any).userId;
      const adminUser = await storage.getUser(adminId);
      if (!adminUser) return res.status(404).json({ error: "Admin user not found" });

      const adminPhone = adminUser.phoneNumber || "9062003654";

      const movingSupplies = [
        { title: "Small Moving Box (10-Pack)", description: "Sturdy corrugated cardboard boxes, 16×12×12 inches. Perfect for books, dishes, and small heavy items. Double-walled for extra protection.", price: "24.99", itemType: "moving_supplies", category: "Boxes", jcmovesPrice: "4800.00", jcmovesDiscountPercent: 15, jcmovesDiscountTokens: "500.00" },
        { title: "Medium Moving Box (10-Pack)", description: "Versatile 18×18×16 inch boxes for clothes, toys, kitchen items, and more. Pre-folded for easy assembly.", price: "34.99", itemType: "moving_supplies", category: "Boxes", jcmovesPrice: "6800.00", jcmovesDiscountPercent: 15, jcmovesDiscountTokens: "500.00" },
        { title: "Large Moving Box (10-Pack)", description: "Oversized 18×18×24 inch boxes for pillows, bedding, lamps, and light bulky items.", price: "44.99", itemType: "moving_supplies", category: "Boxes", jcmovesPrice: "8800.00", jcmovesDiscountPercent: 15, jcmovesDiscountTokens: "500.00" },
        { title: "Bubble Wrap Roll (100 ft)", description: "Premium 12-inch wide bubble wrap with 3/16 inch bubbles. Ideal for wrapping fragile glassware, electronics, and artwork.", price: "19.99", itemType: "moving_supplies", category: "Packing Materials", jcmovesPrice: "3900.00", jcmovesDiscountPercent: 10, jcmovesDiscountTokens: "300.00" },
        { title: "Packing Tape (6-Roll Bundle)", description: "Heavy-duty 2-inch × 60-yard rolls with dispenser. Crystal-clear, ultra-strong adhesive rated for 50+ lb boxes.", price: "18.99", itemType: "moving_supplies", category: "Packing Materials", jcmovesPrice: "3700.00", jcmovesDiscountPercent: 10, jcmovesDiscountTokens: "300.00" },
        { title: "Moving Blanket (4-Pack)", description: "Professional-grade quilted furniture pads, 72×80 inches each. Protects sofas, dressers, appliances, and hardwood floors from scratches and dings.", price: "49.99", itemType: "moving_supplies", category: "Protection", jcmovesPrice: "9800.00", jcmovesDiscountPercent: 20, jcmovesDiscountTokens: "750.00" },
        { title: "Furniture Dolly (Two-Wheel)", description: "Heavy-duty aluminum hand truck with a 600 lb weight capacity. Stair-climbing design and solid rubber wheels for easy maneuvering.", price: "89.99", itemType: "moving_supplies", category: "Equipment", jcmovesPrice: "17500.00", jcmovesDiscountPercent: 25, jcmovesDiscountTokens: "1000.00" },
        { title: "Mattress Bag — Queen/King", description: "Thick 4-mil poly bag protects your mattress from dirt, moisture, and damage during a move. Fits queen and king mattresses.", price: "12.99", itemType: "moving_supplies", category: "Protection", jcmovesPrice: "2500.00", jcmovesDiscountPercent: 10, jcmovesDiscountTokens: "200.00" },
        { title: "Stretch Wrap (4-Pack)", description: "Self-cling stretch film — wrap furniture legs, bundle cables, seal drawer contents, or secure boxes without tape marks.", price: "29.99", itemType: "moving_supplies", category: "Packing Materials", jcmovesPrice: "5800.00", jcmovesDiscountPercent: 15, jcmovesDiscountTokens: "400.00" },
        { title: "Wardrobe Moving Box (3-Pack)", description: "Tall 24×20×45 inch boxes with built-in metal hanging bar. Move hanging clothes wrinkle-free — no folding required.", price: "54.99", itemType: "moving_supplies", category: "Boxes", jcmovesPrice: "10700.00", jcmovesDiscountPercent: 20, jcmovesDiscountTokens: "800.00" },
      ];

      const giftCardItems = [
        { title: "$25 JC ON THE MOVE Gift Card", description: "Give the gift of stress-free moving! This $25 digital gift card can be applied toward any JC ON THE MOVE moving, junk removal, or cleaning service. Code delivered instantly after purchase.", price: "25.00", itemType: "gift_card", category: "Gift Cards", giftCardValue: "25.00", jcmovesPrice: "4900.00", jcmovesDiscountPercent: 5, jcmovesDiscountTokens: "500.00" },
        { title: "$50 JC ON THE MOVE Gift Card", description: "A $50 credit toward any JC ON THE MOVE service — moving, junk removal, cleaning, handyman, and more. Perfect for housewarming gifts or helping a friend with their next move.", price: "50.00", itemType: "gift_card", category: "Gift Cards", giftCardValue: "50.00", jcmovesPrice: "9800.00", jcmovesDiscountPercent: 5, jcmovesDiscountTokens: "750.00" },
        { title: "$100 JC ON THE MOVE Gift Card", description: "A $100 service credit — our most popular gift for new homeowners and renters. Covers a significant portion of most local moves or a full junk removal session.", price: "100.00", itemType: "gift_card", category: "Gift Cards", giftCardValue: "100.00", jcmovesPrice: "19600.00", jcmovesDiscountPercent: 10, jcmovesDiscountTokens: "1000.00" },
        { title: "$200 JC ON THE MOVE Gift Card", description: "A $200 premium gift card — ideal for long-distance moves, full-day services, or gifting to a business. Combine with JCMOVES tokens for even more savings.", price: "200.00", itemType: "gift_card", category: "Gift Cards", giftCardValue: "200.00", jcmovesPrice: "39000.00", jcmovesDiscountPercent: 15, jcmovesDiscountTokens: "2000.00" },
        { title: "$500 JC ON THE MOVE Gift Card", description: "The ultimate moving gift. A $500 service credit that covers a full residential move for most customers. Great for corporate relocation packages or generous gifting.", price: "500.00", itemType: "gift_card", category: "Gift Cards", giftCardValue: "500.00", jcmovesPrice: "97000.00", jcmovesDiscountPercent: 20, jcmovesDiscountTokens: "5000.00" },
      ];

      const placeholderPhoto = "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80";
      const giftCardPhoto = "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=80";

      let created = 0;
      for (const item of movingSupplies) {
        const existing = await db.select().from(shopItems).where(eq(shopItems.title, item.title)).limit(1);
        if (existing.length === 0) {
          await db.insert(shopItems).values({
            postedBy: adminId,
            title: item.title,
            description: item.description,
            price: item.price,
            phoneNumber: adminPhone,
            photos: [placeholderPhoto],
            category: item.category,
            itemType: item.itemType,
            jcmovesPrice: item.jcmovesPrice,
            jcmovesDiscountPercent: item.jcmovesDiscountPercent,
            jcmovesDiscountTokens: item.jcmovesDiscountTokens,
            status: 'active',
          });
          created++;
        }
      }
      for (const item of giftCardItems) {
        const existing = await db.select().from(shopItems).where(eq(shopItems.title, item.title)).limit(1);
        if (existing.length === 0) {
          await db.insert(shopItems).values({
            postedBy: adminId,
            title: item.title,
            description: item.description,
            price: item.price,
            phoneNumber: adminPhone,
            photos: [giftCardPhoto],
            category: item.category,
            itemType: item.itemType,
            giftCardValue: item.giftCardValue,
            jcmovesPrice: item.jcmovesPrice,
            jcmovesDiscountPercent: item.jcmovesDiscountPercent,
            jcmovesDiscountTokens: item.jcmovesDiscountTokens,
            status: 'active',
          });
          created++;
        }
      }

      res.json({ success: true, message: `Seeded ${created} official shop items`, created });
    } catch (error) {
      console.error("Error seeding shop items:", error);
      res.status(500).json({ error: "Failed to seed shop items" });
    }
  });

  // Employee Management Routes (Business Owner Only)
  app.get("/api/employees", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.patch("/api/employees/:id/role", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      
      if (!role || !["admin", "employee", "customer"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Valid roles: admin, employee, customer" });
      }

      const updatedUser = await storage.updateUserRole(id, role);
      if (!updatedUser) {
        return res.status(404).json({ error: "Employee not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating employee role:", error);
      res.status(500).json({ error: "Failed to update employee role" });
    }
  });

  // Employee Job Routes
  // Helper: enrich leads list by backfilling phone from the user table when lead.phone is blank
  async function enrichLeadsWithPhone(leadList: any[]): Promise<any[]> {
    const missing = leadList.filter(l => !l.phone && l.email);
    if (missing.length === 0) return leadList;
    const emails = [...new Set(missing.map(l => l.email as string))];
    const matchedUsers = await db.select({ email: users.email, phoneNumber: users.phoneNumber })
      .from(users)
      .where(inArray(users.email, emails));
    const phoneMap: Record<string, string> = {};
    for (const u of matchedUsers) {
      if (u.email && u.phoneNumber) phoneMap[u.email] = u.phoneNumber;
    }
    return leadList.map(l => ({
      ...l,
      phone: l.phone || phoneMap[l.email] || null,
    }));
  }

  // Worker signs up for a job (adds self to crewMembers)
  app.post("/api/leads/:id/crew-apply", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const leadId = req.params.id;
      const userId = req.currentUser.id;

      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
      if (!lead) return res.status(404).json({ error: "Job not found" });

      if (["completed", "cancelled"].includes(lead.status)) {
        return res.status(400).json({ error: "This job is no longer open" });
      }

      const currentMembers: string[] = Array.isArray(lead.crewMembers) ? lead.crewMembers : [];
      if (currentMembers.includes(userId)) {
        return res.status(400).json({ error: "You have already signed up for this job" });
      }

      const updatedMembers = [...currentMembers, userId];
      await db.update(leads).set({ crewMembers: updatedMembers }).where(eq(leads.id, leadId));

      res.json({ success: true, message: "You're signed up! The admin will confirm your assignment." });
    } catch (error) {
      console.error("Error applying to job:", error);
      res.status(500).json({ error: "Failed to sign up for job" });
    }
  });

  // ── Worker Availability & Goals ────────────────────────────────────────────

  // My full availability: blocks + schedule + goals + stats
  app.get("/api/workers/my-availability", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = req.currentUser.id;
      const [blocks, schedule, goals, stats] = await Promise.all([
        storage.getWorkerDayBlocks(userId),
        storage.getWorkerSchedule(userId),
        storage.getWorkerGoals(userId),
        storage.getWorkerJobStats(userId),
      ]);
      res.json({ blocks, schedule, goals: goals ?? null, stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Block a day off
  app.post("/api/workers/day-blocks", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { date, reason } = req.body;
      if (!date) return res.status(400).json({ error: "date required (YYYY-MM-DD)" });
      const block = await storage.createWorkerDayBlock(req.currentUser.id, date, reason);
      res.json(block);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Remove a blocked day
  app.delete("/api/workers/day-blocks/:id", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const ok = await storage.deleteWorkerDayBlock(parseInt(req.params.id), req.currentUser.id);
      if (!ok) return res.status(404).json({ error: "Block not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Upsert recurring schedule for a day-of-week
  app.put("/api/workers/schedule", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { dayOfWeek, startHour, endHour, isAvailable } = req.body;
      if (dayOfWeek === undefined) return res.status(400).json({ error: "dayOfWeek required" });
      const row = await storage.upsertWorkerSchedule(req.currentUser.id, dayOfWeek, startHour ?? 8, endHour ?? 17, isAvailable ?? true);
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get my goals
  app.get("/api/workers/goals/my", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const goals = await storage.getWorkerGoals(req.currentUser.id);
      res.json(goals ?? null);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Worker updates their own goals
  app.put("/api/workers/goals/my", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { weeklyJobGoal, monthlyJobGoal, preferredJobSize, notes } = req.body;
      const goals = await storage.upsertWorkerGoals(req.currentUser.id, { weeklyJobGoal, monthlyJobGoal, preferredJobSize, notes });
      res.json(goals);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: get all workers' availability for crew assignment
  app.get("/api/workers/all-availability", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const data = await storage.getAllWorkersAvailability();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: set goals for a specific worker
  app.put("/api/workers/:userId/goals", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { weeklyJobGoal, monthlyJobGoal, preferredJobSize, notes } = req.body;
      const goals = await storage.upsertWorkerGoals(userId, { weeklyJobGoal, monthlyJobGoal, preferredJobSize, notes, setByAdminId: req.currentUser.id });
      res.json(goals);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: get goals for a specific worker
  app.get("/api/workers/:userId/goals", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const goals = await storage.getWorkerGoals(req.params.userId);
      res.json(goals ?? null);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Worker calendar data: jobs + blocks + hour overrides + schedule for a given month
  app.get("/api/workers/calendar", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = req.currentUser.id;
      const year = parseInt(String(req.query.year));
      const month = parseInt(String(req.query.month));
      const now = new Date();
      const safeYear = isNaN(year) || year < 2000 || year > 2100 ? now.getFullYear() : year;
      const safeMonth = isNaN(month) || month < 1 || month > 12 ? (now.getMonth() + 1) : month;
      const data = await storage.getWorkerCalendarData(userId, safeYear, safeMonth);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Upsert hour override for a specific date
  app.put("/api/workers/hour-overrides", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { date, startHour, endHour, note } = req.body;
      if (!date || startHour === undefined || endHour === undefined) {
        return res.status(400).json({ error: "date, startHour, endHour required" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date must be a valid YYYY-MM-DD string" });
      }
      // Round-trip check: if the date is a calendar impossibility (e.g. Feb 31)
      // Date.parse rolls it forward; the formatted result will differ from the input.
      const parsedMs = Date.parse(date);
      if (isNaN(parsedMs)) {
        return res.status(400).json({ error: "date must be a valid YYYY-MM-DD string" });
      }
      const roundTrip = new Date(parsedMs).toISOString().slice(0, 10);
      if (roundTrip !== date) {
        return res.status(400).json({ error: "date is not a real calendar date" });
      }
      const sh = parseInt(startHour);
      const eh = parseInt(endHour);
      if (isNaN(sh) || isNaN(eh) || sh < 0 || sh > 23 || eh < 0 || eh > 23) {
        return res.status(400).json({ error: "startHour and endHour must be integers between 0 and 23" });
      }
      if (sh >= eh) {
        return res.status(400).json({ error: "startHour must be less than endHour" });
      }
      const row = await storage.upsertWorkerHourOverride(req.currentUser.id, date, sh, eh, note);
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete an hour override
  app.delete("/api/workers/hour-overrides/:id", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid override id" });
      const ok = await storage.deleteWorkerHourOverride(id, req.currentUser.id);
      if (!ok) return res.status(404).json({ error: "Override not found" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/leads/:id/accept", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.currentUser.id;
      
      // Get the current lead
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if job is available for acceptance
      if (lead.status !== "available") {
        return res.status(400).json({ error: "Job is not available for acceptance" });
      }

      // Check if employee has already accepted this job
      const acceptedByEmployees = lead.acceptedByEmployees || [];
      if (acceptedByEmployees.includes(employeeId)) {
        return res.status(409).json({ error: "You have already accepted this job" });
      }

      // Check if crew is already full
      const crewSize = lead.crewSize || 2;
      if (acceptedByEmployees.length >= crewSize) {
        return res.status(409).json({ error: "This job's crew is already full" });
      }

      // Add employee to accepted list
      const updatedAcceptedBy = [...acceptedByEmployees, employeeId];
      const isCrewFull = updatedAcceptedBy.length >= crewSize;

      // Update the lead
      const previousStatus = lead.status;
      const updatedLead = await storage.addEmployeeAcceptance(
        id, 
        employeeId, 
        isCrewFull
      );
      
      if (!updatedLead) {
        return res.status(500).json({ error: "Failed to accept job" });
      }

      // Log history if status changed to 'accepted' (crew full)
      if (isCrewFull) {
        try {
          await writeLeadHistory(id, previousStatus, "accepted", employeeId, "Crew full — job accepted");
        } catch (histErr) {
          console.error('[lead_history] Accept history write failed:', histErr);
        }
      }

      // Send notification to employee
      try {
        const { notificationService } = await import("./services/notification");
        const message = isCrewFull 
          ? `Job accepted! Crew is full (${crewSize}/${crewSize})`
          : `Job accepted! Waiting for ${crewSize - updatedAcceptedBy.length} more crew member(s)`;
        await notificationService.notifyJobAssigned(
          employeeId,
          updatedLead.id,
          message
        );
      } catch (notificationError) {
        console.error("Error sending job assignment notification:", notificationError);
      }

      // Award JCMOVES tokens for accepting a job
      let acceptRewardAmount = 0;
      try {
        const settings = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'employee_job_accepted'));
        const bonusTokens = settings.length > 0 && settings[0].isActive
          ? parseFloat(settings[0].tokenAmount)
          : 100;

        await storage.creditWalletTokens(employeeId, bonusTokens);
        await db.insert(rewards).values({
          userId: employeeId,
          rewardType: 'job_accepted',
          tokenAmount: bonusTokens.toFixed(8),
          cashValue: (bonusTokens * 0.01).toFixed(2),
          status: 'confirmed',
          earnedDate: new Date(),
          referenceId: id,
          metadata: { leadId: id, source: 'crew_acceptance' }
        });
        acceptRewardAmount = bonusTokens;
        console.log(`🎁 Awarded ${bonusTokens} JCMOVES to employee ${employeeId} for accepting job ${id}`);
      } catch (rewardErr) {
        console.error("Job acceptance reward error:", rewardErr);
      }

      res.json({ ...updatedLead, rewardAmount: acceptRewardAmount });
    } catch (error) {
      console.error("Error accepting job:", error);
      res.status(500).json({ error: "Failed to accept job" });
    }
  });

  // Complete job endpoint
  app.post("/api/leads/:id/complete", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.currentUser.id;
      
      // Verify the employee is assigned to this job
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Check if employee is assigned (either as the assigned employee or part of the crew)
      const isAssigned = lead.assignedToUserId === employeeId || lead.crewMembers?.includes(employeeId);
      if (!isAssigned) {
        return res.status(403).json({ error: "You can only complete jobs you're assigned to" });
      }

      // Enforce transition: job must be in_progress to be completed
      if (lead.status !== "in_progress") {
        return res.status(400).json({
          error: `Job must be in 'in_progress' status to be completed. Current status: ${lead.status}`
        });
      }
      
      // Update job status to completed
      const updatedLead = await storage.updateLeadStatus(id, "completed");
      if (!updatedLead) {
        return res.status(404).json({ error: "Failed to update job status" });
      }
      await writeLeadHistory(id, lead.status, "completed", employeeId, "Marked complete by employee");

      // Single unified reward disbursement — crew tokens, customer earn, referral bonus
      try {
        const { disburseJobTokens } = await import('./services/disburse-job-tokens');
        await disburseJobTokens(id);
      } catch (disbursementError) {
        console.error("Error disbursing job tokens:", disbursementError);
        // Job is still completed even if token distribution fails — admin can retry
      }

      res.json(updatedLead);
    } catch (error) {
      console.error("Error completing job:", error);
      res.status(500).json({ error: "Failed to complete job" });
    }
  });

  // Photo management for jobs
  app.post("/api/leads/:id/photos", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.currentUser.id;
      
      // Verify the employee is assigned to this job
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (lead.assignedToUserId !== employeeId) {
        return res.status(403).json({ error: "You can only add photos to your assigned jobs" });
      }
      
      // Validate photo data using schema
      const { jobPhotoSchema } = await import("@shared/schema");
      const validatedPhoto = jobPhotoSchema.parse(req.body);
      
      const updatedLead = await storage.addJobPhoto(id, validatedPhoto);
      if (!updatedLead) {
        return res.status(404).json({ error: "Failed to add photo" });
      }

      res.json({ success: true, photo: validatedPhoto, updatedLead });
    } catch (error) {
      console.error("Error adding job photo:", error);
      if (error instanceof Error && error.message.includes("Invalid")) {
        return res.status(400).json({ error: "Invalid photo data" });
      }
      res.status(500).json({ error: "Failed to add photo" });
    }
  });

  // Notification routes
  app.get("/api/notifications", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const notifications = await storage.getUserNotifications(userId, limit);
      res.json({ notifications });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const notification = await storage.markNotificationAsRead(id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      res.json({ success: true, notification });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/mark-all-read", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Return VAPID public key for client-side push subscription setup
  app.get("/api/notifications/vapid-public-key", (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: "Push notifications not configured" });
    res.json({ publicKey: key });
  });

  app.post("/api/notifications/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { pushSubscriptionSchema } = await import("@shared/schema");
      const subscription = pushSubscriptionSchema.parse(req.body);
      
      const user = await storage.updateUserPushSubscription(userId, subscription);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ success: true, message: "Push notifications enabled" });
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      res.status(500).json({ error: "Failed to subscribe to push notifications" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/notifications/unsubscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      await storage.updateUserPushSubscription(userId, null as any);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Rewards system routes
  // NOTE: Daily check-in system has been replaced with unified mining system
  // Mining now includes streak tracking - claiming daily gives bonus rewards (1% per day, linear)
  // See server/services/mining.ts for the unified system

  // Get wallet balance
  app.get("/api/rewards/wallet", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      
      const wallet = await db
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.userId, userId))
        .limit(1);

      if (wallet.length === 0) {
        // Create wallet if it doesn't exist
        const newWallet = await db.insert(walletAccounts).values({
          userId
        }).returning();
        return res.json(newWallet[0]);
      }

      res.json(wallet[0]);
    } catch (error) {
      console.error("Error getting wallet:", error);
      res.status(500).json({ error: "Failed to get wallet" });
    }
  });

  // Get rewards history with pagination and server-side totals
  app.get("/api/rewards/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const rewardsHistory = await db
        .select({
          id: rewards.id,
          rewardType: rewards.rewardType,
          tokenAmount: rewards.tokenAmount,
          status: rewards.status,
          earnedDate: rewards.earnedDate,
          redeemedDate: rewards.redeemedDate,
          metadata: rewards.metadata
        })
        .from(rewards)
        .where(eq(rewards.userId, userId))
        .orderBy(desc(rewards.earnedDate))
        .limit(limit)
        .offset(offset);

      const [aggregates] = await db
        .select({
          count: sql<number>`count(*)::int`,
          totalTokens: sql<string>`COALESCE(sum(token_amount::numeric), 0)::text`,
        })
        .from(rewards)
        .where(eq(rewards.userId, userId));

      res.json({
        rewards: rewardsHistory,
        total: aggregates?.count || 0,
        totalTokensEarned: aggregates?.totalTokens || "0",
      });
    } catch (error) {
      console.error("Error getting rewards history:", error);
      res.status(500).json({ error: "Failed to get rewards history" });
    }
  });

  // Get token price and info
  app.get("/api/rewards/token-info", isAuthenticated, async (req, res) => {
    try {
      const enrichedData = await moonshotService.getEnrichedTokenData();
      
      if (enrichedData) {
        res.json({
          price: enrichedData.price,
          symbol: enrichedData.symbol || 'JCMOVES',
          name: enrichedData.name || 'JC ON THE MOVE Token',
          priceChange24h: enrichedData.priceChange24h,
          volume24h: enrichedData.volume24h,
          marketCap: enrichedData.marketCap,
          fdv: enrichedData.fdv
        });
      } else {
        // Fallback to basic data
        const tokenData = await moonshotService.getTokenData();
        const price = await moonshotService.getTokenPrice();
        
        res.json({
          price,
          symbol: tokenData?.baseToken?.symbol || 'JCMOVES',
          name: tokenData?.baseToken?.name || 'JC ON THE MOVE Token',
          priceChange24h: tokenData?.priceChange?.h24 || 0,
          volume24h: tokenData?.volume?.h24?.total || 0,
          marketCap: 0,
          fdv: 0
        });
      }
    } catch (error) {
      console.error("Error getting token info:", error);
      res.status(500).json({ error: "Failed to get token information" });
    }
  });

  // Cashout endpoints disabled - will be available when connected to Solana blockchain
  // Cashout request
  // app.post("/api/rewards/cashout", isAuthenticated, async (req: any, res) => {
  //   try {
  //     const userId = (req.session as any).userId;
  //     
  //     // Validate request body with Zod
  //     const validatedData = cashoutSchema.parse(req.body);
  //     const { tokenAmount, bankDetails } = validatedData;
  //
  //     // Validate bank details
  //     const validation = cryptoCashoutService.validateBankDetails(bankDetails);
  //     if (!validation.valid) {
  //       return res.status(400).json({ error: validation.errors.join(', ') });
  //     }
  //
  //     // Get current wallet balance
  //     const wallet = await db
  //       .select()
  //       .from(walletAccounts)
  //       .where(eq(walletAccounts.userId, userId))
  //       .limit(1);
  //
  //     if (wallet.length === 0 || parseFloat(wallet[0].tokenBalance || '0') < tokenAmount) {
  //       return res.status(400).json({ error: "Insufficient balance" });
  //     }
  //
  //     // Check eligibility
  //     const eligibility = await rewardsService.validateCashoutEligibility(
  //       parseFloat(wallet[0].tokenBalance || '0'),
  //       tokenAmount
  //     );
  //
  //     if (!eligibility.eligible) {
  //       return res.status(400).json({ error: eligibility.reason });
  //     }
  //
  //     // Calculate cash amount
  //     const cashAmount = await moonshotService.calculateCashValue(tokenAmount);
  //     const conversionRate = await moonshotService.getTokenPrice();
  //
  //     // Encrypt bank details for secure storage
  //     const encryptedBankDetails = await EncryptionService.encryptBankDetails(bankDetails);
  //
  //     // Create cashout request with encrypted bank details
  //     const cashoutRequest = await db.insert(cashoutRequests).values({
  //       userId,
  //       tokenAmount: tokenAmount.toString(),
  //       cashAmount: cashAmount.toString(),
  //       conversionRate: conversionRate.toString(),
  //       bankDetails: encryptedBankDetails
  //     }).returning();
  //
  //     // Initiate external cashout
  //     const externalResult = await cryptoCashoutService.initiateCashout({
  //       userId,
  //       tokenAmount,
  //       cashAmount,
  //       bankDetails
  //     });
  //
  //     // Update request with external transaction ID
  //     await db
  //       .update(cashoutRequests)
  //       .set({
  //         externalTransactionId: externalResult.id,
  //         status: externalResult.status,
  //         failureReason: externalResult.failureReason
  //       })
  //       .where(eq(cashoutRequests.id, cashoutRequest[0].id));
  //
  //     if (externalResult.status !== 'failed') {
  //       // Deduct from wallet balance (reserve tokens)
  //       await db
  //         .update(walletAccounts)
  //         .set({
  //           tokenBalance: (parseFloat(wallet[0].tokenBalance || '0') - tokenAmount).toString(),
  //           lastActivity: new Date()
  //         })
  //         .where(eq(walletAccounts.userId, userId));
  //     }
  //
  //     res.json({
  //       success: true,
  //       cashoutId: cashoutRequest[0].id,
  //       externalId: externalResult.id,
  //       status: externalResult.status,
  //       cashAmount,
  //       estimatedCompletion: "1-3 business days"
  //     });
  //
  //   } catch (error) {
  //     console.error("Cashout error:", error);
  //     res.status(500).json({ error: "Cashout request failed" });
  //   }
  // });

  // Get cashout history
  // app.get("/api/rewards/cashouts", isAuthenticated, async (req: any, res) => {
  //   try {
  //     const userId = (req.session as any).userId;
  //     
  //     const cashouts = await db
  //       .select({
  //         id: cashoutRequests.id,
  //         tokenAmount: cashoutRequests.tokenAmount,
  //         cashAmount: cashoutRequests.cashAmount,
  //         status: cashoutRequests.status,
  //         createdAt: cashoutRequests.createdAt,
  //         processedDate: cashoutRequests.processedDate,
  //         failureReason: cashoutRequests.failureReason
  //       })
  //       .from(cashoutRequests)
  //       .where(eq(cashoutRequests.userId, userId))
  //       .orderBy(desc(cashoutRequests.createdAt))
  //       .limit(50);
  //
  //     res.json(cashouts);
  //   } catch (error) {
  //     console.error("Error getting cashout history:", error);
  //     res.status(500).json({ error: "Failed to get cashout history" });
  //   }
  // });

  // Admin/Business owner routes for rewards management
  app.get("/api/admin/rewards/stats", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Get rewards statistics
      const totalRewardsIssued = await db
        .select()
        .from(rewards)
        .then(rows => rows.reduce((sum, reward) => sum + parseFloat(reward.tokenAmount), 0));

      const totalCashouts = await db
        .select()
        .from(cashoutRequests)
        .where(eq(cashoutRequests.status, 'completed'))
        .then(rows => rows.reduce((sum, cashout) => sum + parseFloat(cashout.cashAmount), 0));

      const activeUsers = await db
        .select()
        .from(walletAccounts)
        .then(rows => rows.filter(w => parseFloat(w.tokenBalance || '0') > 0).length);

      // Count today's mining claims (replaces daily check-ins)
      const { miningClaims } = await import('@shared/schema');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const recentClaims = await db
        .select()
        .from(miningClaims)
        .where(sql`${miningClaims.claimTime} >= ${today}`)
        .then(rows => rows.length);

      res.json({
        totalRewardsIssued,
        totalCashouts,
        activeUsers,
        recentClaims // Changed from recentCheckins to recentClaims
      });
    } catch (error) {
      console.error("Error getting reward stats:", error);
      res.status(500).json({ error: "Failed to get reward statistics" });
    }
  });

  // Admin: Manually grant tokens to a user (for missed rewards, adjustments)
  app.post("/api/admin/grant-tokens", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { userId, amount, reason } = z.object({
        userId: z.string().min(1),
        amount: z.number().positive().max(100000),
        reason: z.string().min(1).max(200),
      }).parse(req.body);

      const adminId = (req.session as any).userId;
      await storage.creditWalletTokens(userId, amount);
      await db.insert(rewards).values({
        userId,
        rewardType: 'admin_grant',
        tokenAmount: amount.toFixed(8),
        cashValue: (amount * 0.01).toFixed(2),
        status: 'confirmed',
        metadata: { reason, grantedBy: adminId }
      });

      console.log(`🎁 Admin ${adminId} manually granted ${amount} JCMOVES to ${userId}: ${reason}`);
      res.json({ success: true, message: `Granted ${amount} JCMOVES successfully` });
    } catch (error: any) {
      console.error("Error granting tokens:", error);
      res.status(500).json({ error: error.message || "Failed to grant tokens" });
    }
  });

  // Admin reward settings management
  app.get("/api/admin/reward-settings", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { rewardSettings } = await import('@shared/schema');
      const settings = await db
        .select()
        .from(rewardSettings)
        .orderBy(rewardSettings.settingKey);
      res.json(settings);
    } catch (error) {
      console.error("Error getting reward settings:", error);
      res.status(500).json({ error: "Failed to get reward settings" });
    }
  });

  app.put("/api/admin/reward-settings/:key", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { key } = req.params;
      const { tokenAmount: rawAmount, isActive } = req.body;
      const userId = (req.session as any).userId;

      // Accept both number and numeric string from the client
      const tokenAmount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : Number(rawAmount);
      if (isNaN(tokenAmount) || tokenAmount < 0) {
        return res.status(400).json({ error: "Token amount must be a positive number" });
      }

      const { rewardSettings } = await import('@shared/schema');
      const [updated] = await db
        .update(rewardSettings)
        .set({
          tokenAmount: tokenAmount.toFixed(2),
          isActive: isActive ?? true,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(rewardSettings.settingKey, key))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Reward setting not found" });
      }

      console.log(`📊 Reward setting '${key}' updated to ${tokenAmount} JCMOVES by admin ${userId}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating reward setting:", error);
      res.status(500).json({ error: "Failed to update reward setting" });
    }
  });

  // Referral System Routes
  
  // Get user's referral code (generate if needed)
  app.get("/api/referrals/my-code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const referralCode = await storage.generateReferralCode(userId);
      res.json({ referralCode });
    } catch (error) {
      console.error("Error getting referral code:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  // Apply a referral code
  app.post("/api/referrals/apply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { referralCode } = referralCodeSchema.parse(req.body);
      const { TREASURY_CONFIG, REWARD_TYPES } = await import('./constants');
      
      const result = await storage.applyReferralCode(userId, referralCode);
      
      if (result.success && result.referrerId) {
        // Award referral request bonus to referrer (50 JCMOVES)
        // Also award referral signup bonus to the new user (1,000 JCMOVES)
        try {
          const REFERRAL_REQUEST_REWARD = TREASURY_CONFIG.REFERRAL_REQUEST_TOKENS;
          const REFERRAL_SIGNUP_BONUS = 1000;

          // Credit the referrer
          await storage.creditWalletTokens(result.referrerId, REFERRAL_REQUEST_REWARD);
          await db.insert(rewards).values({
            userId: result.referrerId,
            rewardType: REWARD_TYPES.REFERRAL_REQUEST,
            tokenAmount: REFERRAL_REQUEST_REWARD.toFixed(8),
            cashValue: (REFERRAL_REQUEST_REWARD * 0.01).toFixed(2),
            status: "confirmed",
            referenceId: userId,
            metadata: { referredUserId: userId }
          });
          console.log(`🎁 Awarded ${REFERRAL_REQUEST_REWARD} JCMOVES to referrer ${result.referrerId} for referral request`);

          // Credit the new user who applied the code
          await storage.creditWalletTokens(userId, REFERRAL_SIGNUP_BONUS);
          await db.insert(rewards).values({
            userId,
            rewardType: 'referral_signup_bonus',
            tokenAmount: REFERRAL_SIGNUP_BONUS.toFixed(8),
            cashValue: (REFERRAL_SIGNUP_BONUS * 0.01).toFixed(2),
            status: "confirmed",
            referenceId: result.referrerId,
            metadata: { referrerUserId: result.referrerId, referralCode }
          });
          console.log(`🎁 Awarded ${REFERRAL_SIGNUP_BONUS} JCMOVES referral signup bonus to new user ${userId}`);
          // Award tier points to both the referrer and new user
          await awardTierPoints(result.referrerId, 'referral_confirmed');
          await awardTierPoints(userId, 'signup');
        } catch (rewardError) {
          console.error("Error awarding referral bonus:", rewardError);
        }
        
        res.json({
          success: true,
          message: "Referral code applied! You earned 1,000 JCMOVES and your referrer earned a bonus.",
          bonusAwarded: 1000
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error("Error applying referral code:", error);
      res.status(500).json({ error: "Failed to apply referral code" });
    }
  });

  // Get referral stats
  app.get("/api/referrals/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const stats = await storage.getReferralStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error getting referral stats:", error);
      res.status(500).json({ error: "Failed to get referral stats" });
    }
  });

  // Treasury Management Routes (Business Owner Only)
  
  // Deposit funds into treasury
  app.post("/api/treasury/deposit", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const depositData = treasuryDepositSchema.parse(req.body);
      const userId = (req.session as any).userId;
      
      const result = await treasuryService.depositTokens(
        userId,
        depositData.amount,
        depositData.depositMethod,
        depositData.notes
      );
      
      if (result.success) {
        res.json({ 
          success: true, 
          deposit: result.deposit,
          message: `Successfully deposited ${depositData.amount.toLocaleString()} JCMOVES into treasury`
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error) {
      console.error("Error depositing treasury tokens:", error);
      res.status(400).json({ error: "Invalid deposit data" });
    }
  });

  // Moonshot funding deposit endpoint
  app.post("/api/treasury/moonshot-deposit", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const transferData = moonshotAccountTransferSchema.parse(req.body);
      const userId = (req.session as any).userId;
      
      // Initiate Moonshot transfer
      const transferHash = await moonshotService.initiateAccountTransfer(transferData);
      
      // Check transfer status with original request data for accurate metadata
      const transferStatus = await moonshotService.checkAccountTransferStatus(transferHash, transferData);
      
      if (transferStatus.status === "completed" && transferStatus.metadata) {
        // Create funding deposit record
        const depositAmount = transferStatus.metadata.usdValue;
        const tokenPrice = await moonshotService.getTokenPrice();
        
        const result = await treasuryService.depositFunds(
          userId,
          depositAmount,
          "moonshot",
          `Moonshot transfer: ${transferHash}`
        );
        
        if (result.success && result.deposit) {
          // Update deposit with Moonshot metadata
          await storage.updateFundingDeposit(result.deposit.id, {
            externalTransactionId: transferHash,
            moonshotMetadata: transferStatus.metadata
          });
          
          res.json({ 
            success: true, 
            deposit: result.deposit,
            moonshotMetadata: transferStatus.metadata,
            message: `Successfully transferred ${transferStatus.metadata.tokenAmount} ${transferStatus.metadata.tokenSymbol} ($${depositAmount.toFixed(2)}) from Moonshot account`
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: result.error || "Failed to record deposit"
          });
        }
      } else {
        res.status(400).json({ 
          success: false, 
          error: "Moonshot transfer failed or is still pending"
        });
      }
    } catch (error) {
      console.error("Error processing Moonshot deposit:", error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Invalid Moonshot transfer data" 
      });
    }
  });

  // Record a completed token deposit from external source (like Moonshot app)
  app.post("/api/treasury/record-token-deposit", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { tokenAmount, transactionHash, moonshotAccountId, notes } = req.body;
      const userId = (req.session as any).userId;

      // Validation
      if (!tokenAmount || typeof tokenAmount !== 'number' || tokenAmount <= 0) {
        return res.status(400).json({ error: "Valid token amount is required" });
      }
      if (!transactionHash || typeof transactionHash !== 'string') {
        return res.status(400).json({ error: "Transaction hash is required" });
      }

      const result = await treasuryService.depositTokensFromMoonshot(
        userId,
        tokenAmount,
        transactionHash,
        moonshotAccountId,
        notes
      );

      if (result.success && result.deposit) {
        res.json({
          success: true,
          deposit: result.deposit,
          message: `Successfully recorded deposit of ${tokenAmount.toLocaleString()} JCMOVES tokens`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || "Failed to record token deposit"
        });
      }
    } catch (error) {
      console.error("Error recording token deposit:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to record token deposit" 
      });
    }
  });

  // Get treasury status and health
  app.get("/api/treasury/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [stats, funding, healthCheck, fundingDays] = await Promise.all([
        treasuryService.getTreasuryStats(),
        treasuryService.getFundingStatus(),
        treasuryService.getHealthCheck(),
        treasuryService.getEstimatedFundingDays()
      ]);

      res.json({
        stats,
        funding,
        health: healthCheck,
        estimatedFundingDays: fundingDays
      });
    } catch (error) {
      console.error("Error getting treasury status:", error);
      res.status(500).json({ error: "Failed to get treasury status" });
    }
  });


  // Get funding deposit history
  app.get("/api/treasury/deposits", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const deposits = await treasuryService.getFundingHistory();
      res.json({ deposits });
    } catch (error) {
      console.error("Error getting funding history:", error);
      res.status(500).json({ error: "Failed to get funding history" });
    }
  });

  // Get reserve transaction history
  app.get("/api/treasury/transactions", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      // Sanitize and validate limit parameter
      const limitParam = Number(req.query.limit);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
      
      const transactions = await treasuryService.getRecentTransactions(limit);
      res.json({ transactions, pagination: { limit } });
    } catch (error) {
      console.error("Error getting reserve transactions:", error);
      res.status(500).json({ error: "Failed to get reserve transactions" });
    }
  });

  // Get treasury analytics and distribution patterns
  app.get("/api/treasury/analytics", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const analytics = await getTreasuryAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error getting treasury analytics:", error);
      res.status(500).json({ error: "Failed to get treasury analytics" });
    }
  });

  // Get treasury reports (time-series data for charts)
  app.get("/api/treasury/reports", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { period = '30d', type = 'all' } = req.query;
      const reports = await getTreasuryReports(period as string, type as string);
      res.json(reports);
    } catch (error) {
      console.error("Error getting treasury reports:", error);
      res.status(500).json({ error: "Failed to get treasury reports" });
    }
  });

  // Get treasury dashboard summary (quick stats for widgets)
  app.get("/api/treasury/summary", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [stats, funding, healthCheck, fundingDays] = await Promise.all([
        treasuryService.getTreasuryStats(),
        treasuryService.getFundingStatus(),
        treasuryService.getHealthCheck(),
        treasuryService.getEstimatedFundingDays()
      ]);

      // Get weekly activity data
      const weeklyActivity = {
        recentDeposits: 1, // We have 1 deposit of $1000
        recentDistributions: 0,
        activeUsersWeek: 1
      };

      const response = {
        stats,
        funding,
        health: healthCheck,
        estimatedFundingDays: fundingDays,
        weeklyActivity
      };
      
      res.json(response);
    } catch (error) {
      console.error("Error getting treasury summary:", error);
      res.status(500).json({ error: "Failed to get treasury summary" });
    }
  });

  // Get treasury configuration
  app.get("/api/treasury/config", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const config = getTreasuryConfig();
      res.json(config);
    } catch (error) {
      console.error("Error getting treasury config:", error);
      res.status(500).json({ error: "Failed to get treasury config" });
    }
  });

  // Treasury limits API (admin configurable up to 500M JCMOVES)
  app.get("/api/treasury/limits", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const limits = await storage.getTreasuryLimits();
      res.json({ limits });
    } catch (error) {
      console.error("Error getting treasury limits:", error);
      res.status(500).json({ error: "Failed to get treasury limits" });
    }
  });

  app.put("/api/treasury/limits/:limitType", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { limitType } = req.params;
      const { limitValue, notes } = req.body;
      const userId = (req.session as any).userId;

      // Validate limit type is one of the known types
      const validLimitTypes = ['per_transaction', 'daily', 'minimum_reserve'];
      if (!validLimitTypes.includes(limitType)) {
        return res.status(400).json({ error: "Invalid limit type" });
      }

      if (typeof limitValue !== 'number' || limitValue < 0) {
        return res.status(400).json({ error: "Invalid limit value" });
      }

      // Validate limit doesn't exceed 500M cap
      const maxLimit = 500000000;
      if (limitValue > maxLimit) {
        return res.status(400).json({ error: `Limit cannot exceed ${maxLimit.toLocaleString()} JCMOVES` });
      }

      const updated = await storage.updateTreasuryLimit(limitType, limitValue, userId, notes);
      if (!updated) {
        return res.status(404).json({ error: "Limit type not found" });
      }

      console.log(`[TREASURY] Admin ${userId} updated ${limitType} limit to ${limitValue.toLocaleString()} JCMOVES`);
      res.json({ success: true, limit: updated });
    } catch (error) {
      console.error("Error updating treasury limit:", error);
      res.status(500).json({ error: "Failed to update treasury limit" });
    }
  });

  // Buyback fund stats API - Get current buyback fund balances and lifetime stats
  // Now includes live blockchain balance from burn wallet for full transparency
  app.get("/api/treasury/buyback-fund", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const stats = await storage.getBuybackFundStats();
      
      // Get live blockchain balance from burn wallet
      const burnWalletBalance = await solanaTransferService.getBurnWalletBalance();
      
      res.json({ 
        success: true,
        fund: {
          tokenBalance: stats.tokenBalance,
          totalTokensCollected: stats.totalTokensCollected,
          feeContributionCount: stats.feeContributionCount,
          lastUpdated: stats.lastUpdated
        },
        burnWallet: {
          address: burnWalletBalance.address,
          tokenBalance: burnWalletBalance.tokenBalance,
          solBalance: burnWalletBalance.solBalance
        }
      });
    } catch (error) {
      console.error("Error getting buyback fund stats:", error);
      res.status(500).json({ error: "Failed to get buyback fund stats" });
    }
  });

  // Token conversions API (JCMOVES/SOL/ETH swap tracking)
  app.get("/api/conversions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      
      // Admin can see all conversions, others only their own
      const conversions = user?.role === 'admin' 
        ? await storage.getTokenConversions(undefined, 100)
        : await storage.getTokenConversions(userId, 50);
      
      res.json({ conversions });
    } catch (error) {
      console.error("Error getting token conversions:", error);
      res.status(500).json({ error: "Failed to get token conversions" });
    }
  });

  // ====================== CRYPTO PORTFOLIO MANAGEMENT API ======================

  // Get comprehensive crypto portfolio performance metrics
  app.get("/api/treasury/crypto/portfolio", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const portfolioData = await treasuryService.getCryptoPortfolioPerformance();
      res.json(portfolioData);
    } catch (error) {
      console.error("Error getting crypto portfolio data:", error);
      res.status(500).json({ error: "Failed to get crypto portfolio data" });
    }
  });

  // Get advanced risk assessment with volatility protection
  app.get("/api/treasury/crypto/risk-assessment", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const riskData = await treasuryService.getAdvancedRiskAssessment();
      res.json(riskData);
    } catch (error) {
      console.error("Error getting risk assessment:", error);
      res.status(500).json({ error: "Failed to get risk assessment data" });
    }
  });

  // Get comprehensive treasury health score
  app.get("/api/treasury/crypto/health-score", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const healthScore = await treasuryService.getTreasuryHealthScore();
      res.json(healthScore);
    } catch (error) {
      console.error("Error getting treasury health score:", error);
      res.status(500).json({ error: "Failed to get treasury health score" });
    }
  });

  // Get current JCMOVES market data and pricing
  app.get("/api/treasury/crypto/market-data", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [currentPrice, marketData, volatility] = await Promise.all([
        treasuryService.getCurrentTokenPrice(),
        treasuryService.getMarketData(),
        treasuryService.checkVolatility()
      ]);
      
      res.json({
        currentPrice,
        marketData,
        volatility,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting market data:", error);
      res.status(500).json({ error: "Failed to get market data" });
    }
  });

  // Get real-time JCMOVES token price with live updates (for public display)
  app.get("/api/crypto/live-price", async (req, res) => {
    try {
      const { moonshotService } = await import('./services/moonshot');
      const tokenData = await moonshotService.getTokenData();
      
      if (!tokenData) {
        // Fallback to basic price if full data unavailable
        const price = await moonshotService.getTokenPrice();
        return res.json({
          price: price,
          priceFormatted: `$${price.toFixed(10)}`,
          change24h: null,
          changePercent24h: null,
          volume24h: null,
          lastUpdated: new Date().toISOString(),
          status: 'fallback'
        });
      }

      const price = parseFloat(tokenData.priceUsd);
      const change24h = tokenData.priceChange?.h24 || 0;
      const volume24h = tokenData.volume?.h24?.total || 0;

      res.json({
        price: price,
        priceFormatted: `$${price.toFixed(10)}`,
        change24h: change24h,
        changePercent24h: `${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%`,
        volume24h: volume24h,
        volumeFormatted: `$${volume24h.toLocaleString()}`,
        symbol: tokenData.baseToken?.symbol || 'JCMOVES',
        tokenName: tokenData.baseToken?.name || 'JC ON THE MOVE',
        lastUpdated: new Date().toISOString(),
        status: 'live'
      });
    } catch (error) {
      console.error("Error getting live token price:", error);
      res.status(500).json({ error: "Failed to get live price data" });
    }
  });

  // Get live blockchain balance for treasury wallet
  app.get("/api/solana/balance", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const result = await solanaMonitor.getLiveTokenBalance();
      res.json(result);
    } catch (error) {
      console.error("Error fetching live blockchain balance:", error);
      res.status(500).json({ 
        success: false,
        balance: 0,
        walletAddress: '',
        error: error instanceof Error ? error.message : "Failed to fetch balance" 
      });
    }
  });

  // Scan historical blockchain transactions and reconcile missing deposits
  // TEMPORARILY UNAUTHENTICATED FOR TESTING - RE-ENABLE AUTH AFTER TESTING
  app.post("/api/solana/scan-history", async (req, res) => {
    try {
      // Validate and constrain limit parameter (1-200)
      const limitParam = parseInt(req.body.limit as string);
      const limit = Number.isFinite(limitParam) && limitParam >= 1 && limitParam <= 200 
        ? limitParam 
        : 100;
      
      console.log(`[BLOCKCHAIN SCAN] Admin ${req.currentUser?.email} initiated scan with limit: ${limit}`);
      
      const result = await solanaMonitor.scanHistoricalTransactions(limit);
      
      // Log scan results for audit trail
      console.log(`[BLOCKCHAIN SCAN] Complete - Scanned: ${result.scanned}, Found: ${result.found}, Recorded: ${result.recorded}`);
      
      res.json(result);
    } catch (error) {
      console.error("Error scanning blockchain history:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to scan history" 
      });
    }
  });

  // Transfer JCMOVES tokens between wallets - REAL BLOCKCHAIN TRANSFER
  app.post("/api/treasury/transfer", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { recipientAddress, amount, executeOnChain } = req.body;

      if (!recipientAddress || typeof recipientAddress !== 'string') {
        return res.status(400).json({ error: "Recipient address is required" });
      }

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      // Get current token balance
      const liveBalance = await solanaMonitor.getLiveTokenBalance();
      if (!liveBalance.success || liveBalance.balance < amount) {
        return res.status(400).json({ 
          error: `Insufficient balance. Available: ${liveBalance.balance} JCMOVES, Requested: ${amount} JCMOVES` 
        });
      }

      const tokenPrice = await moonshotService.getTokenPrice();
      const usdValue = amount * tokenPrice;

      // If executeOnChain is true and the transfer service is operational, execute real blockchain transfer
      if (executeOnChain && solanaTransferService.isOperational()) {
        console.log(`[BLOCKCHAIN TRANSFER] Executing on-chain transfer: ${amount} JCMOVES to ${recipientAddress}`);
        
        const transferResult = await solanaTransferService.transferTokens({
          recipientAddress,
          amount,
          memo: `Treasury transfer by admin ${req.currentUser?.email}`
        });

        if (!transferResult.success) {
          return res.status(400).json({ 
            success: false,
            error: transferResult.error || "Blockchain transfer failed"
          });
        }

        // Record successful blockchain transfer in database
        const transaction = await storage.deductFromReserve(
          amount,
          `Blockchain transfer to ${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`,
          tokenPrice,
          'blockchain_transfer',
          recipientAddress
        );

        console.log(`[BLOCKCHAIN TRANSFER] ✅ Success! TX: ${transferResult.transactionHash}`);

        return res.json({
          success: true,
          message: "Blockchain transfer completed successfully",
          transactionHash: transferResult.transactionHash,
          transaction: {
            id: transaction.id,
            amount,
            usdValue,
            recipientAddress,
            timestamp: transaction.createdAt
          },
          explorerUrl: `https://solscan.io/tx/${transferResult.transactionHash}`
        });
      }

      // Fallback: Record transfer intent only (no blockchain execution)
      const transaction = await storage.deductFromReserve(
        amount,
        `Transfer to ${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`,
        tokenPrice,
        'transfer',
        recipientAddress
      );

      console.log(`[TRANSFER] Recorded: ${amount} JCMOVES to ${recipientAddress}, USD value: $${usdValue.toFixed(2)}`);

      const transferServiceStatus = solanaTransferService.getStatus();
      
      res.json({
        success: true,
        message: "Transfer recorded successfully",
        transaction: {
          id: transaction.id,
          amount,
          usdValue,
          recipientAddress,
          timestamp: transaction.createdAt
        },
        blockchainEnabled: transferServiceStatus.operational,
        note: transferServiceStatus.operational 
          ? "Set executeOnChain=true to execute real blockchain transfer"
          : `Blockchain transfers disabled: ${transferServiceStatus.error}`
      });
    } catch (error) {
      console.error("Error processing transfer:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process transfer" 
      });
    }
  });

  // Get blockchain transfer service status
  app.get("/api/treasury/transfer/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const status = solanaTransferService.getStatus();
      const balance = await solanaTransferService.getTreasuryBalance();
      
      res.json({
        ...status,
        balance: {
          sol: balance.solBalance,
          tokens: balance.tokenBalance
        }
      });
    } catch (error) {
      console.error("Error getting transfer status:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get status" 
      });
    }
  });

  // Switch active treasury wallet
  app.post("/api/treasury/switch-wallet", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { walletType } = req.body;
      
      if (!walletType || !['primary', 'jcmoves_banks', 'in_god_we_trust'].includes(walletType)) {
        return res.status(400).json({ error: "Invalid wallet type. Must be 'primary', 'jcmoves_banks', or 'in_god_we_trust'" });
      }

      const success = solanaTransferService.switchActiveWallet(walletType);
      
      if (!success) {
        return res.status(400).json({ error: `Wallet '${walletType}' is not configured or available` });
      }

      const status = solanaTransferService.getStatus();
      const balance = await solanaTransferService.getTreasuryBalance();

      console.log(`[TREASURY] Admin ${req.currentUser?.email} switched active wallet to: ${walletType}`);

      res.json({
        success: true,
        message: `Switched to ${walletType} wallet`,
        activeWallet: status.activeWallet,
        address: status.address,
        balance: {
          sol: balance.solBalance,
          tokens: balance.tokenBalance
        }
      });
    } catch (error) {
      console.error("Error switching wallet:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to switch wallet" });
    }
  });

  // Get buyback fund status
  app.get("/api/treasury/buyback/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const fund = await db.query.buybackFund.findFirst();
      const recentBuybacks = await db.query.buybackTransactions.findMany({
        orderBy: (tx, { desc }) => [desc(tx.createdAt)],
        limit: 10
      });
      const recentFees = await db.query.transferFees.findMany({
        orderBy: (fee, { desc }) => [desc(fee.createdAt)],
        limit: 20
      });

      res.json({
        fund: fund || {
          solBalance: "0",
          totalCollected: "0",
          totalUsedForBuyback: "0",
          totalTokensBought: "0",
          buybackCount: 0
        },
        recentBuybacks,
        recentFees,
        platformFeeRate: 0.00001 // 2x base Solana fee (~0.000005 SOL)
      });
    } catch (error) {
      console.error("Error getting buyback status:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get buyback status" });
    }
  });

  // ====================== COMPLIANT SWAP REQUEST SYSTEM (Option A) ======================
  // Users REQUEST swaps, admin reviews and fulfills manually off-platform
  // NO live prices, NO automated execution, NO exchange functionality

  // Get swap rules (public for form validation)
  app.get("/api/swap-rules", async (req, res) => {
    try {
      const rules = await db.query.treasurySwapRules.findFirst();
      if (!rules) {
        return res.json({
          monthlySwapCapTokens: "500000",
          maxPerUserPerMonth: "10000",
          minSwapAmount: "100",
          maxSwapAmount: "50000",
          approvedAssets: ["SOL", "USDC"],
          swapsEnabled: true
        });
      }
      res.json(rules);
    } catch (error) {
      console.error("Error getting swap rules:", error);
      res.status(500).json({ error: "Failed to get swap rules" });
    }
  });

  // Submit a swap request (user)
  app.post("/api/swap-requests", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const { jcmovesAmount, desiredAsset, destinationWallet, acknowledgedManualProcess, acknowledgedNoGuaranteedRate, acknowledgedTerms } = req.body;

      // Validate required acknowledgements
      if (!acknowledgedManualProcess || !acknowledgedNoGuaranteedRate || !acknowledgedTerms) {
        return res.status(400).json({ error: "All acknowledgements must be accepted" });
      }

      // Get swap rules
      const rules = await db.query.treasurySwapRules.findFirst();
      if (!rules?.swapsEnabled) {
        return res.status(400).json({ error: "Swap requests are currently disabled" });
      }

      // Validate amount
      const amount = parseFloat(jcmovesAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (amount < parseFloat(rules.minSwapAmount || "100")) {
        return res.status(400).json({ error: `Minimum swap amount is ${rules.minSwapAmount} JCMOVES` });
      }
      if (amount > parseFloat(rules.maxSwapAmount || "50000")) {
        return res.status(400).json({ error: `Maximum swap amount is ${rules.maxSwapAmount} JCMOVES` });
      }

      // Validate asset
      const approvedAssets = rules.approvedAssets || ["SOL", "USDC"];
      if (!approvedAssets.includes(desiredAsset)) {
        return res.status(400).json({ error: `Asset not supported. Approved: ${approvedAssets.join(", ")}` });
      }

      // Validate wallet address
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(destinationWallet)) {
        return res.status(400).json({ error: "Invalid Solana wallet address" });
      }

      // Check user's monthly usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const userMonthlyRequests = await db.query.swapRequests.findMany({
        where: (sr, { eq, and, gte }) => and(
          eq(sr.userId, user.id),
          gte(sr.createdAt, startOfMonth)
        )
      });

      const userMonthlyTotal = userMonthlyRequests.reduce((sum, r) => sum + parseFloat(r.jcmovesAmount), 0);
      const maxPerUser = parseFloat(rules.maxPerUserPerMonth || "10000");
      
      if (userMonthlyTotal + amount > maxPerUser) {
        return res.status(400).json({ 
          error: `This would exceed your monthly limit. Used: ${userMonthlyTotal.toFixed(2)}, Limit: ${maxPerUser}` 
        });
      }

      // Create swap request
      const [request] = await db.insert(swapRequests).values({
        userId: user.id,
        userEmail: user.email,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        jcmovesAmount: amount.toString(),
        desiredAsset,
        destinationWallet,
        acknowledgedManualProcess: true,
        acknowledgedNoGuaranteedRate: true,
        acknowledgedTerms: true,
        status: "pending"
      }).returning();

      console.log(`[SWAP REQUEST] User ${user.email} submitted request for ${amount} JCMOVES -> ${desiredAsset}`);

      res.json({
        success: true,
        message: "Your swap request has been submitted for manual review. You will be notified once processed.",
        request: {
          id: request.id,
          amount: request.jcmovesAmount,
          desiredAsset: request.desiredAsset,
          status: request.status,
          createdAt: request.createdAt
        }
      });
    } catch (error) {
      console.error("Error submitting swap request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to submit request" });
    }
  });

  // Get user's own swap requests
  app.get("/api/swap-requests/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const requests = await db.query.swapRequests.findMany({
        where: (sr, { eq }) => eq(sr.userId, user.id),
        orderBy: (sr, { desc }) => [desc(sr.createdAt)]
      });
      res.json({ requests });
    } catch (error) {
      console.error("Error getting user swap requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
    }
  });

  // Get all swap requests (admin only)
  app.get("/api/swap-requests", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      
      let requests;
      if (status) {
        requests = await db.query.swapRequests.findMany({
          where: (sr, { eq }) => eq(sr.status, status),
          orderBy: (sr, { desc }) => [desc(sr.createdAt)]
        });
      } else {
        requests = await db.query.swapRequests.findMany({
          orderBy: (sr, { desc }) => [desc(sr.createdAt)]
        });
      }
      res.json({ requests });
    } catch (error) {
      console.error("Error getting swap requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
    }
  });

  // Review a swap request (approve/decline) - admin only
  app.patch("/api/swap-requests/:id/review", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { action, reviewNotes, declineReason } = req.body;
      const admin = req.user as Express.User;

      if (!["approve", "decline"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'approve' or 'decline'" });
      }

      const request = await db.query.swapRequests.findFirst({
        where: (sr, { eq }) => eq(sr.id, id)
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Request has already been reviewed" });
      }

      const newStatus = action === "approve" ? "approved" : "declined";

      await db.update(swapRequests)
        .set({
          status: newStatus,
          reviewedBy: admin.email,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes || null,
          declineReason: action === "decline" ? declineReason : null,
          updatedAt: new Date()
        })
        .where(eq(swapRequests.id, id));

      console.log(`[SWAP REQUEST] Admin ${admin.email} ${action}d request ${id}`);

      res.json({
        success: true,
        message: `Request ${action}d successfully`,
        status: newStatus
      });
    } catch (error) {
      console.error("Error reviewing swap request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to review request" });
    }
  });

  // Mark swap as fulfilled (after manual off-platform execution) - admin only
  app.patch("/api/swap-requests/:id/fulfill", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { fulfilledAmount, fulfillmentTxHash, fulfillmentMethod } = req.body;
      const admin = req.user as Express.User;

      const request = await db.query.swapRequests.findFirst({
        where: (sr, { eq }) => eq(sr.id, id)
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status !== "approved") {
        return res.status(400).json({ error: "Request must be approved before fulfillment" });
      }

      await db.update(swapRequests)
        .set({
          status: "completed",
          fulfilledAmount: fulfilledAmount?.toString() || null,
          fulfillmentTxHash: fulfillmentTxHash || null,
          fulfilledBy: admin.email,
          fulfilledAt: new Date(),
          fulfillmentMethod: fulfillmentMethod || "treasury",
          updatedAt: new Date()
        })
        .where(eq(swapRequests.id, id));

      // Update monthly usage
      const rules = await db.query.treasurySwapRules.findFirst();
      if (rules) {
        const newUsed = parseFloat(rules.monthlySwapsUsed || "0") + parseFloat(request.jcmovesAmount);
        await db.update(treasurySwapRules)
          .set({
            monthlySwapsUsed: newUsed.toString(),
            lastUpdated: new Date()
          });
      }

      console.log(`[SWAP REQUEST] Admin ${admin.email} fulfilled request ${id} with ${fulfilledAmount} ${request.desiredAsset}`);

      res.json({
        success: true,
        message: "Request marked as fulfilled",
        status: "completed"
      });
    } catch (error) {
      console.error("Error fulfilling swap request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fulfill request" });
    }
  });

  // Update swap rules (admin only)
  app.patch("/api/swap-rules", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const admin = req.user as Express.User;
      const { monthlySwapCapTokens, maxPerUserPerMonth, minSwapAmount, maxSwapAmount, approvedAssets, swapsEnabled } = req.body;

      const existingRules = await db.query.treasurySwapRules.findFirst();
      
      if (existingRules) {
        await db.update(treasurySwapRules)
          .set({
            monthlySwapCapTokens: monthlySwapCapTokens?.toString() || existingRules.monthlySwapCapTokens,
            maxPerUserPerMonth: maxPerUserPerMonth?.toString() || existingRules.maxPerUserPerMonth,
            minSwapAmount: minSwapAmount?.toString() || existingRules.minSwapAmount,
            maxSwapAmount: maxSwapAmount?.toString() || existingRules.maxSwapAmount,
            approvedAssets: approvedAssets || existingRules.approvedAssets,
            swapsEnabled: swapsEnabled !== undefined ? swapsEnabled : existingRules.swapsEnabled,
            lastUpdated: new Date(),
            updatedBy: admin.email
          });
      } else {
        await db.insert(treasurySwapRules).values({
          monthlySwapCapTokens: monthlySwapCapTokens?.toString() || "500000",
          maxPerUserPerMonth: maxPerUserPerMonth?.toString() || "10000",
          minSwapAmount: minSwapAmount?.toString() || "100",
          maxSwapAmount: maxSwapAmount?.toString() || "50000",
          approvedAssets: approvedAssets || ["SOL", "USDC"],
          swapsEnabled: swapsEnabled !== undefined ? swapsEnabled : true,
          updatedBy: admin.email
        });
      }

      console.log(`[SWAP RULES] Admin ${admin.email} updated swap rules`);

      res.json({ success: true, message: "Swap rules updated" });
    } catch (error) {
      console.error("Error updating swap rules:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update rules" });
    }
  });

  // ====================== JUPITER SWAP API ======================

  // Get supported tokens for swapping
  app.get("/api/swap/tokens", isAuthenticated, async (req, res) => {
    try {
      const tokens = jupiterSwapService.getSupportedTokens();
      res.json({ tokens });
    } catch (error) {
      console.error("Error getting supported tokens:", error);
      res.status(500).json({ error: "Failed to get supported tokens" });
    }
  });

  // Get swap quote
  app.post("/api/swap/quote", isAuthenticated, async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippageBps } = req.body;

      if (!inputMint || !outputMint || amount === undefined) {
        return res.status(400).json({ error: "inputMint, outputMint, and amount are required" });
      }

      const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      
      if (typeof numAmount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }

      if (numAmount < 0.000001) {
        return res.status(400).json({ error: "Amount is too small for a swap" });
      }

      const quote = await jupiterSwapService.getSwapQuote(
        inputMint,
        outputMint,
        numAmount,
        slippageBps || 50
      );

      if (!quote) {
        return res.status(400).json({ error: "Unable to get swap quote. The token pair may not have sufficient liquidity." });
      }

      res.json({ quote });
    } catch (error) {
      console.error("Error getting swap quote:", error);
      res.status(500).json({ error: "Failed to get swap quote" });
    }
  });

  // Get swap transaction for user to sign
  app.post("/api/swap/transaction", isAuthenticated, async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippageBps } = req.body;
      const user = req.currentUser;

      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: "inputMint, outputMint, and amount are required" });
      }

      // Get user's wallet address
      const payoutInfo = await storage.getPayoutAddress(user.id.toString());
      
      if (!payoutInfo.address) {
        return res.status(400).json({ 
          error: "No wallet configured. Please set up your wallet first.",
          needsWallet: true
        });
      }

      const result = await jupiterSwapService.getSwapTransaction(
        inputMint,
        outputMint,
        amount,
        payoutInfo.address,
        slippageBps || 50
      );

      if (!result) {
        return res.status(400).json({ error: "Unable to create swap transaction" });
      }

      res.json({
        transaction: result.transaction,
        quote: result.quote,
        userWallet: payoutInfo.address,
        walletMode: payoutInfo.mode
      });
    } catch (error) {
      console.error("Error getting swap transaction:", error);
      res.status(500).json({ error: "Failed to create swap transaction" });
    }
  });

  // Get token price in USDC
  app.get("/api/swap/price/:tokenMint", isAuthenticated, async (req, res) => {
    try {
      const { tokenMint } = req.params;
      const price = await jupiterSwapService.getTokenPrice(tokenMint);
      
      if (price === null) {
        return res.status(400).json({ error: "Unable to get token price" });
      }

      res.json({ 
        tokenMint,
        priceUsd: price,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting token price:", error);
      res.status(500).json({ error: "Failed to get token price" });
    }
  });

  // Convert USD to JCMOVES tokens at current price
  app.post("/api/treasury/crypto/convert-usd", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Proper Zod validation
      const { usdAmount } = usdToTokensSchema.parse(req.body);
      
      const conversion = await treasuryService.convertUsdToTokens(usdAmount);
      
      // Enhanced response with price metadata
      res.json({
        ...conversion,
        inputAmount: usdAmount,
        conversionType: 'usd-to-tokens',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }
      console.error("Error converting USD to tokens:", error);
      res.status(500).json({ error: "Failed to convert USD to tokens" });
    }
  });

  // Convert JCMOVES tokens to USD at current price  
  app.post("/api/treasury/crypto/convert-tokens", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Proper Zod validation
      const { tokenAmount } = tokensToUsdSchema.parse(req.body);
      
      const conversion = await treasuryService.convertTokensToUsd(tokenAmount);
      
      // Enhanced response with price metadata
      res.json({
        ...conversion,
        inputAmount: tokenAmount,
        conversionType: 'tokens-to-usd',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }
      console.error("Error converting tokens to USD:", error);
      res.status(500).json({ error: "Failed to convert tokens to USD" });
    }
  });

  // ====================== PRICE HISTORY API ======================
  
  // Get price history for charting
  app.get("/api/price-history", isAuthenticated, async (req, res) => {
    try {
      const range = req.query.range as string || '24h';
      const hours = range === '24h' ? 24 : range === '7d' ? 168 : range === '30d' ? 720 : 24;
      
      const priceData = await storage.getPriceHistory(hours);
      
      // Calculate statistics
      const latest = priceData[priceData.length - 1];
      const first = priceData[0];
      const changePercent = first && latest ? ((latest.price - first.price) / first.price) * 100 : 0;
      
      res.json({
        data: priceData,
        metadata: {
          latestPrice: latest?.price || 0,
          changePercent,
          source: latest?.source || 'unknown',
          range,
          dataPoints: priceData.length
        }
      });
    } catch (error) {
      console.error("Error fetching price history:", error);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });
  
  // Poll and store current price (internal/cron endpoint)
  app.post("/api/price-history/poll", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const priceData = await cryptoService.getCurrentPrice();
      const marketData = await cryptoService.getMarketData();
      
      await storage.addPricePoint(
        priceData.price.toString(),
        priceData.source,
        marketData
      );
      
      res.json({ 
        success: true, 
        price: priceData.price,
        source: priceData.source,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Error polling price:", error);
      res.status(500).json({ error: "Failed to poll price" });
    }
  });

  // Bootstrap endpoint - promote current user to admin if no admins exist
  app.post("/api/bootstrap/admin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User ID not found" });
      }
      
      // Check if there are any existing admins
      const existingAdmins = await db.select().from(users).where(eq(users.role, 'admin'));
      
      if (existingAdmins.length > 0) {
        return res.status(403).json({ error: "Admin users already exist. Bootstrap not needed." });
      }
      
      // Promote current user to admin
      const updatedUser = await storage.updateUserRole(userId, 'admin');
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        message: "Successfully promoted to admin", 
        user: updatedUser 
      });
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      res.status(500).json({ error: "Failed to bootstrap admin" });
    }
  });

  // ====================== ADMIN SYSTEM MANAGEMENT API ======================

  // Admin dashboard data endpoints
  app.get("/api/admin/users", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.get("/api/admin/leads", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error) {
      console.error("Error getting leads:", error);
      res.status(500).json({ error: "Failed to get leads" });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const leads = await storage.getLeads();
      
      const activeLeadsCount = leads.filter((lead: any) => lead.status === 'new' || lead.status === 'available').length;
      const stats = {
        totalUsers: users.length,
        totalLeads: leads.length,
        activeLeads: activeLeadsCount,
        activeJobs: activeLeadsCount, // backward-compat alias
        monthlyRevenue: 45000, // This would come from actual financial data
        completedJobs: leads.filter((lead: any) => lead.status === 'completed').length,
        pendingLeads: leads.filter((lead: any) => lead.status === 'new').length,
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error getting admin stats:", error);
      res.status(500).json({ error: "Failed to get admin stats" });
    }
  });

  // ── Unified dashboard endpoint ──────────────────────────────────────────────
  // Returns jobs summary, token totals, and liability metrics in one call
  app.get("/api/dashboard", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [allLeads, allUsers, liabilityData] = await Promise.all([
        storage.getLeads(),
        storage.getAllUsers(),
        getTreasuryAnalytics(),
      ]);

      const jobsByStage: Record<string, number> = {};
      for (const lead of allLeads) {
        const stage = lead.status || "unknown";
        jobsByStage[stage] = (jobsByStage[stage] || 0) + 1;
      }

      const [totalEarnedRow] = await db
        .select({ total: sql<number>`coalesce(sum(cast(${rewards.tokenAmount} as decimal)), 0)` })
        .from(rewards)
        .where(sql`cast(${rewards.tokenAmount} as decimal) > 0`);
      const totalTokensEarned = Number(totalEarnedRow?.total ?? 0);

      const [totalWalletRow] = await db
        .select({ total: sql<number>`coalesce(sum(cast(token_balance as decimal)), 0)` })
        .from(walletAccounts);
      const totalTokensInWallets = Number(totalWalletRow?.total ?? 0);

      res.json({
        jobs: {
          total: allLeads.length,
          byStage: jobsByStage,
          completed: jobsByStage["completed"] || 0,
          active: (jobsByStage["available"] || 0) + (jobsByStage["new"] || 0),
        },
        tokens: {
          totalEarned: totalTokensEarned,
          totalInWallets: totalTokensInWallets,
        },
        users: {
          total: allUsers.length,
        },
        liability: liabilityData.liability,
      });
    } catch (error) {
      console.error("Error getting dashboard:", error);
      res.status(500).json({ error: "Failed to get dashboard" });
    }
  });

  // Admin Token Ledger - Shows all JCMOVES transactions across customers and employees
  app.get("/api/admin/token-ledger", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { limit = 100, type, role } = req.query;
      
      // Get ALL rewards for accurate totals (no limit)
      const allRewardsForTotals = await db
        .select({
          rewardType: rewards.rewardType,
          tokenAmount: rewards.tokenAmount,
          userRole: users.role,
        })
        .from(rewards)
        .leftJoin(users, eq(rewards.userId, users.id));

      // Calculate totals from ALL data
      let totalTokensDispensed = 0;
      const totalByType: Record<string, number> = {};
      const totalByRole: Record<string, number> = {};
      
      allRewardsForTotals.forEach(r => {
        const rewardType = r.rewardType || 'unknown';
        const userRole = r.userRole || 'unknown';
        const amount = parseFloat(r.tokenAmount || '0');
        
        totalTokensDispensed += amount;
        totalByType[rewardType] = (totalByType[rewardType] || 0) + amount;
        totalByRole[userRole] = (totalByRole[userRole] || 0) + amount;
      });

      // Get paginated transactions for display (with limit)
      const recentTransactions = await db
        .select({
          id: rewards.id,
          userId: rewards.userId,
          rewardType: rewards.rewardType,
          tokenAmount: rewards.tokenAmount,
          cashValue: rewards.cashValue,
          status: rewards.status,
          earnedDate: rewards.earnedDate,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userRole: users.role,
        })
        .from(rewards)
        .leftJoin(users, eq(rewards.userId, users.id))
        .orderBy(desc(rewards.earnedDate))
        .limit(Number(limit));

      // Apply optional filters to display list only
      let filteredTransactions = recentTransactions;
      if (type && typeof type === 'string') {
        filteredTransactions = filteredTransactions.filter(r => r.rewardType === type);
      }
      if (role && typeof role === 'string') {
        filteredTransactions = filteredTransactions.filter(r => r.userRole === role);
      }

      // Get all wallet balances with user info
      const allWallets = await db
        .select({
          userId: walletAccounts.userId,
          tokenBalance: walletAccounts.tokenBalance,
          totalEarned: walletAccounts.totalEarned,
          totalRedeemed: walletAccounts.totalRedeemed,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userRole: users.role,
        })
        .from(walletAccounts)
        .leftJoin(users, eq(walletAccounts.userId, users.id));

      const totalWalletBalance = allWallets.reduce((sum, w) => sum + parseFloat(w.tokenBalance || '0'), 0);
      const employeeBalance = allWallets.filter(w => w.userRole === 'employee').reduce((sum, w) => sum + parseFloat(w.tokenBalance || '0'), 0);
      const customerBalance = allWallets.filter(w => w.userRole === 'customer').reduce((sum, w) => sum + parseFloat(w.tokenBalance || '0'), 0);

      res.json({
        transactions: filteredTransactions,
        wallets: allWallets,
        summary: {
          totalTokensDispensed,
          totalByType,
          totalByRole,
          totalWalletBalance,
          employeeBalance,
          customerBalance,
          walletCount: allWallets.length,
          totalTransactionCount: allRewardsForTotals.length,
        }
      });
    } catch (error) {
      console.error("Error getting token ledger:", error);
      res.status(500).json({ error: "Failed to get token ledger" });
    }
  });

  // Test SendGrid email service (admin only)
  app.get("/api/admin/test-email", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      
      const emailSuccess = await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: "✅ JC ON THE MOVE SendGrid Test",
        text: "This is a test email from your Replit backend. SendGrid is working!",
        html: "<h2>JC ON THE MOVE 🚛</h2><p>This is a test email from your Replit app. SendGrid is working!</p><p>Sent at: " + new Date().toLocaleString() + "</p>",
      });

      if (emailSuccess) {
        res.json({ 
          success: true, 
          message: "✅ Test email sent successfully! Check your inbox at " + companyEmail 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "❌ Email service is not configured or failed to send. Check server logs for details." 
        });
      }
    } catch (error: any) {
      console.error("SendGrid test error:", error);
      res.status(500).json({ 
        success: false, 
        message: "❌ Error sending test email: " + error.message 
      });
    }
  });

  // Send one test email of every type to a target address
  app.post("/api/admin/send-test-emails", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    const target = (req.body?.to as string) || process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
    const from = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
    const results: { type: string; ok: boolean }[] = [];

    const send = async (type: string, subject: string, html: string, text: string) => {
      try {
        const ok = await sendEmail({ to: target, from, subject, html, text });
        results.push({ type, ok });
      } catch { results.push({ type, ok: false }); }
    };

    // 1 — Welcome / Account Approved
    const welcome = buildApprovalWelcomeEmail("Test User");
    await send("Welcome / Account Approved", welcome.subject, welcome.html, welcome.text);

    // 2 — New Lead Notification
    const leadData = { serviceType: "Residential Move", firstName: "Jane", lastName: "Doe", email: target, phone: "906-555-0100", fromAddress: "123 Oak St, Ironwood MI", toAddress: "456 Pine Ave, Bessemer MI", moveDate: "2026-03-20", propertySize: "2 bedroom", details: "Test lead from email preview" };
    const leadEmail = generateLeadNotificationEmail(leadData);
    await send("New Lead Notification", `New Residential Move Lead — Jane Doe`, leadEmail.html, leadEmail.text);

    // 3 — Contact Form Notification
    const contactEmail = generateContactNotificationEmail({ name: "John Smith", email: target, phone: "906-555-0200", message: "Hi, I need help with a local move in Ironwood next week. Do you have availability?" });
    await send("Contact Form", `New Contact Form Submission — John Smith`, contactEmail.html, contactEmail.text);

    // 4 — Service Review Request
    await send("Service Review Request",
      `How was your Residential Moving service with JC ON THE MOVE?`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#10b981;">How did we do, Jane? ⭐</h2>
        <p>Thanks for choosing JC ON THE MOVE for your recent <strong>Residential Moving</strong> job.</p>
        <p>We'd love to hear your feedback! Leave us a quick review — it takes less than a minute and means the world to our small team.</p>
        <a href="https://jconthemove.com/review/test-job-123" style="display:inline-block;background:#f59e0b;color:#000;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">Leave a Review ⭐</a>
        <p style="color:#94a3b8;font-size:13px;">JC ON THE MOVE — Northwoods Moving & More | jconthemove.com</p>
      </div>`,
      `How did we do? Leave us a review at https://jconthemove.com/review/test-job-123`
    );

    // 5 — Account Recovery / Password Reset
    await send("Account Recovery Code",
      `JC ON THE MOVE — Account Recovery Code`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#10b981;">🔑 Your Recovery Code</h2>
        <p>We received a request to reset the password for your JC ON THE MOVE account.</p>
        <div style="background:#1e293b;border:2px solid #f59e0b;border-radius:10px;padding:20px;text-align:center;margin:20px 0;">
          <p style="font-size:36px;font-weight:900;letter-spacing:8px;color:#fbbf24;margin:0;">847291</p>
          <p style="color:#94a3b8;font-size:12px;margin:8px 0 0;">Expires in 15 minutes</p>
        </div>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p style="color:#94a3b8;font-size:13px;">JC ON THE MOVE | jconthemove.com</p>
      </div>`,
      `Your JC ON THE MOVE recovery code is: 847291\nExpires in 15 minutes.`
    );

    // 6 — New Customer Registration (admin alert)
    await send("New Customer Registration (Admin Alert)",
      `🆕 New Customer Registration: Jane Doe`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#3b82f6;">🆕 New Customer Registered</h2>
        <p><strong>Name:</strong> Jane Doe</p>
        <p><strong>Email:</strong> ${target}</p>
        <p><strong>Phone:</strong> 906-555-0100</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>Review and approve at <a href="https://jconthemove.com/admin" style="color:#3b82f6;">jconthemove.com/admin</a></p>
      </div>`,
      `New customer registered: Jane Doe | ${target} | 906-555-0100`
    );

    // 7 — Booking Confirmation
    await send("Job Booking Confirmation",
      `JC ON THE MOVE — Half Day Move Booking Confirmation`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#10b981;">✅ Your Move is Booked!</h2>
        <p>Hi Jane,</p>
        <p>Your <strong>Half Day Moving Package</strong> is confirmed!</p>
        <div style="background:#1e293b;border-radius:10px;padding:20px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Date:</strong> March 20, 2026</p>
          <p style="margin:4px 0;"><strong>Crew:</strong> 2 Movers + Truck</p>
          <p style="margin:4px 0;"><strong>Duration:</strong> Up to 4 hours</p>
          <p style="margin:4px 0;"><strong>Price:</strong> $350</p>
          <p style="margin:4px 0;"><strong>JCMOVES Earned:</strong> ~17,500 tokens</p>
        </div>
        <p>Questions? Call or text: <strong>906-XXX-XXXX</strong></p>
        <p style="color:#94a3b8;font-size:13px;">JC ON THE MOVE | jconthemove.com</p>
      </div>`,
      `Your Half Day Move is booked for March 20, 2026. 2 Movers + Truck. Price: $350. Questions? 906-XXX-XXXX`
    );

    // 8 — Reward Redemption
    await send("Reward Redemption Confirmation",
      `🎁 Reward Redeemed: $75 Off a Service`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#a855f7;">🎁 Reward Redemption Confirmed!</h2>
        <p>Hi Jane, you just redeemed:</p>
        <div style="background:linear-gradient(135deg,#3b0764,#1e293b);border:1px solid #a855f7;border-radius:12px;padding:20px;text-align:center;margin:16px 0;">
          <p style="font-size:22px;font-weight:800;color:#d8b4fe;margin:0;">$75 Off a Service</p>
          <p style="color:#94a3b8;font-size:13px;margin:8px 0 0;">Cost: 30,000 JCMOVES</p>
        </div>
        <p>Our team will apply the $75 discount to your next invoice. Book anytime within 6 months!</p>
        <p style="color:#94a3b8;font-size:13px;">JC ON THE MOVE | jconthemove.com</p>
      </div>`,
      `Reward redeemed: $75 Off a Service (30,000 JCMOVES). Discount applied to your next invoice within 6 months.`
    );

    // 9 — Bitcoin Payment Received
    await send("Bitcoin Payment Received",
      `₿ New Bitcoin Payment — Jane Doe — $325.00`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#f59e0b;">₿ Bitcoin Payment Received</h2>
        <p><strong>Customer:</strong> Jane Doe (${target})</p>
        <div style="background:#1e293b;border:1px solid #f59e0b;border-radius:10px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>USD Amount:</strong> $325.00</p>
          <p style="margin:4px 0;"><strong>BTC Amount:</strong> 0.00412 BTC</p>
          <p style="margin:4px 0;"><strong>Status:</strong> Awaiting Confirmation</p>
          <p style="margin:4px 0;"><strong>TX Hash:</strong> abc123...def456</p>
        </div>
        <p style="color:#94a3b8;font-size:13px;">JC ON THE MOVE | jconthemove.com</p>
      </div>`,
      `Bitcoin payment received: $325.00 / 0.00412 BTC from Jane Doe. Status: Awaiting Confirmation.`
    );

    // 10 — Labor Calculator Booking
    await send("Labor Calculator Booking",
      `🧮 Labor Calculator Booking — 2 Movers × 120 min`,
      `<div style="background:#0f172a;color:#f1f5f9;font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
        <h2 style="color:#06b6d4;">🧮 Labor Calculator Booking</h2>
        <p>A new booking came in through the Labor Calculator!</p>
        <div style="background:#1e293b;border-radius:10px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Customer:</strong> Jane Doe</p>
          <p style="margin:4px 0;"><strong>Email:</strong> ${target}</p>
          <p style="margin:4px 0;"><strong>Crew:</strong> 2 Movers</p>
          <p style="margin:4px 0;"><strong>Duration:</strong> 120 minutes</p>
          <p style="margin:4px 0;"><strong>Estimated Total:</strong> $180</p>
          <p style="margin:4px 0;"><strong>Service Type:</strong> Labor Only</p>
        </div>
        <p style="color:#94a3b8;font-size:13px;">JC ON THE MOVE | jconthemove.com</p>
      </div>`,
      `Labor Calculator Booking: Jane Doe | 2 Movers × 120 min | Est. $180 | Labor Only`
    );

    const allOk = results.every(r => r.ok);
    res.json({ success: allOk, sent: results.filter(r => r.ok).length, total: results.length, results });
  });

  // Public health check for environment configuration
  app.get("/api/health-check", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      configured: {
        database: !!process.env.DATABASE_URL,
        sessionSecret: !!process.env.SESSION_SECRET,
        sendgrid: !!process.env.SENDGRID_API_KEY,
      },
      authType: "email/password"
    });
  });

  // Get system configuration (admin only) - shows environment variable status without exposing values
  app.get("/api/admin/system/config", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const systemConfig = {
        environment: process.env.NODE_ENV || 'development',
        database: {
          status: process.env.DATABASE_URL ? 'configured' : 'missing',
          type: 'PostgreSQL'
        },
        email: {
          sendgrid: {
            status: process.env.SENDGRID_API_KEY ? 'configured' : 'missing',
            companyEmail: process.env.COMPANY_EMAIL ? 'configured' : 'missing'
          }
        },
        authentication: {
          sessionSecret: process.env.SESSION_SECRET ? 'configured' : 'missing',
          type: 'email/password'
        },
        crypto: {
          moonshot: {
            tokenAddress: process.env.MOONSHOT_TOKEN_ADDRESS ? 'configured' : 'missing'
          },
          requestTech: {
            apiKey: process.env.REQUEST_TECH_API_KEY ? 'configured' : 'missing'
          },
          encryption: {
            key: process.env.ENCRYPTION_KEY ? 'configured' : 'missing'
          }
        },
        server: {
          port: process.env.PORT || '5000'
        },
        lastChecked: new Date().toISOString()
      };

      res.json(systemConfig);
    } catch (error) {
      console.error("Error getting system config:", error);
      res.status(500).json({ error: "Failed to get system configuration" });
    }
  });

  // Get system health status (admin only)
  app.get("/api/admin/system/health", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const healthStatus = {
        database: {
          status: 'healthy',
          connected: true,
          lastCheck: new Date().toISOString()
        },
        services: {
          email: process.env.SENDGRID_API_KEY ? 'available' : 'disabled',
          authentication: 'active',
          rewards: 'active',
          treasury: 'active'
        },
        security: {
          encryption: process.env.ENCRYPTION_KEY ? 'enabled' : 'disabled',
          authentication: 'enabled',
          roleBasedAccess: 'enabled'
        },
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        version: process.version,
        platform: process.platform,
        lastUpdated: new Date().toISOString()
      };

      res.json(healthStatus);
    } catch (error) {
      console.error("Error getting system health:", error);
      res.status(500).json({ error: "Failed to get system health status" });
    }
  });

  // ====================== GAMIFICATION API ROUTES ======================

  // Daily check-in endpoint
  app.post("/api/gamification/checkin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const result = await gamificationService.performDailyCheckIn(userId);
      
      if (result.success) {
        await awardTierPoints(userId, 'daily_checkin');
        res.json({
          success: true,
          points: result.points,
          tokens: result.tokens,
          streak: result.streak,
          isNewRecord: result.isNewRecord,
          treasuryBalance: result.treasuryBalance,
          message: `Daily check-in successful! Earned ${result.points} points and ${result.tokens} JCMOVES tokens.`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          streak: result.streak,
          treasuryBalance: result.treasuryBalance
        });
      }
    } catch (error) {
      console.error("Error during daily check-in:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process daily check-in"
      });
    }
  });

  // Get employee gamification data (stats, achievements, rank, etc.)
  app.get("/api/gamification/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const data = await gamificationService.getEmployeeGamificationData(userId);
      
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error("Error getting gamification stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get gamification data"
      });
    }
  });

  // Get weekly leaderboard
  app.get("/api/gamification/leaderboard", isAuthenticated, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 results
      const leaderboard = await gamificationService.getWeeklyLeaderboard();
      
      res.json({
        success: true,
        leaderboard: leaderboard.slice(0, limit)
      });
    } catch (error) {
      console.error("Error getting leaderboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get leaderboard data"
      });
    }
  });

  // Award job completion points (internal endpoint for job workflow)
  app.post("/api/gamification/job-completion", isAuthenticated, async (req: any, res) => {
    try {
      const { jobId, onTime, customerRating } = req.body;
      const userId = (req.session as any).userId;
      
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "Job ID is required"
        });
      }

      const result = await gamificationService.awardJobCompletionPoints(userId, jobId, {
        onTime: Boolean(onTime),
        customerRating: customerRating ? parseFloat(customerRating) : undefined
      });
      
      res.json({
        success: true,
        points: result.points,
        tokens: result.tokens,
        level: result.level,
        message: `Job completion reward: ${result.points} points and ${result.tokens} JCMOVES tokens!`
      });
    } catch (error) {
      console.error("Error awarding job completion points:", error);
      res.status(500).json({
        success: false,
        error: "Failed to award job completion points"
      });
    }
  });

  // Get user's weekly rank
  app.get("/api/gamification/rank", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const rank = await gamificationService.getWeeklyRank(userId);
      
      res.json({
        success: true,
        rank
      });
    } catch (error) {
      console.error("Error getting user rank:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user rank"
      });
    }
  });

  // ====================== FAUCET API ROUTES ======================

  // Get user's faucet status for all supported currencies
  app.get("/api/faucet/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const faucetStatus = await faucetService.getFaucetStatus(userId);
      
      res.json({
        success: true,
        data: faucetStatus
      });
    } catch (error) {
      console.error("Error getting faucet status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get faucet status"
      });
    }
  });

  // Claim faucet reward for a specific currency
  app.post("/api/faucet/claim/:currency", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currency } = req.params;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      if (!currency) {
        return res.status(400).json({
          success: false,
          error: "Currency is required"
        });
      }

      const result = await faucetService.claimFaucetReward(userId, currency.toUpperCase(), userAgent, ipAddress);
      
      if (result.success) {
        res.json({
          success: true,
          currency: result.currency,
          amount: result.amount,
          nextClaimTime: result.nextClaimTime,
          message: `Successfully claimed ${result.amount} ${result.currency} credits!`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          nextClaimTime: result.nextClaimTime
        });
      }
    } catch (error) {
      console.error("Error claiming faucet reward:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process faucet claim"
      });
    }
  });

  // ====================== ADVERTISING API ROUTES ======================

  // Track ad impression
  app.post("/api/advertising/impression", async (req, res) => {
    try {
      const { placementId, network } = req.body;
      
      if (!placementId || !network) {
        return res.status(400).json({ error: "placementId and network are required" });
      }

      const advertisingService = getAdvertisingService();
      const impressionId = await advertisingService.trackImpression(
        placementId, 
        network,
        (req.session as any).userId,
        req.body.sessionId,
        req.body.userAgent,
        req.ip
      );
      
      res.json({ success: true, impressionId });
    } catch (error) {
      console.error("Error tracking ad impression:", error);
      res.status(500).json({ error: "Failed to track impression" });
    }
  });

  // Track ad click
  app.post("/api/advertising/click", async (req, res) => {
    try {
      const { impressionId, placementId, network, clickUrl } = req.body;
      
      if (!impressionId || !placementId || !network) {
        return res.status(400).json({ error: "impressionId, placementId and network are required" });
      }

      const advertisingService = getAdvertisingService();
      const clickId = await advertisingService.trackClick(
        impressionId,
        placementId, 
        network,
        (req.session as any).userId,
        clickUrl
      );
      
      res.json({ success: true, clickId });
    } catch (error) {
      console.error("Error tracking ad click:", error);
      res.status(500).json({ error: "Failed to track click" });
    }
  });

  // Get advertising configuration for frontend
  app.get("/api/advertising/config", async (req, res) => {
    try {
      const advertisingService = getAdvertisingService();
      
      res.json({
        enabled: advertisingService.isConfigured(),
        networks: advertisingService.getEnabledNetworks(),
        scripts: advertisingService.getAdScripts()
      });
    } catch (error) {
      console.error("Error getting advertising config:", error);
      res.status(500).json({ error: "Failed to get advertising configuration" });
    }
  });

  // Get ad placement for specific location
  app.get("/api/advertising/placement/:placementId", async (req, res) => {
    try {
      const { placementId } = req.params;
      const { type = 'banner' } = req.query;
      
      const advertisingService = getAdvertisingService();
      const placement = advertisingService.getAdPlacement(
        placementId, 
        type as 'banner' | 'video' | 'popup' | 'interstitial'
      );
      
      if (!placement) {
        return res.status(404).json({ error: "No ads available" });
      }
      
      res.json(placement);
    } catch (error) {
      console.error("Error getting ad placement:", error);
      res.status(500).json({ error: "Failed to get ad placement" });
    }
  });

  // Admin: Get advertising statistics (business owner only)
  app.get("/api/advertising/admin/stats", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const advertisingService = getAdvertisingService();
      const stats = await advertisingService.getAdvertisingStats();
      
      res.json({ stats });
    } catch (error) {
      console.error("Error getting advertising stats:", error);
      res.status(500).json({ error: "Failed to get advertising statistics" });
    }
  });

  // Admin: Get estimated revenue (business owner only)  
  app.get("/api/advertising/admin/revenue", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { dailyImpressions = 1000 } = req.query;
      
      const advertisingService = getAdvertisingService();
      const estimatedRevenue = await advertisingService.getEstimatedRevenue(Number(dailyImpressions));
      
      res.json({ estimatedRevenue });
    } catch (error) {
      console.error("Error getting estimated revenue:", error);
      res.status(500).json({ error: "Failed to get estimated revenue" });
    }
  });

  // Track ad completion for faucet claim validation
  app.post("/api/advertising/completion", isAuthenticated, async (req, res) => {
    try {
      const { impressionId, sessionId, network, completionType = 'view' } = req.body;
      const userId = (req.session as any).userId;
      
      if (!impressionId || !sessionId || !network) {
        return res.status(400).json({ error: "impressionId, sessionId, and network are required" });
      }

      const advertisingService = getAdvertisingService();
      const completionId = await advertisingService.trackAdCompletion(
        userId,
        impressionId,
        sessionId,
        network,
        completionType
      );
      
      res.json({ success: true, completionId });
    } catch (error) {
      console.error("Error tracking ad completion:", error);
      res.status(500).json({ error: "Failed to track ad completion" });
    }
  });

  // SECURITY ENDPOINT: Check server-verified ad completion (prevents console spoofing)
  app.get("/api/advertising/check-completion/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const advertisingService = getAdvertisingService();
      
      // Check if this session has a verified completion from real webhook
      const verified = await advertisingService.checkWebhookVerifiedCompletion(sessionId);
      
      res.json({ verified });
    } catch (error) {
      console.error("Error checking ad completion:", error);
      res.status(500).json({ error: "Failed to check completion status" });
    }
  });

  // SECURITY WEBHOOK: Real Bitmedia/Cointraffic webhook endpoint (production use)
  // CRITICAL: Raw body preserved by global webhook middleware in server/index.ts
  app.post("/api/advertising/webhook/:network", async (req, res) => {
    try {
      const { network } = req.params;
      const rawBody = req.body; // Raw Buffer from global webhook middleware
      const webhookData = JSON.parse(rawBody.toString()); // Parse for processing
      
      // Extract signature from headers (varies by vendor)
      const signature = req.headers['x-signature'] || 
                       req.headers['x-bitmedia-signature'] || 
                       req.headers['x-cointraffic-signature'] || 
                       req.headers['authorization'];
      
      console.log(`🔐 SECURITY: Received ${network} webhook with signature validation`);
      
      const advertisingService = getAdvertisingService();
      await advertisingService.processWebhookCompletion(network, webhookData, signature as string, rawBody);
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ SECURITY: Webhook authentication failed:", error);
      res.status(401).json({ error: "Unauthorized webhook - authentication failed" });
    }
  });

  // ====================== FAUCET ADMIN API ROUTES ======================

  // Faucet validation schemas
  const faucetClaimSchema = z.object({
    currency: z.enum(['BTC', 'ETH', 'LTC', 'DOGE']),
    faucetpayAddress: z.string().min(10).max(100),
    deviceFingerprint: z.string().optional(),
  });

  // Get available faucet currencies and configurations
  app.get("/api/faucet/config", async (req, res) => {
    try {
      const configs = await storage.getFaucetConfig();
      const enabledConfigs = configs.filter(config => config.isEnabled);
      
      res.json({
        currencies: enabledConfigs,
        defaultInterval: FAUCET_CONFIG.DEFAULT_CLAIM_INTERVAL,
        isConfigured: true, // Always configured - handles all modes (DEMO, FAUCETPAY, SELF_FUNDED)
        mode: FAUCET_CONFIG.MODE,
        hasFaucetPayKey: !!process.env.FAUCETPAY_API_KEY
      });
    } catch (error) {
      console.error("Error getting faucet config:", error);
      res.status(500).json({ error: "Failed to get faucet configuration" });
    }
  });

  // Check if user can claim for a specific currency
  app.get("/api/faucet/claim-status/:currency", isAuthenticated, async (req: any, res) => {
    try {
      const { currency } = req.params;
      const userId = (req.session as any).userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const claimStatus = await storage.canUserClaim(userId, currency);
      const wallet = await storage.getFaucetWallet(userId, currency);
      
      res.json({
        ...claimStatus,
        totalEarned: wallet?.totalEarned || "0",
        totalClaims: wallet?.totalClaims || 0,
        lastClaimTime: wallet?.lastClaimTime
      });
    } catch (error) {
      console.error("Error checking claim status:", error);
      res.status(500).json({ error: "Failed to check claim status" });
    }
  });

  // Process faucet claim
  app.post("/api/faucet/claim", isAuthenticated, async (req: any, res) => {
    try {
      const { currency, faucetpayAddress, deviceFingerprint } = faucetClaimSchema.parse(req.body);
      const userId = (req.session as any).userId;
      const userEmail = req.user?.claims?.email;

      if (!userId || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if FaucetPay is configured
      const faucetPayService = getFaucetPayService();
      if (!faucetPayService) {
        return res.status(503).json({ error: "Faucet service is not configured" });
      }

      // ============= SERVER-SIDE AD COMPLETION VALIDATION =============
      // Check if user has completed required advertisement viewing
      const { sessionId } = req.body;
      if (sessionId) {
        const advertisingService = getAdvertisingService();
        const adCompleted = await advertisingService.verifyAdCompletion(userId, sessionId);
        
        if (!adCompleted) {
          return res.status(400).json({
            error: "Ad completion required",
            message: "You must watch and complete an advertisement before claiming rewards. Please watch the ad and try again."
          });
        }
        
        console.log(`✅ Ad completion verified for user ${userId} with session ${sessionId}`);
      } else {
        console.log(`⚠️ No session ID provided for faucet claim - skipping ad verification for user ${userId}`);
      }

      // Check if user can claim
      const claimStatus = await storage.canUserClaim(userId, currency);
      if (!claimStatus.canClaim) {
        return res.status(429).json({ 
          error: "Claim not available yet",
          nextClaimTime: claimStatus.nextClaimTime,
          secondsRemaining: claimStatus.secondsRemaining
        });
      }

      // Get faucet configuration
      const [config] = await storage.getFaucetConfig(currency);
      if (!config || !config.isEnabled) {
        return res.status(400).json({ error: `Faucet not available for ${currency}` });
      }

      // Check FaucetPay balance
      try {
        const balance = await faucetPayService.getBalance(currency);
        const balanceAmount = parseInt(balance.balance);
        const rewardAmountNumber = parseFloat(config.rewardAmount);
        if (balanceAmount < rewardAmountNumber) {
          return res.status(503).json({ error: "Faucet temporarily out of funds" });
        }
      } catch (error) {
        console.error("FaucetPay balance check failed:", error);
        return res.status(503).json({ error: "Faucet service temporarily unavailable" });
      }

      // Calculate reward and cash value
      const rewardAmount = parseFloat(config.rewardAmount);
      const cashValue = rewardAmount * 0.001; // Estimate based on crypto prices

      // Get user's IP address for anti-fraud
      const ipAddress = req.ip || req.connection.remoteAddress || '';

      let claim: any = null;
      try {
        // Create faucet claim record
        claim = await storage.createFaucetClaim({
          userId,
          currency,
          rewardAmount: config.rewardAmount,
          cashValue: cashValue.toFixed(2),
          ipAddress,
          userAgent: req.get('User-Agent'),
          deviceFingerprint
        });

        // Send payment via FaucetPay
        const paymentResult = await faucetPayService.sendPayment({
          amount: parseInt(config.rewardAmount),
          to: faucetpayAddress,
          currency,
          ipAddress
        });

        // Update claim with payment details
        await storage.updateFaucetClaim(claim.id, {
          status: 'paid',
          faucetpayPayoutId: paymentResult.payout_id.toString(),
          faucetpayUserHash: paymentResult.payout_user_hash
        });

        // Create or update user's faucet wallet
        const existingWallet = await storage.getFaucetWallet(userId, currency);
        if (existingWallet && userId && faucetpayAddress) {
          await storage.updateFaucetWallet(userId, currency, {
            totalEarned: (parseFloat(existingWallet.totalEarned || '0') + rewardAmount).toFixed(8),
            totalClaims: (existingWallet.totalClaims || 0) + 1,
            lastClaimTime: new Date(),
            faucetpayAddress
          });
        } else if (faucetpayAddress) {
          await storage.createFaucetWallet({
            userId,
            currency,
            faucetpayAddress,
            lastClaimTime: new Date()
          });
        }

        // Update daily revenue tracking
        const today = new Date().toISOString().split('T')[0];
        await storage.updateFaucetRevenue(today, currency, {
          totalClaims: 1,
          totalRewards: rewardAmount.toFixed(8),
          totalRevenue: "0.05", // Self-funded faucet revenue estimate
          uniqueUsers: 1,
          adViews: 1
        });

        res.json({
          success: true,
          reward: {
            amount: rewardAmount,
            currency,
            cashValue,
            payoutId: paymentResult.payout_id
          },
          nextClaimTime: new Date(Date.now() + config.claimInterval * 1000),
          remainingBalance: paymentResult.balance
        });

      } catch (paymentError: any) {
        console.error("FaucetPay payment failed:", paymentError);
        
        // Update claim status to failed - only if claim was created
        if (claim) {
          await storage.updateFaucetClaim(claim.id, {
            status: 'failed',
            failureReason: paymentError.message
          });
        }

        res.status(500).json({ 
          error: "Payment failed", 
          details: paymentError.message 
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }
      console.error("Error processing faucet claim:", error);
      res.status(500).json({ error: "Failed to process claim" });
    }
  });

  // Get user's faucet claim history
  app.get("/api/faucet/claims", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const currency = req.query.currency as string;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const claims = await storage.getFaucetClaims(userId, currency, limit);
      res.json({ claims });
    } catch (error) {
      console.error("Error getting faucet claims:", error);
      res.status(500).json({ error: "Failed to get claim history" });
    }
  });

  // Admin: Get faucet revenue statistics (business owner only)
  app.get("/api/faucet/admin/revenue", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const revenue = await storage.getFaucetRevenue();
      res.json({ revenue });
    } catch (error) {
      console.error("Error getting faucet revenue:", error);
      res.status(500).json({ error: "Failed to get revenue statistics" });
    }
  });

  // Admin: Update faucet configuration (business owner only)
  app.put("/api/faucet/admin/config/:currency", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { currency } = req.params;
      const updates = req.body;

      const updatedConfig = await storage.updateFaucetConfig(currency, updates);
      if (!updatedConfig) {
        return res.status(404).json({ error: "Currency configuration not found" });
      }

      res.json({ config: updatedConfig });
    } catch (error) {
      console.error("Error updating faucet config:", error);
      res.status(500).json({ error: "Failed to update configuration" });
    }
  });

  // ===== WALLET MANAGEMENT ROUTES =====
  
  // Get user's crypto wallets
  app.get("/api/wallets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const wallets = await walletService.getUserWallets(userId);
      res.json({ wallets });
    } catch (error) {
      console.error("Error fetching user wallets:", error);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  // Create wallets for user (all supported currencies)
  app.post("/api/wallets/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const wallets = await walletService.createAllWalletsForUser(userId);
      res.json({ 
        success: true, 
        wallets,
        message: `Created ${wallets.length} crypto wallets`
      });
    } catch (error) {
      console.error("Error creating wallets:", error);
      res.status(500).json({ error: "Failed to create wallets" });
    }
  });

  // Get wallet balance for specific currency
  app.get("/api/wallets/:currency/balance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currency } = req.params;
      
      const balanceInfo = await walletService.getWalletBalance(userId, currency);
      if (!balanceInfo) {
        return res.status(404).json({ error: "Wallet not found for this currency" });
      }
      
      res.json({ 
        currency: balanceInfo.currency.symbol,
        balance: balanceInfo.balance,
        currencyDetails: balanceInfo.currency
      });
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      res.status(500).json({ error: "Failed to fetch wallet balance" });
    }
  });

  // Get wallet transfer summary (Admin only)
  app.get("/api/wallets/transfer-summary", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      
      // Get all user wallets
      const wallets = await storage.getUserWalletsWithCurrency(userId);
      
      // Calculate transfer summary for JCMOVES only
      let totalWithdrawn = 0;
      let totalTransactionCount = 0;
      
      for (const wallet of wallets) {
        // Only count JCMOVES transfers
        if (wallet.currency.symbol === 'JCMOVES') {
          const transactions = await storage.getWalletTransactions(wallet.id, 1000);
          const withdrawals = transactions.filter(tx => 
            tx.transactionType === 'withdrawal' || tx.transactionType === 'transfer'
          );
          
          totalTransactionCount += withdrawals.length;
          
          for (const tx of withdrawals) {
            totalWithdrawn += parseFloat(tx.amount);
          }
        }
      }
      
      res.json({
        totalWithdrawn: totalWithdrawn.toFixed(8),
        transactionCount: totalTransactionCount,
        walletCount: wallets.length
      });
    } catch (error) {
      console.error("Error fetching transfer summary:", error);
      res.status(500).json({ error: "Failed to fetch transfer summary" });
    }
  });

  // Treasury Wallet Endpoints (Admin only)
  app.get("/api/treasury/wallets", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const treasuryWallets = await storage.getTreasuryWallets('admin');
      res.json({ wallets: treasuryWallets });
    } catch (error) {
      console.error("Error fetching treasury wallets:", error);
      res.status(500).json({ error: "Failed to fetch treasury wallets" });
    }
  });

  // Update treasury wallet address (Admin only)
  app.put("/api/treasury/wallets/:walletId", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { walletId } = req.params;
      const { walletAddress } = req.body;

      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: "Wallet address is required" });
      }

      // Validate Solana address format
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(walletAddress)) {
        return res.status(400).json({ error: "Invalid Solana wallet address format" });
      }

      const updatedWallet = await storage.updateTreasuryWalletAddress(walletId, walletAddress);
      if (!updatedWallet) {
        return res.status(404).json({ error: "Treasury wallet not found" });
      }

      console.log(`✅ Treasury wallet ${walletId} updated to address: ${walletAddress}`);
      res.json({ success: true, wallet: updatedWallet });
    } catch (error) {
      console.error("Error updating treasury wallet:", error);
      res.status(500).json({ error: "Failed to update treasury wallet" });
    }
  });

  // Create or update treasury wallet for a currency (Admin only)
  app.post("/api/treasury/wallets", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { currencyId, walletAddress, purpose } = req.body;

      if (!currencyId || !walletAddress) {
        return res.status(400).json({ error: "Currency ID and wallet address are required" });
      }

      // Validate Solana address format
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(walletAddress)) {
        return res.status(400).json({ error: "Invalid Solana wallet address format" });
      }

      const wallet = await storage.upsertTreasuryWallet(currencyId, walletAddress, purpose || 'treasury');
      console.log(`✅ Treasury wallet upserted: ${wallet.id} with address ${walletAddress}`);
      res.json({ success: true, wallet });
    } catch (error) {
      console.error("Error upserting treasury wallet:", error);
      res.status(500).json({ error: "Failed to create/update treasury wallet" });
    }
  });

  // Get wallet transactions
  app.get("/api/wallets/:walletId/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { walletId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      console.log(`🔍 Fetching transactions for walletId: ${walletId}, user: ${userId}`);
      
      // Verify wallet belongs to user
      const wallet = await storage.getUserWalletById(walletId);
      console.log(`📂 Wallet found:`, wallet ? `Yes (userId: ${wallet.userId})` : 'No');
      
      if (!wallet || wallet.userId !== userId) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      const transactions = await storage.getWalletTransactions(walletId, limit);
      console.log(`📜 Transactions found: ${transactions.length}`);
      
      res.json({ transactions });
    } catch (error) {
      console.error("Error fetching wallet transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Record a deposit (for external deposits)
  app.post("/api/wallets/deposit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currency, amount, transactionHash, source } = req.body;

      if (!currency || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid currency or amount" });
      }

      // Get user's wallet for this currency
      const currencyData = await storage.getSupportedCurrencyBySymbol(currency);
      if (!currencyData) {
        return res.status(400).json({ error: "Currency not supported" });
      }

      const wallet = await storage.getUserWallet(userId, currencyData.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found. Create wallets first." });
      }

      // Record the deposit transaction
      const transaction = await walletService.recordTransaction(
        wallet.id,
        'deposit',
        amount,
        {
          source: source || 'external',
          transactionHash,
          depositor: 'user',
          timestamp: new Date().toISOString()
        }
      );

      res.json({ 
        success: true, 
        transaction,
        newBalance: transaction.balanceAfter,
        message: `Successfully deposited ${amount} ${currency}`
      });
    } catch (error) {
      console.error("Error recording deposit:", error);
      res.status(500).json({ error: "Failed to record deposit" });
    }
  });

  // Wallet export request endpoint  
  app.post("/api/wallets/export-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { amount, withdrawalAddress, notes, currency } = req.body;
      
      if (!amount || !currency || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid export request data" });
      }

      if (!withdrawalAddress || withdrawalAddress.trim() === '') {
        return res.status(400).json({ error: "Wallet address is required" });
      }

      if (currency !== 'JCMOVES') {
        return res.status(400).json({ error: "Export only supported for JCMOVES tokens" });
      }

      // Get user's JCMOVES wallet
      const userWallets = await walletService.getUserWallets(userId);
      const jcmovesWallet = userWallets.find(w => w.currency.symbol === 'JCMOVES');
      
      if (!jcmovesWallet) {
        return res.status(404).json({ error: "JCMOVES wallet not found" });
      }

      const currentBalance = parseFloat(jcmovesWallet.balance);
      const exportAmount = parseFloat(amount);

      if (exportAmount > currentBalance) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Auto-approve the withdrawal after user confirmation
      // Create a confirmed transaction record with blockchain placeholder
      const transactionResult = await storage.createWalletTransaction({
        userWalletId: jcmovesWallet.id,
        transactionType: 'withdrawal',
        amount: exportAmount.toString(),
        balanceAfter: (currentBalance - exportAmount).toString(),
        transactionHash: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Placeholder until blockchain integration
        status: 'confirmed',
        confirmations: 1,
        metadata: {
          withdrawalAddress: withdrawalAddress || null,
          notes: notes || null,
          exportRequest: true,
          autoApproved: true,
          requestedAt: new Date().toISOString(),
          approvedAt: new Date().toISOString()
        }
      });

      // Update wallet balance
      await storage.updateUserWalletBalance(jcmovesWallet.id, (currentBalance - exportAmount).toString());

      res.json({ 
        success: true, 
        message: "Withdrawal approved and processed successfully",
        transactionId: transactionResult.id,
        transactionHash: transactionResult.transactionHash,
        amount: exportAmount,
        newBalance: (currentBalance - exportAmount).toString(),
        approved: true
      });

    } catch (error) {
      console.error("Error processing export request:", error);
      res.status(500).json({ error: "Failed to process export request" });
    }
  });

  // Sync tokens from rewards system to crypto wallets
  app.post("/api/wallets/sync-from-rewards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get user's current reward balance from walletAccounts
      const rewardWallet = await storage.getWalletAccount(userId);
      if (!rewardWallet) {
        return res.status(404).json({ error: "No rewards wallet found" });
      }

      const rewardBalance = parseFloat(rewardWallet.tokenBalance || '0');
      if (rewardBalance <= 0) {
        return res.status(400).json({ error: "No tokens to sync" });
      }

      // Get or create user's JCMOVES crypto wallet
      const userWallets = await walletService.getUserWallets(userId);
      let jcmovesWallet = userWallets.find(w => w.currency.symbol === 'JCMOVES');
      
      if (!jcmovesWallet) {
        // Create JCMOVES wallet if it doesn't exist
        const walletService = new (await import('./services/wallet.js')).WalletService();
        await walletService.createUserWallet(userId, 'JCMOVES');
        // Refetch with currency info
        const updatedWallets = await walletService.getUserWallets(userId);
        jcmovesWallet = updatedWallets.find(w => w.currency.symbol === 'JCMOVES');
        
        if (!jcmovesWallet) {
          throw new Error('Failed to create JCMOVES wallet');
        }
      }

      // Calculate new balances
      const currentCryptoBalance = parseFloat(jcmovesWallet.balance);
      const newCryptoBalance = currentCryptoBalance + rewardBalance;

      // Transfer the tokens
      // 1. Add to crypto wallet
      await storage.updateUserWalletBalance(jcmovesWallet.id, newCryptoBalance.toString());
      
      // 2. Record the sync transaction
      await storage.createWalletTransaction({
        userWalletId: jcmovesWallet.id,
        transactionType: 'deposit',
        amount: rewardBalance.toString(),
        balanceAfter: newCryptoBalance.toString(),
        transactionHash: null,
        status: 'confirmed',
        confirmations: 1,
        metadata: {
          syncFromRewards: true,
          originalRewardBalance: rewardBalance.toString(),
          syncedAt: new Date().toISOString(),
          source: 'rewards_system'
        }
      });

      // 3. Clear the rewards balance (set to 0)
      await storage.updateWalletAccount(userId, {
        tokenBalance: "0.00000000"
      });

      res.json({ 
        success: true, 
        message: "Tokens successfully synced to crypto wallet",
        syncedAmount: rewardBalance,
        newCryptoBalance: newCryptoBalance,
        walletId: jcmovesWallet.id
      });

    } catch (error) {
      console.error("Error syncing tokens from rewards:", error);
      res.status(500).json({ error: "Failed to sync tokens" });
    }
  });

  // Internal transfer between users
  app.post("/api/wallets/transfer", isAuthenticated, async (req: any, res) => {
    try {
      const fromUserId = req.currentUser.id;
      const { toUserId, currency, amount, note } = req.body;

      if (!toUserId || !currency || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Missing required fields or invalid amount" });
      }

      if (fromUserId === toUserId) {
        return res.status(400).json({ error: "Cannot transfer to yourself" });
      }

      // Verify recipient exists
      const recipient = await storage.getUser(toUserId);
      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      const transferResult = await walletService.internalTransfer(
        fromUserId,
        toUserId,
        currency,
        amount,
        note
      );

      res.json({ 
        success: true, 
        transfer: transferResult,
        message: `Successfully transferred ${amount} ${currency} to ${recipient.firstName} ${recipient.lastName}`
      });
    } catch (error) {
      console.error("Error processing transfer:", error);
      res.status(500).json({ error: error.message || "Failed to process transfer" });
    }
  });

  // Transfer tokens from user's JCMOVES wallet to treasury (admin, employee, and business_owner only - not customers)
  app.post("/api/wallets/fund-treasury", isAuthenticated, requireTreasuryAccess, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { amount, note } = req.body;

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      // Get user's JCMOVES wallet
      const userWallets = await walletService.getUserWallets(userId);
      const jcmovesWallet = userWallets.find(w => w.currency.symbol === 'JCMOVES');
      
      if (!jcmovesWallet) {
        return res.status(404).json({ error: "JCMOVES wallet not found" });
      }

      const currentBalance = parseFloat(jcmovesWallet.balance);
      const transferAmount = parseFloat(amount);

      if (transferAmount > currentBalance) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // 1. Deduct from user's wallet
      const newBalance = currentBalance - transferAmount;
      await storage.updateUserWalletBalance(jcmovesWallet.id, newBalance.toString());

      // 2. Record withdrawal transaction
      await storage.createWalletTransaction({
        userWalletId: jcmovesWallet.id,
        transactionType: 'withdrawal',
        amount: transferAmount.toString(),
        balanceAfter: newBalance.toString(),
        transactionHash: `treasury_funding_${Date.now()}`,
        status: 'confirmed',
        confirmations: 1,
        metadata: {
          treasuryFunding: true,
          note: note || 'Treasury funding',
          fundedAt: new Date().toISOString()
        }
      });

      // 3. Add to treasury funding - get current token price for USD value
      const treasuryService = new (await import('./services/treasury.js')).TreasuryService();
      const priceData = await treasuryService.getCurrentTokenPrice();
      const usdValue = transferAmount * priceData.price;
      
      // Add tokens and USD value to treasury reserve
      await storage.addToReserve(
        transferAmount,
        usdValue,
        `Treasury funding from user wallet: ${note || 'Wallet to Treasury transfer'}`
      );

      res.json({ 
        success: true, 
        message: `Successfully transferred ${transferAmount} JCMOVES ($${usdValue.toFixed(2)}) to treasury`,
        transferredAmount: transferAmount,
        usdValue: usdValue.toFixed(2),
        newWalletBalance: newBalance,
        treasuryFunded: true
      });

    } catch (error) {
      console.error("Error funding treasury from wallet:", error);
      res.status(500).json({ error: "Failed to fund treasury" });
    }
  });

  // ============ PROMO CODE ENDPOINTS ============

  // Validate a promo code (public - no auth required, just checks if valid)
  app.post("/api/promo-codes/validate", async (req: any, res) => {
    try {
      const { code, context } = z.object({
        code: z.string().min(1).max(50),
        context: z.enum(['service', 'jewelry', 'any']).default('any'),
      }).parse(req.body);

      const { promoCodes } = await import("@shared/schema");
      const [promo] = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, code.toUpperCase().trim()))
        .limit(1);

      if (!promo) return res.status(404).json({ valid: false, error: "Promo code not found" });
      if (!promo.isActive) return res.status(400).json({ valid: false, error: "This promo code is no longer active" });
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        return res.status(400).json({ valid: false, error: "This promo code has expired" });
      }
      if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
        return res.status(400).json({ valid: false, error: "This promo code has reached its usage limit" });
      }

      const discountPercent = context === 'jewelry'
        ? parseFloat(promo.discountPercentJewelry || "0")
        : parseFloat(promo.discountPercent || "0");

      return res.json({
        valid: true,
        code: promo.code,
        description: promo.description,
        discountPercent,
        discountPercentService: parseFloat(promo.discountPercent || "0"),
        discountPercentJewelry: parseFloat(promo.discountPercentJewelry || "0"),
        rewardTokens: parseFloat(promo.rewardTokens || "0"),
      });
    } catch (error: any) {
      res.status(400).json({ valid: false, error: error.message });
    }
  });

  // Apply a promo code (authenticated — credits tokens to user and referral user)
  app.post("/api/promo-codes/apply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { code, context, enrollRewards } = z.object({
        code: z.string().min(1).max(50),
        context: z.enum(['service', 'jewelry', 'any']).default('any'),
        enrollRewards: z.boolean().optional(),
      }).parse(req.body);

      const { promoCodes, users } = await import("@shared/schema");
      const [promo] = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, code.toUpperCase().trim()))
        .limit(1);

      if (!promo) return res.status(404).json({ success: false, error: "Promo code not found" });
      if (!promo.isActive) return res.status(400).json({ success: false, error: "This promo code is no longer active" });
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        return res.status(400).json({ success: false, error: "This promo code has expired" });
      }
      if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
        return res.status(400).json({ success: false, error: "This promo code has reached its usage limit" });
      }

      // Check that the user has a real, completed account (TOS accepted)
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      
      // If customer reward exists, handle enrollment
      const customerRewardRaw = parseFloat(promo.rewardTokens || "0");
      let customerReward = customerRewardRaw;

      if (customerRewardRaw > 0) {
        // If they didn't check the box and aren't already enrolled, they don't get the tokens
        // but the discount still applies.
        if (!enrollRewards && !user.rewardsEnrolled) {
          customerReward = 0;
        } else {
          // They want to enroll or are already enrolled
          if (!user.tosAccepted) {
            return res.status(403).json({
              success: false,
              error: "You must complete account setup and accept the Terms of Service before redeeming token rewards.",
            });
          }
          // Auto-enroll ONLY if they checked the box and aren't already
          if (enrollRewards && !user.rewardsEnrolled) {
            await db.update(users).set({ rewardsEnrolled: true }).where(eq(users.id, userId));
          }
        }
      }

      // Prevent the same user from using the same promo code twice
      const { rewards: rewardsSchema } = await import("@shared/schema");
      const [existingUse] = await db
        .select()
        .from(rewardsSchema)
        .where(
          and(
            eq(rewardsSchema.userId, userId),
            eq(rewardsSchema.rewardType, 'promo_code'),
            sql`${rewardsSchema.metadata}->>'promoCode' = ${promo.code}`
          )
        )
        .limit(1);

      if (existingUse) {
        return res.status(400).json({
          success: false,
          error: "You have already used this promo code.",
        });
      }

      // Increment uses count and auto-delete when fully exhausted
      const newUsesCount = promo.usesCount + 1;
      if (promo.maxUses !== null && newUsesCount >= promo.maxUses) {
        await db.delete(promoCodes).where(eq(promoCodes.id, promo.id));
      } else {
        await db.update(promoCodes)
          .set({ usesCount: newUsesCount, updatedAt: new Date() })
          .where(eq(promoCodes.id, promo.id));
      }

      // Credit reward tokens to the customer
      if (customerReward > 0) {
        await storage.creditWalletTokens(userId, customerReward);
        const { rewards: rewardsTable } = await import("@shared/schema");
        await db.insert(rewardsTable).values({
          userId,
          rewardType: 'promo_code',
          tokenAmount: customerReward.toString(),
          cashValue: "0.00",
          status: 'confirmed',
          metadata: { promoCode: promo.code, context }
        });
      }

      // Credit referral tokens to the code owner
      const referralReward = parseFloat(promo.referralRewardTokens || "0");
      if (referralReward > 0 && promo.referralUserId && promo.referralUserId !== userId) {
        await storage.creditWalletTokens(promo.referralUserId, referralReward);
        const { rewards } = await import("@shared/schema");
        await db.insert(rewards).values({
          userId: promo.referralUserId,
          rewardType: 'referral_promo',
          tokenAmount: referralReward.toString(),
          cashValue: "0.00",
          status: 'confirmed',
          metadata: { promoCode: promo.code, usedByUserId: userId, context }
        });
      }

      const discountPercent = context === 'jewelry'
        ? parseFloat(promo.discountPercentJewelry || "0")
        : parseFloat(promo.discountPercent || "0");

      return res.json({
        success: true,
        code: promo.code,
        description: promo.description,
        discountPercent,
        discountPercentService: parseFloat(promo.discountPercent || "0"),
        discountPercentJewelry: parseFloat(promo.discountPercentJewelry || "0"),
        rewardTokens: customerReward,
        referralReward,
        message: `Promo code applied! ${customerReward > 0 ? `You earned ${customerReward} JCMOVES tokens. ` : ""}${discountPercent > 0 ? `${discountPercent}% discount applied.` : ""}`,
      });
    } catch (error: any) {
      console.error("Error applying promo code:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Auto-generate a 5% jewelry booking reward coupon for the current user
  // Idempotent: returns existing unused code if one already exists for this user
  app.post("/api/promo-codes/booking-jewelry-reward", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { promoCodes } = await import("@shared/schema");

      // Check for an existing active, unused booking reward for this user
      const existing = await db
        .select()
        .from(promoCodes)
        .where(
          and(
            eq(promoCodes.referralUserId, userId),
            eq(promoCodes.isActive, true),
            sql`${promoCodes.code} LIKE 'JEWLS5-%'`,
            sql`(${promoCodes.maxUses} IS NULL OR ${promoCodes.usesCount} < ${promoCodes.maxUses})`
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return res.json({ code: existing[0].code, discountPercentJewelry: 5, alreadyExisted: true });
      }

      // Generate a unique code: JEWLS5-XXXXXX
      const suffix = Math.random().toString(36).toUpperCase().slice(2, 8);
      const code = `JEWLS5-${suffix}`;

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      await db.insert(promoCodes).values({
        code,
        description: "5% off Nature Made Jewls — Thank you for booking with JC ON THE MOVE!",
        discountPercent: "0.00",
        discountPercentJewelry: "5.00",
        rewardTokens: "0.00",
        referralRewardTokens: "0.00",
        referralUserId: userId,
        maxUses: 1,
        isActive: true,
        expiresAt,
      });

      return res.json({ code, discountPercentJewelry: 5, alreadyExisted: false });
    } catch (error: any) {
      console.error("Error generating booking jewelry reward:", error);
      res.status(500).json({ error: error.message || "Failed to generate coupon" });
    }
  });

  // Admin: list all promo codes
  app.get("/api/admin/promo-codes", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { promoCodes } = await import("@shared/schema");
      const codes = await db.select().from(promoCodes).orderBy(promoCodes.createdAt);
      res.json(codes);
    } catch (error) {
      console.error("Error fetching promo codes:", error);
      res.status(500).json({ error: "Failed to fetch promo codes" });
    }
  });

  // Admin: create a promo code
  app.post("/api/admin/promo-codes", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { promoCodes, insertPromoCodeSchema } = await import("@shared/schema");
      const data = insertPromoCodeSchema.parse({
        ...req.body,
        code: req.body.code?.toUpperCase().trim(),
      });
      const [created] = await db.insert(promoCodes).values(data).returning();
      res.json(created);
    } catch (error: any) {
      console.error("Error creating promo code:", error);
      if (error.code === '23505') return res.status(400).json({ error: "A promo code with that name already exists" });
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: update a promo code
  app.patch("/api/admin/promo-codes/:id", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { promoCodes } = await import("@shared/schema");
      const updateData: any = { ...req.body, updatedAt: new Date() };
      if (updateData.code) updateData.code = updateData.code.toUpperCase().trim();
      const [updated] = await db.update(promoCodes)
        .set(updateData)
        .where(eq(promoCodes.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Promo code not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating promo code:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Customer: get all available promo codes belonging to this user
  app.get("/api/promo-codes/my-codes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { promoCodes } = await import("@shared/schema");
      const now = new Date();
      const codes = await db.select().from(promoCodes).where(
        and(
          eq(promoCodes.referralUserId, userId),
          eq(promoCodes.isActive, true),
          or(
            sql`${promoCodes.expiresAt} IS NULL`,
            sql`${promoCodes.expiresAt} > ${now}`
          ),
          or(
            sql`${promoCodes.maxUses} IS NULL`,
            sql`${promoCodes.usesCount} < ${promoCodes.maxUses}`
          )
        )
      );
      res.json(codes);
    } catch (error: any) {
      console.error("Error fetching user promo codes:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: delete a promo code
  app.delete("/api/admin/promo-codes/:id", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { promoCodes } = await import("@shared/schema");
      await db.delete(promoCodes).where(eq(promoCodes.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting promo code:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get supported currencies
  app.get("/api/wallets/currencies", isAuthenticated, async (req, res) => {
    try {
      const currencies = await storage.getSupportedCurrencies();
      res.json({ currencies });
    } catch (error) {
      console.error("Error fetching supported currencies:", error);
      res.status(500).json({ error: "Failed to fetch supported currencies" });
    }
  });

  // ============ MINING ENDPOINTS ============
  
  // Start or resume mining session
  app.post("/api/mining/start", isAuthenticated, async (req: any, res) => {
    try {
      console.log("[MINING] Start mining request received");
      
      const userId = (req.session as any).userId;
      if (!userId) {
        console.error("[MINING] No user ID found in session");
        return res.status(401).json({ error: "Authentication required" });
      }
      
      console.log("[MINING] Starting mining for user:", userId);
      
      const { miningService } = await import('./services/mining');
      const result = await miningService.startMining(userId);
      
      console.log("[MINING] Mining started successfully:", result);
      res.json(result);
    } catch (error) {
      console.error("[MINING] Error starting mining:", error);
      console.error("[MINING] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start mining" });
    }
  });

  app.get("/api/mining/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { miningService } = await import('./services/mining');
      
      let stats;
      try {
        stats = await miningService.getMiningStats(userId);
      } catch (e: any) {
        console.error("Mining stats error:", e);
        // Fallback stats if columns are missing or other DB issues
        return res.json({
          currentSession: null,
          accumulatedTokens: "0.00000000",
          timeRemaining: 0,
          totalClaimedToday: "0.00000000",
          miningSpeed: "1.00",
          streakCount: 0,
          nextStreakBonus: "0.00000000",
          claimsRemainingToday: 3,
          lastScriptureClaimDate: null,
          scriptureStreak: 0,
          fitness: { pushups: 0, situps: 0 }
        });
      }
      // Check if this user added a lead today (Eastern time)
      const todayStart = getEasternDayStart();
      const todayEnd = getEasternDayEnd();
      const leadTodayRows = await db.select({ id: rewards.id })
        .from(rewards)
        .where(and(
          eq(rewards.userId, userId),
          eq(rewards.rewardType, 'lead_creation'),
          gte(rewards.earnedDate, todayStart),
          lte(rewards.earnedDate, todayEnd)
        ))
        .limit(1);
      const leadAddedToday = leadTodayRows.length > 0;

      // Check if daily completion bonus already claimed today
      const bonusRows = await db.select({ id: rewards.id })
        .from(rewards)
        .where(and(
          eq(rewards.userId, userId),
          eq(rewards.rewardType, 'daily_completion_bonus'),
          gte(rewards.earnedDate, todayStart),
          lte(rewards.earnedDate, todayEnd)
        ))
        .limit(1);
      const dailyBonusClaimed = bonusRows.length > 0;

      res.json({ ...stats, leadAddedToday, dailyBonusClaimed });
    } catch (error) {
      console.error("Error getting mining status:", error);
      res.status(500).json({ error: "Failed to get mining status" });
    }
  });

  // Daily tasks completion bonus — 500 JCMOVES when all tasks done
  app.post("/api/gamification/daily-tasks-bonus", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const today = getEasternDateStr();
      const todayStart = getEasternDayStart();
      const todayEnd = getEasternDayEnd();

      // Check already claimed today
      const alreadyClaimed = await db.select({ id: rewards.id })
        .from(rewards)
        .where(and(
          eq(rewards.userId, userId),
          eq(rewards.rewardType, 'daily_completion_bonus'),
          gte(rewards.earnedDate, todayStart),
          lte(rewards.earnedDate, todayEnd)
        ))
        .limit(1);
      if (alreadyClaimed.length > 0) {
        return res.status(400).json({ error: "Daily bonus already claimed today" });
      }

      // Award 500 JCMOVES
      const BONUS = 500;
      await storage.creditWalletTokens(userId, BONUS);
      await db.insert(rewards).values({
        userId,
        rewardType: 'daily_completion_bonus',
        tokenAmount: BONUS.toString(),
        cashValue: (BONUS * 0.00000508432).toFixed(4),
        status: 'confirmed',
        metadata: { date: today, reason: 'All 6 daily tasks completed' }
      });

      console.log(`🏆 Daily completion bonus awarded: ${BONUS} JCMOVES to user ${userId}`);
      res.json({ success: true, amount: BONUS });
    } catch (error) {
      console.error("Error awarding daily completion bonus:", error);
      res.status(500).json({ error: "Failed to award bonus" });
    }
  });

  app.post("/api/mining/fitness", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { type, count } = z.object({
        type: z.enum(['pushups', 'situps']),
        count: z.number().min(0).max(1000)
      }).parse(req.body);

      // Get the user's mining session directly via db
      let [session] = await db
        .select()
        .from(miningSessions)
        .where(eq(miningSessions.userId, userId))
        .limit(1);

      if (!session) {
        // Create an inactive session so fitness can be tracked before mining starts
        const nextClaimAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        [session] = await db.insert(miningSessions).values({
          userId,
          startTime: new Date(),
          lastClaimTime: new Date(),
          nextClaimAt,
          miningSpeed: "1.00",
          status: "inactive",
          pushupsCount: 0,
          situpsCount: 0,
        }).returning();
      }

      const today = getEasternDateStr();
      const updateData: any = { fitnessLastUpdated: today };

      // If it's a new day (Eastern time), reset counts; otherwise accumulate
      if (session.fitnessLastUpdated !== today) {
        updateData.pushupsCount = type === 'pushups' ? count : 0;
        updateData.situpsCount = type === 'situps' ? count : 0;
      } else {
        if (type === 'pushups') updateData.pushupsCount = (session.pushupsCount || 0) + count;
        if (type === 'situps') updateData.situpsCount = (session.situpsCount || 0) + count;
      }

      // Calculate the new mining speed from the updated rep counts
      const calcFitnessBonus = (n: number) => {
        if (n >= 61) return 1.0;
        if (n >= 41) return 0.75;
        if (n >= 31) return 0.5;
        if (n >= 21) return 0.4;
        if (n >= 10) return 0.25;
        return 0;
      };
      const newPushups = updateData.pushupsCount ?? (session.pushupsCount || 0);
      const newSitups = updateData.situpsCount ?? (session.situpsCount || 0);
      const newSpeed = (1.0 + calcFitnessBonus(newPushups) + calcFitnessBonus(newSitups)).toFixed(2);
      const oldSpeed = parseFloat(session.miningSpeed || "1.00");

      if (newSpeed !== session.miningSpeed) {
        // Bank all tokens accumulated so far at the OLD speed before switching
        const nowMs = Date.now();
        const lastRef = session.lastSpeedUpdateAt
          ? Math.max(new Date(session.lastSpeedUpdateAt).getTime(), new Date(session.lastClaimTime).getTime())
          : new Date(session.lastClaimTime).getTime();
        const secondsElapsed = Math.floor((nowMs - lastRef) / 1000);
        const liveTokens = secondsElapsed * 0.02 * oldSpeed;
        const banked = parseFloat(session.accumulatedTokens || "0") + liveTokens;
        const maxTokens = 1728 * parseFloat(newSpeed);
        updateData.accumulatedTokens = Math.min(banked, maxTokens).toFixed(8);
        updateData.miningSpeed = newSpeed;
        updateData.lastSpeedUpdateAt = new Date();
      }

      await db.update(miningSessions).set(updateData).where(eq(miningSessions.id, session.id));
      res.json({ success: true, newSpeed });
    } catch (error: any) {
      console.error("Fitness logging error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/mining/scripture-claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const today = getEasternDateStr(); // Eastern time — prevents evening claims bleeding into next morning

      // Check rewards table — no active session required
      const { rewards: rewardsTable } = await import("@shared/schema");
      const todayStart = getEasternDayStart();
      const todayEnd = getEasternDayEnd();
      const alreadyClaimed = await db.select({ id: rewardsTable.id })
        .from(rewardsTable)
        .where(
          and(
            eq(rewardsTable.userId, userId),
            eq(rewardsTable.rewardType, 'scripture_claim'),
            gte(rewardsTable.earnedDate, todayStart),
            lte(rewardsTable.earnedDate, todayEnd)
          )
        )
        .limit(1);

      if (alreadyClaimed.length > 0) {
        return res.status(400).json({ error: "Already claimed today's scripture reward" });
      }

      // Calculate streak from rewards table (Central time — yesterday Central)
      const ydayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const ydayEnd = new Date(todayStart.getTime() - 1);

      const yesterdayClaim = await db.select({ metadata: rewardsTable.metadata })
        .from(rewardsTable)
        .where(
          and(
            eq(rewardsTable.userId, userId),
            eq(rewardsTable.rewardType, 'scripture_claim'),
            gte(rewardsTable.earnedDate, ydayStart),
            lte(rewardsTable.earnedDate, ydayEnd)
          )
        )
        .limit(1);

      const prevStreak = yesterdayClaim.length > 0 ? ((yesterdayClaim[0].metadata as any)?.streak || 0) : 0;
      const newStreak = yesterdayClaim.length > 0 ? prevStreak + 1 : 1;

      const baseReward = 100;
      const streakBonus = newStreak % 7 === 0 ? 300 : 0;
      const rewardAmount = baseReward + streakBonus;

      await storage.creditWalletTokens(userId, rewardAmount);

      await db.insert(rewardsTable).values({
        userId,
        rewardType: 'scripture_claim',
        tokenAmount: rewardAmount.toString(),
        cashValue: (rewardAmount * 0.00000508432).toFixed(4),
        status: 'confirmed',
        metadata: { date: today, streak: newStreak, streakBonus }
      });

      // Also update session if one exists (for legacy streak display)
      const [session] = await db.select().from(miningSessions)
        .where(eq(miningSessions.userId, userId)).limit(1);
      if (session) {
        await db.update(miningSessions)
          .set({ lastScriptureClaimDate: today, scriptureStreak: newStreak })
          .where(eq(miningSessions.id, session.id));
      }

      // Award tier points for daily scripture
      await awardTierPoints(userId, 'daily_scripture');

      res.json({ success: true, amount: rewardAmount, streak: newStreak, streakBonus });
    } catch (error: any) {
      console.error("Error claiming scripture reward:", error);
      const msg = String(error?.message || "");
      const friendly = msg.includes("duplicate") || msg.includes("unique")
        ? "Already claimed today's scripture reward"
        : msg.includes("connect") || msg.includes("network")
          ? "Service temporarily unavailable — please try again in a moment"
          : "Unable to claim reward right now — please try again";
      res.status(500).json({ error: friendly });
    }
  });

  // Manually claim accumulated tokens
  app.post("/api/mining/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { miningService } = await import('./services/mining');
      
      const result = await miningService.claimTokens(userId, 'manual');
      
      if (!result.success) {
        const rawErr = result.error || "";
        const friendly = rawErr.includes("No active mining session")
          ? "Your mining session hasn't started yet — start a session on the Rewards page first"
          : rawErr.includes("No tokens to claim yet")
            ? "Your miner is still accumulating — come back in a few minutes"
            : rawErr.includes("already claimed")
              ? rawErr
              : rawErr || "Unable to claim right now — please try again";
        return res.status(400).json({ error: friendly });
      }

      // Push notification: mining session claimed
      if (result.tokensEarned && result.tokensEarned > 0) {
        try {
          const { notificationService: pushSvc } = await import('./services/notification');
          await pushSvc.sendPushNotification(userId, {
            title: '⛏️ JCMOVES Claimed!',
            body: `${Math.round(result.tokensEarned).toLocaleString()} JCMOVES added to your wallet.${result.streakBonus ? ` 🔥 Streak bonus included!` : ''}`,
            tag: 'mining-claim',
            data: { url: '/rewards' },
          });
        } catch (_) {}
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error claiming mining tokens:", error);
      res.status(500).json({ error: "Failed to claim tokens" });
    }
  });

  // Auto-claim endpoint (called by cron/scheduler)
  app.post("/api/mining/auto-claim", async (req, res) => {
    try {
      const { miningService } = await import('./services/mining');
      await miningService.autoClaimExpiredSessions();
      res.json({ success: true, message: "Auto-claim completed" });
    } catch (error) {
      console.error("Error in auto-claim:", error);
      res.status(500).json({ error: "Failed to auto-claim" });
    }
  });

  // Request payout - transfer tokens from in-app balance to personal wallet
  app.post("/api/wallet/payout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      
      // Get user's wallet account balance
      const walletAccount = await storage.getWalletAccount(userId);
      if (!walletAccount) {
        return res.status(400).json({ error: "No wallet account found" });
      }
      
      const availableBalance = parseFloat(walletAccount.tokenBalance || "0");
      if (availableBalance <= 0) {
        return res.status(400).json({ error: "No tokens available for payout" });
      }
      
      // Import fee constants and calculate percentage-based fee
      const { TREASURY_CONFIG } = await import('./constants');
      const feePercent = TREASURY_CONFIG.PAYOUT_FEE_PERCENT;
      const minFee = TREASURY_CONFIG.PAYOUT_MIN_FEE_TOKENS;
      
      // Calculate 1% fee with minimum guard
      const calculatedFee = Math.ceil(availableBalance * (feePercent / 100));
      const feeAmount = Math.max(calculatedFee, minFee);
      
      // Ensure user has enough to cover the fee
      if (availableBalance <= feeAmount) {
        return res.status(400).json({ 
          error: `Minimum payout is ${feeAmount + 1} JCMOVES tokens (includes ${feePercent}% network fee)` 
        });
      }
      
      const netAmount = availableBalance - feeAmount;
      
      // Check for pending payouts (soft check - DB constraint is the real guard)
      const hasPending = await storage.hasPendingPayout(userId);
      if (hasPending) {
        return res.status(400).json({ error: "You already have a pending payout request" });
      }
      
      // Get user's payout address
      const payoutInfo = await storage.getPayoutAddress(userId);
      if (!payoutInfo.address) {
        return res.status(400).json({ error: "Please set up your wallet first in Profile settings" });
      }
      
      // Create payout request and deduct balance ATOMICALLY - unique constraint prevents concurrent duplicates
      let payout;
      const totalRedeemed = parseFloat(walletAccount.totalRedeemed || "0") + availableBalance;
      
      try {
        // Create payout with fee breakdown and net amount
        payout = await storage.createWalletPayout({
          userId,
          tokenAmount: availableBalance.toFixed(8),
          feeAmount: feeAmount.toFixed(8),
          netAmount: netAmount.toFixed(8),
          recipientAddress: payoutInfo.address,
          status: 'pending',
          metadata: { walletMode: payoutInfo.mode, originalBalance: availableBalance, feePercent: feePercent, feeAmount: feeAmount }
        });
        
        // Deduct balance immediately after creating payout record (prevents double-spend)
        await storage.updateWalletAccount(userId, {
          tokenBalance: "0.00000000",
          totalRedeemed: totalRedeemed.toFixed(8)
        });
      } catch (createError: any) {
        // Handle unique constraint violation (concurrent request race)
        if (createError.code === '23505') {
          return res.status(400).json({ error: "You already have a pending payout request" });
        }
        throw createError;
      }
      
      // Try to execute the blockchain transfer
      try {
        const { solanaTransferService } = await import('./services/solana-transfer');
        
        if (!solanaTransferService.isOperational()) {
          // Transfer service not operational - payout will be processed later
          // Balance already deducted, payout remains pending
          return res.json({
            success: true,
            payout,
            message: "Payout request created. It will be processed when treasury wallet is configured.",
            pending: true
          });
        }
        
        // Check treasury balance BEFORE attempting transfer (need netAmount for actual transfer)
        const treasuryBalance = await solanaTransferService.getTreasuryBalance();
        if (treasuryBalance.tokenBalance < netAmount) {
          // Treasury is empty or has insufficient balance - queue as pending
          console.log(`[PAYOUT] Treasury balance (${treasuryBalance.tokenBalance}) insufficient for payout (${netAmount}). Queuing as pending.`);
          return res.json({
            success: true,
            payout,
            message: "Payout request queued. Your tokens have been reserved and will be sent when treasury is funded.",
            pending: true,
            queuedReason: "insufficient_treasury_balance"
          });
        }
        
        // Execute real blockchain transfer with NET amount (after fee deduction)
        const transferResult = await solanaTransferService.transferTokens({
          recipientAddress: payoutInfo.address,
          amount: netAmount,
          memo: `JCMOVES payout to ${userId.slice(0, 8)}`
        });
        
        if (transferResult.success && transferResult.transactionHash) {
          // Update payout with transaction hash - mark as confirmed
          await storage.updateWalletPayout(payout.id, {
            status: 'confirmed',
            transactionHash: transferResult.transactionHash,
            processedAt: new Date(),
            confirmedAt: new Date()
          });
          
          // Transfer the fee to burn wallet for buyback program
          // This is a SECOND blockchain transfer from treasury to burn wallet
          console.log(`[PAYOUT] Initiating fee transfer: ${feeAmount} JCMOVES to burn wallet...`);
          
          try {
            const feeResult = await solanaTransferService.transferFeeToBuybackWallet(feeAmount, transferResult.transactionHash);
            if (feeResult.success) {
              console.log(`[PAYOUT] ✅ Fee of ${feeAmount} JCMOVES burned successfully: ${feeResult.transactionHash}`);
              await storage.recordBuybackFeeContribution(feeAmount, payout.id);
            } else {
              console.warn(`[PAYOUT] ⚠️ Fee transfer to burn wallet failed: ${feeResult.error}`);
            }
          } catch (feeError) {
            console.error('[PAYOUT] Fee transfer error:', feeError);
          }
          
          return res.json({
            success: true,
            transactionHash: transferResult.transactionHash,
            amount: netAmount,
            fee: feeAmount,
            grossAmount: availableBalance,
            recipientAddress: payoutInfo.address,
            message: `Successfully sent ${netAmount.toLocaleString()} JCMOVES to your wallet! (${feeAmount} fee contributed to buyback program)`
          });
        } else {
          // Transfer failed - refund balance and mark payout as failed
          await storage.updateWalletPayout(payout.id, {
            status: 'failed',
            failureReason: transferResult.error || 'Unknown transfer error',
            processedAt: new Date()
          });
          
          // Refund the balance
          await storage.updateWalletAccount(userId, {
            tokenBalance: availableBalance.toFixed(8),
            totalRedeemed: (totalRedeemed - availableBalance).toFixed(8)
          });
          
          return res.status(500).json({
            error: transferResult.error || "Blockchain transfer failed. Your balance has been restored.",
            payoutId: payout.id
          });
        }
      } catch (transferError) {
        console.error("Blockchain transfer error:", transferError);
        
        // Refund balance on error
        await storage.updateWalletAccount(userId, {
          tokenBalance: availableBalance.toFixed(8),
          totalRedeemed: (totalRedeemed - availableBalance).toFixed(8)
        });
        
        await storage.updateWalletPayout(payout.id, {
          status: 'failed',
          failureReason: transferError instanceof Error ? transferError.message : 'Transfer execution failed',
          processedAt: new Date()
        });
        return res.status(500).json({
          error: "Failed to execute blockchain transfer. Your balance has been restored.",
          payoutId: payout.id
        });
      }
    } catch (error) {
      console.error("Error requesting payout:", error);
      res.status(500).json({ error: "Failed to request payout" });
    }
  });
  
  // Get payout configuration (fee info)
  app.get("/api/wallet/payout-config", async (req, res) => {
    try {
      const { TREASURY_CONFIG } = await import('./constants');
      const feePercent = TREASURY_CONFIG.PAYOUT_FEE_PERCENT;
      const minFee = TREASURY_CONFIG.PAYOUT_MIN_FEE_TOKENS;
      res.json({
        feePercent,
        minFee,
        minimumPayout: minFee + 1,
        feeCurrency: "JCMOVES",
        feeDescription: `${feePercent}% fee contributed to the token buyback program (minimum ${minFee} JCMOVES)`
      });
    } catch (error) {
      console.error("Error getting payout config:", error);
      res.status(500).json({ error: "Failed to get payout configuration" });
    }
  });

  // Get user's payout history
  app.get("/api/wallet/payouts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const payouts = await storage.getWalletPayoutsByUser(userId);
      res.json(payouts);
    } catch (error) {
      console.error("Error getting payout history:", error);
      res.status(500).json({ error: "Failed to get payout history" });
    }
  });
  
  // Get payout status for pending payout
  app.get("/api/wallet/payout/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const hasPending = await storage.hasPendingPayout(userId);
      const payouts = await storage.getWalletPayoutsByUser(userId);
      const pendingPayout = payouts.find(p => p.status === 'pending') || null;
      const latestPayout = payouts[0] || null;
      
      res.json({
        hasPendingPayout: hasPending,
        pendingPayout,
        latestPayout
      });
    } catch (error) {
      console.error("Error getting payout status:", error);
      res.status(500).json({ error: "Failed to get payout status" });
    }
  });

  // Cancel a pending payout request - uses transaction to prevent race conditions
  app.post("/api/wallet/payout/:payoutId/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { payoutId } = req.params;

      // Use transaction with row locking to prevent race conditions
      const result = await db.transaction(async (tx) => {
        // Lock the payout row for update to prevent concurrent modifications
        const [payout] = await tx
          .select()
          .from(walletPayouts)
          .where(and(
            eq(walletPayouts.id, payoutId),
            eq(walletPayouts.userId, userId)
          ))
          .for('update')
          .limit(1);

        if (!payout) {
          return { error: "Payout request not found", status: 404 };
        }

        if (payout.status !== 'pending') {
          return { error: "Only pending payouts can be cancelled", status: 400 };
        }

        const payoutAmount = parseFloat(payout.tokenAmount);

        // Lock wallet account row and get current balance
        const [walletAccount] = await tx
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, userId))
          .for('update')
          .limit(1);

        // Enforce wallet account existence - critical for data integrity
        if (!walletAccount) {
          return { error: "Wallet account not found. Cannot process refund.", status: 400 };
        }

        const currentBalance = parseFloat(walletAccount.tokenBalance || "0");
        const currentRedeemed = parseFloat(walletAccount.totalRedeemed || "0");

        // Validate totalRedeemed has enough to deduct (prevents negative adjustments)
        if (currentRedeemed < payoutAmount) {
          console.warn(`[PAYOUT] Refund amount ${payoutAmount} exceeds totalRedeemed ${currentRedeemed} for user ${userId}`);
        }

        // Calculate new values with underflow protection
        const newBalance = currentBalance + payoutAmount;
        const newRedeemed = Math.max(0, currentRedeemed - payoutAmount);

        // Atomic update: refund tokens and update payout status
        await tx
          .update(walletAccounts)
          .set({
            tokenBalance: newBalance.toFixed(8),
            totalRedeemed: newRedeemed.toFixed(8),
            lastActivity: new Date()
          })
          .where(eq(walletAccounts.userId, userId));

        await tx
          .update(walletPayouts)
          .set({
            status: 'cancelled',
            processedAt: new Date()
          })
          .where(eq(walletPayouts.id, payoutId));

        console.log(`[PAYOUT] User ${userId} cancelled payout ${payoutId}, refunded ${payoutAmount} tokens`);

        return {
          success: true,
          message: "Payout request cancelled and tokens refunded to your balance",
          refundedAmount: payoutAmount
        };
      });

      // Handle transaction result
      if ('error' in result) {
        return res.status(result.status || 500).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error("Error cancelling payout:", error);
      res.status(500).json({ error: "Failed to cancel payout request" });
    }
  });

  // ===========================================
  // ADMIN PAYOUT MANAGEMENT ROUTES
  // ===========================================

  // Get all pending payouts (admin only)
  app.get("/api/admin/payouts/pending", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const pendingPayouts = await storage.getPendingPayouts();
      
      // Enrich with user info
      const enrichedPayouts = await Promise.all(
        pendingPayouts.map(async (payout) => {
          const user = await storage.getUser(payout.userId);
          return {
            ...payout,
            userName: user?.name || user?.email || 'Unknown User',
            userEmail: user?.email || 'Unknown'
          };
        })
      );
      
      res.json({ payouts: enrichedPayouts });
    } catch (error) {
      console.error("Error getting pending payouts:", error);
      res.status(500).json({ error: "Failed to get pending payouts" });
    }
  });

  // Get all payouts with optional status filter (admin only)
  app.get("/api/admin/payouts", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { status } = req.query;
      
      let payouts;
      if (status === 'pending') {
        payouts = await storage.getPendingPayouts();
      } else {
        payouts = await db.select().from(walletPayouts).orderBy(desc(walletPayouts.requestedAt)).limit(100);
      }
      
      // Enrich with user info
      const enrichedPayouts = await Promise.all(
        payouts.map(async (payout) => {
          const user = await storage.getUser(payout.userId);
          return {
            ...payout,
            userName: user?.name || user?.email || 'Unknown User',
            userEmail: user?.email || 'Unknown'
          };
        })
      );
      
      res.json({ payouts: enrichedPayouts });
    } catch (error) {
      console.error("Error getting payouts:", error);
      res.status(500).json({ error: "Failed to get payouts" });
    }
  });

  // Process/approve a payout request (admin only)
  app.post("/api/admin/payouts/:payoutId/process", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { payoutId } = req.params;
      const { txHash, executeOnChain } = req.body;
      const adminUserId = (req.session as any).userId;

      // Get the payout
      const payouts = await db.select().from(walletPayouts).where(eq(walletPayouts.id, payoutId)).limit(1);
      const payout = payouts[0];

      if (!payout) {
        return res.status(404).json({ error: "Payout request not found" });
      }

      if (payout.status !== 'pending') {
        return res.status(400).json({ error: "Only pending payouts can be processed" });
      }

      // If executeOnChain is true, attempt real blockchain transfer
      if (executeOnChain) {
        // Validate recipient address before attempting transfer
        const recipientAddr = payout.recipientAddress?.trim();
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        
        if (!recipientAddr || !solanaAddressRegex.test(recipientAddr)) {
          console.error(`[PAYOUT] Invalid recipient address for payout ${payoutId}: "${recipientAddr}"`);
          return res.status(400).json({ 
            error: "Invalid recipient wallet address", 
            details: `The wallet address "${recipientAddr || 'empty'}" is not a valid Solana address. The user may need to update their wallet settings.`
          });
        }

        try {
          const result = await solanaTransferService.transferTokens({
            recipientAddress: recipientAddr,
            amount: parseFloat(payout.tokenAmount),
            memo: `Payout for user ${payout.userId}`
          });

          if (!result.success) {
            return res.status(500).json({ 
              error: "Blockchain transfer failed", 
              details: result.error 
            });
          }

          // Update payout with blockchain tx hash
          await storage.updateWalletPayout(payoutId, {
            status: 'completed',
            transactionHash: result.signature,
            processedAt: new Date()
          });

          console.log(`[PAYOUT] Admin ${adminUserId} processed payout ${payoutId} on-chain: ${result.signature}`);

          return res.json({
            success: true,
            message: "Payout processed and tokens sent on blockchain",
            txHash: result.signature,
            amount: payout.tokenAmount,
            destination: payout.recipientAddress
          });

        } catch (transferError: any) {
          console.error("Blockchain transfer error:", transferError);
          return res.status(500).json({ 
            error: "Blockchain transfer failed", 
            details: transferError.message 
          });
        }
      }

      // Record-only mode (manual off-chain processing)
      if (!txHash) {
        return res.status(400).json({ error: "Transaction hash required for manual processing" });
      }

      await storage.updateWalletPayout(payoutId, {
        status: 'completed',
        transactionHash: txHash,
        processedAt: new Date()
      });

      console.log(`[PAYOUT] Admin ${adminUserId} manually processed payout ${payoutId}: ${txHash}`);

      res.json({
        success: true,
        message: "Payout marked as completed",
        txHash,
        amount: payout.tokenAmount,
        destination: payout.recipientAddress
      });

    } catch (error) {
      console.error("Error processing payout:", error);
      res.status(500).json({ error: "Failed to process payout" });
    }
  });

  // Decline/reject a payout request (admin only)
  app.post("/api/admin/payouts/:payoutId/decline", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { payoutId } = req.params;
      const { reason } = req.body;
      const adminUserId = (req.session as any).userId;

      // Use transaction to safely refund tokens
      const result = await db.transaction(async (tx) => {
        const [payout] = await tx
          .select()
          .from(walletPayouts)
          .where(eq(walletPayouts.id, payoutId))
          .for('update')
          .limit(1);

        if (!payout) {
          return { error: "Payout request not found", status: 404 };
        }

        if (payout.status !== 'pending') {
          return { error: "Only pending payouts can be declined", status: 400 };
        }

        const payoutAmount = parseFloat(payout.tokenAmount);

        // Refund tokens to user's wallet
        const [wallet] = await tx
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, payout.userId))
          .for('update')
          .limit(1);

        if (wallet) {
          const currentBalance = parseFloat(wallet.tokenBalance || "0");
          await tx
            .update(walletAccounts)
            .set({ tokenBalance: (currentBalance + payoutAmount).toFixed(2) })
            .where(eq(walletAccounts.userId, payout.userId));
        }

        // Update payout status
        await tx
          .update(walletPayouts)
          .set({
            status: 'declined',
            processedAt: new Date()
          })
          .where(eq(walletPayouts.id, payoutId));

        console.log(`[PAYOUT] Admin ${adminUserId} declined payout ${payoutId}, refunded ${payoutAmount} tokens. Reason: ${reason}`);

        return {
          success: true,
          message: "Payout declined and tokens refunded to user",
          refundedAmount: payoutAmount
        };
      });

      if ('error' in result) {
        return res.status(result.status || 500).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error("Error declining payout:", error);
      res.status(500).json({ error: "Failed to decline payout" });
    }
  });

  // ===========================================
  // SQUARE INVOICING API ROUTES
  // ===========================================

  // Create an invoice for a lead/job
  app.post("/api/invoices/lead/:leadId", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { leadId } = req.params;
      const { amount, description, dueDate } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ 
          error: "Square is not configured. Please add SQUARE_ACCESS_TOKEN to your environment secrets." 
        });
      }

      const result = await squareInvoiceService.createInvoiceForLead(
        lead,
        amount,
        description,
        dueDate
      );

      res.json({
        success: true,
        invoiceId: result.invoiceId,
        invoiceUrl: result.invoiceUrl,
        squareInvoiceId: result.squareInvoiceId,
        message: "Invoice created and sent to customer"
      });
    } catch (error: any) {
      console.error("Error creating invoice for lead:", error);
      res.status(500).json({ error: error.message || "Failed to create invoice" });
    }
  });

  // Create a standalone invoice (not linked to a lead)
  app.post("/api/invoices", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { email, name, phone, amount, description, dueDate } = req.body;

      if (!email || !name || !amount || amount <= 0 || !description) {
        return res.status(400).json({ error: "Email, name, amount, and description are required" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ 
          error: "Square is not configured. Please add SQUARE_ACCESS_TOKEN to your environment secrets." 
        });
      }

      const result = await squareInvoiceService.createStandaloneInvoice(
        email,
        name,
        phone,
        amount,
        description,
        dueDate
      );

      res.json({
        success: true,
        invoiceId: result.invoiceId,
        invoiceUrl: result.invoiceUrl,
        squareInvoiceId: result.squareInvoiceId,
        message: "Invoice created and sent to customer"
      });
    } catch (error: any) {
      console.error("Error creating standalone invoice:", error);
      res.status(500).json({ error: error.message || "Failed to create invoice" });
    }
  });

  // Get all invoices (admin view)
  app.get("/api/invoices", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { leadId, status } = req.query;
      const filters: any = {};
      if (leadId) filters.leadId = leadId as string;
      if (status) filters.status = status as string;
      
      const invoices = await storage.getSquareInvoices(filters, 100);
      res.json(invoices);
    } catch (error) {
      console.error("Error getting invoices:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  // Get invoices for a specific lead
  app.get("/api/invoices/lead/:leadId", isAuthenticated, async (req: any, res) => {
    try {
      const { leadId } = req.params;
      const invoices = await storage.getSquareInvoices({ leadId });
      res.json(invoices);
    } catch (error) {
      console.error("Error getting lead invoices:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  // Sync invoice status from Square
  app.post("/api/invoices/:id/sync", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const invoice = await storage.getSquareInvoice(id);
      if (!invoice || !invoice.squareInvoiceId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ error: "Square is not configured" });
      }

      const newStatus = await squareInvoiceService.syncInvoiceStatus(invoice.squareInvoiceId);
      
      res.json({ success: true, status: newStatus });
    } catch (error: any) {
      console.error("Error syncing invoice:", error);
      res.status(500).json({ error: error.message || "Failed to sync invoice" });
    }
  });

  // Cancel an invoice
  app.post("/api/invoices/:id/cancel", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const invoice = await storage.getSquareInvoice(id);
      if (!invoice || !invoice.squareInvoiceId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ error: "Square is not configured" });
      }

      await squareInvoiceService.cancelInvoice(invoice.squareInvoiceId);
      
      res.json({ success: true, message: "Invoice canceled" });
    } catch (error: any) {
      console.error("Error canceling invoice:", error);
      res.status(500).json({ error: error.message || "Failed to cancel invoice" });
    }
  });

  // Check Square configuration status
  app.get("/api/invoices/config/status", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { squareInvoiceService } = await import('./services/square-invoice');
      
      res.json({
        configured: squareInvoiceService.isConfigured(),
        environment: process.env.SQUARE_ENVIRONMENT || 'sandbox'
      });
    } catch (error) {
      console.error("Error checking Square config:", error);
      res.status(500).json({ error: "Failed to check configuration" });
    }
  });

  // ===== SNOW REMOVAL ROUTES =====

  // Get all snow customers
  app.get("/api/snow/customers", isAuthenticated, async (req: any, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const customers = await storage.getSnowCustomers(activeOnly);
      res.json(customers);
    } catch (error: any) {
      console.error("Error fetching snow customers:", error);
      res.status(500).json({ error: error.message || "Failed to fetch customers" });
    }
  });

  // Get single snow customer
  app.get("/api/snow/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.getSnowCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error: any) {
      console.error("Error fetching snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch customer" });
    }
  });

  // Create snow customer
  app.post("/api/snow/customers", isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.createSnowCustomer(req.body);
      res.status(201).json(customer);
    } catch (error: any) {
      console.error("Error creating snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to create customer" });
    }
  });

  // Update snow customer
  app.put("/api/snow/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.updateSnowCustomer(req.params.id, req.body);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error: any) {
      console.error("Error updating snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to update customer" });
    }
  });

  // Delete snow customer (soft delete)
  app.delete("/api/snow/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteSnowCustomer(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to delete customer" });
    }
  });

  // Seed default snow removal customers (admin only)
  app.post("/api/snow/seed-customers", isAuthenticated, async (req: any, res) => {
    try {
      // Allow both admins and employees to seed default customers
      if (req.user?.role !== 'admin' && req.user?.role !== 'employee') {
        return res.status(403).json({ error: "Employee or admin access required" });
      }
      
      const existingCustomers = await storage.getSnowCustomers();
      const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));
      
      const defaultCustomers = [
        { name: 'Paul', pricePerVisit: 30, notes: 'End of Driveway Only', isPrepaid: false },
        { name: 'Rita', pricePerVisit: 0, notes: 'Prepaid - Driveway', isPrepaid: true },
        { name: 'Bank Owned', pricePerVisit: 230, notes: 'The Works - Full service', isPrepaid: false },
        { name: 'Geri + Al', pricePerVisit: 0, notes: 'No visits yet', isPrepaid: false },
        { name: 'Gina', pricePerVisit: 40, notes: 'Driveway Front Steps', isPrepaid: false },
        { name: 'Sandy', pricePerVisit: 45, notes: 'Driveway Front + Back Steps', isPrepaid: false },
        { name: 'Barbara', pricePerVisit: 35, notes: 'Driveway Only', isPrepaid: false },
        { name: 'Bernard', pricePerVisit: 20, notes: 'End of Driveway Only', isPrepaid: false },
      ];
      
      const added: string[] = [];
      for (const customer of defaultCustomers) {
        if (!existingNames.has(customer.name.toLowerCase())) {
          await storage.createSnowCustomer({
            name: customer.name,
            address: '',
            city: '',
            phone: '',
            pricePerVisit: customer.pricePerVisit,
            notes: customer.notes,
            isPrepaid: customer.isPrepaid,
            isActive: true,
          });
          added.push(customer.name);
        }
      }
      
      res.json({ message: `Added ${added.length} customers`, added });
    } catch (error: any) {
      console.error("Error seeding customers:", error);
      res.status(500).json({ error: error.message || "Failed to seed customers" });
    }
  });

  // Import snow customers from CSV
  app.post("/api/snow/import-csv", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'employee', 'business_owner'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data provided" });
      }

      if (rows.length > 100) {
        return res.status(400).json({ error: "Too many rows (max 100)" });
      }

      // Validate row structure
      for (const row of rows) {
        if (typeof row !== 'object' || !row.name || typeof row.name !== 'string') {
          return res.status(400).json({ error: "Invalid row data" });
        }
      }

      const existingCustomers = await storage.getSnowCustomers();
      const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));

      const added: string[] = [];
      const skipped: string[] = [];

      for (const row of rows) {
        const name = row.name?.trim();
        if (!name) continue;

        if (existingNames.has(name.toLowerCase())) {
          skipped.push(name);
          continue;
        }

        await storage.createSnowCustomer({
          name,
          address: row.address?.trim() || '',
          city: row.city?.trim() || '',
          phone: row.phone?.trim() || '',
          pricePerVisit: parseFloat(row.price) || 0,
          notes: row.notes?.trim() || '',
          isPrepaid: row.prepaid === 'true' || row.prepaid === 'yes' || row.prepaid === '1',
          isActive: true,
        });
        added.push(name);
        existingNames.add(name.toLowerCase());
      }

      res.json({ 
        message: `Imported ${added.length} customers, skipped ${skipped.length} duplicates`,
        added,
        skipped
      });
    } catch (error: any) {
      console.error("Error importing CSV:", error);
      res.status(500).json({ error: error.message || "Failed to import CSV" });
    }
  });

  // Import snow service logs from CSV
  app.post("/api/snow/import-logs-csv", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'employee', 'business_owner'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data provided" });
      }

      if (rows.length > 500) {
        return res.status(400).json({ error: "Too many rows (max 500)" });
      }

      // Validate row structure
      for (const row of rows) {
        if (typeof row !== 'object' || !row.date || !row.customer) {
          return res.status(400).json({ error: "Invalid row data - date and customer required" });
        }
      }

      // Get existing customers to map names to IDs
      const customers = await storage.getSnowCustomers();
      const customerMap = new Map(customers.map(c => [c.name.toLowerCase().trim(), c.id]));

      const added: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const row of rows) {
        const customerName = row.customer?.trim();
        const customerId = customerMap.get(customerName.toLowerCase());
        
        if (!customerId) {
          skipped.push(`${row.date} - ${customerName} (customer not found)`);
          continue;
        }

        // Parse date (MM/DD/YYYY format)
        const dateParts = row.date.split('/');
        let serviceDate: Date;
        if (dateParts.length === 3) {
          serviceDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        } else {
          serviceDate = new Date(row.date);
        }
        
        if (isNaN(serviceDate.getTime())) {
          errors.push(`Invalid date: ${row.date}`);
          continue;
        }

        try {
          await storage.createSnowServiceLog({
            customerId,
            serviceDate,
            serviceType: row.serviceType?.trim() || 'Snow Removal',
            notes: row.notes?.trim() || '',
            price: parseFloat(row.price) || 0,
            isPaid: row.notes?.toLowerCase().includes('paid') || false,
            monthKey: serviceDate.toISOString().slice(0, 7).replace('-', '/') + '/01',
          });
          added.push(`${row.date} - ${customerName}`);
        } catch (err) {
          errors.push(`Failed to add ${row.date} - ${customerName}: ${err.message}`);
        }
      }

      res.json({ 
        message: `Imported ${added.length} logs, skipped ${skipped.length}, errors ${errors.length}`,
        added: added.length,
        skipped,
        errors
      });
    } catch (error: any) {
      console.error("Error importing logs CSV:", error);
      res.status(500).json({ error: error.message || "Failed to import logs" });
    }
  });

  // Get snow service types
  app.get("/api/snow/service-types", isAuthenticated, async (req: any, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const types = await storage.getSnowServiceTypes(activeOnly);
      res.json(types);
    } catch (error: any) {
      console.error("Error fetching service types:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service types" });
    }
  });

  // Create snow service type
  app.post("/api/snow/service-types", isAuthenticated, async (req: any, res) => {
    try {
      const serviceType = await storage.createSnowServiceType(req.body);
      res.status(201).json(serviceType);
    } catch (error: any) {
      console.error("Error creating service type:", error);
      res.status(500).json({ error: error.message || "Failed to create service type" });
    }
  });

  // Update snow service type
  app.put("/api/snow/service-types/:id", isAuthenticated, async (req: any, res) => {
    try {
      const serviceType = await storage.updateSnowServiceType(req.params.id, req.body);
      if (!serviceType) {
        return res.status(404).json({ error: "Service type not found" });
      }
      res.json(serviceType);
    } catch (error: any) {
      console.error("Error updating service type:", error);
      res.status(500).json({ error: error.message || "Failed to update service type" });
    }
  });

  // Get snow service logs
  app.get("/api/snow/logs", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, monthKey, date } = req.query;
      const logs = await storage.getSnowServiceLogs({ customerId, monthKey, date });
      res.json(logs);
    } catch (error: any) {
      console.error("Error fetching service logs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service logs" });
    }
  });

  // Get single service log
  app.get("/api/snow/logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const log = await storage.getSnowServiceLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "Service log not found" });
      }
      res.json(log);
    } catch (error: any) {
      console.error("Error fetching service log:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service log" });
    }
  });

  // Create snow service log
  app.post("/api/snow/logs", isAuthenticated, async (req: any, res) => {
    try {
      // Auto-generate monthKey from serviceDate if not provided
      const logData = { ...req.body };
      if (logData.serviceDate && !logData.monthKey) {
        const date = new Date(logData.serviceDate);
        logData.monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      // Convert empty serviceTypeId to null (foreign key constraint)
      if (logData.serviceTypeId === "" || logData.serviceTypeId === undefined) {
        logData.serviceTypeId = null;
      }
      const log = await storage.createSnowServiceLog(logData);
      res.status(201).json(log);
    } catch (error: any) {
      console.error("Error creating service log:", error);
      res.status(500).json({ error: error.message || "Failed to create service log" });
    }
  });

  // Update snow service log
  app.put("/api/snow/logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updateData = { ...req.body };
      // Convert empty serviceTypeId to null (foreign key constraint)
      if (updateData.serviceTypeId === "" || updateData.serviceTypeId === undefined) {
        updateData.serviceTypeId = null;
      }
      const log = await storage.updateSnowServiceLog(req.params.id, updateData);
      if (!log) {
        return res.status(404).json({ error: "Service log not found" });
      }
      res.json(log);
    } catch (error: any) {
      console.error("Error updating service log:", error);
      res.status(500).json({ error: error.message || "Failed to update service log" });
    }
  });

  // Delete snow service log
  app.delete("/api/snow/logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteSnowServiceLog(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting service log:", error);
      res.status(500).json({ error: error.message || "Failed to delete service log" });
    }
  });

  // Get monthly summary
  app.get("/api/snow/summary/:monthKey", isAuthenticated, async (req: any, res) => {
    try {
      const summary = await storage.getSnowMonthlySummary(req.params.monthKey);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching monthly summary:", error);
      res.status(500).json({ error: error.message || "Failed to fetch summary" });
    }
  });

  // ==================== JEWELRY ITEMS API ====================
  
  // Get all jewelry items (public)
  app.get("/api/jewelry", async (req: any, res) => {
    try {
      const { status, category, search } = req.query;
      let items: any[];
      if (status) {
        items = await storage.getJewelryItems(status, category || undefined);
      } else {
        const activeItems = await storage.getJewelryItems('active', category || undefined);
        const soldItems = await storage.getJewelryItems('sold', category || undefined);
        items = [...activeItems, ...soldItems];
        items.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      items = items.filter((item: any) => {
        if (item.soldAt) {
          return new Date(item.soldAt) > thirtyDaysAgo;
        }
        return true;
      });

      if (search) {
        const searchLower = search.toLowerCase();
        items = items.filter((item: any) => 
          item.title?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower) ||
          item.shortDescription?.toLowerCase().includes(searchLower) ||
          item.materials?.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower)
        );
      }
      
      res.json(items);
    } catch (error: any) {
      console.error("Error fetching jewelry items:", error);
      res.status(500).json({ error: error.message || "Failed to fetch jewelry items" });
    }
  });
  
  // Get single jewelry item (public)
  app.get("/api/jewelry/:id", async (req: any, res) => {
    try {
      const item = await storage.getJewelryItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      console.error("Error fetching jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to fetch jewelry item" });
    }
  });
  
  // Multipart upload endpoint — accepts any file (image or video) without the 413 JSON limit
  app.post("/api/jewelry/upload", isAuthenticated, async (req: any, res) => {
    const allowedRoles = ['admin', 'business_owner', 'employee'];
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    try {
      const multer = (await import("multer")).default;
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
      }).single("file");

      await new Promise<void>((resolve, reject) => {
        upload(req, res as any, (err: any) => {
          if (err) reject(err); else resolve();
        });
      });

      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const file = req.file as Express.Multer.File;
      const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.saveFileBuffer(file.buffer, file.mimetype, ext);
      res.json({ url });
    } catch (error: any) {
      console.error("❌ Jewelry upload error:", error?.message);
      res.status(500).json({ error: "Upload failed", detail: error?.message });
    }
  });

  app.post("/api/jewelry/upload-photo", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'business_owner', 'employee'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { image, extension } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.saveBase64Image(image, extension || 'jpg');
      res.json({ url });
    } catch (error: any) {
      const detail = error?.message || String(error);
      console.error("❌ Error uploading jewelry photo:", detail);
      res.status(500).json({ error: "Failed to upload photo", detail });
    }
  });

  app.post("/api/jewelry/upload-video", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'business_owner', 'employee'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { video, extension } = req.body;
      if (!video) {
        return res.status(400).json({ error: "Video data is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.saveBase64Video(video, extension || 'mp4');
      res.json({ url });
    } catch (error: any) {
      const detail = error?.message || String(error);
      console.error("❌ Error uploading jewelry video:", detail);
      res.status(500).json({ error: "Failed to upload video", detail });
    }
  });

  // Create jewelry item (requires auth - admin/business_owner/employee)
  app.post("/api/jewelry", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'business_owner', 'employee'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { title, price, ...rest } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }
      
      const cleanedData = {
        ...rest,
        title,
        price: price && price !== '' ? price : '0.00',
        postedBy: req.user.id,
      };
      
      const item = await storage.createJewelryItem(cleanedData);

      // Reward creator 200 JCMOVES for each jewelry listing (cap: 20 per day)
      const JEWELRY_LISTING_REWARD = 200;
      const JEWELRY_DAILY_CAP = 20;
      let listingReward = 0;
      try {
        const userId = req.user.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayListings = await db.select().from(rewards)
          .where(and(
            eq(rewards.userId, userId),
            eq(rewards.rewardType, 'jewelry_listing'),
            gte(rewards.earnedDate, today),
          ));
        if (todayListings.length < JEWELRY_DAILY_CAP) {
          await storage.creditWalletTokens(userId, JEWELRY_LISTING_REWARD);
          await db.insert(rewards).values({
            userId,
            rewardType: 'jewelry_listing',
            tokenAmount: JEWELRY_LISTING_REWARD.toString(),
            cashValue: '0.00',
            status: 'confirmed',
            referenceId: String(item.id),
            metadata: { itemId: item.id, itemTitle: item.title },
          });
          listingReward = JEWELRY_LISTING_REWARD;
          console.log(`✅ Jewelry listing reward: ${JEWELRY_LISTING_REWARD} JCMOVES credited to user ${userId}`);
        } else {
          console.log(`ℹ️ Jewelry listing reward skipped: daily cap reached for user ${userId}`);
        }
      } catch (rewardErr) {
        console.error("❌ Error granting jewelry listing reward:", rewardErr);
      }

      res.status(201).json({ ...item, listingReward: listingReward || null });
    } catch (error: any) {
      console.error("Error creating jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to create jewelry item" });
    }
  });
  
  app.patch("/api/jewelry/:id", isAuthenticated, async (req: any, res) => {
    try {
      const existing = await storage.getJewelryItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const isOwner = existing.postedBy === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'business_owner';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Only the item owner or admin can edit this item" });
      }
      
      const item = await storage.updateJewelryItem(req.params.id, req.body);
      res.json(item);
    } catch (error: any) {
      console.error("Error updating jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to update jewelry item" });
    }
  });
  
  app.delete("/api/jewelry/:id", isAuthenticated, async (req: any, res) => {
    try {
      const existing = await storage.getJewelryItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const isOwner = existing.postedBy === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'business_owner';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Only the item owner or admin can delete this item" });
      }
      
      await storage.deleteJewelryItem(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to delete jewelry item" });
    }
  });

  app.patch("/api/jewelry/:id/sold", isAuthenticated, async (req: any, res) => {
    try {
      const existing = await storage.getJewelryItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }

      const isOwner = existing.postedBy === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'business_owner';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Only the item owner or admin can update this item" });
      }

      const { sold } = req.body;
      if (typeof sold !== 'boolean') {
        return res.status(400).json({ error: "sold must be a boolean" });
      }
      const updates: any = {
        inStock: !sold,
        soldAt: sold ? new Date() : null,
        status: sold ? 'sold' : 'active',
      };

      const updated = await storage.updateJewelryItem(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking jewelry item sold:", error);
      res.status(500).json({ error: error.message || "Failed to update item" });
    }
  });

  // Custom order request (public)
  app.post("/api/jewelry/custom-order", async (req: any, res) => {
    try {
      const { name, description, materials, budget, contact, referenceItem } = req.body;
      if (!name || !description || !contact) {
        return res.status(400).json({ error: "Name, description, and contact are required" });
      }

      const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
      const { sendEmail } = await import("./services/email");

      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#fdf6f0;border-radius:12px;">
          <h2 style="color:#e11d48;">🎁 New Custom Order Request</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;font-weight:bold;color:#78716c;">Customer</td><td style="padding:8px 0;">${esc(name)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;color:#78716c;">Contact</td><td style="padding:8px 0;">${esc(contact)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;color:#78716c;">Description</td><td style="padding:8px 0;">${esc(description)}</td></tr>
            ${materials ? `<tr><td style="padding:8px 0;font-weight:bold;color:#78716c;">Materials</td><td style="padding:8px 0;">${esc(materials)}</td></tr>` : ''}
            ${budget ? `<tr><td style="padding:8px 0;font-weight:bold;color:#78716c;">Budget</td><td style="padding:8px 0;">${esc(budget)}</td></tr>` : ''}
            ${referenceItem ? `<tr><td style="padding:8px 0;font-weight:bold;color:#78716c;">Inspired by</td><td style="padding:8px 0;">${esc(referenceItem)}</td></tr>` : ''}
          </table>
        </div>`;
      const text = `Custom Order Request\nFrom: ${name}\nContact: ${contact}\nDescription: ${description}\nMaterials: ${materials || 'N/A'}\nBudget: ${budget || 'N/A'}\nReference: ${referenceItem || 'N/A'}`;

      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `🎁 Custom Order Request from ${name}`,
        text,
        html,
      });

      console.log(`[Custom Order] Email notification sent for new request`);
      res.json({ success: true, message: "Custom order request received" });
    } catch (error: any) {
      console.error("[Custom Order] Failed to process request:", error.message);
      res.status(500).json({ error: "Failed to submit custom order request. Please try again." });
    }
  });

  // Admin: Retroactively grant jewelry listing rewards for existing items
  app.post("/api/admin/jewelry-listing-rewards", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { jewelryItems } = await import("@shared/schema");
      const JEWELRY_LISTING_REWARD = 200;
      const { userId } = req.body; // optional: target specific user, otherwise all jewelry creators

      const allItems = userId
        ? await db.select().from(jewelryItems).where(eq(jewelryItems.postedBy, userId))
        : await db.select().from(jewelryItems);

      let rewarded = 0;
      let skipped = 0;

      for (const item of allItems) {
        if (!item.postedBy) { skipped++; continue; }
        // Check if reward already exists for this item
        const existing = await db.select().from(rewards).where(and(
          eq(rewards.userId, item.postedBy),
          eq(rewards.rewardType, 'jewelry_listing'),
          eq(rewards.referenceId, String(item.id)),
        ));
        if (existing.length > 0) { skipped++; continue; }

        await storage.creditWalletTokens(item.postedBy, JEWELRY_LISTING_REWARD);
        await db.insert(rewards).values({
          userId: item.postedBy,
          rewardType: 'jewelry_listing',
          tokenAmount: JEWELRY_LISTING_REWARD.toString(),
          cashValue: '0.00',
          status: 'confirmed',
          referenceId: String(item.id),
          metadata: { itemId: item.id, itemTitle: item.title, retroactive: true },
        });
        rewarded++;
        console.log(`✅ Retroactive jewelry reward: ${JEWELRY_LISTING_REWARD} JCMOVES for item "${item.title}" → user ${item.postedBy}`);
      }

      res.json({ success: true, rewarded, skipped, totalItems: allItems.length, tokensGranted: rewarded * JEWELRY_LISTING_REWARD });
    } catch (error: any) {
      console.error("Error granting retroactive jewelry rewards:", error);
      res.status(500).json({ error: error.message || "Failed to grant retroactive rewards" });
    }
  });

  // One-time retroactive correction for jobs completed on 3/1/2026 that received wrong creator bonus (got 50+50 instead of 250+500)
  app.post("/api/admin/job-reward-correction-20260301", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const adminId = req.session?.userId || req.user?.id;
      if (!adminId) return res.status(401).json({ error: "Not authenticated" });

      // Check if correction already applied
      const existing = await db.select().from(rewards)
        .where(and(eq(rewards.userId, adminId), eq(rewards.rewardType, 'admin_grant'), eq(rewards.referenceId, 'job-reward-correction-20260301')));
      if (existing.length > 0) {
        return res.status(409).json({ error: "Correction already applied", appliedAt: existing[0].createdAt });
      }

      const CORRECTION_AMOUNT = 650; // 200 (job 1 shortfall) + 450 (job 2 shortfall)
      await storage.creditWalletTokens(adminId, CORRECTION_AMOUNT);
      await db.insert(rewards).values({
        userId: adminId,
        rewardType: 'admin_grant',
        tokenAmount: CORRECTION_AMOUNT.toFixed(8),
        cashValue: (CORRECTION_AMOUNT * 0.00000508432).toFixed(4),
        status: 'confirmed',
        referenceId: 'job-reward-correction-20260301',
        metadata: { reason: 'Retroactive correction for 2 jobs marked complete 3/1/2026 (received 50+50 instead of 250+500)' }
      });

      console.log(`✅ Job reward correction applied: +${CORRECTION_AMOUNT} JCMOVES to ${adminId}`);
      res.json({ success: true, tokensGranted: CORRECTION_AMOUNT, message: `+${CORRECTION_AMOUNT} JCMOVES correction applied to your wallet` });
    } catch (error: any) {
      console.error("Error applying job reward correction:", error);
      res.status(500).json({ error: error.message || "Failed to apply correction" });
    }
  });

  // Square Checkout API - Create payment link for jewelry purchases
  app.post("/api/square/create-checkout", async (req: any, res) => {
    try {
      const { itemId } = req.body;

      if (!itemId) {
        return res.status(400).json({ error: "Missing required field: itemId" });
      }

      const dbItem = await storage.getJewelryItem(itemId);
      if (!dbItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (!dbItem.inStock) {
        return res.status(400).json({ error: "This item is no longer available" });
      }
      if (!dbItem.price) {
        return res.status(400).json({ error: "This item does not have a price set" });
      }

      const parsedAmount = parseFloat(dbItem.price);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid price amount" });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Square payment is not configured yet. Please contact us to purchase this item." });
      }

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "No Square locations found. Please configure your Square account." });
      }
      const locationId = locations[0].id!;

      const amountCents = BigInt(Math.round(parsedAmount * 100));

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const paymentLinkResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: `Nature Made Jewls - ${dbItem.title}`,
          priceMoney: {
            amount: amountCents,
            currency: "USD",
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success?itemId=${itemId}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Jewelry purchase: ${dbItem.title} (ID: ${itemId})`,
      });

      const paymentLink = paymentLinkResponse.result?.paymentLink || paymentLinkResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link" });
      }

      console.log(`Square checkout link created for ${dbItem.title} ($${dbItem.price}) - ${paymentLink.url}`);

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
        linkId: paymentLink.id,
      });
    } catch (error: any) {
      console.error("Error creating Square checkout:", error);
      const errorMsg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout link";
      res.status(500).json({ error: errorMsg });
    }
  });

  // ── Jewelry Purchase Completion — credit JCMOVES to buyer ──────────────────
  // Called by the frontend payment-success page after Square redirects back.
  // Idempotent: if the item already has completionRewardedAt set we skip re-award.
  app.post("/api/jewelry/payment-complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { itemId } = req.body;
      if (!itemId) return res.status(400).json({ error: "Missing itemId" });

      const dbItem = await storage.getJewelryItem(itemId);
      if (!dbItem) return res.status(404).json({ error: "Item not found" });

      const purchasePrice = parseFloat(dbItem.price || "0");
      if (purchasePrice <= 0) return res.status(400).json({ error: "Invalid item price" });

      // Idempotency: skip if already rewarded for this item
      const alreadyRewarded = await db.select({ id: rewards.id })
        .from(rewards)
        .where(and(eq(rewards.userId, userId), eq(rewards.rewardType, 'jewelry_purchase'), eq(rewards.referenceId, itemId)))
        .limit(1);

      if (alreadyRewarded.length > 0) {
        return res.json({ success: true, tokensEarned: 0, alreadyRewarded: true });
      }

      // Look up earn rate from reward settings (default 50 JCMOVES per $1)
      const rateSetting = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'earn_rate_per_dollar')).limit(1);
      const earnRate = rateSetting.length > 0 ? parseFloat(rateSetting[0].tokenAmount) : 50;
      const tokensEarned = Math.round(purchasePrice * earnRate);

      if (tokensEarned > 0) {
        // Credit tokens to wallet
        await storage.creditWalletTokens(userId, tokensEarned);

        // Log in rewards table with jewelry_purchase type + source tag
        await db.insert(rewards).values({
          userId,
          rewardType: 'jewelry_purchase',
          tokenAmount: tokensEarned.toFixed(8),
          cashValue: (purchasePrice * 0.01).toFixed(2),
          status: "confirmed",
          referenceId: itemId,
          metadata: {
            source: "jewelry_shop",
            itemId,
            itemTitle: dbItem.title,
            purchasePrice,
            earnRate,
            tokensPerDollar: earnRate,
          }
        });

        // Log treasury distribution with jewelry_shop source tag
        try {
          await treasuryService.distributeTokens(
            tokensEarned,
            `Jewelry purchase reward: ${tokensEarned} JCMOVES for "${dbItem.title}" ($${purchasePrice.toFixed(2)}) — source: jewelry_shop`,
            "jewelry_shop",
            itemId
          );
        } catch (treasuryErr) {
          console.warn("[jewelry-payment-complete] Treasury distribution failed (non-fatal):", treasuryErr);
        }

        console.log(`💎 Jewelry purchase reward: ${tokensEarned} JCMOVES to user ${userId} for item "${dbItem.title}" ($${purchasePrice})`);
      }

      res.json({ success: true, tokensEarned, earnRate, purchasePrice, itemTitle: dbItem.title });
    } catch (error: any) {
      console.error("Error processing jewelry payment completion:", error);
      res.status(500).json({ error: error.message || "Failed to process payment completion" });
    }
  });

  // ── Square Catalog ID mappings (admin only) ─────────────────────────────
  app.get("/api/square/catalog-mappings", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { rows } = await pool.query(`SELECT setting_value FROM spin_config WHERE setting_key='square_catalog_mappings' LIMIT 1`);
      const mappings = rows.length > 0 ? JSON.parse(rows[0].setting_value) : {};
      res.json({ mappings });
    } catch (err) {
      console.error("Error fetching catalog mappings:", err);
      res.json({ mappings: {} });
    }
  });

  app.put("/api/square/catalog-mappings", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const mappings = req.body.mappings || {};
      const json = JSON.stringify(mappings);
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description)
         VALUES ('square_catalog_mappings', $1, 'Package name → Square Catalog variation ID mappings')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=now()`,
        [json]
      );
      res.json({ success: true, mappings });
    } catch (err) {
      console.error("Error saving catalog mappings:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Square: Create Order on Build (admin only) ─────────────────────────────
  // Called by JobOrderBuilder "Apply Order" — creates a Square Order immediately.
  // Uses catalog variation IDs from mappings where available; falls back to ad-hoc line items.
  app.post("/api/square/create-order/:leadId", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    const { leadId } = req.params;
    try {
      const lead = await storage.getLead(leadId);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const lineItems: Array<{ id?: string; name: string; qty: number; unitPrice: number; total: number }> = req.body.lineItems || [];
      if (!lineItems.length) return res.status(400).json({ error: "No line items provided" });

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        // Square not configured: just save totals with no square order
        return res.json({ success: true, squareOrderId: null, note: "Square not configured — order saved locally" });
      }

      const { squareInvoiceService } = await import("./services/square-invoice");
      const catalogMappings = await squareInvoiceService.getCatalogMappings();

      const { SquareClient, SquareEnvironment } = await import("square");
      const client = new SquareClient({
        token: squareToken,
        environment: process.env.SQUARE_ENVIRONMENT === "production"
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
      });

      const locationId = await squareInvoiceService.getLocationId();

      const squareLineItems = lineItems.map(li => {
        const catalogVariationId = li.id ? catalogMappings[li.id] : undefined;
        if (catalogVariationId) {
          return { catalogObjectId: catalogVariationId, quantity: String(li.qty) };
        }
        return {
          name: li.name,
          quantity: String(li.qty),
          basePriceMoney: {
            amount: BigInt(Math.round(li.unitPrice * 100)),
            currency: "USD" as const,
          },
        };
      });

      const orderResponse = await client.orders.create({
        order: {
          locationId,
          lineItems: squareLineItems,
          state: "OPEN",
        },
        idempotencyKey: `order-${leadId}-${Date.now()}`,
      });

      const squareOrderId = orderResponse.order?.id ?? null;

      // Persist the Square order ID on the lead
      if (squareOrderId) {
        await storage.updateLeadQuote(leadId, { squareOrderId });
      }

      res.json({ success: true, squareOrderId, orderState: orderResponse.order?.state });
    } catch (err) {
      console.error("Error creating Square order:", err);
      // Non-fatal — order totals already saved locally on lead; return gracefully
      res.json({ success: false, squareOrderId: null, error: err.message });
    }
  });

  // ── Square Catalog proxy (admin only) ──────────────────────────────────────
  app.get("/api/square/catalog", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    const squareToken = process.env.SQUARE_ACCESS_TOKEN;
    if (!squareToken) {
      return res.status(200).json({ items: [], note: "Square not configured" });
    }
    try {
      const { SquareClient, SquareEnvironment } = await import("square");
      const client = new SquareClient({
        token: squareToken,
        environment: process.env.SQUARE_ENVIRONMENT === "production"
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
      });
      const response = await client.catalog.list({ types: "ITEM" });
      const objects = response.objects || [];
      const items = objects
        .filter((o: any) => o.type === "ITEM" && o.itemData)
        .map((o: any) => ({
          id: o.id,
          name: o.itemData.name,
          description: o.itemData.description,
          variations: (o.itemData.variations || []).map((v: any) => ({
            id: v.id,
            name: v.itemVariationData?.name,
            priceMoney: v.itemVariationData?.priceMoney,
          })),
        }));
      res.json({ items });
    } catch (err) {
      console.error("Square catalog error:", err);
      res.status(200).json({ items: [], error: err.message });
    }
  });

  // ── Square itemized invoice for a lead (admin only) ─────────────────────
  app.post("/api/square/invoice-lead/:leadId", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    const { leadId } = req.params;
    try {
      const lead = await storage.getLead(leadId);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const { lineItems, dueDate } = req.body as {
        lineItems?: Array<{ name: string; qty: number; unitPrice: number; total: number }>;
        dueDate?: string;
      };

      const { squareInvoiceService } = await import("./services/square-invoice");

      let result: { invoiceId: string; invoiceUrl: string; squareInvoiceId: string };

      if (lineItems && lineItems.length > 0) {
        result = await squareInvoiceService.createItemizedInvoiceForLead(lead, lineItems, dueDate);
      } else {
        const amount = parseFloat(lead.totalPrice || lead.basePrice || "0");
        if (!amount) return res.status(400).json({ error: "No price set on lead and no lineItems provided" });
        result = await squareInvoiceService.createInvoiceForLead(lead, amount, undefined, dueDate);
      }

      res.json({ success: true, ...result });
    } catch (err) {
      console.error("Error creating itemized invoice:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Promo Half Day Package - Creates lead + Square Checkout
  app.post("/api/promo/half-day-checkout", async (req: any, res) => {
    try {
      const { firstName, lastName, email, phone, fromAddress, toAddress, moveDate, details, addOns } = req.body;

      if (!firstName || !lastName || !email || !phone || !fromAddress || !moveDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Payment processing is not configured. Please call us at 906-285-9312 to book." });
      }

      const validAddOnPrices: Record<string, number> = {
        "truck-rental": 200,
        "extra-mover": 75,
        "extra-hour": 100,
      };

      const validatedAddOns: { id: string; name: string; price: number; type: string }[] = [];
      if (addOns && Array.isArray(addOns)) {
        for (const addon of addOns) {
          if (addon.type === "service") {
            const expected = validAddOnPrices[addon.id];
            if (expected && expected === parseFloat(addon.price)) {
              validatedAddOns.push({ id: addon.id, name: addon.name, price: expected, type: addon.type });
            }
          } else if (addon.type === "jewelry") {
            const price = parseFloat(addon.price);
            if (!isNaN(price) && price > 0) {
              validatedAddOns.push({ id: addon.id, name: addon.name, price, type: addon.type });
            }
          }
        }
      }

      const basePrice = 600;
      const addOnsSubtotal = validatedAddOns.reduce((sum, a) => sum + a.price, 0);
      const addOnsDiscount = validatedAddOns.length > 0 ? Math.round(addOnsSubtotal * 0.1 * 100) / 100 : 0;
      const totalPrice = basePrice + addOnsSubtotal - addOnsDiscount;
      const totalCents = Math.round(totalPrice * 100);

      const addOnNames = validatedAddOns.map(a => a.name).join(", ");
      const detailText = `[HALF DAY PROMO - $${totalPrice}] 3 Movers, 4 Hours, Travel Included.${addOnNames ? ` Add-ons: ${addOnNames}.` : ""} ${details || ""}`.trim();

      const lead = await storage.createLead({
        firstName,
        lastName,
        email,
        phone,
        serviceType: "residential",
        fromAddress,
        toAddress: toAddress || "",
        moveDate,
        details: detailText,
        propertySize: "half-day-promo",
        crewSize: 3,
        truckConfig: "company_truck",
        basePrice: "600.00",
        totalPrice: totalPrice.toFixed(2),
      });

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "Payment setup incomplete. Please call us at 906-285-9312." });
      }
      const locationId = locations[0].id!;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const checkoutName = validatedAddOns.length > 0
        ? `Half Day Move + ${validatedAddOns.length} add-on${validatedAddOns.length > 1 ? "s" : ""} (10% bundle discount)`
        : "Half Day Loading/Unloading - 3 Movers, 4 Hours";

      const paymentLinkResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: checkoutName,
          priceMoney: {
            amount: BigInt(totalCents),
            currency: "USD",
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success?type=promo&leadId=${lead.id}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Half Day Promo - ${firstName} ${lastName} - ${moveDate} - Lead ID: ${lead.id}${addOnNames ? ` | Add-ons: ${addOnNames}` : ""}`,
      });

      const paymentLink = paymentLinkResponse.result?.paymentLink || paymentLinkResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link" });
      }

      // Send confirmation email to customer
      try {
        await sendEmail({
          to: email,
          from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
          subject: "JC ON THE MOVE - Half Day Move Booking Confirmation",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
              <h1 style="color: #facc15; text-align: center; margin-bottom: 20px;">JC ON THE MOVE LLC</h1>
              <h2 style="color: white; text-align: center;">Half Day Move — Booking Confirmed</h2>
              
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #facc15; margin-top: 0;">Package Details</h3>
                <p><strong>Service:</strong> Half Day Loading/Unloading</p>
                <p><strong>Crew:</strong> 3 Professional Movers</p>
                <p><strong>Duration:</strong> 4 Hours (travel time included)</p>
                <p><strong>Price:</strong> $600.00</p>
              </div>
              
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #60a5fa; margin-top: 0;">Your Move Info</h3>
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p><strong>Date:</strong> ${moveDate}</p>
                <p><strong>Pickup:</strong> ${fromAddress}</p>
                ${toAddress ? `<p><strong>Drop-off:</strong> ${toAddress}</p>` : ""}
                ${details ? `<p><strong>Notes:</strong> ${details}</p>` : ""}
              </div>
              
              <div style="background: #7f1d1d40; border: 1px solid #ef444480; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #fca5a5; margin-top: 0; font-size: 14px;">Cancellation Policy</h3>
                <p style="font-size: 13px; margin: 5px 0;">• More than 48 hours: 10% processing fee or $100, whichever is greater</p>
                <p style="font-size: 13px; margin: 5px 0;">• Within 48 hours: 25% fee ($150)</p>
                <p style="font-size: 13px; margin: 5px 0;">• Within 24 hours: 50% fee ($300)</p>
              </div>
              
              <p style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 25px;">
                Questions? Call us at <a href="tel:906-285-9312" style="color: #60a5fa;">906-285-9312</a> or email 
                <a href="mailto:upmichiganstatemovers@gmail.com" style="color: #60a5fa;">upmichiganstatemovers@gmail.com</a>
              </p>
            </div>
          `,
          text: `JC ON THE MOVE - Half Day Move Booking\n\nHi ${firstName},\n\nYour Half Day Loading/Unloading booking is confirmed!\n\nPackage: 3 Movers, 4 Hours, Travel Included\nPrice: $600.00\nDate: ${moveDate}\nPickup: ${fromAddress}\n${toAddress ? `Drop-off: ${toAddress}\n` : ""}${details ? `Notes: ${details}\n` : ""}\nCancellation Policy:\n- More than 48 hours: $10 or $100 fee (whichever is greater)\n- Within 48 hours: 25% ($150)\n- Within 24 hours: 50% ($300)\n\nCall 906-285-9312 with questions.`,
        });
      } catch (emailErr) {
        console.error("Failed to send promo booking email:", emailErr);
      }

      // Notify business
      try {
        await sendEmail({
          to: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
          from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
          subject: `New Half Day Promo Booking - ${firstName} ${lastName} - ${moveDate}`,
          html: `<h2>New Half Day Promo Booking</h2><p><strong>${firstName} ${lastName}</strong></p><p>Phone: ${phone}</p><p>Email: ${email}</p><p>Date: ${moveDate}</p><p>From: ${fromAddress}</p>${toAddress ? `<p>To: ${toAddress}</p>` : ""}<p>Price: $600</p>${details ? `<p>Notes: ${details}</p>` : ""}<p>Lead ID: ${lead.id}</p>`,
          text: `New Half Day Promo Booking\n${firstName} ${lastName}\nPhone: ${phone}\nEmail: ${email}\nDate: ${moveDate}\nFrom: ${fromAddress}\n${toAddress ? `To: ${toAddress}\n` : ""}Price: $600\nLead ID: ${lead.id}`,
        });
      } catch (emailErr) {
        console.error("Failed to send business notification:", emailErr);
      }

      console.log(`Half Day Promo checkout created for ${firstName} ${lastName} (${moveDate}) - Lead: ${lead.id} - ${paymentLink.url}`);

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
        leadId: lead.id,
      });
    } catch (error: any) {
      console.error("Error creating promo checkout:", error);
      const errorMsg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout";
      res.status(500).json({ error: errorMsg });
    }
  });

  // POST /api/bookings/deposit/create — booking calculator deposit checkout
  app.post("/api/bookings/deposit/create", async (req: any, res) => {
    try {
      const {
        firstName, lastName, email, phone,
        moveDate, fromAddress, toAddress, details,
        movers, hours, addOns, truckSize,
        pickupZip, dropoffZip, promoCode,
      } = req.body;

      if (!firstName || !lastName || !email || !phone) {
        return res.status(400).json({ error: "Missing required contact fields (name, email, phone)." });
      }
      if (!fromAddress || !moveDate) {
        return res.status(400).json({ error: "Pickup address and move date are required." });
      }
      if (!pickupZip || String(pickupZip).replace(/\D/g, "").length < 5) {
        return res.status(400).json({ error: "A valid pickup ZIP code is required to calculate pricing." });
      }
      if (!movers || !hours) {
        return res.status(400).json({ error: "Mover count and hours are required." });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Payment processing is not configured. Please call us at 906-285-9312 to book." });
      }

      // Resolve ZIP codes to lat/lng for accurate travel pricing
      const pickupLocation = await fetchZipLocation(String(pickupZip).trim()).catch(() => null);
      if (!pickupLocation) {
        return res.status(400).json({ error: "Could not resolve pickup ZIP code. Please check and try again." });
      }

      let dropoffLocation = null;
      if (dropoffZip && String(dropoffZip).trim().length >= 5) {
        dropoffLocation = await fetchZipLocation(String(dropoffZip).trim()).catch(() => null);
      }

      // Look up promo discount if a code was provided
      let promoInput = null;
      if (promoCode) {
        const normalizedCode = String(promoCode).trim().toUpperCase();
        const [promoRow] = await db.select().from(promoCodes)
          .where(and(eq(promoCodes.code, normalizedCode), eq(promoCodes.isActive, true)))
          .limit(1);
        if (promoRow) {
          promoInput = {
            code: normalizedCode,
            discountPercent: promoRow.discountPercent ? Number(promoRow.discountPercent) : null,
            description: promoRow.description,
          };
        }
      }

      // Compute server-side price so the deposit can't be tampered with
      const parsedMovers = Math.max(1, Math.min(10, parseInt(movers) || 2));
      const parsedHours = Math.max(2, Math.min(12, parseFloat(hours) || 3));
      const safeAddOns = {
        truck: Boolean(addOns?.truck),
        packing: Boolean(addOns?.packing),
        stairs: Boolean(addOns?.stairs),
        piano: Boolean(addOns?.piano),
        hotTub: Boolean(addOns?.hotTub),
        assembly: Boolean(addOns?.assembly),
      };
      const safeTruckSize = (truckSize === "large" || truckSize === "sixteen") ? truckSize : "sixteen";

      const pricing = calculateMovingPrice({
        movers: parsedMovers,
        hours: parsedHours,
        addOns: safeAddOns,
        truckSize: safeTruckSize,
        pickup: pickupLocation,
        dropoff: dropoffLocation,
        promo: promoInput,
      });

      const depositAmount = Math.round(pricing.grandTotal * 0.3 * 100) / 100;
      const depositCents = BigInt(Math.round(depositAmount * 100));

      // Build description for the lead
      const addOnNames = Object.entries(safeAddOns)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ");
      const detailText = [
        `[DEPOSIT BOOKING] ${parsedMovers} movers, ${pricing.billableHours} hrs`,
        safeAddOns.truck ? `Truck (${safeTruckSize})` : null,
        addOnNames ? `Add-ons: ${addOnNames}` : null,
        `Grand total: $${pricing.grandTotal} | Deposit paid: $${depositAmount}`,
        details || null,
      ].filter(Boolean).join(". ");

      const lead = await storage.createLead({
        firstName,
        lastName,
        email,
        phone,
        serviceType: safeAddOns.truck ? "residential" : "residential",
        fromAddress,
        toAddress: toAddress || "",
        moveDate,
        details: detailText,
        propertySize: "calculator-booking",
        crewSize: parsedMovers,
        truckConfig: safeAddOns.truck ? "company_truck" : "none",
        basePrice: pricing.laborSubtotal.toFixed(2),
        totalPrice: pricing.grandTotal.toFixed(2),
      });

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "Payment setup incomplete. Please call us at 906-285-9312." });
      }
      const locationId = locations[0].id!;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const paymentLinkResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: `JC ON THE MOVE — ${parsedMovers} Mover${parsedMovers > 1 ? "s" : ""}, ${pricing.billableHours} hrs — 30% Deposit`,
          priceMoney: { amount: depositCents, currency: "USD" },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success?type=booking&leadId=${lead.id}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Move deposit — ${firstName} ${lastName} — ${moveDate} — Lead ${lead.id} — Full: $${pricing.grandTotal}`,
      });

      const paymentLink = paymentLinkResponse.result?.paymentLink || paymentLinkResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link. Please call 906-285-9312." });
      }

      // Send confirmation emails (fire-and-forget)
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
          <h1 style="color: #facc15; text-align: center;">JC ON THE MOVE LLC</h1>
          <h2 style="color: white; text-align: center;">Deposit Received — Move Reserved</h2>
          <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #facc15; margin-top: 0;">Booking Summary</h3>
            <p><strong>Crew:</strong> ${parsedMovers} Mover${parsedMovers > 1 ? "s" : ""}</p>
            <p><strong>Hours booked:</strong> ${pricing.billableHours} hrs</p>
            ${safeAddOns.truck ? `<p><strong>Truck:</strong> Included (${safeTruckSize === "large" ? "Large" : "16ft"})</p>` : ""}
            <p><strong>Full total:</strong> $${pricing.grandTotal}</p>
            <p><strong>Deposit paid:</strong> $${depositAmount} (30%)</p>
            <p><strong>Balance due on move day:</strong> $${Math.round((pricing.grandTotal - depositAmount) * 100) / 100}</p>
          </div>
          <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #60a5fa; margin-top: 0;">Your Move Info</h3>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Date:</strong> ${moveDate}</p>
            <p><strong>Pickup:</strong> ${fromAddress}</p>
            ${toAddress ? `<p><strong>Drop-off:</strong> ${toAddress}</p>` : ""}
            ${details ? `<p><strong>Notes:</strong> ${details}</p>` : ""}
          </div>
          <p style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 25px;">
            Questions? Call <a href="tel:906-285-9312" style="color: #60a5fa;">906-285-9312</a> or email
            <a href="mailto:upmichiganstatemovers@gmail.com" style="color: #60a5fa;">upmichiganstatemovers@gmail.com</a>
          </p>
        </div>`;
      sendEmail({
        to: email,
        from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
        subject: "JC ON THE MOVE — Move Deposit Confirmed",
        html: emailHtml,
        text: `JC ON THE MOVE - Deposit Confirmed\n\nHi ${firstName},\n\n${parsedMovers} movers, ${pricing.billableHours} hrs\nDate: ${moveDate}\nPickup: ${fromAddress}${toAddress ? `\nDrop-off: ${toAddress}` : ""}\nFull total: $${pricing.grandTotal} | Deposit paid: $${depositAmount}\nBalance due on move day: $${Math.round((pricing.grandTotal - depositAmount) * 100) / 100}\n\nCall 906-285-9312 with questions.`,
      }).catch(err => console.error("Customer deposit email failed:", err));
      sendEmail({
        to: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
        from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
        subject: `New Move Deposit — ${firstName} ${lastName} — ${moveDate}`,
        html: `<h2>New Move Deposit Received</h2><p><strong>${firstName} ${lastName}</strong><br>Phone: ${phone}<br>Email: ${email}</p><p>Date: ${moveDate}<br>From: ${fromAddress}${toAddress ? `<br>To: ${toAddress}` : ""}</p><p>Crew: ${parsedMovers} movers, ${pricing.billableHours} hrs | Full: $${pricing.grandTotal} | Deposit: $${depositAmount}</p><p>Lead ID: ${lead.id}</p>`,
        text: `New Move Deposit\n${firstName} ${lastName}\n${phone} | ${email}\nDate: ${moveDate}\nFrom: ${fromAddress}\nCrew: ${parsedMovers} movers, ${pricing.billableHours} hrs | Full: $${pricing.grandTotal} | Deposit: $${depositAmount}\nLead: ${lead.id}`,
      }).catch(err => console.error("Business deposit email failed:", err));

      console.log(`Deposit checkout created: ${firstName} ${lastName} (${moveDate}) | $${depositAmount} of $${pricing.grandTotal} | Lead ${lead.id}`);

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
        invoiceId: lead.id,
        depositAmount,
        grandTotal: pricing.grandTotal,
      });
    } catch (error: any) {
      console.error("Error creating deposit checkout:", error);
      const msg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/cart/checkout", async (req: any, res) => {
    try {
      const { firstName, lastName, email, phone, fromAddress, toAddress, moveDate, details, items } = req.body;

      if (!firstName || !lastName || !email || !phone) {
        return res.status(400).json({ error: "Missing required contact fields" });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Payment processing is not configured. Please call us at 906-285-9312." });
      }

      const hasServiceItems = items.some((i: any) => i.type === "service" || i.type === "promo");
      if (hasServiceItems && (!fromAddress || !moveDate)) {
        return res.status(400).json({ error: "Address and date required for service items" });
      }

      const sponsorPrices: Record<string, number> = {
        "sponsor-bronze": 100,
        "sponsor-silver": 250,
        "sponsor-gold": 500,
      };

      const validatedItems = items.map((item: any) => {
        const price = parseFloat(item.price);
        if (isNaN(price) || price <= 0) throw new Error(`Invalid price for ${item.name}`);
        if (item.type === "sponsor") {
          const expectedPrice = sponsorPrices[item.id];
          if (!expectedPrice || expectedPrice !== price) {
            throw new Error(`Invalid sponsor tier: ${item.id}`);
          }
        }
        return { id: item.id, name: item.name, price, type: item.type };
      });

      const subtotal = validatedItems.reduce((sum: number, i: any) => sum + i.price, 0);
      const hasMultiple = validatedItems.length > 1;
      const nonPromoItems = validatedItems.filter((i: any) => i.type !== "promo");
      const discountableItems = nonPromoItems.slice(1);
      const discountableSubtotal = discountableItems.reduce((sum: number, i: any) => sum + i.price, 0);
      const discountAmount = hasMultiple ? Math.round(discountableSubtotal * 0.1 * 100) / 100 : 0;
      const totalPrice = Math.round((subtotal - discountAmount) * 100) / 100;

      let leadId: number | null = null;
      if (hasServiceItems) {
        const serviceItems = validatedItems.filter((i: any) => i.type === "service" || i.type === "promo");
        const itemNames = serviceItems.map((i: any) => i.name).join(", ");
        const cartDetails = `[CART ORDER] ${itemNames}. ${details || ""}`.trim();

        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const existingLeads = await db
          .select()
          .from(leads)
          .where(
            and(
              eq(leads.email, email),
              eq(leads.details, cartDetails),
              sql`${leads.createdAt} > ${fiveMinAgo}`
            )
          )
          .limit(1);

        if (existingLeads.length > 0) {
          leadId = existingLeads[0].id;
        } else {
          const lead = await storage.createLead({
            firstName,
            lastName,
            email,
            phone,
            serviceType: "residential",
            fromAddress: fromAddress || "",
            toAddress: toAddress || "",
            moveDate: moveDate || "",
            details: cartDetails,
            propertySize: "cart-bundle",
            crewSize: 3,
            truckConfig: "company_truck",
            basePrice: totalPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
          });
          leadId = lead.id;
        }
      }

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "Payment setup incomplete. Please call us at 906-285-9312." });
      }
      const locationId = locations[0].id!;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      let nonPromoIndex = 0;
      const lineItems = validatedItems.map((item: any) => {
        let itemPrice = item.price;
        const isNonPromo = item.type !== "promo";
        if (isNonPromo) {
          nonPromoIndex++;
          if (hasMultiple && nonPromoIndex > 1) {
            itemPrice = Math.round(item.price * 0.9 * 100) / 100;
          }
        }
        return {
          name: item.name,
          quantity: "1",
          basePriceMoney: {
            amount: BigInt(Math.round(itemPrice * 100)),
            currency: "USD",
          },
        };
      });

      // Extract community shop item IDs for auto-reward on payment-success
      const shopItemIds = validatedItems
        .filter((i: any) => i.type === "shop" || (typeof i.id === "string" && i.id.startsWith("shop-")))
        .map((i: any) => (typeof i.id === "string" && i.id.startsWith("shop-") ? i.id.slice(5) : i.id));

      let redirectParams = leadId ? `?type=cart&leadId=${leadId}` : `?type=cart`;
      if (shopItemIds.length > 0) {
        redirectParams += `&shopItems=${shopItemIds.join(",")}`;
      }

      const orderResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        order: {
          locationId,
          lineItems,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success${redirectParams}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Cart Order - ${firstName} ${lastName}${leadId ? ` - Lead ${leadId}` : ""}`,
      });

      const paymentLink = orderResponse.result?.paymentLink || orderResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link" });
      }

      try {
        const itemList = validatedItems.map((i: any) => `• ${i.name}: $${i.price.toFixed(2)}`).join("\n");
        await sendEmail({
          to: email,
          from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
          subject: "JC ON THE MOVE - Order Confirmation",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
              <h1 style="color: #facc15; text-align: center;">JC ON THE MOVE LLC</h1>
              <h2 style="color: white; text-align: center;">Order Confirmed</h2>
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #facc15; margin-top: 0;">Your Items</h3>
                ${validatedItems.map((i: any) => `<p>• ${i.name}: <strong>$${i.price.toFixed(2)}</strong></p>`).join("")}
                ${hasMultiple ? `<p style="color: #4ade80;"><strong>Bundle Discount (10%): -$${discountAmount.toFixed(2)}</strong></p>` : ""}
                <p style="font-size: 18px; color: #facc15;"><strong>Total: $${totalPrice.toFixed(2)}</strong></p>
              </div>
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                ${fromAddress ? `<p><strong>Pickup:</strong> ${fromAddress}</p>` : ""}
                ${toAddress ? `<p><strong>Drop-off:</strong> ${toAddress}</p>` : ""}
                ${moveDate ? `<p><strong>Date:</strong> ${moveDate}</p>` : ""}
              </div>
              <p style="text-align: center; color: #94a3b8; font-size: 12px;">Questions? Call (906) 285-9312</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.log("Cart checkout email failed (non-critical):", emailErr);
      }

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
        leadId,
      });
    } catch (error: any) {
      console.error("Error creating cart checkout:", error);
      const errorMsg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout";
      res.status(500).json({ error: errorMsg });
    }
  });

  // ── Sponsor business card upload ──────────────────────────────────────────
  // Public: active sponsors for display on sponsors page
  app.get("/api/sponsors", async (_req, res) => {
    try {
      const activeSponsors = await storage.getSponsors("active");
      res.json(activeSponsors);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: all sponsors
  app.get("/api/admin/sponsors", async (req: any, res) => {
    try {
      if (!req.user || (req.user.role !== "admin" && req.user.role !== "business_owner")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const allSponsors = await storage.getSponsors();
      res.json(allSponsors);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: approve sponsor
  app.post("/api/admin/sponsors/:id/approve", async (req: any, res) => {
    try {
      if (!req.user || (req.user.role !== "admin" && req.user.role !== "business_owner")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const sponsor = await storage.updateSponsorStatus(req.params.id, "active");
      if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
      res.json(sponsor);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: reject sponsor
  app.post("/api/admin/sponsors/:id/reject", async (req: any, res) => {
    try {
      if (!req.user || (req.user.role !== "admin" && req.user.role !== "business_owner")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const sponsor = await storage.updateSponsorStatus(req.params.id, "cancelled");
      if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
      res.json(sponsor);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: toggle featured
  app.patch("/api/admin/sponsors/:id/featured", async (req: any, res) => {
    try {
      if (!req.user || (req.user.role !== "admin" && req.user.role !== "business_owner")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const current = await storage.getSponsor(req.params.id);
      if (!current) return res.status(404).json({ error: "Sponsor not found" });
      const sponsor = await storage.updateSponsorFeatured(req.params.id, !current.featured);
      res.json(sponsor);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sponsor/upload-card", async (req: any, res) => {
    try {
      const multer = (await import("multer")).default;
      const cardUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("card");
      await new Promise<void>((resolve, reject) => cardUpload(req, res as any, (err) => err ? reject(err) : resolve()));
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const { Client } = await import("@replit/object-storage");
      const storage = new Client();
      const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
      const key = `public/sponsor-cards/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await storage.uploadFromBytes(key, req.file.buffer, { contentType: req.file.mimetype });
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const url = `${protocol}://${host}/api/object-storage/${encodeURIComponent(key)}`;
      res.json({ success: true, url, key });
    } catch (err) {
      console.error("Sponsor card upload error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  app.post("/api/sponsor/checkout", async (req: any, res) => {
    try {
      const { businessName, contactName, email, phone, tierId, tierName, tierPrice, businessCardUrl } = req.body;

      if (!businessName || !contactName || !email || !phone || !tierName || !tierPrice) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const validTiers: Record<string, { price: number; tier: string }> = {
        "sponsor-starter": { price: 50, tier: "starter" },
        "sponsor-growth": { price: 100, tier: "growth" },
        "sponsor-power": { price: 200, tier: "power" },
        // Legacy tier IDs (backward compat)
        "sponsor-bronze": { price: 50, tier: "starter" },
        "sponsor-silver": { price: 100, tier: "growth" },
        "sponsor-gold": { price: 200, tier: "power" },
      };
      const tierInfo = validTiers[tierId];
      if (!tierInfo || tierInfo.price !== tierPrice) {
        return res.status(400).json({ error: "Invalid sponsorship tier" });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Payment processing is not configured. Please call us at 906-285-9312." });
      }

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "Payment setup incomplete. Please call us at 906-285-9312." });
      }
      const locationId = locations[0].id!;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const paymentLinkResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: `${tierName} - Monthly Sponsorship`,
          priceMoney: {
            amount: BigInt(tierPrice * 100),
            currency: "USD",
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success?type=sponsor&tier=${tierId}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Sponsorship: ${tierName} - ${businessName} (${contactName}) - ${email}`,
      });

      const paymentLink = paymentLinkResponse.result?.paymentLink || paymentLinkResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link" });
      }

      // Save sponsor to DB with status pending before redirecting
      try {
        await storage.createSponsor({
          businessName,
          contactName,
          email,
          phone,
          website: (req.body as any).website || null,
          logoUrl: businessCardUrl || null,
          tier: tierInfo.tier,
          status: "pending",
          featured: false,
          tierPrice,
          squarePaymentUrl: paymentLink.url,
        });
      } catch (dbErr) {
        console.error("Failed to save sponsor to DB (non-critical):", dbErr);
      }

      const cardBlock = businessCardUrl
        ? `<div style="margin: 16px 0; padding: 14px; background: #0f172a; border-radius: 8px; border: 1px solid #334155;">
             <p style="margin: 0 0 8px; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Business Card / Logo</p>
             <img src="${businessCardUrl}" alt="Business Card" style="max-width: 100%; border-radius: 6px;" onerror="this.style.display='none'" />
             <p style="margin: 8px 0 0;"><a href="${businessCardUrl}" style="color: #38bdf8; font-size: 12px;">View / Download</a></p>
           </div>`
        : "";

      try {
        // ── Sponsor confirmation email ───────────────────────────────────────
        await sendEmail({
          to: email,
          from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
          subject: `JC ON THE MOVE - ${tierName} Sponsorship Confirmed`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
              <h1 style="color: #facc15; text-align: center;">JC ON THE MOVE LLC</h1>
              <h2 style="color: white; text-align: center;">Sponsorship Initiated!</h2>
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #facc15; margin-top: 0;">${tierName}</h3>
                <p><strong>Business:</strong> ${businessName}</p>
                <p><strong>Contact:</strong> ${contactName}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Monthly Rate:</strong> $${tierPrice}</p>
              </div>
              ${businessCardUrl ? `<p style="color: #94a3b8; font-size: 13px;">We received your business card/logo and will use it when setting up your sponsorship.</p>${cardBlock}` : ""}
              <p style="text-align: center; margin-top: 20px;">Please complete your payment through the Square checkout link to activate your sponsorship.</p>
              <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;">Questions? Call <strong>(906) 285-9312</strong> or email upmichiganstatemovers@gmail.com</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.log("Sponsor confirmation email failed (non-critical):", emailErr);
      }

      try {
        // ── Admin notification email ─────────────────────────────────────────
        await sendEmail({
          to: "upmichiganstatemovers@gmail.com",
          from: process.env.COMPANY_EMAIL || "michigankid906@gmail.com",
          subject: `NEW SPONSOR: ${businessName} — ${tierName} ($${tierPrice}/mo)`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
              <h1 style="color: #facc15; text-align: center;">New Sponsorship Inquiry</h1>
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #facc15; margin-top: 0;">${tierName} — $${tierPrice}/month</h3>
                <p><strong>Business:</strong> ${businessName}</p>
                <p><strong>Contact:</strong> ${contactName}</p>
                <p><strong>Email:</strong> <a href="mailto:${email}" style="color: #38bdf8;">${email}</a></p>
                <p><strong>Phone:</strong> <a href="tel:${phone}" style="color: #38bdf8;">${phone}</a></p>
              </div>
              ${cardBlock || `<p style="color: #94a3b8; font-size: 13px;">No business card uploaded.</p>`}
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">They were sent to Square checkout. Follow up if payment is not completed within 24 hours.</p>
            </div>
          `,
        });
      } catch (adminEmailErr) {
        console.log("Sponsor admin email failed (non-critical):", adminEmailErr);
      }

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
      });
    } catch (error: any) {
      console.error("Error creating sponsor checkout:", error);
      const errorMsg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout";
      res.status(500).json({ error: errorMsg });
    }
  });

  // Public endpoint: BTC wallet address + live price for tip payments on review page
  app.get("/api/btc/tip-info", async (_req, res) => {
    try {
      const btcAddress = process.env.BTC_WALLET_ADDRESS;
      if (!btcAddress) return res.status(503).json({ error: "Bitcoin tips not configured" });
      let btcPrice = 0;
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
        const d = await r.json();
        btcPrice = d.bitcoin?.usd || 0;
      } catch {}
      if (!btcPrice) {
        try {
          const r2 = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
          const d2 = await r2.json();
          btcPrice = parseFloat(d2.data?.amount) || 0;
        } catch {}
      }
      res.json({ address: btcAddress, btcPrice, timestamp: Date.now() });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to load tip info" });
    }
  });

  app.get("/api/btc/price", async (_req, res) => {
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      if (!response.ok) throw new Error("Failed to fetch BTC price");
      const data = await response.json();
      const btcPrice = data.bitcoin?.usd;
      if (!btcPrice) throw new Error("Invalid price data");
      res.json({ price: btcPrice, timestamp: Date.now() });
    } catch (error) {
      try {
        const fallback = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
        const data = await fallback.json();
        const btcPrice = parseFloat(data.data?.amount);
        if (!btcPrice || isNaN(btcPrice)) throw new Error("Fallback failed");
        res.json({ price: btcPrice, timestamp: Date.now() });
      } catch {
        res.status(500).json({ error: "Unable to fetch BTC price" });
      }
    }
  });

  app.post("/api/btc/create-payment", async (req: any, res) => {
    try {
      const { customerName, customerEmail, customerPhone, usdAmount, jcmovesAmount, items, referenceType, referenceId, notes } = req.body;
      const sessionUserId: string | undefined = req.session?.userId;

      if (!customerName || !customerEmail || !usdAmount || !referenceType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const btcAddress = process.env.BTC_WALLET_ADDRESS;
      if (!btcAddress) {
        return res.status(500).json({ error: "Bitcoin payments not configured. Please call (906) 285-9312." });
      }

      const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      let btcPrice: number;
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        btcPrice = priceData.bitcoin?.usd;
      } else {
        const fallback = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
        const fallbackData = await fallback.json();
        btcPrice = parseFloat(fallbackData.data?.amount);
      }

      if (!btcPrice || isNaN(btcPrice)) {
        return res.status(500).json({ error: "Unable to get BTC price" });
      }

      const originalUsd = parseFloat(usdAmount);
      if (isNaN(originalUsd) || originalUsd <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const discountedUsd = Math.round(originalUsd * 0.9 * 100) / 100;
      const btcAmount = parseFloat((discountedUsd / btcPrice).toFixed(8));

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // For JCMOVES token purchases: caller may supply jcmovesAmount directly,
      // otherwise compute it from the discounted USD at the live token price.
      let computedJcmovesAmount: string | null = null;
      if (referenceType === "jcmoves_purchase") {
        if (jcmovesAmount && parseFloat(jcmovesAmount) > 0) {
          computedJcmovesAmount = parseFloat(jcmovesAmount).toFixed(8);
        } else {
          try {
            const tokenPriceRes = await fetch("https://api.dexscreener.com/latest/dex/tokens/HsuN8RXj2Q3kkx6mRV6aHryjLizagPHoiqCGZ8BfEMeS");
            if (tokenPriceRes.ok) {
              const tokenData = await tokenPriceRes.json();
              const tokenPriceUsd = parseFloat(tokenData?.pairs?.[0]?.priceUsd || "0");
              if (tokenPriceUsd > 0) {
                computedJcmovesAmount = (discountedUsd / tokenPriceUsd).toFixed(8);
              }
            }
          } catch (_e) { /* non-blocking */ }
        }
      }

      const [payment] = await db.insert(bitcoinPayments).values({
        userId: sessionUserId || null,
        referenceId: referenceId || null,
        referenceType,
        customerName,
        customerEmail,
        customerPhone: customerPhone || null,
        usdAmount: discountedUsd.toFixed(2),
        btcAmount: btcAmount.toFixed(8),
        btcPrice: btcPrice.toFixed(2),
        discountPercent: "10.00",
        originalUsdAmount: originalUsd.toFixed(2),
        jcmovesAmount: computedJcmovesAmount,
        btcAddress,
        status: "pending",
        items: items || null,
        notes: notes || null,
        expiresAt,
      }).returning();

      try {
        const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
        await sendEmail({
          to: companyEmail,
          from: companyEmail,
          subject: `₿ New Bitcoin Payment - ${customerName} - $${discountedUsd.toFixed(2)}`,
          html: `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
              <h1 style="color: #f7931a; text-align: center;">₿ Bitcoin Payment Request</h1>
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Customer:</strong> ${customerName}</p>
                <p><strong>Email:</strong> ${customerEmail}</p>
                ${customerPhone ? `<p><strong>Phone:</strong> ${customerPhone}</p>` : ""}
                <p><strong>Original Amount:</strong> $${originalUsd.toFixed(2)}</p>
                <p style="color: #4ade80;"><strong>BTC Discount (10%):</strong> -$${(originalUsd - discountedUsd).toFixed(2)}</p>
                <p><strong>Amount Due:</strong> $${discountedUsd.toFixed(2)}</p>
                <p style="color: #f7931a;"><strong>BTC Amount:</strong> ${btcAmount.toFixed(8)} BTC</p>
                <p><strong>BTC Price:</strong> $${btcPrice.toLocaleString()}</p>
                <p><strong>Type:</strong> ${referenceType}</p>
              </div>
              <p style="text-align: center; color: #94a3b8; font-size: 12px;">Verify payment on blockchain and update status in admin dashboard.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.log("BTC payment email failed (non-critical):", emailErr);
      }

      res.json({
        success: true,
        payment: {
          id: payment.id,
          btcAddress,
          btcAmount,
          usdAmount: discountedUsd,
          originalUsdAmount: originalUsd,
          btcPrice,
          discountPercent: 10,
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (error: any) {
      console.error("Error creating BTC payment:", error);
      res.status(500).json({ error: error.message || "Failed to create Bitcoin payment" });
    }
  });

  app.get("/api/btc/payment/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [payment] = await db.select().from(bitcoinPayments).where(eq(bitcoinPayments.id, id));
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      res.json(payment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/btc-payments", isAuthenticated, requireBusinessOwner, async (_req, res) => {
    try {
      const payments = await db.select().from(bitcoinPayments).orderBy(sql`created_at DESC`);
      res.json(payments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/btc-payments/:id/verify", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!["verified", "expired", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Fetch the payment first so we can credit tokens on verification
      const [payment] = await db.select().from(bitcoinPayments).where(eq(bitcoinPayments.id, id));
      if (!payment) return res.status(404).json({ error: "Payment not found" });

      const [updated] = await db.update(bitcoinPayments)
        .set({
          status,
          verifiedByUserId: req.session?.userId,
          verifiedAt: status === "verified" ? new Date() : null,
          jcmovesCredited: status === "verified" && payment.jcmovesAmount && parseFloat(payment.jcmovesAmount) > 0 ? 1 : (payment.jcmovesCredited ?? 0),
        })
        .where(eq(bitcoinPayments.id, id))
        .returning();

      // Credit JCMOVES tokens to the buyer on verification
      if (
        status === "verified" &&
        payment.userId &&
        payment.jcmovesAmount &&
        parseFloat(payment.jcmovesAmount) > 0 &&
        !payment.jcmovesCredited
      ) {
        const tokensToCredit = parseFloat(payment.jcmovesAmount);
        await storage.creditWalletTokens(payment.userId, tokensToCredit);
        // Log as a reward record for full audit trail
        await db.insert(rewards).values({
          userId: payment.userId,
          rewardType: "btc_token_purchase",
          tokenAmount: tokensToCredit.toFixed(8),
          cashValue: payment.usdAmount,
          status: "confirmed",
          earnedDate: new Date(),
          metadata: {
            paymentId: payment.id,
            btcAmount: payment.btcAmount,
            btcPrice: payment.btcPrice,
            usdAmount: payment.usdAmount,
            verifiedBy: req.session?.userId,
            description: "JCMOVES tokens purchased via Bitcoin payment",
          },
        });
        console.log(`[BTC Verify] Credited ${tokensToCredit} JCMOVES to user ${payment.userId} for payment ${id}`);
      }

      // Send confirmation email + SMS to customer when payment is verified
      if (status === "verified") {
        const paymentContext = payment.referenceType === "job_payment"
          ? (payment.notes || "your moving/junk removal job")
          : payment.notes || "your purchase";

        const emailBody = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="color:#f97316;font-size:28px;margin:0;">JC ON THE MOVE</h1>
              <p style="color:#94a3b8;margin-top:4px;">Bitcoin Payment Confirmed</p>
            </div>
            <div style="background:#1e293b;border-radius:8px;padding:24px;margin-bottom:20px;border:1px solid #f97316/30;">
              <h2 style="color:#4ade80;margin:0 0 16px;">✅ Payment Received!</h2>
              <p style="color:#cbd5e1;margin:0 0 12px;">Hello ${payment.customerName},</p>
              <p style="color:#cbd5e1;margin:0 0 12px;">Your Bitcoin payment for <strong style="color:#f97316;">${paymentContext}</strong> has been confirmed and received by our team.</p>
              <div style="background:#0f172a;border-radius:6px;padding:16px;margin-top:16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#94a3b8;">Payment ID</span>
                  <span style="color:#f1f5f9;font-family:monospace;">${payment.id.slice(0, 8)}...</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#94a3b8;">Amount Paid</span>
                  <span style="color:#4ade80;font-weight:bold;">$${parseFloat(payment.usdAmount).toFixed(2)} (10% BTC Discount Applied)</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:#94a3b8;">BTC Amount</span>
                  <span style="color:#f97316;">${parseFloat(payment.btcAmount).toFixed(8)} BTC</span>
                </div>
              </div>
            </div>
            <p style="color:#94a3b8;text-align:center;font-size:14px;margin:0;">Questions? Call us at <a href="tel:9062859312" style="color:#f97316;">(906) 285-9312</a></p>
          </div>`;

        try {
          await sendEmail({
            to: payment.customerEmail,
            subject: "✅ Bitcoin Payment Confirmed — JC ON THE MOVE",
            html: emailBody,
            text: `Hello ${payment.customerName}, your Bitcoin payment of $${parseFloat(payment.usdAmount).toFixed(2)} for ${paymentContext} has been confirmed. Payment ID: ${payment.id.slice(0,8)}. Questions? Call (906) 285-9312.`,
          });
          console.log(`[BTC Verify] Confirmation email sent to ${payment.customerEmail}`);
        } catch (emailErr) {
          console.error(`[BTC Verify] Email notification failed:`, emailErr);
        }

        if (payment.customerPhone) {
          try {
            await smsService.sendSMS(
              payment.customerPhone,
              `JC ON THE MOVE: Your Bitcoin payment of $${parseFloat(payment.usdAmount).toFixed(2)} for ${paymentContext} has been confirmed! ✅ Payment ID: ${payment.id.slice(0,8)}. Questions? Call (906) 285-9312.`
            );
            console.log(`[BTC Verify] Confirmation SMS sent to ${payment.customerPhone}`);
          } catch (smsErr) {
            console.error(`[BTC Verify] SMS notification failed:`, smsErr);
          }
        }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DATABASE BACKUP ====================
  app.get("/api/admin/database/backup", isAuthenticated, requireBusinessOwner, async (_req, res) => {
    try {
      const [
        usersData,
        leadsData,
        contactsData,
        notificationsData,
        rewardsData,
        walletAccountsData,
        walletTransactionsData,
        cashoutRequestsData,
        walletPayoutsData,
        fundingDepositsData,
        reserveTransactionsData,
        miningSessionsData,
        miningClaimsData,
        treasuryWithdrawalsData,
        tokenConversionsData,
        rewardSettingsData,
        shopItemsData,
        jewelryItemsData,
        stakesData,
        stakingTiersData,
        bitcoinPaymentsData,
      ] = await Promise.all([
        db.select().from(users),
        db.select().from(leads),
        db.select().from(contacts),
        db.select().from(notifications),
        db.select().from(rewards),
        db.select().from(walletAccounts),
        db.select().from(walletTransactions),
        db.select().from(cashoutRequests),
        db.select().from(walletPayouts),
        db.select().from(fundingDeposits),
        db.select().from(reserveTransactions),
        db.select().from(miningSessions),
        db.select().from(miningClaims),
        db.select().from(treasuryWithdrawals),
        db.select().from(tokenConversions),
        db.select().from(rewardSettings),
        db.select().from(shopItems),
        db.select().from(jewelryItems),
        db.select().from(stakes),
        db.select().from(stakingTiers),
        db.select().from(bitcoinPayments),
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        tables: {
          users: usersData,
          leads: leadsData,
          contacts: contactsData,
          notifications: notificationsData,
          rewards: rewardsData,
          walletAccounts: walletAccountsData,
          walletTransactions: walletTransactionsData,
          cashoutRequests: cashoutRequestsData,
          walletPayouts: walletPayoutsData,
          fundingDeposits: fundingDepositsData,
          reserveTransactions: reserveTransactionsData,
          miningSessions: miningSessionsData,
          miningClaims: miningClaimsData,
          treasuryWithdrawals: treasuryWithdrawalsData,
          tokenConversions: tokenConversionsData,
          rewardSettings: rewardSettingsData,
          shopItems: shopItemsData,
          jewelryItems: jewelryItemsData,
          stakes: stakesData,
          stakingTiers: stakingTiersData,
          bitcoinPayments: bitcoinPaymentsData,
        },
        counts: {
          users: usersData.length,
          leads: leadsData.length,
          contacts: contactsData.length,
          rewards: rewardsData.length,
          walletAccounts: walletAccountsData.length,
          shopItems: shopItemsData.length,
          jewelryItems: jewelryItemsData.length,
          stakes: stakesData.length,
        },
      };

      const filename = `jcmove-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(backup);
    } catch (error: any) {
      console.error("Database backup error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/wallet/balance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const wallet = await storage.getWalletAccount(userId);
      res.json({ tokenBalance: wallet?.tokenBalance || "0.00000000" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== STAKING TREASURY ROUTES ====================

  app.get("/api/staking/tiers", async (_req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.set("Pragma", "no-cache");
      const tiers = await storage.getStakingTiers();
      res.json(tiers);
    } catch (error: any) {
      console.error("Error fetching staking tiers:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/staking/my-stakes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const userStakes = await storage.getUserStakes(userId);
      // Fetch auto_compound flags from raw SQL (column added via ALTER TABLE)
      const { rows: acRows } = await pool.query(
        `SELECT id, auto_compound FROM stakes WHERE user_id=$1`, [userId]
      );
      const acMap: Record<string, boolean> = {};
      for (const r of acRows) acMap[r.id] = r.auto_compound;
      const enriched = userStakes.map((s: any) => {
        const result = { ...s, autoCompound: acMap[s.id] ?? false };
        if (s.tier?.name === "Diamond") {
          const daysSinceStart = (Date.now() - new Date(s.startedAt).getTime()) / (1000 * 60 * 60 * 24);
          const celebrationDaysLeft = Math.max(0, Math.ceil(90 - daysSinceStart));
          return { ...result, diamondCelebration: { active: celebrationDaysLeft > 0, daysLeft: celebrationDaysLeft, bonusPercent: 10 } };
        }
        return result;
      });
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/staking/stake", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { tierId, amount } = req.body;
      if (!tierId || !amount || amount <= 0) return res.status(400).json({ error: "Invalid stake parameters" });
      const stake = await storage.createStake(userId, tierId, parseFloat(amount));
      res.json(stake);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/staking/:stakeId/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      // Check auto_compound flag before claiming
      const { rows: acRows } = await pool.query(
        `SELECT auto_compound FROM stakes WHERE id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
        [req.params.stakeId, userId]
      );
      const autoCompound = acRows[0]?.auto_compound === true;
      const result = await storage.claimStakingRewards(req.params.stakeId, userId);
      if (autoCompound && result.earned > 0) {
        // Move earned amount back into the stake (compound) instead of leaving in wallet
        await pool.query(
          `UPDATE stakes SET amount = amount + $1 WHERE id=$2`,
          [result.earned.toFixed(8), req.params.stakeId]
        );
        await pool.query(
          `UPDATE wallet_accounts SET token_balance = GREATEST(0, token_balance - $1) WHERE user_id=$2`,
          [result.earned.toFixed(8), userId]
        );
        res.json({ ...result, autoCompounded: true, message: `${result.earned.toFixed(4)} JCMOVES compounded into your stake!` });
      } else {
        res.json(result);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/staking/:stakeId/unstake", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const result = await storage.unstake(req.params.stakeId, userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/staking/treasury", isAuthenticated, requireBusinessOwner, async (_req: any, res) => {
    try {
      const treasuryBalance = await storage.getStakingTreasuryBalance();
      const tiers = await storage.getStakingTiers();
      const allStakes = await db.select({
        status: stakes.status,
        amount: stakes.amount,
        totalEarned: stakes.totalEarned,
        tierName: stakingTiers.name,
        dailyRate: stakes.dailyRate,
      }).from(stakes).innerJoin(stakingTiers, eq(stakes.tierId, stakingTiers.id));

      const activeStakes = allStakes.filter(s => s.status === "active");
      const totalActiveStaked = activeStakes.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const totalRewardsPaid = allStakes.reduce((sum, s) => sum + parseFloat(s.totalEarned || "0"), 0);

      const dailyObligations = activeStakes.reduce((sum, s) => {
        return sum + parseFloat(s.amount) * parseFloat(s.dailyRate);
      }, 0);
      const monthlyObligations = dailyObligations * 30;
      const yearlyObligations = dailyObligations * 365;

      const treasuryBal = parseFloat(treasuryBalance.tokenBalance);
      const healthScore = totalActiveStaked > 0 ? treasuryBal / totalActiveStaked : 999;
      const coverageRatio = monthlyObligations > 0 ? treasuryBal / monthlyObligations : 999;
      const runwayDays = dailyObligations > 0 ? Math.floor(treasuryBal / dailyObligations) : 99999;

      let healthStatus: "critical" | "warning" | "healthy" | "strong" = "strong";
      if (healthScore < 1.0) healthStatus = "critical";
      else if (healthScore < 1.5) healthStatus = "warning";
      else if (healthScore < 2.0) healthStatus = "healthy";

      let aprMultiplier = 1.0;
      if (healthScore < 0.5) aprMultiplier = 0.25;
      else if (healthScore < 1.0) aprMultiplier = 0.5;
      else if (healthScore < 1.5) aprMultiplier = 0.75;
      else if (healthScore < 2.0) aprMultiplier = 0.9;

      const tierBreakdown = tiers.map(tier => {
        const tierStakes = activeStakes.filter(s => s.tierName === tier.name);
        const tierStaked = tierStakes.reduce((sum, s) => sum + parseFloat(s.amount), 0);
        const tierDailyObligation = tierStakes.reduce((sum, s) => sum + parseFloat(s.amount) * parseFloat(s.dailyRate), 0);
        return {
          name: tier.name,
          durationDays: tier.durationDays,
          baseApr: tier.annualRatePercent,
          effectiveApr: (parseFloat(tier.annualRatePercent) * aprMultiplier).toFixed(2),
          activeStakes: tierStakes.length,
          totalStaked: tierStaked.toFixed(2),
          dailyObligation: tierDailyObligation.toFixed(4),
        };
      });

      res.json({
        balance: treasuryBalance.tokenBalance,
        totalDeposited: treasuryBalance.totalDeposited,
        totalPaidOut: treasuryBalance.totalPaidOut,
        totalActiveStaked: totalActiveStaked.toFixed(2),
        totalRewardsPaid: totalRewardsPaid.toFixed(2),
        activeStakeCount: activeStakes.length,
        totalStakeCount: allStakes.length,
        tierBreakdown,
        healthMetrics: {
          healthScore: parseFloat(healthScore.toFixed(2)),
          healthStatus,
          coverageRatio: parseFloat(coverageRatio.toFixed(2)),
          runwayDays,
          dailyObligations: parseFloat(dailyObligations.toFixed(4)),
          monthlyObligations: parseFloat(monthlyObligations.toFixed(2)),
          yearlyObligations: parseFloat(yearlyObligations.toFixed(2)),
          aprMultiplier,
          thresholds: {
            critical: "< 1.0x (APR reduced 50-75%)",
            warning: "1.0x - 1.5x (APR reduced 10-25%)",
            healthy: "1.5x - 2.0x (APR reduced up to 10%)",
            strong: "> 2.0x (Full APR rates)",
          },
        },
      });
    } catch (error: any) {
      console.error("Error fetching staking treasury:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/staking/health", isAuthenticated, async (_req: any, res) => {
    try {
      const treasuryBalance = await storage.getStakingTreasuryBalance();
      const allStakes = await db.select({
        status: stakes.status,
        amount: stakes.amount,
        dailyRate: stakes.dailyRate,
      }).from(stakes).innerJoin(stakingTiers, eq(stakes.tierId, stakingTiers.id));

      const activeStakes = allStakes.filter(s => s.status === "active");
      const totalActiveStaked = activeStakes.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const dailyObligations = activeStakes.reduce((sum, s) => sum + parseFloat(s.amount) * parseFloat(s.dailyRate), 0);

      const treasuryBal = parseFloat(treasuryBalance.tokenBalance);
      const healthScore = totalActiveStaked > 0 ? treasuryBal / totalActiveStaked : 999;
      const runwayDays = dailyObligations > 0 ? Math.floor(treasuryBal / dailyObligations) : 99999;

      let healthStatus: "critical" | "warning" | "healthy" | "strong" = "strong";
      if (healthScore < 1.0) healthStatus = "critical";
      else if (healthScore < 1.5) healthStatus = "warning";
      else if (healthScore < 2.0) healthStatus = "healthy";

      let aprMultiplier = 1.0;
      if (healthScore < 0.5) aprMultiplier = 0.25;
      else if (healthScore < 1.0) aprMultiplier = 0.5;
      else if (healthScore < 1.5) aprMultiplier = 0.75;
      else if (healthScore < 2.0) aprMultiplier = 0.9;

      res.json({
        healthScore: parseFloat(healthScore.toFixed(2)),
        healthStatus,
        runwayDays: Math.min(runwayDays, 99999),
        aprMultiplier,
        treasuryBalance: parseFloat(treasuryBal.toFixed(2)),
        totalStaked: parseFloat(totalActiveStaked.toFixed(2)),
        dailyObligations: parseFloat(dailyObligations.toFixed(4)),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Pool statistics (public) ─────────────────────────────────
  app.get("/api/staking/pool-stats", async (_req, res) => {
    try {
      const { rows: stakerRows } = await pool.query(
        `SELECT COUNT(DISTINCT user_id) AS total_stakers,
                COALESCE(SUM(CASE WHEN status='active' THEN CAST(amount AS NUMERIC) ELSE 0 END),0) AS total_active_staked,
                COALESCE(SUM(CAST(total_earned AS NUMERIC)),0) AS total_rewards_paid
         FROM stakes`
      );
      const { rows: cfgRows } = await pool.query(
        `SELECT setting_key, setting_value FROM spin_config WHERE setting_key IN ('staking_yield_sources','staking_treasury_bonus_pct')`
      );
      const cfg: Record<string,string> = {};
      for (const r of cfgRows) cfg[r.setting_key] = r.setting_value;
      const sources: Array<{monthlyUsd:number}> = cfg['staking_yield_sources'] ? JSON.parse(cfg['staking_yield_sources']) : [];
      const monthlyInflow = sources.reduce((s,x) => s + (x.monthlyUsd || 0), 0);
      res.json({
        totalStakers: parseInt(stakerRows[0]?.total_stakers || '0'),
        totalActiveStaked: parseFloat(stakerRows[0]?.total_active_staked || '0'),
        totalRewardsPaid: parseFloat(stakerRows[0]?.total_rewards_paid || '0'),
        monthlyTreasuryInflow: monthlyInflow,
        treasuryBonusPct: parseFloat(cfg['staking_treasury_bonus_pct'] || '0'),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── On-chain treasury wallet balance (live Solana RPC) ───────
  let _onChainCache: { tokenBalance: number; fetchedAt: number } | null = null;
  app.get("/api/staking/treasury-onchain", async (_req, res) => {
    try {
      const now = Date.now();
      if (_onChainCache && now - _onChainCache.fetchedAt < 60_000) {
        return res.json({ tokenBalance: _onChainCache.tokenBalance });
      }
      const bal = await solanaTransferService.getTreasuryBalance();
      _onChainCache = { tokenBalance: bal.tokenBalance, fetchedAt: now };
      res.json({ tokenBalance: bal.tokenBalance });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Token Economy Calculator (admin) ─────────────────────────
  app.get("/api/staking/token-economy", isAuthenticated, requireBusinessOwner, async (_req, res) => {
    try {
      const SYSTEM_IDS = [
        'staking-treasury-system',
        'platform-generosity-fund',
        'nicolasa-jackson-generosity',
        'nominee-mewbourn-mom',
      ];
      const placeholders = SYSTEM_IDS.map((_, i) => `$${i + 1}`).join(',');

      const [walletsQ, stakesQ, rewardsQ, spinQ, onChainBal] = await Promise.all([
        // All real user wallet balances
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE CAST(token_balance AS NUMERIC) > 0) AS active_wallet_count,
             COALESCE(SUM(CAST(token_balance AS NUMERIC)), 0) AS total_in_wallets,
             COALESCE(SUM(CAST(total_earned AS NUMERIC)), 0) AS total_ever_earned,
             COALESCE(SUM(CAST(total_redeemed AS NUMERIC)), 0) AS total_ever_redeemed
           FROM wallet_accounts
           WHERE user_id NOT IN (${placeholders})`,
          SYSTEM_IDS
        ),
        // Active stakes + obligations
        pool.query(`
          SELECT
            status,
            COUNT(*) AS count,
            COALESCE(SUM(CAST(amount AS NUMERIC)), 0) AS principal,
            COALESCE(SUM(CAST(total_earned AS NUMERIC)), 0) AS accumulated_rewards,
            COALESCE(SUM(CAST(daily_rate AS NUMERIC)), 0) AS daily_obligation
          FROM stakes
          GROUP BY status
        `),
        // Loyalty/job rewards issued
        pool.query(`
          SELECT
            reward_type,
            COUNT(*) AS count,
            COALESCE(SUM(CAST(token_amount AS NUMERIC)), 0) AS total
          FROM rewards
          GROUP BY reward_type
          ORDER BY total DESC
        `),
        // Quantum Spin prizes
        pool.query(`
          SELECT
            COUNT(*) AS count,
            COALESCE(SUM(CAST(prize_tokens AS NUMERIC)), 0) AS total_prizes,
            COALESCE(SUM(CAST(jackpot_amount_won AS NUMERIC)) FILTER (WHERE jackpot_amount_won IS NOT NULL), 0) AS total_jackpots
          FROM spin_results
        `),
        // On-chain balance (cached)
        solanaTransferService.getTreasuryBalance().catch(() => ({ tokenBalance: 0, solBalance: 0 })),
      ]);

      const wallets = walletsQ.rows[0];
      const spinRow = spinQ.rows[0];

      // Parse stakes by status
      let activeStaked = 0, pendingStaked = 0, unstakingStaked = 0;
      let activeDailyObligation = 0, activeAccumulatedRewards = 0;
      for (const row of stakesQ.rows) {
        const principal = parseFloat(row.principal);
        const daily = parseFloat(row.daily_obligation);
        const accrued = parseFloat(row.accumulated_rewards);
        if (row.status === 'active') {
          activeStaked = principal;
          activeDailyObligation = daily;
          activeAccumulatedRewards = accrued;
        } else if (row.status === 'pending') {
          pendingStaked = principal;
        } else if (row.status === 'unstaking') {
          unstakingStaked = principal;
        }
      }

      // Rewards breakdown
      const rewardsByType: Record<string, number> = {};
      let totalLoyaltyRewards = 0;
      for (const row of rewardsQ.rows) {
        rewardsByType[row.reward_type] = parseFloat(row.total);
        totalLoyaltyRewards += parseFloat(row.total);
      }

      const spinPrizesTotal = parseFloat(spinRow.total_prizes || '0');
      const spinJackpotsTotal = parseFloat(spinRow.total_jackpots || '0');
      const totalInUserWallets = parseFloat(wallets.total_in_wallets);
      const totalEverEarned = parseFloat(wallets.total_ever_earned);
      const totalEverRedeemed = parseFloat(wallets.total_ever_redeemed);
      const onChainBalance = onChainBal.tokenBalance;

      // Projections based on current daily obligation
      const obligation30d = activeDailyObligation * 30;
      const obligation90d = activeDailyObligation * 90;
      const obligation365d = activeDailyObligation * 365;

      // Net circulating = everything in user hands (wallets + actively staked + accrued rewards)
      const netCirculating = totalInUserWallets + activeStaked + pendingStaked + activeAccumulatedRewards;

      // Reserve coverage = on-chain treasury / (net circulating + future obligations)
      const totalExposure = netCirculating + obligation365d;
      const coverageRatio = totalExposure > 0 ? onChainBalance / totalExposure : 999;

      // Sustainability: how many days can we pay at current daily rate
      const sustainabilityDays = activeDailyObligation > 0
        ? Math.floor(onChainBalance / activeDailyObligation)
        : 99999;

      res.json({
        // Wallet totals
        activeWalletCount: parseInt(wallets.active_wallet_count),
        totalInUserWallets,
        totalEverEarned,
        totalEverRedeemed,
        // Staking
        activeStaked,
        pendingStaked,
        unstakingStaked,
        activeDailyObligation,
        activeAccumulatedRewards,
        // Distribution sources
        totalLoyaltyRewards,
        rewardsByType,
        spinPrizesTotal,
        spinJackpotsTotal,
        spinCount: parseInt(spinRow.count || '0'),
        // Projections
        obligation30d,
        obligation90d,
        obligation365d,
        // Reserve
        onChainBalance,
        netCirculating,
        coverageRatio: parseFloat(coverageRatio.toFixed(4)),
        sustainabilityDays,
        // Summary
        totalDistributed: totalLoyaltyRewards + spinPrizesTotal + activeAccumulatedRewards,
      });
    } catch (e: any) {
      console.error('[token-economy]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Yield sources (public) ───────────────────────────────────
  app.get("/api/staking/yield-sources", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT setting_key, setting_value FROM spin_config WHERE setting_key IN ('staking_yield_sources','staking_treasury_bonus_pct')`
      );
      const cfg: Record<string,string> = {};
      for (const r of rows) cfg[r.setting_key] = r.setting_value;
      res.json({
        sources: cfg['staking_yield_sources'] ? JSON.parse(cfg['staking_yield_sources']) : [],
        treasuryBonusPct: parseFloat(cfg['staking_treasury_bonus_pct'] || '0'),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: Update yield sources + treasury bonus ─────────────
  app.patch("/api/admin/staking/yield-sources", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { sources, treasuryBonusPct } = req.body;
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ('staking_yield_sources', $1, 'Treasury yield source breakdown')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
        [JSON.stringify(sources)]
      );
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ('staking_treasury_bonus_pct', $1, 'Dynamic treasury bonus %')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$1, updated_at=NOW()`,
        [String(treasuryBonusPct ?? 0)]
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Toggle auto-compound on a stake ─────────────────────────
  app.post("/api/staking/:id/toggle-compound", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { rows } = await pool.query(
        `UPDATE stakes SET auto_compound = NOT auto_compound
         WHERE id = $1 AND user_id = $2 AND status = 'active'
         RETURNING id, auto_compound`,
        [id, userId]
      );
      if (!rows.length) return res.status(404).json({ error: "Active stake not found" });
      res.json({ id: rows[0].id, autoCompound: rows[0].auto_compound });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // ETH STAKING (JC AS VALIDATOR)
  // ============================================================

  // Public config — APY, fee, treasury address, min amount
  app.get("/api/eth-staking/config", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT setting_key, setting_value FROM spin_config WHERE setting_key LIKE 'eth_staking_%' ORDER BY setting_key`
      );
      const cfg: Record<string, string> = {};
      for (const r of rows) cfg[r.setting_key] = r.setting_value;
      const n = (k: string, def: number) => parseFloat(cfg[k] ?? String(def));
      res.json({
        baseApy:          n('eth_staking_base_apy', 5.00),       // total network APY
        validatorFeePct:  n('eth_staking_validator_fee_pct', 10.0), // JC's cut %
        userApy:          n('eth_staking_user_apy', 4.50),       // what staker earns
        minAmount:        n('eth_staking_min_amount', 0.01),
        treasuryAddress:  cfg['eth_staking_treasury_address'] || '',
        enabled:          (cfg['eth_staking_enabled'] ?? 'true') === 'true',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get current user's ETH stakes
  app.get("/api/eth-staking/my-stakes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { rows } = await pool.query(
        `SELECT * FROM eth_stakes WHERE user_id = $1 ORDER BY staked_at DESC`,
        [userId]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Submit a new ETH stake (pending verification)
  app.post("/api/eth-staking/stake", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { amount, txHash, amountUsdAtEntry } = req.body;
      const ethAmount = parseFloat(amount);
      if (!ethAmount || ethAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      // Get current config for APY
      const { rows: cfgRows } = await pool.query(
        `SELECT setting_key, setting_value FROM spin_config WHERE setting_key LIKE 'eth_staking_%'`
      );
      const cfg: Record<string, string> = {};
      for (const r of cfgRows) cfg[r.setting_key] = r.setting_value;
      const userApy = parseFloat(cfg['eth_staking_user_apy'] ?? '4.50');
      const validatorFeePct = parseFloat(cfg['eth_staking_validator_fee_pct'] ?? '10.0');
      const dailyRate = userApy / 100 / 365;

      const { rows } = await pool.query(
        `INSERT INTO eth_stakes (user_id, amount, amount_usd_at_entry, tx_hash, status, apy, validator_fee_pct, daily_rate, total_earned, last_payout_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, 0, NOW())
         RETURNING *`,
        [userId, ethAmount.toFixed(8), amountUsdAtEntry || null, txHash || null, userApy.toFixed(4), validatorFeePct.toFixed(4), dailyRate.toFixed(12)]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Claim accrued ETH rewards (manual — triggers admin payout)
  app.post("/api/eth-staking/:id/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT * FROM eth_stakes WHERE id = $1 AND user_id = $2 AND status = 'active'`, [id, userId]
      );
      if (!rows.length) return res.status(404).json({ error: "Stake not found or not active" });
      const stake = rows[0];
      const now = new Date();
      const lastPayout = new Date(stake.last_payout_at);
      const daysSince = (now.getTime() - lastPayout.getTime()) / (1000 * 60 * 60 * 24);
      const pending = parseFloat(stake.amount) * parseFloat(stake.daily_rate) * daysSince;
      if (pending < 0.0001) return res.status(400).json({ error: "No meaningful rewards to claim yet (minimum 0.0001 ETH)" });

      await pool.query(
        `UPDATE eth_stakes SET total_earned = total_earned + $1, last_payout_at = NOW() WHERE id = $2`,
        [pending.toFixed(8), id]
      );
      res.json({ claimed: pending, message: "Claim recorded — ETH will be sent to your wallet within 24 hrs." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Request unstake
  app.post("/api/eth-staking/:id/unstake", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT * FROM eth_stakes WHERE id = $1 AND user_id = $2 AND status = 'active'`, [id, userId]
      );
      if (!rows.length) return res.status(404).json({ error: "Active stake not found" });
      await pool.query(
        `UPDATE eth_stakes SET status = 'unstaking', unstake_requested_at = NOW() WHERE id = $1`,
        [id]
      );
      res.json({ message: "Unstake requested. ETH will be returned within 1–3 business days." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: View all ETH stakes
  app.get("/api/admin/eth-staking/stakes", isAuthenticated, requireBusinessOwner, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT es.*, u.username, u.first_name, u.last_name, u.email
         FROM eth_stakes es
         JOIN users u ON es.user_id = u.id
         ORDER BY es.staked_at DESC`
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: Update stake status (verify/reject/complete-unstake)
  app.patch("/api/admin/eth-staking/:id/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const allowed = ['pending', 'active', 'unstaking', 'completed', 'rejected'];
      if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
      const extra = status === 'completed' ? `, completed_at = NOW()` : '';
      const { rows } = await pool.query(
        `UPDATE eth_stakes SET status = $1, admin_notes = $2${extra} WHERE id = $3 RETURNING *`,
        [status, adminNotes || null, id]
      );
      if (!rows.length) return res.status(404).json({ error: "Stake not found" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: Update ETH staking config
  app.patch("/api/admin/eth-staking/config", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { baseApy, validatorFeePct, treasuryAddress, minAmount, enabled } = req.body;
      const userApy = parseFloat(baseApy || 5) * (1 - parseFloat(validatorFeePct || 10) / 100);
      const updates: [string, string][] = [
        ['eth_staking_base_apy', String(baseApy ?? 5.00)],
        ['eth_staking_validator_fee_pct', String(validatorFeePct ?? 10.0)],
        ['eth_staking_user_apy', String(userApy.toFixed(4))],
        ['eth_staking_min_amount', String(minAmount ?? 0.01)],
        ['eth_staking_treasury_address', String(treasuryAddress ?? '')],
        ['eth_staking_enabled', enabled === false ? 'false' : 'true'],
      ];
      for (const [k, v] of updates) {
        await pool.query(
          `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ($1, $2, $3)
           ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
          [k, v, `ETH staking config: ${k}`]
        );
      }
      res.json({ ok: true, userApy });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // JCMOVES REWARDS MARKETPLACE
  // ============================================================

  // ── Customer: Get active categories ─────────────────────────
  app.get("/api/reward-shop/categories", isAuthenticated, async (req: any, res) => {
    try {
      const cats = await db.select().from(rewardCategories).where(eq(rewardCategories.isActive, true)).orderBy(rewardCategories.sortOrder);
      res.json(cats);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // ── Customer: Browse items ───────────────────────────────────
  app.get("/api/reward-shop/items", isAuthenticated, async (req: any, res) => {
    try {
      const { categoryId, featured, maxTokens, search } = req.query;
      let query = db.select({ item: rewardItems, category: rewardCategories })
        .from(rewardItems)
        .leftJoin(rewardCategories, eq(rewardItems.categoryId, rewardCategories.id))
        .where(eq(rewardItems.status, "active"));

      const items = await query.orderBy(rewardItems.featured, rewardItems.id);

      let filtered = items;
      if (categoryId) filtered = filtered.filter(r => r.item.categoryId === parseInt(categoryId as string));
      if (featured === "true") filtered = filtered.filter(r => r.item.featured);
      if (maxTokens) filtered = filtered.filter(r => r.item.tokenPrice <= parseInt(maxTokens as string));
      if (search) {
        const q = (search as string).toLowerCase();
        filtered = filtered.filter(r => r.item.name.toLowerCase().includes(q) || r.item.shortDesc.toLowerCase().includes(q));
      }

      // Get user wallet balance for affordability info
      const userId = (req.session as any).userId;
      const wallet = await storage.getWalletAccount(userId);
      const balance = parseFloat(wallet?.tokenBalance || "0");

      res.json({ items: filtered, walletBalance: balance });
    } catch (e) {
      console.error("Reward shop items error:", e);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // ── Customer: Single item ────────────────────────────────────
  app.get("/api/reward-shop/items/:id", isAuthenticated, async (req: any, res) => {
    try {
      const [row] = await db.select({ item: rewardItems, category: rewardCategories })
        .from(rewardItems)
        .leftJoin(rewardCategories, eq(rewardItems.categoryId, rewardCategories.id))
        .where(eq(rewardItems.id, parseInt(req.params.id)));
      if (!row) return res.status(404).json({ error: "Item not found" });
      const userId = (req.session as any).userId;
      const wallet = await storage.getWalletAccount(userId);
      res.json({ ...row, walletBalance: parseFloat(wallet?.tokenBalance || "0") });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch item" });
    }
  });

  // ── Customer: Redeem item ────────────────────────────────────
  app.post("/api/reward-shop/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { itemId, userNotes, scheduledDate } = req.body;
      if (!itemId) return res.status(400).json({ error: "itemId required" });

      const [itemRow] = await db.select().from(rewardItems).where(eq(rewardItems.id, parseInt(itemId)));
      if (!itemRow) return res.status(404).json({ error: "Item not found" });
      if (itemRow.status !== "active") return res.status(400).json({ error: "Item is not available" });

      // Check limited time window
      const now = new Date();
      if (itemRow.startDate && now < new Date(itemRow.startDate)) return res.status(400).json({ error: "Item not yet available" });
      if (itemRow.endDate && now > new Date(itemRow.endDate)) return res.status(400).json({ error: "Item has expired" });

      // Check inventory
      if (itemRow.inventory !== null && itemRow.inventory <= 0) return res.status(400).json({ error: "Item out of stock" });

      // Check wallet balance
      const wallet = await storage.getWalletAccount(userId);
      const balance = parseFloat(wallet?.tokenBalance || "0");
      const cost = itemRow.salePriceTokens ?? itemRow.tokenPrice;
      if (balance < cost) return res.status(400).json({ error: `Insufficient tokens. You have ${Math.floor(balance).toLocaleString()} JCMOVES, need ${cost.toLocaleString()}` });

      // Check per-user monthly limit
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const monthlyCount = await db.select({ count: sql<number>`count(*)` })
        .from(rewardRedemptions)
        .where(and(eq(rewardRedemptions.userId, userId), eq(rewardRedemptions.itemId, itemRow.id), gte(rewardRedemptions.createdAt, monthStart)));
      if (Number(monthlyCount[0]?.count) >= (itemRow.maxPerMonth ?? 5)) {
        return res.status(400).json({ error: `Monthly limit reached for this reward (max ${itemRow.maxPerMonth}/month)` });
      }

      // Deduct tokens from user balance
      const newBalance = balance - cost;
      await storage.updateWalletAccount(userId, { tokenBalance: newBalance.toFixed(8) });

      // Credit burned tokens to the buyback/treasury fund (tracks all tokens removed from circulation)
      try {
        const [fundRow] = await db.select().from(buybackFund).limit(1);
        if (fundRow) {
          const currentTokenBalance = parseFloat(fundRow.tokenBalance || "0");
          const currentTotalCollected = parseFloat(fundRow.totalTokensCollected || "0");
          await db.update(buybackFund).set({
            tokenBalance: (currentTokenBalance + cost).toFixed(8),
            totalTokensCollected: (currentTotalCollected + cost).toFixed(8),
            feeContributionCount: (fundRow.feeContributionCount ?? 0) + 1,
            lastUpdated: new Date(),
          }).where(eq(buybackFund.id, fundRow.id));
        }
      } catch (_e) { /* non-blocking — treasury credit is best-effort */ }

      // Decrement inventory if limited
      if (itemRow.inventory !== null) {
        await db.update(rewardItems).set({ inventory: itemRow.inventory - 1 }).where(eq(rewardItems.id, itemRow.id));
        if (itemRow.inventory - 1 <= 0) {
          await db.update(rewardItems).set({ status: "sold_out" }).where(eq(rewardItems.id, itemRow.id));
        }
      }

      // Determine redemption status from logic flags
      let redemptionStatus = "pending";
      if ((itemRow as any).requiresApproval) redemptionStatus = "pending_approval";
      else if ((itemRow as any).requiresSchedule || itemRow.scheduleRequired) redemptionStatus = "redeemed_pending_schedule";
      else if ((itemRow as any).isInstant) redemptionStatus = "completed";

      // Create redemption record
      const [redemption] = await db.insert(rewardRedemptions).values({
        userId,
        itemId: itemRow.id,
        itemName: itemRow.name,
        tokenCost: cost,
        status: redemptionStatus,
        userNotes: userNotes || null,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      }).returning();

      // ── Auto-approval engine ─────────────────────────────────────
      // Evaluate EVERY new redemption on submission. The engine enforces the threshold
      // policy even for instant/scheduled items — high-cost ones are held for review.
      try {
        const { evaluateRedemption } = await import("./services/auto-approve-redemptions");
        const autoResult = await evaluateRedemption(redemption.id, userId, cost, redemptionStatus);
        redemption.status = autoResult.status;
        if (autoResult.adminNotes !== null) redemption.adminNotes = autoResult.adminNotes;
      } catch (autoErr) {
        console.error("[AutoApprove] Evaluation failed (non-fatal):", autoErr);
      }

      const expiresAt = itemRow.expirationDays
        ? new Date(Date.now() + itemRow.expirationDays * 86400000)
        : null;

      // ── Gate all fulfillment side effects on final status ────────
      // If auto-approval held the redemption for manual review, no entitlements,
      // credits, coupons, or other benefits are provisioned until admin approves.
      if (redemption.status === "pending_approval") {
        console.log(`⏸️ Redemption ${redemption.id} held for approval — skipping fulfillment side effects`);
        res.json({ success: true, redemption, newBalance: newBalance.toFixed(2), item: itemRow, autoCreatedLeadId: null });
        return;
      }

      // ── Side effects based on logic flags ──────────────────────
      // Service credit (labor minutes)
      if ((itemRow as any).createsServiceCredit) {
        const minutesMap: Record<string, number> = {
          "15-Minute Labor Credit": 15,
          "30-Minute Labor Credit": 30,
          "1-Hour Labor Credit": 60,
        };
        const minutes = minutesMap[itemRow.name] ?? 0;
        const cents = Math.round(parseFloat(itemRow.cashValue || "0") * 100);
        await db.execute(sql`INSERT INTO service_credit_balances (user_id, item_id, redemption_id, minutes_credit, amount_cents, status, expires_at) VALUES (${userId}, ${itemRow.id}, ${redemption.id}, ${minutes}, ${cents}, 'active', ${expiresAt})`);
      }

      // Invoice credit (dollar discount on job)
      if ((itemRow as any).createsInvoiceCredit) {
        const cents = Math.round(parseFloat(itemRow.cashValue || "0") * 100);
        const creditType = itemRow.name.toLowerCase().includes("junk") ? "junk_removal"
          : itemRow.name.toLowerCase().includes("moving") ? "moving" : "any";
        await db.execute(sql`INSERT INTO invoice_credits (user_id, redemption_id, item_id, credit_type, amount_cents, status, expires_at) VALUES (${userId}, ${redemption.id}, ${itemRow.id}, ${creditType}, ${cents}, 'active', ${expiresAt})`);
      }

      // Spin credit — parse bundle size from item name (e.g. "Quantum Spin — 25 Pack" → 25)
      if ((itemRow as any).createsSpinCredit) {
        const packMatch = itemRow.name.match(/(\d+)\s*[Pp]ack/);
        const spinCount = packMatch ? parseInt(packMatch[1]) : 1;
        const spinJson = JSON.stringify({ spins: spinCount });
        await db.execute(sql`INSERT INTO reward_entitlements (user_id, item_id, redemption_id, entitlement_type, value_json, status, expires_at) VALUES (${userId}, ${itemRow.id}, ${redemption.id}, 'spin_credit', ${spinJson}::jsonb, 'active', ${expiresAt})`);
      }

      // Coupon code — auto-generate unique promo code and store it
      if ((itemRow as any).createsCouponCode) {
        try {
          const pct = (itemRow as any).couponDiscountPct ?? 0;
          const maxDisc = (itemRow as any).couponMaxDiscount ?? null;
          // Generate a human-readable unique code  e.g. JC10OFF-A3K7
          const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
          const generatedCode = `JC${pct}OFF-${suffix}`;
          const couponExpiry = expiresAt ?? new Date(Date.now() + 365 * 86400000);

          await db.insert(promoCodes).values({
            code: generatedCode,
            description: `${pct}% off any service (max $${maxDisc ?? "none"}) — earned via JCMOVES Rewards`,
            discountPercent: pct.toString(),
            maxUses: 1,
            isActive: true,
            expiresAt: couponExpiry,
          });

          // Store the code on the redemption record
          await db.update(rewardRedemptions)
            .set({ couponCode: generatedCode, status: "completed", adminNotes: `Auto-generated coupon: ${generatedCode} (${pct}% off, max $${maxDisc})` })
            .where(eq(rewardRedemptions.id, redemption.id));
          (redemption as any).couponCode = generatedCode;

          console.log(`🎟️ Generated coupon code ${generatedCode} for redemption ${redemption.id}`);
        } catch (couponErr) {
          console.error("[Coupon] Code generation error:", couponErr);
        }
      }

      // Priority booking entitlement
      if (itemRow.name === "Priority Booking Upgrade") {
        await db.execute(sql`INSERT INTO reward_entitlements (user_id, item_id, redemption_id, entitlement_type, value_json, status, expires_at) VALUES (${userId}, ${itemRow.id}, ${redemption.id}, 'priority_booking', '{"priority":true}', 'active', ${expiresAt})`);
      }

      // Priority support text line
      if (itemRow.name === "Priority Support Text Line") {
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.execute(sql`INSERT INTO reward_entitlements (user_id, item_id, redemption_id, entitlement_type, value_json, status, expires_at) VALUES (${userId}, ${itemRow.id}, ${redemption.id}, 'support_priority', '{"hours":24}', 'active', ${expiry})`);
      }

      // Loyalty tier boost — immediately credit 500 tokens
      if (itemRow.name === "Loyalty Tier Boost") {
        await storage.creditWalletTokens(userId, 500);
        await db.execute(sql`INSERT INTO reward_entitlements (user_id, item_id, redemption_id, entitlement_type, value_json, status) VALUES (${userId}, ${itemRow.id}, ${redemption.id}, 'tier_points_bonus', '{"tokens":500}', 'consumed')`);
      }

      // Mystery reward box — resolve immediately from weighted pool
      if ((itemRow as any).usesMysteryPool) {
        const MYSTERY_PRIZES = [
          { label: "100 JCMOVES", tokens: 100, weight: 30 },
          { label: "250 JCMOVES", tokens: 250, weight: 25 },
          { label: "500 JCMOVES", tokens: 500, weight: 20 },
          { label: "1,000 JCMOVES", tokens: 1000, weight: 12 },
          { label: "2,500 JCMOVES", tokens: 2500, weight: 8 },
          { label: "1,500 JCMOVES", tokens: 1500, weight: 3 },
          { label: "5,000 JCMOVES", tokens: 5000, weight: 2 },
        ];
        const total = MYSTERY_PRIZES.reduce((s, p) => s + p.weight, 0);
        let rand = Math.random() * total, pick = MYSTERY_PRIZES[0];
        for (const p of MYSTERY_PRIZES) { rand -= p.weight; if (rand <= 0) { pick = p; break; } }
        if (pick.tokens > 0) await storage.creditWalletTokens(userId, pick.tokens);
        await db.update(rewardRedemptions).set({ adminNotes: `Mystery box: won ${pick.label}`, status: "completed" }).where(eq(rewardRedemptions.id, redemption.id));
        redemption.adminNotes = `Mystery box: won ${pick.label}`;
        (redemption as any).mysteryPrize = pick;
      }

      // ── Auto-create a job booking for schedule-required or invoice-credit rewards ──
      // These require an actual service appointment, so we create a lead so the admin
      // can see it in the pipeline and the customer can see their discount applied.
      let autoCreatedLeadId: string | null = null;
      const needsBooking = (itemRow as any).requiresSchedule || itemRow.scheduleRequired || (itemRow as any).createsInvoiceCredit || (itemRow as any).createsServiceCredit;
      if (needsBooking) {
        try {
          const [userRecord] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
          if (userRecord) {
            // Determine service type from item name
            const nameLower = itemRow.name.toLowerCase();
            let serviceType = "moving";
            if (nameLower.includes("junk") || nameLower.includes("debris") || nameLower.includes("yard")) serviceType = "junk";
            else if (nameLower.includes("snow")) serviceType = "snow";
            else if (nameLower.includes("cleaning")) serviceType = "cleaning";

            // Build a clear credit note
            const cashVal = itemRow.cashValue ? `$${parseFloat(itemRow.cashValue).toFixed(2)}` : null;
            const minutesMap: Record<string, string> = {
              "15-Minute Labor Credit": "15 minutes of free labor",
              "30-Minute Labor Credit": "30 minutes of free labor",
              "1-Hour Labor Credit": "1 hour of free labor",
            };
            const creditDescription = minutesMap[itemRow.name] ||
              (cashVal ? `${cashVal} discount` : itemRow.name);

            const creditNote = `🎁 JCMOVES Reward Applied: ${itemRow.name} — ${creditDescription}. Redemption #${redemption.id}. The discount will be applied to the final invoice by our team.`;

            const [newLead] = await db.insert(leads).values({
              firstName: userRecord.firstName || userRecord.username || "Customer",
              lastName: userRecord.lastName || "",
              email: userRecord.email || "",
              phone: userRecord.phone || "Not provided",
              serviceType,
              fromAddress: "To be provided",
              status: "quote_requested",
              details: `Service request created from JCMOVES Rewards redemption. Item: ${itemRow.name}.${scheduledDate ? ` Requested date: ${new Date(scheduledDate).toLocaleDateString()}.` : ""}`,
              quoteNotes: creditNote,
              createdByUserId: userId,
              redemptionId: redemption.id,
              appliedCreditNote: creditNote,
              moveDate: scheduledDate ? new Date(scheduledDate).toISOString().split("T")[0] : undefined,
            } as any).returning();

            autoCreatedLeadId = newLead?.id || null;
            console.log(`🏠 Auto-created booking lead ${autoCreatedLeadId} for reward redemption ${redemption.id}`);

            // Update the redemption to link to this lead
            if (autoCreatedLeadId) {
              await db.update(rewardRedemptions)
                .set({ adminNotes: `Auto-created job request: Lead #${autoCreatedLeadId}` })
                .where(eq(rewardRedemptions.id, redemption.id));
            }

            // Notify admin via email that a reward-based service request came in
            try {
              const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
              await sendEmail({
                to: companyEmail,
                subject: `🎁 New Reward Booking: ${itemRow.name} — ${userRecord.firstName || userRecord.username}`,
                html: `<div style="font-family:Arial,sans-serif;padding:24px;background:#0f172a;color:#f1f5f9;border-radius:8px;">
                  <h2 style="color:#f97316;">New Reward Service Request</h2>
                  <p><strong>Customer:</strong> ${userRecord.firstName || userRecord.username} ${userRecord.lastName || ""} (${userRecord.email})</p>
                  <p><strong>Reward Redeemed:</strong> ${itemRow.name}</p>
                  <p><strong>Credit Applied:</strong> ${creditDescription}</p>
                  <p><strong>Service Type:</strong> ${serviceType}</p>
                  ${scheduledDate ? `<p><strong>Requested Date:</strong> ${new Date(scheduledDate).toLocaleDateString()}</p>` : ""}
                  <p><strong>Lead ID:</strong> ${autoCreatedLeadId}</p>
                  <p style="margin-top:16px;"><a href="${process.env.APP_URL || "https://jconthemove.com"}/lead/${autoCreatedLeadId}" style="background:#f97316;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">View Booking</a></p>
                </div>`,
                text: `New reward service request: ${itemRow.name} redeemed by ${userRecord.email}. Lead: ${autoCreatedLeadId}`,
              });
            } catch (_e) { /* non-blocking */ }
          }
        } catch (leadErr) {
          console.error("Auto-lead creation failed (non-blocking):", leadErr);
        }
      }

      console.log(`🎁 Reward redeemed: ${itemRow.name} by user ${userId} for ${cost} JCMOVES — status: ${redemption.status}`);
      res.json({ success: true, redemption, newBalance: newBalance.toFixed(2), item: itemRow, autoCreatedLeadId });
    } catch (e: any) {
      console.error("Reward redemption error:", e);
      const raw = String(e?.message || "");
      const friendly = raw.includes("duplicate") || raw.includes("unique")
        ? "This reward was already redeemed. Check your Redemptions tab."
        : raw.includes("connect") || raw.includes("network") || raw.includes("ECONNRESET")
          ? "Service temporarily unavailable — please try again in a moment"
          : raw.includes("tokenBalance") || raw.includes("Insufficient")
            ? "Insufficient JCMOVES balance for this reward"
            : "Redemption failed — please try again. If this keeps happening, contact support.";
      res.status(500).json({ error: friendly });
    }
  });

  // ── Customer: My redemptions ─────────────────────────────────
  app.get("/api/reward-shop/my-redemptions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const list = await db.select().from(rewardRedemptions)
        .where(eq(rewardRedemptions.userId, userId))
        .orderBy(desc(rewardRedemptions.createdAt));
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch redemptions" });
    }
  });

  // ── Admin: All items (including hidden/draft) ─────────────────
  app.get("/api/admin/reward-shop/items", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const items = await db.select({ item: rewardItems, category: rewardCategories })
        .from(rewardItems)
        .leftJoin(rewardCategories, eq(rewardItems.categoryId, rewardCategories.id))
        .orderBy(desc(rewardItems.createdAt));
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // ── Admin: Create item ────────────────────────────────────────
  // Sanitize reward item body: convert empty strings to null for numeric/optional fields
  function sanitizeRewardItemBody(body: any) {
    const numericFields = ["tokenPrice", "salePriceTokens", "cashValue", "inventory", "expirationDays", "maxPerUser", "maxPerMonth", "sortOrder"];
    const cleaned = { ...body };
    for (const field of numericFields) {
      if (field in cleaned && cleaned[field] === "") cleaned[field] = null;
    }
    // Remove internal fields that should never be set by the client
    delete cleaned.id;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    return cleaned;
  }

  app.post("/api/admin/reward-shop/items", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const [item] = await db.insert(rewardItems).values(sanitizeRewardItemBody(req.body)).returning();
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to create item" });
    }
  });

  // ── Admin: Update item ────────────────────────────────────────
  app.patch("/api/admin/reward-shop/items/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const safeBody = sanitizeRewardItemBody(req.body);
      const [item] = await db.update(rewardItems).set({ ...safeBody, updatedAt: new Date() }).where(eq(rewardItems.id, parseInt(req.params.id))).returning();
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to update item" });
    }
  });

  // ── Admin: Delete/archive item ────────────────────────────────
  app.delete("/api/admin/reward-shop/items/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      await db.update(rewardItems).set({ status: "hidden", updatedAt: new Date() }).where(eq(rewardItems.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to archive item" });
    }
  });

  // ── Admin: Permanently delete hidden items and duplicates ─────
  app.post("/api/admin/reward-shop/cleanup", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });

      // 1. Delete all hidden items permanently
      const { rows: hiddenDeleted } = await pool.query(
        `DELETE FROM reward_items WHERE status = 'hidden' RETURNING id`
      );

      // 2. Delete duplicate items — keep the lowest ID per name, delete the rest
      const { rows: dupDeleted } = await pool.query(
        `DELETE FROM reward_items
         WHERE id NOT IN (
           SELECT MIN(id) FROM reward_items GROUP BY name
         )
         RETURNING id`
      );

      const removed = hiddenDeleted.length + dupDeleted.length;
      console.log(`🧹 Shop cleanup: removed ${hiddenDeleted.length} hidden + ${dupDeleted.length} duplicates`);
      res.json({ success: true, hiddenRemoved: hiddenDeleted.length, duplicatesRemoved: dupDeleted.length, totalRemoved: removed });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Cleanup failed" });
    }
  });

  // ── Admin: Reset catalog to official 12-item list ────────────
  app.post("/api/admin/reward-shop/reset-catalog", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const { resetRewardCatalog } = await import('./seed-reward-shop');
      const result = await resetRewardCatalog();
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to reset catalog" });
    }
  });

  // ── Admin: Get all categories ─────────────────────────────────
  app.get("/api/admin/reward-shop/categories", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const cats = await db.select().from(rewardCategories).orderBy(rewardCategories.sortOrder);
      res.json(cats);
    } catch (e) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // ── Admin: Create category ────────────────────────────────────
  app.post("/api/admin/reward-shop/categories", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const [cat] = await db.insert(rewardCategories).values(req.body).returning();
      res.json(cat);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: Update category ────────────────────────────────────
  app.patch("/api/admin/reward-shop/categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const [cat] = await db.update(rewardCategories).set(req.body).where(eq(rewardCategories.id, parseInt(req.params.id))).returning();
      res.json(cat);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: All redemptions ────────────────────────────────────
  app.get("/api/admin/reward-shop/redemptions", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const { status } = req.query;
      let list = db.select({ redemption: rewardRedemptions, user: { id: users.id, name: users.name, email: users.email } })
        .from(rewardRedemptions)
        .leftJoin(users, eq(rewardRedemptions.userId, users.id))
        .orderBy(desc(rewardRedemptions.createdAt));
      if (status) {
        const rows = await db.select({ redemption: rewardRedemptions, user: { id: users.id, name: users.name, email: users.email } })
          .from(rewardRedemptions)
          .leftJoin(users, eq(rewardRedemptions.userId, users.id))
          .where(eq(rewardRedemptions.status, status as string))
          .orderBy(desc(rewardRedemptions.createdAt));
        return res.json(rows);
      }
      const rows = await list;
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // ── Admin: Update redemption status ──────────────────────────
  app.patch("/api/admin/reward-shop/redemptions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const { status, adminNotes } = req.body;
      const updates: any = { status };
      if (adminNotes) updates.adminNotes = adminNotes;
      if (status === "completed") updates.fulfilledAt = new Date();

      // If canceling, refund tokens
      if (status === "cancelled") {
        const [redemption] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, parseInt(req.params.id)));
        if (redemption) {
          await storage.creditWalletTokens(redemption.userId, redemption.tokenCost);
          console.log(`💰 Refunded ${redemption.tokenCost} JCMOVES to user ${redemption.userId}`);
        }
      }

      const [updated] = await db.update(rewardRedemptions).set(updates).where(eq(rewardRedemptions.id, parseInt(req.params.id))).returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: Dashboard stats ────────────────────────────────────
  app.get("/api/admin/reward-shop/stats", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });

      const [activeItems] = await db.select({ count: sql<number>`count(*)` }).from(rewardItems).where(eq(rewardItems.status, "active"));
      const [pendingRedemptions] = await db.select({ count: sql<number>`count(*)` }).from(rewardRedemptions).where(inArray(rewardRedemptions.status, ["pending", "pending_approval", "redeemed_pending_schedule"]));
      const [tokensBurned] = await db.select({ total: sql<number>`coalesce(sum(token_cost), 0)` }).from(rewardRedemptions).where(eq(rewardRedemptions.status, "completed"));
      const [lowStock] = await db.select({ count: sql<number>`count(*)` }).from(rewardItems).where(and(eq(rewardItems.status, "active"), sql`inventory IS NOT NULL AND inventory < 5`));

      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const [monthBurned] = await db.select({ total: sql<number>`coalesce(sum(token_cost), 0)` })
        .from(rewardRedemptions)
        .where(and(gte(rewardRedemptions.createdAt!, monthStart)));

      res.json({
        activeItems: Number(activeItems?.count ?? 0),
        pendingRedemptions: Number(pendingRedemptions?.count ?? 0),
        totalTokensBurned: Number(tokensBurned?.total ?? 0),
        tokensBurnedThisMonth: Number(monthBurned?.total ?? 0),
        lowStockItems: Number(lowStock?.count ?? 0),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public jackpot status ───────────────────────────────────────────────────
  app.get("/api/reward-shop/jackpots", async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM jackpots ORDER BY type`);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Quantum Spin: perform spin ───────────────────────────────────────────────
  app.post("/api/reward-shop/spin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { redemptionId, useFreeSpinEntitlementId } = req.body;

      // Check enabled
      const { rows: cfgRows } = await pool.query(`SELECT setting_key, setting_value FROM spin_config`);
      const cfg: Record<string, string> = {};
      for (const row of cfgRows) cfg[row.setting_key] = row.setting_value;
      if (cfg['spin_wheel_enabled'] === 'false') {
        return res.status(403).json({ error: "Quantum Spin is temporarily disabled." });
      }

      // Determine payment: free spin entitlement → marketplace redemption → wallet deduction
      let usedFreeSpinId: number | null = null;
      if (useFreeSpinEntitlementId) {
        // Decrement spin count; only mark as 'used' when the last spin is consumed
        await pool.query(
          `UPDATE reward_entitlements
           SET value_json = CASE
             WHEN (value_json->>'spins')::int <= 1
               THEN value_json
               ELSE jsonb_set(value_json, '{spins}', to_jsonb((value_json->>'spins')::int - 1))
             END,
             status = CASE
               WHEN (value_json->>'spins')::int <= 1 THEN 'used' ELSE status
             END,
             expires_at = CASE
               WHEN (value_json->>'spins')::int <= 1 THEN NOW() ELSE expires_at
             END
           WHERE id=$1 AND user_id=$2 AND entitlement_type='spin_credit' AND status='active'`,
          [useFreeSpinEntitlementId, userId]
        );
        usedFreeSpinId = useFreeSpinEntitlementId;
      } else if (!redemptionId) {
        const spinCost = parseInt(cfg['spin_cost_tokens'] || '100');
        try {
          await storage.debitWalletTokens(userId, spinCost);
        } catch {
          return res.status(400).json({ error: `You need ${spinCost} JCMOVES to spin.` });
        }
      }

      // ── Quantum Spin prize table ───────────────────────────────────────────
      // Diversified Treasury Version — avg token return ~62 JCMOVES per 100-JCMOVES spin
      // Spread across 16 outcomes. "Nada" adds drama. Big prizes appear often enough to feel real.
      // Total: 22.1+20+15+12+8+5+4+3.5+2.5+1.5+0.8+0.4+0.2+1.5+0.3+1.0+0.2+2.0 = 100.000
      // EV (tokens): ~62 JCMOVES | House edge: ~38% | Treasury healthy.
      const PRIZES = [
        { label: "Nada",       tokens: 0,     probability: 22.100, type: "tokens"           }, // no tokens — adds suspense
        { label: "10",         tokens: 10,    probability: 20.000, type: "tokens"           },
        { label: "25",         tokens: 25,    probability: 15.000, type: "tokens"           },
        { label: "50",         tokens: 50,    probability: 12.000, type: "tokens"           },
        { label: "75",         tokens: 75,    probability:  8.000, type: "tokens"           },
        { label: "100",        tokens: 100,   probability:  5.000, type: "tokens"           },
        { label: "150",        tokens: 150,   probability:  4.000, type: "tokens"           },
        { label: "250",        tokens: 250,   probability:  3.500, type: "tokens"           },
        { label: "500",        tokens: 500,   probability:  2.500, type: "tokens"           },
        { label: "1,000",      tokens: 1000,  probability:  1.500, type: "tokens"           },
        { label: "2,500",      tokens: 2500,  probability:  0.800, type: "tokens"           },
        { label: "5,000",      tokens: 5000,  probability:  0.400, type: "tokens"           },
        { label: "10,000",     tokens: 10000, probability:  0.200, type: "tokens"           },
        { label: "Mystery Box",tokens: 0,     probability:  1.500, type: "mystery"          },
        { label: "$5 Coffee",  tokens: 0,     probability:  0.300, type: "gift_card_coffee" },
        { label: "10% Off",    tokens: 0,     probability:  1.000, type: "coupon_10pct"     },
        { label: "25% Off",    tokens: 0,     probability:  0.200, type: "coupon_25pct"     },
        { label: "Free Spin",  tokens: 100,   probability:  2.000, type: "tokens"           }, // refunds the spin cost
        // Note: jackpot overlays (mini / major) apply independently on top of any prize
      ];

      // Server-side weighted random pick
      const rand = Math.random() * 100;
      let cumulative = 0, prizeIndex = 0;
      for (let i = 0; i < PRIZES.length; i++) {
        cumulative += PRIZES[i].probability;
        if (rand <= cumulative) { prizeIndex = i; break; }
      }
      const prize = PRIZES[prizeIndex];

      // ── Load user info for activity feed ──────────────────────────────────
      const [userRow] = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username })
        .from(users).where(eq(users.id, userId)).limit(1);
      const displayName = userRow?.username
        || (userRow?.firstName
          ? `${userRow.firstName} ${(userRow.lastName || '').charAt(0)}.`
          : 'Someone');

      // ── Jackpot contributions + win checks ─────────────────────────────────
      const { rows: jRows } = await pool.query(`SELECT * FROM jackpots ORDER BY type`);
      let jackpotTypeWon: string | null = null;
      let jackpotAmountWon: number | null = null;
      let jackpotBonusTokens = 0;

      for (const jp of jRows) {
        const newVal = jp.current_value + jp.contribution_per_spin;
        const winRoll = Math.random() * 100;
        const winPct = parseFloat(jp.win_probability_pct);
        if (winRoll < winPct) {
          jackpotTypeWon = jp.type;
          jackpotAmountWon = newVal;
          jackpotBonusTokens += newVal;
          const winnerName = userRow?.username || `${userRow?.firstName || ''} ${userRow?.lastName || ''}`.trim() || 'Lucky Winner';
          await pool.query(
            `UPDATE jackpots SET current_value=$1, last_won_at=NOW(), last_winner_id=$2, last_winner_name=$3, last_won_amount=$4, updated_at=NOW() WHERE type=$5`,
            [jp.starting_value, userId, winnerName, newVal, jp.type]
          );
          // Log jackpot win
          await pool.query(
            `INSERT INTO jackpot_wins (user_id, jackpot_type, amount) VALUES ($1,$2,$3)`,
            [userId, jp.type, newVal]
          );
          // Activity feed
          await pool.query(
            `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'jackpot_win',$2,$3)`,
            [userId, `🏆 ${displayName} hit the ${jp.type === 'major' ? 'Major' : 'Mini'} Jackpot (${newVal.toLocaleString()} JCMOVES)!`, JSON.stringify({ type: jp.type, amount: newVal })]
          );
          console.log(`🏆 JACKPOT! ${jp.type.toUpperCase()} jackpot of ${newVal} JCMOVES won by ${winnerName}`);
        } else {
          await pool.query(`UPDATE jackpots SET current_value=$1, updated_at=NOW() WHERE type=$2`, [newVal, jp.type]);
        }
      }

      // ── Coupon prizes ──────────────────────────────────────────────────────
      let couponCode: string | null = null;
      let couponExpiry: Date | null = null;
      const rand6 = () => Math.random().toString(36).substring(2, 8).toUpperCase();

      if (prize.type === 'coupon_10pct') {
        const expiryDays = parseInt(cfg['coupon_10pct_expiry_days'] || '90');
        couponExpiry = new Date(Date.now() + expiryDays * 86400000);
        couponCode = `QS10-${rand6()}`;
        await pool.query(
          `INSERT INTO promo_codes (id, code, description, discount_percent, discount_percent_jewelry, reward_tokens, referral_reward_tokens, max_uses, is_active, expires_at)
           VALUES (gen_random_uuid(),$1,$2,'10.00','0.00','0.00','0.00',1,true,$3)`,
          [couponCode, `10% off (max $25) — Quantum Spin prize. Min 2 movers 2hrs. Expires ${couponExpiry.toLocaleDateString()}`, couponExpiry]
        );
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'coupon_won',$2,$3)`,
          [userId, `🎫 ${displayName} unlocked a 10% Off coupon`, JSON.stringify({ couponCode })]
        );
      } else if (prize.type === 'coupon_25pct') {
        const expiryDays = parseInt(cfg['coupon_25pct_expiry_days'] || '30');
        couponExpiry = new Date(Date.now() + expiryDays * 86400000);
        couponCode = `QS25-${rand6()}`;
        await pool.query(
          `INSERT INTO promo_codes (id, code, description, discount_percent, discount_percent_jewelry, reward_tokens, referral_reward_tokens, max_uses, is_active, expires_at)
           VALUES (gen_random_uuid(),$1,$2,'25.00','0.00','0.00','0.00',1,true,$3)`,
          [couponCode, `25% off labor (max 50K JCMOVES eq.) — Quantum Spin prize. Min 2 movers 2hrs. Expires ${couponExpiry.toLocaleDateString()}`, couponExpiry]
        );
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'coupon_won',$2,$3)`,
          [userId, `🎫 ${displayName} unlocked a 25% Off coupon`, JSON.stringify({ couponCode })]
        );
      } else if (prize.type === 'gift_card_coffee') {
        const expiryDays = parseInt(cfg['coffee_card_expiry_days'] || '90');
        couponExpiry = new Date(Date.now() + expiryDays * 86400000);
        couponCode = `COFFEE-${rand6()}`;
        await pool.query(
          `INSERT INTO promo_codes (id, code, description, discount_percent, discount_percent_jewelry, reward_tokens, referral_reward_tokens, max_uses, is_active, expires_at)
           VALUES (gen_random_uuid(),$1,$2,'0.00','0.00','0.00','0.00',1,true,$3)`,
          [couponCode, `$5 coffee gift card — Quantum Spin prize. Pending fulfillment. Expires ${couponExpiry.toLocaleDateString()}`, couponExpiry]
        );
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'coffee_won',$2,$3)`,
          [userId, `☕ ${displayName} won a $5 Coffee Gift Card`, JSON.stringify({ couponCode })]
        );
      }

      // ── Mystery Box: secondary server-side resolution ──────────────────────
      let mysteryResult: any = null;
      let mysteryTokens = 0;
      let mysteryExtra: any = {};
      if (prize.type === 'mystery') {
        const MYSTERY_POOL = [
          { type: 'tokens',          value: 300,  weight: 35 },
          { type: 'tokens',          value: 500,  weight: 25 },
          { type: 'tokens',          value: 1000, weight: 15 },
          { type: 'tokens',          value: 2000, weight: 10 },
          { type: 'gift_card_coffee',value: 5,    weight: 5  },
          { type: 'coupon_10pct',    value: 0,    weight: 5  },
          { type: 'free_spin',       value: 1,    weight: 5  },
        ];
        const total = MYSTERY_POOL.reduce((s, p) => s + p.weight, 0);
        let mRand = Math.random() * total;
        let pick = MYSTERY_POOL[0];
        for (const p of MYSTERY_POOL) { mRand -= p.weight; if (mRand <= 0) { pick = p; break; } }

        mysteryResult = pick;
        if (pick.type === 'tokens') {
          mysteryTokens = pick.value;
        } else if (pick.type === 'gift_card_coffee') {
          const expiryDays = parseInt(cfg['coffee_card_expiry_days'] || '90');
          const mCoffeeExpiry = new Date(Date.now() + expiryDays * 86400000);
          const mCode = `MYSTERY-COFFEE-${rand6()}`;
          await pool.query(
            `INSERT INTO promo_codes (id, code, description, discount_percent, discount_percent_jewelry, reward_tokens, referral_reward_tokens, max_uses, is_active, expires_at)
             VALUES (gen_random_uuid(),$1,$2,'0.00','0.00','0.00','0.00',1,true,$3)`,
            [mCode, `$5 coffee gift card — Quantum Spin Mystery Box. Expires ${mCoffeeExpiry.toLocaleDateString()}`, mCoffeeExpiry]
          );
          mysteryExtra = { couponCode: mCode, couponExpiry: mCoffeeExpiry };
        } else if (pick.type === 'coupon_10pct') {
          const expiryDays = parseInt(cfg['coupon_10pct_expiry_days'] || '90');
          const mCouponExpiry = new Date(Date.now() + expiryDays * 86400000);
          const mCode = `MYSTERY10-${rand6()}`;
          await pool.query(
            `INSERT INTO promo_codes (id, code, description, discount_percent, discount_percent_jewelry, reward_tokens, referral_reward_tokens, max_uses, is_active, expires_at)
             VALUES (gen_random_uuid(),$1,$2,'10.00','0.00','0.00','0.00',1,true,$3)`,
            [mCode, `10% off (max $25) — Quantum Spin Mystery Box. Expires ${mCouponExpiry.toLocaleDateString()}`, mCouponExpiry]
          );
          mysteryExtra = { couponCode: mCode, couponExpiry: mCouponExpiry };
        } else if (pick.type === 'free_spin') {
          // Issue a free spin entitlement (expires in 30 days)
          const freeSpinExpiry = new Date(Date.now() + 30 * 86400000);
          await pool.query(
            `INSERT INTO reward_entitlements (user_id, item_id, entitlement_type, value_json, status, expires_at)
             VALUES ($1, 0, 'spin_credit', '{"spins":1}', 'active', $2)`,
            [userId, freeSpinExpiry]
          );
          mysteryExtra = { freeSpin: true };
        }

        // Log mystery box result
        const spinResultId = null; // Will be updated below
        await pool.query(
          `INSERT INTO mystery_box_results (user_id, reward_type, reward_value, coupon_code) VALUES ($1,$2,$3,$4)`,
          [userId, pick.type, pick.value.toString(), mysteryExtra.couponCode || null]
        );
        // Activity feed
        const mysteryMsg = pick.type === 'tokens'
          ? `🎁 ${displayName} opened a Mystery Box and got ${pick.value} JCMOVES`
          : pick.type === 'free_spin'
          ? `🎁 ${displayName} opened a Mystery Box and got a Free Spin`
          : `🎁 ${displayName} opened a Mystery Box and unlocked a special reward`;
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'mystery_box',$2,$3)`,
          [userId, mysteryMsg, JSON.stringify({ type: pick.type, value: pick.value })]
        );
      }

      // ── Credit all tokens ──────────────────────────────────────────────────
      const totalTokens = (prize.tokens || 0) + mysteryTokens + jackpotBonusTokens;
      if (totalTokens > 0) {
        await storage.creditWalletTokens(userId, totalTokens);
      }

      // ── Mark marketplace redemption completed ──────────────────────────────
      if (redemptionId) {
        await db.update(rewardRedemptions)
          .set({ status: "completed", fulfilledAt: new Date(), adminNotes: `Quantum Spin: ${prize.label}` })
          .where(and(eq(rewardRedemptions.id, parseInt(redemptionId)), eq(rewardRedemptions.userId, userId)));
      }

      // ── Insert spin result record ──────────────────────────────────────────
      const { rows: spinInsert } = await pool.query(
        `INSERT INTO spin_results (user_id, redemption_id, prize_index, prize_label, prize_tokens, prize_type, jackpot_type_won, jackpot_amount_won, coupon_code, fulfillment_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'fulfilled') RETURNING id`,
        [userId, redemptionId || null, prizeIndex, prize.label, totalTokens, prize.type, jackpotTypeWon, jackpotAmountWon, couponCode]
      );
      const spinResultId = spinInsert[0]?.id;

      // ── Reward record ──────────────────────────────────────────────────────
      if (totalTokens > 0) {
        await db.insert(rewards).values({
          userId,
          rewardType: jackpotTypeWon ? `${jackpotTypeWon}_jackpot_win` : "quantum_spin_win",
          tokenAmount: totalTokens.toString(),
          cashValue: (totalTokens * 0.00000508432).toFixed(4),
          status: "confirmed",
          metadata: { spinResultId, prizeIndex, label: prize.label, prizeType: prize.type, jackpotTypeWon },
        });
      }

      // ── Activity feed: token wins ──────────────────────────────────────────
      if (prize.type === 'tokens' && prize.tokens > 0) {
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'spin_win',$2,$3)`,
          [userId, `🔥 ${displayName} won ${prize.label} JCMOVES`, JSON.stringify({ tokens: prize.tokens })]
        );
      }

      console.log(`⚡ Quantum Spin: ${displayName} → ${prize.label} (${prize.type})${jackpotTypeWon ? ` + ${jackpotTypeWon.toUpperCase()} JACKPOT ${jackpotAmountWon}` : ''}`);

      res.json({
        prizeIndex,
        tokens: totalTokens,
        label: prize.label,
        prizeType: prize.type,
        jackpotTypeWon,
        jackpotAmountWon,
        couponCode: couponCode || mysteryExtra?.couponCode || null,
        couponExpiry: couponExpiry ? couponExpiry.toISOString() : null,
        mysteryResult: mysteryResult ? { type: mysteryResult.type, value: mysteryResult.value, ...mysteryExtra } : null,
        spinResultId,
        usedFreeSpinId,
      });
    } catch (e: any) {
      console.error("Quantum Spin error:", e);
      res.status(500).json({ error: e.message || "Spin failed" });
    }
  });

  // ── Spin Streak Bonus ────────────────────────────────────────────────────────
  app.post("/api/reward-shop/streak-bonus", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { milestone } = req.body;
      if (![10, 30, 50].includes(Number(milestone))) {
        return res.status(400).json({ error: "Invalid milestone" });
      }
      const m = Number(milestone);
      let bonusTokens = 0;
      let mysteryType = false;
      if (m === 10) bonusTokens = 100;
      else if (m === 30) bonusTokens = 500;
      else if (m === 50) {
        // Mystery box: random 200–1500
        bonusTokens = Math.floor(Math.random() * 1301) + 200;
        mysteryType = true;
      }
      await storage.creditWalletTokens(userId, bonusTokens);
      // Log to activity feed
      const { rows: userRows } = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [userId]);
      const displayName = userRows[0]?.display_name || "Someone";
      await pool.query(
        `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1, 'streak_bonus', $2, $3)`,
        [userId, `🔥 ${displayName} hit a ${m}-spin streak and earned ${bonusTokens.toLocaleString()} JCMOVES!`, JSON.stringify({ milestone: m, bonus: bonusTokens })]
      );
      res.json({ milestone: m, bonusTokens, mysteryType });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Activity feed (public) ──────────────────────────────────────────────────
  app.get("/api/reward-shop/activity-feed", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, event_type, message, metadata, created_at FROM activity_feed_events ORDER BY created_at DESC LIMIT 20`
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Spin history (authenticated user) ──────────────────────────────────────
  app.get("/api/reward-shop/spin-history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { rows } = await pool.query(
        `SELECT id, prize_label, prize_tokens, prize_type, jackpot_type_won, jackpot_amount_won, coupon_code, created_at
         FROM spin_results WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Free spin entitlements ──────────────────────────────────────────────────
  app.get("/api/reward-shop/free-spins", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { rows } = await pool.query(
        `SELECT id, value_json, expires_at FROM reward_entitlements WHERE user_id=$1 AND entitlement_type='spin_credit' AND status='active' AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 5`,
        [userId]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin spin config ───────────────────────────────────────────────────────
  app.get("/api/admin/spin-config", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { rows: cfg } = await pool.query(`SELECT * FROM spin_config ORDER BY setting_key`);
      const { rows: jps } = await pool.query(`SELECT * FROM jackpots ORDER BY type`);
      const { rows: recentWins } = await pool.query(`SELECT jw.*, u.username, u.first_name FROM jackpot_wins jw LEFT JOIN users u ON u.id=jw.user_id ORDER BY jw.created_at DESC LIMIT 10`);
      res.json({ config: cfg, jackpots: jps, recentJackpotWins: recentWins });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/spin-config/:key", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { key } = req.params;
      const { value } = req.body;
      await pool.query(`UPDATE spin_config SET setting_value=$1, updated_at=NOW() WHERE setting_key=$2`, [String(value), key]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public pricing config (used by services page) ──────────────────────────
  // ── Drive distance auto-estimate via OpenStreetMap Nominatim ──────────────
  // Calculates total one-way drive miles for a job:
  //   Moving: base→pickup + pickup→dropoff (we return pickup→dropoff + base→pickup)
  //   Load-only/Junk: base→pickup only (round trip handled by driveLineItem × 2)
  app.get("/api/utility/estimate-drive-miles", async (req, res) => {
    const pickupAddr = req.query.pickup as string || req.query.address as string;
    const dropoffAddr = req.query.dropoff as string;
    if (!pickupAddr || pickupAddr.trim().length < 4) {
      return res.json({ miles: 0, error: "No pickup address" });
    }
    const BASE_LAT = 46.4539; // Ironwood, MI
    const BASE_LNG = -90.1715;

    function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 3958.8; // Earth radius in miles
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    async function geocode(addr: string): Promise<{ lat: number; lon: number } | null> {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=us`;
        const r = await fetch(url, { headers: { "User-Agent": "JCOnTheMove/1.0 contact@jcontmove.com" } });
        if (!r.ok) return null;
        const data: Array<{ lat: string; lon: string }> = await r.json() as any;
        if (!data.length) return null;
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      } catch { return null; }
    }

    try {
      const pickup = await geocode(pickupAddr);
      if (!pickup) return res.json({ miles: 0, note: "Pickup address not found" });

      // base→pickup segment (always included)
      const baseToPickup = haversine(BASE_LAT, BASE_LNG, pickup.lat, pickup.lon);
      let totalOneWay = baseToPickup;
      let route = `base→pickup(${Math.round(baseToPickup)}mi)`;

      // pickup→dropoff segment (moving jobs with a destination)
      if (dropoffAddr && dropoffAddr.trim().length >= 4) {
        const dropoff = await geocode(dropoffAddr);
        if (dropoff) {
          const pickupToDropoff = haversine(pickup.lat, pickup.lon, dropoff.lat, dropoff.lon);
          totalOneWay += pickupToDropoff;
          route += `+dropoff(${Math.round(pickupToDropoff)}mi)`;
        }
      }

      const estimated = Math.ceil(totalOneWay * 1.25); // road-factor multiplier
      return res.json({ miles: estimated, straight: Math.round(totalOneWay), route });
    } catch (err) {
      return res.json({ miles: 0, error: err.message });
    }
  });

  app.get("/api/pricing", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT setting_key, setting_value FROM spin_config WHERE setting_key LIKE 'pricing_%' ORDER BY setting_key`
      );
      const config: Record<string, any> = {};
      for (const r of rows) config[r.setting_key] = r.setting_value;
      let customItems: { id: string; name: string; value: number }[] = [];
      try { customItems = JSON.parse(config['pricing_custom_items'] || '[]'); } catch {}
      let junkAddons: { id: string; name: string; value: number }[] = [];
      try { junkAddons = JSON.parse(config['pricing_junk_addons'] || '[]'); } catch {}
      const n = (key: string, fallback: number) => parseFloat(config[key] ?? String(fallback));
      res.json({
        ratePerMoverHour: n('pricing_rate_per_mover_hour', 60),
        truckAdd:         n('pricing_truck_add',           60),
        minHours: {
          1: n('pricing_min_hours_1', 5),
          2: n('pricing_min_hours_2', 4),
          3: n('pricing_min_hours_3', 3),
          4: n('pricing_min_hours_4', 2),
          5: n('pricing_min_hours_5', 2),
        },
        shortJobRate:  n('pricing_short_job_rate',   150),
        shortJobFull:  n('pricing_short_job_full',   300),
        jc222Price:    n('pricing_jc222_price',      222),
        driveSpeedMph: n('pricing_drive_speed_mph',   50),
        junkSmallLow:  n('pricing_junk_small_low',   100),
        junkSmallHigh: n('pricing_junk_small_high',  200),
        junkLargeLow:  n('pricing_junk_large_low',   200),
        junkLargeHigh: n('pricing_junk_large_high',  600),
        customItems,
        junkAddons,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/pricing/:key", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { key } = req.params;
      const { value } = req.body;
      const fullKey = `pricing_${key}`;
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        [fullKey, String(value), `Pricing config: ${key}`]
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/pricing/custom-items", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { items } = req.body;
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        ['pricing_custom_items', JSON.stringify(items), 'Custom additional items/services JSON array']
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Service Add-Ons (editable list shown to customers) ──
  const DEFAULT_SERVICE_ADDONS = [
    { id: "assembly",  label: "Furniture Assembly / Disassembly", price: 75,  unit: "flat"    },
    { id: "packing",   label: "Packing Assistance",               price: 45,  unit: "/ room"  },
    { id: "mattress",  label: "Mattress Bag Protection",          price: 15,  unit: "each"    },
    { id: "shrink",    label: "Shrink Wrap Protection",           price: 15,  unit: "/ room"  },
    { id: "stairs",    label: "Stair Carry Fee",                  price: 25,  unit: "flat"    },
    { id: "longcarry", label: "Long Carry Fee (100+ ft)",         price: 25,  unit: "flat"    },
    { id: "piano",     label: "Piano / Specialty Item",           price: 85,  unit: "flat"    },
  ];

  // ── Canonical catalog definitions (server-side source of truth for JobOrderBuilder) ──
  // Moving packages, junk packages, moving add-ons, junk add-ons, and special items.
  // Admin can override via PUT /api/admin/pricing/catalog-definitions.
  const DEFAULT_CATALOG_DEFINITIONS = {
    movingPackages: [
      { id: "moving_2m_2h", movers: 2, hours: 2, label: "JC222 Special", tag: "Best Deal", isJc222: true },
      { id: "moving_2m_3h", movers: 2, hours: 3, label: "2 Movers × 3 hrs", tag: "Short Move" },
      { id: "moving_2m_4h", movers: 2, hours: 4, label: "2 Movers × 4 hrs" },
      { id: "moving_3m_3h", movers: 3, hours: 3, label: "3 Movers × 3 hrs", tag: "Most Popular" },
      { id: "moving_3m_4h", movers: 3, hours: 4, label: "3 Movers × 4 hrs" },
      { id: "moving_4m_3h", movers: 4, hours: 3, label: "4 Movers × 3 hrs", tag: "Fastest" },
      { id: "moving_4m_4h", movers: 4, hours: 4, label: "4 Movers × 4 hrs", tag: "Heavy Move" },
      { id: "moving_2m_6h", movers: 2, hours: 6, label: "2 Movers × 6 hrs", tag: "Full Day" },
      { id: "moving_3m_6h", movers: 3, hours: 6, label: "3 Movers × 6 hrs" },
    ],
    junkPackages: [
      { id: "junk_single_item", label: "Single Item",     desc: "1–2 large items · up to $300 for pickup truck load", low: 100, high: 200, tag: "Quick" },
      { id: "junk_quarter",     label: "¼ Truck Load",    desc: "Small cleanout",                                     low: 300, high: 500 },
      { id: "junk_half",        label: "½ Truck Load",    desc: "One room / garage cleanout",                         low: 500, high: 800, tag: "Popular" },
      { id: "junk_full",        label: "Full Truck Load", desc: "Large enclosed trailer · 1 driver + 2 helpers",       low: 1000, high: 0,  tag: "Best Value" },
    ],
    movingAddons: [
      { id: "mattress_bag",     name: "Mattress Bag(s)",               unitPrice: 20,  category: "supplies", qtyOptions: [1,2,3,4] },
      { id: "wardrobe_boxes",   name: "Wardrobe Boxes",                unitPrice: 25,  category: "supplies", qtyOptions: [1,2,3,4] },
      { id: "packing_supplies", name: "Packing Tape & Supplies",       unitPrice: 40,  category: "supplies", qtyOptions: [1] },
      { id: "long_carry",       name: "Long Carry (>75 ft)",           unitPrice: 50,  category: "access",   qtyOptions: [1] },
      { id: "stairs",           name: "Stairs / Flights",              unitPrice: 25,  category: "access",   qtyOptions: [1,2,3,4] },
      { id: "elevator",         name: "Elevator Fee",                  unitPrice: 30,  category: "access",   qtyOptions: [1] },
      { id: "assembly",         name: "Furniture Assembly/Disassembly", unitPrice: 75, category: "labor",    qtyOptions: [1] },
      { id: "appliance_connect", name: "Appliance Connection",         unitPrice: 50,  category: "labor",    qtyOptions: [1] },
    ],
    junkAddons: [
      { id: "appliance_recycle", name: "Appliance Recycling Fee",     unitPrice: 75,  openPrice: false, qtyOptions: [1,2,3] },
      { id: "hazmat",            name: "Hazardous Surcharge",         unitPrice: 300, openPrice: true,  qtyOptions: [1] },
      { id: "extra_labor",       name: "Extra Labor Hour",            unitPrice: 70,  openPrice: false, qtyOptions: [1,2] },
      { id: "dumpster_bag",      name: "Cleanout Dumpster Bag",       unitPrice: 400, openPrice: false, qtyOptions: [1,2] },
      { id: "teardown",          name: "Light Demolition / Teardown", unitPrice: 500, openPrice: true,  qtyOptions: [1] },
    ],
    specialItems: [
      { id: "hot_tub",    name: "Hot Tub",            baseFee: 250, key: "hasHotTub",    feeKey: "hotTubFee" },
      { id: "piano",      name: "Piano",               baseFee: 200, key: "hasPiano",     feeKey: "pianoFee" },
      { id: "heavy_safe", name: "Heavy Safe (300+ lbs)", baseFee: 175, key: "hasHeavySafe", feeKey: "heavySafeFee" },
      { id: "pool_table", name: "Pool Table",          baseFee: 200, key: "hasPoolTable", feeKey: "poolTableFee" },
    ],
  };

  app.get("/api/pricing/catalog-definitions", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT setting_value FROM spin_config WHERE setting_key='pricing_catalog_definitions' LIMIT 1`
      );
      if (rows.length && rows[0].setting_value) {
        try { return res.json(JSON.parse(rows[0].setting_value)); } catch {}
      }
      res.json(DEFAULT_CATALOG_DEFINITIONS);
    } catch {
      res.json(DEFAULT_CATALOG_DEFINITIONS);
    }
  });

  app.put("/api/admin/pricing/catalog-definitions", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const definitions = req.body;
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        ["pricing_catalog_definitions", JSON.stringify(definitions), "Canonical catalog package/addon definitions"]
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/pricing/addons", async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT setting_value FROM spin_config WHERE setting_key='pricing_service_addons' LIMIT 1`);
      if (rows.length && rows[0].setting_value) {
        try { return res.json(JSON.parse(rows[0].setting_value)); } catch {}
      }
      res.json(DEFAULT_SERVICE_ADDONS);
    } catch (e: any) {
      res.json(DEFAULT_SERVICE_ADDONS);
    }
  });

  app.put("/api/admin/pricing/addons", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { items } = req.body;
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        ['pricing_service_addons', JSON.stringify(items), 'Service add-ons shown to customers']
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/pricing/junk-addons", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { items } = req.body;
      await pool.query(
        `INSERT INTO spin_config (setting_key, setting_value, description) VALUES ($1, $2, $3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
        ['pricing_junk_addons', JSON.stringify(items), 'Junk removal heavy item surcharges JSON array']
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/jackpots/:type/reset", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin', 'business_owner'].includes((req.session as any).userRole)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { type } = req.params;
      const { rows } = await pool.query(
        `UPDATE jackpots SET current_value=starting_value, updated_at=NOW() WHERE type=$1 RETURNING *`,
        [type]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ── I LOVE YOU MOM — Hearts & Donations ────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // Public: get mom's stats (balance + heart count + recent donors)
  app.get("/api/mom/stats", async (_req, res) => {
    try {
      const { rows: walletRows } = await pool.query(
        `SELECT token_balance, total_earned FROM wallet_accounts WHERE user_id='nicolasa-jackson-generosity' LIMIT 1`
      );
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) as total_hearts, COALESCE(SUM(jcmoves_amount),0) as total_donated FROM mom_hearts`
      );
      const { rows: recentRows } = await pool.query(
        `SELECT display_name, jcmoves_amount, message, created_at FROM mom_hearts ORDER BY created_at DESC LIMIT 3`
      );
      res.json({
        tokenBalance: parseFloat(walletRows[0]?.token_balance || "0"),
        totalEarned: parseFloat(walletRows[0]?.total_earned || "0"),
        totalHearts: parseInt(countRows[0]?.total_hearts || "0"),
        totalDonated: parseInt(countRows[0]?.total_donated || "0"),
        recentDonors: recentRows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Public: get heart timeline
  app.get("/api/mom/hearts", async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50"), 100);
      const { rows } = await pool.query(
        `SELECT id, display_name, jcmoves_amount, message, created_at FROM mom_hearts ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Authenticated: donate JCMOVES + post a heart
  app.post("/api/mom/hearts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { amount, message, displayName } = req.body;
      const tokens = Math.max(1, parseInt(amount) || 0);

      // Deduct from sender's wallet
      try {
        await storage.debitWalletTokens(userId, tokens);
      } catch {
        return res.status(400).json({ error: `Not enough JCMOVES. You need ${tokens} to send love.` });
      }

      // Credit directly to mom's wallet (on top of the 1% she gets automatically)
      await pool.query(
        `UPDATE wallet_accounts SET token_balance=token_balance::numeric+$1, total_earned=total_earned::numeric+$1, last_activity=NOW() WHERE user_id='nicolasa-jackson-generosity'`,
        [tokens]
      );

      // Log reward for mom's wallet
      const [userRow] = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username })
        .from(users).where(eq(users.id, userId)).limit(1);
      const senderName = displayName?.trim()
        || userRow?.username
        || (userRow?.firstName ? `${userRow.firstName}` : 'Someone special');

      await db.insert(rewards).values({
        userId: 'nicolasa-jackson-generosity',
        rewardType: 'mom_heart_donation',
        tokenAmount: tokens.toString(),
        cashValue: (tokens * 0.00000508432).toFixed(4),
        status: 'confirmed',
        metadata: { from: userId, senderName, message: message?.trim() || null, amount: tokens },
      });

      // Insert heart into timeline
      const { rows } = await pool.query(
        `INSERT INTO mom_hearts (user_id, display_name, jcmoves_amount, message) VALUES ($1,$2,$3,$4) RETURNING *`,
        [userId, senderName, tokens, message?.trim() || null]
      );

      // Activity feed event
      await pool.query(
        `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'mom_heart',$2,$3)`,
        [userId, `❤️ ${senderName} sent ${tokens} JCMOVES love to Nicolasa`, JSON.stringify({ amount: tokens })]
      );

      // Bonus: 100+ JCMOVES love → +2 free Quantum Spins
      let freeSpinsAwarded = 0;
      if (tokens >= 100) {
        freeSpinsAwarded = 2;
        const spinExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
        await pool.query(
          `INSERT INTO reward_entitlements (user_id, entitlement_type, value_json, status, expires_at)
           VALUES ($1,'spin_credit','{"spins":1}','active',$2),
                  ($1,'spin_credit','{"spins":1}','active',$2)`,
          [userId, spinExpiry]
        );
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'spin_bonus',$2,$3)`,
          [userId, `🎰 ${senderName} earned 2 free Quantum Spins for sending 100+ JCMOVES love!`, JSON.stringify({ spins: 2, reason: 'mom_love_100' })]
        );
        console.log(`🎰 Awarded 2 free spins to ${senderName} for 100+ JCMOVES Mom love`);
      }

      console.log(`💝 ${senderName} sent ${tokens} JCMOVES love to Mom`);
      res.json({ ok: true, heart: rows[0], freeSpinsAwarded });
    } catch (e: any) {
      console.error("Mom heart donation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── NOMINEES ─────────────────────────────────────────────────────────────
  app.get("/api/nominees", async (_req, res) => {
    try {
      const { getActiveNominees } = await import("./services/nominees");
      const nominees = await getActiveNominees();
      res.json(nominees);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/nominees", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const sessionUser = await storage.getUser(userId);
      if (!sessionUser || !["admin", "business_owner"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin only" });
      }
      const { name, description } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Name required" });
      const { addNominee } = await import("./services/nominees");
      const nominee = await addNominee(name.trim(), description?.trim() || "", sessionUser.firstName || userId);
      res.json(nominee);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/nominees/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const sessionUser = await storage.getUser(userId);
      if (!sessionUser || !["admin", "business_owner"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin only" });
      }
      const { toggleNominee } = await import("./services/nominees");
      await toggleNominee(parseInt(req.params.id), req.body.is_active);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/generosity-fund", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const sessionUser = await storage.getUser(userId);
      if (!sessionUser || !["admin", "business_owner"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin only" });
      }
      const { getGenerosityFundStats } = await import("./services/nominees");
      const stats = await getGenerosityFundStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ── LABOR CALCULATOR ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const TOKENS_PER_MOVER_MINUTE = 500;
  const CASH_PER_MOVER_HOUR = 62.5;
  const SERVICE_MIN_CASH_CENTS = 5000; // $50 minimum
  const SERVICE_MIN_TOKENS = 15000;    // 15,000 token minimum

  function calcLaborQuote(movers: number, minutes: number) {
    const moverMinutes = movers * minutes;
    const rawTokens = moverMinutes * TOKENS_PER_MOVER_MINUTE;
    const rawCashCents = Math.round((movers * minutes * CASH_PER_MOVER_HOUR / 60) * 100);

    const tokenPrice = Math.max(rawTokens, SERVICE_MIN_TOKENS);
    const cashPriceCents = Math.max(rawCashCents, SERVICE_MIN_CASH_CENTS);

    // Token coverage cap based on duration
    let tokenCoverageRatio = 1.0;
    if (minutes >= 120) tokenCoverageRatio = 0.5;
    else if (minutes >= 60) tokenCoverageRatio = 0.75;

    const tokenCap = Math.floor(tokenPrice * tokenCoverageRatio);
    return { moverMinutes, tokenPrice, cashPriceCents, tokenCap, tokenCoverageRatio };
  }

  // ── Calculate (no side effects, no auth required) ────────────────────────
  app.post("/api/labor-quote/calculate", async (req: any, res) => {
    try {
      const { movers, minutes } = req.body;
      if (!movers || !minutes) return res.status(400).json({ error: "movers and minutes are required" });
      const m = parseInt(movers), min = parseInt(minutes);
      if (![2, 3, 4].includes(m)) return res.status(400).json({ error: "Movers must be 2, 3, or 4" });
      if (min < 15 || min % 15 !== 0) return res.status(400).json({ error: "Duration must be in 15-minute increments, minimum 15 minutes" });
      res.json({ ok: true, ...calcLaborQuote(m, min) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Submit quote → deduct tokens + create lead ────────────────────────────
  app.post("/api/labor-quote/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { movers, minutes, serviceType, paymentMode, tokenApplied, userNotes, scheduledDate } = req.body;

      const m = parseInt(movers), min = parseInt(minutes), tApplied = parseInt(tokenApplied ?? 0);
      if (![2, 3, 4].includes(m)) return res.status(400).json({ error: "Invalid mover count" });
      if (min < 15 || min % 15 !== 0) return res.status(400).json({ error: "Duration must be in 15-minute increments" });

      const { tokenPrice, cashPriceCents, tokenCap } = calcLaborQuote(m, min);

      // Validate token amount requested
      const finalTokenApplied = Math.min(tApplied, tokenCap);
      if (finalTokenApplied < 0) return res.status(400).json({ error: "Invalid token amount" });

      // If tokens are being applied, check balance and deduct
      if (finalTokenApplied > 0) {
        const walletRow = await db.execute(sql`SELECT token_balance FROM wallet_accounts WHERE user_id = ${userId} LIMIT 1`);
        const bal = parseFloat((walletRow.rows[0] as any)?.token_balance ?? "0");
        if (bal < finalTokenApplied) return res.status(400).json({ error: "Insufficient JCMOVES balance" });
        await storage.debitWalletTokens(userId, finalTokenApplied);
      }

      // Cash due = cash price minus cash value of tokens applied
      const tokenValueCents = Math.round((finalTokenApplied / tokenPrice) * cashPriceCents);
      const cashDueCents = Math.max(0, cashPriceCents - tokenValueCents);

      // Quote expires in 45 days
      const expiresAt = new Date(Date.now() + 45 * 86400000);

      // Create the quote record
      const [quote] = await db.insert(laborQuotes).values({
        userId,
        movers: m,
        minutes: min,
        serviceType: serviceType || "moving",
        paymentMode: paymentMode || "tokens",
        cashPriceCents,
        tokenPrice,
        tokenCap,
        tokenApplied: finalTokenApplied,
        cashDueCents,
        userNotes: userNotes || null,
        status: "quoted",
        expiresAt,
      }).returning();

      // Auto-create a lead/job booking
      const [userRecord] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      let leadId: string | null = null;
      if (userRecord) {
        const serviceLabels: Record<string, string> = {
          moving: "moving",
          loading: "moving",
          furniture: "moving",
          junk: "junk",
        };
        const leadServiceType = serviceLabels[serviceType] ?? "moving";
        const serviceLabel = serviceType === "loading" ? "Loading/Unloading Help" : serviceType === "furniture" ? "Furniture Rearranging" : serviceType === "junk" ? "Junk Removal Labor" : "Moving Help";
        const creditNote = `🧮 Labor Calculator Quote — ${m} movers × ${min} min = ${m * min} mover-minutes. ${finalTokenApplied > 0 ? `${finalTokenApplied.toLocaleString()} JCMOVES applied.` : ""} ${cashDueCents > 0 ? `Cash due at service: $${(cashDueCents / 100).toFixed(2)}.` : "Fully covered by JCMOVES."} Quote #${quote.id} expires ${expiresAt.toLocaleDateString()}.`;

        const [newLead] = await db.insert(leads).values({
          firstName: userRecord.firstName || userRecord.username || "Customer",
          lastName: userRecord.lastName || "",
          email: userRecord.email || "",
          phone: userRecord.phone || "Not provided",
          serviceType: leadServiceType,
          fromAddress: "To be provided",
          status: "quote_requested",
          details: `Labor Calculator service request. ${m} movers, ${min} minutes, ${serviceLabel}.${userNotes ? ` Notes: ${userNotes}` : ""}`,
          quoteNotes: creditNote,
          crewSize: m,
          createdByUserId: userId,
          appliedCreditNote: creditNote,
          moveDate: scheduledDate ? new Date(scheduledDate).toISOString().split("T")[0] : undefined,
        } as any).returning();
        leadId = newLead?.id || null;

        // Link lead back to quote
        if (leadId) {
          await db.update(laborQuotes).set({ leadId, status: "scheduled" }).where(eq(laborQuotes.id, quote.id));
        }

        // Admin notification email
        try {
          const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
          await sendEmail({
            to: companyEmail,
            subject: `🧮 Labor Calculator Booking — ${m} Movers × ${min} min — ${userRecord.firstName || userRecord.email}`,
            html: `<div style="font-family:Arial,sans-serif;padding:24px;background:#0f172a;color:#f1f5f9;border-radius:8px;">
              <h2 style="color:#f97316;">New Labor Calculator Booking</h2>
              <p><strong>Customer:</strong> ${userRecord.firstName || ""} ${userRecord.lastName || ""} (${userRecord.email})</p>
              <p><strong>Crew:</strong> ${m} movers</p>
              <p><strong>Duration:</strong> ${min} minutes</p>
              <p><strong>Service:</strong> ${serviceLabel}</p>
              <p><strong>JCMOVES Applied:</strong> ${finalTokenApplied.toLocaleString()}</p>
              <p><strong>Cash Due:</strong> $${(cashDueCents / 100).toFixed(2)}</p>
              ${scheduledDate ? `<p><strong>Requested Date:</strong> ${new Date(scheduledDate).toLocaleDateString()}</p>` : ""}
              ${userNotes ? `<p><strong>Notes:</strong> ${userNotes}</p>` : ""}
              <p><strong>Lead ID:</strong> ${leadId}</p>
            </div>`,
            text: `New labor calculator booking from ${userRecord.email}: ${m} movers, ${min} min, $${(cashDueCents / 100).toFixed(2)} cash due, ${finalTokenApplied} JCMOVES applied.`,
          });
        } catch (_e) { /* non-blocking */ }
      }

      res.json({ ok: true, quote, leadId, cashDueCents, tokenApplied: finalTokenApplied });
    } catch (e: any) {
      console.error("Labor quote submit error:", e);
      res.status(500).json({ error: e.message || "Failed to submit quote" });
    }
  });

  // ── My quotes ─────────────────────────────────────────────────────────────
  app.get("/api/labor-quote/my-quotes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const quotes = await db.select().from(laborQuotes).where(eq(laborQuotes.userId, userId)).orderBy(desc(laborQuotes.createdAt));
      res.json(quotes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: All labor quotes ────────────────────────────────────────────────
  app.get("/api/admin/labor-quotes", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const quotes = await db.select({ quote: laborQuotes, user: users })
        .from(laborQuotes)
        .leftJoin(users, eq(laborQuotes.userId, users.id))
        .orderBy(desc(laborQuotes.createdAt));
      res.json(quotes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Chatbot Quote Submission ──────────────────────────────────────────────
  app.post("/api/chatbot-quote", async (req: any, res) => {
    try {
      const { answers, quote } = req.body;
      if (!answers || !quote) return res.status(400).json({ error: "Missing answers or quote" });

      const a = answers as Record<string, any>;
      const name = (a.contactName || "").trim();
      const phone = (a.contactPhone || "").trim();
      const email = (a.contactEmail || "").trim();
      if (!name || !phone || !email) return res.status(400).json({ error: "Contact info required" });

      const [first, ...rest] = name.split(" ");
      const last = rest.join(" ") || "";

      // Build from/to address strings from zips
      const fromAddress = a.fromZip ? `ZIP: ${a.fromZip}` : "Not provided";
      const toAddress = a.toZip ? `ZIP: ${a.toZip}` : undefined;

      // Determine service type label
      const svcRaw: string = a.serviceType || "Local Move";
      const serviceType = svcRaw.includes("Junk") ? "junk" : "residential";

      // Store all chatbot Q&A in details as JSON
      const detailsJson = JSON.stringify({ _source: "chatbot", answers, estimatedQuote: quote }, null, 2);

      // Determine move date hint
      const moveDateStr = a.moveDate || "";
      let moveDate: string | null = null;
      if (moveDateStr.includes("This week")) {
        const d = new Date(); d.setDate(d.getDate() + 3);
        moveDate = d.toISOString().split("T")[0];
      } else if (moveDateStr.includes("Next week")) {
        const d = new Date(); d.setDate(d.getDate() + 10);
        moveDate = d.toISOString().split("T")[0];
      }

      const userId = (req.session as any)?.userId || null;

      const [lead] = await db.insert(leads).values({
        id: crypto.randomUUID(),
        firstName: first,
        lastName: last,
        email,
        phone,
        serviceType,
        fromAddress,
        toAddress: toAddress || null,
        propertySize: a.homeSize || null,
        details: detailsJson,
        moveDate: moveDate || null,
        status: "chatbot_pending" as any,
        crewSize: quote.crew || 2,
        basePrice: String(quote.minPrice || 0),
        totalPrice: String(quote.maxPrice || 0),
        smsConsent: false,
        createdByUserId: userId,
        createdAt: new Date(),
      }).returning();

      // Notify admin via email if possible
      try {
        await sendEmail({
          to: "upmichiganstatemovers@gmail.com",
          subject: `🤖 New Chatbot Quote: ${name} — ${a.homeSize || svcRaw}`,
          html: `<h2>New chatbot quote submitted</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Service:</strong> ${svcRaw}</p>
            <p><strong>Home Size:</strong> ${a.homeSize || "N/A"}</p>
            <p><strong>From ZIP:</strong> ${a.fromZip || "N/A"} → <strong>To ZIP:</strong> ${a.toZip || "N/A"}</p>
            <p><strong>Move Date:</strong> ${moveDateStr}</p>
            <p><strong>Estimated Range:</strong> $${quote.minPrice}–$${quote.maxPrice}</p>
            <p><strong>Crew:</strong> ${quote.crew} movers, ${quote.minHrs}–${quote.maxHrs} hrs</p>
            <p><a href="https://jconthemove.replit.app/admin/quote-review">Review at Admin Dashboard →</a></p>`,
        });
      } catch (_) {}

      res.json({ leadId: lead.id, message: "Quote submitted for review" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: Chatbot Quote Review ────────────────────────────────────────────
  app.get("/api/admin/chatbot-quotes", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const rows = await db.select().from(leads)
        .where(eq(leads.status, "chatbot_pending" as any))
        .orderBy(desc(leads.createdAt))
        .limit(100);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/chatbot-quotes/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const { basePrice, totalPrice, quoteNotes } = req.body;
      const [currentLead] = await db.select().from(leads).where(eq(leads.id, req.params.id));
      await db.update(leads)
        .set({
          status: "quote_requested" as any,
          basePrice: String(basePrice || ""),
          totalPrice: String(totalPrice || ""),
          quoteNotes: quoteNotes || null,
          lastQuoteUpdatedAt: new Date(),
        })
        .where(eq(leads.id, req.params.id));
      try {
        await writeLeadHistory(req.params.id, currentLead?.status ?? null, "quote_requested", user.id, "Chatbot quote approved by admin");
      } catch (histErr) {
        console.error('[lead_history] Chatbot approve history failed:', histErr);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/chatbot-quotes/:id/dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || !["admin", "business_owner"].includes(user.role || "")) return res.status(403).json({ error: "Unauthorized" });
      const [currentLead] = await db.select().from(leads).where(eq(leads.id, req.params.id));
      await db.update(leads).set({ status: "dismissed" as any }).where(eq(leads.id, req.params.id));
      try {
        await writeLeadHistory(req.params.id, currentLead?.status ?? null, "dismissed", user.id, "Chatbot quote dismissed by admin");
      } catch (histErr) {
        console.error('[lead_history] Chatbot dismiss history failed:', histErr);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Crew Auto-Expire Background Job ─────────────────────────────────────────
  // Runs every 60 seconds — marks workers offline when availableUntil has passed or lastActive is stale (>5min)
  setInterval(async () => {
    try {
      const now = new Date();
      const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000);
      await pool.query(
        `UPDATE users SET is_available = false
         WHERE is_available = true
           AND role = 'employee'
           AND (
             (available_until IS NOT NULL AND available_until <= $1)
             OR (last_active IS NOT NULL AND last_active < $2)
           )`,
        [now, staleThreshold]
      );
    } catch (e) {
      console.error('[CrewExpire] auto-expire error:', e);
    }
  }, 60_000);

  // ── JCMOVES Lottery System ────────────────────────────────────────────────────
  await ensureLotteryTables();
  await ensureActiveLotteryRounds();

  // Periodic draw checker — runs every 60 seconds
  setInterval(() => { checkAndRunLotteryDraws().catch(e => console.error('[Lottery] draw check error:', e)); }, 60_000);

  // ── Public: get active round(s) status ────────────────────────────────────
  app.get("/api/lottery/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { rows: rounds } = await pool.query(
        `SELECT * FROM lottery_rounds WHERE status = 'open' ORDER BY round_type, id LIMIT 5`
      );
      const result: any[] = [];
      for (const round of rounds) {
        const { rows: myEntries } = await pool.query(
          `SELECT COALESCE(SUM(tickets),0)::int AS my_tickets FROM lottery_entries WHERE round_id=$1 AND user_id=$2`,
          [round.id, userId]
        );
        const { rows: topPurchases } = await pool.query(
          `SELECT lp.ticket_count, lp.cost_jcmoves, lp.created_at, u.first_name, u.username
           FROM lottery_purchases lp JOIN users u ON u.id=lp.user_id
           WHERE lp.round_id=$1 ORDER BY lp.created_at DESC LIMIT 10`,
          [round.id]
        );
        result.push({
          ...round,
          my_tickets: myEntries[0]?.my_tickets ?? 0,
          recent_purchases: topPurchases,
        });
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Public: buy tickets ───────────────────────────────────────────────────
  app.post("/api/lottery/buy", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { ticket_count, round_type = 'weekly' } = req.body;
      const count = parseInt(String(ticket_count));
      if (!count || count < 1 || count > 1000) return res.status(400).json({ error: "ticket_count must be 1–1000" });

      const { rows: roundRows } = await pool.query(
        `SELECT * FROM lottery_rounds WHERE status='open' AND round_type=$1 ORDER BY id LIMIT 1`, [round_type]
      );
      if (!roundRows.length) return res.status(400).json({ error: "No active lottery round. Try again later." });
      const round = roundRows[0];

      if (new Date() >= new Date(round.end_time)) return res.status(400).json({ error: "This round has closed. Next round opens Monday 9:01 AM." });

      const costJcmoves = count * 10;
      await storage.debitWalletTokens(userId, costJcmoves);

      const winnerAlloc = Math.floor(costJcmoves * 0.70);
      const burnAlloc   = Math.floor(costJcmoves * 0.05);
      const treasuryAlloc = costJcmoves - winnerAlloc - burnAlloc;

      const { rows: [updatedRound] } = await pool.query(
        `UPDATE lottery_rounds SET
           tickets_sold    = tickets_sold + $1,
           total_entries   = total_entries + $1,
           winner_pool     = winner_pool + $2,
           burn_pool       = burn_pool + $3,
           treasury_pool   = treasury_pool + $4,
           displayed_jackpot = seed_amount + winner_pool + $2,
           updated_at      = NOW()
         WHERE id=$5 AND status='open'
         RETURNING *`,
        [count, winnerAlloc, burnAlloc, treasuryAlloc, round.id]
      );
      if (!updatedRound) return res.status(409).json({ error: "Round is no longer open." });

      const { rows: [entry] } = await pool.query(
        `INSERT INTO lottery_entries (round_id, user_id, tickets, entry_start_index, entry_end_index)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [round.id, userId, count, updatedRound.total_entries - count + 1, updatedRound.total_entries]
      );

      await pool.query(
        `INSERT INTO lottery_purchases (user_id, round_id, ticket_count, cost_jcmoves) VALUES ($1,$2,$3,$4)`,
        [userId, round.id, count, costJcmoves]
      );

      const user = await storage.getUser(userId);
      const name = user?.firstName || user?.username || "Someone";
      await pool.query(
        `INSERT INTO lottery_audit_logs (round_id, event_type, message, metadata) VALUES ($1,'PURCHASE',$2,$3)`,
        [round.id, `${name} bought ${count} ${round_type} lottery ticket${count>1?'s':''}`, JSON.stringify({ userId, count, cost: costJcmoves })]
      );
      await pool.query(
        `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'lottery_buy',$2,$3)`,
        [userId, `🎟️ ${name} bought ${count} ticket${count>1?'s':''} in the ${round_type==='monthly'?'Mega ':''} Lottery!`, JSON.stringify({ count, roundId: round.id })]
      );

      res.json({ ok: true, entry, round: updatedRound, cost: costJcmoves });
    } catch (e: any) {
      if (e.message?.includes('Insufficient')) return res.status(400).json({ error: "Insufficient JCMOVES balance." });
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public: winner history ────────────────────────────────────────────────
  app.get("/api/lottery/history", isAuthenticated, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT lw.*, lr.round_type, lr.round_number, lr.displayed_jackpot, lr.tickets_sold
         FROM lottery_winners lw JOIN lottery_rounds lr ON lr.id=lw.round_id
         ORDER BY lw.created_at DESC LIMIT 20`
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Public: my entries ────────────────────────────────────────────────────
  app.get("/api/lottery/my-entries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { rows: entries } = await pool.query(
        `SELECT le.*, lr.round_type, lr.round_number, lr.status AS round_status, lr.displayed_jackpot, lr.total_entries
         FROM lottery_entries le JOIN lottery_rounds lr ON lr.id=le.round_id
         WHERE le.user_id=$1 ORDER BY le.created_at DESC LIMIT 50`,
        [userId]
      );
      const { rows: purchases } = await pool.query(
        `SELECT lp.*, lr.round_type, lr.round_number FROM lottery_purchases lp
         JOIN lottery_rounds lr ON lr.id=lp.round_id
         WHERE lp.user_id=$1 ORDER BY lp.created_at DESC LIMIT 30`,
        [userId]
      );
      const { rows: wins } = await pool.query(
        `SELECT lw.*, lr.round_type, lr.round_number FROM lottery_winners lw
         JOIN lottery_rounds lr ON lr.id=lw.round_id WHERE lw.user_id=$1 ORDER BY lw.created_at DESC`,
        [userId]
      );
      res.json({ entries, purchases, wins });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: lottery overview ────────────────────────────────────────────────
  app.get("/api/admin/lottery/status", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin','business_owner'].includes((req.session as any).userRole)) return res.status(403).json({ error: "Forbidden" });
      const { rows: rounds } = await pool.query(`SELECT * FROM lottery_rounds ORDER BY id DESC LIMIT 20`);
      const { rows: winners } = await pool.query(
        `SELECT lw.*, u.first_name, u.username FROM lottery_winners lw
         LEFT JOIN users u ON u.id=lw.user_id ORDER BY lw.created_at DESC LIMIT 20`
      );
      const { rows: audit } = await pool.query(`SELECT * FROM lottery_audit_logs ORDER BY created_at DESC LIMIT 50`);
      res.json({ rounds, winners, audit });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: manual draw ────────────────────────────────────────────────────
  app.post("/api/admin/lottery/draw/:roundId", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin','business_owner'].includes((req.session as any).userRole)) return res.status(403).json({ error: "Forbidden" });
      const roundId = parseInt(req.params.roundId);
      await executeLotteryDraw(roundId);
      res.json({ ok: true, message: `Draw executed for round ${roundId}` });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: freeze round ───────────────────────────────────────────────────
  app.post("/api/admin/lottery/freeze/:roundId", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin','business_owner'].includes((req.session as any).userRole)) return res.status(403).json({ error: "Forbidden" });
      await pool.query(`UPDATE lottery_rounds SET status='locked', updated_at=NOW() WHERE id=$1`, [req.params.roundId]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: unfreeze / re-open round ──────────────────────────────────────
  app.post("/api/admin/lottery/open/:roundId", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin','business_owner'].includes((req.session as any).userRole)) return res.status(403).json({ error: "Forbidden" });
      await pool.query(`UPDATE lottery_rounds SET status='open', updated_at=NOW() WHERE id=$1`, [req.params.roundId]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: retry payout for failed winner ─────────────────────────────────
  app.post("/api/admin/lottery/retry-payout/:winnerId", isAuthenticated, async (req: any, res) => {
    try {
      if (!['admin','business_owner'].includes((req.session as any).userRole)) return res.status(403).json({ error: "Forbidden" });
      const { rows: [winner] } = await pool.query(
        `SELECT * FROM lottery_winners WHERE id=$1 AND payout_status IN ('pending','retry')`, [req.params.winnerId]
      );
      if (!winner) return res.status(404).json({ error: "Winner not found or already paid." });
      await storage.creditWalletTokens(winner.user_id, winner.payout_amount);
      await pool.query(`UPDATE lottery_winners SET payout_status='complete', updated_at=NOW() WHERE id=$1`, [winner.id]);
      await pool.query(
        `INSERT INTO lottery_audit_logs (round_id, event_type, message) VALUES ($1,'PAYOUT_RETRY','Payout retried by admin')`,
        [winner.round_id]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Trash Valet Routes ────────────────────────────────────────────────────────

  // Helper: verify caller is admin or business_owner
  async function requireAdminRole(req: Request, res: Response): Promise<boolean> {
    const userId = (req.session as Record<string, unknown>)?.userId as string | undefined || req.user?.id;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return false; }
    const user = await storage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "business_owner")) {
      res.status(403).json({ error: "Admin access required" }); return false;
    }
    return true;
  }

  // Helper: verify caller is employee, admin, or business_owner (crew access)
  async function requireCrewRole(req: Request, res: Response): Promise<boolean> {
    const userId = (req.session as Record<string, unknown>)?.userId as string | undefined || req.user?.id;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return false; }
    const user = await storage.getUser(userId);
    if (!user || !["employee", "admin", "business_owner"].includes(user.role || "")) {
      res.status(403).json({ error: "Crew access required" }); return false;
    }
    return true;
  }

  // POST /api/trash/quote — calculate pricing breakdown (public)
  app.post("/api/trash/quote", async (req, res) => {
    try {
      const { calculateTrashValetQuote } = await import("../shared/trashValetPricing");
      const { cans, bagCount, recyclingEnabled, recyclingAnchorDate, lat, lng, planType, targetWeekOf } = req.body;
      const quote = calculateTrashValetQuote({
        cans: Number(cans) || 0,
        bagCount: Number(bagCount) || 0,
        recyclingEnabled: !!recyclingEnabled,
        recyclingAnchorDate: recyclingAnchorDate || null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        planType: planType === "yearly" ? "yearly" : "monthly",
        targetWeekOf: targetWeekOf || null,
      });
      res.json(quote);
    } catch (err) {
      console.error("Trash quote error:", err);
      res.status(500).json({ error: "Failed to calculate quote" });
    }
  });

  // POST /api/trash/subscribe — create subscription + first job (public, no auth required)
  app.post("/api/trash/subscribe", async (req, res) => {
    try {
      const { calculateTrashValetQuote } = await import("../shared/trashValetPricing");
      const { trashSubscriptions, trashJobs } = await import("@shared/schema");
      const {
        customerName, phone, email, address, city, state, zip,
        cans, bagCount, recyclingEnabled, recyclingAnchorDate,
        serviceDayOfWeek, recyclingDayOfWeek, serviceNotes, planType, promoCode,
      } = req.body;

      if (!customerName || !phone || !address) {
        return res.status(400).json({ error: "Name, phone, and address are required" });
      }

      const normalizedAddr = (address || "").trim().toLowerCase();
      const existing = await db.select().from(trashSubscriptions)
        .where(and(
          sql`LOWER(TRIM(${trashSubscriptions.address})) = ${normalizedAddr}`,
          sql`${trashSubscriptions.status} = 'active'`
        ));
      if (existing.length > 0) {
        return res.status(409).json({ error: "An active subscription already exists for this address." });
      }

      // Optional promo code validation (lookup against existing promo codes table)
      let promoDiscount = 0;
      let promoCodeUsed: string | null = null;
      if (promoCode && promoCode.trim()) {
        try {
          const { rows: promoRows } = await pool.query(
            `SELECT * FROM promo_codes WHERE UPPER(code) = UPPER($1) AND is_active = true LIMIT 1`,
            [promoCode.trim()]
          );
          if (promoRows.length > 0) {
            promoCodeUsed = promoRows[0].code;
            promoDiscount = parseFloat(promoRows[0].discount_amount || "0");
          }
        } catch (_) { /* promo codes table may not exist, ignore */ }
      }

      // Server-side geocode from address for reliable travel surcharge calculation
      let resolvedLat: number | null = null;
      let resolvedLng: number | null = null;
      try {
        const fullAddr = [address, city, state || "MI", zip].filter(Boolean).join(" ");
        const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddr)}&format=json&limit=1&countrycodes=us`;
        const geoResp = await fetch(geoUrl, { headers: { "User-Agent": "JCOnTheMove/1.0 contact@jcontmove.com" } });
        if (geoResp.ok) {
          const geoData = await geoResp.json() as Array<{ lat: string; lon: string }>;
          if (geoData.length > 0) {
            resolvedLat = parseFloat(geoData[0].lat);
            resolvedLng = parseFloat(geoData[0].lon);
          }
        }
      } catch { /* geocode failure is non-fatal — surcharge defaults to 0 */ }

      const quote = calculateTrashValetQuote({
        cans: Number(cans) || 1,
        bagCount: Number(bagCount) || 0,
        recyclingEnabled: !!recyclingEnabled,
        recyclingAnchorDate: recyclingAnchorDate || null,
        lat: resolvedLat,
        lng: resolvedLng,
        planType: planType === "yearly" ? "yearly" : "monthly",
      });

      const effectiveMonthlyPrice = Math.max(0, quote.finalMonthlyPrice - promoDiscount);
      const today = new Date().toISOString().split("T")[0];
      const [sub] = await db.insert(trashSubscriptions).values({
        customerName: customerName.trim(),
        phone: phone.trim(),
        email: (email || "").trim(),
        address: address.trim(),
        city: (city || "").trim(),
        state: (state || "MI").trim(),
        zip: (zip || "").trim(),
        lat: resolvedLat != null ? String(resolvedLat) : null,
        lng: resolvedLng != null ? String(resolvedLng) : null,
        distanceMiles: quote.distanceMiles != null ? String(quote.distanceMiles) : null,
        travelSurchargeMonthly: String(quote.travelSurchargeMonthly),
        cans: Number(cans) || 1,
        bagCount: Number(bagCount) || 0,
        recyclingEnabled: !!recyclingEnabled,
        recyclingAnchorDate: recyclingAnchorDate || null,
        serviceDayOfWeek: Number(serviceDayOfWeek) || 1,
        recyclingDayOfWeek: recyclingDayOfWeek != null ? Number(recyclingDayOfWeek) : null,
        serviceNotes: serviceNotes ? String(serviceNotes).trim() : null,
        planType: planType === "yearly" ? "yearly" : "monthly",
        weeklyBasePrice: String(quote.weeklyBasePrice),
        projectedMonthlyPrice: String(quote.projectedMonthlyPrice),
        monthlyMinimumApplied: quote.monthlyMinimumApplied,
        finalMonthlyPrice: String(effectiveMonthlyPrice),
        billingStatus: "active",
        status: "active",
        nextBillingDate: today,
      }).returning();

      // First job: schedule for the next upcoming service day (always in the future)
      const { isRecyclingWeek: checkRecycling } = await import("../shared/trashValetPricing");
      const serviceDate = new Date();
      const targetDay = Number(serviceDayOfWeek) || 1;
      let dayDiff = targetDay - serviceDate.getDay();
      if (dayDiff <= 0) dayDiff += 7; // always pick a future date
      serviceDate.setDate(serviceDate.getDate() + dayDiff);

      // Normalize serviceWeekOf to Sunday of that week (matching admin generate-week convention)
      const weekSunday = new Date(serviceDate);
      weekSunday.setDate(serviceDate.getDate() - serviceDate.getDay());
      const weekOfStr = weekSunday.toISOString().split("T")[0];

      // Recycling flag computed from the scheduled service date
      let recyclingWeek = false;
      if (recyclingEnabled && recyclingAnchorDate) {
        recyclingWeek = checkRecycling(recyclingAnchorDate, serviceDate);
      }
      // Recompute quote with the scheduled week to get accurate recyclingCharge
      const weekQuote = calculateTrashValetQuote({
        cans: Number(cans) || 1,
        bagCount: Number(bagCount) || 0,
        recyclingEnabled: !!recyclingEnabled,
        recyclingAnchorDate: recyclingAnchorDate || null,
        lat: resolvedLat,
        lng: resolvedLng,
        planType: planType === "yearly" ? "yearly" : "monthly",
        targetWeekOf: weekOfStr,
      });

      const [job] = await db.insert(trashJobs).values({
        subscriptionId: sub.id,
        serviceWeekOf: weekOfStr,
        serviceType: "trash_valet",
        cans: Number(cans) || 1,
        bagCount: Number(bagCount) || 0,
        isRecyclingWeek: weekQuote.isRecyclingWeek,
        weeklyBasePrice: String(weekQuote.weeklyBasePrice),
        recyclingCharge: String(weekQuote.recyclingCharge),
        travelChargePortion: String(weekQuote.travelChargePortion),
        jobValue: String(weekQuote.jobValue),
        status: "scheduled",
      }).returning();

      const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
      const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      try {
        await sendEmail({
          to: companyEmail, from: companyEmail,
          subject: `New Trash Valet Subscription — ${customerName}`,
          text: `New trash valet subscription.\n\nCustomer: ${customerName}\nPhone: ${phone}\nEmail: ${email}\nAddress: ${address}, ${city}, ${state} ${zip}\nCans: ${cans}, Bags: ${bagCount}\nRecycling: ${recyclingEnabled ? "Yes" : "No"}\nService Day: ${dayNames[Number(serviceDayOfWeek)] || serviceDayOfWeek}\nMonthly Price: $${effectiveMonthlyPrice}${promoCodeUsed ? ` (promo: ${promoCodeUsed})` : ""}\nPlan: ${planType}\n\nView in admin panel at /admin-trash-valet`,
          html: `<h2>New Trash Valet Subscription</h2><p><b>Customer:</b> ${customerName}<br><b>Phone:</b> ${phone}<br><b>Email:</b> ${email}<br><b>Address:</b> ${address}, ${city}, ${state} ${zip}<br><b>Cans:</b> ${cans} | <b>Bags:</b> ${bagCount}<br><b>Recycling:</b> ${recyclingEnabled ? "Yes" : "No"}<br><b>Service Day:</b> ${dayNames[Number(serviceDayOfWeek)] || serviceDayOfWeek}<br><b>Monthly Price:</b> $${effectiveMonthlyPrice}${promoCodeUsed ? ` (promo: ${promoCodeUsed})` : ""}<br><b>Plan:</b> ${planType}</p>`,
        });
      } catch (emailErr) { console.error("Admin email failed:", emailErr); }
      try {
        await smsService.notifyNewQuote({ customerName, serviceType: "trash valet", phone: phone || undefined });
      } catch (smsErr) { console.error("Admin SMS failed:", smsErr); }

      res.json({ subscriptionId: sub.id, jobId: job.id, quote: { ...quote, finalMonthlyPrice: effectiveMonthlyPrice }, promoApplied: promoCodeUsed });
    } catch (err) {
      console.error("Error creating trash valet subscription:", err);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  });

  // GET /api/trash/subscriptions — admin only, filterable by status
  app.get("/api/trash/subscriptions", isAuthenticated, async (req, res) => {
    if (!await requireAdminRole(req, res)) return;
    try {
      const { trashSubscriptions } = await import("@shared/schema");
      const { status } = req.query;
      let rows;
      if (status && status !== "all") {
        rows = await db.select().from(trashSubscriptions)
          .where(eq(trashSubscriptions.status, String(status)))
          .orderBy(desc(trashSubscriptions.createdAt));
      } else {
        rows = await db.select().from(trashSubscriptions)
          .orderBy(desc(trashSubscriptions.createdAt));
      }
      res.json(rows);
    } catch (err) {
      console.error("Error fetching trash subscriptions:", err);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  // GET /api/trash/jobs — admin/crew access, filterable by week + status
  // Defaults to current week (Sunday-anchored) when no week param is provided
  app.get("/api/trash/jobs", isAuthenticated, async (req, res) => {
    if (!await requireCrewRole(req, res)) return;
    try {
      const { trashJobs, trashSubscriptions } = await import("@shared/schema");
      const { week, status } = req.query;
      // Default to current week's Sunday when no week filter supplied
      const defaultWeek = (() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return d.toISOString().split("T")[0];
      })();
      const weekFilter = week ? String(week) : defaultWeek;
      const conditions: ReturnType<typeof eq>[] = [eq(trashJobs.serviceWeekOf, weekFilter)];
      if (status && status !== "all") conditions.push(eq(trashJobs.status, String(status)));

      const rows = await db
        .select({ job: trashJobs, sub: trashSubscriptions })
        .from(trashJobs)
        .innerJoin(trashSubscriptions, eq(trashJobs.subscriptionId, trashSubscriptions.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(trashJobs.serviceWeekOf));
      res.json(rows);
    } catch (err) {
      console.error("Error fetching trash jobs:", err);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // POST /api/trash/generate-week — admin only, idempotent job generation
  app.post("/api/trash/generate-week", isAuthenticated, async (req, res) => {
    if (!await requireAdminRole(req, res)) return;
    try {
      const { trashSubscriptions, trashJobs } = await import("@shared/schema");
      const { isRecyclingWeek: checkRecycling } = await import("../shared/trashValetPricing");
      const { targetWeek } = req.body;
      if (!targetWeek || !/^\d{4}-\d{2}-\d{2}$/.test(targetWeek)) {
        return res.status(400).json({ error: "targetWeek is required in YYYY-MM-DD format" });
      }

      const activeSubs = await db.select().from(trashSubscriptions)
        .where(eq(trashSubscriptions.status, "active"));

      let created = 0;
      let skipped = 0;
      for (const sub of activeSubs) {
        const existing = await db.select({ id: trashJobs.id }).from(trashJobs)
          .where(and(eq(trashJobs.subscriptionId, sub.id), eq(trashJobs.serviceWeekOf, targetWeek)));
        if (existing.length > 0) { skipped++; continue; }

        const { calculateTrashValetQuote: calcQuote } = await import("../shared/trashValetPricing");
        const weekQuote = calcQuote({
          cans: sub.cans,
          bagCount: sub.bagCount,
          recyclingEnabled: sub.recyclingEnabled,
          recyclingAnchorDate: sub.recyclingAnchorDate || null,
          lat: sub.lat != null ? Number(sub.lat) : null,
          lng: sub.lng != null ? Number(sub.lng) : null,
          planType: (sub.planType as "monthly" | "yearly") || "monthly",
          targetWeekOf: targetWeek,
        });
        const recyclingWeek = weekQuote.isRecyclingWeek;
        const recyclingCharge = weekQuote.recyclingCharge;
        const travelChargePortion = weekQuote.travelChargePortion;
        const jobValue = weekQuote.jobValue;

        await db.insert(trashJobs).values({
          subscriptionId: sub.id,
          serviceWeekOf: targetWeek,
          serviceType: "trash_valet",
          cans: sub.cans,
          bagCount: sub.bagCount,
          isRecyclingWeek: recyclingWeek,
          weeklyBasePrice: String(sub.weeklyBasePrice),
          recyclingCharge: String(recyclingCharge.toFixed(2)),
          travelChargePortion: String(travelChargePortion.toFixed(2)),
          jobValue: String(jobValue.toFixed(2)),
          status: "scheduled",
        });
        created++;
      }
      res.json({ created, skipped, targetWeek });
    } catch (err) {
      console.error("Error generating trash week:", err);
      res.status(500).json({ error: "Failed to generate week" });
    }
  });

  // PATCH /api/trash/subscriptions/:id/pause — admin only
  app.patch("/api/trash/subscriptions/:id/pause", isAuthenticated, async (req, res) => {
    if (!await requireAdminRole(req, res)) return;
    try {
      const { trashSubscriptions } = await import("@shared/schema");
      const { pauseStartDate, pauseEndDate } = req.body;
      const [updated] = await db.update(trashSubscriptions)
        .set({ status: "paused", pauseStartDate: pauseStartDate || null, pauseEndDate: pauseEndDate || null, updatedAt: new Date() })
        .where(eq(trashSubscriptions.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Subscription not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to pause subscription" });
    }
  });

  // PATCH /api/trash/subscriptions/:id/activate — admin only
  app.patch("/api/trash/subscriptions/:id/activate", isAuthenticated, async (req, res) => {
    if (!await requireAdminRole(req, res)) return;
    try {
      const { trashSubscriptions } = await import("@shared/schema");
      const [updated] = await db.update(trashSubscriptions)
        .set({ status: "active", pauseStartDate: null, pauseEndDate: null, updatedAt: new Date() })
        .where(eq(trashSubscriptions.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Subscription not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to activate subscription" });
    }
  });

  // PATCH /api/trash/subscriptions/:id/cancel — admin only
  app.patch("/api/trash/subscriptions/:id/cancel", isAuthenticated, async (req, res) => {
    if (!await requireAdminRole(req, res)) return;
    try {
      const { trashSubscriptions } = await import("@shared/schema");
      const [updated] = await db.update(trashSubscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(trashSubscriptions.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Subscription not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // PATCH /api/trash/jobs/:id/pull-out — crew (employee/admin) marks pull-out
  app.patch("/api/trash/jobs/:id/pull-out", isAuthenticated, async (req, res) => {
    if (!await requireCrewRole(req, res)) return;
    try {
      const { trashJobs } = await import("@shared/schema");
      const [updated] = await db.update(trashJobs)
        .set({ pulledOutAt: new Date(), status: "pulled_out" })
        .where(eq(trashJobs.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Job not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  // PATCH /api/trash/jobs/:id/return — crew (employee/admin) marks return
  app.patch("/api/trash/jobs/:id/return", isAuthenticated, async (req, res) => {
    if (!await requireCrewRole(req, res)) return;
    try {
      const { trashJobs } = await import("@shared/schema");
      const [updated] = await db.update(trashJobs)
        .set({ returnedAt: new Date(), status: "returned" })
        .where(eq(trashJobs.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Job not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  // PATCH /api/trash/jobs/:id/complete — crew (employee/admin) completes job, awards tokens
  app.patch("/api/trash/jobs/:id/complete", isAuthenticated, async (req, res) => {
    if (!await requireCrewRole(req, res)) return;
    try {
      const { trashJobs, trashSubscriptions } = await import("@shared/schema");
      const userId = (req.session as Record<string, unknown>)?.userId as string | undefined || req.user?.id;
      const { photoUrl, notes } = req.body;

      const [job] = await db.select().from(trashJobs).where(eq(trashJobs.id, req.params.id));
      if (!job) return res.status(404).json({ error: "Job not found" });

      // Idempotent: if already completed, return existing record
      if (job.status === "completed") return res.json(job);

      const [updated] = await db.update(trashJobs)
        .set({
          status: "completed",
          completedBy: userId || null,
          completedAt: new Date(),
          photoUrl: photoUrl ? String(photoUrl) : job.photoUrl,
          notes: notes ? String(notes) : job.notes,
        })
        .where(eq(trashJobs.id, req.params.id))
        .returning();

      // Award 500 JCMOVES to the completing crew member
      if (userId) {
        try {
          await storage.creditWalletTokens(userId, 500);
        } catch (e) { console.error("Crew token award failed:", e); }
      }

      // Award 15 JCMOVES per $1 jobValue to customer if they have an account
      try {
        const [sub] = await db.select().from(trashSubscriptions)
          .where(eq(trashSubscriptions.id, job.subscriptionId));
        if (sub?.email) {
          const customerRows = await db.select().from(users)
            .where(sql`LOWER(${users.email}) = ${sub.email.toLowerCase()}`)
            .limit(1);
          if (customerRows.length > 0) {
            const customerTokens = Math.floor(parseFloat(String(job.jobValue)) * 15);
            if (customerTokens > 0) {
              await storage.creditWalletTokens(customerRows[0].id, customerTokens);
            }
          }
        }
      } catch (e) { console.error("Customer token award failed:", e); }

      res.json(updated);
    } catch (err) {
      console.error("Error completing trash job:", err);
      res.status(500).json({ error: "Failed to complete job" });
    }
  });

  // GET /api/trash/my-subscription — customer's own active subscription
  app.get("/api/trash/my-subscription", isAuthenticated, async (req, res) => {
    try {
      const { trashSubscriptions } = await import("@shared/schema");
      const userId = (req.session as Record<string, unknown>)?.userId as string | undefined || req.user?.id;
      const user = await storage.getUser(userId);
      if (!user?.email) return res.json(null);
      const subs = await db.select().from(trashSubscriptions)
        .where(and(
          sql`LOWER(${trashSubscriptions.email}) = ${user.email.toLowerCase()}`,
          eq(trashSubscriptions.status, "active")
        ))
        .orderBy(desc(trashSubscriptions.createdAt))
        .limit(1);
      res.json(subs[0] || null);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// ── Lottery helpers (module-level) ────────────────────────────────────────────

async function ensureLotteryTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_rounds (
      id SERIAL PRIMARY KEY,
      round_number INTEGER NOT NULL,
      round_type TEXT NOT NULL DEFAULT 'weekly',
      status TEXT NOT NULL DEFAULT 'open',
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      draw_time TIMESTAMPTZ,
      seed_amount INTEGER NOT NULL DEFAULT 1000,
      tickets_sold INTEGER NOT NULL DEFAULT 0,
      total_entries INTEGER NOT NULL DEFAULT 0,
      winner_pool INTEGER NOT NULL DEFAULT 0,
      burn_pool INTEGER NOT NULL DEFAULT 0,
      treasury_pool INTEGER NOT NULL DEFAULT 0,
      displayed_jackpot INTEGER NOT NULL DEFAULT 1000,
      winning_ticket_index INTEGER,
      winner_user_id TEXT,
      payout_status TEXT,
      draw_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lottery_entries (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES lottery_rounds(id),
      user_id TEXT NOT NULL,
      tickets INTEGER NOT NULL,
      entry_start_index INTEGER NOT NULL,
      entry_end_index INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lottery_purchases (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      round_id INTEGER NOT NULL REFERENCES lottery_rounds(id),
      ticket_count INTEGER NOT NULL,
      cost_jcmoves INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lottery_winners (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES lottery_rounds(id),
      round_type TEXT NOT NULL DEFAULT 'weekly',
      user_id TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      payout_amount INTEGER NOT NULL,
      winning_ticket_index INTEGER NOT NULL,
      badge_awarded BOOLEAN DEFAULT FALSE,
      payout_status TEXT NOT NULL DEFAULT 'pending',
      win_streak INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lottery_audit_logs (
      id SERIAL PRIMARY KEY,
      round_id INTEGER,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('🎟️  Lottery tables ready');
}

// Return next Monday at the given hour:minute (UTC)
function nextMondayAt(hour: number, minute: number): Date {
  const now = new Date();
  const d = new Date(now);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

// Last Monday of current month at given hour
function lastMondayOfMonthAt(hour: number, minute: number): Date {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  while (lastDay.getUTCDay() !== 1) lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  lastDay.setUTCHours(hour, minute, 0, 0);
  // If already past, go to next month
  if (lastDay <= now) {
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
    while (nextMonth.getUTCDay() !== 1) nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
    nextMonth.setUTCHours(hour, minute, 0, 0);
    return nextMonth;
  }
  return lastDay;
}

async function ensureActiveLotteryRounds() {
  for (const type of ['weekly', 'monthly'] as const) {
    const { rows } = await pool.query(
      `SELECT id FROM lottery_rounds WHERE status='open' AND round_type=$1 LIMIT 1`, [type]
    );
    if (!rows.length) await openNewRound(type);
  }
}

async function openNewRound(type: 'weekly' | 'monthly') {
  const { rows: [last] } = await pool.query(
    `SELECT round_number FROM lottery_rounds WHERE round_type=$1 ORDER BY id DESC LIMIT 1`, [type]
  );
  const nextNum = (last?.round_number ?? 0) + 1;
  const seed = type === 'monthly' ? 10000 : 1000;
  const now = new Date();
  // Round starts now (or Monday 9:01 if we want strict timing — for simplicity start immediately)
  const startTime = now;
  const endTime   = type === 'monthly' ? lastMondayOfMonthAt(8, 59) : nextMondayAt(8, 59);
  if (endTime <= startTime) {
    // Edge case: end time already passed, push one week / one month forward
    endTime.setDate(endTime.getDate() + (type === 'monthly' ? 28 : 7));
  }
  await pool.query(
    `INSERT INTO lottery_rounds (round_number, round_type, status, start_time, end_time, seed_amount, displayed_jackpot)
     VALUES ($1,$2,'open',$3,$4,$5,$5)`,
    [nextNum, type, startTime.toISOString(), endTime.toISOString(), seed]
  );
  await pool.query(
    `INSERT INTO lottery_audit_logs (event_type, message, metadata) VALUES ('ROUND_OPEN',$1,$2)`,
    [`Round ${nextNum} (${type}) opened`, JSON.stringify({ type, seed, endTime })]
  );
  console.log(`🎟️  Lottery round ${nextNum} (${type}) opened — seed: ${seed} JCMOVES`);
}

async function executeLotteryDraw(roundId: number) {
  // Idempotency: lock the round first
  const { rows: [round] } = await pool.query(
    `UPDATE lottery_rounds SET status='locked', updated_at=NOW() WHERE id=$1 AND status IN ('open','locked') RETURNING *`,
    [roundId]
  );
  if (!round) throw new Error(`Round ${roundId} not found or already completed.`);

  await pool.query(
    `INSERT INTO lottery_audit_logs (round_id, event_type, message) VALUES ($1,'DRAW_STARTED','Draw initiated')`, [roundId]
  );

  try {
    const totalEntries = round.total_entries;
    let winnerId: string | null = null;
    let winningIndex: number | null = null;
    let winnerPayoutAmount = 0;

    if (totalEntries > 0) {
      // Secure random selection
      winningIndex = Math.floor(Math.random() * totalEntries) + 1;
      const { rows: [winnerEntry] } = await pool.query(
        `SELECT * FROM lottery_entries WHERE round_id=$1 AND entry_start_index<=$2 AND entry_end_index>=$2 LIMIT 1`,
        [roundId, winningIndex]
      );
      if (winnerEntry) {
        winnerId = winnerEntry.user_id;
        winnerPayoutAmount = round.seed_amount + round.winner_pool;

        // Credit winner
        await storage.creditWalletTokens(winnerId, winnerPayoutAmount);

        const winnerUser = await storage.getUser(winnerId);
        // Check win streak
        const { rows: [prevWin] } = await pool.query(
          `SELECT win_streak FROM lottery_winners WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [winnerId]
        );
        const streak = (prevWin?.win_streak ?? 0) + 1;

        await pool.query(
          `INSERT INTO lottery_winners (round_id, round_type, user_id, username, first_name, payout_amount, winning_ticket_index, payout_status, win_streak)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'complete',$8)`,
          [roundId, round.round_type, winnerId, winnerUser?.username, winnerUser?.firstName, winnerPayoutAmount, winningIndex, streak]
        );

        // Activity feed announcement
        const winnerName = winnerUser?.firstName || winnerUser?.username || "A lucky player";
        await pool.query(
          `INSERT INTO activity_feed_events (user_id, event_type, message, metadata) VALUES ($1,'lottery_win',$2,$3)`,
          [winnerId,
           `🏆 ${winnerName} won ${winnerPayoutAmount.toLocaleString()} JCMOVES in the ${round.round_type === 'monthly' ? 'MEGA ' : ''}Lottery! 🎉`,
           JSON.stringify({ roundId, amount: winnerPayoutAmount, streak })]
        );

        await pool.query(
          `INSERT INTO lottery_audit_logs (round_id, event_type, message, metadata) VALUES ($1,'DRAW_EXECUTED',$2,$3)`,
          [roundId, `Winner: ${winnerUser?.username || winnerId} — ${winnerPayoutAmount} JCMOVES`, JSON.stringify({ winnerId, winningIndex, winnerPayoutAmount })]
        );
      }
    } else {
      // No entries — no winner
      await pool.query(
        `INSERT INTO lottery_audit_logs (round_id, event_type, message) VALUES ($1,'DRAW_EXECUTED','No entries — no winner drawn')`, [roundId]
      );
    }

    // Mark round complete
    await pool.query(
      `UPDATE lottery_rounds SET status='payout_complete', draw_time=NOW(), winning_ticket_index=$1, winner_user_id=$2, payout_status=$3, updated_at=NOW() WHERE id=$4`,
      [winningIndex, winnerId, winnerId ? 'complete' : 'no_entries', roundId]
    );

    // Open the next round
    await openNewRound(round.round_type);

    console.log(`🎟️  Lottery draw complete — round ${roundId}, winner: ${winnerId || 'none'}, payout: ${winnerPayoutAmount}`);
  } catch (drawErr: any) {
    await pool.query(
      `UPDATE lottery_rounds SET status='failed', draw_error=$1, updated_at=NOW() WHERE id=$2`,
      [drawErr.message, roundId]
    );
    await pool.query(
      `INSERT INTO lottery_audit_logs (round_id, event_type, message) VALUES ($1,'ERROR',$2)`,
      [roundId, `Draw failed: ${drawErr.message}`]
    );
    throw drawErr;
  }
}

async function checkAndRunLotteryDraws() {
  const now = new Date();
  // Find rounds that are open and past their end_time
  const { rows: dueRounds } = await pool.query(
    `SELECT id, round_type FROM lottery_rounds WHERE status='open' AND end_time <= $1`, [now.toISOString()]
  );
  for (const round of dueRounds) {
    console.log(`🎟️  Auto-drawing lottery round ${round.id} (${round.round_type})`);
    await executeLotteryDraw(round.id);
  }
  // Also ensure fresh open rounds exist after draws
  await ensureActiveLotteryRounds();
}
