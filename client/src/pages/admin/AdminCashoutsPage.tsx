// Task #175 — Admin "Cashouts" queue (closet).
// Surfaces every crew cashout request with the user, amount, and status.

import { useQuery } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

interface CashoutRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  amount_usd: string | number;
  status: string;
  requested_at: string;
  processed_at: string | null;
  note: string | null;
}

function fmtMoney(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function statusPill(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "paid" || s === "completed") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "pending" || s === "queued") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (s === "rejected" || s === "failed") return "bg-rose-500/15 text-rose-400 border-rose-500/30";
  return "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

export default function AdminCashoutsPage() {
  const { data, isLoading } = useQuery<{ requests: CashoutRow[]; note?: string }>({
    queryKey: ["/api/admin/cashouts"],
  });
  const rows = data?.requests ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Banknote className="w-6 h-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-white">Cashouts</h1>
      </div>

      {data?.note && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          {data.note}
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading cashouts…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No cashout requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">Requested</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Processed</th>
                  <th className="text-left px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.requested_at)}</td>
                    <td className="px-4 py-3">
                      <div>{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "—"}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtMoney(r.amount_usd)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${statusPill(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.processed_at)}</td>
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
