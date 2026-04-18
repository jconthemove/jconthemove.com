import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function WhatThisMeans({ title = "What this means", children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        data-testid="what-this-means-toggle"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Info className="h-3.5 w-3.5 text-teal-400" />
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-slate-400 leading-relaxed">{children}</div>
      )}
    </div>
  );
}
