/**
 * disburseServiceTokens — Lightweight JCMOVES reward for non-lead services.
 *
 * Covers: Lawn Care, Trash Valet, and any future service that does not go
 * through the main leads table (Window Cleaning, Assembly, Snow Removal go
 * through leads so they already use disburseJobTokens on completion).
 *
 * Awards:
 *   A) Customer flat service bonus  — configurable per service type, fallback 500 JCMOVES
 *   B) Customer per-dollar earn     — earn_rate_per_dollar setting (default 15 JCMOVES / $1)
 *
 * Idempotent: each award is gated by a (referenceId, userId, rewardType) check
 * in the rewards table. Safe to call multiple times — only fires once per booking.
 */
import { db, pool } from "../db";
import { rewards, rewardSettings } from "@shared/schema";
import { storage } from "../storage";
import { EARN_RATE_PER_DOLLAR } from "../../shared/rewards";

const TOKEN_PRICE        = 0.00000508432;
const FALLBACK_EARN      = EARN_RATE_PER_DOLLAR; // JCMOVES per $1 — from shared config; DB overrides at runtime
const FALLBACK_FLAT      = 500;  // flat booking bonus

async function getSetting(key: string): Promise<number | null> {
  try {
    const rows = await db.select().from(rewardSettings).limit(1);
    const all = await db.select().from(rewardSettings);
    const found = all.find(r => r.settingKey === key && r.isActive);
    return found ? parseFloat(found.tokenAmount) : null;
  } catch { return null; }
}

async function alreadyRewarded(
  referenceId: string,
  userId: string,
  rewardType: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM rewards WHERE user_id = $1 AND reward_type = $2 AND reference_id = $3 LIMIT 1`,
    [userId, rewardType, referenceId],
  );
  return rows.length > 0;
}

export interface ServiceRewardInput {
  serviceType: string;       // e.g. 'lawn_care' | 'trash_valet' | 'ashley_shop'
  referenceId: string;       // booking/subscription/quote ID (for idempotency)
  customerEmail: string;
  totalPrice?: number;       // used for per-dollar earn rate
}

export async function disburseServiceTokens(input: ServiceRewardInput): Promise<void> {
  const { serviceType, referenceId, customerEmail, totalPrice = 0 } = input;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [customerEmail.trim()],
    );
    const customer = rows[0];

    if (!customer) {
      console.log(`ℹ️ disburseServiceTokens [${serviceType}]: no account for ${customerEmail} — skipped`);
      return;
    }

    const earnRate  = (await getSetting("earn_rate_per_dollar")) ?? FALLBACK_EARN;
    const flatBonus = (await getSetting(`service_completion_${serviceType}`)) ?? FALLBACK_FLAT;

    // A — Flat service booking bonus
    const flatDone = await alreadyRewarded(referenceId, customer.id, "service_booking_bonus");
    if (!flatDone) {
      await db.insert(rewards).values({
        userId:      customer.id,
        rewardType:  "service_booking_bonus",
        tokenAmount: flatBonus.toFixed(8),
        cashValue:   (flatBonus * TOKEN_PRICE).toFixed(6),
        status:      "confirmed",
        referenceId,
        metadata: { serviceType, type: "flat_booking" },
      });
      await storage.creditWalletTokens(customer.id, flatBonus);
      console.log(`🎁 [${serviceType}] ${customer.email} +${flatBonus} JCMOVES (flat booking bonus)`);
    }

    // B — Per-dollar loyalty earn
    if (totalPrice > 0) {
      const earnTokens = Math.round(totalPrice * earnRate);
      const earnDone = await alreadyRewarded(referenceId, customer.id, "service_loyalty_earn");
      if (!earnDone && earnTokens > 0) {
        await db.insert(rewards).values({
          userId:      customer.id,
          rewardType:  "service_loyalty_earn",
          tokenAmount: earnTokens.toFixed(8),
          cashValue:   (earnTokens * TOKEN_PRICE).toFixed(6),
          status:      "confirmed",
          referenceId,
          metadata: { serviceType, totalPrice, earnRate, type: "per_dollar" },
        });
        await storage.creditWalletTokens(customer.id, earnTokens);
        console.log(`🎁 [${serviceType}] ${customer.email} +${earnTokens} JCMOVES (earn @ $${totalPrice})`);
      }
    }

    try {
      const { notificationService } = await import("./notification");
      await notificationService.notifyRewardAvailable(customer.id, serviceType, flatBonus);
    } catch (_) {}

  } catch (err) {
    console.error(`❌ disburseServiceTokens [${serviceType}/${referenceId}] failed:`, err);
  }
}
