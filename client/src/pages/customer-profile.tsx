import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  User, Coins, Copy, LogOut, ChevronRight, Shield, Gem,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, clearTokens } from "@/lib/queryClient";

export default function CustomerProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: wallet } = useQuery<{ tokenBalance: string }>({ queryKey: ["/api/rewards/wallet"] });
  const { data: referralData } = useQuery<{ referralCode: string }>({ queryKey: ["/api/referrals/my-code"] });
  const { data: referralStats } = useQuery<{ referralCount: number; totalEarned: number }>({ queryKey: ["/api/referrals/stats"] });

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
      window.location.href = "/";
    }
  };

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  const menuItems = [
    { label: "Staking", icon: Coins, href: "/staking", external: false },
    { label: "Ashley's Shop", icon: Gem, href: "/nature-made-jewls", external: false },
    { label: "Terms of Service", icon: FileText, href: "/terms", external: false },
    { label: "Privacy Policy", icon: Shield, href: "/privacy", external: false },
  ];

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-jc-orange flex items-center justify-center text-white text-xl font-bold">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              userInitials
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-black text-zinc-900 dark:text-white">
              {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">{user?.email}</p>
            {user?.username && (
              <p className="text-zinc-400 text-xs">@{user.username}</p>
            )}
          </div>
        </div>

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
      </div>
    </div>
  );
}
