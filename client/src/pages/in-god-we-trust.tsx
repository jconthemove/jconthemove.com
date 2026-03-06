import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Users, Briefcase, Gem, Tag, Wallet, Star,
  Snowflake, Handshake, TrendingUp, Activity,
  Coins, ChevronRight, Shield, FileText, Gift
} from "lucide-react";

export default function InGodWeTrustPage() {
  const { data: adminStats } = useQuery<{ totalLeads: number; activeJobs: number; totalUsers: number }>({
    queryKey: ["/api/admin/stats"],
  });
  const { data: liveBalance } = useQuery<{ balance: number }>({
    queryKey: ["/api/solana/balance"],
    refetchInterval: 30000,
  });
  const { data: buybackFundData } = useQuery<{ burnWallet: { tokenBalance: number } }>({
    queryKey: ["/api/treasury/buyback-fund"],
    refetchInterval: 30000,
  });
  const { data: pendingPayouts } = useQuery<{ payouts: any[] }>({
    queryKey: ["/api/admin/payouts/pending"],
  });

  const pendingCount = pendingPayouts?.payouts?.length || 0;

  const mainTiles = [
    {
      href: "/admin/users",
      icon: Users,
      label: "Users",
      description: "View & manage all members, roles, and permissions",
      color: "from-orange-500 to-orange-600",
      shadow: "shadow-orange-900/30",
      stat: adminStats?.totalUsers != null ? `${adminStats.totalUsers} total` : null,
    },
    {
      href: "/dashboard",
      icon: Briefcase,
      label: "Jobs",
      description: "Active leads, assignments, and job tracking",
      color: "from-blue-500 to-blue-600",
      shadow: "shadow-blue-900/30",
      stat: adminStats?.activeJobs != null ? `${adminStats.activeJobs} active` : null,
    },
    {
      href: "/nature-made-jewls",
      icon: Gem,
      label: "Jewels",
      description: "Nature Made Jewls store listings and orders",
      color: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-900/30",
      stat: null,
    },
    {
      href: "/admin/promo-codes",
      icon: Tag,
      label: "Promo Codes & JCMOVES",
      description: "Discount codes, token disbursements, and reward settings",
      color: "from-purple-500 to-purple-600",
      shadow: "shadow-purple-900/30",
      stat: null,
    },
    {
      href: "/admin/marketplace",
      icon: Gift,
      label: "Rewards Marketplace",
      description: "Manage reward catalog, categories, pricing, and redemptions",
      color: "from-yellow-500 to-orange-500",
      shadow: "shadow-yellow-900/30",
      stat: null,
    },
  ];

  const secondaryTiles = [
    {
      href: "/admin/treasury",
      icon: Wallet,
      label: "Treasury & Finance",
      description: "Wallet, transfers, payouts, ledger, staking",
      badge: pendingCount > 0 ? `${pendingCount} pending` : null,
      badgeColor: "bg-amber-500",
    },
    {
      href: "/admin/testimonials",
      icon: Star,
      label: "Reviews",
      description: "Customer testimonials and star ratings",
      badge: null,
      badgeColor: "",
    },
    {
      href: "/admin/users",
      icon: Shield,
      label: "Employee Management",
      description: "Approve, assign, and manage crew members",
      badge: null,
      badgeColor: "",
    },
    {
      href: "/snow-removal",
      icon: Snowflake,
      label: "Snow Removal",
      description: "Seasonal service management",
      badge: null,
      badgeColor: "",
    },
    {
      href: "/sponsors",
      icon: Handshake,
      label: "Sponsorships",
      description: "Business sponsors and partnership tiers",
      badge: null,
      badgeColor: "",
    },
    {
      href: "/leads",
      icon: FileText,
      label: "All Leads",
      description: "Full leads list and status overview",
      badge: adminStats?.totalLeads != null ? `${adminStats.totalLeads} total` : null,
      badgeColor: "bg-blue-500",
    },
    {
      href: "/admin/pipeline",
      icon: Activity,
      label: "Job Pipeline A–Z",
      description: "Track every job from quote → review with full lifecycle view",
      badge: null,
      badgeColor: "",
      color: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-900/30",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Header */}
        <div className="text-center mb-8 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-500/10 to-blue-600/20 blur-3xl -z-10" />
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent mb-2 tracking-tight">
            IN GOD WE TRUST
          </h1>
          <p className="text-slate-400">Admin Command Center</p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
            <TrendingUp className="h-5 w-5 text-purple-400 mx-auto mb-1" />
            <div className="text-xl font-bold text-white">
              {(liveBalance?.balance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">JCMOVES Balance</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
            <Coins className="h-5 w-5 text-green-400 mx-auto mb-1" />
            <div className="text-xl font-bold text-white">
              {(buybackFundData?.burnWallet?.tokenBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">JCMOVES Burned</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
            <Activity className="h-5 w-5 text-blue-400 mx-auto mb-1" />
            <div className="text-xl font-bold text-white">{adminStats?.activeJobs ?? "—"}</div>
            <div className="text-xs text-slate-400 mt-0.5">Active Jobs</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
            <Users className="h-5 w-5 text-orange-400 mx-auto mb-1" />
            <div className="text-xl font-bold text-white">{adminStats?.totalUsers ?? "—"}</div>
            <div className="text-xs text-slate-400 mt-0.5">Total Users</div>
          </div>
        </div>

        {/* Main Tiles — one per primary category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {mainTiles.map((tile) => (
            <Link key={tile.href} href={tile.href}>
              <div className={`group bg-gradient-to-br ${tile.color} rounded-2xl p-5 cursor-pointer hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 shadow-xl ${tile.shadow} border-0 relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12" />
                <div className="flex items-start justify-between mb-3">
                  <tile.icon className="h-8 w-8 text-white/90" />
                  <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white/90 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-xl font-black text-white mb-0.5">{tile.label}</div>
                <div className="text-sm text-white/70 leading-snug">{tile.description}</div>
                {tile.stat && (
                  <div className="mt-2 inline-block text-xs font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
                    {tile.stat}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Secondary Tiles — everything else as compact links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {secondaryTiles.map((tile) => (
            <Link key={tile.href + tile.label} href={tile.href}>
              <div className="group flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 hover:border-slate-500/60 rounded-xl p-4 cursor-pointer hover:bg-slate-800/90 transition-all duration-150">
                <div className="flex-shrink-0 w-10 h-10 bg-slate-700/60 rounded-lg flex items-center justify-center group-hover:bg-slate-700 transition-colors">
                  <tile.icon className="h-5 w-5 text-slate-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate">{tile.label}</span>
                    {tile.badge && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full text-white ${tile.badgeColor}`}>
                        {tile.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{tile.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0 transition-colors" />
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
