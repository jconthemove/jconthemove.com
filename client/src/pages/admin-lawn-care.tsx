import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Leaf, CheckCircle2, DollarSign, RefreshCw, AlertCircle, Phone, MapPin, Calendar, Users } from "lucide-react";
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
