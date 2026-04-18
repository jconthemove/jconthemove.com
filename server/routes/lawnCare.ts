import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { lawnCareQuotes, lawnCarePlans, lawnCareRebookReminders, type LawnCareQuote } from "@shared/schema";
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
import {
  findEligibleRebookReminders,
  runRebookReminderSweep,
  buildRebookReminderEmail,
  getLastSweepInfo,
  REBOOK_ELIGIBILITY_DAYS,
  REBOOK_RESEND_WINDOW_DAYS,
  REBOOK_EMAIL_SOURCE,
  verifyUnsubscribeToken,
  recordOptout,
} from "../services/lawnCareRebookReminder";
import {
  checkSlidingWindow,
  checkCooldown,
  markCooldown,
  pruneStaleBuckets,
  ipRateLimit,
} from "../lib/persistentRateLimit";

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

    // Auto-apply 10% bundle discount when the customer is bundling another
    // service (intent) or has a paid/active record in another service in the
    // last 90 days (cross-service repeat).
    const { evaluateBundleDiscount, logBundleDiscountApplication } = await import("../services/bundleDiscount");
    const bundleDiscount = await evaluateBundleDiscount({
      currentService: "lawn_care",
      phone: data.phone,
      email: data.email || null,
      bundleAddons,
      subtotal: pricing.totalQuoted,
    });
    const finalTotalQuoted = bundleDiscount.applied ? bundleDiscount.finalTotal : pricing.totalQuoted;

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
      totalQuoted: String(finalTotalQuoted),
      bundleDiscountAmount: bundleDiscount.amount.toFixed(2),
      bundleDiscountReason: bundleDiscount.reason,
      isCustomEstimate: pricing.isCustomEstimate,
      requestedStartDate: data.requestedStartDate,
      requestedTimeWindow: data.requestedTimeWindow,
      status: "quote_requested",
    }).returning();

    if (bundleDiscount.applied) {
      logBundleDiscountApplication({
        referenceTable: "lawn_care_quotes",
        referenceId: quote.id,
        serviceType: "lawn_care",
        customerEmail: data.email || null,
        customerPhone: data.phone,
        subtotalBefore: pricing.totalQuoted,
        result: bundleDiscount,
      });
    }

    if (data.email) {
      disburseServiceTokens({
        serviceType: "lawn_care",
        referenceId: quote.id,
        customerEmail: data.email,
        totalPrice: pricing.totalQuoted,
      }).catch(err => console.error("Lawn care token disburse error:", err));
    }

    const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
    const bundleSubjectTag = bundleDiscount.applied
      ? (bundleDiscount.reason === "cross_service_history" ? " [REPEAT BUNDLE -10%]" : " [BUNDLE -10%]")
      : "";
    const bundleNote = bundleDiscount.applied
      ? `\n\n⚡ BUNDLE DISCOUNT APPLIED: 10% off ($${bundleDiscount.amount.toFixed(2)}) — already baked into the $${finalTotalQuoted.toFixed(2)} total. Reason: ${bundleDiscount.reason === "cross_service_history" ? `recent customer in ${bundleDiscount.triggeringServices.join(", ")}` : `bundling with ${bundleDiscount.triggeringServices.join(", ")}`}. Use this discounted total when invoicing.`
      : "";
    const bundleHtml = bundleDiscount.applied
      ? `<div style="background:#dcfce7;border:2px solid #22c55e;padding:10px 14px;border-radius:8px;margin-top:10px"><b style="color:#15803d">⚡ Bundle Discount Applied: −$${bundleDiscount.amount.toFixed(2)} (10%)</b><br><span style="color:#166534;font-size:13px">Already baked into the <b>$${finalTotalQuoted.toFixed(2)}</b> total — invoice at this rate. Reason: ${bundleDiscount.reason === "cross_service_history" ? `recent ${bundleDiscount.triggeringServices.join(", ")} customer` : `bundling with ${bundleDiscount.triggeringServices.join(", ")}`}.</span></div>`
      : "";
    const briefHtml = buildJobBriefHtml(quote, pricing);
    const briefText = buildJobBriefText(quote, pricing);
    try {
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Lawn Care Quote — ${data.customerName}${bundleSubjectTag}`,
        text: `New lawn care quote request.\n\nCustomer: ${data.customerName}\nPhone: ${data.phone}\nEmail: ${data.email || "N/A"}\nAddress: ${data.address}\nService: ${data.serviceCategory} — ${data.serviceFrequency}\nSubtotal: $${pricing.totalQuoted.toFixed(2)}\nTotal: $${finalTotalQuoted.toFixed(2)}${pricing.isCustomEstimate ? " (custom estimate)" : ""}\nNotes: ${data.notes || "—"}${bundleNote}\n\n${briefText}`,
        html: `<h2>New Lawn Care Quote</h2><p><b>Customer:</b> ${data.customerName}<br><b>Phone:</b> ${data.phone}<br><b>Email:</b> ${data.email || "N/A"}<br><b>Address:</b> ${data.address}<br><b>Service:</b> ${data.serviceCategory} — ${data.serviceFrequency}<br><b>Subtotal:</b> $${pricing.totalQuoted.toFixed(2)}<br><b>Total:</b> $${finalTotalQuoted.toFixed(2)}${pricing.isCustomEstimate ? " <em>(custom estimate)</em>" : ""}</p>${bundleHtml}${briefHtml}`,
      });
    } catch (emailErr) {
      console.error("Lawn care admin email failed:", emailErr);
    }

    const responsePricing = bundleDiscount.applied
      ? { ...pricing, totalQuoted: finalTotalQuoted }
      : pricing;
    return res.json({ success: true, quote, pricing: responsePricing, bundleDiscount });
  } catch (err: any) {
    console.error("Lawn care quote error:", err);
    if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid request", details: err.errors });
    return res.status(500).json({ error: "Failed to create quote" });
  }
});

// GET /api/lawn-care/lot-size?address=... — public; best-effort lot size detection
// Tries Regrid parcel data first (high confidence, real parcel boundary), then
// falls back to geocoding viewport math (low confidence, rough estimate).
// Returns { source, confidence, sourceLabel } so the UI can show how trustworthy
// the auto-detected lot size is.
//
// Throttled per-IP because every uncached lookup costs us a Google geocode
// (and possibly a Regrid hit). 30 lookups / 5 min covers a normal user
// experimenting with addresses but blocks scrapers.
router.get(
  "/lot-size",
  ipRateLimit({
    scope: "lawn_lot_size_ip",
    windowMs: 5 * 60_000,
    maxHits: 30,
    message: "Too many lot-size lookups. Try again in a few minutes.",
  }),
  async (req: Request, res: Response) => {
    maybePruneBuckets();
  const address = String(req.query.address || "").trim();
  if (address.length < 6) return res.json({ found: false });

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleKey) return res.json({ found: false });

  try {
    // Step 1: Geocode the address to lat/lng (and capture bounds for fallback math)
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return res.json({ found: false });
    const geoData: any = await geoRes.json();
    const result = geoData?.results?.[0];
    if (!result?.geometry?.location) return res.json({ found: false });
    const { lat, lng } = result.geometry.location;
    const locationType: string | undefined = result.geometry.location_type;
    const bounds = result.geometry.bounds || result.geometry.viewport;

    // Step 2: Try Regrid (real parcel polygon — highest confidence)
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
            const tier = sizeTierFromSqFt(sqFt);
            return res.json({
              found: true,
              source: "parcel",
              sourceLabel: "Measured from public parcel data",
              confidence: 0.95,
              squareFootage: sqFt,
              sizeTier: tier,
              sizeLabel: SIZE_TIER_RANGES[tier].label,
              lat, lng,
            });
          }
        }
      } catch (e) {
        console.warn("Regrid lookup failed (silent):", (e as Error).message);
      }
    }

    // Step 3: Viewport-bounds fallback — estimate area from the geocoder's
    // bounding box. Only meaningful for ROOFTOP / RANGE_INTERPOLATED hits;
    // otherwise the box is a whole street or city block and useless.
    if (
      bounds?.northeast && bounds?.southwest &&
      (locationType === "ROOFTOP" || locationType === "RANGE_INTERPOLATED")
    ) {
      const ne = bounds.northeast;
      const sw = bounds.southwest;
      const latDeg = ne.lat - sw.lat;
      const lngDeg = ne.lng - sw.lng;
      const centerLatRad = ((ne.lat + sw.lat) / 2) * (Math.PI / 180);
      const heightM = latDeg * 111_320;
      const widthM = lngDeg * 111_320 * Math.cos(centerLatRad);
      const areaM2 = Math.abs(heightM * widthM);
      const sqFt = Math.round(areaM2 * 10.7639);
      // Sanity: only return if result is in a plausible residential range
      // (1,000 sq ft up to ~3 acres). Anything bigger = block-level box.
      if (sqFt >= 1000 && sqFt <= 130_680) {
        const tier = sizeTierFromSqFt(sqFt);
        return res.json({
          found: true,
          source: "viewport",
          sourceLabel: "Rough estimate from map area",
          confidence: locationType === "ROOFTOP" ? 0.45 : 0.3,
          squareFootage: sqFt,
          sizeTier: tier,
          sizeLabel: SIZE_TIER_RANGES[tier].label,
          lat, lng,
        });
      }
    }

    return res.json({ found: false, lat, lng });
  } catch (err) {
    console.warn("lot-size error (silent):", (err as Error).message);
    return res.json({ found: false });
  }
});

// Persistent anti-abuse throttles for the public rebook + summary endpoints.
// State is stored in Postgres (rate_limit_buckets), so it survives process
// restarts — a determined scraper can no longer wait for the next deploy
// to reset the counter — and is shared across processes.
const REBOOK_THROTTLE_MS = 30_000;
const SUMMARY_WINDOW_MS = 60_000;
const SUMMARY_MAX_HITS = 20;

// Opportunistic housekeeping so the table doesn't accumulate forever.
// Fires at most once every 15 min per process and is fire-and-forget.
let lastPruneAt = 0;
function maybePruneBuckets() {
  const now = Date.now();
  if (now - lastPruneAt < 15 * 60_000) return;
  lastPruneAt = now;
  pruneStaleBuckets().catch(() => {});
}

// Geocode + haversine helper. Mirrors the logic in
// /api/utility/estimate-drive-miles so rebook pricing reproduces the
// same travel-fee outcome the original quote saw without an HTTP self-call.
const BASE_LAT = 46.4539; // Ironwood, MI
const BASE_LNG = -90.1715;
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function estimateDistanceMiles(address: string | null | undefined): Promise<number> {
  if (!address || address.trim().length < 4) return 0;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
    const r = await fetch(url, { headers: { "User-Agent": "JCOnTheMove/1.0 contact@jcontmove.com" } });
    if (!r.ok) return 0;
    const data = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (!data?.length) return 0;
    return haversineMiles(BASE_LAT, BASE_LNG, parseFloat(data[0].lat), parseFloat(data[0].lon));
  } catch {
    return 0;
  }
}

function maskAddress(addr: string | null | undefined): string {
  if (!addr) return "your address on file";
  // "712 Wilson St, Ironwood, MI 49938" -> "712 W••••• St, Ironwood, MI"
  const parts = addr.split(",").map(p => p.trim());
  const street = parts[0] || "";
  const tokens = street.split(/\s+/);
  const masked = tokens.map((t, i) => {
    if (i === 0) return t; // keep house number
    if (/^(St|Ave|Rd|Blvd|Ln|Dr|Ct|Way|Pl|Pkwy|Hwy)\.?$/i.test(t)) return t;
    if (t.length <= 1) return t;
    return t[0] + "•".repeat(Math.max(3, t.length - 1));
  }).join(" ");
  const tail = parts.slice(1, 3).join(", "); // city, state — drop zip
  return tail ? `${masked}, ${tail}` : masked;
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return "—";
  const maskedLocal = local.length <= 2 ? local[0] + "•" : local[0] + "•".repeat(Math.max(2, local.length - 2)) + local.slice(-1);
  return `${maskedLocal}@${domain}`;
}
function maskPhone(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return `•••-•••-${digits.slice(-4)}`;
}

function maskName(name: string | null | undefined): string {
  if (!name) return "Returning customer";
  const tokens = name.trim().split(/\s+/);
  const first = tokens[0] || "";
  const last = tokens[1] || "";
  return last ? `${first} ${last[0]}.` : first;
}

// GET /api/lawn-care/last-quote-summary?phone=... — PUBLIC.
// Returns a redacted summary of the customer's most recent lawn quote so
// they can confirm "yes that's me" before tapping re-book. Never returns
// raw email, full name, full address, or notes — only what's needed to
// recognize the prior service.
router.get("/last-quote-summary", async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  maybePruneBuckets();
  const allowed = await checkSlidingWindow("lawn_summary_ip", ip, SUMMARY_WINDOW_MS, SUMMARY_MAX_HITS);
  if (!allowed) {
    return res.status(429).json({ found: false, error: "Too many lookups. Try again in a minute." });
  }
  const phoneRaw = String(req.query.phone || "");
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 7) return res.json({ found: false });

  try {
    const rows = await db
      .select()
      .from(lawnCareQuotes)
      .where(sql`regexp_replace(${lawnCareQuotes.phone}, '\\D', '', 'g') = ${digits}`)
      .orderBy(desc(lawnCareQuotes.createdAt))
      .limit(1);

    if (rows.length === 0) return res.json({ found: false });
    const q = rows[0];
    const rawIds = ((q.addOns as string[]) || []);
    const addOnIds = rawIds;
    const addOnLabels = rawIds.map((id) => ADD_ON_LABELS[id] || id);

    return res.json({
      found: true,
      summary: {
        nameDisplay: maskName(q.customerName),
        addressMasked: maskAddress(q.address),
        serviceCategory: q.serviceCategory,
        serviceFrequency: q.serviceFrequency,
        propertySize: q.propertySize,
        propertyCondition: q.propertyCondition,
        addOnIds,
        addOnLabels,
        // Back-compat: keep `addOns` as labels for any older client cache.
        addOns: addOnLabels,
        lastTotal: q.totalQuoted,
        isCustomEstimate: !!q.isCustomEstimate,
        lastDate: q.createdAt,
      },
    });
  } catch (err) {
    console.error("last-quote-summary error:", err);
    return res.status(500).json({ error: "Lookup failed" });
  }
});

// Attribution allow-list. Anything outside this set is silently coerced to
// "organic" so arbitrary user-supplied utm strings can't pollute the
// dashboard, but the re-book is still tracked as a re-book (not lumped in
// with brand-new leads).
const ORGANIC_REBOOK_SOURCE = "organic";
const ALLOWED_REBOOK_SOURCES = new Set([REBOOK_EMAIL_SOURCE, ORGANIC_REBOOK_SOURCE]);

// GET /api/lawn-care/rebook-unsubscribe?email=...&phone=...&token=... — PUBLIC.
// One-click unsubscribe from re-book reminder emails. The token is an HMAC
// over (normalized email + phone), so we don't need to store a per-link
// secret — verifying the token is enough to know the click came from a
// legitimate email we sent. Idempotent: clicking twice still succeeds.
router.get("/rebook-unsubscribe", async (req: Request, res: Response) => {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  const phone = typeof req.query.phone === "string" ? req.query.phone : "";
  const token = typeof req.query.token === "string" ? req.query.token : "";

  const renderPage = (title: string, body: string, status = 200) => {
    res.status(status).type("html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
</head>
<body style="margin:0;background:#0f172a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:60px auto;padding:32px 28px;background:#1e293b;border-radius:14px;text-align:center;">
    <div style="font-size:13px;font-weight:700;color:#84cc16;letter-spacing:2px;margin-bottom:10px;">JC ON THE MOVE</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#fff;">${title}</h1>
    <div style="font-size:14px;color:#94a3b8;line-height:1.6;">${body}</div>
  </div>
</body></html>`);
  };

  if ((!email && !phone) || !token) {
    return renderPage("Invalid unsubscribe link", "This unsubscribe link is missing required information. If you keep getting reminders, just reply to one of our emails and we'll remove you manually.", 400);
  }
  if (!verifyUnsubscribeToken(token, email, phone)) {
    return renderPage("Invalid unsubscribe link", "We couldn't verify this unsubscribe link. If you keep getting reminders, just reply to one of our emails and we'll remove you manually.", 400);
  }

  try {
    await recordOptout(email, phone, "email_link");
    return renderPage(
      "You're unsubscribed",
      "You won't receive any more re-book reminder emails from us. If this was a mistake, just reply to one of our past emails and we'll add you back.",
    );
  } catch (err) {
    console.error("Re-book unsubscribe error:", err);
    return renderPage(
      "Something went wrong",
      "We couldn't process your unsubscribe right now. Please try again in a moment, or reply to one of our emails and we'll remove you manually.",
      500,
    );
  }
});

// POST /api/lawn-care/rebook — PUBLIC. Body: { phone, source? }.
// Re-creates a fresh lawn-care quote from the customer's most recent
// matching quote, recomputing pricing with today's engine. Sends the
// same admin email as a brand-new quote.
router.post("/rebook", async (req: Request, res: Response) => {
  const phoneRaw = String((req.body || {}).phone || "");
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 7) return res.status(400).json({ error: "Invalid phone" });

  // Accept attribution from the body (forwarded by the client from the
  // utm_source query param it received via the deep link). Drop anything
  // not on the allow-list so we never store junk.
  const sourceRaw = String((req.body || {}).source || "").trim().toLowerCase();
  // Default to "organic" so every re-book is tagged. This lets the admin
  // attribution stat distinguish a returning customer who came back on
  // their own from a brand-new lead (which still has rebookSource = NULL).
  const rebookSource = ALLOWED_REBOOK_SOURCES.has(sourceRaw) ? sourceRaw : ORGANIC_REBOOK_SOURCE;

  // Composite throttle: per-phone AND per-IP+phone, both 30s. Stops
  // accidental double-taps and stops a single client from cycling phones.
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  const compositeKey = `${ip}|${digits}`;
  maybePruneBuckets();
  const [waitPhone, waitComposite] = await Promise.all([
    checkCooldown("lawn_rebook_phone", digits, REBOOK_THROTTLE_MS),
    checkCooldown("lawn_rebook_ip_phone", compositeKey, REBOOK_THROTTLE_MS),
  ]);
  const waitMs = Math.max(waitPhone, waitComposite);
  if (waitMs > 0) {
    res.setHeader("Retry-After", Math.ceil(waitMs / 1000).toString());
    return res.status(429).json({
      error: "Please wait a moment before requesting another quote.",
      retryAfterMs: waitMs,
    });
  }

  try {
    const rows = await db
      .select()
      .from(lawnCareQuotes)
      .where(sql`regexp_replace(${lawnCareQuotes.phone}, '\\D', '', 'g') = ${digits}`)
      .orderBy(desc(lawnCareQuotes.createdAt))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "No previous quote found for that phone." });
    }
    const prev = rows[0];

    // Recompute drive distance from the saved address so travel-fee
    // parity holds vs. a fresh booking. Falls back to 0 silently.
    const distanceMiles = await estimateDistanceMiles(prev.address);

    const pricing = calculateLawnCareQuote({
      serviceCategory: prev.serviceCategory,
      serviceFrequency: prev.serviceFrequency,
      propertySize: prev.propertySize,
      squareFootage: prev.squareFootage ?? undefined,
      propertyCondition: prev.propertyCondition,
      addOns: (prev.addOns as string[]) || [],
      hasFence: !!prev.hasFence,
      hasPets: !!prev.hasPets,
      hasSteepSlope: !!prev.hasSteepSlope,
      needsHaulAway: !!prev.needsHaulAway,
      zip: prev.zip || undefined,
      distanceMiles,
    });

    await Promise.all([
      markCooldown("lawn_rebook_phone", digits),
      markCooldown("lawn_rebook_ip_phone", compositeKey),
    ]);

    const [quote] = await db.insert(lawnCareQuotes).values({
      customerName: prev.customerName,
      phone: prev.phone,
      email: prev.email,
      address: prev.address,
      city: prev.city,
      state: prev.state,
      zip: prev.zip,
      serviceType: "lawn_care",
      serviceCategory: prev.serviceCategory,
      serviceFrequency: prev.serviceFrequency,
      propertySize: prev.propertySize,
      squareFootage: prev.squareFootage ?? undefined,
      propertyCondition: prev.propertyCondition,
      addOns: prev.addOns as string[],
      notes: prev.notes ? `[Re-booked] ${prev.notes}` : "[Re-booked from previous quote]",
      hasFence: !!prev.hasFence,
      hasPets: !!prev.hasPets,
      hasSteepSlope: !!prev.hasSteepSlope,
      needsHaulAway: !!prev.needsHaulAway,
      recommendedCrewType: pricing.recommendedCrewType,
      recommendedCrewSize: pricing.recommendedCrewSize,
      basePrice: String(pricing.basePrice),
      conditionMultiplier: String(pricing.conditionMultiplier),
      frequencyMultiplier: String(pricing.frequencyMultiplier),
      addOnTotal: String(pricing.addOnTotal),
      travelFee: String(pricing.travelFee),
      totalQuoted: String(pricing.totalQuoted),
      isCustomEstimate: pricing.isCustomEstimate,
      status: "quote_requested",
      rebookSource,
    }).returning();

    if (prev.email) {
      disburseServiceTokens({
        serviceType: "lawn_care",
        referenceId: quote.id,
        customerEmail: prev.email,
        totalPrice: pricing.totalQuoted,
      }).catch(err => console.error("Lawn care rebook token disburse error:", err));
    }

    const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
    const briefHtml = buildJobBriefHtml(quote, pricing);
    const briefText = buildJobBriefText(quote, pricing);
    const sourceTag = rebookSource ? ` [via ${rebookSource}]` : "";
    try {
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `Lawn Care Re-Book — ${prev.customerName}${sourceTag}`,
        text: `Returning customer re-booked their last service.\n\nCustomer: ${prev.customerName}\nPhone: ${prev.phone}\nEmail: ${prev.email || "N/A"}\nAddress: ${prev.address}\nService: ${prev.serviceCategory} — ${prev.serviceFrequency}\nTotal: $${pricing.totalQuoted}${pricing.isCustomEstimate ? " (custom estimate)" : ""}\n\n${briefText}`,
        html: `<h2>🔁 Lawn Care Re-Book</h2><p>Returning customer tapped re-book.</p><p><b>Customer:</b> ${prev.customerName}<br><b>Phone:</b> ${prev.phone}<br><b>Email:</b> ${prev.email || "N/A"}<br><b>Address:</b> ${prev.address}<br><b>Service:</b> ${prev.serviceCategory} — ${prev.serviceFrequency}<br><b>Total:</b> $${pricing.totalQuoted}${pricing.isCustomEstimate ? " <em>(custom estimate)</em>" : ""}</p>${briefHtml}`,
      });
    } catch (emailErr) {
      console.error("Lawn care rebook admin email failed:", emailErr);
    }

    return res.json({ success: true, quote, pricing, rebooked: true });
  } catch (err) {
    console.error("Lawn care rebook error:", err);
    return res.status(500).json({ error: "Failed to re-book" });
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

// Attribution stat: re-books in the last `windowDays`, broken down by the
// rebookSource marker (rebook_email, organic = no marker, etc.) plus the
// number of reminder emails sent in that same window so each source can
// show its own conversion rate. Computed live from existing tables — no
// new counters — so the numbers stay correct after backfills/edits.
const REBOOK_ATTRIBUTION_WINDOW_DAYS = 60;
const ORGANIC_SOURCE = "organic";
const REBOOK_SOURCE_LABELS: Record<string, string> = {
  [REBOOK_EMAIL_SOURCE]: "Re-book Email",
  [ORGANIC_SOURCE]: "Organic (no source)",
};
function labelForSource(source: string): string {
  return REBOOK_SOURCE_LABELS[source] || source.replace(/_/g, " ");
}
type SourceStat = {
  source: string;
  label: string;
  rebooks: number;
  reminders: number | null;
  conversionRate: number | null;
};
async function getRebookAttributionStats(windowDays: number = REBOOK_ATTRIBUTION_WINDOW_DAYS) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Re-books grouped by source. The /rebook endpoint always tags every
  // re-booking with a source (defaulting to "organic"), so any non-NULL
  // rebookSource row is a real re-book — brand-new leads stay NULL and
  // are correctly excluded.
  const groupRows = await db
    .select({
      source: sql<string>`${lawnCareQuotes.rebookSource}`,
      n: sql<number>`count(*)::int`,
    })
    .from(lawnCareQuotes)
    .where(sql`${lawnCareQuotes.rebookSource} IS NOT NULL AND ${lawnCareQuotes.createdAt} >= ${cutoff}`)
    .groupBy(lawnCareQuotes.rebookSource);

  // Reminders dispatched (status='sent') in the window — only meaningful
  // for the rebook_email source today.
  const [remRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lawnCareRebookReminders)
    .where(sql`${lawnCareRebookReminders.status} = 'sent' AND ${lawnCareRebookReminders.sentAt} >= ${cutoff}`);
  const reminders = Number(remRow?.n || 0);

  const counts = new Map<string, number>();
  for (const r of groupRows) counts.set(r.source, Number(r.n || 0));
  // Always include the known sources so the card has stable rows even at
  // zero. Future channels (sms, social, …) get added as soon as one
  // re-book lands with that tag.
  for (const known of [REBOOK_EMAIL_SOURCE, ORGANIC_SOURCE]) {
    if (!counts.has(known)) counts.set(known, 0);
  }

  const bySource: SourceStat[] = Array.from(counts.entries())
    .map(([source, rebooks]) => {
      const isEmail = source === REBOOK_EMAIL_SOURCE;
      const sourceReminders = isEmail ? reminders : null;
      const conversionRate =
        sourceReminders && sourceReminders > 0 ? rebooks / sourceReminders : null;
      return { source, label: labelForSource(source), rebooks, reminders: sourceReminders, conversionRate };
    })
    .sort((a, b) => b.rebooks - a.rebooks || a.label.localeCompare(b.label));

  const totalRebooks = bySource.reduce((sum, s) => sum + s.rebooks, 0);
  const emailRow = bySource.find(s => s.source === REBOOK_EMAIL_SOURCE);
  // Top-level fields preserved for back-compat with any existing readers.
  return {
    windowDays,
    rebooks: emailRow?.rebooks ?? 0,
    reminders,
    conversionRate: emailRow?.conversionRate ?? null,
    totalRebooks,
    bySource,
  };
}

// GET /api/lawn-care/rebook-reminders/attribution — admin only
async function rebookAttributionHandler(_req: Request, res: Response) {
  try {
    const stats = await getRebookAttributionStats();
    return res.json(stats);
  } catch (err) {
    console.error("Re-book attribution error:", err);
    return res.status(500).json({ error: "Failed to compute attribution" });
  }
}

// GET /api/lawn-care/rebook-reminders/preview — admin only
// Lists customers eligible for a re-book email, plus a render of the first email.
async function rebookReminderPreviewHandler(_req: Request, res: Response) {
  try {
    // Uncapped: preview must report the TRUE count of customers who would
    // receive a reminder. We slice for the displayed sample list separately.
    const allEligible = await findEligibleRebookReminders();
    const eligible = allEligible.slice(0, 50);
    const sample = eligible[0]
      ? buildRebookReminderEmail({
          customerName: eligible[0].customerName,
          phone: eligible[0].phone,
          email: eligible[0].email,
          serviceCategory: eligible[0].serviceCategory,
          totalQuoted: eligible[0].totalQuoted,
          lastServiceAt: eligible[0].updatedAt,
        })
      : null;
    return res.json({
      eligibilityDays: REBOOK_ELIGIBILITY_DAYS,
      resendWindowDays: REBOOK_RESEND_WINDOW_DAYS,
      eligibleCount: allEligible.length,
      sampleSize: eligible.length,
      eligible: eligible.map(q => ({
        id: q.id,
        customerName: maskName(q.customerName),
        email: maskEmail(q.email),
        phone: maskPhone(q.phone),
        serviceCategory: q.serviceCategory,
        totalQuoted: q.totalQuoted,
        lastUpdated: q.updatedAt,
      })),
      sampleEmail: sample,
      lastRun: getLastSweepInfo(),
      attribution: await getRebookAttributionStats().catch(() => null),
    });
  } catch (err) {
    console.error("Re-book reminder preview error:", err);
    return res.status(500).json({ error: "Failed to load preview" });
  }
}

async function rebookReminderSendHandler(_req: Request, res: Response) {
  try {
    const result = await runRebookReminderSweep(undefined, "manual");
    return res.json({ success: true, ...result, lastRun: getLastSweepInfo() });
  } catch (err) {
    console.error("Re-book reminder send error:", err);
    return res.status(500).json({ error: "Failed to send reminders" });
  }
}

// Canonical admin handler paths (singular "rebook-reminder"). The router
// is mounted at BOTH "/api/lawn-care" and "/api/admin/lawn-care" so these
// resolve to the spec'd "/api/admin/lawn-care/rebook-reminder/{preview,send}"
// as well as a lawn-care-prefixed twin. Both still require admin auth.
router.get("/rebook-reminder/preview", requireAuth, requireAdminRole, rebookReminderPreviewHandler);
router.post("/rebook-reminder/send", requireAuth, requireAdminRole, rebookReminderSendHandler);
router.get("/rebook-reminder/attribution", requireAuth, requireAdminRole, rebookAttributionHandler);

// Back-compat aliases — earlier versions of the admin UI used these.
router.get("/rebook-reminders/preview", requireAuth, requireAdminRole, rebookReminderPreviewHandler);
router.post("/rebook-reminders/send", requireAuth, requireAdminRole, rebookReminderSendHandler);
router.get("/rebook-reminders/attribution", requireAuth, requireAdminRole, rebookAttributionHandler);

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
