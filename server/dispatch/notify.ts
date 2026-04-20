// Task #172 — Offer notification adapter. Emits both an SMS and a
// persisted in-app notification so crew see the offer whether the phone
// number is configured or not. All failures are soft — dispatch must
// not abort when Twilio is down.

import { db } from "../db";
import { notifications, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { smsService } from "../services/sms";

export interface OfferNotifyArgs {
  crewId: string;
  leadId: string;
  customerName: string;
  serviceType: string;
  distanceMi: number | null;
  totalPrice: number;
  ttlSec: number;
}

export async function sendOffer(args: OfferNotifyArgs): Promise<{ smsSent: boolean }> {
  // In-app notification first (idempotent, DB-level).
  try {
    await db.insert(notifications).values({
      userId: args.crewId,
      type: "job_offer",
      title: `New job offer — ${args.ttlSec}s to accept`,
      message:
        `${args.customerName} · ${args.serviceType}` +
        (args.distanceMi != null ? ` · ${args.distanceMi.toFixed(1)}mi` : "") +
        (args.totalPrice > 0 ? ` · $${Math.round(args.totalPrice)}` : ""),
      data: { leadId: args.leadId, offerKind: "uber_style", ttlSec: args.ttlSec },
    });
  } catch (e) {
    console.warn("[dispatch.notify] notification insert failed:", e);
  }

  // SMS ping (best-effort).
  let smsSent = false;
  try {
    const [u] = await db
      .select({ phoneNumber: users.phoneNumber })
      .from(users)
      .where(eq(users.id, args.crewId));
    if (u?.phoneNumber) {
      const msg =
        `🚚 JC job offer\n` +
        `${args.serviceType.toUpperCase()} · ${args.customerName}` +
        (args.distanceMi != null ? ` · ${args.distanceMi.toFixed(1)}mi` : "") + `\n` +
        (args.totalPrice > 0 ? `Ticket: $${Math.round(args.totalPrice)}\n` : "") +
        `Accept in the app within ${args.ttlSec}s.`;
      const r = await smsService.sendSMS(u.phoneNumber, msg);
      smsSent = !!r.success;
    }
  } catch (e) {
    console.warn("[dispatch.notify] sms failed:", e);
  }

  return { smsSent };
}
