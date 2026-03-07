// Official JCMOVES token economy rates
// EARN: 1 USD spent on a job = 50 JCMOVES (Bronze base, higher tiers earn more)
// SPEND: 1 mover-minute of labor = 500 JCMOVES
export const TOKEN_ECONOMY = {
  TOKENS_PER_USD_EARNED: 50,
  TOKENS_PER_MOVER_MINUTE: 500,
  CASH_PER_MOVER_HOUR: 62.50,
} as const;

export const LOYALTY_TIERS = {
  bronze: { rate: 0.10, tokensPerDollar: 50,  minSpend: 0,    maxSpend: 999,     label: 'Bronze', emoji: '🥉', color: 'text-amber-600',  border: 'border-amber-600/40', bg: 'bg-amber-600/10' },
  silver: { rate: 0.12, tokensPerDollar: 60,  minSpend: 1000, maxSpend: 2499,    label: 'Silver', emoji: '🥈', color: 'text-slate-300',   border: 'border-slate-400/40', bg: 'bg-slate-400/10' },
  gold:   { rate: 0.15, tokensPerDollar: 75,  minSpend: 2500, maxSpend: 4999,    label: 'Gold',   emoji: '🥇', color: 'text-yellow-400',  border: 'border-yellow-500/40', bg: 'bg-yellow-500/10' },
  vip:    { rate: 0.20, tokensPerDollar: 100, minSpend: 5000, maxSpend: Infinity, label: 'VIP',   emoji: '👑', color: 'text-purple-400',  border: 'border-purple-500/40', bg: 'bg-purple-500/10' },
} as const;

export type LoyaltyTierKey = keyof typeof LOYALTY_TIERS;

export function calculateJCMovesReward(jobAmount: number, tier: LoyaltyTierKey = 'bronze'): number {
  const tierConfig = LOYALTY_TIERS[tier] ?? LOYALTY_TIERS.bronze;
  return Math.round(jobAmount * tierConfig.tokensPerDollar);
}

export function getTierFromSpend(totalSpend: number): LoyaltyTierKey {
  if (totalSpend >= 5000) return 'vip';
  if (totalSpend >= 2500) return 'gold';
  if (totalSpend >= 1000) return 'silver';
  return 'bronze';
}

export function getNextTier(currentTier: LoyaltyTierKey): LoyaltyTierKey | null {
  const order: LoyaltyTierKey[] = ['bronze', 'silver', 'gold', 'vip'];
  const idx = order.indexOf(currentTier);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}
