import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  MapPin, Calendar, Coins, Loader2, Truck, Trash2,
  Snowflake, Wrench, Package, ChevronRight, Plus, CheckCircle2, Clock, HelpCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

const SERVICES: { key: string; label: string; desc: string; icon: LucideIcon; color: string }[] = [
  { key: "residential", label: "Moving",        desc: "Home, Apartment, Furniture", icon: Truck,     color: "bg-blue-500"   },
  { key: "junk",        label: "Junk Removal",  desc: "Cleanouts, Dump Runs",       icon: Trash2,    color: "bg-orange-500" },
  { key: "handyman",    label: "Labor Help",    desc: "Loading / Unloading",        icon: Wrench,    color: "bg-amber-500"  },
  { key: "snow",        label: "Snow Removal",  desc: "Driveways, Parking Lots",    icon: Snowflake, color: "bg-cyan-500"   },
];

const SERVICE_LABELS: Record<string, string> = {
  residential: "Moving", junk: "Junk Removal", snow: "Snow Removal",
  handyman: "Labor Help", cleaning: "Delivery", demolition: "Demolition",
  flooring: "Flooring", painting: "Painting", custom: "Custom Job",
};

const SERVICE_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  residential: { icon: Truck,        color: "text-blue-500",   bg: "bg-blue-500/10"   },
  junk:        { icon: Trash2,       color: "text-orange-500", bg: "bg-orange-500/10" },
  snow:        { icon: Snowflake,    color: "text-cyan-500",   bg: "bg-cyan-500/10"   },
  handyman:    { icon: Wrench,       color: "text-amber-500",  bg: "bg-amber-500/10"  },
  cleaning:    { icon: Package,      color: "text-green-500",  bg: "bg-green-500/10"  },
  custom:      { icon: HelpCircle,   color: "text-violet-500", bg: "bg-violet-500/10" },
};

function getStatusInfo(status: string) {
  switch (status) {
    case "completed": case "paid":
      return { label: "Completed", icon: CheckCircle2, cls: "text-green-400" };
    case "in_progress": case "confirmed": case "accepted": case "available":
      return { label: "In Progress", icon: Clock, cls: "text-blue-400" };
    case "cancelled":
      return { label: "Cancelled", icon: Clock, cls: "text-red-400" };
    default:
      return { label: "Submitted", icon: Clock, cls: "text-orange-400" };
  }
}

export default function CustomerHomePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: myJobsData, isLoading } = useQuery<JobLead[] | { leads?: JobLead[] }>({
    queryKey: ["/api/leads/my-requests"],
    retry: 2,
  });
  const { data: wallet } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    retry: 2,
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const myJobs: JobLead[] = Array.isArray(myJobsData)
    ? myJobsData
    : ((myJobsData as any)?.leads ?? []);
  const recentJobs = [...myJobs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

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
          <button
            onClick={() => setLocation("/wallet")}
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
          >
            <Coins className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-bold text-white">
              {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium">JCMOVES</span>
          </button>
        </div>

        {/* Primary CTA — Post / Book a Job */}
        <button
          onClick={() => setLocation("/post-job")}
          className="w-full mb-5 py-5 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/25 flex flex-col items-center gap-1"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-6 w-6 text-white" />
            <span className="text-xl font-black text-white">Book a Service</span>
          </div>
          <span className="text-orange-100 text-sm">Get a quote in 30 seconds · Earn JCMOVES</span>
        </button>

        {/* Services 2×2 grid */}
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Services</h2>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {SERVICES.map(svc => {
            const Icon = svc.icon;
            return (
              <button
                key={svc.key}
                onClick={() => setLocation("/post-job")}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-left hover:border-zinc-700 active:scale-[0.97] transition-all"
              >
                <div className={`w-10 h-10 rounded-xl ${svc.color} flex items-center justify-center mb-3`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <p className="font-bold text-white text-sm leading-tight">{svc.label}</p>
                <p className="text-zinc-500 text-xs mt-0.5 leading-tight">{svc.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Earn strip */}
        <button
          onClick={() => setLocation("/earn")}
          className="w-full flex items-center justify-between bg-zinc-900 border border-orange-500/20 rounded-2xl px-4 py-3 mb-6 hover:border-orange-500/40 active:scale-[0.98] transition-all"
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

        {/* Recent Jobs */}
        {(isLoading || recentJobs.length > 0) && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">My Jobs</h2>
              <button
                onClick={() => setLocation("/my-jobs")}
                className="text-xs text-orange-400 font-semibold flex items-center gap-0.5"
              >
                View All <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {recentJobs.map(job => {
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
                        <p className="font-semibold text-white text-sm">
                          {SERVICE_LABELS[job.serviceType] || job.serviceType}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {job.pickupAddress && (
                            <span className="flex items-center gap-1 text-zinc-500 text-xs">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[110px]">{job.pickupAddress}</span>
                            </span>
                          )}
                          {job.moveDate && (
                            <span className="flex items-center gap-1 text-zinc-500 text-xs">
                              <Calendar className="h-3 w-3" />
                              {new Date(job.moveDate).toLocaleDateString()}
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
        )}

        {/* First-time empty state */}
        {!isLoading && recentJobs.length === 0 && (
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
              <Truck className="h-8 w-8 text-orange-400" />
            </div>
            <p className="font-bold text-white mb-1">Ready when you are</p>
            <p className="text-zinc-500 text-sm mb-5">Post your first job and earn JCMOVES tokens</p>
            <button
              onClick={() => setLocation("/post-job")}
              className="h-11 px-8 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 active:scale-[0.97] transition-all"
            >
              Book a Service
            </button>
          </div>
        )}

      </div>

      {/* Floating Book Button */}
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
