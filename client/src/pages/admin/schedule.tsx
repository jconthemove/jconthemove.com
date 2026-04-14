import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft, ChevronRight, Calendar, Mail, CheckCircle2,
  Users, Clock, MapPin, ArrowLeft, Truck, Trash2, Wrench,
  Snowflake, Wind, Scissors, Package, AlertCircle
} from "lucide-react";

interface ScheduledJob {
  id: number;
  orderNumber: string | null;
  customerName: string;
  serviceType: string;
  date: string;
  arrivalWindow: string | null;
  location: string | null;
  confirmedHours: number | null;
  status: string;
  crewIds: string[];
  crewNames: string[];
  crewSize: number;
  dispatchSentAt: string | null;
  dispatchNotes: string | null;
  quoteNotes: string | null;
}

const SERVICE_ICONS: Record<string, any> = {
  moving: Truck,
  junk_removal: Trash2,
  handyman: Wrench,
  snow_removal: Snowflake,
  window_cleaning: Wind,
  lawn_care: Scissors,
  assembly: Package,
  labor: Users,
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  available: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  quote_requested: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function getWeekDays(anchorDate: Date): Date[] {
  const start = new Date(anchorDate);
  const dow = start.getDay();
  start.setDate(start.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function serviceLabel(type: string): string {
  const map: Record<string, string> = {
    moving: "Moving", junk_removal: "Junk Removal", handyman: "Handyman",
    snow_removal: "Snow", window_cleaning: "Window Wash", lawn_care: "Lawn",
    assembly: "Assembly", labor: "Labor", cleaning: "Cleaning",
    trash_valet: "Trash Valet",
  };
  return map[type] || type;
}

function extractCity(address: string | null): string {
  if (!address) return "";
  const parts = address.split(",").map(p => p.trim());
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[0];
  return address.slice(0, 20);
}

export default function AdminSchedulePage() {
  const { toast } = useToast();
  const [anchor, setAnchor] = useState(() => new Date());
  const [dispatchingId, setDispatchingId] = useState<number | null>(null);

  const days = getWeekDays(anchor);
  const today = dateKey(new Date());

  const { data: jobs = [], isLoading } = useQuery<ScheduledJob[]>({
    queryKey: ["/api/admin/schedule"],
    refetchInterval: 60000,
  });

  const dispatchMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setDispatchingId(jobId);
      const res = await apiRequest("POST", `/api/admin/leads/${jobId}/dispatch`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Dispatch failed");
      }
      return res.json();
    },
    onSuccess: (data, jobId) => {
      setDispatchingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schedule"] });
      if (data.sentCount > 0) {
        toast({ title: `✅ Sent to ${data.sentCount} crew member${data.sentCount !== 1 ? "s" : ""}` });
      } else {
        toast({ title: "No emails sent", description: "Check crew has emails on file.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      setDispatchingId(null);
      toast({ title: "Dispatch failed", description: err.message, variant: "destructive" });
    },
  });

  function prevWeek() {
    setAnchor(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }
  function nextWeek() {
    setAnchor(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }
  function thisWeek() { setAnchor(new Date()); }

  const jobsByDay: Record<string, ScheduledJob[]> = {};
  for (const job of jobs) {
    const key = job.date?.slice(0, 10);
    if (!key) continue;
    if (!jobsByDay[key]) jobsByDay[key] = [];
    jobsByDay[key].push(job);
  }

  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const totalThisWeek = days.reduce((sum, d) => sum + (jobsByDay[dateKey(d)]?.length || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Job Schedule</h1>
          </div>
          <Badge variant="outline" className="ml-auto">{totalThisWeek} job{totalThisWeek !== 1 ? "s" : ""} this week</Badge>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Week navigation */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={thisWeek}>Today</Button>
          <Button variant="outline" size="icon" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm font-medium text-muted-foreground">{weekLabel}</span>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading schedule…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {days.map(day => {
              const key = dateKey(day);
              const isToday = key === today;
              const dayJobs = jobsByDay[key] || [];
              return (
                <div key={key} className={`rounded-xl border ${isToday ? "border-primary ring-2 ring-primary/20" : "border-border"} bg-card overflow-hidden`}>
                  {/* Day header */}
                  <div className={`px-3 py-2 text-center ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
                    <div className="text-xs font-semibold uppercase tracking-wide">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                    <div className={`text-lg font-bold ${isToday ? "" : "text-foreground"}`}>{day.getDate()}</div>
                    <div className="text-xs opacity-70">{day.toLocaleDateString("en-US", { month: "short" })}</div>
                    {dayJobs.length > 0 && (
                      <Badge variant="secondary" className="mt-1 text-xs">{dayJobs.length}</Badge>
                    )}
                  </div>

                  {/* Job cards */}
                  <div className="p-2 space-y-2">
                    {dayJobs.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">No jobs</div>
                    ) : dayJobs.map(job => {
                      const Icon = SERVICE_ICONS[job.serviceType] || Truck;
                      const isDispatched = !!job.dispatchSentAt;
                      const crewFull = job.crewIds.length >= job.crewSize;
                      const isDispatchingThis = dispatchingId === job.id;
                      const city = extractCity(job.location);

                      return (
                        <div key={job.id} className="rounded-lg border border-border bg-background p-2.5 space-y-2 text-xs">
                          {/* Service + status */}
                          <div className="flex items-start gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{serviceLabel(job.serviceType)}</div>
                              {job.orderNumber && <div className="text-muted-foreground">{job.orderNumber}</div>}
                            </div>
                            <Badge className={`text-[10px] px-1 py-0 shrink-0 ${STATUS_COLORS[job.status] || ""}`}>
                              {job.status}
                            </Badge>
                          </div>

                          {/* Customer + location */}
                          <div className="text-muted-foreground space-y-0.5">
                            <div className="font-medium text-foreground">{job.customerName}</div>
                            {city && <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{city}</div>}
                            {job.arrivalWindow && <div className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{job.arrivalWindow}</div>}
                            {job.confirmedHours && <div>{job.confirmedHours}h · ${(job.confirmedHours * 85).toLocaleString()}/crew</div>}
                          </div>

                          {/* Crew */}
                          <div className="flex items-center gap-1 flex-wrap">
                            <Users className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                            {job.crewNames.length > 0
                              ? job.crewNames.map((n, i) => (
                                <span key={i} className="bg-muted rounded px-1 py-0.5">{n}</span>
                              ))
                              : <span className="text-orange-500">No crew</span>
                            }
                            {!crewFull && job.crewIds.length > 0 && (
                              <span className="text-orange-400">({job.crewIds.length}/{job.crewSize})</span>
                            )}
                          </div>

                          {/* Dispatch status + button */}
                          <div className="space-y-1">
                            {isDispatched && (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Dispatched {new Date(job.dispatchSentAt!).toLocaleDateString()}</span>
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant={isDispatched ? "outline" : "default"}
                              className={`w-full h-6 text-[10px] gap-1 ${!isDispatched && job.crewIds.length > 0 ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                              disabled={isDispatchingThis || job.crewIds.length === 0}
                              onClick={() => dispatchMutation.mutate(job.id)}
                            >
                              {isDispatchingThis ? (
                                <span>Sending…</span>
                              ) : job.crewIds.length === 0 ? (
                                <><AlertCircle className="h-3 w-3" /> No crew</>
                              ) : isDispatched ? (
                                <><Mail className="h-3 w-3" /> Resend</>
                              ) : (
                                <><Mail className="h-3 w-3" /> Dispatch</>
                              )}
                            </Button>
                          </div>
                          <Link href={`/admin/jobs`}>
                            <span className="text-primary underline-offset-2 hover:underline cursor-pointer">View in Jobs →</span>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Upcoming jobs beyond this week */}
        {(() => {
          const weekEnd = dateKey(days[6]);
          const upcoming = jobs.filter(j => j.date && j.date.slice(0, 10) > weekEnd);
          if (!upcoming.length) return null;
          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Upcoming Jobs (Beyond This Week)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcoming.map(job => (
                  <div key={job.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="text-sm font-medium w-24 shrink-0 text-muted-foreground">{job.date}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold">{serviceLabel(job.serviceType)}</span>
                      <span className="text-muted-foreground ml-2">{job.customerName}</span>
                      {job.arrivalWindow && <span className="text-muted-foreground ml-2">· {job.arrivalWindow}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {job.dispatchSentAt && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={dispatchMutation.isPending || job.crewIds.length === 0}
                        onClick={() => dispatchMutation.mutate(job.id)}
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        {job.dispatchSentAt ? "Resend" : "Dispatch"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}
