import { useQuery } from "@tanstack/react-query";
import { Coins, TrendingUp, Gift, Clock, ShoppingBag, Loader2 } from "lucide-react";

interface WalletAccount {
  tokenBalance: string;
  totalEarned: string;
  totalRedeemed: string;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
  status: string;
  earnedDate: string;
}

const REWARD_LABELS: Record<string, string> = {
  mining: "Mining Reward",
  daily_checkin: "Daily Check-in",
  lead_creation: "Job Creation Bonus",
  job_completion: "Job Completion",
  loyalty_booking: "Loyalty Reward",
  referral: "Referral Bonus",
  referral_request: "Referral Code Applied",
  referral_signup_bonus: "Referral Signup Bonus",
  referral_confirmed: "Referral Confirmed",
  signup_bonus: "Welcome Bonus",
};

export default function CustomerRewardsPage() {
  const { data: wallet, isLoading: walletLoading } = useQuery<WalletAccount>({ queryKey: ["/api/rewards/wallet"] });
  const { data: historyData, isLoading: historyLoading } = useQuery({ queryKey: ["/api/rewards/history"] });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const totalEarned = parseFloat(wallet?.totalEarned || "0");
  const totalRedeemed = parseFloat(wallet?.totalRedeemed || "0");
  const isLoading = walletLoading || historyLoading;

  // API returns { rewards: [...], total: N, totalTokensEarned: "..." }
  const history: RewardHistory[] = Array.isArray(historyData)
    ? historyData
    : ((historyData as any)?.rewards ?? []);
  const recentHistory = history.slice(0, 20);

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Rewards</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Your JCMOVES token earnings</p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-jc-orange" />
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-jc-orange to-orange-600 rounded-2xl p-5 mb-6 shadow-lg shadow-jc-orange/20">
              <p className="text-white/70 text-xs font-medium mb-1">Total Balance</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-black text-white">
                  {tokenBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-white/70 text-sm font-medium">JCMOVES</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-white/60 text-[10px] uppercase tracking-wider">Earned</p>
                  <p className="text-white font-bold text-sm">
                    {totalEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-white/60 text-[10px] uppercase tracking-wider">Redeemed</p>
                  <p className="text-white font-bold text-sm">
                    {totalRedeemed.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 mb-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900 dark:text-white">Rewards Shop</p>
                  <p className="text-xs text-zinc-400">Coming soon — redeem tokens for discounts</p>
                </div>
                <span className="text-[10px] font-bold text-purple-500 bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1 rounded-full">
                  SOON
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-zinc-900 dark:text-white">Recent Activity</h2>
              <span className="text-xs text-zinc-400">{recentHistory.length} transactions</span>
            </div>

            {recentHistory.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center shadow-sm">
                <Coins className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">No rewards yet</p>
                <p className="text-zinc-400 text-sm mt-1">Post a job or complete tasks to earn tokens</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentHistory.map(item => (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 shadow-sm"
                  >
                    <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                        {REWARD_LABELS[item.rewardType] || item.rewardType}
                      </p>
                      <p className="text-xs text-zinc-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(item.earnedDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                      +{parseFloat(item.tokenAmount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
