import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Users, TrendingUp, BarChart2 } from "lucide-react";

interface TrafficData {
  monthly: { month: string; total_views: string; unique_visitors: string }[];
  topPages: { page: string; views: string; unique_visitors: string }[];
  daily: { day: string; views: string; unique_visitors: string }[];
  totals: {
    all_time_views: string;
    all_time_unique: string;
    this_month_views: string;
    this_month_unique: string;
  };
}

function fmt(n: string | number | undefined) {
  return Number(n || 0).toLocaleString();
}

function pageName(path: string) {
  if (!path || path === "/") return "Home";
  return path.replace(/^\//, "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleString("default", { month: "short", year: "numeric" });
}

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery<TrafficData>({
    queryKey: ["/api/admin/analytics/traffic"],
    refetchInterval: 60000,
  });

  const daily = data?.daily ?? [];
  const maxViews = Math.max(...daily.map(d => Number(d.views)), 1);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Site Traffic</h1>
        <p className="text-sm text-slate-500">Anonymous page-view analytics — all data stays on your server.</p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Eye, label: "All-Time Views", value: fmt(data?.totals?.all_time_views), color: "text-blue-400" },
          { icon: Users, label: "All-Time Visitors", value: fmt(data?.totals?.all_time_unique), color: "text-purple-400" },
          { icon: TrendingUp, label: "This Month Views", value: fmt(data?.totals?.this_month_views), color: "text-green-400" },
          { icon: Users, label: "This Month Visitors", value: fmt(data?.totals?.this_month_unique), color: "text-orange-400" },
        ].map(s => (
          <Card key={s.label} className="border-white/5 bg-white/[0.03]">
            <CardContent className="p-4 text-center">
              <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-1.5`} />
              <p className={`text-xl font-black ${s.color}`}>{isLoading ? "…" : s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Daily trend this month */}
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-400" />
              Daily Views — This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            {daily.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No data yet — traffic will appear here as visitors arrive.</p>
            ) : (
              <div className="space-y-1.5">
                {daily.map(d => (
                  <div key={d.day} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 w-24 shrink-0">{d.day.slice(5)}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 bg-blue-500 rounded-full"
                        style={{ width: `${Math.round((Number(d.views) / maxViews) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 w-10 text-right">{fmt(d.views)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top pages this month */}
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Top Pages — This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.topPages ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No page data yet.</p>
            ) : (
              <div className="space-y-2">
                {data?.topPages.map((p, i) => (
                  <div key={p.page} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}.</span>
                      <span className="text-xs text-white truncate">{pageName(p.page)}</span>
                      <span className="text-[10px] text-slate-600 truncate hidden sm:block">{p.page}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-slate-400">{fmt(p.views)} views</span>
                      <span className="text-xs text-slate-600">{fmt(p.unique_visitors)} uniq</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly history */}
        <Card className="border-white/5 bg-white/[0.03] md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-purple-400" />
              Monthly History (last 12 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.monthly ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No monthly data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/5">
                      <th className="text-left pb-2 pr-4 font-medium">Month</th>
                      <th className="text-right pb-2 pr-4 font-medium">Page Views</th>
                      <th className="text-right pb-2 font-medium">Unique Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.monthly.map(m => (
                      <tr key={m.month} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-1.5 pr-4 text-slate-300">{monthLabel(m.month)}</td>
                        <td className="py-1.5 pr-4 text-right text-blue-400 font-semibold">{fmt(m.total_views)}</td>
                        <td className="py-1.5 text-right text-purple-400 font-semibold">{fmt(m.unique_visitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-slate-600 mt-8">
        Visitor IDs are random and anonymous — stored in browser localStorage, never linked to personal data.
        No third-party services involved.
      </p>
    </div>
  );
}
