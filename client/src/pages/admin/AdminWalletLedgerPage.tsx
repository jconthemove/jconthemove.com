// Task #175 — Admin "Wallet Ledger" page (closet).
// Read-only stream of every JCMOVES USD wallet credit/debit so an
// operator can audit a customer balance dispute without opening psql.

import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";

interface LedgerRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  kind: string;
  amount_usd: string | number;
  balance_after: string | number;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
}

function fmtMoney(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function AdminWalletLedgerPage() {
  const { data, isLoading } = useQuery<{ entries: LedgerRow[]; note?: string }>({
    queryKey: ["/api/admin/wallet-ledger"],
  });
  const rows = data?.entries ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Coins className="w-6 h-6 text-amber-400" />
        <h1 className="text-2xl font-bold text-white">Wallet Ledger</h1>
      </div>

      {data?.note && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          {data.note}
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading ledger…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No wallet activity yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Kind</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-right px-4 py-3">Balance After</th>
                  <th className="text-left px-4 py-3">Ref</th>
                  <th className="text-left px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div>{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "—"}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{r.kind}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(r.amount_usd)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{fmtMoney(r.balance_after)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.ref_type ? `${r.ref_type}/${(r.ref_id ?? "").slice(0, 8)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{r.note ?? "—"}</td>
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
