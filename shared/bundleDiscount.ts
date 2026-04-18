// Shared bundle-discount engine.
//
// Customers earn 10% off the current quote (capped at $50) when they bundle
// a service — either by ticking another service in the same form (intent) or
// by having booked another JC service in the last 90 days (cross-service
// repeat). The eligibility check (server-side, queries multiple tables) lives
// in server/services/bundleDiscount.ts. This file only owns the deterministic
// math so the same numbers can be computed from either the client or server.

export const BUNDLE_DISCOUNT_PERCENT = 10;
export const BUNDLE_DISCOUNT_MAX_DOLLARS = 50;

export type BundleDiscountReason = "bundle_intent" | "cross_service_history";

export interface BundleDiscountResult {
  applied: boolean;
  percent: number;          // 0 or BUNDLE_DISCOUNT_PERCENT
  amount: number;           // dollars off (>= 0)
  finalTotal: number;       // subtotal - amount, never negative
  reason: BundleDiscountReason | null;
}

export function calculateBundleDiscount(
  subtotal: number,
  eligible: boolean,
  reason: BundleDiscountReason | null = null,
): BundleDiscountResult {
  const safeSubtotal = Math.max(0, Number.isFinite(subtotal) ? subtotal : 0);
  if (!eligible || safeSubtotal <= 0) {
    return { applied: false, percent: 0, amount: 0, finalTotal: safeSubtotal, reason: null };
  }
  const rawAmount = safeSubtotal * (BUNDLE_DISCOUNT_PERCENT / 100);
  const cappedAmount = Math.min(rawAmount, BUNDLE_DISCOUNT_MAX_DOLLARS);
  const amount = Math.round(cappedAmount * 100) / 100;
  return {
    applied: true,
    percent: BUNDLE_DISCOUNT_PERCENT,
    amount,
    finalTotal: Math.max(0, Math.round((safeSubtotal - amount) * 100) / 100),
    reason,
  };
}

export function bundleDiscountReasonLabel(reason: BundleDiscountReason | null): string {
  if (reason === "cross_service_history") return "Loyal-customer bundle (booked another JC service in the last 90 days)";
  if (reason === "bundle_intent") return "Bundle add-on selected";
  return "Bundle discount";
}
