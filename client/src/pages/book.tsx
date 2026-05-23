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
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import {
  MIN_REDEMPTION_TOKENS,
  REDEMPTION_INCREMENT,
  maxTokensForSubtotal,
  tokensToDollars,
} from "@shared/tokenRedemptionRules";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import AddressField from "@/components/AddressField";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import type { User } from "@shared/schema";
import {
  ServiceSelector, InlineItemConfigure, BookingSummarySticky,
  BundleSuggestionDialog, type BundleSuggestion,
  type CatalogService, type FeaturedBundle, type SelectedItem, type QuoteResult,
  emojiFor, recommendedCrewSize, schedulingModeFor, formatLinePrice, formatLineLaborSubline,
  formatMovingFlowSummary,
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
    if (item.serviceCode === "moving" && !item.details.loadType) return "Pick load or unload";
    if (item.serviceCode === "moving" && item.details.truckNeeded == null) return "Tell us who provides the truck";
    if (item.serviceCode === "moving" && item.details.truckNeeded != null && !item.details.truckSize) return "Pick a truck size";
    if (item.serviceCode === "moving" && /both|load \+ unload/i.test(item.details.loadType || "") && !item.details.dropoffAddress?.trim()) {
      return "Enter the drop-off address";
    }
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

  // Task #169 — `?worker=1` opts the page into worker mode (used by crew
  // posting a job on behalf of a customer). Right now this changes the
  // banner + post-confirmation routing; the form fields are identical so
  // workers and customers stay in lock-step on pricing.
  const isWorker = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("worker") === "1" || sp.get("mode") === "worker";
  }, []);

  // Task #207 — URL prefill contract. Read once on mount so the chat-intake
  // overlay (and the existing single-service homepage tiles) can hand the
  // wizard a ready-made cart + jump straight to the configure / contact
  // step. Resolved against the live catalog inside an effect below; here
  // we just snapshot the raw query params.
  //
  // Note on `?bundle=<code>`: the URL contract carries it for analytics /
  // hand-off transparency, but the wizard does not need to consume it —
  // the live bundle engine in /api/bookings/quote auto-applies any
  // matching bundle based purely on cart contents. So we deliberately
  // do not extract it here; the existing one-away / auto-applied popup
  // in this file (driven by `quote.bundleApplied`) is the single source
  // of truth for bundle UX.
  const urlPrefill = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        codes: [] as string[],
        jumpStep: null as Step | null,
        serviceAddress: "",
        linePrice: null as number | null,
        lineLabel: "",
        lineDetails: {} as SelectedItem["details"],
      };
    }
    const sp = new URLSearchParams(window.location.search);
    const codes = new Set<string>();
    const multi = sp.get("services");
    if (multi) multi.split(",").map((c) => c.trim()).filter(Boolean).forEach((c) => codes.add(c));
    // Single-service alias used by the existing home tiles (e.g. ?service=moving).
    // Tile values use slug-style codes that may differ from catalog codes; we
    // normalise the few legacy aliases here.
    const single = sp.get("service");
    if (single) {
      const aliases: Record<string, string> = {
        moving: "moving",
        junk: "junk_removal",
        "junk-removal": "junk_removal",
        cleaning: "cleaning",
        snow: "snow_removal",
        "snow-removal": "snow_removal",
        handyman: "handyman",
        window: "window_cleaning",
        "window-cleaning": "window_cleaning",
        "trash-valet": "trash_valet",
        trash_valet: "trash_valet",
        demolition: "demolition",
        flooring: "flooring",
        painting: "painting",
        roofing: "roofing",
        labor: "labor",
        delivery: "delivery",
      };
      const resolved = aliases[single.toLowerCase()] ?? single;
      codes.add(resolved);
    }
    const stepParam = sp.get("step");
    const jumpStep = stepParam && (STEPS as readonly string[]).includes(stepParam)
      ? (stepParam as Step)
      : null;
    const serviceAddress = sp.get("address")?.trim() || "";
    const rawPrice = Number(sp.get("price"));
    const linePrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null;
    const lineLabel = sp.get("label")?.trim() || "";
    let lineDetails: SelectedItem["details"] = {};
    const detailsParam = sp.get("details");
    if (detailsParam) {
      try {
        const parsed = JSON.parse(detailsParam) as SelectedItem["details"];
        if (parsed && typeof parsed === "object") lineDetails = parsed;
      } catch {
        lineDetails = {};
      }
    }
    return { codes: Array.from(codes), jumpStep, serviceAddress, linePrice, lineLabel, lineDetails };
  }, []);

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
  // Task #169 — worker-mode-only fields. Captured here and folded into the
  // notes payload + source field so they reach the lead/booking record
  // without requiring a schema migration. The dispatch task (#172) will
  // promote these into first-class columns.
  const [workerFields, setWorkerFields] = useState({
    assignedTo: "",       // crew member name to assign the job to
    leadSource: "",       // door-knock, referral, repeat, walkup, other
    internalNotes: "",    // crew-only notes invisible to the customer
  });
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  // Task #181 — wallet payment / token redemption state
  const [payFromWallet, setPayFromWallet] = useState(false);
  const [applyTokens, setApplyTokens] = useState(0);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const customerTier = (user?.loyaltyTier as string | undefined) || "bronze";
  const [confirmation, setConfirmation] = useState<
    CreateBookingResponse["booking"] & { items: SelectedItem[]; quote: QuoteResult } | null
  >(null);
  const stepIndex = (s: Step) => STEPS.indexOf(s);
  const hasMovingService = useMemo(() => items.some((item) => item.serviceCode === "moving"), [items]);

  // ── Data
  const { data: catalogData } = useQuery<{ services: CatalogService[] }>({
    queryKey: ["/api/service-catalog"],
  });
  const services: CatalogService[] = catalogData?.services || [];

  const { data: bundlesData } = useQuery<{ slots: BundleSlots; bundles: FeaturedBundle[] }>({
    queryKey: ["/api/bundles/featured"],
  });
  const allBundles: FeaturedBundle[] = bundlesData?.bundles || [];

  // Task #181 — Live wallet balance for the signed-in customer. Only
  // queried when authenticated; anonymous users see no wallet panel.
  const { data: walletData } = useQuery<{ tokenBalance: string; cashBalance: string }>({
    queryKey: ["/api/wallet/balance"],
    enabled: !!user,
  });
  const walletCash = walletData ? parseFloat(walletData.cashBalance || "0") : 0;
  const walletTokens = walletData ? Math.floor(parseFloat(walletData.tokenBalance || "0")) : 0;

  // Task #181 — normalize the requested redemption whenever the tier cap
  // (driven by quote.subtotal) or wallet token balance shrinks. Without
  // this, the slider's rendered value clamps but state remains stale and
  // submit could send an `applyTokens` above the cap, triggering a
  // server rejection the user has no way to recover from once the
  // slider hides.
  const tokenSliderMax = useMemo(() => {
    const subtotal = quote?.subtotal ?? 0;
    if (subtotal <= 0) return 0;
    const tierCap = maxTokensForSubtotal(subtotal, customerTier);
    return Math.min(walletTokens, tierCap);
  }, [quote?.subtotal, customerTier, walletTokens]);

  useEffect(() => {
    if (applyTokens === 0) return;
    if (tokenSliderMax < MIN_REDEMPTION_TOKENS) {
      setApplyTokens(0);
      return;
    }
    if (applyTokens > tokenSliderMax) {
      const snapped = Math.floor(tokenSliderMax / REDEMPTION_INCREMENT) * REDEMPTION_INCREMENT;
      setApplyTokens(snapped < MIN_REDEMPTION_TOKENS ? 0 : snapped);
    }
  }, [tokenSliderMax, applyTokens]);

  // Task #181 — auto-uncheck "Pay from wallet" if cash drops below the
  // current total. The server has no partial-fallback today, so leaving
  // the box checked would just guarantee a 400 at submit.
  useEffect(() => {
    if (!payFromWallet) return;
    const total = quote?.finalTotal ?? 0;
    if (walletCash < total) setPayFromWallet(false);
  }, [walletCash, quote?.finalTotal, payFromWallet]);

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
    mutationFn: async (payload: { seq: number; sig: string; payloadItems: SelectedItem[]; applyTokens: number }) => {
      const body: Record<string, unknown> = {
        items: payload.payloadItems.map(i => ({
          serviceCode: i.serviceCode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          priceMode: i.priceMode,
          label: i.label,
          details: i.details,
        })),
        source: "web_multi_book",
      };
      if (payload.applyTokens >= MIN_REDEMPTION_TOKENS) {
        body.applyTokens = payload.applyTokens;
        body.customerTier = customerTier;
      }
      try {
        const res = await apiRequest("POST", "/api/bookings/quote", body);
        const data = await res.json();
        return { seq: payload.seq, sig: payload.sig, data, error: null as string | null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Quote failed";
        return { seq: payload.seq, sig: payload.sig, data: null, error: message };
      }
    },
    onSuccess: ({ seq, sig, data, error }) => {
      if (seq !== quoteSeqRef.current) return;
      if (error) {
        // apiRequest throws on non-2xx with `${status}: ${body}`. Strip
        // the status prefix and surface the server's message text.
        const m = error.match(/^\d+:\s*(.*)$/);
        let msg = m ? m[1] : error;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.message || parsed.error || msg;
        } catch { /* not json */ }
        setTokenError(msg);
        return;
      }
      if (data?.quote) {
        setQuote(data.quote as QuoteResult);
        setQuoteCartSig(sig);
        setTokenError(null);
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
        applyTokens,
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items), applyTokens]);

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

  // Task #207 — Resolve URL prefill against the live catalog the moment
  // the catalog query lands. Codes that don't exist in the catalog are
  // silently skipped (e.g. a chip that points at "painting" before the
  // catalog stocks it). Runs exactly once per page load using a ref so
  // the customer can later remove an auto-added service without it
  // bouncing back on the next render.
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (services.length === 0) return;
    if (
      urlPrefill.codes.length === 0 &&
      !urlPrefill.jumpStep &&
      !urlPrefill.serviceAddress &&
      !urlPrefill.linePrice &&
      !urlPrefill.lineLabel &&
      Object.keys(urlPrefill.lineDetails).length === 0
    ) {
      prefillAppliedRef.current = true;
      return;
    }
    let next = [...items];
    for (const code of urlPrefill.codes) {
      const svc = services.find((s) => s.code === code);
      if (!svc) continue;
      if (!next.some((item) => item.serviceCode === svc.code)) {
        next = [...next, makeItem(svc)];
      }
    }

    const firstCode = urlPrefill.codes[0];
    if (firstCode) {
      next = next.map((item) => {
        if (item.serviceCode !== firstCode) return item;
        return {
          ...item,
          label: urlPrefill.lineLabel || item.label,
          unitPrice: urlPrefill.linePrice ?? item.unitPrice,
          details: {
            ...item.details,
            ...urlPrefill.lineDetails,
          },
        };
      });
    }
    setItems(next);
    if (urlPrefill.serviceAddress) {
      setServiceAddress(urlPrefill.serviceAddress);
    }
    if (urlPrefill.jumpStep) {
      let resolvedStep = urlPrefill.jumpStep;
      if (!urlPrefill.serviceAddress && stepIndex(resolvedStep) >= stepIndex("address")) {
        resolvedStep = "address";
      }
      if (stepIndex(resolvedStep) >= stepIndex("configure") && next.some((item) => !!itemNeedsAttention(item))) {
        resolvedStep = "configure";
      }
      setStep(resolvedStep);
    }
    prefillAppliedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.length]);

  // ── Smart bundle popup ───────────────────────────────────────────────────
  // Compute the right suggestion (auto_applied or one_away), gated by a
  // shown-signature ref so the same dialog never re-pops for the same cart.
  const [suggestion, setSuggestion] = useState<BundleSuggestion | null>(null);
  const shownSigRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (step !== "review") return;
    if (items.length === 0 || allBundles.length === 0) return;
    let popupTimer: number | undefined;
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
        popupTimer = window.setTimeout(() => setSuggestion({
            mode: "auto_applied",
            bundle,
            savings: quote?.discountTotal ?? 0,
          }), 700);
        shownSigRef.current.add(sig);
      }
      return () => {
        if (popupTimer) window.clearTimeout(popupTimer);
      };
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
        popupTimer = window.setTimeout(() => setSuggestion({ mode: "one_away", bundle: best.bundle, missing: missingSvc }), 700);
        shownSigRef.current.add(sig);
      }
    }
    return () => {
      if (popupTimer) window.clearTimeout(popupTimer);
    };
  }, [step, items, quote, allBundles, services]);

  useEffect(() => {
    if (step !== "review" && suggestion) setSuggestion(null);
  }, [step, suggestion]);

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
      // Task #169 — worker mode appends the crew-only fields to the notes
      // string and tags the source so admin/dispatch can filter on it.
      const workerNoteParts: string[] = [];
      if (isWorker && workerFields.assignedTo.trim()) workerNoteParts.push(`[CREW ASSIGN] ${workerFields.assignedTo.trim()}`);
      if (isWorker && workerFields.leadSource.trim()) workerNoteParts.push(`[LEAD SOURCE] ${workerFields.leadSource.trim()}`);
      if (isWorker && workerFields.internalNotes.trim()) workerNoteParts.push(`[INTERNAL] ${workerFields.internalNotes.trim()}`);
      const customerNotes = contact.notes.trim();
      const combinedNotes = [customerNotes, ...workerNoteParts].filter(Boolean).join("\n");

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
        notes: combinedNotes || undefined,
        source: isWorker ? "crew_add_job" : "web_multi_book",
        ...((() => {
          // Re-clamp at submit so a stale state value can never bypass
          // the slider's tier/wallet cap (defense in depth — the effect
          // above already normalises on cap changes).
          const capped = Math.min(applyTokens, tokenSliderMax);
          const snapped = Math.floor(capped / REDEMPTION_INCREMENT) * REDEMPTION_INCREMENT;
          return snapped >= MIN_REDEMPTION_TOKENS
            ? { applyTokens: snapped, customerTier }
            : {};
        })()),
        ...(payFromWallet ? { payFromWallet: true } : {}),
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
      // Task #181 — if the server rejected wallet/token redemption,
      // surface the message inline in the wallet panel rather than
      // burying it in a toast that disappears.
      const raw = err.message || "";
      const m = raw.match(/^\d+:\s*(.*)$/);
      let parsed: { error?: string; message?: string } | null = null;
      try { parsed = JSON.parse(m ? m[1] : raw); } catch { /* not json */ }
      const errCode = parsed?.error || "";
      const isWalletRedemptionError = /wallet|token|redemption|insufficient|jcmoves/i.test(errCode + " " + (parsed?.message || ""));
      if (isWalletRedemptionError) {
        setTokenError(parsed?.message || parsed?.error || "Wallet payment was rejected.");
        return;
      }
      toast({
        title: "Could not create booking",
        description: raw ? raw.slice(0, 200) : "Please try again or call us.",
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
    if (stepIndex(step) >= stepIndex("address")) {
      if (!serviceAddress.trim()) return "Enter the service address";
    }
    if (stepIndex(step) >= stepIndex("configure")) {
      for (const item of items) {
        const w = itemNeedsAttention(item);
        if (w) return `${item.label}: ${w.toLowerCase()}`;
      }
    }
    if (stepIndex(step) >= stepIndex("contact")) {
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
              {c.items.map((i, idx) => {
                const fallbackLinePrice = formatLinePrice(i, { fractionDigits: 2 });
                // Task #218 round-9 rev2 — match the chat card's
                // "N people × M hrs at $85/hr" subline so the wizard's
                // confirmation step shows the same labor breakdown the
                // customer saw in the recommended-plan card. Use index
                // alignment (not serviceCode find()) so duplicate lines
                // of the same service get their own labor meta.
                const quoteLine = c.quote.items[idx];
                const laborMeta = quoteLine?.serviceCode === i.serviceCode ? quoteLine.laborMeta : undefined;
                const laborSubline = formatLineLaborSubline(laborMeta);
                const movingSummary = formatMovingFlowSummary(i);
                const resolvedLineSubtotal = typeof quoteLine?.lineSubtotal === "number"
                  ? quoteLine.lineSubtotal
                  : null;
                return (
                  <div key={i.serviceCode} className="flex justify-between text-sm">
                    <span>
                      {emojiFor(i.serviceCode)} {i.label}{i.details.requestedDate ? ` • ${i.details.requestedDate}` : ""}
                      {laborSubline && (
                        <span className="block text-[10px] font-normal text-muted-foreground" data-testid={`confirm-line-labor-${i.serviceCode}`}>
                          {laborSubline}
                        </span>
                      )}
                      {movingSummary.length > 0 && (
                        <span className="block text-[10px] font-normal text-muted-foreground" data-testid={`confirm-line-moving-${i.serviceCode}`}>
                          {movingSummary.join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-right">
                      {resolvedLineSubtotal !== null
                        ? `$${resolvedLineSubtotal.toFixed(2)}`
                        : fallbackLinePrice.text}
                      {fallbackLinePrice.isEstimate && (
                        <span className="block text-[10px] font-normal text-muted-foreground">estimate · crew confirms</span>
                      )}
                    </span>
                  </div>
                );
              })}
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
      {continueReason && (
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
            disabled={submitMutation.isPending || !!continueReason}
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
          <h1 className="font-bold text-base sm:text-lg">
            {isWorker ? "Add a Job (Crew)" : "Book Your Services"}
          </h1>
          <a href="tel:+19062859312" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        </div>
      </div>

      {/* Task #169 — worker-mode banner */}
      {isWorker && (
        <div className="max-w-6xl mx-auto px-4 pt-3" data-testid="banner-worker-mode">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            <span>Crew mode — posting on behalf of a customer. Pricing & token estimate match the customer-facing flow exactly.</span>
          </div>
        </div>
      )}

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
                <h2 className="text-xl font-black">{hasMovingService ? "Where do you need help?" : "Where are we going?"}</h2>
                <p className="text-sm text-muted-foreground">
                  {hasMovingService
                    ? "Use the pickup address for load-only or full moves. If it's a full move, you'll add the destination in the next step."
                    : "The address where the work will happen."}
                </p>
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
                    serviceAddress={serviceAddress}
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
                {/* Task #169 — worker-mode-only fields */}
                {isWorker && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-3" data-testid="worker-fields">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300">Crew-only details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Assign to crew member</Label>
                        <Input
                          value={workerFields.assignedTo}
                          onChange={(e) => setWorkerFields(w => ({ ...w, assignedTo: e.target.value }))}
                          placeholder="e.g. Marcus, Tina"
                          data-testid="worker-assigned-to"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Lead source</Label>
                        <Input
                          value={workerFields.leadSource}
                          onChange={(e) => setWorkerFields(w => ({ ...w, leadSource: e.target.value }))}
                          placeholder="door-knock · referral · repeat · walk-up"
                          data-testid="worker-lead-source"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Internal notes (crew-only)</Label>
                      <Textarea
                        value={workerFields.internalNotes}
                        onChange={(e) => setWorkerFields(w => ({ ...w, internalNotes: e.target.value }))}
                        placeholder="Site hazards, customer mood, pricing rationale — invisible to customer"
                        rows={2}
                        data-testid="worker-internal-notes"
                      />
                    </div>
                  </div>
                )}
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
                    {items.map((i, idx) => {
                      const linePrice = formatLinePrice(i, { fractionDigits: 2 });
                      // Task #218 round-9 rev2 — same labor subline as the
                      // chat card. Use index alignment (not serviceCode
                      // find()) so duplicate lines of the same service get
                      // their own labor meta instead of all sharing the
                      // first matching line's tuple.
                      const quoteLine = quote?.items[idx];
                      const laborMeta = quoteLine?.serviceCode === i.serviceCode ? quoteLine.laborMeta : undefined;
                      const laborSubline = formatLineLaborSubline(laborMeta);
                      const movingSummary = formatMovingFlowSummary(i);
                      return (
                        <div key={i.serviceCode} className="flex justify-between text-sm">
                          <span className="truncate pr-2">
                            {emojiFor(i.serviceCode)} {i.label}
                            {i.details.requestedDate ? ` · ${i.details.requestedDate}` : i.details.callToSchedule ? " · we'll call" : ""}
                            {i.details.frequency ? ` · ${i.details.frequency}` : ""}
                            {laborSubline && (
                              <span className="block text-[10px] font-normal text-muted-foreground" data-testid={`review-line-labor-${i.serviceCode}`}>
                                {laborSubline}
                              </span>
                            )}
                            {movingSummary.length > 0 && (
                              <span className="block text-[10px] font-normal text-muted-foreground" data-testid={`review-line-moving-${i.serviceCode}`}>
                                {movingSummary.join(" · ")}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold whitespace-nowrap text-right">
                            {linePrice.text}
                            {linePrice.isEstimate && (
                              <span className="block text-[10px] font-normal text-muted-foreground">estimate · crew confirms</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
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
                    {quote.tokenRedemption && quote.tokenRedemption.discountUsd > 0 && (
                      <div className="flex justify-between text-sm text-orange-500" data-testid="line-token-redemption">
                        <span className="flex items-center gap-1">
                          <Coins className="h-3 w-3" /> {quote.tokenRedemption.tokens.toLocaleString()} JCMOVES applied
                        </span>
                        <span>−${quote.tokenRedemption.discountUsd.toFixed(2)}</span>
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

              {/* Task #181 — Wallet & JCMOVES token redemption */}
              {user && walletData && (() => {
                const subtotalForCap = quote?.subtotal ?? 0;
                const tierCap = subtotalForCap > 0
                  ? maxTokensForSubtotal(subtotalForCap, customerTier)
                  : 0;
                const sliderMax = tokenSliderMax;
                const canRedeem = sliderMax >= MIN_REDEMPTION_TOKENS;
                const cashShort = walletCash < (quote?.finalTotal ?? 0);
                return (
                  <div className="mt-4 rounded-2xl border border-border bg-card p-4 space-y-4" data-testid="wallet-panel">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Your JCMOVES wallet</p>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{customerTier}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">USD credit</p>
                        <p className="font-bold text-lg" data-testid="wallet-cash-balance">${walletCash.toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">JCMOVES tokens</p>
                        <p className="font-bold text-lg flex items-center gap-1" data-testid="wallet-token-balance">
                          <Coins className="h-4 w-4 text-orange-500" /> {walletTokens.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={payFromWallet}
                        onCheckedChange={(c) => setPayFromWallet(!!c)}
                        disabled={walletCash <= 0 || cashShort}
                        data-testid="checkbox-pay-from-wallet"
                      />
                      <span className="leading-tight">
                        <span className="font-semibold">Pay from wallet</span>
                        <span className="block text-xs text-muted-foreground">
                          {walletCash <= 0
                            ? "No USD credit available. Add credit on the Wallet page."
                            : cashShort
                              ? `Need $${(quote?.finalTotal ?? 0).toFixed(2)} — wallet only has $${walletCash.toFixed(2)}. Top up to pay from wallet.`
                              : "Use your JCMOVES USD credit instead of a card."}
                        </span>
                      </span>
                    </label>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Apply JCMOVES tokens</Label>
                        <span className="text-xs font-mono" data-testid="token-slider-value">
                          {applyTokens.toLocaleString()} = ${tokensToDollars(applyTokens).toFixed(2)}
                        </span>
                      </div>
                      {canRedeem ? (
                        <>
                          <Slider
                            min={0}
                            max={sliderMax}
                            step={REDEMPTION_INCREMENT}
                            value={[Math.min(applyTokens, sliderMax)]}
                            onValueChange={(v) => {
                              const raw = v[0] ?? 0;
                              const snapped = Math.floor(raw / REDEMPTION_INCREMENT) * REDEMPTION_INCREMENT;
                              setApplyTokens(snapped < MIN_REDEMPTION_TOKENS ? 0 : snapped);
                            }}
                            data-testid="slider-apply-tokens"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Max {sliderMax.toLocaleString()} JCMOVES (your {customerTier} tier covers up to{" "}
                            ${tokensToDollars(tierCap).toFixed(2)} of this job).
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-muted-foreground" data-testid="token-cap-too-low">
                          {walletTokens < MIN_REDEMPTION_TOKENS
                            ? `Need at least ${MIN_REDEMPTION_TOKENS.toLocaleString()} JCMOVES to redeem (you have ${walletTokens.toLocaleString()}).`
                            : `Subtotal too low to redeem tokens at your ${customerTier} tier.`}
                        </p>
                      )}
                      {tokenError && (
                        <p className="text-[11px] text-red-500 flex items-start gap-1" data-testid="token-error">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {tokenError}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {!user && (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground" data-testid="wallet-signin-hint">
                  <Coins className="inline h-3 w-3 mr-1 text-orange-500" />
                  Sign in to pay from your JCMOVES wallet or apply your tokens.
                </div>
              )}
            </section>
          )}

        </div>

        <BookingSummarySticky
          items={items}
          quote={quote}
          isQuoting={quoteMutation.isPending}
          onCheckout={() => { /* unused in wizard mode */ }}
          canCheckout={items.length > 0}
          showPricing={step === "review"}
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
