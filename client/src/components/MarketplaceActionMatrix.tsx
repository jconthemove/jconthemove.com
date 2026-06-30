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
  type MarketplaceActionPhase,
  type MarketplaceActionRail,
  type MarketplaceActionTask,
  type MarketplaceRequestShapeId,
} from "@shared/marketplaceShapes";
import { resolveMarketplaceShape } from "@/components/MarketplaceShapeBadge";

type RailFilter = MarketplaceActionRail | "worker" | "all";
type PhaseFilter = MarketplaceActionPhase | "all";

type MarketplaceActionMatrixProps = {
  rail?: RailFilter;
  phase?: PhaseFilter;
  shapeId?: string | null;
  serviceCode?: string | null;
  serviceLabel?: string | null;
  source?: string | null;
  compact?: boolean;
  limit?: number;
  className?: string;
};

const phaseLabels: Record<MarketplaceActionPhase, string> = {
  start: "Start",
  progress: "Progress",
  finish: "Finish",
};

const phaseGoals: Record<MarketplaceActionPhase, string> = {
  start: "Create or capture the card.",
  progress: "Quote, approve, assign, and prepare payment.",
  finish: "Complete, collect, reward, and recover the next job.",
};

const phaseIcons: Record<MarketplaceActionPhase, typeof ClipboardList> = {
  start: ClipboardList,
  progress: BadgeDollarSign,
  finish: CheckCircle2,
};

const railClasses: Record<MarketplaceActionRail, string> = {
  customer: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  bronze: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  silver: "border-slate-300/30 bg-slate-400/10 text-slate-200",
  gold: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200",
  platinum: "border-purple-400/30 bg-purple-500/10 text-purple-200",
};

const phaseOrder: MarketplaceActionPhase[] = ["start", "progress", "finish"];
const workerRails: MarketplaceActionRail[] = ["bronze", "silver", "gold"];

function matchesRail(task: MarketplaceActionTask, rail: RailFilter) {
  if (rail === "all") return true;
  if (rail === "worker") return workerRails.includes(task.rail);
  return task.rail === rail;
}

function visibleTasks({
  rail,
  phase,
  shapeId,
  serviceCode,
  serviceLabel,
  source,
  limit,
}: {
  rail: RailFilter;
  phase: PhaseFilter;
  shapeId?: string | null;
  serviceCode?: string | null;
  serviceLabel?: string | null;
  source?: string | null;
  limit?: number;
}) {
  const hasContext = Boolean(shapeId || serviceCode || serviceLabel || source);
  const shape = hasContext ? resolveMarketplaceShape({ shapeId, serviceCode, serviceLabel }) : null;
  const flows = hasContext
    ? getMarketplaceSourceFlowsForContext({
      source,
      shapeId,
      serviceCode,
      serviceLabel,
      limit: 4,
    })
    : [];
  const flowIds = new Set(flows.map((flow) => flow.id));

  const tasks = MARKETPLACE_ACTION_TASKS.filter((task) => {
    const phaseMatch = phase === "all" || task.phase === phase;
    const railMatch = matchesRail(task, rail);
    const shapeMatch = !shape || task.shapeIds.includes(shape.id as MarketplaceRequestShapeId);
    return phaseMatch && railMatch && shapeMatch;
  }).sort((a, b) => {
    if (flowIds.size === 0) return 0;
    const aScore = a.flowIds.some((flowId) => flowIds.has(flowId)) ? 1 : 0;
    const bScore = b.flowIds.some((flowId) => flowIds.has(flowId)) ? 1 : 0;
    return bScore - aScore;
  });

  return typeof limit === "number" ? tasks.slice(0, limit) : tasks;
}

function phaseGroups(tasks: MarketplaceActionTask[]) {
  return phaseOrder
    .map((phase) => ({
      phase,
      tasks: tasks.filter((task) => task.phase === phase),
    }))
    .filter((group) => group.tasks.length > 0);
}

export default function MarketplaceActionMatrix({
  rail = "all",
  phase = "all",
  shapeId,
  serviceCode,
  serviceLabel,
  source,
  compact = false,
  limit,
  className = "",
}: MarketplaceActionMatrixProps) {
  const tasks = visibleTasks({ rail, phase, shapeId, serviceCode, serviceLabel, source, limit });
  const groups = phaseGroups(tasks);

  if (tasks.length === 0) return null;

  return (
    <section className={`rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-blue-300">
            <Sparkles className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Marketplace Rails</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">Who does what next</h2>
          {!compact && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
              Simple task lanes connect the customer request, worker marketing/quote work, admin approval, payment,
              payout, and JCMOVES rewards.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-blue-400/25 bg-slate-950/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-200">
          <Users className="h-3.5 w-3.5" />
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "xl:grid-cols-3"}`}>
        {groups.map(({ phase, tasks: phaseTasks }) => {
          const PhaseIcon = phaseIcons[phase];
          return (
            <div key={phase} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <PhaseIcon className="h-4 w-4 text-blue-300" />
                    <p className="text-sm font-black text-white">{phaseLabels[phase]}</p>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{phaseGoals[phase]}</p>
                </div>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                  {phaseTasks.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {phaseTasks.map((task) => (
                  <ActionTaskCard key={task.id} task={task} compact={compact} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionTaskCard({ task, compact }: { task: MarketplaceActionTask; compact: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${railClasses[task.rail]}`}>
              {task.rail}
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">
              {task.side}
            </span>
          </div>
          <p className="mt-2 text-sm font-black text-white">{task.title}</p>
        </div>
        {task.bonusJcMoves > 0 && (
          <div className="flex shrink-0 items-center gap-1 text-orange-300">
            <Coins className="h-3.5 w-3.5" />
            <span className="text-xs font-black">{task.bonusJcMoves.toLocaleString()}</span>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-300">{task.action}</p>

      {!compact && (
        <div className="mt-3 grid gap-2">
          <MiniFact icon={ClipboardList} label="Proof" value={task.proof} />
          <MiniFact icon={Megaphone} label="Patterns" value={task.sourcePatterns} />
          <MiniFact icon={ShieldCheck} label="Guardrail" value={task.companyGuardrail} />
        </div>
      )}
    </div>
  );
}

function MiniFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/55 p-2">
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <Icon className="h-3 w-3 text-blue-300" />
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
    </div>
  );
}
