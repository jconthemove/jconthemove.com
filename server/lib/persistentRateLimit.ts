import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db } from "../db";
import { rateLimitBuckets } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export function getClientIp(req: Request): string {
  // Prefer Express's req.ip, which already honors the app's
  // `trust proxy` setting (server/index.ts sets it to 1). This avoids
  // trusting raw X-Forwarded-For from the public internet, which would
  // let an attacker spoof the header to evade per-IP throttling.
  // Fall back to the raw socket address if for some reason req.ip is
  // unavailable, then to a fixed sentinel so the bucket key is stable.
  return req.ip || req.socket?.remoteAddress || "unknown";
}

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
/**
 * Express middleware factory that enforces a persistent sliding-window
 * rate limit on a route. Identifier defaults to the client IP, but a
 * caller can supply a function to compose composite keys (e.g. ip+phone).
 *
 * On limit hit, responds with 429, a friendly JSON body, and a
 * Retry-After header so well-behaved clients back off automatically.
 */
export interface IpRateLimitOptions {
  scope: string;
  windowMs: number;
  maxHits: number;
  message?: string;
  identifier?: (req: Request) => string;
}

export function ipRateLimit(opts: IpRateLimitOptions): RequestHandler {
  const retryAfterSec = Math.max(1, Math.ceil(opts.windowMs / 1000));
  const message = opts.message ?? "Too many requests. Please try again in a moment.";
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = (opts.identifier ? opts.identifier(req) : getClientIp(req)) || "unknown";
      const allowed = await checkSlidingWindow(opts.scope, id, opts.windowMs, opts.maxHits);
      if (!allowed) {
        res.setHeader("Retry-After", retryAfterSec.toString());
        return res.status(429).json({ error: message, retryAfterSec });
      }
      return next();
    } catch (err) {
      // Fail-open on any unexpected middleware error so a rate-limit
      // bug never takes down the booking funnel.
      console.error("[rate-limit] middleware error, failing open:", (err as Error).message);
      return next();
    }
  };
}

export async function pruneStaleBuckets(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM rate_limit_buckets WHERE updated_at < now() - (${Math.floor(maxAgeMs / 1000)} || ' seconds')::interval`,
    );
  } catch (err) {
    console.error("[rate-limit] prune error:", (err as Error).message);
  }
}
