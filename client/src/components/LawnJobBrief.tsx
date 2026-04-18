// Crew-facing "Job Brief" panel for lawn-care jobs.
// Looks up the most recent matching lawn quote by phone and renders a
// plain-English summary built from the shared price-breakdown object.

import { useQuery } from "@tanstack/react-query";
import { Loader2, Leaf, AlertTriangle, Dog, Mountain, Trash2, KeySquare, type LucideIcon } from "lucide-react";
import LawnPriceBreakdown, { type LawnPricing } from "./LawnPriceBreakdown";
import { ADD_ON_LABELS } from "@/lib/lawnYardData";

interface Props {
  phone: string | null | undefined;
}

interface BriefQuote {
  id: number;
  serviceCategory: string;
  serviceFrequency: string;
  propertySize: string;
  propertyCondition: string;
  addOns: string[];
  hasFence: boolean;
  hasPets: boolean;
  hasSteepSlope: boolean;
  needsHaulAway: boolean;
  notes: string | null;
}

interface ByPhoneResponse {
  found: boolean;
  quote?: BriefQuote;
  pricing?: LawnPricing;
}

interface BriefFlag {
  icon: LucideIcon;
  label: string;
  color: string;
}

export default function LawnJobBrief({ phone }: Props) {
  const digits = (phone || "").replace(/\D/g, "");
  const enabled = digits.length >= 7;

  const { data, isLoading } = useQuery<ByPhoneResponse>({
    queryKey: ["/api/lawn-care/by-phone", digits],
    queryFn: async () => {
      const r = await fetch(`/api/lawn-care/by-phone?phone=${encodeURIComponent(digits)}`, {
        credentials: "include",
      });
      if (!r.ok) return { found: false };
      return r.json();
    },
    enabled,
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <div className="bg-slate-800/40 rounded-xl p-3 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading lawn brief…
      </div>
    );
  }
  if (!data?.found || !data.quote || !data.pricing) return null;

  const q = data.quote;
  const p = data.pricing;
  const flags: BriefFlag[] = [];
  if (q.hasFence) flags.push({ icon: KeySquare, label: "Fenced — gate access needed", color: "text-amber-400" });
  if (q.hasPets) flags.push({ icon: Dog, label: "Pets on property — close gates", color: "text-blue-400" });
  if (q.hasSteepSlope) flags.push({ icon: Mountain, label: "Steep slope — extra care", color: "text-orange-400" });
  if (q.needsHaulAway) flags.push({ icon: Trash2, label: "Haul away debris", color: "text-red-400" });

  const addOns: string[] = Array.isArray(q.addOns) ? q.addOns : [];

  return (
    <div className="rounded-xl border border-lime-500/30 bg-gradient-to-br from-lime-950/30 to-slate-800/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-lime-500/20 flex items-center gap-2">
        <Leaf className="h-4 w-4 text-lime-400" />
        <p className="text-xs font-bold uppercase tracking-wider text-lime-300">Lawn Job Brief</p>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Service</p>
            <p className="text-white font-medium capitalize">{(q.serviceCategory || "").replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Frequency</p>
            <p className="text-white font-medium capitalize">{(q.serviceFrequency || "").replace(/_/g, " ")}</p>
          </div>
        </div>

        <div className="text-xs space-y-1">
          <p className="text-slate-300">
            <span className="font-semibold">Yard:</span> {p.explanations?.size || q.propertySize}
          </p>
          <p className="text-slate-300">
            <span className="font-semibold">Condition:</span> {p.explanations?.condition}
          </p>
          <p className="text-slate-300">
            <span className="font-semibold">Crew:</span> {p.explanations?.crew}
          </p>
        </div>

        {addOns.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Add-ons checklist</p>
            <ul className="space-y-1">
              {addOns.map((a: string) => (
                <li key={a} className="flex items-center gap-2 text-xs text-slate-200">
                  <span className="w-3.5 h-3.5 rounded border border-slate-500" />
                  {ADD_ON_LABELS[a] || a.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {flags.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Property flags
            </p>
            <ul className="space-y-1">
              {flags.map((f, i) => (
                <li key={i} className={`flex items-center gap-2 text-xs ${f.color}`}>
                  <f.icon className="h-3.5 w-3.5" /> {f.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {q.notes && (
          <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Customer notes</p>
            <p className="text-xs text-slate-300 italic">"{q.notes}"</p>
          </div>
        )}

        <LawnPriceBreakdown pricing={p} serviceFrequency={q.serviceFrequency} variant="crew" />
      </div>
    </div>
  );
}
