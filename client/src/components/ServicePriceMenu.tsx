import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Search, Sparkles } from "lucide-react";
import {
  SERVICE_PRICE_MENU,
  SERVICE_PRICE_MENU_CATEGORIES,
  formatServicePriceRange,
  type ServicePriceMenuCategoryId,
  type ServicePriceMenuTask,
} from "@shared/servicePriceMenu";

type ServicePriceMenuProps = {
  activeShapeId?: string;
  onSelectTask: (task: ServicePriceMenuTask) => void;
  selectedTaskId?: string | null;
  className?: string;
};

function categoryForShape(shapeId?: string): ServicePriceMenuCategoryId | "all" {
  if (shapeId === "moving_help") return "moving";
  if (shapeId === "delivery_reuse") return "delivery";
  if (shapeId === "repeat_loop") return "repeat";
  return "all";
}

export default function ServicePriceMenu({
  activeShapeId,
  onSelectTask,
  selectedTaskId,
  className = "",
}: ServicePriceMenuProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ServicePriceMenuCategoryId | "all">(() => categoryForShape(activeShapeId));

  useEffect(() => {
    setCategory(categoryForShape(activeShapeId));
  }, [activeShapeId]);

  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SERVICE_PRICE_MENU.filter((task) => {
      const categoryMatch = category === "all" || task.categoryId === category;
      if (!categoryMatch) return false;
      if (!q) return true;
      const haystack = [
        task.label,
        task.description,
        task.serviceCode,
        task.priceUnit,
        ...task.tags,
        ...task.customerNeeds,
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [category, query]);

  return (
    <section className={`rounded-2xl border border-slate-700 bg-slate-950/70 p-4 ${className}`} data-testid="service-price-menu">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <ClipboardList className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em]">Price menu</p>
          </div>
          <h2 className="mt-1 text-base font-black text-white">Pick a task, start a quote.</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Ranges are estimate guidance. Staff reviews scope, travel, materials, disposal, and safety before a price is sold.
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-200">
          {SERVICE_PRICE_MENU.length} task paths
        </span>
      </div>

      <label className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 text-slate-300">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search delivery, handyman, roofing, flooring, demo..."
          className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-500"
          data-testid="price-menu-search"
        />
      </label>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <CategoryButton
          active={category === "all"}
          label="All"
          summary="Every task"
          onClick={() => setCategory("all")}
        />
        {SERVICE_PRICE_MENU_CATEGORIES.map((entry) => (
          <CategoryButton
            key={entry.id}
            active={category === entry.id}
            label={entry.label}
            summary={entry.summary}
            onClick={() => setCategory(entry.id)}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visibleTasks.map((task) => {
          const selected = task.id === selectedTaskId;
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectTask(task)}
              className={`min-h-[148px] rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-emerald-300 bg-emerald-500/15 text-white shadow-[0_0_0_1px_rgba(110,231,183,0.18)]"
                  : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-cyan-400/50 hover:bg-slate-900"
              }`}
              data-testid={`price-menu-task-${task.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black leading-tight text-white">{task.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{task.description}</p>
                </div>
                <span className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-black text-cyan-100">
                  {formatServicePriceRange(task)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-bold text-slate-300">
                  {task.defaultCrew} crew / {task.defaultHours} hr
                </span>
                <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-bold text-slate-300">
                  {task.priceUnit}
                </span>
                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">
                  Review before sold
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {task.tags.join(" / ")}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black text-white">
                  <Sparkles className="h-3 w-3" />
                  Add
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {visibleTasks.length === 0 && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
          No task path found. Use the closest service and add details in the notes.
        </div>
      )}
    </section>
  );
}

function CategoryButton({
  active,
  label,
  summary,
  onClick,
}: {
  active: boolean;
  label: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={summary}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
        active
          ? "border-cyan-300 bg-cyan-400/15 text-white"
          : "border-slate-800 bg-slate-950 text-slate-400 hover:border-cyan-400/40 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
