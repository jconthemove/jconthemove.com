// Central configuration for treasury and rewards system
export const TREASURY_CONFIG = {
  // JCMOVES Cryptocurrency Configuration
  TOKEN_ADDRESS: process.env.MOONSHOT_TOKEN_ADDRESS || 'BHZW4jds7NSe5Fqvw9Z4pvt423EJSx63k8MT11F2moon',
  TOKEN_SYMBOL: 'JCMOVES',
  TOKEN_NAME: 'JCMOVES Token',
  
  // Dynamic pricing (replaced fixed price with crypto pricing)
  // TOKEN_PRICE: Uses real-time JCMOVES market price from crypto service
  FALLBACK_TOKEN_PRICE: 0.000005034116, // Real Moonshot price as emergency fallback
  
  // Safety thresholds (in USD)
  MINIMUM_BALANCE: 1.0, // $1 minimum balance
  WARNING_THRESHOLD: 100.0, // Warn when below $100 (increased for crypto volatility)
  CRITICAL_THRESHOLD: 25.0, // Critical alert when below $25
  
  // Reward amounts (USD values converted to current JCMOVES tokens)
  SIGNUP_BONUS_USD: 5.00, // $5.00 worth of JCMOVES for new users
  DAILY_CHECKIN_USD: 0.25, // $0.25 worth of JCMOVES per daily check-in
  REFERRAL_BONUS_USD: 10.00, // $10.00 worth of JCMOVES per successful referral
  JOB_COMPLETION_USD: 2.50, // $2.50 worth of JCMOVES per job completed per mover
  
  // Lead creation bonus (fixed JCMOVES amount for approved employees)
  LEAD_CREATION_BONUS_TOKENS: 200, // 200 JCMOVES ($2) per lead created
  LEAD_CREATION_DAILY_CAP: 5, // Max 5 leads per day earn reward (prevents spam)
  
  // Customer reward amounts (1 JCMOVES = $0.01)
  LOYALTY_REWARD_TOKENS: 0, // replaced by earn_rate_per_dollar × job price
  REFERRAL_REQUEST_TOKENS: 50, // $0.50 when someone uses your referral code
  REFERRAL_CONFIRMED_TOKENS: 2500, // $25 when referred user's first job completes
  CUSTOMER_QUOTE_REWARD_TOKENS: 200, // $2 worth when verified customer's quote is accepted/completed
  
  // Volatility management
  MAX_PRICE_VOLATILITY: 25, // Maximum 25% price change before adjusting operations
  PRICE_UPDATE_INTERVAL: 30000, // 30 seconds between price updates
  
  // Business rules
  MAX_DAILY_CHECKIN_STREAK: 365, // Maximum streak tracking
  FRAUD_THRESHOLD_SCORE: 75, // Block actions above this risk score
  
  // Crypto-specific settings
  ENABLE_REAL_CRYPTO: true, // Toggle for crypto vs internal tokens
  MIN_WITHDRAWAL_TOKENS: 100, // Minimum JCMOVES for withdrawal
  WITHDRAWAL_FEE_PERCENT: 2, // 2% fee for crypto withdrawals
  
  // Payout network fee (percentage-based for token buyback program)
  PAYOUT_FEE_PERCENT: 1, // 1% of total payout - transferred to burn wallet for buyback
  PAYOUT_MIN_FEE_TOKENS: 10, // Minimum 10 JCMOVES fee to avoid dust amounts
  
  // Burn/Buyback Wallet (old treasury - lost access, effectively burns tokens)
  BURN_WALLET_ADDRESS: '34e5eAwb6Eh6zgyARSrk7RX1bkK2rVX5bazCHYXKtRM7',
  
  // Treasury safety limits (admin configurable up to 500M)
  MAX_TRANSFER_PER_TX: 500000000, // Maximum tokens per single transfer (500M admin limit)
  MAX_DAILY_TRANSFER: 500000000, // Maximum daily transfer limit (500M admin limit)
  MIN_TREASURY_RESERVE: 50000, // Minimum tokens to keep in treasury
  
  // Admin-configurable limit caps
  ADMIN_MAX_LIMIT_CAP: 500000000, // 500 million - maximum admin can set
} as const;

export const REWARD_TYPES = {
  SIGNUP_BONUS: 'signup_bonus',
  DAILY_CHECKIN: 'daily_checkin', 
  JOB_COMPLETION: 'job_completion',
  REFERRAL_BONUS: 'referral_bonus',
  REFERRAL_REQUEST: 'referral_request', // When someone uses your referral code
  REFERRAL_CONFIRMED: 'referral_confirmed', // When referred user's first job completes
  LOYALTY_BOOKING: 'loyalty_booking', // Customer reward for completed job
  LEAD_CREATION: 'lead_creation',
  CUSTOMER_QUOTE_REWARD: 'customer_quote_reward', // 200 JCMOVES for customer's accepted/completed quotes
  JEWELRY_PURCHASE: 'jewelry_purchase', // Tokens earned on Nature Made Jewls purchase (50 per $1)
} as const;

// ── Official JCMOVES Token Conversion Rates ────────────────────────────────
//   EARN rate: 1 USD spent on a job = 15 JCMOVES (Bronze tier base)
//   SPEND rate: 1 mover-minute of labor = 500 JCMOVES
export const TOKEN_ECONOMY = {
  TOKENS_PER_USD_EARNED: 15,         // Base Bronze earn rate (15 JCMOVES per $1 spent)
  TOKENS_PER_MOVER_MINUTE: 500,      // Cost of 1 mover-minute in JCMOVES (labor spend rate)
  CASH_PER_MOVER_HOUR: 62.50,        // Cash price of 1 mover-hour
  MIN_LABOR_CASH: 50,                // Minimum cash portion of any labor job
  MIN_LABOR_TOKENS: 15000,           // Minimum token portion of any labor job (30 min × 500 × 1 mover)
} as const;

// ── JCMOVES Loyalty Tier System ─────────────────────────────────────────────
// Activity-based progression: earn points through daily engagement,
// job activity, scripture, mining, referrals — not just spending.
export const LOYALTY_TIERS = {
  bronze:   { rate: 0.10, tokensPerDollar: 15, minPoints: 0,    maxPoints: 499,      label: 'Bronze',       emoji: '🥉', color: 'text-amber-600',  bg: 'bg-amber-600/20'  },
  silver:   { rate: 0.12, tokensPerDollar: 18, minPoints: 500,  maxPoints: 1999,     label: 'Silver',       emoji: '🥈', color: 'text-slate-300',  bg: 'bg-slate-400/20'  },
  gold:     { rate: 0.15, tokensPerDollar: 22, minPoints: 2000, maxPoints: 5999,     label: 'Gold',         emoji: '🥇', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  vip:      { rate: 0.20, tokensPerDollar: 30, minPoints: 6000, maxPoints: Infinity, label: 'Platinum VIP', emoji: '👑', color: 'text-purple-400', bg: 'bg-purple-500/20' },
} as const;

// Points awarded per activity (updates loyaltyTier automatically)
export const TIER_POINT_AWARDS = {
  signup:                100,  // one-time on registration
  daily_scripture:         5,  // per daily scripture read
  daily_checkin:           3,  // per daily check-in
  job_booked:             25,  // customer books a job
  job_completed:         100,  // customer job fully completed
  per_100_spent:          10,  // every $100 on a job (stackable)
  referral_confirmed:    150,  // referred user joins & activates
  employee_lead_created:  50,  // employee creates a new lead
  employee_job_done:      75,  // employee completes a job
} as const;

export type TierPointActivity = keyof typeof TIER_POINT_AWARDS;

export type LoyaltyTier = keyof typeof LOYALTY_TIERS;

export function calculateJCMovesReward(jobAmount: number, tier: string = 'bronze'): number {
  const tierConfig = LOYALTY_TIERS[tier as LoyaltyTier] ?? LOYALTY_TIERS.bronze;
  return Math.round(jobAmount * tierConfig.tokensPerDollar);
}

export function getTierFromPoints(points: number): LoyaltyTier {
  if (points >= 6000) return 'vip';
  if (points >= 2000) return 'gold';
  if (points >= 500)  return 'silver';
  return 'bronze';
}

// Legacy spend-based fallback (still used when tierPoints not set)
export function getTierFromSpend(totalSpend: number): LoyaltyTier {
  if (totalSpend >= 5000) return 'vip';
  if (totalSpend >= 2500) return 'gold';
  if (totalSpend >= 1000) return 'silver';
  return 'bronze';
}

export const FAUCET_CONFIG = {
  // Faucet operation mode - PRODUCTION MODE ENABLED!
  MODE: 'FAUCETPAY', // 'FAUCETPAY' | 'SELF_FUNDED' | 'DEMO'
  
  // Default faucet settings
  DEFAULT_CURRENCIES: ['BTC', 'ETH', 'LTC', 'DOGE'],
  DEFAULT_CLAIM_INTERVAL: 3600, // 1 hour in seconds
  
  // Self-funded reward amounts (reasonable starting amounts)
  SELF_FUNDED_REWARDS: {
    BTC: 100, // 100 satoshis (~$0.05 at $50k BTC)
    ETH: 2000, // 2000 gwei (~$0.006 at $3k ETH)  
    LTC: 20000, // 20000 litoshi (~$0.002 at $100 LTC)
    DOGE: 2000000, // 2M koinu (~$0.20 at $0.10 DOGE)
  },
  
  // Wallet management
  WALLET_CONFIG: {
    // Minimum balance alerts (in USD equivalent)
    LOW_BALANCE_WARNING: 10.0, // Warn when wallet below $10
    CRITICAL_BALANCE_ALERT: 5.0, // Alert when below $5
    
    // Transaction settings
    MAX_DAILY_PAYOUTS_USD: 50.0, // Daily limit to prevent abuse
    TRANSACTION_FEE_BUFFER: 1.5, // 1.5x estimated fees for safety
  },
  
  // Anti-abuse settings (stricter for self-funded)
  ABUSE_PROTECTION: {
    MAX_CLAIMS_PER_IP_PER_HOUR: 3, // Reduced for self-funded
    MAX_CLAIMS_PER_USER_PER_DAY: 12, // One every 2 hours max
    RISK_SCORE_THRESHOLD: 60, // Lower threshold for better protection
  },
  
  // Demo mode settings (small realistic amounts that align with cash estimates)
  DEMO_REWARDS: {
    BTC: 200, // 200 satoshi = ~$0.10
    ETH: 3000, // 3000 gwei = ~$0.009  
    LTC: 30000, // 30000 litoshi = ~$0.003
    DOGE: 3000000, // 3M koinu = ~$0.30
  }
};