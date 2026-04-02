import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Trash2, Snowflake, Wrench, ArrowLeft, ArrowRight, CheckCircle, MapPin, Calendar, Plus, Minus, Loader2, Zap, Clock, Users, Home, Building2, ChevronRight, MessageSquare, ListOrdered, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { BookingChatbot } from "@/components/booking-chatbot";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const SERVICES = [
  { value: "residential", label: "Moving", sub: "Local & long distance", icon: Truck, color: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300" },
  { value: "junk", label: "Junk Removal", sub: "Haul away & disposal", icon: Trash2, color: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300" },
  { value: "snow", label: "Snow Removal", sub: "Plowing & shoveling", icon: Snowflake, color: "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300" },
  { value: "handyman", label: "Handyman", sub: "General repairs", icon: Wrench, color: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300" },
];

interface MovingPackage { id: string; movers: number; hours: number; label: string; tag?: string; }
interface JunkPackage { id: string; label: string; desc: string; low: number; high: number; tag?: string; openPrice?: boolean; }
interface Addon { id: string; name: string; description?: string; unitPrice: number; openPrice?: boolean; qtyOptions: number[]; }
interface CatalogDefs { movingPackages: MovingPackage[]; junkPackages: JunkPackage[]; movingAddons: Addon[]; junkAddons: Addon[]; }
interface Pricing { ratePerMoverHour: number; jc222Price: number; shortJobFull: number; }

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
  { id: "junk_full",        label: "Full Truck Load", desc: "Estate cleanout / full demo",                        low: 1000, high: 0,   tag: "Best Value" },
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

export default function CustomerBookPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bookingMode, setBookingMode] = useState<"choose" | "chatbot" | "form">("choose");
  const [step, setStep] = useState<BookStep>("service");
  const [serviceType, setServiceType] = useState("");
  const [junkSizeHint, setJunkSizeHint] = useState<string | null>(null);
  const [movingSizeHint, setMovingSizeHint] = useState<string | null>(null);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({});
  const [showAccountCTA, setShowAccountCTA] = useState(false);
  const [form, setForm] = useState({
    fromAddress: "",
    toAddress: "",
    moveDate: "",
    details: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
  });

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"], retry: 2 });
  const { data: catalog } = useQuery<CatalogDefs>({ queryKey: ["/api/pricing/catalog-definitions"], retry: 2 });

  const ratePerMoverHour = pricing?.ratePerMoverHour ?? 60;
  const shortJobFull = pricing?.shortJobFull ?? 300;

  const movingPackages = catalog?.movingPackages?.length ? catalog.movingPackages : FALLBACK_MOVING;
  const junkPackages = catalog?.junkPackages?.length ? catalog.junkPackages : FALLBACK_JUNK;
  const movingAddons = catalog?.movingAddons ?? [];
  const junkAddons = catalog?.junkAddons ?? [];

  const isMoving = serviceType === "residential";
  const isJunk = serviceType === "junk";
  const needsPackages = isMoving || isJunk;

  const selectedPkg = isMoving
    ? movingPackages.find(p => p.id === selectedPkgId)
    : junkPackages.find(p => p.id === selectedPkgId);

  const calcMovingPrice = (pkg: MovingPackage): number => {
    const base = pkg.movers * pkg.hours * ratePerMoverHour;
    const floored = base < shortJobFull ? shortJobFull : base;
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

      const guestNameParts = form.guestName.trim().split(" ");
      const firstName = user?.firstName || guestNameParts[0] || "Guest";
      const lastName = user?.lastName || guestNameParts.slice(1).join(" ") || "User";
      const email = user?.email || form.guestEmail || "";
      const phone = user?.phoneNumber || form.guestPhone || "";

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
        selectedPackageId: selectedPkgId,
        basePrice: totalPrice ? totalPrice.toFixed(2) : undefined,
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
      toast({ title: "Booking submitted!", description: "We'll confirm your details soon. You earned 50 JCMOVES!" });
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
                return (
                  <button key={svc.value} onClick={() => setServiceType(svc.value)}
                    className={cn("relative flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all", isSelected ? "border-primary bg-primary/5 shadow-md" : "border-muted hover:border-primary/40", svc.color)}>
                    {isSelected && <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />}
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
                <span className="font-semibold text-amber-500">Earn 50 JCMOVES</span>
                <span className="text-muted-foreground"> just for booking, plus 15 per dollar spent!</span>
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

            {!isMoving && !isJunk && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">We'll send a crew to assess and provide a free estimate on-site.</p>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={prevStep}>Back</Button>
              <Button className="flex-1" onClick={nextStep}>
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
                    <p className="text-green-500 font-black text-sm">{tier.label}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">{tier.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Moving packages */}
            {isMoving && (
              <div className="space-y-2">
                {movingPackages.map(pkg => {
                  const fullPrice = (() => {
                    const base = pkg.movers * pkg.hours * ratePerMoverHour;
                    return base < shortJobFull ? shortJobFull : base;
                  })();
                  const price = calcMovingPrice(pkg);
                  const discount = getHourDiscount(pkg.hours);
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
              <div>
                <Label htmlFor="fromAddress" className="flex items-center gap-1.5 mb-1.5 text-sm"><MapPin className="h-3.5 w-3.5" />Pickup / From Address</Label>
                <Input id="fromAddress" placeholder="123 Main St, City, State" value={form.fromAddress} onChange={e => setForm(f => ({ ...f, fromAddress: e.target.value }))} />
              </div>

              {isMoving && (
                <div>
                  <Label htmlFor="toAddress" className="flex items-center gap-1.5 mb-1.5 text-sm"><MapPin className="h-3.5 w-3.5" />Delivery / To Address</Label>
                  <Input id="toAddress" placeholder="456 New St, City, State" value={form.toAddress} onChange={e => setForm(f => ({ ...f, toAddress: e.target.value }))} />
                </div>
              )}

              <div>
                <Label htmlFor="moveDate" className="flex items-center gap-1.5 mb-1.5 text-sm"><Calendar className="h-3.5 w-3.5" />Preferred Date</Label>
                <Input id="moveDate" type="date" value={form.moveDate} onChange={e => setForm(f => ({ ...f, moveDate: e.target.value }))} min={new Date().toISOString().split("T")[0]} />
              </div>

              <div>
                <Label htmlFor="details" className="text-sm mb-1.5 block">Additional Details <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id="details" placeholder="Stairs, elevator, special items, access instructions..." rows={3} value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
              </div>

              {!user && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-sm font-semibold">Your Contact Info</p>
                  <div>
                    <Label htmlFor="guestName" className="text-sm mb-1.5 block">Full Name</Label>
                    <Input id="guestName" placeholder="John Doe" value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="guestEmail" className="text-sm mb-1.5 block">Email Address</Label>
                    <Input id="guestEmail" type="email" placeholder="you@example.com" value={form.guestEmail} onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="guestPhone" className="text-sm mb-1.5 block">Phone <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="guestPhone" type="tel" placeholder="(555) 123-4567" value={form.guestPhone} onChange={e => setForm(f => ({ ...f, guestPhone: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={prevStep}>Back</Button>
              <Button className="flex-1" disabled={!form.fromAddress || !form.moveDate || (!user && !form.guestEmail)} onClick={nextStep}>
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
                  <span className="font-semibold text-amber-500">Earn ~{50 + Math.round(calcTotal() * 15).toLocaleString()} JCMOVES</span>
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
