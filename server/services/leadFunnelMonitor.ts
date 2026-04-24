// Task #196 — Watch the customer-quote submission rate so a Mercer-style
// outage can never sit unnoticed for two weeks again.
//
// Strategy:
//   • Every CHECK_INTERVAL_MS the scheduler in server/index.ts calls
//     runLeadFunnelCheck().
//   • Window length is dynamic: 60 min during business hours, 240 min
//     overnight — so a quiet 3 AM doesn't false-alarm but a quiet
//     11 AM does.
//   • An alert is OPENED only when the current window has 0 new leads
//     AND the previous comparable window had > 0 (i.e. leads stopped,
//     not "the world is asleep").
//   • Exactly one open alert at a time. The opening transition fires a
//     single notification email. While it's open, ticks just refresh
//     last_checked_at — no email spam.
//   • An alert is RESOLVED automatically the moment a fresh lead lands.
//
// The lead_funnel_alerts table is created at boot in server/index.ts.

import { pool } from "../db";
import { sendEmail } from "./email";

// Outage notifications go to the company inbox per the task spec
// ("an alert email goes to the company email"). ADMIN_EMAIL is CC'd
// when it differs so an operator with a personal admin inbox still
// sees it.
const COMPANY_EMAIL =
  process.env.COMPANY_EMAIL || "michigankid906@gmail.com";
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "upmichiganstatemovers@gmail.com";
const FROM_EMAIL = COMPANY_EMAIL;

// Business-hours window: 8 AM – 8 PM Central. Matches the UTC-6
// convention used by server/utils/dateUtils.ts.
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 20;
const BUSINESS_WINDOW_MIN = 60;
const OVERNIGHT_WINDOW_MIN = 240;

export type LeadFunnelAlert = {
  id: number;
  startedAt: Date;
  resolvedAt: Date | null;
  lastCheckedAt: Date;
  windowMinutes: number;
  previousCount: number;
  emailSentAt: Date | null;
};

export type LeadFunnelCheckResult = {
  windowMinutes: number;
  current: number;
  previous: number;
  alertOpened: boolean;
  alertResolved: boolean;
  emailSent: boolean;
  alert: LeadFunnelAlert | null;
};

function isBusinessHourNow(now: Date = new Date()): boolean {
  const hourCentral = (now.getUTCHours() - 6 + 24) % 24;
  return (
    hourCentral >= BUSINESS_HOUR_START && hourCentral < BUSINESS_HOUR_END
  );
}

// Row shape returned by `SELECT *` against `lead_funnel_alerts`.
// Columns are declared in the boot-time CREATE TABLE in
// `server/index.ts`, so this stays in lockstep with that DDL.
interface LeadFunnelAlertRow {
  id: number;
  started_at: Date;
  resolved_at: Date | null;
  last_checked_at: Date;
  window_minutes: number;
  previous_count: number;
  email_sent_at: Date | null;
}

function rowToAlert(row: LeadFunnelAlertRow): LeadFunnelAlert {
  return {
    id: row.id,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    lastCheckedAt: row.last_checked_at,
    windowMinutes: row.window_minutes,
    previousCount: row.previous_count,
    emailSentAt: row.email_sent_at,
  };
}

export async function getActiveLeadFunnelAlert(): Promise<LeadFunnelAlert | null> {
  try {
    const { rows } = await pool.query<LeadFunnelAlertRow>(
      `SELECT * FROM lead_funnel_alerts
        WHERE resolved_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1`,
    );
    return rows[0] ? rowToAlert(rows[0]) : null;
  } catch (err) {
    // If the table doesn't exist yet (very early boot, before the
    // self-healing migration ran) treat as "no alert" instead of
    // crashing the dashboard.
    console.warn("[lead-funnel-monitor] getActiveLeadFunnelAlert error:", err);
    return null;
  }
}

// Count *customer* quote submissions only — exclude leads created
// internally by employees/admins (POST /api/leads/employee and admin
// flows), since the task is specifically about the public quote funnel
// going dark. A lone employee-created job in an otherwise-broken hour
// must not mask a real outage.
//
// The customer-facing routes (POST /api/leads, POST /api/jobs/...) set
// created_by_user_id from the customer's own session when they're
// logged in, and NULL when anonymous. So:
//   • created_by_user_id IS NULL                         → counted (anon customers)
//   • created_by_user_id belongs to a non-staff user     → counted (logged-in customers)
//   • created_by_user_id belongs to employee/admin/owner → excluded
async function countLeadsBetween(start: Date, end: Date): Promise<number> {
  const { rows } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
       FROM leads l
      WHERE l.created_at >= $1 AND l.created_at < $2
        AND (
          l.created_by_user_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = l.created_by_user_id
               AND u.role IN ('employee', 'admin', 'business_owner')
          )
        )`,
    [start, end],
  );
  return rows[0]?.c ?? 0;
}

async function sendOutageEmail(alert: LeadFunnelAlert): Promise<boolean> {
  const subject = `[ALERT] Lead funnel down — 0 quote submissions in last ${alert.windowMinutes} min`;
  const startedIso = alert.startedAt.toISOString();
  const html = `
    <h2 style="color:#b91c1c">Lead funnel alert — JC ON THE MOVE</h2>
    <p>No new customer quote submissions were recorded in the last
       <strong>${alert.windowMinutes} minutes</strong>, even though the
       previous ${alert.windowMinutes}-minute window had
       <strong>${alert.previousCount}</strong>.</p>
    <p>Detected at: ${startedIso}</p>
    <p>This is the same failure mode as the Mercer, WI outage. Please
       check the public quote form and recent server errors right away.</p>
    <p>
      <a href="https://jconthemove.com/quote">Open quote form</a>
      &nbsp;·&nbsp;
      <a href="https://jconthemove.com/admin/overview">Open admin dashboard</a>
    </p>
    <hr/>
    <p style="font-size:12px;color:#6b7280">
      You're receiving this because the lead funnel monitor (Task #196)
      detected zero submissions during what should be a productive window.
      You will not receive a follow-up until the funnel recovers and then
      drops again.
    </p>
  `;
  const text = [
    `LEAD FUNNEL ALERT`,
    ``,
    `No new customer quote submissions in the last ${alert.windowMinutes} min.`,
    `Previous comparable window had ${alert.previousCount}.`,
    `Detected at: ${startedIso}`,
    ``,
    `Same failure mode as the Mercer, WI outage.`,
    `Check https://jconthemove.com/quote and recent server errors.`,
  ].join("\n");

  // Primary recipient is the company inbox (per task spec). If a
  // separate admin inbox is configured, send a second copy so an
  // operator on call still sees it.
  let companySent = false;
  try {
    companySent = await sendEmail({
      to: COMPANY_EMAIL,
      from: FROM_EMAIL,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("[lead-funnel-monitor] company alert email error:", err);
  }

  if (
    ADMIN_EMAIL &&
    ADMIN_EMAIL.toLowerCase() !== COMPANY_EMAIL.toLowerCase()
  ) {
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        from: FROM_EMAIL,
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error("[lead-funnel-monitor] admin alert email error:", err);
    }
  }

  return companySent;
}

export async function runLeadFunnelCheck(
  now: Date = new Date(),
): Promise<LeadFunnelCheckResult> {
  const windowMinutes = isBusinessHourNow(now)
    ? BUSINESS_WINDOW_MIN
    : OVERNIGHT_WINDOW_MIN;
  const windowMs = windowMinutes * 60 * 1000;
  const currentEnd = now;
  const currentStart = new Date(now.getTime() - windowMs);
  const previousEnd = currentStart;
  const previousStart = new Date(currentStart.getTime() - windowMs);

  const [current, previous] = await Promise.all([
    countLeadsBetween(currentStart, currentEnd),
    countLeadsBetween(previousStart, previousEnd),
  ]);

  const existing = await getActiveLeadFunnelAlert();

  // Healthy — funnel has fresh leads. Resolve any open alert.
  if (current > 0) {
    if (existing) {
      await pool.query(
        `UPDATE lead_funnel_alerts
            SET resolved_at = NOW(), last_checked_at = NOW()
          WHERE id = $1`,
        [existing.id],
      );
      console.log(
        `[lead-funnel-monitor] alert #${existing.id} resolved (current=${current})`,
      );
      return {
        windowMinutes,
        current,
        previous,
        alertOpened: false,
        alertResolved: true,
        emailSent: false,
        alert: null,
      };
    }
    return {
      windowMinutes,
      current,
      previous,
      alertOpened: false,
      alertResolved: false,
      emailSent: false,
      alert: null,
    };
  }

  // current === 0. Only alert if the previous comparable window had
  // submissions — otherwise this is just a quiet stretch (e.g. 4 AM).
  if (previous === 0) {
    if (existing) {
      await pool.query(
        `UPDATE lead_funnel_alerts
            SET last_checked_at = NOW()
          WHERE id = $1`,
        [existing.id],
      );
    }
    return {
      windowMinutes,
      current,
      previous,
      alertOpened: false,
      alertResolved: false,
      emailSent: false,
      alert: existing,
    };
  }

  // Outage condition: 0 now, > 0 in the previous window.
  if (existing) {
    await pool.query(
      `UPDATE lead_funnel_alerts
          SET last_checked_at = NOW()
        WHERE id = $1`,
      [existing.id],
    );
    return {
      windowMinutes,
      current,
      previous,
      alertOpened: false,
      alertResolved: false,
      emailSent: false,
      alert: existing,
    };
  }

  // Open a fresh alert and notify exactly once.
  const { rows: insertRows } = await pool.query<LeadFunnelAlertRow>(
    `INSERT INTO lead_funnel_alerts (window_minutes, previous_count)
     VALUES ($1, $2)
     RETURNING *`,
    [windowMinutes, previous],
  );
  const created = rowToAlert(insertRows[0]);

  const emailSent = await sendOutageEmail(created);
  if (emailSent) {
    await pool.query(
      `UPDATE lead_funnel_alerts SET email_sent_at = NOW() WHERE id = $1`,
      [created.id],
    );
  }

  console.warn(
    `[lead-funnel-monitor] OPENED alert #${created.id} — window=${windowMinutes}min current=0 previous=${previous} emailSent=${emailSent}`,
  );

  return {
    windowMinutes,
    current,
    previous,
    alertOpened: true,
    alertResolved: false,
    emailSent,
    alert: created,
  };
}
