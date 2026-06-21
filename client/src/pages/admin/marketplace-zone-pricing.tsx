import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Map, Save, Settings2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ZoneRate = {
  id: string;
  zoneId: string;
  serviceCode: string;
  serviceLabel: string;
  crewSize: number;
  hourlyRate: string | number;
  minimumHours: string | number;
  discountAfterHours: string | number | null;
  discountedHourlyRate: string | number | null;
  active: boolean;
};

type PricingZone = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  priority: number;
  travelBaseFee: string | number;
  travelPerMile: string | number;
  estimatePaddingPct: string | number;
  rates: ZoneRate[];
};

type ZonesResponse = {
  zones: PricingZone[];
};

type PreviewResponse = {
  matched: boolean;
  reason?: string;
  zone?: {
    id: string;
    code: string;
    name: string;
  };
  serviceCode: string;
  crewSize: number;
  requestedHours: number;
  billableHours: number;
  hourlyRate: number;
  discountedHourlyRate?: number | null;
  laborSubtotal: number;
  travelFee: number;
  subtotal: number;
  minEstimate: number;
  maxEstimate: number;
  estimateLabel: string;
};

const SERVICE_OPTIONS = [
  { code: "load_unload", label: "Load/Unload" },
  { code: "pack_unpack", label: "Pack/Unpack" },
  { code: "delivery", label: "Delivery" },
  { code: "ubox", label: "U-Box Style" },
];

function money(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "$0.00";
}

function numberValue(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function MarketplaceZonePricingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState({
    zip: "49938",
    serviceCode: "load_unload",
    crewSize: "2",
    hours: "3",
    distanceMiles: "0",
  });
  const [rateDrafts, setRateDrafts] = useState<Record<string, Partial<ZoneRate>>>({});

  const zonesQuery = useQuery<ZonesResponse>({
    queryKey: ["/api/admin/marketplace/pricing-zones"],
  });

  const zones = zonesQuery.data?.zones ?? [];
  const activeZone = zones[0] ?? null;
  const selectedService = useMemo(
    () => SERVICE_OPTIONS.find((s) => s.code === preview.serviceCode) ?? SERVICE_OPTIONS[0],
    [preview.serviceCode],
  );

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketplace/quote-preview", {
        zip: preview.zip,
        serviceCode: preview.serviceCode,
        crewSize: Number(preview.crewSize),
        hours: Number(preview.hours),
        distanceMiles: Number(preview.distanceMiles || 0),
      });
      return res.json() as Promise<PreviewResponse>;
    },
  });

  const rateMutation = useMutation({
    mutationFn: async (rate: ZoneRate) => {
      const draft = rateDrafts[rate.id] ?? {};
      const res = await apiRequest("POST", "/api/admin/marketplace/zone-rates", {
        zoneId: rate.zoneId,
        serviceCode: draft.serviceCode ?? rate.serviceCode,
        serviceLabel: draft.serviceLabel ?? rate.serviceLabel,
        crewSize: Number(draft.crewSize ?? rate.crewSize),
        hourlyRate: Number(draft.hourlyRate ?? rate.hourlyRate),
        minimumHours: Number(draft.minimumHours ?? rate.minimumHours),
        discountAfterHours:
          draft.discountAfterHours === null || draft.discountAfterHours === ""
            ? null
            : Number(draft.discountAfterHours ?? rate.discountAfterHours ?? 0),
        discountedHourlyRate:
          draft.discountedHourlyRate === null || draft.discountedHourlyRate === ""
            ? null
            : Number(draft.discountedHourlyRate ?? rate.discountedHourlyRate ?? 0),
        active: draft.active ?? rate.active,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace/pricing-zones"] });
      toast({ title: "Zone rate saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save rate", description: err.message, variant: "destructive" });
    },
  });

  function draftValue(rate: ZoneRate, key: keyof ZoneRate) {
    return String((rateDrafts[rate.id]?.[key] as string | number | boolean | null | undefined) ?? rate[key] ?? "");
  }

  function updateRateDraft(rate: ZoneRate, patch: Partial<ZoneRate>) {
    setRateDrafts((current) => ({ ...current, [rate.id]: { ...current[rate.id], ...patch } }));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
              <Map className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">Zone Rates</h2>
              <p className="text-sm text-slate-400">
                Polygon zones choose the lowest matching estimate. This editor handles the rate rows now; map drawing comes next.
              </p>
            </div>
          </div>

          {zonesQuery.isLoading ? (
            <p className="mt-6 text-sm text-slate-400">Loading zone pricing...</p>
          ) : zones.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">No zones yet. The server seeds Ironwood Local when pricing initializes.</p>
          ) : (
            <div className="mt-5 space-y-5">
              {zones.map((zone) => (
                <div key={zone.id} className="rounded-lg border border-slate-700 bg-slate-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-white">{zone.name}</p>
                      <p className="text-xs text-slate-500">
                        {zone.code} · padding {numberValue(zone.estimatePaddingPct)}% · travel {money(zone.travelBaseFee)} + {money(zone.travelPerMile)}/mi
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${zone.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                      {zone.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {zone.rates.map((rate) => (
                      <div key={rate.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.2fr_90px_110px_110px_110px_110px_auto] md:items-end">
                        <div>
                          <Label className="text-[11px] text-slate-500">Service</Label>
                          <Input
                            value={draftValue(rate, "serviceLabel")}
                            onChange={(e) => updateRateDraft(rate, { serviceLabel: e.target.value })}
                            className="mt-1 bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Crew</Label>
                          <Input
                            type="number"
                            min="1"
                            value={draftValue(rate, "crewSize")}
                            onChange={(e) => updateRateDraft(rate, { crewSize: Number(e.target.value) })}
                            className="mt-1 bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Hourly</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={draftValue(rate, "hourlyRate")}
                            onChange={(e) => updateRateDraft(rate, { hourlyRate: e.target.value })}
                            className="mt-1 bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Min Hrs</Label>
                          <Input
                            type="number"
                            min="1"
                            step="0.5"
                            value={draftValue(rate, "minimumHours")}
                            onChange={(e) => updateRateDraft(rate, { minimumHours: e.target.value })}
                            className="mt-1 bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Discount At</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={draftValue(rate, "discountAfterHours")}
                            onChange={(e) => updateRateDraft(rate, { discountAfterHours: e.target.value })}
                            className="mt-1 bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Discount Rate</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={draftValue(rate, "discountedHourlyRate")}
                            onChange={(e) => updateRateDraft(rate, { discountedHourlyRate: e.target.value })}
                            className="mt-1 bg-slate-950 border-slate-700 text-white"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={() => rateMutation.mutate(rate)}
                          disabled={rateMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-500"
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-black text-white">Quote Preview</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Test what a customer sees before staff confirms the final quote.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs text-slate-400">ZIP code</Label>
              <Input value={preview.zip} onChange={(e) => setPreview((p) => ({ ...p, zip: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700 text-white" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Service</Label>
              <select
                value={preview.serviceCode}
                onChange={(e) => setPreview((p) => ({ ...p, serviceCode: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white"
              >
                {SERVICE_OPTIONS.map((service) => (
                  <option key={service.code} value={service.code}>{service.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Crew size</Label>
                <Input type="number" min="1" value={preview.crewSize} onChange={(e) => setPreview((p) => ({ ...p, crewSize: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700 text-white" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Hours</Label>
                <Input type="number" min="1" step="0.5" value={preview.hours} onChange={(e) => setPreview((p) => ({ ...p, hours: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Travel miles outside zone</Label>
              <Input type="number" min="0" value={preview.distanceMiles} onChange={(e) => setPreview((p) => ({ ...p, distanceMiles: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700 text-white" />
            </div>
            <Button
              type="button"
              className="w-full bg-orange-600 hover:bg-orange-500"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? "Previewing..." : "Preview Estimate"}
            </Button>
          </div>

          {previewMutation.data && (
            <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-300">
                {previewMutation.data.matched ? previewMutation.data.zone?.name : "Quote review"}
              </p>
              <p className="mt-1 text-3xl font-black text-white">{previewMutation.data.estimateLabel}</p>
              <div className="mt-3 space-y-1 text-xs text-emerald-100/80">
                <p>{selectedService.label} · {previewMutation.data.crewSize} crew · {previewMutation.data.billableHours} billable hours</p>
                <p>Labor {money(previewMutation.data.laborSubtotal)} · travel {money(previewMutation.data.travelFee)}</p>
              </div>
            </div>
          )}

          {previewMutation.error && (
            <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {(previewMutation.error as Error).message}
            </div>
          )}

          {activeZone && (
            <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-400">
              <p className="flex items-center gap-2 font-bold text-slate-200">
                <Settings2 className="h-4 w-4" />
                Current working zone
              </p>
              <p className="mt-1">{activeZone.name} is seeded as the local Ironwood-style zone. Polygon drawing and additional city zones can now attach to this same rate model.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
