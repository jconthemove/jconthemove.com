// ── Lawn Care Re-book Reminder Service ────────────────────────────────────────
// Email-only sweep that nudges lawn care customers who completed (paid) a
// one-off job 30+ days ago to book again with a one-tap deep link.
//
// Send-at-most-once safety:
//   • A row is inserted into lawn_care_rebook_reminders BEFORE the email is
//     dispatched. If the send throws, the row is updated to status='failed' so
//     the operator can see what happened — but the dedupe still holds.
//   • Re-send window of 60 days prevents an over-eager re-nudge.
//
// All time math in UTC. Only triggered by:
//   • Daily setInterval scheduler in server/index.ts (guarded by env flag)
//   • Manual admin POST /api/lawn-care/rebook-reminders/send endpoint

import { db, pool } from "../db";
import { lawnCareQuotes, lawnCareRebookReminders, type LawnCareQuote } from "@shared/schema";
import { and, eq, lt, sql, desc, inArray } from "drizzle-orm";
import { sendEmail } from "./email";

// Stable advisory-lock key for the daily re-book sweep. Prevents two
// overlapping sweeps (manual + scheduler, or multi-instance) from racing
// on the same eligible candidate set.
const SWEEP_ADVISORY_LOCK_KEY = 916491001;

// Minimal HTML escaper for user-controlled values that get interpolated
// into email HTML. Keeps the email template safe from injected markup.
function escHtml(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const REBOOK_ELIGIBILITY_DAYS = 30;
export const REBOOK_RESEND_WINDOW_DAYS = 60;
export const REBOOK_BATCH_LIMIT = 25;

const FROM_EMAIL = process.env.FROM_EMAIL || "michigankid906@gmail.com";
const COMPANY_PHONE = process.env.COMPANY_PHONE || "(906) 285-9312";
const APP_URL = process.env.APP_URL || "https://jconthemove.com";

export type EligibleQuote = Pick<
  LawnCareQuote,
  "id" | "customerName" | "phone" | "email" | "address" | "city" | "state" | "serviceCategory" | "serviceFrequency" | "totalQuoted" | "updatedAt"
>;

// Find paid one-time lawn care quotes 30+ days old, with email, that have not
// had a reminder sent in the past 60 days. Dedupe is **per customer (phone)**
// — if any quote belonging to that phone has been reminded within 60 days,
// the whole customer is blocked, even on a different quote id.
export async function findEligibleRebookReminders(limit = REBOOK_BATCH_LIMIT): Promise<EligibleQuote[]> {
  const eligibilityCutoff = new Date(Date.now() - REBOOK_ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000);
  const dedupeCutoff = new Date(Date.now() - REBOOK_RESEND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Phones that have any reminder in the past 60 days (joined through the
  // quote that was reminded). Normalize digits-only on both sides for parity.
  const recentRows = await db
    .select({ phone: lawnCareQuotes.phone })
    .from(lawnCareRebookReminders)
    .innerJoin(lawnCareQuotes, eq(lawnCareRebookReminders.quoteId, lawnCareQuotes.id))
    .where(sql`${lawnCareRebookReminders.sentAt} >= ${dedupeCutoff}`);
  const blockedPhones = new Set(recentRows.map(r => (r.phone || "").replace(/\D/g, "")).filter(Boolean));

  const candidates = await db
    .select()
    .from(lawnCareQuotes)
    .where(and(
      eq(lawnCareQuotes.status, "paid"),
      lt(lawnCareQuotes.updatedAt, eligibilityCutoff),
      sql`${lawnCareQuotes.email} IS NOT NULL AND ${lawnCareQuotes.email} <> ''`,
    ))
    .orderBy(desc(lawnCareQuotes.updatedAt))
    .limit(limit * 4);

  const seenPhones = new Set<string>();
  const out: EligibleQuote[] = [];
  for (const q of candidates) {
    const phoneKey = (q.phone || "").replace(/\D/g, "");
    if (!phoneKey || seenPhones.has(phoneKey) || blockedPhones.has(phoneKey)) continue;
    seenPhones.add(phoneKey);
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildRebookReminderEmail(opts: {
  customerName: string;
  phone: string;
  serviceCategory: string;
  totalQuoted: string | null;
}): { html: string; text: string; subject: string } {
  const firstNameRaw = (opts.customerName || "there").split(/\s+/)[0];
  const firstName = escHtml(firstNameRaw);
  const phoneDigits = (opts.phone || "").replace(/\D/g, "");
  const deepLink = `${APP_URL}/book-lawn-care?rebook=1&phone=${encodeURIComponent(phoneDigits)}`;
  const lastTotal = opts.totalQuoted ? `$${parseFloat(opts.totalQuoted).toFixed(2)}` : null;
  const svcLabel = escHtml((opts.serviceCategory || "lawn service").replace(/_/g, " "));

  const subject = `${firstNameRaw}, ready for another ${(opts.serviceCategory || "lawn service").replace(/_/g, " ")}? One-tap re-book inside`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#1e293b;border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#14532d 0%,#0f172a 70%);padding:32px 28px 24px;text-align:center;">
          <div style="font-size:13px;font-weight:700;color:#84cc16;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">JC ON THE MOVE · Lawn Care</div>
          <div style="font-size:26px;font-weight:900;color:#ffffff;line-height:1.25;">🌱 Time for another visit, ${firstName}?</div>
        </td></tr>
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:15px;color:#e2e8f0;">Hey <strong style="color:#fff;">${firstName}</strong>,</p>
          <p style="margin:10px 0 0;font-size:14px;color:#94a3b8;line-height:1.65;">
            It's been about a month since your last <strong style="color:#84cc16;">${svcLabel}</strong> with us. The grass doesn't slow down — and neither do we. One tap re-books your last service exactly the same way.
          </p>
          ${lastTotal ? `<p style="margin:10px 0 0;font-size:13px;color:#64748b;">Last visit total: <strong style="color:#cbd5e1;">${lastTotal}</strong></p>` : ""}
        </td></tr>
        <tr><td style="padding:20px 28px 8px;text-align:center;">
          <a href="${deepLink}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#84cc16,#65a30d);color:#0f172a;font-size:16px;font-weight:900;border-radius:10px;text-decoration:none;letter-spacing:0.5px;">
            🔁 Re-book My Lawn Service
          </a>
          <p style="margin:10px 0 0;font-size:11px;color:#475569;">One tap — same yard, same service, same price.</p>
        </td></tr>
        <tr><td style="padding:18px 28px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px 16px;">
            <tr><td style="font-size:11px;font-weight:700;color:#84cc16;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;">Need to make changes?</td></tr>
            <tr><td style="font-size:13px;color:#94a3b8;line-height:1.6;">
              📞 Call us anytime at <strong style="color:#e2e8f0;">${COMPANY_PHONE}</strong><br>
              📧 Or just reply to this email — we'll get you taken care of.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 28px 24px;text-align:center;color:#475569;font-size:11px;line-height:1.6;">
          JC ON THE MOVE LLC · Northwoods &amp; Upper Peninsula of Michigan<br>
          You received this because you booked a one-time lawn service with us.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Hey ${firstNameRaw},

It's been about a month since your last ${(opts.serviceCategory || "lawn service").replace(/_/g, " ")} with us. One tap re-books the same service for the same yard at the same price.

Re-book here: ${deepLink}

${lastTotal ? `Last visit total: ${lastTotal}\n` : ""}Questions? Call ${COMPANY_PHONE} or reply to this email.

— JC ON THE MOVE LLC, Northwoods & UP of Michigan`;

  return { html, text, subject };
}

// Single-quote send. Writes dedupe row BEFORE dispatch (send-at-most-once).
export async function sendRebookReminderForQuote(quote: EligibleQuote): Promise<{ ok: boolean; error?: string }> {
  if (!quote.email) return { ok: false, error: "no email on quote" };

  // Insert dedupe row first so a crash mid-send can't re-spam on the next sweep.
  const [reminder] = await db
    .insert(lawnCareRebookReminders)
    .values({ quoteId: quote.id, status: "sent" })
    .returning();

  try {
    const { html, text, subject } = buildRebookReminderEmail({
      customerName: quote.customerName,
      phone: quote.phone,
      serviceCategory: quote.serviceCategory,
      totalQuoted: quote.totalQuoted,
    });
    const ok = await sendEmail({ to: quote.email, from: FROM_EMAIL, subject, html, text });
    if (!ok) {
      await db.update(lawnCareRebookReminders)
        .set({ status: "failed" })
        .where(eq(lawnCareRebookReminders.id, reminder.id));
      return { ok: false, error: "sendEmail returned false" };
    }
    return { ok: true };
  } catch (err: any) {
    await db.update(lawnCareRebookReminders)
      .set({ status: "failed" })
      .where(eq(lawnCareRebookReminders.id, reminder.id));
    return { ok: false, error: err?.message || "send threw" };
  }
}

// Sweep entry — used by scheduler and admin "Send Now" endpoint.
// Wrapped in a Postgres advisory lock so two overlapping invocations (e.g.
// manual admin click during the daily scheduler tick, or two app instances)
// cannot race on the same candidate set and double-send.
export async function runRebookReminderSweep(limit = REBOOK_BATCH_LIMIT): Promise<{
  attempted: number; sent: number; failed: number; failures: { quoteId: number; error: string }[]; skipped?: boolean;
}> {
  const client = await pool.connect();
  try {
    const lockRes = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
      [SWEEP_ADVISORY_LOCK_KEY]
    );
    const got = lockRes.rows[0]?.pg_try_advisory_lock === true;
    if (!got) {
      console.warn("[rebook-reminder] sweep skipped — another sweep is in progress");
      return { attempted: 0, sent: 0, failed: 0, failures: [], skipped: true };
    }
    try {
      const eligible = await findEligibleRebookReminders(limit);
      let sent = 0, failed = 0;
      const failures: { quoteId: number; error: string }[] = [];
      for (const q of eligible) {
        const r = await sendRebookReminderForQuote(q);
        if (r.ok) sent++;
        else { failed++; failures.push({ quoteId: q.id, error: r.error || "unknown" }); }
      }
      return { attempted: eligible.length, sent, failed, failures };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SWEEP_ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
