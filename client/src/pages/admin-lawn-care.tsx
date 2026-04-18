import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Leaf, CheckCircle2, DollarSign, RefreshCw, AlertCircle, Phone, MapPin, Calendar, Users, Mail, Send, Eye } from "lucide-react";
import type { LawnCareQuote, LawnCarePlan } from "@shared/schema";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  quote_requested: { label: "Quote Requested", color: "bg-yellow-500/20 text-yellow-400 border-yellow-600/30" },
  approved: { label: "Approved", color: "bg-blue-500/20 text-blue-400 border-blue-600/30" },
  paid: { label: "Paid", color: "bg-green-500/20 text-green-400 border-green-600/30" },
  plan_active: { label: "Plan Active", color: "bg-lime-500/20 text-lime-400 border-lime-600/30" },
  cancelled: { label: "Cancelled", color: "bg-slate-500/20 text-slate-400 border-slate-600/30" },
};

function fmtMoney(val: string | number | null | undefined) {
  const num = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (!num || isNaN(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function fmtDate(val: string | Date | null | undefined) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminLawnCare() {
  const { toast } = useToast();
  const [tab, setTab] = useState("quotes");

  const quotesQ = useQuery<LawnCareQuote[]>({
    queryKey: ["/api/lawn-care/quotes"],
    refetchInterval: 30000,
  });

  const plansQ = useQuery<LawnCarePlan[]>({
    queryKey: ["/api/lawn-care/plans"],
    refetchInterval: 30000,
  });

  function useAction(endpoint: string) {
    return useMutation({
      mutationFn: (id: number) => apiRequest("POST", `/api/lawn-care/${endpoint}/${id}`, {}),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/lawn-care/quotes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/lawn-care/plans"] });
        toast({ title: "Updated successfully" });
      },
      onError: () => toast({ title: "Action failed", variant: "destructive" }),
    });
  }

  const approveMutation = useAction("approve");
  const markPaidMutation = useAction("mark-paid");
  const activatePlanMutation = useAction("activate-plan");

  // ── Re-book Reminder card ──────────────────────────────────────────────
  type LastRunInfo = {
    ranAt: string;
    attempted: number;
    sent: number;
    failed: number;
    skipped: boolean;
    trigger: "scheduler" | "manual";
  } | null;
  type SourceStat = {
    source: string;
    label: string;
    rebooks: number;
    reminders: number | null;
    conversionRate: number | null;
    paidRebooks: number;
    paidRevenue: number;
  };
  type AttributionStats = {
    windowDays: number;
    rebooks: number;
    reminders: number;
    conversionRate: number | null;
    paidRebooks: number;
    paidRevenue: number;
    totalRebooks: number;
    bySource: SourceStat[];
  } | null;
  type RebookPreview = {
    eligibilityDays: number;
    resendWindowDays: number;
    eligibleCount: number;
    eligible: { id: number; customerName: string; email: string | null; phone: string; serviceCategory: string; totalQuoted: string | null; lastUpdated: string }[];
    sampleEmail: { html: string; text: string; subject: string } | null;
    lastRun: LastRunInfo;
    attribution: AttributionStats;
  };
  // Always-visible attribution stat (does not require opening the preview).
  const attributionQ = useQuery<NonNullable<AttributionStats>>({
    queryKey: ["/api/admin/lawn-care/rebook-reminder/attribution"],
    refetchInterval: 60_000,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewQ = useQuery<RebookPreview>({
    queryKey: ["/api/admin/lawn-care/rebook-reminder/preview"],
    enabled: previewOpen,
  });
  const sendRemindersMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/lawn-care/rebook-reminder/send", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: `Sent ${data.sent} reminder${data.sent === 1 ? "" : "s"}`, description: data.failed ? `${data.failed} failed — see server logs` : `${data.attempted} attempted` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lawn-care/rebook-reminder/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lawn-care/rebook-reminder/attribution"] });
    },
    onError: () => toast({ title: "Failed to send reminders", variant: "destructive" }),
  });

  function handleSendRemindersClick() {
    const eligibleCount = previewQ.data?.eligibleCount;
    const countPart = typeof eligibleCount === "number"
      ? `${eligibleCount} customer${eligibleCount === 1 ? "" : "s"}`
      : "every eligible customer";
    const ok = window.confirm(
      `Send re-book reminder emails to ${countPart} now?\n\nEach email is dispatched immediately. Customers won't be re-emailed for at least 60 days.`
    );
    if (!ok) return;
    sendRemindersMutation.mutate();
  }

  function fmtLastRun(info: LastRunInfo): string {
    if (!info) return "Never run in this server process.";
    const when = new Date(info.ranAt).toLocaleString();
    const status = info.skipped
      ? "skipped (another sweep was in progress)"
      : `${info.sent} sent · ${info.failed} failed · ${info.attempted} attempted`;
    return `Last run: ${when} (${info.trigger}) — ${status}`;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-lime-500/10 border border-lime-500/20 rounded-xl p-2.5">
            <Leaf className="h-5 w-5 text-lime-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Lawn Care</h1>
            <p className="text-slate-400 text-sm">Manage quotes and recurring plans</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-600/30">
              {quotesQ.data?.filter((q) => q.status === "quote_requested").length ?? 0} pending
            </Badge>
            <Badge className="bg-lime-500/20 text-lime-400 border-lime-600/30">
              {plansQ.data?.filter((p) => p.isActive).length ?? 0} active plans
            </Badge>
          </div>
        </div>

        {/* Re-book Reminder Card */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-5" data-testid="rebook-reminder-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3">
              <div className="bg-lime-500/10 border border-lime-500/20 rounded-lg p-2">
                <Mail className="h-4 w-4 text-lime-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Re-book Reminder Emails</h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  Nudges paid customers 30+ days out, max once every 60 days. Disabled by default — set <code className="text-lime-400">ENABLE_REBOOK_REMINDER_EMAILS=true</code> for the daily sweep.
                </p>
                {attributionQ.data && (
                  <div className="text-xs mt-2 text-slate-300 space-y-1" data-testid="rebook-attribution-stat">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Re-books in last {attributionQ.data.windowDays} days · {attributionQ.data.totalRebooks} total
                    </p>
                    {attributionQ.data.bySource.length === 0 ? (
                      <p className="text-slate-500 italic">No re-books yet.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {attributionQ.data.bySource.map((s) => (
                          <li
                            key={s.source}
                            className="flex flex-wrap items-baseline gap-x-2"
                            data-testid={`rebook-attribution-row-${s.source}`}
                          >
                            <span className="text-slate-200">{s.label}:</span>
                            <span className="text-lime-400 font-semibold">{s.rebooks}</span>
                            <span className="text-slate-400">
                              re-book{s.rebooks === 1 ? "" : "s"}
                            </span>
                            {s.reminders !== null && (
                              <span className="text-slate-500">
                                from {s.reminders} reminder{s.reminders === 1 ? "" : "s"} sent
                                {s.conversionRate !== null && (
                                  <> · {(s.conversionRate * 100).toFixed(1)}% conversion</>
                                )}
                              </span>
                            )}
                            <span
                              className="text-slate-500"
                              data-testid={`rebook-attribution-revenue-${s.source}`}
                            >
                              · <span className="text-lime-400 font-semibold">
                                ${s.paidRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                              {" earned"}
                              {s.paidRebooks > 0 && (
                                <> ({s.paidRebooks} paid)</>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="border-slate-600 text-slate-200 text-xs" onClick={() => setPreviewOpen(o => !o)} data-testid="button-preview-rebook">
                <Eye className="h-3 w-3 mr-1" /> {previewOpen ? "Hide" : "Preview"}
              </Button>
              <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-slate-900 text-xs font-semibold" onClick={handleSendRemindersClick} disabled={sendRemindersMutation.isPending} data-testid="button-send-rebook">
                {sendRemindersMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Send Now
              </Button>
            </div>
          </div>

          {previewOpen && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              {previewQ.isLoading ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-lime-400" /></div>
              ) : previewQ.data ? (
                <>
                  <div className="text-xs text-slate-400 mb-2">
                    <span className="text-lime-400 font-semibold">{previewQ.data.eligibleCount}</span> customer{previewQ.data.eligibleCount === 1 ? "" : "s"} eligible
                    {" · "}
                    Window: {previewQ.data.eligibilityDays}d eligible / {previewQ.data.resendWindowDays}d re-send
                  </div>
                  <div className="text-[11px] text-slate-500 mb-3" data-testid="rebook-reminder-last-run">
                    {fmtLastRun(previewQ.data.lastRun)}
                  </div>
                  {previewQ.data.eligible.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {previewQ.data.eligible.map(e => (
                        <div key={e.id} className="bg-slate-900/40 rounded p-2 text-xs flex items-center justify-between gap-2" data-testid={`eligible-${e.id}`}>
                          <div className="min-w-0 flex-1">
                            <div className="text-white font-medium truncate">{e.customerName}</div>
                            <div className="text-slate-500 truncate">{e.email} · {e.serviceCategory.replace(/_/g, " ")} · {e.totalQuoted ? fmtMoney(e.totalQuoted) : "—"}</div>
                          </div>
                          <div className="text-slate-500 text-[10px] shrink-0">{fmtDate(e.lastUpdated)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs italic">No customers currently eligible.</p>
                  )}
                  {previewQ.data.sampleEmail && (
                    <details className="mt-3">
                      <summary className="text-xs text-lime-400 cursor-pointer">View sample email ({previewQ.data.sampleEmail.subject})</summary>
                      {/* sandbox=""=no scripts, no same-origin — safe to render arbitrary HTML */}
                      <iframe
                        title="Re-book reminder email preview"
                        sandbox=""
                        srcDoc={previewQ.data.sampleEmail.html}
                        className="mt-2 w-full h-96 bg-white rounded border border-slate-700"
                        data-testid="preview-iframe"
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

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-slate-800 border border-slate-700 mb-5">
            <TabsTrigger value="quotes" className="data-[state=active]:bg-lime-500 data-[state=active]:text-slate-900">
              Quotes ({quotesQ.data?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="plans" className="data-[state=active]:bg-lime-500 data-[state=active]:text-slate-900">
              Recurring Plans ({plansQ.data?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Quotes Tab */}
          <TabsContent value="quotes">
            {quotesQ.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
              </div>
            ) : quotesQ.data?.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Leaf className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No lawn care quotes yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {quotesQ.data?.map((q) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    onApprove={() => approveMutation.mutate(q.id)}
                    onMarkPaid={() => markPaidMutation.mutate(q.id)}
                    onActivatePlan={() => activatePlanMutation.mutate(q.id)}
                    loading={approveMutation.isPending || markPaidMutation.isPending || activatePlanMutation.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Plans Tab */}
          <TabsContent value="plans">
            {plansQ.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-lime-400" />
              </div>
            ) : plansQ.data?.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No recurring plans yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {plansQ.data?.map((p) => (
                  <PlanCard key={p.id} plan={p} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuoteCard({ quote: q, onApprove, onMarkPaid, onActivatePlan, loading }: {
  quote: LawnCareQuote;
  onApprove: () => void;
  onMarkPaid: () => void;
  onActivatePlan: () => void;
  loading: boolean;
}) {
  const statusCfg = STATUS_CONFIG[q.status] ?? STATUS_CONFIG.quote_requested;
  const isCustom = q.isCustomEstimate;

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">{q.customerName}</span>
            <Badge className={`text-xs border ${statusCfg.color}`}>{statusCfg.label}</Badge>
            {isCustom && <Badge className="text-xs bg-orange-500/20 text-orange-400 border border-orange-600/30">Custom Estimate</Badge>}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{q.phone}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{q.address}{q.city ? `, ${q.city}` : ""}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(q.createdAt)}</span>
          </div>
        </div>
        <div className="text-right">
          {isCustom ? (
            <span className="text-orange-400 font-semibold text-sm">Custom</span>
          ) : (
            <span className="text-lime-400 font-bold text-lg">{fmtMoney(q.totalQuoted)}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-4">
        <InfoChip label="Category" value={q.serviceCategory?.replace("_", " ")} />
        <InfoChip label="Frequency" value={q.serviceFrequency?.replace("_", " ")} />
        <InfoChip label="Size" value={q.propertySize} />
        <InfoChip label="Condition" value={q.propertyCondition?.replace("_", " ")} />
      </div>

      {Array.isArray(q.addOns) && q.addOns.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(q.addOns as string[]).map((a) => (
            <Badge key={a} className="bg-teal-500/10 text-teal-400 border border-teal-600/30 text-xs">{a.replace("_", " ")}</Badge>
          ))}
        </div>
      )}

      {q.recommendedCrewType && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
          <Users className="h-3 w-3" />
          <span>Crew: {q.recommendedCrewType} ({q.recommendedCrewSize})</span>
        </div>
      )}

      {q.notes && (
        <p className="text-slate-400 text-xs bg-slate-900/40 rounded-lg p-2 mb-4 italic">"{q.notes}"</p>
      )}

      <div className="flex flex-wrap gap-2">
        {q.status === "quote_requested" && (
          <Button size="sm" onClick={onApprove} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
          </Button>
        )}
        {(q.status === "approved") && (
          <Button size="sm" onClick={onMarkPaid} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white text-xs">
            <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
          </Button>
        )}
        {(q.status === "approved" || q.status === "paid") && q.serviceFrequency !== "one_time" && (
          <Button size="sm" onClick={onActivatePlan} disabled={loading} className="bg-lime-500 hover:bg-lime-600 text-slate-900 text-xs font-semibold">
            <RefreshCw className="h-3 w-3 mr-1" /> Activate Plan
          </Button>
        )}
        {q.status === "quote_requested" && isCustom && (
          <Button size="sm" variant="outline" className="border-orange-600/40 text-orange-400 hover:bg-orange-500/10 text-xs" onClick={onApprove} disabled={loading}>
            <AlertCircle className="h-3 w-3 mr-1" /> Send Custom Quote
          </Button>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan: p }: { plan: LawnCarePlan }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">{p.customerName}</span>
            <Badge className={`text-xs border ${p.isActive ? "bg-lime-500/20 text-lime-400 border-lime-600/30" : "bg-slate-500/20 text-slate-400 border-slate-600/30"}`}>
              {p.isActive ? "Active" : "Paused"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.address}{p.city ? `, ${p.city}` : ""}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-lime-400 font-bold text-lg">{fmtMoney(p.recurringPrice)}</span>
          <p className="text-slate-500 text-xs">/visit</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
        <InfoChip label="Category" value={p.serviceCategory?.replace("_", " ")} />
        <InfoChip label="Frequency" value={p.frequency?.replace("_", " ")} />
        <InfoChip label="Start Date" value={p.startDate} />
        <InfoChip label="Next Service" value={p.nextServiceDate ?? "—"} />
      </div>

      {p.crewType && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
          <Users className="h-3 w-3" />
          <span>Crew: {p.crewType} ({p.crewSize})</span>
        </div>
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-2">
      <p className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white font-medium capitalize">{value ?? "—"}</p>
    </div>
  );
}
