/**
 * server/services/recompute-tier.ts
 *
 * Activity-based tier progression per the JCMOVES spec:
 *   Bronze: default (1–2 jobs/yr)
 *   Silver: 2–4 jobs/yr  OR  1+ confirmed referrals
 *   Gold:   3+ jobs in last 6 months  OR  2+ confirmed referrals
 *   VIP:    4+ jobs in last 6 months  AND  2+ confirmed referrals
 *
 * Replaces the legacy spend-based getTierFromSpend() function. Called from the
 * job-completion path (disburse-job-tokens) and after referral confirmation.
 */
import { pool } from "../db";
import type { LoyaltyTier } from "../constants";

export async function recomputeUserTier(userId: string): Promise<LoyaltyTier> {
  // Count completed jobs in rolling 6-month and 12-month windows.
  // A "completed job" = a lead owned by this user (matched by email) whose
  // status is 'completed' or 'paid'.
  const { rows: userRows } = await pool.query<{ email: string | null; referral_count: number | null }>(
    `SELECT email, referral_count FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  if (!userRows.length) return 'bronze';
  const email = userRows[0].email;
  const refCount = userRows[0].referral_count ?? 0;

  let jobs6mo = 0;
  let jobs12mo = 0;

  if (email) {
    const { rows: jobRows } = await pool.query<{ jobs6mo: string; jobs12mo: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(updated_at, created_at) >= NOW() - INTERVAL '6 months') AS jobs6mo,
         COUNT(*) FILTER (WHERE COALESCE(updated_at, created_at) >= NOW() - INTERVAL '12 months') AS jobs12mo
       FROM leads
       WHERE LOWER(email) = LOWER($1)
         AND status IN ('completed', 'paid')`,
      [email]
    );
    jobs6mo = parseInt(jobRows[0]?.jobs6mo ?? '0', 10);
    jobs12mo = parseInt(jobRows[0]?.jobs12mo ?? '0', 10);
  }

  let tier: LoyaltyTier = 'bronze';
  if (jobs6mo >= 4 && refCount >= 2) tier = 'vip';
  else if (jobs6mo >= 3 || refCount >= 2) tier = 'gold';
  else if (jobs12mo >= 2 || refCount >= 1) tier = 'silver';
  else tier = 'bronze';

  await pool.query(`UPDATE users SET loyalty_tier = $1 WHERE id = $2`, [tier, userId]);
  return tier;
}

/**
 * Backfill tiers for users who have at least one completed job. Called once at
 * startup as a low-priority background task.
 */
export async function backfillTiers(): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN leads l ON LOWER(l.email) = LOWER(u.email)
       WHERE l.status IN ('completed', 'paid')`
    );
    let n = 0;
    for (const row of rows) {
      try { await recomputeUserTier(row.id); n++; } catch { /* per-user skip */ }
    }
    if (n > 0) console.log(`[tier-backfill] Recomputed tier for ${n} users with completed jobs`);
  } catch (err) {
    console.error('[tier-backfill] failed (non-fatal):', err);
  }
}
