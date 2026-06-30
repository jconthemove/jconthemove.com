import { PackageCheck, Recycle, Repeat2, Truck, Zap } from "lucide-react";
import {
  MARKETPLACE_REQUEST_SHAPES,
  MARKETPLACE_ZONE_SERVICE_OPTIONS,
  type MarketplaceRequestShape,
  type MarketplaceRequestShapeId,
} from "@shared/marketplaceShapes";

type SmartRequestShapePickerProps = {
  selectedShapeId: MarketplaceRequestShapeId;
  onSelect: (shapeId: MarketplaceRequestShapeId) => void;
  className?: string;
};

const shapeIcon = {
  fast_quote: Zap,
  moving_help: Truck,
  delivery_reuse: Recycle,
  repeat_loop: Repeat2,
} satisfies Record<MarketplaceRequestShapeId, typeof Zap>;

function defaultLine(shape: MarketplaceRequestShape) {
  const option = MARKETPLACE_ZONE_SERVICE_OPTIONS.find((entry) => entry.shapeId === shape.id);
  if (!option) {
    if (shape.id === "fast_quote") return "60-second request";
    return "Review, reward, repeat";
  }
  return `${option.defaultCrewSize} crew / ${option.defaultHours} hr`;
}

function customerLine(shape: MarketplaceRequestShape) {
  if (shape.id === "fast_quote") return "ZIP, date, service, contact.";
  if (shape.id === "moving_help") return "Load, unload, truck, crew.";
  if (shape.id === "delivery_reuse") return "Pickup, drop-off, item photo.";
  return "Review, rep link, next offer.";
}

export default function SmartRequestShapePicker({
  selectedShapeId,
  onSelect,
  className = "",
}: SmartRequestShapePickerProps) {
  return (
    <section className={`rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4 ${className}`} data-testid="smart-request-shape-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-black text-white">Pick the job shape</h2>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-slate-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
          1, 2, 3
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {MARKETPLACE_REQUEST_SHAPES.map((shape) => {
          const selected = shape.id === selectedShapeId;
          const Icon = shapeIcon[shape.id];
          return (
            <button
              key={shape.id}
              type="button"
              onClick={() => onSelect(shape.id)}
              className={`min-h-[112px] rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-cyan-300 bg-cyan-400/15 text-white shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                  : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-cyan-400/50 hover:bg-slate-900"
              }`}
              data-testid={`shape-picker-${shape.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${selected ? "bg-cyan-400 text-slate-950" : "bg-slate-900 text-cyan-300"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-black">{shape.shape}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{defaultLine(shape)}</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-slate-300">{customerLine(shape)}</p>
              <p className="mt-2 line-clamp-1 text-[10px] font-semibold text-slate-500">{shape.references}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
