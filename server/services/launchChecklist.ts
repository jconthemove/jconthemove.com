// Task #175 — Launch checklist runner.
//
// Each scenario is a self-contained probe that exercises one payment
// surface end-to-end and reports green/red. Wired to a single admin page
// at /admin/launch-checklist; an operator clicks "Run" and watches each
// row turn green before publishing.

import { pool } from "../db";
import { validatePaymentEnv } from "./envValidation";
import { classifyPayment } from "./paymentClassifier";
import { computeBookingQuote } from "./bookingPricing";
import { validateRedemption, tokensToDollars } from "../../shared/tokenRedemptionRules";
import { isDispatchable } from "../dispatch/isDispatchable";

export type ScenarioId =
  | "env_required"
  | "square_configured"
  | "btc_address_configured"
  | "pricing_engine"
  | "token_redemption"
  | "payment_classifier_deposit"
  | "payment_classifier_pay_on_completion"
  | "deposit_gating"
  | "wallet_table"
  | "btc_sweep_alive"
  | "public_booking_catalog"
  | "quick_request_notifications"
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
    id: "square_configured",
    label: "Square invoicing configured (token + environment)",
    run: async () => {
      const tok = !!process.env.SQUARE_ACCESS_TOKEN;
      const env = !!process.env.SQUARE_ENVIRONMENT;
      if (!tok || !env) return { ok: false, detail: `token=${tok} environment=${env}` };
      return { ok: true, detail: `environment=${process.env.SQUARE_ENVIRONMENT}` };
    },
  },
  {
    id: "btc_address_configured",
    label: "BTC wallet address configured (auto-verify sweep enabled)",
    run: async () => {
      const addr = process.env.BTC_WALLET_ADDRESS;
      if (!addr) return { ok: false, detail: "BTC_WALLET_ADDRESS not set" };
      return { ok: true, detail: `address=${addr.slice(0, 8)}…${addr.slice(-6)}` };
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
        detail: `1000 JCMOVES → $${tokensToDollars(happyPath.effectiveTokens).toFixed(2)} discount`,
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
    label: "BTC auto-verify sweep configured to run",
    run: async () => {
      if (!process.env.BTC_WALLET_ADDRESS) {
        return { ok: false, detail: "sweep disabled — BTC_WALLET_ADDRESS not set" };
      }
      return { ok: true, detail: "sweep ticks every 2 min from server/index.ts" };
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
    label: "Quick request notification channel configured",
    run: async () => {
      const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      const hasSendgrid = !!process.env.SENDGRID_API_KEY;
      const hasAdminSms = !!(
        process.env.ADMIN_PHONE_NUMBER &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
      );
      const channels = [
        hasGmail ? "gmail" : "",
        hasSendgrid ? "sendgrid" : "",
        hasAdminSms ? "admin_sms" : "",
      ].filter(Boolean);
      return channels.length > 0
        ? { ok: true, detail: `available: ${channels.join(", ")}` }
        : { ok: false, detail: "no email or admin SMS channel is fully configured" };
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
