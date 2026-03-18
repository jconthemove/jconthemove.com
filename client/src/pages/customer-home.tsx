import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, Calendar, Coins, Loader2, Plus, Truck, Trash2, Snowflake, Wrench, Star, Shield, Zap, Users, Package, ChevronRight, ArrowRight } from "lucide-react";
import { EarnTasksButton } from "@/components/earn-tasks-button";
import { FloatingMomHeart } from "@/components/floating-mom-heart";
import type { LucideIcon } from "lucide-react";

interface JobLead {
  id: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress?: string;
  moveDate?: string;
  status: string;
  estimatedTotal?: string;
  crewSize?: number | null;
  createdAt: string;
}

const SERVICE_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  residential: { icon: Truck, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
  junk: { icon: Trash2, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
  snow: { icon: Snowflake, color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-900/20" },
  handyman: { icon: Wrench, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" },
  cleaning: { icon: Truck, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
  demolition: { icon: Truck, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
  flooring: { icon: Truck, color: "text-stone-600", bg: "bg-stone-50 dark:bg-stone-900/20" },
  painting: { icon: Truck, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
};

const SERVICE_LABELS: Record<string, string> = {
  residential: "Moving",
  junk: "Junk Removal",
  snow: "Snow Removal",
  handyman: "Handyman",
  cleaning: "Move In/Out Clean",
  demolition: "Light Demo",
  flooring: "Flooring",
  painting: "Painting",
};

const SERVICES = [
  { key: "residential", label: "Moving", desc: "House, Apartment, Furniture", icon: Truck, color: "bg-blue-500" },
  { key: "junk", label: "Junk Removal", desc: "Cleanouts, Dump Runs", icon: Trash2, color: "bg-jc-orange" },
  { key: "handyman", label: "Labor Help", desc: "Loading / Unloading", icon: Wrench, color: "bg-amber-500" },
  { key: "snow", label: "Snow Removal", desc: "Winter Services", icon: Snowflake, color: "bg-cyan-500" },
  { key: "cleaning", label: "Delivery", desc: "Heavy Item Delivery", icon: Package, color: "bg-green-500" },
];

function getCustomerStatus(status: string) {
  switch (status) {
    case "completed": case "paid": return { label: "COMPLETED", cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" };
    case "confirmed": case "accepted": case "in_progress": case "scheduled": return { label: "ACCEPTED", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" };
    case "cancelled": return { label: "CANCELLED", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" };
    default: return { label: "SUBMITTED", cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" };
  }
}

export default function CustomerHomePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: myJobsData, isLoading, isError: jobsError, refetch: refetchJobs } = useQuery<JobLead[] | { leads?: JobLead[] }>({ queryKey: ["/api/leads/my-requests"], retry: 2 });
  const { data: wallet } = useQuery<{ tokenBalance: string }>({ queryKey: ["/api/rewards/wallet"], retry: 2 });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const myJobs: JobLead[] = Array.isArray(myJobsData)
    ? myJobsData
    : ((myJobsData as any)?.leads ?? []);
  const openJobs = myJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">{greeting}</p>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white">
              {user?.firstName || "there"}
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-100 dark:border-zinc-800 shadow-sm">
            <Coins className="h-4 w-4 text-jc-orange" />
            <span className="text-sm font-bold text-zinc-900 dark:text-white">
              {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium">JCMOVES</span>
          </div>
        </div>

        {/* How It Works — compact horizontal strip near top */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 px-4 py-3 mb-4 shadow-sm">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">How It Works</p>
          <div className="flex items-center gap-1">
            {[
              { step: "1", title: "Request" },
              { step: "2", title: "Get Matched" },
              { step: "3", title: "Done & Paid" },
            ].map((s, i) => (
              <div key={s.step} className="flex items-center gap-1 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-jc-orange/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-jc-orange font-black text-[10px]">{s.step}</span>
                  </div>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{s.title}</span>
                </div>
                {i < 2 && <ArrowRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600 flex-shrink-0 ml-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Need Help Today — slim banner */}
        <div className="flex items-center justify-between bg-jc-orange/10 border border-jc-orange/20 rounded-xl px-4 py-2.5 mb-5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-jc-orange flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">Need help today?</p>
              <p className="text-[11px] text-zinc-500 leading-tight">Book a service in 30 seconds</p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/post-job")}
            className="flex-shrink-0 h-8 px-4 rounded-lg bg-jc-orange text-white font-bold text-xs shadow-sm hover:bg-jc-orange/90 active:scale-95 transition-all"
          >
            Get Quote
          </button>
        </div>

        {/* Services */}
        <h2 className="font-bold text-zinc-900 dark:text-white text-base mb-3">Our Services</h2>
        <div className="flex gap-3 overflow-x-auto pb-3 mb-3 scrollbar-hide">
          {SERVICES.map(svc => {
            const Icon = svc.icon;
            return (
              <button
                key={svc.key}
                onClick={() => setLocation("/post-job")}
                className="flex-shrink-0 w-[100px] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-3 text-center shadow-sm active:scale-95 transition-transform"
              >
                <div className={`w-10 h-10 rounded-xl ${svc.color} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white leading-tight">{svc.label}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{svc.desc}</p>
              </button>
            );
          })}
        </div>

        {/* View Packages CTA */}
        <button
          onClick={() => setLocation("/packages")}
          className="w-full flex items-center justify-between bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 px-4 py-3 mb-5 shadow-sm active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-zinc-900 dark:text-white">View Packages & Pricing</p>
              <p className="text-[11px] text-zinc-400">Browse moving & junk removal packages</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        </button>

        <div className="space-y-3 mb-5">
          <EarnTasksButton embedded />
          <FloatingMomHeart embedded />
        </div>

        {/* Recent Jobs */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-zinc-900 dark:text-white text-base">My Recent Jobs</h2>
          <button
            onClick={() => setLocation("/my-jobs")}
            className="text-xs font-semibold text-jc-orange flex items-center gap-0.5"
          >
            View All <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-jc-orange" />
          </div>
        ) : jobsError ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-100 dark:border-red-900/30 p-6 text-center shadow-sm">
            <p className="text-red-500 font-semibold text-sm mb-1">Couldn't load your jobs</p>
            <p className="text-zinc-400 text-xs mb-3">Check your connection and try again</p>
            <button onClick={() => refetchJobs()} className="h-9 px-5 rounded-xl bg-jc-orange text-white font-bold text-xs">Retry</button>
          </div>
        ) : openJobs.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-jc-orange/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-jc-orange" />
            </div>
            <p className="text-zinc-700 dark:text-zinc-300 font-semibold mb-1">No jobs posted yet</p>
            <p className="text-zinc-400 text-sm mb-4">Post your first job and earn JCMOVES tokens</p>
            <button
              onClick={() => setLocation("/post-job")}
              className="h-11 px-6 rounded-xl bg-jc-orange text-white font-bold text-sm shadow-sm hover:bg-jc-orange/90 active:scale-[0.98] transition-all"
            >
              Post a Job
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {openJobs.map(job => {
              const svc = SERVICE_ICONS[job.serviceType] || SERVICE_ICONS.residential;
              const Icon = svc.icon;
              const st = getCustomerStatus(job.status);
              return (
                <div
                  key={job.id}
                  onClick={() => setLocation("/my-jobs")}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${svc.bg}`}>
                      <Icon className={`h-5 w-5 ${svc.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-zinc-900 dark:text-white text-sm">
                          {SERVICE_LABELS[job.serviceType] || job.serviceType}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      {job.pickupAddress && (
                        <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{job.pickupAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        {job.moveDate && (
                          <div className="flex items-center gap-1 text-zinc-400 text-xs">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(job.moveDate).toLocaleDateString()}</span>
                          </div>
                        )}
                        {job.estimatedTotal && parseFloat(job.estimatedTotal) > 0 && (
                          <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                            <Coins className="h-3 w-3" />
                            <span>${parseFloat(job.estimatedTotal).toFixed(0)} est.</span>
                          </div>
                        )}
                        {job.crewSize && (
                          <div className="flex items-center gap-1 text-zinc-400 text-xs">
                            <Users className="h-3 w-3" />
                            <span>{job.crewSize} crew</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 text-center py-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="flex items-center gap-1 text-zinc-400 text-[11px]"><Shield className="h-3 w-3" /> Licensed & Insured</span>
            <span className="flex items-center gap-1 text-zinc-400 text-[11px]"><Star className="h-3 w-3" /> 5-Star Reviews</span>
            <span className="flex items-center gap-1 text-zinc-400 text-[11px]"><Zap className="h-3 w-3" /> Same-Day</span>
          </div>
          <p className="text-zinc-400 text-xs">Serving Ironwood · Hurley · Ashland · Bessemer</p>
          <p className="text-zinc-300 dark:text-zinc-600 text-[10px] mt-1">© JC ON THE MOVE</p>
        </div>
      </div>

      <button
        onClick={() => setLocation("/post-job")}
        aria-label="Post a new job"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-jc-orange text-white shadow-xl shadow-jc-orange/30 flex items-center justify-center hover:bg-jc-orange/90 active:scale-90 transition-all z-40"
      >
        <Plus className="h-7 w-7" />
      </button>
    </div>
  );
}
