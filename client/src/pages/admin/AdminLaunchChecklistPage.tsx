// Task #175 - Admin "Launch Checklist" page (closet).
// One-click probe of every payment surface: env, Square, BTC, pricing,
// token rules, classifier, deposit gate, wallet, sweep. Operator runs it
// before publishing the deploy and watches each row turn green.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Rocket, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Scenario { id: string; label: string }
interface Result   { id: string; label: string; ok: boolean; detail: string; ranAt: string; ms: number }

export default function AdminLaunchChecklistPage() {
  const { data, isLoading } = useQuery<{ scenarios: Scenario[] }>({
    queryKey: ["/api/admin/launch-checklist"],
  });
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const scenarios = data?.scenarios ?? [];
  const allOk = scenarios.length > 0 && scenarios.every((s) => results[s.id]?.ok);

  async function run(id?: string) {
    if (id) setBusyId(id); else setBusyAll(true);
    try {
      const r = await apiRequest("POST", "/api/admin/launch-checklist/run", id ? { id } : {});
      const json = await r.json();
      const map = { ...results };
      for (const res of (json.results ?? []) as Result[]) map[res.id] = res;
      setResults(map);
    } finally {
      setBusyId(null); setBusyAll(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <Rocket className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold text-white">Launch Checklist</h1>
      </div>
      <p className="text-slate-400 mb-6 text-sm">
        Run every launch probe and confirm all rows are green before publishing a deploy or driving marketing traffic.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => run()}
          disabled={busyAll || isLoading}
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {busyAll ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running...</span> : "Run all"}
        </button>
        {scenarios.length > 0 && (
          <span className={`text-sm ${allOk ? "text-emerald-400" : "text-slate-400"}`}>
            {Object.keys(results).length} / {scenarios.length} run - {Object.values(results).filter(r => r.ok).length} green
          </span>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl divide-y divide-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading scenarios...</div>
        ) : (
          scenarios.map((s) => {
            const r = results[s.id];
            return (
              <div key={s.id} className="p-4 flex items-start gap-3">
                <div className="mt-0.5">
                  {!r ? <div className="w-5 h-5 rounded-full border border-slate-600" />
                    : r.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    : <XCircle className="w-5 h-5 text-rose-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{s.label}</div>
                  {r && (
                    <div className={`mt-1 text-xs ${r.ok ? "text-emerald-300/80" : "text-rose-300/90"}`}>
                      {r.detail} <span className="text-slate-500">- {r.ms}ms</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => run(s.id)}
                  disabled={busyId === s.id || busyAll}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs disabled:opacity-50"
                >
                  {busyId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Run"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
