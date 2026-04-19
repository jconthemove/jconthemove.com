// Multi-Service Booking pricing engine (Task #128).
//
// Single source of truth for: per-line subtotal, bundle-discount selection,
// guardrail clamp, final total, and JCMOVES token estimate.
//
// Pure function — does no DB I/O. The caller (route handler) loads the
// relevant `bundle_definitions` rows and the per-item catalog metadata, then
// hands them to `computeBookingQuote`. Keeping it pure makes it trivially
// unit-testable and lets the same engine be used by both /api/bookings/quote
// (no persistence) and POST /api/bookings (persists the result).

import { EARN_RATE_PER_DOLLAR } from "../../shared/rewards";

/** Maximum total discount as a fraction of the subtotal. The spec calls this
 *  the "discount-guardrail" — caps any single bundle at 25% of the cart even
 *  if the matching bundle definition would normally award more. Stops a
 *  misconfigured bundle row from accidentally giving the cart away. */
export const MAX_BUNDLE_DISCOUNT_PCT = 25;

/** Fallback flat customer booking bonus, mirrors the
 *  `customer_quote_accepted` reward setting (250 JCMOVES today). Kept here
 *  so the pure engine has zero DB dependencies; routes can override by
 *  passing `flatBookingBonus` in options. */
export const DEFAULT_FLAT_BOOKING_BONUS = 250;

export interface BookingPricingItemInput {
  serviceCode: string;
  /** Display label snapshot (catalog name unless overridden). */
  label: string;
  quantity: number;
  unitPrice: number;
  priceMode?: "fixed" | "hourly" | "per_unit" | "quote";
  /** When false, this line is excluded from the bundle-discount base. */
  discountEligible?: boolean;
  details?: Record<string, unknown>;
}

export interface BundleDefinitionLike {
  code: string;
  name: string;
  /** Required service codes — every code listed must appear in `items`. */
  serviceCombo: string[];
  discountType: "percent" | "fixed";
  discountValue: number;
  /** Dollar cap on discount (nullable = no cap beyond the global guardrail). */
  maxDiscount?: number | null;
  priority?: number;
  isActive?: boolean;
  merchandisingSlot?: string | null;
}

export interface AppliedBundle {
  code: string;
  name: string;
  serviceCombo: string[];
  discountType: "percent" | "fixed";
  discountValue: number;
  /** Raw discount before guardrail clamp. */
  rawDiscount: number;
  /** Whether the global 25% guardrail clamped the discount. */
  guardrailClamped: boolean;
  merchandisingSlot?: string | null;
}

export interface BookingPricingItemResult extends BookingPricingItemInput {
  lineSubtotal: number;
}

export interface BookingPricingResult {
  subtotal: number;
  discountTotal: number;
  bundleApplied: AppliedBundle | null;
  finalTotal: number;
  tokenEstimate: number;
  items: BookingPricingItemResult[];
}

export interface ComputeBookingQuoteOptions {
  bundleDefinitions?: BundleDefinitionLike[];
  /** Override the default flat booking bonus (test seam). */
  flatBookingBonus?: number;
  /** Override the per-dollar earn rate (test seam). */
  earnRatePerDollar?: number;
  /** Override the global guardrail percentage (test seam). */
  maxDiscountPct?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeLineSubtotal(item: BookingPricingItemInput): number {
  const qty = Math.max(0, Number.isFinite(item.quantity) ? item.quantity : 0);
  const unit = Math.max(0, Number.isFinite(item.unitPrice) ? item.unitPrice : 0);
  return round2(qty * unit);
}

/** True when every code in `combo` appears at least once in `presentCodes`. */
function bundleMatches(combo: string[], presentCodes: Set<string>): boolean {
  if (!combo || combo.length < 2) return false; // bundles are only meaningful for 2+ services
  return combo.every((c) => presentCodes.has(c));
}

function rawDiscountForBundle(
  bundle: BundleDefinitionLike,
  eligibleSubtotal: number,
): number {
  if (eligibleSubtotal <= 0) return 0;
  const value = Math.max(0, Number.isFinite(bundle.discountValue) ? bundle.discountValue : 0);
  let raw =
    bundle.discountType === "percent"
      ? eligibleSubtotal * (value / 100)
      : value;
  if (bundle.maxDiscount != null && Number.isFinite(bundle.maxDiscount)) {
    raw = Math.min(raw, Math.max(0, bundle.maxDiscount));
  }
  return round2(Math.max(0, raw));
}

/** Pick the best matching bundle from the supplied definitions: largest raw
 *  discount wins; ties broken by `priority` (lower wins, mirrors the existing
 *  promo-code convention). */
function selectBestBundle(
  bundles: BundleDefinitionLike[],
  presentCodes: Set<string>,
  eligibleSubtotal: number,
): { bundle: BundleDefinitionLike; rawDiscount: number } | null {
  let best: { bundle: BundleDefinitionLike; rawDiscount: number } | null = null;
  for (const b of bundles) {
    if (b.isActive === false) continue;
    if (!bundleMatches(b.serviceCombo, presentCodes)) continue;
    const raw = rawDiscountForBundle(b, eligibleSubtotal);
    if (raw <= 0) continue;
    if (
      !best ||
      raw > best.rawDiscount ||
      (raw === best.rawDiscount && (b.priority ?? 100) < (best.bundle.priority ?? 100))
    ) {
      best = { bundle: b, rawDiscount: raw };
    }
  }
  return best;
}

export function computeBookingQuote(
  rawItems: BookingPricingItemInput[],
  options: ComputeBookingQuoteOptions = {},
): BookingPricingResult {
  const items: BookingPricingItemResult[] = (rawItems || []).map((item) => ({
    ...item,
    discountEligible: item.discountEligible !== false,
    lineSubtotal: computeLineSubtotal(item),
  }));

  const subtotal = round2(items.reduce((s, i) => s + i.lineSubtotal, 0));
  const eligibleSubtotal = round2(
    items.filter((i) => i.discountEligible !== false).reduce((s, i) => s + i.lineSubtotal, 0),
  );
  const presentCodes = new Set(items.map((i) => i.serviceCode));

  const bundles = options.bundleDefinitions || [];
  const maxDiscountPct = options.maxDiscountPct ?? MAX_BUNDLE_DISCOUNT_PCT;
  const earnRate = options.earnRatePerDollar ?? EARN_RATE_PER_DOLLAR;
  const flatBonus = options.flatBookingBonus ?? DEFAULT_FLAT_BOOKING_BONUS;

  const best = selectBestBundle(bundles, presentCodes, eligibleSubtotal);

  let bundleApplied: AppliedBundle | null = null;
  let discountTotal = 0;
  if (best && best.rawDiscount > 0) {
    const guardrailCap = round2(subtotal * (maxDiscountPct / 100));
    const clamped = Math.min(best.rawDiscount, guardrailCap);
    discountTotal = round2(clamped);
    bundleApplied = {
      code: best.bundle.code,
      name: best.bundle.name,
      serviceCombo: best.bundle.serviceCombo,
      discountType: best.bundle.discountType,
      discountValue: best.bundle.discountValue,
      rawDiscount: best.rawDiscount,
      guardrailClamped: clamped < best.rawDiscount,
      merchandisingSlot: best.bundle.merchandisingSlot ?? null,
    };
  }

  const finalTotal = round2(Math.max(0, subtotal - discountTotal));
  // tokenEstimate: per-dollar loyalty earn on the post-discount total + flat
  // booking bonus the customer would receive once the booking is confirmed.
  // Mirrors disburseServiceTokens so the upcoming summary UI shows a number
  // the customer will actually receive.
  const tokenEstimate = Math.round(finalTotal * earnRate) + Math.round(flatBonus);

  return {
    subtotal,
    discountTotal,
    bundleApplied,
    finalTotal,
    tokenEstimate,
    items,
  };
}
