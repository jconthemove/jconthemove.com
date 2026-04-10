import { CheckCircle2, Plus } from "lucide-react";

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
  showDiscount?: boolean;
  discountNote?: string;
  theme?: "dark" | "slate";
}

export default function ServiceBundleAddon({
  currentService,
  selected,
  onChange,
  showDiscount = false,
  discountNote,
  theme = "dark",
}: ServiceBundleAddonProps) {
  const services = ALL_BUNDLE_SERVICES.filter(s => s.id !== currentService);
  const hasSelected = selected.length > 0;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(a => a !== id) : [...selected, id]);
  };

  const bg = theme === "slate" ? "bg-slate-900 border-slate-700" : "bg-zinc-900 border-zinc-800";
  const activeBg = hasSelected && showDiscount ? "bg-green-900/20 border-green-500/40" : bg;
  const chipBase = theme === "slate"
    ? "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-300"
    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300";
  const chipActive = showDiscount
    ? "border-green-500/50 bg-green-500/15 text-green-300"
    : "border-orange-500/50 bg-orange-500/15 text-orange-300";

  return (
    <div className={`rounded-2xl p-4 space-y-3 border transition-all ${activeBg}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> Also Interested In?
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {showDiscount
              ? "Add another service — save extra on this booking"
              : "Let us know and we'll quote everything together"}
          </p>
        </div>
        {hasSelected && showDiscount && (
          <span className="bg-green-500/20 text-green-300 text-[10px] font-bold px-2 py-1 rounded-full border border-green-500/30 whitespace-nowrap">
            {discountNote || "Bundle discount active"}
          </span>
        )}
        {hasSelected && !showDiscount && (
          <span className="bg-orange-500/20 text-orange-300 text-[10px] font-bold px-2 py-1 rounded-full border border-orange-500/30 whitespace-nowrap">
            ✓ {selected.length} added
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {services.map(svc => {
          const active = selected.includes(svc.id);
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => toggle(svc.id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl border text-center transition-all active:scale-95 ${
                active ? chipActive : chipBase
              }`}
            >
              <span className="text-lg leading-none">{svc.emoji}</span>
              <span className="text-[9px] font-semibold leading-tight mt-0.5">{svc.label}</span>
              <span className="text-[8px] text-zinc-500 leading-tight">{svc.hint}</span>
              {active && <CheckCircle2 className="h-3 w-3 text-inherit opacity-80 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {hasSelected && (
        <p className="text-[11px] text-zinc-400 text-center border-t border-zinc-800/60 pt-2">
          {showDiscount
            ? `🎉 Bundle discount applied — your add-on${selected.length > 1 ? "s" : ""} will be quoted separately.`
            : `We'll include quotes for ${selected.map(id => ALL_BUNDLE_SERVICES.find(s => s.id === id)?.label).filter(Boolean).join(", ")} in your follow-up.`}
        </p>
      )}
    </div>
  );
}
