// /book — multi-service booking flow (Task #129).
// Single-page experience that walks customers through service selection,
// featured bundles, per-item config, contact, and submission against the
// new /api/bookings + /api/bookings/quote engine.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Phone, Coins, Users, Tag, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import type { User } from "@shared/schema";
import {
  ServiceSelector, BundleOfferStrip, AddOnDrawer, ServiceItemEditor,
  BookingSummarySticky, ValidationBanner,
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
  return {
    serviceCode: svc.code,
    label: svc.name,
    quantity: 1,
    unitPrice: defaultUnitPrice(svc),
    priceMode: defaultPriceMode(svc),
    details: {},
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

export default function MultiServiceBookPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth() as { user: User | null | undefined };
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<SelectedItem[]>([]);
  const [serviceAddress, setServiceAddress] = useState("");
  const [contact, setContact] = useState({
    customerName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
    customerEmail: user?.email || "",
    customerPhone: user?.phoneNumber || "",
    notes: "",
  });
  const [drawerCode, setDrawerCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [confirmation, setConfirmation] = useState<CreateBookingResponse["booking"] & { items: SelectedItem[]; quote: QuoteResult } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const checkoutRef = useRef<HTMLDivElement>(null);

  // ── Data
  const { data: catalogData } = useQuery<{ services: CatalogService[] }>({
    queryKey: ["/api/service-catalog"],
  });
  const services: CatalogService[] = catalogData?.services || [];

  const { data: bundlesData, isLoading: bundlesLoading } = useQuery<{ slots: BundleSlots; bundles: FeaturedBundle[] }>({
    queryKey: ["/api/bundles/featured"],
  });
  const bundleSlots: BundleSlots = bundlesData?.slots || { most_popular: [], best_value: [], fast_addon: [] };

  // ── Live quote (debounced refresh)
  const quoteMutation = useMutation({
    mutationFn: async (payloadItems: SelectedItem[]) => {
      const res = await apiRequest("POST", "/api/bookings/quote", {
        items: payloadItems.map(i => ({
          serviceCode: i.serviceCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          priceMode: i.priceMode,
          label: i.label,
          details: i.details,
        })),
        source: "web_multi_book",
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.quote) setQuote(data.quote as QuoteResult);
    },
  });

  useEffect(() => {
    if (items.length === 0) { setQuote(null); return; }
    const t = setTimeout(() => quoteMutation.mutate(items), 350);
    return () => clearTimeout(t);
    // Refresh on every change (incl. per-item details like date / frequency /
    // scope / notes) — keeps the live summary in sync with anything that
    // could plausibly affect crew, scheduling, or pricing.
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
  function applyBundle(bundle: FeaturedBundle) {
    setItems(prev => {
      const present = new Set(prev.map(i => i.serviceCode));
      const added: SelectedItem[] = [];
      for (const code of bundle.serviceComboJson) {
        if (present.has(code)) continue;
        const svc = services.find(s => s.code === code);
        if (svc) added.push(makeItem(svc));
      }
      return [...prev, ...added];
    });
    toast({ title: bundle.name, description: "Added to your booking — discount will be applied automatically." });
  }

  // ── Submit
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

  function validate(): string[] {
    const errs: string[] = [];
    if (items.length === 0) errs.push("Add at least one service to continue.");
    if (!contact.customerName.trim()) errs.push("Your name is required.");
    if (!contact.customerPhone.trim() || contact.customerPhone.replace(/\D/g, "").length < 7) {
      errs.push("A valid phone number is required.");
    }
    if (!serviceAddress.trim()) errs.push("Service address is required.");
    // Per-item scheduling: enforce the same rules as BundleServiceScheduler.
    // - date_only services need a requestedDate
    // - date_freq services need both a requestedDate and a frequency
    // - call_only services need the callToSchedule flag (auto-set in drawer)
    for (const item of items) {
      const mode = schedulingModeFor(item.serviceCode);
      if (mode === "date_only" && !item.details.requestedDate) {
        errs.push(`Pick a preferred date for ${item.label} (open Details).`);
      }
      if (mode === "date_freq") {
        if (!item.details.requestedDate) {
          errs.push(`Pick a preferred date for ${item.label} (open Details).`);
        }
        if (!item.details.frequency) {
          errs.push(`Pick a frequency for ${item.label} (open Details).`);
        }
      }
    }
    return errs;
  }

  // Set of service codes that have outstanding required fields, for
  // inline highlighting on each ServiceItemEditor.
  function itemNeedsAttention(item: SelectedItem): string | null {
    const mode = schedulingModeFor(item.serviceCode);
    if (mode === "date_only" && !item.details.requestedDate) return "Date required";
    if (mode === "date_freq") {
      if (!item.details.requestedDate) return "Date required";
      if (!item.details.frequency) return "Frequency required";
    }
    return null;
  }

  function scrollToCheckout() {
    checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit() {
    const errs = validate();
    setValidationErrors(errs);
    if (errs.length > 0) {
      scrollToCheckout();
      return;
    }
    submitMutation.mutate();
  }

  // ── Confirmation screen
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

  // ── Main flow
  const validation = validationErrors;

  return (
    <div className="min-h-screen bg-background text-foreground pb-40 lg:pb-12">
      <div className="border-b border-border px-4 py-3 sticky top-0 bg-background/95 backdrop-blur-sm z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </button>
          <h1 className="font-bold text-base sm:text-lg">Book Your Services</h1>
          <a href="tel:+19062859312" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 flex gap-6">
        <div className="flex-1 min-w-0 space-y-8">

          {/* Step 1 — Service entry */}
          <section data-testid="step-services">
            <header className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Step 1</p>
              <h2 className="text-xl font-black">Pick your services</h2>
              <p className="text-sm text-muted-foreground">Tap each service you need — bundle two or more to save.</p>
            </header>
            <ServiceSelector
              services={services}
              selectedCodes={selectedCodes}
              onAdd={addService}
              onRemove={removeService}
            />
          </section>

          {/* Step 2 — Primary job details (address) */}
          <section data-testid="step-details">
            <header className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Step 2</p>
              <h2 className="text-xl font-black">Service address</h2>
              <p className="text-sm text-muted-foreground">Where should we show up?</p>
            </header>
            <PlacesAutocomplete
              value={serviceAddress}
              onChange={setServiceAddress}
              onPlaceSelect={(p) => setServiceAddress(p.fullAddress)}
              placeholder="123 Main St, Ironwood, MI"
            />
          </section>

          {/* Step 3 — Bundle offer strip */}
          <section data-testid="step-bundles">
            <header className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Step 3</p>
              <h2 className="text-xl font-black">Save with a bundle</h2>
              <p className="text-sm text-muted-foreground">Three featured combos — discounts apply automatically.</p>
            </header>
            <BundleOfferStrip
              slots={bundleSlots}
              services={services}
              selectedCodes={selectedCodes}
              onApplyBundle={applyBundle}
              isLoading={bundlesLoading}
            />
          </section>

          {/* Step 4 — Add-on configuration / per-item editing */}
          <section data-testid="step-items">
            <header className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Step 4</p>
              <h2 className="text-xl font-black">Configure each service</h2>
              <p className="text-sm text-muted-foreground">Set quantity, scope, dates, and notes per item.</p>
            </header>
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="items-empty">
                <Plus className="h-5 w-5 mx-auto mb-2 opacity-60" />
                Add a service above to start configuring.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <ServiceItemEditor
                    key={item.serviceCode}
                    item={item}
                    onChange={updateItem}
                    onRemove={() => removeService(item.serviceCode)}
                    onOpenDrawer={() => setDrawerCode(item.serviceCode)}
                    warning={itemNeedsAttention(item)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Step 5 — Live summary lives in the sticky panel; show inline recap on mobile */}

          {/* Step 6 — Checkout/contact */}
          <section ref={checkoutRef} data-testid="step-checkout">
            <header className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Step 6</p>
              <h2 className="text-xl font-black">Your contact info</h2>
              <p className="text-sm text-muted-foreground">We'll text you to confirm scheduling.</p>
            </header>
            <ValidationBanner messages={validation} />
            <div className="space-y-3 mt-3">
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
                  <Label className="text-xs">Email (optional)</Label>
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
                  placeholder="Anything we should know about the job"
                  rows={2}
                  data-testid="contact-notes"
                />
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                data-testid="submit-booking"
              >
                {submitMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Booking…</> : "Confirm & book"}
              </Button>
            </div>
          </section>
        </div>

        <BookingSummarySticky
          items={items}
          quote={quote}
          isQuoting={quoteMutation.isPending}
          onCheckout={scrollToCheckout}
          canCheckout={items.length > 0}
        />
      </div>

      <AddOnDrawer
        open={!!drawerCode}
        item={items.find(i => i.serviceCode === drawerCode) || null}
        onClose={() => setDrawerCode(null)}
        onSave={(next) => { updateItem(next); setDrawerCode(null); }}
      />
    </div>
  );
}
