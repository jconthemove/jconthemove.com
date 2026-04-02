import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Users, Clock, DollarSign, Truck, Package2, Zap, AlertTriangle,
  CheckCircle2, Star, ShoppingCart, ChevronDown, ChevronUp,
  Wrench, Sofa, Navigation
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Pricing {
  ratePerMoverHour: number;
  shortJobRate: number;
  shortJobFull: number;
  jc222Price: number;
  driveSpeedMph: number;
  junkSmallLow: number;
  junkSmallHigh: number;
  junkLargeLow: number;
  junkLargeHigh: number;
  customItems: { id: string; name: string; value: number }[];
  junkAddons: { id: string; name: string; value: number }[];
}

interface Lead {
  serviceType: string;
  fromAddress?: string;
  confirmedFromAddress?: string;
  toAddress?: string;
  confirmedToAddress?: string;
  basePrice?: string;
  totalPrice?: string;
  crewSize?: number;
  quoteNotes?: string;
  hasHotTub?: boolean;
  hotTubFee?: string;
  hasHeavySafe?: boolean;
  heavySafeFee?: string;
  hasPoolTable?: boolean;
  poolTableFee?: string;
  hasPiano?: boolean;
  pianoFee?: string;
}

interface OrderPackage {
  movers: number;
  hours: number;
  label: string;
  tag?: string;
}

interface LineItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  category: string;
}

interface OrderSummary {
  laborTotal: number;
  addonsTotal: number;
  grandTotal: number;
  crewSize: number;
  confirmedHours: number;
  lineItems: LineItem[];
  packageLabel: string;
  tokenEstimate: number;
}

// Hour-based discount tiers
const HOUR_TIERS = [
  { minHours: 7, pct: 20 },
  { minHours: 5, pct: 15 },
  { minHours: 3, pct: 10 },
];

function getHourDiscount(hours: number): number {
  return HOUR_TIERS.find(t => hours >= t.minHours)?.pct ?? 0;
}

interface JobOrderBuilderProps {
  lead: Lead;
  leadId?: string;
  disabled?: boolean;
  onApply: (summary: {
    basePrice: string;
    totalPrice: string;
    crewSize: number;
    quoteNotes: string;
    confirmedHours: number;
    hasHotTub: boolean;
    hotTubFee: string;
    hasHeavySafe: boolean;
    heavySafeFee: string;
    hasPoolTable: boolean;
    poolTableFee: string;
    hasPiano: boolean;
    pianoFee: string;
    totalSpecialItemsFee: string;
    lineItems: LineItem[];
  }) => void;
}

const MOVING_PACKAGES: { id: string; movers: number; hours: number; label: string; tag?: string }[] = [
  { id: "moving_2m_2h", movers: 2, hours: 2, label: "2 Movers × 2 hrs",  tag: "Quick Job"      },
  { id: "moving_2m_3h", movers: 2, hours: 3, label: "2 Movers × 3 hrs",  tag: "10% Off"        },
  { id: "moving_3m_3h", movers: 3, hours: 3, label: "3 Movers × 3 hrs",  tag: "Most Popular"   },
  { id: "moving_2m_4h", movers: 2, hours: 4, label: "2 Movers × 4 hrs"                         },
  { id: "moving_3m_4h", movers: 3, hours: 4, label: "3 Movers × 4 hrs"                         },
  { id: "moving_4m_3h", movers: 4, hours: 3, label: "4 Movers × 3 hrs",  tag: "10% Off"        },
  { id: "moving_4m_4h", movers: 4, hours: 4, label: "4 Movers × 4 hrs",  tag: "Heavy Move"     },
  { id: "moving_2m_5h", movers: 2, hours: 5, label: "2 Movers × 5 hrs",  tag: "15% Off"        },
  { id: "moving_3m_5h", movers: 3, hours: 5, label: "3 Movers × 5 hrs",  tag: "15% Off"        },
  { id: "moving_2m_7h", movers: 2, hours: 7, label: "2 Movers × 7 hrs",  tag: "20% Off · Best" },
  { id: "moving_3m_7h", movers: 3, hours: 7, label: "3 Movers × 7 hrs",  tag: "20% Off"        },
];

const MOVING_ADDONS = [
  { id: "mattress_bag", name: "Mattress Bag(s)", description: "Protect mattresses during transport", unitPrice: 20, category: "supplies", qtyOptions: [1, 2, 3, 4] },
  { id: "wardrobe_boxes", name: "Wardrobe Boxes", description: "Keep clothes on hangers during move", unitPrice: 25, category: "supplies", qtyOptions: [1, 2, 3, 4] },
  { id: "packing_supplies", name: "Packing Tape & Supplies", description: "Tape, wrap, and moving blankets", unitPrice: 40, category: "supplies", qtyOptions: [1] },
  { id: "long_carry", name: "Long Carry (>75 ft)", description: "Extra charge when elevator/distance exceeds 75 ft", unitPrice: 50, category: "access", qtyOptions: [1] },
  { id: "stairs", name: "Stairs / Flights", description: "+$25 per additional floor above ground", unitPrice: 25, category: "access", qtyOptions: [1, 2, 3, 4] },
  { id: "elevator", name: "Elevator Fee", description: "Building elevator usage/waiting time", unitPrice: 30, category: "access", qtyOptions: [1] },
  { id: "assembly", name: "Furniture Assembly/Disassembly", description: "Beds, desks, and large furniture", unitPrice: 75, category: "labor", qtyOptions: [1] },
  { id: "appliance_connect", name: "Appliance Connection", description: "Washer, dryer, fridge water line hookup", unitPrice: 50, category: "labor", qtyOptions: [1] },
];

const MOVING_SPECIAL_ITEMS = [
  { id: "hot_tub", name: "Hot Tub", description: "Specialty rigging required", baseFee: 250, key: "hasHotTub" as const, feeKey: "hotTubFee" as const },
  { id: "piano", name: "Piano", description: "Upright or grand piano move", baseFee: 200, key: "hasPiano" as const, feeKey: "pianoFee" as const },
  { id: "heavy_safe", name: "Heavy Safe (300+ lbs)", description: "Gun safe or floor safe", baseFee: 175, key: "hasHeavySafe" as const, feeKey: "heavySafeFee" as const },
  { id: "pool_table", name: "Pool Table", description: "Disassemble, move, and reassemble", baseFee: 200, key: "hasPoolTable" as const, feeKey: "poolTableFee" as const },
];

const JUNK_PACKAGES = [
  { id: "junk_single_item", label: "Single Item",     desc: "1–2 large items · up to $300 for pickup truck load", low: 100, high: 200,  tag: "Quick" },
  { id: "junk_quarter",     label: "¼ Truck Load",    desc: "Small cleanout",                                     low: 300, high: 500 },
  { id: "junk_half",        label: "½ Truck Load",    desc: "One room / garage cleanout",                         low: 500, high: 800,  tag: "Popular" },
  { id: "junk_full",        label: "Full Truck Load", desc: "Estate cleanout / full demo",                        low: 1000, high: 0,   tag: "Best Value" },
];

const JUNK_ADDONS = [
  { id: "appliance_recycle", name: "Appliance Recycling Fee",     description: "Proper disposal of fridges, ACs, TVs",         unitPrice: 75,  openPrice: false, qtyOptions: [1, 2, 3] },
  { id: "hazmat",            name: "Hazardous Surcharge",         description: "Paint, batteries, chemicals — quoted on site",  unitPrice: 300, openPrice: true,  qtyOptions: [1] },
  { id: "extra_labor",       name: "Extra Labor Hour",            description: "$70/hr per mover · applies when job has stairs", unitPrice: 70,  openPrice: false, qtyOptions: [1, 2] },
  { id: "dumpster_bag",      name: "Cleanout Dumpster Bag",       description: "Handles up to 2,000 lbs",                      unitPrice: 400, openPrice: false, qtyOptions: [1, 2] },
  { id: "teardown",          name: "Light Demolition / Teardown", description: "Starting price · haul away billed separately",  unitPrice: 500, openPrice: true,  qtyOptions: [1] },
];

const EARN_RATE = 15; // JCMOVES per $1

function PackageCard({ pkg, selected, pricing, onSelect }: {
  pkg: typeof MOVING_PACKAGES[0];
  selected: boolean;
  pricing: Pricing;
  onSelect: () => void;
}) {
  const base = pkg.movers * pkg.hours * pricing.ratePerMoverHour;
  const floored = base < pricing.shortJobFull ? pricing.shortJobFull : base;
  const discountPct = getHourDiscount(pkg.hours);
  const labor = discountPct > 0 ? Math.round(floored * (1 - discountPct / 100)) : floored;
  const savings = floored - labor;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border-2 p-3 transition-all",
        selected
          ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/40"
          : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white">{pkg.label}</span>
            {discountPct > 0 && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 border bg-green-600/20 text-green-400 border-green-500/30">
                {discountPct}% Off
              </Badge>
            )}
            {!discountPct && pkg.tag && (
              <Badge className={cn(
                "text-[10px] px-1.5 py-0 h-4 border",
                pkg.tag === "Most Popular" ? "bg-teal-600/30 text-teal-300 border-teal-500/40" :
                "bg-slate-700/50 text-slate-400 border-slate-600/40"
              )}>
                {pkg.tag}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pkg.movers} movers</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.hours} hrs</span>
          </div>
          {savings > 0 && (
            <p className="text-[11px] text-green-400/80 mt-0.5">Save ${savings}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {savings > 0 && (
            <p className="text-slate-500 line-through text-xs">${floored}</p>
          )}
          <p className="font-bold text-emerald-400 text-base">${labor.toLocaleString()}</p>
        </div>
      </div>
      {selected && (
        <div className="mt-2 flex justify-end">
          <CheckCircle2 className="h-4 w-4 text-blue-400" />
        </div>
      )}
    </button>
  );
}

function JunkPackageCard({ pkg, selected, onSelect }: {
  pkg: typeof JUNK_PACKAGES[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border-2 p-3 transition-all",
        selected
          ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/40"
          : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{pkg.label}</span>
            {pkg.tag && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-teal-600/30 text-teal-300 border border-teal-500/40">
                {pkg.tag}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{pkg.desc}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-500">
            {pkg.high > 0 ? `$${pkg.low.toLocaleString()}–$${pkg.high.toLocaleString()}` : `$${pkg.low.toLocaleString()}+`}
          </p>
        </div>
      </div>
      {selected && <div className="mt-2 flex justify-end"><CheckCircle2 className="h-4 w-4 text-blue-400" /></div>}
    </button>
  );
}

export function JobOrderBuilder({ lead, leadId, disabled, onApply }: JobOrderBuilderProps) {
  const isMoving = !["junk", "junk_removal"].includes(lead.serviceType?.toLowerCase() ?? "");
  const isJunk = !isMoving;

  const { data: pricing, isLoading: pricingLoading } = useQuery<Pricing>({
    queryKey: ["/api/pricing"],
  });

  const { data: catalogDefs } = useQuery<{
    movingPackages: typeof MOVING_PACKAGES;
    junkPackages: typeof JUNK_PACKAGES;
    movingAddons: typeof MOVING_ADDONS;
    junkAddons: typeof JUNK_ADDONS;
    specialItems: typeof MOVING_SPECIAL_ITEMS;
  }>({ queryKey: ["/api/pricing/catalog-definitions"] });

  const movingPackages = catalogDefs?.movingPackages ?? MOVING_PACKAGES;
  const junkPackages = catalogDefs?.junkPackages ?? JUNK_PACKAGES;
  const movingAddons = catalogDefs?.movingAddons ?? MOVING_ADDONS;
  const junkAddons = catalogDefs?.junkAddons ?? JUNK_ADDONS;
  const specialItemsDefs = catalogDefs?.specialItems ?? MOVING_SPECIAL_ITEMS;

  const [selectedPkg, setSelectedPkg] = useState<number | null>(null);
  const [selectedJunkPkg, setSelectedJunkPkg] = useState<number | null>(null);
  const [junkCustomPrice, setJunkCustomPrice] = useState("");

  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [specialItems, setSpecialItems] = useState<Record<string, boolean>>({
    hasHotTub: lead.hasHotTub ?? false,
    hasPiano: lead.hasPiano ?? false,
    hasHeavySafe: lead.hasHeavySafe ?? false,
    hasPoolTable: lead.hasPoolTable ?? false,
  });
  const [specialFees, setSpecialFees] = useState<Record<string, number>>({
    hotTubFee: parseFloat(lead.hotTubFee ?? "0") || 250,
    pianoFee: parseFloat(lead.pianoFee ?? "0") || 200,
    heavySafeFee: parseFloat(lead.heavySafeFee ?? "0") || 175,
    poolTableFee: parseFloat(lead.poolTableFee ?? "0") || 200,
  });

  const [driveMiles, setDriveMiles] = useState<string>("");
  const [driveAutoCalc, setDriveAutoCalc] = useState(false);

  const [quoteNotes, setQuoteNotes] = useState(lead.quoteNotes ?? "");
  const [showAddons, setShowAddons] = useState(true);

  const pickupAddr = lead.confirmedFromAddress || lead.fromAddress;
  const dropoffAddr = lead.confirmedToAddress || lead.toAddress;

  useEffect(() => {
    if (!pickupAddr || driveMiles) return;
    const params = new URLSearchParams({ pickup: pickupAddr });
    if (dropoffAddr) params.set("dropoff", dropoffAddr);
    fetch(`/api/utility/estimate-drive-miles?${params}`)
      .then(r => r.json())
      .then((data: { miles?: number; route?: string }) => {
        if (data.miles && data.miles > 0) {
          setDriveMiles(String(data.miles));
          setDriveAutoCalc(true);
        }
      })
      .catch(() => {});
  }, [pickupAddr, dropoffAddr]);

  useEffect(() => {
    if (pricing && !selectedPkg && !selectedJunkPkg) {
      if (isMoving && lead.crewSize && lead.basePrice) {
        const hours = Math.round(parseFloat(lead.basePrice) / (pricing.ratePerMoverHour * (lead.crewSize ?? 2)));
        const idx = movingPackages.findIndex(p => p.movers === lead.crewSize && p.hours === hours);
        if (idx >= 0) setSelectedPkg(idx);
      }
    }
  }, [pricing, lead.crewSize, lead.basePrice, isMoving, movingPackages]);

  const driveLineItem = useMemo((): LineItem | null => {
    const miles = parseFloat(driveMiles);
    if (!miles || miles <= 0 || !pricing) return null;
    const DRIVE_RATE = 40; // $40/hr/mover
    const crewSize = selectedPkg !== null ? movingPackages[selectedPkg]?.movers ?? 2 : 2;
    const roundTripMiles = miles * 2;
    const driveHours = Math.ceil(roundTripMiles / (pricing.driveSpeedMph || 45) * 2) / 2; // round to 0.5
    const fee = Math.round(driveHours * crewSize * DRIVE_RATE);
    return {
      id: "drive_time",
      name: `Drive Time — ${miles} mi × 2 (round trip) ÷ ${pricing.driveSpeedMph || 45}mph × ${crewSize} movers @ $${DRIVE_RATE}/hr`,
      qty: 1,
      unitPrice: fee,
      total: fee,
      category: "drive",
    };
  }, [driveMiles, pricing, selectedPkg]);

  const summary = useMemo((): OrderSummary | null => {
    if (!pricing) return null;

    const lineItems: LineItem[] = [];

    if (isMoving) {
      if (selectedPkg === null) return null;
      const pkg = movingPackages[selectedPkg];
      const base = pkg.movers * pkg.hours * pricing.ratePerMoverHour;
      const floored = base < pricing.shortJobFull ? pricing.shortJobFull : base;
      const discountPct = getHourDiscount(pkg.hours);
      const laborTotal = discountPct > 0 ? Math.round(floored * (1 - discountPct / 100)) : floored;
      const laborLabel = discountPct > 0
        ? `Labor — ${pkg.movers} Movers × ${pkg.hours} hrs (${discountPct}% off)`
        : `Labor — ${pkg.movers} Movers × ${pkg.hours} hrs @ $${pricing.ratePerMoverHour}/mover/hr`;

      lineItems.push({
        id: pkg.id,
        name: laborLabel,
        qty: 1,
        unitPrice: laborTotal,
        total: laborTotal,
        category: "labor",
      });

      if (driveLineItem) lineItems.push(driveLineItem);

      movingAddons.forEach(addon => {
        const qty = addonQty[addon.id] ?? 0;
        if (qty > 0) {
          lineItems.push({
            id: addon.id,
            name: addon.name,
            qty,
            unitPrice: addon.unitPrice,
            total: addon.unitPrice * qty,
            category: addon.category,
          });
        }
      });

      specialItemsDefs.forEach(item => {
        if (specialItems[item.key]) {
          const fee = specialFees[item.feeKey] ?? item.baseFee;
          lineItems.push({
            id: item.id,
            name: `${item.name} (specialty move)`,
            qty: 1,
            unitPrice: fee,
            total: fee,
            category: "specialty",
          });
        }
      });

      const grandTotal = lineItems.reduce((s, i) => s + i.total, 0);
      const addonsTotal = grandTotal - laborTotal;

      return {
        laborTotal,
        addonsTotal,
        grandTotal,
        crewSize: pkg.movers,
        confirmedHours: pkg.hours,
        lineItems,
        packageLabel: pkg.label,
        tokenEstimate: Math.round(grandTotal * EARN_RATE),
      };
    }

    if (isJunk) {
      let laborTotal = 0;
      let packageLabel = "Junk Removal";
      if (selectedJunkPkg !== null) {
        const pkg = junkPackages[selectedJunkPkg];
        laborTotal = parseFloat(junkCustomPrice) || Math.round((pkg.low + pkg.high) / 2);
        packageLabel = pkg.label;
        lineItems.push({
          id: pkg.id,
          name: `Junk Removal — ${pkg.label}`,
          qty: 1,
          unitPrice: laborTotal,
          total: laborTotal,
          category: "labor",
        });
      } else if (junkCustomPrice) {
        laborTotal = parseFloat(junkCustomPrice) || 0;
        lineItems.push({
          id: "junk_custom",
          name: "Junk Removal — Custom",
          qty: 1,
          unitPrice: laborTotal,
          total: laborTotal,
          category: "labor",
        });
      } else {
        return null;
      }

      if (driveLineItem) lineItems.push(driveLineItem);

      junkAddons.forEach(addon => {
        const qty = addonQty[addon.id] ?? 0;
        if (qty > 0) {
          lineItems.push({
            id: addon.id,
            name: addon.name,
            qty,
            unitPrice: addon.unitPrice,
            total: addon.unitPrice * qty,
            category: "addon",
          });
        }
      });

      const grandTotal = lineItems.reduce((s, i) => s + i.total, 0);
      const addonsTotal = grandTotal - laborTotal;

      return {
        laborTotal,
        addonsTotal,
        grandTotal,
        crewSize: 2,
        confirmedHours: 2,
        lineItems,
        packageLabel,
        tokenEstimate: Math.round(grandTotal * EARN_RATE),
      };
    }

    return null;
  }, [pricing, selectedPkg, selectedJunkPkg, addonQty, specialItems, specialFees, junkCustomPrice, isMoving, isJunk, driveLineItem, movingPackages, junkPackages, movingAddons, junkAddons, specialItemsDefs]);

  const handleApply = async () => {
    if (!summary) return;

    const specialItemsFee = specialItemsDefs.reduce((acc, item) => {
      return acc + (specialItems[item.key] ? (specialFees[item.feeKey] ?? item.baseFee) : 0);
    }, 0);

    const orderNotes = [
      quoteNotes,
      "",
      "=== ORDER SUMMARY ===",
      ...summary.lineItems.map(li => `• ${li.name} × ${li.qty} = $${li.total.toFixed(2)}`),
      `TOTAL: $${summary.grandTotal.toFixed(2)}`,
      `Token Reward Est.: ${summary.tokenEstimate.toLocaleString()} JCMOVES`,
    ].filter(Boolean).join("\n");

    onApply({
      basePrice: summary.laborTotal.toFixed(2),
      totalPrice: summary.grandTotal.toFixed(2),
      crewSize: summary.crewSize,
      confirmedHours: summary.confirmedHours,
      quoteNotes: orderNotes,
      hasHotTub: specialItems.hasHotTub ?? false,
      hotTubFee: (specialFees.hotTubFee ?? 250).toFixed(2),
      hasHeavySafe: specialItems.hasHeavySafe ?? false,
      heavySafeFee: (specialFees.heavySafeFee ?? 175).toFixed(2),
      hasPoolTable: specialItems.hasPoolTable ?? false,
      poolTableFee: (specialFees.poolTableFee ?? 200).toFixed(2),
      hasPiano: specialItems.hasPiano ?? false,
      pianoFee: (specialFees.pianoFee ?? 200).toFixed(2),
      totalSpecialItemsFee: specialItemsFee.toFixed(2),
      lineItems: summary.lineItems,
    });

    // Immediately create a Square Order (non-blocking, best-effort)
    if (leadId) {
      try {
        await fetch(`/api/square/create-order/${leadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineItems: summary.lineItems }),
          credentials: "include",
        });
      } catch (_) {
        // Non-fatal: order totals already saved to lead locally
      }
    }
  };

  if (pricingLoading) {
    return (
      <Card className="border-slate-700/50 bg-slate-900/60">
        <CardContent className="pt-6 text-center text-slate-400 text-sm py-8">
          Loading pricing data…
        </CardContent>
      </Card>
    );
  }

  if (!pricing) return null;

  const activeAddons = isMoving ? movingAddons : junkAddons;

  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-slate-900/80 to-slate-800/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white">
          <ShoppingCart className="h-5 w-5 text-blue-400" />
          Build Your Order
        </CardTitle>
        <CardDescription>
          {isMoving ? "Select a crew package and add any services" : "Choose a load size and add-ons"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── Step 1: Package Selection ── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Step 1: Choose Package
          </p>

          {isMoving && (
            <>
              {/* Hour-based discount tiers */}
              <div className="mb-3 flex gap-1.5">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                  <p className="text-green-400 font-black text-xs">10% Off</p>
                  <p className="text-slate-500 text-[10px]">3+ hrs</p>
                </div>
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                  <p className="text-green-400 font-black text-xs">15% Off</p>
                  <p className="text-slate-500 text-[10px]">5+ hrs</p>
                </div>
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                  <p className="text-green-400 font-black text-xs">20% Off</p>
                  <p className="text-slate-500 text-[10px]">7+ hrs</p>
                </div>
              </div>
              <div className="space-y-2">
                {movingPackages.map((pkg, i) => (
                  <PackageCard
                    key={i}
                    pkg={pkg}
                    selected={selectedPkg === i}
                    pricing={pricing}
                    onSelect={() => setSelectedPkg(i)}
                  />
                ))}
              </div>
            </>
          )}

          {isJunk && (
            <div className="space-y-2">
              {junkPackages.map((pkg, i) => (
                <JunkPackageCard
                  key={i}
                  pkg={pkg}
                  selected={selectedJunkPkg === i}
                  onSelect={() => { setSelectedJunkPkg(i); setJunkCustomPrice(""); }}
                />
              ))}
              <div className="mt-2">
                <Label className="text-xs text-slate-400">Or enter custom price</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    type="number"
                    step="5"
                    min="0"
                    placeholder="e.g. 350"
                    className="pl-9 bg-slate-800 border-slate-600 text-white"
                    value={junkCustomPrice}
                    onChange={(e) => { setJunkCustomPrice(e.target.value); setSelectedJunkPkg(null); }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator className="bg-slate-700/50" />

        {/* ── Drive Time ── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-blue-400" /> Drive Time (optional)
            {driveAutoCalc && driveMiles && (
              <span className="ml-1 text-[10px] bg-blue-950/60 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                auto-estimated
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="One-way miles from Ironwood, MI"
                className="bg-slate-800 border-slate-600 text-white pr-12"
                value={driveMiles}
                onChange={e => { setDriveMiles(e.target.value); setDriveAutoCalc(false); }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">mi</span>
            </div>
            {driveLineItem && (
              <div className="flex-shrink-0 text-right">
                <p className="text-emerald-400 font-bold text-sm">${driveLineItem.total}</p>
                <p className="text-slate-500 text-[10px]">drive fee</p>
              </div>
            )}
          </div>
          {driveLineItem && (
            <p className="text-[11px] text-slate-500 mt-1">
              {driveMiles} mi × 2 (round trip) ÷ {pricing.driveSpeedMph || 45}mph × {driveLineItem.name.match(/(\d+) movers/)?.[1] || "?"} movers @ $40/hr
            </p>
          )}
          {!driveMiles && pickupAddr && (
            <p className="text-[11px] text-slate-600 mt-1">Estimating from: {pickupAddr}</p>
          )}
        </div>

        <Separator className="bg-slate-700/50" />

        {/* ── Step 2: Add-Ons ── */}
        <div>
          <button
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5"
            onClick={() => setShowAddons(!showAddons)}
          >
            <span className="flex items-center gap-1.5">
              <Package2 className="h-3.5 w-3.5" /> Step 2: Add Services & Supplies
            </span>
            {showAddons ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showAddons && (
            <div className="space-y-2">
              {activeAddons.map(addon => {
                const qty = addonQty[addon.id] ?? 0;
                const checked = qty > 0;
                return (
                  <div
                    key={addon.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                      checked
                        ? "border-blue-500/40 bg-blue-950/20"
                        : "border-slate-700/40 bg-slate-800/30 hover:bg-slate-800/60"
                    )}
                    onClick={() => setAddonQty(prev => ({ ...prev, [addon.id]: checked ? 0 : 1 }))}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => setAddonQty(prev => ({ ...prev, [addon.id]: v ? 1 : 0 }))}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-medium", checked ? "text-white" : "text-slate-300")}>
                          {addon.name}
                        </span>
                        <span className="text-emerald-400 text-sm font-semibold flex-shrink-0">
                          +${addon.unitPrice}{'openPrice' in addon && addon.openPrice ? "+" : ""}{addon.qtyOptions.length > 1 && qty > 0 ? ` × ${qty}` : ""}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{addon.description}</p>
                    </div>
                    {checked && addon.qtyOptions.length > 1 && (
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="w-6 h-6 rounded bg-slate-700 text-white text-xs hover:bg-slate-600"
                          onClick={() => setAddonQty(prev => ({ ...prev, [addon.id]: Math.max(1, (prev[addon.id] ?? 1) - 1) }))}
                        >-</button>
                        <span className="text-sm text-white w-4 text-center">{qty}</span>
                        <button
                          className="w-6 h-6 rounded bg-slate-700 text-white text-xs hover:bg-slate-600"
                          onClick={() => setAddonQty(prev => ({ ...prev, [addon.id]: Math.min(addon.qtyOptions[addon.qtyOptions.length - 1], (prev[addon.id] ?? 1) + 1) }))}
                        >+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Step 3: Special/Heavy Items (Moving only) ── */}
        {isMoving && (
          <>
            <Separator className="bg-slate-700/50" />
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Specialty / Heavy Items
              </p>
              <div className="space-y-2">
                {specialItemsDefs.map(item => {
                  const checked = specialItems[item.key] ?? false;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                        checked
                          ? "border-amber-500/40 bg-amber-950/20"
                          : "border-slate-700/40 bg-slate-800/30 hover:bg-slate-800/60"
                      )}
                      onClick={() => setSpecialItems(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => setSpecialItems(prev => ({ ...prev, [item.key]: !!v }))}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-sm font-medium", checked ? "text-white" : "text-slate-300")}>
                            {item.name}
                          </span>
                          <span className="text-amber-400 text-sm font-semibold flex-shrink-0">
                            +${specialFees[item.feeKey] ?? item.baseFee}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                      </div>
                      {checked && (
                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                          <Input
                            type="number"
                            min="0"
                            step="25"
                            className="w-20 h-7 text-xs bg-slate-700 border-slate-600 text-white"
                            value={specialFees[item.feeKey] ?? item.baseFee}
                            onChange={(e) => setSpecialFees(prev => ({ ...prev, [item.feeKey]: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <Separator className="bg-slate-700/50" />

        {/* ── Quote Notes ── */}
        <div>
          <Label className="text-xs text-slate-400 uppercase tracking-wide">Quote Notes</Label>
          <Textarea
            rows={3}
            placeholder="Add job-specific notes, arrival instructions, access codes, etc."
            className="mt-1.5 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm resize-none"
            value={quoteNotes}
            onChange={(e) => setQuoteNotes(e.target.value)}
          />
        </div>

        {/* ── Running Total ── */}
        {summary && (
          <div className="rounded-xl border border-slate-600/50 bg-slate-800/50 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-700/50 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Order Summary</span>
              <Badge className="bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[10px]">
                {summary.lineItems.length} item{summary.lineItems.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              {summary.lineItems.map(li => (
                <div key={li.id} className="flex justify-between text-sm">
                  <span className="text-slate-300">
                    {li.name}{li.qty > 1 && ` × ${li.qty}`}
                  </span>
                  <span className="text-slate-200 font-medium">${li.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-slate-600/50 space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Labor subtotal</span>
                <span>${summary.laborTotal.toFixed(2)}</span>
              </div>
              {summary.addonsTotal > 0 && (
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Add-ons</span>
                  <span>+${summary.addonsTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-600/50">
                <span className="text-white">Total</span>
                <span className="text-emerald-400">${summary.grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-amber-400/80 mt-1">
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Customer earns</span>
                <span>~{summary.tokenEstimate.toLocaleString()} JCMOVES</span>
              </div>
            </div>
          </div>
        )}

        {!summary && (
          <div className="p-4 rounded-xl border border-dashed border-slate-600/50 text-center text-slate-500 text-sm">
            Select a package above to see your order total
          </div>
        )}

        <Button
          onClick={handleApply}
          disabled={!summary || disabled}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          size="lg"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Apply Order to Job
        </Button>
      </CardContent>
    </Card>
  );
}
