// Rewards adapter — wraps computeBookingReward + tier thresholds so the
// pipeline can return a customer-visible JCMOVES preview that matches
// what disburseBookingTokens will actually award on completion.
import { computeBookingReward } from "../../services/bookingPricing";
import { loadBookingRewardSettings } from "../../services/disburseBookingTokens";

function tierFromSpend(totalSpend: number): string {
  if (totalSpend >= 5000) return "vip";
  if (totalSpend >= 2500) return "gold";
  if (totalSpend >= 1000) return "silver";
  return "bronze";
}

const TIER_MULTIPLIER: Record<string, number> = {
  bronze: 1,
  silver: 1.1,
  gold: 1.2,
  vip: 1.5,
};

export async function previewReward(args: {
  finalTotal: number;
  bundleBonusMultiplier?: number;
  customerLifetimeSpend?: number;
}): Promise<{ tokenEstimate: number; tierApplied: string }> {
  const settings = await loadBookingRewardSettings();
  const tier = tierFromSpend(args.customerLifetimeSpend ?? 0);
  const bundleMult = args.bundleBonusMultiplier ?? 1;
  const combined = Math.max(bundleMult, TIER_MULTIPLIER[tier] ?? 1);
  const r = computeBookingReward({
    finalTotal: args.finalTotal,
    flatBonus: settings.flatBonus,
    earnRate: settings.earnRate,
    bonusMultiplier: combined,
    hasOverride: false,
  });
  return { tokenEstimate: r.totalAward, tierApplied: tier };
}
