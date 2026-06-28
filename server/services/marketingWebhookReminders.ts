import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db";

const urlSchema = z.string().url().max(2000);

export const marketingWebhookReminderSchema = z.object({
  campaignName: z.string().trim().min(1).max(120).default("JC Marketing Reminder"),
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(1800),
  area: z.string().trim().max(120).optional(),
  focus: z.string().trim().max(120).optional(),
  audience: z.string().trim().max(160).optional(),
  imageUrl: urlSchema.optional(),
  ctaUrl: urlSchema.optional(),
  ctaLabel: z.string().trim().max(80).optional(),
  promoCode: z.string().trim().max(64).optional(),
  repSlug: z.string().trim().max(100).optional(),
  scheduledFor: z.string().datetime().optional(),
  source: z.string().trim().max(80).default("admin_marketing_webhook"),
  dryRun: z.boolean().default(false),
});

export type MarketingWebhookReminderInput = z.infer<typeof marketingWebhookReminderSchema>;

const webhookUrls = () => (
  process.env.JC_MARKETING_WEBHOOK_URLS
  || process.env.MARKETING_WEBHOOK_URLS
  || process.env.JC_JOB_EVENT_WEBHOOK_URLS
  || process.env.JOB_EVENT_WEBHOOK_URLS
  || ""
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const webhookSecret = () => (
  process.env.JC_MARKETING_WEBHOOK_SECRET
  || process.env.MARKETING_WEBHOOK_SECRET
  || process.env.JC_JOB_EVENT_WEBHOOK_SECRET
  || process.env.JOB_EVENT_WEBHOOK_SECRET
  || ""
);

function normalizePayload(input: MarketingWebhookReminderInput, actorId?: string | null) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "marketing_reminder",
    campaignName: input.campaignName,
    title: input.title,
    message: input.message,
    area: input.area || null,
    focus: input.focus || null,
    audience: input.audience || null,
    imageUrl: input.imageUrl || null,
    ctaUrl: input.ctaUrl || null,
    ctaLabel: input.ctaLabel || (input.ctaUrl ? "Open Link" : null),
    promoCode: input.promoCode || null,
    repSlug: input.repSlug || null,
    scheduledFor: input.scheduledFor || null,
    source: input.source,
    actorId: actorId || null,
    createdAt: now,
  };
}

function formatWebhookBody(url: string, payload: ReturnType<typeof normalizePayload>) {
  const tags = [
    payload.area ? `Area: ${payload.area}` : null,
    payload.focus ? `Focus: ${payload.focus}` : null,
    payload.audience ? `Audience: ${payload.audience}` : null,
    payload.promoCode ? `Promo: ${payload.promoCode}` : null,
  ].filter(Boolean);

  if (url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks")) {
    return JSON.stringify({
      username: "JC Marketing",
      content: `**${payload.title}**\n${payload.message}${payload.ctaUrl ? `\n${payload.ctaUrl}` : ""}`,
      embeds: [{
        title: payload.title,
        description: payload.message,
        color: 0xf97316,
        fields: tags.map((tag) => {
          const [name, ...rest] = String(tag).split(": ");
          return { name, value: rest.join(": ") || "-", inline: true };
        }),
        image: payload.imageUrl ? { url: payload.imageUrl } : undefined,
        url: payload.ctaUrl || undefined,
        footer: { text: payload.campaignName },
        timestamp: payload.createdAt,
      }],
      components: payload.ctaUrl ? [{
        type: 1,
        components: [{
          type: 2,
          style: 5,
          label: payload.ctaLabel || "Open Link",
          url: payload.ctaUrl,
        }],
      }] : undefined,
    });
  }

  if (url.includes("hooks.slack.com")) {
    return JSON.stringify({
      text: `*${payload.title}*\n${payload.message}`,
      attachments: [{
        color: "#f97316",
        fields: tags.map((tag) => {
          const [title, ...rest] = String(tag).split(": ");
          return { title, value: rest.join(": ") || "-", short: true };
        }),
        image_url: payload.imageUrl || undefined,
        actions: payload.ctaUrl ? [{
          type: "button",
          text: payload.ctaLabel || "Open Link",
          url: payload.ctaUrl,
        }] : undefined,
      }],
    });
  }

  return JSON.stringify(payload);
}

async function insertCampaign(payload: ReturnType<typeof normalizePayload>) {
  const result = await pool.query(
    `INSERT INTO marketing_webhook_campaigns
       (id, campaign_name, title, message, area, focus, audience, image_url, cta_url, cta_label,
        promo_code, rep_slug, source, actor_id, scheduled_for, payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16::jsonb)
     RETURNING id`,
    [
      payload.id,
      payload.campaignName,
      payload.title,
      payload.message,
      payload.area,
      payload.focus,
      payload.audience,
      payload.imageUrl,
      payload.ctaUrl,
      payload.ctaLabel,
      payload.promoCode,
      payload.repSlug,
      payload.source,
      payload.actorId,
      payload.scheduledFor ? new Date(payload.scheduledFor) : null,
      JSON.stringify(payload),
    ],
  );
  return result.rows[0]?.id as string;
}

async function recordDelivery(campaignId: string, url: string, status: string, responseStatus?: number | null, error?: string | null) {
  await pool.query(
    `INSERT INTO marketing_webhook_deliveries
       (campaign_id, webhook_url_hash, status, response_status, error_message)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      campaignId,
      crypto.createHash("sha256").update(url).digest("hex").slice(0, 16),
      status,
      responseStatus ?? null,
      error ?? null,
    ],
  );
}

export async function sendMarketingWebhookReminder(input: MarketingWebhookReminderInput, actorId?: string | null) {
  const parsed = marketingWebhookReminderSchema.parse(input);
  const payload = normalizePayload(parsed, actorId);
  const urls = webhookUrls();
  const campaignId = await insertCampaign(payload);

  if (parsed.dryRun) {
    return { campaignId, delivered: 0, failed: 0, dryRun: true, webhookCount: urls.length, payload };
  }

  const secret = webhookSecret();
  const results = await Promise.allSettled(urls.map(async (url) => {
    const body = formatWebhookBody(url, payload);
    const signature = secret
      ? crypto.createHmac("sha256", secret).update(body).digest("hex")
      : "";
    const isDiscord = url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(isDiscord ? {} : { "x-jc-event": "marketing_reminder" }),
          ...(!isDiscord && signature ? { "x-jc-signature": `sha256=${signature}` } : {}),
        },
        body,
        signal: controller.signal,
      });
      await recordDelivery(campaignId, url, response.ok ? "sent" : "failed", response.status, response.ok ? null : await response.text());
      return response.ok;
    } catch (error) {
      await recordDelivery(campaignId, url, "failed", null, error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }));

  const delivered = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - delivered;
  return { campaignId, delivered, failed, dryRun: false, webhookCount: urls.length, payload };
}

export async function listRecentMarketingWebhookCampaigns(limit = 25) {
  const result = await pool.query(
    `SELECT c.id, c.campaign_name, c.title, c.area, c.focus, c.audience, c.image_url,
            c.cta_url, c.promo_code, c.rep_slug, c.source, c.created_at,
            COUNT(d.id)::int AS deliveries,
            COUNT(d.id) FILTER (WHERE d.status = 'sent')::int AS sent,
            COUNT(d.id) FILTER (WHERE d.status <> 'sent')::int AS failed
       FROM marketing_webhook_campaigns c
       LEFT JOIN marketing_webhook_deliveries d ON d.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $1`,
    [Math.max(1, Math.min(100, limit))],
  );
  return result.rows;
}
