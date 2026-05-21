import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import { buildBookingIntakeFromChatbot } from "@shared/bookingIntake";

const router = Router();

const intakeSchema = z.object({
  answers: z.record(z.any()),
  serviceLabel: z.string().optional(),
});

router.post("/ai/booking-intake", async (req: Request, res: Response) => {
  try {
    const body = intakeSchema.parse(req.body);
    const intake = buildBookingIntakeFromChatbot(body.answers, body.serviceLabel);
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
