import { cn } from "@/lib/utils";
import { LOYALTY_TIERS, type LoyaltyTierKey } from "@/lib/loyalty";

interface LevelBadgeProps {
  tier: LoyaltyTierKey;
  size?: "xs" | "sm" | "md";
  showEmoji?: boolean;
  className?: string;
}

export function LevelBadge({ tier, size = "sm", showEmoji = true, className }: LevelBadgeProps) {
  const config = LOYALTY_TIERS[tier] ?? LOYALTY_TIERS.bronze;
  const sizeClasses = {
    xs: "text-[9px] px-1.5 py-0.5",
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bold rounded-full border",
        config.color,
        config.border,
        config.bg,
        sizeClasses[size],
        className
      )}
    >
      {showEmoji && <span>{config.emoji}</span>}
      {config.label}
    </span>
  );
}
