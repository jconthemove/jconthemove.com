import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardList,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MARKETPLACE_SOURCE_FLOW_MATRIX,
  getMarketplaceSourceFlowsForContext,
  type MarketplaceFunctionalIdeaStatus,
  type MarketplaceSourceFlow,
} from "@shared/marketplaceShapes";

type MarketplaceSourceActionDeckProps = {
  source?: string | null;
  shapeId?: string | null;
  serviceCode?: string | null;
  serviceLabel?: string | null;
  audience?: "customer" | "worker" | "company" | "all";
  compact?: boolean;
  limit?: number;
  title?: string;
  className?: string;
};

const statusClasses: Record<MarketplaceFunctionalIdeaStatus, string> = {
  live: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  in_progress: "border-blue-400/30 bg-blue-500/10 text-blue-200",
  next: "border-orange-400/30 bg-orange-500/10 text-orange-200",
};

function statusLabel(status: MarketplaceFunctionalIdeaStatus) {
  return status.replace(/_/g, " ");
}

function flowMove(flow: MarketplaceSourceFlow, audience: MarketplaceSourceActionDeckProps["audience"]) {
  if (audience === "customer") return [["Customer move", flow.customerMove]];
  if (audience === "worker") return [["Worker move", flow.workerMove]];
  if (audience === "company") return [["Company control", flow.companyControl]];
  return [
    ["Customer", flow.customerMove],
    ["Worker", flow.workerMove],
    ["Company", flow.companyControl],
  ];
}

function visibleFlows({
  source,
  shapeId,
  serviceCode,
  serviceLabel,
  limit,
}: Pick<MarketplaceSourceActionDeckProps, "source" | "shapeId" | "serviceCode" | "serviceLabel" | "limit">) {
  const hasContext = Boolean(source || shapeId || serviceCode || serviceLabel);
  const resolvedLimit = typeof limit === "number" ? limit : hasContext ? 3 : 6;
  const flows = hasContext
    ? getMarketplaceSourceFlowsForContext({
      source,
      shapeId,
      serviceCode,
      serviceLabel,
      limit: resolvedLimit,
    })
    : MARKETPLACE_SOURCE_FLOW_MATRIX.slice(0, resolvedLimit);

  return flows;
}

export default function MarketplaceSourceActionDeck({
  source,
  shapeId,
  serviceCode,
  serviceLabel,
  audience = "all",
  compact = false,
  limit,
  title = "Source Plays",
  className = "",
}: MarketplaceSourceActionDeckProps) {
  const flows = visibleFlows({ source, shapeId, serviceCode, serviceLabel, limit });
  if (flows.length === 0) return null;

  return (
    <section className={`rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Sparkles className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">{title}</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">Best patterns turned into JC moves</h2>
          {!compact && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
              Each source becomes a simple 1-2-3 path: start the request, progress the card, finish the payment,
              proof, review, and JCMOVES loop.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-cyan-400/25 bg-slate-950/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
          <Megaphone className="h-3.5 w-3.5" />
          {flows.length} source{flows.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
        {flows.map((flow) => (
          <SourceFlowCard key={flow.id} flow={flow} audience={audience} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function SourceFlowCard({
  flow,
  audience,
  compact,
}: {
  flow: MarketplaceSourceFlow;
  audience: MarketplaceSourceActionDeckProps["audience"];
  compact: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-white">{flow.source}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">{flow.category}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClasses[flow.status]}`}>
          {statusLabel(flow.status)}
        </span>
      </div>

      {!compact && (
        <p className="mt-3 text-xs leading-5 text-slate-400">
          <span className="font-bold text-slate-200">Borrow:</span> {flow.borrowedSignal}
        </p>
      )}

      <div className={`mt-3 grid gap-2 ${compact ? "" : "md:grid-cols-3"}`}>
        <StepFact icon={ClipboardList} label="1 Start" value={flow.start} />
        <StepFact icon={ArrowRight} label="2 Progress" value={flow.progress} />
        <StepFact icon={CheckCircle2} label="3 Finish" value={flow.finish} />
      </div>

      <div className={`mt-3 grid gap-2 ${compact || audience !== "all" ? "" : "md:grid-cols-3"}`}>
        {flowMove(flow, audience).map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <Users className="h-3 w-3 text-cyan-300" />
              {label}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
          </div>
        ))}
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "" : "md:grid-cols-3"}`}>
        <StepFact icon={ShieldCheck} label="Automation" value={flow.automationHook} />
        <StepFact icon={BadgeDollarSign} label="Reward" value={flow.rewardTrigger} />
        {!compact && <StepFact icon={Megaphone} label="Surfaces" value={flow.surfaces} />}
      </div>
    </div>
  );
}

function StepFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-cyan-400/15 bg-cyan-500/10 p-2.5">
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-200">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
    </div>
  );
}
