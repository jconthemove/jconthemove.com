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
import { eq, and, asc } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "../db";

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
  bundleDefinitions,
  serviceCatalog,
  bookingQuoteRequestSchema,
  bookingCreateRequestSchema,
  type ServiceCatalogEntry,
  type BundleDefinition,
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

export default router;
