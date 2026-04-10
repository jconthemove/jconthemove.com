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
  FlaskConical, History, RotateCcw, ArrowRight
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
