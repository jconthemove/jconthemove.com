// Multi-Service Booking endpoints (Task #128).
//
//   POST /api/bookings/quote      → live quote, no persistence
//   POST /api/bookings            → persist parent + children (uses same engine)
//   GET  /api/bundles/featured    → featured bundles grouped by merch slot
//   GET  /api/service-catalog     → active services for the upcoming /book selector
//
// All input is validated by Zod schemas declared in shared/schema.ts so the
// upcoming frontend can import the same types.

import { Router, Request, Response } from "express";
import { eq, and, asc, desc, or, inArray, ilike, gte, lte, sql } from "drizzle-orm";
import { disburseBookingTokens, loadBookingRewardSettings } from "../services/disburseBookingTokens";
import { computeBookingReward } from "../services/bookingPricing";
import { notifyAdminNewQuote } from "../services/email";
import { smsService } from "../services/sms";
import { ZodError, z } from "zod";
import { db, pool } from "../db";
import { storage } from "../storage";
import { isAuthenticated, isAuthenticatedAllowPending } from "../auth";

/** Typed error class so route handlers can signal "this is a 400, not a 500"
 *  without resorting to `any` casts on plain Error objects. */
class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}
import {
  bookings,
  bookingServiceItems,
  bookingDiscountAuditLog,
  bundleDefinitions,
  bundleSettingsAuditLog,
  serviceCatalog,
  users,
  workerProfiles,
  quoteApprovals,
  quoteAttributions,
  bookingQuoteRequestSchema,
  bookingCreateRequestSchema,
  type ServiceCatalogEntry,
  type BundleDefinition,
  type Booking,
  type BookingServiceItem,
} from "@shared/schema";
import {
  computeBookingQuote,
  quoteBundle,
  estimatePainting,
  estimateFlooring,
  type BookingPricingItemInput,
  type BundleDefinitionLike,
  type BookingPricingResult,
  type PaintingAnswers,
  type FlooringAnswers,
} from "../services/pricingEngine";
import { quoteByLaborHours, LABOR_RATE_PER_HOUR, quoteMovingFromTable } from "@shared/pricingTables";

// Task #218 spec line 44: small moving = "$300 (or $340 if floor lifted;
// we keep $300)". The labor math 2×2×$85 naturally produces $340, but
// the customer-facing "two-person 2-hour special" is billed at $300 flat.
// The route layer enforces this whenever the resolved jobSize is "small"
// — overriding both the matrix output and the labor-tier amount.
const SMALL_MOVE_SPECIAL_PRICE = 300;

const router = Router();

const WORKER_TIERS = ["worker", "bronze", "silver", "gold", "platinum"] as const;
type WorkerTier = typeof WORKER_TIERS[number];
const tierRank: Record<WorkerTier, number> = { worker: 0, bronze: 1, silver: 2, gold: 3, platinum: 4 };

function normalizeWorkerTier(value: unknown, role?: string | null): WorkerTier {
  const raw = String(value || "").toLowerCase();
  if (WORKER_TIERS.includes(raw as WorkerTier)) return raw as WorkerTier;
  if (role === "admin" || role === "business_owner") return "platinum";
  return "worker";
}

async function getRequestUser(req: Request) {
  const userId = (req as any).user?.id || (req.session as any)?.userId || null;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user || null;
}

async function getAuthorityForUser(user: any) {
  if (!user) return { tier: "worker" as WorkerTier, rank: 0 };
  const [profile] = await db.select().from(workerProfiles).where(eq(workerProfiles.userId, user.id)).limit(1);
  const tier = normalizeWorkerTier(profile?.authorityTier, user.role);
  return { tier, rank: tierRank[tier], profile };
}

function toBundleLike(row: BundleDefinition): BundleDefinitionLike {
  // serviceComboJson is stored as jsonb<string[]> — defensively coerce in
  // case an older row was seeded with a different shape.
  const combo = Array.isArray(row.serviceComboJson)
    ? (row.serviceComboJson as string[])
    : [];
  return {
    code: row.code,
    name: row.name,
    serviceCombo: combo,
    discountType: (row.discountType as "percent" | "fixed"),
    discountValue: parseFloat(row.discountValue),
    maxDiscount: row.maxDiscount != null ? parseFloat(row.maxDiscount) : null,
    priority: row.priority,
    isActive: row.isActive,
    merchandisingSlot: row.merchandisingSlot ?? null,
    bonusMultiplier: row.bonusMultiplier != null ? parseFloat(row.bonusMultiplier) : 1,
  };
}

async function loadCatalog(): Promise<Map<string, ServiceCatalogEntry>> {
  const rows = await db
    .select()
    .from(serviceCatalog)
    .where(eq(serviceCatalog.isActive, true));
  return new Map(rows.map((r) => [r.code, r]));
}

async function loadBundles(): Promise<BundleDefinitionLike[]> {
  const rows = await db
    .select()
    .from(bundleDefinitions)
    .where(eq(bundleDefinitions.isActive, true));
  return rows.map(toBundleLike);
}

interface ResolvedItems {
  pricingInputs: BookingPricingItemInput[];
  /** Original per-line snapshot used when persisting the booking. */
  persistInputs: Array<{
    serviceCode: string;
    serviceLabel: string;
    quantity: number;
    unitPrice: number;
    priceMode: "fixed" | "hourly" | "per_unit" | "quote";
    details: Record<string, unknown>;
  }>;
}

/** Task #218 — Derive a small/medium/large jobSize hint from the per-line
 *  details the chat-intake or wizard sends (size hint, bedrooms, junk
 *  tier, sqft). Returns undefined when nothing in the details indicates a
 *  size — the labor-hours helper then falls back to the service default. */
function deriveJobSize(
  serviceCode: string,
  details: Record<string, unknown>,
): "small" | "medium" | "large" | undefined {
  // Explicit jobSize from the chat-intake parser wins.
  const explicit = String(details.jobSize ?? "").toLowerCase();
  if (explicit === "small" || explicit === "medium" || explicit === "large") {
    return explicit;
  }
  if (serviceCode === "moving") {
    // Task #218 spec step 4: truckSize feeds the labor-hours tier.
    // 15' → medium (2×4=8 labor-hr), 26' → large (4×4=16 labor-hr).
    const truck = String(details.truckSize ?? "").toLowerCase();
    if (truck.includes("15")) return "medium";
    if (truck.includes("26")) return "large";
    const br = String(details.bedrooms ?? "").toLowerCase();
    if (br === "studio" || br === "1br") return "small";
    if (br === "2br" || br === "3br") return "medium";
    if (br === "4br" || br === "5br+" || br === "5br") return "large";
  }
  if (serviceCode === "junk_removal") {
    const tier = String(details.tier ?? "").toLowerCase();
    if (tier === "tiny" || tier === "small") return "small";
    if (tier === "medium") return "medium";
    if (tier === "large" || tier === "xlarge") return "large";
  }
  if (serviceCode === "cleaning" || serviceCode === "move_cleaning") {
    const sqft = Number(details.squareFeet ?? 0);
    if (sqft > 0 && sqft < 1000) return "small";
    if (sqft >= 1000 && sqft < 2500) return "medium";
    if (sqft >= 2500) return "large";
  }
  return undefined;
}

// Services whose dollar amount comes from a non-labor calculator
// (matrix lookups, sqft × rate, rule files). For these the labor meta
// is exposed as derived metadata; the labor amount NEVER overrides
// the unitPrice. Moving keeps its bedrooms × stairs × loadType matrix
// per Task #218 spec step 4. Painting/flooring keep their rule-file
// dollars per spec step 5. Delivery keeps its mileage-based pricer.
//
// Calculator-driven services (painting, flooring, moving, delivery)
// run through their own per-service branches above (estimatePainting,
// estimateFlooring, the moving matrix/labor-tier router, mileage)
// — they do NOT need a Set lookup because the route only needs to
// distinguish "is this in LABOR_AUTHORITATIVE_SERVICES?" below.

// Services where labor IS the source of truth: the spec table maps
// each one to crew × hours, and we override the catalog suggested-min
// so the customer pays exactly what the chat card shows. Anything
// not in this set keeps its own per-service pricer untouched.
const LABOR_AUTHORITATIVE_SERVICES = new Set([
  "lawn_care", "trash_valet", "snow_removal", "window_cleaning",
  "handyman", "junk_removal", "demolition", "labor", "assembly",
  "junk_reset", "deep_clean_turnover", "assembly_finish",
  "walkway_priority",
]);

/** Attach the canonical labor-hours breakdown to a quoted line. */
function buildLaborMeta(
  serviceCode: string,
  unitPrice: number,
  quantity: number,
  details: Record<string, unknown>,
  catalogEntry?: ServiceCatalogEntry,
): BookingPricingItemInput["laborMeta"] {
  const jobSize = deriveJobSize(serviceCode, details);
  const explicitCrew = details.crewSize != null ? Number(details.crewSize)
    : details.crew != null ? Number(details.crew)
    : details.movers != null ? Number(details.movers)
    : undefined;
  const explicitHours = details.laborHours != null ? Number(details.laborHours)
    : details.hours != null ? Number(details.hours)
    : undefined;
  // Catalog context per Task #218 step 2: when a catalog row carries
  // minCrew / defaultLaborHours, those win over the static
  // SERVICE_LABOR_DEFAULTS table. We do NOT pass suggestedMin/Max as a
  // clamp here because buildLaborMeta only computes display metadata —
  // the dollar amount comes from `unitPrice` already resolved upstream.
  const catalogContext = catalogEntry
    ? {
        minCrew: catalogEntry.minCrew,
        defaultLaborHours: catalogEntry.defaultLaborHours as
          | { small?: number; medium?: number; large?: number; default?: number }
          | null
          | undefined,
      }
    : undefined;
  const labor = quoteByLaborHours(serviceCode, {
    jobSize,
    crewSize: explicitCrew,
    laborHours: explicitHours,
    catalog: catalogContext,
  });
  if (!labor) return undefined;

  // Moving: display crew × hours that match the billed dollars exactly.
  // For job-size paths the canonical labor tuples already line up with
  // the canonical billed amount. For matrix paths (bedrooms × stairs)
  // we back-compute hours from the line dollars at 2-decimal precision
  // so crew × hours × $85 == lineTotal to the cent — the chat card
  // never displays math that disagrees with the price.
  const lineTotal = Math.max(0, unitPrice * Math.max(1, quantity));
  if (serviceCode === "moving") {
    // Small-move special ($300) is a marketed promotion — the chat card
    // still promises "2 movers × 2 hrs"; we deliberately skip the
    // back-computation that would otherwise show ~1.76 hrs (300 ÷ 170).
    // The dollars are special-cased upstream; the tuple stays canonical.
    if (jobSize === "small" && lineTotal === SMALL_MOVE_SPECIAL_PRICE) {
      return {
        crewSize: labor.crewSize,
        laborHours: labor.laborHours,
        totalLaborHours: labor.totalLaborHours,
        ratePerHour: labor.ratePerHour,
      };
    }
    const canonicalDollars = +(labor.crewSize * labor.laborHours * LABOR_RATE_PER_HOUR).toFixed(2);
    if (lineTotal > 0 && Math.abs(lineTotal - canonicalDollars) > 0.01) {
      const crew = labor.crewSize;
      const derivedHours = +(lineTotal / (crew * LABOR_RATE_PER_HOUR)).toFixed(2);
      return {
        crewSize: crew,
        laborHours: derivedHours,
        totalLaborHours: +(crew * derivedHours).toFixed(2),
        ratePerHour: LABOR_RATE_PER_HOUR,
      };
    }
    return {
      crewSize: labor.crewSize,
      laborHours: labor.laborHours,
      totalLaborHours: labor.totalLaborHours,
      ratePerHour: labor.ratePerHour,
    };
  }

  // Painting / flooring scale by sqft so their hours genuinely vary
  // with the dollar amount. Back-compute from the line total so the
  // displayed breakdown stays internally consistent.
  if ((serviceCode === "painting" || serviceCode === "flooring")
      && lineTotal > 0 && explicitHours == null) {
    const crew = labor.crewSize;
    const derivedHours = +(lineTotal / (crew * LABOR_RATE_PER_HOUR)).toFixed(2);
    return {
      crewSize: crew,
      laborHours: derivedHours,
      totalLaborHours: +(crew * derivedHours).toFixed(2),
      ratePerHour: LABOR_RATE_PER_HOUR,
    };
  }

  // For everything else, the canonical labor breakdown IS the truth.
  return {
    crewSize: labor.crewSize,
    laborHours: labor.laborHours,
    totalLaborHours: labor.totalLaborHours,
    ratePerHour: labor.ratePerHour,
  };
}

function resolveItems(
  items: ReturnType<typeof bookingQuoteRequestSchema.parse>["items"],
  catalog: Map<string, ServiceCatalogEntry>,
): ResolvedItems {
  const pricingInputs: BookingPricingItemInput[] = [];
  const persistInputs: ResolvedItems["persistInputs"] = [];

  for (const item of items) {
    const cat = catalog.get(item.serviceCode);
    if (!cat) {
      throw new HttpError(`Unknown serviceCode: ${item.serviceCode}`, 400);
    }
    let unitPrice =
      item.unitPrice != null
        ? item.unitPrice
        : cat.defaultPrice != null
          ? parseFloat(cat.defaultPrice)
          : 0;
    const priceMode = (item.priceMode || cat.defaultPriceMode) as
      | "fixed"
      | "hourly"
      | "per_unit"
      | "quote";
    const label = item.label || cat.name;
    if (priceMode === "quote" && unitPrice <= 0 && cat.suggestedMin != null) {
      const suggestedMin = parseFloat(cat.suggestedMin);
      if (Number.isFinite(suggestedMin) && suggestedMin > 0) {
        unitPrice = suggestedMin;
      }
    }
    // Captured in the moving branch when the matrix path produces an
    // amount; consumed below buildLaborMeta so the chat-card crew/hours
    // tuple reflects the matrix tier (e.g., 3br → crew=3) rather than
    // SERVICE_LABOR_DEFAULTS' jobSize tuple. Declared at the for-loop
    // scope because it crosses the moving-branch / labor-meta boundary.
    let matrixLaborOverride: { crewSize: number; laborHours: number; totalLaborHours: number; ratePerHour: number } | undefined;

    // Task #211 — Painting & Flooring run the chatbot questionnaire
    // through the editable rule files in services/quoteRules/ so the
    // wizard line shows a believable estimate instead of $0/TBD. Always
    // overrides the catalog/wizard-supplied unitPrice for these two
    // codes; rule falls back to catalog suggested-min when no answers
    // are present so we never end up at $0.
    if (item.serviceCode === "painting") {
      const fallbackMin = cat.suggestedMin != null ? parseFloat(cat.suggestedMin) : undefined;
      const fallbackMax = cat.suggestedMax != null ? parseFloat(cat.suggestedMax) : undefined;
      const est = estimatePainting({
        answers: (item.details ?? {}) as PaintingAnswers,
        fallbackMin,
        fallbackMax,
      });
      if (est.amount > 0) unitPrice = est.amount;
    } else if (item.serviceCode === "flooring") {
      const fallbackMin = cat.suggestedMin != null ? parseFloat(cat.suggestedMin) : undefined;
      const fallbackMax = cat.suggestedMax != null ? parseFloat(cat.suggestedMax) : undefined;
      const est = estimateFlooring({
        answers: (item.details ?? {}) as FlooringAnswers,
        fallbackMin,
        fallbackMax,
      });
      if (est.amount > 0) unitPrice = est.amount;
    } else if (item.serviceCode === "moving") {
      // Task #218 — Moving has TWO pricing paths and the matrix wins
      // whenever the customer (or wizard / package flow) provided
      // detailed inputs. Order matters:
      //   1. If bedrooms / stairs / loadType are present → matrix
      //      (preserves nuance like "3br + stairs + heavy load").
      //   2. Else if explicit jobSize / truckSize maps to a tier →
      //      labor tier (small=$340, medium=$680, large=$1360 — these
      //      ARE crew × hours × $85 per the spec table).
      //   3. Else → leave unitPrice from the catalog/wizard alone.
      // Small move always respects the $300 floor per the spec.
      const details = (item.details ?? {}) as Record<string, unknown>;
      const hasDetailedInputs =
        details.bedrooms != null || details.stairs != null || details.loadType != null;
      let appliedJobSize: ReturnType<typeof deriveJobSize> | undefined;
      // matrixLaborOverride is declared at the for-loop scope above so
      // it survives the closing brace of this `else if` branch and
      // remains visible to the buildLaborMeta consumer below. When the
      // matrix path is taken its labor tuple wins downstream — the
      // chat-card crew count must reflect the matrix tier (3br → crew=3),
      // not SERVICE_LABOR_DEFAULTS' jobSize tuple.
      if (hasDetailedInputs) {
        const rawLoadType = String(details.loadType ?? "").toLowerCase();
        const normalizedLoadType =
          rawLoadType.includes("load + unload") || rawLoadType.includes("both")
            ? "local"
            : rawLoadType.includes("load only") || rawLoadType.includes("unload only")
              ? "labor_only"
              : details.loadType as string | undefined;
        const matrix = quoteMovingFromTable({
          bedrooms: details.bedrooms as string | undefined,
          stairs: details.stairs as string | number | undefined,
          loadType: normalizedLoadType,
        });
        if (matrix.amount > 0) {
          unitPrice = matrix.amount;
          matrixLaborOverride = matrix.labor;
        }
      } else {
        // No detailed inputs — only consider job-size / truck-size
        // explicit hints. We deliberately do NOT use deriveJobSize here
        // because that would re-infer from bedrooms (already handled
        // above) and short-circuit future detailed paths.
        const explicitJobSize = (details.jobSize as string | undefined)?.toLowerCase();
        const truckSize = (details.truckSize as string | undefined)?.toLowerCase() ?? "";
        let jobSize: "small" | "medium" | "large" | undefined;
        if (explicitJobSize === "small" || explicitJobSize === "medium" || explicitJobSize === "large") {
          jobSize = explicitJobSize;
        } else if (truckSize.includes("15")) {
          jobSize = "medium";
        } else if (truckSize.includes("26")) {
          jobSize = "large";
        }
        if (jobSize) {
          const labor = quoteByLaborHours("moving", { jobSize });
          if (labor) {
            unitPrice = labor.amount;
            appliedJobSize = jobSize;
          }
        }
      }
      // Small move special: per spec line 44 we always bill $300 for a
      // small move, regardless of whether matrix or labor-tier produced
      // the candidate amount. This overrides upward (matrix $340 → $300)
      // and downward (matrix $250 → $300).
      const finalJobSize = appliedJobSize ?? deriveJobSize("moving", details);
      if (finalJobSize === "small") {
        unitPrice = SMALL_MOVE_SPECIAL_PRICE;
      }
      const truckFee = Number(details.truckFee ?? 0);
      if (Number.isFinite(truckFee) && truckFee > 0) {
        unitPrice += truckFee;
      }
      const truckMileageFee = Number(details.truckMileageFee ?? 0);
      if (!truckFee && Number.isFinite(truckMileageFee) && truckMileageFee > 0) {
        unitPrice += truckMileageFee;
      }
      const oversizedItemFee = Number(details.oversizedItemFee ?? 0);
      if (Number.isFinite(oversizedItemFee) && oversizedItemFee > 0) {
        unitPrice += oversizedItemFee;
      }
      const selectedMovingRecTotal = Number(details.selectedMovingRecTotalMin ?? 0);
      if (Number.isFinite(selectedMovingRecTotal) && selectedMovingRecTotal > 0) {
        unitPrice = selectedMovingRecTotal;
      }
    }

    let laborMeta = buildLaborMeta(item.serviceCode, unitPrice, item.quantity, item.details || {}, cat);
    // Matrix labor tuple wins for moving when bedrooms/stairs/loadType
    // were supplied: per spec the matrix is the source of truth, and the
    // chat-card crew count must reflect the matrix tier (3br → crew=3),
    // not the SERVICE_LABOR_DEFAULTS jobSize tuple (medium → crew=2).
    // We deliberately skip this override for the small-move special so
    // that buildLaborMeta's preserved canonical 2-crew × 2-hr tuple
    // continues to drive the chat card for $300 small-move quotes.
    const isSmallSpecial = item.serviceCode === "moving" && unitPrice === SMALL_MOVE_SPECIAL_PRICE;
    if (item.serviceCode === "moving" && matrixLaborOverride && !isSmallSpecial) {
      laborMeta = matrixLaborOverride;
    }
    // Labor-priced services (lawn, valet, snow, junk, handyman, etc.)
    // get their unitPrice replaced with the canonical crew × hrs × $85
    // so the catalog suggested-min never silently bypasses the chat
    // card's promise. Calculator-priced services (moving matrix,
    // painting/flooring rules, delivery mileage) keep their unitPrice
    // — labor meta on those is metadata only.
    // Labor authority is independent of priceMode — even when the
    // catalog row defaults to "fixed" (trash_valet flat rate) or
    // "hourly" (handyman/labor), the chat card still promises crew ×
    // hours × $85, so the route layer must bill that exact amount.
    let effectiveQuantity = item.quantity;
    if (laborMeta && LABOR_AUTHORITATIVE_SERVICES.has(item.serviceCode)) {
      const laborDollars = +(laborMeta.crewSize * laborMeta.laborHours * laborMeta.ratePerHour).toFixed(2);
      if (laborDollars > 0) {
        // unitPrice now represents the FULL labor block (crew × hours
        // × $85). If the customer requested quantity > 1, multiply the
        // labor hours into the meta so the chat card stays honest, then
        // collapse quantity to 1 — otherwise computeLineSubtotal would
        // double-count (qty × full-labor-total).
        const qty = Math.max(1, item.quantity);
        if (qty > 1) {
          const scaledHours = +(laborMeta.laborHours * qty).toFixed(2);
          laborMeta = {
            crewSize: laborMeta.crewSize,
            laborHours: scaledHours,
            totalLaborHours: +(laborMeta.crewSize * scaledHours).toFixed(2),
            ratePerHour: laborMeta.ratePerHour,
          };
          unitPrice = +(laborMeta.crewSize * laborMeta.laborHours * laborMeta.ratePerHour).toFixed(2);
        } else {
          unitPrice = laborDollars;
        }
        effectiveQuantity = 1;
      }
    }
    // Per spec line 38: moving keeps the matrix as the truth for the
    // amount, with labor crew/hours surfaced in the breakdown for
    // display only. We do NOT mutate the matrix dollars to match the
    // back-computed labor product — any cent-level disagreement is
    // accepted in favor of preserving matrix authority.
    pricingInputs.push({
      serviceCode: item.serviceCode,
      label,
      quantity: effectiveQuantity,
      unitPrice,
      priceMode,
      discountEligible: cat.discountEligible,
      details: item.details || {},
      laborMeta,
    });
    persistInputs.push({
      serviceCode: item.serviceCode,
      serviceLabel: label,
      quantity: effectiveQuantity,
      unitPrice,
      priceMode,
      details: item.details || {},
    });
  }
  return { pricingInputs, persistInputs };
}

// ── POST /api/bookings/quote ───────────────────────────────────────────────
router.post("/bookings/quote", async (req: Request, res: Response) => {
  try {
    const body = bookingQuoteRequestSchema.parse(req.body);
    const catalog = await loadCatalog();
    const { pricingInputs } = resolveItems(body.items, catalog);
    // Pull live reward-engine settings so the displayed estimate uses the
    // exact same flatBonus/earnRate the issuer (disburseBookingTokens) will
    // use at confirmation time. Booking creation snapshots these onto the
    // booking row to lock in parity even if settings change later.
    const settings = await loadBookingRewardSettings();
    // Task #169 — route through the unified pricingEngine so /book, the
    // chatbot, admin pricing-calibrate, and the orchestrator all hit the
    // same module. quoteBundle loads active bundle definitions internally.
    const baseResult = await quoteBundle(pricingInputs, {
      flatBookingBonus: settings.flatBonus,
      earnRatePerDollar: settings.earnRate,
    });
    // Task #175 — Apply JCMOVES tokens at quote time. Server-side
    // validation against the canonical redemption rules so the rejected
    // amount is surfaced (rather than silently zeroed) and the discounted
    // line + new finalTotal flow into both the displayed quote AND the
    // persisted booking when the customer hits "Confirm".
    let result: BookingPricingResult & {
      tokenRedemption?: { tokens: number; discountUsd: number };
    } = baseResult;
    if (body.applyTokens && body.applyTokens > 0) {
      const { validateRedemption, tokensToDollars } = await import("@shared/tokenRedemptionRules");
      const validation = validateRedemption(body.applyTokens, baseResult.finalTotal, body.customerTier ?? null);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Token redemption rejected",
          message: validation.message,
          maxTokens: validation.effectiveTokens,
        });
      }
      const tokenDiscount = +tokensToDollars(validation.effectiveTokens).toFixed(2);
      result = {
        ...baseResult,
        tokenRedemption: {
          tokens: validation.effectiveTokens,
          discountUsd: tokenDiscount,
        },
        finalTotal: +Math.max(0, baseResult.finalTotal - tokenDiscount).toFixed(2),
      };
    }
    // Task #174 — Apply demand-based surge multiplier to the finalTotal
    // if the caller provided service coordinates. Mode gating (shadow/
    // soft/full) is enforced inside decideSurge(), so shadow returns 1.0
    // here and the customer sees no change until operators promote.
    let surge: { multiplier: number; band: string; reason: string; surgedTotal: number; zone: string | null } | null = null;
    try {
      const { getDemandForCoords } = await import("../demand");
      const { surge: decision, zone } = await getDemandForCoords(body.serviceLat, body.serviceLng);
      if (decision.multiplier !== 1) {
        const surgedTotal = +(result.finalTotal * decision.multiplier).toFixed(2);
        result = { ...result, finalTotal: surgedTotal };
      }
      surge = {
        multiplier: decision.multiplier,
        band: decision.band,
        reason: decision.reason,
        surgedTotal: result.finalTotal,
        zone: zone?.name ?? null,
      };
    } catch (e) {
      console.warn("[bookings/quote] surge compute failed:", e instanceof Error ? e.message : e);
    }
    // Task #170 — shadow mode. Fire-and-forget a parallel pipeline run
    // and log the parity comparison. Never awaited — response latency is
    // unchanged.
    void (async () => {
      try {
        const { shadowCompareAndLog } = await import("../pipeline");
        await shadowCompareAndLog(
          {
            items: pricingInputs,
            source: "shadow",
            persist: false,
            serviceLat: body.serviceLat,
            serviceLng: body.serviceLng,
          },
          result.finalTotal,
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[bookings/quote] shadow run failed:", e instanceof Error ? e.message : e);
      }
    })();
    return res.json({ success: true, quote: result, surge });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request", details: err.errors });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[bookings/quote] error:", err);
    return res.status(500).json({ error: "Failed to compute quote" });
  }
});

// Task #146 — When a multi-service booking includes a `trash_valet` line
// item, auto-provision the trash subscription + first job from the captured
// details so the admin pipeline doesn't have to phone the customer for
// cans/bag-count/service-day/plan-type. Best-effort: failures are logged
// but do NOT roll back the parent booking — the admin can still pick it up
// from the booking detail view.
async function autoProvisionTrashSubscriptionFromBooking(args: {
  bookingId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  serviceAddress: string | null;
  trashItem: ResolvedItems["persistInputs"][number];
}): Promise<void> {
  try {
    const { trashItem, customerName, customerPhone, customerEmail, serviceAddress, bookingId } = args;
    if (!serviceAddress) {
      console.warn(`[bookings] trash_valet auto-provision skipped (booking=${bookingId}): missing service address`);
      return;
    }
    const details = (trashItem.details || {}) as Record<string, unknown>;
    // Server-side bounds: clamp to the same maxima the UI advertises so the
    // helper is deterministic regardless of what the client sends.
    const cans = Math.max(1, Math.min(10, Number(details.cans) || 1));
    const bagCount = Math.max(0, Math.min(50, Number(details.bagCount) || 0));
    const recyclingEnabled = !!details.recyclingEnabled;
    const recyclingAnchorDate = (details.recyclingAnchorDate as string | undefined) || null;
    const serviceDayOfWeek = Math.max(1, Math.min(6, Number(details.serviceDayOfWeek) || 1));
    // If recycling is enabled but no specific day was chosen, fall back to
    // the trash service day so the subscription always has a complete
    // schedule (matches the dedicated /trash-valet/book behavior).
    const recyclingDayOfWeek = details.recyclingDayOfWeek != null
      ? Math.max(1, Math.min(6, Number(details.recyclingDayOfWeek)))
      : (recyclingEnabled ? serviceDayOfWeek : null);
    const planType = details.planType === "yearly" ? "yearly" : "monthly";
    const serviceNotes = typeof details.notes === "string" ? details.notes.trim() || null : null;

    const { trashSubscriptions, trashJobs } = await import("@shared/schema");
    const { calculateTrashValetQuote, isRecyclingWeek: checkRecycling } = await import("../../shared/trashValetPricing");

    // Skip if an active subscription already exists for this address
    // (matches the duplicate guard in /api/trash/subscribe).
    const normalizedAddr = serviceAddress.trim().toLowerCase();
    const existing = await db
      .select({ id: trashSubscriptions.id })
      .from(trashSubscriptions)
      .where(and(
        sql`LOWER(TRIM(${trashSubscriptions.address})) = ${normalizedAddr}`,
        sql`${trashSubscriptions.status} = 'active'`,
      ));
    if (existing.length > 0) {
      console.info(`[bookings] trash_valet auto-provision skipped (booking=${bookingId}): active sub already exists for ${normalizedAddr}`);
      return;
    }

    // Geocode the service address for travel-surcharge parity with the
    // canonical /api/trash/subscribe path. Failures are non-fatal — quote
    // falls back to local-area pricing the same way that route does.
    let resolvedLat: number | null = null;
    let resolvedLng: number | null = null;
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(serviceAddress)}&format=json&limit=1&countrycodes=us`;
      const geoResp = await fetch(geoUrl, { headers: { "User-Agent": "JCOnTheMove/1.0 contact@jcontmove.com" } });
      if (geoResp.ok) {
        const geoData = await geoResp.json() as Array<{ lat: string; lon: string }>;
        if (geoData.length > 0) {
          resolvedLat = parseFloat(geoData[0].lat);
          resolvedLng = parseFloat(geoData[0].lon);
        }
      }
    } catch { /* geocode failure is non-fatal — surcharge defaults to 0 */ }

    const quote = calculateTrashValetQuote({
      cans,
      bagCount,
      recyclingEnabled,
      recyclingAnchorDate: recyclingAnchorDate || null,
      lat: resolvedLat,
      lng: resolvedLng,
      planType,
    });

    const today = new Date().toISOString().split("T")[0];

    // Compute first-job week before the transaction so both inserts share
    // a consistent serviceWeekOf.
    const serviceDate = new Date();
    let dayDiff = serviceDayOfWeek - serviceDate.getDay();
    if (dayDiff <= 0) dayDiff += 7;
    serviceDate.setDate(serviceDate.getDate() + dayDiff);
    const weekSunday = new Date(serviceDate);
    weekSunday.setDate(serviceDate.getDate() - serviceDate.getDay());
    const weekOfStr = weekSunday.toISOString().split("T")[0];

    const recyclingThisWeek = recyclingEnabled && recyclingAnchorDate
      ? checkRecycling(recyclingAnchorDate, serviceDate)
      : false;
    const weekQuote = calculateTrashValetQuote({
      cans,
      bagCount,
      recyclingEnabled,
      recyclingAnchorDate: recyclingAnchorDate || null,
      lat: resolvedLat,
      lng: resolvedLng,
      planType,
      targetWeekOf: weekOfStr,
    });

    // Subscription + first job are created in a single transaction so we
    // never end up with an active subscription that has no scheduled job
    // (or vice versa).
    const subId = await db.transaction(async (tx) => {
      const [sub] = await tx.insert(trashSubscriptions).values({
        customerName: customerName.trim(),
        phone: customerPhone.trim(),
        email: (customerEmail || "").trim(),
        address: serviceAddress.trim(),
        city: "",
        state: "MI",
        zip: "",
        lat: resolvedLat != null ? String(resolvedLat) : null,
        lng: resolvedLng != null ? String(resolvedLng) : null,
        distanceMiles: quote.distanceMiles != null ? String(quote.distanceMiles) : null,
        travelSurchargeMonthly: String(quote.travelSurchargeMonthly),
        cans,
        bagCount,
        recyclingEnabled,
        recyclingAnchorDate: recyclingAnchorDate || null,
        serviceDayOfWeek,
        recyclingDayOfWeek,
        serviceNotes,
        planType,
        weeklyBasePrice: String(quote.weeklyBasePrice),
        projectedMonthlyPrice: String(quote.projectedMonthlyPrice),
        monthlyMinimumApplied: quote.monthlyMinimumApplied,
        finalMonthlyPrice: String(quote.finalMonthlyPrice),
        billingStatus: "active",
        status: "active",
        nextBillingDate: today,
      }).returning();

      await tx.insert(trashJobs).values({
        subscriptionId: sub.id,
        serviceWeekOf: weekOfStr,
        serviceType: "trash_valet",
        cans,
        bagCount,
        isRecyclingWeek: weekQuote.isRecyclingWeek || recyclingThisWeek,
        weeklyBasePrice: String(weekQuote.weeklyBasePrice),
        recyclingCharge: String(weekQuote.recyclingCharge),
        travelChargePortion: String(weekQuote.travelChargePortion),
        jobValue: String(weekQuote.jobValue),
        status: "scheduled",
      });

      return sub.id;
    });

    console.info(`[bookings] trash_valet auto-provisioned subscription=${subId} from booking=${bookingId}`);
  } catch (err) {
    // Never let trash auto-provisioning break the booking response — the
    // admin can still create the subscription manually from the booking
    // detail view.
    console.error("[bookings] trash_valet auto-provision failed:", err);
  }
}

// ── POST /api/bookings ─────────────────────────────────────────────────────
router.post("/bookings", async (req: Request, res: Response) => {
  try {
    const body = bookingCreateRequestSchema.parse(req.body);
    const catalog = await loadCatalog();
    const { pricingInputs, persistInputs } = resolveItems(body.items, catalog);
    const bundles = await loadBundles();
    // Snapshot of the active reward-engine settings at quote/creation time.
    // Persisting these on the booking row guarantees the customer-facing
    // tokenEstimate equals what disburseBookingTokens credits at confirm —
    // even if an admin tunes rewardSettings or a bundle's bonusMultiplier
    // in the intervening window.
    const settings = await loadBookingRewardSettings();
    // Task #169 — same engine as /api/bookings/quote so the persisted
    // booking can never disagree with the customer's just-shown estimate.
    const baseQuote: BookingPricingResult = await quoteBundle(pricingInputs, {
      bundleDefinitions: bundles,
      flatBookingBonus: settings.flatBonus,
      earnRatePerDollar: settings.earnRate,
    });
    const appliedMultiplier = baseQuote.bundleApplied?.bonusMultiplier ?? 1;

    // Task #175 — Pre-flight authentication & balance check BEFORE persist.
    // applyTokens / payFromWallet require an authenticated user (otherwise an
    // anonymous caller could persist a discounted booking they never paid
    // for) and the customer's tier comes from `users.loyalty_tier` on the
    // server — never from the request body — so the redemption cap can't
    // be inflated by a tampered payload.
    const authedUserId: string | undefined = (req as { user?: { id?: string } }).user?.id
      || (req.session as { userId?: string } | undefined)?.userId;
    const wantsTokens = !!body.applyTokens && body.applyTokens > 0;
    const wantsWallet = body.payFromWallet === true;
    let serverTier: string | null = null;
    let preflightTokenRedemption: { tokens: number; discountUsd: number } | null = null;
    if (wantsTokens || wantsWallet) {
      if (!authedUserId) {
        return res.status(401).json({
          error: "Authentication required",
          message: "Sign in to apply JCMOVES tokens or pay from your wallet.",
        });
      }
      try {
        const { rows } = await pool.query<{ loyalty_tier: string | null }>(
          `SELECT loyalty_tier FROM users WHERE id = $1 LIMIT 1`,
          [authedUserId],
        );
        serverTier = rows[0]?.loyalty_tier ?? "bronze";
      } catch {
        serverTier = "bronze";
      }
    }
    let quote: BookingPricingResult & {
      tokenRedemption?: { tokens: number; discountUsd: number };
    } = baseQuote;
    if (wantsTokens) {
      const { validateRedemption, tokensToDollars } = await import("@shared/tokenRedemptionRules");
      const validation = validateRedemption(body.applyTokens!, baseQuote.finalTotal, serverTier);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Token redemption rejected",
          message: validation.message,
          maxTokens: validation.effectiveTokens,
        });
      }
      // Re-check the live token balance BEFORE persist so we can reject
      // up-front instead of persisting a discounted booking and then
      // having to roll it back when settle fails.
      try {
        const { rows: walletRows } = await pool.query<{ token_balance: string }>(
          `SELECT token_balance FROM wallet_accounts WHERE user_id = $1 LIMIT 1`,
          [authedUserId!],
        );
        const tokens = Number(walletRows[0]?.token_balance ?? 0);
        if (tokens < validation.effectiveTokens) {
          return res.status(400).json({
            error: "Insufficient JCMOVES balance",
            message: `You have ${tokens} JCMOVES — need ${validation.effectiveTokens}.`,
          });
        }
      } catch {
        return res.status(400).json({ error: "Wallet read failed" });
      }
      const tokenDiscount = +tokensToDollars(validation.effectiveTokens).toFixed(2);
      preflightTokenRedemption = { tokens: validation.effectiveTokens, discountUsd: tokenDiscount };
      quote = {
        ...baseQuote,
        finalTotal: +Math.max(0, baseQuote.finalTotal - tokenDiscount).toFixed(2),
        tokenRedemption: preflightTokenRedemption,
      };
    }
    // Same up-front check for wallet cash so we don't persist then refund.
    if (wantsWallet) {
      try {
        const { rows: walletRows } = await pool.query<{ cash_balance: string }>(
          `SELECT cash_balance FROM wallet_accounts WHERE user_id = $1 LIMIT 1`,
          [authedUserId!],
        );
        const cash = Number(walletRows[0]?.cash_balance ?? 0);
        if (cash < quote.finalTotal) {
          return res.status(400).json({
            error: "Insufficient wallet balance",
            message: `Wallet has $${cash.toFixed(2)} — need $${quote.finalTotal.toFixed(2)}.`,
          });
        }
      } catch {
        return res.status(400).json({ error: "Wallet read failed" });
      }
    }

    const requestUser = await getRequestUser(req);
    const requestAuthority = await getAuthorityForUser(requestUser);
    const isWorkerCreated = body.source === "crew_add_job";
    if (isWorkerCreated && !requestUser) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Sign in as a worker to add quotes or jobs.",
      });
    }
    if (isWorkerCreated && requestAuthority.rank < tierRank.bronze) {
      return res.status(403).json({
        error: "Worker authority required",
        message: "Bronze or higher authority is required to post customer quote requests.",
      });
    }
    const requiresQuoteApproval = isWorkerCreated && requestAuthority.tier === "silver";
    const bookingStatus = requiresQuoteApproval ? "pending_quote_approval" : "quote";

    // Task #163 — guarantee every numeric column persists as a finite
    // 2-decimal string. A non-finite quantity / unitPrice / lineSubtotal
    // (NaN, Infinity, undefined) used to crash `.toFixed(2)` and bubble
    // up as a generic 500 that hid the real cause. Quote-only / TBD
    // lines persist as 0.00 with priceMode="quote" instead of throwing.
    const money = (n: unknown): string => {
      const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
      return Math.max(0, v).toFixed(2);
    };

    // Wrap parent + children in a transaction so a child-insert failure
    // never leaves an orphan `bookings` row pointing at no line items.
    const booking = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(bookings)
        .values({
          customerName: body.customerName,
          customerEmail: body.customerEmail || null,
          customerPhone: body.customerPhone,
          serviceAddress: body.serviceAddress || null,
          notes: body.notes || null,
          subtotal: money(quote.subtotal),
          discountTotal: money(quote.discountTotal),
          finalTotal: money(quote.finalTotal),
          bundleAppliedCode: quote.bundleApplied?.code ?? null,
          tokenEstimate: Number.isFinite(quote.tokenEstimate) ? quote.tokenEstimate : 0,
          rewardFlatBonusSnapshot: Math.round(settings.flatBonus),
          rewardEarnRateSnapshot: (Number.isFinite(settings.earnRate) ? settings.earnRate : 0).toFixed(4),
          rewardBonusMultiplierSnapshot: money(appliedMultiplier),
          status: bookingStatus,
          source: body.source || "api",
        })
        .returning();

      if (persistInputs.length > 0) {
        const pricingByIdx = quote.items;
        await tx.insert(bookingServiceItems).values(
          persistInputs.map((p, idx) => ({
            bookingId: created.id,
            serviceCode: p.serviceCode,
            serviceLabel: p.serviceLabel,
            quantity: money(p.quantity),
            unitPrice: money(p.unitPrice),
            lineSubtotal: money(pricingByIdx[idx]?.lineSubtotal),
            priceMode: p.priceMode,
            details: p.details,
          })),
        );
      }
      return created;
    });

    if (requestUser) {
      try {
        await db.insert(quoteAttributions).values({
          bookingId: booking.id,
          userId: requestUser.id,
          attributionType: requiresQuoteApproval ? "silver_quote_builder" : isWorkerCreated ? "worker_quote_builder" : "customer_quote_request",
          promoCode: requestUser.referralCode || null,
          metadata: {
            source: body.source || "api",
            authorityTier: requestAuthority.tier,
            quoteTotal: quote.finalTotal,
            crewSummary: quote.items.map((item) => item.laborMeta).filter(Boolean),
          },
        });
        if (isWorkerCreated) {
          await pool.query(`
            INSERT INTO worker_profiles (user_id, authority_tier, leads_posted_count, updated_at)
            VALUES ($1, $2, 1, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET leads_posted_count = worker_profiles.leads_posted_count + 1,
                updated_at = NOW()
          `, [requestUser.id, requestAuthority.tier]);
        }
        if (requiresQuoteApproval) {
          await db.insert(quoteApprovals).values({
            bookingId: booking.id,
            submittedByUserId: requestUser.id,
            approvalRole: "silver_submission",
            status: "pending",
            notes: "Silver quote draft requires Darrell or 2 Gold approvals.",
          });
        }
      } catch (attrErr) {
        console.error("[bookings] worker attribution failed:", attrErr instanceof Error ? attrErr.message : attrErr);
      }
    }

    // Task #131 — reward disbursement intentionally NOT fired here. Newly
    // created bookings start in `status: "quote"`; rewards must only be
    // issued once the customer (or an admin) confirms the booking via
    // POST /api/admin/bookings/:id/confirm.

    // Task #146 — auto-provision a Trash Valet subscription when bundled.
    // The helper already swallows its own errors so this call cannot turn a
    // successful booking create into a 500 even if provisioning fails.
    const trashItem = persistInputs.find((p) => p.serviceCode === "trash_valet");
    if (trashItem) {
      await autoProvisionTrashSubscriptionFromBooking({
        bookingId: booking.id,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail || null,
        serviceAddress: body.serviceAddress || null,
        trashItem,
      });
    }

    // Task #175 — Atomic wallet pay + token redemption.
    // Pre-flight already validated auth + tier (server-derived) + balance
    // BEFORE persist, so by the time we get here the only realistic
    // failure modes are concurrent wallet drains. If settle fails AFTER
    // persist we DELETE the just-created booking row so a discounted
    // booking can never linger without the matching deduction.
    let walletPay: {
      ok: boolean;
      walletCharged: number;
      tokensRedeemed: number;
      tokenDiscountUsd: number;
      reason?: string;
    } | null = null;
    if (wantsWallet || wantsTokens) {
      const { settleBookingPayment } = await import("../services/walletPay");
      const r = await settleBookingPayment({
        userId: authedUserId!,
        bookingId: booking.id,
        amountUsd: quote.finalTotal,
        payFromWallet: wantsWallet,
        applyTokens: body.applyTokens,
        customerTier: serverTier,
        preDiscountSubtotal: baseQuote.finalTotal,
      });
      walletPay = {
        ok: r.ok,
        walletCharged: r.walletCharged,
        tokensRedeemed: r.tokensRedeemed,
        tokenDiscountUsd: r.tokenDiscountUsd,
        reason: r.reason,
      };
      if (!r.ok) {
        try {
          await db.delete(bookings).where(eq(bookings.id, booking.id));
        } catch (delErr) {
          console.error("[bookings] rollback delete failed for booking", booking.id, delErr);
        }
        return res.status(409).json({
          error: "Payment settlement failed",
          message: r.reason || "Wallet/token settlement failed — booking was rolled back.",
        });
      }
    }

    try {
      const primaryService = persistInputs[0]?.serviceLabel || persistInputs[0]?.serviceCode || "Multi-service booking";
      const serviceSummary = persistInputs
        .map((item) => item.serviceLabel || item.serviceCode)
        .filter(Boolean)
        .join(", ");
      const customerName = body.customerName || "Customer";
      const moveDate = persistInputs
        .map((item) => (item.details as any)?.date || (item.details as any)?.moveDate)
        .find(Boolean);

      await Promise.allSettled([
        notifyAdminNewQuote({
          customerName,
          serviceType: serviceSummary || primaryService,
          phone: body.customerPhone,
          email: body.customerEmail || undefined,
          moveDate,
        }),
        smsService.notifyNewQuote({
          customerName,
          serviceType: serviceSummary || primaryService,
          phone: body.customerPhone,
          moveDate,
        }),
      ]);
    } catch (notifyErr) {
      console.error("[bookings] admin notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }

    return res.status(201).json({ success: true, booking, quote, walletPay });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request", details: err.errors });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    // Task #163 — log enough context to diagnose any future failure in
    // one log line (serviceCodes, error name + message + stack).
    const serviceCodes = (req.body?.items || [])
      .map((it: any) => it?.serviceCode)
      .filter(Boolean)
      .join(",");
    console.error("[bookings] persist error:", {
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      serviceCodes,
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Keep the raw error message server-side only — it can contain DB
    // constraint names / column names / row snippets that shouldn't be
    // surfaced to the customer. Validation errors that ARE safe to show
    // are already returned above via HttpError / ZodError branches.
    return res.status(500).json({ error: "Failed to create booking. Please try again or call us." });
  }
});

// ── GET /api/bundles/featured ─────────────────────────────────────────────
router.get("/bundles/featured", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(bundleDefinitions)
      .where(and(eq(bundleDefinitions.isFeatured, true), eq(bundleDefinitions.isActive, true)))
      .orderBy(asc(bundleDefinitions.priority));

    const slots: Record<string, BundleDefinition[]> = {
      most_popular: [],
      best_value: [],
      fast_addon: [],
    };
    const all: BundleDefinition[] = [];
    for (const row of rows) {
      all.push(row);
      const slot = row.merchandisingSlot ?? "";
      if (slot in slots) slots[slot].push(row);
    }
    return res.json({ slots, bundles: all });
  } catch (err) {
    console.error("[bundles/featured] error:", err);
    return res.status(500).json({ error: "Failed to load featured bundles" });
  }
});

// ── GET /api/service-catalog ──────────────────────────────────────────────
router.get("/service-catalog", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(serviceCatalog)
      .where(eq(serviceCatalog.isActive, true))
      .orderBy(asc(serviceCatalog.sortOrder));
    return res.json({ services: rows });
  } catch (err) {
    console.error("[service-catalog] error:", err);
    return res.status(500).json({ error: "Failed to load service catalog" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Task #130 — Parent-child booking views
// ─────────────────────────────────────────────────────────────────────────────

/** Roll up parent booking status from its children. The lifecycle is
 *  `new → in_progress → completed`, so any partial progress (mixed states
 *  with at least one scheduled/in_progress/completed but not all in a
 *  terminal state) means the bundle as a whole is in progress.
 *
 *    - all cancelled                         → cancelled
 *    - all completed (or completed+cancelled
 *      with at least one completed)          → completed
 *    - any in_progress                       → in_progress
 *    - any scheduled                         → in_progress
 *      (parent has progressed past quote/booked even if work hasn't
 *       physically started)
 *    - any completed + any non-terminal      → in_progress
 *      (mixed: some children done, others still pending)
 *    - else                                  → quote / booked (preserve
 *      parent baseline)
 */
function rollupBookingStatus(
  parentStatus: string,
  items: BookingServiceItem[],
): string {
  if (items.length === 0) return parentStatus;
  const statuses = items.map((i) => i.status);
  const non = (s: string) => statuses.filter((x) => x !== s);
  if (statuses.every((s) => s === "cancelled")) return "cancelled";
  // All non-cancelled children are completed → bundle is completed
  if (non("cancelled").length > 0 && non("cancelled").every((s) => s === "completed")) {
    return "completed";
  }
  if (statuses.some((s) => s === "in_progress")) return "in_progress";
  if (statuses.some((s) => s === "scheduled")) return "in_progress";
  // Mixed: at least one completed but others still pending → in_progress
  if (statuses.some((s) => s === "completed") && statuses.some((s) => s === "pending")) {
    return "in_progress";
  }
  // Keep parent baseline (quote or booked) when no child has advanced
  return parentStatus;
}

type BookingWithItems = Booking & {
  items: BookingServiceItem[];
  rolledUpStatus: string;
};

async function loadBookingsWithChildren(
  parents: Booking[],
): Promise<BookingWithItems[]> {
  if (parents.length === 0) return [];
  const ids = parents.map((p) => p.id);
  const items = await db
    .select()
    .from(bookingServiceItems)
    .where(inArray(bookingServiceItems.bookingId, ids))
    .orderBy(asc(bookingServiceItems.createdAt));
  const byBooking = new Map<string, BookingServiceItem[]>();
  for (const it of items) {
    const arr = byBooking.get(it.bookingId) ?? [];
    arr.push(it);
    byBooking.set(it.bookingId, arr);
  }
  return parents.map((p) => {
    const children = byBooking.get(p.id) ?? [];
    return { ...p, items: children, rolledUpStatus: rollupBookingStatus(p.status, children) };
  });
}

async function requireAdmin(req: any, res: Response): Promise<boolean> {
  const userId = req.user?.id || (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  const user = await storage.getUser(userId);
  const ok = user && (user.role === "admin" || user.role === "business_owner");
  if (!ok) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// ── GET /api/admin/bookings ───────────────────────────────────────────────
// List parent bookings with their children for the admin pipeline. Supports
// the same filter shape (search/status/limit/offset) as /api/admin/pipeline.
router.get("/admin/bookings", isAuthenticated, async (req: any, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { search, status, limit: lim = 100, offset: off = 0 } = req.query;
    const conditions: any[] = [];
    if (status && status !== "all") conditions.push(eq(bookings.status, String(status)));
    if (search) {
      const q = `%${search}%`;
      conditions.push(
        or(
          ilike(bookings.customerName, q),
          ilike(bookings.customerEmail, q),
          ilike(bookings.customerPhone, q),
        ),
      );
    }
    const parents = await db
      .select()
      .from(bookings)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(bookings.createdAt))
      .limit(Number(lim))
      .offset(Number(off));
    const withChildren = await loadBookingsWithChildren(parents);
    return res.json({ bookings: withChildren, total: withChildren.length });
  } catch (err) {
    console.error("[admin/bookings] error:", err);
    return res.status(500).json({ error: "Failed to load bookings" });
  }
});

// ── GET /api/admin/bookings/:id ───────────────────────────────────────────
router.get("/admin/bookings/:id", isAuthenticated, async (req: any, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const [parent] = await db.select().from(bookings).where(eq(bookings.id, req.params.id)).limit(1);
    if (!parent) return res.status(404).json({ error: "Booking not found" });
    const [withChildren] = await loadBookingsWithChildren([parent]);
    const auditLog = await db
      .select()
      .from(bookingDiscountAuditLog)
      .where(eq(bookingDiscountAuditLog.bookingId, parent.id))
      .orderBy(desc(bookingDiscountAuditLog.createdAt));
    return res.json({ booking: withChildren, discountAuditLog: auditLog });
  } catch (err) {
    console.error("[admin/bookings/:id] error:", err);
    return res.status(500).json({ error: "Failed to load booking" });
  }
});

// ── GET /api/customer/bookings ────────────────────────────────────────────
// Returns parent bookings (with children) for the authenticated customer,
// matched by their email. Used by /my-jobs to render a bundle card per
// booking with one chip per child service.
router.get(
  "/customer/bookings",
  isAuthenticatedAllowPending,
  async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || !user.email) return res.json({ bookings: [] });
      const parents = await db
        .select()
        .from(bookings)
        .where(eq(bookings.customerEmail, user.email))
        .orderBy(desc(bookings.createdAt));
      const withChildren = await loadBookingsWithChildren(parents);
      return res.json({ bookings: withChildren });
    } catch (err) {
      console.error("[customer/bookings] error:", err);
      return res.status(500).json({ error: "Failed to load your bookings" });
    }
  },
);

// ── PATCH /api/admin/bookings/items/:itemId ───────────────────────────────
// Update a single child service item: status, crew assignment, notes.
// Re-rolls up the parent booking status after a successful update so the
// admin pipeline sees an accurate aggregate without a second round-trip.
const updateItemSchema = z.object({
  status: z.enum(["pending", "scheduled", "in_progress", "completed", "cancelled"]).optional(),
  assignedToUserId: z.string().nullable().optional(),
  crewMembers: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

router.patch(
  "/admin/bookings/items/:itemId",
  isAuthenticated,
  async (req: any, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const body = updateItemSchema.parse(req.body);
      const [existing] = await db
        .select()
        .from(bookingServiceItems)
        .where(eq(bookingServiceItems.id, req.params.itemId))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Item not found" });

      const update: Partial<BookingServiceItem> = {};
      if (body.status !== undefined) {
        update.status = body.status;
        if (body.status === "completed" && !existing.completedAt) {
          update.completedAt = new Date();
        }
      }
      if (body.assignedToUserId !== undefined) update.assignedToUserId = body.assignedToUserId;
      if (body.crewMembers !== undefined) update.crewMembers = body.crewMembers;
      if (body.notes !== undefined) update.notes = body.notes;
      if (body.scheduledAt !== undefined) {
        update.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      }

      await db
        .update(bookingServiceItems)
        .set(update)
        .where(eq(bookingServiceItems.id, req.params.itemId));

      // Re-roll parent status based on the new child set.
      const siblings = await db
        .select()
        .from(bookingServiceItems)
        .where(eq(bookingServiceItems.bookingId, existing.bookingId));
      const [parent] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, existing.bookingId))
        .limit(1);
      if (parent) {
        const newParentStatus = rollupBookingStatus(parent.status, siblings);
        if (newParentStatus !== parent.status) {
          await db
            .update(bookings)
            .set({ status: newParentStatus })
            .where(eq(bookings.id, parent.id));
        }
      }
      return res.json({ success: true });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid update", details: err.errors });
      }
      console.error("[admin/bookings/items] error:", err);
      return res.status(500).json({ error: "Failed to update item" });
    }
  },
);

// ── POST /api/admin/bookings/:id/confirm ──────────────────────────────────
// Transition a quoted booking into the confirmed/`booked` lifecycle stage
// and trigger reward disbursement. Idempotent: re-confirming a booking is
// safe (the issuer dedupes on referenceId+rewardType per user) and leaves
// the status as `booked` if it already advanced past `quote`.
router.post(
  "/admin/bookings/:id/confirm",
  isAuthenticated,
  async (req: any, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const [parent] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, req.params.id))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Booking not found" });

      if (parent.status === "quote") {
        await db
          .update(bookings)
          .set({ status: "booked" })
          .where(eq(bookings.id, parent.id));
      }

      // Issue customer JCMOVES reward (flat bonus + per-dollar earn × bundle
      // bonus multiplier). Idempotent — safe to re-call.
      const summary = await disburseBookingTokens(parent.id);
      return res.json({ success: true, status: "booked", reward: summary });
    } catch (err) {
      console.error("[admin/bookings/confirm] error:", err);
      return res.status(500).json({ error: "Failed to confirm booking" });
    }
  },
);

router.post(
  "/workers/quote-approvals/bookings/:id/approve",
  isAuthenticated,
  async (req: any, res: Response) => {
    try {
      const user = await getRequestUser(req);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const authority = await getAuthorityForUser(user);
      const ownerApproval = user.role === "admin" || user.role === "business_owner" || user.email === "upmichiganstatemovers@gmail.com";
      if (!ownerApproval && authority.rank < tierRank.gold) {
        return res.status(403).json({ message: "Gold or Platinum authority required" });
      }
      const [parent] = await db.select().from(bookings).where(eq(bookings.id, req.params.id)).limit(1);
      if (!parent) return res.status(404).json({ message: "Booking not found" });

      const approvalRole = ownerApproval ? "owner_approval" : "gold_vote";
      await db.insert(quoteApprovals).values({
        bookingId: parent.id,
        approvedByUserId: user.id,
        approvalRole,
        status: "approved",
        notes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 1000) : null,
      });

      const [voteRow] = await db.select({ count: sql<number>`count(distinct ${quoteApprovals.approvedByUserId})::int` })
        .from(quoteApprovals)
        .where(and(eq(quoteApprovals.bookingId, parent.id), eq(quoteApprovals.status, "approved"), eq(quoteApprovals.approvalRole, "gold_vote")));
      const goldVotes = Number(voteRow?.count || 0);
      const approved = ownerApproval || goldVotes >= 2;
      if (approved) {
        await db.update(bookings)
          .set({ status: "quote" })
          .where(eq(bookings.id, parent.id));
      }
      await db.insert(quoteAttributions).values({
        bookingId: parent.id,
        userId: user.id,
        attributionType: approved ? "quote_approver" : "gold_vote",
        metadata: { approved, goldVotes },
      });
      res.json({ success: true, approved, goldVotes });
    } catch (err) {
      console.error("[worker booking approval] error:", err);
      res.status(500).json({ message: "Failed to approve quote" });
    }
  },
);

// ── POST /api/admin/bookings/:id/discount-override ────────────────────────
// Admin override of the auto-applied bundle discount. Writes an audit row
// for every change so we can answer "who changed this and why" later.
const overrideSchema = z.object({
  newDiscount: z.number().nonnegative(),
  reason: z.string().max(500).optional(),
});

router.post(
  "/admin/bookings/:id/discount-override",
  isAuthenticated,
  async (req: any, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const body = overrideSchema.parse(req.body);
      const adminUserId = req.user?.id || (req.session as any)?.userId;

      const result = await db.transaction(async (tx) => {
        const [parent] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.id, req.params.id))
          .limit(1);
        if (!parent) throw new HttpError("Booking not found", 404);

        const previousDiscount = parseFloat(parent.discountTotal);
        const newDiscount = body.newDiscount;
        const subtotal = parseFloat(parent.subtotal);
        const newFinal = Math.max(0, subtotal - newDiscount);

        // Recompute the customer's tokenEstimate using the override flag so
        // the stored estimate stays in sync with what disburseBookingTokens
        // will actually issue at confirmation. Use the SAME precedence as
        // the issuer: prefer the booking's snapshotted reward inputs, fall
        // back to live rewardSettings only for legacy rows that predate the
        // snapshot columns. This guarantees parity even if defaults drift
        // between booking creation and the override.
        let flatBonus: number;
        let earnRate: number;
        if (parent.rewardFlatBonusSnapshot != null && parent.rewardEarnRateSnapshot != null) {
          flatBonus = parent.rewardFlatBonusSnapshot;
          earnRate  = parseFloat(parent.rewardEarnRateSnapshot);
        } else {
          const live = await loadBookingRewardSettings();
          flatBonus = live.flatBonus;
          earnRate  = live.earnRate;
        }
        const reward = computeBookingReward({
          finalTotal: newFinal,
          flatBonus,
          earnRate,
          bonusMultiplier: 1, // override drops the bundle multiplier
          hasOverride: true,
        });

        await tx
          .update(bookings)
          .set({
            discountTotal: newDiscount.toFixed(2),
            finalTotal: newFinal.toFixed(2),
            tokenEstimate: reward.totalAward,
          })
          .where(eq(bookings.id, parent.id));

        const [audit] = await tx
          .insert(bookingDiscountAuditLog)
          .values({
            bookingId: parent.id,
            adminUserId,
            previousDiscount: previousDiscount.toFixed(2),
            newDiscount: newDiscount.toFixed(2),
            reason: body.reason ?? null,
          })
          .returning();
        return { previousDiscount, newDiscount, newFinal, audit, tokenEstimate: reward.totalAward };
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid override", details: err.errors });
      }
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error("[admin/bookings/discount-override] error:", err);
      return res.status(500).json({ error: "Failed to override discount" });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Task #131 — Admin: Featured Bundle settings (inline edit) + audit log
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/admin/bundle-definitions ─────────────────────────────────────
// Returns every bundle (active + inactive) for the admin "Featured Bundles"
// settings card. Active-only is exposed via /api/bundles/featured already.
router.get("/admin/bundle-definitions", isAuthenticated, async (req: any, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await db
      .select()
      .from(bundleDefinitions)
      .orderBy(asc(bundleDefinitions.priority), asc(bundleDefinitions.code));
    return res.json({ bundles: rows });
  } catch (err) {
    console.error("[admin/bundle-definitions] error:", err);
    return res.status(500).json({ error: "Failed to load bundle definitions" });
  }
});

// ── PATCH /api/admin/bundle-definitions/:code ─────────────────────────────
// Inline-edit endpoint for the settings card. Only the fields admins can
// reasonably change at runtime are exposed; combo/discountType edits stay
// in the seed file to keep accounting predictable.
const bundleSettingsPatchSchema = z.object({
  discountValue: z.number().nonnegative().optional(),
  maxDiscount:   z.number().nonnegative().nullable().optional(),
  bonusMultiplier: z.number().min(1).max(5).optional(),
  isFeatured:    z.boolean().optional(),
  isActive:      z.boolean().optional(),
  merchandisingSlot: z.string().nullable().optional(),
});

router.patch(
  "/admin/bundle-definitions/:code",
  isAuthenticated,
  async (req: any, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const body = bundleSettingsPatchSchema.parse(req.body);
      const adminUserId = req.user?.id || (req.session as any)?.userId;

      const [existing] = await db
        .select()
        .from(bundleDefinitions)
        .where(eq(bundleDefinitions.code, req.params.code))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Bundle not found" });

      const update: Partial<typeof bundleDefinitions.$inferInsert> = {};
      if (body.discountValue !== undefined) update.discountValue = body.discountValue.toFixed(2);
      if (body.maxDiscount !== undefined) {
        update.maxDiscount = body.maxDiscount === null ? null : body.maxDiscount.toFixed(2);
      }
      if (body.bonusMultiplier !== undefined) update.bonusMultiplier = body.bonusMultiplier.toFixed(2);
      if (body.isFeatured !== undefined) update.isFeatured = body.isFeatured;
      if (body.isActive !== undefined)   update.isActive = body.isActive;
      if (body.merchandisingSlot !== undefined) update.merchandisingSlot = body.merchandisingSlot;

      const [updated] = await db
        .update(bundleDefinitions)
        .set(update)
        .where(eq(bundleDefinitions.code, req.params.code))
        .returning();

      // Durable audit row — mirrors booking_discount_audit_log so admins can
      // query bundle history (who changed what, when) instead of grepping
      // ephemeral process logs.
      const beforeSnapshot = {
        discountValue: existing.discountValue,
        maxDiscount: existing.maxDiscount,
        bonusMultiplier: existing.bonusMultiplier,
        isFeatured: existing.isFeatured,
        isActive: existing.isActive,
        merchandisingSlot: existing.merchandisingSlot,
      };
      try {
        await db.insert(bundleSettingsAuditLog).values({
          bundleCode: existing.code,
          adminUserId: adminUserId ?? null,
          adminEmail: req.user?.email ?? null,
          before: beforeSnapshot,
          after: update,
        });
      } catch (auditErr) {
        console.error("[admin/bundle-definitions] audit insert failed:", auditErr);
      }

      return res.json({ success: true, bundle: updated });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid bundle update", details: err.errors });
      }
      console.error("[admin/bundle-definitions] patch error:", err);
      return res.status(500).json({ error: "Failed to update bundle" });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Task #131 — Admin: Booking analytics
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/booking-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
//   - single  = bookings with exactly 1 child item
//   - bundle  = bookings with 2+ children OR bundleAppliedCode set
//   - aov     = average finalTotal per group
//   - attachRatePerPrimary = primary serviceCode → bundle_count / total_count
//   - topCombinations = top-5 combos (sorted child serviceCode tuples)
//
// All aggregation is done in-memory: booking volume is small enough that
// this is significantly simpler than five overlapping SQL queries.
router.get("/admin/booking-analytics", isAuthenticated, async (req: any, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const conditions: any[] = [];
    if (req.query.from) {
      const from = new Date(String(req.query.from));
      if (!isNaN(from.getTime())) conditions.push(gte(bookings.createdAt, from));
    }
    if (req.query.to) {
      // Inclusive end date: bump a date-only `to` (e.g. "2026-04-19") to
      // start-of-next-day so the whole day is included; then use `<`
      // (strict less-than) to avoid double-counting any record that
      // happens to land exactly on midnight of the next day.
      const raw = String(req.query.to);
      const to = new Date(raw);
      if (!isNaN(to.getTime())) {
        const endExclusive = new Date(to.getTime());
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
        if (dateOnly) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        conditions.push(sql`${bookings.createdAt} < ${endExclusive}`);
      }
    }

    const parents = await db
      .select()
      .from(bookings)
      .where(conditions.length ? and(...conditions) : undefined);
    const ids = parents.map((p) => p.id);

    const items = ids.length
      ? await db
          .select()
          .from(bookingServiceItems)
          .where(inArray(bookingServiceItems.bookingId, ids))
      : [];
    const itemsByBooking = new Map<string, BookingServiceItem[]>();
    for (const it of items) {
      const arr = itemsByBooking.get(it.bookingId) ?? [];
      arr.push(it);
      itemsByBooking.set(it.bookingId, arr);
    }

    let singleCount = 0;
    let bundleCount = 0;
    let singleTotal = 0;
    let bundleTotal = 0;

    // attach rate per primary service: keyed by the *first* child serviceCode
    // (the customer's anchor service). primary → { total, withBundle }.
    const attach = new Map<string, { total: number; withBundle: number }>();

    // top combinations: keyed by sorted-tuple of child serviceCodes.
    const combos = new Map<string, { combo: string[]; count: number; revenue: number }>();

    for (const p of parents) {
      const children = itemsByBooking.get(p.id) ?? [];
      if (children.length === 0) continue;
      const final = parseFloat(p.finalTotal);
      const isBundle = children.length > 1 || !!p.bundleAppliedCode;

      if (isBundle) {
        bundleCount += 1;
        bundleTotal += final;
      } else {
        singleCount += 1;
        singleTotal += final;
      }

      const primary = children[0].serviceCode;
      const slot = attach.get(primary) ?? { total: 0, withBundle: 0 };
      slot.total += 1;
      if (isBundle) slot.withBundle += 1;
      attach.set(primary, slot);

      if (isBundle) {
        const combo = Array.from(new Set(children.map((c) => c.serviceCode))).sort();
        const key = combo.join("|");
        const slot2 = combos.get(key) ?? { combo, count: 0, revenue: 0 };
        slot2.count += 1;
        slot2.revenue += final;
        combos.set(key, slot2);
      }
    }

    const attachRatePerPrimary = Array.from(attach.entries())
      .map(([serviceCode, v]) => ({
        serviceCode,
        totalBookings: v.total,
        bundleBookings: v.withBundle,
        attachRate: v.total > 0 ? +(v.withBundle / v.total).toFixed(4) : 0,
      }))
      .sort((a, b) => b.totalBookings - a.totalBookings);

    const topCombinations = Array.from(combos.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c) => ({ ...c, revenue: +c.revenue.toFixed(2) }));

    return res.json({
      range: {
        from: req.query.from || null,
        to: req.query.to || null,
      },
      single: {
        count: singleCount,
        revenue: +singleTotal.toFixed(2),
        aov: singleCount > 0 ? +(singleTotal / singleCount).toFixed(2) : 0,
      },
      bundle: {
        count: bundleCount,
        revenue: +bundleTotal.toFixed(2),
        aov: bundleCount > 0 ? +(bundleTotal / bundleCount).toFixed(2) : 0,
      },
      attachRatePerPrimary,
      topCombinations,
    });
  } catch (err) {
    console.error("[admin/booking-analytics] error:", err);
    return res.status(500).json({ error: "Failed to load booking analytics" });
  }
});

export default router;
