import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { lawnCareQuotes, lawnCarePlans } from "@shared/schema";
import { calculateLawnCareQuote } from "../lib/lawnCarePricing";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  return next();
}

function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const role = user?.role || user?.userType;
  if (!user || !["admin", "business_owner"].includes(role)) {
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
  requestedStartDate: z.string().optional(),
  requestedTimeWindow: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/lawn-care/quote — public (no auth required to submit a quote request)
router.post("/quote", async (req: Request, res: Response) => {
  try {
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

// POST /api/lawn-care/activate-plan/:id — admin only
router.post("/activate-plan/:id", requireAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [quote] = await db.select().from(lawnCareQuotes).where(eq(lawnCareQuotes.id, id));
    if (!quote) return res.status(404).json({ error: "Quote not found" });

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
