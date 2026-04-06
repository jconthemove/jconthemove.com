import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin, Calendar, Loader2, ChevronRight, Briefcase,
  Coins, Users, CheckCircle2, ClipboardList, Plus, Truck
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { getStatusColors } from "@/lib/job-status";
import type { Lead } from "@shared/schema";

const SERVICE_ICONS: Record<string, string> = {
  residential: "🚛", commercial: "🏢", junk: "🗑️", snow: "❄️",
  cleaning: "✨", handyman: "🔧", demolition: "⚒️", flooring: "🪵", painting: "🎨",
};

const SERVICE_LABELS: Record<string, string> = {
  residential: "Residential Move", commercial: "Commercial Move",
  junk: "Junk Removal", snow: "Snow Removal", cleaning: "Cleaning",
  handyman: "Handyman", demolition: "Demolition", flooring: "Flooring", painting: "Painting",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New", quoted: "Quoted", available: "Confirmed",
  in_progress: "In Progress", completed: "Completed",
};

function StatusPill({ status }: { status: string }) {
  const colors = getStatusColors(status);
  return (
    <Badge variant="outline" className={`text-xs ${colors.text} ${colors.cardBorder}`}>
      {STATUS_LABELS[status] || status.replace(/_/g, " ")}
    </Badge>
  );
}

type JobBoardLead = {
  id: string;
  serviceType: string;
  fromAddress: string | null;
  toAddress: string | null;
  moveDate: string | null;
  crewSize: number | null;
  status: string;
  price: string | null;
  details: string | null;
  estimatedTokens: number;
  alreadyApplied: boolean;
  crewSlotsFilled: number;
};

function JobBoardCard({ job, onApply, isPending }: { job: JobBoardLead; onApply: () => void; isPending: boolean }) {
  const isFull = job.crewSlotsFilled >= (job.crewSize || 2);
  const slotsOpen = (job.crewSize || 2) - job.crewSlotsFilled;

  return (
    <Card className="bg-slate-800/40 border border-slate-700/50 hover:border-slate-600/60 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl leading-none mt-0.5">
              {SERVICE_ICONS[job.serviceType] || "📦"}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">
                {SERVICE_LABELS[job.serviceType] || job.serviceType}
              </p>
              <StatusPill status={job.status} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-orange-400 font-bold text-sm flex items-center gap-1 justify-end">
              <Coins className="h-3.5 w-3.5" />
              ~{job.estimatedTokens.toLocaleString()}
            </p>
            <p className="text-slate-500 text-xs">JCMOVES</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {job.fromAddress && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
              <span className="truncate">{job.fromAddress}</span>
              {job.toAddress && <span className="text-slate-600">→ {job.toAddress}</span>}
            </div>
          )}
          {job.moveDate && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
              <span>{new Date(job.moveDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
            <span>
              {job.crewSize || 2} movers needed
              {job.crewSlotsFilled > 0 && (
                <span className="text-blue-400 ml-1">· {job.crewSlotsFilled} signed up</span>
              )}
              {isFull && <span className="text-green-400 ml-1">· Full</span>}
              {!isFull && slotsOpen > 0 && (
                <span className="text-yellow-400 ml-1">· {slotsOpen} slot{slotsOpen !== 1 ? "s" : ""} open</span>
              )}
            </span>
          </div>
          {job.details && (
            <p className="text-xs text-slate-500 line-clamp-2 mt-1">{job.details}</p>
          )}
        </div>

        <div className="mt-3">
          {job.alreadyApplied ? (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">You're signed up — awaiting confirmation</span>
            </div>
          ) : isFull ? (
            <Button size="sm" disabled className="w-full bg-slate-700 text-slate-500 cursor-not-allowed">
              Crew Full
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onApply}
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign Up for This Job"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrewJobsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const isAdmin = ["admin", "business_owner"].includes(user?.role || "");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const { data: myJobs = [], isLoading: myJobsLoading } = useQuery<Lead[]>({
    queryKey: [isAdmin ? "/api/leads" : "/api/leads/my-jobs"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: boardJobs = [], isLoading: boardLoading } = useQuery<JobBoardLead[]>({
    queryKey: ["/api/leads/job-board"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const applyMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/crew-apply`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to sign up" }));
        throw new Error(err.error || "Failed to sign up");
      }
      return res.json();
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/job-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
      setApplyingId(null);
      toast({ title: "✅ Signed up!", description: "The admin will confirm your assignment." });
    },
    onError: (e: Error) => {
      setApplyingId(null);
      toast({ title: "Couldn't sign up", description: e.message, variant: "destructive" });
    },
  });

  const activeJobs = useMemo(() =>
    myJobs.filter(l => !["completed", "cancelled"].includes(l.status)), [myJobs]);
  const completedJobs = useMemo(() =>
    myJobs.filter(l => l.status === "completed"), [myJobs]);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-white">Jobs</h1>
          <p className="text-slate-400 text-sm">Your assignments & open job board</p>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500" onClick={() => navigate("/post-job")}>
          <Plus className="h-4 w-4 mr-1" /> Add Lead
        </Button>
      </div>

      <Tabs defaultValue="board">
        <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-5 w-full">
          <TabsTrigger value="board" className="flex-1 data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">
            <Briefcase className="h-3.5 w-3.5 mr-1.5" />
            Job Board
            {boardJobs.filter(j => !j.alreadyApplied).length > 0 && (
              <span className="ml-1.5 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {boardJobs.filter(j => !j.alreadyApplied).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="my-jobs" className="flex-1 data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            My Jobs
            {activeJobs.length > 0 && (
              <span className="ml-1.5 bg-slate-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {activeJobs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="space-y-3">
          <p className="text-slate-500 text-xs">
            Open jobs you can sign up for. Admin confirms your spot before the job date.
          </p>
          {boardLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
          ) : boardJobs.length === 0 ? (
            <div className="text-center py-14 text-slate-500">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No open jobs right now</p>
              <p className="text-xs mt-1">Check back soon — new jobs appear here when they're added</p>
            </div>
          ) : (
            boardJobs.map(job => (
              <JobBoardCard
                key={job.id}
                job={job}
                onApply={() => {
                  setApplyingId(job.id);
                  applyMutation.mutate(job.id);
                }}
                isPending={applyingId === job.id && applyMutation.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="my-jobs" className="space-y-3">
          {myJobsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
          ) : myJobs.length === 0 ? (
            <div className="text-center py-14 text-slate-500">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No assigned jobs yet</p>
              <p className="text-xs mt-1">Sign up for jobs on the Job Board tab</p>
            </div>
          ) : (
            <>
              {activeJobs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active ({activeJobs.length})</p>
                  {activeJobs.map(lead => {
                    const sc = getStatusColors(lead.status);
                    return (
                      <Card key={lead.id} className={`border-l-4 ${sc.border} bg-white/[0.03] border-t border-r border-b border-slate-700/40`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="font-semibold text-white text-sm">
                                  {lead.firstName} {lead.lastName}
                                </p>
                                <StatusPill status={lead.status} />
                                {lead.serviceType && (
                                  <span className="text-xs text-slate-400">
                                    {SERVICE_ICONS[lead.serviceType]} {SERVICE_LABELS[lead.serviceType] || lead.serviceType}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                                {lead.moveDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(lead.moveDate).toLocaleDateString()}
                                  </span>
                                )}
                                {lead.fromAddress && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate max-w-[180px]">{lead.fromAddress}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <Link href={`/lead/${lead.id}`}>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white flex-shrink-0">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {completedJobs.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed ({completedJobs.length})</p>
                  {completedJobs.slice(0, 5).map(lead => (
                    <Card key={lead.id} className="bg-white/[0.02] border border-slate-800/60">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-300 font-medium">{lead.firstName} {lead.lastName}</p>
                            <p className="text-xs text-slate-500">
                              {lead.serviceType && `${SERVICE_LABELS[lead.serviceType] || lead.serviceType} · `}
                              {lead.moveDate && new Date(lead.moveDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <Link href={`/lead/${lead.id}`}>
                              <ChevronRight className="h-4 w-4 text-slate-600 hover:text-slate-400" />
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
