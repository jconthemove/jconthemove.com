import type { PipelineContext } from "../context";

// Incentives step — decides whether this job should be flagged for a
// bonus mover payout. Heuristic: jobs with surge ≥ 1.25 or with a large
// moving line qualify for a +25% crew bonus, mirroring the existing
// crewBonusFlags convention in disburse-job-tokens.
export async function incentivesStep(ctx: PipelineContext): Promise<PipelineContext> {
  const surge = ctx.surgeMultiplier ?? 1;
  const hasLargeMove = ctx.input.items.some(
    (i) => i.serviceCode === "moving" && (i.quantity * i.unitPrice) >= 800,
  );
  const qualifies = surge >= 1.25 || hasLargeMove;
  ctx.incentives = {
    crewBonusMultiplier: qualifies ? 1.25 : 1,
    note: qualifies ? (surge >= 1.25 ? "surge bonus" : "large-move bonus") : "no bonus",
  };
  return ctx;
}
