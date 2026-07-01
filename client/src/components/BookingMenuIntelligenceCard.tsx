import { Clock3, DollarSign, Megaphone, PackageCheck, Truck, Users } from "lucide-react";
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
  const menuLabel = [snapshot.category, snapshot.taskId].filter(Boolean).join(" - ") || snapshot.packageId || "";
  const crewHours = [
    snapshot.crew ? `${snapshot.crew} crew` : null,
    snapshot.hours ? `${snapshot.hours} hr` : null,
  ].filter(Boolean).join(" / ");

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
        {(snapshot.packageLabel || crewHours || snapshot.loadType || snapshot.truckSize || snapshot.zoneName || snapshot.quoteReviewRequired) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {snapshot.packageLabel && (
              <MiniFact icon={PackageCheck} label="Package" value={snapshot.packageLabel} />
            )}
            {crewHours && (
              <MiniFact icon={Users} label="Crew / hours" value={crewHours} />
            )}
            {(snapshot.loadType || snapshot.movingPath) && (
              <MiniFact icon={Truck} label="Job shape" value={snapshot.loadType || snapshot.movingPath || ""} />
            )}
            {snapshot.truckSize && (
              <MiniFact icon={Truck} label="Truck / access" value={snapshot.truckSize} />
            )}
            {snapshot.zoneName && (
              <MiniFact icon={DollarSign} label="Zone" value={snapshot.zoneName} />
            )}
            {snapshot.quoteReviewRequired && (
              <MiniFact icon={Clock3} label="Approval" value="Quote review before final price" tone="amber" />
            )}
          </div>
        )}
        {estimateLabel && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estimate range</p>
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

function MiniFact({
  icon: Icon,
  label,
  value,
  tone = "cyan",
}: {
  icon: typeof PackageCheck;
  label: string;
  value: string;
  tone?: "cyan" | "amber";
}) {
  return (
    <div className={`rounded-lg border p-2 ${tone === "amber" ? "border-amber-400/25 bg-amber-500/10" : "border-slate-800 bg-slate-950/60"}`}>
      <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
        <Icon className={`h-3 w-3 ${tone === "amber" ? "text-amber-300" : "text-cyan-300"}`} />
        {label}
      </p>
      <p className={`mt-1 text-[11px] font-semibold leading-4 ${tone === "amber" ? "text-amber-100" : "text-slate-200"}`}>
        {value}
      </p>
    </div>
  );
}
