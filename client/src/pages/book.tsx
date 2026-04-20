// /book — chunked multi-service booking wizard (Task #138).
// One step visible at a time, sticky live summary across all steps, smart
// bundle popup that fires once per cart shape (auto-applied or one-away).

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Phone, Coins, Users, Tag, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import AddressField from "@/components/AddressField";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import type { User } from "@shared/schema";
import {
  ServiceSelector, InlineItemConfigure, BookingSummarySticky,
  BundleSuggestionDialog, type BundleSuggestion,
  type CatalogService, type FeaturedBundle, type SelectedItem, type QuoteResult,
  emojiFor, recommendedCrewSize, schedulingModeFor,
} from "@/components/MultiBookingFlow";

interface BundleSlots {
  most_popular: FeaturedBundle[];
  best_value: FeaturedBundle[];
  fast_addon: FeaturedBundle[];
}

function defaultUnitPrice(svc: CatalogService): number {
  if (svc.defaultPrice) return parseFloat(svc.defaultPrice);
  if (svc.suggestedMin) return parseFloat(svc.suggestedMin);
  return 0;
}

function defaultPriceMode(svc: CatalogService): SelectedItem["priceMode"] {
  return (svc.defaultPriceMode as SelectedItem["priceMode"]) || "fixed";
}

function makeItem(svc: CatalogService): SelectedItem {
  // Pre-populate `callToSchedule` for call_only services so they're not stuck
  // in a "needs attention" state until the user opens an editor.
  const mode = schedulingModeFor(svc.code);
  const details: SelectedItem["details"] =
    mode === "call_only" ? { callToSchedule: true } : {};
  // Task #141: Moving and Junk Removal are sold via the chatbot's crew-size ×
  // hours package picker. Initialise them as a quote (no flat unit price)
  // until the user picks a specific package in the configure step.
  const isPicker = svc.code === "moving" || svc.code === "junk_removal";
  // Task #146 — pre-populate sensible Trash Valet defaults so the customer
  // can submit without touching every field, but the admin still gets a
  // complete subscription payload.
  if (svc.code === "trash_valet") {
    details.cans = 1;
    details.bagCount = 0;
    details.serviceDayOfWeek = 1;
    details.planType = "monthly";
    details.recyclingEnabled = false;
  }
  return {
    serviceCode: svc.code,
    label: svc.name,
    quantity: 1,
    unitPrice: isPicker ? 0 : defaultUnitPrice(svc),
    priceMode: isPicker ? "quote" : defaultPriceMode(svc),
    details,
  };
}

interface CreateBookingResponse {
  success: true;
  booking: {
    id: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string;
    serviceAddress: string | null;
    finalTotal: string;
    discountTotal: string;
    tokenEstimate: number;
  };
  quote: QuoteResult;
}

const STEPS = ["services", "address", "configure", "contact", "review"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABELS: Record<Step, string> = {
  services: "Pick services",
  address: "Service address",
  configure: "Configure each service",
  contact: "Contact info",
  review: "Review & confirm",
};

function itemNeedsAttention(item: SelectedItem): string | null {
  // Task #141: Moving / Junk Removal must pass through the package picker so
  // we capture crew, hours and tier (and any JC222 flat-rate eligibility)
  // before the booking submits.
  if (item.serviceCode === "moving" || item.serviceCode === "junk_removal") {
    if (!item.details.jobSize)   return "Pick a job size";
    if (!item.details.packageId) return "Pick a crew package";
    if (!item.details.requestedDate) return "Date required";
    return null;
  }
  // Task #146 — Trash Valet runs as a recurring subscription, not a single
  // dated job. Validate the subscription fields the admin pipeline needs to
  // auto-provision instead of asking for a single requestedDate.
  if (item.serviceCode === "trash_valet") {
    if (!item.details.cans || item.details.cans < 1) return "Pick how many cans";
    if (!item.details.serviceDayOfWeek) return "Pick a trash pickup day";
    if (item.details.recyclingEnabled && !item.details.recyclingAnchorDate) {
      return "Pick the first recycling week date";
    }
    return null;
  }
  const mode = schedulingModeFor(item.serviceCode);
  if (mode === "date_only" && !item.details.requestedDate) return "Date required";
  if (mode === "date_freq") {
    if (!item.details.requestedDate) return "Date required";
    if (!item.details.frequency) return "Frequency required";
  }
  if (mode === "call_only" && !item.details.callToSchedule) return "Confirm scheduling preference";
  return null;
}

export default function MultiServiceBookPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth() as { user: User | null | undefined };
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("services");
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [serviceAddress, setServiceAddress] = useState("");
  // Task #164 — captured by AddressField so the green confirmation pill
  // can render after a Places click, geocode-on-blur, or autofill resolve.
  // Not sent to the backend (the multi-booking POST only takes the full
  // address string) but kept locally so the UX matches the other flows.
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [contact, setContact] = useState({
    customerName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
    customerEmail: user?.email || "",
    customerPhone: user?.phoneNumber || "",
    notes: "",
  });
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [confirmation, setConfirmation] = useState<
    CreateBookingResponse["booking"] & { items: SelectedItem[]; quote: QuoteResult } | null
  >(null);

  // ── Data
  const { data: catalogData } = useQuery<{ services: CatalogService[] }>({
    queryKey: ["/api/service-catalog"],
  });
  const services: CatalogService[] = catalogData?.services || [];

  const { data: bundlesData } = useQuery<{ slots: BundleSlots; bundles: FeaturedBundle[] }>({
    queryKey: ["/api/bundles/featured"],
  });
  const allBundles: FeaturedBundle[] = bundlesData?.bundles || [];

  // ── Live quote (debounced + latest-wins to prevent stale-response races)
  // `quoteCartSig` records the cart signature the current `quote` represents.
  // Anything that reads `quote.bundleApplied` for behavior (the bundle popup)
  // must check `quoteCartSig === currentCartSig` first — otherwise we'd act
  // on a quote computed for a different cart shape.
  const cartSigOf = (xs: SelectedItem[]) =>
    xs.map(i => i.serviceCode).slice().sort().join(",");
  const [quoteCartSig, setQuoteCartSig] = useState<string>("");
  const quoteSeqRef = useRef(0);
  const quoteMutation = useMutation({
    mutationFn: async (payload: { seq: number; sig: string; payloadItems: SelectedItem[] }) => {
      const res = await apiRequest("POST", "/api/bookings/quote", {
        items: payload.payloadItems.map(i => ({
          serviceCode: i.serviceCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          priceMode: i.priceMode,
          label: i.label,
          details: i.details,
        })),
        source: "web_multi_book",
      });
      const data = await res.json();
      return { seq: payload.seq, sig: payload.sig, data };
    },
    onSuccess: ({ seq, sig, data }) => {
      if (seq !== quoteSeqRef.current) return;
      if (data?.quote) {
        setQuote(data.quote as QuoteResult);
        setQuoteCartSig(sig);
      }
    },
  });

  useEffect(() => {
    if (items.length === 0) { setQuote(null); setQuoteCartSig(""); return; }
    const t = setTimeout(() => {
      quoteSeqRef.current += 1;
      quoteMutation.mutate({
        seq: quoteSeqRef.current,
        sig: cartSigOf(items),
        payloadItems: items,
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items)]);

  // ── Item helpers
  const selectedCodes = useMemo(() => new Set(items.map(i => i.serviceCode)), [items]);

  function addService(svc: CatalogService) {
    setItems(prev => prev.some(i => i.serviceCode === svc.code) ? prev : [...prev, makeItem(svc)]);
  }
  function removeService(code: string) {
    setItems(prev => prev.filter(i => i.serviceCode !== code));
  }
  function updateItem(next: SelectedItem) {
    setItems(prev => prev.map(i => i.serviceCode === next.serviceCode ? next : i));
  }

  // ── Smart bundle popup ───────────────────────────────────────────────────
  // Compute the right suggestion (auto_applied or one_away), gated by a
  // shown-signature ref so the same dialog never re-pops for the same cart.
  const [suggestion, setSuggestion] = useState<BundleSuggestion | null>(null);
  const shownSigRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (items.length === 0 || allBundles.length === 0) return;
    const cartCodes = new Set(items.map(i => i.serviceCode));
    const sortedCart = [...cartCodes].sort().join(",");
    // Wait until the live quote has caught up to the current cart shape.
    // Acting on a stale `quote.bundleApplied` would fire an auto_applied
    // popup for a cart that may no longer qualify — and would suppress
    // the correct one_away pitch for the new shape.
    if (quoteCartSig !== sortedCart) return;
    const appliedCode = quote?.bundleApplied?.code ?? null;
    const sig = `${sortedCart}|${appliedCode ?? ""}`;
    if (shownSigRef.current.has(sig)) return;

    // Mode 1 — auto_applied: a featured bundle is currently being applied.
    // Show one informational popup; do not pitch any other bundle.
    if (appliedCode) {
      const bundle = allBundles.find(b => b.code === appliedCode);
      if (bundle) {
        setSuggestion({
          mode: "auto_applied",
          bundle,
          savings: quote?.discountTotal ?? 0,
        });
        shownSigRef.current.add(sig);
      }
      return;
    }

    // Mode 2 — one_away: no bundle applied. Find a bundle where the cart
    // is a strict subset of its combo and exactly one service is missing.
    // Prefer the one with the largest expected discount.
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    let best: { bundle: FeaturedBundle; missingCode: string; expected: number } | null = null;

    for (const bundle of allBundles) {
      const combo = bundle.serviceComboJson;
      const allCartItemsInCombo = items.every(i => combo.includes(i.serviceCode));
      if (!allCartItemsInCombo) continue;
      const missing = combo.filter(c => !cartCodes.has(c));
      if (missing.length !== 1) continue;

      const expected = bundle.discountType === "percent"
        ? subtotal * (parseFloat(bundle.discountValue) / 100)
        : parseFloat(bundle.discountValue);
      if (!best || expected > best.expected) {
        best = { bundle, missingCode: missing[0], expected };
      }
    }

    if (best) {
      const missingSvc = services.find(s => s.code === best!.missingCode);
      if (missingSvc) {
        setSuggestion({ mode: "one_away", bundle: best.bundle, missing: missingSvc });
        shownSigRef.current.add(sig);
      }
    }
  }, [items, quote, allBundles, services]);

  function handleSuggestionAccept() {
    if (!suggestion) return;
    if (suggestion.mode === "one_away") {
      addService(suggestion.missing);
      toast({
        title: `${suggestion.bundle.name} unlocked`,
        description: "Discount will apply automatically.",
      });
    }
    setSuggestion(null);
  }

  // ── Submit (final step)
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bookings", {
        items: items.map(i => ({
          serviceCode: i.serviceCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          priceMode: i.priceMode,
          label: i.label,
          details: i.details,
        })),
        customerName: contact.customerName.trim(),
        customerEmail: contact.customerEmail.trim() || undefined,
        customerPhone: contact.customerPhone.trim(),
        serviceAddress: serviceAddress.trim() || undefined,
        notes: contact.notes.trim() || undefined,
        source: "web_multi_book",
      });
      return res.json() as Promise<CreateBookingResponse>;
    },
    onSuccess: (data) => {
      if (data?.booking) {
        setConfirmation({ ...data.booking, items: [...items], quote: data.quote });
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Could not create booking",
        description: err.message ? err.message.slice(0, 200) : "Please try again or call us.",
        variant: "destructive",
      });
    },
  });

  // ── Per-step gate. Returns reason string when Continue should be disabled.
  function canContinueReason(): string | null {
    // Global guard: every step past services requires at least one item, in
    // case a user removes their last service after step 1 and tries to
    // proceed/submit (server requires items.length > 0 — would 400).
    if (items.length === 0) return "Add at least one service to continue";
    if (step === "address") {
      if (!serviceAddress.trim()) return "Enter the service address";
    }
    if (step === "configure") {
      for (const item of items) {
        const w = itemNeedsAttention(item);
        if (w) return `${item.label}: ${w.toLowerCase()}`;
      }
    }
    if (step === "contact") {
      if (!contact.customerName.trim()) return "Enter your full name";
      if (contact.customerPhone.replace(/\D/g, "").length < 7) return "Enter a valid phone number";
      const email = contact.customerEmail.trim();
      if (!email) return "Enter your email so we can confirm";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
    }
    return null;
  }

  function goNext() {
    const reason = canContinueReason();
    if (reason) return;
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goBack() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Confirmation screen (unchanged)
  if (confirmation) {
    const c = confirmation;
    const finalTotal = parseFloat(c.finalTotal);
    const discount = parseFloat(c.discountTotal);
    return (
      <div className="min-h-screen bg-background pb-16">
        <div className="max-w-2xl mx-auto px-4 pt-8">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Booking Confirmed!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                We've received your request and will reach out to {c.customerPhone} to schedule.
              </p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 text-left space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Your services</p>
              {c.items.map(i => (
                <div key={i.serviceCode} className="flex justify-between text-sm">
                  <span>{emojiFor(i.serviceCode)} {i.label}{i.details.requestedDate ? ` • ${i.details.requestedDate}` : ""}</span>
                  <span className="font-semibold">
                    {i.priceMode === "quote" ? "TBD" : `$${(i.quantity * i.unitPrice).toFixed(2)}`}
                  </span>
                </div>
              ))}
              {discount > 0 && c.quote.bundleApplied && (
                <div className="flex justify-between text-sm text-emerald-500 pt-1 border-t border-border">
                  <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {c.quote.bundleApplied.name}</span>
                  <span>−${discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span>Final total</span>
                <span>${finalTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span><Users className="inline h-3 w-3" /> Crew of {recommendedCrewSize(c.items)} recommended</span>
                <span className="text-orange-500"><Coins className="inline h-3 w-3" /> +{c.tokenEstimate} JCMOVES</span>
              </div>
            </div>
            <Button className="w-full" onClick={() => setLocation("/")}>Back to Home</Button>
            <BookingConfirmedTiles
              serviceType={c.items[0]?.serviceCode}
              customerEmail={c.customerEmail || undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard
  const stepIdx = STEPS.indexOf(step);
  const isLast = step === "review";
  const continueReason = canContinueReason();
  const isFirst = step === "services";

  // Wizard nav rendered both inside the desktop summary panel and inside
  // the mobile docked summary bar so it's visible across all steps.
  const wizardNav = (
    <div className="space-y-2 w-full">
      {continueReason && !isLast && (
        <p className="text-[11px] text-amber-500 flex items-start gap-1" data-testid="continue-reason">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {continueReason}
        </p>
      )}
      <div className="flex gap-2">
        {!isFirst && (
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            className="flex-1"
            data-testid="wizard-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
        {isLast ? (
          <Button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="flex-1"
            data-testid="wizard-confirm"
          >
            {submitMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Booking…</>
              : "Confirm & book"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={goNext}
            disabled={!!continueReason}
            className="flex-1"
            data-testid="wizard-continue"
          >
            Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-44 lg:pb-12">
      {/* Top bar */}
      <div className="border-b border-border px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-sm z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-home">
            <ArrowLeft className="h-4 w-4" /> Home
          </button>
          <h1 className="font-bold text-base sm:text-lg">Book Your Services</h1>
          <a href="tel:+19062859312" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500" data-testid="step-indicator">
            Step {stepIdx + 1} of {STEPS.length} · {STEP_LABELS[step]}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {Math.round(((stepIdx + 1) / STEPS.length) * 100)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 flex gap-6">
        <div className="flex-1 min-w-0 space-y-6">

          {/* Step 1 — Services */}
          {step === "services" && (
            <section data-testid="step-services">
              <header className="mb-3">
                <h2 className="text-xl font-black">What do you need?</h2>
                <p className="text-sm text-muted-foreground">Tap each service. We'll suggest a bundle if your selection qualifies.</p>
              </header>
              <ServiceSelector
                services={services}
                selectedCodes={selectedCodes}
                onAdd={addService}
                onRemove={removeService}
              />
            </section>
          )}

          {/* Step 2 — Address */}
          {step === "address" && (
            <section data-testid="step-address">
              <header className="mb-3">
                <h2 className="text-xl font-black">Where are we going?</h2>
                <p className="text-sm text-muted-foreground">The address where the work will happen.</p>
              </header>
              <AddressField
                value={serviceAddress}
                onChange={setServiceAddress}
                city={addressCity}
                state={addressState}
                zip={addressZip}
                onCityChange={setAddressCity}
                onStateChange={setAddressState}
                onZipChange={setAddressZip}
                onResolved={(p) => setServiceAddress(p.fullAddress)}
                placeholder="123 Main St, Ironwood, MI"
                theme="zinc"
                hint="Pick a suggestion or just keep typing — we'll confirm the city, state, and ZIP automatically."
                data-testid="address-field-multi"
              />
            </section>
          )}

          {/* Step 3 — Configure each item (inline cards, no drawer) */}
          {step === "configure" && (
            <section data-testid="step-configure">
              <header className="mb-3">
                <h2 className="text-xl font-black">Configure each service</h2>
                <p className="text-sm text-muted-foreground">Pick a date, frequency, and scope for every item before continuing.</p>
              </header>
              <div className="space-y-3">
                {items.map(item => (
                  <InlineItemConfigure
                    key={item.serviceCode}
                    item={item}
                    onChange={updateItem}
                    onRemove={() => removeService(item.serviceCode)}
                    warning={itemNeedsAttention(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Step 4 — Contact info */}
          {step === "contact" && (
            <section data-testid="step-contact">
              <header className="mb-3">
                <h2 className="text-xl font-black">How do we reach you?</h2>
                <p className="text-sm text-muted-foreground">We'll text you to confirm scheduling.</p>
              </header>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Full name</Label>
                  <Input
                    value={contact.customerName}
                    onChange={(e) => setContact(c => ({ ...c, customerName: e.target.value }))}
                    placeholder="Jane Smith"
                    data-testid="contact-name"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      type="tel"
                      value={contact.customerPhone}
                      onChange={(e) => setContact(c => ({ ...c, customerPhone: e.target.value }))}
                      placeholder="(906) 555-0123"
                      data-testid="contact-phone"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      value={contact.customerEmail}
                      onChange={(e) => setContact(c => ({ ...c, customerEmail: e.target.value }))}
                      placeholder="jane@example.com"
                      data-testid="contact-email"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes for the crew (optional)</Label>
                  <Textarea
                    value={contact.notes}
                    onChange={(e) => setContact(c => ({ ...c, notes: e.target.value }))}
                    placeholder="Gate code, parking notes, anything we should know"
                    rows={3}
                    data-testid="contact-notes"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Step 5 — Review */}
          {step === "review" && (
            <section data-testid="step-review">
              <header className="mb-3">
                <h2 className="text-xl font-black">Review &amp; confirm</h2>
                <p className="text-sm text-muted-foreground">Last look before we lock it in.</p>
              </header>
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Address</p>
                  <p className="text-sm">{serviceAddress}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Contact</p>
                  <p className="text-sm">{contact.customerName} · {contact.customerPhone} · {contact.customerEmail}</p>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Services</p>
                  <div className="space-y-1.5">
                    {items.map(i => (
                      <div key={i.serviceCode} className="flex justify-between text-sm">
                        <span className="truncate pr-2">
                          {emojiFor(i.serviceCode)} {i.label}
                          {i.details.requestedDate ? ` · ${i.details.requestedDate}` : i.details.callToSchedule ? " · we'll call" : ""}
                          {i.details.frequency ? ` · ${i.details.frequency}` : ""}
                        </span>
                        <span className="font-semibold whitespace-nowrap">
                          {i.priceMode === "quote" ? "TBD" : `$${(i.quantity * i.unitPrice).toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {quote && (
                  <div className="border-t border-border pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${quote.subtotal.toFixed(2)}</span>
                    </div>
                    {quote.discountTotal > 0 && quote.bundleApplied && (
                      <div className="flex justify-between text-sm text-emerald-500">
                        <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {quote.bundleApplied.name}</span>
                        <span>−${quote.discountTotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-1 border-t border-border">
                      <span>Total</span>
                      <span>${quote.finalTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-orange-400 text-right pt-1">
                      <Coins className="inline h-3 w-3" /> +{quote.tokenEstimate} JCMOVES on completion
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

        </div>

        <BookingSummarySticky
          items={items}
          quote={quote}
          isQuoting={quoteMutation.isPending}
          onCheckout={() => { /* unused in wizard mode */ }}
          canCheckout={items.length > 0}
          bottomSlot={wizardNav}
        />
      </div>

      <BundleSuggestionDialog
        suggestion={suggestion}
        services={services}
        onAccept={handleSuggestionAccept}
        onClose={() => setSuggestion(null)}
      />
    </div>
  );
}
