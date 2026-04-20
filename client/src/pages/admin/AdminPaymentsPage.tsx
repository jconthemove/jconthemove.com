// Task #175 — Admin "Square Invoices" page (closet).
// Lists every Square invoice we've sent with status, paid time, and a
// deep-link to the public Square pay page so an operator can resend or
// follow up without leaving the admin closet.

import { useQuery } from "@tanstack/react-query";
import { CreditCard, ExternalLink } from "lucide-react";

interface InvoiceRow {
  id: string;
  square_invoice_id: string | null;
  lead_id: string | null;
  status: string;
  amount: string | number;
  sent_at: string | null;
  paid_at: string | null;
  public_url: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
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
  if (s === "paid") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "draft") return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  if (s === "canceled" || s === "void") return "bg-rose-500/15 text-rose-400 border-rose-500/30";
  return "bg-amber-500/15 text-amber-400 border-amber-500/30";
}

export default function AdminPaymentsPage() {
  const { data, isLoading } = useQuery<{ invoices: InvoiceRow[] }>({
    queryKey: ["/api/admin/square-invoices"],
  });
  const rows = data?.invoices ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">Square Invoices</h1>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading invoices…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No invoices on file yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Sent</th>
                  <th className="text-left px-4 py-3">Paid</th>
                  <th className="text-left px-4 py-3">Lead</th>
                  <th className="text-left px-4 py-3">Link</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-xs text-slate-400">{r.email ?? r.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{fmtMoney(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${statusPill(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.sent_at)}</td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(r.paid_at)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">
                      {r.lead_id ? r.lead_id.slice(0, 8) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.public_url ? (
                        <a href={r.public_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : "—"}
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
