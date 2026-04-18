import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YardCard } from "@/lib/lawnYardData";

interface Props {
  card: YardCard;
  selected: boolean;
  onClick: () => void;
  size?: "sm" | "md";
  badge?: string;
}

export default function LawnYardCardTile({ card, selected, onClick, size = "md", badge }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`yard-card-${card.id}`}
      className={cn(
        "relative w-full text-left border rounded-2xl transition-all overflow-hidden",
        size === "sm" ? "p-3" : "p-4",
        selected
          ? card.accent || "border-lime-500/60 bg-lime-500/10"
          : "border-slate-700 bg-slate-800/60 hover:border-slate-600"
      )}
    >
      {badge && (
        <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wide bg-lime-500/20 text-lime-300 border border-lime-500/30 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      <div className="flex items-start gap-3">
        <span className={cn("flex-shrink-0", size === "sm" ? "text-2xl" : "text-3xl")}>
          {card.illustration}
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-white", size === "sm" ? "text-sm" : "text-[15px]")}>
            {card.label}
          </p>
          <p className={cn("text-slate-400 leading-snug mt-0.5", size === "sm" ? "text-xs" : "text-xs")}>
            {card.desc}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5 font-medium">{card.hint}</p>
        </div>
        {selected && (
          <CheckCircle2 className="h-4 w-4 text-lime-400 flex-shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
}
