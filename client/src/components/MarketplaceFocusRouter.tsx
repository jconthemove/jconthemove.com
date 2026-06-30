import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  ClipboardList,
  Layers3,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  MARKETPLACE_REQUEST_SHAPES,
  MARKETPLACE_SIMPLE_SIDES,
  getMarketplaceFunctionalIdeasForShape,
  getMarketplaceSourceFlowsForShape,
  type MarketplaceRequestShapeId,
  type MarketplaceSideId,
} from "@shared/marketplaceShapes";
import MarketplaceActionMatrix from "@/components/MarketplaceActionMatrix";
import MarketplaceProcessGuide from "@/components/MarketplaceProcessGuide";
import MarketplaceSourceActionDeck from "@/components/MarketplaceSourceActionDeck";

type MarketplaceFocusRouterProps = {
  className?: string;
};

const sideMeta: Record<MarketplaceSideId, {
  label: string;
  actionLabel: string;
  icon: typeof Users;
  color: string;
}> = {
  customer: {
    label: "Customer",
    actionLabel: "Book, track, pay, review",
    icon: Users,
    color: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  },
  worker: {
    label: "Worker",
    actionLabel: "Advertise, quote, accept, complete",
    icon: ClipboardList,
    color: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  },
  company: {
    label: "Company",
    actionLabel: "Price, dispatch, collect, reward",
    icon: ShieldCheck,
    color: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  },
};

const defaultShapeId: MarketplaceRequestShapeId = "moving_help";

function sideInfo(side: MarketplaceSideId) {
  return MARKETPLACE_SIMPLE_SIDES.find((item) => item.id === side);
}

function audienceForSide(side: MarketplaceSideId) {
  return side;
}

function railForSide(side: MarketplaceSideId) {
  if (side === "customer") return "customer";
  if (side === "worker") return "worker";
  return "platinum";
}

export default function MarketplaceFocusRouter({ className = "" }: MarketplaceFocusRouterProps) {
  const [side, setSide] = useState<MarketplaceSideId>("company");
  const [shapeId, setShapeId] = useState<MarketplaceRequestShapeId>(defaultShapeId);
  const shape = MARKETPLACE_REQUEST_SHAPES.find((item) => item.id === shapeId) || MARKETPLACE_REQUEST_SHAPES[0];
  const selectedSide = sideInfo(side);
  const meta = sideMeta[side];
  const SideIcon = meta.icon;
  const ideas = useMemo(() => getMarketplaceFunctionalIdeasForShape(shape.id).slice(0, 3), [shape.id]);
  const flows = useMemo(() => getMarketplaceSourceFlowsForShape(shape.id).slice(0, 4), [shape.id]);

  return (
    <section className={`rounded-xl border border-purple-400/20 bg-purple-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-purple-300">
            <Sparkles className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Marketplace Focus Router</p>
          </div>
          <h2 className="mt-1 text-sm font-black text-white">Pick a side and job shape</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
            Keep the platform simple: the same marketplace idea should explain what the customer sees, what the worker
            does, and what the company controls.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-purple-400/25 bg-slate-950/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-purple-200">
          <Layers3 className="h-3.5 w-3.5" />
          {flows.length} matched plays
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Side</p>
            <div className="mt-3 grid gap-2">
              {(["customer", "worker", "company"] as MarketplaceSideId[]).map((item) => {
                const itemMeta = sideMeta[item];
                const Icon = itemMeta.icon;
                const active = item === side;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSide(item)}
                    className={`rounded-md border p-3 text-left transition ${
                      active
                        ? itemMeta.color
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-xs font-black uppercase tracking-wide">{itemMeta.label}</span>
                        <span className="mt-1 block text-[11px] leading-4 opacity-80">{itemMeta.actionLabel}</span>
                      </span>
                      <Icon className="h-4 w-4" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Job shape</p>
            <div className="mt-3 grid gap-2">
              {MARKETPLACE_REQUEST_SHAPES.map((item) => {
                const active = item.id === shape.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setShapeId(item.id)}
                    className={`rounded-md border p-3 text-left transition ${
                      active
                        ? "border-blue-400/30 bg-blue-500/10 text-blue-100"
                        : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-xs font-black uppercase tracking-wide">{item.shape}</span>
                        <span className="mt-1 block text-[11px] leading-4 opacity-80">{item.references}</span>
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${meta.color}`}>
                  {meta.label}
                </span>
                <h3 className="mt-2 text-lg font-black text-white">{shape.shape}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">{shape.references}</p>
              </div>
              <SideIcon className="h-5 w-5 text-purple-300" />
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <MiniFact label="Tabs" value={selectedSide?.tabs || "Tasks, Options"} />
              <MiniFact label="Tasks" value={selectedSide?.tasks || "Start, progress, finish."} />
              <MiniFact label="Options" value={selectedSide?.options || "Only the useful controls."} />
            </div>

            <div className="mt-4 rounded-md border border-blue-400/20 bg-blue-500/10 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
                <BadgeDollarSign className="h-3.5 w-3.5" />
                Reality for this side
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                {side === "customer" ? shape.customer : side === "worker" ? shape.worker : shape.company}
              </p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <MarketplaceProcessGuide
              shapeId={shape.id}
              audience={audienceForSide(side)}
              compact
            />
            <MarketplaceActionMatrix
              rail={railForSide(side)}
              shapeId={shape.id}
              compact
              limit={3}
            />
          </div>

          <MarketplaceSourceActionDeck
            shapeId={shape.id}
            audience={audienceForSide(side)}
            compact
            limit={2}
          />

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Useful ideas to keep</p>
            <div className="mt-3 grid gap-2">
              {ideas.map((idea) => (
                <div key={`${idea.reference}-${idea.surface}`} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-black text-white">{idea.reference}</p>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                      {idea.surface}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">{idea.jcMove}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{value}</p>
    </div>
  );
}
