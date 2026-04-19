// Admin endpoints for the generic re-book reminder sweep (snow / junk /
// window cleaning). Mirrors the lawn-care admin endpoint shape so the UI
// can reuse one card component per service.

import { Router, Request, Response, NextFunction } from "express";
import {
  SERVICE_CONFIGS,
  type ServiceKey,
  findEligibleRebooks,
  buildReminderEmail,
  runRebookSweep,
  getLastSweepInfo,
  REBOOK_ELIGIBILITY_DAYS,
  REBOOK_RESEND_WINDOW_DAYS,
  ORGANIC_REBOOK_SOURCE,
} from "../services/serviceRebookReminder";
import { db } from "../db";
import { leads, serviceRebookReminders, serviceRebookOptouts } from "@shared/schema";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

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

function resolveConfig(req: Request, res: Response) {
  const key = String(req.params.key || "") as ServiceKey;
  const cfg = SERVICE_CONFIGS[key];
  if (!cfg) {
    res.status(404).json({ error: "Unknown service" });
    return null;
  }
  return cfg;
}

// Same masking helpers as lawn-care preview, kept local so this router has
// no cross-router import.
function maskName(name: string | null | undefined): string {
  if (!name) return "Returning customer";
  const tokens = name.trim().split(/\s+/);
  const first = tokens[0] || "";
  const last = tokens[1] || "";
  return last ? `${first} ${last[0]}.` : first;
}
function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return "—";
  const maskedLocal =
    local.length <= 2
      ? local[0] + "•"
      : local[0] + "•".repeat(Math.max(2, local.length - 2)) + local.slice(-1);
  return `${maskedLocal}@${domain}`;
}
function maskPhone(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return `•••-•••-${digits.slice(-4)}`;
}

// GET /api/admin/service-rebook/:key/preview
router.get(
  "/:key/preview",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const cfg = resolveConfig(req, res);
    if (!cfg) return;
    try {
      const allEligible = await findEligibleRebooks(cfg);
      const eligible = allEligible.slice(0, 50);
      const sample = eligible[0]
        ? buildReminderEmail(cfg, {
            customerName: `${eligible[0].firstName ?? ""} ${eligible[0].lastName ?? ""}`.trim(),
            phone: eligible[0].phone,
            totalQuoted: eligible[0].totalPrice ?? eligible[0].basePrice ?? null,
            lastServiceAt: eligible[0].lastServiceAt,
          })
        : null;
      return res.json({
        serviceKey: cfg.key,
        label: cfg.label,
        eligibilityDays: REBOOK_ELIGIBILITY_DAYS,
        resendWindowDays: REBOOK_RESEND_WINDOW_DAYS,
        eligibleCount: allEligible.length,
        sampleSize: eligible.length,
        eligible: eligible.map((l) => ({
          id: l.id,
          customerName: maskName(`${l.firstName ?? ""} ${l.lastName ?? ""}`.trim()),
          email: maskEmail(l.email),
          phone: maskPhone(l.phone),
          serviceCategory: l.serviceType,
          totalQuoted: l.totalPrice ?? l.basePrice ?? null,
          lastUpdated: l.lastServiceAt,
        })),
        sampleEmail: sample,
        lastRun: getLastSweepInfo(cfg.key),
      });
    } catch (err) {
      console.error(`Re-book preview error (${cfg.key}):`, err);
      return res.status(500).json({ error: "Failed to load preview" });
    }
  },
);

// POST /api/admin/service-rebook/:key/send
router.post(
  "/:key/send",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const cfg = resolveConfig(req, res);
    if (!cfg) return;
    try {
      const result = await runRebookSweep(cfg, undefined, "manual");
      return res.json({ success: true, ...result, lastRun: getLastSweepInfo(cfg.key) });
    } catch (err) {
      console.error(`Re-book send error (${cfg.key}):`, err);
      return res.status(500).json({ error: "Failed to send reminders" });
    }
  },
);

// GET /api/admin/service-rebook/:key/attribution
// Per-service re-book attribution. Mirrors the lawn-care attribution shape:
// counts of new bookings since the first reminder of this service was sent,
// grouped by source (rebook_email_<svc> vs organic), with paid revenue and a
// rough conversion rate (paid_from_email / reminders_sent).
router.get(
  "/:key/attribution",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const cfg = resolveConfig(req, res);
    if (!cfg) return;
    try {
      // Anchor the lookback window at the first SENT reminder for this
      // service so brand-new services don't surface decade-old "organic"
      // bookings as fake re-book email wins. If no reminder has ever been
      // sent, return an empty payload — there's nothing to attribute yet.
      const [firstReminderRow] = await db
        .select({ at: sql<Date>`min(${serviceRebookReminders.sentAt})` })
        .from(serviceRebookReminders)
        .where(and(
          eq(serviceRebookReminders.serviceKey, cfg.key),
          eq(serviceRebookReminders.status, "sent"),
        ));
      if (!firstReminderRow?.at) {
        return res.json({
          serviceKey: cfg.key,
          label: cfg.label,
          windowStart: null,
          remindersSent: 0,
          bySource: [
            { source: cfg.utmSource, label: "Re-book Email", totalLeads: 0, paidBookings: 0, paidRevenue: 0 },
            { source: ORGANIC_REBOOK_SOURCE, label: "Organic Returner", totalLeads: 0, paidBookings: 0, paidRevenue: 0 },
          ],
          emailConversionRatePct: 0,
        });
      }
      const since: Date = new Date(firstReminderRow.at);

      // Count only successfully-sent reminders (matches lawn-care semantics).
      // Failed dispatch rows stay in the table for dedupe but must not inflate
      // the conversion denominator.
      const [remindersRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(serviceRebookReminders)
        .where(and(
          eq(serviceRebookReminders.serviceKey, cfg.key),
          eq(serviceRebookReminders.status, "sent"),
        ));
      const remindersSent = Number(remindersRow?.n ?? 0);

      // Pull leads matching this service's leadServiceTypes since the anchor.
      // Email-attributed rows MUST have a valid rebookSentAt linking them to
      // a specific send. Organic rows just need the source tag.
      const rows = await db
        .select({
          id: leads.id,
          rebookSource: leads.rebookSource,
          rebookSentAt: leads.rebookSentAt,
          status: leads.status,
          totalPrice: leads.totalPrice,
          basePrice: leads.basePrice,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(and(
          inArray(leads.serviceType, cfg.leadServiceTypes),
          isNotNull(leads.rebookSource),
          gte(leads.createdAt, since),
        ));

      const PAID_STATUSES = new Set(["paid", "completed", "scheduled", "confirmed", "in_progress"]);
      const sources = [cfg.utmSource, ORGANIC_REBOOK_SOURCE];
      const bySource = sources.map((src) => {
        const subset = rows.filter((r) => {
          if (r.rebookSource !== src) return false;
          // Email-attributed rows: require a valid rebookSentAt at-or-before
          // the booking timestamp. This excludes spoofed sources without a
          // matching send and stops attribution from being forged client-side.
          if (src === cfg.utmSource) {
            if (!r.rebookSentAt) return false;
            if (r.createdAt && new Date(r.rebookSentAt).getTime() > new Date(r.createdAt).getTime() + 60_000) {
              return false;
            }
          }
          return true;
        });
        const paid = subset.filter((r) => PAID_STATUSES.has(String(r.status || "")));
        const paidRevenue = paid.reduce((sum, r) => {
          const v = parseFloat(String(r.totalPrice ?? r.basePrice ?? "0"));
          return sum + (Number.isFinite(v) ? v : 0);
        }, 0);
        return {
          source: src,
          label: src === cfg.utmSource ? "Re-book Email" : "Organic Returner",
          totalLeads: subset.length,
          paidBookings: paid.length,
          paidRevenue: Number(paidRevenue.toFixed(2)),
        };
      });

      const emailRow = bySource.find((s) => s.source === cfg.utmSource)!;
      const conversionRate = remindersSent > 0
        ? Number(((emailRow.paidBookings / remindersSent) * 100).toFixed(2))
        : 0;

      return res.json({
        serviceKey: cfg.key,
        label: cfg.label,
        windowStart: since.toISOString(),
        remindersSent,
        bySource,
        emailConversionRatePct: conversionRate,
      });
    } catch (err) {
      console.error(`Re-book attribution error (${cfg.key}):`, err);
      return res.status(500).json({ error: "Failed to load attribution" });
    }
  },
);

// ── Opt-out management (Task #122) ───────────────────────────────────────────
// Admins can review who unsubscribed from re-book reminder emails and remove
// an entry to re-enable reminders for a customer (e.g. at customer request
// after they accidentally clicked unsubscribe).

// GET /api/admin/service-rebook/optouts
router.get(
  "/optouts",
  requireAuth,
  requireAdminRole,
  async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(serviceRebookOptouts)
        .orderBy(desc(serviceRebookOptouts.createdAt));
      return res.json({ optouts: rows });
    } catch (err) {
      console.error("Re-book opt-out list error:", err);
      return res.status(500).json({ error: "Failed to load opt-outs" });
    }
  },
);

// DELETE /api/admin/service-rebook/optouts/:id — re-enable reminders.
router.delete(
  "/optouts/:id",
  requireAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }
    try {
      const removed = await db
        .delete(serviceRebookOptouts)
        .where(eq(serviceRebookOptouts.id, id))
        .returning();
      if (removed.length === 0) {
        return res.status(404).json({ error: "Opt-out entry not found" });
      }
      return res.json({ success: true, removed: removed[0] });
    } catch (err) {
      console.error("Re-book opt-out delete error:", err);
      return res.status(500).json({ error: "Failed to remove opt-out" });
    }
  },
);

export default router;
