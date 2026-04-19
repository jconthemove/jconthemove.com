import { useQuery } from "@tanstack/react-query";
import { Bitcoin, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";

export interface BlockchainStatus {
  detected: boolean;
  txid: string | null;
  confirmations: number;
  requiredConfirmations: number;
  mempoolUrl: string | null;
  seenAt: number | null;
  finalized: boolean;
}

export interface BtcPaymentStatusPayload {
  id: string;
  status: string;
  autoVerified?: boolean;
  autoVerifiedTxid?: string | null;
  verifiedAt?: string | null;
  blockchainStatus?: BlockchainStatus | null;
}

const fmtTime = (iso?: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
};

const truncTxid = (txid: string) => `${txid.slice(0, 8)}…${txid.slice(-6)}`;

export function BtcAutoConfirmStatus({
  paymentId,
  payment: payloadOverride,
  variant = "dark",
  className = "",
}: {
  paymentId?: string;
  // When provided, the component renders from this snapshot and does not
  // issue its own poll. Used by surfaces (e.g. customer profile) that
  // already poll a list endpoint and want to avoid duplicate fetches.
  payment?: BtcPaymentStatusPayload | null;
  variant?: "dark" | "light";
  className?: string;
}) {
  const { data: fetched } = useQuery<BtcPaymentStatusPayload>({
    queryKey: ["/api/btc/payment", paymentId],
    queryFn: async () => {
      const res = await fetch(`/api/btc/payment/${paymentId}`);
      if (!res.ok) throw new Error("Payment not found");
      return res.json();
    },
    enabled: !!paymentId && !payloadOverride,
    // Poll quickly while pending so customers see the auto-confirm transition
    // without refreshing. Slow down once we are in a terminal state.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 8000;
      return data.status === "pending" ? 8000 : 60_000;
    },
  });

  const payment = payloadOverride ?? fetched;
  if (!payment) return null;

  const chain = payment.blockchainStatus;
  const isAutoVerified = payment.status === "verified" && payment.autoVerified === true;
  const isManuallyVerified = payment.status === "verified" && !payment.autoVerified;
  const isPending = payment.status === "pending";
  const isExpiredOrCancelled = payment.status === "expired" || payment.status === "cancelled";

  if (isExpiredOrCancelled) return null;

  const dark = variant === "dark";
  const wrap = `rounded-xl border p-4 ${className}`;

  // Auto-confirmed: show the badge with txid linking to mempool.space.
  if (isAutoVerified) {
    const txid = payment.autoVerifiedTxid || chain?.txid || null;
    const url = txid ? `https://mempool.space/tx/${txid}` : chain?.mempoolUrl ?? null;
    const confirmedTime = fmtTime(payment.verifiedAt);
    return (
      <div
        className={`${wrap} ${
          dark
            ? "bg-emerald-900/30 border-emerald-500/40"
            : "bg-emerald-50 border-emerald-300"
        }`}
        data-testid="btc-auto-confirm-badge"
      >
        <div className={`flex items-start gap-3 ${dark ? "text-emerald-200" : "text-emerald-800"}`}>
          <div
            className={`shrink-0 rounded-full p-2 ${
              dark ? "bg-emerald-500/20" : "bg-emerald-100"
            }`}
          >
            <ShieldCheck className={`h-5 w-5 ${dark ? "text-emerald-300" : "text-emerald-600"}`} />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Auto-confirmed on the Bitcoin blockchain
              {confirmedTime ? <span className="font-normal opacity-80">at {confirmedTime}</span> : null}
            </p>
            <p className={`text-xs ${dark ? "text-emerald-300/80" : "text-emerald-700"}`}>
              Your payment was detected on-chain and verified automatically — no team action required.
            </p>
            {url && txid && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-xs font-mono mt-1 underline-offset-2 hover:underline ${
                  dark ? "text-emerald-300" : "text-emerald-700"
                }`}
                data-testid="btc-mempool-link"
              >
                <Bitcoin className="h-3 w-3" />
                {truncTxid(txid)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Verified manually (admin) — keep simple confirmation, no chain badge.
  if (isManuallyVerified) {
    return (
      <div
        className={`${wrap} ${
          dark ? "bg-emerald-900/30 border-emerald-500/40" : "bg-emerald-50 border-emerald-300"
        }`}
      >
        <p className={`text-sm font-bold flex items-center gap-1.5 ${dark ? "text-emerald-200" : "text-emerald-800"}`}>
          <CheckCircle2 className="h-4 w-4" />
          Payment confirmed by our team
        </p>
      </div>
    );
  }

  // Pending: show detection progress when we have a candidate tx.
  if (isPending && chain?.detected && chain.txid) {
    const needed = chain.requiredConfirmations || 1;
    const confs = chain.confirmations || 0;
    const url = chain.mempoolUrl || `https://mempool.space/tx/${chain.txid}`;
    return (
      <div
        className={`${wrap} ${
          dark ? "bg-amber-900/30 border-amber-500/40" : "bg-amber-50 border-amber-300"
        }`}
        data-testid="btc-detected-banner"
      >
        <div className={`flex items-start gap-3 ${dark ? "text-amber-200" : "text-amber-800"}`}>
          <Loader2 className={`h-5 w-5 mt-0.5 animate-spin ${dark ? "text-amber-300" : "text-amber-600"}`} />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-bold">
              {confs >= needed
                ? "Confirmed — finalizing your payment…"
                : confs > 0
                ? `${confs} of ${needed} confirmation${needed === 1 ? "" : "s"} seen — finalizing…`
                : "Detected on the blockchain — finalizing your hold…"}
            </p>
            <p className={`text-xs ${dark ? "text-amber-300/80" : "text-amber-700"}`}>
              You can safely close this page — we'll auto-confirm and email you the receipt.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-xs font-mono mt-1 underline-offset-2 hover:underline ${
                dark ? "text-amber-300" : "text-amber-700"
              }`}
            >
              <Bitcoin className="h-3 w-3" />
              {truncTxid(chain.txid)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Pending and not yet detected — quiet "watching" indicator.
  if (isPending) {
    return (
      <div
        className={`${wrap} ${
          dark ? "bg-slate-800/60 border-slate-600/60" : "bg-slate-50 border-slate-200"
        }`}
        data-testid="btc-watching-banner"
      >
        <div className={`flex items-center gap-2 text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Watching the blockchain for your payment — this page updates automatically.
        </div>
      </div>
    );
  }

  return null;
}
