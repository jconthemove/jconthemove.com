import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { lawnCareQuotes, lawnCarePlans, type LawnCareQuote } from "@shared/schema";
import {
  calculateLawnCareQuote,
  sizeTierFromSqFt,
  SIZE_TIER_RANGES,
  ADD_ON_LABELS,
  CONDITION_LABELS,
  FREQUENCY_LABELS,
  type LawnCarePriceBreakdown,
} from "../lib/lawnCarePricing";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "../services/email";
import { disburseServiceTokens } from "../services/disburse-service-tokens";

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

function requireCrewOrAdminRole(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const user = (req as any).user;
  const role = user?.role || user?.userType;
  if (!role || !["admin", "business_owner", "employee"].includes(role)) {
    return res.status(403).json({ error: "Crew or admin access required" });
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

type JobBriefQuote = Pick<
  LawnCareQuote,
  "propertySize" | "propertyCondition" | "serviceFrequency" | "hasFence" | "hasPets" | "hasSteepSlope" | "needsHaulAway"
>;

function buildJobBriefHtml(quote: JobBriefQuote, pricing: LawnCarePriceBreakdown): string {
  const sizeLabel = SIZE_TIER_RANGES[pricing.sizeTier]?.label || quote.propertySize;
  const condLabel = CONDITION_LABELS[quote.propertyCondition] || quote.propertyCondition;
  const freqLabel = FREQUENCY_LABELS[quote.serviceFrequency] || quote.serviceFrequency;
  const flags: string[] = [];
  if (quote.hasFence) flags.push("Fenced yard — gate access needed");
  if (quote.hasPets) flags.push("Pets on property — be careful with gates");
  if (quote.hasSteepSlope) flags.push("Steep slope / hill (+15%)");
  if (quote.needsHaulAway) flags.push("Haul away debris (+$45)");
  const addOnsList = (pricing.addOnDetails || [])
    .map((a) => `<li>${a.label} <span style="color:#64748b">(+$${a.amount})</span></li>`)
    .join("") || "<li><em>None</em></li>";
  const adjList = (pricing.propertyAdjustments || [])
    .map((a) => `<li>${a.label} — ${a.explain || ""} <span style="color:#64748b">(+$${a.amount})</span></li>`)
    .join("") || "<li><em>None</em></li>";

  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-top:12px;font-family:system-ui,sans-serif;color:#0f172a">
      <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a">📋 Job Brief</h3>
      <p style="margin:2px 0;font-size:13px"><b>Yard size:</b> ${sizeLabel}</p>
      <p style="margin:2px 0;font-size:13px"><b>Condition:</b> ${condLabel} <span style="color:#64748b">(${pricing.conditionMultiplier}× — ${pricing.explanations?.condition || ""})</span></p>
      <p style="margin:2px 0;font-size:13px"><b>Frequency:</b> ${freqLabel} <span style="color:#64748b">(${pricing.explanations?.frequency || ""})</span></p>
      <p style="margin:2px 0;font-size:13px"><b>Recommended crew:</b> ${pricing.recommendedCrewSize}-person ${pricing.recommendedCrewType}</p>
      <p style="margin:2px 0;font-size:13px"><b>Time estimate:</b> ${pricing.estimatedMinutesMin}–${pricing.estimatedMinutesMax} min on-site</p>
      <p style="margin:8px 0 2px;font-size:13px"><b>Add-ons:</b></p>
      <ul style="margin:0 0 6px;padding-left:18px;font-size:13px">${addOnsList}</ul>
      <p style="margin:6px 0 2px;font-size:13px"><b>Property flags:</b></p>
      <ul style="margin:0 0 6px;padding-left:18px;font-size:13px">${flags.map(f => `<li>${f}</li>`).join("") || "<li><em>None</em></li>"}</ul>
      <p style="margin:6px 0 2px;font-size:13px"><b>Adjustments:</b></p>
      <ul style="margin:0;padding-left:18px;font-size:13px">${adjList}</ul>
    </div>
  `;
}

function buildJobBriefText(quote: JobBriefQuote, pricing: LawnCarePriceBreakdown): string {
  const sizeLabel = SIZE_TIER_RANGES[pricing.sizeTier]?.label || quote.propertySize;
  const condLabel = CONDITION_LABELS[quote.propertyCondition] || quote.propertyCondition;
  const freqLabel = FREQUENCY_LABELS[quote.serviceFrequency] || quote.serviceFrequency;
  const flags: string[] = [];
  if (quote.hasFence) flags.push("Fenced yard — gate access needed");
  if (quote.hasPets) flags.push("Pets on property");
  if (quote.hasSteepSlope) flags.push("Steep slope / hill (+15%)");
  if (quote.needsHaulAway) flags.push("Haul away debris (+$45)");
  const addOnsList = (pricing.addOnDetails || [])
    .map((a) => ` • ${a.label} (+$${a.amount})`)
    .join("\n") || " • None";
  return `
JOB BRIEF
---------
Yard size: ${sizeLabel}
Condition: ${condLabel} (${pricing.conditionMultiplier}×)
Frequency: ${freqLabel}
Recommended crew: ${pricing.recommendedCrewSize}-person ${pricing.recommendedCrewType}
Time estimate: ${pricing.estimatedMinutesMin}–${pricing.estimatedMinutesMax} min on-site

Add-ons:
${addOnsList}

Property flags:
${flags.length ? flags.map(f => ` • ${f}`).join("\n") : " • None"}
`.trim();
}

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

    if (data.email) {
      disburseServiceTokens({
        serviceType: "lawn_care",
        referenceId: quote.id,
        customerEmail: data.email,
        totalPrice: pricing.totalQuoted,
      }).catch(err => console.error("Lawn care token disburse error:", err));
    }

    const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
    const bundleNote = bundleAddons.length > 0
      ? `\n\n⚡ BUNDLE DISCOUNT: ${bundleAddons.join(", ")} — apply 10% off + up to $50 off on the add-on(s) when invoicing.`
      : "";
    const bundleHtml = bundleAddons.length > 0
      ? `<br><br><b style="color:green">⚡ Bundle Add-On (10% off + up to $50 off):</b> ${bundleAddons.join(", ")} — apply discount when invoicing.`
      : "";
    const briefHtml = buildJobBriefHtml(quote, pricing);
    const briefText = buildJobBriefText(quote, pricing);
    try {
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Lawn Care Quote — ${data.customerName}${bundleAddons.length > 0 ? " [+ Bundle Interest]" : ""}`,
        text: `New lawn care quote request.\n\nCustomer: ${data.customerName}\nPhone: ${data.phone}\nEmail: ${data.email || "N/A"}\nAddress: ${data.address}\nService: ${data.serviceCategory} — ${data.serviceFrequency}\nTotal: $${pricing.totalQuoted}${pricing.isCustomEstimate ? " (custom estimate)" : ""}\nNotes: ${data.notes || "—"}${bundleNote}\n\n${briefText}`,
        html: `<h2>New Lawn Care Quote</h2><p><b>Customer:</b> ${data.customerName}<br><b>Phone:</b> ${data.phone}<br><b>Email:</b> ${data.email || "N/A"}<br><b>Address:</b> ${data.address}<br><b>Service:</b> ${data.serviceCategory} — ${data.serviceFrequency}<br><b>Total:</b> $${pricing.totalQuoted}${pricing.isCustomEstimate ? " <em>(custom estimate)</em>" : ""}</p>${bundleHtml}${briefHtml}`,
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

// GET /api/lawn-care/lot-size?address=... — public; best-effort lot size detection
// Uses Google Geocoding (already configured) and optionally Regrid (if REGRID_API_KEY).
// Fails silently with { found: false } when no data available.
router.get("/lot-size", async (req: Request, res: Response) => {
  const address = String(req.query.address || "").trim();
  if (address.length < 6) return res.json({ found: false });

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleKey) return res.json({ found: false });

  try {
    // Step 1: Geocode the address to lat/lng
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return res.json({ found: false });
    const geoData: any = await geoRes.json();
    const result = geoData?.results?.[0];
    if (!result?.geometry?.location) return res.json({ found: false });
    const { lat, lng } = result.geometry.location;

    // Step 2: Try Regrid if key is present
    const regridKey = process.env.REGRID_API_KEY;
    if (regridKey) {
      try {
        const parcelUrl = `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lng}&token=${regridKey}`;
        const parcelRes = await fetch(parcelUrl);
        if (parcelRes.ok) {
          const parcelData: any = await parcelRes.json();
          const feature = parcelData?.parcels?.features?.[0];
          const props = feature?.properties?.fields;
          const ll_gisacre = props?.ll_gisacre;
          const ll_gissqft = props?.ll_gissqft;
          let sqFt: number | null = null;
          if (typeof ll_gissqft === "number" && ll_gissqft > 0) sqFt = Math.round(ll_gissqft);
          else if (typeof ll_gisacre === "number" && ll_gisacre > 0) sqFt = Math.round(ll_gisacre * 43560);
          if (sqFt && sqFt > 200) {
            return res.json({
              found: true,
              source: "regrid",
              squareFootage: sqFt,
              sizeTier: sizeTierFromSqFt(sqFt),
              sizeLabel: SIZE_TIER_RANGES[sizeTierFromSqFt(sqFt)].label,
              lat, lng,
            });
          }
        }
      } catch (e) {
        console.warn("Regrid lookup failed (silent):", (e as Error).message);
      }
    }

    // Step 3: No reliable Google-only lot-size source; return location only
    return res.json({ found: false, lat, lng });
  } catch (err) {
    console.warn("lot-size error (silent):", (err as Error).message);
    return res.json({ found: false });
  }
});

// GET /api/lawn-care/by-phone?phone=... — crew or admin only.
// Returns the minimum fields required to render the on-job crew brief
// for the most recent matching lawn care quote.
router.get("/by-phone", requireAuth, requireCrewOrAdminRole, async (req: Request, res: Response) => {
  const phoneRaw = String(req.query.phone || "");
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 7) return res.status(400).json({ error: "Invalid phone" });

  try {
    const rows = await db
      .select()
      .from(lawnCareQuotes)
      .where(sql`regexp_replace(${lawnCareQuotes.phone}, '\\D', '', 'g') = ${digits}`)
      .orderBy(desc(lawnCareQuotes.createdAt))
      .limit(1);

    if (rows.length === 0) return res.json({ found: false });
    const quote = rows[0];

    // Recompute pricing breakdown for shared rendering
    const pricing = calculateLawnCareQuote({
      serviceCategory: quote.serviceCategory,
      serviceFrequency: quote.serviceFrequency,
      propertySize: quote.propertySize,
      squareFootage: quote.squareFootage ?? undefined,
      propertyCondition: quote.propertyCondition,
      addOns: (quote.addOns as string[]) || [],
      hasFence: !!quote.hasFence,
      hasPets: !!quote.hasPets,
      hasSteepSlope: !!quote.hasSteepSlope,
      needsHaulAway: !!quote.needsHaulAway,
      zip: quote.zip || undefined,
    });

    // Least-privilege payload: only fields the crew brief renders.
    const safeQuote = {
      id: quote.id,
      serviceCategory: quote.serviceCategory,
      serviceFrequency: quote.serviceFrequency,
      propertySize: quote.propertySize,
      propertyCondition: quote.propertyCondition,
      addOns: (quote.addOns as string[]) || [],
      hasFence: !!quote.hasFence,
      hasPets: !!quote.hasPets,
      hasSteepSlope: !!quote.hasSteepSlope,
      needsHaulAway: !!quote.needsHaulAway,
      notes: quote.notes ?? null,
    };

    return res.json({ found: true, quote: safeQuote, pricing });
  } catch (err) {
    console.error("by-phone lookup error:", err);
    return res.status(500).json({ error: "Lookup failed" });
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
