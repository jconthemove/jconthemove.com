import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Award, 
  TrendingUp, 
  Calendar, 
  Coins, 
  Target, 
  Zap,
  Flame,
  Trophy,
  Settings,
  Eye,
  EyeOff,
  UserPlus,
  FileText,
  ShieldCheck,
  Briefcase
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { EmployeeReviews } from "@/components/employee-reviews";

interface GamificationStats {
  points: number;
  level: number;
  nextLevelPoints: number;
  currentLevelPoints: number;
  totalTokensEarned: string;
  streakCount: number;
  lastCheckInDate: string | null;
  achievements: any[];
  weeklyPoints: number;
  weeklyRank: number | null;
}

interface WalletData {
  tokenBalance: string;
  cashValue: string;
  pendingTokens: string;
  totalEarned: string;
}

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  serviceType: string;
  status: string;
  confirmedDate?: string;
  confirmedFromAddress?: string;
  confirmedToAddress?: string;
  tokenAllocation?: string;
  basePrice?: string;
  crewMembers?: string[];
}

interface WorkerAuthorityResponse {
  authority: {
    tier: "worker" | "bronze" | "silver" | "gold" | "platinum";
    promoCode?: string | null;
    leadsPostedCount: number;
    silverCompletedJobsCount: number;
    canPostLead: boolean;
    canBuildQuote: boolean;
    canApproveQuote: boolean;
    canManageOps: boolean;
  };
}

export default function EmployeeDashboard() {
  const [dashboardSettings, setDashboardSettings] = useState({
    showBalance: true,
    showUpcomingJobs: true,
    showPerformance: true,
    showStreaks: true,
    showReviews: true,
  });

  // Get current user
  const { data: user } = useQuery<{ id: string; email: string; role: string }>({
    queryKey: ["/api/auth/user"],
  });

  const { data: gamificationStats, isLoading: statsLoading } = useQuery<GamificationStats>({
    queryKey: ["/api/gamification/stats"],
  });

  const { data: walletData, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: ["/api/rewards/wallet"],
  });

  const { data: workerAuthority } = useQuery<WorkerAuthorityResponse>({
    queryKey: ["/api/workers/me/authority"],
  });

  const { data: myJobs = [], isLoading: jobsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads/my-jobs"],
  });

  // Filter upcoming jobs (confirmed but not completed)
  const upcomingJobs = myJobs.filter(
    job => job.status !== 'completed' && job.confirmedDate
  ).sort((a, b) => {
    if (!a.confirmedDate || !b.confirmedDate) return 0;
    return new Date(a.confirmedDate).getTime() - new Date(b.confirmedDate).getTime();
  });

  const toggleSetting = (key: keyof typeof dashboardSettings) => {
    setDashboardSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const tokenBalance = parseFloat(walletData?.tokenBalance || "0");
  const totalEarned = parseFloat(walletData?.totalEarned || "0");
  const pendingTokens = parseFloat(walletData?.pendingTokens || "0");
  const authority = workerAuthority?.authority;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white" data-testid="text-dashboard-title">
              My Dashboard
            </h1>
            <p className="text-slate-400 mt-1">
              Track your performance and upcoming work
            </p>
          </div>
          <Link href="/employee">
            <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10" data-testid="button-back-home">
              <Calendar className="h-4 w-4 mr-2" />
              Calendar View
            </Button>
          </Link>
        </div>

        {/* Dashboard Settings Toggle */}
        <Card className="bg-slate-800/50 border-slate-700" data-testid="card-dashboard-settings">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Settings className="h-5 w-5" />
              Customize Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={dashboardSettings.showBalance ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSetting('showBalance')}
                data-testid="toggle-balance"
              >
                {dashboardSettings.showBalance ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Token Balance
              </Button>
              <Button
                variant={dashboardSettings.showUpcomingJobs ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSetting('showUpcomingJobs')}
                data-testid="toggle-jobs"
              >
                {dashboardSettings.showUpcomingJobs ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Upcoming Jobs
              </Button>
              <Button
                variant={dashboardSettings.showPerformance ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSetting('showPerformance')}
                data-testid="toggle-performance"
              >
                {dashboardSettings.showPerformance ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Performance
              </Button>
              <Button
                variant={dashboardSettings.showStreaks ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSetting('showStreaks')}
                data-testid="toggle-streaks"
              >
                {dashboardSettings.showStreaks ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Streaks & Level
              </Button>
              <Button
                variant={dashboardSettings.showReviews ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSetting('showReviews')}
                data-testid="toggle-reviews"
              >
                {dashboardSettings.showReviews ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Customer Reviews
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/80 border-blue-500/30" data-testid="card-work-hub">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-blue-400" />
                  Work Hub
                </CardTitle>
                <CardDescription>
                  One place to post leads, build quotes, review approvals, and work current jobs.
                </CardDescription>
              </div>
              <Badge className="w-fit uppercase tracking-wide bg-blue-600/20 text-blue-200 border border-blue-500/40">
                {authority?.tier || "worker"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Link href="/book?mode=quick&worker=1">
                <Button variant="outline" className="w-full h-auto justify-start p-4 border-slate-700 bg-slate-950/40" disabled={authority ? !authority.canPostLead : false}>
                  <UserPlus className="h-5 w-5 mr-3 text-emerald-400" />
                  <span className="text-left">
                    <span className="block font-bold">Post quick lead</span>
                    <span className="block text-xs text-slate-400">Bronze: name, phone, service, notes/photos</span>
                  </span>
                </Button>
              </Link>
              <Link href="/book?mode=builder&worker=1">
                <Button variant="outline" className="w-full h-auto justify-start p-4 border-slate-700 bg-slate-950/40" disabled={authority ? !authority.canBuildQuote : false}>
                  <FileText className="h-5 w-5 mr-3 text-orange-400" />
                  <span className="text-left">
                    <span className="block font-bold">Build quote</span>
                    <span className="block text-xs text-slate-400">Silver: walk customer through details</span>
                  </span>
                </Button>
              </Link>
              <Link href={authority?.canApproveQuote ? "/admin/quote-review" : "/employee/dashboard"}>
                <Button variant="outline" className="w-full h-auto justify-start p-4 border-slate-700 bg-slate-950/40" disabled={authority ? !authority.canApproveQuote : false}>
                  <ShieldCheck className="h-5 w-5 mr-3 text-yellow-400" />
                  <span className="text-left">
                    <span className="block font-bold">Approve quotes</span>
                    <span className="block text-xs text-slate-400">Gold votes or Platinum/Darrell approval</span>
                  </span>
                </Button>
              </Link>
              <Link href="/crew/jobs">
                <Button variant="outline" className="w-full h-auto justify-start p-4 border-slate-700 bg-slate-950/40">
                  <Target className="h-5 w-5 mr-3 text-blue-400" />
                  <span className="text-left">
                    <span className="block font-bold">Work jobs</span>
                    <span className="block text-xs text-slate-400">Accept, start, and complete assigned work</span>
                  </span>
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-slate-400 text-xs uppercase tracking-wide">Promo / referral</p>
                <p className="text-white font-bold">{authority?.promoCode || "Assigned by admin"}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-slate-400 text-xs uppercase tracking-wide">Leads posted</p>
                <p className="text-white font-bold">{authority?.leadsPostedCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                <p className="text-slate-400 text-xs uppercase tracking-wide">Gold progress</p>
                <p className="text-white font-bold">{authority?.silverCompletedJobsCount ?? 0} / 100 completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Balance Section */}
        {dashboardSettings.showBalance && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white" data-testid="card-token-balance">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Coins className="h-5 w-5" />
                  Token Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {walletLoading ? (
                  <Skeleton className="h-12 w-full bg-white/20" />
                ) : (
                  <div>
                    <p className="text-4xl font-bold" data-testid="text-token-balance">
                      {tokenBalance.toFixed(2)}
                    </p>
                    <p className="text-blue-100 text-sm mt-1">JCMOVES Tokens</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white" data-testid="card-total-earned">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <TrendingUp className="h-5 w-5" />
                  Total Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                {walletLoading ? (
                  <Skeleton className="h-12 w-full bg-white/20" />
                ) : (
                  <div>
                    <p className="text-4xl font-bold" data-testid="text-total-earned">
                      {totalEarned.toFixed(2)}
                    </p>
                    <p className="text-green-100 text-sm mt-1">All-Time Tokens</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white" data-testid="card-pending-tokens">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5" />
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                {walletLoading ? (
                  <Skeleton className="h-12 w-full bg-white/20" />
                ) : (
                  <div>
                    <p className="text-4xl font-bold" data-testid="text-pending-tokens">
                      {pendingTokens.toFixed(2)}
                    </p>
                    <p className="text-purple-100 text-sm mt-1">Awaiting Transfer</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Performance Metrics */}
        {dashboardSettings.showPerformance && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-jobs-completed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Jobs Completed
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Target className="h-8 w-8 text-blue-500" />
                    <p className="text-3xl font-bold" data-testid="text-jobs-completed">
                      {myJobs.filter(j => j.status === 'completed').length}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-weekly-points">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Weekly Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Trophy className="h-8 w-8 text-yellow-500" />
                    <p className="text-3xl font-bold" data-testid="text-weekly-points">
                      {gamificationStats?.weeklyPoints || 0}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-weekly-rank">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Weekly Rank
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Award className="h-8 w-8 text-purple-500" />
                    <p className="text-3xl font-bold" data-testid="text-weekly-rank">
                      {gamificationStats?.weeklyRank ? `#${gamificationStats.weeklyRank}` : 'N/A'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-upcoming-jobs-count">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Upcoming Jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {jobsLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-8 w-8 text-green-500" />
                    <p className="text-3xl font-bold" data-testid="text-upcoming-jobs-count">
                      {upcomingJobs.length}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Streaks and Level */}
        {dashboardSettings.showStreaks && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-level-progress">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-yellow-500" />
                  Level Progress
                </CardTitle>
                <CardDescription>
                  Keep earning points to level up!
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Level {gamificationStats?.level || 1}</span>
                      <span className="text-sm font-medium">
                        {gamificationStats?.points || 0} / {gamificationStats?.nextLevelPoints || 100} pts
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-3 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            ((gamificationStats?.points || 0) / (gamificationStats?.nextLevelPoints || 100)) * 100
                          )}%`,
                        }}
                        data-testid="progress-level"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-streak">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-500" />
                  Daily Streak
                </CardTitle>
                <CardDescription>
                  Check in daily to maintain your streak
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-16 w-32" />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="text-5xl">🔥</div>
                    <div>
                      <p className="text-4xl font-bold" data-testid="text-streak-count">
                        {gamificationStats?.streakCount || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">days in a row</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Customer Reviews */}
        {dashboardSettings.showReviews && user?.id && (
          <EmployeeReviews employeeId={user.id} limit={5} showStats={true} />
        )}

        {/* Upcoming Jobs List */}
        {dashboardSettings.showUpcomingJobs && (
          <Card data-testid="card-upcoming-jobs-list">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Jobs
              </CardTitle>
              <CardDescription>
                Your scheduled jobs for the coming days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : upcomingJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No upcoming jobs scheduled</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Check the calendar for available jobs to accept
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                      data-testid={`job-item-${job.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                              job.status === 'completed' ? 'bg-green-500 shadow shadow-green-500/60'
                              : ['confirmed','accepted','in_progress'].includes(job.status) ? 'bg-yellow-400 shadow shadow-yellow-400/60'
                              : 'bg-red-500 shadow shadow-red-500/60 animate-pulse'
                            }`} />
                            <h4 className="font-semibold">
                              {job.firstName} {job.lastName}
                            </h4>
                            <Badge variant="outline" data-testid={`badge-service-${job.id}`}>
                              {job.serviceType}
                            </Badge>
                            <Badge
                              data-testid={`badge-status-${job.id}`}
                              className={
                                job.status === 'completed' ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                                : ['confirmed','accepted','in_progress'].includes(job.status) ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
                                : 'bg-red-500/15 text-red-300 border border-red-500/30'
                              }
                            >
                              {job.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          {job.confirmedDate && (
                            <p className="text-sm text-muted-foreground mb-2">
                              📅 {(() => {
                                try {
                                  const d = new Date(job.confirmedDate);
                                  return isNaN(d.getTime()) ? job.confirmedDate : format(d, 'EEEE, MMMM d, yyyy');
                                } catch {
                                  return job.confirmedDate;
                                }
                              })()}
                            </p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            {job.confirmedFromAddress && (
                              <p className="text-muted-foreground">
                                <span className="font-medium">From:</span> {job.confirmedFromAddress}
                              </p>
                            )}
                            {job.confirmedToAddress && (
                              <p className="text-muted-foreground">
                                <span className="font-medium">To:</span> {job.confirmedToAddress}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          {job.tokenAllocation && (
                            <div className="mb-2">
                              <p className="text-xs text-muted-foreground">Reward Pool</p>
                              <p className="font-bold text-green-600 dark:text-green-400">
                                {parseFloat(job.tokenAllocation).toFixed(2)} JCMOVES
                              </p>
                            </div>
                          )}
                          {job.basePrice && (
                            <div>
                              <p className="text-xs text-muted-foreground">Base Price</p>
                              <p className="font-semibold">
                                ${parseFloat(job.basePrice).toFixed(2)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
