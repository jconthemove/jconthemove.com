import { CheckCircle2, Plus, Tag } from "lucide-react";

export interface BundleService {
  id: string;
  label: string;
  emoji: string;
  hint: string;
}

export const ALL_BUNDLE_SERVICES: BundleService[] = [
  { id: "moving",          label: "Moving",          emoji: "🚛", hint: "from $85/mover·hr" },
  { id: "junk_removal",    label: "Junk Removal",    emoji: "🗑️", hint: "from $150" },
  { id: "cleaning",        label: "Cleaning",        emoji: "🧼", hint: "from $150" },
  { id: "window_cleaning", label: "Window Cleaning", emoji: "🪟", hint: "$5/pane" },
  { id: "lawn_care",       label: "Lawn Care",       emoji: "🌿", hint: "from $50/visit" },
  { id: "trash_valet",     label: "Trash Valet",     emoji: "♻️", hint: "from $25/mo" },
  { id: "snow_removal",    label: "Snow Removal",    emoji: "❄️", hint: "from $40/visit" },
  { id: "assembly",        label: "Assembly",        emoji: "🔧", hint: "$35/item" },
];

interface ServiceBundleAddonProps {
  currentService?: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  theme?: "dark" | "slate";
}

export default function ServiceBundleAddon({
  currentService,
  selected,
  onChange,
  theme = "dark",
}: ServiceBundleAddonProps) {
  const services = ALL_BUNDLE_SERVICES.filter(s => s.id !== currentService);
  const hasSelected = selected.length > 0;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(a => a !== id) : [...selected, id]);
  };

  const cardBg = hasSelected
    ? "bg-green-900/20 border-green-500/40"
    : theme === "slate"
      ? "bg-slate-900 border-slate-700"
      : "bg-zinc-900 border-zinc-800";

  const chipBase = theme === "slate"
    ? "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-300"
    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300";

  const selectedNames = selected
    .map(id => ALL_BUNDLE_SERVICES.find(s => s.id === id)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`rounded-2xl p-4 space-y-3 border transition-all ${cardBg}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> Bundle & Save
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Add any service — get <span className="text-green-400 font-bold">10% off + up to $50 off</span> your bundled add-on.
          </p>
        </div>
        {hasSelected ? (
          <span className="shrink-0 bg-green-500/20 text-green-300 text-[10px] font-bold px-2 py-1 rounded-full border border-green-500/30 whitespace-nowrap flex items-center gap-1">
            <Tag className="h-2.5 w-2.5" /> Up to $50 off
          </span>
        ) : (
          <span className="shrink-0 bg-orange-500/10 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-full border border-orange-500/20 whitespace-nowrap">
            Save up to $50
          </span>
        )}
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-4 gap-2">
        {services.map(svc => {
          const active = selected.includes(svc.id);
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => toggle(svc.id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl border text-center transition-all active:scale-95 ${
                active
                  ? "border-green-500/50 bg-green-500/15 text-green-300"
                  : chipBase
              }`}
            >
              <span className="text-lg leading-none">{svc.emoji}</span>
              <span className="text-[9px] font-semibold leading-tight mt-0.5">{svc.label}</span>
              <span className="text-[8px] text-zinc-500 leading-tight">{svc.hint}</span>
              {active && <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Confirmation note */}
      {hasSelected ? (
        <div className="rounded-xl bg-green-900/30 border border-green-500/20 px-3 py-2 space-y-1">
          <p className="text-[11px] text-green-300 font-semibold">
            🎉 10% off + up to $50 off {selectedNames} — applied when we send your invoice.
          </p>
          <p className="text-[10px] text-zinc-500">
            No action needed. We'll apply the bundle discount automatically when quoting your add-on{selected.length > 1 ? "s" : ""}.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-zinc-600 text-center">
          Tap any service above — bundle & save 10% + up to $50 off.
        </p>
      )}
    </div>
  );
}
