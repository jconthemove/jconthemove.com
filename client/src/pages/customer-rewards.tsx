import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Coins, TrendingUp, TrendingDown, Gift, Clock, ShoppingBag, Loader2, CheckCircle, Zap, Award, Users, Share2, Sparkles, Trophy, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

interface ShopItem {
  item: {
    id: number;
    name: string;
    shortDesc: string;
    tokenPrice: number;
    cashValue: string;
    promoBadge?: string;
    featured?: boolean;
    isInstant?: boolean;
    deliveryType?: string;
  };
  category?: { name: string; icon?: string };
}

interface ShopResponse {
  items: ShopItem[];
  walletBalance: number;
}

const TYPE_CONFIG: Record<string, { icon: JSX.Element; color: string; label: string }> = {
  mining_claim:           { icon: <Coins className="h-3.5 w-3.5" />,    color: "text-amber-400",   label: "Mining" },
  job_completion:         { icon: <CheckCircle className="h-3.5 w-3.5" />, color: "text-emerald-400", label: "Job Done" },
  loyalty_booking:        { icon: <Award className="h-3.5 w-3.5" />,    color: "text-purple-400",  label: "Loyalty" },
  lead_creation:          { icon: <TrendingUp className="h-3.5 w-3.5" />, color: "text-cyan-400",   label: "Job Created" },
  job_creation_bonus:     { icon: <TrendingUp className="h-3.5 w-3.5" />, color: "text-cyan-400",   label: "Job Bonus" },
  referral:               { icon: <Users className="h-3.5 w-3.5" />,    color: "text-violet-400",  label: "Referral" },
  referral_request:       { icon: <Share2 className="h-3.5 w-3.5" />,   color: "text-violet-400",  label: "Code Applied" },
  referral_signup_bonus:  { icon: <Gift className="h-3.5 w-3.5" />,     color: "text-violet-400",  label: "Signup Bonus" },
  referral_confirmed:     { icon: <Users className="h-3.5 w-3.5" />,    color: "text-violet-400",  label: "Referral ✓" },
  signup_bonus:           { icon: <Gift className="h-3.5 w-3.5" />,     color: "text-pink-400",    label: "Welcome" },
  staking_claim:          { icon: <TrendingUp className="h-3.5 w-3.5" />, color: "text-yellow-400", label: "Staking" },
  daily_checkin:          { icon: <Clock className="h-3.5 w-3.5" />,    color: "text-blue-400",    label: "Check-in" },
  quantum_spin_win:       { icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-purple-400",  label: "Spin Win" },
  mini_jackpot_win:       { icon: <Trophy className="h-3.5 w-3.5" />,   color: "text-yellow-400",  label: "Jackpot!" },
  major_jackpot_win:      { icon: <Trophy className="h-3.5 w-3.5" />,   color: "text-yellow-400",  label: "Jackpot!" },
};

function getTypeConfig(type: string) {
  const cfg = TYPE_CONFIG[type];
  if (cfg) return cfg;
  if (type.includes("jackpot")) return { icon: <Trophy className="h-3.5 w-3.5" />, color: "text-yellow-400", label: "Jackpot" };
  if (type.includes("spin"))    return { icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-purple-400", label: "Spin" };
  if (type.includes("referral")) return { icon: <Users className="h-3.5 w-3.5" />, color: "text-violet-400", label: "Referral" };
  if (type.includes("mining"))   return { icon: <Zap className="h-3.5 w-3.5" />, color: "text-amber-400", label: "Mining" };
  return { icon: <Coins className="h-3.5 w-3.5" />, color: "text-zinc-400", label: type.replace(/_/g, " ") };
}

function fmt(n: number, digits = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function getCategoryEmoji(item: ShopItem) {
  const cat = item.category?.name || "";
  if (cat.includes("Spin"))    return "⚡";
  if (cat.includes("Coffee") || cat.includes("Entry")) return "☕";
  if (cat.includes("Discount")) return "🎟️";
  if (cat.includes("Service") || cat.includes("Credit")) return "🛠️";
  if (cat.includes("Gift"))   return "🎁";
  if (cat.includes("Moving")) return "🚛";
  if (cat.includes("Mystery")) return "🎲";
  return "🎁";
}

export default function CustomerRewardsPage() {
  const { toast } = useToast();
  const [selectedTx, setSelectedTx] = useState<RewardHistory | null>(null);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletAccount>({
    queryKey: ["/api/rewards/wallet"],
  });
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/rewards/history"],
  });
  const { data: shopData, isLoading: shopLoading } = useQuery<ShopResponse>({
    queryKey: ["/api/reward-shop/items"],
  });

  const redeemMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest("POST", "/api/reward-shop/redeem", { itemId }),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      setRedeemingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/items"] });
      toast({
        title: "Redemption submitted!",
        description: data.message || "Your reward is being processed.",
      });
    },
    onError: (err: any) => {
      setRedeemingId(null);
      toast({ title: "Couldn't redeem", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const totalEarned  = parseFloat(wallet?.totalEarned  || "0");
  const totalRedeemed = parseFloat(wallet?.totalRedeemed || "0");
  const isLoading = walletLoading || historyLoading;

  const history: RewardHistory[] = Array.isArray(historyData)
    ? historyData
    : ((historyData as any)?.rewards ?? []);
  const recentHistory = history.slice(0, 20);

  const shopItems: ShopItem[] = (shopData?.items || []).slice(0, 7);

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Rewards</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-5">Your JCMOVES token earnings</p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-jc-orange" />
          </div>
        ) : (
          <>
            {/* Balance card */}
            <div className="bg-gradient-to-br from-jc-orange to-orange-600 rounded-2xl p-5 mb-5 shadow-lg shadow-jc-orange/20">
              <p className="text-white/70 text-xs font-medium mb-1">Total Balance</p>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-black text-white">{fmt(tokenBalance, 2)}</span>
                <span className="text-white/70 text-sm font-medium">JCMOVES</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-white/60 text-[10px] uppercase tracking-wider">Earned</p>
                  <p className="text-white font-bold text-sm">{fmt(totalEarned)}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-white/60 text-[10px] uppercase tracking-wider">Redeemed</p>
                  <p className="text-white font-bold text-sm">{fmt(totalRedeemed)}</p>
                </div>
              </div>
            </div>

            {/* ── Rewards Shop ── */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-purple-500" />
                  <h2 className="font-bold text-zinc-900 dark:text-white">Rewards Shop</h2>
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Balance: <span className="font-bold text-jc-orange">{fmt(tokenBalance)} JCMOVES</span>
                </span>
              </div>

              {shopLoading ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="flex-shrink-0 w-36 h-36 bg-zinc-100 dark:bg-zinc-900 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : shopItems.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 text-center shadow-sm">
                  <ShoppingBag className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Shop items coming soon</p>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                  {shopItems.map(({ item, category }) => {
                    const canAfford = tokenBalance >= item.tokenPrice;
                    const isRedeeming = redeemingId === item.id && redeemMutation.isPending;
                    const emoji = getCategoryEmoji({ item, category });
                    return (
                      <div
                        key={item.id}
                        className={`flex-shrink-0 w-[148px] rounded-2xl border p-3 flex flex-col shadow-sm transition-all ${
                          canAfford
                            ? "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800"
                            : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100/50 dark:border-zinc-800/50 opacity-70"
                        }`}
                      >
                        <div className="text-2xl mb-2">{emoji}</div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-white leading-tight line-clamp-2 flex-1 mb-2">
                          {item.name}
                        </p>
                        {item.promoBadge && (
                          <span className="inline-block text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-full mb-1.5 w-fit">
                            {item.promoBadge}
                          </span>
                        )}
                        <p className={`text-[11px] font-black mb-2 ${canAfford ? "text-jc-orange" : "text-zinc-400"}`}>
                          {fmt(item.tokenPrice)} JCMOVES
                        </p>
                        <button
                          disabled={!canAfford || isRedeeming}
                          onClick={() => {
                            setRedeemingId(item.id);
                            redeemMutation.mutate(item.id);
                          }}
                          className={`w-full py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                            canAfford
                              ? "bg-jc-orange text-white hover:bg-orange-600 active:scale-95"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                          }`}
                        >
                          {isRedeeming ? (
                            <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                          ) : canAfford ? "Redeem" : "Need more"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Recent Activity ── */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-zinc-900 dark:text-white">Recent Activity</h2>
              <span className="text-xs text-zinc-400">{history.length} transactions</span>
            </div>

            {recentHistory.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center shadow-sm">
                <Coins className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">No rewards yet</p>
                <p className="text-zinc-400 text-xs mt-1">Post a job or complete tasks to earn tokens</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                {recentHistory.map((item, idx) => {
                  const cfg = getTypeConfig(item.rewardType);
                  const amount = parseFloat(item.tokenAmount);
                  const isNeg = amount < 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedTx(item)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors ${
                        idx < recentHistory.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""
                      }`}
                    >
                      {/* Colored dot */}
                      <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 ${cfg.color}`}>
                        {cfg.icon}
                      </div>
                      {/* Label + date */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                          {cfg.label}
                        </p>
                        <p className="text-[10px] text-zinc-400 leading-tight">
                          {new Date(item.earnedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      {/* Amount */}
                      <span className={`text-[12px] font-black flex-shrink-0 ${isNeg ? "text-red-500" : "text-emerald-500 dark:text-emerald-400"}`}>
                        {isNeg ? "" : "+"}{fmt(Math.abs(amount), 0)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Transaction detail sheet */}
      <Sheet open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8">
          {selectedTx && (() => {
            const cfg = getTypeConfig(selectedTx.rewardType);
            const amount = parseFloat(selectedTx.tokenAmount);
            const isNeg = amount < 0;
            return (
              <>
                <SheetHeader className="text-left mb-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 ${cfg.color}`}>
                      <span className="scale-125">{cfg.icon}</span>
                    </div>
                    <SheetTitle className="text-lg font-black">{cfg.label}</SheetTitle>
                  </div>
                </SheetHeader>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm text-zinc-500">Amount</span>
                    <span className={`text-sm font-black ${isNeg ? "text-red-500" : "text-emerald-500"}`}>
                      {isNeg ? "" : "+"}{fmt(Math.abs(amount), 4)} JCMOVES
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm text-zinc-500">Date</span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fmtDate(selectedTx.earnedDate)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm text-zinc-500">Time</span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fmtTime(selectedTx.earnedDate)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm text-zinc-500">Status</span>
                    <span className={`text-sm font-bold capitalize ${selectedTx.status === "confirmed" ? "text-emerald-500" : "text-amber-500"}`}>
                      {selectedTx.status}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-zinc-500">Type</span>
                    <span className="text-sm text-zinc-400 font-mono text-xs">{selectedTx.rewardType}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="mt-5 w-full py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-sm"
                >
                  Close
                </button>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
