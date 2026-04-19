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
import { ZodError, z } from "zod";
import { db } from "../db";
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
  bookingQuoteRequestSchema,
  bookingCreateRequestSchema,
  type ServiceCatalogEntry,
  type BundleDefinition,
  type Booking,
  type BookingServiceItem,
} from "@shared/schema";
import {
  computeBookingQuote,
  type BookingPricingItemInput,
  type BundleDefinitionLike,
  type BookingPricingResult,
} from "../services/bookingPricing";

const router = Router();

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
    const unitPrice =
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

    pricingInputs.push({
      serviceCode: item.serviceCode,
      label,
      quantity: item.quantity,
      unitPrice,
      priceMode,
      discountEligible: cat.discountEligible,
      details: item.details || {},
    });
    persistInputs.push({
      serviceCode: item.serviceCode,
      serviceLabel: label,
      quantity: item.quantity,
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
    const bundles = await loadBundles();
    // Pull live reward-engine settings so the displayed estimate uses the
    // exact same flatBonus/earnRate the issuer (disburseBookingTokens) will
    // use at confirmation time. Booking creation snapshots these onto the
    // booking row to lock in parity even if settings change later.
    const settings = await loadBookingRewardSettings();
    const result = computeBookingQuote(pricingInputs, {
      bundleDefinitions: bundles,
      flatBookingBonus: settings.flatBonus,
      earnRatePerDollar: settings.earnRate,
    });
    return res.json({ success: true, quote: result });
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
    const recyclingDayOfWeek = details.recyclingDayOfWeek != null
      ? Math.max(1, Math.min(6, Number(details.recyclingDayOfWeek)))
      : null;
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
    const quote: BookingPricingResult = computeBookingQuote(pricingInputs, {
      bundleDefinitions: bundles,
      flatBookingBonus: settings.flatBonus,
      earnRatePerDollar: settings.earnRate,
    });
    const appliedMultiplier = quote.bundleApplied?.bonusMultiplier ?? 1;

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
          subtotal: quote.subtotal.toFixed(2),
          discountTotal: quote.discountTotal.toFixed(2),
          finalTotal: quote.finalTotal.toFixed(2),
          bundleAppliedCode: quote.bundleApplied?.code ?? null,
          tokenEstimate: quote.tokenEstimate,
          rewardFlatBonusSnapshot: Math.round(settings.flatBonus),
          rewardEarnRateSnapshot: settings.earnRate.toFixed(4),
          rewardBonusMultiplierSnapshot: appliedMultiplier.toFixed(2),
          status: "quote",
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
            quantity: p.quantity.toFixed(2),
            unitPrice: p.unitPrice.toFixed(2),
            lineSubtotal: pricingByIdx[idx].lineSubtotal.toFixed(2),
            priceMode: p.priceMode,
            details: p.details,
          })),
        );
      }
      return created;
    });

    // Task #131 — reward disbursement intentionally NOT fired here. Newly
    // created bookings start in `status: "quote"`; rewards must only be
    // issued once the customer (or an admin) confirms the booking via
    // POST /api/admin/bookings/:id/confirm.

    // Task #146 — auto-provision a Trash Valet subscription when bundled.
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

    return res.status(201).json({ success: true, booking, quote });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request", details: err.errors });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[bookings] persist error:", err);
    return res.status(500).json({ error: "Failed to create booking" });
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
