// Components for the multi-service /book flow (Task #129).
// All five components live in one file to keep the new flow focused and easy
// to evolve as a unit. Page (`/book`) composes them.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, Plus, Minus, Tag, Coins, Users, ChevronUp, ChevronDown,
  Sparkles, Trash2, Pencil, AlertCircle, PhoneCall, Package, Loader2, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  BUNDLE_SCHEDULING_MODE,
  BUNDLE_FREQUENCY_OPTIONS,
  type BundleSchedulingMode,
} from "@/components/BundleServiceScheduler";
import {
  computeMovingQuote, computeJunkQuote, buildCrewPackages,
  type Answers, type CrewPackage,
} from "@/components/booking-chatbot";

export interface CatalogService {
  id: string;
  code: string;
  name: string;
  category: "core" | "addon" | string;
  defaultPriceMode: "fixed" | "hourly" | "per_unit" | "quote" | string;
  defaultPrice: string | null;
  suggestedMin: string | null;
  suggestedMax: string | null;
  discountEligible: boolean;
  isAddon: boolean;
  description: string | null;
}

export interface FeaturedBundle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  serviceComboJson: string[];
  discountType: "percent" | "fixed" | string;
  discountValue: string;
  maxDiscount: string | null;
  merchandisingSlot: string | null;
}

export interface SelectedItem {
  serviceCode: string;
  label: string;
  quantity: number;
  unitPrice: number;
  priceMode: "fixed" | "hourly" | "per_unit" | "quote";
  details: {
    requestedDate?: string;
    frequency?: string;
    callToSchedule?: boolean;
    notes?: string;
    scope?: string;
    // Task #141: Moving / Junk Removal package picker snapshot — mirrors the
    // data the booking chatbot captures so the cart line carries the chosen
    // crew size, hours, tier, and JC222 promo when applicable.
    packageId?: string;
    packageLabel?: string;
    packageTier?: string;
    crew?: number;
    hours?: number;
    minPrice?: number;
    maxPrice?: number;
    jobSize?: string;
    loadType?: string;
    truckNeeded?: boolean;
    truckSize?: string;
    hasStairs?: boolean;
    specialItems?: string[];
    promoCode?: string;
    dropoffAddress?: string;
    verifiedDriveMiles?: number;
    estimatedDriveMinutes?: number;
    driveEstimateNote?: string;
    // Task #144 — Trash Valet add-on flag captured from the bundled-cart UI
    // so the admin can see the customer wants the recycling can rolled too.
    recyclingEnabled?: boolean;
    // Task #146 — Trash Valet subscription details captured from the bundled
    // cart so the admin pipeline can auto-provision the subscription without
    // a follow-up phone call.
    cans?: number;
    bagCount?: number;
    serviceDayOfWeek?: number;
    recyclingDayOfWeek?: number;
    recyclingAnchorDate?: string;
    planType?: "monthly" | "yearly";
    // Roofing quote-helper snapshot. Stored on the booking item so ops can
    // see exactly what estimate inputs produced the prefilled price.
    roofSquares?: number;
    roofAreaSqFt?: number;
    roofingCurrentType?: string;
    roofingStories?: string;
    roofingPitch?: string;
    roofingTearOff?: string;
    roofingMaterials?: string;
    fastSchedule?: boolean;
    premiumIceShield?: boolean;
  };
}

/** Service codes that should drive their own package-picker UI in the
 *  wizard (instead of the generic flat-price card). */
export function usesPackagePicker(code: string): boolean {
  return code === "moving" || code === "junk_removal";
}

/** Resolve the per-service scheduling pattern, mirroring BundleServiceScheduler.
 *  Services not in the explicit map default to date-only (most jobs are
 *  per-event scheduling). */
export function schedulingModeFor(code: string): BundleSchedulingMode {
  return BUNDLE_SCHEDULING_MODE[code] ?? "date_only";
}

/** Task #218 — labor breakdown the chat card and wizard cart read off
 *  each quoted line. Mirrors BookingPricingItemInput["laborMeta"] on the
 *  server. */
export interface QuoteLaborMeta {
  crewSize: number;
  laborHours: number;
  totalLaborHours: number;
  ratePerHour: number;
}

export interface QuoteResult {
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  tokenEstimate: number;
  bundleApplied: { code: string; name: string; rawDiscount: number } | null;
  items: Array<{ serviceCode: string; lineSubtotal: number; laborMeta?: QuoteLaborMeta }>;
  tokenRedemption?: { tokens: number; discountUsd: number };
}

interface DriveEstimateResult {
  miles: number;
  estimatedMinutes?: number;
  note?: string;
  error?: string;
}

const SERVICE_EMOJI: Record<string, string> = {
  moving: "📦",
  junk_removal: "🗑️",
  lawn_care: "🌿",
  trash_valet: "♻️",
  window_cleaning: "🪟",
  snow_removal: "❄️",
  cleaning: "🧼",
  move_cleaning: "🧼",
  roofing: "🏠",
  demolition: "🛠️",
  handyman: "🔧",
  labor: "💪",
  delivery: "🚚",
  junk_reset: "♻️",
  assembly_finish: "🛠️",
  deep_clean_turnover: "✨",
  walkway_priority: "🥾",
  assembly: "🔩",
};

const CREW_HINT: Record<string, number> = {
  moving: 3,
  junk_removal: 2,
  cleaning: 2,
  deep_clean_turnover: 2,
  snow_removal: 2,
  lawn_care: 2,
  window_cleaning: 2,
  roofing: 3,
  demolition: 3,
  move_cleaning: 2,
  trash_valet: 1,
  handyman: 1,
  labor: 2,
  delivery: 2,
  junk_reset: 2,
  assembly_finish: 2,
  assembly: 1,
  walkway_priority: 1,
};

export function emojiFor(code: string): string {
  return SERVICE_EMOJI[code] || "🧰";
}

export function recommendedCrewSize(items: SelectedItem[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map(i => CREW_HINT[i.serviceCode] ?? 2));
}

export function priceModeLabel(mode: string, unit: number): string {
  switch (mode) {
    case "hourly": return `$${unit}/hr`;
    case "per_unit": return `$${unit}/unit`;
    case "quote": return "Custom quote";
    default: return `$${unit}`;
  }
}

/** Task #211 — Painting & Flooring lines come back priced (server runs the
 *  chatbot questionnaire through services/quoteRules/) but the catalog
 *  still flags them priceMode="quote" so we can tag them as a
 *  crew-confirmed estimate rather than a binding rack price. Hides the
 *  bare "TBD" copy when we have a real number. */
export const ESTIMATE_SERVICE_CODES = new Set([
  "painting",
  "flooring",
  "roofing",
  "lawn_care",
  "snow_removal",
  "demolition",
]);
export function formatLinePrice(
  item: { serviceCode: string; quantity: number; unitPrice: number; priceMode: string },
  opts: { fractionDigits?: number } = {},
): { text: string; isEstimate: boolean } {
  const digits = opts.fractionDigits ?? 0;
  const total = item.quantity * item.unitPrice;
  if (item.priceMode === "quote") {
    if (ESTIMATE_SERVICE_CODES.has(item.serviceCode) && total > 0) {
      return { text: `$${total.toFixed(digits)}`, isEstimate: true };
    }
    return { text: "TBD", isEstimate: false };
  }
  return { text: `$${total.toFixed(digits)}`, isEstimate: false };
}

/** Task #218 — Returns the secondary "2 ppl × 4 hrs at $85/hr" line
 *  the wizard cart and chat card both show beneath each priced
 *  service. Returns null when the live quote did not attach a labor
 *  breakdown (e.g. fixed-price line without a labor mapping). */
export function formatLineLaborSubline(meta?: QuoteLaborMeta): string | null {
  if (!meta) return null;
  if (!meta.crewSize || meta.crewSize <= 0) return null;
  if (!meta.laborHours || meta.laborHours <= 0) return null;
  const crewWord = meta.crewSize === 1 ? "person" : "people";
  const hrsLabel = Number.isInteger(meta.laborHours)
    ? `${meta.laborHours}`
    : meta.laborHours.toFixed(1);
  return `${meta.crewSize} ${crewWord} × ${hrsLabel} hrs at $${meta.ratePerHour}/hr`;
}

export function formatMovingFlowSummary(item: SelectedItem): string[] {
  if (item.serviceCode !== "moving") return [];
  const bits: string[] = [];
  if (item.details.scope?.trim()) bits.push(item.details.scope.trim());
  if (item.details.loadType) bits.push(item.details.loadType.replace(/^.[^\w]?\s*/, ""));
  if (item.details.truckNeeded === true) {
    bits.push(item.details.truckSize ? `JC truck: ${item.details.truckSize}` : "JC provides truck");
  } else if (item.details.truckNeeded === false) {
    bits.push("Customer truck");
  }
  if (item.details.dropoffAddress?.trim()) bits.push(`Drop-off set`);
  if (item.details.verifiedDriveMiles && item.details.estimatedDriveMinutes) {
    bits.push(`~${Math.round(item.details.verifiedDriveMiles)} mi · ~${item.details.estimatedDriveMinutes} min`);
  }
  return bits;
}

// ── ServiceSelector ────────────────────────────────────────────────────────
export function ServiceSelector({
  services, selectedCodes, onAdd, onRemove,
}: {
  services: CatalogService[];
  selectedCodes: Set<string>;
  onAdd: (svc: CatalogService) => void;
  onRemove: (code: string) => void;
}) {
  const core = services.filter(s => !s.isAddon);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="service-selector">
      {core.map(svc => {
        const active = selectedCodes.has(svc.code);
        return (
          <button
            key={svc.code}
            type="button"
            onClick={() => active ? onRemove(svc.code) : onAdd(svc)}
            data-testid={`service-card-${svc.code}`}
            className={cn(
              "relative text-left rounded-2xl border p-4 transition-all active:scale-[0.97]",
              active
                ? "border-emerald-500 bg-emerald-500/10 shadow-md shadow-emerald-500/10"
                : "border-border bg-card hover:border-orange-500/40"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-3xl">{emojiFor(svc.code)}</span>
              {active && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
            </div>
            <p className="font-bold text-sm mt-2 leading-tight">{svc.name}</p>
            {svc.description && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{svc.description}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {svc.suggestedMin && svc.suggestedMax
                ? `from $${svc.suggestedMin}`
                : svc.defaultPrice
                  ? priceModeLabel(svc.defaultPriceMode, parseFloat(svc.defaultPrice))
                  : "Custom quote"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

// ── BundleBadge + BundleOfferStrip ─────────────────────────────────────────
const SLOT_META: Record<string, { label: string; cls: string }> = {
  most_popular: { label: "Most Popular", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  best_value:   { label: "Best Value",   cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  fast_addon:   { label: "Fast Add-On",  cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
};

function BundleBadge({ slot }: { slot: string }) {
  const meta = SLOT_META[slot] || { label: slot, cls: "bg-muted text-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", meta.cls)}>
      <Sparkles className="h-2.5 w-2.5" /> {meta.label}
    </span>
  );
}

export function BundleOfferStrip({
  slots, services, selectedCodes, onApplyBundle, isLoading,
}: {
  slots: { most_popular: FeaturedBundle[]; best_value: FeaturedBundle[]; fast_addon: FeaturedBundle[] };
  services: CatalogService[];
  selectedCodes: Set<string>;
  onApplyBundle: (bundle: FeaturedBundle) => void;
  isLoading: boolean;
}) {
  const slotOrder: Array<keyof typeof slots> = ["most_popular", "best_value", "fast_addon"];
  const empty = slotOrder.every(k => (slots[k] || []).length === 0);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-36 rounded-2xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="bundles-empty">
        No featured bundles available right now — you can still add any combination of services manually.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="bundle-offer-strip">
      {slotOrder.map(slot => {
        const bundles = slots[slot] || [];
        const bundle = bundles[0]; // first for the slot
        if (!bundle) {
          return (
            <div key={slot} className="rounded-2xl border border-dashed border-border bg-card/50 p-4 flex items-center justify-center text-xs text-muted-foreground">
              <BundleBadge slot={slot} />
            </div>
          );
        }
        const allInCart = bundle.serviceComboJson.every(c => selectedCodes.has(c));
        const discountLine = bundle.discountType === "percent"
          ? `${bundle.discountValue}% off`
          : `$${parseFloat(bundle.discountValue).toFixed(0)} off`;
        return (
          <div
            key={bundle.code}
            className={cn(
              "rounded-2xl border p-4 flex flex-col gap-2 bg-card transition-all",
              allInCart ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-border hover:border-orange-500/40"
            )}
            data-testid={`bundle-card-${bundle.code}`}
          >
            <div className="flex items-start justify-between gap-2">
              <BundleBadge slot={slot} />
              <span className="text-[10px] font-bold text-emerald-500">{discountLine}</span>
            </div>
            <p className="font-bold text-sm leading-tight mt-1">{bundle.name}</p>
            <div className="flex flex-wrap gap-1">
              {bundle.serviceComboJson.map(code => {
                const svc = services.find(s => s.code === code);
                return (
                  <span key={code} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {emojiFor(code)} {svc?.name || code}
                  </span>
                );
              })}
            </div>
            {bundle.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">{bundle.description}</p>
            )}
            <Button
              type="button"
              size="sm"
              variant={allInCart ? "secondary" : "default"}
              onClick={() => onApplyBundle(bundle)}
              disabled={allInCart}
              className="mt-auto"
              data-testid={`apply-bundle-${bundle.code}`}
            >
              {allInCart ? "Added to cart" : "Add bundle"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ── ServiceItemEditor (inline row) ─────────────────────────────────────────
export function ServiceItemEditor({
  item, onChange, onRemove, onOpenDrawer, warning,
}: {
  item: SelectedItem;
  onChange: (next: SelectedItem) => void;
  onRemove: () => void;
  onOpenDrawer: () => void;
  /** Optional inline message shown when a required per-item field is missing. */
  warning?: string | null;
}) {
  const showQty = item.priceMode === "hourly" || item.priceMode === "per_unit";
  const lineSubtotal = item.quantity * item.unitPrice;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        warning ? "border-amber-500/60 ring-1 ring-amber-500/20" : "border-border",
      )}
      data-testid={`item-editor-${item.serviceCode}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emojiFor(item.serviceCode)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{item.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {item.priceMode === "quote"
              ? (ESTIMATE_SERVICE_CODES.has(item.serviceCode) && lineSubtotal > 0
                  ? "Estimate — crew confirms"
                  : "Custom quote — confirmed after we review")
              : `${priceModeLabel(item.priceMode, item.unitPrice)}${showQty ? ` × ${item.quantity}` : ""}`}
            {item.details.requestedDate ? ` • ${item.details.requestedDate}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">
            {formatLinePrice(item).text}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        {showQty ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ ...item, quantity: Math.max(1, item.quantity - 1) })}
              className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted"
              data-testid={`item-qty-minus-${item.serviceCode}`}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
            <button
              type="button"
              onClick={() => onChange({ ...item, quantity: item.quantity + 1 })}
              className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted"
              data-testid={`item-qty-plus-${item.serviceCode}`}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ) : <span />}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="px-2.5 py-1 rounded-md border border-border text-[11px] hover:bg-muted flex items-center gap-1"
            data-testid={`item-edit-${item.serviceCode}`}
          >
            <Pencil className="h-3 w-3" /> Details
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="px-2.5 py-1 rounded-md border border-destructive/40 text-destructive text-[11px] hover:bg-destructive/10 flex items-center gap-1"
            data-testid={`item-remove-${item.serviceCode}`}
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      </div>
      {warning && (
        <p
          className="mt-2 text-[11px] text-amber-500 flex items-center gap-1"
          data-testid={`item-warning-${item.serviceCode}`}
        >
          <AlertCircle className="h-3 w-3" /> {warning} — open Details to fix.
        </p>
      )}
    </div>
  );
}

// ── MovingJunkPackagePicker ────────────────────────────────────────────────
// Mirrors the chatbot's package-picker for Moving and Junk Removal so the
// wizard sells those services as crew-size × hours packages (with JC222
// promo eligibility on small-tier moves) instead of a flat $300/$100 line.
const PICKER_HOME_SIZES = [
  "1–2 Items (Tiny Job)",
  "Studio / Single Room",
  "1 Bedroom Apartment",
  "2 Bedroom Apartment",
  "3 Bedroom Apartment",
  "4+ Bedroom Apartment",
  "1–2 Bedroom House",
  "3 Bedroom House",
  "4+ Bedroom House",
  "Commercial / Office",
];

const PICKER_LOAD_TYPES = [
  "Load only",
  "Unload only",
  "Load + unload",
];

const PICKER_TRUCK_SIZES = [
  "10 ft",
  "16 ft",
  "26 ft",
  "Custom",
];

const PICKER_SPECIAL_ITEMS = [
  "🎹 Grand Piano",
  "🎹 Upright Piano",
  "🎱 Pool Table",
  "♨️ Hot Tub",
  "🔒 Heavy Safe (300 lbs+)",
  "🏋️ Large Appliance or Fitness Equipment (100 lbs+)",
  "📦 Other Heavy Item (100 lbs+)",
];

export function MovingJunkPackagePicker({
  item, onChange, serviceAddress,
}: {
  item: SelectedItem;
  onChange: (next: SelectedItem) => void;
  serviceAddress: string;
}) {
  const isMoving = item.serviceCode === "moving";
  const { data: pricingConfig } = useQuery<{ ratePerMoverHour: number; jc222Price: number }>({
    queryKey: ["/api/pricing"],
    staleTime: 5 * 60 * 1000,
  });
  const rate    = pricingConfig?.ratePerMoverHour ?? 85;
  const jc222   = pricingConfig?.jc222Price       ?? 222;
  const trimmedPickupAddress = serviceAddress.trim();
  const needsDropoffAddress = isMoving && (item.details.loadType || "").includes("Both");
  const trimmedDropoffAddress = needsDropoffAddress ? (item.details.dropoffAddress || "").trim() : "";
  const canEstimateDrive = isMoving
    && trimmedPickupAddress.length >= 5
    && (!needsDropoffAddress || trimmedDropoffAddress.length >= 5);

  const driveEstimateQuery = useQuery<DriveEstimateResult>({
    queryKey: ["/api/utility/estimate-drive-miles", trimmedPickupAddress, trimmedDropoffAddress],
    enabled: canEstimateDrive,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ pickup: trimmedPickupAddress });
      if (trimmedDropoffAddress) params.set("dropoff", trimmedDropoffAddress);
      const res = await fetch(`/api/utility/estimate-drive-miles?${params.toString()}`);
      if (!res.ok) throw new Error("Drive estimate unavailable");
      return res.json() as Promise<DriveEstimateResult>;
    },
  });

  const verifiedDriveMiles = driveEstimateQuery.data?.miles ?? Number(item.details.verifiedDriveMiles ?? 0);

  // Build an Answers shape from the persisted details so the chatbot's
  // pricing engine can compute the same packages it shows in chat.
  const answers: Answers = useMemo(() => {
    const a: Answers = {
      serviceType: isMoving ? "📦 Moving (local or long-distance)" : "🗑️ Junk Removal",
      homeSize: item.details.jobSize,
      specialItems: item.details.specialItems || [],
      promoCode: item.details.promoCode,
    };
    if (isMoving) {
      a.loadType = item.details.loadType;
      if (item.details.hasStairs) {
        a.originFloor = "2nd Floor";
        a.originElevator = "🪜 No elevator — stairs only";
      }
    }
    return a;
  }, [isMoving, item.details.jobSize, item.details.specialItems, item.details.promoCode,
      item.details.loadType, item.details.hasStairs]);

  const quote = useMemo(() => {
    if (!item.details.jobSize) return null;
    return isMoving
      ? computeMovingQuote(answers, rate, jc222, verifiedDriveMiles)
      : computeJunkQuote(answers, rate);
  }, [answers, isMoving, rate, jc222, item.details.jobSize, verifiedDriveMiles]);

  const packages: CrewPackage[] = useMemo(() => {
    return quote ? buildCrewPackages(answers, quote, rate, jc222) : [];
  }, [quote, answers, rate, jc222]);

  // Keep the selected package in sync with the live package list. Two cases:
  //  1. The selected id no longer exists (user changed job size, load type,
  //     etc.) → drop the selection so they have to pick again.
  //  2. The id still exists but its price band, crew or hours changed (e.g.
  //     the user toggled a special item, JC222, or stairs after picking) →
  //     reapply the same package so unitPrice / details stay accurate. Without
  //     this the cart would submit stale pricing for the new inputs.
  const packageSig = packages
    .map(p => `${p.id}:${p.minPrice}-${p.maxPrice}:${p.crew ?? ""}x${p.hours ?? ""}`)
    .join("|");
  useEffect(() => {
    if (!item.details.packageId) return;
    const current = packages.find(p => p.id === item.details.packageId);
    if (!current) {
      onChange({
        ...item,
        unitPrice: 0,
        details: {
          ...item.details,
          packageId: undefined, packageLabel: undefined, packageTier: undefined,
          crew: undefined, hours: undefined, minPrice: undefined, maxPrice: undefined,
        },
      });
      return;
    }
    const drifted =
      current.minPrice !== item.details.minPrice ||
      current.maxPrice !== item.details.maxPrice ||
      current.crew     !== item.details.crew ||
      current.hours    !== item.details.hours ||
      current.label    !== item.details.packageLabel;
    if (drifted) applyPackage(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageSig]);

  function applyPackage(pkg: CrewPackage) {
    const mid = Math.round((pkg.minPrice + pkg.maxPrice) / 2);
    onChange({
      ...item,
      quantity: 1,
      unitPrice: mid,
      priceMode: "fixed",
      details: {
        ...item.details,
        packageId: pkg.id,
        packageLabel: pkg.label,
        packageTier: quote?.type === "moving" || quote?.type === "junk" ? quote.tier : undefined,
        crew: pkg.crew,
        hours: pkg.hours,
        minPrice: pkg.minPrice,
        maxPrice: pkg.maxPrice,
      },
    });
  }

  function patch(d: Partial<SelectedItem["details"]>) {
    onChange({ ...item, details: { ...item.details, ...d } });
  }

  useEffect(() => {
    if (!isMoving) return;
    if (!canEstimateDrive) {
      if (
        item.details.verifiedDriveMiles != null ||
        item.details.estimatedDriveMinutes != null ||
        item.details.driveEstimateNote
      ) {
        patch({
          verifiedDriveMiles: undefined,
          estimatedDriveMinutes: undefined,
          driveEstimateNote: undefined,
        });
      }
      return;
    }
    if (!driveEstimateQuery.data) return;
    const nextMiles = driveEstimateQuery.data.miles || 0;
    const nextMinutes = driveEstimateQuery.data.estimatedMinutes || 0;
    const nextNote = driveEstimateQuery.data.note || undefined;
    if (
      item.details.verifiedDriveMiles === nextMiles &&
      item.details.estimatedDriveMinutes === nextMinutes &&
      item.details.driveEstimateNote === nextNote
    ) {
      return;
    }
    patch({
      verifiedDriveMiles: nextMiles,
      estimatedDriveMinutes: nextMinutes,
      driveEstimateNote: nextNote,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMoving,
    canEstimateDrive,
    driveEstimateQuery.data?.miles,
    driveEstimateQuery.data?.estimatedMinutes,
    driveEstimateQuery.data?.note,
  ]);

  function toggleSpecial(label: string) {
    const cur = item.details.specialItems || [];
    const next = cur.includes(label) ? cur.filter(s => s !== label) : [...cur, label];
    patch({ specialItems: next });
  }

  return (
    <div className="space-y-3" data-testid={`pkg-picker-${item.serviceCode}`}>
      <div>
        <Label className="text-xs">{isMoving ? "How big is the move?" : "How much junk?"}</Label>
        <select
          value={item.details.jobSize || ""}
          onChange={(e) => patch({ jobSize: e.target.value || undefined })}
          className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
          data-testid={`pkg-jobsize-${item.serviceCode}`}
        >
          <option value="">Pick a size…</option>
          {PICKER_HOME_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isMoving && (
        <div>
          <Label className="text-xs">Do you need help loading, unloading, or both?</Label>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {PICKER_LOAD_TYPES.map(opt => {
              const active = item.details.loadType === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => patch({ loadType: opt })}
                  className={cn(
                    "text-[11px] px-2 py-1.5 rounded-md border text-center leading-tight transition-all",
                    active
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                      : "border-border bg-card hover:border-foreground/30",
                  )}
                  data-testid={`pkg-loadtype-${item.serviceCode}-${opt.slice(0, 4)}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isMoving && (
        <div>
          <Label className="text-xs">What do you need help with?</Label>
          <Textarea
            value={item.details.scope || ""}
            onChange={(e) => patch({ scope: e.target.value || undefined })}
            placeholder="Apartment move, storage unit, POD load, rental truck unload, in-home rearrange..."
            rows={2}
            data-testid={`pkg-scope-${item.serviceCode}`}
          />
        </div>
      )}

      {isMoving && (
        <div>
          <Label className="text-xs">Do you need us to provide a truck?</Label>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {[
              { label: "Customer provides truck", value: false },
              { label: "JC provides truck", value: true },
            ].map((opt) => {
              const active = item.details.truckNeeded === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => patch({
                    truckNeeded: opt.value,
                    truckSize: opt.value ? item.details.truckSize : undefined,
                  })}
                  className={cn(
                    "text-[11px] px-2 py-1.5 rounded-md border text-center leading-tight transition-all",
                    active
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                      : "border-border bg-card hover:border-foreground/30",
                  )}
                  data-testid={`pkg-truck-needed-${item.serviceCode}-${opt.value ? "yes" : "no"}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isMoving && item.details.truckNeeded && (
        <div>
          <Label className="text-xs">Truck size if we need to provide the truck</Label>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {PICKER_TRUCK_SIZES.map((size) => {
              const active = item.details.truckSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => patch({ truckSize: size })}
                  className={cn(
                    "text-[11px] px-2 py-1.5 rounded-md border text-center leading-tight transition-all",
                    active
                      ? "border-orange-400 bg-orange-500/20 text-orange-300"
                      : "border-border bg-card hover:border-foreground/30",
                  )}
                  data-testid={`pkg-truck-size-${item.serviceCode}-${size.slice(0, 2)}`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {needsDropoffAddress && (
        <div>
          <Label className="text-xs">Drop-off address</Label>
          <Input
            value={item.details.dropoffAddress || ""}
            onChange={(e) => patch({ dropoffAddress: e.target.value || undefined })}
            placeholder="Destination address"
            data-testid={`pkg-dropoff-${item.serviceCode}`}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            We use this with the verified pickup address to estimate drive time.
          </p>
        </div>
      )}

      {isMoving && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Drive Estimate
          </p>
          {!trimmedPickupAddress ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Add the pickup address in the previous step to verify drive time.
            </p>
          ) : needsDropoffAddress && trimmedDropoffAddress.length < 5 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Add the drop-off address to calculate the full move route.
            </p>
          ) : driveEstimateQuery.isLoading ? (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Verifying drive time from the address...
            </p>
          ) : item.details.verifiedDriveMiles && item.details.estimatedDriveMinutes ? (
            <div className="mt-1 space-y-1">
              <p className="text-xs text-white">
                Verified route: ~{Math.round(item.details.verifiedDriveMiles)} miles · ~{item.details.estimatedDriveMinutes} min
              </p>
              <p className="text-[10px] text-muted-foreground">
                {item.details.driveEstimateNote === "base-to-pickup plus pickup-to-dropoff"
                  ? "Includes our Ironwood base, pickup, and destination."
                  : "Includes our Ironwood base and the verified service address."}
              </p>
            </div>
          ) : driveEstimateQuery.isError ? (
            <p className="mt-1 text-xs text-muted-foreground">
              We couldn't verify drive time yet, but the address is still saved with the job.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id={`stairs-${item.serviceCode}`}
          type="checkbox"
          checked={!!item.details.hasStairs}
          onChange={(e) => patch({ hasStairs: e.target.checked })}
          className="h-4 w-4"
          data-testid={`pkg-stairs-${item.serviceCode}`}
        />
        <Label htmlFor={`stairs-${item.serviceCode}`} className="text-xs cursor-pointer">
          Stairs at the pickup or drop-off (no elevator)
        </Label>
      </div>

      <div>
        <Label className="text-xs">Special / heavy items (optional)</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {PICKER_SPECIAL_ITEMS.map(label => {
            const active = (item.details.specialItems || []).includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleSpecial(label)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-full border transition-all",
                  active
                    ? "border-orange-400 bg-orange-500/20 text-orange-300"
                    : "border-border bg-card hover:border-foreground/30",
                )}
                data-testid={`pkg-special-${item.serviceCode}-${label.slice(2, 6).trim()}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {isMoving && (
        <div>
          <Label className="text-xs">Promo code (optional)</Label>
          <Input
            value={item.details.promoCode || ""}
            onChange={(e) => patch({ promoCode: e.target.value.toUpperCase() || undefined })}
            placeholder="e.g. JC222 for the small-move flat rate"
            data-testid={`pkg-promo-${item.serviceCode}`}
            className="uppercase"
          />
        </div>
      )}

      <div>
        <Label className="text-xs flex items-center gap-1">
          <Package className="h-3 w-3" /> Pick your package
        </Label>
        {!quote ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Pick a {isMoving ? "move size" : "load size"} to see crew options and pricing.
          </p>
        ) : packages.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No standard packages available — we'll call to confirm pricing.
          </p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {packages.map(pkg => {
              const active = item.details.packageId === pkg.id;
              const priceLabel = pkg.minPrice === pkg.maxPrice
                ? `$${pkg.minPrice}`
                : `$${pkg.minPrice}–$${pkg.maxPrice}`;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => applyPackage(pkg)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all",
                    active
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "border-border bg-card hover:border-orange-500/40",
                  )}
                  data-testid={`pkg-option-${pkg.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold flex items-center gap-1.5">
                        {pkg.label}
                        {pkg.tag && (
                          <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded">
                            {pkg.tag}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{pkg.desc}</p>
                    </div>
                    <span className="text-sm font-bold whitespace-nowrap">{priceLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs">Preferred date</Label>
        <DatePicker
          value={item.details.requestedDate}
          onChange={(v) => patch({ requestedDate: v || undefined })}
          placeholder="Pick a date"
        />
      </div>

      <div>
        <Label className="text-xs">Notes for the crew (optional)</Label>
        <Textarea
          value={item.details.notes || ""}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Gate code, parking notes, anything we should know"
          rows={2}
          data-testid={`pkg-notes-${item.serviceCode}`}
        />
      </div>
    </div>
  );
}

// ── InlineItemConfigure ────────────────────────────────────────────────────
// Renders the full per-item editor (qty, scheduling, scope, notes) inline
// inside the service card. Used by the wizard's "configure" step so users
// can edit every field without opening a modal/drawer.
export function InlineItemConfigure({
  item, onChange, onRemove, warning, serviceAddress,
}: {
  item: SelectedItem;
  onChange: (next: SelectedItem) => void;
  onRemove: () => void;
  warning?: string | null;
  serviceAddress?: string;
}) {
  const usesPicker = usesPackagePicker(item.serviceCode);
  const mode = schedulingModeFor(item.serviceCode);
  const showQty = item.priceMode === "hourly" || item.priceMode === "per_unit";
  const lineSubtotal = item.quantity * item.unitPrice;
  const freqOptions = BUNDLE_FREQUENCY_OPTIONS[item.serviceCode] || [];

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3",
        warning ? "border-amber-500/60 ring-1 ring-amber-500/20" : "border-border",
      )}
      data-testid={`inline-item-${item.serviceCode}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emojiFor(item.serviceCode)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{item.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {usesPicker && item.details.packageLabel
              ? item.details.packageLabel
              : item.priceMode === "quote"
                ? (ESTIMATE_SERVICE_CODES.has(item.serviceCode) && lineSubtotal > 0
                    ? "Estimate — crew confirms"
                    : "Custom quote — confirmed after we review")
                : `${priceModeLabel(item.priceMode, item.unitPrice)}${showQty ? ` × ${item.quantity}` : ""}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">
            {usesPicker
              ? (item.details.packageId ? `$${lineSubtotal.toFixed(0)}` : "TBD")
              : formatLinePrice(item).text}
          </p>
        </div>
      </div>

      {usesPicker && (
        <MovingJunkPackagePicker item={item} onChange={onChange} serviceAddress={serviceAddress || ""} />
      )}

      {/* Qty (hourly / per_unit only). Hidden when the package picker drives
          this card (Moving / Junk Removal) so we don't show two pricing UIs. */}
      {!usesPicker && showQty && (
        <div>
          <Label className="text-xs">{item.priceMode === "hourly" ? "Hours" : "Quantity"}</Label>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => onChange({ ...item, quantity: Math.max(1, item.quantity - 1) })}
              className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
              data-testid={`inline-qty-minus-${item.serviceCode}`}
            ><Minus className="h-3 w-3" /></button>
            <span className="text-sm font-bold w-8 text-center">{item.quantity}</span>
            <button
              type="button"
              onClick={() => onChange({ ...item, quantity: item.quantity + 1 })}
              className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
              data-testid={`inline-qty-plus-${item.serviceCode}`}
            ><Plus className="h-3 w-3" /></button>
          </div>
        </div>
      )}

      {/* Scheduling — package picker handles its own date + notes for
          Moving / Junk Removal, so skip the generic block when active. */}
      {!usesPicker && (mode === "call_only" ? (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5 flex items-start gap-2" data-testid={`inline-call-only-${item.serviceCode}`}>
          <PhoneCall className="h-4 w-4 text-sky-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-snug">
            Quick chat needed — we'll call within 24 hours after submission to lock in the schedule.
          </p>
        </div>
      ) : (
        <>
          <div>
            <Label className="text-xs">Preferred start date</Label>
            <DatePicker
              value={item.details.requestedDate}
              onChange={(v) => onChange({ ...item, details: { ...item.details, requestedDate: v || undefined } })}
              placeholder="Pick a date"
            />
          </div>
          {mode === "date_freq" && freqOptions.length > 0 && (
            <div>
              <Label className="text-xs">Frequency</Label>
              <div className="flex flex-wrap gap-1.5 mt-1" data-testid={`inline-freq-${item.serviceCode}`}>
                {freqOptions.map(opt => {
                  const active = item.details.frequency === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange({ ...item, details: { ...item.details, frequency: opt.value } })}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition-all",
                        active
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                          : "border-border bg-card hover:border-foreground/30",
                      )}
                      data-testid={`inline-freq-${item.serviceCode}-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ))}

      {/* Task #144 + #146 — Trash Valet: capture cans, bags, service day,
          plan type and the recycling upsell so the admin pipeline can
          auto-provision the subscription without a follow-up phone call. */}
      {item.serviceCode === "trash_valet" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Number of cans</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={item.details.cans ?? 1}
                onChange={(e) => onChange({
                  ...item,
                  details: { ...item.details, cans: Math.max(1, Number(e.target.value) || 1) },
                })}
                data-testid={`inline-cans-${item.serviceCode}`}
              />
            </div>
            <div>
              <Label className="text-xs">Extra bags</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={item.details.bagCount ?? 0}
                onChange={(e) => onChange({
                  ...item,
                  details: { ...item.details, bagCount: Math.max(0, Number(e.target.value) || 0) },
                })}
                data-testid={`inline-bags-${item.serviceCode}`}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Trash pickup day</Label>
            <div className="flex flex-wrap gap-1.5 mt-1" data-testid={`inline-day-${item.serviceCode}`}>
              {[
                { value: 1, label: "Mon" },
                { value: 2, label: "Tue" },
                { value: 3, label: "Wed" },
                { value: 4, label: "Thu" },
                { value: 5, label: "Fri" },
                { value: 6, label: "Sat" },
              ].map(opt => {
                const active = (item.details.serviceDayOfWeek ?? 1) === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ ...item, details: { ...item.details, serviceDayOfWeek: opt.value } })}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-full border transition-all",
                      active
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                        : "border-border bg-card hover:border-foreground/30",
                    )}
                    data-testid={`inline-day-${item.serviceCode}-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs">Billing plan</Label>
            <div className="flex flex-wrap gap-1.5 mt-1" data-testid={`inline-plan-${item.serviceCode}`}>
              {[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly (11 months charged · 12 served)" },
              ].map(opt => {
                const active = (item.details.planType ?? "monthly") === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({
                      ...item,
                      details: { ...item.details, planType: opt.value as "monthly" | "yearly" },
                    })}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-full border transition-all",
                      active
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                        : "border-border bg-card hover:border-foreground/30",
                    )}
                    data-testid={`inline-plan-${item.serviceCode}-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <div className="flex items-center gap-2">
              <input
                id={`recycling-${item.serviceCode}`}
                type="checkbox"
                checked={!!item.details.recyclingEnabled}
                onChange={(e) => onChange({ ...item, details: { ...item.details, recyclingEnabled: e.target.checked } })}
                className="h-4 w-4"
                data-testid={`inline-recycling-${item.serviceCode}`}
              />
              <Label htmlFor={`recycling-${item.serviceCode}`} className="text-xs cursor-pointer flex items-center gap-1.5">
                ♻️ Add bi-weekly recycling-can pickup
              </Label>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 ml-6">
              We'll roll your recycling can to the curb every other week alongside your trash service.
            </p>

            {item.details.recyclingEnabled && (
              <div className="mt-2.5 ml-6 space-y-2">
                <div>
                  <Label className="text-xs">Recycling pickup day</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1" data-testid={`inline-recycling-day-${item.serviceCode}`}>
                    {[
                      { value: 1, label: "Mon" },
                      { value: 2, label: "Tue" },
                      { value: 3, label: "Wed" },
                      { value: 4, label: "Thu" },
                      { value: 5, label: "Fri" },
                      { value: 6, label: "Sat" },
                    ].map(opt => {
                      const active = (item.details.recyclingDayOfWeek ?? item.details.serviceDayOfWeek ?? 1) === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onChange({
                            ...item,
                            details: { ...item.details, recyclingDayOfWeek: opt.value },
                          })}
                          className={cn(
                            "text-[11px] px-2.5 py-1 rounded-full border transition-all",
                            active
                              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                              : "border-border bg-card hover:border-foreground/30",
                          )}
                          data-testid={`inline-recycling-day-${item.serviceCode}-${opt.value}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">First recycling week starts</Label>
                  <DatePicker
                    value={item.details.recyclingAnchorDate}
                    onChange={(v) => onChange({
                      ...item,
                      details: { ...item.details, recyclingAnchorDate: v || undefined },
                    })}
                    placeholder="Pick the anchor date"
                    testId={`inline-recycling-anchor-${item.serviceCode}`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!usesPicker && (
        <>
          <div>
            <Label className="text-xs">Scope (what should we focus on?)</Label>
            <Input
              value={item.details.scope || ""}
              onChange={(e) => onChange({ ...item, details: { ...item.details, scope: e.target.value } })}
              placeholder="e.g. front yard only, 1 truckload"
              data-testid={`inline-scope-${item.serviceCode}`}
            />
          </div>

          <div>
            <Label className="text-xs">Notes / special instructions (optional)</Label>
            <Textarea
              value={item.details.notes || ""}
              onChange={(e) => onChange({ ...item, details: { ...item.details, notes: e.target.value } })}
              placeholder="Gate code, parking notes, anything we should know"
              rows={2}
              data-testid={`inline-notes-${item.serviceCode}`}
            />
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-1">
        {warning ? (
          <p className="text-[11px] text-amber-500 flex items-center gap-1" data-testid={`inline-warning-${item.serviceCode}`}>
            <AlertCircle className="h-3 w-3" /> {warning}
          </p>
        ) : (
          <p className="text-[11px] text-emerald-500 flex items-center gap-1" data-testid={`inline-ok-${item.serviceCode}`}>
            <CheckCircle2 className="h-3 w-3" /> Ready
          </p>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="px-2.5 py-1 rounded-md border border-destructive/40 text-destructive text-[11px] hover:bg-destructive/10 flex items-center gap-1"
          data-testid={`inline-remove-${item.serviceCode}`}
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}

// ── AddOnDrawer (inline drawer using Sheet) ────────────────────────────────
// Reuses the same scheduling pattern as BundleServiceScheduler:
// per service code, the drawer renders one of three layouts:
//   - call_only:  no date input, "we'll call you" message + flag set
//   - date_only:  preferred date picker
//   - date_freq:  date + frequency chips (weekly/biweekly etc.)
export function AddOnDrawer({
  open, item, onClose, onSave,
}: {
  open: boolean;
  item: SelectedItem | null;
  onClose: () => void;
  onSave: (next: SelectedItem) => void;
}) {
  const [draft, setDraft] = useState<SelectedItem | null>(null);

  // Reset draft when the targeted item changes (or drawer reopens for a new item).
  useEffect(() => {
    if (item) {
      setDraft({
        ...item,
        details: {
          ...item.details,
          // Default call_only services to "callToSchedule = true" so the
          // submitted booking carries the right flag without user input.
          callToSchedule:
            item.details.callToSchedule ??
            (schedulingModeFor(item.serviceCode) === "call_only" ? true : undefined),
        },
      });
    } else {
      setDraft(null);
    }
  }, [item]);

  if (!open || !item || !draft) return null;

  const mode = schedulingModeFor(draft.serviceCode);
  const showQty = draft.priceMode === "hourly" || draft.priceMode === "per_unit";
  const freqOptions = BUNDLE_FREQUENCY_OPTIONS[draft.serviceCode] || [];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto" data-testid="addon-drawer">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="text-2xl">{emojiFor(draft.serviceCode)}</span>
            {draft.label}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          {showQty && (
            <div>
              <Label className="text-xs">{draft.priceMode === "hourly" ? "Hours" : "Quantity"}</Label>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, quantity: Math.max(1, draft.quantity - 1) })}
                  className="w-9 h-9 rounded-md border border-border flex items-center justify-center"
                ><Minus className="h-4 w-4" /></button>
                <Input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => setDraft({ ...draft, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-20 text-center"
                  data-testid="drawer-quantity"
                />
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, quantity: draft.quantity + 1 })}
                  className="w-9 h-9 rounded-md border border-border flex items-center justify-center"
                ><Plus className="h-4 w-4" /></button>
                <span className="text-xs text-muted-foreground ml-2">
                  {priceModeLabel(draft.priceMode, draft.unitPrice)}
                </span>
              </div>
            </div>
          )}

          {mode === "call_only" ? (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 flex items-start gap-2" data-testid="drawer-call-only">
              <PhoneCall className="h-4 w-4 text-sky-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-snug">
                Quick chat needed for {draft.label.toLowerCase()} — we'll call you within 24 hours after submission to lock in details.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Preferred start date</Label>
                <DatePicker
                  value={draft.details.requestedDate}
                  onChange={(v) => setDraft({ ...draft, details: { ...draft.details, requestedDate: v || undefined } })}
                  placeholder="Pick a date"
                />
              </div>
              {mode === "date_freq" && freqOptions.length > 0 && (
                <div>
                  <Label className="text-xs">Frequency</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1" data-testid="drawer-frequency">
                    {freqOptions.map(opt => {
                      const active = draft.details.frequency === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDraft({ ...draft, details: { ...draft.details, frequency: opt.value } })}
                          className={cn(
                            "text-[11px] px-2.5 py-1 rounded-full border transition-all",
                            active
                              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                              : "border-border bg-card hover:border-foreground/30",
                          )}
                          data-testid={`drawer-freq-${opt.value}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <Label className="text-xs">Scope (what should we focus on?)</Label>
            <Input
              value={draft.details.scope || ""}
              onChange={(e) => setDraft({ ...draft, details: { ...draft.details, scope: e.target.value } })}
              placeholder="e.g. front yard only, 1 truckload"
              data-testid="drawer-scope"
            />
          </div>
          <div>
            <Label className="text-xs">Notes / special instructions</Label>
            <Textarea
              value={draft.details.notes || ""}
              onChange={(e) => setDraft({ ...draft, details: { ...draft.details, notes: e.target.value } })}
              placeholder="Gate code, parking notes, anything we should know"
              rows={3}
              data-testid="drawer-notes"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => onSave(draft)}
              data-testid="drawer-save"
            >
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── BookingSummarySticky ───────────────────────────────────────────────────
export function BookingSummarySticky({
  items, quote, isQuoting, onCheckout, canCheckout, bottomSlot,
}: {
  items: SelectedItem[];
  quote: QuoteResult | null;
  isQuoting: boolean;
  onCheckout: () => void;
  canCheckout: boolean;
  /** Optional replacement for the default checkout CTA (e.g. wizard Back/Continue). */
  bottomSlot?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const subtotal = quote?.subtotal ?? items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discount = quote?.discountTotal ?? 0;
  const finalTotal = quote?.finalTotal ?? subtotal - discount;
  const tokens = quote?.tokenEstimate ?? 0;
  const crew = recommendedCrewSize(items);
  const hasQuoteItems = items.some(i => i.priceMode !== "quote");

  // Desktop sticky right panel
  const desktopPanel = (
    <aside className="hidden lg:block sticky top-4 self-start w-[320px] shrink-0">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="summary-desktop">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your booking</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a service to see your live quote.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {items.map(i => {
                const lp = formatLinePrice(i);
                return (
                  <div key={i.serviceCode} className="flex justify-between text-xs">
                    <span className="truncate">{emojiFor(i.serviceCode)} {i.label}</span>
                    <span className="font-semibold">
                      {lp.text}
                      {lp.isEstimate && (
                        <span className="ml-1 text-[9px] font-normal text-muted-foreground">(est)</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && quote?.bundleApplied && (
                <div className="flex justify-between text-sm text-emerald-500">
                  <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {quote.bundleApplied.name}</span>
                  <span>−${discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1">
                <span>Total</span>
                <span>{hasQuoteItems && finalTotal === 0 ? "Custom" : `$${finalTotal.toFixed(2)}`}</span>
              </div>
              {!hasQuoteItems && finalTotal === 0 && items.length > 0 && (
                <p className="text-[10px] text-muted-foreground">Final total confirmed after review</p>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Crew of {crew} recommended</span>
              <span className="flex items-center gap-1 text-orange-400"><Coins className="h-3 w-3" /> +{tokens} JCMOVES</span>
            </div>
            {bottomSlot ?? (
              <Button
                type="button"
                className="w-full"
                onClick={onCheckout}
                disabled={!canCheckout || isQuoting}
                data-testid="summary-checkout-desktop"
              >
                {isQuoting ? "Updating…" : "Continue to checkout"}
              </Button>
            )}
          </>
        )}
      </div>
    </aside>
  );

  // Mobile docked bar
  const mobileBar = (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm" data-testid="summary-mobile">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-2 text-left"
        data-testid="summary-mobile-toggle"
      >
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Your booking</span>
          <span className="text-sm font-bold">
            {items.length === 0 ? "No items yet" : `${items.length} item${items.length === 1 ? "" : "s"} • $${finalTotal.toFixed(0)}`}
            {discount > 0 && <span className="text-emerald-500 text-xs ml-1">(−${discount.toFixed(0)})</span>}
          </span>
        </div>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {!collapsed && items.length > 0 && (
        <div className="px-4 pb-2 space-y-1.5 max-h-48 overflow-y-auto">
          {items.map(i => {
            const lp = formatLinePrice(i);
            return (
              <div key={i.serviceCode} className="flex justify-between text-xs">
                <span className="truncate">{emojiFor(i.serviceCode)} {i.label}</span>
                <span className="font-semibold">
                  {lp.text}
                  {lp.isEstimate && (
                    <span className="ml-1 text-[9px] font-normal text-muted-foreground">(est)</span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && quote?.bundleApplied && (
            <div className="flex justify-between text-xs text-emerald-500">
              <span>{quote.bundleApplied.name}</span>
              <span>−${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span><Users className="inline h-3 w-3" /> Crew of {crew}</span>
            <span className="text-orange-400"><Coins className="inline h-3 w-3" /> +{tokens} JCMOVES</span>
          </div>
        </div>
      )}
      <div className="px-4 pb-3">
        {bottomSlot ?? (
          <Button
            type="button"
            className="w-full"
            onClick={onCheckout}
            disabled={!canCheckout || isQuoting}
            data-testid="summary-checkout-mobile"
          >
            {isQuoting ? "Updating…" : items.length === 0 ? "Add a service" : "Continue to checkout"}
          </Button>
        )}
      </div>
    </div>
  );

  return <>{desktopPanel}{mobileBar}</>;
}

// ── BundleSuggestionDialog ────────────────────────────────────────────────
// Smart popup that watches the cart and pops once at meaningful moments:
//  - "auto_applied": cart already qualifies for a featured bundle (savings
//    were applied automatically). Single OK button — purely informational.
//  - "one_away": no bundle is currently applied AND every selected service
//    belongs to one bundle that is missing exactly one service. Offers Add /
//    No thanks. Recommends the bundle with the highest expected discount.
// The page is responsible for tracking shown signatures so the same popup
// doesn't re-fire on the same cart shape.
export type BundleSuggestion =
  | { mode: "auto_applied"; bundle: FeaturedBundle; savings: number }
  | { mode: "one_away"; bundle: FeaturedBundle; missing: CatalogService };

export function BundleSuggestionDialog({
  suggestion, services, onAccept, onClose,
}: {
  suggestion: BundleSuggestion | null;
  services: CatalogService[];
  /** Called when user clicks the primary action.
   *  - auto_applied: just dismisses (acts like Close)
   *  - one_away: parent should add `suggestion.missing` to the cart */
  onAccept: () => void;
  onClose: () => void;
}) {
  const open = !!suggestion;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="bundle-suggestion-dialog" className="sm:max-w-md">
        {suggestion?.mode === "auto_applied" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                You unlocked the {suggestion.bundle.name}!
              </DialogTitle>
              <DialogDescription>
                Saving you <span className="font-bold text-emerald-500">${suggestion.savings.toFixed(0)}</span> automatically — no code or coupon needed.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-card border border-border p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Includes</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestion.bundle.serviceComboJson.map((code) => {
                  const svc = services.find((s) => s.code === code);
                  return (
                    <span key={code} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                      {emojiFor(code)} {svc?.name || code}
                    </span>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onAccept} className="w-full" data-testid="bundle-dialog-ok">
                Sweet, got it
              </Button>
            </DialogFooter>
          </>
        )}
        {suggestion?.mode === "one_away" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-orange-400" />
                Add {suggestion.missing.name} to save{" "}
                {suggestion.bundle.discountType === "percent"
                  ? `${suggestion.bundle.discountValue}%`
                  : `$${parseFloat(suggestion.bundle.discountValue).toFixed(0)}`}
              </DialogTitle>
              <DialogDescription>
                You're one service away from the <span className="font-semibold">{suggestion.bundle.name}</span> bundle.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <span className="text-3xl">{emojiFor(suggestion.missing.code)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{suggestion.missing.name}</p>
                {suggestion.missing.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{suggestion.missing.description}</p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1" data-testid="bundle-dialog-decline">
                No thanks
              </Button>
              <Button onClick={onAccept} className="flex-1" data-testid="bundle-dialog-add">
                Add &amp; save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Validation banner ─────────────────────────────────────────────────────
export function ValidationBanner({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex gap-2" data-testid="validation-banner">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <ul className="text-xs text-destructive space-y-0.5">
        {messages.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  );
}
