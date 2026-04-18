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
} from "../services/serviceRebookReminder";

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

export default router;
