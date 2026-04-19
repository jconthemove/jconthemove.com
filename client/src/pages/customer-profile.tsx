import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  User, Coins, Copy, LogOut, ChevronRight, Shield, Gem,
  FileText, History, RefreshCw, DollarSign, Gift, CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, clearTokens, queryClient } from "@/lib/queryClient";

type ProfileTab = "profile" | "history";

interface RedemptionMetadata {
  itemName: string;
  couponCode: string | null;
}

interface EarnHistoryItem {
  id: string;
  rewardType: string;
  tokenAmount: string;
  direction: 'earn';
  status: string;
  earnedDate: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface SpendHistoryItem {
  id: string;
  rewardType: 'redemption';
  tokenAmount: string;
  direction: 'spend';
  status: string;
  earnedDate: string;
  metadata: RedemptionMetadata;
}

interface UsdHistoryItem {
  id: string;
  rewardType: 'wallet_balance_redemption' | 'wallet_balance_redemption_refund';
  tokenAmount: string;
  cashValue: string;
  direction: 'usd_spend' | 'usd_refund';
  status: string;
  earnedDate: string;
  metadata?: {
    referenceType?: string;
    referenceId?: string;
    itemTitle?: string;
    amountUsd?: string;
    refundUsd?: string;
    paidInFull?: boolean;
    remainingDueUsd?: string;
    itemPriceUsd?: string;
    reason?: string;
  };
}

type RewardHistoryItem = EarnHistoryItem | SpendHistoryItem | UsdHistoryItem;

const REWARD_LABELS: Record<string, { label: string; icon: string }> = {
  booking_request:              { label: "Job Booked",           icon: "📋" },
  customer_quote_accepted:      { label: "Job Booked",           icon: "📋" },
  customer_quote_completed:     { label: "Job Completed",        icon: "✅" },
  loyalty_booking:              { label: "Earn Tokens",          icon: "💰" },
  service_type_bonus:           { label: "Service Bonus",        icon: "⭐" },
  referral_confirmed:           { label: "Referral Bonus",       icon: "🤝" },
  signup_bonus:                 { label: "Sign-Up Bonus",        icon: "🎉" },
  daily_checkin:                { label: "Daily Check-In",       icon: "☀️" },
  scripture_reward:             { label: "Daily Scripture",      icon: "📖" },
  spin_win:                     { label: "Quantum Spin Win",     icon: "🎰" },
  shop_purchase:                { label: "Shop Purchase",        icon: "🛍️" },
  jewelry_purchase:             { label: "Jewelry Purchase",     icon: "💎" },
  worker_job_completion_bonus:  { label: "Job Completion Pay",   icon: "🏆" },
  worker_hours_bonus:           { label: "Hours Bonus",          icon: "🕐" },
  admin_grant:                  { label: "Admin Bonus",          icon: "🎁" },
  staking_reward:               { label: "Staking Perk",         icon: "🔒" },
  daily_mining:                 { label: "Daily Mining",          icon: "⛏️" },
  redemption:                   { label: "Reward Redeemed",       icon: "🎁" },
};

function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function CustomerProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");

  const { data: wallet } = useQuery<{ tokenBalance: string }>({ queryKey: ["/api/rewards/wallet"] });
  const { data: walletBalance } = useQuery<{ tokenBalance: string; cashBalance: string }>({ queryKey: ["/api/wallet/balance"] });
  const { data: giftCards = [] } = useQuery<Array<{
    id: string; code: string; valueUsd: string; isRedeemed?: boolean;
    redeemedAt?: string | null; createdAt: string; paymentMethod: string;
  }>>({ queryKey: ["/api/gift-cards/mine"] });
  const { data: referralData } = useQuery<{ referralCode: string }>({ queryKey: ["/api/referrals/my-code"] });
  const { data: referralStats } = useQuery<{ referralCount: number; totalEarned: number }>({ queryKey: ["/api/referrals/stats"] });

  const { data: historyData, isLoading: historyLoading } = useQuery<{
    rewards: RewardHistoryItem[];
    total: number;
    totalTokensEarned: string;
  }>({
    queryKey: ["/api/rewards/history"],
    enabled: activeTab === "history",
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const cashBalance = parseFloat(walletBalance?.cashBalance || "0");
  const referralCode = referralData?.referralCode || "";

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: `Gift card code ${code} copied to clipboard` });
  };

  const copyReferral = () => {
    if (referralCode) {
      navigator.clipboard.writeText(referralCode);
      toast({ title: "Copied!", description: "Referral code copied to clipboard" });
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiRequest("POST", "/api/auth/logout", {});
    } catch {
    } finally {
      clearTokens();
      queryClient.clear();
      window.location.href = "/";
    }
  };

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  const menuItems = [
    { label: "Staking", icon: Coins, href: "/staking" },
    { label: "Ashley's Shop", icon: Gem, href: "/nature-made-jewls" },
    { label: "Terms of Service", icon: FileText, href: "/terms" },
    { label: "Privacy Policy", icon: Shield, href: "/privacy" },
  ];

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">

        {/* Avatar + Name */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-jc-orange flex items-center justify-center text-white text-xl font-bold shrink-0">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              userInitials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-zinc-900 dark:text-white truncate">
              {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm truncate">{user?.email}</p>
            {user?.username && (
              <p className="text-zinc-400 text-xs">@{user.username}</p>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-4 bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1">
          {([
            { key: "profile" as ProfileTab, label: "Profile",      Icon: User },
            { key: "history" as ProfileTab, label: "Earn History",  Icon: History },
          ]).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === key
                  ? "bg-white dark:bg-zinc-800 text-jc-orange shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Profile tab ── */}
        {activeTab === "profile" && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Token Balance</p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-jc-orange">
                      {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-sm text-zinc-400 font-medium">JCMOVES</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-jc-orange/10 flex items-center justify-center">
                  <Coins className="h-6 w-6 text-jc-orange" />
                </div>
              </div>
            </div>

            {/* JCMOVES USD wallet balance — spendable at Ashley's Shop / jewelry checkout */}
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400 font-medium uppercase tracking-wider">JCMOVES USD Balance</p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                      ${cashBalance.toFixed(2)}
                    </span>
                    <span className="text-sm text-emerald-600/70 dark:text-emerald-400/70 font-medium">USD</span>
                  </div>
                  <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/80 mt-1">
                    Spend at Ashley's Shop checkout
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              {cashBalance > 0 && (
                <button
                  onClick={() => setLocation("/nature-made-jewls")}
                  className="mt-3 w-full text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-white/70 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg py-2 hover:bg-white dark:hover:bg-emerald-900/50 transition-colors"
                >
                  Shop Ashley's Pieces →
                </button>
              )}
            </div>

            {/* Gift cards tied to this account */}
            {giftCards.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 mb-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Gift className="h-4 w-4 text-pink-500" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                    My Gift Cards ({giftCards.length})
                  </p>
                </div>
                <div className="space-y-2">
                  {giftCards.map((gc) => {
                    const pending = gc.paymentMethod === "usd_pending" && !gc.isRedeemed;
                    return (
                      <div
                        key={gc.id}
                        className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                          gc.isRedeemed
                            ? "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-100 dark:border-zinc-800 opacity-70"
                            : "bg-pink-50/60 dark:bg-pink-950/20 border-pink-100 dark:border-pink-900/30"
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          gc.isRedeemed ? "bg-zinc-200 dark:bg-zinc-700" : "bg-pink-100 dark:bg-pink-900/40"
                        }`}>
                          {gc.isRedeemed
                            ? <CheckCircle2 className="h-4 w-4 text-zinc-500" />
                            : <Gift className="h-4 w-4 text-pink-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                              ${parseFloat(gc.valueUsd).toFixed(2)}
                            </p>
                            {pending && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                Pending invoice
                              </span>
                            )}
                            {gc.isRedeemed && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                Redeemed
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{gc.code}</p>
                        </div>
                        <button
                          onClick={() => copyCode(gc.code)}
                          className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-jc-orange transition-colors shrink-0"
                          aria-label="Copy code"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-400 mt-2 text-center">
                  Pending cards are credited to your USD balance once your trash invoice is paid.
                </p>
              </div>
            )}

            {referralCode && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 mb-4 shadow-sm">
                <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-2">Referral Code</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-zinc-50 dark:bg-zinc-800 rounded-xl px-4 py-3 font-mono text-center text-lg tracking-widest text-zinc-900 dark:text-white font-bold">
                    {referralCode}
                  </div>
                  <button
                    onClick={copyReferral}
                    className="w-11 h-11 rounded-xl bg-jc-orange/10 flex items-center justify-center text-jc-orange hover:bg-jc-orange/20 transition-colors"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
                {referralStats && referralStats.referralCount > 0 && (
                  <p className="text-xs text-zinc-400 mt-2 text-center">
                    {referralStats.referralCount} referral{referralStats.referralCount !== 1 ? "s" : ""} · {referralStats.totalEarned.toFixed(0)} JCMOVES earned
                  </p>
                )}
              </div>
            )}

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden mb-4 shadow-sm">
              {menuItems.map(({ label, icon: Icon, href }, i) => (
                <button
                  key={label}
                  onClick={() => setLocation(href)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                    i < menuItems.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""
                  }`}
                >
                  <Icon className="h-5 w-5 text-zinc-400" />
                  <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
                </button>
              ))}
            </div>

            {user?.role === "admin" && (
              <button
                onClick={() => setLocation("/in-god-we-trust")}
                className="w-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-300/30 dark:border-amber-700/30 rounded-2xl p-4 mb-4 flex items-center gap-3 hover:border-amber-400/50 transition-colors"
              >
                <Shield className="h-5 w-5 text-amber-500" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Admin Dashboard</p>
                  <p className="text-xs text-amber-500/70">IN GOD WE TRUST</p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-400" />
              </button>
            )}

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </>
        )}

        {/* ── History tab ── */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {historyData && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-3 text-center shadow-sm">
                  <div className="text-xl font-black text-jc-orange">
                    {Math.round(parseFloat(historyData.totalTokensEarned || "0")).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-medium mt-0.5">Total JCMOVES Earned</div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-3 text-center shadow-sm">
                  <div className="text-xl font-black text-zinc-700 dark:text-zinc-200">
                    {historyData.total}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-medium mt-0.5">Reward Events</div>
                </div>
              </div>
            )}

            {historyLoading && (
              <div className="flex justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-jc-orange" />
              </div>
            )}

            {!historyLoading && historyData && historyData.rewards.length === 0 && (
              <div className="text-center py-12">
                <Coins className="h-12 w-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm font-bold text-zinc-500">No rewards yet</p>
                <p className="text-xs text-zinc-400 mt-1">Book a service to start earning JCMOVES!</p>
              </div>
            )}

            {!historyLoading && historyData && historyData.rewards.length > 0 && (
              <div className="space-y-2">
                {historyData.rewards.map((item) => {
                  const isTokenSpend = item.direction === 'spend';
                  const isUsdSpend = item.direction === 'usd_spend';
                  const isUsdRefund = item.direction === 'usd_refund';
                  const isUsd = isUsdSpend || isUsdRefund;

                  let displayLabel: string;
                  let displayIcon: string;
                  let amountNode: React.ReactNode;
                  let containerClasses: string;
                  let iconBgClasses: string;
                  let amountClasses: string;

                  if (isUsd) {
                    const usdItem = item as UsdHistoryItem;
                    const itemTitle = usdItem.metadata?.itemTitle || "Shop item";
                    const rawCash = parseFloat(usdItem.cashValue || "0");
                    const usdAmount = isUsdRefund
                      ? Math.abs(parseFloat(usdItem.metadata?.refundUsd || String(rawCash)) || 0)
                      : Math.abs(parseFloat(usdItem.metadata?.amountUsd || String(rawCash)) || 0);
                    const usdFormatted = usdAmount.toFixed(2);

                    if (isUsdRefund) {
                      displayIcon = "↩️";
                      displayLabel = `Refund $${usdFormatted}${
                        usdItem.metadata?.itemTitle ? ` — ${itemTitle}` : ""
                      }`;
                      containerClasses = "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30";
                      iconBgClasses = "bg-emerald-100 dark:bg-emerald-900/30";
                      amountClasses = "text-emerald-600 dark:text-emerald-400";
                    } else {
                      displayIcon = "💵";
                      displayLabel = `Spent $${usdFormatted} on ${itemTitle}`;
                      containerClasses = "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30";
                      iconBgClasses = "bg-red-100 dark:bg-red-900/30";
                      amountClasses = "text-red-500 dark:text-red-400";
                    }

                    amountNode = (
                      <>
                        <div className={`text-sm font-black ${amountClasses}`}>
                          {isUsdRefund ? "+" : "−"}${usdFormatted}
                        </div>
                        <div className="text-[9px] text-zinc-400 font-medium">USD</div>
                      </>
                    );
                  } else {
                    displayLabel = isTokenSpend
                      ? (item as SpendHistoryItem).metadata.itemName || "Reward Redeemed"
                      : (REWARD_LABELS[item.rewardType]?.label ?? item.rewardType.replace(/_/g, " "));
                    displayIcon = isTokenSpend
                      ? "🎁"
                      : (REWARD_LABELS[item.rewardType]?.icon ?? "💫");
                    const tokens = Math.round(parseFloat(item.tokenAmount || "0"));
                    containerClasses = isTokenSpend
                      ? "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
                      : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800";
                    iconBgClasses = isTokenSpend
                      ? "bg-red-100 dark:bg-red-900/30"
                      : "bg-jc-orange/10";
                    amountClasses = isTokenSpend
                      ? "text-red-500 dark:text-red-400"
                      : "text-jc-orange";
                    amountNode = (
                      <>
                        <div className={`text-sm font-black ${amountClasses}`}>
                          {isTokenSpend ? "−" : "+"}{tokens.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-zinc-400 font-medium">JCMOVES</div>
                      </>
                    );
                  }

                  return (
                    <div
                      key={`${item.rewardType}-${item.id}`}
                      className={`rounded-xl border px-4 py-3 flex items-center gap-3 shadow-sm ${containerClasses}`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${iconBgClasses}`}>
                        {displayIcon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold text-zinc-800 dark:text-zinc-100 ${isUsd ? "" : "capitalize"}`}>
                          {displayLabel}
                        </p>
                        <p className="text-[11px] text-zinc-400">{timeAgo(item.earnedDate)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {amountNode}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
