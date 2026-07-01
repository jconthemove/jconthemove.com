import {
  BadgeDollarSign,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import {
  MARKETPLACE_ACTION_TASKS,
  MARKETPLACE_SOURCE_FLOW_MATRIX,
  MARKETPLACE_SOURCE_READINESS,
  type MarketplaceActionRail,
  type MarketplaceSourceFlow,
  type MarketplaceSourceOperationalReadiness,
  type MarketplaceSourceReadinessLevel,
} from "@shared/marketplaceShapes";

type MarketplaceSourceReadinessBoardProps = {
  className?: string;
  compact?: boolean;
  limit?: number;
};

const readinessClasses: Record<MarketplaceSourceReadinessLevel, string> = {
  ready: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  watch: "border-blue-400/30 bg-blue-500/10 text-blue-200",
  build: "border-orange-400/30 bg-orange-500/10 text-orange-200",
};

const readinessIcons: Record<MarketplaceSourceReadinessLevel, typeof ClipboardCheck> = {
  ready: CheckCircle2,
  watch: TriangleAlert,
  build: Wrench,
};

const railClasses: Record<MarketplaceActionRail, string> = {
  customer: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  bronze: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  silver: "border-slate-300/30 bg-slate-400/10 text-slate-200",
  gold: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200",
  platinum: "border-purple-400/30 bg-purple-500/10 text-purple-200",
};

const flowById = new Map(MARKETPLACE_SOURCE_FLOW_MATRIX.map((flow) => [flow.id, flow]));

function visibleRows(limit?: number) {
  const rows = MARKETPLACE_SOURCE_READINESS
    .map((readiness) => {
      const flow = flowById.get(readiness.sourceFlowId);
      return flow ? { readiness, flow } : null;
    })
    .filter((row): row is { readiness: MarketplaceSourceOperationalReadiness; flow: MarketplaceSourceFlow } =>
      Boolean(row),
    );

  return typeof limit === "number" ? rows.slice(0, Math.max(0, limit)) : rows;
}

function sourceTasks(flowId: string) {
  return MARKETPLACE_ACTION_TASKS.filter((task) => task.flowIds.includes(flowId));
}

function bonusTotal(flowId: string) {
  return sourceTasks(flowId).reduce((total, task) => total + Math.max(0, task.bonusJcMoves || 0), 0);
}

function readinessLabel(value: MarketplaceSourceReadinessLevel) {
  if (value === "ready") return "Ready";
  if (value === "watch") return "Watch";
  return "Build";
}

export default function MarketplaceSourceReadinessBoard({
  className = "",
  compact = false,
  limit,
}: MarketplaceSourceReadinessBoardProps) {
  const rows = visibleRows(limit);
  if (rows.length === 0) return null;

  const ready = rows.filter((row) => row.readiness.readiness === "ready").length;
  const watch = rows.filter((row) => row.readiness.readiness === "watch").length;
  const build = rows.filter((row) => row.readiness.readiness === "build").length;

  return (
    <section className={`rounded-xl border border-violet-400/20 bg-violet-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-300">
            <Sparkles className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Source Readiness</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">What each borrowed idea needs before publish</h2>
          {!compact && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
              This keeps the outside-source inspiration practical: owner rail, next action, publish proof, automation
              gate, and the JCMOVES close for every source flow.
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Score label="Ready" value={String(ready)} />
          <Score label="Watch" value={String(watch)} />
          <Score label="Build" value={String(build)} />
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
        {rows.map(({ readiness, flow }) => (
          <ReadinessCard key={readiness.sourceFlowId} readiness={readiness} flow={flow} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function ReadinessCard({
  readiness,
  flow,
  compact,
}: {
  readiness: MarketplaceSourceOperationalReadiness;
  flow: MarketplaceSourceFlow;
  compact: boolean;
}) {
  const ReadyIcon = readinessIcons[readiness.readiness];
  const tasks = sourceTasks(flow.id);
  const totalBonus = bonusTotal(flow.id);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/65 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-white">{flow.source}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200">{flow.category}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${railClasses[readiness.ownerRail]}`}>
            {readiness.ownerRail}
          </span>
          <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${readinessClasses[readiness.readiness]}`}>
            <ReadyIcon className="h-3 w-3" />
            {readinessLabel(readiness.readiness)}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-300">{readiness.launchQuestion}</p>

      <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        <MiniFact icon={ClipboardCheck} label="Next Action" value={readiness.nextAction} />
        <MiniFact icon={CheckCircle2} label="Publish Proof" value={readiness.publishProof} />
        {!compact && <MiniFact icon={ShieldCheck} label="Automation Gate" value={readiness.automationGate} />}
        {!compact && <MiniFact icon={BadgeDollarSign} label="Reward Close" value={readiness.rewardClose} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
          <Users className="h-3 w-3 text-violet-300" />
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </span>
        {totalBonus > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-200">
            <Coins className="h-3 w-3" />
            {totalBonus.toLocaleString()} JCMOVES mapped
          </span>
        )}
        {flow.flywheelStages.map((stageId) => (
          <span key={stageId} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">
            {stageId}
          </span>
        ))}
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-violet-400/20 bg-slate-950/60 px-3 py-2">
      <p className="text-sm font-black text-white">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200">{label}</p>
    </div>
  );
}

function MiniFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/65 p-2.5">
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <Icon className="h-3 w-3 text-violet-300" />
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
    </div>
  );
}
