import type { PipelineContext } from "../context";

// Stub demand step — Task #174 (Predictive Optimization) will replace
// this with a real rolling-window model. For now we return 0.5 so the
// surge step can apply a neutral multiplier.
export async function demandStep(ctx: PipelineContext): Promise<PipelineContext> {
  ctx.demandScore = 0.5;
  ctx.demandReason = "stub: predictive model not wired (Task #174)";
  return ctx;
}
