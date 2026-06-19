import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Loader2, Zap, Users, Coins, Flame, Star, TrendingUp, ShoppingBag, Briefcase, Lock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { notificationService } from "@/lib/notifications";
import { NotificationToggle } from "@/components/notification-prompt";
import { ConfettiBurst } from "@/components/ConfettiBurst";

interface MiningStatus {
  currentSession: any;
  accumulatedTokens: string;
  timeRemaining: number;
  totalClaimedToday: string;
  miningSpeed: string;
  streakCount: number;
  nextStreakBonus: string;
  claimsRemainingToday: number;
}

const LEVELS = [
  { name: "Mover", minStreak: 0, color: "text-slate-300", bg: "from-slate-600 to-slate-500" },
  { name: "Crew", minStreak: 7, color: "text-blue-300", bg: "from-blue-700 to-blue-500" },
  { name: "Pro Worker", minStreak: 30, color: "text-purple-300", bg: "from-purple-700 to-purple-500" },
  { name: "Elite Operator", minStreak: 90, color: "text-yellow-300", bg: "from-yellow-700 to-yellow-500" },
];

function getLevel(streak: number) {
  let level = LEVELS[0];
  for (const l of LEVELS) {
    if (streak >= l.minStreak) level = l;
  }
  const idx = LEVELS.indexOf(level);
  const next = LEVELS[idx + 1];
  const progress = next
    ? Math.min(100, ((streak - level.minStreak) / (next.minStreak - level.minStreak)) * 100)
    : 100;
  return { level, levelIndex: idx, next, progress };
}

function CircularTimer({ timeRemaining }: { timeRemaining: number }) {
  const FULL_DAY_MS = 24 * 60 * 60 * 1000;
  const ratio = Math.max(0, Math.min(1, timeRemaining / FULL_DAY_MS));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * ratio;

  const totalSeconds = Math.floor(timeRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="relative flex items-center justify-center w-40 h-40 mx-auto">
      <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          stroke="url(#timerGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
        <defs>
          <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
      <div className="text-center z-10">
        <p className="text-xs text-white/60 mb-1">Next Reward</p>
        <p className="text-2xl font-bold font-mono text-white leading-tight" data-testid="text-countdown-timer">
          {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
        </p>
        <p className="text-lg font-bold font-mono text-white/80">
          :{String(seconds).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}


export default function MiningPage() {
  const { toast } = useToast();
  const [accumulatedTokens, setAccumulatedTokens] = useState("0.00000000");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: miningStatus, isLoading } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
    refetchInterval: 5000,
  });

  const { data: walletData } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/wallet/balance"],
  });

  const startMiningMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/mining/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({ title: "Daily Rewards Activated!", description: "Earn 864 JCMOVES every 24 hours." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to Start", description: error.message || "Please try again", variant: "destructive" });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mining/claim");
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });

      setShowConfetti(true);
      if (confettiTimer.current) clearTimeout(confettiTimer.current);
      confettiTimer.current = setTimeout(() => setShowConfetti(false), 1000);

      const tokensClaimed = parseFloat(data.tokensClaimed || 0);
      const streakCount = data.streakCount || 0;
      const bonusLabel = streakCount > 1 ? ` (+${Math.min(streakCount - 1, 10) * 10}% streak bonus)` : "";
      toast({
        title: `+${tokensClaimed.toFixed(2)} JCMOVES Claimed!${bonusLabel}`,
        description: `Your wallet balance: ${parseFloat(data.newBalance || 0).toFixed(2)} JCMOVES`,
      });

      if (streakCount > 1) {
        notificationService.notifyStreakBonus(streakCount, Math.min(streakCount - 1, 10) * 10);
      } else {
        notificationService.notifyNewReward("daily reward", tokensClaimed);
      }
    },
    onError: (error: any) => {
      toast({ title: "Claim Failed", description: error.message || "Please try again", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!miningStatus?.currentSession) return;
    const updateAccumulated = () => {
      const now = Date.now();
      const lastClaim = new Date(miningStatus.currentSession.lastClaimTime).getTime();
      const secondsElapsed = Math.floor((now - lastClaim) / 1000);
      const miningSpeed = parseFloat(miningStatus.miningSpeed || "1.00");
      const tokensEarned = secondsElapsed * 0.01 * miningSpeed;
      const previousAccumulated = parseFloat(miningStatus.currentSession.accumulatedTokens || "0");
      const totalAccumulated = previousAccumulated + tokensEarned;
      const maxTokens = 864 * miningSpeed;
      setAccumulatedTokens(Math.min(totalAccumulated, maxTokens).toFixed(8));
    };
    updateAccumulated();
    const interval = setInterval(updateAccumulated, 100);
    return () => clearInterval(interval);
  }, [miningStatus]);

  useEffect(() => {
    if (!miningStatus?.currentSession) return;
    const updateTimer = () => {
      const now = Date.now();
      const nextClaim = new Date(miningStatus.currentSession.nextClaimAt).getTime();
      const remaining = Math.max(0, nextClaim - now);
      setTimeRemaining(remaining);
      if (remaining === 0 && parseFloat(accumulatedTokens) > 0 && !claimMutation.isPending) {
        claimMutation.mutate();
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [miningStatus, accumulatedTokens]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  const hasActiveSession = !!miningStatus?.currentSession;
  const streak = miningStatus?.streakCount || 0;
  const { level, levelIndex, next, progress } = getLevel(streak);
  const accumulated = parseFloat(accumulatedTokens);
  const canClaim = accumulated > 0 && !claimMutation.isPending;
  const walletBalance = parseFloat(walletData?.tokenBalance || "0");
  const claimsLeft = miningStatus?.claimsRemainingToday ?? 3;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 pb-28 md:pb-6">
      <style>{`
        @keyframes confettiBurst {
          0% { transform: rotate(var(--angle, 0deg)) translateY(0px) scale(1); opacity: 1; }
          100% { transform: rotate(var(--angle, 0deg)) translateY(-80px) scale(0.3); opacity: 0; }
        }
      `}</style>

      <div className="max-w-md mx-auto px-4 pt-6 space-y-5">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Daily Rewards</h1>
            <p className="text-xs text-slate-400">Earn JCMOVES every day</p>
          </div>
          <NotificationToggle />
        </div>

        {/* ── ZONE 1: HERO — Token + Claim ── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 border border-purple-700/50 shadow-2xl p-6">
          <ConfettiBurst active={showConfetti} variant="inline" />

          {/* Wallet balance row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-purple-300">Wallet Balance</p>
              <p className="text-2xl font-bold text-white">{walletBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-purple-300">JCMOVES</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-purple-300">Earning Rate</p>
              <p className="text-lg font-bold text-orange-400">{parseFloat(miningStatus?.miningSpeed || "1").toFixed(0)}x</p>
              <p className="text-xs text-purple-300">Speed</p>
            </div>
          </div>

          {hasActiveSession ? (
            <>
              {/* Circular countdown */}
              <div className="mb-4">
                <CircularTimer timeRemaining={timeRemaining} />
              </div>

              {/* Accumulating amount */}
              <div className="bg-white/10 rounded-xl p-3 mb-4 text-center backdrop-blur-sm">
                <p className="text-xs text-white/60 mb-1">Accumulated</p>
                <p className="text-3xl font-bold text-green-300 tabular-nums" data-testid="text-accumulated-tokens">
                  {accumulated.toFixed(2)}
                </p>
                <p className="text-xs text-white/60">JCMOVES</p>
              </div>

              {/* CLAIM button — the hero action */}
              <button
                onClick={() => claimMutation.mutate()}
                disabled={!canClaim}
                data-testid="button-claim-tokens"
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 shadow-lg
                  ${canClaim
                    ? "bg-gradient-to-r from-green-500 to-emerald-400 text-white hover:from-green-400 hover:to-emerald-300 hover:scale-[1.02] active:scale-[0.98] shadow-green-500/30"
                    : "bg-white/10 text-white/40 cursor-not-allowed"}`}
              >
                {claimMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Claiming...</span>
                ) : canClaim ? (
                  <span className="flex items-center justify-center gap-2"><Coins className="h-5 w-5" /> Claim Reward</span>
                ) : (
                  <span className="flex items-center justify-center gap-2"><Lock className="h-5 w-5" /> Accumulating...</span>
                )}
              </button>

              {claimsLeft < 3 && (
                <p className="text-center text-xs text-white/50 mt-2">{claimsLeft} claim{claimsLeft !== 1 ? "s" : ""} remaining today</p>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <Zap className="h-14 w-14 mx-auto text-orange-400 mb-3" />
              <p className="text-white font-semibold mb-1">Activate Daily Rewards</p>
              <p className="text-purple-300 text-sm mb-5">Earn 864 JCMOVES every 24 hours passively</p>
              <button
                onClick={() => startMiningMutation.mutate()}
                disabled={startMiningMutation.isPending}
                data-testid="button-start-mining"
                className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {startMiningMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Start Earning"}
              </button>
            </div>
          )}
        </div>

        {/* ── ZONE 2: PROGRESS — Streak + Level ── */}
        <div className="rounded-2xl bg-slate-800/80 border border-slate-700/50 p-5 space-y-4">
          {/* Streak row */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
              <Flame className="h-5 w-5 text-orange-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">
                  {streak > 0 ? `${streak}-Day Streak` : "Start Your Streak"}
                </p>
                <p className="text-xs text-orange-400 font-medium">
                  {streak > 0 ? `+${Math.min(streak - 1, 10) * 10}% bonus` : "Claim daily for bonus"}
                </p>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-orange-500 to-red-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (streak / 30) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Day {streak} / 30</p>
            </div>
          </div>

          {/* Level row */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${level.bg} flex items-center justify-center flex-shrink-0`}>
              <Star className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">
                  Level {levelIndex + 1} — <span className={level.color}>{level.name}</span>
                </p>
                {next && <p className="text-xs text-slate-400">{next.minStreak - streak}d to {next.name}</p>}
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className={`bg-gradient-to-r ${level.bg} h-2 rounded-full transition-all duration-500`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Today's stats */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-700/50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-orange-400" data-testid="text-daily-rate">864</p>
              <p className="text-xs text-slate-400">Daily Base</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-400" data-testid="text-claimed-today">
                {parseFloat(miningStatus?.totalClaimedToday || "0").toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">Claimed Today</p>
            </div>
          </div>
        </div>

        {/* ── ZONE 3: EARN MORE ── */}
        <div className="rounded-2xl bg-slate-800/80 border border-slate-700/50 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Earn More</p>
          <div className="space-y-2">
            <Link href="/staking">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-900/40 border border-purple-700/40 hover:border-purple-500/60 transition-colors cursor-pointer">
                <TrendingUp className="h-5 w-5 text-purple-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">JCMOVES Boosts</p>
                  <p className="text-xs text-slate-400">Use rewards for loyalty perks</p>
                </div>
                <p className="text-xs text-purple-300 font-medium">→</p>
              </div>
            </Link>
            <Link href="/dashboard">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-900/40 border border-blue-700/40 hover:border-blue-500/60 transition-colors cursor-pointer">
                <Users className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Refer Friends</p>
                  <p className="text-xs text-slate-400">+2,500 JCMOVES per referral</p>
                </div>
                <p className="text-xs text-blue-300 font-medium">→</p>
              </div>
            </Link>
            <Link href="/marketplace">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-900/40 border border-green-700/40 hover:border-green-500/60 transition-colors cursor-pointer">
                <ShoppingBag className="h-5 w-5 text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Community Shop</p>
                  <p className="text-xs text-slate-400">+100 per listing · +150 per purchase</p>
                </div>
                <p className="text-xs text-green-300 font-medium">→</p>
              </div>
            </Link>
          </div>
        </div>

        {/* ── USE YOUR JCMOVES ── */}
        <div className="rounded-2xl bg-slate-800/80 border border-slate-700/50 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Use Your JCMOVES</p>
          <div className="space-y-2">
            {[
              { icon: Briefcase, label: "Worker bonuses & job rewards", color: "text-yellow-400" },
              { icon: TrendingUp, label: "Reward boosts and loyalty perks", color: "text-purple-400" },
              { icon: ShoppingBag, label: "Community marketplace", color: "text-green-400" },
              { icon: Zap, label: "Service discounts (coming soon)", color: "text-orange-400" },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center gap-3">
                <CheckCircle2 className={`h-4 w-4 ${color} flex-shrink-0`} />
                <p className="text-sm text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
