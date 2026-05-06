import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, ChevronLeft, CheckCircle2, Clock, Hammer, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AddressField from "@/components/AddressField";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { buildBookHref } from "@/lib/servicePagePrefill";

const PROJECT_OPTIONS = [
  { id: "flooring", label: "Flooring tear-out", desc: "Tile, carpet, laminate, or wood removal.", price: 250 },
  { id: "single_room", label: "Single room demo", desc: "Cabinets, drywall, trim, and prep for remodel.", price: 650 },
  { id: "multi_room", label: "Multi-room tear-out", desc: "Larger scope with debris staging and haul planning.", price: 1400 },
  { id: "custom", label: "Custom scope", desc: "Specialty or unusual projects that need review.", price: 0 },
];

const ADDON_OPTIONS = [
  { id: "haul_away", label: "Full debris haul-away", price: 180 },
  { id: "rush", label: "Rush scheduling request", price: 250 },
];

const ALL_INCLUDES = [
  "Hazard notes and access details stored with the booking",
  "Call-to-schedule handling inside the shared booking flow",
  "Address handoff through the same /book entry point as roofing and lawn",
  "Clear ops notes for tear-out scope and haul-away needs",
];

const FAQS = [
  { q: "Does demolition still need a callback?", a: "Yes. This route now uses the same /book path, but demolition remains a call-to-schedule service because scope confirmation matters." },
  { q: "Can you quote custom work?", a: "Yes. Choose the custom option and we will capture the request without forcing a fake number." },
  { q: "What about asbestos or mold?", a: "Use the hazard note toggle so the team knows to review the site before planning any demolition work." },
];

const theme = getPlacardTheme("demolition");

export default function DemolitionPage() {
  const [, setLocation] = useLocation();
  const [serviceAddress, setServiceAddress] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [projectId, setProjectId] = useState("single_room");
  const [selectedAddons, setSelectedAddons] = useState<string[]>(["haul_away"]);
  const [hazardReview, setHazardReview] = useState(false);

  const estimate = useMemo(() => {
    const selectedProject = PROJECT_OPTIONS.find((option) => option.id === projectId) || PROJECT_OPTIONS[1];
    const addonTotal = ADDON_OPTIONS
      .filter((option) => selectedAddons.includes(option.id))
      .reduce((sum, option) => sum + option.price, 0);

    return {
      selectedProject,
      addonTotal,
      total: selectedProject.price > 0 ? selectedProject.price + addonTotal : 0,
    };
  }, [projectId, selectedAddons]);

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
      service: "demolition",
      address: serviceAddress,
      label: estimate.total > 0 ? "Demolition Estimate" : "Demolition Request",
      price: estimate.total > 0 ? estimate.total : null,
      details: {
        demolitionProjectType: estimate.selectedProject.label,
        demolitionAddons: selectedAddonLabels,
        demolitionHazardReview: hazardReview,
        scope: estimate.selectedProject.label,
        notes: [
          selectedAddonLabels.length ? `Requested add-ons: ${selectedAddonLabels.join(", ")}.` : null,
          hazardReview ? "Customer flagged potential hazard review before demo." : null,
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
          tagline="Light Demolition"
          headline="DEMO"
          subheadline="READY"
          bodyText="The intake is now unified, while the job itself still routes to a human callback for scope confirmation."
          featuresLabel="What This Flow Preserves"
          features={ALL_INCLUDES.slice(0, 3)}
          stats={[
            { icon: Clock, value: "2-8 hrs", label: "typical scope" },
            { icon: Users, value: "2-4 crew", label: "as needed" },
            { icon: Truck, value: "Haul-away", label: "available" },
          ]}
          howItWorks={[
            { step: "1", label: "Pick a tear-out type" },
            { step: "2", label: "Flag haul-away and hazards" },
            { step: "3", label: "Submit through booking" },
          ]}
          cta={{
            label: "Build My Demo Request",
            onClick: () => document.getElementById("demo-quote-helper")?.scrollIntoView({ behavior: "smooth", block: "start" }),
            phoneNumber: "+19062859312",
            colorClass: "bg-yellow-600 text-zinc-950 hover:bg-yellow-500",
          }}
        />

        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            Hazard review still matters here. If there is any chance of mold, asbestos, or pest contamination, flag it below so the ops team can route the project correctly.
          </p>
        </div>

        <section id="demo-quote-helper" className="space-y-4 rounded-[28px] border border-yellow-500/20 bg-zinc-900/85 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-yellow-300">Quote Helper</p>
            <h2 className="text-lg font-black text-white">Demolition Intake</h2>
          </div>

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

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Project type</Label>
            {PROJECT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProjectId(option.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  projectId === option.id
                    ? "border-yellow-400 bg-yellow-500/10"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{option.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{option.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-yellow-300">
                    {option.price > 0 ? `From $${option.price}` : "Custom"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Project extras</Label>
            {ADDON_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{option.label}</p>
                  <p className="text-xs text-zinc-400">Stored on the booking for dispatch and review.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-yellow-300">+${option.price}</span>
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

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
            <input
              type="checkbox"
              checked={hazardReview}
              onChange={(e) => setHazardReview(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <div>
              <p className="text-sm font-semibold text-white">Potential hazard review needed</p>
              <p className="text-xs text-zinc-400">Use this if you want the team to review mold, asbestos, or contamination concerns before scheduling.</p>
            </div>
          </label>

          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <p className="text-xs uppercase tracking-widest text-yellow-200">Expected Quote Position</p>
            <p className="mt-1 text-3xl font-black text-white">
              {estimate.total > 0 ? `$${estimate.total}` : "Custom Review"}
            </p>
            <p className="mt-2 text-xs text-zinc-300">
              Final pricing is confirmed after scope review. Booking will mark this service for callback scheduling.
            </p>
          </div>

          <Button
            onClick={handleBooking}
            disabled={!serviceAddress.trim()}
            className="h-12 w-full rounded-2xl bg-yellow-500 font-black text-black hover:bg-yellow-400"
          >
            Continue To Booking
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Included</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-yellow-400" />
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
            <Hammer className="mx-auto h-4 w-4 text-yellow-300" />
            <p className="mt-2 text-xs text-zinc-300">Scope stored clearly</p>
          </div>
          <div>
            <Users className="mx-auto h-4 w-4 text-yellow-300" />
            <p className="mt-2 text-xs text-zinc-300">Callback workflow intact</p>
          </div>
          <div>
            <Truck className="mx-auto h-4 w-4 text-yellow-300" />
            <p className="mt-2 text-xs text-zinc-300">Haul-away tracked</p>
          </div>
        </div>
      </div>
    </div>
  );
}
