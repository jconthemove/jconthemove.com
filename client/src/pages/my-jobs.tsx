import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin, Calendar, Loader2, Truck, Trash2, Snowflake, Wrench,
  Plus, CheckCircle, Clock, AlertCircle, Users, DollarSign, X,
  Package, ChevronRight, RefreshCw, Coins, HelpCircle
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const SERVICE_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  residential: { icon: Truck,        color: "text-blue-400",   bg: "bg-blue-500/15",   label: "Moving"        },
  junk:        { icon: Trash2,       color: "text-orange-400", bg: "bg-orange-500/15", label: "Junk Removal"  },
  snow:        { icon: Snowflake,    color: "text-cyan-400",   bg: "bg-cyan-500/15",   label: "Snow Removal"  },
  handyman:    { icon: Wrench,       color: "text-amber-400",  bg: "bg-amber-500/15",  label: "Handyman"      },
  cleaning:    { icon: Package,      color: "text-green-400",  bg: "bg-green-500/15",  label: "Cleaning"      },
  demolition:  { icon: Truck,        color: "text-red-400",    bg: "bg-red-500/15",    label: "Demolition"    },
  custom:      { icon: HelpCircle,   color: "text-violet-400", bg: "bg-violet-500/15", label: "Custom Job"    },
};

function getStatus(status: string) {
  switch (status) {
    case "completed": case "paid":
      return { label: "Done",        cls: "bg-green-500/15 text-green-400",  icon: CheckCircle  };
    case "confirmed": case "accepted": case "in_progress": case "available":
      return { label: "In Progress", cls: "bg-blue-500/15 text-blue-400",    icon: Clock        };
    case "cancelled":
      return { label: "Cancelled",   cls: "bg-red-500/15 text-red-400",      icon: AlertCircle  };
    default:
      return { label: "Submitted",   cls: "bg-orange-500/15 text-orange-400", icon: Clock       };
  }
}

function JobSheet({ job, open, onClose, onNewJob }: { job: CustomerJob; open: boolean; onClose: () => void; onNewJob: () => void }) {
  const svc = SERVICE_CONFIG[job.serviceType] || SERVICE_CONFIG.residential;
  const Icon = svc.icon;
  const st = getStatus(job.status);
  const StatusIcon = st.icon;
  const hasCost = job.estimatedTotal && parseFloat(job.estimatedTotal) > 0;
  const estimatedTokens = hasCost ? Math.floor(parseFloat(job.estimatedTotal) * 15) : 0;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="bg-zinc-900 border-zinc-800 rounded-t-3xl pb-10 max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${svc.bg}`}>
              <Icon className={`h-6 w-6 ${svc.color}`} />
            </div>
            <div>
              <SheetTitle className="text-white text-lg font-black">{svc.label}</SheetTitle>
              <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>
                <StatusIcon className="h-3 w-3" />
                {st.label}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4">
          {/* Details */}
          <div className="bg-zinc-800/50 rounded-2xl p-4 space-y-3">
            {job.pickupAddress && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">From</p>
                  <p className="text-sm text-white">{job.pickupAddress}</p>
                </div>
              </div>
            )}
            {job.dropoffAddress && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">To</p>
                  <p className="text-sm text-white">{job.dropoffAddress}</p>
                </div>
              </div>
            )}
            {job.moveDate && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Date</p>
                  <p className="text-sm text-white">
                    {new Date(job.moveDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
            )}
            {job.crewSize && (
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Crew</p>
                  <p className="text-sm text-white">{job.crewSize} movers</p>
                </div>
              </div>
            )}
          </div>

          {/* Cost + tokens */}
          {hasCost && (
            <div className="flex gap-3">
              <div className="flex-1 bg-zinc-800/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <p className="text-xs text-zinc-500">Estimated</p>
                </div>
                <p className="text-xl font-black text-green-400">${parseFloat(job.estimatedTotal).toFixed(0)}</p>
              </div>
              {estimatedTokens > 0 && (
                <div className="flex-1 bg-zinc-800/50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="h-4 w-4 text-orange-400" />
                    <p className="text-xs text-zinc-500">Earn</p>
                  </div>
                  <p className="text-xl font-black text-orange-400">~{estimatedTokens.toLocaleString()}</p>
                  <p className="text-[10px] text-zinc-600">JCMOVES</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {["quote_requested", "available", "confirmed", "accepted", "new"].includes(job.status) && (
            <button className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 active:scale-[0.98] transition-all">
              <RefreshCw className="h-4 w-4" />
              Request Reschedule
            </button>
          )}

          <button
            onClick={onNewJob}
            className="w-full h-11 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm active:scale-[0.98] transition-all"
          >
            Book Another Service
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function MyJobsPage() {
  const [, setLocation] = useLocation();
  const [selectedJob, setSelectedJob] = useState<CustomerJob | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const { data: jobs = [], isLoading, isError, refetch } = useQuery<CustomerJob[]>({
    queryKey: ["/api/customer/my-leads"],
    retry: 2,
  });

  const filtered = jobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(j => {
      if (filter === "active") return !["completed", "cancelled", "paid"].includes(j.status);
      if (filter === "done") return ["completed", "paid"].includes(j.status);
      return true;
    });

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">
      <div className="max-w-[430px] mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-black text-white">My Jobs</h1>
          <button
            onClick={() => setLocation("/post-job")}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-5">
          {[
            { value: "all",    label: "All"    },
            { value: "active", label: "Active" },
            { value: "done",   label: "Done"   },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value as typeof filter)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                filter === f.value
                  ? "bg-orange-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          </div>
        ) : isError ? (
          <div className="bg-zinc-900 rounded-2xl border border-red-900/30 p-8 text-center">
            <p className="text-red-400 font-semibold mb-2">Couldn't load your jobs</p>
            <button onClick={() => refetch()} className="text-sm text-orange-400 font-semibold">Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
              <Truck className="h-8 w-8 text-orange-400" />
            </div>
            <p className="font-bold text-white mb-1">
              {filter === "all" ? "No jobs yet" : `No ${filter} jobs`}
            </p>
            <p className="text-zinc-500 text-sm mb-5">
              {filter === "all" ? "Post a job and earn JCMOVES tokens" : "Book a new service to get started"}
            </p>
            <button
              onClick={() => setLocation("/post-job")}
              className="h-11 px-8 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 active:scale-[0.97] transition-all"
            >
              Book a Service
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(job => {
              const svc = SERVICE_CONFIG[job.serviceType] || SERVICE_CONFIG.residential;
              const Icon = svc.icon;
              const st = getStatus(job.status);
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-left hover:border-zinc-700 active:scale-[0.97] transition-all"
                >
                  {/* Icon + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${svc.bg}`}>
                      <Icon className={`h-5 w-5 ${svc.color}`} />
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  {/* Service name */}
                  <p className="font-bold text-white text-sm leading-tight mb-1">{svc.label}</p>

                  {/* Date or address — one line */}
                  {job.moveDate ? (
                    <p className="text-xs text-zinc-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(job.moveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  ) : job.pickupAddress ? (
                    <p className="text-xs text-zinc-500 truncate">{job.pickupAddress}</p>
                  ) : null}

                  {/* Price if available */}
                  {job.estimatedTotal && parseFloat(job.estimatedTotal) > 0 && (
                    <p className="text-xs font-semibold text-green-400 mt-1">
                      ${parseFloat(job.estimatedTotal).toFixed(0)} est.
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-1 text-zinc-600">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="text-[10px]">View details</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedJob && (
        <JobSheet
          job={selectedJob}
          open={true}
          onClose={() => setSelectedJob(null)}
          onNewJob={() => { setSelectedJob(null); setLocation("/post-job"); }}
        />
      )}
    </div>
  );
}
