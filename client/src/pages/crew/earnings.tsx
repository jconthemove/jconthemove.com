import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Coins, Zap, Clock, TrendingUp, ShoppingBag, Loader2, Lock, ChevronRight
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
        <p className="text-slate-400 text-sm">Your JCMOVES balance and history</p>
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

      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Balance", value: formatTokens(tokenBalance), color: "text-purple-400" },
          { label: "Total Earned", value: formatTokens(totalEarned), color: "text-green-400" },
          { label: "Stakes", value: activeStakes.length.toString(), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
            <p className={`text-base font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-500 text-xs">{s.label}</p>
          </div>
        ))}
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

      {/* Active Stakes */}
      {activeStakes.length > 0 && (
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-blue-400" /> Active Stakes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeStakes.map((stake: Stake) => (
              <div key={stake.id} className="p-3 bg-slate-900/50 rounded-lg border border-white/5">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="font-semibold text-white text-sm">{stake.tier?.name}</p>
                    <p className="text-xs text-slate-400">{formatTokens(parseFloat(stake.amount))} JCMOVES staked</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 text-sm font-bold">+{formatTokens(pendingStakeRewards(stake))}</p>
                    <p className="text-xs text-slate-500">pending</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3 w-3" />
                  <span>{daysRemaining(stake.endsAt)} days remaining</span>
                </div>
              </div>
            ))}
            <Link href="/staking">
              <Button variant="outline" size="sm" className="w-full border-white/10 text-slate-400 hover:text-white mt-1">
                Manage Staking <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {activeStakes.length === 0 && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white text-sm">Token Staking</p>
            <p className="text-slate-500 text-xs">Earn APR on your JCMOVES tokens</p>
          </div>
          <Link href="/staking">
            <Button size="sm" variant="outline" className="border-white/10 text-slate-300 hover:text-white">
              Stake <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Rewards History */}
      <div>
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
            {recentHistory.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-green-900/30 border border-green-700/30 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-4 w-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{REWARD_LABELS[item.rewardType] || item.rewardType}</p>
                  <p className="text-xs text-slate-400">{new Date(item.earnedDate).toLocaleDateString()}</p>
                </div>
                <span className="text-sm font-bold text-green-400">+{parseFloat(item.tokenAmount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-2" />
    </div>
  );
}
