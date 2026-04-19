import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Search, ChevronRight, Star, MessageSquare, CheckCircle2,
  Clock, UserCheck, Clipboard, Send, RefreshCw, Filter,
  ArrowLeft, Phone, Mail, Calendar, DollarSign, ExternalLink,
  AlertCircle, Truck, Copy, Check, Play, Eye, Loader2
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { getStatusColors } from "@/lib/job-status";
import { SERVICE_LABELS, getServiceBadgeColor } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Lead status pipeline (for quick-advance) ────────────────────────────────
const LEAD_PIPELINE: Record<string, { next: string; action: string }> = {
  new:         { next: "quoted",      action: "Send Quote"      },
  quoted:      { next: "available",   action: "Confirm Job"     },
  available:   { next: "in_progress", action: "Start Job"       },
  in_progress: { next: "completed",   action: "Mark Complete"   },
};

// ─── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  { key: "quoteRequested", label: "Quote In",      shortLabel: "Quote",    icon: Clipboard,    color: "bg-slate-500"  },
  { key: "contacted",      label: "Contacted",     shortLabel: "Contact",  icon: Phone,        color: "bg-blue-500"   },
  { key: "assigned",       label: "Crew Assigned", shortLabel: "Assigned", icon: UserCheck,    color: "bg-purple-500" },
  { key: "completed",      label: "Job Done",      shortLabel: "Done",     icon: CheckCircle2, color: "bg-green-500"  },
  { key: "reviewSent",     label: "Review Sent",   shortLabel: "Sent",     icon: Send,         color: "bg-amber-500"  },
  { key: "reviewReceived", label: "Review In",     shortLabel: "Review",   icon: Star,         color: "bg-pink-500"   },
] as const;


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
function JobRow({ job, expanded, onToggle, onRefresh }: { job: any; expanded: boolean; onToggle: () => void; onRefresh: () => void }) {
  const completedStages = STAGES.filter((s) => job.stages[s.key]?.done).length;
  const sc = getStatusColors(job.status);
  const { toast } = useToast();
  const pipelineStep = LEAD_PIPELINE[job.status];

  const advanceMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/leads/${job.id}/status`, { status: pipelineStep!.next }),
    onSuccess: () => {
      toast({ title: "Advanced", description: `Moved to ${pipelineStep!.next}` });
      onRefresh();
    },
    onError: () => toast({ title: "Error", description: "Could not advance status", variant: "destructive" }),
  });

  return (
    <div className={`rounded-xl border-l-4 ${sc.border} border-t border-r border-b border-slate-700/60 transition-all bg-slate-900/80`}>
      {/* ── Collapsed row ── */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        {/* Traffic light dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${sc.dot} shadow-md`} />

        {/* Name + service */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">
              {job.firstName} {job.lastName}
            </span>
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400 py-0">
              {SERVICE_LABELS[job.serviceType] || job.serviceType}
            </Badge>
            <Badge className={`text-xs py-0 ${sc.badgeBg}`}>{sc.label}</Badge>
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
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {pipelineStep && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="h-6 text-xs px-2 border-blue-500/40 text-blue-400 hover:bg-blue-950/40"
            >
              {advanceMutation.isPending ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <><Play className="h-2.5 w-2.5 mr-1" />Advance</>
              )}
            </Button>
          )}
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
                {!job.stages?.completed?.done && (
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

// ─── Task #130: Parent-child Bookings section ────────────────────────────────
// Renders the new multi-service `bookings` rows above the legacy leads list.
// Each parent row is expandable into a per-child grid with status / crew /
// notes editors, and a bundle-discount override button.

interface BookingChild {
  id: string;
  serviceCode: string;
  serviceLabel: string;
  status: string;
  notes?: string | null;
  assignedToUserId?: string | null;
  crewMembers?: string[] | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
}
interface AdminBooking {
  id: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  serviceAddress?: string | null;
  subtotal: string;
  discountTotal: string;
  finalTotal: string;
  bundleAppliedCode?: string | null;
  status: string;
  rolledUpStatus: string;
  createdAt: string;
  items: BookingChild[];
}

const CHILD_STATUSES = ["pending", "scheduled", "in_progress", "completed", "cancelled"] as const;

function ChildRow({ bookingId, item }: { bookingId: string; item: BookingChild }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [notes, setNotes] = useState(item.notes ?? "");
  const [crew, setCrew] = useState((item.crewMembers ?? []).join(", "));
  // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm` (no seconds, no Z).
  const scheduledLocal = item.scheduledAt
    ? new Date(item.scheduledAt).toISOString().slice(0, 16)
    : "";
  const [scheduled, setScheduled] = useState(scheduledLocal);

  const update = useMutation({
    mutationFn: (body: any) =>
      apiRequest("PATCH", `/api/admin/bookings/items/${item.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      toast({ title: "Updated", description: `${item.serviceLabel} updated` });
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  return (
    <div
      data-testid={`booking-child-${item.id}`}
      className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{item.serviceLabel}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.serviceCode}</p>
        </div>
        <Select
          value={item.status}
          onValueChange={(v) => update.mutate({ status: v })}
        >
          <SelectTrigger className="w-32 h-7 text-xs bg-slate-950 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {CHILD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        type="datetime-local"
        value={scheduled}
        onChange={(e) => setScheduled(e.target.value)}
        onBlur={() => {
          const iso = scheduled ? new Date(scheduled).toISOString() : null;
          update.mutate({ scheduledAt: iso });
        }}
        data-testid={`input-scheduled-${item.id}`}
        className="h-7 text-xs bg-slate-950 border-slate-700 text-slate-200"
      />
      <Input
        placeholder="Crew (comma-separated user ids)"
        value={crew}
        onChange={(e) => setCrew(e.target.value)}
        onBlur={() => {
          const list = crew.split(",").map((s) => s.trim()).filter(Boolean);
          update.mutate({ crewMembers: list });
        }}
        className="h-7 text-xs bg-slate-950 border-slate-700 text-slate-200"
      />
      <Input
        placeholder="Notes for this service"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => update.mutate({ notes })}
        className="h-7 text-xs bg-slate-950 border-slate-700 text-slate-200"
      />
      {item.completedAt && (
        <p className="text-[10px] text-green-400">
          Completed {new Date(item.completedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function DiscountOverrideButton({ booking }: { booking: AdminBooking }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const current = parseFloat(booking.discountTotal || "0");
  const subtotal = parseFloat(booking.subtotal || "0");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(current.toFixed(2));
  const [reason, setReason] = useState("");

  const mutate = useMutation({
    mutationFn: (body: { newDiscount: number; reason?: string }) =>
      apiRequest("POST", `/api/admin/bookings/${booking.id}/discount-override`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      toast({ title: "Discount updated", description: "New discount applied" });
      setOpen(false);
      setReason("");
    },
    onError: () => toast({ title: "Override failed", variant: "destructive" }),
  });

  const submit = () => {
    const num = parseFloat(amount);
    if (Number.isNaN(num) || num < 0) {
      toast({ title: "Enter a valid amount (>= 0)", variant: "destructive" });
      return;
    }
    if (num > subtotal) {
      toast({ title: `Discount cannot exceed subtotal ($${subtotal.toFixed(2)})`, variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason is required for the audit log", variant: "destructive" });
      return;
    }
    mutate.mutate({ newDiscount: num, reason: reason.trim() });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => { e.stopPropagation(); setAmount(current.toFixed(2)); setOpen(true); }}
        disabled={mutate.isPending}
        data-testid={`button-override-discount-${booking.id}`}
        className="h-7 text-xs px-2 border-amber-500/40 text-amber-400 hover:bg-amber-950/40"
      >
        <DollarSign className="h-3 w-3 mr-1" /> Override Discount
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override bundle discount</DialogTitle>
            <DialogDescription className="text-slate-400">
              Subtotal ${subtotal.toFixed(2)} · current discount ${current.toFixed(2)}.
              The change is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={`override-amount-${booking.id}`} className="text-xs text-slate-300">
                New discount (USD)
              </Label>
              <Input
                id={`override-amount-${booking.id}`}
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid={`input-override-amount-${booking.id}`}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`override-reason-${booking.id}`} className="text-xs text-slate-300">
                Reason (required)
              </Label>
              <Textarea
                id={`override-reason-${booking.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. customer loyalty credit"
                data-testid={`input-override-reason-${booking.id}`}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300">
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={mutate.isPending}
              data-testid={`button-confirm-override-${booking.id}`}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {mutate.isPending ? "Saving…" : "Apply override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BookingRow({ booking }: { booking: AdminBooking }) {
  const [open, setOpen] = useState(false);
  const sc = getStatusColors(booking.rolledUpStatus || booking.status);
  return (
    <div
      data-testid={`booking-row-${booking.id}`}
      className={`rounded-xl border-l-4 ${sc.border} border-t border-r border-b border-teal-700/40 bg-slate-900/80`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${sc.dot} shadow-md`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">{booking.customerName}</span>
            <Badge variant="outline" className="text-xs border-teal-600/50 text-teal-400 py-0">
              Bundle · {booking.items.length}
            </Badge>
            <Badge className={`text-xs py-0 ${sc.badgeBg}`}>{sc.label}</Badge>
            {booking.bundleAppliedCode && (
              <Badge variant="outline" className="text-xs border-amber-600/50 text-amber-400 py-0">
                {booking.bundleAppliedCode}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">${parseFloat(booking.finalTotal).toFixed(2)} total</span>
            {parseFloat(booking.discountTotal) > 0 && (
              <span className="text-xs text-emerald-400">−${parseFloat(booking.discountTotal).toFixed(2)} discount</span>
            )}
            <span className="text-xs text-slate-500">
              {new Date(booking.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
            </span>
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className="border-t border-slate-700/50 px-4 py-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-slate-400 space-y-0.5">
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                <a href={`tel:${booking.customerPhone}`} className="hover:text-white">{booking.customerPhone}</a>
              </div>
              {booking.customerEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  <a href={`mailto:${booking.customerEmail}`} className="hover:text-white">{booking.customerEmail}</a>
                </div>
              )}
              {booking.serviceAddress && (
                <div className="flex items-center gap-2">
                  <Clipboard className="h-3 w-3" /> {booking.serviceAddress}
                </div>
              )}
            </div>
            <DiscountOverrideButton booking={booking} />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
            {booking.items.map((it) => (
              <ChildRow key={it.id} bookingId={booking.id} item={it} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Bookings live in their own status namespace (quote/booked/scheduled/
// in_progress/completed/cancelled). Legacy lead pipeline filters use
// different values (quote_requested/available/...) — only forward statuses
// the bookings API understands; otherwise show all booking rows so an
// admin filtering by a legacy-only status doesn't accidentally hide the
// new bundle bookings entirely.
const BOOKING_STATUSES = new Set([
  "quote", "booked", "scheduled", "in_progress", "completed", "cancelled",
]);

function BookingsSection({ search, status }: { search: string; status: string }) {
  const { data, isLoading } = useQuery<{ bookings: AdminBooking[]; total: number }>({
    queryKey: ["/api/admin/bookings", search, status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (search) params.set("search", search);
      if (status && status !== "all" && BOOKING_STATUSES.has(status)) {
        params.set("status", status);
      }
      const res = await fetch(`/api/admin/bookings?${params}`);
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
  });
  const bookings = data?.bookings ?? [];
  if (isLoading) {
    return (
      <div className="text-xs text-slate-500 px-1">Loading bundle bookings…</div>
    );
  }
  if (bookings.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="section-admin-bookings">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-teal-400" />
        <h2 className="text-sm font-bold text-teal-300">Bundle Bookings ({bookings.length})</h2>
      </div>
      <div className="space-y-2">
        {bookings.map((b) => <BookingRow key={b.id} booking={b} />)}
      </div>
      <div className="h-px bg-slate-800 my-2" />
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

        {/* ── Re-book Reminder Cards (snow / junk / window cleaning) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RebookReminderCard serviceKey="snow_removal" label="Snow Removal" emoji="❄️" envFlag="ENABLE_REBOOK_REMINDER_EMAILS_SNOW" accent="sky" />
          <RebookReminderCard serviceKey="junk_removal" label="Junk Removal" emoji="🗑️" envFlag="ENABLE_REBOOK_REMINDER_EMAILS_JUNK" accent="amber" />
          <RebookReminderCard serviceKey="window_cleaning" label="Window Cleaning" emoji="🪟" envFlag="ENABLE_REBOOK_REMINDER_EMAILS_WINDOW" accent="cyan" />
        </div>

        {/* ── Re-book Reminder Opt-outs (Task #122) ── */}
        <RebookOptoutsCard />

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
        ) : null}

        {/* Task #130: parent-child bundle bookings always render first,
            independently of the legacy leads list, so admins can see and
            drive new multi-service bookings even if no legacy leads exist. */}
        <BookingsSection search={debouncedSearch} status={statusFilter} />

        {!isLoading && jobs.length === 0 ? null : !isLoading && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{jobs.length} job{jobs.length !== 1 ? "s" : ""} shown</p>
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                expanded={expandedId === job.id}
                onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                onRefresh={refetch}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Re-book Reminder Card ────────────────────────────────────────────────────
// One card per non-lawn-care service (snow / junk / window cleaning). Same
// Preview + Send Now contract as the lawn-care card on /admin/lawn-care.
type AccentColor = "sky" | "amber" | "cyan";
const ACCENT_CLASSES: Record<AccentColor, { text: string; bg: string; border: string; btn: string; btnText: string }> = {
  sky:   { text: "text-sky-400",   bg: "bg-sky-500/10",   border: "border-sky-500/20",   btn: "bg-sky-500 hover:bg-sky-600",     btnText: "text-slate-900" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", btn: "bg-amber-500 hover:bg-amber-600", btnText: "text-slate-900" },
  cyan:  { text: "text-cyan-400",  bg: "bg-cyan-500/10",  border: "border-cyan-500/20",  btn: "bg-cyan-500 hover:bg-cyan-600",   btnText: "text-slate-900" },
};

type RebookPreview = {
  serviceKey: string;
  label: string;
  eligibilityDays: number;
  resendWindowDays: number;
  eligibleCount: number;
  eligible: { id: string; customerName: string; email: string | null; phone: string; serviceCategory: string; totalQuoted: string | null; lastUpdated: string }[];
  sampleEmail: { html: string; text: string; subject: string } | null;
  lastRun: { ranAt: string; attempted: number; sent: number; failed: number; skipped: boolean; trigger: "scheduler" | "manual" } | null;
};

type RebookAttribution = {
  serviceKey: string;
  label: string;
  windowStart: string | null;
  remindersSent: number;
  bySource: { source: string; label: string; totalLeads: number; paidBookings: number; paidRevenue: number }[];
  emailConversionRatePct: number;
};

function RebookReminderCard({ serviceKey, label, emoji, envFlag, accent }: {
  serviceKey: string; label: string; emoji: string; envFlag: string; accent: AccentColor;
}) {
  const { toast } = useToast();
  const a = ACCENT_CLASSES[accent];
  const [open, setOpen] = useState(false);

  const previewQ = useQuery<RebookPreview>({
    queryKey: ["/api/admin/service-rebook", serviceKey, "preview"],
    enabled: open,
  });

  // Per-service conversion / paid-revenue snapshot. Loads alongside preview
  // so the admin sees email vs organic attribution at a glance (Task #108).
  const attributionQ = useQuery<RebookAttribution>({
    queryKey: ["/api/admin/service-rebook", serviceKey, "attribution"],
    enabled: open,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/service-rebook/${serviceKey}/send`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({
        title: `Sent ${data.sent} reminder${data.sent === 1 ? "" : "s"}`,
        description: data.failed
          ? `${data.failed} failed — see server logs`
          : `${data.attempted} attempted`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-rebook", serviceKey, "preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-rebook", serviceKey, "attribution"] });
    },
    onError: () => toast({ title: "Failed to send reminders", variant: "destructive" }),
  });

  const handleSendClick = () => {
    const eligibleCount = previewQ.data?.eligibleCount;
    const countPart = typeof eligibleCount === "number"
      ? `${eligibleCount} customer${eligibleCount === 1 ? "" : "s"}`
      : "every eligible customer";
    if (!window.confirm(
      `Send ${label} re-book reminder emails to ${countPart} now?\n\nEach email is dispatched immediately. Customers won't be re-emailed for at least 60 days.`
    )) return;
    sendMutation.mutate();
  };

  const fmtLastRun = (info: RebookPreview["lastRun"]): string => {
    if (!info) return "Never run in this server process.";
    const when = new Date(info.ranAt).toLocaleString();
    const status = info.skipped
      ? "skipped (another sweep was in progress)"
      : `${info.sent} sent · ${info.failed} failed · ${info.attempted} attempted`;
    return `Last run: ${when} (${info.trigger}) — ${status}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3" data-testid={`rebook-card-${serviceKey}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`${a.bg} border ${a.border} rounded-lg p-1.5 shrink-0`}>
            <Mail className={`h-3.5 w-3.5 ${a.text}`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">{emoji} {label} Re-book</h3>
            <p className="text-slate-500 text-[11px] mt-0.5 leading-snug">
              30+ day nudge, max once / 60d. Set <code className={a.text}>{envFlag}=true</code> for daily.
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 text-xs flex-1" onClick={() => setOpen(o => !o)} data-testid={`button-preview-${serviceKey}`}>
          <Eye className="h-3 w-3 mr-1" /> {open ? "Hide" : "Preview"}
        </Button>
        <Button size="sm" className={`${a.btn} ${a.btnText} text-xs font-semibold flex-1`} onClick={handleSendClick} disabled={sendMutation.isPending} data-testid={`button-send-${serviceKey}`}>
          {sendMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Send Now
        </Button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          {previewQ.isLoading ? (
            <div className="flex items-center justify-center py-3"><Loader2 className={`h-4 w-4 animate-spin ${a.text}`} /></div>
          ) : previewQ.data ? (
            <>
              <div className="text-xs text-slate-400 mb-1.5">
                <span className={`${a.text} font-semibold`}>{previewQ.data.eligibleCount}</span> eligible · {previewQ.data.eligibilityDays}d / {previewQ.data.resendWindowDays}d window
              </div>
              <div className="text-[10px] text-slate-500 mb-2" data-testid={`last-run-${serviceKey}`}>
                {fmtLastRun(previewQ.data.lastRun)}
              </div>
              {attributionQ.data && attributionQ.data.remindersSent > 0 && (
                <div
                  className={`mb-2 rounded-md border ${a.border} ${a.bg} px-2 py-1.5`}
                  data-testid={`attribution-${serviceKey}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-semibold">Conversion</span>
                    <span className={`${a.text} font-bold`}>
                      {attributionQ.data.emailConversionRatePct}% from {attributionQ.data.remindersSent} sent
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px]">
                    {attributionQ.data.bySource.map((s) => (
                      <div key={s.source} className="bg-slate-900/60 rounded px-1.5 py-1" data-testid={`attribution-row-${serviceKey}-${s.source}`}>
                        <div className="text-slate-400 truncate">{s.label}</div>
                        <div className="text-white font-semibold">
                          {s.paidBookings} paid · ${s.paidRevenue.toFixed(0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {attributionQ.data && attributionQ.data.remindersSent === 0 && (
                <div className="mb-2 text-[10px] text-slate-500 italic" data-testid={`attribution-empty-${serviceKey}`}>
                  No reminders sent yet — conversion stats appear after the first send.
                </div>
              )}
              {previewQ.data.eligible.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {previewQ.data.eligible.map(e => (
                    <div key={e.id} className="bg-slate-800/40 rounded p-1.5 text-[11px]" data-testid={`eligible-${serviceKey}-${e.id}`}>
                      <div className="text-white font-medium truncate">{e.customerName}</div>
                      <div className="text-slate-500 truncate">{e.email} · {e.serviceCategory}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">No customers currently eligible.</p>
              )}
              {previewQ.data.sampleEmail && (
                <details className="mt-2">
                  <summary className={`text-[11px] ${a.text} cursor-pointer`}>View sample email</summary>
                  <iframe
                    title={`${label} re-book reminder preview`}
                    sandbox=""
                    srcDoc={previewQ.data.sampleEmail.html}
                    className="mt-1.5 w-full h-72 bg-white rounded border border-slate-700"
                    data-testid={`preview-iframe-${serviceKey}`}
                  />
                </details>
              )}
            </>
          ) : (
            <p className="text-red-400 text-xs">Failed to load preview.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Re-book Reminder Opt-outs Card (Task #122) ───────────────────────────────
// Lists every customer who clicked the unsubscribe link in a re-book reminder
// email. Admin can remove an entry to re-enable reminders (e.g. when a
// customer calls in saying they unsubscribed by accident).
type RebookOptout = {
  id: number;
  email: string | null;
  phone: string | null;
  source: string;
  createdAt: string;
};

function RebookOptoutsCard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const optoutsQ = useQuery<{ optouts: RebookOptout[] }>({
    queryKey: ["/api/admin/service-rebook/optouts"],
    enabled: open,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/admin/service-rebook/optouts/${id}`, undefined),
    onSuccess: () => {
      toast({ title: "Re-enabled", description: "Customer will receive re-book reminders again." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-rebook/optouts"] });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (payload: { email: string; phone: string }) =>
      apiRequest("POST", `/api/admin/service-rebook/optouts`, payload),
    onSuccess: () => {
      toast({ title: "Added", description: "Customer added to opt-out list." });
      setNewEmail("");
      setNewPhone("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-rebook/optouts"] });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to add",
        description: err?.message || "Could not add opt-out",
        variant: "destructive",
      }),
  });

  const handleRemove = (row: RebookOptout) => {
    const who = row.email || row.phone || `entry #${row.id}`;
    if (!window.confirm(`Re-enable re-book reminders for ${who}?\n\nThey'll start receiving reminder emails again on the next sweep.`)) return;
    removeMutation.mutate(row.id);
  };

  const handleAdd = () => {
    const email = newEmail.trim();
    const phone = newPhone.trim();
    if (!email && !phone) {
      toast({ title: "Enter email or phone", variant: "destructive" });
      return;
    }
    addMutation.mutate({ email, phone });
  };

  const optouts = optoutsQ.data?.optouts ?? [];

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-3 pb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🚫</span>
            <div>
              <p className="text-sm font-bold text-slate-200">Re-book Reminder Opt-outs</p>
              <p className="text-[11px] text-slate-500">Customers who unsubscribed from snow / junk / window reminder emails</p>
            </div>
          </div>
          <span className="text-xs text-slate-500">{open ? "Hide" : "View"}</span>
        </button>

        {open && (
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="h-8 text-xs bg-slate-950 border-slate-800"
              />
              <Input
                type="tel"
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="h-8 text-xs bg-slate-950 border-slate-800"
              />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={addMutation.isPending}
                className="h-8 text-xs whitespace-nowrap"
              >
                {addMutation.isPending ? "Adding…" : "Add opt-out"}
              </Button>
            </div>
            {optoutsQ.isLoading ? (
              <p className="text-xs text-slate-500 py-2">Loading…</p>
            ) : optouts.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No one has unsubscribed yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {optouts.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-slate-950 border border-slate-800">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 truncate">
                        {row.email || <span className="text-slate-500">no email</span>}
                        {row.phone ? <span className="text-slate-500"> · {row.phone}</span> : null}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(row.createdAt).toLocaleDateString()}
                        {" · "}
                        <span
                          className={
                            row.source === "admin"
                              ? "text-amber-400"
                              : row.source === "email_link"
                                ? "text-sky-400"
                                : "text-slate-400"
                          }
                        >
                          via {row.source}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[11px] h-7 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                      onClick={() => handleRemove(row)}
                      disabled={removeMutation.isPending}
                    >
                      Re-enable
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
