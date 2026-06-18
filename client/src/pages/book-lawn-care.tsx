import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import {
  Leaf, Phone, ChevronRight, ChevronLeft, CheckCircle2, Loader2, Sparkles,
  Truck, Clock, MessageCircle, Mail, RotateCw, History,
} from "lucide-react";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import AddressField from "@/components/AddressField";
import ServiceBundleAddon from "@/components/ServiceBundleAddon";
import BundleServiceScheduler, {
  BUNDLE_SCHEDULING_MODE,
  buildBundleSchedulesPayload,
  type BundleScheduleEntry,
} from "@/components/BundleServiceScheduler";
import LawnYardCardTile from "@/components/LawnYardCard";
import WhatThisMeans from "@/components/WhatThisMeans";
import LawnPriceBreakdown, { type LawnPricing } from "@/components/LawnPriceBreakdown";
import {
  SIZE_CARDS, CONDITION_CARDS, SERVICE_CARDS, FREQUENCY_CARDS, EXPLAINERS, ADD_ON_LABELS,
} from "@/lib/lawnYardData";

interface RebookSummary {
  nameDisplay: string;
  addressMasked: string;
  serviceCategory: string;
  serviceFrequency: string;
  propertySize: string;
  propertyCondition: string;
  addOnIds?: string[];   // canonical IDs (preferred)
  addOnLabels?: string[]; // human labels
  addOns: string[];      // back-compat: labels
  lastTotal: string;
  isCustomEstimate: boolean;
  lastDate: string;
}

const ADD_ONS = [
  { id: "edging", label: "Edging", price: 15 },
  { id: "blowing", label: "Blowing / Cleanup", price: 10 },
  { id: "weeding", label: "Weeding", price: 25 },
  { id: "fertilization", label: "Fertilization", price: 35 },
  { id: "aeration", label: "Aeration", price: 55 },
  { id: "overseeding", label: "Overseeding", price: 45 },
  { id: "leaf_removal", label: "Leaf Removal", price: 40 },
  { id: "mulching", label: "Mulching", price: 50 },
  { id: "hedge_trimming", label: "Hedge Trimming", price: 30 },
  { id: "gutter_cleaning", label: "Gutter Cleaning", price: 60 },
];

const contactSchema = z.object({
  customerName: z.string().min(2, "Name is required"),
  phone: z.string().min(10, "Phone number required"),
  email: z.string().email("Valid email required").or(z.literal("")),
  address: z.string().min(5, "Address required"),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  requestedStartDate: z.string().optional(),
  notes: z.string().optional(),
});

type ContactForm = z.infer<typeof contactSchema>;

interface QuoteResult {
  quote: {
    id: number;
    totalQuoted: string;
    isCustomEstimate: boolean;
    customerName: string;
    serviceCategory: string;
    serviceFrequency: string;
    bundleDiscountAmount?: string | null;
    bundleDiscountReason?: "bundle_intent" | "cross_service_history" | null;
  };
  pricing: LawnPricing & {
    basePrice: number;
    addOnTotal: number;
    totalQuoted: number;
    isCustomEstimate: boolean;
  };
  bundleGroupId?: string | null;
  companionLeads?: Array<{
    service: string;
    label: string;
    serviceType: string;
    startDate: string | null;
  }>;
  // Task #199 — priced bundle add-ons (e.g. $100 Shop Card) that are
  // billed alongside the lawn-care invoice. Each grant turns into
  // JCMOVES USD service credit on the customer's wallet on payment.
  shopCardGrants?: Array<{
    addonId: string;
    name: string;
    amountUsd: number;
    shortDescription?: string;
  }>;
  invoice?: { url: string; squareInvoiceId: string } | null;
}

// Per-add-on scheduling capture (Task #115). Drives the micro-step rendered
// between bundle selection (step 4) and confirmation (step 7). The fields a
// service exposes depend on its kind — recurring services need a frequency,
// schedulable one-offs need a date, and complex services like moving simply
// flag "call me to schedule".
const TOTAL_STEPS = 6;

export default function BookLawnCare() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [serviceCategory, setServiceCategory] = useState("");
  const [frequency, setFrequency] = useState("");
  const [propertySize, setPropertySize] = useState("");
  const [propertyCondition, setPropertyCondition] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [bundleAddons, setBundleAddons] = useState<string[]>([]);
  const [bundleSchedules, setBundleSchedules] = useState<Record<string, BundleScheduleEntry>>({});
  const [hasFence, setHasFence] = useState(false);
  const [hasPets, setHasPets] = useState(false);
  const [hasSteepSlope, setHasSteepSlope] = useState(false);
  const [needsHaulAway, setNeedsHaulAway] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [distanceMiles, setDistanceMiles] = useState(0);
  const [autoDetect, setAutoDetect] = useState<{
    sqFt: number; tier: string; label: string;
    source: "parcel" | "viewport"; sourceLabel: string; confidence: number;
  } | null>(null);
  const lastDetectedAddress = useRef<string>("");
  const [rebookPhone, setRebookPhone] = useState("");
  const [rebookSummary, setRebookSummary] = useState<RebookSummary | null>(null);
  const [rebookLooked, setRebookLooked] = useState(false);
  const [rebookOpen, setRebookOpen] = useState(false);
  // Captured from ?utm_source=... on the deep link so the booking endpoint
  // can attribute this re-book to its source campaign (e.g. "rebook_email").
  const [rebookSource, setRebookSource] = useState<string | null>(null);
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { customerName: "", phone: "", email: "", address: "", city: "", state: "", zip: "", requestedStartDate: "", notes: "" },
  });

  const watchedAddress = form.watch("address");

  // Deep-link: ?rebook=1&phone=... — auto-open the returning-customer panel
  // and pre-fill the phone so a one-tap re-book is one button-press away.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("rebook") !== "1") return;
    const phoneParam = (params.get("phone") || "").trim();
    const utm = (params.get("utm_source") || "").trim().toLowerCase();
    if (utm) setRebookSource(utm);
    setRebookOpen(true);
    if (phoneParam) {
      setRebookPhone(phoneParam);
      // Trigger lookup immediately so the user sees their last-quote summary
      // without having to tap "Look up".
      const digits = phoneParam.replace(/\D/g, "");
      if (digits.length >= 7) {
        lookupMutation.mutate(phoneParam);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive distance estimate
  useEffect(() => {
    const addr = (watchedAddress || "").trim();
    if (addr.length >= 8) {
      fetch(`/api/utility/estimate-drive-miles?address=${encodeURIComponent(addr)}`)
        .then(r => r.json())
        .then((d: any) => setDistanceMiles(typeof d.miles === "number" ? d.miles : 0))
        .catch(() => setDistanceMiles(0));
    } else {
      setDistanceMiles(0);
    }
  }, [watchedAddress]);

  // Lot-size auto-detect after place selected
  async function tryDetectLotSize(addr: string) {
    if (!addr || addr === lastDetectedAddress.current) return;
    lastDetectedAddress.current = addr;
    try {
      const r = await fetch(`/api/lawn-care/lot-size?address=${encodeURIComponent(addr)}`);
      if (!r.ok) return;
      const data = await r.json();
      if (data?.found && data?.sizeTier) {
        setAutoDetect({
          sqFt: data.squareFootage,
          tier: data.sizeTier,
          label: data.sizeLabel,
          source: data.source === "parcel" ? "parcel" : "viewport",
          sourceLabel:
            data.sourceLabel ??
            (data.source === "parcel"
              ? "Measured from public parcel data"
              : "Rough estimate from map area"),
          confidence: typeof data.confidence === "number" ? data.confidence : 0.4,
        });
        if (!propertySize || propertySize === "custom") {
          setPropertySize(data.sizeTier);
        }
      }
    } catch {
      // silent fail per spec
    }
  }

  // Returning-customer lookup
  const lookupMutation = useMutation<
    { found: boolean; summary?: RebookSummary },
    Error,
    string
  >({
    mutationFn: async (phone: string) => {
      const r = await fetch(`/api/lawn-care/last-quote-summary?phone=${encodeURIComponent(phone)}`);
      return r.json();
    },
    onSuccess: (data) => {
      setRebookLooked(true);
      setRebookSummary(data?.found && data.summary ? data.summary : null);
    },
    onError: () => {
      setRebookLooked(true);
      setRebookSummary(null);
    },
  });

  const rebookMutation = useMutation({
    mutationFn: (phone: string) =>
      apiRequest("POST", "/api/lawn-care/rebook", { phone, source: rebookSource ?? undefined }),
    onSuccess: async (res) => {
      const data = (await res.json()) as Partial<QuoteResult> & { rebooked?: boolean };
      if (data?.quote && data?.pricing) {
        // Use last summary's choices to render the same Yard Details + add-on chips
        if (rebookSummary) {
          setServiceCategory(rebookSummary.serviceCategory);
          setFrequency(rebookSummary.serviceFrequency);
          setPropertySize(rebookSummary.propertySize);
          setPropertyCondition(rebookSummary.propertyCondition);
          // Prefer canonical IDs from the server; fall back to reverse-
          // mapping labels for back-compat with older payloads.
          if (rebookSummary.addOnIds && rebookSummary.addOnIds.length) {
            setSelectedAddOns(rebookSummary.addOnIds);
          } else {
            const labelToId = Object.entries(ADD_ON_LABELS).reduce<Record<string, string>>(
              (acc, [id, label]) => { acc[label] = id; return acc; }, {});
            setSelectedAddOns((rebookSummary.addOns || []).map((l) => labelToId[l]).filter(Boolean));
          }
        }
        setQuoteResult({ quote: data.quote, pricing: data.pricing });
        setStep(7);
      } else {
        toast({ title: "Re-book failed", description: "Please use the regular booking form below.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      const msg = err.message.includes("429") ? "Please wait a moment and try again." : "Please use the regular booking form below.";
      toast({ title: "Couldn't re-book just now", description: msg, variant: "destructive" });
    },
  });

  const quoteMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/lawn-care/quote", data),
    onSuccess: async (res) => {
      const result: QuoteResult = await res.json();
      setQuoteResult(result);
      setStep(7);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again or call us directly.", variant: "destructive" });
    },
  });

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const toggleAddOn = (id: string) => {
    setSelectedAddOns((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  // Build a payload of per-add-on scheduling info from the local state. Only
  // include add-ons we actually know how to schedule and that the customer
  // still has selected — keeps the backend from creating a stale companion
  // lead if the customer toggled an add-on off after editing it.
  const bundleSchedulesPayload = buildBundleSchedulesPayload(bundleAddons, bundleSchedules);

  // Task #115 — gate submission on per-add-on minimum scheduling info: any
  // schedulable bundle add-on (date_only / date_freq) must have its date
  // (and frequency where required) before we'll create companion leads.
  // Otherwise the customer would silently end up with companion leads that
  // have no preferred date, defeating the whole point of this step.
  const validateBundleSchedules = (): string | null => {
    for (const id of bundleAddons) {
      const mode = BUNDLE_SCHEDULING_MODE[id];
      if (!mode || mode === "call_only") continue;
      const entry = bundleSchedules[id] || {};
      if (!entry.date) return `Pick a preferred start date for "${id.replace(/_/g, " ")}".`;
      if (mode === "date_freq" && !entry.frequency) return `Pick a frequency for "${id.replace(/_/g, " ")}".`;
    }
    return null;
  };

  const handleContactSubmit = (data: ContactForm) => {
    const scheduleErr = validateBundleSchedules();
    if (scheduleErr) {
      toast({ title: "Bundle scheduling needed", description: scheduleErr, variant: "destructive" });
      setStep(5);
      return;
    }
    quoteMutation.mutate({
      ...data,
      serviceCategory,
      serviceFrequency: frequency,
      propertySize,
      squareFootage: autoDetect?.sqFt,
      propertyCondition,
      addOns: selectedAddOns,
      bundleAddons,
      bundleSchedules: bundleSchedulesPayload,
      distanceMiles,
      hasFence,
      hasPets,
      hasSteepSlope,
      needsHaulAway,
    });
  };

  const progressPct = Math.round(((step - 1) / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-lime-400" />
            <span className="font-bold text-white">Lawn Care Booking</span>
          </div>
          <a href="tel:+19062859312" className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
            <Phone className="h-3.5 w-3.5" /> Call us
          </a>
        </div>
      </div>

      {step <= TOTAL_STEPS && (
        <div className="bg-slate-800 h-1">
          <div className="bg-lime-400 h-1 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Step 1 — Service Category (with returning-customer rebook panel) */}
        {step === 1 && (
          <>
            <RebookPanel
              open={rebookOpen}
              onOpen={() => setRebookOpen(true)}
              phone={rebookPhone}
              setPhone={setRebookPhone}
              looked={rebookLooked}
              summary={rebookSummary}
              onLookup={() => {
                const digits = rebookPhone.replace(/\D/g, "");
                if (digits.length < 7) {
                  toast({ title: "Enter at least 7 digits of your phone." });
                  return;
                }
                lookupMutation.mutate(rebookPhone);
              }}
              looking={lookupMutation.isPending}
              onRebook={() => rebookMutation.mutate(rebookPhone)}
              rebooking={rebookMutation.isPending}
              onReset={() => {
                setRebookLooked(false);
                setRebookSummary(null);
              }}
            />
            <StepWrap
              title="What service do you need?"
              subtitle="Pick the closest match — we'll fine-tune at the property."
              onBack={undefined}
              onNext={() => { if (serviceCategory) next(); else toast({ title: "Select a service type" }); }}
            >
              <div className="grid grid-cols-1 gap-3">
                {SERVICE_CARDS.map((card) => (
                  <LawnYardCardTile
                    key={card.id}
                    card={card}
                    selected={serviceCategory === card.id}
                    onClick={() => setServiceCategory(card.id)}
                  />
                ))}
              </div>
            </StepWrap>
          </>
        )}

        {/* Step 2 — Frequency */}
        {step === 2 && (
          <StepWrap
            title="How often do you need service?"
            subtitle="Recurring plans get a discount and first dibs on slots."
            onBack={back}
            onNext={() => { if (frequency) next(); else toast({ title: "Select a frequency" }); }}
          >
            <div className="grid grid-cols-1 gap-2.5 mb-4">
              {FREQUENCY_CARDS.map((card) => (
                <LawnYardCardTile
                  key={card.id}
                  card={card}
                  size="sm"
                  selected={frequency === card.id}
                  onClick={() => setFrequency(card.id)}
                  badge={card.id === "weekly" ? "Best deal" : card.id === "bi_weekly" ? "Most popular" : undefined}
                />
              ))}
            </div>
            <WhatThisMeans title="How frequency pricing works">
              {EXPLAINERS.frequency}
            </WhatThisMeans>
          </StepWrap>
        )}

        {/* Step 3 — Property Size & Condition (with optional address auto-detect) */}
        {step === 3 && (
          <StepWrap
            title="Tell us about your property"
            subtitle="Pick what looks closest — we'll adjust if needed."
            onBack={back}
            onNext={() => { if (propertySize && propertyCondition) next(); else toast({ title: "Select size and condition" }); }}
          >
            {/* Address auto-detect helper */}
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-3 mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-300 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Want us to measure your lot?
              </p>
              <PlacesAutocomplete
                value={watchedAddress}
                onChange={(v) => form.setValue("address", v, { shouldValidate: false })}
                onPlaceSelect={(place) => {
                  form.setValue("address", place.fullAddress, { shouldValidate: false });
                  if (place.city) form.setValue("city", place.city);
                  if (place.state) form.setValue("state", place.state);
                  if (place.zip) form.setValue("zip", place.zip);
                  tryDetectLotSize(place.fullAddress);
                }}
                placeholder="Type your address (optional)"
              />
              {autoDetect && (
                <div
                  className={cn(
                    "mt-2 flex items-start gap-2 rounded-lg px-2.5 py-2 border",
                    autoDetect.source === "parcel"
                      ? "bg-lime-500/10 border-lime-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  )}
                >
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 mt-0.5 flex-shrink-0",
                      autoDetect.source === "parcel" ? "text-lime-400" : "text-amber-400"
                    )}
                  />
                  <div className="text-xs leading-snug">
                    <p className={autoDetect.source === "parcel" ? "text-lime-200" : "text-amber-200"}>
                      {autoDetect.source === "parcel" ? "We measured" : "We estimated"} your lot at{" "}
                      <b>~{autoDetect.sqFt.toLocaleString()} sq ft</b> — pre-selected <b>{autoDetect.label}</b>. Change if needed.
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {autoDetect.sourceLabel}
                      {autoDetect.source === "viewport" && " — please verify"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-slate-400 text-sm mb-2 font-medium">Yard size</p>
            <div className="grid grid-cols-1 gap-2.5 mb-3">
              {SIZE_CARDS.map((card) => (
                <LawnYardCardTile
                  key={card.id}
                  card={card}
                  size="sm"
                  selected={propertySize === card.id}
                  onClick={() => setPropertySize(card.id)}
                  badge={
                    autoDetect?.tier === card.id
                      ? autoDetect.source === "parcel"
                        ? "Detected"
                        : "Estimated"
                      : undefined
                  }
                />
              ))}
            </div>
            <WhatThisMeans title="How yard size affects price">
              {EXPLAINERS.size}
            </WhatThisMeans>

            <p className="text-slate-400 text-sm mb-2 mt-5 font-medium">Current condition</p>
            <div className="grid grid-cols-1 gap-2.5 mb-3">
              {CONDITION_CARDS.map((card) => (
                <LawnYardCardTile
                  key={card.id}
                  card={card}
                  size="sm"
                  selected={propertyCondition === card.id}
                  onClick={() => setPropertyCondition(card.id)}
                />
              ))}
            </div>
            <WhatThisMeans title="What 'overgrown' actually means">
              {EXPLAINERS.condition}
            </WhatThisMeans>
          </StepWrap>
        )}

        {/* Step 4 — Add-ons & Flags */}
        {step === 4 && (
          <StepWrap
            title="Extras & property details"
            subtitle="Optional — add only what you want."
            onBack={back}
            onNext={next}
          >
            <p className="text-slate-400 text-sm mb-3 font-medium">Add-on services</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {ADD_ONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAddOn(a.id)}
                  className={cn(
                    "border rounded-xl p-3 text-left transition-all",
                    selectedAddOns.includes(a.id)
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-600"
                  )}
                >
                  <p className="font-semibold text-white text-sm">{a.label}</p>
                  <p className="text-teal-400 text-xs">+${a.price}</p>
                </button>
              ))}
            </div>
            <WhatThisMeans title="How add-ons work">
              {EXPLAINERS.addOns}
            </WhatThisMeans>

            <p className="text-slate-400 text-sm mb-3 mt-5 font-medium">Property details</p>
            <div className="space-y-3 mb-5">
              {[
                { state: hasFence, set: setHasFence, label: "Fenced yard", desc: "Gate access needed (+$10)" },
                { state: hasPets, set: setHasPets, label: "Pets on property", desc: "We'll take extra care with gates" },
                { state: hasSteepSlope, set: setHasSteepSlope, label: "Steep slope / hill", desc: "Adds 15% — extra care on hills" },
                { state: needsHaulAway, set: setNeedsHaulAway, label: "Haul away debris", desc: "+$45 — we take it with us" },
              ].map(({ state, set, label, desc }) => (
                <label key={label} className="flex items-center gap-3 border border-slate-700 rounded-xl p-3 cursor-pointer hover:border-slate-600 transition-all">
                  <Checkbox checked={state} onCheckedChange={(v) => set(Boolean(v))} className="border-slate-500" />
                  <div>
                    <p className="text-white text-sm font-medium">{label}</p>
                    <p className="text-slate-400 text-xs">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <ServiceBundleAddon
              currentService="lawn_care"
              selected={bundleAddons}
              onChange={setBundleAddons}
              theme="slate"
            />
          </StepWrap>
        )}

        {/* Step 5 — Preferred Date (+ per-add-on scheduling for bundled services) */}
        {step === 5 && (
          <StepWrap title="When would you like to start?" subtitle="We'll confirm a firm time after you submit." onBack={back} onNext={next}>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-2 block">Lawn care preferred start date (optional)</label>
                <DatePicker
                  value={form.watch("requestedStartDate") ?? undefined}
                  onChange={(v) => form.setValue("requestedStartDate", v || undefined)}
                  placeholder="Pick a start date"
                />
              </div>

              {/* Bundle add-on scheduling — one mini block per selected add-on
                  so the customer schedules each service up front instead of
                  via a follow-up call. Hidden entirely when no bundle add-ons
                  are selected. */}
              <BundleServiceScheduler
                bundleAddons={bundleAddons}
                schedules={bundleSchedules}
                onChange={setBundleSchedules}
                testIdPrefix="lawn-bundle"
              />

              <div>
                <label className="text-slate-400 text-sm mb-2 block">Additional notes (optional)</label>
                <Textarea
                  {...form.register("notes")}
                  placeholder="Gate code, special instructions, area to focus on..."
                  className="bg-slate-800 border-slate-700 text-white resize-none"
                  rows={4}
                />
              </div>
            </div>
          </StepWrap>
        )}

        {/* Step 6 - Contact Info */}
        {step === 6 && (
          <StepWrap
            title="Your contact info"
            subtitle="Darrell will reach out to confirm everything."
            onBack={back}
            onNext={form.handleSubmit(handleContactSubmit)}
            nextLabel={quoteMutation.isPending ? undefined : "Get My Quote"}
            nextDisabled={quoteMutation.isPending}
            nextIcon={quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Full name *</label>
                <Input {...form.register("customerName")} placeholder="Your full name" className="bg-slate-800 border-slate-700 text-white" />
                {form.formState.errors.customerName && <p className="text-red-400 text-xs mt-1">{form.formState.errors.customerName.message}</p>}
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Phone *</label>
                <Input {...form.register("phone")} placeholder="Best phone number" type="tel" className="bg-slate-800 border-slate-700 text-white" />
                {form.formState.errors.phone && <p className="text-red-400 text-xs mt-1">{form.formState.errors.phone.message}</p>}
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Email (optional)</label>
                <Input {...form.register("email")} placeholder="Best email address" type="email" className="bg-slate-800 border-slate-700 text-white" />
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Service address *</label>
                <AddressField
                  value={form.watch("address") || ""}
                  onChange={(v) => form.setValue("address", v, { shouldValidate: true })}
                  city={form.watch("city") || ""}
                  state={form.watch("state") || ""}
                  zip={form.watch("zip") || ""}
                  onCityChange={(v) => form.setValue("city", v, { shouldValidate: true })}
                  onStateChange={(v) => form.setValue("state", v, { shouldValidate: true })}
                  onZipChange={(v) => form.setValue("zip", v, { shouldValidate: true })}
                  onResolved={(place) => {
                    form.setValue("address", place.fullAddress, { shouldValidate: true });
                    tryDetectLotSize(place.fullAddress);
                  }}
                  placeholder="123 Main St, Ironwood, MI"
                  theme="slate"
                  error={form.formState.errors.address?.message}
                  data-testid="address-field-lawn"
                />
              </div>
            </div>
          </StepWrap>
        )}

        {/* Step 7 — Confirmation */}
        {step === 7 && quoteResult && (
          <ConfirmationPanel
            result={quoteResult}
            frequency={frequency}
            propertySize={propertySize}
            propertyCondition={propertyCondition}
            selectedAddOns={selectedAddOns}
            customerEmail={form.getValues("email") || ""}
          />
        )}

      </div>
    </div>
  );
}

function StepWrap({
  title, subtitle, children, onBack, onNext, nextLabel = "Continue", nextDisabled = false, nextIcon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: (() => void) | undefined;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-1 text-white">{title}</h2>
      {subtitle && <p className="text-slate-400 text-sm mb-4">{subtitle}</p>}
      <div className="mb-6">{children}</div>
      <div className="flex gap-3">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="border-slate-700 text-white hover:bg-slate-800">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
        {onNext && (
          <Button onClick={onNext} disabled={nextDisabled} className="flex-1 bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold">
            {nextLabel} {nextIcon ?? <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function RebookPanel({
  open, onOpen, phone, setPhone, looked, summary, onLookup, looking, onRebook, rebooking, onReset,
}: {
  open: boolean;
  onOpen: () => void;
  phone: string;
  setPhone: (v: string) => void;
  looked: boolean;
  summary: RebookSummary | null;
  onLookup: () => void;
  looking: boolean;
  onRebook: () => void;
  rebooking: boolean;
  onReset: () => void;
}) {
  if (!open) {
    return (
      <button
        onClick={onOpen}
        data-testid="rebook-open"
        className="w-full mb-5 rounded-xl border border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 px-4 py-3 flex items-center gap-3 transition-all text-left"
      >
        <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
          <RotateCw className="h-4 w-4 text-teal-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-tight">Returning customer?</p>
          <p className="text-xs text-slate-400 mt-0.5">Re-book your last service in one tap</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
      </button>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-teal-500/30 bg-teal-500/5 px-4 py-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
          <RotateCw className="h-4 w-4 text-teal-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-tight">Re-book your last service</p>
          <p className="text-xs text-slate-400 mt-0.5">Enter the phone you used last time.</p>
        </div>
      </div>

      {!summary && (
        <div className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone from your last booking"
            type="tel"
            data-testid="rebook-phone-input"
            className="bg-slate-800 border-slate-700 text-white"
          />
          <Button
            onClick={onLookup}
            disabled={looking}
            data-testid="rebook-lookup"
            className="bg-teal-500 hover:bg-teal-600 text-slate-900 font-semibold shrink-0"
          >
            {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
          </Button>
        </div>
      )}

      {looked && !summary && (
        <p className="text-xs text-slate-400 mt-2 leading-snug">
          We couldn't find a previous service for that number. Use the form below — first time's the charm.
        </p>
      )}

      {summary && (
        <div className="mt-1 space-y-3" data-testid="rebook-summary">
          <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              <History className="h-3 w-3" /> Last service
            </div>
            <p className="text-sm text-white font-medium">{summary.nameDisplay}</p>
            <p className="text-xs text-slate-400 mt-0.5">{summary.addressMasked}</p>
            <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Service</p>
                <p className="text-slate-200 capitalize">{summary.serviceCategory.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Frequency</p>
                <p className="text-slate-200 capitalize">{summary.serviceFrequency.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Yard</p>
                <p className="text-slate-200 capitalize">{summary.propertySize}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Last total</p>
                <p className="text-lime-400 font-bold">
                  {summary.isCustomEstimate ? "Custom" : `$${summary.lastTotal}`}
                </p>
              </div>
            </div>
            {summary.addOns.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-700/60">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">Add-ons</p>
                <div className="flex flex-wrap gap-1">
                  {summary.addOns.map((label) => (
                    <span key={label} className="text-[11px] bg-teal-500/10 border border-teal-500/30 text-teal-200 rounded-full px-2 py-0.5">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onReset}
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              Not me
            </Button>
            <Button
              onClick={onRebook}
              disabled={rebooking}
              data-testid="rebook-confirm"
              className="flex-1 bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold"
            >
              {rebooking ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Re-booking…</>
              ) : (
                <>Book it again <ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug text-center">
            We'll resend the same job to Darrell. Today's pricing applies.
          </p>
        </div>
      )}
    </div>
  );
}

function ConfirmationPanel({
  result,
  frequency,
  propertySize,
  propertyCondition,
  selectedAddOns,
  customerEmail,
}: {
  result: QuoteResult;
  frequency: string;
  propertySize: string;
  propertyCondition: string;
  selectedAddOns: string[];
  customerEmail?: string;
}) {
  const isCustom = result.pricing.isCustomEstimate;
  const sizeCard = SIZE_CARDS.find((c) => c.id === propertySize);
  const conditionCard = CONDITION_CARDS.find((c) => c.id === propertyCondition);
  const timeline = isCustom
    ? [
        { title: "Darrell reviews your request", desc: "He'll either call or stop by within 24 hours.", icon: MessageCircle },
        { title: "You get a personalized quote", desc: "By text or email — clear line items, no surprises.", icon: Mail },
        { title: "Crew scheduled & invoice sent", desc: "Pay the Square invoice to lock your slot.", icon: CheckCircle2 },
        { title: "Service day", desc: "Crew arrives in the window we agreed on.", icon: Truck },
      ]
    : [
        { title: "Darrell confirms your service date", desc: "Within 24 hours by text/email.", icon: MessageCircle },
        { title: "You receive a Square invoice", desc: "Pay to lock in your spot on the calendar.", icon: Mail },
        { title: "Crew arrives in your window", desc: "Typically a 2-hour arrival window.", icon: Truck },
        { title: "Service complete", desc: "Photos sent + receipt — easy, every visit.", icon: CheckCircle2 },
      ];

  return (
    <div className="rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 via-slate-900/80 to-slate-900 overflow-hidden">
      <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-6 w-6 text-green-400" />
        </div>
        <div>
          <p className="font-extrabold text-white text-base leading-tight">Request Confirmed!</p>
          <p className="text-xs text-green-300 mt-0.5">
            {isCustom
              ? "We'll reach out shortly to discuss your custom estimate."
              : "Darrell will confirm your appointment shortly."}
          </p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">

        {(sizeCard || conditionCard) && (
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Your Yard Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {sizeCard && (
                <div
                  data-testid={`confirm-size-${sizeCard.id}`}
                  className={cn("border rounded-2xl p-3", sizeCard.accent || "border-lime-500/60 bg-lime-500/10")}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{sizeCard.illustration}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Yard size</p>
                      <p className="font-semibold text-white text-sm">{sizeCard.label}</p>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{sizeCard.hint}</p>
                    </div>
                  </div>
                </div>
              )}
              {conditionCard && (
                <div
                  data-testid={`confirm-condition-${conditionCard.id}`}
                  className={cn("border rounded-2xl p-3", conditionCard.accent || "border-green-500/60 bg-green-500/10")}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{conditionCard.illustration}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Condition</p>
                      <p className="font-semibold text-white text-sm">{conditionCard.label}</p>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{conditionCard.hint}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {selectedAddOns.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Add-ons</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAddOns.map((id) => (
                    <span
                      key={id}
                      data-testid={`confirm-addon-${id}`}
                      className="inline-flex items-center gap-1 text-xs bg-teal-500/10 border border-teal-500/30 text-teal-200 rounded-full px-2.5 py-1"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {ADD_ON_LABELS[id] ?? id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bundled services scheduled in this booking — confirms to the
            customer that the add-ons they selected actually got captured
            with their preferred dates. */}
        {result.companionLeads && result.companionLeads.length > 0 && (
          <div data-testid="confirm-bundled-services" className="rounded-xl bg-teal-500/5 border border-teal-500/30 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-300 mb-2">Bundled services scheduled</p>
            <ul className="space-y-1.5">
              {result.companionLeads.map(l => (
                <li key={l.service} data-testid={`confirm-bundle-${l.service}`} className="flex items-start gap-2 text-xs text-slate-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 mt-0.5 shrink-0" />
                  <span>
                    <b>{l.label}</b>{l.startDate ? ` — start ${l.startDate}` : " — we'll call to schedule"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Task #199 — bundled shop-card add-ons. Shows what the
            customer will be billed for and where the JCMOVES USD lands. */}
        {result.shopCardGrants && result.shopCardGrants.length > 0 && (
          <div data-testid="confirm-shop-card-grants" className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-2">🛍️ Bundled add-ons (billed with this quote)</p>
            <ul className="space-y-1.5 mb-2">
              {result.shopCardGrants.map(g => (
                <li key={g.addonId} data-testid={`confirm-shop-card-${g.addonId}`} className="flex items-start gap-2 text-xs text-slate-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
                  <span>
                    <b>{g.name}</b> — ${g.amountUsd.toFixed(2)}
                    <span className="text-amber-200/80"> · lands in your JCMOVES wallet on payment</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-400 leading-snug">
              Spend the JCMOVES USD on any future JC ON THE MOVE invoice — moving, junk, cleaning, lawn, trash valet, or Ashley's Shop. Applies $1 = $1 off.
            </p>
            {result.invoice?.url && (
              <a
                href={result.invoice.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-shop-card-invoice"
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-300 hover:text-amber-200 underline"
              >
                Pay invoice →
              </a>
            )}
          </div>
        )}

        <LawnPriceBreakdown
          pricing={{
            ...result.pricing,
            bundleDiscountAmount: result.quote.bundleDiscountAmount ?? null,
            bundleDiscountReason: result.quote.bundleDiscountReason ?? null,
          }}
          serviceFrequency={frequency}
          variant="customer"
        />

        {/* What happens next — 4-step timeline */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">What Happens Next</p>
          <div className="space-y-3">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-slate-700 my-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm text-white font-medium leading-tight flex items-center gap-1.5">
                    <item.icon className="h-3.5 w-3.5 text-teal-400" /> {item.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-snug">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What the crew brings */}
        {!isCustom && (
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">What the Crew Brings</p>
            <ul className="grid grid-cols-2 gap-1.5 text-xs text-slate-300">
              <li>🚜 Mowers & trimmers</li>
              <li>🍃 Blowers</li>
              <li>✂️ Edgers</li>
              <li>🛻 Truck for hauling</li>
              <li>⛽ All fuel & supplies</li>
              <li>🧤 PPE + safety gear</li>
            </ul>
            <p className="text-[11px] text-slate-500 mt-2">
              Expected arrival: <span className="text-slate-300">we'll send a 2-hour window the day before</span>.
            </p>
          </div>
        )}

        {/* Contact */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3 text-center">
          <p className="text-xs text-slate-400 mb-1">Questions? Call Darrell:</p>
          <a href="tel:+19062859312" className="text-lime-400 font-bold text-base">(906) 285-9312</a>
        </div>

        <Link href="/">
          <Button variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800">
            Back to Home
          </Button>
        </Link>

        <BookingConfirmedTiles serviceType="lawn_care" customerEmail={customerEmail} />
      </div>
    </div>
  );
}
