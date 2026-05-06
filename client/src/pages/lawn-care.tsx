import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Calendar, ChevronLeft, CheckCircle2, Clock, Leaf, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AddressField from "@/components/AddressField";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { buildBookHref } from "@/lib/servicePagePrefill";

const PACKAGE_OPTIONS = [
  { id: "basic", label: "Basic Cut", desc: "Mow and blow for maintained lawns.", price: 45 },
  { id: "standard", label: "Standard Yard", desc: "Mow, trim, edge, and cleanup.", price: 75 },
  { id: "premium", label: "Premium Curb Appeal", desc: "Standard service plus light hedge and seasonal touch-up.", price: 130 },
];

const PROPERTY_OPTIONS = [
  { id: "small", label: "Small lot", multiplier: 1 },
  { id: "medium", label: "Average residential", multiplier: 1.2 },
  { id: "large", label: "Large or corner lot", multiplier: 1.55 },
];

const FREQUENCY_OPTIONS = [
  { id: "one_time", label: "One time", adjustment: 15 },
  { id: "weekly", label: "Weekly", adjustment: -10 },
  { id: "biweekly", label: "Biweekly", adjustment: 0 },
];

const ADDON_OPTIONS = [
  { id: "leaf_cleanup", label: "Leaf cleanup", price: 35 },
  { id: "bed_edges", label: "Bed edging", price: 25 },
  { id: "hedge_trim", label: "Hedge trim", price: 45 },
];

const ALL_INCLUDES = [
  "Arrival window confirmed after booking",
  "Mow, trim, and blow-off service notes stored with the booking",
  "Recurring frequency support inside the shared booking flow",
  "Room for gate codes, pet notes, and special instructions",
];

const FAQS = [
  { q: "Can I request recurring service?", a: "Yes. Weekly and biweekly plans both carry into booking so the ops team sees your preferred frequency." },
  { q: "Do you bring your own equipment?", a: "Yes. Crews arrive with the mowing, trimming, and cleanup gear needed for standard residential jobs." },
  { q: "Can I add hedges or cleanup later?", a: "Yes. Add-ons selected here are stored on the booking, and you can also add notes during checkout." },
];

const theme = getPlacardTheme("lawn");

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

export default function LawnCarePage() {
  const [, setLocation] = useLocation();
  const [serviceAddress, setServiceAddress] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [packageId, setPackageId] = useState("standard");
  const [propertyId, setPropertyId] = useState("medium");
  const [frequency, setFrequency] = useState("weekly");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const estimate = useMemo(() => {
    const selectedPackage = PACKAGE_OPTIONS.find((option) => option.id === packageId) || PACKAGE_OPTIONS[1];
    const selectedProperty = PROPERTY_OPTIONS.find((option) => option.id === propertyId) || PROPERTY_OPTIONS[1];
    const selectedFrequency = FREQUENCY_OPTIONS.find((option) => option.id === frequency) || FREQUENCY_OPTIONS[1];
    const addonTotal = ADDON_OPTIONS
      .filter((option) => selectedAddons.includes(option.id))
      .reduce((sum, option) => sum + option.price, 0);
    const total = roundToNearestFive((selectedPackage.price * selectedProperty.multiplier) + selectedFrequency.adjustment + addonTotal);

    return {
      selectedPackage,
      selectedProperty,
      selectedFrequency,
      addonTotal,
      total,
    };
  }, [frequency, packageId, propertyId, selectedAddons]);

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
      service: "lawn_care",
      address: serviceAddress,
      label: "Lawn Care Estimate",
      price: estimate.total,
      details: {
        lawnPackage: estimate.selectedPackage.label,
        lawnPropertySize: estimate.selectedProperty.label,
        lawnFrequency: estimate.selectedFrequency.label,
        lawnAddons: selectedAddonLabels,
        scope: `${estimate.selectedPackage.label} for a ${estimate.selectedProperty.label.toLowerCase()} property`,
        notes: [
          `Preferred service cadence: ${estimate.selectedFrequency.label}.`,
          selectedAddonLabels.length ? `Requested add-ons: ${selectedAddonLabels.join(", ")}.` : null,
        ].filter(Boolean).join(" "),
      },
    }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
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
          tagline="Lawn Care"
          headline="YARD"
          subheadline="READY"
          bodyText="Pick the yard package, pass it into booking, and let the team confirm the route."
          featuresLabel="This Flow Now Includes"
          features={ALL_INCLUDES.slice(0, 3)}
          stats={[
            { icon: Clock, value: "45-180 min", label: "typical visit" },
            { icon: Users, value: "1-2 crew", label: "per stop" },
            { icon: Calendar, value: "Weekly", label: "plans supported" },
          ]}
          howItWorks={[
            { step: "1", label: "Set property size and package" },
            { step: "2", label: "Choose frequency and add-ons" },
            { step: "3", label: "Continue into booking" },
          ]}
          cta={{
            label: "Build My Lawn Quote",
            onClick: () => document.getElementById("lawn-quote-helper")?.scrollIntoView({ behavior: "smooth", block: "start" }),
            phoneNumber: "+19062859312",
            colorClass: "bg-green-700 hover:bg-green-600",
          }}
        />

        <section id="lawn-quote-helper" className="space-y-4 rounded-[28px] border border-green-500/20 bg-zinc-900/85 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-green-300">Quote Helper</p>
            <h2 className="text-lg font-black text-white">Instant Lawn Estimate</h2>
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
            <Label className="text-xs text-zinc-400">Package</Label>
            {PACKAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPackageId(option.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  packageId === option.id
                    ? "border-green-400 bg-green-500/10"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{option.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{option.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-green-300">From ${option.price}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Property size</Label>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPropertyId(option.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      propertyId === option.id
                        ? "border-green-400 bg-green-500/10 text-green-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Service frequency</Label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFrequency(option.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      frequency === option.id
                        ? "border-green-400 bg-green-500/10 text-green-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Add-ons</Label>
            {ADDON_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{option.label}</p>
                  <p className="text-xs text-zinc-400">Add to the first visit or recurring plan.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-green-300">+${option.price}</span>
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

          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
            <p className="text-xs uppercase tracking-widest text-green-200">Estimated First Visit</p>
            <p className="mt-1 text-3xl font-black text-white">${estimate.total}</p>
            <p className="mt-2 text-xs text-zinc-300">
              Includes {estimate.selectedPackage.label.toLowerCase()} pricing for a {estimate.selectedProperty.label.toLowerCase()} property.
            </p>
          </div>

          <Button
            onClick={handleBooking}
            disabled={!serviceAddress.trim()}
            className="h-12 w-full rounded-2xl bg-green-500 font-black text-black hover:bg-green-400"
          >
            Continue To Booking
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Included</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
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
            <Leaf className="mx-auto h-4 w-4 text-green-300" />
            <p className="mt-2 text-xs text-zinc-300">Structured yard details</p>
          </div>
          <div>
            <Users className="mx-auto h-4 w-4 text-green-300" />
            <p className="mt-2 text-xs text-zinc-300">Ops-ready handoff</p>
          </div>
          <div>
            <Calendar className="mx-auto h-4 w-4 text-green-300" />
            <p className="mt-2 text-xs text-zinc-300">Recurring flow intact</p>
          </div>
        </div>
      </div>
    </div>
  );
}
