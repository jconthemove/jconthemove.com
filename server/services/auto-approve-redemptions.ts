/**
 * Auto-Approval Service for Reward Redemptions
 *
 * Rules — applied to EVERY new redemption on submission:
 *  - Redemptions under the configurable threshold (default 5,000 tokens):
 *      - If the item's natural status is "completed" or "redeemed_pending_schedule",
 *        that status is preserved (the item is already resolved by its own logic).
 *      - Otherwise the status is promoted to "approved" immediately.
 *  - Redemptions at or above the threshold are ALWAYS queued as `pending_approval`
 *    for manual admin review, regardless of item flags.
 *  - Suspicious patterns are flagged with an admin_notes explanation:
 *    1. Multiple large requests (>= threshold) from the same user within 24 hours.
 *    2. Brand-new account (< 7 days old) requesting >= threshold tokens.
 *
 * The threshold is stored in `rewardSettings` under the key
 * `redemption_auto_approve_threshold` so it is configurable without a code deploy.
 */

import { db } from "../db";
import { rewardSettings, rewardRedemptions, users } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

const DEFAULT_THRESHOLD = 5000;

async function getAutoApproveThreshold(): Promise<number> {
  try {
    const [row] = await db
      .select()
      .from(rewardSettings)
      .where(eq(rewardSettings.settingKey, "redemption_auto_approve_threshold"))
      .limit(1);
    if (row && row.isActive) return parseFloat(row.tokenAmount) || DEFAULT_THRESHOLD;
  } catch (err) {
    console.warn("[AutoApprove] Failed to read threshold from rewardSettings, using default:", DEFAULT_THRESHOLD, err);
  }
  return DEFAULT_THRESHOLD;
}

export interface AutoApproveResult {
  status: string;
  adminNotes: string | null;
}

export async function evaluateRedemption(
  redemptionId: number,
  userId: string,
  tokenCost: number,
  currentStatus: string
): Promise<AutoApproveResult> {
  const threshold = await getAutoApproveThreshold();

  if (tokenCost < threshold) {
    // Below threshold: preserve terminal statuses (completed / scheduled); approve pending ones
    if (currentStatus === "completed" || currentStatus === "redeemed_pending_schedule") {
      return { status: currentStatus, adminNotes: null };
    }
    const note = `Auto-approved: ${tokenCost} tokens is under the ${threshold}-token threshold.`;
    await db
      .update(rewardRedemptions)
      .set({ status: "approved", adminNotes: note })
      .where(eq(rewardRedemptions.id, redemptionId));
    return { status: "approved", adminNotes: note };
  }

  // At or above threshold — always hold for manual admin review regardless of item type
  const suspicionReasons: string[] = [];

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentLargeRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rewardRedemptions)
    .where(
      and(
        eq(rewardRedemptions.userId, userId),
        gte(rewardRedemptions.tokenCost, threshold),
        gte(rewardRedemptions.createdAt!, since24h)
      )
    );
  const recentLargeCount = Number(recentLargeRow?.count ?? 0);
  if (recentLargeCount > 1) {
    suspicionReasons.push(`User has made ${recentLargeCount} large redemptions (>=${threshold} tokens) in the past 24 hours.`);
  }

  const [userRow] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRow?.createdAt) {
    const ageMs = Date.now() - new Date(userRow.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) {
      suspicionReasons.push(`Account is less than 7 days old (${ageDays.toFixed(1)} days).`);
    }
  }

  const wasPreviouslyResolved = currentStatus === "completed" || currentStatus === "redeemed_pending_schedule";
  const baseNote = wasPreviouslyResolved
    ? `Held for review — item marked '${currentStatus}' by item logic but token cost ${tokenCost} meets or exceeds the ${threshold}-token threshold.`
    : `Held for review — token cost ${tokenCost} meets or exceeds threshold of ${threshold}. Awaiting admin approval.`;

  const notes = suspicionReasons.length > 0
    ? `${baseNote} Suspicious activity: ${suspicionReasons.join(" ")}`
    : baseNote;

  await db
    .update(rewardRedemptions)
    .set({ status: "pending_approval", adminNotes: notes })
    .where(eq(rewardRedemptions.id, redemptionId));

  return { status: "pending_approval", adminNotes: notes };
}
