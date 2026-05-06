import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, CheckCircle2, Clock, Snowflake, Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AddressField from "@/components/AddressField";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { buildBookHref } from "@/lib/servicePagePrefill";

const DRIVEWAY_OPTIONS = [
  { id: "single_short", label: "Single car", desc: "One-car drive and short walk", price: 65 },
  { id: "double_standard", label: "Double car", desc: "Two-car drive with normal frontage", price: 95 },
  { id: "long_or_corner", label: "Long / corner lot", desc: "Long driveway, wider apron, or corner cleanup", price: 140 },
  { id: "custom_commercial", label: "Custom / commercial", desc: "Large lots, apartments, or businesses", price: 0 },
];

const FREQUENCY_OPTIONS = [
  { id: "one_time", label: "One time" },
  { id: "per_storm", label: "Per storm" },
  { id: "seasonal", label: "Seasonal plan" },
];

const ALL_INCLUDES = [
  "Driveway and main walkway clearing",
  "Storm-response scheduling",
  "Salt / de-icer available as an add-on",
  "Text updates when weather gets busy",
];

const FAQS = [
  { q: "Do you offer recurring snow service?", a: "Yes. Per-storm and seasonal plans can both be requested from the booking flow." },
  { q: "Can you do sidewalks and steps too?", a: "Yes. We clear main walkways and can note extra paths, porches, and stairs in your request." },
  { q: "What about commercial lots?", a: "Use the custom option and we will review the property before confirming pricing." },
];

const theme = getPlacardTheme("snow");

export default function SnowRemovalPublicPage() {
  const [, setLocation] = useLocation();
  const [serviceAddress, setServiceAddress] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [drivewayId, setDrivewayId] = useState("double_standard");
  const [frequency, setFrequency] = useState("per_storm");
  const [salt, setSalt] = useState(false);

  const estimate = useMemo(() => {
    const selected = DRIVEWAY_OPTIONS.find((option) => option.id === drivewayId) || DRIVEWAY_OPTIONS[1];
    const frequencyAdjustment = frequency === "seasonal" ? -10 : frequency === "one_time" ? 20 : 0;
    const saltCharge = salt ? 20 : 0;
    const total = selected.price > 0 ? selected.price + frequencyAdjustment + saltCharge : 0;
    return { selected, total: Math.max(0, total) };
  }, [drivewayId, frequency, salt]);

  function handleBooking() {
    const details = {
      snowDrivewaySize: estimate.selected.label,
      snowFrequency: frequency,
      saltRequested: salt,
      scope: `${estimate.selected.label} snow service`,
      notes: [
        frequency === "seasonal" ? "Customer is interested in a seasonal snow plan." : null,
        salt ? "Include salt / de-icer in the quote." : null,
      ].filter(Boolean).join(" "),
    };

    setLocation(buildBookHref({
      service: "snow_removal",
      address: serviceAddress,
      label: estimate.total > 0 ? "Snow Removal Estimate" : "Snow Removal Request",
      price: estimate.total > 0 ? estimate.total : null,
      details,
    }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-[480px] mx-auto px-4 pt-4 space-y-5">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <ServicePlacard
          theme={theme}
          tagline="Seasonal Service"
          headline="SNOW"
          subheadline="READY"
          bodyText="Fast storm response without the phone-tag."
          featuresLabel="Every Visit Includes"
          features={ALL_INCLUDES.slice(0, 3)}
          stats={[
            { icon: Clock, value: "Storm-based", label: "dispatch" },
            { icon: Snowflake, value: "Walks + drive", label: "coverage" },
            { icon: Calendar, value: "Recurring", label: "plans available" },
          ]}
          howItWorks={[
            { step: "1", label: "Pick your driveway size" },
            { step: "2", label: "Choose one-time or recurring" },
            { step: "3", label: "Request your snow slot" },
          ]}
          cta={{
            label: "Start Snow Quote",
            onClick: () => document.getElementById("snow-quote-helper")?.scrollIntoView({ behavior: "smooth", block: "start" }),
            phoneNumber: "+19062859312",
            colorClass: "bg-cyan-700 hover:bg-cyan-600",
          }}
        />

        <section id="snow-quote-helper" className="rounded-3xl border border-cyan-500/20 bg-zinc-900/80 p-4 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Quote Helper</p>
            <h2 className="text-lg font-black text-white">Snow Service Intake</h2>
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
            <Label className="text-xs text-zinc-400">Driveway size</Label>
            {DRIVEWAY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDrivewayId(option.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  drivewayId === option.id
                    ? "border-cyan-400 bg-cyan-500/10"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white text-sm">{option.label}</p>
                    <p className="text-xs text-zinc-400 mt-1">{option.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-cyan-300">
                    {option.price > 0 ? `From $${option.price}` : "Custom"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Plan style</Label>
            <div className="flex flex-wrap gap-2">
              {FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFrequency(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    frequency === option.id
                      ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={salt}
              onChange={(e) => setSalt(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-zinc-200">Add salt / de-icer request (+$20 estimated)</span>
          </label>

          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <p className="text-xs uppercase tracking-widest text-cyan-200">Estimated Visit</p>
            <p className="mt-1 text-3xl font-black text-white">
              {estimate.total > 0 ? `$${estimate.total}` : "Custom Quote"}
            </p>
            <p className="text-xs text-zinc-300 mt-2">
              Final pricing is confirmed after we review the address, snowfall expectations, and access notes.
            </p>
          </div>

          <Button
            onClick={handleBooking}
            disabled={!serviceAddress.trim()}
            className="w-full h-12 rounded-2xl bg-cyan-500 text-black hover:bg-cyan-400 font-black"
          >
            Request Snow Service
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Included</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
              <span className="text-zinc-300 text-sm">{item}</span>
            </div>
          ))}
        </div>

        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">FAQs</h2>
          <div className="space-y-2">
            {FAQS.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-200">{faq.q}</p>
                <p className="text-zinc-400 text-sm mt-1">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
