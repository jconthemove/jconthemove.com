// Unified pricing engine — single importable surface for every quote
// surface in the app (Task #169).
//
// This module is the *source of truth* for booking pricing. The legacy
// `bookingPricing.ts` engine remains the pure math kernel (computeBookingQuote
// + computeBookingReward) and the per-service shared modules
// (trashValetPricing, windowCleaningPricing, jumpStartPricing) remain the
// per-line calculators. This file re-exports them all and adds two
// convenience functions the upstream pipeline orchestrator and admin
// pricing-calibrate can call directly without going through HTTP:
//
//   * quoteService(serviceCode, inputs) — quote a single service line
//   * quoteBundle(items, options)       — wraps computeBookingQuote with
//                                         catalog + bundle DB loading
//
// Every other file that needs a price (chatbot, /book, /pricing, admin
// pricing-calibrate, dispatch) should import from THIS file. That way a
// single number change in the catalog or in this module flows to every
// surface automatically.

import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  serviceCatalog,
  bundleDefinitions,
  type ServiceCatalogEntry,
  type BundleDefinition,
} from "@shared/schema";
import {
  computeBookingQuote,
  computeBookingReward,
  SERVICE_LINE_MINIMUMS,
  MAX_BUNDLE_DISCOUNT_PCT,
  DEFAULT_FLAT_BOOKING_BONUS,
  type BookingPricingItemInput,
  type BookingPricingResult,
  type BundleDefinitionLike,
  type ComputeBookingQuoteOptions,
  type AppliedBundle,
} from "./bookingPricing";
import {
  calculateTrashValetQuote,
} from "../../shared/trashValetPricing";
import {
  calculateWindowCleaningQuote,
} from "../../shared/windowCleaningPricing";
import {
  calculateJumpStartQuote,
} from "../../shared/jumpStartPricing";

// Re-export the kernel so callers only need to import from one place.
export {
  computeBookingQuote,
  computeBookingReward,
  SERVICE_LINE_MINIMUMS,
  MAX_BUNDLE_DISCOUNT_PCT,
  DEFAULT_FLAT_BOOKING_BONUS,
};
export type {
  BookingPricingItemInput,
  BookingPricingResult,
  BundleDefinitionLike,
  ComputeBookingQuoteOptions,
  AppliedBundle,
};

/** Pure per-service quote — used by the chatbot, /pricing, and the admin
 *  pricing-calibrate page. Knows about the per-service shared calculators
 *  (trash valet, windows, jump start) and falls back to the catalog
 *  defaultPrice/suggestedMin..suggestedMax for any other service. */
export interface ServiceQuoteResult {
  serviceCode: string;
  /** Estimated total in USD. Always present. */
  amount: number;
  /** Range when the quote is a band rather than an exact figure. */
  minPrice?: number;
  maxPrice?: number;
  /** True when the engine could not produce a numeric quote (e.g. unknown
   *  service, or service marked as priceMode: "quote" with no inputs). */
  isQuoteOnly: boolean;
  /** Free-form per-service breakdown for the caller to display. */
  breakdown?: unknown;
}

export interface QuoteServiceInputs {
  /** When the caller already has the catalog loaded (to avoid a DB hit on
   *  every line in a bulk quote). */
  catalogEntry?: ServiceCatalogEntry | null;
  /** Service-specific inputs — see the per-service shared modules for
   *  shapes. Unknown shapes are forwarded as-is into `breakdown`. */
  details?: Record<string, any>;
}

export async function quoteService(
  serviceCode: string,
  inputs: QuoteServiceInputs = {},
): Promise<ServiceQuoteResult> {
  const cat = inputs.catalogEntry ?? (await loadCatalogEntry(serviceCode));
  const d = inputs.details || {};

  // ── Per-service calculators that already live in shared/ ────────────────
  if (serviceCode === "trash_valet" && d.cans != null) {
    const q = calculateTrashValetQuote({
      cans: Number(d.cans) || 1,
      bagCount: Number(d.bagCount) || 0,
      recyclingEnabled: !!d.recyclingEnabled,
      recyclingCans: d.recyclingCans != null ? Number(d.recyclingCans) : undefined,
      recyclingAnchorDate: d.recyclingAnchorDate ?? null,
      planType: d.planType === "yearly" ? "yearly" : "monthly",
      // Travel surcharge requires lat/lng. Callers without coords skip it
      // (matches the customer-facing /api/trash/subscribe fallback).
      lat: d.lat != null ? Number(d.lat) : null,
      lng: d.lng != null ? Number(d.lng) : null,
    });
    return {
      serviceCode,
      amount: q.finalMonthlyPrice,
      minPrice: q.finalMonthlyPrice,
      maxPrice: q.finalMonthlyPrice,
      isQuoteOnly: false,
      breakdown: q,
    };
  }

  if (serviceCode === "window_cleaning" && (d.standardWindows || d.largeWindows || d.ladderWindows)) {
    const q = calculateWindowCleaningQuote({
      standardWindows: Number(d.standardWindows) || 0,
      largeWindows: Number(d.largeWindows) || 0,
      ladderWindows: Number(d.ladderWindows) || 0,
      includeInside: d.includeInside ?? d.cleanInside ?? false,
      includeOutside: (d.includeOutside ?? d.cleanOutside) !== false,
      seasonMode: d.seasonMode === "winter_inside_only" ? "winter_inside_only" : "normal",
      promoCode: d.promoCode,
      addonSelected: !!d.addonSelected,
    });
    return {
      serviceCode,
      amount: q.total,
      minPrice: q.subtotal,
      maxPrice: q.total,
      isQuoteOnly: false,
      breakdown: q,
    };
  }

  if (serviceCode === "jump_start" || serviceCode === "jumpstart") {
    const miles = Number(d.distanceMiles ?? d.milesFromIronwood ?? 0);
    const q = calculateJumpStartQuote(miles);
    return {
      serviceCode,
      amount: q.flatPrice,
      minPrice: q.flatPrice,
      maxPrice: q.flatPrice,
      isQuoteOnly: q.isCustomQuote,
      breakdown: q,
    };
  }

  // ── Fallback: catalog default + suggested band ──────────────────────────
  if (!cat) {
    return { serviceCode, amount: 0, isQuoteOnly: true };
  }
  const def = cat.defaultPrice != null ? parseFloat(cat.defaultPrice) : 0;
  const min = cat.suggestedMin != null ? parseFloat(cat.suggestedMin) : def;
  const max = cat.suggestedMax != null ? parseFloat(cat.suggestedMax) : def;
  const floor = SERVICE_LINE_MINIMUMS[serviceCode];
  const amount = Math.max(def, floor || 0);
  return {
    serviceCode,
    amount,
    minPrice: Math.max(min, floor || 0),
    maxPrice: Math.max(max, floor || 0),
    isQuoteOnly: cat.defaultPriceMode === "quote" && def === 0,
  };
}

async function loadCatalogEntry(code: string): Promise<ServiceCatalogEntry | null> {
  const rows = await db
    .select()
    .from(serviceCatalog)
    .where(eq(serviceCatalog.code, code))
    .limit(1);
  return rows[0] ?? null;
}

function bundleRowToLike(row: BundleDefinition): BundleDefinitionLike {
  const combo = Array.isArray(row.serviceComboJson)
    ? (row.serviceComboJson as string[])
    : [];
  return {
    code: row.code,
    name: row.name,
    serviceCombo: combo,
    discountType: row.discountType as "percent" | "fixed",
    discountValue: parseFloat(row.discountValue),
    maxDiscount: row.maxDiscount != null ? parseFloat(row.maxDiscount) : null,
    priority: row.priority,
    isActive: row.isActive,
    merchandisingSlot: row.merchandisingSlot ?? null,
    bonusMultiplier:
      row.bonusMultiplier != null ? parseFloat(row.bonusMultiplier) : 1,
  };
}

/** Convenience wrapper around `computeBookingQuote` that loads the active
 *  bundle definitions on the caller's behalf. The orchestrator (Task
 *  #170) and the /api/bookings/quote route both use this so neither has
 *  to re-implement the bundle DB loading. */
export async function quoteBundle(
  items: BookingPricingItemInput[],
  options: Omit<ComputeBookingQuoteOptions, "bundleDefinitions"> & {
    bundleDefinitions?: BundleDefinitionLike[];
  } = {},
): Promise<BookingPricingResult> {
  const bundles =
    options.bundleDefinitions ??
    (await db
      .select()
      .from(bundleDefinitions)
      .where(eq(bundleDefinitions.isActive, true))
      .then((rows) => rows.map(bundleRowToLike)));
  return computeBookingQuote(items, { ...options, bundleDefinitions: bundles });
}
