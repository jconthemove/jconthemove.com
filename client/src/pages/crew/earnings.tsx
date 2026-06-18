import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Coins, Zap, Clock, TrendingUp, Loader2, Lock, Link as LinkIcon, Share2
} from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { notificationService } from "@/lib/notifications";

interface MiningStatus {
  currentSession: { startedAt: string; userId: string } | null;
  accumulatedTokens: string;
  timeRemaining: number;
  totalClaimedToday: string;
  miningSpeed: string;
  streakCount: number;
  nextStreakBonus: string;
  claimsRemainingToday: number;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
  status: string;
  earnedDate: string;
}

interface Stake {
  id: string;
  amount: string;
  dailyRate: string;
  endsAt: string;
  status: string;
  lastPayoutAt: string;
  tier: { id: string; name: string; minAmount: string; apr: string; lockupDays: number; color: string };
}

const REWARD_LABELS: Record<string, string> = {
  mining: "Mining Reward",
  daily_checkin: "Daily Check-in",
  lead_creation: "Job Creation Bonus",
  job_completion: "Job Completion",
  worker_job_completion_bonus: "Job Completion Bonus",
  worker_hours_bonus: "Hours Bonus",
  loyalty_booking: "Loyalty Reward",
  referral: "Referral Bonus",
  signup_bonus: "Welcome Bonus",
  review_submitted: "Left a review",
};

function formatTokens(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysRemaining(endsAt: string) {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000));
}

function pendingStakeRewards(stake: Stake) {
  const daysSince = (Date.now() - new Date(stake.lastPayoutAt).getTime()) / 86400000;
  return parseFloat(stake.amount) * parseFloat(stake.dailyRate) * daysSince;
}

const ALL_CAPABILITIES: { key: string; label: string; emoji: string }[] = [
  { key: "mover", label: "Mover", emoji: "💪" },
  { key: "driver", label: "Driver", emoji: "🚛" },
  { key: "truck_small", label: "Truck (Small)", emoji: "🚐" },
  { key: "truck_large", label: "Truck (Large)", emoji: "🚚" },
  { key: "trailer_small", label: "Trailer (Small)", emoji: "🏕️" },
  { key: "trailer_large", label: "Trailer (Large)", emoji: "🏗️" },
  { key: "uhaul", label: "Uhaul Access", emoji: "🔑" },
];

export default function CrewEarningsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [animatedTokens, setAnimatedTokens] = useState(0);

  const { data: wallet } = useQuery<{ balance: string; tokenBalance?: string; totalEarned?: string }>({ queryKey: ["/api/rewards/wallet"] });
  const { data: miningStatus } = useQuery<MiningStatus>({ queryKey: ["/api/mining/status"], refetchInterval: 15000, refetchIntervalInBackground: false, retry: 1 });
  const { data: rewardsHistory } = useQuery<RewardHistory[]>({ queryKey: ["/api/rewards/history"] });
  const { data: stakes = [] } = useQuery<Stake[]>({ queryKey: ["/api/staking/my-stakes"], retry: 1 });

  const userCapabilities: string[] = user?.capabilities ?? [];
  const referralCode = (user as any)?.referralCode || "";
  const referralSlug = (user as any)?.firstName ? String((user as any).firstName).toLowerCase().replace(/[^a-z0-9]+/g, "-") : "";
  const referralLink = referralSlug
    ? `${window.location.origin}/network/${referralSlug}`
    : `${window.location.origin}/book${referralCode ? `?promo=${encodeURIComponent(referralCode)}` : ""}`;

  useEffect(() => {
    if (!miningStatus?.currentSession) { setAnimatedTokens(0); return; }
    const server = parseFloat(miningStatus.accumulatedTokens || "0");
    setAnimatedTokens(server);
    const speed = parseFloat(miningStatus.miningSpeed || "1");
    const iv = setInterval(() => setAnimatedTokens(p => p + 0.0002 * speed), 100);
    return () => clearInterval(iv);
  }, [miningStatus?.currentSession, miningStatus?.accumulatedTokens, miningStatus?.miningSpeed]);

  const cycleProgress = useMemo(() => {
    if (!miningStatus?.currentSession || !miningStatus?.timeRemaining) return 0;
    const CYCLE = 24 * 60 * 60 * 1000;
    return Math.min(100, Math.max(0, ((CYCLE - miningStatus.timeRemaining) / CYCLE) * 100));
  }, [miningStatus?.timeRemaining, miningStatus?.currentSession]);

  const formatTimeRemaining = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const startMiningMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({ title: "Mining Started!", description: "Tokens are accumulating!" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/claim"),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      const claimed = parseFloat(data.tokensClaimed || "0");
      toast({ title: "Tokens Claimed!", description: `+${claimed.toFixed(2)} JCMOVES` });
      notificationService.notifyNewReward("mining", claimed);
    },
    onError: (e: Error) => toast({ title: "Claim Failed", description: e.message, variant: "destructive" }),
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || wallet?.balance || "0");
  const totalEarned = parseFloat(wallet?.totalEarned || "0");
  const canClaim = !!miningStatus?.currentSession && parseFloat(miningStatus.accumulatedTokens || "0") > 0;
  const activeStakes = stakes.filter((s: Stake) => s.status === "active");
  const history: RewardHistory[] = Array.isArray(rewardsHistory) ? rewardsHistory : [];
  const recentHistory = history.slice(0, 20);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Earnings</h1>
        <p className="text-slate-400 text-sm">Your pay visibility, JCMOVES balance, and referral tools</p>
      </div>

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Worker marketing link</p>
            <h2 className="mt-1 text-lg font-black text-white">Share your JC ON THE MOVE booking page</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Send this link to customers. Jobs can be tracked back to your code or rep page so referrals, revenue, and future bonuses stay visible.
            </p>
          </div>
          <Share2 className="h-5 w-5 shrink-0 text-emerald-300" />
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3">
          <p className="break-all font-mono text-xs text-slate-200">{referralLink}</p>
          {referralCode && <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300">Code: {referralCode}</p>}
        </div>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400"
          onClick={() => navigator.clipboard?.writeText(referralLink).catch(() => {})}
        >
          <LinkIcon className="h-3.5 w-3.5" /> Copy link
        </button>
      </div>

      {/* Crew Capabilities (read-only) */}
      {userCapabilities.length > 0 && (
        <div className="rounded-2xl bg-slate-800/40 border border-slate-700/30 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">🛠️ Your Capabilities</p>
          <div className="flex flex-wrap gap-2">
            {ALL_CAPABILITIES.filter(cap => userCapabilities.includes(cap.key)).map(cap => (
              <span key={cap.key} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold">
                {cap.emoji} {cap.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Balance Summary — clickable tiles */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/rewards">
          <div className="bg-slate-800/60 border border-purple-500/30 rounded-xl p-3 text-center cursor-pointer hover:bg-purple-950/30 hover:border-purple-500/50 transition-colors group">
            <p className="text-base font-black text-purple-400">{formatTokens(tokenBalance)}</p>
            <p className="text-slate-500 text-xs">Balance</p>
            <p className="text-purple-500 text-[9px] mt-0.5 group-hover:text-purple-400">Spend →</p>
          </div>
        </Link>
        <a href="#history">
          <div className="bg-slate-800/60 border border-green-500/20 rounded-xl p-3 text-center cursor-pointer hover:bg-green-950/20 hover:border-green-500/40 transition-colors group">
            <p className="text-base font-black text-green-400">{formatTokens(totalEarned)}</p>
            <p className="text-slate-500 text-xs">Total Earned</p>
            <p className="text-green-600 text-[9px] mt-0.5 group-hover:text-green-400">History →</p>
          </div>
        </a>
        <Link href="/staking">
          <div className="bg-slate-800/60 border border-blue-500/20 rounded-xl p-3 text-center cursor-pointer hover:bg-blue-950/20 hover:border-blue-500/40 transition-colors group">
            <p className="text-base font-black text-blue-400">{activeStakes.length}</p>
            <p className="text-slate-500 text-xs">Stakes</p>
            <p className="text-blue-600 text-[9px] mt-0.5 group-hover:text-blue-400">Manage →</p>
          </div>
        </Link>
      </div>

      {/* Mining Section */}
      <Card className="border-orange-500/20 bg-orange-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-orange-400" /> Daily Mining
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Earn passive tokens every day — claim up to 3 times</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
            <div>
              <p className="text-xs text-slate-400">Streak</p>
              <p className="text-xl font-black text-orange-400">{miningStatus?.streakCount || 0} days</p>
              {(miningStatus?.streakCount || 0) > 1 && <p className="text-xs text-green-400">+{miningStatus!.streakCount - 1}% bonus</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Available</p>
              <p className="text-xl font-black text-green-400 tabular-nums">
                {miningStatus?.currentSession ? animatedTokens.toFixed(4) : "0.0000"}
              </p>
              <p className="text-xs text-slate-500">JCMOVES</p>
            </div>
          </div>

          {miningStatus?.currentSession && (
            <div className="space-y-1.5 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                  </span>
                  Mining Active
                </span>
                <span className="text-orange-400">{formatTimeRemaining(miningStatus.timeRemaining)} left</span>
              </div>
              <Progress value={cycleProgress} className="h-2 bg-slate-700" />
              <p className="text-xs text-slate-500 text-center">{miningStatus.claimsRemainingToday} of 3 claims remaining today</p>
            </div>
          )}

          {!miningStatus?.currentSession ? (
            <Button
              className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 font-bold"
              onClick={() => startMiningMutation.mutate()}
              disabled={startMiningMutation.isPending}
            >
              {startMiningMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</> : <><Zap className="h-4 w-4 mr-2" />Start Mining</>}
            </Button>
          ) : (
            <Button
              className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 font-bold"
              onClick={() => claimMutation.mutate()}
              disabled={!canClaim || claimMutation.isPending || (miningStatus?.claimsRemainingToday || 0) <= 0}
            >
              {claimMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Claiming...</> :
               (miningStatus?.claimsRemainingToday || 0) <= 0 ? <><Clock className="h-4 w-4 mr-2" />Max Claims Today</> :
               canClaim ? <><Coins className="h-4 w-4 mr-2" />Claim Tokens</> :
               <><Clock className="h-4 w-4 mr-2" />Accumulating...</>}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Staking Perks */}
      <div className="bg-slate-800/40 border border-blue-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-blue-400" />
            <span className="font-bold text-white text-sm">Token Staking Perks</span>
          </div>
          <Link href="/staking">
            <span className="text-blue-400 text-xs hover:text-blue-300">Manage →</span>
          </Link>
        </div>
        <p className="text-slate-400 text-xs">Lock JCMOVES to unlock service discounts, worker job bonuses, and premium platform access.</p>

        {/* Tier benefits */}
        <div className="space-y-2">
          {[
            { threshold: 25_000, label: "Silver Tier", perks: ["5% service discount", "5% job bonus (workers)", "Premium shop access"], color: "border-slate-400/30 bg-slate-700/20", badge: "text-slate-300 bg-slate-700/40" },
            { threshold: 100_000, label: "Gold Tier", perks: ["10% service discount", "10% job bonus (workers)", "Early booking windows", "VIP badge"], color: "border-yellow-500/30 bg-yellow-950/20", badge: "text-yellow-300 bg-yellow-900/30" },
          ].map(tier => {
            const totalStaked = activeStakes.reduce((sum: number, s: Stake) => sum + parseFloat(s.amount), 0);
            const unlocked = totalStaked >= tier.threshold;
            return (
              <div key={tier.threshold} className={`rounded-xl border p-3 ${tier.color} ${!unlocked ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.badge}`}>{tier.label}</span>
                  <span className="text-[10px] text-slate-400">{(tier.threshold / 1000).toFixed(0)}k JCMOVES locked</span>
                  {unlocked && <span className="text-green-400 text-[10px] font-bold">✓ UNLOCKED</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tier.perks.map(p => (
                    <span key={p} className="text-[10px] text-slate-300 bg-white/5 rounded px-1.5 py-0.5">{p}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {activeStakes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your active locks</p>
            {activeStakes.map((stake: Stake) => (
              <div key={stake.id} className="p-2.5 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white text-xs">{stake.tier?.name}</p>
                  <p className="text-[10px] text-slate-400">{formatTokens(parseFloat(stake.amount))} JCMOVES locked</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock className="h-3 w-3" />
                    <span>{daysRemaining(stake.endsAt)}d left</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rewards History */}
      <div id="history">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Recent Earnings</h2>
          <span className="text-xs text-slate-400">{recentHistory.length} records</span>
        </div>
        {recentHistory.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Coins className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>No earnings yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentHistory.map(item => {
              // Task #173 — visually break out base payout vs. bonus on
              // completed jobs so the crew can see exactly why the number
              // came in higher than the base amount.
              const isBonus = item.rewardType === "worker_job_completion_bonus"
                || item.rewardType === "worker_hours_bonus";
              const isBase = item.rewardType === "job_completion";
              const accent = isBonus
                ? { border: "border-emerald-500/30", chip: "bg-emerald-900/30 border-emerald-700/40", icon: "text-emerald-300", amount: "text-emerald-300", tag: "BONUS" }
                : isBase
                ? { border: "border-green-500/20", chip: "bg-green-900/30 border-green-700/30", icon: "text-green-400", amount: "text-green-400", tag: "BASE" }
                : { border: "border-slate-700/30", chip: "bg-slate-900/30 border-slate-700/30", icon: "text-green-400", amount: "text-green-400", tag: "" };
              return (
                <div key={item.id} className={`flex items-center gap-3 bg-slate-800/40 border ${accent.border} rounded-xl px-4 py-3`} data-testid={`earning-${item.id}`}>
                  <div className={`w-9 h-9 rounded-lg ${accent.chip} border flex items-center justify-center flex-shrink-0`}>
                    <TrendingUp className={`h-4 w-4 ${accent.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-white truncate">{REWARD_LABELS[item.rewardType] || item.rewardType}</p>
                      {accent.tag && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isBonus ? "bg-emerald-500/20 text-emerald-300" : "bg-green-500/20 text-green-300"}`}>
                          {accent.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{new Date(item.earnedDate).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-sm font-bold ${accent.amount}`}>+{parseFloat(item.tokenAmount).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-2" />
    </div>
  );
}
