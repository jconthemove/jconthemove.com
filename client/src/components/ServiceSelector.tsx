import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Truck, Trash2, Wrench, Snowflake, ChevronRight, Clock, ArrowLeft, Loader2, Plus, Minus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Junk booking types ────────────────────────────────────────────────────────

const JUNK_TIERS = [
  { key: "small_pickup",  label: "Small Pickup",  price: 150,  desc: "Fits a truck bed",   tag: "Quick & Easy"  },
  { key: "pickup_load",   label: "Pickup Load",   price: 350,  desc: "Full pickup load",   tag: "Most Popular"  },
  { key: "trailer_load",  label: "Trailer Load",  price: 750,  desc: "Large trailer",      tag: "Full Cleanout" },
  { key: "full_load",     label: "Full Load",     price: 1000, desc: "Max capacity haul",  tag: "Best Value"    },
];

const ADD_ONS = [
  { key: "mattress", label: "Mattress",      price: 50  },
  { key: "fridge",   label: "Fridge",        price: 100 },
  { key: "gym",      label: "Gym Equipment", price: 100 },
];

// ── JunkFlow ──────────────────────────────────────────────────────────────────

function JunkFlow({ user, onBooked, onBack }: { user: any; onBooked: (id: string, price: number) => void; onBack: () => void }) {
  const { toast } = useToast();
  const [tier, setTier] = useState<string | null>(null);
  const [addOns, setAddOns] = useState<Record<string, number>>({ mattress: 0, fridge: 0, gym: 0 });
  const [address, setAddress] = useState("");

  const tierPrice = JUNK_TIERS.find(t => t.key === tier)?.price ?? 0;
  const addOnTotal = ADD_ONS.reduce((s, a) => s + (addOns[a.key] || 0) * a.price, 0);
  const total = tierPrice + addOnTotal;

  const book = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/create-junk", {
        tier, addOns, address,
        customerName: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Customer",
        phone: user?.phoneNumber || "",
        email: user?.email || "",
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Booking submitted!", description: data.message });
      onBooked(data.jobId, data.totalPrice ?? total);
    },
    onError: () => toast({ title: "Booking failed", description: "Please try again.", variant: "destructive" }),
  });

  const changeQty = (key: string, d: number) =>
    setAddOns(p => ({ ...p, [key]: Math.max(0, (p[key] || 0) + d) }));

  return (
    <div className="space-y-3">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Change service
      </button>

      {/* Tier cards */}
      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Choose load size</p>
      <div className="grid grid-cols-2 gap-2">
        {JUNK_TIERS.map(t => (
          <button
            key={t.key}
            onClick={() => setTier(tier === t.key ? null : t.key)}
            className={`relative rounded-2xl p-3 text-left border transition-all active:scale-[0.97] ${
              tier === t.key
                ? "bg-orange-500/15 border-orange-500 shadow-sm shadow-orange-500/20"
                : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
            }`}
          >
            {t.tag && (
              <span className={`absolute -top-2 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                tier === t.key ? "bg-orange-500 text-white" : "bg-zinc-700 text-zinc-300"
              }`}>
                {t.tag}
              </span>
            )}
            <p className={`font-bold text-sm mt-1 ${tier === t.key ? "text-orange-100" : "text-white"}`}>
              {t.label}
            </p>
            <p className={`font-black text-base ${tier === t.key ? "text-orange-400" : "text-zinc-300"}`}>
              ${t.price}
            </p>
            <p className={`text-xs mt-0.5 ${tier === t.key ? "text-orange-300" : "text-zinc-500"}`}>
              {t.desc}
            </p>
          </button>
        ))}
      </div>

      {/* Add-ons + checkout */}
      {tier && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Add-ons</p>

          {ADD_ONS.map(a => (
            <div key={a.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{a.label}</p>
                <p className="text-xs text-zinc-500">+${a.price} each</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => changeQty(a.key, -1)}
                  className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 active:scale-90"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-white font-bold w-4 text-center">{addOns[a.key] || 0}</span>
                <button
                  onClick={() => changeQty(a.key, 1)}
                  className="w-7 h-7 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 hover:bg-orange-500/30 active:scale-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          <div>
            <label className="text-xs text-zinc-500 font-semibold block mb-1">Pickup Address</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Main St, City, State"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm font-medium">Total</span>
              <span className="text-white font-black text-xl">${total}</span>
            </div>
            <button
              onClick={() => book.mutate()}
              disabled={book.isPending || !address.trim()}
              className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-white font-black text-base shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
            >
              {book.isPending
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <><Trash2 className="h-5 w-5" />Book Now · ${total}</>
              }
            </button>
            <p className="text-center text-xs text-zinc-600 mt-2">⚡ Most jobs booked in under 30 seconds</p>
          </div>
        </div>
      )}

      {!tier && (
        <p className="text-center text-zinc-600 text-xs">
          Final price confirmed on-site · No hidden fees
        </p>
      )}
    </div>
  );
}

// ── Coming Soon panel ─────────────────────────────────────────────────────────

function ComingSoonPanel({ service }: { service: "moving" | "labor" | "snow" }) {
  const config = {
    moving: {
      icon: Truck,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      title: "Moving Help",
      body: "Full-service moving quotes with live pricing are on the way. Use the calculator below to get an instant estimate now.",
      cta: "Get Moving Estimate",
      ctaPath: "/moving-estimator",
    },
    labor: {
      icon: Wrench,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      title: "Labor Only",
      body: "Loading, unloading, and heavy lifting — no truck needed. Booking flow coming soon.",
      cta: "Post a Job Now",
      ctaPath: "/post-job",
    },
    snow: {
      icon: Snowflake,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      title: "Snow Removal",
      body: "Residential and commercial snow plowing for driveways, walkways, and parking lots. Available seasonally.",
      cta: "Post a Job Now",
      ctaPath: "/post-job",
    },
  }[service];

  const Icon = config.icon;
  const [, setLocation] = useLocation();

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} p-5 space-y-3`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${config.color}`} />
        </div>
        <div>
          <p className="text-white font-bold">{config.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Clock className="h-3 w-3 text-zinc-500" />
            <span className="text-zinc-500 text-xs">Coming soon</span>
          </div>
        </div>
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed">{config.body}</p>
      <button
        onClick={() => setLocation(config.ctaPath)}
        className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.97] transition-all text-white text-sm font-semibold flex items-center justify-center gap-2"
      >
        {config.cta}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Service tab definitions ───────────────────────────────────────────────────

type ServiceKey = "moving" | "junk" | "labor" | "snow";

const SERVICES: {
  key: ServiceKey;
  label: string;
  icon: typeof Truck;
  color: string;
  activeBg: string;
  ring: string;
}[] = [
  { key: "moving", label: "Moving",       icon: Truck,     color: "bg-blue-500",   activeBg: "bg-blue-500/15",   ring: "ring-blue-500"   },
  { key: "junk",   label: "Junk Removal", icon: Trash2,    color: "bg-orange-500", activeBg: "bg-orange-500/15", ring: "ring-orange-500" },
  { key: "labor",  label: "Labor Only",   icon: Wrench,    color: "bg-amber-500",  activeBg: "bg-amber-500/15",  ring: "ring-amber-500"  },
  { key: "snow",   label: "Snow Removal", icon: Snowflake, color: "bg-cyan-500",   activeBg: "bg-cyan-500/15",   ring: "ring-cyan-500"   },
];

// ── ServiceSelector ───────────────────────────────────────────────────────────

interface ServiceSelectorProps {
  defaultService?: ServiceKey;
  user?: any;
  onBooked?: (id: string, price: number) => void;
}

export default function ServiceSelector({ defaultService, user, onBooked }: ServiceSelectorProps) {
  const [active, setActive] = useState<ServiceKey>(defaultService ?? "junk");

  function handleBooked(id: string, price: number) {
    onBooked?.(id, price);
  }

  return (
    <div className="space-y-4">
      {/* Service tab row */}
      <div className="grid grid-cols-4 gap-2">
        {SERVICES.map(svc => {
          const Icon = svc.icon;
          const isActive = active === svc.key;
          return (
            <button
              key={svc.key}
              onClick={() => setActive(svc.key)}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl border transition-all active:scale-[0.96] ${
                isActive
                  ? `${svc.activeBg} border-transparent ring-1 ${svc.ring}`
                  : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isActive ? svc.color : "bg-zinc-800"
              }`}>
                <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-zinc-400"}`} />
              </div>
              <span className={`text-[10px] font-bold leading-tight text-center ${
                isActive ? "text-white" : "text-zinc-500"
              }`}>
                {svc.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dynamic panel */}
      <div className="min-h-[180px]">
        {active === "junk" && (
          <JunkFlow
            user={user}
            onBooked={handleBooked}
            onBack={() => {}}
          />
        )}
        {active === "moving" && <ComingSoonPanel service="moving" />}
        {active === "labor" && <ComingSoonPanel service="labor" />}
        {active === "snow" && <ComingSoonPanel service="snow" />}
      </div>

      {/* Speed caption */}
      <p className="text-center text-zinc-600 text-xs font-medium">
        ⚡ Most jobs booked in under 30 seconds
      </p>
    </div>
  );
}
