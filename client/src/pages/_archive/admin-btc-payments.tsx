import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bitcoin, Check, X, Clock, ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "wouter";

interface BtcPayment {
  id: string;
  userId: string | null;
  referenceType: string;
  referenceId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  usdAmount: string;
  btcAmount: string;
  btcPrice: string;
  discountPercent: string;
  originalUsdAmount: string;
  jcmovesAmount: string | null;
  jcmovesCredited: number;
  btcAddress: string;
  status: string;
  notes: string | null;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  verified: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  expired: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
};

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  job_payment: "Job Payment",
  jcmoves_purchase: "JCMOVES Token Purchase",
  shop_purchase: "Shop Item",
  jewelry: "Jewelry",
  sponsorship: "Sponsorship",
  general: "General",
};

function formatDate(dt: string) {
  return new Date(dt).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function AdminBtcPaymentsPage() {
  const { toast } = useToast();

  const { data: payments, isLoading, refetch } = useQuery<BtcPayment[]>({
    queryKey: ["/api/admin/btc-payments"],
    refetchInterval: 30000,
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/btc-payments/${id}/verify`, { status });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/btc-payments"] });
      const label = vars.status === "verified" ? "Payment verified — customer notified." : "Payment marked as " + vars.status;
      toast({ title: vars.status === "verified" ? "✅ Payment Confirmed" : "Updated", description: label });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const pending = payments?.filter(p => p.status === "pending") ?? [];
  const others = payments?.filter(p => p.status !== "pending") ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex items-center gap-4 mb-8">
          <Link href="/in-god-we-trust">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Admin Hub
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Bitcoin className="h-6 w-6 text-orange-400" />
              Bitcoin Payments
            </h1>
            <p className="text-slate-400 text-sm">Verify incoming BTC payments and notify customers</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto border-slate-600" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-slate-800/60 border border-yellow-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-yellow-400">{pending.length}</div>
            <div className="text-xs text-slate-400 mt-1">Pending Verification</div>
          </div>
          <div className="bg-slate-800/60 border border-emerald-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-400">
              {payments?.filter(p => p.status === "verified").length ?? 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">Verified</div>
          </div>
          <div className="bg-slate-800/60 border border-orange-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-orange-400">
              ${payments?.filter(p => p.status === "verified").reduce((s, p) => s + parseFloat(p.usdAmount || "0"), 0).toFixed(2) ?? "0.00"}
            </div>
            <div className="text-xs text-slate-400 mt-1">Total Verified (USD)</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          </div>
        ) : (
          <>
            {/* Pending Payments — action required */}
            {pending.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Awaiting Verification ({pending.length})
                </h2>
                <div className="space-y-3">
                  {pending.map(payment => (
                    <PaymentCard key={payment.id} payment={payment} onAction={(id, status) => verifyMutation.mutate({ id, status })} isPending={verifyMutation.isPending} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed/Other Payments */}
            {others.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">History</h2>
                <div className="space-y-3">
                  {others.map(payment => (
                    <PaymentCard key={payment.id} payment={payment} onAction={(id, status) => verifyMutation.mutate({ id, status })} isPending={verifyMutation.isPending} />
                  ))}
                </div>
              </div>
            )}

            {(!payments || payments.length === 0) && (
              <div className="text-center py-20">
                <Bitcoin className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No Bitcoin payments yet.</p>
                <p className="text-slate-500 text-sm mt-1">When customers pay via BTC for jobs or purchases, they'll appear here.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PaymentCard({ payment, onAction, isPending }: {
  payment: BtcPayment;
  onAction: (id: string, status: string) => void;
  isPending: boolean;
}) {
  const isExpired = payment.expiresAt && new Date(payment.expiresAt) < new Date() && payment.status === "pending";
  const refLabel = REFERENCE_TYPE_LABELS[payment.referenceType] || payment.referenceType;

  return (
    <Card className="bg-slate-800/60 border-slate-700/50">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[payment.status] ?? "bg-slate-700 text-slate-300"}`}>
                {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
              </span>
              <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-300">
                {refLabel}
              </Badge>
              {isExpired && (
                <span className="text-xs text-red-400 font-medium">⚠ Price Expired</span>
              )}
            </div>

            {/* Customer */}
            <div>
              <p className="font-semibold text-white">{payment.customerName}</p>
              <p className="text-sm text-slate-400">{payment.customerEmail}{payment.customerPhone ? ` · ${payment.customerPhone}` : ""}</p>
            </div>

            {/* Context */}
            {payment.notes && (
              <p className="text-sm text-slate-300 bg-slate-700/50 rounded px-3 py-1.5">{payment.notes}</p>
            )}

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">USD (after 10% off)</span>
                <span className="font-medium text-emerald-400">${parseFloat(payment.usdAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">BTC Amount</span>
                <span className="font-mono text-orange-300">{parseFloat(payment.btcAmount).toFixed(8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">BTC Price</span>
                <span className="text-slate-300">${parseFloat(payment.btcPrice).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Created</span>
                <span className="text-slate-300">{formatDate(payment.createdAt)}</span>
              </div>
              {payment.jcmovesAmount && parseFloat(payment.jcmovesAmount) > 0 && (
                <div className="flex justify-between col-span-2">
                  <span className="text-slate-400">JCMOVES to Credit</span>
                  <span className={payment.jcmovesCredited ? "text-emerald-400" : "text-yellow-300"}>
                    {parseFloat(payment.jcmovesAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })} JCMOVES
                    {payment.jcmovesCredited ? " ✓ Credited" : " (pending)"}
                  </span>
                </div>
              )}
            </div>

            {/* BTC Address */}
            <div className="bg-slate-900/60 rounded px-3 py-2">
              <p className="text-xs text-slate-500 mb-1">Send to address:</p>
              <p className="text-xs font-mono text-orange-300 break-all">{payment.btcAddress}</p>
            </div>

            {/* Link to blockchain explorer */}
            <a
              href={`https://blockchair.com/bitcoin/address/${payment.btcAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="h-3 w-3" />
              Check on Blockchain Explorer
            </a>
          </div>

          {/* Action Buttons */}
          {payment.status === "pending" && (
            <div className="flex flex-col gap-2 sm:min-w-[140px]">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                onClick={() => onAction(payment.id, "verified")}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                Verify & Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-950/30 w-full"
                onClick={() => onAction(payment.id, "expired")}
                disabled={isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Mark Expired
              </Button>
            </div>
          )}

          {payment.status === "verified" && payment.verifiedAt && (
            <div className="text-right text-xs text-slate-500">
              <Check className="h-4 w-4 text-emerald-400 ml-auto mb-1" />
              Verified
              <br />
              {formatDate(payment.verifiedAt)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
