import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, ChevronLeft, CheckCircle2, Clock, Home, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AddressField from "@/components/AddressField";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { buildBookHref } from "@/lib/servicePagePrefill";

const PACKAGE_OPTIONS = [
  { id: "standard", label: "Standard Clean", desc: "Quick turnover reset for already-maintained spaces.", price: 120 },
  { id: "deep", label: "Deep Clean", desc: "Top-to-bottom reset with appliances, baseboards, and cabinets.", price: 220 },
  { id: "premium", label: "Premium Clean", desc: "Deep clean plus extra detail work for tough move-outs.", price: 350 },
];

const SIZE_OPTIONS = [
  { id: "studio", label: "Studio / 1 bed", add: 0 },
  { id: "two_bed", label: "2-3 bedroom", add: 60 },
  { id: "large_home", label: "4+ bedroom or multi-level", add: 140 },
];

const ADDON_OPTIONS = [
  { id: "inside_fridge", label: "Inside fridge / oven", price: 40 },
  { id: "pet_hair", label: "Heavy pet hair", price: 35 },
  { id: "garage", label: "Garage or basement sweep-out", price: 55 },
];

const ALL_INCLUDES = [
  "Move-cleaning details stored with the shared booking item",
  "Address and estimate handed off through the same /book flow",
  "Space for entry codes, walkthrough notes, and timing requests",
  "Cleaner scheduling routed through the standard booking system",
];

const FAQS = [
  { q: "Should this page use cleaning or move_cleaning?", a: "This flow now books directly into the move_cleaning service code so the page matches the actual offer." },
  { q: "Do you bring supplies?", a: "Yes. Crews bring standard cleaning products and tools for normal move-in and move-out work." },
  { q: "Can I request appliance interiors?", a: "Yes. Those can be added here so the quote and booking both reflect the extra scope." },
];

const theme = getPlacardTheme("cleaning");

function roundToNearestTen(value: number) {
  return Math.round(value / 10) * 10;
}

export default function MoveOutCleaningPage() {
  const [, setLocation] = useLocation();
  const [serviceAddress, setServiceAddress] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [packageId, setPackageId] = useState("deep");
  const [sizeId, setSizeId] = useState("two_bed");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const estimate = useMemo(() => {
    const selectedPackage = PACKAGE_OPTIONS.find((option) => option.id === packageId) || PACKAGE_OPTIONS[1];
    const selectedSize = SIZE_OPTIONS.find((option) => option.id === sizeId) || SIZE_OPTIONS[1];
    const addonTotal = ADDON_OPTIONS
      .filter((option) => selectedAddons.includes(option.id))
      .reduce((sum, option) => sum + option.price, 0);

    return {
      selectedPackage,
      selectedSize,
      addonTotal,
      total: roundToNearestTen(selectedPackage.price + selectedSize.add + addonTotal),
    };
  }, [packageId, selectedAddons, sizeId]);

  function toggleAddon(addonId: string) {
    setSelectedAddons((current) =>
      current.includes(addonId)
        ? current.filter((id) => id !== addonId)
        : [...current, addonId],
    );
  }

  function handleBooking() {
    const selectedAddonLabels = ADDON_OPTIONS
      .filter((option) => selectedAddons.includes(option.id))
      .map((option) => option.label);

    setLocation(buildBookHref({
      service: "move_cleaning",
      address: serviceAddress,
      label: "Move Cleaning Estimate",
      price: estimate.total,
      details: {
        cleaningPackage: estimate.selectedPackage.label,
        cleaningHomeSize: estimate.selectedSize.label,
        cleaningAddons: selectedAddonLabels,
        scope: `${estimate.selectedPackage.label} for ${estimate.selectedSize.label.toLowerCase()}`,
        notes: [
          selectedAddonLabels.length ? `Requested cleaning add-ons: ${selectedAddonLabels.join(", ")}.` : null,
          "Move-in / move-out service page handoff.",
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
          tagline="Move-In / Move-Out"
          headline="CLEAN"
          subheadline="TURNOVER"
          bodyText="This page now feeds one booking system instead of a separate chatbot funnel."
          featuresLabel="What Carries Into Booking"
          features={ALL_INCLUDES.slice(0, 3)}
          stats={[
            { icon: Clock, value: "2-8 hrs", label: "depending on size" },
            { icon: Users, value: "1-3 crew", label: "per job" },
            { icon: Sparkles, value: "From $120", label: "starting point" },
          ]}
          howItWorks={[
            { step: "1", label: "Choose the clean level" },
            { step: "2", label: "Add size and detail work" },
            { step: "3", label: "Finish inside booking" },
          ]}
          cta={{
            label: "Build My Cleaning Quote",
            onClick: () => document.getElementById("cleaning-quote-helper")?.scrollIntoView({ behavior: "smooth", block: "start" }),
            phoneNumber: "+19062859312",
            colorClass: "bg-teal-700 hover:bg-teal-600",
          }}
        />

        <section id="cleaning-quote-helper" className="space-y-4 rounded-[28px] border border-teal-500/20 bg-zinc-900/85 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-300">Quote Helper</p>
            <h2 className="text-lg font-black text-white">Instant Move Cleaning Estimate</h2>
          </div>

          <div>
            <Label className="text-xs text-zinc-400">Service address</Label>
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

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Cleaning package</Label>
            {PACKAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPackageId(option.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  packageId === option.id
                    ? "border-teal-400 bg-teal-500/10"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{option.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{option.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-teal-300">From ${option.price}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Home size</Label>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSizeId(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    sizeId === option.id
                      ? "border-teal-400 bg-teal-500/10 text-teal-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Detail add-ons</Label>
            {ADDON_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{option.label}</p>
                  <p className="text-xs text-zinc-400">Adds detail work before or after the move.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-teal-300">+${option.price}</span>
                  <input
                    type="checkbox"
                    checked={selectedAddons.includes(option.id)}
                    onChange={() => toggleAddon(option.id)}
                    className="h-4 w-4"
                  />
                </div>
              </label>
            ))}
          </div>

          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-4">
            <p className="text-xs uppercase tracking-widest text-teal-200">Estimated Clean</p>
            <p className="mt-1 text-3xl font-black text-white">${estimate.total}</p>
            <p className="mt-2 text-xs text-zinc-300">
              Final labor timing can shift after we review property condition, access, and any extra rooms.
            </p>
          </div>

          <Button
            onClick={handleBooking}
            disabled={!serviceAddress.trim()}
            className="h-12 w-full rounded-2xl bg-teal-500 font-black text-black hover:bg-teal-400"
          >
            Continue To Booking
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Included</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-teal-400" />
              <span className="text-sm text-zinc-300">{item}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-200">{faq.q}</p>
              <p className="mt-1 text-sm text-zinc-400">{faq.a}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div>
            <Home className="mx-auto h-4 w-4 text-teal-300" />
            <p className="mt-2 text-xs text-zinc-300">Correct service code</p>
          </div>
          <div>
            <Users className="mx-auto h-4 w-4 text-teal-300" />
            <p className="mt-2 text-xs text-zinc-300">Ops-ready notes</p>
          </div>
          <div>
            <Sparkles className="mx-auto h-4 w-4 text-teal-300" />
            <p className="mt-2 text-xs text-zinc-300">Estimate in review step</p>
          </div>
        </div>
      </div>
    </div>
  );
}
