// Official JCMOVES token economy rates
// EARN: 1 USD spent on a job = 50 JCMOVES (Bronze base, higher tiers earn more)
// SPEND: 1 mover-minute of labor = 500 JCMOVES
export const TOKEN_ECONOMY = {
  TOKENS_PER_USD_EARNED: 50,
  TOKENS_PER_MOVER_MINUTE: 500,
  CASH_PER_MOVER_HOUR: 62.50,
} as const;

// Activity-based loyalty tiers — progressed through engagement, not just spending
export const LOYALTY_TIERS = {
  bronze: { rate: 0.10, tokensPerDollar: 50,  minPoints: 0,    maxPoints: 499,    label: 'Bronze',      emoji: '🥉', color: 'text-amber-600',  border: 'border-amber-600/40', bg: 'bg-amber-600/10' },
  silver: { rate: 0.12, tokensPerDollar: 60,  minPoints: 500,  maxPoints: 1999,   label: 'Silver',      emoji: '🥈', color: 'text-slate-300',   border: 'border-slate-400/40', bg: 'bg-slate-400/10' },
  gold:   { rate: 0.15, tokensPerDollar: 75,  minPoints: 2000, maxPoints: 5999,   label: 'Gold',        emoji: '🥇', color: 'text-yellow-400',  border: 'border-yellow-500/40', bg: 'bg-yellow-500/10' },
  vip:    { rate: 0.20, tokensPerDollar: 100, minPoints: 6000, maxPoints: Infinity, label: 'Platinum VIP', emoji: '👑', color: 'text-purple-400',  border: 'border-purple-500/40', bg: 'bg-purple-500/10' },
} as const;

// How to earn tier points
export const TIER_POINT_WAYS = [
  { activity: 'signup',                 points: 100, label: 'Sign Up',                    description: 'One-time welcome bonus',              icon: '🎉' },
  { activity: 'daily_scripture',        points: 5,   label: 'Daily Scripture',             description: 'Read the daily scripture each day',   icon: '📖' },
  { activity: 'daily_checkin',          points: 3,   label: 'Daily Check-In',              description: 'Open the app and check in daily',     icon: '✅' },
  { activity: 'job_booked',             points: 25,  label: 'Book a Job',                  description: 'Submit a moving or junk removal job', icon: '📦' },
  { activity: 'job_completed',          points: 100, label: 'Job Completed',               description: 'Your job is marked complete',         icon: '🏆' },
  { activity: 'per_100_spent',          points: 10,  label: 'Spending Bonus',              description: 'Every $100 spent on services',        icon: '💳' },
  { activity: 'referral_confirmed',     points: 150, label: 'Refer a Friend',              description: 'Friend signs up using your code',     icon: '🤝' },
  { activity: 'employee_lead_created',  points: 50,  label: 'Create a Lead (Crew)',        description: 'Crew member creates a new lead',      icon: '📋' },
  { activity: 'employee_job_done',      points: 75,  label: 'Complete a Job (Crew)',       description: 'Crew member completes a job',         icon: '🚛' },
] as const;

export type LoyaltyTierKey = keyof typeof LOYALTY_TIERS;

export function calculateJCMovesReward(jobAmount: number, tier: LoyaltyTierKey = 'bronze'): number {
  const tierConfig = LOYALTY_TIERS[tier] ?? LOYALTY_TIERS.bronze;
  return Math.round(jobAmount * tierConfig.tokensPerDollar);
}

export function getTierFromPoints(tierPoints: number): LoyaltyTierKey {
  if (tierPoints >= 6000) return 'vip';
  if (tierPoints >= 2000) return 'gold';
  if (tierPoints >= 500)  return 'silver';
  return 'bronze';
}

export function getNextTier(currentTier: LoyaltyTierKey): LoyaltyTierKey | null {
  const order: LoyaltyTierKey[] = ['bronze', 'silver', 'gold', 'vip'];
  const idx = order.indexOf(currentTier);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

export function getTierProgress(tierPoints: number, currentTier: LoyaltyTierKey): number {
  const tier = LOYALTY_TIERS[currentTier] ?? LOYALTY_TIERS.bronze;
  if (tier.maxPoints === Infinity) return 100;
  const rangeSize = tier.maxPoints - tier.minPoints + 1;
  const progress = tierPoints - tier.minPoints;
  return Math.min(100, Math.round((progress / rangeSize) * 100));
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}
