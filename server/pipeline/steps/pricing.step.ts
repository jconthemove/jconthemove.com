import { priceBooking } from "../adapters/pricing.adapter";
import type { PipelineContext } from "../context";

export async function pricingStep(ctx: PipelineContext): Promise<PipelineContext> {
  // Hard failure: pricing is the contract. If this throws, the pipeline
  // bails (per task contract — pricing failure throws hard).
  const quote = await priceBooking(ctx.input.items);
  ctx.quote = quote;
  return ctx;
}
