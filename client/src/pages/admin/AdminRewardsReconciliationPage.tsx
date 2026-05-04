import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Scale } from "lucide-react";

type ReconciliationRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  token_balance: string;
  total_earned: string;
  total_redeemed: string;
  staked_balance: string;
  last_activity: string | null;
  reward_credits: string;
  reward_debits: string;
  reward_credit_count: number;
  reward_debit_count: number;
  last_reward_at: string | null;
  earned_delta: string;
  balance_delta: string;
};

type ReconciliationResponse = {
  rows: ReconciliationRow[];
  summary: {
    userCount: number;
    totalEarnedDelta: number;
    totalBalanceDelta: number;
  };
  filters: {
    limit: number;
    minDelta: number;
  };
};

function fmtTokens(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function AdminRewardsReconciliationPage() {
  const { data, isLoading } = useQuery<ReconciliationResponse>({
    queryKey: ["/api/admin/rewards-reconciliation"],
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="h-6 w-6 text-amber-400" />
        <div>
          <h2 className="text-xl font-bold text-white">Rewards Reconciliation</h2>
          <p className="text-sm text-slate-400">
            Compare wallet totals against the rewards ledger so drift shows up before customers do.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Users With Drift</p>
          <p className="mt-2 text-2xl font-black text-white">{data?.summary.userCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Earned Delta Sum</p>
          <p className="mt-2 text-2xl font-black text-amber-300">{fmtTokens(data?.summary.totalEarnedDelta ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Balance Delta Sum</p>
          <p className="mt-2 text-2xl font-black text-sky-300">{fmtTokens(data?.summary.totalBalanceDelta ?? 0)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            `Earned delta` compares <span className="font-semibold">wallet `total_earned`</span> to
            positive reward rows only. `Balance delta` compares the current token balance to reward
            credits plus reward debits. Large non-zero values usually mean older wallet writes bypassed
            the rewards ledger.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading reconciliation…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No reconciliation drift above the current threshold.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-right">Wallet Earned</th>
                  <th className="px-4 py-3 text-right">Reward Credits</th>
                  <th className="px-4 py-3 text-right">Earned Delta</th>
                  <th className="px-4 py-3 text-right">Wallet Balance</th>
                  <th className="px-4 py-3 text-right">Reward Debits</th>
                  <th className="px-4 py-3 text-right">Balance Delta</th>
                  <th className="px-4 py-3 text-left">Last Reward</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {rows.map((row) => (
                  <tr key={row.user_id} className="border-t border-slate-800 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {[row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || row.user_id}
                      </div>
                      <div className="text-xs text-slate-500">{row.email || "No email"} • {row.role || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtTokens(row.total_earned)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtTokens(row.reward_credits)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-300">{fmtTokens(row.earned_delta)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtTokens(row.token_balance)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{fmtTokens(row.reward_debits)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-300">{fmtTokens(row.balance_delta)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      <div>{fmtDate(row.last_reward_at)}</div>
                      <div>{row.reward_credit_count} credits / {row.reward_debit_count} debits</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
