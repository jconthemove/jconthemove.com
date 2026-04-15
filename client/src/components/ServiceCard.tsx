import { useState } from "react";
import { CheckCircle2, Users, Clock, Zap } from "lucide-react";
import { type ServiceConfig } from "@/lib/services";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  service: ServiceConfig;
  selected?: boolean;
  onClick?: () => void;
  badge?: string;
  badgeColor?: "green" | "orange" | "zinc" | "blue";
  className?: string;
}

const GLOW_COLORS: Record<string, string> = {
  "shadow-blue-500/40":    "0 0 20px rgba(59,130,246,0.4)",
  "shadow-orange-500/40":  "0 0 20px rgba(249,115,22,0.4)",
  "shadow-cyan-500/40":    "0 0 20px rgba(6,182,212,0.4)",
  "shadow-amber-500/40":   "0 0 20px rgba(245,158,11,0.4)",
  "shadow-teal-500/40":    "0 0 20px rgba(20,184,166,0.4)",
  "shadow-rose-500/40":    "0 0 20px rgba(244,63,94,0.4)",
  "shadow-green-500/40":   "0 0 20px rgba(34,197,94,0.4)",
  "shadow-sky-500/40":     "0 0 20px rgba(14,165,233,0.4)",
  "shadow-emerald-500/40": "0 0 20px rgba(16,185,129,0.4)",
  "shadow-violet-500/40":  "0 0 20px rgba(139,92,246,0.4)",
  "shadow-purple-500/40":  "0 0 20px rgba(168,85,247,0.4)",
  "shadow-red-500/40":     "0 0 20px rgba(239,68,68,0.4)",
  "shadow-stone-500/40":   "0 0 20px rgba(120,113,108,0.4)",
  "shadow-yellow-500/40":  "0 0 20px rgba(234,179,8,0.4)",
};

const RING_COLORS: Record<string, string> = {
  "ring-blue-500":    "#3b82f6",
  "ring-orange-500":  "#f97316",
  "ring-cyan-500":    "#06b6d4",
  "ring-amber-500":   "#f59e0b",
  "ring-teal-500":    "#14b8a6",
  "ring-rose-500":    "#f43f5e",
  "ring-green-500":   "#22c55e",
  "ring-sky-500":     "#0ea5e9",
  "ring-emerald-500": "#10b981",
  "ring-violet-500":  "#8b5cf6",
  "ring-purple-500":  "#a855f7",
  "ring-red-500":     "#ef4444",
  "ring-stone-500":   "#78716c",
  "ring-yellow-500":  "#eab308",
};

const BADGE_STYLES = {
  green:  "bg-emerald-600 text-white",
  orange: "bg-orange-500 text-white",
  zinc:   "bg-zinc-700 text-zinc-300",
  blue:   "bg-blue-600 text-white",
};

export default function ServiceCard({
  service,
  selected = false,
  onClick,
  badge,
  badgeColor = "zinc",
  className,
}: ServiceCardProps) {
  const [hovered, setHovered] = useState(false);

  const {
    label,
    tags,
    icon: Icon,
    headerGradient,
    iconBg,
    iconColor,
    glowColor,
    ringColor,
    crew,
    duration,
    earn,
    description,
    status,
  } = service;

  const glowShadow = GLOW_COLORS[glowColor] ?? "0 0 20px rgba(100,100,200,0.3)";
  const ringHex = RING_COLORS[ringColor] ?? "#6366f1";
  const isComingSoon = status === "coming-soon" && !badge;

  const boxShadow = selected
    ? `0 0 0 2px ${ringHex}, ${glowShadow}`
    : hovered && onClick
    ? `0 4px 24px rgba(0,0,0,0.4), ${glowShadow}`
    : "0 1px 4px rgba(0,0,0,0.2)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative flex flex-col w-full overflow-hidden rounded-2xl border text-left",
        "focus:outline-none transition-transform duration-200",
        selected
          ? "border-transparent scale-[1.03] bg-slate-800"
          : onClick
          ? "border-slate-700/60 bg-slate-800/70 hover:-translate-y-1 active:scale-[0.98] cursor-pointer"
          : "border-slate-700/60 bg-slate-800/70 cursor-default",
        className,
      )}
      style={{
        aspectRatio: "3/4",
        boxShadow,
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
      }}
    >
      {/* ── Selected checkmark badge ── */}
      {selected && (
        <span className="absolute top-2 right-2 z-20">
          <CheckCircle2 className="h-5 w-5 text-white drop-shadow-md" />
        </span>
      )}

      {/* ── Status / promo badge ── */}
      {(badge || isComingSoon) && !selected && (
        <span
          className={cn(
            "absolute top-2 left-2 z-20 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap",
            badge ? BADGE_STYLES[badgeColor] : "bg-zinc-700 text-zinc-300",
          )}
        >
          {badge ?? "Coming Soon"}
        </span>
      )}

      {/* ── Color header band ── */}
      <div className={cn("h-2 w-full bg-gradient-to-r flex-shrink-0", headerGradient)} />

      {/* ── Icon art panel ── */}
      <div
        className={cn(
          "flex items-center justify-center flex-shrink-0 w-full py-4 transition-colors duration-200",
          iconBg,
        )}
      >
        <Icon
          className={cn(
            "h-10 w-10 transition-transform duration-200 group-hover:scale-110",
            selected ? "text-white" : iconColor,
          )}
        />
      </div>

      {/* ── Name + type tag strip ── */}
      <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
        <p className="font-bold text-sm leading-tight text-white">
          {label}
        </p>
        <p className={cn("text-[10px] mt-0.5 leading-snug", selected ? "text-white/70" : "text-slate-400")}>
          {tags.join(" · ")}
        </p>
      </div>

      {/* ── Stat block ── */}
      <div className="px-3 py-2 flex flex-col gap-1 flex-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
          <Users className={cn("h-3 w-3 flex-shrink-0", selected ? "text-white/60" : "text-slate-500")} />
          <span className={cn("text-[10px] font-bold leading-none truncate", selected ? "text-white" : "text-slate-300")}>
            {crew[0]}–{crew[1]}
          </span>
          <span className={cn("text-[9px] leading-none flex-shrink-0", selected ? "text-white/50" : "text-slate-600")}>
            crew
          </span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
          <Clock className={cn("h-3 w-3 flex-shrink-0", selected ? "text-white/60" : "text-slate-500")} />
          <span className={cn("text-[10px] font-bold leading-none truncate", selected ? "text-white" : "text-slate-300")}>
            {duration[0]}–{duration[1]} hrs
          </span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
          <Zap className={cn("h-3 w-3 flex-shrink-0", selected ? "text-white/60" : "text-slate-500")} />
          <span className={cn("text-[10px] font-bold leading-none truncate", selected ? "text-white" : "text-slate-300")}>
            {earn[0]}–{earn[1]}
          </span>
          <span className={cn("text-[9px] leading-none flex-shrink-0", selected ? "text-white/50" : "text-slate-600")}>
            pts
          </span>
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        className={cn(
          "px-3 py-2 text-[9px] leading-snug border-t flex-shrink-0",
          selected
            ? "border-white/10 text-white/60"
            : "border-slate-700/40 text-slate-500",
        )}
      >
        {description}
      </div>
    </button>
  );
}
