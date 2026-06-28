import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  listMarketingCampaignPerformance,
  listRecentMarketingWebhookCampaigns,
  marketingWebhookReminderSchema,
  sendMarketingWebhookReminder,
} from "../services/marketingWebhookReminders";

const router = Router();

async function requireOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionUser = (req as any).user;
    let user = sessionUser;
    const sessionUserId = (req.session as any)?.userId;
    if (!user && sessionUserId) {
      user = (await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1))[0];
    }
    if (!user || !["admin", "business_owner"].includes(user.role || "")) {
      return res.status(403).json({ error: "Business owner access required" });
    }
    (req as any).marketingActor = user;
    return next();
  } catch (error) {
    console.error("[marketing-webhooks] auth failed:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Unable to verify access" });
  }
}

router.get("/admin/marketing/webhook-reminders", requireOwner, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 25);
    const campaigns = await listRecentMarketingWebhookCampaigns(Number.isFinite(limit) ? limit : 25);
    res.json({ campaigns });
  } catch (error) {
    console.error("[marketing-webhooks] list failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load marketing webhook reminders" });
  }
});

router.get("/admin/marketing/campaign-performance", requireOwner, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const campaigns = await listMarketingCampaignPerformance(Number.isFinite(limit) ? limit : 50);
    res.json({ campaigns });
  } catch (error) {
    console.error("[marketing-webhooks] performance failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load marketing campaign performance" });
  }
});

router.post("/admin/marketing/webhook-reminders/send", requireOwner, async (req, res) => {
  try {
    const payload = marketingWebhookReminderSchema.parse(req.body || {});
    const actorId = (req as any).marketingActor?.id || null;
    const result = await sendMarketingWebhookReminder(payload, actorId);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid marketing reminder", issues: error.issues });
    }
    console.error("[marketing-webhooks] send failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to send marketing webhook reminder" });
  }
});

export default router;
