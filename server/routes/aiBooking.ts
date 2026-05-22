import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import {
  buildBookingIntakeWithOpenAi,
  isOpenAiBookingAgentConfigured,
  OPENAI_BOOKING_AGENT_DEFAULT_MODEL,
} from "../services/openAiBookingAgent";

const router = Router();

const intakeSchema = z.object({
  answers: z.record(z.any()),
  serviceLabel: z.string().optional(),
});

router.get("/ai/booking-intake/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    primaryProvider: "openai",
    configured: isOpenAiBookingAgentConfigured(),
    model: process.env.OPENAI_BOOKING_MODEL || OPENAI_BOOKING_AGENT_DEFAULT_MODEL,
    fallbackProvider: "deterministic",
    guardrails: {
      persistsJob: false,
      chargesCustomer: false,
      assignsCrew: false,
      quoteSource: "/api/bookings/quote",
    },
  });
});

router.post("/ai/booking-intake", async (req: Request, res: Response) => {
  try {
    const body = intakeSchema.parse(req.body);
    const intake = await buildBookingIntakeWithOpenAi(body.answers, body.serviceLabel);
    return res.json({
      ...intake,
      guardrails: {
        persistsJob: false,
        chargesCustomer: false,
        assignsCrew: false,
        quoteSource: "/api/bookings/quote",
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid booking intake", details: err.errors });
    }
    console.error("[ai/booking-intake] error:", err);
    return res.status(500).json({ error: "Failed to prepare booking intake" });
  }
});

export default router;
