/**
 * server/lib/idempotency.ts
 *
 * Persistent idempotency guard for reward operations.
 * Works alongside the existing advisory-lock and per-row checks as an
 * extra durable layer that survives server restarts.
 *
 * Usage:
 *   const safe = await ensureIdempotent("job-reward-abc123-user456", "job_completion");
 *   if (!safe) return; // already processed — skip silently
 *   // ... perform the reward credit ...
 */
import { pool } from "../db";

/**
 * Attempt to claim an idempotency key.
 *
 * @param key   A unique string identifying this specific operation
 *              e.g. "job-reward-{jobId}-{userId}"
 * @param scope Human-readable category for logging / querying
 *              e.g. "job_completion" | "job_accepted" | "trash_valet"
 * @returns     true  — key was new; caller should proceed with the operation
 *              false — key already existed; caller should skip (already done)
 */
export async function ensureIdempotent(key: string, scope: string): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO idempotency_keys (key, scope) VALUES ($1, $2)`,
      [key, scope],
    );
    return true;
  } catch (err: any) {
    if (err.code === "23505") {
      // unique_violation — this key was already inserted
      console.log(`[idempotency] Skipping duplicate operation. scope=${scope} key=${key}`);
      return false;
    }
    // Unexpected error — rethrow so the caller can handle it
    throw err;
  }
}
