import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  User, Coins, Copy, LogOut, ChevronRight, Shield, Gem,
  FileText, History, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, clearTokens, queryClient } from "@/lib/queryClient";

type ProfileTab = "profile" | "history";

interface RewardHistoryItem {
  id: number;
  rewardType: string;
  tokenAmount: string;
  status: string;
  earnedDate: string;
  metadata?: Record<string, any>;
}

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
  const referralCode = referralData?.referralCode || "";

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
                  const info = REWARD_LABELS[item.rewardType] ?? {
                    label: item.rewardType.replace(/_/g, " "),
                    icon: "💫",
                  };
                  const amount = Math.round(parseFloat(item.tokenAmount || "0"));
                  return (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 shadow-sm"
                    >
                      <div className="w-9 h-9 rounded-xl bg-jc-orange/10 flex items-center justify-center text-lg shrink-0">
                        {info.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 capitalize">
                          {info.label}
                        </p>
                        <p className="text-[11px] text-zinc-400">{timeAgo(item.earnedDate)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-jc-orange">+{amount.toLocaleString()}</div>
                        <div className="text-[9px] text-zinc-400 font-medium">JCMOVES</div>
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
