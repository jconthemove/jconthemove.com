import type { PipelineContext } from "../context";

// Translate the 0..1 demand score into a surge multiplier.
// <0.4 → 1.0 (no surge), 0.4-0.7 → 1.1, >0.7 → 1.25. Capped at 1.25 so
// we never surprise a customer with >25% uplift.
export async function surgeStep(ctx: PipelineContext): Promise<PipelineContext> {
  const d = ctx.demandScore ?? 0;
  let mult = 1;
  let reason = "normal demand";
  if (d > 0.7) { mult = 1.25; reason = "peak demand window"; }
  else if (d > 0.4) { mult = 1.1; reason = "elevated demand"; }

  const base = ctx.quote?.finalTotal ?? 0;
  ctx.surgeMultiplier = mult;
  ctx.surgeReason = reason;
  ctx.surgedTotal = Math.round(base * mult * 100) / 100;
  return ctx;
}
