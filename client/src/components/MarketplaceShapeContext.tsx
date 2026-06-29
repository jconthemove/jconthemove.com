import {
  getMarketplaceFunctionalIdeasForShape,
  type MarketplaceRequestShape,
} from "@shared/marketplaceShapes";
import { resolveMarketplaceShape } from "@/components/MarketplaceShapeBadge";

type MarketplaceShapeContextProps = {
  shapeId?: string | null;
  serviceCode?: string | null;
  serviceLabel?: string | null;
  audience?: "customer" | "worker" | "company";
  maxIdeas?: number;
  className?: string;
};

const statusClass = {
  live: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  in_progress: "border-blue-400/30 bg-blue-500/10 text-blue-200",
  next: "border-orange-400/30 bg-orange-500/10 text-orange-200",
};

function primaryReality(shape: MarketplaceRequestShape, audience: MarketplaceShapeContextProps["audience"]) {
  if (audience === "customer") return { label: "Customer", value: shape.customer };
  if (audience === "worker") return { label: "Worker", value: shape.worker };
  return { label: "Company", value: shape.company };
}

function statusLabel(status: keyof typeof statusClass) {
  return status.replace(/_/g, " ");
}

export default function MarketplaceShapeContext({
  shapeId,
  serviceCode,
  serviceLabel,
  audience = "company",
  maxIdeas = 2,
  className = "",
}: MarketplaceShapeContextProps) {
  const shape = resolveMarketplaceShape({ shapeId, serviceCode, serviceLabel });
  const reality = primaryReality(shape, audience);
  const ideas = getMarketplaceFunctionalIdeasForShape(shape.id).slice(0, Math.max(0, maxIdeas));

  return (
    <div className={`rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">Request Shape</p>
          <h3 className="mt-1 text-sm font-black text-white">{shape.shape}</h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{shape.references}</p>
        </div>
        <span className="rounded-full border border-blue-400/30 bg-slate-950/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-200">
          {reality.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">{reality.value}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          ["Customer", shape.customer],
          ["Worker", shape.worker],
          ["Company", shape.company],
        ].map(([label, detail]) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p>
          </div>
        ))}
      </div>

      {ideas.length > 0 && (
        <div className="mt-3 space-y-2">
          {ideas.map((idea) => (
            <div key={idea.reference} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-black text-slate-100">{idea.reference}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusClass[idea.status]}`}>
                  {statusLabel(idea.status)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-300">{idea.jcMove}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
