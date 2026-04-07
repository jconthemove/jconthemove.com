import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Trash2, Snowflake, Wrench, ArrowLeft, ArrowRight, CheckCircle, MapPin, Calendar, Plus, Minus, Loader2, Zap, Clock, Users, Home, Building2, ChevronRight, MessageSquare, ListOrdered, Sparkles, X, Phone, PaintBucket, Layers, Droplets, Recycle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { BookingChatbot } from "@/components/booking-chatbot";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface ServiceOption {
  value: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  color: string;
  redirectTo?: string;
}

const SERVICES: ServiceOption[] = [
  { value: "residential", label: "Moving",           sub: "Local & long distance",       icon: Truck,        color: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300" },
  { value: "junk",        label: "Junk Removal",     sub: "Haul away & disposal",        icon: Trash2,       color: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300" },
  { value: "snow",        label: "Snow Removal",     sub: "Plowing & shoveling",         icon: Snowflake,    color: "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300" },
  { value: "handyman",    label: "Handyman",          sub: "General repairs",             icon: Wrench,       color: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300" },
  { value: "labor",       label: "Labor Only",       sub: "Loading · Unloading · Packing", icon: Users,      color: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300" },
  { value: "painting",    label: "Painting",         sub: "Interior & exterior",         icon: PaintBucket,  color: "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-300" },
  { value: "flooring",    label: "Flooring",         sub: "Install & refinish",          icon: Layers,       color: "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-300" },
  { value: "window_cleaning", label: "Window Cleaning", sub: "$5/pane · streak-free",   icon: Droplets,     color: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-300",   redirectTo: "/window-cleaning" },
  { value: "trash_valet", label: "Trash Valet",      sub: "Weekly curbside service",     icon: Recycle,      color: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300", redirectTo: "/trash-valet/book" },
];

interface MovingPackage { id: string; movers: number; hours: number; label: string; tag?: string; }
interface JunkPackage { id: string; label: string; desc: string; low: number; high: number; tag?: string; openPrice?: boolean; }
interface Addon { id: string; name: string; description?: string; unitPrice: number; openPrice?: boolean; qtyOptions: number[]; }
interface CatalogDefs { movingPackages: MovingPackage[]; junkPackages: JunkPackage[]; movingAddons: Addon[]; junkAddons: Addon[]; }
interface Pricing {
  ratePerMoverHour: number;
  jc222Price: number;
  shortJobFull: number;
  earnRatePerDollar?: number;
  bookingRequestBonus?: number;
  completionFlatBonus?: number;
}

interface SizeTier {
  id: string;
  label: string;
  desc: string;
  low: number;
  high: number;
  tag?: string;
  isCustom?: boolean;
}

const SNOW_TIERS: SizeTier[] = [
  { id: "snow_small",  label: "Small",  desc: "Single driveway",              low: 35,  high: 75,  tag: "Quick" },
  { id: "snow_medium", label: "Medium", desc: "Residential / multi-car",      low: 75,  high: 150 },
  { id: "snow_large",  label: "Large",  desc: "Estate or light commercial",   low: 150, high: 300, tag: "Popular" },
  { id: "snow_custom", label: "Custom", desc: "We'll quote on-site",          low: 0,   high: 0,   isCustom: true },
];

const HANDYMAN_TIERS: SizeTier[] = [
  { id: "handyman_small",  label: "Small",  desc: "1–2 hour task",            low: 75,  high: 150, tag: "Quick" },
  { id: "handyman_medium", label: "Medium", desc: "Half-day project",         low: 150, high: 350 },
  { id: "handyman_large",  label: "Large",  desc: "Full-day or multi-day",    low: 350, high: 700, tag: "Popular" },
  { id: "handyman_custom", label: "Custom", desc: "We'll quote on-site",      low: 0,   high: 0,   isCustom: true },
];

const LABOR_TIERS: SizeTier[] = [
  { id: "labor_small",  label: "Small",  desc: "2 hrs · studio or small load",    low: 100, high: 175, tag: "Quick" },
  { id: "labor_medium", label: "Medium", desc: "3–4 hrs · 2–3 bedroom load",      low: 175, high: 350 },
  { id: "labor_large",  label: "Large",  desc: "5–7 hrs · full home load",        low: 350, high: 600, tag: "Popular" },
  { id: "labor_custom", label: "Custom", desc: "We'll quote on-site",             low: 0,   high: 0,   isCustom: true },
];

const PAINTING_TIERS: SizeTier[] = [
  { id: "painting_room",     label: "Single Room",   desc: "One bedroom or living area",      low: 200,  high: 400,  tag: "Quick" },
  { id: "painting_multi",    label: "Multi-Room",    desc: "2–4 rooms",                       low: 400,  high: 800 },
  { id: "painting_interior", label: "Full Interior", desc: "Whole home interior",             low: 800,  high: 1800, tag: "Popular" },
  { id: "painting_exterior", label: "Exterior",      desc: "Outside walls of the home",       low: 1000, high: 2500 },
  { id: "painting_custom",   label: "Custom",        desc: "We'll quote on-site",             low: 0,    high: 0,    isCustom: true },
];

const FLOORING_TIERS: SizeTier[] = [
  { id: "flooring_room",   label: "Single Room",    desc: "One room up to 200 sq ft",         low: 200,  high: 500,  tag: "Quick" },
  { id: "flooring_multi",  label: "Multiple Rooms", desc: "2–4 rooms",                        low: 500,  high: 1200 },
  { id: "flooring_home",   label: "Whole Home",     desc: "Full home installation",           low: 1200, high: 3000, tag: "Popular" },
  { id: "flooring_custom", label: "Custom",         desc: "We'll quote on-site",              low: 0,    high: 0,    isCustom: true },
];

// Hour-based discount tiers: book more hours, save more
const HOUR_TIERS = [
  { minHours: 7, pct: 20, label: "20% Off", desc: "7+ hours" },
  { minHours: 5, pct: 15, label: "15% Off", desc: "5+ hours" },
  { minHours: 3, pct: 10, label: "10% Off", desc: "3+ hours" },
];

function getHourDiscount(hours: number): { pct: number; label: string; desc: string } | null {
  return HOUR_TIERS.find(t => hours >= t.minHours) ?? null;
}

const FALLBACK_MOVING: MovingPackage[] = [
  { id: "moving_2m_2h", movers: 2, hours: 2, label: "2 Movers × 2 hrs",  tag: "Quick Job"      },
  { id: "moving_2m_3h", movers: 2, hours: 3, label: "2 Movers × 3 hrs",  tag: "10% Off"        },
  { id: "moving_3m_3h", movers: 3, hours: 3, label: "3 Movers × 3 hrs",  tag: "Most Popular"   },
  { id: "moving_3m_4h", movers: 3, hours: 4, label: "3 Movers × 4 hrs"                         },
  { id: "moving_2m_5h", movers: 2, hours: 5, label: "2 Movers × 5 hrs",  tag: "15% Off"        },
  { id: "moving_3m_5h", movers: 3, hours: 5, label: "3 Movers × 5 hrs",  tag: "15% Off"        },
  { id: "moving_4m_4h", movers: 4, hours: 4, label: "4 Movers × 4 hrs",  tag: "Heavy Move"     },
  { id: "moving_2m_7h", movers: 2, hours: 7, label: "2 Movers × 7 hrs",  tag: "20% Off · Best Value" },
  { id: "moving_3m_7h", movers: 3, hours: 7, label: "3 Movers × 7 hrs",  tag: "20% Off"        },
];
const FALLBACK_JUNK: JunkPackage[] = [
  { id: "junk_single_item", label: "Single Item",     desc: "1–2 large items · up to $300 for pickup truck load", low: 100, high: 200,  tag: "Quick" },
  { id: "junk_quarter",     label: "¼ Truck Load",    desc: "Small cleanout",                                     low: 300, high: 500 },
  { id: "junk_half",        label: "½ Truck Load",    desc: "One room / garage cleanout",                         low: 500, high: 800,  tag: "Popular" },
  { id: "junk_full",        label: "Full Truck Load", desc: "Large enclosed trailer · 1 driver + 2 helpers",      low: 1000, high: 0,   tag: "Best Value" },
];

type BookStep = "service" | "estimate" | "packages" | "details" | "confirm";

const STEPS: BookStep[] = ["service", "estimate", "packages", "details", "confirm"];
const STEP_LABELS: Record<BookStep, string> = {
  service: "Service",
  estimate: "Estimate",
  packages: "Packages",
  details: "Details",
  confirm: "Confirm",
};

function BookingAccountCTA({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-orange-500/40 bg-gradient-to-br from-orange-950/60 to-zinc-900/80 p-5 mt-4">
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-zinc-400 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-white font-bold text-base mb-1">Create a free account to track your jobs</h3>
          <p className="text-zinc-400 text-sm mb-3">
            Sign up to view your booking history and earn JCMOVES rewards on every service.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link href="/login">
              <Button size="sm" className="bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl h-9 px-4">
                Create Free Account
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white rounded-xl h-9 px-4">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SizeTierCards({ tiers, selectedId, onSelect }: { tiers: SizeTier[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiers.map(tier => {
        const isSelected = selectedId === tier.id;
        return (
          <button
            key={tier.id}
            onClick={() => onSelect(tier.id)}
            className={cn(
              "relative flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 text-left transition-all",
              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-primary/40"
            )}
          >
            {isSelected && <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{tier.label}</p>
              {tier.tag && <Badge className="text-[10px] px-1.5 py-0">{tier.tag}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{tier.desc}</p>
            {tier.isCustom ? (
              <p className="text-xs font-medium text-muted-foreground mt-0.5">We'll quote on-site</p>
            ) : (
              <p className="text-sm font-bold text-primary mt-0.5">
                ${tier.low}–${tier.high}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function CustomerBookPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bookingMode, setBookingMode] = useState<"choose" | "chatbot" | "form">("choose");
  const [step, setStep] = useState<BookStep>("service");
  const [serviceType, setServiceType] = useState("");

  // Pre-select service + skip to estimate step when ?service= is in the URL.
  // Redirect services navigate away immediately; form services pre-select and skip the picker.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const svc = params.get("service");
    if (!svc) return;
    if (svc === "window_cleaning") { setLocation("/window-cleaning"); return; }
    if (svc === "trash_valet")     { setLocation("/trash-valet/book"); return; }
    const serviceMap: Record<string, string> = {
      moving: "residential", residential: "residential",
      junk:   "junk",
      snow:   "snow",
      handyman: "handyman",
      labor:    "labor",
      painting: "painting",
      flooring: "flooring",
    };
    const mapped = serviceMap[svc];
    if (mapped) {
      setServiceType(mapped);
      setBookingMode("form");
      setStep("estimate");
    }
  }, []);

  const [junkSizeHint, setJunkSizeHint] = useState<string | null>(null);
  const [movingSizeHint, setMovingSizeHint] = useState<string | null>(null);
  const [sizeTierId, setSizeTierId] = useState<string | null>(null);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({});
  const [showAccountCTA, setShowAccountCTA] = useState(false);
  const [form, setForm] = useState({
    fromAddress: "",
    toAddress: "",
    moveDate: "",
    details: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });

  // Reset size/package state when service type changes to prevent stale cross-service tier data
  useEffect(() => {
    setSizeTierId(null);
    setSelectedPkgId(null);
    setAddonQtys({});
    setJunkSizeHint(null);
    setMovingSizeHint(null);
  }, [serviceType]);

  // Pre-fill contact info from user profile when user logs in or component mounts
  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        contactName: f.contactName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        contactEmail: f.contactEmail || user.email || "",
        contactPhone: f.contactPhone || user.phoneNumber || "",
      }));
    }
  }, [user]);

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"], retry: 2 });
  const { data: catalog } = useQuery<CatalogDefs>({ queryKey: ["/api/pricing/catalog-definitions"], retry: 2 });

  const ratePerMoverHour = pricing?.ratePerMoverHour ?? 85;
  const shortJobFull = pricing?.shortJobFull ?? 300;

  const movingPackages = catalog?.movingPackages?.length ? catalog.movingPackages : FALLBACK_MOVING;
  const junkPackages = catalog?.junkPackages?.length ? catalog.junkPackages : FALLBACK_JUNK;
  const movingAddons = catalog?.movingAddons ?? [];
  const junkAddons = catalog?.junkAddons ?? [];

  const isMoving = serviceType === "residential";
  const isJunk = serviceType === "junk";
  const isSnow = serviceType === "snow";
  const isHandyman = serviceType === "handyman";
  const isLabor = serviceType === "labor";
  const isPainting = serviceType === "painting";
  const isFlooring = serviceType === "flooring";
  const needsPackages = isMoving || isJunk;
  const needsSizeTiers = isSnow || isHandyman || isLabor || isPainting || isFlooring;

  const selectedPkg = isMoving
    ? movingPackages.find(p => p.id === selectedPkgId)
    : junkPackages.find(p => p.id === selectedPkgId);

  const activeSizeTiers = isSnow ? SNOW_TIERS
    : isHandyman ? HANDYMAN_TIERS
    : isLabor ? LABOR_TIERS
    : isPainting ? PAINTING_TIERS
    : FLOORING_TIERS;

  const selectedSizeTier = needsSizeTiers
    ? activeSizeTiers.find(t => t.id === sizeTierId)
    : null;

  const calcMovingPrice = (pkg: MovingPackage): number => {
    if ((pkg as any).isJc222) return pricing?.jc222Price ?? 222;
    const base = pkg.movers * pkg.hours * ratePerMoverHour;
    const floored = Math.round(base / 10) * 10;
    const discount = getHourDiscount(pkg.hours);
    return discount ? Math.round(floored * (1 - discount.pct / 100)) : floored;
  };

  const calcAddonTotal = () => {
    const addons = isMoving ? movingAddons : junkAddons;
    return addons.reduce((sum, a) => sum + (addonQtys[a.id] || 0) * a.unitPrice, 0);
  };

  const calcTotal = () => {
    if (!selectedPkg) return 0;
    if (isMoving) {
      const pkg = selectedPkg as MovingPackage;
      return calcMovingPrice(pkg) + calcAddonTotal();
    }
    if (isJunk) {
      const pkg = selectedPkg as JunkPackage;
      return pkg.high + calcAddonTotal();
    }
    return 0;
  };

  const submitJob = useMutation({
    mutationFn: async () => {
      const totalPrice = selectedPkg ? calcTotal() : undefined;
      const pkg = selectedPkg;
      const crewSize = isMoving && pkg ? (pkg as MovingPackage).movers : undefined;
      const confirmedHours = isMoving && pkg ? (pkg as MovingPackage).hours : undefined;
      const activeAddons = [...(isMoving ? movingAddons : junkAddons)].filter(a => (addonQtys[a.id] || 0) > 0);
      const addonLines = activeAddons.map(a => ({ id: a.id, name: a.name, qty: addonQtys[a.id], unitPrice: a.unitPrice, total: addonQtys[a.id] * a.unitPrice }));

      const nameParts = form.contactName.trim().split(" ");
      const firstName = nameParts[0] || "Guest";
      const lastName = nameParts.slice(1).join(" ") || "User";
      const email = form.contactEmail || "";
      const phone = form.contactPhone || "";

      // For size-tier services, validate tier belongs to current service before submitting
      if (needsSizeTiers && !selectedSizeTier) {
        throw new Error("Please select a size tier before submitting.");
      }

      const effectivePkgId = needsSizeTiers ? (sizeTierId ?? undefined) : (selectedPkgId ?? undefined);
      const effectiveBasePrice = needsSizeTiers && selectedSizeTier
        ? (selectedSizeTier.isCustom ? 0 : selectedSizeTier.high)
        : (totalPrice ?? undefined);

      return await apiRequest("POST", "/api/leads", {
        serviceType,
        firstName,
        lastName,
        email,
        phone,
        fromAddress: form.fromAddress,
        toAddress: form.toAddress,
        moveDate: form.moveDate,
        details: form.details,
        selectedPackageId: effectivePkgId,
        basePrice: effectiveBasePrice !== undefined ? String(effectiveBasePrice) : undefined,
        totalPrice: totalPrice ? totalPrice.toFixed(2) : undefined,
        crewSize,
        confirmedHours,
        orderLineItems: [
          ...(pkg && isMoving ? [{ name: (pkg as MovingPackage).label, qty: 1, unitPrice: calcMovingPrice(pkg as MovingPackage), total: calcMovingPrice(pkg as MovingPackage) }] : []),
          ...(pkg && isJunk ? [{ name: (pkg as JunkPackage).label, qty: 1, unitPrice: (pkg as JunkPackage).high, total: (pkg as JunkPackage).high }] : []),
          ...addonLines,
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/my-leads"] });
      toast({ title: "Booking submitted!", description: `We'll confirm your details soon. You earned ${(pricing?.bookingRequestBonus ?? 250).toLocaleString()} JCMOVES!` });
      if (!user) {
        setShowAccountCTA(true);
      } else {
        setLocation("/jobs");
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  const effectiveSteps = needsPackages ? STEPS : STEPS.filter(s => s !== "packages");
  const effectiveIdx = effectiveSteps.indexOf(step);

  const nextStep = () => {
    if (step === "service" && !serviceType) return;
    if (step === "packages" && needsPackages && !selectedPkgId) return;
    const next = effectiveSteps[effectiveIdx + 1];
    if (next) setStep(next);
  };

  const prevStep = () => {
    const prev = effectiveSteps[effectiveIdx - 1];
    if (prev) setStep(prev);
  };

  const goToStep = (s: BookStep) => {
    const idx = effectiveSteps.indexOf(s);
    if (idx <= effectiveIdx) setStep(s);
  };

  const canProceedFromDetails =
    !!form.fromAddress &&
    !!form.moveDate &&
    !!form.contactName.trim() &&
    !!form.contactPhone.trim();

  if (bookingMode === "chatbot") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setBookingMode("choose")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="font-bold text-base">Book a Service</h1>
              <p className="text-xs text-muted-foreground">Chat with our booking assistant</p>
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 pt-4">
          <BookingChatbot onClose={() => setBookingMode("choose")} />
        </div>
      </div>
    );
  }

  if (bookingMode === "choose") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="font-bold text-base">Book a Service</h1>
              <p className="text-xs text-muted-foreground">How would you like to book?</p>
            </div>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 pt-8 space-y-4">
          <p className="text-center text-muted-foreground text-sm mb-6">Choose how you want to get a quote and book your service.</p>
          <button onClick={() => setBookingMode("chatbot")}
            className="w-full flex items-start gap-4 p-5 rounded-2xl border-2 border-muted hover:border-primary/60 bg-card text-left transition-all group">
            <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Chat with our assistant</p>
              <p className="text-sm text-muted-foreground mt-0.5">Answer a few questions in a friendly conversation and get an instant quote. Takes about 2 minutes.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto self-center" />
          </button>
          <button onClick={() => setBookingMode("form")}
            className="w-full flex items-start gap-4 p-5 rounded-2xl border-2 border-muted hover:border-primary/60 bg-card text-left transition-all group">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20 transition-colors">
              <ListOrdered className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Step-by-step form</p>
              <p className="text-sm text-muted-foreground mt-0.5">Pick your service, choose a package, and enter your details at your own pace.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto self-center" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { if (step === "service") setBookingMode("choose"); else prevStep(); }} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-base">Book a Service</h1>
            <p className="text-xs text-muted-foreground">Step {effectiveIdx + 1} of {effectiveSteps.length}: {STEP_LABELS[step]}</p>
          </div>
          <div className="flex items-center gap-1">
            {effectiveSteps.map((s, i) => (
              <div key={s} className={cn("h-1.5 rounded-full transition-all", i <= effectiveIdx ? "bg-primary w-6" : "bg-muted w-3")} />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">

        {/* ── STEP 1: Service ── */}
        {step === "service" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold mb-1">What do you need help with?</h2>
              <p className="text-sm text-muted-foreground">Choose the service that best fits your needs.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SERVICES.map(svc => {
                const Icon = svc.icon;
                const isSelected = serviceType === svc.value;
                const isRedirect = !!svc.redirectTo;
                return (
                  <button
                    key={svc.value}
                    onClick={() => {
                      if (svc.redirectTo) { setLocation(svc.redirectTo); }
                      else { setServiceType(svc.value); }
                    }}
                    className={cn("relative flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all", isSelected ? "border-primary bg-primary/5 shadow-md" : "border-muted hover:border-primary/40", svc.color)}>
                    {isSelected && <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />}
                    {isRedirect && !isSelected && <ChevronRight className="absolute top-2 right-2 h-4 w-4 text-muted-foreground" />}
                    <div className={cn("p-2 rounded-xl", isSelected ? "bg-primary/10" : "bg-background/60")}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{svc.label}</p>
                      <p className="text-xs text-muted-foreground">{svc.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* JCMOVES incentive */}
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <Zap className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-amber-500">Earn {(pricing?.bookingRequestBonus ?? 250).toLocaleString()} JCMOVES</span>
                <span className="text-muted-foreground"> just for booking, plus {pricing?.earnRatePerDollar ?? 15} per dollar spent!</span>
              </div>
            </div>

            <Button className="w-full" size="lg" disabled={!serviceType} onClick={nextStep}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ── STEP 2: Estimate / Size ── */}
        {step === "estimate" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Tell us about your {SERVICES.find(s => s.value === serviceType)?.label.toLowerCase()}</h2>
              <p className="text-sm text-muted-foreground">This helps us estimate the right crew and time.</p>
            </div>

            {isMoving && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "studio",     icon: Home,      label: "Studio / 1BR",       sub: "Up to 500 sq ft" },
                    { id: "2br",        icon: Home,      label: "2–3 Bedroom",         sub: "500–1,200 sq ft" },
                    { id: "large",      icon: Building2, label: "Large Home",           sub: "1,200–2,500 sq ft" },
                    { id: "commercial", icon: Building2, label: "Office / Commercial",  sub: "Any size" },
                  ].map(opt => {
                    const Icon = opt.icon;
                    const isSelected = movingSizeHint === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => { setMovingSizeHint(opt.id); nextStep(); }}
                        className={cn(
                          "flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/40"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.sub}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground text-center">This is just an estimate — we'll confirm the right package in the next step.</p>
              </div>
            )}

            {isJunk && (
              <div className="space-y-3">
                <div className="space-y-2">
                  {[
                    { id: "small",  label: "A few small items", sub: "Furniture, appliances, boxes" },
                    { id: "medium", label: "Half a room",        sub: "Garage partial, attic, etc." },
                    { id: "large",  label: "Full room or more",  sub: "Complete cleanout, estate" },
                  ].map(opt => {
                    const isSelected = junkSizeHint === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => { setJunkSizeHint(opt.id); nextStep(); }}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/40"
                        )}
                      >
                        <div>
                          <p className="font-medium text-sm">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.sub}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {needsSizeTiers && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Select a size to get a rough price estimate.</p>
                <SizeTierCards
                  tiers={activeSizeTiers}
                  selectedId={sizeTierId}
                  onSelect={(id) => setSizeTierId(id)}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={prevStep}>Back</Button>
              <Button
                className="flex-1"
                onClick={nextStep}
                disabled={needsSizeTiers && !sizeTierId}
              >
                {needsPackages ? "See Packages" : "Enter Details"} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Packages ── */}
        {step === "packages" && needsPackages && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Choose a package</h2>
              <p className="text-sm text-muted-foreground">Book more hours and save automatically.</p>
            </div>

            {/* Discount tier callout */}
            {isMoving && (
              <div className="flex items-stretch gap-2">
                {HOUR_TIERS.map(tier => (
                  <div key={tier.pct} className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-2.5 text-center">
                    <p className="text-xs font-bold text-green-600">{tier.label}</p>
                    <p className="text-[10px] text-muted-foreground">{tier.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Moving packages */}
            {isMoving && (
              <div className="space-y-2">
                {movingPackages.map(pkg => {
                  const isJc222 = !!(pkg as any).isJc222;
                  const fullPrice = isJc222
                    ? shortJobFull
                    : Math.round((pkg.movers * pkg.hours * ratePerMoverHour) / 10) * 10;
                  const price = calcMovingPrice(pkg);
                  const discount = isJc222 ? null : getHourDiscount(pkg.hours);
                  const savings = fullPrice - price;
                  const isSelected = selectedPkgId === pkg.id;
                  return (
                    <button key={pkg.id} onClick={() => setSelectedPkgId(pkg.id)}
                      className={cn("w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all", isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-primary/40")}>
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl", isSelected ? "bg-primary/10" : "bg-muted/50")}>
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{pkg.label}</p>
                            {discount && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-600 border-green-500/30">
                                {discount.label}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pkg.movers} movers</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.hours} hrs</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-primary">${price}</p>
                        {discount && savings > 0 && (
                          <p className="text-[10px] text-green-500 line-through-adjacent">
                            <span className="line-through text-muted-foreground">${fullPrice}</span>
                            <span className="ml-1 text-green-500">−${savings}</span>
                          </p>
                        )}
                        {isSelected && <CheckCircle className="h-4 w-4 text-primary ml-auto mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Junk packages */}
            {isJunk && (
              <div className="space-y-2">
                {junkPackages.map(pkg => {
                  const isSelected = selectedPkgId === pkg.id;
                  return (
                    <button key={pkg.id} onClick={() => setSelectedPkgId(pkg.id)}
                      className={cn("w-full flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all", isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-primary/40")}>
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl", isSelected ? "bg-primary/10" : "bg-muted/50")}>
                          <Trash2 className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{pkg.label}</p>
                            {pkg.tag && <Badge className="text-[10px] px-1.5 py-0">{pkg.tag}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{pkg.desc}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">
                          {pkg.high > 0 ? `$${pkg.low.toLocaleString()}–$${pkg.high.toLocaleString()}` : `$${pkg.low.toLocaleString()}+`}
                        </p>
                        {isSelected && <CheckCircle className="h-4 w-4 text-primary ml-auto mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Addons */}
            {(isMoving ? movingAddons : junkAddons).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">Add-ons (optional)</p>
                {(isMoving ? movingAddons : junkAddons).map(addon => {
                  const qty = addonQtys[addon.id] || 0;
                  return (
                    <div key={addon.id} className="flex items-center justify-between p-3 rounded-xl border border-muted bg-muted/20">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium">{addon.name}</p>
                        <p className="text-xs text-muted-foreground">${addon.unitPrice}{addon.openPrice ? '+' : ''} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setAddonQtys(q => ({ ...q, [addon.id]: Math.max(0, (q[addon.id] || 0) - 1) }))} className="h-7 w-7 rounded-full border border-muted flex items-center justify-center hover:bg-muted">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-medium w-4 text-center">{qty}</span>
                        <button onClick={() => setAddonQtys(q => ({ ...q, [addon.id]: (q[addon.id] || 0) + 1 }))} className="h-7 w-7 rounded-full border border-primary text-primary flex items-center justify-center hover:bg-primary/10">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedPkgId && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl flex justify-between items-center">
                <span className="text-sm font-medium">Estimated Total</span>
                <span className="font-bold text-primary text-lg">${calcTotal().toFixed(0)}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={prevStep}>Back</Button>
              <Button className="flex-1" disabled={!selectedPkgId} onClick={nextStep}>
                Enter Details <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Details ── */}
        {step === "details" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Where & when?</h2>
              <p className="text-sm text-muted-foreground">We'll use this to plan your job.</p>
            </div>

            <div className="space-y-3">
              <AddressAutocomplete
                dark={false}
                label="Pickup / From Address"
                required
                value={form.fromAddress}
                onChange={v => setForm(f => ({ ...f, fromAddress: v }))}
                placeholder="123 Main St, City, State"
              />

              {isMoving && (
                <AddressAutocomplete
                  dark={false}
                  label="Delivery / To Address"
                  value={form.toAddress}
                  onChange={v => setForm(f => ({ ...f, toAddress: v }))}
                  placeholder="456 New St, City, State"
                />
              )}

              <div>
                <Label htmlFor="moveDate" className="flex items-center gap-1.5 mb-1.5 text-sm"><Calendar className="h-3.5 w-3.5" />Preferred Date</Label>
                <Input id="moveDate" type="date" value={form.moveDate} onChange={e => setForm(f => ({ ...f, moveDate: e.target.value }))} min={new Date().toISOString().split("T")[0]} />
              </div>

              <div>
                <Label htmlFor="details" className="text-sm mb-1.5 block">Additional Details <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="details" placeholder="Stairs, elevator, special items, access instructions..." rows={3} value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
              </div>

              {/* Contact info — always shown for all users, pre-filled when logged in */}
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-sm font-semibold">Your Contact Info</p>
                {user && (
                  <p className="text-xs text-muted-foreground">Pre-filled from your profile — update if needed.</p>
                )}
                <div>
                  <Label htmlFor="contactName" className="text-sm mb-1.5 block">Full Name <span className="text-destructive">*</span></Label>
                  <Input id="contactName" placeholder="John Doe" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="contactPhone" className="flex items-center gap-1.5 text-sm mb-1.5">
                    <Phone className="h-3.5 w-3.5" />Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input id="contactPhone" type="tel" placeholder="(555) 123-4567" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="contactEmail" className="text-sm mb-1.5 block">Email Address <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="contactEmail" type="email" placeholder="you@example.com" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={prevStep}>Back</Button>
              <Button className="flex-1" disabled={!canProceedFromDetails} onClick={nextStep}>
                Review <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Confirm ── */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Review your booking</h2>
              <p className="text-sm text-muted-foreground">Everything look right? Submit when ready.</p>
            </div>

            <Card>
              <CardContent className="p-4 space-y-3">
                {/* Service */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Service</span>
                  <Badge variant="secondary">{SERVICES.find(s => s.value === serviceType)?.label}</Badge>
                </div>

                {/* Package */}
                {selectedPkg && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Package</span>
                    <span className="text-sm font-medium">{(selectedPkg as MovingPackage).label || (selectedPkg as JunkPackage).label}</span>
                  </div>
                )}

                {/* Size tier for snow/handyman/labor */}
                {selectedSizeTier && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Size</span>
                    <span className="text-sm font-medium">
                      {selectedSizeTier.label}
                      {!selectedSizeTier.isCustom && ` · ~$${selectedSizeTier.low}–${selectedSizeTier.high}`}
                      {selectedSizeTier.isCustom && " · We'll quote on-site"}
                    </span>
                  </div>
                )}

                {/* Addons */}
                {(isMoving ? movingAddons : junkAddons).filter(a => (addonQtys[a.id] || 0) > 0).map(a => (
                  <div key={a.id} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{a.name} × {addonQtys[a.id]}</span>
                    <span className="text-sm font-medium">${(addonQtys[a.id] * a.unitPrice).toFixed(0)}</span>
                  </div>
                ))}

                <hr className="border-muted" />

                {/* From / To */}
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">{form.fromAddress}</p>
                    {form.toAddress && <p className="text-muted-foreground">→ {form.toAddress}</p>}
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{form.moveDate ? new Date(form.moveDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Date not set"}</span>
                </div>

                <hr className="border-muted" />

                {/* Contact info */}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">{form.contactName}</p>
                    <p className="text-muted-foreground">{form.contactPhone}</p>
                  </div>
                </div>

                {/* Total */}
                {selectedPkg && calcTotal() > 0 && (
                  <>
                    <hr className="border-muted" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Estimated Total</span>
                      <span className="text-xl font-bold text-primary">${calcTotal().toFixed(0)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Token earn preview */}
            {calcTotal() > 0 && (
              <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <Zap className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold text-amber-500">Earn ~{((pricing?.bookingRequestBonus ?? 250) + (pricing?.completionFlatBonus ?? 1500) + Math.round(calcTotal() * (pricing?.earnRatePerDollar ?? 15))).toLocaleString()} JCMOVES</span>
                  <span className="text-muted-foreground"> on this booking!</span>
                </div>
              </div>
            )}

            {/* Notes */}
            {form.details && (
              <div className="p-3 bg-muted/50 rounded-xl text-sm">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p>{form.details}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={prevStep}>Back</Button>
              <Button className="flex-1 bg-primary" size="lg" onClick={() => submitJob.mutate()} disabled={submitJob.isPending}>
                {submitJob.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</> : <>Submit Booking <CheckCircle className="h-4 w-4 ml-2" /></>}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">By submitting, you agree to our Terms of Service. Final pricing confirmed at time of service.</p>

            {showAccountCTA && !user && (
              <BookingAccountCTA onDismiss={() => setShowAccountCTA(false)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
