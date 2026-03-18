import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapPin, Calendar, Loader2, Truck, Trash2, Snowflake, Wrench, Plus, CheckCircle, Clock, AlertCircle, Users, DollarSign, RefreshCw, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CustomerJob {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  moveDate: string;
  status: string;
  estimatedTotal: string;
  crewSize?: number | null;
  createdAt: string;
}

const SERVICE_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  residential: { icon: Truck, color: "text-blue-500", bg: "bg-blue-500/10" },
  junk: { icon: Trash2, color: "text-orange-500", bg: "bg-orange-500/10" },
  snow: { icon: Snowflake, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  handyman: { icon: Wrench, color: "text-amber-500", bg: "bg-amber-500/10" },
  cleaning: { icon: Truck, color: "text-green-500", bg: "bg-green-500/10" },
  demolition: { icon: Truck, color: "text-red-500", bg: "bg-red-500/10" },
  flooring: { icon: Truck, color: "text-stone-500", bg: "bg-stone-500/10" },
  painting: { icon: Truck, color: "text-violet-500", bg: "bg-violet-500/10" },
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

function getCustomerStatus(status: string): { label: string; cls: string } {
  switch (status) {
    case "completed": case "paid":
      return { label: "COMPLETED", cls: "bg-green-500/15 text-green-400 border border-green-500/30" };
    case "confirmed": case "accepted": case "in_progress": case "scheduled": case "activated":
      return { label: "ACCEPTED", cls: "bg-purple-500/15 text-purple-400 border border-purple-500/30" };
    case "cancelled":
      return { label: "CANCELLED", cls: "bg-red-500/15 text-red-400 border border-red-500/30" };
    default:
      return { label: "SUBMITTED", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" };
  }
}

function isReschedulable(status: string) {
  return ["quote_requested", "available", "confirmed", "accepted", "scheduled", "activated"].includes(status);
}

type Filter = "all" | "active" | "completed";

const FILTERS: { label: string; value: Filter; icon: LucideIcon }[] = [
  { label: "All", value: "all", icon: Clock },
  { label: "Active", value: "active", icon: AlertCircle },
  { label: "Done", value: "completed", icon: CheckCircle },
];

export default function MyJobsPage() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<Filter>("all");
  const { data: jobs = [], isLoading, isError, refetch } = useQuery<CustomerJob[]>({ queryKey: ["/api/leads/my-requests"], retry: 2 });

  const filtered = jobs.filter(j => {
    if (filter === "active") return !["completed", "cancelled", "paid"].includes(j.status);
    if (filter === "completed") return ["completed", "paid"].includes(j.status);
    return true;
  });

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white">My Jobs</h1>
          <button
            onClick={() => setLocation("/post-job")}
            aria-label="Post a new job"
            className="flex items-center gap-1.5 text-sm font-semibold text-jc-orange"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {FILTERS.map(f => {
            const active = filter === f.value;
            const Icon = f.icon;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  active
                    ? "bg-jc-orange text-white shadow-sm"
                    : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-jc-orange" />
          </div>
        ) : isError ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-100 dark:border-red-900/30 p-8 text-center shadow-sm">
            <Truck className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-500 font-semibold mb-1">Couldn't load your jobs</p>
            <p className="text-zinc-400 text-sm mb-4">Check your connection and try again</p>
            <button
              onClick={() => refetch()}
              className="h-10 px-6 rounded-xl bg-jc-orange text-white font-bold text-sm"
            >
              Try Again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-jc-orange/10 flex items-center justify-center mx-auto mb-4">
              <Truck className="h-8 w-8 text-jc-orange" />
            </div>
            <p className="text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
              {filter === "all" ? "No jobs yet" : `No ${filter} jobs`}
            </p>
            <p className="text-zinc-400 text-sm mb-4">
              {filter === "all" ? "Post your first job and earn JCMOVES tokens" : "Check back later or change the filter"}
            </p>
            {filter === "all" && (
              <button
                onClick={() => setLocation("/post-job")}
                className="h-11 px-6 rounded-xl bg-jc-orange text-white font-bold text-sm shadow-sm hover:bg-jc-orange/90 active:scale-[0.98] transition-all"
              >
                Post a Job
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => {
              const svc = SERVICE_ICONS[job.serviceType] || SERVICE_ICONS.residential;
              const Icon = svc.icon;
              const st = getCustomerStatus(job.status);
              const canReschedule = isReschedulable(job.status);
              const hasCost = job.estimatedTotal && parseFloat(job.estimatedTotal) > 0;

              return (
                <div
                  key={job.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden"
                >
                  {/* Card header row */}
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${svc.bg}`}>
                      <Icon className={`h-5 w-5 ${svc.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-zinc-900 dark:text-white text-sm">
                          {SERVICE_LABELS[job.serviceType] || job.serviceType}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      {job.pickupAddress && (
                        <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{job.pickupAddress}</span>
                        </div>
                      )}
                      {job.moveDate && (
                        <div className="flex items-center gap-1 text-zinc-400 text-xs">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(job.moveDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Details row — cost + crew */}
                  {(hasCost || job.crewSize) && (
                    <div className="flex items-center gap-4 px-4 pb-3 border-t border-zinc-50 dark:border-zinc-800 pt-2.5">
                      {hasCost && (
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            ${parseFloat(job.estimatedTotal).toFixed(0)}
                          </span>
                          <span className="text-xs text-zinc-400">estimated</span>
                        </div>
                      )}
                      {job.crewSize && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{job.crewSize}</span>
                          <span className="text-xs text-zinc-400">crew members</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reschedule button — only for non-terminal jobs */}
                  {canReschedule && (
                    <div className="px-4 pb-3">
                      <button
                        onClick={() => setLocation("/customer-portal?tab=jobs")}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 active:scale-[0.98] transition-all"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Request Reschedule
                        <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
