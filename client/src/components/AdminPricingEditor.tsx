import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings, Save, ChevronDown, ChevronUp, RotateCcw, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Pricing {
  ratePerMoverHour: number;
  truckAdd: number;
  driveRate: number;
  shortJobFull: number;
  shortJobRate: number;
  jc222Price: number;
  jc272Price: number;
  jc222Miles: number;
  jc222Minutes: number;
  jc222WeightLimit: number;
  heavyItemFlat: number;
  minHours: Record<number, number>;
  // Specialty item canonical rates
  specialtyPiano: number;
  specialtyHotTub: number;
  specialtySafe: number;
  specialtyPoolTable: number;
  // Weight tiers
  weightLightMax: number;
  weightHeavyMin: number;
  heavyItemFlat: number;
  // Access / difficulty add-on rates
  stairsPerFlight: number;
  longCarryFlat: number;
  elevatorFlat: number;
  tightAccessFlat: number;
  // Distance tier thresholds and rates
  localMilesMax: number;
  regionalMilesMax: number;
  regionalSurchargePerMile: number;
  longDistanceRatePerMile: number;
  longDistanceMinMiles: number;
  // Fuel surcharge
  fuelSurchargeFlat: number;
  fuelSurchargeMinMiles: number;
}

const DEFAULTS = {
  rate_per_mover_hour: "85",
  truck_add: "60",
  drive_rate: "40",
  short_job_full: "300",
  jc222_price: "222",
  jc272_price: "272",
  jc222_miles: "10",
  jc222_minutes: "82",
  jc222_weight_limit: "200",
  heavy_item_flat: "350",
  min_hours_1: "5",
  min_hours_2: "4",
  min_hours_3: "3",
  min_hours_4: "2",
  min_hours_5: "2",
  // Specialty items
  specialty_piano: "200",
  specialty_hot_tub: "250",
  specialty_safe: "175",
  specialty_pool_table: "200",
  // Weight tiers
  weight_light_max: "200",
  weight_heavy_min: "400",
  heavy_item_flat: "100",
  // Access add-ons
  stairs_per_flight: "25",
  long_carry_flat: "50",
  elevator_flat: "30",
  tight_access_flat: "50",
  // Distance tiers
  local_miles_max: "10",
  regional_miles_max: "50",
  regional_surcharge_per_mile: "1",
  long_distance_rate_per_mile: "4",
  long_distance_min_miles: "100",
  // Fuel surcharge
  fuel_surcharge_flat: "0",
  fuel_surcharge_min_miles: "30",
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
  const [difficultyOpen, setDifficultyOpen] = useState(false);

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"] });

  const [draft, setDraft] = useState<typeof DEFAULTS>(DEFAULTS);

  useEffect(() => {
    if (!pricing) return;
    setDraft({
      rate_per_mover_hour: String(pricing.ratePerMoverHour),
      truck_add:           String(pricing.truckAdd),
      drive_rate:          String(pricing.driveRate ?? 40),
      short_job_full:      String(pricing.shortJobFull ?? 300),
      jc222_price:         String(pricing.jc222Price ?? 222),
      jc272_price:         String(pricing.jc272Price ?? 272),
      jc222_miles:         String(pricing.jc222Miles ?? 10),
      jc222_minutes:       String(pricing.jc222Minutes ?? 82),
      jc222_weight_limit:  String(pricing.jc222WeightLimit ?? 200),
      heavy_item_flat:     String(pricing.heavyItemFlat ?? 350),
      min_hours_1:         String(pricing.minHours?.[1] ?? 5),
      min_hours_2:         String(pricing.minHours?.[2] ?? 4),
      min_hours_3:         String(pricing.minHours?.[3] ?? 3),
      min_hours_4:         String(pricing.minHours?.[4] ?? 2),
      min_hours_5:         String(pricing.minHours?.[5] ?? 2),
      // Specialty items
      specialty_piano:      String(pricing.specialtyPiano     ?? 200),
      specialty_hot_tub:    String(pricing.specialtyHotTub    ?? 250),
      specialty_safe:       String(pricing.specialtySafe      ?? 175),
      specialty_pool_table: String(pricing.specialtyPoolTable ?? 200),
      // Weight tiers
      weight_light_max:  String(pricing.weightLightMax  ?? 200),
      weight_heavy_min:  String(pricing.weightHeavyMin  ?? 400),
      heavy_item_flat:   String(pricing.heavyItemFlat   ?? 100),
      // Access add-ons
      stairs_per_flight:   String(pricing.stairsPerFlight   ?? 25),
      long_carry_flat:     String(pricing.longCarryFlat     ?? 50),
      elevator_flat:       String(pricing.elevatorFlat      ?? 30),
      tight_access_flat:   String(pricing.tightAccessFlat   ?? 50),
      // Distance tiers
      local_miles_max:             String(pricing.localMilesMax             ?? 10),
      regional_miles_max:          String(pricing.regionalMilesMax          ?? 50),
      regional_surcharge_per_mile: String(pricing.regionalSurchargePerMile  ?? 1),
      long_distance_rate_per_mile: String(pricing.longDistanceRatePerMile   ?? 4),
      long_distance_min_miles:     String(pricing.longDistanceMinMiles      ?? 100),
      // Fuel surcharge
      fuel_surcharge_flat:      String(pricing.fuelSurchargeFlat     ?? 0),
      fuel_surcharge_min_miles: String(pricing.fuelSurchargeMinMiles ?? 30),
    });
  }, [pricing]);

  const set = (k: keyof typeof DEFAULTS, v: string) =>
    setDraft(d => ({ ...d, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async (values: typeof DEFAULTS) => {
      const entries = Object.entries(values).filter(([, v]) => {
        const n = parseFloat(v);
        return !isNaN(n) && isFinite(n);
      });
      await Promise.all(
        entries.map(([key, value]) =>
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
    if (!confirm("Reset ALL pricing to factory defaults?\n\nRate: $85/mover·hr · Truck: $60 · Drive: $40 · Min job: $300 · JC222: $222 · JC272: $272 · Heavy: $100\n\nThis overwrites your current settings.")) return;
    setResetting(true);
    try {
      await saveMutation.mutateAsync(DEFAULTS);
      setDraft({ ...DEFAULTS });
      toast({ title: "Pricing reset to defaults", description: "Rate $85/hr · Truck $60/hr · Drive $40/hr · Floor $300 · JC222 $222 · JC272 $272 · Heavy $100" });
    } finally {
      setResetting(false);
    }
  }

  const rate = parseFloat(draft.rate_per_mover_hour || "60");
  const floor = parseFloat(draft.short_job_full || "300");
  const jc222 = parseFloat(draft.jc222_price || "222");
  const jc272 = parseFloat(draft.jc272_price || "272");
  const heavyFlat = parseFloat(draft.heavy_item_flat || "350");

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

          {/* Row 1: labor rate */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Rate per mover/hr ($)</label>
            <Input
              type="number"
              value={draft.rate_per_mover_hour}
              onChange={e => set("rate_per_mover_hour", e.target.value)}
              className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
            />
            <p className="text-[10px] text-slate-600 mt-0.5">$85 = current standard rate</p>
          </div>

          {/* Row 2: truck + drive rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Truck add-on/hr ($)</label>
              <Input
                type="number"
                value={draft.truck_add}
                onChange={e => set("truck_add", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">Added when truck is toggled on</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Drive rate/mover/hr ($)</label>
              <Input
                type="number"
                value={draft.drive_rate}
                onChange={e => set("drive_rate", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">Drive time labor rate</p>
            </div>
          </div>

          {/* Row 3: floor + JC222 */}
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
              <p className="text-[10px] text-slate-600 mt-0.5">Local (≤10 mi) — default $222</p>
            </div>
          </div>

          {/* Row 3: JC272 + Heavy Item flat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">JC272 promo price ($)</label>
              <Input
                type="number"
                value={draft.jc272_price}
                onChange={e => set("jc272_price", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">Outside 10 mi — default $272</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Heavy item flat floor ($)</label>
              <Input
                type="number"
                value={draft.heavy_item_flat}
                onChange={e => set("heavy_item_flat", e.target.value)}
                className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">3 movers · 2 hr min — default $350</p>
            </div>
          </div>

          {/* Row 4: Distance threshold + Duration cap + Weight limit */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-semibold">JC Promo Screening Settings</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Distance (mi)</label>
                <Input
                  type="number"
                  value={draft.jc222_miles}
                  onChange={e => set("jc222_miles", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white h-9 text-sm text-center"
                />
                <p className="text-[10px] text-slate-600 mt-0.5">JC222/272 split</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
                <Input
                  type="number"
                  value={draft.jc222_minutes}
                  onChange={e => set("jc222_minutes", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white h-9 text-sm text-center"
                />
                <p className="text-[10px] text-slate-600 mt-0.5">Max total time</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Weight (lbs)</label>
                <Input
                  type="number"
                  value={draft.jc222_weight_limit}
                  onChange={e => set("jc222_weight_limit", e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white h-9 text-sm text-center"
                />
                <p className="text-[10px] text-slate-600 mt-0.5">Light-item limit</p>
              </div>
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
                <span>JC222 Local (≤{draft.jc222_miles} mi)</span>
                <span className="text-amber-400 font-medium">${jc222}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>JC272 Outside {draft.jc222_miles} mi</span>
                <span className="text-amber-400 font-medium">${jc272}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Heavy Item flat floor</span>
                <span className="text-orange-400 font-medium">${heavyFlat}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Promo duration cap</span>
                <span className="text-slate-300">{draft.jc222_minutes} min</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Light-item weight limit</span>
                <span className="text-slate-300">{draft.jc222_weight_limit} lbs</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Min job floor</span>
                <span className="text-slate-300">${floor}</span>
              </div>
            </div>
          </div>

          {/* ── Difficulty & Surcharges section ── */}
          <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <button
              onClick={() => setDifficultyOpen(!difficultyOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-700/40 text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">Difficulty & Surcharges</span>
              </div>
              {difficultyOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
            </button>

            {difficultyOpen && (
              <div className="px-3 py-3 space-y-4 bg-slate-900/40">

                {/* Specialty Item Rates */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">Specialty Item Flat Surcharges ($)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Piano</label>
                      <Input type="number" value={draft.specialty_piano}
                        onChange={e => set("specialty_piano", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Hot Tub</label>
                      <Input type="number" value={draft.specialty_hot_tub}
                        onChange={e => set("specialty_hot_tub", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Heavy Safe (300+ lbs)</label>
                      <Input type="number" value={draft.specialty_safe}
                        onChange={e => set("specialty_safe", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Pool Table</label>
                      <Input type="number" value={draft.specialty_pool_table}
                        onChange={e => set("specialty_pool_table", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">Piano/Hot Tub/Safe → enforces 3-mover min · Pool Table → 2-mover min</p>
                </div>

                {/* Weight Tiers */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">Weight Tiers & Heavy Item Surcharge</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Light max (lbs)</label>
                      <Input type="number" value={draft.weight_light_max}
                        onChange={e => set("weight_light_max", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Heavy min (lbs)</label>
                      <Input type="number" value={draft.weight_heavy_min}
                        onChange={e => set("weight_heavy_min", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Heavy surcharge ($)</label>
                      <Input type="number" value={draft.heavy_item_flat}
                        onChange={e => set("heavy_item_flat", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">Light {'<'} {draft.weight_light_max} lbs · Medium {draft.weight_light_max}–{draft.weight_heavy_min} lbs · Heavy ≥ {draft.weight_heavy_min} lbs (3-mover min + flat surcharge)</p>
                </div>

                {/* Access Add-On Rates */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">Access / Difficulty Add-On Rates ($)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Stairs (per flight)</label>
                      <Input type="number" value={draft.stairs_per_flight}
                        onChange={e => set("stairs_per_flight", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Long Carry ({'>'}75 ft)</label>
                      <Input type="number" value={draft.long_carry_flat}
                        onChange={e => set("long_carry_flat", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Elevator</label>
                      <Input type="number" value={draft.elevator_flat}
                        onChange={e => set("elevator_flat", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Tight Access</label>
                      <Input type="number" value={draft.tight_access_flat}
                        onChange={e => set("tight_access_flat", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">Stairs on a truck job bumps crew minimum +1 automatically</p>
                </div>

                {/* Distance Tiers */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">Distance Tier Thresholds & Rates</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Local max (mi)</label>
                      <Input type="number" value={draft.local_miles_max}
                        onChange={e => set("local_miles_max", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Regional max (mi)</label>
                      <Input type="number" value={draft.regional_miles_max}
                        onChange={e => set("regional_miles_max", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Regional surcharge ($/mi)</label>
                      <Input type="number" value={draft.regional_surcharge_per_mile}
                        onChange={e => set("regional_surcharge_per_mile", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Long distance rate ($/mi)</label>
                      <Input type="number" value={draft.long_distance_rate_per_mile}
                        onChange={e => set("long_distance_rate_per_mile", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] text-slate-500 block mb-1">Long distance min miles (billed)</label>
                      <Input type="number" value={draft.long_distance_min_miles}
                        onChange={e => set("long_distance_min_miles", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Local ≤ {draft.local_miles_max} mi · Regional {draft.local_miles_max}–{draft.regional_miles_max} mi · Long Distance {'>'} {draft.regional_miles_max} mi
                  </p>
                </div>

                {/* Fuel Surcharge */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">Fuel Surcharge</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Flat surcharge ($, 0=off)</label>
                      <Input type="number" value={draft.fuel_surcharge_flat}
                        onChange={e => set("fuel_surcharge_flat", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Trigger distance (mi)</label>
                      <Input type="number" value={draft.fuel_surcharge_min_miles}
                        onChange={e => set("fuel_surcharge_min_miles", e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">Added as a named line item when one-way distance ≥ trigger distance</p>
                </div>

              </div>
            )}
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
            Default: $85/mover/hr · $60 truck · $40 drive · $300 min · $222 JC222 · $272 JC272 · $350 Heavy · 82 min cap · 200 lb limit
          </p>
        </div>
      )}
    </div>
  );
}
