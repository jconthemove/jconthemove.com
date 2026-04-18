import { db } from "../db";
import { rateLimitBuckets } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// Persistent rate-limit primitives backed by Postgres so throttle state
// survives process restarts and is shared across processes. If the DB
// is unreachable we fail-open (allow the request) and log — better to
// serve a customer than to lock everyone out on a transient DB blip.

function bucketKey(scope: string, identifier: string): string {
  return `${scope}:${identifier}`;
}

/**
 * Sliding-window limiter. Returns true if the call is allowed (and records
 * the hit), false if the caller has hit the limit within the window.
 */
export async function checkSlidingWindow(
  scope: string,
  identifier: string,
  windowMs: number,
  maxHits: number,
): Promise<boolean> {
  const key = bucketKey(scope, identifier);
  const now = Date.now();
  const cutoff = now - windowMs;
  try {
    const rows = await db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, key))
      .limit(1);
    const existing = rows[0]?.hits || [];
    const recent = existing.filter((t) => t > cutoff);
    if (recent.length >= maxHits) {
      // Persist the trimmed window so it doesn't grow unboundedly even
      // when every call is being rejected.
      await db
        .insert(rateLimitBuckets)
        .values({ key, hits: recent, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: rateLimitBuckets.key,
          set: { hits: recent, updatedAt: new Date() },
        });
      return false;
    }
    const next = [...recent, now];
    await db
      .insert(rateLimitBuckets)
      .values({ key, hits: next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: { hits: next, updatedAt: new Date() },
      });
    return true;
  } catch (err) {
    console.error("[rate-limit] sliding-window DB error, failing open:", (err as Error).message);
    return true;
  }
}

/**
 * Cooldown limiter. Returns the number of milliseconds the caller must
 * wait (0 if allowed). When allowed, the caller is expected to call
 * `markCooldown` once the underlying action has succeeded so a failed
 * action doesn't burn the cooldown slot.
 */
export async function checkCooldown(
  scope: string,
  identifier: string,
  cooldownMs: number,
): Promise<number> {
  const key = bucketKey(scope, identifier);
  try {
    const rows = await db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, key))
      .limit(1);
    const last = rows[0]?.lastAt || 0;
    const wait = cooldownMs - (Date.now() - last);
    return wait > 0 ? wait : 0;
  } catch (err) {
    console.error("[rate-limit] cooldown DB error, failing open:", (err as Error).message);
    return 0;
  }
}

export async function markCooldown(scope: string, identifier: string): Promise<void> {
  const key = bucketKey(scope, identifier);
  const now = Date.now();
  try {
    await db
      .insert(rateLimitBuckets)
      .values({ key, lastAt: now, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: { lastAt: now, updatedAt: new Date() },
      });
  } catch (err) {
    console.error("[rate-limit] markCooldown DB error:", (err as Error).message);
  }
}

/**
 * Best-effort housekeeping — drops rows that haven't been touched in a
 * while so the table doesn't accumulate dead rows from one-off IPs.
 * Safe to call opportunistically; tolerates DB errors.
 */
export async function pruneStaleBuckets(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM rate_limit_buckets WHERE updated_at < now() - (${Math.floor(maxAgeMs / 1000)} || ' seconds')::interval`,
    );
  } catch (err) {
    console.error("[rate-limit] prune error:", (err as Error).message);
  }
}
