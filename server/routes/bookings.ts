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
import { eq, and, asc, desc, or, inArray, ilike } from "drizzle-orm";
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
    const result = computeBookingQuote(pricingInputs, { bundleDefinitions: bundles });
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

// ── POST /api/bookings ─────────────────────────────────────────────────────
router.post("/bookings", async (req: Request, res: Response) => {
  try {
    const body = bookingCreateRequestSchema.parse(req.body);
    const catalog = await loadCatalog();
    const { pricingInputs, persistInputs } = resolveItems(body.items, catalog);
    const bundles = await loadBundles();
    const quote: BookingPricingResult = computeBookingQuote(pricingInputs, {
      bundleDefinitions: bundles,
    });

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

        await tx
          .update(bookings)
          .set({
            discountTotal: newDiscount.toFixed(2),
            finalTotal: newFinal.toFixed(2),
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
        return { previousDiscount, newDiscount, newFinal, audit };
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

export default router;
