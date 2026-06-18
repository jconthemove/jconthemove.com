// Task #175 - Admin "Launch Checklist" page (closet).
// One-click probe of every payment surface: env, Square, BTC, pricing,
// token rules, classifier, deposit gate, wallet, sweep. Operator runs it
// before publishing the deploy and watches each row turn green.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Rocket,
  XCircle,
} from "lucide-react";

interface Scenario { id: string; label: string }
interface Result   { id: string; label: string; ok: boolean; detail: string; ranAt: string; ms: number }

export default function AdminLaunchChecklistPage() {
  const { data, isLoading } = useQuery<{ scenarios: Scenario[] }>({
    queryKey: ["/api/admin/launch-checklist"],
  });
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const scenarios = data?.scenarios ?? [];
  const summary = useMemo(() => {
    const runResults = scenarios.map((s) => results[s.id]).filter(Boolean) as Result[];
    const green = runResults.filter((r) => r.ok).length;
    const red = runResults.filter((r) => !r.ok).length;
    const notRun = Math.max(0, scenarios.length - runResults.length);
    return {
      total: scenarios.length,
      run: runResults.length,
      green,
      red,
      notRun,
      allOk: scenarios.length > 0 && notRun === 0 && red === 0,
    };
  }, [results, scenarios]);

  const reportText = useMemo(() => {
    const lines = [
      "JC ON THE MOVE launch checklist",
      `Generated: ${new Date().toLocaleString()}`,
      `Status: ${summary.allOk ? "READY" : "NOT READY"}`,
      `Results: ${summary.green} green, ${summary.red} failed, ${summary.notRun} not run, ${summary.total} total`,
      "",
      ...scenarios.map((s) => {
        const r = results[s.id];
        if (!r) return `[NOT RUN] ${s.label}`;
        return `[${r.ok ? "PASS" : "FAIL"}] ${s.label} - ${r.detail} (${r.ms}ms)`;
      }),
    ];
    return lines.join("\n");
  }, [results, scenarios, summary]);

  async function run(id?: string) {
    if (id) setBusyId(id); else setBusyAll(true);
    try {
      const r = await apiRequest("POST", "/api/admin/launch-checklist/run", id ? { id } : {});
      const json = await r.json();
      const map = { ...results };
      for (const res of (json.results ?? []) as Result[]) map[res.id] = res;
      setResults(map);
      setCopyState("idle");
    } finally {
      setBusyId(null); setBusyAll(false);
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-2">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Rocket className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Launch Checklist</h1>
          </div>
          <p className="text-slate-400 text-sm max-w-3xl">
            Run every launch probe and confirm all rows are green before publishing a deploy or driving marketing traffic.
          </p>
        </div>
        <button
          onClick={copyReport}
          disabled={summary.run === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium disabled:opacity-50"
        >
          <ClipboardCopy className="w-4 h-4" />
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy report"}
        </button>
      </div>

      <div className={`mt-6 mb-5 rounded-xl border p-4 ${summary.allOk ? "border-emerald-500/30 bg-emerald-950/25" : "border-amber-500/30 bg-amber-950/20"}`}>
        <div className="flex items-start gap-3">
          {summary.allOk ? (
            <CheckCircle2 className="mt-0.5 w-5 h-5 text-emerald-300" />
          ) : (
            <AlertTriangle className="mt-0.5 w-5 h-5 text-amber-300" />
          )}
          <div>
            <div className={`font-semibold ${summary.allOk ? "text-emerald-100" : "text-amber-100"}`}>
              {summary.allOk ? "Ready for launch checks are passing" : "Not ready for launch yet"}
            </div>
            <div className="mt-1 text-sm text-slate-300">
              {summary.allOk
                ? "All required probes passed. Keep this report with the deploy notes before sending traffic."
                : "Run every probe and clear failed items before pushing paid traffic, worker links, or customer announcements."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        {[
          ["Total probes", summary.total, "text-slate-100"],
          ["Green", summary.green, "text-emerald-300"],
          ["Failed", summary.red, "text-rose-300"],
          ["Not run", summary.notRun, "text-amber-300"],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => run()}
          disabled={busyAll || isLoading}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {busyAll ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running...</span> : "Run all"}
        </button>
        {scenarios.length > 0 && (
          <span className={`text-sm ${summary.allOk ? "text-emerald-400" : "text-slate-400"}`}>
            {summary.run} / {summary.total} run - {summary.green} green
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
