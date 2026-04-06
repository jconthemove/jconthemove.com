import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, Save, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Pricing {
  ratePerMoverHour: number;
  truckAdd: number;
  shortJobFull: number;
  shortJobRate: number;
  jc222Price: number;
  minHours: Record<number, number>;
}

const DEFAULTS = {
  rate_per_mover_hour: "60",
  truck_add: "60",
  short_job_full: "300",
  jc222_price: "222",
  min_hours_1: "5",
  min_hours_2: "4",
  min_hours_3: "3",
  min_hours_4: "2",
  min_hours_5: "2",
};

function getHourDiscount(hours: number): number {
  if (hours >= 7) return 20;
  if (hours >= 5) return 15;
  if (hours >= 3) return 10;
  return 0;
}

export function AdminPricingEditor({ alwaysOpen = false }: { alwaysOpen?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(alwaysOpen);
  const [resetting, setResetting] = useState(false);

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"] });

  const [draft, setDraft] = useState<typeof DEFAULTS>(DEFAULTS);

  useEffect(() => {
    if (!pricing) return;
    setDraft({
      rate_per_mover_hour: String(pricing.ratePerMoverHour),
      truck_add:           String(pricing.truckAdd),
      short_job_full:      String(pricing.shortJobFull ?? 300),
      jc222_price:         String(pricing.jc222Price ?? 222),
      min_hours_1:         String(pricing.minHours?.[1] ?? 5),
      min_hours_2:         String(pricing.minHours?.[2] ?? 4),
      min_hours_3:         String(pricing.minHours?.[3] ?? 3),
      min_hours_4:         String(pricing.minHours?.[4] ?? 2),
      min_hours_5:         String(pricing.minHours?.[5] ?? 2),
    });
  }, [pricing]);

  const set = (k: keyof typeof DEFAULTS, v: string) =>
    setDraft(d => ({ ...d, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async (values: typeof DEFAULTS) => {
      await Promise.all(
        Object.entries(values).map(([key, value]) =>
          apiRequest("PATCH", `/api/admin/pricing/${key}`, { value: parseFloat(value) })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "Pricing updated", description: "Changes are live on the booking page." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleReset() {
    if (!confirm("Reset ALL pricing to factory defaults? This will overwrite your current settings.")) return;
    setResetting(true);
    try {
      await saveMutation.mutateAsync(DEFAULTS);
      setDraft({ ...DEFAULTS });
      toast({ title: "Pricing reset to defaults", description: "Rate $60/hr · Floor $300 · JC222 $222" });
    } finally {
      setResetting(false);
    }
  }

  const rate = parseFloat(draft.rate_per_mover_hour || "60");
  const floor = parseFloat(draft.short_job_full || "300");
  const jc222 = parseFloat(draft.jc222_price || "222");

  const SAMPLE_PKGS = [
    { movers: 2, hours: 2 },
    { movers: 2, hours: 3 },
    { movers: 3, hours: 3 },
    { movers: 4, hours: 4 },
  ];

  return (
    <div className="rounded-xl bg-slate-800/60 border border-amber-500/30 p-4">
      {!alwaysOpen && (
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-amber-400" />
            <span className="font-bold text-amber-300 text-sm">Edit Pricing</span>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
      )}

      {(open || alwaysOpen) && (
        <div className={`space-y-4 ${!alwaysOpen ? "mt-4" : ""}`}>

          {/* Row 1: labor rate + truck */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Rate per mover/hr ($)</label>
              <Input
                type="number"
                value={draft.rate_per_mover_hour}
                onChange={e => set("rate_per_mover_hour", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">$60 = $1/mover/min</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Truck add-on/hr ($)</label>
              <Input
                type="number"
                value={draft.truck_add}
                onChange={e => set("truck_add", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
            </div>
          </div>

          {/* Row 2: floor + JC222 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Min job price ($)</label>
              <Input
                type="number"
                value={draft.short_job_full}
                onChange={e => set("short_job_full", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">Price floor — default $300</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">JC222 promo price ($)</label>
              <Input
                type="number"
                value={draft.jc222_price}
                onChange={e => set("jc222_price", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">JC222 Special — default $222</p>
            </div>
          </div>

          {/* Min hours */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-semibold">Minimum Hours by Crew Size</p>
            <div className="grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as const).map(n => {
                const key = `min_hours_${n}` as keyof typeof DEFAULTS;
                return (
                  <div key={n} className="text-center">
                    <label className="text-xs text-slate-500 block mb-1">{n} Mv{n > 1 ? "s" : ""}</label>
                    <Input
                      type="number"
                      value={draft[key]}
                      onChange={e => set(key, e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white h-9 text-sm text-center"
                    />
                    <p className="text-[10px] text-slate-600 mt-0.5">hrs</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-slate-900/60 rounded-lg p-3 text-xs">
            <p className="font-semibold text-slate-300 mb-2">Package price preview</p>
            <div className="space-y-1">
              {SAMPLE_PKGS.map(({ movers, hours }) => {
                const base = movers * hours * rate;
                const floored = base < floor ? floor : base;
                const disc = getHourDiscount(hours);
                const final = disc > 0 ? Math.round(floored * (1 - disc / 100)) : floored;
                return (
                  <div key={`${movers}-${hours}`} className="flex justify-between text-slate-400">
                    <span>{movers} Movers × {hours} hrs{disc > 0 ? ` (${disc}% off)` : ""}</span>
                    <span className="text-white font-medium">${final}</span>
                  </div>
                );
              })}
              <div className="flex justify-between text-slate-400 border-t border-slate-700/50 pt-1 mt-1">
                <span>JC222 Special</span>
                <span className="text-amber-400 font-medium">${jc222}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Min job floor</span>
                <span className="text-slate-300">${floor}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending || resetting}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saveMutation.isPending || resetting}
              className="text-slate-400 border-slate-700 hover:text-red-400 hover:border-red-500/50 px-3"
              title="Reset all pricing to defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="text-[10px] text-slate-600 text-center">
            Default: $60/mover/hr · $60 truck · $300 min · $222 JC222
          </p>
        </div>
      )}
    </div>
  );
}
