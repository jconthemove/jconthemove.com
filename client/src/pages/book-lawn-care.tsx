import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import {
  Leaf, Phone, ChevronRight, ChevronLeft, CheckCircle2, Loader2, Calendar, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlacesAutocomplete } from "@/components/places-autocomplete";

const SERVICE_CATEGORIES = [
  { id: "mowing", label: "Mowing", icon: "🌿", desc: "Grass cutting & cleanup" },
  { id: "trimming", label: "Trimming & Edging", icon: "✂️", desc: "Precision edging along walks" },
  { id: "cleanup", label: "Yard Cleanup", icon: "🍂", desc: "Leaf removal & general tidy" },
  { id: "full_service", label: "Full Service", icon: "🏡", desc: "Mowing + trim + blow + edge" },
  { id: "custom", label: "Custom / Estimate", icon: "📋", desc: "Darrell will reach out" },
];

const FREQUENCIES = [
  { id: "one_time", label: "One-Time", desc: "Just once" },
  { id: "weekly", label: "Weekly", desc: "Recurring — best rate" },
  { id: "bi_weekly", label: "Bi-Weekly", desc: "Every two weeks" },
  { id: "monthly", label: "Monthly", desc: "Once a month" },
];

const PROPERTY_SIZES = [
  { id: "small", label: "Small", desc: "Under 5,000 sq ft" },
  { id: "medium", label: "Medium", desc: "5,000–10,000 sq ft" },
  { id: "large", label: "Large", desc: "10,000–20,000 sq ft" },
  { id: "xlarge", label: "X-Large", desc: "20,000+ sq ft" },
  { id: "custom", label: "Not Sure", desc: "I'll describe it" },
];

const CONDITIONS = [
  { id: "well_maintained", label: "Well Maintained", desc: "Regular upkeep, neat", color: "text-green-400 border-green-600/40" },
  { id: "slightly_overgrown", label: "Slightly Overgrown", desc: "A bit long, minor growth", color: "text-yellow-400 border-yellow-600/40" },
  { id: "overgrown", label: "Overgrown", desc: "Several weeks no service", color: "text-orange-400 border-orange-600/40" },
  { id: "heavily_overgrown", label: "Heavily Overgrown", desc: "Tall grass, weeds, brush", color: "text-red-400 border-red-600/40" },
];

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
  };
  pricing: {
    basePrice: number;
    addOnTotal: number;
    totalQuoted: number;
    isCustomEstimate: boolean;
  };
}

const TOTAL_STEPS = 6;

export default function BookLawnCare() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [serviceCategory, setServiceCategory] = useState("");
  const [frequency, setFrequency] = useState("");
  const [propertySize, setPropertySize] = useState("");
  const [propertyCondition, setPropertyCondition] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [hasFence, setHasFence] = useState(false);
  const [hasPets, setHasPets] = useState(false);
  const [hasSteepSlope, setHasSteepSlope] = useState(false);
  const [needsHaulAway, setNeedsHaulAway] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);

  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { customerName: "", phone: "", email: "", address: "", city: "", state: "", zip: "", requestedStartDate: "", notes: "" },
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

  const handleContactSubmit = (data: ContactForm) => {
    quoteMutation.mutate({
      ...data,
      serviceCategory,
      serviceFrequency: frequency,
      propertySize,
      propertyCondition,
      addOns: selectedAddOns,
      hasFence,
      hasPets,
      hasSteepSlope,
      needsHaulAway,
    });
  };

  const progressPct = Math.round(((step - 1) / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-lime-400" />
            <span className="font-bold text-white">Lawn Care Booking</span>
          </div>
          <a href="tel:+12312341234" className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
            <Phone className="h-3.5 w-3.5" /> Call us
          </a>
        </div>
      </div>

      {/* Progress bar */}
      {step <= TOTAL_STEPS && (
        <div className="bg-slate-800 h-1">
          <div className="bg-lime-400 h-1 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Step 1 — Service Category */}
        {step === 1 && (
          <StepWrap title="What service do you need?" onBack={undefined} onNext={() => { if (serviceCategory) next(); else toast({ title: "Select a service type" }); }}>
            <div className="grid grid-cols-1 gap-3">
              {SERVICE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setServiceCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-3 border rounded-xl p-4 text-left transition-all",
                    serviceCategory === cat.id
                      ? "border-lime-500 bg-lime-500/10"
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-600"
                  )}
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <p className="font-semibold text-white text-sm">{cat.label}</p>
                    <p className="text-slate-400 text-xs">{cat.desc}</p>
                  </div>
                  {serviceCategory === cat.id && <CheckCircle2 className="h-4 w-4 text-lime-400 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          </StepWrap>
        )}

        {/* Step 2 — Frequency */}
        {step === 2 && (
          <StepWrap title="How often do you need service?" onBack={back} onNext={() => { if (frequency) next(); else toast({ title: "Select a frequency" }); }}>
            <div className="grid grid-cols-2 gap-3">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFrequency(f.id)}
                  className={cn(
                    "border rounded-xl p-4 text-left transition-all",
                    frequency === f.id
                      ? "border-lime-500 bg-lime-500/10"
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-600"
                  )}
                >
                  <p className="font-semibold text-white text-sm">{f.label}</p>
                  <p className="text-slate-400 text-xs">{f.desc}</p>
                  {frequency === f.id && <CheckCircle2 className="h-4 w-4 text-lime-400 mt-2" />}
                </button>
              ))}
            </div>
          </StepWrap>
        )}

        {/* Step 3 — Property Size & Condition */}
        {step === 3 && (
          <StepWrap title="Tell us about your property" onBack={back} onNext={() => { if (propertySize && propertyCondition) next(); else toast({ title: "Select size and condition" }); }}>
            <p className="text-slate-400 text-sm mb-3">Property size</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {PROPERTY_SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPropertySize(s.id)}
                  className={cn(
                    "border rounded-xl p-3 text-left transition-all",
                    propertySize === s.id
                      ? "border-lime-500 bg-lime-500/10"
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-600"
                  )}
                >
                  <p className="font-semibold text-white text-sm">{s.label}</p>
                  <p className="text-slate-400 text-xs">{s.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-slate-400 text-sm mb-3">Current condition</p>
            <div className="grid grid-cols-1 gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPropertyCondition(c.id)}
                  className={cn(
                    "border rounded-xl p-3 text-left transition-all",
                    propertyCondition === c.id
                      ? `border-opacity-100 bg-slate-800 ${c.color.split(" ")[1]}`
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-600"
                  )}
                >
                  <span className={cn("font-semibold text-sm", propertyCondition === c.id ? c.color.split(" ")[0] : "text-white")}>
                    {c.label}
                  </span>
                  <p className="text-slate-400 text-xs">{c.desc}</p>
                </button>
              ))}
            </div>
          </StepWrap>
        )}

        {/* Step 4 — Add-ons & Flags */}
        {step === 4 && (
          <StepWrap title="Extras & property details" onBack={back} onNext={next}>
            <p className="text-slate-400 text-sm mb-3">Add-on services (optional)</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {ADD_ONS.map((a) => (
                <button
                  key={a.id}
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
            <p className="text-slate-400 text-sm mb-3">Property details</p>
            <div className="space-y-3">
              {[
                { state: hasFence, set: setHasFence, label: "Fenced yard", desc: "Gate access needed" },
                { state: hasPets, set: setHasPets, label: "Pets on property", desc: "We'll take extra care" },
                { state: hasSteepSlope, set: setHasSteepSlope, label: "Steep slope / hill", desc: "Adds complexity (15%)" },
                { state: needsHaulAway, set: setNeedsHaulAway, label: "Haul away debris", desc: "+$45 flat fee" },
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
          </StepWrap>
        )}

        {/* Step 5 — Preferred Date */}
        {step === 5 && (
          <StepWrap title="When would you like to start?" onBack={back} onNext={next}>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-2 block">Preferred start date (optional)</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    {...form.register("requestedStartDate")}
                    className="bg-slate-800 border-slate-700 text-white pl-10"
                  />
                </div>
              </div>
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

        {/* Step 6 — Contact Info */}
        {step === 6 && (
          <StepWrap
            title="Your contact info"
            onBack={back}
            onNext={form.handleSubmit(handleContactSubmit)}
            nextLabel={quoteMutation.isPending ? undefined : "Get My Quote"}
            nextDisabled={quoteMutation.isPending}
            nextIcon={quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Full name *</label>
                <Input {...form.register("customerName")} placeholder="Jane Smith" className="bg-slate-800 border-slate-700 text-white" />
                {form.formState.errors.customerName && <p className="text-red-400 text-xs mt-1">{form.formState.errors.customerName.message}</p>}
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Phone *</label>
                <Input {...form.register("phone")} placeholder="(555) 000-0000" type="tel" className="bg-slate-800 border-slate-700 text-white" />
                {form.formState.errors.phone && <p className="text-red-400 text-xs mt-1">{form.formState.errors.phone.message}</p>}
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Email (optional)</label>
                <Input {...form.register("email")} placeholder="jane@email.com" type="email" className="bg-slate-800 border-slate-700 text-white" />
              </div>
              <div>
                <label className="text-slate-400 text-sm mb-1 block">Service address *</label>
                <PlacesAutocomplete
                  value={form.watch("address")}
                  onChange={(v) => form.setValue("address", v, { shouldValidate: true })}
                  onPlaceSelect={(place) => {
                    form.setValue("address", place.fullAddress, { shouldValidate: true });
                    if (place.city) form.setValue("city", place.city);
                    if (place.state) form.setValue("state", place.state);
                    if (place.zip) form.setValue("zip", place.zip);
                  }}
                  placeholder="123 Main St, Ironwood, MI"
                  inputClassName="w-full rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/60 transition-all"
                />
                {form.formState.errors.address && <p className="text-red-400 text-xs mt-1">{form.formState.errors.address.message}</p>}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-slate-400 text-sm mb-1 block">City</label>
                  <Input {...form.register("city")} placeholder="Ironwood" className="bg-slate-800 border-slate-700 text-white" />
                </div>
                <div>
                  <label className="text-slate-400 text-sm mb-1 block">Zip</label>
                  <Input {...form.register("zip")} placeholder="49938" className="bg-slate-800 border-slate-700 text-white" />
                </div>
              </div>
            </div>
          </StepWrap>
        )}

        {/* Step 7 — Quote Result */}
        {step === 7 && quoteResult && (
          <div className="text-center py-6">
            <div className="flex justify-center mb-4">
              <div className="bg-lime-500/10 border border-lime-500/30 rounded-full p-4">
                {quoteResult.pricing.isCustomEstimate
                  ? <Home className="h-8 w-8 text-lime-400" />
                  : <CheckCircle2 className="h-8 w-8 text-lime-400" />
                }
              </div>
            </div>

            {quoteResult.pricing.isCustomEstimate ? (
              <>
                <h2 className="text-xl font-bold mb-2">Custom Estimate Requested</h2>
                <p className="text-slate-400 text-sm mb-6">
                  Your property is a bit unique — Darrell will reach out shortly to discuss pricing and schedule a walkthrough.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-1">Your Instant Quote</h2>
                <div className="my-4">
                  <span className="text-4xl font-black text-lime-400">${quoteResult.pricing.totalQuoted}</span>
                  {quoteResult.quote.serviceFrequency !== "one_time" && (
                    <span className="text-slate-400 text-sm"> / visit</span>
                  )}
                </div>
                <div className="bg-slate-800 rounded-xl p-4 mb-6 text-left">
                  <p className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Quote breakdown</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Base price</span>
                      <span className="text-white">${quoteResult.pricing.basePrice}</span>
                    </div>
                    {quoteResult.pricing.addOnTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Add-ons</span>
                        <span className="text-white">+${quoteResult.pricing.addOnTotal}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t border-slate-700 pt-1 mt-1">
                      <span className="text-white font-semibold">Total</span>
                      <span className="text-lime-400 font-bold">${quoteResult.pricing.totalQuoted}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Badge className="bg-lime-500/20 text-lime-400 border border-lime-500/30 mb-6">
              Quote #{quoteResult.quote.id} — {quoteResult.quote.customerName}
            </Badge>

            <p className="text-slate-400 text-sm mb-6">
              We'll confirm your appointment and send a reminder before service day.
            </p>

            <div className="space-y-3">
              <a href="tel:+12312341234">
                <Button variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800">
                  <Phone className="h-4 w-4 mr-2" /> Call us to confirm
                </Button>
              </a>
              <Link href="/">
                <Button variant="ghost" className="w-full text-slate-400 hover:text-white">
                  Back to home
                </Button>
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function StepWrap({
  title, children, onBack, onNext, nextLabel = "Continue", nextDisabled = false, nextIcon,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: (() => void) | undefined;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-4 text-white">{title}</h2>
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
