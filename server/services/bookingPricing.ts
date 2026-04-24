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

/** Per-service minimum line-subtotal floors (USD). The spec for Junk Removal
 *  is a hard 2 mover-hour minimum at $85/hr → $170. The pricing engine clamps
 *  any priced junk_removal line up to this floor so an under-priced quote
 *  (typo, stale promo, or client-side draft) can never sneak below the floor
 *  on the booking that actually gets persisted. */
export const SERVICE_LINE_MINIMUMS: Record<string, number> = {
  junk_removal: 170,
};

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
  /** Task #218 — labor-hours breakdown for the customer-facing card.
   *  Always populated by routes/bookings.ts:resolveItems before the
   *  engine sees the input so the response can render
   *  "2 movers × 4 hrs at $85/hr". Optional here only so unit tests of
   *  the pure engine don't have to fabricate it. */
  laborMeta?: {
    crewSize: number;
    laborHours: number;
    totalLaborHours: number;
    ratePerHour: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Task #131 — shared customer-reward calculator. Lives in the pricing
// engine so the quote endpoint (estimate) and the disbursement service
// (final award) compute the exact same number with identical rounding.
// ─────────────────────────────────────────────────────────────────────────
export interface BookingRewardInput {
  /** Post-discount, post-override total the customer will actually pay. */
  finalTotal: number;
  /** Flat customer-quote-accepted bonus (default 250). */
  flatBonus: number;
  /** Per-dollar loyalty earn rate (default EARN_RATE_PER_DOLLAR). */
  earnRate: number;
  /** Bundle bonus multiplier when a bundle wins (≥ 1, default 1). */
  bonusMultiplier: number;
  /** True iff a discount-override audit row exists for the booking. */
  hasOverride: boolean;
}

export interface BookingRewardResult {
  flatAward: number;
  earnAward: number;
  totalAward: number;
  /** The multiplier actually applied (1 when override / no bundle). */
  appliedMultiplier: number;
}

export function computeBookingReward(input: BookingRewardInput): BookingRewardResult {
  const { finalTotal, flatBonus, earnRate, bonusMultiplier, hasOverride } = input;
  const baseFlat = Math.round(flatBonus);
  // Step 6 guardrail — narrow form: only fully-zeroed bookings (finalTotal ≤ 0)
  // collapse to flat-only. A partial admin override still pays the per-dollar
  // earn against the new (lower) total — only the bundle bonus multiplier is
  // suppressed. This keeps benign discount adjustments from punishing the
  // customer's earn while still blocking runaway bonus economics on
  // overrides and zero-priced bookings.
  if (finalTotal <= 0) {
    return { flatAward: baseFlat, earnAward: 0, totalAward: baseFlat, appliedMultiplier: 1 };
  }
  const m = hasOverride
    ? 1
    : Number.isFinite(bonusMultiplier) && bonusMultiplier > 1
      ? bonusMultiplier
      : 1;
  const baseEarn = Math.round(finalTotal * earnRate);
  // Apply the multiplier once, on the combined base, then round once.
  const totalAward = Math.round((baseFlat + baseEarn) * m);
  // Split the total proportionally so the issuer can credit two reward
  // rows (flat vs earn) that still sum to the unified total.
  const flatAward = Math.min(totalAward, Math.round(baseFlat * m));
  const earnAward = Math.max(0, totalAward - flatAward);
  return { flatAward, earnAward, totalAward, appliedMultiplier: m };
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
  /** Task #131 — bonus JCMOVES multiplier applied to the customer reward
   *  when this bundle wins. Default 1 (no bonus). */
  bonusMultiplier?: number;
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
  /** Task #131 — multiplier the booking will receive on its base JCMOVES
   *  award (1.0 when no bonus). Surfaced so the booking summary can show
   *  the customer "Earn 1.25× JCMOVES on this bundle". */
  bonusMultiplier: number;
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
  const raw = round2(qty * unit);
  // Honor per-service minimums (e.g. junk_removal $170 floor). Skip when
  // priceMode is "quote" AND raw is 0 — those are still pending pricing and
  // are not yet a charge. Once a quoted line has any positive amount, we
  // clamp it up to the floor.
  const floor = SERVICE_LINE_MINIMUMS[item.serviceCode];
  if (floor != null && raw > 0 && raw < floor) {
    return round2(floor);
  }
  return raw;
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
    const bonusMultiplier = Math.max(1, Number.isFinite(best.bundle.bonusMultiplier) && best.bundle.bonusMultiplier != null
      ? best.bundle.bonusMultiplier
      : 1);
    bundleApplied = {
      code: best.bundle.code,
      name: best.bundle.name,
      serviceCombo: best.bundle.serviceCombo,
      discountType: best.bundle.discountType,
      discountValue: best.bundle.discountValue,
      rawDiscount: best.rawDiscount,
      guardrailClamped: clamped < best.rawDiscount,
      merchandisingSlot: best.bundle.merchandisingSlot ?? null,
      bonusMultiplier,
    };
  }

  const finalTotal = round2(Math.max(0, subtotal - discountTotal));
  // Use the shared reward calculator so the estimate the customer sees here
  // and the final award issued by disburseBookingTokens stay byte-identical.
  const reward = computeBookingReward({
    finalTotal,
    flatBonus,
    earnRate,
    bonusMultiplier: bundleApplied?.bonusMultiplier ?? 1,
    hasOverride: false,
  });
  const tokenEstimate = reward.totalAward;

  return {
    subtotal,
    discountTotal,
    bundleApplied,
    finalTotal,
    tokenEstimate,
    items,
  };
}
