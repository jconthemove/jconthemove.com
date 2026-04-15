import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Coins, Flame } from "lucide-react";
import { LevelBadge } from "./LevelBadge";
import { LOYALTY_TIERS, getTierProgress, getNextTier, formatTokens, type LoyaltyTierKey } from "@/lib/loyalty";
import { cn } from "@/lib/utils";

interface UserStatusBarProps {
  className?: string;
  variant?: "dark" | "light";
}

export function UserStatusBar({ className, variant = "dark" }: UserStatusBarProps) {
  const { user } = useAuth();

  const { data: wallet } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    staleTime: 30000,
  });

  const rawTier = (user as any)?.loyaltyTier || "bronze";
  const tier = (rawTier in LOYALTY_TIERS ? rawTier : "bronze") as LoyaltyTierKey;
  const tierPoints = parseInt((user as any)?.tierPoints || "0", 10);
  const tierConfig = LOYALTY_TIERS[tier];
  const nextTierKey = getNextTier(tier);
  const nextTierConfig = nextTierKey ? LOYALTY_TIERS[nextTierKey] : null;
  const progress = getTierProgress(tierPoints, tier);
  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");

  const isDark = variant === "dark";

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 flex flex-col gap-2",
        isDark
          ? "bg-zinc-900/80 border-zinc-800"
          : "bg-white/5 border-white/10",
        className
      )}
    >
      {/* Top row: balance + tier badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-orange-400 flex-shrink-0" />
          <span className={cn("text-sm font-bold", isDark ? "text-white" : "text-white")}>
            {formatTokens(tokenBalance)}
          </span>
          <span className={cn("text-[10px] font-medium", isDark ? "text-zinc-500" : "text-white/50")}>
            JCMOVES
          </span>
        </div>
        <LevelBadge tier={tier} size="sm" />
      </div>

      {/* Progress bar toward next tier */}
      {nextTierConfig && (
        <div className="space-y-1">
          <div className="w-full rounded-full h-1.5 bg-zinc-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", tierConfig.bg.replace("/10", ""))}
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
        <p className="text-[10px] text-purple-400 font-medium">👑 Platinum VIP — max tier</p>
      )}
    </div>
  );
}
