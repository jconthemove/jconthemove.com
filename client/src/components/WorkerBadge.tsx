import { cn } from "@/lib/utils";
import { WORKER_LEVELS, getWorkerLevel, type WorkerLevelKey } from "@/lib/loyalty";

interface WorkerBadgeProps {
  level?: WorkerLevelKey;
  jobCount?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function WorkerBadge({ level, jobCount, size = "sm", className }: WorkerBadgeProps) {
  const resolvedLevel: WorkerLevelKey = level ?? getWorkerLevel(jobCount ?? 0);
  const config = WORKER_LEVELS[resolvedLevel];

  const sizeClasses = {
    xs: "text-[9px] px-1.5 py-0.5 gap-0.5",
    sm: "text-[10px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        config.bg,
        config.border,
        config.color,
        sizeClasses,
        className
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
