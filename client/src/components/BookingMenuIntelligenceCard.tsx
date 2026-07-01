import { Megaphone } from "lucide-react";
import { extractBookingMenuIntelligence } from "@/lib/booking-menu-intelligence";

type BookingMenuIntelligenceCardProps = {
  quoteSnapshot: unknown;
  fallbackServiceLabel?: string;
  audience?: "company" | "worker" | "customer";
  className?: string;
};

function titleForAudience(audience: BookingMenuIntelligenceCardProps["audience"]) {
  if (audience === "worker") return "Work path";
  if (audience === "customer") return "Request path";
  return "Menu intelligence";
}

export function BookingMenuIntelligenceCard({
  quoteSnapshot,
  fallbackServiceLabel,
  audience = "company",
  className = "",
}: BookingMenuIntelligenceCardProps) {
  const snapshot = extractBookingMenuIntelligence(quoteSnapshot, fallbackServiceLabel);
  if (!snapshot) return null;

  const estimateLabel = [snapshot.range, snapshot.unit].filter(Boolean).join(" / ");
  const menuLabel = [snapshot.category, snapshot.taskId].filter(Boolean).join(" - ");

  return (
    <div className={`scroll-mt-4 rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-200">
            <Megaphone className="h-3.5 w-3.5" /> {titleForAudience(audience)}
          </p>
          <p className="mt-1 text-sm font-bold text-white">{snapshot.serviceLabel}</p>
        </div>
        {menuLabel && (
          <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-100">
            {menuLabel}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3 text-sm">
        {estimateLabel && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estimate row</p>
            <p className="mt-0.5 font-semibold text-cyan-100">{estimateLabel}</p>
          </div>
        )}
        {snapshot.sourceSignal && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Source pattern</p>
            <p className="mt-0.5 leading-5 text-slate-200">{snapshot.sourceSignal}</p>
          </div>
        )}
        {snapshot.operationsSignal && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ops check</p>
            <p className="mt-0.5 leading-5 text-slate-200">{snapshot.operationsSignal}</p>
          </div>
        )}
        {snapshot.customerNeeds.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Customer asks</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snapshot.customerNeeds.map((need) => (
                <span key={need} className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                  {need}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
