import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { lawnCareQuotes, lawnCarePlans } from "@shared/schema";
import { calculateLawnCareQuote } from "../lib/lawnCarePricing";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "../services/email";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  return next();
}

function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const user = (req as any).user;
  const role = user?.role || user?.userType;
  if (!role || !["admin", "business_owner"].includes(role)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}

const quoteRequestSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(3),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  serviceCategory: z.string().min(1),
  serviceFrequency: z.string().min(1),
  propertySize: z.string().min(1),
  squareFootage: z.number().optional(),
  propertyCondition: z.string().min(1),
  addOns: z.array(z.string()).default([]),
  hasFence: z.boolean().optional(),
  hasPets: z.boolean().optional(),
  hasSteepSlope: z.boolean().optional(),
  needsHaulAway: z.boolean().optional(),
  distanceMiles: z.number().optional(),
  requestedStartDate: z.string().optional(),
  requestedTimeWindow: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/lawn-care/quote — public (no auth required to submit a quote request)
router.post("/quote", async (req: Request, res: Response) => {
  try {
    const bundleAddons: string[] = Array.isArray((req.body as any).bundleAddons) ? (req.body as any).bundleAddons : [];
    const data = quoteRequestSchema.parse(req.body);

    const pricing = calculateLawnCareQuote({
      serviceCategory: data.serviceCategory,
      serviceFrequency: data.serviceFrequency,
      propertySize: data.propertySize,
      squareFootage: data.squareFootage,
      propertyCondition: data.propertyCondition,
      addOns: data.addOns,
      hasFence: data.hasFence,
      hasPets: data.hasPets,
      hasSteepSlope: data.hasSteepSlope,
      needsHaulAway: data.needsHaulAway,
      zip: data.zip,
      distanceMiles: data.distanceMiles,
    });

    const [quote] = await db.insert(lawnCareQuotes).values({
      customerName: data.customerName,
      phone: data.phone,
      email: data.email || null,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      serviceType: "lawn_care",
      serviceCategory: data.serviceCategory,
      serviceFrequency: data.serviceFrequency,
      propertySize: data.propertySize,
      squareFootage: data.squareFootage,
      propertyCondition: data.propertyCondition,
      addOns: data.addOns,
      notes: data.notes,
      hasFence: data.hasFence ?? false,
      hasPets: data.hasPets ?? false,
      hasSteepSlope: data.hasSteepSlope ?? false,
      needsHaulAway: data.needsHaulAway ?? false,
      recommendedCrewType: pricing.recommendedCrewType,
      recommendedCrewSize: pricing.recommendedCrewSize,
      basePrice: String(pricing.basePrice),
      conditionMultiplier: String(pricing.conditionMultiplier),
      frequencyMultiplier: String(pricing.frequencyMultiplier),
      addOnTotal: String(pricing.addOnTotal),
      travelFee: String(pricing.travelFee),
      totalQuoted: String(pricing.totalQuoted),
      isCustomEstimate: pricing.isCustomEstimate,
      requestedStartDate: data.requestedStartDate,
      requestedTimeWindow: data.requestedTimeWindow,
      status: "quote_requested",
    }).returning();

    // Notify admin (non-blocking)
    const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
    const bundleNote = bundleAddons.length > 0
      ? `\n\n⚡ BUNDLE DISCOUNT: ${bundleAddons.join(", ")} — apply 10% off + up to $50 off on the add-on(s) when invoicing.`
      : "";
    const bundleHtml = bundleAddons.length > 0
      ? `<br><br><b style="color:green">⚡ Bundle Add-On (10% off + up to $50 off):</b> ${bundleAddons.join(", ")} — apply discount when invoicing.`
      : "";
    try {
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Lawn Care Quote — ${data.customerName}${bundleAddons.length > 0 ? " [+ Bundle Interest]" : ""}`,
        text: `New lawn care quote request.\n\nCustomer: ${data.customerName}\nPhone: ${data.phone}\nEmail: ${data.email || "N/A"}\nAddress: ${data.address}\nService: ${data.serviceCategory} — ${data.serviceFrequency}\nProperty size: ${data.propertySize}\nCondition: ${data.propertyCondition}\nTotal: $${pricing.totalQuoted}${pricing.isCustomEstimate ? " (custom estimate)" : ""}\nAdd-ons: ${(data.addOns || []).join(", ") || "none"}\nNotes: ${data.notes || "—"}${bundleNote}`,
        html: `<h2>New Lawn Care Quote</h2><p><b>Customer:</b> ${data.customerName}<br><b>Phone:</b> ${data.phone}<br><b>Email:</b> ${data.email || "N/A"}<br><b>Address:</b> ${data.address}<br><b>Service:</b> ${data.serviceCategory} — ${data.serviceFrequency}<br><b>Property:</b> ${data.propertySize} / ${data.propertyCondition}<br><b>Total:</b> $${pricing.totalQuoted}${pricing.isCustomEstimate ? " <em>(custom estimate)</em>" : ""}<br><b>Add-ons:</b> ${(data.addOns || []).join(", ") || "none"}</p>${bundleHtml}`,
      });
    } catch (emailErr) {
      console.error("Lawn care admin email failed:", emailErr);
    }

    return res.json({ success: true, quote, pricing });
  } catch (err: any) {
    console.error("Lawn care quote error:", err);
    if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid request", details: err.errors });
    return res.status(500).json({ error: "Failed to create quote" });
  }
});

// GET /api/lawn-care/quotes — admin only
router.get("/quotes", requireAuth, requireAdminRole, async (_req: Request, res: Response) => {
  try {
    const quotes = await db.select().from(lawnCareQuotes).orderBy(desc(lawnCareQuotes.createdAt));
    return res.json(quotes);
  } catch (err) {
    console.error("Fetch lawn care quotes error:", err);
    return res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

// POST /api/lawn-care/approve/:id — admin only
router.post("/approve/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(lawnCareQuotes)
      .set({ status: "approved" })
      .where(eq(lawnCareQuotes.id, id))
      .returning();
    return res.json({ success: true, quote: updated });
  } catch (err) {
    console.error("Approve lawn care quote error:", err);
    return res.status(500).json({ error: "Failed to approve quote" });
  }
});

// POST /api/lawn-care/mark-paid/:id — admin only
router.post("/mark-paid/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(lawnCareQuotes)
      .set({ status: "paid" })
      .where(eq(lawnCareQuotes.id, id))
      .returning();
    return res.json({ success: true, quote: updated });
  } catch (err) {
    console.error("Mark paid lawn care quote error:", err);
    return res.status(500).json({ error: "Failed to mark quote as paid" });
  }
});

// POST /api/lawn-care/activate-plan/:id — admin only (idempotent)
router.post("/activate-plan/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [quote] = await db.select().from(lawnCareQuotes).where(eq(lawnCareQuotes.id, id));
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Idempotency: return existing plan if already activated
    const existing = await db.select().from(lawnCarePlans).where(eq(lawnCarePlans.quoteId, id));
    if (existing.length > 0) {
      return res.json({ success: true, plan: existing[0], alreadyActive: true });
    }

    await db.update(lawnCareQuotes)
      .set({ status: "plan_active" })
      .where(eq(lawnCareQuotes.id, id));

    const [plan] = await db.insert(lawnCarePlans).values({
      quoteId: id,
      customerName: quote.customerName,
      phone: quote.phone,
      email: quote.email,
      address: quote.address,
      city: quote.city,
      state: quote.state,
      zip: quote.zip,
      frequency: quote.serviceFrequency,
      startDate: quote.requestedStartDate || new Date().toISOString().split("T")[0],
      nextServiceDate: quote.requestedStartDate || new Date().toISOString().split("T")[0],
      isActive: true,
      crewType: quote.recommendedCrewType,
      crewSize: quote.recommendedCrewSize,
      serviceCategory: quote.serviceCategory,
      propertySize: quote.propertySize,
      propertyCondition: quote.propertyCondition,
      addOns: quote.addOns as string[],
      recurringPrice: quote.totalQuoted,
      notes: quote.notes,
    }).returning();

    return res.json({ success: true, plan });
  } catch (err) {
    console.error("Activate lawn care plan error:", err);
    return res.status(500).json({ error: "Failed to activate plan" });
  }
});

// GET /api/lawn-care/plans — admin only
router.get("/plans", requireAuth, requireAdminRole, async (_req: Request, res: Response) => {
  try {
    const plans = await db.select().from(lawnCarePlans).orderBy(desc(lawnCarePlans.createdAt));
    return res.json(plans);
  } catch (err) {
    console.error("Fetch lawn care plans error:", err);
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
});

export default router;
