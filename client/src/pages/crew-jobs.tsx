import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  MapPin, Calendar, Coins, Loader2, Truck, Trash2, Snowflake, Wrench,
  CheckCircle, Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface JobLead {
  id: string;
  firstName: string;
  lastName: string;
  serviceType: string;
  fromAddress: string;
  toAddress?: string;
  moveDate?: string;
  status: string;
  crewSize?: number;
  tokenAllocation?: string;
  acceptedByEmployees?: string[];
}

const SERVICE_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  residential: { icon: Truck, label: "Moving", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
  junk: { icon: Trash2, label: "Junk Removal", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
  snow: { icon: Snowflake, label: "Snow Removal", color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-900/20" },
  handyman: { icon: Wrench, label: "Handyman", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" },
  cleaning: { icon: Truck, label: "Cleaning", color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
  demolition: { icon: Truck, label: "Demo", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
  flooring: { icon: Truck, label: "Flooring", color: "text-stone-600", bg: "bg-stone-50 dark:bg-stone-900/20" },
  painting: { icon: Truck, label: "Painting", color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
};

export default function CrewJobsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEmployee = user?.role === "employee" || user?.role === "admin" || user?.role === "business_owner";

  const { data: availableJobs = [], isLoading: loadingAvailable } = useQuery<JobLead[]>({
    queryKey: ["/api/leads/available"],
    enabled: isEmployee,
  });

  const { data: allLeads = [], isLoading: loadingAll } = useQuery<JobLead[]>({
    queryKey: ["/api/leads"],
    enabled: !isEmployee,
  });

  const { data: myAssigned = [] } = useQuery<JobLead[]>({
    queryKey: ["/api/leads/my-jobs"],
    enabled: isEmployee,
  });

  const acceptMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/accept`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      const rewardAmount = data?.rewardAmount || 0;
      toast({
        title: "Job Accepted!",
        description: rewardAmount > 0
          ? `You've been assigned and earned ${rewardAmount} JCMOVES tokens!`
          : "You've been assigned to this job."
      });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const jobs = isEmployee ? availableJobs : allLeads.filter(l => l.status === "available");
  const isLoading = isEmployee ? loadingAvailable : loadingAll;

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Jobs Board</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
          {isEmployee ? "Accept jobs to earn JCMOVES tokens" : "Available jobs in your area"}
        </p>

        {isEmployee && myAssigned.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white text-sm mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" /> My Accepted Jobs ({myAssigned.length})
            </h2>
            <div className="space-y-3">
              {myAssigned.map(job => {
                const svc = SERVICE_ICONS[job.serviceType] || SERVICE_ICONS.residential;
                const Icon = svc.icon;
                return (
                  <div key={job.id} className="bg-white dark:bg-zinc-900 rounded-2xl border-2 border-green-200 dark:border-green-800 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${svc.bg}`}>
                        <Icon className={`h-5 w-5 ${svc.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-white text-sm">{svc.label}</p>
                        {job.fromAddress && (
                          <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {job.fromAddress}
                          </p>
                        )}
                        {job.moveDate && (
                          <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3" /> {new Date(job.moveDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        ACCEPTED
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="font-bold text-zinc-900 dark:text-white text-sm mb-3">
          Available Jobs ({jobs.length})
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-jc-orange" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center shadow-sm">
            <Truck className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">No jobs available right now</p>
            <p className="text-zinc-400 text-sm mt-1">Check back soon for new postings</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => {
              const svc = SERVICE_ICONS[job.serviceType] || SERVICE_ICONS.residential;
              const Icon = svc.icon;
              const alreadyAccepted = job.acceptedByEmployees?.includes(user?.id || "");

              return (
                <div key={job.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${svc.bg}`}>
                      <Icon className={`h-5 w-5 ${svc.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-900 dark:text-white text-sm">{svc.label}</span>
                        {job.tokenAllocation && parseFloat(job.tokenAllocation) > 0 && (
                          <div className="flex items-center gap-1 text-jc-orange text-xs font-bold">
                            <Coins className="h-3.5 w-3.5" />
                            +{parseFloat(job.tokenAllocation).toFixed(0)}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {job.firstName} {job.lastName}
                      </p>
                      {job.fromAddress && (
                        <p className="text-xs text-zinc-400 flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{job.fromAddress}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {job.moveDate && (
                          <span className="text-xs text-zinc-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {new Date(job.moveDate).toLocaleDateString()}
                          </span>
                        )}
                        {job.crewSize && (
                          <span className="text-xs text-zinc-400 flex items-center gap-1">
                            <Users className="h-3 w-3" /> {job.crewSize} crew
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isEmployee && (
                    <button
                      onClick={() => acceptMutation.mutate(job.id)}
                      disabled={alreadyAccepted || acceptMutation.isPending}
                      className={`w-full h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                        alreadyAccepted
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-default"
                          : "bg-jc-orange text-white shadow-sm hover:bg-jc-orange/90"
                      }`}
                    >
                      {alreadyAccepted ? (
                        <span className="flex items-center justify-center gap-1.5"><CheckCircle className="h-4 w-4" /> Accepted</span>
                      ) : acceptMutation.isPending ? (
                        <span className="flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Accepting...</span>
                      ) : (
                        "Accept Job"
                      )}
                    </button>
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
