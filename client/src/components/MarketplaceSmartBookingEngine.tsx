import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  ClipboardList,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MARKETPLACE_REQUEST_SHAPES,
  getMarketplaceSmartBookingStepsForShape,
  type MarketplaceRequestShapeId,
} from "@shared/marketplaceShapes";

type MarketplaceSmartBookingEngineProps = {
  className?: string;
};

const iconByStep: Record<string, typeof ClipboardList> = {
  where_when: MapPin,
  job_shape: ClipboardList,
  truck_context: Users,
  smart_package: Sparkles,
  detail_capture: ShieldCheck,
  contact_recovery: Bot,
};

const defaultShapeId: MarketplaceRequestShapeId = "moving_help";

export default function MarketplaceSmartBookingEngine({ className = "" }: MarketplaceSmartBookingEngineProps) {
  const [shapeId, setShapeId] = useState<MarketplaceRequestShapeId>(defaultShapeId);
  const selectedShape = MARKETPLACE_REQUEST_SHAPES.find((shape) => shape.id === shapeId) || MARKETPLACE_REQUEST_SHAPES[0];
  const steps = useMemo(() => getMarketplaceSmartBookingStepsForShape(selectedShape.id), [selectedShape.id]);

  return (
    <section className={`rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Bot className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Smart Booking Engine</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">Answer once, move the card forward</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
            The customer should never face a giant form. Each answer should either fill the card, choose the next
            question, estimate the range, or alert the right person.
          </p>
        </div>
        <div className="rounded-lg border border-cyan-400/20 bg-slate-950/60 px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1 text-cyan-200">
            <Clock3 className="h-3.5 w-3.5" />
            <span className="text-sm font-black">60 sec</span>
          </div>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">booking target</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Job shape</p>
          <div className="mt-3 grid gap-2">
            {MARKETPLACE_REQUEST_SHAPES.map((shape) => {
              const active = shape.id === selectedShape.id;
              return (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => setShapeId(shape.id)}
                  className={`rounded-md border p-3 text-left transition ${
                    active
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                      : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-xs font-black uppercase tracking-wide">{shape.shape}</span>
                      <span className="mt-1 block text-[11px] leading-4 opacity-80">{shape.references}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-md border border-blue-400/20 bg-blue-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">System promise</p>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Keep the visible path short, but keep the lead card rich enough for quote, calendar, dispatch, payment,
              payout, and JCMOVES.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {steps.map((step) => {
            const Icon = iconByStep[step.id] || ClipboardList;
            return (
              <article key={step.id} className="rounded-lg border border-slate-800 bg-slate-950/65 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-black text-white">
                      {step.order}
                    </span>
                    <div>
                      <p className="text-sm font-black text-white">{step.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">{step.prompt}</p>
                    </div>
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {step.quickOptions.map((option) => (
                    <span key={option} className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-100">
                      {option}
                    </span>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <MiniFact label="Captures" value={step.captures.join(", ")} />
                  <MiniFact label="Auto answer" value={step.autoInterpretation} />
                  <MiniFact label="Company control" value={step.companyControl} />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <SideFact label="Customer" value={step.customerPromise} />
                  <SideFact label="Worker" value={step.workerSignal} />
                </div>

                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Borrowed from: <span className="text-slate-300">{step.sourcePatterns}</span>
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
    </div>
  );
}

function SideFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-200">{value}</p>
    </div>
  );
}
