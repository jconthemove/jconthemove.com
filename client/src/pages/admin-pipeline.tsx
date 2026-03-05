import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Search, ChevronRight, Star, MessageSquare, CheckCircle2,
  Clock, UserCheck, Clipboard, Send, RefreshCw, Filter,
  ArrowLeft, Phone, Mail, Calendar, DollarSign, ExternalLink,
  AlertCircle, Truck, Copy, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  { key: "quoteRequested", label: "Quote In",      shortLabel: "Quote",    icon: Clipboard,    color: "bg-slate-500"  },
  { key: "contacted",      label: "Contacted",     shortLabel: "Contact",  icon: Phone,        color: "bg-blue-500"   },
  { key: "assigned",       label: "Crew Assigned", shortLabel: "Assigned", icon: UserCheck,    color: "bg-purple-500" },
  { key: "completed",      label: "Job Done",      shortLabel: "Done",     icon: CheckCircle2, color: "bg-green-500"  },
  { key: "reviewSent",     label: "Review Sent",   shortLabel: "Sent",     icon: Send,         color: "bg-amber-500"  },
  { key: "reviewReceived", label: "Review In",     shortLabel: "Review",   icon: Star,         color: "bg-pink-500"   },
] as const;

const SERVICE_LABELS: Record<string, string> = {
  residential: "Residential Move", commercial: "Commercial Move",
  junk: "Junk Removal", snow: "Snow Removal", cleaning: "Cleaning",
  handyman: "Handyman", demolition: "Demolition", flooring: "Flooring", painting: "Painting",
};

const STATUS_COLORS: Record<string, string> = {
  quote_requested: "border-slate-400 bg-slate-900 text-slate-300",
  available: "border-blue-400 bg-blue-950 text-blue-300",
  completed: "border-green-400 bg-green-950 text-green-300",
};

// ─── Pipeline progress bar ────────────────────────────────────────────────────
function PipelineBar({ stages }: { stages: Record<string, { done: boolean; at: any }> }) {
  const completed = STAGES.filter((s) => stages[s.key]?.done).length;
  const pct = Math.round((completed / STAGES.length) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          {STAGES.map((s) => {
            const done = stages[s.key]?.done;
            return (
              <div key={s.key} title={s.label}
                className={`h-2 w-5 rounded-full transition-all ${done ? s.color : "bg-slate-700"}`} />
            );
          })}
        </div>
        <span className="text-xs text-slate-400 ml-2">{pct}%</span>
      </div>
    </div>
  );
}

// ─── Stage detail row ─────────────────────────────────────────────────────────
function StageRow({ stage, data }: { stage: typeof STAGES[number]; data: { done: boolean; at: any } }) {
  const Icon = stage.icon;
  return (
    <div className={`flex items-center gap-2 py-1 ${data.done ? "opacity-100" : "opacity-40"}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${data.done ? stage.color : "bg-slate-700"}`}>
        <Icon className="h-3 w-3 text-white" />
      </div>
      <span className={`text-xs font-medium ${data.done ? "text-slate-200" : "text-slate-500"}`}>
        {stage.label}
      </span>
      {data.done && data.at && (
        <span className="text-xs text-slate-500 ml-auto">
          {new Date(data.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
      {!data.done && <span className="text-xs text-slate-600 ml-auto">Pending</span>}
    </div>
  );
}

// ─── Review Request Button ────────────────────────────────────────────────────
function ReviewRequestButton({ job }: { job: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/leads/${job.id}/request-review`),
    onSuccess: () => {
      toast({ title: "Review request sent!", description: `SMS sent to ${job.phone}` });
      qc.invalidateQueries({ queryKey: ["/api/admin/pipeline"] });
    },
    onError: () => toast({ title: "Failed to send", description: "Could not send review request", variant: "destructive" }),
  });

  const reviewUrl = job.reviewToken
    ? `${window.location.origin}/leave-review?token=${job.reviewToken}`
    : `${window.location.origin}/leave-review?jobId=${job.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(reviewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (job.stages?.reviewReceived?.done) {
    return (
      <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
        <Star className="h-3 w-3 fill-green-400" />
        {job.review?.rating}★ review received
      </div>
    );
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {job.stages?.reviewSent?.done ? (
        <div className="text-xs text-amber-400 flex items-center gap-1">
          <Send className="h-3 w-3" />
          Sent {job.reviewRequestSentAt ? new Date(job.reviewRequestSentAt).toLocaleDateString() : ""}
        </div>
      ) : (
        <Button size="sm" variant="outline"
          onClick={() => sendMutation.mutate()}
          disabled={sendMutation.isPending || !job.stages?.completed?.done}
          className="h-6 text-xs px-2 border-amber-500/50 text-amber-400 hover:bg-amber-950">
          {sendMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
          Send Review SMS
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={copyLink}
        className="h-6 text-xs px-2 text-slate-400 hover:text-slate-200">
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────
function JobRow({ job, expanded, onToggle }: { job: any; expanded: boolean; onToggle: () => void }) {
  const completedStages = STAGES.filter((s) => job.stages[s.key]?.done).length;
  const isComplete = job.stages.completed.done;

  return (
    <div className={`rounded-xl border transition-all ${isComplete ? "border-green-800/50" : "border-slate-700/60"} bg-slate-900/80`}>
      {/* ── Collapsed row ── */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          job.status === "completed" ? "bg-green-500" :
          job.status === "available" ? "bg-blue-500" : "bg-slate-500"
        }`} />

        {/* Name + service */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">
              {job.firstName} {job.lastName}
            </span>
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400 py-0">
              {SERVICE_LABELS[job.serviceType] || job.serviceType}
            </Badge>
            {job.assignedEmployee && (
              <Badge variant="outline" className="text-xs border-purple-600/50 text-purple-400 py-0">
                👷 {job.assignedEmployee}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <PipelineBar stages={job.stages} />
            <span className="text-xs text-slate-500 shrink-0">
              {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{completedStages}/{STAGES.length}</span>
          <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-4 grid md:grid-cols-3 gap-4">
          {/* Contact info */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer</p>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Phone className="h-3.5 w-3.5 text-slate-500" />
              <a href={`tel:${job.phone}`} className="hover:text-white">{job.phone}</a>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Mail className="h-3.5 w-3.5 text-slate-500" />
              <a href={`mailto:${job.email}`} className="hover:text-white truncate">{job.email}</a>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clipboard className="h-3.5 w-3.5" />
              <span className="font-mono">{job.id.slice(0, 12)}…</span>
            </div>
            <Link href={`/lead/${job.id}`}>
              <Button size="sm" variant="outline"
                className="mt-1 h-7 text-xs px-2 border-slate-600 text-slate-400 hover:bg-slate-800 w-full">
                <ExternalLink className="h-3 w-3 mr-1" /> Open Job
              </Button>
            </Link>
          </div>

          {/* Stage breakdown */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Lifecycle</p>
            {STAGES.map((s) => (
              <StageRow key={s.key} stage={s} data={job.stages[s.key]} />
            ))}
          </div>

          {/* Review actions */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Review & Tip</p>
            {job.review ? (
              <div className="space-y-2">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= job.review.rating ? "fill-amber-400 text-amber-400" : "text-slate-600"}`} />
                  ))}
                  <span className="text-xs text-slate-400 ml-1">{job.review.rating}/5</span>
                </div>
                {job.review.comment && (
                  <p className="text-xs text-slate-300 italic line-clamp-3">"{job.review.comment}"</p>
                )}
                {job.review.tipAmount && parseFloat(job.review.tipAmount) > 0 && (
                  <div className="flex items-center gap-1 text-amber-400 text-xs">
                    <DollarSign className="h-3 w-3" />
                    Tip: ${parseFloat(job.review.tipAmount).toFixed(2)}
                  </div>
                )}
                {job.review.wouldRecommend && (
                  <Badge className="bg-green-900/50 text-green-400 border border-green-700 text-xs">
                    👍 Recommends
                  </Badge>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {!isComplete && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Complete job first to request review
                  </p>
                )}
                <ReviewRequestButton job={job} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPipelinePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<{ pipeline: any[]; total: number }>({
    queryKey: ["/api/admin/pipeline", debouncedSearch, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/pipeline?${params}`);
      if (!res.ok) throw new Error("Failed to load pipeline");
      return res.json();
    },
  });

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any).__pipelineSearchTimer);
    (window as any).__pipelineSearchTimer = setTimeout(() => setDebouncedSearch(val), 400);
  };

  const jobs = data?.pipeline || [];

  // Summary stats
  const stats = {
    total: data?.total || 0,
    completed: jobs.filter((j) => j.stages.completed.done).length,
    reviewSent: jobs.filter((j) => j.stages.reviewSent.done).length,
    reviewReceived: jobs.filter((j) => j.stages.reviewReceived.done).length,
    pending: jobs.filter((j) => !j.stages.completed.done).length,
    withTip: jobs.filter((j) => j.review?.tipAmount && parseFloat(j.review.tipAmount) > 0).length,
  };

  const totalTips = jobs.reduce((sum, j) =>
    sum + (j.review?.tipAmount ? parseFloat(j.review.tipAmount) : 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/in-god-we-trust">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white -ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" /> Admin
              </Button>
            </Link>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-amber-400" />
              <h1 className="text-lg font-bold text-white">Job Pipeline A–Z</h1>
            </div>
            <Button size="sm" variant="ghost" onClick={() => refetch()}
              className="ml-auto text-slate-400 hover:text-white">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search by name, phone, or email…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-slate-300 h-9">
                <Filter className="h-3 w-3 mr-1 text-slate-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="quote_requested">Quote Requested</SelectItem>
                <SelectItem value="available">Available / Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Jobs", value: stats.total, color: "text-slate-300", icon: Clipboard },
            { label: "Pending", value: stats.pending, color: "text-blue-400", icon: Clock },
            { label: "Completed", value: stats.completed, color: "text-green-400", icon: CheckCircle2 },
            { label: "Review Sent", value: stats.reviewSent, color: "text-amber-400", icon: Send },
            { label: "Reviews In", value: stats.reviewReceived, color: "text-pink-400", icon: Star },
            { label: "Tips Total", value: `$${totalTips.toFixed(0)}`, color: "text-emerald-400", icon: DollarSign },
          ].map((s) => (
            <Card key={s.label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-3 pb-3 text-center">
                <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Stage Legend ── */}
        <div className="flex gap-3 flex-wrap items-center">
          <span className="text-xs text-slate-500">Pipeline stages:</span>
          {STAGES.map((s) => (
            <div key={s.key} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span className="text-xs text-slate-400">{s.shortLabel}</span>
            </div>
          ))}
        </div>

        {/* ── Jobs List ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            <p className="text-slate-400">Loading pipeline…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16">
            <Clipboard className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No jobs found</p>
            {debouncedSearch && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                className="mt-2 text-slate-500">
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{jobs.length} job{jobs.length !== 1 ? "s" : ""} shown</p>
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                expanded={expandedId === job.id}
                onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
