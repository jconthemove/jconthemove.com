import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Users, TrendingUp, BarChart2, ShoppingBag, ExternalLink } from "lucide-react";
import { Link } from "wouter";

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

interface ShopData {
  totals: {
    all_time_views: string;
    all_time_unique: string;
    this_month_views: string;
    this_month_unique: string;
  };
  referrers: { source: string; visits: string; unique_visitors: string }[];
  topProducts: { page: string; views: string; unique_visitors: string; product_name: string | null }[];
  daily: { day: string; views: string; unique_visitors: string }[];
  monthly: { month: string; total_views: string; unique_visitors: string }[];
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
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", { month: "short", year: "numeric" });
}

const SOURCE_COLORS: Record<string, string> = {
  Instagram: "text-pink-400",
  Facebook: "text-blue-400",
  Google: "text-green-400",
  TikTok: "text-purple-400",
  "Twitter / X": "text-sky-400",
  Pinterest: "text-red-400",
  Snapchat: "text-yellow-400",
  YouTube: "text-red-500",
  Bing: "text-teal-400",
  "Direct / Unknown": "text-slate-400",
};

const SOURCE_ICONS: Record<string, string> = {
  Instagram: "📸",
  Facebook: "👤",
  Google: "🔍",
  TikTok: "🎵",
  "Twitter / X": "🐦",
  Pinterest: "📌",
  Snapchat: "👻",
  YouTube: "▶️",
  Bing: "🔍",
  "Direct / Unknown": "🔗",
};

function BarRow({ label, value, max, color, icon }: { label: string; value: number; max: number; color: string; icon?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base shrink-0 w-6">{icon}</span>
      <span className={`text-xs w-28 shrink-0 truncate ${color}`}>{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
        <div className="h-2 bg-current rounded-full" style={{ width: `${Math.round((value / Math.max(max, 1)) * 100)}%`, color: "inherit" }} />
      </div>
      <span className="text-xs text-slate-400 w-12 text-right shrink-0">{fmt(value)}</span>
    </div>
  );
}

function SiteTab({ data, isLoading }: { data: TrafficData | undefined; isLoading: boolean }) {
  const daily = data?.daily ?? [];
  const maxViews = Math.max(...daily.map(d => Number(d.views)), 1);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-blue-400" />Daily Views — This Month</CardTitle></CardHeader>
          <CardContent>
            {daily.length === 0 ? <p className="text-xs text-slate-500 text-center py-6">No data yet.</p> : (
              <div className="space-y-1.5">
                {daily.map(d => (
                  <div key={d.day} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 w-16 shrink-0">{d.day.slice(5)}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${Math.round((Number(d.views) / maxViews) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400 w-10 text-right">{fmt(d.views)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-400" />Top Pages — This Month</CardTitle></CardHeader>
          <CardContent>
            {(data?.topPages ?? []).length === 0 ? <p className="text-xs text-slate-500 text-center py-6">No page data yet.</p> : (
              <div className="space-y-2">
                {data?.topPages.map((p, i) => (
                  <div key={p.page} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}.</span>
                      <span className="text-xs text-white truncate">{pageName(p.page)}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-slate-400">{fmt(p.views)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.03] md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-purple-400" />Monthly History</CardTitle></CardHeader>
          <CardContent>
            {(data?.monthly ?? []).length === 0 ? <p className="text-xs text-slate-500 text-center py-6">No data yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 border-b border-white/5"><th className="text-left pb-2 pr-4 font-medium">Month</th><th className="text-right pb-2 pr-4 font-medium">Views</th><th className="text-right pb-2 font-medium">Unique Visitors</th></tr></thead>
                  <tbody>
                    {data?.monthly.map(m => (
                      <tr key={m.month} className="border-b border-white/[0.03]">
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
    </div>
  );
}

function ShopTab({ data, isLoading }: { data: ShopData | undefined; isLoading: boolean }) {
  const daily = data?.daily ?? [];
  const maxViews = Math.max(...daily.map(d => Number(d.views)), 1);
  const maxRef = Math.max(...(data?.referrers ?? []).map(r => Number(r.visits)), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-pink-950/30 border border-pink-500/20 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-5 w-5 text-pink-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-pink-300">Ashley's Shop — Nature Made Jewels</p>
            <p className="text-xs text-zinc-500">Traffic, referrers &amp; product views for <span className="text-zinc-400">/nature-made-jewls</span></p>
          </div>
        </div>
        <Link href="/nature-made-jewls">
          <a target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-pink-400 hover:text-pink-300 transition-colors shrink-0">
            View Shop <ExternalLink className="h-3 w-3" />
          </a>
        </Link>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "All-Time Views", value: fmt(data?.totals?.all_time_views), color: "text-pink-400" },
          { label: "All-Time Visitors", value: fmt(data?.totals?.all_time_unique), color: "text-purple-400" },
          { label: "This Month Views", value: fmt(data?.totals?.this_month_views), color: "text-green-400" },
          { label: "This Month Visitors", value: fmt(data?.totals?.this_month_unique), color: "text-orange-400" },
        ].map(s => (
          <Card key={s.label} className="border-white/5 bg-white/[0.03]">
            <CardContent className="p-4 text-center">
              <p className={`text-xl font-black ${s.color}`}>{isLoading ? "…" : s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Referrer breakdown */}
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">🌐 Where Visitors Come From (last 3 months)</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.referrers ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No referrer data yet — traffic will appear here as visitors arrive.</p>
            ) : (
              <div className="space-y-3">
                {data?.referrers.map(r => (
                  <div key={r.source} className="space-y-1">
                    <BarRow
                      label={r.source}
                      value={Number(r.visits)}
                      max={maxRef}
                      color={SOURCE_COLORS[r.source] || "text-slate-400"}
                      icon={SOURCE_ICONS[r.source] || "🔗"}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top products */}
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">💎 Most Viewed Products — This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.topProducts ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No product views yet this month.</p>
            ) : (
              <div className="space-y-2">
                {data?.topProducts.map((p, i) => (
                  <div key={p.page} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}.</span>
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{p.product_name || pageName(p.page)}</p>
                        <p className="text-[10px] text-slate-600 truncate">{p.page}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-pink-400 font-semibold">{fmt(p.views)} views</p>
                      <p className="text-[10px] text-slate-500">{fmt(p.unique_visitors)} uniq</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily trend */}
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-pink-400" />Daily Shop Visits — This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {daily.length === 0 ? <p className="text-xs text-slate-500 text-center py-6">No data yet.</p> : (
              <div className="space-y-1.5">
                {daily.map(d => (
                  <div key={d.day} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 w-16 shrink-0">{d.day.slice(5)}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-pink-500 rounded-full" style={{ width: `${Math.round((Number(d.views) / maxViews) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400 w-10 text-right">{fmt(d.views)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly history */}
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-pink-400" />Monthly Shop History</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.monthly ?? []).length === 0 ? <p className="text-xs text-slate-500 text-center py-6">No data yet.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 border-b border-white/5"><th className="text-left pb-2 pr-4 font-medium">Month</th><th className="text-right pb-2 pr-4 font-medium">Views</th><th className="text-right pb-2 font-medium">Visitors</th></tr></thead>
                <tbody>
                  {data?.monthly.map(m => (
                    <tr key={m.month} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-4 text-slate-300">{monthLabel(m.month)}</td>
                      <td className="py-1.5 pr-4 text-right text-pink-400 font-semibold">{fmt(m.total_views)}</td>
                      <td className="py-1.5 text-right text-purple-400 font-semibold">{fmt(m.unique_visitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-slate-600">
        Share your shop link — <span className="text-slate-500">jcontmove.com/nature-made-jewls</span> — on Instagram, Facebook, TikTok &amp; Pinterest to start building referrer data.
      </p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [tab, setTab] = useState<"site" | "shop">("site");

  const { data: siteData, isLoading: siteLoading } = useQuery<TrafficData>({
    queryKey: ["/api/admin/analytics/traffic"],
    refetchInterval: 60000,
  });

  const { data: shopData, isLoading: shopLoading } = useQuery<ShopData>({
    queryKey: ["/api/admin/analytics/shop"],
    refetchInterval: 60000,
    enabled: tab === "shop",
  });

  return (
    <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">Analytics</h1>
          <p className="text-sm text-slate-500">All data stays on your server — no third-party services.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("site")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "site" ? "bg-blue-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            🌐 Site Traffic
          </button>
          <button
            onClick={() => setTab("shop")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "shop" ? "bg-pink-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            💎 Ashley's Shop
          </button>
        </div>
      </div>

      {tab === "site" && <SiteTab data={siteData} isLoading={siteLoading} />}
      {tab === "shop" && <ShopTab data={shopData} isLoading={shopLoading} />}
    </div>
  );
}
