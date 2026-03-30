import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  MapPin, Calendar, Coins, Loader2, Truck, Trash2,
  Snowflake, Wrench, ChevronRight, Plus, CheckCircle2,
  Clock, Minus, Search, ArrowLeft
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobLead {
  id: string;
  serviceType: string;
  pickupAddress: string;
  moveDate?: string;
  status: string;
  estimatedTotal?: string;
  crewSize?: number | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  residential: "Moving", junk: "Junk Removal", snow: "Snow Removal",
  handyman: "Labor Help", cleaning: "Delivery", demolition: "Demolition",
  flooring: "Flooring", painting: "Painting", custom: "Custom Job",
};

type IconMeta = { icon: LucideIcon; color: string; bg: string };
const SERVICE_ICONS: Record<string, IconMeta> = {
  residential: { icon: Truck,     color: "text-blue-500",   bg: "bg-blue-500/10"   },
  junk:        { icon: Trash2,    color: "text-orange-500", bg: "bg-orange-500/10" },
  snow:        { icon: Snowflake, color: "text-cyan-500",   bg: "bg-cyan-500/10"   },
  handyman:    { icon: Wrench,    color: "text-amber-500",  bg: "bg-amber-500/10"  },
};

function getStatusInfo(status: string) {
  switch (status) {
    case "completed": case "paid":
      return { label: "Completed", icon: CheckCircle2, cls: "text-green-400" };
    case "in_progress": case "confirmed": case "accepted": case "available": case "assigned":
      return { label: "In Progress", icon: Clock, cls: "text-blue-400" };
    case "cancelled":
      return { label: "Cancelled", icon: Clock, cls: "text-red-400" };
    default:
      return { label: "Submitted", icon: Clock, cls: "text-orange-400" };
  }
}

// ── Live Crew Beacon ──────────────────────────────────────────────────────────

function LiveCrewBeacon() {
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/crew/online"],
    refetchInterval: 10000,
  });
  const count = data?.count ?? 0;
  return (
    <div className="fixed bottom-24 right-20 z-40 flex items-center gap-2 bg-zinc-900 border border-green-500/40 rounded-full px-3 py-1.5 shadow-lg shadow-green-500/10">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
      <span className="text-xs font-semibold text-green-400">{count} Mover{count !== 1 ? "s" : ""} Online</span>
    </div>
  );
}

// ── Job Status Card (post-booking polling) ────────────────────────────────────

function JobStatusCard({ jobId, totalPrice, onDismiss }: { jobId: string; totalPrice: number; onDismiss: () => void }) {
  const { data, isLoading } = useQuery<{ status: string; crewCount: number; crewSize: number }>({
    queryKey: ["/api/jobs", jobId, "status"],
    queryFn: () => fetch(`/api/jobs/${jobId}/status`).then(r => r.json()),
    refetchInterval: 3000,
  });
  const assigned = data?.status === "assigned" && (data?.crewCount ?? 0) > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Booking Status</span>
        <button onClick={onDismiss} className="text-zinc-600 text-xs hover:text-zinc-400">Dismiss</button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Checking status…</span></div>
      ) : assigned ? (
        <div>
          <div className="flex items-center gap-2 mb-1"><span className="text-xl">🟢</span><span className="font-bold text-white">Crew Assigned!</span></div>
          <p className="text-sm text-zinc-400">{data?.crewCount} mover{(data?.crewCount ?? 1) > 1 ? "s" : ""} assigned to your job.</p>
          <p className="text-xs text-zinc-500 mt-1">We'll be in touch shortly to confirm the details.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-1"><Search className="h-5 w-5 text-orange-400 animate-pulse" /><span className="font-bold text-white">Finding crew…</span></div>
          <p className="text-sm text-zinc-400">Job submitted · Total: <span className="text-white font-semibold">${totalPrice}</span></p>
          <p className="text-xs text-zinc-500 mt-0.5">Hang tight — we're assembling your crew.</p>
        </div>
      )}
    </div>
  );
}

// ── Junk Booking Flow ─────────────────────────────────────────────────────────

const JUNK_TIERS = [
  { key: "small_pickup",  label: "Small Pickup",  price: 150,  desc: "Fits a truck bed" },
  { key: "pickup_load",   label: "Pickup Load",   price: 350,  desc: "Full pickup load" },
  { key: "trailer_load",  label: "Trailer Load",  price: 750,  desc: "Large trailer" },
  { key: "full_load",     label: "Full Load",     price: 1000, desc: "Max capacity haul" },
];

const ADD_ONS = [
  { key: "mattress", label: "Mattress",      price: 50  },
  { key: "fridge",   label: "Fridge",        price: 100 },
  { key: "gym",      label: "Gym Equipment", price: 100 },
];

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
    <div>
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-zinc-500 text-sm mb-4 hover:text-zinc-300 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Change service
      </button>

      {/* Tier cards */}
      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Choose load size</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {JUNK_TIERS.map(t => (
          <button
            key={t.key}
            onClick={() => setTier(tier === t.key ? null : t.key)}
            className={`rounded-2xl p-3 text-left border transition-all active:scale-[0.97] ${
              tier === t.key
                ? "bg-orange-500/15 border-orange-500 shadow-sm shadow-orange-500/20"
                : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
            }`}
          >
            <p className="font-bold text-white text-sm">{t.label}</p>
            <p className="text-orange-400 font-black text-base">${t.price}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{t.desc}</p>
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
                <button onClick={() => changeQty(a.key, -1)} className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 active:scale-90">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-white font-bold w-4 text-center">{addOns[a.key] || 0}</span>
                <button onClick={() => changeQty(a.key, 1)} className="w-7 h-7 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 hover:bg-orange-500/30 active:scale-90">
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
              {book.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Trash2 className="h-5 w-5" />Book Now · ${total}</>}
            </button>
            <p className="text-center text-xs text-zinc-600 mt-2">⚡ Most jobs booked in under 30 seconds</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generic "redirect to post-job" flows ─────────────────────────────────────

function GenericFlow({ label, icon: Icon, color, onBack, onCTA }: { label: string; icon: LucideIcon; color: string; onBack: () => void; onCTA: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-zinc-500 text-sm mb-4 hover:text-zinc-300 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Change service
      </button>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center mx-auto mb-4`}>
          <Icon className="h-7 w-7 text-white" />
        </div>
        <p className="font-bold text-white text-lg mb-1">{label}</p>
        <p className="text-zinc-500 text-sm mb-5">Get an instant quote and lock your spot today.</p>
        <button onClick={onCTA} className="h-11 px-8 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 active:scale-[0.97] transition-all">
          Get a Quote →
        </button>
      </div>
    </div>
  );
}

// ── Unified Service Selector ──────────────────────────────────────────────────

const SERVICES = [
  { id: "junk",        label: "🧹 Junk Removal",  sub: "Fast pickup & disposal",   icon: Trash2,    color: "bg-orange-500" },
  { id: "residential", label: "🚛 Moving Help",    sub: "Full moves & loading",     icon: Truck,     color: "bg-blue-500"   },
  { id: "handyman",    label: "💪 Labor Only",     sub: "Hourly help",              icon: Wrench,    color: "bg-amber-500"  },
  { id: "snow",        label: "❄️ Snow Removal",   sub: "Seasonal services",        icon: Snowflake, color: "bg-cyan-500"   },
];

function ServiceSelector({ user, onBooked }: { user: any; onBooked: (id: string, price: number) => void }) {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected === "junk") {
    return <JunkFlow user={user} onBooked={onBooked} onBack={() => setSelected(null)} />;
  }
  if (selected) {
    const svc = SERVICES.find(s => s.id === selected)!;
    return (
      <GenericFlow
        label={svc.label.replace(/^.{2}\s/, "")}
        icon={svc.icon}
        color={svc.color}
        onBack={() => setSelected(null)}
        onCTA={() => setLocation("/post-job")}
      />
    );
  }

  return (
    <div>
      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">What do you need?</p>
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map(svc => (
          <button
            key={svc.id}
            onClick={() => setSelected(svc.id)}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-left hover:border-zinc-700 active:scale-[0.97] transition-all"
          >
            <p className="font-bold text-white text-sm leading-tight">{svc.label}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{svc.sub}</p>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-zinc-600 mt-3">⚡ Most jobs booked in under 30 seconds</p>
    </div>
  );
}

// ── Recent Jobs ───────────────────────────────────────────────────────────────

function RecentJobs({ jobs, isLoading }: { jobs: JobLead[]; isLoading: boolean }) {
  const [, setLocation] = useLocation();
  if (!isLoading && jobs.length === 0) return null;
  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-2">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">My Jobs</h2>
        <button onClick={() => setLocation("/my-jobs")} className="text-xs text-orange-400 font-semibold flex items-center gap-0.5">
          View All <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => {
            const svc = SERVICE_ICONS[job.serviceType] || SERVICE_ICONS.residential;
            const Icon = svc.icon;
            const st = getStatusInfo(job.status);
            const StatusIcon = st.icon;
            return (
              <button
                key={job.id}
                onClick={() => setLocation("/my-jobs")}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3 hover:border-zinc-700 active:scale-[0.99] transition-all text-left"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${svc.bg}`}>
                  <Icon className={`h-5 w-5 ${svc.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm">{SERVICE_LABELS[job.serviceType] || job.serviceType}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {job.pickupAddress && (
                      <span className="flex items-center gap-1 text-zinc-500 text-xs">
                        <MapPin className="h-3 w-3" /><span className="truncate max-w-[110px]">{job.pickupAddress}</span>
                      </span>
                    )}
                    {job.moveDate && (
                      <span className="flex items-center gap-1 text-zinc-500 text-xs">
                        <Calendar className="h-3 w-3" />{new Date(job.moveDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className={`flex items-center gap-1 flex-shrink-0 ${st.cls}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">{st.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomerHomePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeBooking, setActiveBooking] = useState<{ jobId: string; totalPrice: number } | null>(null);

  const { data: myJobsData, isLoading } = useQuery<JobLead[] | { leads?: JobLead[] }>({
    queryKey: ["/api/leads/my-requests"],
    retry: 2,
  });
  const { data: wallet } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    retry: 2,
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const myJobs: JobLead[] = Array.isArray(myJobsData) ? myJobsData : ((myJobsData as any)?.leads ?? []);
  const recentJobs = [...myJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">
      <div className="max-w-[430px] mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-zinc-500 text-sm">{greeting}</p>
            <h1 className="text-2xl font-black text-white">{user?.firstName || "there"}</h1>
          </div>
          <button onClick={() => setLocation("/wallet")} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
            <Coins className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-bold text-white">{tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className="text-[10px] text-zinc-500 font-medium">JCMOVES</span>
          </button>
        </div>

        {/* Post-booking status card */}
        {activeBooking && (
          <JobStatusCard
            jobId={activeBooking.jobId}
            totalPrice={activeBooking.totalPrice}
            onDismiss={() => setActiveBooking(null)}
          />
        )}

        {/* Unified Service Selector — the booking engine */}
        <ServiceSelector user={user} onBooked={(id, price) => setActiveBooking({ jobId: id, totalPrice: price })} />

        {/* Earn strip */}
        <button
          onClick={() => setLocation("/earn")}
          className="w-full flex items-center justify-between bg-zinc-900 border border-orange-500/20 rounded-2xl px-4 py-3 mt-6 mb-4 hover:border-orange-500/40 active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <Coins className="h-5 w-5 text-orange-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">Earn JCMOVES</p>
              <p className="text-xs text-zinc-500">15 tokens per $1 spent · redeem for rewards</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-600" />
        </button>

        {/* Recent jobs */}
        <RecentJobs jobs={recentJobs} isLoading={isLoading} />

        {/* Empty state */}
        {!isLoading && recentJobs.length === 0 && !activeBooking && (
          <div className="text-center py-6">
            <p className="text-zinc-500 text-sm">Your booked jobs will appear here.</p>
          </div>
        )}

      </div>

      {/* Live crew beacon */}
      <LiveCrewBeacon />

      {/* Floating + button */}
      <button
        onClick={() => setLocation("/post-job")}
        aria-label="Book a service"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-orange-500 text-white shadow-xl shadow-orange-500/30 flex items-center justify-center hover:bg-orange-400 active:scale-90 transition-all z-40"
      >
        <Plus className="h-7 w-7" />
      </button>
    </div>
  );
}
