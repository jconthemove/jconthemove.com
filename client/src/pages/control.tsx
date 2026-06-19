import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Briefcase, Wallet, Tag, Gift, Star, Activity,
  Coins, ChevronRight, Shield, Bitcoin, MessageSquare,
  TrendingUp, Settings, BarChart3, FileText, Snowflake, FlaskConical
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

interface AdminStats {
  totalLeads: number;
  activeJobs: number;
  totalUsers: number;
}

interface LiveBalance {
  balance: number;
}

interface BuybackFund {
  burnWallet: { tokenBalance: number };
}

interface PendingPayouts {
  payouts: any[];
}

const SECTIONS = [
  {
    title: "Operations",
    items: [
      {
        href: "/crew",
        icon: Briefcase,
        label: "Crew Dashboard",
        description: "Today's jobs, schedule, and earnings",
        color: "from-blue-600 to-blue-700",
        statsKey: "activeJobs" as const,
        statsSuffix: "active jobs",
      },
      {
        href: "/leads",
        icon: FileText,
        label: "All Leads",
        description: "Full leads list with filters and detail views",
        color: "from-cyan-600 to-cyan-700",
        statsKey: "totalLeads" as const,
        statsSuffix: "total",
      },
      {
        href: "/admin/jobs",
        icon: Activity,
        label: "Job Pipeline",
        description: "Track every job from quote → completion A–Z",
        color: "from-amber-600 to-orange-600",
      },
      {
        href: "/ops/snow-removal",
        icon: Snowflake,
        label: "Snow Removal",
        description: "Seasonal snow service management",
        color: "from-sky-600 to-sky-700",
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        href: "/admin/users",
        icon: Users,
        label: "Users & Roles",
        description: "Manage all members, roles, and permissions",
        color: "from-orange-600 to-orange-700",
        statsKey: "totalUsers" as const,
        statsSuffix: "total",
      },
      {
        href: "/admin/testimonials",
        icon: Star,
        label: "Reviews",
        description: "Customer testimonials and star ratings",
        color: "from-yellow-600 to-yellow-700",
      },
      {
        href: "/sponsors",
        icon: Shield,
        label: "Sponsors",
        description: "Business sponsors and partnership tiers",
        color: "from-slate-600 to-slate-700",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        href: "/admin/treasury",
        icon: Wallet,
        label: "Treasury & Finance",
        description: "JCMOVES wallet, transfers, payouts, and ledger",
        color: "from-emerald-600 to-green-700",
        pendingKey: "pendingPayouts" as const,
      },
      {
        href: "/admin/btc-payments",
        icon: Bitcoin,
        label: "Bitcoin Payments",
        description: "Verify BTC payments and send confirmations",
        color: "from-orange-500 to-amber-600",
        pendingKey: "pendingBtc" as const,
      },
      {
        href: "/staking",
        icon: TrendingUp,
        label: "Staking",
        description: "Token reward tiers and health monitoring",
        color: "from-teal-600 to-teal-700",
      },
    ],
  },
  {
    title: "Marketplace & Rewards",
    items: [
      {
        href: "/admin/marketplace",
        icon: Gift,
        label: "Reward Catalog",
        description: "Manage reward items, categories, and redemptions",
        color: "from-purple-600 to-purple-700",
      },
      {
        href: "/admin/promo-codes",
        icon: Tag,
        label: "Promo Codes",
        description: "Discount codes, token disbursements, and settings",
        color: "from-pink-600 to-pink-700",
      },
      {
        href: "/admin/lottery",
        icon: Coins,
        label: "Lottery Control",
        description: "Weekly & Monthly Mega draws — rounds, winners, payouts",
        color: "from-yellow-600 to-amber-700",
      },
      {
        href: "/marketplace",
        icon: BarChart3,
        label: "View Marketplace",
        description: "See the marketplace as customers see it",
        color: "from-indigo-600 to-indigo-700",
      },
    ],
  },
  {
    title: "Quotes & Reviews",
    items: [
      {
        href: "/admin/quote-review",
        icon: MessageSquare,
        label: "Chatbot Quote Review",
        description: "Review and approve chatbot-submitted customer quotes",
        color: "from-teal-600 to-blue-700",
      },
      {
        href: "/pending-quotes",
        icon: FileText,
        label: "Pending Quotes",
        description: "Outstanding quoted leads awaiting review",
        color: "from-slate-500 to-slate-700",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        href: "/admin/calibrate",
        icon: FlaskConical,
        label: "Pricing Calibration",
        description: "Tune the booking chatbot pricing engine — set rates, JC222 promo, and save to database",
        color: "from-teal-600 to-emerald-700",
      },
      {
        href: "/admin/square-catalog",
        icon: Settings,
        label: "Square Catalog Mapping",
        description: "Map order package names to Square catalog variation IDs",
        color: "from-emerald-600 to-teal-700",
      },
      {
        href: "/admin/system-check",
        icon: Settings,
        label: "System Check",
        description: "Health checks, logs, and configuration",
        color: "from-slate-500 to-slate-700",
      },
    ],
  },
];

export default function AdminControlPage() {
  const { user } = useAuth();

  const { data: adminStats } = useQuery<AdminStats>({ queryKey: ["/api/admin/stats"] });
  const { data: liveBalance } = useQuery<LiveBalance>({ queryKey: ["/api/solana/balance"], refetchInterval: 30000 });
  const { data: buybackFund } = useQuery<BuybackFund>({ queryKey: ["/api/treasury/buyback-fund"], refetchInterval: 30000 });
  const { data: pendingPayouts } = useQuery<PendingPayouts>({ queryKey: ["/api/admin/payouts/pending"] });
  const { data: btcPayments } = useQuery<any[]>({ queryKey: ["/api/admin/btc-payments"] });

  const pendingPayoutCount = pendingPayouts?.payouts?.length || 0;
  const pendingBtcCount = btcPayments?.filter((p: any) => p.status === "pending").length || 0;

  const STAT_MAP: Record<string, number | undefined> = {
    activeJobs: adminStats?.activeJobs,
    totalLeads: adminStats?.totalLeads,
    totalUsers: adminStats?.totalUsers,
  };

  const PENDING_MAP: Record<string, number> = {
    pendingPayouts: pendingPayoutCount,
    pendingBtc: pendingBtcCount,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white pb-10">
      <div className="max-w-5xl mx-auto px-4 pt-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-3 px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full">
            <span className="text-blue-300 text-xs font-semibold uppercase tracking-wider">Admin</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent mb-2">
            IN GOD WE TRUST
          </h1>
          <p className="text-slate-400">Command Center — {user?.firstName}</p>
        </div>

        {/* Live Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { icon: Coins, label: "JCMOVES Balance", value: (liveBalance?.balance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), color: "text-purple-400" },
            { icon: TrendingUp, label: "JCMOVES Burned", value: (buybackFund?.burnWallet?.tokenBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), color: "text-green-400" },
            { icon: Activity, label: "Active Jobs", value: String(adminStats?.activeJobs ?? "—"), color: "text-blue-400" },
            { icon: Users, label: "Total Users", value: String(adminStats?.totalUsers ?? "—"), color: "text-orange-400" },
          ].map(s => (
            <Card key={s.label} className="border-white/5 bg-white/[0.03]">
              <CardContent className="p-4 text-center">
                <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-1.5`} />
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Alerts */}
        {(pendingPayoutCount > 0 || pendingBtcCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {pendingPayoutCount > 0 && (
              <Link href="/admin/treasury">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/20 border border-amber-500/40 rounded-lg cursor-pointer hover:bg-amber-500/30 transition-colors">
                  <Wallet className="h-4 w-4 text-amber-400" />
                  <span className="text-amber-300 text-sm font-semibold">{pendingPayoutCount} pending payout{pendingPayoutCount !== 1 ? "s" : ""}</span>
                  <ChevronRight className="h-3 w-3 text-amber-500" />
                </div>
              </Link>
            )}
            {pendingBtcCount > 0 && (
              <Link href="/admin/btc-payments">
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/20 border border-orange-500/40 rounded-lg cursor-pointer hover:bg-orange-500/30 transition-colors">
                  <Bitcoin className="h-4 w-4 text-orange-400" />
                  <span className="text-orange-300 text-sm font-semibold">{pendingBtcCount} BTC payment{pendingBtcCount !== 1 ? "s" : ""}</span>
                  <ChevronRight className="h-3 w-3 text-orange-500" />
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{section.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => {
                  const statValue = (item as any).statsKey ? STAT_MAP[(item as any).statsKey] : undefined;
                  const pendingValue = (item as any).pendingKey ? PENDING_MAP[(item as any).pendingKey] : 0;
                  return (
                    <Link key={item.href + item.label} href={item.href}>
                      <div className="group flex items-center gap-3 border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 rounded-xl p-4 cursor-pointer transition-all">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                          <item.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white text-sm">{item.label}</p>
                            {pendingValue > 0 && (
                              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{pendingValue}</span>
                            )}
                            {statValue !== undefined && (
                              <span className="text-slate-500 text-[10px]">{statValue} {(item as any).statsSuffix}</span>
                            )}
                          </div>
                          <p className="text-slate-500 text-xs leading-snug truncate">{item.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
