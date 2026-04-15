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

/** Maximum fraction of a job subtotal that can be offset with tokens per booking. */
export const MAX_SUBTOTAL_PCT = 0.20;

/**
 * Round `tokens` DOWN to the nearest REDEMPTION_INCREMENT.
 * e.g.  1_750 → 1_500,  500 → 500,  499 → 0
 */
export function roundToIncrement(tokens: number): number {
  return Math.floor(tokens / REDEMPTION_INCREMENT) * REDEMPTION_INCREMENT;
}

/**
 * Maximum tokens that may be applied as a service discount for a given subtotal.
 * The result is already rounded to the nearest increment.
 */
export function maxTokensForSubtotal(subtotalUsd: number): number {
  const raw = subtotalUsd * MAX_SUBTOTAL_PCT * PLATFORM_REDEEM_RATE;
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
    const cap = maxTokensForSubtotal(subtotalUsd);
    if (effective > cap) effective = cap;
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
