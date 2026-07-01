import { ArrowRight, Bot, CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import {
  getSmartBookingGuidance,
  type SmartBookingAnswers,
  type SmartBookingGuidanceStepStatus,
} from "@shared/smartBookingEngine";

type SmartBookingGuidanceCardProps = {
  answers: SmartBookingAnswers;
  serviceLabel?: string;
  compact?: boolean;
  nextOnly?: boolean;
  onQuickOption?: (stepId: string, option: string) => void;
  className?: string;
};

const statusClass: Record<SmartBookingGuidanceStepStatus, string> = {
  complete: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  missing: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  optional: "border-slate-700 bg-slate-900/60 text-slate-400",
};

export default function SmartBookingGuidanceCard({
  answers,
  serviceLabel,
  compact = false,
  nextOnly = false,
  onQuickOption,
  className = "",
}: SmartBookingGuidanceCardProps) {
  const guidance = getSmartBookingGuidance(answers, serviceLabel);
  const next = guidance.nextStep;
  const visibleSteps = nextOnly && next ? [next] : guidance.steps;
  const topLevelQuickOptions = Boolean(onQuickOption && next && guidance.nextAction.answerOptions.length > 0 && (compact || nextOnly));

  return (
    <section className={`rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Bot className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em]">Smart booking read</p>
          </div>
          <h3 className="mt-1 text-sm font-black text-white">{guidance.shapeLabel}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {guidance.fastPathReady
              ? "Core answers are ready for quote review."
              : `Next: ${guidance.customerNext}`}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${
          guidance.fastPathReady ? statusClass.complete : statusClass.missing
        }`}>
          {guidance.completedRequired}/{guidance.totalRequired} ready
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
            {guidance.nextAction.label}
          </p>
          <span className="rounded-full border border-blue-400/25 bg-slate-950/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-100">
            {guidance.nextAction.stage}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-200">{guidance.nextAction.prompt}</p>
        {guidance.nextAction.missingLabels.length > 0 && (
          <p className="mt-1 text-[10px] leading-4 text-orange-200">
            Need: {guidance.nextAction.missingLabels.join(", ")}
          </p>
        )}
        {topLevelQuickOptions && next && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${next.label} quick answers`}>
            {guidance.nextAction.answerOptions.map((option) => (
              <button
                key={`${next.id}-${option}`}
                type="button"
                onClick={() => onQuickOption?.(next.id, option)}
                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20"
                data-testid={`smart-guidance-next-option-${next.id}-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {!compact && (
          <p className="mt-2 text-[10px] leading-4 text-slate-500">
            Borrowed from: <span className="text-slate-300">{guidance.nextAction.sourcePatterns}</span>
          </p>
        )}
      </div>

      {!compact && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <MiniFact label="Customer next" value={guidance.customerNext} />
          <MiniFact label="Worker sees" value={guidance.workerSignal} />
          <MiniFact label="Company controls" value={guidance.companyControl} />
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {visibleSteps.map((step) => {
          const active = next?.id === step.id;
          const Icon = step.status === "complete" ? CheckCircle2 : active ? ArrowRight : Circle;
          return (
            <div
              key={step.id}
              className={`rounded-lg border p-2 ${active ? "border-cyan-400/40 bg-cyan-500/15" : "border-slate-800 bg-slate-950/60"}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-cyan-200">
                  {step.order}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-black text-white">
                      <Icon className="h-3.5 w-3.5 text-cyan-300" />
                      {step.label}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusClass[step.status]}`}>
                      {step.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-300">{step.prompt}</p>
                  {onQuickOption && !topLevelQuickOptions && step.quickOptions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${step.label} quick answers`}>
                      {step.quickOptions.map((option) => (
                        <button
                          key={`${step.id}-${option}`}
                          type="button"
                          onClick={() => onQuickOption(step.id, option)}
                          className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20"
                          data-testid={`smart-guidance-option-${step.id}-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                  {step.missingSignals.length > 0 && (
                    <p className="mt-1 text-[10px] leading-4 text-orange-200">
                      Missing: {step.missingSignals.join(", ").replace(/_/g, " ")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <ShieldCheck className="h-3 w-3 text-cyan-300" />
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
    </div>
  );
}
