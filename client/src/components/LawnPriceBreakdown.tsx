// Shared price-breakdown renderer used by both customer quote screen and crew brief.
// Renders the structured `pricing` object returned by the lawn-care pricing engine.

import { cn } from "@/lib/utils";

export interface LawnPricing {
  basePrice: number;
  conditionMultiplier: number;
  frequencyMultiplier: number;
  addOnTotal: number;
  travelFee: number;
  totalQuoted: number;
  bundleDiscountAmount?: number | string | null;
  bundleDiscountReason?: "bundle_intent" | "cross_service_history" | null;
  isCustomEstimate: boolean;
  recommendedCrewType: string;
  recommendedCrewSize: number;
  categoryBase?: number;
  sizeMultiplier?: number;
  sizeTier?: string;
  propertyAdjustments?: { id: string; label: string; amount: number; explain?: string }[];
  addOnDetails?: { id: string; label: string; amount: number }[];
  haulAwayFee?: number;
  estimatedMinutesMin?: number;
  estimatedMinutesMax?: number;
  explanations?: {
    size?: string;
    condition?: string;
    frequency?: string;
    crew?: string;
  };
}

interface Props {
  pricing: LawnPricing;
  serviceFrequency?: string;
  variant?: "customer" | "crew";
  className?: string;
}

export default function LawnPriceBreakdown({ pricing, serviceFrequency, variant = "customer", className }: Props) {
  if (pricing.isCustomEstimate) {
    return (
      <div className={cn("rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3", className)}>
        <p className="text-sm text-slate-300">Custom estimate — Darrell will review your property and provide pricing.</p>
      </div>
    );
  }

  const isPerVisit = serviceFrequency && serviceFrequency !== "one_time";
  const lines: { label: string; amount: number | string; subtle?: string }[] = [
    { label: "Base price", amount: `$${pricing.basePrice}`, subtle: pricing.explanations?.size },
  ];
  if (pricing.conditionMultiplier !== 1) {
    lines.push({
      label: `Condition × ${pricing.conditionMultiplier}`,
      amount: `+${Math.round((pricing.conditionMultiplier - 1) * 100)}%`,
      subtle: pricing.explanations?.condition,
    });
  }
  if (pricing.frequencyMultiplier !== 1) {
    const pct = Math.round((1 - pricing.frequencyMultiplier) * 100);
    lines.push({
      label: `Frequency discount`,
      amount: `−${pct}%`,
      subtle: pricing.explanations?.frequency,
    });
  }
  (pricing.propertyAdjustments || []).forEach((adj) => {
    lines.push({ label: adj.label, amount: `+$${adj.amount}`, subtle: adj.explain });
  });
  (pricing.addOnDetails || []).forEach((a) => {
    lines.push({ label: a.label, amount: `+$${a.amount}` });
  });
  if (pricing.travelFee > 0) {
    lines.push({ label: "Travel fee", amount: `+$${pricing.travelFee}`, subtle: "Outside our standard area" });
  }
  const bundleAmt = typeof pricing.bundleDiscountAmount === "string"
    ? parseFloat(pricing.bundleDiscountAmount)
    : (pricing.bundleDiscountAmount ?? 0);
  if (bundleAmt && bundleAmt > 0) {
    lines.push({
      label: "Bundle discount (10%, max $50)",
      amount: `−$${bundleAmt.toFixed(2)}`,
      subtle: pricing.bundleDiscountReason === "cross_service_history"
        ? "Loyalty bundle — thanks for booking another JC service in the last 90 days!"
        : "Auto-applied when you bundle services",
    });
  }

  return (
    <div className={cn("rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden", className)}>
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {variant === "crew" ? "Price Breakdown" : "Your Quote"}
        </p>
        <div className="text-right">
          <span className="text-2xl font-extrabold text-lime-400">${pricing.totalQuoted}</span>
          {isPerVisit && <span className="text-xs text-slate-400 ml-1">/ visit</span>}
        </div>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {lines.map((l, i) => (
          <div key={i}>
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-300">{l.label}</span>
              <span className="text-white font-medium">{l.amount}</span>
            </div>
            {l.subtle && <p className="text-[10px] text-slate-500 mt-0.5">{l.subtle}</p>}
          </div>
        ))}
      </div>
      {(pricing.estimatedMinutesMin || pricing.recommendedCrewSize) && (
        <div className="border-t border-slate-700/50 px-4 py-2.5 bg-slate-900/30 grid grid-cols-2 gap-3 text-xs">
          {pricing.recommendedCrewSize && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Crew</p>
              <p className="text-slate-200 font-medium">{pricing.recommendedCrewSize}-person {pricing.recommendedCrewType}</p>
            </div>
          )}
          {pricing.estimatedMinutesMin && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Time on-site</p>
              <p className="text-slate-200 font-medium">{pricing.estimatedMinutesMin}–{pricing.estimatedMinutesMax} min</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
