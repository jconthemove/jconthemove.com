// Task #175 - Launch checklist runner.
//
// Each scenario is a self-contained probe for one launch-critical surface:
// payments, pricing, public booking, quick requests, worker rep pages,
// profit-share defaults, or payout safety. Wired to a single admin page at
// /admin/launch-checklist; an operator clicks "Run" and watches each row
// turn green before publishing.

import { pool } from "../db";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validatePaymentEnv } from "./envValidation";
import { classifyPayment } from "./paymentClassifier";
import { computeBookingQuote } from "./bookingPricing";
import { validateRedemption, tokensToDollars } from "../../shared/tokenRedemptionRules";
import { isDispatchable } from "../dispatch/isDispatchable";
import { getAppUrl } from "../appUrl";

export type ScenarioId =
  | "env_required"
  | "database_readiness"
  | "square_configured"
  | "btc_address_configured"
  | "pricing_engine"
  | "token_redemption"
  | "payment_classifier_deposit"
  | "payment_classifier_pay_on_completion"
  | "deposit_gating"
  | "wallet_table"
  | "btc_sweep_alive"
  | "public_app_url"
  | "public_conversion_routes"
  | "admin_access_ready"
  | "public_booking_catalog"
  | "quick_request_notifications"
  | "quick_request_storage"
  | "tracked_marketing_funnel"
  | "marketing_rep_pages"
  | "profit_share_settings"
  | "payout_safety_gate";

export interface ScenarioResult {
  id: ScenarioId;
  label: string;
  ok: boolean;
  detail: string;
  ranAt: string;
  ms: number;
}

interface Scenario {
  id: ScenarioId;
  label: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

type MarketingProbeIds = {
  campaignId: string;
  bookingId?: string | null;
  leadId?: string | null;
};

function probeTrackingUrl(args: {
  campaignId: string;
  area: string;
  focus: string;
  promoCode: string;
  repSlug: string;
}) {
  const url = new URL("https://www.jconthemove.com/book");
  url.searchParams.set("mode", "quick");
  url.searchParams.set("utm_source", "launch_checklist");
  url.searchParams.set("utm_medium", "probe");
  url.searchParams.set("utm_campaign", "launch-checklist-funnel");
  url.searchParams.set("utm_content", args.campaignId);
  url.searchParams.set("jc_campaign", args.campaignId);
  url.searchParams.set("jc_area", args.area);
  url.searchParams.set("jc_focus", args.focus);
  url.searchParams.set("promo", args.promoCode);
  url.searchParams.set("rep", args.repSlug);
  return url;
}

async function cleanupMarketingProbe(ids: MarketingProbeIds): Promise<string[]> {
  const errors: string[] = [];
  const run = async (sql: string, params: unknown[]) => {
    try {
      await pool.query(sql, params);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  };

  await run(
    `DELETE FROM booking_funnel_events
      WHERE booking_id = $2
         OR lead_id = $3
         OR field_snapshot #>> '{attribution,marketingCampaignId}' = $1
         OR field_snapshot #>> '{attribution,marketingTracking,jcCampaign}' = $1`,
    [ids.campaignId, ids.bookingId || "__none__", ids.leadId || "__none__"],
  );
  await run(
    `DELETE FROM quote_attributions
      WHERE booking_id = $2
         OR lead_id = $3
         OR metadata->>'launchProbe' = $1
         OR metadata->>'marketingCampaignId' = $1
         OR metadata #>> '{marketingTracking,jcCampaign}' = $1`,
    [ids.campaignId, ids.bookingId || "__none__", ids.leadId || "__none__"],
  );
  await run(
    `DELETE FROM leads
      WHERE id = $2
         OR booking_id = $3
         OR quote_snapshot->>'launchProbe' = $1
         OR email = $4`,
    [
      ids.campaignId,
      ids.leadId || "__none__",
      ids.bookingId || "__none__",
      `launch-checklist+${ids.campaignId}@jconthemove.local`,
    ],
  );
  await run(`DELETE FROM booking_service_items WHERE booking_id = $1`, [ids.bookingId || "__none__"]);
  await run(`DELETE FROM bookings WHERE id = $1`, [ids.bookingId || "__none__"]);
  await run(`DELETE FROM marketing_webhook_deliveries WHERE campaign_id = $1`, [ids.campaignId]);
  await run(`DELETE FROM marketing_webhook_campaigns WHERE id = $1`, [ids.campaignId]);
  return errors;
}

async function runTrackedMarketingFunnelProbe(): Promise<{ ok: boolean; detail: string }> {
  const campaignId = `launch-probe-${crypto.randomUUID()}`;
  const area = "Launch Checklist Area";
  const focus = "Moving launch probe";
  const promoCode = "LAUNCHPROBE";
  const repSlug = "launch-probe";
  const source = "launch_checklist_probe";
  const ids: MarketingProbeIds = { campaignId };
  let outcome: { ok: boolean; detail: string } | null = null;

  try {
    const trackedUrl = probeTrackingUrl({ campaignId, area, focus, promoCode, repSlug });
    const urlChecks = {
      area: trackedUrl.searchParams.get("jc_area"),
      focus: trackedUrl.searchParams.get("jc_focus"),
      promo: trackedUrl.searchParams.get("promo"),
      campaign: trackedUrl.searchParams.get("jc_campaign"),
    };
    const badUrlKeys = Object.entries({
      area,
      focus,
      promo: promoCode,
      campaign: campaignId,
    }).filter(([key, expected]) => urlChecks[key as keyof typeof urlChecks] !== expected);
    if (badUrlKeys.length > 0) {
      throw new Error(`tracked URL missing ${badUrlKeys.map(([key]) => key).join(", ")}`);
    }

    const marketingTracking = {
      utmSource: "launch_checklist",
      utmMedium: "probe",
      utmCampaign: "launch-checklist-funnel",
      utmContent: campaignId,
      jcCampaign: campaignId,
      jcArea: area,
      jcFocus: focus,
      referrer: trackedUrl.toString(),
    };

    await pool.query(
      `INSERT INTO marketing_webhook_campaigns
        (id, campaign_name, title, message, area, focus, audience, image_url, cta_url, cta_label,
         promo_code, rep_slug, source, actor_id, payload)
       VALUES
        ($1, 'Launch Checklist Funnel Probe', 'Tracked marketing funnel probe',
         'Synthetic checklist probe for campaign attribution.',
         $2, $3, 'Launch checklist', NULL, $4, 'Book / Quote',
         $5, $6, $7, NULL, $8::jsonb)`,
      [
        campaignId,
        area,
        focus,
        trackedUrl.toString(),
        promoCode,
        repSlug,
        source,
        JSON.stringify({ launchProbe: campaignId, trackedUrl: trackedUrl.toString(), marketingTracking }),
      ],
    );

    const bookingResult = await pool.query<{ id: string }>(
      `INSERT INTO bookings
        (customer_name, customer_email, customer_phone, service_address, notes,
         subtotal, discount_total, final_total, status, source)
       VALUES
        ('Launch Checklist Probe', $1, '555-0199', '1 Launch Probe Way',
         'Synthetic tracked marketing funnel probe.',
         300.00, 0.00, 300.00, 'quote', $2)
       RETURNING id`,
      [`launch-checklist+${campaignId}@jconthemove.local`, source],
    );
    ids.bookingId = bookingResult.rows[0]?.id || null;
    if (!ids.bookingId) throw new Error("booking insert did not return an id");

    await pool.query(
      `INSERT INTO booking_service_items
        (booking_id, service_code, service_label, quantity, unit_price, line_subtotal, price_mode, details)
       VALUES
        ($1, 'moving', 'Moving', 1.00, 300.00, 300.00, 'fixed', $2::jsonb)`,
      [ids.bookingId, JSON.stringify({ launchProbe: campaignId, area, focus })],
    );

    const leadResult = await pool.query<{ id: string }>(
      `INSERT INTO leads
        (first_name, last_name, email, phone, service_type, from_address, details,
         source, status, promo_code, booking_id, quote_snapshot, base_price, total_price)
       VALUES
        ('Launch', 'Probe', $1, '555-0199', 'Residential Move', '1 Launch Probe Way',
         $2, $3, 'quote_requested', $4, $5, $6::jsonb, 300.00, 300.00)
       RETURNING id`,
      [
        `launch-checklist+${campaignId}@jconthemove.local`,
        [
          "[LAUNCH CHECKLIST MARKETING FUNNEL PROBE]",
          `Campaign: ${campaignId}`,
          `Area: ${area}`,
          `Focus: ${focus}`,
          `Promo: ${promoCode}`,
        ].join("\n"),
        source,
        promoCode,
        ids.bookingId,
        JSON.stringify({
          launchProbe: campaignId,
          attribution: {
            source,
            promoCode,
            referralSlug: repSlug,
            marketingCampaignId: campaignId,
            marketingTracking,
          },
        }),
      ],
    );
    ids.leadId = leadResult.rows[0]?.id || null;
    if (!ids.leadId) throw new Error("lead insert did not return an id");

    await pool.query(
      `INSERT INTO quote_attributions
        (lead_id, booking_id, user_id, attribution_type, promo_code, metadata)
       VALUES
        ($1, $2, NULL, 'marketing_campaign_booking', $3, $4::jsonb)`,
      [
        ids.leadId,
        ids.bookingId,
        promoCode,
        JSON.stringify({
          launchProbe: campaignId,
          source,
          referralSlug: repSlug,
          marketingCampaignId: campaignId,
          marketingTracking,
          quoteTotal: 300,
        }),
      ],
    );

    await pool.query(
      `INSERT INTO booking_funnel_events
        (visitor_id, session_id, page, event_type, step, booking_id, lead_id, field_snapshot)
       VALUES
        ($1, $2, '/book', 'submit_success', 'confirm', $3, $4, $5::jsonb)`,
      [
        `launch-probe-visitor-${campaignId}`,
        `launch-probe-session-${campaignId}`,
        ids.bookingId,
        ids.leadId,
        JSON.stringify({
          launchProbe: campaignId,
          attribution: {
            promoCode,
            referralSlug: repSlug,
            marketingCampaignId: campaignId,
            marketingTracking,
          },
        }),
      ],
    );

    const attributionResult = await pool.query<{
      promo_code: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT promo_code, metadata
         FROM quote_attributions
        WHERE booking_id = $1
          AND metadata->>'launchProbe' = $2
        LIMIT 1`,
      [ids.bookingId, campaignId],
    );
    const attribution = attributionResult.rows[0];
    const meta = attribution?.metadata || {};
    const tracked = meta.marketingTracking && typeof meta.marketingTracking === "object" && !Array.isArray(meta.marketingTracking)
      ? meta.marketingTracking as Record<string, unknown>
      : {};
    const attributionOk =
      attribution?.promo_code === promoCode &&
      meta.marketingCampaignId === campaignId &&
      tracked.jcArea === area &&
      tracked.jcFocus === focus &&
      tracked.jcCampaign === campaignId;
    if (!attributionOk) {
      throw new Error(`booking attribution mismatch: ${JSON.stringify({ promo: attribution?.promo_code, meta })}`);
    }

    const { listMarketingCampaignPerformance } = await import("./marketingWebhookReminders");
    const performanceRows = await listMarketingCampaignPerformance(20);
    const performance = (performanceRows as any[]).find((row) => row.id === campaignId);
    if (!performance) throw new Error("campaign performance row was not returned");
    const performanceOk =
      performance.area === area &&
      performance.focus === focus &&
      performance.promo_code === promoCode &&
      Number(performance.funnel_events || 0) >= 1 &&
      Number(performance.submit_successes || 0) >= 1 &&
      Number(performance.attributed_bookings || 0) >= 1;
    if (!performanceOk) {
      throw new Error(`campaign performance mismatch: ${JSON.stringify(performance)}`);
    }

    const bookingAnalyticsResult = await pool.query<{
      campaign_id: string | null;
      bookings: number;
      promo_codes: string[] | null;
      areas: string[] | null;
      focuses: string[] | null;
    }>(
      `SELECT
          COALESCE(
            NULLIF(qa.metadata->>'marketingCampaignId', ''),
            NULLIF(qa.metadata #>> '{marketingTracking,jcCampaign}', ''),
            NULLIF(qa.metadata #>> '{marketingTracking,utmContent}', ''),
            NULLIF(qa.metadata #>> '{marketingTracking,utmCampaign}', '')
          ) AS campaign_id,
          COUNT(DISTINCT b.id)::int AS bookings,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT qa.promo_code), NULL) AS promo_codes,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT qa.metadata #>> '{marketingTracking,jcArea}'), NULL) AS areas,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT qa.metadata #>> '{marketingTracking,jcFocus}'), NULL) AS focuses
        FROM bookings b
        JOIN quote_attributions qa ON qa.booking_id = b.id
       WHERE b.id = $1
       GROUP BY 1`,
      [ids.bookingId],
    );
    const analytics = bookingAnalyticsResult.rows[0];
    const bookingAnalyticsOk =
      analytics?.campaign_id === campaignId &&
      Number(analytics.bookings || 0) === 1 &&
      (analytics.promo_codes || []).includes(promoCode) &&
      (analytics.areas || []).includes(area) &&
      (analytics.focuses || []).includes(focus);
    if (!bookingAnalyticsOk) {
      throw new Error(`booking analytics attribution mismatch: ${JSON.stringify(analytics)}`);
    }

    outcome = {
      ok: true,
      detail: `tracked link, booking attribution, and campaign analytics confirmed (${campaignId}; ${area}; ${focus}; ${promoCode})`,
    };
  } catch (error) {
    outcome = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    const cleanupErrors = await cleanupMarketingProbe(ids);
    if (cleanupErrors.length > 0 && outcome?.ok) {
      outcome = {
        ok: false,
        detail: `probe passed but cleanup failed: ${cleanupErrors.slice(0, 2).join("; ")}`,
      };
    }
  }

  return outcome || { ok: false, detail: "marketing funnel probe did not finish" };
}

const SCENARIOS: Scenario[] = [
  {
    id: "env_required",
    label: "All required payment env vars present",
    run: async () => {
      const r = validatePaymentEnv();
      return r.ok
        ? { ok: true, detail: `all ${r.details.length} checks present (${r.missingOptional.length} optional unset)` }
        : { ok: false, detail: `missing required: ${r.missingRequired.join(", ")}` };
    },
  },
  {
    id: "database_readiness",
    label: "Database readiness probe can reach Postgres",
    run: async () => {
      const { rows } = await pool.query<{ database_name: string; server_time: string }>(`
        SELECT current_database() AS database_name, NOW()::text AS server_time
      `);
      const row = rows[0];
      return row?.database_name
        ? { ok: true, detail: `connected to ${row.database_name} at ${row.server_time}` }
        : { ok: false, detail: "Postgres responded without database metadata" };
    },
  },
  {
    id: "square_configured",
    label: "Square invoicing configured (token + environment)",
    run: async () => {
      const tok = !!process.env.SQUARE_ACCESS_TOKEN;
      const env = !!process.env.SQUARE_ENVIRONMENT;
      if (!tok || !env) return { ok: false, detail: `token=${tok} environment=${env}` };
      try {
        const { squareInvoiceService } = await import("./square-invoice");
        const locationId = await squareInvoiceService.getLocationId();
        return {
          ok: true,
          detail: `environment=${process.env.SQUARE_ENVIRONMENT}; location=${locationId}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          detail: `environment=${process.env.SQUARE_ENVIRONMENT}; auth probe failed: ${message}`,
        };
      }
    },
  },
  {
    id: "btc_address_configured",
    label: "BTC wallet address configured when BTC payments are enabled",
    run: async () => {
      const addr = process.env.BTC_WALLET_ADDRESS;
      const btcRequired = process.env.BTC_PAYMENTS_ENABLED === "true" || process.env.BTC_REQUIRED === "true";
      if (!addr && !btcRequired) {
        return { ok: true, detail: "BTC payments optional for current launch; BTC_WALLET_ADDRESS not set" };
      }
      if (!addr) return { ok: false, detail: "BTC payments enabled but BTC_WALLET_ADDRESS is not set" };
      return { ok: true, detail: `address=${addr.slice(0, 8)}...${addr.slice(-6)}` };
    },
  },
  {
    id: "pricing_engine",
    label: "Pricing engine returns a coherent quote",
    run: async () => {
      const quote = computeBookingQuote([
        { serviceCode: "moving", label: "Moving", quantity: 3, unitPrice: 110, priceMode: "hourly" },
      ]);
      const ok = quote.subtotal === 330 && quote.finalTotal === 330 && quote.tokenEstimate > 0;
      return ok
        ? { ok: true, detail: `subtotal=$${quote.subtotal} tokens=${quote.tokenEstimate}` }
        : { ok: false, detail: `unexpected: subtotal=$${quote.subtotal} final=$${quote.finalTotal}` };
    },
  },
  {
    id: "token_redemption",
    label: "Token redemption rules enforce min + cap",
    run: async () => {
      const tooSmall = validateRedemption(100, 200, "bronze");
      const happyPath = validateRedemption(1000, 200, "bronze");
      if (tooSmall.valid) return { ok: false, detail: "min not enforced" };
      if (!happyPath.valid) return { ok: false, detail: `happy path rejected: ${happyPath.message}` };
      return {
        ok: true,
        detail: `1000 JCMOVES -> $${tokensToDollars(happyPath.effectiveTokens).toFixed(2)} discount`,
      };
    },
  },
  {
    id: "payment_classifier_deposit",
    label: "Payment classifier flags deposit-required services",
    run: async () => {
      const plan = classifyPayment({ finalTotal: 600, serviceCodes: ["moving"] });
      return plan.kind === "deposit_required" && plan.depositAmount > 0
        ? { ok: true, detail: `${plan.kind} amount=$${plan.depositAmount} reason="${plan.reason}"` }
        : { ok: false, detail: `unexpected plan ${plan.kind}` };
    },
  },
  {
    id: "payment_classifier_pay_on_completion",
    label: "Small low-risk job classified pay-on-completion",
    run: async () => {
      const plan = classifyPayment({ finalTotal: 90, serviceCodes: ["window_cleaning"] });
      return plan.kind === "pay_on_completion"
        ? { ok: true, detail: plan.reason }
        : { ok: false, detail: `unexpected plan ${plan.kind}` };
    },
  },
  {
    id: "deposit_gating",
    label: "Dispatch gate blocks an unpaid deposit lead",
    run: async () => {
      const probeId = `__launch_probe_${Date.now()}`;
      try {
        await pool.query(
          `INSERT INTO leads (id, first_name, last_name, email, phone, service_type, from_address,
                              status, deposit_required, deposit_paid)
           VALUES ($1, 'Probe', 'Test', 'probe@example.com', '555-0100', 'moving', '1 Probe St',
                   'quote_requested', true, false)`,
          [probeId],
        );
        const check = await isDispatchable(probeId);
        await pool.query(`DELETE FROM leads WHERE id = $1`, [probeId]);
        return !check.ok && (check.reason ?? "").includes("deposit")
          ? { ok: true, detail: `gate held: ${check.reason}` }
          : { ok: false, detail: `gate did not hold: ${JSON.stringify(check)}` };
      } catch (e) {
        try { await pool.query(`DELETE FROM leads WHERE id = $1`, [probeId]); } catch { /* ignore */ }
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    id: "wallet_table",
    label: "Wallet accounts table reachable",
    run: async () => {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM wallet_accounts`);
      return { ok: true, detail: `${rows[0]?.c ?? 0} wallet accounts on file` };
    },
  },
  {
    id: "btc_sweep_alive",
    label: "BTC auto-verify sweep configured when BTC payments are enabled",
    run: async () => {
      const btcRequired = process.env.BTC_PAYMENTS_ENABLED === "true" || process.env.BTC_REQUIRED === "true";
      if (!process.env.BTC_WALLET_ADDRESS) {
        return btcRequired
          ? { ok: false, detail: "BTC payments enabled but sweep disabled - BTC_WALLET_ADDRESS not set" }
          : { ok: true, detail: "BTC sweep disabled because BTC payments are optional for current launch" };
      }
      return { ok: true, detail: "sweep ticks every 2 min from server/index.ts" };
    },
  },
  {
    id: "public_app_url",
    label: "Public app URL points to the launch domain",
    run: async () => {
      const appUrl = getAppUrl();
      try {
        const parsed = new URL(appUrl);
        const host = parsed.hostname.toLowerCase();
        const configured = !!(process.env.APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim());
        const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
        if (parsed.protocol !== "https:") {
          return { ok: false, detail: `${appUrl} is not HTTPS` };
        }
        if (isLocal) {
          return { ok: false, detail: `${appUrl} is local-only; set APP_URL or RENDER_EXTERNAL_URL before launch` };
        }
        return {
          ok: true,
          detail: `${appUrl}${configured ? "" : " (using fallback launch domain)"}`,
        };
      } catch {
        return { ok: false, detail: `invalid app URL: ${appUrl}` };
      }
    },
  },
  {
    id: "public_conversion_routes",
    label: "Public customer and worker marketing routes are mounted",
    run: async () => {
      const appSourcePath = path.resolve(process.cwd(), "client/src/App.tsx");
      const builtClientPath = path.resolve(process.cwd(), "dist/public/index.html");
      const requiredRoutes = [
        "/book",
        "/services",
        "/pricing",
        "/gallery",
        "/reviews",
        "/network/:slug",
        "/rep/:slug",
        "/lawn-care",
        "/cleaning",
        "/window-cleaning",
        "/snow-removal",
        "/roofing",
        "/demolition",
      ] as const;
      if (!existsSync(appSourcePath)) {
        if (existsSync(builtClientPath)) {
          return {
            ok: true,
            detail: `production client bundle present; source route audit skipped because ${appSourcePath} is not deployed`,
          };
        }
        return {
          ok: false,
          detail: `neither source route file nor built client exists (${appSourcePath}, ${builtClientPath})`,
        };
      }
      const appSource = readFileSync(appSourcePath, "utf8");
      const hasRoute = (pathName: string) => (
        appSource.includes(`path="${pathName}"`) ||
        appSource.includes(`path='${pathName}'`)
      );
      const hasPublicRoot = appSource.includes("LandingPage") && appSource.includes("AuthenticatedApp");
      const missing = [
        ...(!hasPublicRoot ? ["/"] : []),
        ...requiredRoutes.filter((pathName) => !hasRoute(pathName)),
      ];
      return missing.length === 0
        ? { ok: true, detail: `${requiredRoutes.length + 1} public conversion and worker marketing routes mounted` }
        : { ok: false, detail: `missing public route(s): ${missing.join(", ")}` };
    },
  },
  {
    id: "admin_access_ready",
    label: "Admin/business-owner access account exists",
    run: async () => {
      const { rows } = await pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE role IN ('admin', 'business_owner')
          AND COALESCE(status, 'approved') = 'approved'
      `);
      const count = rows[0]?.count ?? 0;
      return count > 0
        ? { ok: true, detail: `${count} approved admin/business-owner account(s)` }
        : { ok: false, detail: "no approved admin or business-owner account found" };
    },
  },
  {
    id: "public_booking_catalog",
    label: "Public booking catalog has core launch services",
    run: async () => {
      const { rows } = await pool.query<{ code: string }>(`
        SELECT code
        FROM service_catalog
        WHERE is_active = true
      `);
      const codes = new Set(rows.map((row) => row.code));
      const required = ["moving", "junk_removal", "delivery", "cleaning"];
      const missing = required.filter((code) => !codes.has(code));
      return missing.length === 0
        ? { ok: true, detail: `${rows.length} active services; core booking funnel present` }
        : { ok: false, detail: `missing active service codes: ${missing.join(", ")}` };
    },
  },
  {
    id: "quick_request_notifications",
    label: "Quick request notifications configured for media-aware leads",
    run: async () => {
      const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      const hasSendgrid = !!process.env.SENDGRID_API_KEY;
      const hasAdminSms = !!(
        process.env.ADMIN_PHONE_NUMBER &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
      );
      const hasJobWebhook = !!(process.env.JC_JOB_EVENT_WEBHOOK_URLS || process.env.JOB_EVENT_WEBHOOK_URLS);
      const hasMarketingWebhook = !!(process.env.JC_MARKETING_WEBHOOK_URLS || process.env.MARKETING_WEBHOOK_URLS);
      const channels = [
        hasGmail ? "gmail" : "",
        hasSendgrid ? "sendgrid" : "",
        hasAdminSms ? "admin_sms" : "",
        hasJobWebhook ? "job_webhook" : "",
        hasMarketingWebhook ? "marketing_webhook" : "",
      ].filter(Boolean);
      return channels.length > 0
        ? { ok: true, detail: `available: ${channels.join(", ")}; media-link context is included when customers provide it` }
        : { ok: false, detail: "no email, admin SMS, or webhook notification channel is fully configured" };
    },
  },
  {
    id: "quick_request_storage",
    label: "Quick request photo, media-link + attribution storage ready",
    run: async () => {
      const { rows } = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'leads'
          AND column_name IN ('promo_code', 'photos', 'order_number', 'details', 'source')
      `);
      const columns = new Set(rows.map((row) => row.column_name));
      const required = ["promo_code", "photos", "order_number", "details", "source"];
      const missing = required.filter((name) => !columns.has(name));
      return missing.length === 0
        ? { ok: true, detail: "leads table can store source, promo code, photos, media links/details, and order number" }
        : { ok: false, detail: `missing lead columns: ${missing.join(", ")}` };
    },
  },
  {
    id: "tracked_marketing_funnel",
    label: "Tracked crew/webhook campaign link reaches booking + campaign analytics",
    run: runTrackedMarketingFunnelProbe,
  },
  {
    id: "marketing_rep_pages",
    label: "Worker marketing rep pages are share-ready",
    run: async () => {
      const { rows } = await pool.query<{
        id: string;
        slug: string | null;
        promo_code: string | null;
        display_name: string | null;
        promo_exists: boolean;
      }>(`
        SELECT mr.id, mr.slug, mr.promo_code, mr.display_name,
               EXISTS (
                 SELECT 1
                 FROM promo_codes pc
                 WHERE UPPER(pc.code) = UPPER(mr.promo_code)
                   AND pc.is_active = true
               ) AS promo_exists
        FROM marketing_reps mr
        WHERE mr.is_active = true
      `);

      if (rows.length === 0) {
        return { ok: false, detail: "no active marketing reps found; create at least one rep page before worker marketing" };
      }

      const badRows = rows.filter((row) => {
        const slugOk = !!row.slug && /^[a-z0-9-]+$/.test(row.slug);
        const promoOk = !!row.promo_code && row.promo_exists;
        return !slugOk || !promoOk;
      });
      if (badRows.length > 0) {
        return {
          ok: false,
          detail: `${badRows.length} active rep page(s) missing a clean slug or active promo code`,
        };
      }

      const slugCounts = new Map<string, number>();
      const promoCounts = new Map<string, number>();
      for (const row of rows) {
        const slug = String(row.slug || "").toLowerCase();
        const promo = String(row.promo_code || "").toUpperCase();
        slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
        promoCounts.set(promo, (promoCounts.get(promo) || 0) + 1);
      }
      const duplicateSlugs = [...slugCounts.entries()].filter(([, count]) => count > 1).map(([slug]) => slug);
      const duplicatePromos = [...promoCounts.entries()].filter(([, count]) => count > 1).map(([promo]) => promo);
      if (duplicateSlugs.length || duplicatePromos.length) {
        return {
          ok: false,
          detail: [
            duplicateSlugs.length ? `duplicate slugs: ${duplicateSlugs.join(", ")}` : "",
            duplicatePromos.length ? `duplicate promo codes: ${duplicatePromos.join(", ")}` : "",
          ].filter(Boolean).join("; "),
        };
      }

      return {
        ok: true,
        detail: `${rows.length} active rep page(s) have clean slugs and active promo codes`,
      };
    },
  },
  {
    id: "profit_share_settings",
    label: "Profit-share defaults match launch payout rules",
    run: async () => {
      const { rows } = await pool.query<{
        fuel_reserve_pct: string;
        vehicle_reserve_pct: string;
        insurance_reserve_pct: string;
        processing_fee_pct: string;
        company_profit_pct: string;
        crew_bonus_pct: string;
        referral_pct: string;
        growth_fund_pct: string;
      }>(`
        SELECT fuel_reserve_pct, vehicle_reserve_pct, insurance_reserve_pct, processing_fee_pct,
               company_profit_pct, crew_bonus_pct, referral_pct, growth_fund_pct
        FROM job_payout_settings
        WHERE is_default = true
        LIMIT 1
      `);
      const row = rows[0];
      if (!row) return { ok: false, detail: "no default job_payout_settings row found" };
      const expected: Record<keyof typeof row, number> = {
        fuel_reserve_pct: 0.05,
        vehicle_reserve_pct: 0.05,
        insurance_reserve_pct: 0.025,
        processing_fee_pct: 0.03,
        company_profit_pct: 0.7,
        crew_bonus_pct: 0.2,
        referral_pct: 0.05,
        growth_fund_pct: 0.05,
      };
      const mismatches = Object.entries(expected).filter(([key, expectedValue]) => {
        const actual = Number(row[key as keyof typeof row]);
        return Math.abs(actual - expectedValue) > 0.0001;
      });
      return mismatches.length === 0
        ? { ok: true, detail: "reserves 5/5/2.5/3 and split 70/20/5/5 confirmed" }
        : { ok: false, detail: `mismatch: ${mismatches.map(([key]) => key).join(", ")}` };
    },
  },
  {
    id: "payout_safety_gate",
    label: "No worker payouts exist before customer approval",
    run: async () => {
      const { rows } = await pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM job_worker_payouts p
        JOIN leads l ON l.id = p.lead_id
        WHERE l.status IN ('new', 'contacted', 'quote_requested', 'quoted', 'confirmed',
                           'available', 'accepted', 'assigned', 'payment_authorized',
                           'in_progress', 'completed')
      `);
      const count = rows[0]?.count ?? 0;
      return count === 0
        ? { ok: true, detail: "no premature worker payout records found" }
        : { ok: false, detail: `${count} payout record(s) attached to pre-approval jobs` };
    },
  },
];

export function listScenarios(): { id: ScenarioId; label: string }[] {
  return SCENARIOS.map(({ id, label }) => ({ id, label }));
}

export async function runScenario(id: ScenarioId): Promise<ScenarioResult> {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) {
    return {
      id,
      label: id,
      ok: false,
      detail: "unknown scenario",
      ranAt: new Date().toISOString(),
      ms: 0,
    };
  }
  const t0 = Date.now();
  try {
    const r = await s.run();
    return { id, label: s.label, ok: r.ok, detail: r.detail, ranAt: new Date().toISOString(), ms: Date.now() - t0 };
  } catch (e) {
    return {
      id,
      label: s.label,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      ranAt: new Date().toISOString(),
      ms: Date.now() - t0,
    };
  }
}

export async function runAllScenarios(): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  for (const s of SCENARIOS) out.push(await runScenario(s.id));
  return out;
}
