import type { PipelineContext } from "../context";
import { getDemandForCoords } from "../../demand";

// Task #174 — Translate the demand snapshot into a concrete surge
// multiplier via the centralized decideSurge(). Honours the current
// calibration mode (shadow/soft/full) so early-rollout quotes never
// surprise a customer while we're still tuning.
export async function surgeStep(ctx: PipelineContext): Promise<PipelineContext> {
  const anyInput = ctx.input as unknown as { serviceLat?: number; serviceLng?: number };
  const { surge } = await getDemandForCoords(anyInput.serviceLat, anyInput.serviceLng);

  const base = ctx.quote?.finalTotal ?? 0;
  ctx.surgeMultiplier = surge.multiplier;
  ctx.surgeReason = `${surge.reason} [${surge.mode}${surge.mode !== "full" ? `, theo ${surge.theoreticalMultiplier}×` : ""}]`;
  ctx.surgedTotal = Math.round(base * surge.multiplier * 100) / 100;
  return ctx;
}
