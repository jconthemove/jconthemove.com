// ── Generic Service Re-book Reminder Sweep ───────────────────────────────────
// Email-only nudge for snow removal, junk removal, and window cleaning
// customers whose most recent completed lead is 30+ days old. Mirrors the
// design of lawnCareRebookReminder.ts (write-before-dispatch dedupe, advisory
// lock, 60-day re-send window) but parameterized by service config so the
// same engine drives all three (and future) service types.
//
// Lawn care continues to use its own service file because its eligibility
// model is built on lawn_care_quotes (not the leads table) and uses a
// service-specific dedupe table; sharing the same code path would have
// required a destabilizing refactor for marginal benefit.

import crypto from "crypto";
import { db, pool } from "../db";
import {
  leads,
  serviceRebookReminders,
  serviceRebookOptouts,
  type Lead,
} from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { sendEmail } from "./email";

export type ServiceKey = "snow_removal" | "junk_removal" | "window_cleaning";

// Per-service knobs. Keep additions to this map small — anything that
// isn't truly per-service belongs in the generic functions below.
export type ServiceConfig = {
  key: ServiceKey;
  label: string;            // "Snow Removal"
  emoji: string;            // "❄️"
  // The leads.serviceType values that count as this service. The leads
  // table accepts several legacy spellings (e.g. "junk" vs "junk_removal"),
  // so we accept any of them and treat them as the same service.
  leadServiceTypes: string[];
  deepLinkPath: string;     // "/snow-removal"
  utmSource: string;        // appended to deep link as utm_source
  ctaText: string;          // "Re-book Snow Removal"
  // Stable advisory lock key — must be unique per service to avoid one
  // service's sweep starving another's.
  advisoryLockKey: number;
  // Env flag that enables the daily scheduler tick for this service.
  schedulerEnvFlag: string;
};

export const SERVICE_CONFIGS: Record<ServiceKey, ServiceConfig> = {
  snow_removal: {
    key: "snow_removal",
    label: "Snow Removal",
    emoji: "❄️",
    leadServiceTypes: ["snow", "snow_removal"],
    // /snow-removal is an admin/service-log page; route customers to the
    // marketplace booking form so the lead carries rebookSource + sentAt.
    deepLinkPath: "/post-job?serviceType=snow_removal",
    utmSource: "rebook_email_snow",
    ctaText: "Re-book My Snow Service",
    advisoryLockKey: 916491002,
    schedulerEnvFlag: "ENABLE_REBOOK_REMINDER_EMAILS_SNOW",
  },
  junk_removal: {
    key: "junk_removal",
    label: "Junk Removal",
    emoji: "🗑️",
    leadServiceTypes: ["junk", "junk_removal"],
    deepLinkPath: "/post-job",
    utmSource: "rebook_email_junk",
    ctaText: "Re-book Junk Removal",
    advisoryLockKey: 916491003,
    schedulerEnvFlag: "ENABLE_REBOOK_REMINDER_EMAILS_JUNK",
  },
  window_cleaning: {
    key: "window_cleaning",
    label: "Window Cleaning",
    emoji: "🪟",
    leadServiceTypes: ["window_cleaning", "window cleaning", "window wash"],
    deepLinkPath: "/window-cleaning",
    utmSource: "rebook_email_window",
    ctaText: "Re-book Window Cleaning",
    advisoryLockKey: 916491004,
    schedulerEnvFlag: "ENABLE_REBOOK_REMINDER_EMAILS_WINDOW",
  },
};

// Re-book attribution source allow-list (Task #108). Mirrors the lawn-care
// pattern: leads.rebookSource is set to one of these strings only. Anything
// else is coerced to "organic" so we never persist user-controlled junk.
export const ORGANIC_REBOOK_SOURCE = "organic";
export const ALLOWED_LEAD_REBOOK_SOURCES: ReadonlySet<string> = new Set<string>([
  ORGANIC_REBOOK_SOURCE,
  ...Object.values(SERVICE_CONFIGS).map((c) => c.utmSource),
]);
export function normalizeLeadRebookSource(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  return ALLOWED_LEAD_REBOOK_SOURCES.has(s) ? s : ORGANIC_REBOOK_SOURCE;
}

// Parse a rebookSentAt query param. Discard anything that isn't a valid date
// or falls outside the recent attribution window (no future, no older than
// 120 days — slightly past REBOOK_RESEND_WINDOW_DAYS to forgive late clicks).
const REBOOK_SENT_AT_MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000;
export function normalizeLeadRebookSentAt(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  const now = Date.now();
  const t = parsed.getTime();
  if (t > now + 60_000) return null;                 // no future-dated clicks
  if (t < now - REBOOK_SENT_AT_MAX_AGE_MS) return null; // too old to attribute
  return parsed;
}

export const REBOOK_ELIGIBILITY_DAYS = 30;
export const REBOOK_RESEND_WINDOW_DAYS = 60;
export const REBOOK_SWEEP_HARD_CAP = 1000;

const FROM_EMAIL = process.env.FROM_EMAIL || "michigankid906@gmail.com";
const COMPANY_PHONE = process.env.COMPANY_PHONE || "(906) 285-9312";
const APP_URL = process.env.APP_URL?.trim()
  || process.env.RENDER_EXTERNAL_URL?.trim()
  || "https://jconthemove.com";

// ── One-click unsubscribe (Task #109) ────────────────────────────────────────
// HMAC-signed token over the (normalized email + phone) pair so the public
// unsubscribe endpoint can verify the click came from a legitimate email
// without keeping per-link state. Mirrors the lawn-care helper exactly.
const normEmail = (e: string | null | undefined) => (e || "").trim().toLowerCase();
const normPhone = (p: string | null | undefined) => (p || "").replace(/\D/g, "");
function unsubscribeSecret(): string {
  return process.env.REBOOK_UNSUBSCRIBE_SECRET
    || process.env.SESSION_SECRET
    || "jcmoves-rebook-unsub-fallback";
}
export function buildUnsubscribeToken(email: string | null | undefined, phone: string | null | undefined): string {
  const payload = `${normEmail(email)}|${normPhone(phone)}`;
  return crypto.createHmac("sha256", unsubscribeSecret()).update(payload).digest("base64url");
}
export function verifyUnsubscribeToken(
  token: string,
  email: string | null | undefined,
  phone: string | null | undefined,
): boolean {
  const expected = buildUnsubscribeToken(email, phone);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
export function buildUnsubscribeUrl(email: string | null | undefined, phone: string | null | undefined): string {
  const token = buildUnsubscribeToken(email, phone);
  const params = new URLSearchParams();
  if (email) params.set("email", normEmail(email));
  if (phone) params.set("phone", normPhone(phone));
  params.set("token", token);
  return `${APP_URL}/api/service-rebook/unsubscribe?${params.toString()}`;
}
export async function isOptedOut(email: string | null | undefined, phone: string | null | undefined): Promise<boolean> {
  const e = normEmail(email);
  const p = normPhone(phone);
  if (!e && !p) return false;
  const rows = await db
    .select({ id: serviceRebookOptouts.id })
    .from(serviceRebookOptouts)
    .where(sql`(${serviceRebookOptouts.email} IS NOT NULL AND lower(${serviceRebookOptouts.email}) = ${e})
      OR (${serviceRebookOptouts.phone} IS NOT NULL AND regexp_replace(${serviceRebookOptouts.phone}, '\\D', '', 'g') = ${p})`)
    .limit(1);
  return rows.length > 0;
}
export async function recordOptout(
  email: string | null | undefined,
  phone: string | null | undefined,
  source: string = "email_link",
): Promise<void> {
  const e = normEmail(email);
  const p = normPhone(phone);
  if (!e && !p) return;
  await db.execute(sql`
    INSERT INTO service_rebook_optouts (email, phone, source)
    VALUES (${e || null}, ${p || null}, ${source})
    ON CONFLICT DO NOTHING
  `);
}

function escHtml(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(e: string | null | undefined): boolean {
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// Per-service "last sweep" memory, mirroring lawnCareRebookReminder.
export type LastSweepInfo = {
  ranAt: string;
  attempted: number;
  sent: number;
  failed: number;
  skipped: boolean;
  trigger: "scheduler" | "manual";
};
const lastSweepByService = new Map<ServiceKey, LastSweepInfo>();
export function getLastSweepInfo(key: ServiceKey): LastSweepInfo | null {
  return lastSweepByService.get(key) ?? null;
}

export type EligibleLead = Pick<
  Lead,
  | "id"
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "fromAddress"
  | "serviceType"
  | "totalPrice"
  | "basePrice"
  | "completionRewardedAt"
  | "tokensDisbursedAt"
  | "createdAt"
> & { lastServiceAt: Date };

// Find leads of the given service that are completed, 30+ days old, with a
// valid email, and have NOT had a reminder sent in the past 60 days. Dedupe
// is per phone (across all leads of any serviceType for this service) — if
// any reminder for this service went out to that phone in the window, the
// whole customer is blocked.
export async function findEligibleRebooks(
  config: ServiceConfig,
  limit?: number,
): Promise<EligibleLead[]> {
  const cap = typeof limit === "number" && limit > 0 ? limit : Number.POSITIVE_INFINITY;
  const eligibilityCutoff = new Date(Date.now() - REBOOK_ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000);
  const dedupeCutoff = new Date(Date.now() - REBOOK_RESEND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Phones that have any reminder for THIS service in the past 60 days
  // (joined through leads). Normalize to digits-only on both sides.
  const recentRows = await db
    .select({ phone: leads.phone })
    .from(serviceRebookReminders)
    .innerJoin(leads, eq(serviceRebookReminders.leadId, leads.id))
    .where(
      and(
        eq(serviceRebookReminders.serviceKey, config.key),
        sql`${serviceRebookReminders.sentAt} >= ${dedupeCutoff}`,
      ),
    );
  const blockedPhones = new Set(
    recentRows.map((r) => (r.phone || "").replace(/\D/g, "")).filter(Boolean),
  );

  // Opt-outs (Task #109): also exclude any customer who clicked the
  // unsubscribe link in a past reminder. Both email and phone keys are
  // checked because a customer might unsubscribe via a link that only
  // carried one of the two values.
  const optoutRows = await db
    .select({ email: serviceRebookOptouts.email, phone: serviceRebookOptouts.phone })
    .from(serviceRebookOptouts);
  const optedOutEmails = new Set(
    optoutRows.map((r) => (r.email || "").trim().toLowerCase()).filter(Boolean),
  );
  const optedOutPhones = new Set(
    optoutRows.map((r) => (r.phone || "").replace(/\D/g, "")).filter(Boolean),
  );

  // Pull all completed leads for this service. Order so the latest per
  // phone wins (mirrors lawn-care "latest quote per phone" rule).
  const allCompleted = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.status, "completed"),
        inArray(leads.serviceType, config.leadServiceTypes),
      ),
    )
    .orderBy(desc(leads.createdAt));

  const latestPerPhone = new Map<string, Lead>();
  for (const l of allCompleted) {
    const phoneKey = (l.phone || "").replace(/\D/g, "");
    if (!phoneKey) continue;
    if (!latestPerPhone.has(phoneKey)) latestPerPhone.set(phoneKey, l);
  }

  const out: EligibleLead[] = [];
  for (const [phoneKey, l] of Array.from(latestPerPhone.entries())) {
    if (blockedPhones.has(phoneKey)) continue;
    if (optedOutPhones.has(phoneKey)) continue;
    const emailKey = (l.email || "").trim().toLowerCase();
    if (emailKey && optedOutEmails.has(emailKey)) continue;
    // Use the most reliable completion timestamp we can find. Falls back to
    // createdAt so legacy completed leads without a token-disburse stamp
    // can still be picked up.
    const lastServiceAt: Date | null =
      l.completionRewardedAt ?? l.tokensDisbursedAt ?? l.createdAt ?? null;
    if (!lastServiceAt) continue;
    if (lastServiceAt >= eligibilityCutoff) continue;
    if (!isValidEmail(l.email)) continue;
    out.push({ ...l, lastServiceAt });
    if (out.length >= cap) break;
  }
  return out;
}

export function buildReminderEmail(
  config: ServiceConfig,
  opts: {
    customerName: string;
    phone: string;
    email?: string | null;
    totalQuoted: string | null;
    lastServiceAt?: Date | string | null;
  },
): { html: string; text: string; subject: string } {
  const unsubscribeUrl = buildUnsubscribeUrl(opts.email ?? null, opts.phone);
  const firstNameRaw = (opts.customerName || "there").split(/\s+/)[0];
  const firstName = escHtml(firstNameRaw);
  const phoneDigits = (opts.phone || "").replace(/\D/g, "");
  // rebookSentAt encodes when this specific reminder was generated so the
  // booking endpoints can persist it on the resulting lead for per-send
  // attribution (Task #108). Server-side validated; 120-day max age.
  const sentAtIso = new Date().toISOString();
  // Use & if the configured deepLinkPath already carries a query string
  // (e.g. /post-job?service=snow_removal); otherwise start the query with ?.
  const sep = config.deepLinkPath.includes("?") ? "&" : "?";
  const deepLink = `${APP_URL}${config.deepLinkPath}${sep}rebook=1&phone=${encodeURIComponent(phoneDigits)}&utm_source=${config.utmSource}&rebookSentAt=${encodeURIComponent(sentAtIso)}`;
  const lastTotal = opts.totalQuoted ? `$${parseFloat(opts.totalQuoted).toFixed(2)}` : null;

  const lastDateObj = opts.lastServiceAt ? new Date(opts.lastServiceAt) : null;
  const lastDateStrRaw =
    lastDateObj && !isNaN(lastDateObj.getTime())
      ? lastDateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;
  const lastDateStr = lastDateStrRaw ? escHtml(lastDateStrRaw) : null;

  // Service-specific lead-in copy. Snow gets a season-aware nudge, junk
  // points back at the next clean-out, windows points at the next wash.
  const flavor: Record<ServiceKey, { lead: string; sub: string }> = {
    snow_removal: {
      lead: lastDateStr
        ? `Your last <strong style="color:#60a5fa;">snow removal</strong> with us was on <strong style="color:#cbd5e1;">${lastDateStr}</strong>. Storms don't slow down — and neither do we.`
        : `It's been about a month since your last <strong style="color:#60a5fa;">snow removal</strong>. Storms don't slow down — and neither do we.`,
      sub: `One tap re-books the same crew for the same driveway.`,
    },
    junk_removal: {
      lead: lastDateStr
        ? `Your last <strong style="color:#f59e0b;">junk haul</strong> with us was on <strong style="color:#cbd5e1;">${lastDateStr}</strong>. Got another load building up?`
        : `It's been about a month since your last <strong style="color:#f59e0b;">junk haul</strong>. Got another load building up?`,
      sub: `One tap re-books the same crew at the same address.`,
    },
    window_cleaning: {
      lead: lastDateStr
        ? `Your last <strong style="color:#22d3ee;">window cleaning</strong> with us was on <strong style="color:#cbd5e1;">${lastDateStr}</strong>. Streaks creeping back?`
        : `It's been about a month since your last <strong style="color:#22d3ee;">window cleaning</strong>. Streaks creeping back?`,
      sub: `One tap re-books the same wash for the same windows.`,
    },
  };
  const f = flavor[config.key];

  const subject = `${firstNameRaw}, ready for another ${config.label.toLowerCase()}? One-tap re-book inside`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#1e293b;border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#0c4a6e 0%,#0f172a 70%);padding:32px 28px 24px;text-align:center;">
          <div style="font-size:13px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">JC ON THE MOVE · ${escHtml(config.label)}</div>
          <div style="font-size:26px;font-weight:900;color:#ffffff;line-height:1.25;">${config.emoji} Time for another visit, ${firstName}?</div>
        </td></tr>
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:15px;color:#e2e8f0;">Hey <strong style="color:#fff;">${firstName}</strong>,</p>
          <p style="margin:10px 0 0;font-size:14px;color:#94a3b8;line-height:1.65;">${f.lead} ${f.sub}</p>
          ${lastTotal ? `<p style="margin:10px 0 0;font-size:13px;color:#64748b;">Last visit total: <strong style="color:#cbd5e1;">${lastTotal}</strong></p>` : ""}
        </td></tr>
        <tr><td style="padding:20px 28px 8px;text-align:center;">
          <a href="${deepLink}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#38bdf8,#0284c7);color:#0f172a;font-size:16px;font-weight:900;border-radius:10px;text-decoration:none;letter-spacing:0.5px;">
            🔁 ${escHtml(config.ctaText)}
          </a>
          <p style="margin:10px 0 0;font-size:11px;color:#475569;">One tap — same crew, same address.</p>
        </td></tr>
        <tr><td style="padding:18px 28px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 16px;">
            <tr><td style="font-size:11px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;">Need to make changes?</td></tr>
            <tr><td style="font-size:13px;color:#94a3b8;line-height:1.6;">
              📞 Call us anytime at <strong style="color:#e2e8f0;">${COMPANY_PHONE}</strong><br>
              📧 Or just reply to this email — we'll get you taken care of.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 28px 24px;text-align:center;color:#475569;font-size:11px;line-height:1.6;">
          JC ON THE MOVE LLC · Northwoods &amp; Upper Peninsula of Michigan<br>
          You received this because you booked a ${escHtml(config.label.toLowerCase())} job with us.<br>
          Don't want another reminder? <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe in one click</a>
          — or just ignore this email and we won't nudge you again for at least ${REBOOK_RESEND_WINDOW_DAYS} days.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Hey ${firstNameRaw},

It's been about a month since your last ${config.label.toLowerCase()} with us. One tap re-books the same crew at the same address.

Re-book here: ${deepLink}

${lastTotal ? `Last visit total: ${lastTotal}\n` : ""}Questions? Call ${COMPANY_PHONE} or reply to this email.

Don't want these reminders? Unsubscribe: ${unsubscribeUrl}

— JC ON THE MOVE LLC, Northwoods & UP of Michigan`;

  return { html, text, subject };
}

// Single-lead send. Writes dedupe row BEFORE dispatch (send-at-most-once).
export async function sendReminderForLead(
  config: ServiceConfig,
  lead: EligibleLead,
): Promise<{ ok: boolean; error?: string }> {
  if (!lead.email) return { ok: false, error: "no email on lead" };

  const [reminder] = await db
    .insert(serviceRebookReminders)
    .values({ serviceKey: config.key, leadId: lead.id, status: "sent" })
    .returning();

  try {
    const customerName = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "there";
    const { html, text, subject } = buildReminderEmail(config, {
      customerName,
      phone: lead.phone,
      email: lead.email,
      totalQuoted: lead.totalPrice ?? lead.basePrice ?? null,
      lastServiceAt: lead.lastServiceAt,
    });
    const ok = await sendEmail({ to: lead.email, from: FROM_EMAIL, subject, html, text });
    if (!ok) {
      await db
        .update(serviceRebookReminders)
        .set({ status: "failed" })
        .where(eq(serviceRebookReminders.id, reminder.id));
      return { ok: false, error: "sendEmail returned false" };
    }
    return { ok: true };
  } catch (err: unknown) {
    await db
      .update(serviceRebookReminders)
      .set({ status: "failed" })
      .where(eq(serviceRebookReminders.id, reminder.id));
    const msg = err instanceof Error ? err.message : "send threw";
    return { ok: false, error: msg };
  }
}

export async function runRebookSweep(
  config: ServiceConfig,
  limit: number = REBOOK_SWEEP_HARD_CAP,
  trigger: "scheduler" | "manual" = "manual",
): Promise<{
  attempted: number;
  sent: number;
  failed: number;
  failures: { leadId: string; error: string }[];
  skipped?: boolean;
}> {
  const client = await pool.connect();
  try {
    const lockRes = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
      [config.advisoryLockKey],
    );
    const got = lockRes.rows[0]?.pg_try_advisory_lock === true;
    if (!got) {
      console.warn(`[rebook-reminder:${config.key}] sweep skipped — another sweep is in progress`);
      lastSweepByService.set(config.key, {
        ranAt: new Date().toISOString(),
        attempted: 0,
        sent: 0,
        failed: 0,
        skipped: true,
        trigger,
      });
      return { attempted: 0, sent: 0, failed: 0, failures: [], skipped: true };
    }
    try {
      const eligible = await findEligibleRebooks(config, limit);
      let sent = 0,
        failed = 0;
      const failures: { leadId: string; error: string }[] = [];
      for (const l of eligible) {
        const r = await sendReminderForLead(config, l);
        if (r.ok) sent++;
        else {
          failed++;
          failures.push({ leadId: l.id, error: r.error || "unknown" });
        }
      }
      lastSweepByService.set(config.key, {
        ranAt: new Date().toISOString(),
        attempted: eligible.length,
        sent,
        failed,
        skipped: false,
        trigger,
      });
      return { attempted: eligible.length, sent, failed, failures };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [config.advisoryLockKey]);
    }
  } finally {
    client.release();
  }
}
