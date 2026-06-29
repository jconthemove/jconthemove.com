import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Tags, TrendingUp, Package, Layers } from "lucide-react";

// ── types ─────────────────────────────────────────────────────────────────
interface BookingAnalyticsResponse {
  range: { from: string | null; to: string | null };
  single: { count: number; revenue: number; aov: number };
  bundle: { count: number; revenue: number; aov: number };
  attachRatePerPrimary: {
    serviceCode: string;
    totalBookings: number;
    bundleBookings: number;
    attachRate: number;
  }[];
  topCombinations: { combo: string[]; count: number; revenue: number }[];
  sourceBreakdown: {
    source: string;
    count: number;
    revenue: number;
    aov: number;
    bundleCount: number;
    bundleRate: number;
    promoCodes: string[];
    campaigns: string[];
    areas: string[];
    focuses: string[];
  }[];
  campaignBreakdown: {
    campaign: string;
    source: string;
    count: number;
    revenue: number;
    aov: number;
    promoCodes: string[];
    areas: string[];
    focuses: string[];
  }[];
}

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtSource = (source: string) => source.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

// ── Booking Analytics page ────────────────────────────────────────────────
export default function AdminBookingAnalyticsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const [from, setFrom] = useState<string>(monthAgo);
  const [to, setTo] = useState<string>(today);

  const { data, isLoading } = useQuery<BookingAnalyticsResponse>({
    queryKey: ["/api/admin/booking-analytics", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/booking-analytics?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Booking Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Single vs. bundle volume, attach rate, and top-performing combinations.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from-date" className="text-xs">From</Label>
            <Input
              id="from-date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="input-date-from"
            />
          </div>
          <div>
            <Label htmlFor="to-date" className="text-xs">To</Label>
            <Input
              id="to-date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="input-date-to"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-single-summary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" /> Single bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Count</div>
                  <div className="text-xl font-semibold">{data?.single.count ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="text-xl font-semibold">{fmtMoney(data?.single.revenue ?? 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">AOV</div>
                  <div className="text-xl font-semibold">{fmtMoney(data?.single.aov ?? 0)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-bundle-summary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" /> Bundle bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Count</div>
                  <div className="text-xl font-semibold">{data?.bundle.count ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="text-xl font-semibold">{fmtMoney(data?.bundle.revenue ?? 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">AOV</div>
                  <div className="text-xl font-semibold">{fmtMoney(data?.bundle.aov ?? 0)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-mix-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Single vs bundle mix</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (() => {
              const singleCt = data?.single.count ?? 0;
              const bundleCt = data?.bundle.count ?? 0;
              const total = singleCt + bundleCt;
              if (total === 0) {
                return <p className="text-sm text-muted-foreground">No bookings in range.</p>;
              }
              const singlePct = (singleCt / total) * 100;
              const bundlePct = 100 - singlePct;
              return (
                <div className="space-y-3">
                  <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${singlePct}%` }}
                      data-testid="bar-single"
                      title={`Single: ${singleCt} (${singlePct.toFixed(1)}%)`}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${bundlePct}%` }}
                      data-testid="bar-bundle"
                      title={`Bundle: ${bundleCt} (${bundlePct.toFixed(1)}%)`}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-sm bg-primary" />
                      Single — {singleCt} ({singlePct.toFixed(1)}%)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" />
                      Bundle — {bundleCt} ({bundlePct.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              );
            })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card data-testid="card-source-performance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" /> Source performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.sourceBreakdown.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No attributed bookings in range.</p>
            ) : (
              <div className="space-y-3">
                {data!.sourceBreakdown.map((row) => (
                  <div
                    key={row.source}
                    className="rounded-md border p-3 text-sm"
                    data-testid={`source-row-${row.source}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{fmtSource(row.source)}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.count} booking{row.count === 1 ? "" : "s"} · {fmtMoney(row.revenue)} · AOV {fmtMoney(row.aov)}
                        </div>
                      </div>
                      <Badge variant="secondary">{fmtPct(row.bundleRate)} bundle</Badge>
                    </div>
                    {(row.promoCodes.length > 0 || row.campaigns.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.promoCodes.slice(0, 4).map((code) => (
                          <Badge key={code} variant="outline" className="font-mono">Promo {code}</Badge>
                        ))}
                        {row.campaigns.slice(0, 4).map((campaign) => (
                          <Badge key={campaign} variant="outline" className="font-mono">Campaign {campaign}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-campaign-performance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4" /> Campaign performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.campaignBreakdown.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No campaign-tagged bookings in range.</p>
            ) : (
              <div className="space-y-2">
                {data!.campaignBreakdown.map((row) => (
                  <div
                    key={row.campaign}
                    className="flex flex-wrap items-center justify-between gap-2 border-b last:border-b-0 py-2 text-sm"
                    data-testid={`campaign-row-${row.campaign}`}
                  >
                    <div>
                      <div className="font-mono text-xs font-semibold">{row.campaign}</div>
                      <div className="text-xs text-muted-foreground">{fmtSource(row.source)}</div>
                    </div>
                    <div className="text-muted-foreground">{row.count} booking{row.count === 1 ? "" : "s"}</div>
                    <div className="font-semibold">{fmtMoney(row.revenue)}</div>
                    {row.promoCodes.length > 0 && (
                      <Badge variant="outline" className="font-mono">{row.promoCodes[0]}</Badge>
                    )}
                    {row.areas.slice(0, 1).map((area) => (
                      <Badge key={`area-${area}`} variant="secondary">{area}</Badge>
                    ))}
                    {row.focuses.slice(0, 1).map((focus) => (
                      <Badge key={`focus-${focus}`} variant="secondary">{focus}</Badge>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-attach-rate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Attach rate per primary service
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (data?.attachRatePerPrimary.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings in range.</p>
          ) : (
            <div className="space-y-2">
              {data!.attachRatePerPrimary.map((row) => (
                <div
                  key={row.serviceCode}
                  className="flex items-center justify-between text-sm border-b last:border-b-0 py-1"
                  data-testid={`attach-row-${row.serviceCode}`}
                >
                  <div className="font-mono text-xs">{row.serviceCode}</div>
                  <div className="text-muted-foreground">
                    {row.bundleBookings} of {row.totalBookings}
                  </div>
                  <div className="font-semibold w-16 text-right">{fmtPct(row.attachRate)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-top-combos">
        <CardHeader>
          <CardTitle className="text-base">Top 5 bundle combinations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (data?.topCombinations.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No bundles in range.</p>
          ) : (
            <div className="space-y-2">
              {data!.topCombinations.map((c, i) => (
                <div
                  key={c.combo.join("|")}
                  className="flex items-center justify-between text-sm border-b last:border-b-0 py-1"
                  data-testid={`combo-row-${i}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">#{i + 1}</Badge>
                    <span className="font-mono text-xs">{c.combo.join(" + ")}</span>
                  </div>
                  <div className="text-muted-foreground">{c.count} bookings</div>
                  <div className="font-semibold w-24 text-right">{fmtMoney(c.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
