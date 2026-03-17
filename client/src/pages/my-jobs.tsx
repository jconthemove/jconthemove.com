import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MapPin, Calendar, Loader2, Truck, Trash2, Snowflake, Wrench, Plus, CheckCircle, Clock, AlertCircle } from "lucide-react";
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

function getStatusStyle(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
    case "in_progress": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
    case "confirmed": case "accepted": case "available": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400";
    case "cancelled": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    default: return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
  }
}

function formatStatus(status: string) {
  if (status === "quote_requested") return "SUBMITTED";
  return status.replace(/_/g, " ").toUpperCase();
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
  const { data: jobs = [], isLoading } = useQuery<CustomerJob[]>({ queryKey: ["/api/leads/my-requests"] });

  const filtered = jobs.filter(j => {
    if (filter === "active") return !["completed", "cancelled"].includes(j.status);
    if (filter === "completed") return j.status === "completed";
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
              return (
                <div
                  key={job.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm active:scale-[0.99] transition-transform"
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
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatusStyle(job.status)}`}>
                          {formatStatus(job.status)}
                        </span>
                      </div>
                      {job.pickupAddress && (
                        <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{job.pickupAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        {job.moveDate && (
                          <div className="flex items-center gap-1 text-zinc-400 text-xs">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(job.moveDate).toLocaleDateString()}</span>
                          </div>
                        )}
                        {job.estimatedTotal && (
                          <div className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">
                            Est. ${job.estimatedTotal}
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
      </div>
    </div>
  );
}
