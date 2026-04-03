import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Coins, TrendingUp, Gift, Clock, ShoppingBag, Loader2, CheckCircle,
  Zap, Award, Users, Share2, Sparkles, Trophy, Copy, Check, AlertTriangle
} from "lucide-react";
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

interface RedeemResult {
  type: "coupon" | "mystery" | "spin" | "pending" | "service" | "instant";
  itemName: string;
  couponCode?: string;
  mysteryPrize?: { label: string; tokens: number };
  spinCount?: number;
  newBalance?: string;
  status?: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  mining_claim:          { icon: <Coins className="h-3.5 w-3.5" />,      color: "text-amber-400",   label: "Mining" },
  job_completion:        { icon: <CheckCircle className="h-3.5 w-3.5" />, color: "text-emerald-400", label: "Job Done" },
  loyalty_booking:       { icon: <Award className="h-3.5 w-3.5" />,      color: "text-purple-400",  label: "Loyalty" },
  lead_creation:         { icon: <TrendingUp className="h-3.5 w-3.5" />,  color: "text-cyan-400",    label: "Job Created" },
  job_creation_bonus:    { icon: <TrendingUp className="h-3.5 w-3.5" />,  color: "text-cyan-400",    label: "Job Bonus" },
  referral:              { icon: <Users className="h-3.5 w-3.5" />,       color: "text-violet-400",  label: "Referral" },
  referral_request:      { icon: <Share2 className="h-3.5 w-3.5" />,      color: "text-violet-400",  label: "Code Applied" },
  referral_signup_bonus: { icon: <Gift className="h-3.5 w-3.5" />,        color: "text-violet-400",  label: "Signup Bonus" },
  referral_confirmed:    { icon: <Users className="h-3.5 w-3.5" />,       color: "text-violet-400",  label: "Referral ✓" },
  signup_bonus:          { icon: <Gift className="h-3.5 w-3.5" />,        color: "text-pink-400",    label: "Welcome" },
  staking_claim:         { icon: <TrendingUp className="h-3.5 w-3.5" />,  color: "text-yellow-400",  label: "Staking" },
  daily_checkin:         { icon: <Clock className="h-3.5 w-3.5" />,       color: "text-blue-400",    label: "Check-in" },
  quantum_spin_win:      { icon: <Sparkles className="h-3.5 w-3.5" />,    color: "text-purple-400",  label: "Spin Win" },
  mini_jackpot_win:      { icon: <Trophy className="h-3.5 w-3.5" />,      color: "text-yellow-400",  label: "Jackpot!" },
  major_jackpot_win:     { icon: <Trophy className="h-3.5 w-3.5" />,      color: "text-yellow-400",  label: "Jackpot!" },
};

function getTypeConfig(type: string) {
  const cfg = TYPE_CONFIG[type];
  if (cfg) return cfg;
  if (type.includes("jackpot"))  return { icon: <Trophy className="h-3.5 w-3.5" />,   color: "text-yellow-400", label: "Jackpot" };
  if (type.includes("spin"))     return { icon: <Sparkles className="h-3.5 w-3.5" />,  color: "text-purple-400", label: "Spin" };
  if (type.includes("referral")) return { icon: <Users className="h-3.5 w-3.5" />,     color: "text-violet-400", label: "Referral" };
  if (type.includes("mining"))   return { icon: <Zap className="h-3.5 w-3.5" />,       color: "text-amber-400",  label: "Mining" };
  return { icon: <Coins className="h-3.5 w-3.5" />, color: "text-zinc-400", label: type.replace(/_/g, " ") };
}

function fmt(n: number, digits = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function getCategoryEmoji(item: ShopItem) {
  const cat = item.category?.name || "";
  const name = item.item.name.toLowerCase();
  if (cat.includes("Spin") || name.includes("spin"))      return "⚡";
  if (cat.includes("Entry") || name.includes("coffee"))   return "☕";
  if (cat.includes("Discount") || name.includes("% off")) return "🎟️";
  if (cat.includes("Service") || name.includes("labor") || name.includes("credit")) return "🛠️";
  if (cat.includes("Gift") || name.includes("gift"))      return "🎁";
  if (cat.includes("Moving") || name.includes("moving"))  return "🚛";
  if (name.includes("mystery"))                           return "🎲";
  return "🎁";
}

function classifyRedeemResult(data: any, item: ShopItem): RedeemResult {
  const redemption = data.redemption || {};
  const itemName = item.item.name;
  const name = itemName.toLowerCase();

  if (redemption.couponCode) {
    return { type: "coupon", itemName, couponCode: redemption.couponCode, newBalance: data.newBalance };
  }
  if (redemption.mysteryPrize) {
    return { type: "mystery", itemName, mysteryPrize: redemption.mysteryPrize, newBalance: data.newBalance };
  }
  if (name.includes("spin") || item.item.deliveryType === "digital_code" && name.includes("spin")) {
    const packMatch = itemName.match(/(\d+)\s*[Pp]ack/);
    return { type: "spin", itemName, spinCount: packMatch ? parseInt(packMatch[1]) : 1, newBalance: data.newBalance };
  }
  if (redemption.status === "pending_approval") {
    return { type: "pending", itemName, newBalance: data.newBalance };
  }
  if (item.item.deliveryType === "service_credit" || name.includes("labor") || name.includes("credit") || name.includes("off moving") || name.includes("off junk")) {
    return { type: "service", itemName, newBalance: data.newBalance };
  }
  return { type: "instant", itemName, newBalance: data.newBalance };
}

export default function CustomerRewardsPage() {
  const { toast } = useToast();
  const [selectedTx, setSelectedTx] = useState<RewardHistory | null>(null);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pendingItem, setPendingItem] = useState<ShopItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);

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
      const item = pendingItem!;
      setRedeemingId(null);
      setPendingItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/items"] });
      setRedeemResult(classifyRedeemResult(data, item));
    },
    onError: async (res: any) => {
      setRedeemingId(null);
      setPendingItem(null);
      let msg = "Please try again.";
      try {
        const data = await res.json?.();
        msg = data?.error || msg;
      } catch (_) {}
      toast({ title: "Couldn't redeem", description: msg, variant: "destructive" });
    },
  });

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const totalEarned   = parseFloat(wallet?.totalEarned   || "0");
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
            {/* ── Balance card ── */}
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
                <span className="text-[10px] text-zinc-400">
                  Balance: <span className="font-bold text-jc-orange">{fmt(tokenBalance)} JCMOVES</span>
                </span>
              </div>

              {shopLoading ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="flex-shrink-0 w-36 h-40 bg-zinc-100 dark:bg-zinc-900 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : shopItems.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 text-center shadow-sm">
                  <ShoppingBag className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">Shop items coming soon</p>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {shopItems.map((shopItem) => {
                    const { item, category } = shopItem;
                    const canAfford = tokenBalance >= item.tokenPrice;
                    const isRedeeming = redeemingId === item.id && redeemMutation.isPending;
                    const emoji = getCategoryEmoji(shopItem);
                    return (
                      <div
                        key={item.id}
                        className={`snap-start flex-shrink-0 w-[148px] rounded-2xl border p-3 flex flex-col shadow-sm transition-all ${
                          canAfford
                            ? "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800"
                            : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100/50 dark:border-zinc-800/50 opacity-60"
                        }`}
                      >
                        <div className="text-2xl mb-2 leading-none">{emoji}</div>
                        <p className="text-xs font-bold text-zinc-900 dark:text-white leading-tight line-clamp-2 flex-1 mb-1.5">
                          {item.name}
                        </p>
                        {item.promoBadge && (
                          <span className="inline-block text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-full mb-1.5 w-fit">
                            {item.promoBadge}
                          </span>
                        )}
                        <p className={`text-[11px] font-black mb-2.5 ${canAfford ? "text-jc-orange" : "text-zinc-400"}`}>
                          {fmt(item.tokenPrice)} JCMOVES
                        </p>
                        <button
                          disabled={!canAfford || isRedeeming}
                          onClick={() => {
                            if (canAfford) setConfirmItem(shopItem);
                          }}
                          className={`w-full py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                            canAfford
                              ? "bg-jc-orange text-white hover:bg-orange-600"
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
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 active:bg-zinc-100 transition-colors ${
                        idx < recentHistory.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 ${cfg.color}`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight">{cfg.label}</p>
                        <p className="text-[10px] text-zinc-400 leading-tight">
                          {new Date(item.earnedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
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

      {/* ── Pre-redeem confirmation sheet ── */}
      <Sheet open={!!confirmItem} onOpenChange={open => { if (!open) setConfirmItem(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8">
          {confirmItem && (() => {
            const { item } = confirmItem;
            const currentBalance = tokenBalance;
            const newBalance = currentBalance - item.tokenPrice;
            return (
              <>
                <SheetHeader className="text-left mb-5">
                  <SheetTitle className="text-lg font-black flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-jc-orange" />
                    Confirm Redemption
                  </SheetTitle>
                </SheetHeader>
                <div className="space-y-4">
                  <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white mb-1">{item.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.shortDesc}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm text-zinc-500">Token cost</span>
                      <span className="text-sm font-black text-jc-orange">−{fmt(item.tokenPrice)} JCMOVES</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm text-zinc-500">Current balance</span>
                      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{fmt(currentBalance, 2)} JCMOVES</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Balance after</span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{fmt(Math.max(0, newBalance), 2)} JCMOVES</span>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setConfirmItem(null)}
                      className="flex-1 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={redeemMutation.isPending}
                      onClick={() => {
                        setRedeemingId(item.id);
                        setPendingItem(confirmItem);
                        setConfirmItem(null);
                        redeemMutation.mutate(item.id);
                      }}
                      className="flex-1 py-3 rounded-2xl bg-jc-orange text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                    >
                      {redeemMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : "Confirm Redemption"}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Redemption result sheet ── */}
      <Sheet open={!!redeemResult} onOpenChange={() => { setRedeemResult(null); setCopiedCode(false); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8">
          {redeemResult && (
            <>
              <SheetHeader className="text-left mb-5">
                <SheetTitle className="text-lg font-black">
                  {redeemResult.type === "coupon"  && "🎟️ Your Coupon Code"}
                  {redeemResult.type === "mystery" && "🎲 Mystery Box Opened!"}
                  {redeemResult.type === "spin"    && "⚡ Spins Added!"}
                  {redeemResult.type === "pending" && "📬 Request Received"}
                  {redeemResult.type === "service" && "🛠️ Credit Logged"}
                  {redeemResult.type === "instant" && "✅ Redeemed!"}
                </SheetTitle>
              </SheetHeader>

              {/* COUPON CODE */}
              {redeemResult.type === "coupon" && redeemResult.couponCode && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Your unique promo code for <span className="font-semibold text-zinc-800 dark:text-zinc-200">{redeemResult.itemName}</span> has been generated and saved to your account.
                  </p>
                  <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border-2 border-dashed border-jc-orange/40 p-4 text-center">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1">Your Code</p>
                    <p className="text-2xl font-black font-mono text-jc-orange tracking-widest">{redeemResult.couponCode}</p>
                  </div>
                  <button
                    onClick={() => copyCode(redeemResult.couponCode!)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-jc-orange text-white font-bold text-sm transition-all active:scale-95"
                  >
                    {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedCode ? "Copied!" : "Copy Code"}
                  </button>
                  <p className="text-xs text-zinc-400 text-center">
                    Use this code at checkout when booking your next service. Valid 1 year.
                  </p>
                </div>
              )}

              {/* MYSTERY PRIZE */}
              {redeemResult.type === "mystery" && redeemResult.mysteryPrize && (
                <div className="space-y-4 text-center">
                  <div className="text-6xl">🎉</div>
                  <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-5 border border-emerald-500/20">
                    <p className="text-sm text-zinc-500 mb-1">You won</p>
                    <p className="text-3xl font-black text-emerald-500">{redeemResult.mysteryPrize.label}</p>
                    <p className="text-xs text-zinc-400 mt-1">Credited to your wallet instantly</p>
                  </div>
                  <p className="text-xs text-zinc-400">
                    New balance: <span className="font-bold text-zinc-700 dark:text-zinc-300">{parseFloat(redeemResult.newBalance || "0").toLocaleString()} JCMOVES</span>
                  </p>
                </div>
              )}

              {/* SPIN CREDITS */}
              {redeemResult.type === "spin" && (
                <div className="space-y-4 text-center">
                  <div className="text-5xl">⚡</div>
                  <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-5 border border-amber-500/20">
                    <p className="text-sm text-zinc-500 mb-1">Added to your account</p>
                    <p className="text-3xl font-black text-amber-500">{redeemResult.spinCount} {redeemResult.spinCount === 1 ? "Spin" : "Spins"}</p>
                    <p className="text-xs text-zinc-400 mt-1">Open the Quantum Spin wheel to use them</p>
                  </div>
                </div>
              )}

              {/* PENDING APPROVAL (gift cards, physical items) */}
              {redeemResult.type === "pending" && (
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">{redeemResult.itemName}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Your tokens have been deducted and your request is logged. Our team will contact you within 24 hours to arrange delivery or pickup.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {[
                      "Tokens deducted — redemption recorded ✓",
                      "Admin notified by email ✓",
                      "You'll hear from us within 24 hrs",
                    ].map(s => (
                      <div key={s} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-jc-orange flex-shrink-0" />
                        {s}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-400 pt-1">
                    New balance: <span className="font-bold text-zinc-700 dark:text-zinc-300">{parseFloat(redeemResult.newBalance || "0").toLocaleString()} JCMOVES</span>
                  </p>
                </div>
              )}

              {/* SERVICE / INVOICE CREDIT */}
              {redeemResult.type === "service" && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-1">{redeemResult.itemName}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Your credit has been logged and a job request created in our system. We'll reach out to schedule and apply the discount to your invoice.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {[
                      "Credit recorded in your account ✓",
                      "Job request auto-created ✓",
                      "Discount applied at invoice time",
                    ].map(s => (
                      <div key={s} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INSTANT / FALLBACK */}
              {redeemResult.type === "instant" && (
                <div className="space-y-3 text-center">
                  <div className="text-5xl">✅</div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{redeemResult.itemName}</span> has been redeemed and logged to your account.
                  </p>
                  <p className="text-xs text-zinc-400">
                    New balance: <span className="font-bold">{parseFloat(redeemResult.newBalance || "0").toLocaleString()} JCMOVES</span>
                  </p>
                </div>
              )}

              <button
                onClick={() => { setRedeemResult(null); setCopiedCode(false); }}
                className="mt-5 w-full py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-sm"
              >
                Done
              </button>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Transaction detail sheet ── */}
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
                <div className="space-y-0">
                  {[
                    { label: "Amount", value: <span className={`font-black ${isNeg ? "text-red-500" : "text-emerald-500"}`}>{isNeg ? "" : "+"}{fmt(Math.abs(amount), 4)} JCMOVES</span> },
                    { label: "Date",   value: new Date(selectedTx.earnedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
                    { label: "Time",   value: new Date(selectedTx.earnedDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) },
                    { label: "Status", value: <span className={`font-bold capitalize ${selectedTx.status === "confirmed" ? "text-emerald-500" : "text-amber-500"}`}>{selectedTx.status}</span> },
                    { label: "Type",   value: <span className="font-mono text-xs text-zinc-400">{selectedTx.rewardType}</span> },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                      <span className="text-sm text-zinc-500">{label}</span>
                      <span className="text-sm text-zinc-900 dark:text-zinc-100">{value}</span>
                    </div>
                  ))}
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
