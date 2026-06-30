import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Coins,
  Megaphone,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MARKETPLACE_ACTION_TASKS,
  MARKETPLACE_OPERATING_FLYWHEEL,
  MARKETPLACE_SIMPLE_SIDES,
  type MarketplaceActionPhase,
  type MarketplaceActionRail,
  type MarketplaceFlywheelStage,
  type MarketplaceSideId,
} from "@shared/marketplaceShapes";

type SideFilter = MarketplaceSideId | "all";

type MarketplaceNextStepFlowProps = {
  side?: SideFilter;
  rails?: MarketplaceActionRail[];
  compact?: boolean;
  className?: string;
};

type StepDefinition = {
  phase: MarketplaceActionPhase;
  label: string;
  promise: string;
  stageIndexes: number[];
  icon: typeof ClipboardList;
};

const steps: StepDefinition[] = [
  {
    phase: "start",
    label: "Start",
    promise: "Create demand or capture the request without losing the person.",
    stageIndexes: [0, 1, 2],
    icon: ClipboardList,
  },
  {
    phase: "progress",
    label: "Progress",
    promise: "Price, approve, assign, and keep the card moving.",
    stageIndexes: [3, 4],
    icon: Route,
  },
  {
    phase: "finish",
    label: "Finish",
    promise: "Complete, collect, reward, review, and create the next opportunity.",
    stageIndexes: [5, 6, 7],
    icon: CheckCircle2,
  },
];

const sideMeta: Record<MarketplaceSideId, {
  label: string;
  headline: string;
  color: string;
  icon: typeof Users;
}> = {
  customer: {
    label: "Customer",
    headline: "Book and track help without friction.",
    color: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200",
    icon: Users,
  },
  worker: {
    label: "Worker",
    headline: "See the next useful action and earn on proof.",
    color: "border-orange-400/25 bg-orange-500/10 text-orange-200",
    icon: Megaphone,
  },
  company: {
    label: "Company",
    headline: "Protect pricing, dispatch, payment, and profit.",
    color: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    icon: ShieldCheck,
  },
};

const phaseIcon: Record<MarketplaceActionPhase, typeof ClipboardList> = {
  start: ClipboardList,
  progress: BadgeDollarSign,
  finish: CalendarCheck,
};

const defaultRailsBySide: Record<MarketplaceSideId, MarketplaceActionRail[]> = {
  customer: ["customer"],
  worker: ["bronze", "silver", "gold"],
  company: ["platinum"],
};

function stagesForStep(step: StepDefinition) {
  return step.stageIndexes
    .map((index) => MARKETPLACE_OPERATING_FLYWHEEL[index])
    .filter(Boolean);
}

function sideAction(stage: MarketplaceFlywheelStage, side: MarketplaceSideId) {
  if (side === "customer") return stage.customerAction;
  if (side === "worker") return stage.workerAction;
  return stage.companyAction;
}

function sideDescription(side: MarketplaceSideId) {
  return MARKETPLACE_SIMPLE_SIDES.find((item) => item.id === side);
}

function railTasks(phase: MarketplaceActionPhase, rails: MarketplaceActionRail[]) {
  return MARKETPLACE_ACTION_TASKS
    .filter((task) => task.phase === phase && rails.includes(task.rail))
    .sort((a, b) => b.bonusJcMoves - a.bonusJcMoves)
    .slice(0, 3);
}

function bonusTotal(rails: MarketplaceActionRail[]) {
  return MARKETPLACE_ACTION_TASKS
    .filter((task) => rails.includes(task.rail))
    .reduce((sum, task) => sum + Math.max(0, task.bonusJcMoves || 0), 0);
}

function selectedSides(side: SideFilter) {
  if (side === "all") return ["customer", "worker", "company"] as MarketplaceSideId[];
  return [side];
}

export default function MarketplaceNextStepFlow({
  side = "all",
  rails,
  compact = false,
  className = "",
}: MarketplaceNextStepFlowProps) {
  const sides = selectedSides(side);

  return (
    <section className={`rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-blue-300">
            <Sparkles className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Start / Progress / Finish</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">Simple flow for every side</h2>
          {!compact && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
              Every process should answer three questions: how it starts, how it moves forward, and how it closes with
              proof, payment, rewards, and the next opportunity.
            </p>
          )}
        </div>
        <span className="rounded-full border border-blue-400/30 bg-slate-950/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-200">
          1, 2, 3
        </span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "xl:grid-cols-3"}`}>
        {sides.map((selectedSide) => {
          const meta = sideMeta[selectedSide];
          const Icon = meta.icon;
          const taskRails = rails || defaultRailsBySide[selectedSide];
          const simple = sideDescription(selectedSide);
          const bonus = bonusTotal(taskRails);

          return (
            <div key={selectedSide} className="rounded-lg border border-slate-800 bg-slate-950/65 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.color}`}>
                    {meta.label}
                  </span>
                  <p className="mt-2 text-sm font-black text-white">{meta.headline}</p>
                </div>
                <Icon className="h-4 w-4 shrink-0 text-blue-300" />
              </div>

              {simple && !compact && (
                <div className="mt-3 grid gap-2 text-[11px] leading-4 sm:grid-cols-3">
                  <MiniFact label="Tabs" value={simple.tabs} />
                  <MiniFact label="Tasks" value={simple.tasks} />
                  <MiniFact label="Options" value={simple.options} />
                </div>
              )}

              <div className="mt-3 space-y-2">
                {steps.map((step) => (
                  <FlowStep
                    key={step.phase}
                    step={step}
                    side={selectedSide}
                    rails={taskRails}
                    compact={compact}
                  />
                ))}
              </div>

              {bonus > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-orange-400/20 bg-orange-500/10 p-2 text-[11px] text-orange-100">
                  <Coins className="h-3.5 w-3.5 text-orange-300" />
                  <span className="font-black">{bonus.toLocaleString()} possible JCMOVES</span>
                  <span className="text-orange-200/75">from verified tasks on this rail.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FlowStep({
  step,
  side,
  rails,
  compact,
}: {
  step: StepDefinition;
  side: MarketplaceSideId;
  rails: MarketplaceActionRail[];
  compact: boolean;
}) {
  const Icon = step.icon;
  const ActionIcon = phaseIcon[step.phase];
  const stages = stagesForStep(step);
  const primaryStage = stages[0];
  const tasks = railTasks(step.phase, rails);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-2.5">
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
          {steps.findIndex((candidate) => candidate.phase === step.phase) + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-black text-white">
              <Icon className="h-3.5 w-3.5 text-blue-300" />
              {step.label}
            </p>
            <ActionIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-300">
            {primaryStage ? sideAction(primaryStage, side) : step.promise}
          </p>

          {!compact && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stages.map((stage) => (
                <span key={stage.id} className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {stage.label}
                </span>
              ))}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 p-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-100">{task.title}</p>
                    {!compact && <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{task.proof}</p>}
                  </div>
                  {task.bonusJcMoves > 0 && (
                    <span className="shrink-0 rounded-full border border-orange-400/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-black text-orange-200">
                      +{task.bonusJcMoves}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!compact && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-blue-300" />
              {step.promise}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-slate-300">{value}</p>
    </div>
  );
}
