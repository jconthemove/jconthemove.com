// Public (unauthenticated) endpoints for the generic service re-book engine.
// Currently only hosts the one-click unsubscribe link embedded in every
// snow / junk / window cleaning re-book reminder email (Task #109).

import { Router, Request, Response } from "express";
import { recordOptout, verifyUnsubscribeToken } from "../services/serviceRebookReminder";

const router = Router();

function renderPage(res: Response, title: string, body: string, status = 200) {
  res.status(status).type("html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
</head>
<body style="margin:0;background:#0f172a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:60px auto;padding:32px 28px;background:#1e293b;border-radius:14px;text-align:center;">
    <div style="font-size:13px;font-weight:700;color:#38bdf8;letter-spacing:2px;margin-bottom:10px;">JC ON THE MOVE</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#fff;">${title}</h1>
    <div style="font-size:14px;color:#94a3b8;line-height:1.6;">${body}</div>
  </div>
</body></html>`);
}

// GET /api/service-rebook/unsubscribe?email=...&phone=...&token=...
// Token is HMAC over (normalized email + phone) so we can verify the click
// came from a legitimate email without keeping per-link state. Idempotent.
async function handleUnsubscribe(req: Request, res: Response) {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  const phone = typeof req.query.phone === "string" ? req.query.phone : "";
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if ((!email && !phone) || !token) {
    return renderPage(res, "Invalid unsubscribe link",
      "This unsubscribe link is missing required information. If you keep getting reminders, just reply to one of our emails and we'll remove you manually.",
      400);
  }
  if (!verifyUnsubscribeToken(token, email, phone)) {
    return renderPage(res, "Invalid unsubscribe link",
      "We couldn't verify this unsubscribe link. If you keep getting reminders, just reply to one of our emails and we'll remove you manually.",
      400);
  }

  try {
    await recordOptout(email, phone, "email_link");
    return renderPage(res, "You're unsubscribed",
      "You won't receive any more re-book reminder emails from us. If this was a mistake, just reply to one of our past emails and we'll add you back.");
  } catch (err) {
    console.error("[service-rebook] unsubscribe error:", err);
    return renderPage(res, "Something went wrong",
      "We couldn't process your unsubscribe right now. Please try again in a moment, or reply to one of our emails and we'll remove you manually.",
      500);
  }
}

router.get("/unsubscribe", handleUnsubscribe);
// RFC 8058 List-Unsubscribe-Post: mail clients that respect One-Click POST
// hit the same URL with POST. Same handler.
router.post("/unsubscribe", handleUnsubscribe);

export default router;
