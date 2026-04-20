import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Radio, DollarSign, Briefcase, Coins, TrendingUp, Circle, Loader2,
  Users, Calendar, ChevronRight, Power, Zap, Send,
} from "lucide-react";
import type { User } from "@shared/schema";

// Task #171 — Live Dispatch page. Polls jobs + crew every 3s so operators
// can watch the feed and reassign with one click. Auto-dispatch logic is
// out of scope here; this page is the manual override surface.

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  serviceType: string;
  status: string;
  fromAddress?: string;
  confirmedDate?: string | null;
  moveDate?: string | null;
  arrivalWindow?: string | null;
  totalPrice?: string | null;
  basePrice?: string | null;
  crewMembers?: string[] | null;
  crewSize?: number | null;
  archivedAt?: string | null;
  createdAt?: string;
};

type TodayMetrics = {
  revenueToday: number;
  jobsToday: number;
  completedToday: number;
  avgTicket: number;
  jcmovesIssuedToday: number;
};

type DispatchMetrics = {
  activeOffers: number;
  pendingJobs: number;
  assignedToday: number;
  avgTimeToAssignSec: number;
  acceptRate7d: number;
  failedToday: number;
  enabled: boolean;
};

const STATUS_COLOR: Record<string, string> = {
  quote_requested: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  chatbot_pending: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  new: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  open: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  available: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  assigned: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  in_progress: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
};

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

function MetricCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string; color: string;
}) {
  return (
    <Card className="border-white/5 bg-white/[0.03]">
      <CardContent className="p-4">
        <Icon className={`h-5 w-5 ${color} mb-1.5`} />
        <p className={`text-xl font-black ${color}`}>{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function JobCard({
  lead, employees, onReassign, isReassigning,
}: {
  lead: Lead;
  employees: User[];
  onReassign: (leadId: string, crewId: string) => void;
  isReassigning: boolean;
}) {
  const assigned = Array.isArray(lead.crewMembers) ? lead.crewMembers : [];
  const primary = assigned[0];
  const primaryEmployee = primary ? employees.find(e => e.id === primary) : null;
  const total = parseFloat(lead.totalPrice || lead.basePrice || "0");
  const date = lead.confirmedDate || lead.moveDate;

  return (
    <Card className="bg-slate-800/40 border-slate-700/50 hover:border-blue-500/40 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-mono text-slate-500 bg-slate-900/70 px-1.5 py-0.5 rounded"
                title={lead.id}
                data-testid={`job-id-${lead.id}`}
              >
                #{lead.id.slice(0, 8)}
              </span>
              <p className="font-bold text-white text-sm truncate">
                {lead.firstName} {lead.lastName}
              </p>
              <Badge className={`text-[10px] border ${STATUS_COLOR[lead.status] || "bg-slate-700/50 text-slate-400"}`}>
                {lead.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              <span className="capitalize">{lead.serviceType}</span>
              {date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
              {lead.arrivalWindow && (
                <span className="text-slate-500">{lead.arrivalWindow}</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {total > 0 && (
              <p className="font-bold text-green-400 text-sm">{fmtMoney(total)}</p>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Users className="h-3 w-3 text-slate-500" />
            {primaryEmployee
              ? `${primaryEmployee.firstName || "Crew"} ${primaryEmployee.lastName?.[0] || ""}`
              : "Unassigned"}
            {assigned.length > 1 && (
              <span className="text-slate-500">+{assigned.length - 1}</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Select
              value={primary || ""}
              onValueChange={(v) => onReassign(lead.id, v)}
              disabled={isReassigning}
            >
              <SelectTrigger className="h-7 w-36 text-xs bg-slate-900/80 border-slate-700" data-testid={`select-reassign-${lead.id}`}>
                <SelectValue placeholder="Reassign…" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.firstName || "Crew"} {e.lastName?.[0] || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link href={`/lead/${lead.id}`}>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CrewStatus({
  e, jobsToday, currentJob,
}: { e: User; jobsToday: number; currentJob: Lead | null }) {
  // Minimal "online/offline" stub — we don't track presence yet, so
  // approved+active employees are shown as available. Real presence lands
  // with the Crew app (Task #173).
  const online = (e.status === "approved" || e.status === "active");
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
      <Circle className={`h-2.5 w-2.5 ${online ? "fill-green-400 text-green-400" : "fill-slate-600 text-slate-600"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">
          {e.firstName || "Crew"} {e.lastName || ""}
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
          {online ? "Available" : "Offline"} · {jobsToday} today
        </p>
        {currentJob ? (
          <p className="text-[11px] text-blue-300 mt-0.5 truncate" data-testid={`crew-current-${e.id}`}>
            <span className="font-mono text-slate-500">#{currentJob.id.slice(0, 8)}</span>
            {" · "}
            {currentJob.firstName} {currentJob.lastName}
            <span className="text-slate-500"> ({currentJob.status.replace(/_/g, " ")})</span>
          </p>
        ) : (
          <p className="text-[11px] text-slate-600 mt-0.5">No current job</p>
        )}
      </div>
    </div>
  );
}

export default function AdminDispatchPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    refetchInterval: 3000,
  });

  const { data: employees = [] } = useQuery<User[]>({
    queryKey: ["/api/employees"],
    refetchInterval: 15000,
  });

  const { data: metrics } = useQuery<TodayMetrics>({
    queryKey: ["/api/admin/today-metrics"],
    refetchInterval: 10000,
  });

  const { data: dispatchMetrics } = useQuery<DispatchMetrics>({
    queryKey: ["/api/admin/dispatch/metrics"],
    refetchInterval: 5000,
  });

  const killSwitchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/admin/dispatch/kill-switch", { enabled });
      if (!res.ok) throw new Error("Failed to toggle");
      return res.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/metrics"] });
      toast({ title: d.enabled ? "Dispatch ENABLED" : "Dispatch DISABLED" });
    },
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const manualDispatchMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", `/api/admin/jobs/${leadId}/dispatch`, {
        reason: "manual re-dispatch from admin console",
      });
      if (!res.ok) throw new Error("Failed to dispatch");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/metrics"] });
      toast({ title: "Offer loop started" });
    },
    onError: (e: Error) => toast({ title: "Dispatch failed", description: e.message, variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ leadId, crewId }: { leadId: string; crewId: string }) => {
      const res = await apiRequest("POST", `/api/admin/jobs/${leadId}/assign`, {
        crewId,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reassign");
      }
      return res.json();
    },
    onMutate: ({ leadId }) => setReassigningId(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Crew reassigned" });
    },
    onError: (e: Error) => toast({ title: "Reassign failed", description: e.message, variant: "destructive" }),
    onSettled: () => setReassigningId(null),
  });

  const activeLeads = useMemo(
    () => leads.filter(l => !l.archivedAt && l.status !== "completed" && l.status !== "cancelled")
               .slice(0, 40),
    [leads]
  );

  const { crewJobsToday, crewCurrentJob } = useMemo(() => {
    const countMap = new Map<string, number>();
    const currentMap = new Map<string, Lead>();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ACTIVE = new Set(["assigned", "in_progress", "available"]);
    for (const l of leads) {
      if (l.archivedAt) continue;
      const d = new Date(l.confirmedDate || l.moveDate || l.createdAt || 0);
      if (d >= todayStart) {
        for (const uid of l.crewMembers || []) {
          countMap.set(uid, (countMap.get(uid) || 0) + 1);
        }
      }
      if (ACTIVE.has(l.status)) {
        for (const uid of l.crewMembers || []) {
          if (!currentMap.has(uid)) currentMap.set(uid, l);
        }
      }
    }
    return { crewJobsToday: countMap, crewCurrentJob: currentMap };
  }, [leads]);

  const activeEmployees = useMemo(
    () => employees.filter(e => e.role !== "customer"),
    [employees]
  );

  const handleReassign = (leadId: string, crewId: string) => {
    reassignMutation.mutate({ leadId, crewId });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-blue-400" />
          <h1 className="text-2xl font-black text-white">Live Dispatch</h1>
          <Badge variant="outline" className="ml-2 text-xs border-green-500/40 text-green-400">
            LIVE · 3s
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <Power className={`h-4 w-4 ${dispatchMetrics?.enabled ? "text-green-400" : "text-red-400"}`} />
            <span className="text-xs text-slate-300 font-medium">
              Auto-dispatch
            </span>
            <Switch
              checked={dispatchMetrics?.enabled ?? true}
              onCheckedChange={(v) => killSwitchMutation.mutate(v)}
              disabled={killSwitchMutation.isPending}
              data-testid="toggle-dispatch-kill-switch"
            />
          </div>
        </div>
      </div>

      {/* Dispatch engine status strip */}
      <div className="mb-5 grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Active offers</p>
          <p className="text-lg font-black text-blue-300" data-testid="dispatch-active-offers">
            {dispatchMetrics?.activeOffers ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Pending jobs</p>
          <p className="text-lg font-black text-amber-300">{dispatchMetrics?.pendingJobs ?? 0}</p>
        </div>
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Assigned today</p>
          <p className="text-lg font-black text-green-300">{dispatchMetrics?.assignedToday ?? 0}</p>
        </div>
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Avg time to assign</p>
          <p className="text-lg font-black text-purple-300">
            {dispatchMetrics ? `${dispatchMetrics.avgTimeToAssignSec}s` : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Accept rate 7d</p>
          <p className="text-lg font-black text-orange-300">
            {dispatchMetrics ? `${Math.round((dispatchMetrics.acceptRate7d || 0) * 100)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard
          icon={DollarSign}
          label="Revenue Today"
          value={fmtMoney(metrics?.revenueToday ?? 0)}
          color="text-green-400"
        />
        <MetricCard
          icon={Briefcase}
          label="Jobs Today"
          value={String(metrics?.jobsToday ?? 0)}
          color="text-blue-400"
        />
        <MetricCard
          icon={Coins}
          label="JCMOVES Issued"
          value={Math.round(metrics?.jcmovesIssuedToday ?? 0).toLocaleString()}
          color="text-purple-400"
        />
        <MetricCard
          icon={TrendingUp}
          label="Avg Ticket"
          value={fmtMoney(metrics?.avgTicket ?? 0)}
          color="text-orange-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
        {/* Jobs feed */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Job Feed
            </h2>
            <span className="text-xs text-slate-500">{activeLeads.length} active</span>
          </div>
          <div className="space-y-2" data-testid="dispatch-job-feed">
            {leadsLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading jobs…
              </div>
            ) : activeLeads.length === 0 ? (
              <Card className="bg-slate-900/40 border-slate-800/60">
                <CardContent className="p-6 text-center text-slate-500 text-sm">
                  No active jobs in the queue.
                </CardContent>
              </Card>
            ) : (
              activeLeads.map(l => (
                <JobCard
                  key={l.id}
                  lead={l}
                  employees={activeEmployees}
                  onReassign={handleReassign}
                  isReassigning={reassigningId === l.id}
                />
              ))
            )}
          </div>
        </div>

        {/* Crew panel */}
        <aside>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Crew
            </h2>
            <span className="text-xs text-slate-500">{activeEmployees.length}</span>
          </div>
          <div className="space-y-2" data-testid="dispatch-crew-panel">
            {activeEmployees.length === 0 ? (
              <Card className="bg-slate-900/40 border-slate-800/60">
                <CardContent className="p-4 text-center text-slate-500 text-sm">
                  No crew on file.
                </CardContent>
              </Card>
            ) : (
              activeEmployees.map(e => (
                <CrewStatus
                  key={e.id}
                  e={e}
                  jobsToday={crewJobsToday.get(e.id) || 0}
                  currentJob={crewCurrentJob.get(e.id) || null}
                />
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
