import {
  BadgeDollarSign,
  CheckCircle2,
  ClipboardList,
  Coins,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MARKETPLACE_ACTION_TASKS,
  getMarketplaceSourceFlowsForContext,
  getMarketplaceSourceFlowsForActionTask,
  type MarketplaceActionPhase,
  type MarketplaceActionRail,
  type MarketplaceActionTask,
  type MarketplaceRequestShapeId,
} from "@shared/marketplaceShapes";
import { resolveMarketplaceShape } from "@/components/MarketplaceShapeBadge";

type PhaseFilter = MarketplaceActionPhase | "all";

type MarketplaceTaskSplitProps = {
  rails?: MarketplaceActionRail[];
  phase?: PhaseFilter;
  shapeId?: string | null;
  serviceCode?: string | null;
  serviceLabel?: string | null;
  source?: string | null;
  limitPerRail?: number;
  compact?: boolean;
  className?: string;
};

type TaskContext = {
  shapeId: MarketplaceRequestShapeId | null;
  flowIds: Set<string>;
  label: string | null;
};

const phaseOrder: MarketplaceActionPhase[] = ["start", "progress", "finish"];

const phaseLabels: Record<MarketplaceActionPhase, string> = {
  start: "Start",
  progress: "Progress",
  finish: "Finish",
};

const phaseIcons: Record<MarketplaceActionPhase, typeof ClipboardList> = {
  start: ClipboardList,
  progress: BadgeDollarSign,
  finish: CheckCircle2,
};

const railOrder: MarketplaceActionRail[] = ["bronze", "silver", "gold", "platinum"];

const railMeta: Record<MarketplaceActionRail, {
  label: string;
  role: string;
  action: string;
  className: string;
}> = {
  customer: {
    label: "Customer",
    role: "Request path",
    action: "Answer the next simple question.",
    className: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  },
  bronze: {
    label: "Bronze",
    role: "Capture + advertise",
    action: "Create tracked demand and save real requests.",
    className: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  },
  silver: {
    label: "Silver",
    role: "Build quote cards",
    action: "Turn raw requests into priced, schedulable cards.",
    className: "border-slate-300/30 bg-slate-400/10 text-slate-200",
  },
  gold: {
    label: "Gold",
    role: "Approve + recover",
    action: "Confirm quote quality and recover reviews/rebooks.",
    className: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200",
  },
  platinum: {
    label: "Platinum",
    role: "Dispatch + payout",
    action: "Protect schedule, collection, profit, and payout closeout.",
    className: "border-purple-400/30 bg-purple-500/10 text-purple-200",
  },
};

function selectedRails(rails?: MarketplaceActionRail[]) {
  const set = new Set(rails && rails.length > 0 ? rails : railOrder);
  return railOrder.filter((rail) => set.has(rail));
}

function buildTaskContext({
  shapeId,
  serviceCode,
  serviceLabel,
  source,
}: Pick<MarketplaceTaskSplitProps, "shapeId" | "serviceCode" | "serviceLabel" | "source">): TaskContext {
  const hasContext = Boolean(shapeId || serviceCode || serviceLabel || source);
  if (!hasContext) return { shapeId: null, flowIds: new Set(), label: null };

  const shape = resolveMarketplaceShape({ shapeId, serviceCode, serviceLabel });
  const flows = getMarketplaceSourceFlowsForContext({
    source,
    shapeId,
    serviceCode,
    serviceLabel,
    limit: 4,
  });
  const primaryFlow = flows[0];

  return {
    shapeId: shape.id,
    flowIds: new Set(flows.map((flow) => flow.id)),
    label: primaryFlow ? `${shape.shape} / ${primaryFlow.source}` : shape.shape,
  };
}

function visibleTasks(
  rail: MarketplaceActionRail,
  phase: PhaseFilter,
  context: TaskContext,
  limitPerRail?: number,
) {
  return MARKETPLACE_ACTION_TASKS
    .filter((task) => {
      const shapeMatch = !context.shapeId || task.shapeIds.includes(context.shapeId);
      return task.rail === rail && shapeMatch && (phase === "all" || task.phase === phase);
    })
    .sort((a, b) => {
      if (context.flowIds.size > 0) {
        const aFlowScore = a.flowIds.some((flowId) => context.flowIds.has(flowId)) ? 1 : 0;
        const bFlowScore = b.flowIds.some((flowId) => context.flowIds.has(flowId)) ? 1 : 0;
        if (aFlowScore !== bFlowScore) return bFlowScore - aFlowScore;
      }
      const phaseScore = phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase);
      if (phaseScore !== 0) return phaseScore;
      return b.bonusJcMoves - a.bonusJcMoves;
    })
    .slice(0, typeof limitPerRail === "number" ? Math.max(0, limitPerRail) : undefined);
}

function totalBonus(tasks: MarketplaceActionTask[]) {
  return tasks.reduce((sum, task) => sum + Math.max(0, task.bonusJcMoves || 0), 0);
}

function phaseSummary(tasks: MarketplaceActionTask[]) {
  return phaseOrder
    .map((phase) => ({
      phase,
      count: tasks.filter((task) => task.phase === phase).length,
    }))
    .filter((item) => item.count > 0);
}

export default function MarketplaceTaskSplit({
  rails,
  phase = "all",
  shapeId,
  serviceCode,
  serviceLabel,
  source,
  limitPerRail,
  compact = false,
  className = "",
}: MarketplaceTaskSplitProps) {
  const context = buildTaskContext({ shapeId, serviceCode, serviceLabel, source });
  const lanes = selectedRails(rails)
    .map((rail) => ({ rail, tasks: visibleTasks(rail, phase, context, limitPerRail) }))
    .filter((lane) => lane.tasks.length > 0);

  if (lanes.length === 0) return null;

  return (
    <section className={`rounded-xl border border-orange-400/20 bg-orange-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-orange-300">
            <Sparkles className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Task Split</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">Authority rails: simple work, clear bonuses</h2>
          {!compact && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
              Bronze creates demand, Silver shapes the quote, Gold approves the path, and Platinum protects dispatch,
              collection, payout, and company profit.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-orange-400/25 bg-slate-950/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-200">
          <Users className="h-3.5 w-3.5" />
          {context.label || (phase === "all" ? "1-2-3" : phaseLabels[phase])}
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "xl:grid-cols-4"}`}>
        {lanes.map(({ rail, tasks }) => (
          <RailLane key={rail} rail={rail} tasks={tasks} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function RailLane({
  rail,
  tasks,
  compact,
}: {
  rail: MarketplaceActionRail;
  tasks: MarketplaceActionTask[];
  compact: boolean;
}) {
  const meta = railMeta[rail];
  const bonus = totalBonus(tasks);
  const summaries = phaseSummary(tasks);
  const shownTasks = compact ? tasks.slice(0, 2) : tasks;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.className}`}>
            {meta.label}
          </span>
          <p className="mt-2 text-sm font-black text-white">{meta.role}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">{meta.action}</p>
        </div>
        {bonus > 0 && (
          <div className="flex shrink-0 items-center gap-1 text-orange-300">
            <Coins className="h-3.5 w-3.5" />
            <span className="text-xs font-black">{bonus.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {summaries.map(({ phase, count }) => {
          const Icon = phaseIcons[phase];
          return (
            <span
              key={phase}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300"
            >
              <Icon className="h-3 w-3 text-orange-300" />
              {phaseLabels[phase]} {count}
            </span>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        {shownTasks.map((task) => (
          <SplitTask key={task.id} task={task} compact={compact} />
        ))}
        {compact && tasks.length > shownTasks.length && (
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            +{tasks.length - shownTasks.length} more task{tasks.length - shownTasks.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

function SplitTask({ task, compact }: { task: MarketplaceActionTask; compact: boolean }) {
  const Icon = phaseIcons[task.phase];
  const sourceFlows = getMarketplaceSourceFlowsForActionTask(task, compact ? 2 : 4);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Icon className="h-3 w-3 text-orange-300" />
            {phaseLabels[task.phase]}
          </p>
          <p className="mt-1 text-xs font-black text-white">{task.title}</p>
        </div>
        {task.bonusJcMoves > 0 && (
          <span className="shrink-0 rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-black text-orange-200">
            +{task.bonusJcMoves}
          </span>
        )}
      </div>
      {sourceFlows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sourceFlows.map((flow) => (
            <span
              key={flow.id}
              className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-200"
            >
              {flow.source}
            </span>
          ))}
        </div>
      )}
      {!compact && (
        <>
          <p className="mt-2 text-[11px] leading-4 text-slate-300">{task.action}</p>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
            {task.companyGuardrail}
          </p>
        </>
      )}
      {compact && (
        <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
          <Megaphone className="mt-0.5 h-3 w-3 shrink-0 text-orange-300" />
          {task.proof}
        </p>
      )}
    </div>
  );
}
