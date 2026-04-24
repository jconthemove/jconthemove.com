// Smoke test for the BUNDLE_SEED rows (Task #216).
//
// Iterates over every featured bundle in BUNDLE_SEED, builds a sample cart
// containing the exact required services, runs the cart through the same
// `computeBookingQuote` resolver the booking quote endpoint uses, and asserts
// that the resolver picks the matching bundle code AND produces the expected
// discount. Catches regressions if BUNDLE_SEED is edited or the resolver's
// matching/clamping logic changes.
//
// Run it with:
//
//     npx tsx server/services/__tests__/bundleSeed.test.ts
//
// Exits non-zero if any assertion fails.

import assert from "node:assert/strict";
import {
  computeBookingQuote,
  MAX_BUNDLE_DISCOUNT_PCT,
  type BundleDefinitionLike,
  type BookingPricingItemInput,
} from "../bookingPricing";
import { BUNDLE_SEED } from "../bookingCatalogSeed";
import type { InsertBundleDefinition } from "@shared/schema";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mirror routes/bookings.ts → toBundleLike(): the seed rows are persisted as
// `InsertBundleDefinition` (numeric strings, jsonb combo) but the pure resolver
// expects `BundleDefinitionLike` (numbers, plain string[]). Same shape mapping
// the production loadBundles() uses, so the test exercises the real path.
function seedRowToBundleLike(row: InsertBundleDefinition): BundleDefinitionLike {
  const combo = Array.isArray(row.serviceComboJson)
    ? (row.serviceComboJson as string[])
    : [];
  return {
    code: row.code,
    name: row.name,
    serviceCombo: combo,
    discountType: row.discountType as "percent" | "fixed",
    discountValue:
      typeof row.discountValue === "string"
        ? parseFloat(row.discountValue)
        : (row.discountValue as number),
    maxDiscount:
      row.maxDiscount == null
        ? null
        : typeof row.maxDiscount === "string"
          ? parseFloat(row.maxDiscount)
          : (row.maxDiscount as number),
    priority: row.priority ?? 100,
    isActive: row.isActive ?? true,
    merchandisingSlot: row.merchandisingSlot ?? null,
  };
}

const ALL_BUNDLES: BundleDefinitionLike[] = BUNDLE_SEED.map(seedRowToBundleLike);

// Generous per-line price so the percent bundles aren't clipped by the global
// 25% guardrail. With $1000/line on 2 services (= $2000 subtotal), the cap is
// $500 — well above any seeded discount.
const SAMPLE_UNIT_PRICE = 1000;

function item(serviceCode: string, unitPrice = SAMPLE_UNIT_PRICE): BookingPricingItemInput {
  return { serviceCode, label: serviceCode, unitPrice, quantity: 1 };
}

/** Compute what the resolver SHOULD return for a single isolated bundle, so
 *  the assertion is derived from the seeded numbers rather than hard-coded. */
function expectedDiscountFor(bundle: BundleDefinitionLike, subtotal: number): number {
  const value = bundle.discountValue;
  let raw =
    bundle.discountType === "percent" ? subtotal * (value / 100) : value;
  if (bundle.maxDiscount != null) {
    raw = Math.min(raw, bundle.maxDiscount);
  }
  // Global guardrail (matches MAX_BUNDLE_DISCOUNT_PCT).
  const guardrailCap = subtotal * (MAX_BUNDLE_DISCOUNT_PCT / 100);
  raw = Math.min(raw, guardrailCap);
  return Math.round(raw * 100) / 100;
}

console.log("BUNDLE_SEED resolver smoke test");
console.log(`  (covering ${BUNDLE_SEED.length} featured bundle${BUNDLE_SEED.length === 1 ? "" : "s"})`);

// Sanity: seed isn't accidentally empty after a refactor.
test("BUNDLE_SEED has at least the 7 featured bundles", () => {
  assert.ok(BUNDLE_SEED.length >= 7, `expected ≥ 7 seeded bundles, got ${BUNDLE_SEED.length}`);
});

for (const seedRow of BUNDLE_SEED) {
  const bundle = seedRowToBundleLike(seedRow);
  const combo = bundle.serviceCombo;

  test(`bundle "${bundle.code}" — ${combo.join(" + ")} → resolves to itself with the seeded discount`, () => {
    assert.ok(combo.length >= 2, `bundle ${bundle.code} must require ≥ 2 services`);

    const cartItems = combo.map((code) => item(code));
    const subtotal = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const expectedDiscount = expectedDiscountFor(bundle, subtotal);

    const result = computeBookingQuote(cartItems, { bundleDefinitions: ALL_BUNDLES });

    assert.equal(result.subtotal, subtotal, "subtotal should equal sum of line items");
    assert.ok(
      result.bundleApplied,
      `expected bundle "${bundle.code}" to apply but resolver returned null`,
    );
    assert.equal(
      result.bundleApplied!.code,
      bundle.code,
      `wrong bundle picked for cart ${JSON.stringify(combo)}`,
    );
    assert.equal(
      result.bundleApplied!.discountType,
      bundle.discountType,
      "discountType should match the seeded row",
    );
    assert.equal(
      result.discountTotal,
      expectedDiscount,
      `discount mismatch for ${bundle.code}`,
    );
    assert.ok(
      expectedDiscount > 0,
      `seeded bundle ${bundle.code} produced a $0 discount — sample cart prices are too low`,
    );
    assert.equal(
      result.finalTotal,
      Math.round((subtotal - expectedDiscount) * 100) / 100,
      "finalTotal = subtotal − discount",
    );
  });
}

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some bundleSeed tests FAILED.");
} else {
  console.log("All bundleSeed tests passed.");
}
