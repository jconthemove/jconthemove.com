import { CheckCircle2, Circle, Clock } from "lucide-react";

type LifecycleLead = {
  status?: string | null;
  dispatchState?: string | null;
  basePrice?: string | null;
  totalPrice?: string | null;
  confirmedDate?: string | null;
  moveDate?: string | null;
  crewSize?: number | null;
  crewMembers?: string[] | null;
  completedAt?: string | null;
};

type StepState = "done" | "active" | "waiting";

function moneyValue(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string | null | undefined): string {
  return String(value || "").toLowerCase();
}

function lifecycleState(lead: LifecycleLead) {
  const status = normalize(lead.status);
  const dispatchState = normalize(lead.dispatchState);
  const price = Math.max(moneyValue(lead.totalPrice), moneyValue(lead.basePrice));
  const crewMembers = Array.isArray(lead.crewMembers) ? lead.crewMembers : [];
  const crewNeeded = Number(lead.crewSize || 0);
  const hasSchedule = Boolean(lead.confirmedDate || lead.moveDate);
  const quoteStatuses = new Set(["quoted", "available", "assigned", "accepted", "in_progress", "completed", "customer_approved", "payout_calculated", "payout_sent", "closed", "paid"]);
  const crewStatuses = new Set(["assigned", "accepted", "in_progress", "completed", "customer_approved", "payout_calculated", "payout_sent", "closed", "paid"]);
  const doneStatuses = new Set(["completed", "customer_approved", "payout_calculated", "payout_sent", "closed", "paid"]);
  const payoutStatuses = new Set(["payout_calculated", "payout_sent", "closed", "paid"]);

  const quoteDone = (price > 0 && hasSchedule) || quoteStatuses.has(status);
  const crewDone = crewNeeded > 0 ? crewMembers.length >= crewNeeded : crewMembers.length > 0;
  const dispatchDone = crewDone || crewStatuses.has(status) || crewStatuses.has(dispatchState);
  const completeDone = doneStatuses.has(status) || doneStatuses.has(dispatchState) || Boolean(lead.completedAt);
  const payoutDone = payoutStatuses.has(status) || payoutStatuses.has(dispatchState);

  return {
    price,
    hasSchedule,
    crewMembers,
    crewNeeded,
    quoteDone,
    dispatchDone,
    completeDone,
    payoutDone,
  };
}

function stepState(index: number, firstOpenIndex: number, done: boolean): StepState {
  if (done) return "done";
  return index === firstOpenIndex ? "active" : "waiting";
}

function stepClasses(state: StepState): string {
  if (state === "done") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
  if (state === "active") return "border-blue-500/40 bg-blue-500/15 text-blue-200";
  return "border-slate-700 bg-slate-900/60 text-slate-500";
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === "active") return <Clock className="h-3.5 w-3.5" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export default function JobLifecycleRail({ lead, className = "" }: { lead: LifecycleLead; className?: string }) {
  const state = lifecycleState(lead);
  const steps = [
    { label: "Request", done: true, detail: "Card made" },
    { label: "Quote", done: state.quoteDone, detail: state.price > 0 ? `$${state.price.toFixed(0)}` : "Price/date" },
    {
      label: "Crew",
      done: state.dispatchDone,
      detail: state.crewNeeded > 0 ? `${state.crewMembers.length}/${state.crewNeeded}` : `${state.crewMembers.length}`,
    },
    { label: "Complete", done: state.completeDone, detail: state.completeDone ? "Done" : "Work job" },
    { label: "Payout", done: state.payoutDone, detail: state.payoutDone ? "Ready" : "Review" },
  ];
  const firstOpenIndex = steps.findIndex((step) => !step.done);
  const activeIndex = firstOpenIndex === -1 ? steps.length - 1 : firstOpenIndex;
  const next = steps[activeIndex];

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950/45 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Job Flow</p>
        <p className="text-[10px] font-semibold text-slate-400">
          {firstOpenIndex === -1 ? "Flow complete" : `Next: ${next.label}`}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {steps.map((step, index) => {
          const visualState = stepState(index, activeIndex, step.done);
          return (
            <div key={step.label} className={`min-h-[58px] rounded-lg border px-2 py-2 ${stepClasses(visualState)}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[10px] font-black">{step.label}</span>
                <StepIcon state={visualState} />
              </div>
              <p className="mt-1 truncate text-[10px] opacity-75">{step.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
