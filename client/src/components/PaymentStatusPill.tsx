// Task #175 — Consolidated payment-status pill.
// Single React component reused by the crew's "today" job card and the
// admin job detail header so both surfaces always show the exact same
// payment state for a job. Backed by /api/payment-status/:leadId.

import { useQuery } from "@tanstack/react-query";

interface PaymentStatus {
  key: string;
  label: string;
  color: "green" | "yellow" | "blue" | "gray";
}

const COLOR_MAP: Record<PaymentStatus["color"], string> = {
  green:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  blue:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  gray:   "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function PaymentStatusPill({ leadId, className = "" }: { leadId: string; className?: string }) {
  const { data, isLoading } = useQuery<{ status: PaymentStatus }>({
    queryKey: ["/api/payment-status", leadId],
    enabled: !!leadId,
    // Re-fetch every minute so a deposit paid on Square shows up on the
    // crew card without a hard refresh.
    refetchInterval: 60_000,
  });

  if (isLoading || !data?.status) {
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${COLOR_MAP.gray} ${className}`}>
        …
      </span>
    );
  }
  const s = data.status;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${COLOR_MAP[s.color] ?? COLOR_MAP.gray} ${className}`}>
      {s.label}
    </span>
  );
}
