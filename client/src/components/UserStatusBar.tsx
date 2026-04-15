import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Coins, Flame } from "lucide-react";
import { LevelBadge } from "./LevelBadge";
import { WorkerBadge } from "./WorkerBadge";
import { LOYALTY_TIERS, getTierProgress, getNextTier, formatTokens, getWorkerLevel, type LoyaltyTierKey } from "@/lib/loyalty";
import { cn } from "@/lib/utils";

interface UserStatusBarProps {
  className?: string;
  variant?: "dark" | "light";
  jobCount?: number;
  /** Optional injected data — avoids duplicate queries when parent already fetched */
  injectedTokenBalance?: number;
  injectedStreak?: number;
}

interface WalletData {
  tokenBalance: string;
}

interface MiningStatusData {
  streakCount: number;
}

function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target <= 0) { setValue(0); return; }
    startRef.current = null;
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

export function UserStatusBar({
  className,
  variant = "dark",
  jobCount,
  injectedTokenBalance,
  injectedStreak,
}: UserStatusBarProps) {
  const { user } = useAuth();

  const { data: wallet } = useQuery<WalletData>({
    queryKey: ["/api/rewards/wallet"],
    staleTime: 30000,
    enabled: !!user && injectedTokenBalance === undefined,
  });

  const { data: miningStatus } = useQuery<MiningStatusData>({
    queryKey: ["/api/mining/status"],
    staleTime: 60000,
    enabled: !!user && injectedStreak === undefined,
  });

  const rawTier = user?.loyaltyTier ?? "bronze";
  const tier = (rawTier in LOYALTY_TIERS ? rawTier : "bronze") as LoyaltyTierKey;
  const tierPoints = user?.tierPoints ?? 0;
  const tierConfig = LOYALTY_TIERS[tier];
  const nextTierKey = getNextTier(tier);
  const nextTierConfig = nextTierKey ? LOYALTY_TIERS[nextTierKey] : null;
  const progress = getTierProgress(tierPoints, tier);

  const tokenBalance = injectedTokenBalance ?? parseFloat(wallet?.tokenBalance ?? "0");
  const streak = injectedStreak ?? miningStatus?.streakCount ?? 0;
  const isEmployee = user?.role === "employee";
  const workerLevel = isEmployee ? getWorkerLevel(jobCount ?? 0) : null;
  const animatedBalance = useCountUp(tokenBalance);

  const isDark = variant === "dark";

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 flex flex-col gap-2",
        isDark ? "bg-zinc-900/80 border-zinc-800" : "bg-white/5 border-white/10",
        className
      )}
    >
      {/* Top row: balance + streak + badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Coins className="h-4 w-4 text-orange-400 flex-shrink-0" />
            <span className={cn("text-sm font-bold tabular-nums", isDark ? "text-white" : "text-white")}>
              {formatTokens(animatedBalance)}
            </span>
            <span className={cn("text-[10px] font-medium", isDark ? "text-zinc-500" : "text-white/50")}>
              JCMOVES
            </span>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-bold text-orange-300">{streak}d</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {workerLevel && <WorkerBadge level={workerLevel} size="xs" />}
          <LevelBadge tier={tier} size="sm" />
        </div>
      </div>

      {/* Progress bar toward next tier */}
      {nextTierConfig && (
        <div className="space-y-1">
          <div className={cn("w-full rounded-full h-1.5 overflow-hidden", isDark ? "bg-zinc-800" : "bg-white/10")}>
            <div
              className={cn("h-full rounded-full transition-all duration-500", tierConfig.color.replace("text-", "bg-"))}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className={cn("text-[9px]", isDark ? "text-zinc-500" : "text-white/40")}>
              {tierPoints.toLocaleString()} pts
            </span>
            <span className={cn("text-[9px]", isDark ? "text-zinc-500" : "text-white/40")}>
              {nextTierConfig.emoji} {nextTierConfig.label} at {nextTierConfig.minPoints.toLocaleString()} pts
            </span>
          </div>
        </div>
      )}
      {!nextTierConfig && (
        <p className="text-[10px] text-purple-400 font-medium">👑 Platinum VIP — max tier reached</p>
      )}
    </div>
  );
}
