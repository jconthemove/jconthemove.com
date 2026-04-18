/**
 * shared/tokenRedemptionRules.ts — Canonical JCMOVES redemption rules.
 *
 * Imported by both the frontend (for UI display) and backend (for server-side
 * enforcement) to ensure consistent behavior.
 *
 * Rules (from JCMOVES master system document):
 *  1. Minimum: 500 JCMOVES per redemption
 *  2. Increment: amounts must be multiples of 500 (rounded down automatically)
 *  3. Cap: no more than 20% of the job subtotal (in USD) can be offset per booking
 *  4. Rate: 500 JCMOVES = $1.00 platform service credit
 */

/** Platform redemption rate: JCMOVES tokens per $1.00 of service credit. */
export const PLATFORM_REDEEM_RATE = 500;

/** Minimum JCMOVES allowed per single redemption action. */
export const MIN_REDEMPTION_TOKENS = 500;

/** All redemption amounts must be multiples of this value. */
export const REDEMPTION_INCREMENT = 500;

/** Legacy flat cap — kept for back-compat. New code should use TIER_COVERAGE_PCT. */
export const MAX_SUBTOTAL_PCT = 0.20;

/**
 * Per-tier max fraction of a job subtotal that can be offset with JCMOVES tokens.
 * Bronze 50% · Silver 60% · Gold 75% · VIP 100%.
 */
export const TIER_COVERAGE_PCT = {
  bronze: 0.50,
  silver: 0.60,
  gold:   0.75,
  vip:    1.00,
} as const;

export type TierKey = keyof typeof TIER_COVERAGE_PCT;

export function coveragePctForTier(tier: string | null | undefined): number {
  const t = (tier ?? 'bronze') as TierKey;
  return TIER_COVERAGE_PCT[t] ?? TIER_COVERAGE_PCT.bronze;
}

/**
 * Round `tokens` DOWN to the nearest REDEMPTION_INCREMENT.
 * e.g.  1_750 → 1_500,  500 → 500,  499 → 0
 */
export function roundToIncrement(tokens: number): number {
  return Math.floor(tokens / REDEMPTION_INCREMENT) * REDEMPTION_INCREMENT;
}

/**
 * Maximum tokens that may be applied as a service discount for a given subtotal.
 * If `tier` is provided, uses that tier's coverage percentage; otherwise falls back
 * to the legacy flat 20% cap. Result is rounded down to REDEMPTION_INCREMENT.
 */
export function maxTokensForSubtotal(subtotalUsd: number, tier?: string | null): number {
  const pct = tier ? coveragePctForTier(tier) : MAX_SUBTOTAL_PCT;
  const raw = subtotalUsd * pct * PLATFORM_REDEEM_RATE;
  return roundToIncrement(raw);
}

/**
 * Convert a JCMOVES token amount to its platform dollar value.
 * Uses the fixed platform rate (NOT the live market price).
 */
export function tokensToDollars(tokens: number): number {
  return tokens / PLATFORM_REDEEM_RATE;
}

/**
 * Convert a USD dollar amount to the equivalent platform token value.
 */
export function dollarsToTokens(usd: number): number {
  return usd * PLATFORM_REDEEM_RATE;
}

export interface RedemptionValidationResult {
  valid: boolean;
  effectiveTokens: number;
  effectiveUsd: number;
  message?: string;
}

/**
 * Validate and normalise a redemption amount.
 *
 * @param requestedTokens  How many tokens the user wants to redeem
 * @param subtotalUsd      Optional: service subtotal for 20% cap enforcement
 */
export function validateRedemption(
  requestedTokens: number,
  subtotalUsd?: number,
  tier?: string | null,
): RedemptionValidationResult {
  if (requestedTokens < MIN_REDEMPTION_TOKENS) {
    return {
      valid: false,
      effectiveTokens: 0,
      effectiveUsd: 0,
      message: `Minimum redemption is ${MIN_REDEMPTION_TOKENS.toLocaleString()} JCMOVES ($${tokensToDollars(MIN_REDEMPTION_TOKENS).toFixed(2)})`,
    };
  }

  let effective = roundToIncrement(requestedTokens);

  if (subtotalUsd !== undefined && subtotalUsd > 0) {
    const cap = maxTokensForSubtotal(subtotalUsd, tier);
    if (effective > cap) {
      return {
        valid: false,
        effectiveTokens: cap,
        effectiveUsd: tokensToDollars(cap),
        message: tier
          ? `Your ${tier.toUpperCase()} tier covers up to ${Math.round(coveragePctForTier(tier) * 100)}% of this job ($${tokensToDollars(cap).toFixed(2)} max). Apply ${cap.toLocaleString()} JCMOVES or upgrade your tier.`
          : `Maximum tokens for this subtotal is ${cap.toLocaleString()} JCMOVES.`,
      };
    }
  }

  if (effective < MIN_REDEMPTION_TOKENS) {
    return {
      valid: false,
      effectiveTokens: 0,
      effectiveUsd: 0,
      message: `Minimum redemption is ${MIN_REDEMPTION_TOKENS.toLocaleString()} JCMOVES — the booking subtotal cap is too low`,
    };
  }

  return {
    valid: true,
    effectiveTokens: effective,
    effectiveUsd: tokensToDollars(effective),
  };
}
