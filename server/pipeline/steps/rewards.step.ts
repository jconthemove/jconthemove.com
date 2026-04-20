import type { PipelineContext } from "../context";
import { previewReward } from "../adapters/rewards.adapter";

// Rewards preview step — computes the JCMOVES estimate the customer will
// see on the booking confirmation. Uses the post-surge total so the
// customer earns on what they actually pay.
export async function rewardsStep(ctx: PipelineContext): Promise<PipelineContext> {
  const total = ctx.surgedTotal ?? ctx.quote?.finalTotal ?? 0;
  const r = await previewReward({
    finalTotal: total,
    bundleBonusMultiplier: ctx.quote?.bundleApplied?.bonusMultiplier ?? 1,
    customerLifetimeSpend: 0,
  });
  ctx.rewards = r;
  return ctx;
}
