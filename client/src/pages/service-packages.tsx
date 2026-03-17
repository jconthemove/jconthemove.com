import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Clock, Coins, CheckCircle2, Sparkles, ChevronRight,
  Truck, Trash2, Package, Minus, Plus, Star
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const EARN_RATE = 15;

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

interface Pricing {
  ratePerMoverHour: number;
  jc222Price: number;
  shortJobFull: number;
}

interface CatalogDefs {
  movingPackages: MovingPackage[];
  junkPackages: JunkPackage[];
  movingAddons: MovingAddon[];
  junkAddons: JunkAddon[];
}

type ServiceTab = "moving" | "junk";

export default function ServicePackagesPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<ServiceTab>("moving");
  const [selectedMovingPkg, setSelectedMovingPkg] = useState<string | null>(null);
  const [selectedJunkPkg, setSelectedJunkPkg] = useState<string | null>(null);
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({});

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"] });
  const { data: catalog } = useQuery<CatalogDefs>({ queryKey: ["/api/pricing/catalog-definitions"] });

  const ratePerMoverHour = pricing?.ratePerMoverHour ?? 60;
  const jc222Price = pricing?.jc222Price ?? 222;
  const shortJobFull = pricing?.shortJobFull ?? 300;

  const movingPackages = catalog?.movingPackages ?? [];
  const junkPackages = catalog?.junkPackages ?? [];
  const movingAddons = catalog?.movingAddons ?? [];
  const junkAddons = catalog?.junkAddons ?? [];

  const selectedPkg = tab === "moving" ? selectedMovingPkg : selectedJunkPkg;
  const setSelectedPkg = tab === "moving" ? setSelectedMovingPkg : setSelectedJunkPkg;

  function getMovingPrice(pkg: MovingPackage): number {
    return pkg.isJc222 ? jc222Price : pkg.movers * pkg.hours * ratePerMoverHour;
  }

  function calcAddonTotal(): number {
    const addons = tab === "moving" ? movingAddons : junkAddons;
    return addons.reduce((sum, a) => sum + (addonQtys[a.id] || 0) * a.unitPrice, 0);
  }

  function calcBasePrice(): number {
    if (tab === "moving" && selectedMovingPkg) {
      const pkg = movingPackages.find(p => p.id === selectedMovingPkg);
      return pkg ? getMovingPrice(pkg) : 0;
    }
    if (tab === "junk" && selectedJunkPkg) {
      const pkg = junkPackages.find(p => p.id === selectedJunkPkg);
      return pkg ? Math.round((pkg.low + pkg.high) / 2) : 0;
    }
    return 0;
  }

  const basePrice = calcBasePrice();
  const addonTotal = calcAddonTotal();
  const total = basePrice + addonTotal;
  const jcmoves = Math.floor(total * EARN_RATE);

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

  function handleBookPackage() {
    const pkgId = tab === "moving" ? selectedMovingPkg : selectedJunkPkg;
    const serviceType = tab === "moving" ? "residential" : "junk";
    const params = new URLSearchParams({ serviceType });
    if (pkgId) params.set("packageId", pkgId);
    if (total > 0) params.set("estimatedPrice", String(total));
    if (basePrice > 0) params.set("packagePrice", String(basePrice));
    if (addonTotal > 0) params.set("addonTotal", String(addonTotal));
    const pkg = tab === "moving"
      ? movingPackages.find(p => p.id === pkgId)
      : null;
    if (pkg) params.set("crewSize", String(pkg.movers));
    const nonZeroAddons = Object.entries(addonQtys).filter(([, qty]) => qty > 0);
    if (nonZeroAddons.length > 0) {
      params.set("addons", JSON.stringify(Object.fromEntries(nonZeroAddons)));
    }
    setLocation(`/post-job?${params.toString()}`);
  }

  const addons = tab === "moving" ? movingAddons : junkAddons;

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-32">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/")}
            className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shadow-sm"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-zinc-900 dark:text-white">Service Packages</h1>
            <p className="text-xs text-zinc-400">Choose a package or let the crew decide</p>
          </div>
        </div>

        {/* Service tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setTab("moving"); setAddonQtys({}); }}
            className={cn(
              "flex-1 h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border",
              tab === "moving"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
            )}
          >
            <Truck className="h-4 w-4" /> Moving
          </button>
          <button
            onClick={() => { setTab("junk"); setAddonQtys({}); }}
            className={cn(
              "flex-1 h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border",
              tab === "junk"
                ? "bg-jc-orange text-white border-jc-orange shadow-sm"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
            )}
          >
            <Trash2 className="h-4 w-4" /> Junk Removal
          </button>
        </div>

        {/* Moving packages */}
        {tab === "moving" && (
          <div className="space-y-3 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white text-sm">Moving Packages</h2>
            {movingPackages.map(pkg => {
              const price = getMovingPrice(pkg);
              const savings = pkg.isJc222 ? shortJobFull - jc222Price : 0;
              const isSelected = selectedMovingPkg === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedMovingPkg(isSelected ? null : pkg.id)}
                  className={cn(
                    "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                    isSelected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500/30"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600",
                    pkg.isJc222 && !isSelected && "border-yellow-400/50 dark:border-yellow-500/40 bg-gradient-to-br from-yellow-50 dark:from-yellow-950/30 to-white dark:to-zinc-900"
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
                            "text-[10px] px-1.5 py-0 h-4 border font-semibold",
                            pkg.isJc222 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-500/40" :
                            pkg.tag === "Most Popular" ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-500/40" :
                            pkg.tag === "Full Day" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/40" :
                            "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                          )}>
                            {pkg.tag}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pkg.movers} movers</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.hours} hrs</span>
                      </div>
                      {pkg.isJc222 && savings > 0 && (
                        <p className="text-[11px] text-yellow-600 dark:text-yellow-400 mt-0.5 font-medium">Save ${savings} — promo price!</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {pkg.isJc222 ? (
                        <>
                          <p className="text-zinc-400 line-through text-xs">${shortJobFull}</p>
                          <p className="font-black text-yellow-600 dark:text-yellow-400 text-lg">${jc222Price}</p>
                        </>
                      ) : (
                        <p className="font-black text-emerald-600 dark:text-emerald-400 text-lg">${price.toLocaleString()}</p>
                      )}
                      <p className="text-[10px] text-zinc-400">{EARN_RATE * price} JCMOVES</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="mt-2 flex items-center justify-end gap-1 text-blue-600 dark:text-blue-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-semibold">Selected</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Junk packages */}
        {tab === "junk" && (
          <div className="space-y-3 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white text-sm">Junk Removal Packages</h2>
            {junkPackages.map(pkg => {
              const midPrice = Math.round((pkg.low + pkg.high) / 2);
              const isSelected = selectedJunkPkg === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedJunkPkg(isSelected ? null : pkg.id)}
                  className={cn(
                    "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                    isSelected
                      ? "border-jc-orange bg-orange-50 dark:bg-orange-950/30 ring-1 ring-jc-orange/30"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">{pkg.label}</span>
                        {pkg.tag && (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-500/40 font-semibold">
                            {pkg.tag}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{pkg.desc}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-zinc-400">${pkg.low}–${pkg.high}</p>
                      <p className="text-[10px] text-zinc-400">{EARN_RATE * midPrice}+ JCMOVES</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="mt-2 flex items-center justify-end gap-1 text-jc-orange">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-semibold">Selected</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Add-ons */}
        {addons.length > 0 && (
          <div className="space-y-2 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white text-sm">Add-ons</h2>
            {addons.map(addon => {
              const qty = addonQtys[addon.id] || 0;
              const maxQty = Math.max(...addon.qtyOptions);
              return (
                <div
                  key={addon.id}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">{addon.name}</p>
                    {addon.description && (
                      <p className="text-xs text-zinc-400 leading-tight mt-0.5 truncate">{addon.description}</p>
                    )}
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
        )}

        {/* "Let crew decide" note */}
        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 mb-6 text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Not sure which package? Tap <span className="font-bold text-zinc-700 dark:text-zinc-300">"Book Without Package"</span> and let the crew assign one on-site.
          </p>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 px-4 pb-6 pt-3 z-40">
        <div className="max-w-[430px] mx-auto">
          {total > 0 && (
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-zinc-500">Estimated total</p>
                <p className="text-lg font-black text-zinc-900 dark:text-white">
                  ${total.toLocaleString()}
                  {tab === "junk" && selectedJunkPkg && <span className="text-sm font-normal text-zinc-400"> (mid-range)</span>}
                </p>
              </div>
              {jcmoves > 0 && (
                <div className="flex items-center gap-1.5 bg-jc-orange/10 border border-jc-orange/20 rounded-xl px-3 py-1.5">
                  <Coins className="h-4 w-4 text-jc-orange" />
                  <span className="text-sm font-bold text-jc-orange">~{jcmoves.toLocaleString()} JCMOVES</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setLocation("/post-job")}
              className="flex-1 h-12 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm hover:border-zinc-300 dark:hover:border-zinc-600 transition-all active:scale-95"
            >
              Skip Package
            </button>
            <button
              onClick={handleBookPackage}
              className="flex-1 h-12 rounded-xl bg-jc-orange text-white font-bold text-sm shadow-lg shadow-jc-orange/20 hover:bg-jc-orange/90 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              {selectedPkg ? (
                <>Book This Package <ChevronRight className="h-4 w-4" /></>
              ) : (
                <>Book Without Package <ChevronRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
