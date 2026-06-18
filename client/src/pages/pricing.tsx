import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Trash2, Snowflake, Sparkles, Wrench, HardHat, Layers, PaintBucket,
  Droplets, Leaf, RefreshCcw, Phone, ChevronDown, ChevronUp,
  CheckCircle2, ArrowRight, Users, Clock, Info, DollarSign, Zap, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface PricingConfig {
  ratePerMoverHour: number;
  truckAdd: number;
  minHours: Record<number, number>;
  jc222Price: number;
  shortJobFull: number;
}

// ── Service definitions ────────────────────────────────────────────────────────
const SERVICE_SECTIONS = [
  { id: "moving",    label: "Moving",          icon: Truck,       color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30"   },
  { id: "junk",      label: "Junk Removal",    icon: Trash2,      color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  { id: "trash",     label: "Trash Valet",     icon: RefreshCcw,  color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30"  },
  { id: "windows",   label: "Window Cleaning", icon: Droplets,    color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30"    },
  { id: "lawn",      label: "Lawn Care",       icon: Leaf,        color: "text-lime-400",   bg: "bg-lime-500/10",   border: "border-lime-500/30"   },
  { id: "snow",      label: "Snow Removal",    icon: Snowflake,   color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/30"   },
  { id: "painting",  label: "Painting",        icon: PaintBucket, color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/30"   },
  { id: "jumpstart", label: "Jump Start",       icon: Zap,         color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30"  },
  { id: "other",     label: "More Services",   icon: Wrench,      color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
];

// Task #169 — every pricing array on this page is sourced from
// @shared/pricingTables (the unified pricing-engine tables). A price change
// in that file flows to /pricing, /book, the chatbot, and admin
// pricing-calibrate automatically. No hardcoded pricing should live in
// this file.
import {
  JUNK_TIERS,
  WINDOW_TIERS,
  TRASH_PLANS,
  LAWN_PACKAGES,
  LAWN_ADDONS,
} from "@shared/pricingTables";
const JUNK_PACKAGES = JUNK_TIERS.map((t, i) => ({
  label: t.label,
  desc: `${t.loadFraction} - ${t.weightCap}`,
  low: t.price,
  high: t.price,
  popular: i === 2, // Medium remains the highlighted option
}));

const OTHER_SERVICES = [
  { icon: HardHat,    label: "Light Demo",  sub: "Tear-out, cleanout, drywall removal", href: "/book?service=demolition" },
  { icon: Layers,     label: "Flooring",    sub: "Installation & removal",              href: "/book?service=flooring"   },
  { icon: Sparkles,   label: "Move-In/Out", sub: "Cleaning & labor combo",              href: "/book?service=cleaning"   },
  { icon: Wrench,     label: "Handyman",    sub: "General repairs & odd jobs",          href: "/book?service=handyman"   },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PricingPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const { data: pricingConfig } = useQuery<PricingConfig>({
    queryKey: ["/api/pricing"],
    staleTime: 1000 * 60 * 5,
  });

  const ratePerMoverHour = pricingConfig?.ratePerMoverHour ?? 85;
  const truckAdd = pricingConfig?.truckAdd ?? 60;
  const jc222Price = pricingConfig?.jc222Price ?? 272;
  const shortJobFull = pricingConfig?.shortJobFull ?? 300;

  const movingMinHours: Record<number, number> = pricingConfig?.minHours ?? { 1: 5, 2: 4, 3: 3, 4: 2, 5: 2 };

  const toggle = (id: string) => setActiveSection(prev => prev === id ? null : id);

  const scrollTo = (id: string) => {
    toggle(id);
    setTimeout(() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">Pricing &amp; Services</h1>
            <p className="text-slate-400 text-xs mt-0.5">Transparent rates - no hidden fees</p>
          </div>
          <a href="tel:+19062859312">
            <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Call Us
            </Button>
          </a>
        </div>
      </div>

      {/* Quick-nav pills */}
      <div className="overflow-x-auto scrollbar-hide border-b border-slate-800">
        <div className="flex gap-2 px-4 py-3 min-w-max max-w-3xl mx-auto">
          {SERVICE_SECTIONS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap",
                activeSection === id
                  ? `${color} border-current bg-white/5`
                  : "text-slate-400 border-slate-700 hover:border-slate-500 hover:text-white"
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── BUNDLE DISCOUNT BADGE ───────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <Tag className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-300 font-medium">
            Bundle 2+ services and save - ask about combo pricing when you book.
          </p>
        </div>

        {/* ── MOVING ─────────────────────────────────────────────────────────── */}
        <ServiceSection
          id="moving"
          icon={Truck}
          label="Moving"
          tagline="Local & long-distance moves"
          color="text-blue-400"
          bg="bg-blue-500/10"
          border="border-blue-500/30"
          bookHref="/book?service=moving"
          bookLabel="Book a Move"
          isOpen={activeSection === "moving"}
          onToggle={() => toggle("moving")}
          badge={`From $${(ratePerMoverHour * (movingMinHours[2] ?? 4)).toLocaleString()}`}
        >
          {/* JC272 promo */}
          <div className="mb-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-yellow-300">JC272 Promo</p>
                <p className="text-xs text-yellow-500">Small move flat rate — use code <span className="font-mono font-black">JC272</span></p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-slate-400 line-through text-xs">${shortJobFull}</p>
              <p className="text-yellow-300 font-black text-xl">${jc222Price}</p>
            </div>
          </div>

          {/* Crew rate table */}
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold">Standard Rates</p>
          <div className="overflow-x-auto rounded-xl border border-slate-700 mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-slate-400 font-semibold text-xs">Crew</th>
                  <th className="px-4 py-2.5 text-slate-400 font-semibold text-xs text-right">Labor Only</th>
                  <th className="px-4 py-2.5 text-slate-400 font-semibold text-xs text-right">+Truck</th>
                  <th className="px-4 py-2.5 text-slate-400 font-semibold text-xs text-right">Min</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((movers, i) => {
                  const laborRate = movers * ratePerMoverHour;
                  const truckRate = laborRate + truckAdd;
                  const minH = movingMinHours[movers] ?? 2;
                  const isPopular = movers === 3;
                  return (
                    <tr key={movers} className={cn("border-b border-slate-800 last:border-0", isPopular && "bg-blue-500/5")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{movers} Mover{movers > 1 ? "s" : ""}</span>
                          {isPopular && <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] px-1.5">Popular</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-white font-bold">${laborRate}/hr</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-blue-300 font-bold">${truckRate}/hr</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs">{minH} hr min</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />Fully insured crew</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />Furniture wrap included</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />No hidden fees</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />Same-day available</div>
          </div>
        </ServiceSection>

        {/* ── JUNK REMOVAL ───────────────────────────────────────────────────── */}
        <ServiceSection
          id="junk"
          icon={Trash2}
          label="Junk Removal"
          tagline="Haul-away & responsible disposal"
          color="text-orange-400"
          bg="bg-orange-500/10"
          border="border-orange-500/30"
          bookHref="/book?service=junk_removal"
          bookLabel="Get Junk Quote"
          isOpen={activeSection === "junk"}
          onToggle={() => toggle("junk")}
          badge="$100 – $600+"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {JUNK_PACKAGES.map((pkg) => (
              <div
                key={pkg.label}
                className={cn(
                  "rounded-xl border p-3 relative",
                  pkg.popular ? "border-orange-500/40 bg-orange-500/5" : "border-slate-700 bg-slate-800/40"
                )}
              >
                {pkg.popular && <Badge className="absolute top-2 right-2 bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">Most Common</Badge>}
                <p className="font-bold text-white text-sm mb-0.5">{pkg.label}</p>
                <p className="text-slate-400 text-xs mb-2">{pkg.desc}</p>
                <p className={cn("font-black text-lg", pkg.popular ? "text-orange-300" : "text-white")}>
                  ${pkg.low}–${pkg.high}
                </p>
              </div>
            ))}
          </div>
          <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-3 text-xs text-slate-400 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
            <span>Price depends on volume, item type, and dump fees. Crew will confirm on-site before loading.</span>
          </div>
        </ServiceSection>

        {/* ── TRASH VALET ─────────────────────────────────────────────────────── */}
        <ServiceSection
          id="trash"
          icon={RefreshCcw}
          label="Trash Valet"
          tagline="Weekly curbside pickup — we handle it"
          color="text-green-400"
          bg="bg-green-500/10"
          border="border-green-500/30"
          bookHref="/trash-valet/book"
          bookLabel="Subscribe"
          isOpen={activeSection === "trash"}
          onToggle={() => toggle("trash")}
          badge="From $30/mo"
        >
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold">Monthly Plans</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {TRASH_PLANS.map((plan) => (
              <div key={plan.label} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                <p className="font-bold text-white text-sm">{plan.label}</p>
                {plan.mo ? (
                  <p className="text-green-400 font-black text-xl">${plan.mo}<span className="text-slate-500 text-xs font-normal">/mo</span></p>
                ) : (
                  <p className="text-green-400 font-black text-xl">Custom</p>
                )}
                <p className="text-slate-500 text-xs">{plan.perVisit}/visit</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0 mt-0.5" />$6 first can + $3 each additional</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0 mt-0.5" />Recycling pickup available (bi-weekly, same rate)</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0 mt-0.5" />We roll bins out & bring them back</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0 mt-0.5" />$30/month minimum applies</div>
          </div>
        </ServiceSection>

        {/* ── WINDOW CLEANING ─────────────────────────────────────────────────── */}
        <ServiceSection
          id="windows"
          icon={Droplets}
          label="Window Cleaning"
          tagline="Streak-free results, inside & out"
          color="text-sky-400"
          bg="bg-sky-500/10"
          border="border-sky-500/30"
          bookHref="/window-cleaning"
          bookLabel="Book Windows"
          isOpen={activeSection === "windows"}
          onToggle={() => toggle("windows")}
          badge="$5/pane"
        >
          <div className="grid grid-cols-2 gap-3 mb-4">
            {WINDOW_TIERS.map((tier) => (
              <div key={tier.label} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                <p className="font-bold text-white text-sm">{tier.label}</p>
                <p className="text-slate-400 text-xs mb-1">{tier.desc}</p>
                {tier.price ? (
                  <p className="text-sky-400 font-black text-xl">${tier.price}</p>
                ) : (
                  <p className="text-sky-400 font-black text-xl">Quote</p>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sky-400 flex-shrink-0 mt-0.5" />$5 per pane (both sides)</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sky-400 flex-shrink-0 mt-0.5" />4-window minimum booking</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sky-400 flex-shrink-0 mt-0.5" />Ladder access billed at 2× rate</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sky-400 flex-shrink-0 mt-0.5" />Screen cleaning available on request</div>
          </div>
        </ServiceSection>

        {/* ── LAWN CARE ───────────────────────────────────────────────────────── */}
        <ServiceSection
          id="lawn"
          icon={Leaf}
          label="Lawn Care"
          tagline="Mowing, trimming, cleanups & more"
          color="text-lime-400"
          bg="bg-lime-500/10"
          border="border-lime-500/30"
          bookHref="/book/lawn-care"
          bookLabel="Get Lawn Quote"
          isOpen={activeSection === "lawn"}
          onToggle={() => toggle("lawn")}
          badge="From $35"
        >
          {/* Property size header */}
          <div className="overflow-x-auto rounded-xl border border-slate-700 mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-slate-400 font-semibold text-xs">Service</th>
                  <th className="px-3 py-2.5 text-slate-400 font-semibold text-xs text-right">Small</th>
                  <th className="px-3 py-2.5 text-slate-400 font-semibold text-xs text-right">Med</th>
                  <th className="px-3 py-2.5 text-slate-400 font-semibold text-xs text-right">Large</th>
                  <th className="px-3 py-2.5 text-slate-400 font-semibold text-xs text-right">XL</th>
                </tr>
              </thead>
              <tbody>
                {LAWN_PACKAGES.map((pkg) => (
                  <tr key={pkg.label} className={cn("border-b border-slate-800 last:border-0", pkg.popular && "bg-lime-500/5")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm">{pkg.label}</span>
                        {pkg.popular && <Badge className="bg-lime-500/20 text-lime-400 border-lime-500/30 text-[10px] px-1.5">Best Value</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-white font-bold text-sm">${pkg.small}</td>
                    <td className="px-3 py-2.5 text-right text-white font-bold text-sm">${pkg.medium}</td>
                    <td className="px-3 py-2.5 text-right text-white font-bold text-sm">${pkg.large}</td>
                    <td className="px-3 py-2.5 text-right text-lime-300 font-bold text-sm">${pkg.xlarge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-slate-500 text-[11px] mb-3">Small = &lt;5k sq ft · Med = 5–10k · Large = 10–20k · XL = 20k+</p>

          <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold">Popular Add-Ons</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {LAWN_ADDONS.map((a) => (
              <div key={a.label} className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 flex items-center justify-between">
                <span className="text-white text-xs">{a.label}</span>
                <span className="text-lime-400 font-bold text-xs">+${a.price}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-lime-400 flex-shrink-0 mt-0.5" />Weekly, bi-weekly & monthly plans available</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-lime-400 flex-shrink-0 mt-0.5" />Overgrown lawns: 20–100% surcharge (condition-based)</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-lime-400 flex-shrink-0 mt-0.5" />Haul-away debris: flat +$45</div>
          </div>
        </ServiceSection>

        {/* ── SNOW REMOVAL ─────────────────────────────────────────────────────── */}
        <ServiceSection
          id="snow"
          icon={Snowflake}
          label="Snow Removal"
          tagline="Plowing, shoveling & salting"
          color="text-cyan-400"
          bg="bg-cyan-500/10"
          border="border-cyan-500/30"
          bookHref="/book?service=snow_removal"
          bookLabel="Get Snow Quote"
          isOpen={activeSection === "snow"}
          onToggle={() => toggle("snow")}
          badge="Custom Quote"
          isQuoteOnly
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { label: "Driveway Clear",  items: ["Single car", "Double wide", "With turnaround"] },
              { label: "Walkways",        items: ["Front entry", "Sidewalks", "Patio access"] },
              { label: "Commercial Lots", items: ["Parking areas", "Loading zones", "Salting"] },
              { label: "Seasonal Plans",  items: ["Per-push pricing", "Seasonal contracts", "On-call available"] },
            ].map(({ label, items }) => (
              <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                <p className="font-bold text-white text-sm mb-2">{label}</p>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <CheckCircle2 className="h-3 w-3 text-cyan-400 flex-shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <QuoteOnlyNote color="text-cyan-400" />
        </ServiceSection>

        {/* ── PAINTING ─────────────────────────────────────────────────────────── */}
        <ServiceSection
          id="painting"
          icon={PaintBucket}
          label="Painting"
          tagline="Interior & exterior — residential & commercial"
          color="text-pink-400"
          bg="bg-pink-500/10"
          border="border-pink-500/30"
          bookHref="/book?service=painting"
          bookLabel="Request Paint Quote"
          isOpen={activeSection === "painting"}
          onToggle={() => toggle("painting")}
          badge="Custom Quote"
          isQuoteOnly
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { label: "Interior Rooms", items: ["Walls, ceilings, trim", "Prep & priming included", "Single rooms to whole homes"] },
              { label: "Exterior Siding", items: ["Brush, roll, or spray", "Pressure wash prep", "Siding, trim & doors"] },
              { label: "Cabinets & Furniture", items: ["Spray or brush finish", "Prep & sanding", "Paint supplied or customer-provided"] },
              { label: "Commercial", items: ["Large-scale projects", "Offices & retail", "Multi-unit residential"] },
            ].map(({ label, items }) => (
              <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                <p className="font-bold text-white text-sm mb-2">{label}</p>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <CheckCircle2 className="h-3 w-3 text-pink-400 flex-shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <QuoteOnlyNote color="text-pink-400" />
          <DepositFineprint />
        </ServiceSection>

        {/* ── JUMP START ─────────────────────────────────────────────────────── */}
        <ServiceSection
          id="jumpstart"
          icon={Zap}
          label="Jump Start"
          tagline="Dead battery? We come to you — flat rate, no membership"
          color="text-amber-400"
          bg="bg-amber-500/10"
          border="border-amber-500/30"
          bookHref="/book?service=jumpstart"
          bookLabel="Book a Jump Start"
          isOpen={activeSection === "jumpstart"}
          onToggle={() => toggle("jumpstart")}
          badge="From $25"
        >
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold">Distance-Based Flat Rates</p>
          <div className="overflow-x-auto rounded-xl border border-slate-700 mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-slate-400 font-semibold text-xs">Distance from Service Address</th>
                  <th className="px-4 py-2.5 text-slate-400 font-semibold text-xs text-right">Flat Price</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { range: "≤ 5 miles",       price: "$25",   popular: true  },
                  { range: "5 – 15 miles",    price: "$30",   popular: false },
                  { range: "15 – 50 miles",   price: "$45",   popular: false },
                  { range: "50 – 100 miles",  price: "$150",  popular: false },
                  { range: "100+ miles",      price: "Quote", popular: false },
                ].map(({ range, price, popular }) => (
                  <tr key={range} className={cn("border-b border-slate-800 last:border-0", popular && "bg-amber-500/5")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{range}</span>
                        {popular && <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-1.5">Most Common</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-black text-lg", price === "Quote" ? "text-slate-400" : "text-amber-300")}>{price}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1.5 text-xs text-slate-400 mb-3">
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />Portable jump pack — works on most gas and diesel vehicles</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />Cars, trucks, vans, SUVs &amp; motorcycles</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />No membership or AAA required</div>
            <div className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />100+ miles: call for custom quote before booking</div>
          </div>
          <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-3 text-xs text-slate-400 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>Distance is measured from the service address. For 100+ mile requests, Darrell will confirm pricing before dispatching.</span>
          </div>
        </ServiceSection>

        {/* ── OTHER SERVICES ─────────────────────────────────────────────────── */}
        <ServiceSection
          id="other"
          icon={Wrench}
          label="More Services"
          tagline="Handyman, flooring, demo & more"
          color="text-yellow-400"
          bg="bg-yellow-500/10"
          border="border-yellow-500/30"
          isOpen={activeSection === "other"}
          onToggle={() => toggle("other")}
          badge="Quote-Based"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {OTHER_SERVICES.map(({ icon: Icon, label, sub, href }) => (
              <Link key={label} href={href} className="block">
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 hover:border-yellow-500/40 hover:bg-yellow-500/5 transition-all p-3 cursor-pointer group">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-yellow-400" />
                    <span className="font-bold text-white text-sm">{label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-500 ml-auto group-hover:text-yellow-400 transition-colors" />
                  </div>
                  <p className="text-slate-400 text-xs">{sub}</p>
                </div>
              </Link>
            ))}
          </div>
          <QuoteOnlyNote color="text-yellow-400" />
          <p className="text-[10px] text-slate-500 mt-2.5 leading-snug">
            * Flooring installations require a 50% deposit at job start to cover materials. Remaining balance due upon completion.
          </p>
        </ServiceSection>

        {/* ── PAYMENT & DEPOSIT POLICY ────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 px-5 py-4 mt-2">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Payment &amp; Deposit Policy</p>
          <p className="text-slate-500 text-xs leading-relaxed">
            <span className="text-slate-400">Estimate visits</span> - Handyman and out-of-area Painting/Flooring/Roofing estimates require a $50-$100 non-refundable deposit, credited toward your project if you book within 6 months.{" "}
            <span className="text-slate-400">Job-start</span> - Flooring, Painting, and Roofing jobs require a 50% deposit when the crew arrives; remainder is due on completion.{" "}
            <span className="text-slate-400">All other services</span> - Payment is due on completion; no deposit required.
          </p>
        </div>

        {/* ── CALL TO ACTION ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-6 text-center mt-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-orange-400" />
            <span className="font-bold text-white">Not sure which service?</span>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Our booking assistant will guide you to the right service and give you an instant estimate.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/book">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold border-0 w-full sm:w-auto">
                <DollarSign className="h-4 w-4 mr-1.5" /> Get Instant Quote
              </Button>
            </Link>
            <a href="tel:+19062859312">
              <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-800 font-bold w-full sm:w-auto">
                <Phone className="h-4 w-4 mr-1.5" /> Call Darrell
              </Button>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function ServiceSection({
  id, icon: Icon, label, tagline, color, bg, border, children,
  bookHref, bookLabel, isOpen, onToggle, badge, isQuoteOnly = false,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  tagline: string;
  color: string;
  bg: string;
  border: string;
  children?: React.ReactNode;
  bookHref?: string;
  bookLabel?: string;
  isOpen: boolean;
  onToggle: () => void;
  badge?: string;
  isQuoteOnly?: boolean;
}) {
  return (
    <div id={`section-${id}`} className={cn("rounded-2xl border transition-all duration-200", isOpen ? `${border} bg-slate-800/60` : "border-slate-700/60 bg-slate-800/30 hover:border-slate-600")}>
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-4 text-left"
        onClick={onToggle}
      >
        <div className={cn("p-2 rounded-xl flex-shrink-0", isOpen ? `${bg} ${border} border` : "bg-slate-800 border border-slate-700")}>
          <Icon className={cn("h-5 w-5", isOpen ? color : "text-slate-400")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-bold text-base", isOpen ? "text-white" : "text-slate-200")}>{label}</p>
          <p className="text-slate-500 text-xs truncate">{tagline}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {badge && (
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", isOpen ? `${color} ${border} ${bg}` : "text-slate-400 border-slate-700 bg-slate-800")}>
              {badge}
            </span>
          )}
          {isOpen
            ? <ChevronUp className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />
          }
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4">
          <div className="border-t border-slate-700/50 pt-4">
            {children}
            {bookHref && bookLabel && (
              <Link href={bookHref}>
                <Button className={cn("w-full mt-4 font-bold border-0", isQuoteOnly ? "bg-slate-700 hover:bg-slate-600 text-white" : `${bg.replace("/10", "")} hover:opacity-90 text-white`)}>
                  {isQuoteOnly ? <><Phone className="h-4 w-4 mr-1.5" /> {bookLabel}</> : <><ArrowRight className="h-4 w-4 mr-1.5" /> {bookLabel}</>}
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteOnlyNote({ color }: { color: string }) {
  return (
    <div className="flex items-start gap-2 bg-slate-900/60 border border-slate-700 rounded-xl p-3 text-xs text-slate-400">
      <Info className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", color)} />
      <span>
        Pricing varies by project scope. Tap <span className="text-white font-semibold">Get Quote</span> or call us - we'll give you a free, no-pressure estimate within 24 hours.
      </span>
    </div>
  );
}

function DepositFineprint() {
  return (
    <p className="text-[10px] text-slate-500 mt-2.5 leading-snug">
      * A 50% deposit is collected at job start to secure materials and scheduling. Remaining balance due upon completion.
    </p>
  );
}
