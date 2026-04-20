import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ChevronRight, ChevronLeft, Check, DollarSign, Zap, Truck,
  FlaskConical, History, RotateCcw, ArrowRight, MapPin, Plus, Trash2, Save
} from "lucide-react";

interface CalibrationValues {
  rate_per_mover_hour: number;
  jc222_price: number;
  short_job_full: number;
  truck_small_flat: number;
  truck_large_flat: number;
  drive_rate: number;
}

interface CalibrationSession {
  id: number;
  applied_at: string;
  applied_by_name: string | null;
  values: Record<string, number>;
  notes: string | null;
}

interface PricingData {
  ratePerMoverHour: number;
  jc222Price: number;
  shortJobFull: number;
  truckSmallFlat: number;
  truckLargeFlat: number;
  driveRate: number;
}

const STEPS = [
  {
    id: "rate",
    title: "Mover Hourly Rate",
    icon: DollarSign,
    color: "text-emerald-400",
    description: "The base labor cost per mover per hour. This is the single most important number — every package price is a multiple of it.",
    field: "rate_per_mover_hour" as keyof CalibrationValues,
    unit: "$/mover/hr",
    min: 50,
    max: 200,
    hint: "Current industry range: $65–$120/hr. JC target is $85/hr.",
  },
  {
    id: "jc222",
    title: "JC222 Promo Price",
    icon: Zap,
    color: "text-teal-400",
    description: "The flat promotional price for qualifying small moves. A standard 2-mover × 2-hr job at your base rate costs more — this is the discount that wins short-haul bookings.",
    field: "jc222_price" as keyof CalibrationValues,
    unit: "$ flat",
    min: 150,
    max: 300,
    hint: "Default is $222. Must be less than 2 × 2 × rate to be a real discount.",
  },
  {
    id: "min_job",
    title: "Minimum Job Floor",
    icon: DollarSign,
    color: "text-amber-400",
    description: "The minimum dollar amount for any moving job, regardless of time. Protects against very short jobs that aren't worth the trip.",
    field: "short_job_full" as keyof CalibrationValues,
    unit: "$ minimum",
    min: 100,
    max: 600,
    hint: "Default $300. Covers truck + fuel + 2 movers for a typical 1-hr run.",
  },
  {
    id: "trucks",
    title: "Truck Flat Rates",
    icon: Truck,
    color: "text-blue-400",
    description: "Optional flat add-ons when a truck is specifically requested. These are on top of labor.",
    field: "truck_small_flat" as keyof CalibrationValues,
    unit: "$ (small / large)",
    min: 0,
    max: 1000,
    hint: "Small (16 ft): $300 default. Large (26 ft): $600 default. Set 0 to include truck in labor rate.",
    hasTwin: true,
    twinField: "truck_large_flat" as keyof CalibrationValues,
  },
];

function r5(n: number) { return Math.ceil(n / 5) * 5; }
function previewPrices(v: CalibrationValues) {
  const r = v.rate_per_mover_hour;
  const j = v.jc222_price;
  return [
    { label: "Tiny (1 mover · 60 min)", price: `$${r}`, tag: "flat" },
    { label: "Small Standard (2×2 hrs)", price: `$${r5(r * 2 * 2)}`, tag: "per booking" },
    { label: "Small JC222 Promo (2×2 hrs)", price: `$${j}`, tag: "promo" },
    { label: "Medium A (2×4 hrs)", price: `$${r5(r * 2 * 4)}`, tag: "per booking" },
    { label: "Medium B (3×2.5 hrs)", price: `$${r5(r * 3 * 2.5)}`, tag: "per booking" },
    { label: "Large Balanced (3×5 hrs)", price: `$${r5(r * 3 * 5)}`, tag: "per booking" },
    { label: "Large Power Crew (4×4 hrs)", price: `$${r5(r * 4 * 4)}`, tag: "per booking" },
  ];
}

export default function PricingCalibratePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentPricing } = useQuery<PricingData>({ queryKey: ["/api/pricing"] });
  const { data: history = [] } = useQuery<CalibrationSession[]>({
    queryKey: ["/api/admin/calibration/history"],
  });

  const { data: demandSnapshot, refetch: refetchDemand } = useQuery<{
    calibration: {
      mode: "shadow" | "soft" | "full";
      crewPositioningMuted: boolean;
      zones?: Record<string, { enabled: boolean; elevatedThreshold?: number }>;
    };
    zones: Array<{ zoneCode: string; zoneName: string; score: number; counts: Record<string, number>; surge: { multiplier: number; theoreticalMultiplier: number; band: string; reason: string } }>;
  }>({ queryKey: ["/api/admin/demand"], refetchInterval: 30000 });

  const demandModeMutation = useMutation({
    mutationFn: async (patch: {
      mode?: "shadow" | "soft" | "full";
      crewPositioningMuted?: boolean;
      zones?: Record<string, { enabled?: boolean; elevatedThreshold?: number }>;
    }) => {
      const res = await apiRequest("PUT", "/api/admin/demand/calibration", patch);
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      refetchDemand();
      toast({ title: "Demand calibration updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState("");
  const [applied, setApplied] = useState(false);

  const [values, setValues] = useState<CalibrationValues>({
    rate_per_mover_hour: 85,
    jc222_price: 222,
    short_job_full: 300,
    truck_small_flat: 300,
    truck_large_flat: 600,
    drive_rate: 40,
  });

  // Sync from live pricing once it loads
  const [synced, setSynced] = useState(false);
  if (currentPricing && !synced) {
    setValues({
      rate_per_mover_hour: currentPricing.ratePerMoverHour ?? 85,
      jc222_price: currentPricing.jc222Price ?? 222,
      short_job_full: currentPricing.shortJobFull ?? 300,
      truck_small_flat: currentPricing.truckSmallFlat ?? 300,
      truck_large_flat: currentPricing.truckLargeFlat ?? 600,
      drive_rate: currentPricing.driveRate ?? 40,
    });
    setSynced(true);
  }

  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/calibration/apply", { values, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calibration/history"] });
      setApplied(true);
      toast({ title: "Pricing calibrated", description: "All rates are now live in the booking chatbot." });
    },
    onError: (e: Error) =>
      toast({ title: "Error applying calibration", description: e.message, variant: "destructive" }),
  });

  const set = (k: keyof CalibrationValues, v: string) => {
    const n = parseFloat(v);
    if (!isNaN(n)) setValues(prev => ({ ...prev, [k]: n }));
  };

  const isLast = step === STEPS.length;
  const currentStepDef = STEPS[step];
  const previews = previewPrices(values);

  const totalSteps = STEPS.length + 1;

  function handleRestoreFromHistory(session: CalibrationSession) {
    const v = session.values as Partial<CalibrationValues>;
    setValues(prev => ({
      ...prev,
      ...(v.rate_per_mover_hour !== undefined && { rate_per_mover_hour: v.rate_per_mover_hour }),
      ...(v.jc222_price !== undefined && { jc222_price: v.jc222_price }),
      ...(v.short_job_full !== undefined && { short_job_full: v.short_job_full }),
      ...(v.truck_small_flat !== undefined && { truck_small_flat: v.truck_small_flat }),
      ...(v.truck_large_flat !== undefined && { truck_large_flat: v.truck_large_flat }),
    }));
    setStep(0);
    setApplied(false);
    toast({ title: "Values loaded from history", description: "Review and apply when ready." });
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-2xl mx-auto px-4 pt-6">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-5 w-5 text-teal-400" />
            <h1 className="text-2xl font-black text-white">Pricing Calibration</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Answer a few questions to tune the booking chatbot's live pricing engine.
            Results are saved to the database and take effect immediately.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Step {Math.min(step + 1, totalSteps)} of {totalSteps}</span>
            <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
          <div className="flex gap-1 mt-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { if (!applied) setStep(i); }}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  i <= step ? "bg-teal-500" : "bg-slate-700"
                }`}
              />
            ))}
            <button
              onClick={() => { if (!applied) setStep(STEPS.length); }}
              className={`flex-1 h-1 rounded-full transition-colors ${
                step === STEPS.length ? "bg-emerald-500" : "bg-slate-700"
              }`}
            />
          </div>
        </div>

        {/* Question Cards */}
        {!isLast && currentStepDef && (
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`p-2 rounded-lg bg-slate-800 ${currentStepDef.color}`}>
                <currentStepDef.icon className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-bold text-white">{currentStepDef.title}</h2>
            </div>

            <p className="text-slate-300 text-sm mb-4 leading-relaxed">
              {currentStepDef.description}
            </p>

            {currentStepDef.hasTwin ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Small Truck (16 ft) — flat add-on</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={values.truck_small_flat}
                      onChange={e => set("truck_small_flat", e.target.value)}
                      className="pl-7 bg-slate-800 border-slate-600 text-white font-mono text-lg h-11"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Large Truck (26 ft) — flat add-on</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                    <Input
                      type="number"
                      min={0}
                      max={1500}
                      value={values.truck_large_flat}
                      onChange={e => set("truck_large_flat", e.target.value)}
                      className="pl-7 bg-slate-800 border-slate-600 text-white font-mono text-lg h-11"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                <Input
                  type="number"
                  min={currentStepDef.min}
                  max={currentStepDef.max}
                  value={values[currentStepDef.field]}
                  onChange={e => set(currentStepDef.field, e.target.value)}
                  className="pl-7 bg-slate-800 border-slate-600 text-white font-mono text-2xl font-bold h-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                  {currentStepDef.unit}
                </span>
              </div>
            )}

            <p className="text-xs text-slate-500 mt-2.5 italic">{currentStepDef.hint}</p>
          </div>
        )}

        {/* Preview & Apply step */}
        {isLast && (
          <div className="space-y-4 mb-4">
            {applied ? (
              <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto mb-3">
                  <Check className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="text-emerald-300 font-bold text-lg mb-1">Calibration Applied!</h3>
                <p className="text-slate-400 text-sm">
                  All pricing values are live in the booking chatbot. New quote requests will use the updated rates.
                </p>
                <Button
                  className="mt-4 bg-slate-700 hover:bg-slate-600 text-white"
                  onClick={() => { setApplied(false); setStep(0); }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Run another calibration
                </Button>
              </div>
            ) : (
              <>
                <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5">
                  <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-teal-400" />
                    Price Preview
                  </h3>
                  <div className="space-y-2">
                    {previews.map(p => (
                      <div key={p.label} className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
                        <span className="text-slate-300 text-sm">{p.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{p.price}</span>
                          <Badge className={
                            p.tag === "promo"
                              ? "bg-teal-500/20 text-teal-300 border-teal-500/30 text-[10px]"
                              : "bg-slate-700/60 text-slate-400 border-slate-600/30 text-[10px]"
                          }>
                            {p.tag}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-800/40 rounded-xl p-3">
                    {[
                      { label: "Rate", value: `$${values.rate_per_mover_hour}/hr` },
                      { label: "JC222", value: `$${values.jc222_price}` },
                      { label: "Min Job", value: `$${values.short_job_full}` },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-white font-mono font-bold">{s.value}</p>
                        <p className="text-slate-500 text-[10px]">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5">
                  <label className="text-xs text-slate-400 block mb-2">Notes (optional)</label>
                  <Textarea
                    placeholder="e.g. Summer rate increase — fuel costs up 12%"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white resize-none text-sm"
                    rows={2}
                  />
                </div>

                <Button
                  className="w-full h-12 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-base"
                  onClick={() => applyMutation.mutate()}
                  disabled={applyMutation.isPending}
                >
                  {applyMutation.isPending ? (
                    "Applying…"
                  ) : (
                    <>
                      <Check className="h-5 w-5 mr-2" />
                      Apply Calibration — Save to Database
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        {!applied && (
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                onClick={() => setStep(s => s - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            {!isLast && (
              <Button
                className="flex-1 bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                onClick={() => setStep(s => s + 1)}
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}

        {/* Demand & surge calibration */}
        <div className="mt-8 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-amber-400" />
            <h3 className="text-white text-sm font-bold tracking-wide">Demand & Surge</h3>
            {demandSnapshot && (
              <Badge variant="outline" className={`ml-auto text-[10px] ${
                demandSnapshot.calibration.mode === "full" ? "border-emerald-500/40 text-emerald-300" :
                demandSnapshot.calibration.mode === "soft" ? "border-amber-500/40 text-amber-300" :
                "border-slate-500/40 text-slate-300"
              }`}>
                Mode: {demandSnapshot.calibration.mode}
              </Badge>
            )}
          </div>
          <p className="text-slate-400 text-xs leading-relaxed mb-3">
            Shadow = compute but don't apply (collect data). Soft = apply half the surge delta.
            Full = apply full surge. New deployments default to shadow for the first 100 pipeline runs.
          </p>
          <div className="flex gap-2 mb-4">
            {(["shadow", "soft", "full"] as const).map(m => (
              <Button
                key={m}
                size="sm"
                variant={demandSnapshot?.calibration.mode === m ? "default" : "outline"}
                onClick={() => demandModeMutation.mutate({ mode: m })}
                disabled={demandModeMutation.isPending}
                className="flex-1 capitalize text-xs h-8"
              >
                {m}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300 mb-3">
            <span>Mute crew positioning cards</span>
            <input
              type="checkbox"
              checked={demandSnapshot?.calibration.crewPositioningMuted ?? false}
              onChange={e => demandModeMutation.mutate({ crewPositioningMuted: e.target.checked })}
              className="h-4 w-4 accent-amber-500"
            />
          </div>
          {demandSnapshot && (
            <div className="space-y-1.5">
              {demandSnapshot.zones.map(z => {
                const override = demandSnapshot.calibration.zones?.[z.zoneCode];
                const enabled = override?.enabled !== false;
                const threshold = override?.elevatedThreshold ?? 0.7;
                return (
                  <div key={z.zoneCode} className="flex flex-wrap items-center gap-2 bg-slate-800/40 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{z.zoneName}</p>
                      <p className="text-[10px] text-slate-500">
                        q15m {z.counts.q15m ?? 0} · q60m {z.counts.q60m ?? 0} · active {z.counts.activeJobs ?? 0} · crew online {z.counts.onlineCrew ?? 0}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className={`text-sm font-black ${
                        z.score > 0.7 ? "text-red-400" : z.score > 0.4 ? "text-amber-400" : "text-slate-300"
                      }`}>{Math.round(z.score * 100)}%</p>
                      <p className="text-[10px] text-slate-500">
                        surge {z.surge.multiplier}×{demandSnapshot.calibration.mode !== "full" && ` (theo ${z.surge.theoreticalMultiplier}×)`}
                      </p>
                    </div>
                    <div className="w-full flex items-center justify-between gap-3 pt-1 border-t border-slate-700/40">
                      <label className="flex items-center gap-2 text-[11px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={e => demandModeMutation.mutate({
                            zones: { [z.zoneCode]: { enabled: e.target.checked } },
                          })}
                          className="h-3.5 w-3.5 accent-emerald-500"
                          data-testid={`toggle-zone-${z.zoneCode}`}
                        />
                        Zone enabled
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-slate-400">
                        Elevated threshold
                        <input
                          type="number"
                          step="0.05" min="0.1" max="1.5"
                          value={threshold}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) demandModeMutation.mutate({
                              zones: { [z.zoneCode]: { elevatedThreshold: v } },
                            });
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                          data-testid={`threshold-zone-${z.zoneCode}`}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom Zones */}
        <CustomZonesPanel />

        {/* Calibration History */}
        {history.length > 0 && (
          <div className="mt-8">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              Calibration History
            </h3>
            <div className="space-y-2">
              {history.slice(0, 6).map(session => {
                const v = session.values as Partial<CalibrationValues>;
                return (
                  <div
                    key={session.id}
                    className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-mono font-semibold">
                          ${v.rate_per_mover_hour}/hr
                        </span>
                        {v.jc222_price && (
                          <Badge className="bg-teal-500/15 text-teal-300 border-teal-500/30 text-[10px]">
                            JC222 ${v.jc222_price}
                          </Badge>
                        )}
                        {session.applied_by_name && (
                          <span className="text-slate-500 text-xs">{session.applied_by_name}</span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {new Date(session.applied_at).toLocaleString()}
                        {session.notes && ` · ${session.notes}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white shrink-0"
                      onClick={() => handleRestoreFromHistory(session)}
                      title="Restore these values"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminZone {
  id: number;
  code: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMi: number;
  active: boolean;
}

function CustomZonesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ zones: AdminZone[] }>({
    queryKey: ["/api/admin/zones"],
  });

  const [draft, setDraft] = useState({
    code: "", name: "", centerLat: "", centerLng: "", radiusMi: "25",
  });
  const [edits, setEdits] = useState<Record<number, Partial<AdminZone>>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/zones"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/demand"] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/zones", {
        code: draft.code,
        name: draft.name,
        centerLat: parseFloat(draft.centerLat),
        centerLng: parseFloat(draft.centerLng),
        radiusMi: parseFloat(draft.radiusMi),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Create failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDraft({ code: "", name: "", centerLat: "", centerLng: "", radiusMi: "25" });
      invalidate();
      toast({ title: "Zone created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<AdminZone> }) => {
      const res = await apiRequest("PATCH", `/api/admin/zones/${id}`, patch);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      setEdits(prev => { const n = { ...prev }; delete n[vars.id]; return n; });
      invalidate();
      toast({ title: "Zone saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/zones/${id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Zone removed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const zones = data?.zones ?? [];

  return (
    <div className="mt-8 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5" data-testid="custom-zones-panel">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4 text-emerald-400" />
        <h3 className="text-white text-sm font-bold tracking-wide">Custom Zones</h3>
        <Badge variant="outline" className="ml-auto text-[10px] border-slate-600 text-slate-400">
          {zones.length} configured
        </Badge>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed mb-4">
        Add neighborhoods, split high-volume zones, or re-draw boundaries without a code release.
        Demand scoring, surge pricing, and dispatch territory checks all read from this list.
      </p>

      {/* Create new */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Input
            placeholder="CODE"
            value={draft.code}
            onChange={e => setDraft(d => ({ ...d, code: e.target.value.toUpperCase() }))}
            className="bg-slate-900 border-slate-700 text-white text-xs h-9 col-span-1"
            data-testid="input-new-zone-code"
          />
          <Input
            placeholder="Display name"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="bg-slate-900 border-slate-700 text-white text-xs h-9 col-span-2"
            data-testid="input-new-zone-name"
          />
          <Input
            type="number" step="0.0001" placeholder="Lat"
            value={draft.centerLat}
            onChange={e => setDraft(d => ({ ...d, centerLat: e.target.value }))}
            className="bg-slate-900 border-slate-700 text-white text-xs h-9"
            data-testid="input-new-zone-lat"
          />
          <Input
            type="number" step="0.0001" placeholder="Lng"
            value={draft.centerLng}
            onChange={e => setDraft(d => ({ ...d, centerLng: e.target.value }))}
            className="bg-slate-900 border-slate-700 text-white text-xs h-9"
            data-testid="input-new-zone-lng"
          />
          <Input
            type="number" step="0.5" min="0.5" placeholder="Mi"
            value={draft.radiusMi}
            onChange={e => setDraft(d => ({ ...d, radiusMi: e.target.value }))}
            className="bg-slate-900 border-slate-700 text-white text-xs h-9"
            data-testid="input-new-zone-radius"
          />
        </div>
        <Button
          size="sm"
          className="mt-2 w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !draft.code || !draft.name || !draft.centerLat || !draft.centerLng}
          data-testid="button-create-zone"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {createMut.isPending ? "Adding…" : "Add zone"}
        </Button>
      </div>

      {/* Existing zones */}
      {isLoading ? (
        <p className="text-slate-500 text-xs">Loading…</p>
      ) : zones.length === 0 ? (
        <p className="text-slate-500 text-xs italic">No zones yet — add your first one above.</p>
      ) : (
        <div className="space-y-2">
          {zones.map(z => {
            const e = edits[z.id] ?? {};
            const v = { ...z, ...e };
            const dirty = Object.keys(e).length > 0;
            const setField = (k: keyof AdminZone, val: any) =>
              setEdits(prev => ({ ...prev, [z.id]: { ...prev[z.id], [k]: val } }));
            return (
              <div
                key={z.id}
                className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3"
                data-testid={`zone-row-${z.code}`}
              >
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
                  <div className="col-span-1">
                    <p className="text-[10px] text-slate-500 mb-0.5">Code</p>
                    <p className="font-mono text-white text-xs font-bold">{v.code}</p>
                  </div>
                  <Input
                    value={v.name}
                    onChange={ev => setField("name", ev.target.value)}
                    className="bg-slate-900 border-slate-700 text-white text-xs h-9 col-span-2"
                    data-testid={`input-zone-name-${z.code}`}
                  />
                  <Input
                    type="number" step="0.0001"
                    value={v.centerLat}
                    onChange={ev => setField("centerLat", parseFloat(ev.target.value))}
                    className="bg-slate-900 border-slate-700 text-white text-xs h-9"
                    data-testid={`input-zone-lat-${z.code}`}
                  />
                  <Input
                    type="number" step="0.0001"
                    value={v.centerLng}
                    onChange={ev => setField("centerLng", parseFloat(ev.target.value))}
                    className="bg-slate-900 border-slate-700 text-white text-xs h-9"
                    data-testid={`input-zone-lng-${z.code}`}
                  />
                  <Input
                    type="number" step="0.5" min="0.5"
                    value={v.radiusMi}
                    onChange={ev => setField("radiusMi", parseFloat(ev.target.value))}
                    className="bg-slate-900 border-slate-700 text-white text-xs h-9"
                    data-testid={`input-zone-radius-${z.code}`}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/40">
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={v.active !== false}
                      onChange={ev => setField("active", ev.target.checked)}
                      className="h-3.5 w-3.5 accent-emerald-500"
                      data-testid={`toggle-active-${z.code}`}
                    />
                    Active (used by demand + dispatch)
                  </label>
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <Button
                        size="sm"
                        className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                        onClick={() => updateMut.mutate({ id: z.id, patch: e })}
                        disabled={updateMut.isPending}
                        data-testid={`button-save-${z.code}`}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                      onClick={() => {
                        if (confirm(`Delete zone "${z.name}"? This cannot be undone.`)) {
                          deleteMut.mutate(z.id);
                        }
                      }}
                      disabled={deleteMut.isPending}
                      data-testid={`button-delete-${z.code}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
