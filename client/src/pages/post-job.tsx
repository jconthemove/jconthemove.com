import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Truck, Trash2, Snowflake, Wrench, MapPin, Calendar, FileText,
  CheckCircle, Coins, Loader2, ChevronRight, Camera, X, Image, Video, Upload,
  Users, Clock, Sparkles, Package, CheckCircle2, Minus, Plus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const SERVICES = [
  { value: "residential", label: "Moving", sub: "Local & long distance", icon: Truck, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800" },
  { value: "junk", label: "Junk Removal", sub: "Haul away & disposal", icon: Trash2, color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 border-orange-200 dark:border-orange-800" },
  { value: "snow", label: "Snow Removal", sub: "Plowing & shoveling", icon: Snowflake, color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 border-cyan-200 dark:border-cyan-800" },
  { value: "handyman", label: "Handyman", sub: "General repairs", icon: Wrench, color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200 dark:border-amber-800" },
];

const EARN_RATE = 15;
const POST_TOKENS = 50;

const PACKAGE_SERVICES = ["residential", "junk"];

interface UploadedMedia {
  url: string;
  mimeType: string;
  name: string;
  localPreview?: string;
}

interface MovingPackage {
  id: string;
  movers: number;
  hours: number;
  label: string;
  tag?: string;
  isJc222?: boolean;
}

interface JunkPackage {
  id: string;
  label: string;
  desc: string;
  low: number;
  high: number;
  tag?: string;
}

interface MovingAddon {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;
  category?: string;
  qtyOptions: number[];
}

interface JunkAddon {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;
  qtyOptions: number[];
}

interface CatalogDefs {
  movingPackages: MovingPackage[];
  junkPackages: JunkPackage[];
  movingAddons: MovingAddon[];
  junkAddons: JunkAddon[];
}

interface Pricing {
  ratePerMoverHour: number;
  jc222Price: number;
  shortJobFull: number;
}

function getSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export default function PostJobPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const urlParams = getSearchParams();
  const prefilledService = urlParams.get("serviceType") || "";
  const prefilledPackageId = urlParams.get("packageId") || "";
  const prefilledPrice = parseFloat(urlParams.get("estimatedPrice") || "0");
  const prefilledPackagePrice = parseFloat(urlParams.get("packagePrice") || "0");
  const prefilledCrew = parseInt(urlParams.get("crewSize") || "0", 10);
  const prefilledAddons: Record<string, number> = (() => {
    try { return JSON.parse(urlParams.get("addons") || "{}"); } catch { return {}; }
  })();

  const [step, setStep] = useState(prefilledService ? 2 : 1);
  const [form, setForm] = useState({
    serviceType: prefilledService,
    fromAddress: "",
    toAddress: "",
    moveDate: "",
    details: "",
  });
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(prefilledPackageId || null);
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>(prefilledAddons);
  const [pkgSkipped, setPkgSkipped] = useState(false);
  const [pkgStep, setPkgStep] = useState(false);
  const cameFromPackagesPage = !!prefilledPackageId && prefilledPrice > 0;

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"], retry: 2 });
  const { data: catalog, isError: catalogError } = useQuery<CatalogDefs>({ queryKey: ["/api/pricing/catalog-definitions"], retry: 2 });

  const ratePerMoverHour = pricing?.ratePerMoverHour ?? 60;
  const jc222Price = pricing?.jc222Price ?? 222;
  const shortJobFull = pricing?.shortJobFull ?? 300;

  const FALLBACK_MOVING: MovingPackage[] = [
    { id: "moving_2m_2h", movers: 2, hours: 2, label: "JC222 Special", tag: "💥 Best Deal", isJc222: true },
    { id: "moving_2m_3h", movers: 2, hours: 3, label: "2 Movers × 3 hrs", tag: "Short Move" },
    { id: "moving_3m_3h", movers: 3, hours: 3, label: "3 Movers × 3 hrs", tag: "Most Popular" },
    { id: "moving_3m_4h", movers: 3, hours: 4, label: "3 Movers × 4 hrs" },
    { id: "moving_4m_4h", movers: 4, hours: 4, label: "4 Movers × 4 hrs", tag: "Heavy Move" },
    { id: "moving_2m_6h", movers: 2, hours: 6, label: "2 Movers × 6 hrs", tag: "Full Day" },
  ];
  const FALLBACK_JUNK: JunkPackage[] = [
    { id: "junk_small", label: "Small Load", desc: "¼ truck or less", low: 100, high: 175, tag: "Quick Pickup" },
    { id: "junk_medium", label: "Medium Load", desc: "½ truck", low: 200, high: 300, tag: "Most Popular" },
    { id: "junk_large", label: "Large Load", desc: "Full truck", low: 350, high: 500, tag: "Full Cleanout" },
  ];

  const movingPackages = catalog?.movingPackages?.length ? catalog.movingPackages : FALLBACK_MOVING;
  const junkPackages = catalog?.junkPackages?.length ? catalog.junkPackages : FALLBACK_JUNK;
  const movingAddons = catalog?.movingAddons ?? [];
  const junkAddons = catalog?.junkAddons ?? [];

  const isMoving = form.serviceType === "residential";
  const isJunk = form.serviceType === "junk";
  const needsPackageStep = PACKAGE_SERVICES.includes(form.serviceType);

  function getMovingPrice(pkg: MovingPackage): number {
    return pkg.isJc222 ? jc222Price : pkg.movers * pkg.hours * ratePerMoverHour;
  }

  function getJunkMid(pkg: JunkPackage): number {
    return Math.round((pkg.low + pkg.high) / 2);
  }

  function calcAddonTotal(): number {
    const addons = isMoving ? movingAddons : junkAddons;
    return addons.reduce((sum, a) => sum + (addonQtys[a.id] || 0) * a.unitPrice, 0);
  }

  function calcBasePackagePrice(): number {
    if (isMoving && selectedPkgId && movingPackages.length > 0) {
      const pkg = movingPackages.find(p => p.id === selectedPkgId);
      if (pkg) return getMovingPrice(pkg);
    }
    if (isJunk && selectedPkgId && junkPackages.length > 0) {
      const pkg = junkPackages.find(p => p.id === selectedPkgId);
      if (pkg) return getJunkMid(pkg);
    }
    if (selectedPkgId === prefilledPackageId && prefilledPackagePrice > 0) {
      return prefilledPackagePrice;
    }
    return 0;
  }

  function calcCrewSize(): number {
    if (isMoving && selectedPkgId && movingPackages.length > 0) {
      const pkg = movingPackages.find(p => p.id === selectedPkgId);
      if (pkg) return pkg.movers;
    }
    if (selectedPkgId === prefilledPackageId && prefilledCrew > 0) return prefilledCrew;
    return 2;
  }

  const addonTotal = calcAddonTotal();
  const basePrice = calcBasePackagePrice();
  const estimatedTotal = basePrice + addonTotal;
  const jcmoves = Math.floor(estimatedTotal * EARN_RATE);

  const pkgId = selectedPkgId || prefilledPackageId || null;
  const crewSize = calcCrewSize();

  function adjustQty(id: string, maxQty: number, delta: number) {
    setAddonQtys(prev => {
      const cur = prev[id] || 0;
      const next = Math.max(0, Math.min(maxQty, cur + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  }

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (media.length + files.length > 6) {
      toast({ title: "Max 6 files", description: "You can attach up to 6 photos or videos.", variant: "destructive" });
      return;
    }
    setUploading(true);
    for (const file of files) {
      try {
        const localPreview = URL.createObjectURL(file);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/leads/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }
        const data = await res.json();
        setMedia(prev => [...prev, { url: data.url, mimeType: data.mimeType, name: data.name, localPreview }]);
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }
    setUploading(false);
    if (e.target) e.target.value = "";
  };

  const removeMedia = (idx: number) => {
    setMedia(prev => {
      const copy = [...prev];
      const item = copy.splice(idx, 1)[0];
      if (item.localPreview) URL.revokeObjectURL(item.localPreview);
      return copy;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leads/marketplace", {
        firstName: user?.firstName || "Customer",
        lastName: user?.lastName || "",
        email: user?.email || "",
        phone: user?.phoneNumber || "",
        serviceType: form.serviceType,
        fromAddress: form.fromAddress,
        toAddress: form.toAddress || undefined,
        moveDate: form.moveDate || undefined,
        details: form.details || undefined,
        photos: media.map(m => ({ url: m.url, mimeType: m.mimeType, name: m.name })),
        selectedPackageId: pkgId || undefined,
        crewSize: pkgId ? crewSize : undefined,
        basePrice: estimatedTotal > 0 ? estimatedTotal.toFixed(2) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      setStep(5);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const selectedService = SERVICES.find(s => s.value === form.serviceType);
  const totalSteps = needsPackageStep ? 4 : 3;
  const displayStep = pkgStep ? 2 : step === 2 && !pkgStep ? (needsPackageStep ? 3 : 2) : step;

  function getStepLabel() {
    if (step === 1) return "Step 1 of " + totalSteps;
    if (step === 2 && pkgStep) return "Step 2 of " + totalSteps;
    if (step === 2 && !pkgStep) return "Step " + (needsPackageStep ? 3 : 2) + " of " + totalSteps;
    if (step === 3) return "Step " + (needsPackageStep ? 4 : 3) + " of " + totalSteps;
    return "";
  }

  function getProgressBars() {
    if (!needsPackageStep) return [1, 2, 3];
    return [1, 2, 3, 4];
  }

  function getCurrentBar() {
    if (step === 1) return 1;
    if (step === 2 && pkgStep) return 2;
    if (step === 2 && !pkgStep) return needsPackageStep ? 3 : 2;
    if (step === 3) return needsPackageStep ? 4 : 3;
    return 1;
  }

  function handleBack() {
    if (step === 3) { setStep(2); return; }
    if (step === 2 && !pkgStep) {
      if (cameFromPackagesPage) { setLocation("/packages"); return; }
      if (needsPackageStep) { setPkgStep(true); return; }
      setStep(1); return;
    }
    if (step === 2 && pkgStep) { setStep(1); setPkgStep(false); return; }
    setLocation("/");
  }

  if (step === 5) {
    return (
      <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 flex items-center justify-center px-6">
        <div className="max-w-[390px] w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Job Posted!</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            Your {selectedService?.label || "service"} request has been submitted. We'll match you with a crew soon.
          </p>
          {pkgId && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-center gap-2">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Package Selected</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">Your package preference has been noted for the crew</p>
            </div>
          )}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <Coins className="h-5 w-5 text-jc-orange" />
              <span className="text-lg font-black text-jc-orange">+{POST_TOKENS} JCMOVES</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">Earned for posting this job</p>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const bars = getProgressBars();
  const curBar = getCurrentBar();

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleBack}
            aria-label="Go back"
            className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-zinc-900 dark:text-white">Post a Job</h1>
            <p className="text-xs text-zinc-400">{getStepLabel()}</p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-6">
          {bars.map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= curBar ? "bg-jc-orange" : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Choose service */}
        {step === 1 && (
          <div>
            <h2 className="font-bold text-zinc-900 dark:text-white mb-4">What do you need?</h2>
            <div className="space-y-3">
              {SERVICES.map(({ value, label, sub, icon: Icon, color }) => (
                <button
                  key={value}
                  onClick={() => {
                    set("serviceType", value);
                    setSelectedPkgId(null);
                    setPkgSkipped(false);
                    setAddonQtys({});
                    if (PACKAGE_SERVICES.includes(value)) {
                      setStep(2);
                      setPkgStep(true);
                    } else {
                      setStep(2);
                      setPkgStep(false);
                    }
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                    form.serviceType === value
                      ? "border-jc-orange bg-jc-orange/5"
                      : "border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white">{label}</p>
                    <p className="text-xs text-zinc-400">{sub}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 (pkg step): Package selection */}
        {step === 2 && pkgStep && (
          <div>
            <h2 className="font-bold text-zinc-900 dark:text-white mb-1">
              {isMoving ? "Choose a Moving Package" : "Choose a Junk Package"}
            </h2>
            <p className="text-xs text-zinc-400 mb-4">Select a package or skip and let the crew decide on-site.</p>

            {/* Moving packages */}
            {isMoving && (
              <div className="space-y-2.5 mb-4">
                {movingPackages.map(pkg => {
                  const price = getMovingPrice(pkg);
                  const savings = pkg.isJc222 ? shortJobFull - jc222Price : 0;
                  const isSelected = selectedPkgId === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPkgId(isSelected ? null : pkg.id)}
                      className={cn(
                        "w-full text-left rounded-xl border-2 p-3 transition-all",
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500/30"
                          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300",
                        pkg.isJc222 && !isSelected && "border-yellow-400/50 dark:border-yellow-500/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {pkg.isJc222 && <Sparkles className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                            <span className={cn("text-sm font-bold", pkg.isJc222 ? "text-yellow-700 dark:text-yellow-300" : "text-zinc-900 dark:text-white")}>
                              {pkg.label}
                            </span>
                            {pkg.tag && (
                              <Badge className={cn(
                                "text-[10px] px-1.5 py-0 h-4 border",
                                pkg.isJc222 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-500/40" :
                                pkg.tag === "Most Popular" ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-500/40" :
                                "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                              )}>
                                {pkg.tag}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pkg.movers} movers</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.hours} hrs</span>
                          </div>
                          {pkg.isJc222 && savings > 0 && (
                            <p className="text-[11px] text-yellow-600 dark:text-yellow-400 mt-0.5">Save ${savings} — promo!</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {pkg.isJc222 ? (
                            <>
                              <p className="text-zinc-400 line-through text-xs">${shortJobFull}</p>
                              <p className="font-black text-yellow-600 dark:text-yellow-400 text-base">${jc222Price}</p>
                            </>
                          ) : (
                            <p className="font-black text-emerald-600 dark:text-emerald-400 text-base">${price.toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-1.5 flex justify-end">
                          <CheckCircle2 className="h-4 w-4 text-blue-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Junk packages */}
            {isJunk && (
              <div className="space-y-2.5 mb-4">
                {junkPackages.map(pkg => {
                  const isSelected = selectedPkgId === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPkgId(isSelected ? null : pkg.id)}
                      className={cn(
                        "w-full text-left rounded-xl border-2 p-3 transition-all",
                        isSelected
                          ? "border-jc-orange bg-orange-50 dark:bg-orange-950/30 ring-1 ring-jc-orange/30"
                          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900 dark:text-white">{pkg.label}</span>
                            {pkg.tag && (
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-500/40">
                                {pkg.tag}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{pkg.desc}</p>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">${pkg.low}–${pkg.high}</p>
                      </div>
                      {isSelected && (
                        <div className="mt-1.5 flex justify-end">
                          <CheckCircle2 className="h-4 w-4 text-jc-orange" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add-ons */}
            {(isMoving ? movingAddons : junkAddons).length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 text-sm mb-2">Add-ons (optional)</h3>
                <div className="space-y-2">
                  {(isMoving ? movingAddons : junkAddons).map(addon => {
                    const qty = addonQtys[addon.id] || 0;
                    const maxQty = Math.max(...addon.qtyOptions);
                    return (
                      <div
                        key={addon.id}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">{addon.name}</p>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">${addon.unitPrice} each</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => adjustQty(addon.id, maxQty, -1)}
                            disabled={qty === 0}
                            className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all"
                          >
                            <Minus className="h-3 w-3 text-zinc-700 dark:text-zinc-300" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold text-zinc-900 dark:text-white">{qty}</span>
                          <button
                            onClick={() => adjustQty(addon.id, maxQty, 1)}
                            disabled={qty >= maxQty}
                            className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all"
                          >
                            <Plus className="h-3 w-3 text-zinc-700 dark:text-zinc-300" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {estimatedTotal > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Estimated total</p>
                  <p className="font-black text-zinc-900 dark:text-white text-lg">${estimatedTotal.toLocaleString()}</p>
                </div>
                {jcmoves > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-jc-orange" />
                    <span className="text-sm font-bold text-jc-orange">~{jcmoves.toLocaleString()} JCMOVES</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={() => { setPkgStep(false); }}
                className="w-full h-13 rounded-2xl bg-jc-orange text-white font-bold text-base shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {selectedPkgId ? (
                  <>Continue with Package <ChevronRight className="h-4 w-4" /></>
                ) : (
                  <>Continue <ChevronRight className="h-4 w-4" /></>
                )}
              </button>
              <button
                onClick={() => { setSelectedPkgId(null); setPkgSkipped(true); setPkgStep(false); }}
                className="w-full h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 font-semibold text-sm hover:border-zinc-300 transition-all"
              >
                I'll let the crew decide
              </button>
            </div>
          </div>
        )}

        {/* Step 2 (details) or step 3 if package step happened */}
        {step === 2 && !pkgStep && (
          <div className="space-y-5">
            <h2 className="font-bold text-zinc-900 dark:text-white">Job Details</h2>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <MapPin className="h-4 w-4 inline mr-1" /> Location / Address
              </label>
              <input
                type="text"
                placeholder="123 Main St, Ironwood, MI"
                required
                value={form.fromAddress}
                onChange={e => set("fromAddress", e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
              />
            </div>

            {form.serviceType === "residential" && (
              <div>
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                  Delivery Address
                </label>
                <input
                  type="text"
                  placeholder="456 Oak Ave, Green Bay, WI"
                  value={form.toAddress}
                  onChange={e => set("toAddress", e.target.value)}
                  className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" /> Preferred Date
              </label>
              <input
                type="date"
                value={form.moveDate}
                onChange={e => set("moveDate", e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <FileText className="h-4 w-4 inline mr-1" /> Additional Notes
              </label>
              <textarea
                placeholder="Describe what you need help with..."
                rows={3}
                value={form.details}
                onChange={e => set("details", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <Camera className="h-4 w-4 inline mr-1" /> Photos / Videos
                <span className="text-zinc-400 font-normal ml-1">(optional, up to 6)</span>
              </label>

              {media.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {media.map((m, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                      {m.mimeType.startsWith("video/") ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="h-7 w-7 text-zinc-400" />
                          <span className="absolute bottom-1 left-1 text-[9px] text-zinc-500 truncate max-w-[60px]">{m.name}</span>
                        </div>
                      ) : (
                        <img src={m.localPreview || m.url} alt={m.name} className="w-full h-full object-cover" />
                      )}
                      <button
                        onClick={() => removeMedia(idx)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              {media.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-12 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400 hover:border-jc-orange hover:text-jc-orange transition-colors disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span className="text-sm font-medium">Add Photos or Videos</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (!form.fromAddress) {
                  toast({ title: "Location required", description: "Please enter a location.", variant: "destructive" });
                  return;
                }
                setStep(3);
              }}
              className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all"
            >
              Review
            </button>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-bold text-zinc-900 dark:text-white">Confirm Your Job</h2>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                {selectedService && (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedService.color}`}>
                    <selectedService.icon className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">{selectedService?.label}</p>
                  <p className="text-xs text-zinc-400">{selectedService?.sub}</p>
                </div>
              </div>

              {/* Selected package summary */}
              {pkgId && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {isMoving
                        ? (movingPackages.find(p => p.id === pkgId)?.label || pkgId)
                        : (junkPackages.find(p => p.id === pkgId)?.label || pkgId)}
                    </span>
                  </div>
                  {estimatedTotal > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 ml-6">
                      Estimated: ${estimatedTotal.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {!pkgId && needsPackageStep && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Crew will assign a package on-site
                  </p>
                </div>
              )}

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <span className="text-zinc-700 dark:text-zinc-300">{form.fromAddress}</span>
                </div>
                {form.toAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300">{form.toAddress}</span>
                  </div>
                )}
                {form.moveDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700 dark:text-zinc-300">{new Date(form.moveDate).toLocaleDateString()}</span>
                  </div>
                )}
                {form.details && (
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300">{form.details}</span>
                  </div>
                )}
                {media.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700 dark:text-zinc-300">{media.length} photo{media.length !== 1 ? "s" : ""}/video{media.length !== 1 ? "s" : ""} attached</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-jc-orange/5 border border-jc-orange/20 rounded-2xl p-4 flex items-center gap-3">
              <Coins className="h-6 w-6 text-jc-orange flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">Earn +{POST_TOKENS} JCMOVES</p>
                <p className="text-xs text-zinc-500">Tokens awarded when your job is posted</p>
              </div>
            </div>

            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {submitMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Posting...
                </span>
              ) : (
                "Submit Job"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
