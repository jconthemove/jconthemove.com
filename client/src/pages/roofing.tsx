import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Home,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressField from "@/components/AddressField";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { buildBookHref } from "@/lib/servicePagePrefill";

const SERVICES = [
  { short: "Repair", label: "Leak Repair", desc: "Stop active leaks before they damage insulation, drywall, and framing." },
  { short: "Replace", label: "Full Replacement", desc: "Shingles or metal systems with tear-off, install, and cleanup." },
  { short: "Inspect", label: "Inspection", desc: "Annual, pre-sale, or storm follow-up roof checks." },
  { short: "Storm", label: "Storm Damage", desc: "Scope support for insurance-ready documentation and next steps." },
  { short: "Trim", label: "Soffit and Fascia", desc: "Edge repairs, ventilation issues, and wood rot cleanup." },
];

const ALL_INCLUDES = [
  "Free on-site inspection and estimate confirmation",
  "Licensed, insured crew planning",
  "Tear-off and disposal scope saved into the booking",
  "Upgrade selections carried into ops review",
];

const FAQS = [
  { q: "Does roofing still need a call after booking?", a: "Yes. Roofing now enters the shared /book flow, but it stays call-to-schedule so the team can verify access, scope, and materials." },
  { q: "Is this a locked final quote?", a: "Not yet. The helper gives a rough pricing anchor that is reviewed and confirmed after inspection." },
  { q: "Can I still request premium upgrades?", a: "Yes. Both margin add-ons are stored on the booking item so the ops team sees them immediately." },
];

const MATERIAL_OPTIONS = [
  { value: "architectural_shingles", label: "Architectural shingles", ratePerSquare: 475 },
  { value: "metal_roofing", label: "Metal roofing", ratePerSquare: 760 },
  { value: "flat_roof", label: "Flat / low-slope roofing", ratePerSquare: 640 },
];

const STORY_OPTIONS = [
  { value: "1", label: "1 story", multiplier: 1 },
  { value: "2", label: "2 story", multiplier: 1.08 },
  { value: "3", label: "3+ story", multiplier: 1.16 },
];

const PITCH_OPTIONS = [
  { value: "low", label: "Low pitch", multiplier: 1 },
  { value: "standard", label: "Standard pitch", multiplier: 1.08 },
  { value: "steep", label: "Steep pitch", multiplier: 1.18 },
  { value: "very_steep", label: "Very steep / tricky access", multiplier: 1.28 },
];

const TEAR_OFF_OPTIONS = [
  { value: "none", label: "No tear-off needed", addPerSquare: 0 },
  { value: "single_layer", label: "Single-layer tear-off", addPerSquare: 65 },
  { value: "double_layer", label: "Double-layer tear-off", addPerSquare: 110 },
];

const theme = getPlacardTheme("roofing");

function roundToNearestFifty(value: number) {
  return Math.round(value / 50) * 50;
}

export default function RoofingPage() {
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [serviceAddress, setServiceAddress] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [roofSquares, setRoofSquares] = useState(24);
  const [material, setMaterial] = useState("architectural_shingles");
  const [stories, setStories] = useState("1");
  const [pitch, setPitch] = useState("standard");
  const [tearOff, setTearOff] = useState("single_layer");
  const [fastSchedule, setFastSchedule] = useState(false);
  const [premiumIceShield, setPremiumIceShield] = useState(false);

  const estimate = useMemo(() => {
    const safeSquares = Math.max(5, Math.min(150, Number(roofSquares) || 0));
    const materialCfg = MATERIAL_OPTIONS.find((option) => option.value === material) || MATERIAL_OPTIONS[0];
    const storyCfg = STORY_OPTIONS.find((option) => option.value === stories) || STORY_OPTIONS[0];
    const pitchCfg = PITCH_OPTIONS.find((option) => option.value === pitch) || PITCH_OPTIONS[1];
    const tearOffCfg = TEAR_OFF_OPTIONS.find((option) => option.value === tearOff) || TEAR_OFF_OPTIONS[1];

    const materialBase = safeSquares * materialCfg.ratePerSquare;
    const accessAdjusted = materialBase * storyCfg.multiplier * pitchCfg.multiplier;
    const tearOffTotal = safeSquares * tearOffCfg.addPerSquare;
    const addonsTotal = (fastSchedule ? 1000 : 0) + (premiumIceShield ? 1000 : 0);
    const finalPrice = roundToNearestFifty(accessAdjusted + tearOffTotal + addonsTotal);

    return {
      safeSquares,
      materialLabel: materialCfg.label,
      storyLabel: storyCfg.label,
      pitchLabel: pitchCfg.label,
      basePrice: roundToNearestFifty(accessAdjusted),
      tearOffLabel: tearOffCfg.label,
      tearOffTotal,
      addonsTotal,
      finalPrice,
      pricePerSquare: Math.round(finalPrice / safeSquares),
      roofAreaSqFt: safeSquares * 100,
    };
  }, [fastSchedule, material, pitch, premiumIceShield, roofSquares, stories, tearOff]);

  function handleBooking() {
    setLocation(buildBookHref({
      service: "roofing",
      address: serviceAddress,
      label: "Roofing Estimate",
      price: estimate.finalPrice,
      details: {
        roofSquares: estimate.safeSquares,
        roofAreaSqFt: estimate.roofAreaSqFt,
        roofingCurrentType: material,
        roofingStories: stories,
        roofingPitch: pitch,
        roofingTearOff: tearOff,
        roofingMaterials: estimate.materialLabel,
        fastSchedule,
        premiumIceShield,
        scope: `${estimate.safeSquares} squares | ${estimate.materialLabel} | ${estimate.storyLabel} | ${estimate.pitchLabel}`,
        notes: [
          `Roofing quote helper estimate: $${estimate.finalPrice.toLocaleString()}.`,
          `Tear-off assumption: ${estimate.tearOffLabel}.`,
          fastSchedule ? "Fast Schedule Upgrade selected (+$1,000)." : null,
          premiumIceShield ? "Premium Ice Shield Upgrade selected (+$1,000)." : null,
        ].filter(Boolean).join(" "),
      },
    }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 text-white">
      <div className="mx-auto max-w-[480px] space-y-5 px-4 pt-4">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <ServicePlacard
          theme={theme}
          tagline="Licensed and Insured"
          headline="ROOFING"
          subheadline="QUOTE HELPER"
          bodyText="Rough pricing now, shared booking next, and a real inspection before the schedule gets locked."
          featuresLabel="What This Flow Carries"
          features={ALL_INCLUDES.slice(0, 3)}
          stats={[
            { icon: Clock, value: "1-3 days", label: "typical install" },
            { icon: Users, value: "2-4 crew", label: "per project" },
            { icon: Home, value: "Free", label: "inspection" },
          ]}
          howItWorks={[
            { step: "1", label: "Enter roof size and access factors" },
            { step: "2", label: "Add margin upgrades" },
            { step: "3", label: "Send estimate into booking" },
          ]}
          cta={{
            label: "Use Quote Helper",
            onClick: () => document.getElementById("roofing-quote-helper")?.scrollIntoView({ behavior: "smooth", block: "start" }),
            phoneNumber: "+19062859312",
            colorClass: "bg-stone-600 hover:bg-stone-500",
          }}
        />

        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            Jobs outside Ironwood or Gogebic County can require an estimate deposit. If that applies, the team will confirm it during follow-up.
          </p>
        </div>

        <section id="roofing-quote-helper" className="space-y-4 rounded-[28px] border border-yellow-500/20 bg-gradient-to-br from-stone-900 via-zinc-900 to-black p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-yellow-500/15 p-2">
              <Calculator className="h-4 w-4 text-yellow-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-yellow-400/80">Quote Helper</p>
              <h2 className="text-lg font-black text-white">Instant Roofing Estimate</h2>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div>
              <Label className="text-xs text-zinc-400">Project address</Label>
              <AddressField
                value={serviceAddress}
                onChange={setServiceAddress}
                city={addressCity}
                state={addressState}
                zip={addressZip}
                onCityChange={setAddressCity}
                onStateChange={setAddressState}
                onZipChange={setAddressZip}
                onResolved={(place) => setServiceAddress(place.fullAddress)}
                placeholder="123 Main St, Ironwood, MI"
                theme="zinc"
                showManualFields={false}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="roof-squares" className="text-xs text-zinc-400">Roof size (squares)</Label>
                <Input
                  id="roof-squares"
                  type="number"
                  min={5}
                  max={150}
                  value={roofSquares}
                  onChange={(event) => setRoofSquares(Math.max(5, Number(event.target.value) || 5))}
                  className="mt-1 border-zinc-700 bg-zinc-900 text-white"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-400">Material</Label>
                <select
                  value={material}
                  onChange={(event) => setMaterial(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                >
                  {MATERIAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-zinc-400">Stories</Label>
                <select
                  value={stories}
                  onChange={(event) => setStories(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                >
                  {STORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-zinc-400">Pitch</Label>
                <select
                  value={pitch}
                  onChange={(event) => setPitch(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                >
                  {PITCH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Existing roof condition</Label>
              <select
                value={tearOff}
                onChange={(event) => setTearOff(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
              >
                {TEAR_OFF_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-300" />
              <p className="text-sm font-bold text-yellow-100">Advanced Margin Add-Ons</p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-black/30 px-3 py-3">
              <Checkbox
                checked={fastSchedule}
                onCheckedChange={(checked) => setFastSchedule(checked === true)}
                className="mt-0.5 border-yellow-400 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
              />
              <div>
                <p className="text-sm font-semibold text-white">Fast Schedule Upgrade (+$1,000)</p>
                <p className="text-xs text-zinc-400">Push the job higher in the scheduling stack when timing matters.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-black/30 px-3 py-3">
              <Checkbox
                checked={premiumIceShield}
                onCheckedChange={(checked) => setPremiumIceShield(checked === true)}
                className="mt-0.5 border-yellow-400 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
              />
              <div>
                <p className="text-sm font-semibold text-white">Premium Ice Shield Upgrade (+$1,000)</p>
                <p className="text-xs text-zinc-400">Adds a premium protection package for higher-risk edges and valleys.</p>
              </div>
            </label>
          </div>

          <div className="space-y-3 rounded-[24px] border border-zinc-800 bg-black/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Estimated Total</p>
                <p className="text-3xl font-black text-white">${estimate.finalPrice.toLocaleString()}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  About ${estimate.pricePerSquare}/square for {estimate.safeSquares} squares
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-widest text-emerald-300">Roof Area</p>
                <p className="text-sm font-bold text-emerald-200">{estimate.roofAreaSqFt.toLocaleString()} sq ft</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-zinc-500">Base build</p>
                <p className="mt-1 font-semibold text-white">${estimate.basePrice.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-zinc-500">Tear-off impact</p>
                <p className="mt-1 font-semibold text-white">${estimate.tearOffTotal.toLocaleString()}</p>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <div>
                  <p className="text-zinc-500">Upgrades added</p>
                  <p className="mt-1 font-semibold text-white">${estimate.addonsTotal.toLocaleString()}</p>
                </div>
                <Shield className="h-4 w-4 text-yellow-300" />
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Rough pricing only. The booking flow will mark this as a callback service so the team can verify inspection details before scheduling.
            </p>

            <Button
              onClick={handleBooking}
              disabled={!serviceAddress.trim()}
              className="h-12 w-full rounded-2xl bg-yellow-500 font-black text-black hover:bg-yellow-400"
            >
              Lock My Spot
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </section>

        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">What We Handle</h2>
          <div className="space-y-2">
            {SERVICES.map((service) => (
              <div key={service.label} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                <span className="min-w-[72px] text-xs font-black uppercase tracking-widest text-stone-300">{service.short}</span>
                <div>
                  <p className="text-sm font-bold text-zinc-200">{service.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{service.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Included</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
              <span className="text-sm text-zinc-300">{item}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, index) => (
            <div key={faq.q} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-zinc-200">{faq.q}</span>
                <span className="text-lg text-zinc-600">{openFaq === index ? "-" : "+"}</span>
              </button>
              {openFaq === index && (
                <div className="px-4 pb-3">
                  <p className="text-sm text-zinc-400">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
