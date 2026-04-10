import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, Recycle, Calendar, DollarSign, Play, Pause, XCircle, RefreshCw } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Link } from "wouter";

interface TrashSub {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  cans: number;
  bagCount: number;
  recyclingEnabled: boolean;
  serviceDayOfWeek: number;
  recyclingDayOfWeek: number | null;
  planType: string;
  weeklyBasePrice: string;
  finalMonthlyPrice: string;
  billingStatus: string;
  nextBillingDate: string | null;
  status: string;
  pauseStartDate: string | null;
  pauseEndDate: string | null;
  createdAt: string;
}

interface TrashJobRow {
  job: {
    id: string;
    subscriptionId: string;
    serviceWeekOf: string;
    isRecyclingWeek: boolean;
    cans: number;
    bagCount: number;
    jobValue: string;
    status: string;
    pulledOutAt: string | null;
    returnedAt: string | null;
    completedAt: string | null;
    photoUrl: string | null;
    notes: string | null;
  };
  sub: {
    customerName: string;
    address: string;
    serviceDayOfWeek: number;
  };
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  paused: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  scheduled: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pulled_out: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  returned: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function getWeekOf(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  return d.toISOString().split("T")[0];
}

export default function AdminTrashValetPage() {
  const { hasAdminAccess, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobWeekFilter, setJobWeekFilter] = useState(getWeekOf(0));
  const [jobStatusFilter, setJobStatusFilter] = useState("all");

  const { data: subs = [], isLoading: subsLoading } = useQuery<TrashSub[]>({
    queryKey: ["/api/trash/subscriptions", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/trash/subscriptions" : `/api/trash/subscriptions?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscriptions");
      return res.json();
    },
    enabled: !!hasAdminAccess,
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<TrashJobRow[]>({
    queryKey: ["/api/trash/jobs", jobWeekFilter, jobStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (jobWeekFilter) params.set("week", jobWeekFilter);
      if (jobStatusFilter !== "all") params.set("status", jobStatusFilter);
      const res = await fetch(`/api/trash/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    enabled: !!hasAdminAccess,
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/trash/subscriptions/${id}/pause`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trash/subscriptions"] }); toast({ title: "Subscription paused" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/trash/subscriptions/${id}/activate`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trash/subscriptions"] }); toast({ title: "Subscription activated" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/trash/subscriptions/${id}/cancel`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/trash/subscriptions"] }); toast({ title: "Subscription cancelled" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const generateWeekMutation = useMutation<{ created: number; skipped: number }, Error, string>({
    mutationFn: (targetWeek: string) =>
      apiRequest("POST", "/api/trash/generate-week", { targetWeek }).then(
        (r) => r.json() as Promise<{ created: number; skipped: number }>
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash/jobs"] });
      toast({ title: `Week generated`, description: `Created: ${data.created}, Skipped: ${data.skipped}` });
    },
    onError: () => toast({ title: "Error generating week", variant: "destructive" }),
  });

  if (authLoading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!hasAdminAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <Link href="/"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Home</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-10">
      <div className="max-w-6xl mx-auto px-4 py-6">

        <div className="flex items-center gap-3 mb-6">
          <Link href="/in-god-we-trust">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <span className="text-2xl">🗑️</span> Trash Valet Admin
            </h1>
            <p className="text-zinc-500 text-sm">Manage subscriptions and jobs</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Active Subs", value: subs.filter(s => s.status === "active").length, color: "text-emerald-400" },
            { label: "Paused", value: subs.filter(s => s.status === "paused").length, color: "text-yellow-400" },
            { label: "Cancelled", value: subs.filter(s => s.status === "cancelled").length, color: "text-red-400" },
            { label: "Monthly Revenue", value: `$${subs.filter(s => s.status === "active").reduce((sum, s) => sum + parseFloat(s.finalMonthlyPrice), 0).toFixed(0)}`, color: "text-orange-400" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="subscriptions">
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-4">
            <TabsTrigger value="subscriptions" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              Subscriptions ({subs.length})
            </TabsTrigger>
            <TabsTrigger value="jobs" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              Jobs ({jobs.length})
            </TabsTrigger>
          </TabsList>

          {/* Subscriptions Tab */}
          <TabsContent value="subscriptions">
            <div className="flex items-center gap-3 mb-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {subsLoading ? (
              <div className="text-zinc-500 text-center py-8">Loading…</div>
            ) : subs.length === 0 ? (
              <div className="text-zinc-600 text-center py-8">No subscriptions found</div>
            ) : (
              <div className="space-y-3">
                {subs.map((sub) => (
                  <Card key={sub.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-white">{sub.customerName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[sub.status] || ""}`}>
                              {sub.status}
                            </span>
                            {sub.recyclingEnabled && (
                              <span className="flex items-center gap-1 text-xs text-green-400">
                                <Recycle className="h-3 w-3" /> Recycling
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-400 text-sm">{sub.address}{sub.city ? `, ${sub.city}` : ""}{sub.state ? `, ${sub.state}` : ""}</p>
                          <div className="flex flex-wrap gap-4 mt-2 text-xs text-zinc-500">
                            <span>{sub.cans} can{sub.cans !== 1 ? "s" : ""}{sub.bagCount > 0 ? `, ${sub.bagCount} bags` : ""}</span>
                            <span>Trash: {DAY_NAMES[sub.serviceDayOfWeek] || sub.serviceDayOfWeek}s</span>
                            {sub.recyclingEnabled && sub.recyclingDayOfWeek && (
                              <span className="text-green-400">♻️ Recycling: {DAY_NAMES[sub.recyclingDayOfWeek] || sub.recyclingDayOfWeek}s</span>
                            )}
                            <span className="capitalize">{sub.planType} plan</span>
                            <span>Billing: <span className="text-zinc-400">{sub.billingStatus}</span></span>
                            {sub.nextBillingDate && (
                              <span>Next billing: <span className="text-zinc-400">{sub.nextBillingDate}</span></span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-orange-400 font-black text-xl">${parseFloat(sub.finalMonthlyPrice).toFixed(2)}</p>
                          <p className="text-zinc-600 text-xs">/month</p>
                          <p className="text-zinc-500 text-xs mt-1">Base: ${parseFloat(sub.weeklyBasePrice).toFixed(2)}/wk</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {sub.status !== "active" && (
                          <Button
                            size="sm"
                            onClick={() => activateMutation.mutate(sub.id)}
                            disabled={activateMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" /> Activate
                          </Button>
                        )}
                        {sub.status === "active" && (
                          <Button
                            size="sm"
                            onClick={() => pauseMutation.mutate(sub.id)}
                            disabled={pauseMutation.isPending}
                            className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs h-7 px-2"
                          >
                            <Pause className="h-3 w-3 mr-1" /> Pause
                          </Button>
                        )}
                        {sub.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm(`Cancel ${sub.customerName}'s subscription?`)) cancelMutation.mutate(sub.id);
                            }}
                            disabled={cancelMutation.isPending}
                            className="text-xs h-7 px-2"
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Jobs Tab */}
          <TabsContent value="jobs">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div>
                <Label className="text-xs text-zinc-500 mb-1 block">Week of</Label>
                <DatePicker
                  value={jobWeekFilter ?? undefined}
                  onChange={(v) => setJobWeekFilter(v || "")}
                  placeholder="Pick a week"
                  disablePast={false}
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500 mb-1 block">Status</Label>
                <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
                  <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="pulled_out">Pulled Out</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-5">
                <Button
                  onClick={() => generateWeekMutation.mutate(jobWeekFilter)}
                  disabled={generateWeekMutation.isPending}
                  className="bg-orange-500 hover:bg-orange-400 text-white text-sm h-9"
                >
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${generateWeekMutation.isPending ? "animate-spin" : ""}`} />
                  Generate This Week's Jobs
                </Button>
              </div>
            </div>

            {jobsLoading ? (
              <div className="text-zinc-500 text-center py-8">Loading…</div>
            ) : jobs.length === 0 ? (
              <div className="text-zinc-600 text-center py-8">
                No jobs found for this week. Use "Generate This Week's Jobs" to create them.
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(({ job, sub }) => (
                  <Card key={job.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-white">{sub.customerName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[job.status] || ""}`}>
                              {job.status.replace("_", " ")}
                            </span>
                            {job.isRecyclingWeek && (
                              <span className="flex items-center gap-1 text-xs text-green-400">
                                <Recycle className="h-3 w-3" /> Recycling Week
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-400 text-sm">{sub.address}</p>
                          <p className="text-zinc-500 text-xs mt-1">
                            Week of: {job.serviceWeekOf} · {job.cans} can{job.cans !== 1 ? "s" : ""}
                            {job.bagCount > 0 ? `, ${job.bagCount} bags` : ""}
                            {" · "}Day: {DAY_NAMES[sub.serviceDayOfWeek]}
                          </p>
                          <div className="flex gap-3 mt-1 text-xs text-zinc-600">
                            {job.pulledOutAt && <span>Pulled out: {new Date(job.pulledOutAt).toLocaleString()}</span>}
                            {job.returnedAt && <span>Returned: {new Date(job.returnedAt).toLocaleString()}</span>}
                            {job.completedAt && <span>Completed: {new Date(job.completedAt).toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-orange-400 font-bold">${parseFloat(job.jobValue).toFixed(2)}</p>
                          <p className="text-zinc-600 text-xs">job value</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
