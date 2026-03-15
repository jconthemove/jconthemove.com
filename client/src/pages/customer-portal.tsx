import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Briefcase, Wallet, Gift, User, Zap, Coins, Clock, Users, Copy,
  Calendar, MapPin, ChevronRight, Loader2, Star,
  TrendingUp, Lock, ArrowUpRight, Phone, Mail
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LOYALTY_TIERS } from "@/lib/loyalty";
import QuoteForm from "@/components/QuoteForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LotteryPanel } from "@/components/lottery-panel";

interface WalletAccount {
  id: string;
  userId: string;
  tokenBalance: string;
  totalEarned: string;
  totalRedeemed: string;
}

interface MiningStatus {
  currentSession: any;
  accumulatedTokens: string;
  timeRemaining: number;
  totalClaimedToday: string;
  miningSpeed: string;
  streakCount: number;
  nextStreakBonus: string;
  claimsRemainingToday: number;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
  status: string;
  earnedDate: string;
}

interface ReferralStats {
  referralCount: number;
  totalEarned: number;
  referredUsers: Array<{ id: string; firstName?: string; lastName?: string; email?: string; createdAt: string }>;
}

interface CustomerJob {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  moveDate: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  estimatedTotal?: string;
  createdAt: string;
}

interface StakingTier {
  id: string;
  name: string;
  minAmount: string;
  apr: string;
  lockupDays: number;
  color: string;
}

interface Stake {
  id: string;
  amount: string;
  dailyRate: string;
  endsAt: string;
  status: string;
  lastPayoutAt: string;
  tier: StakingTier;
}

const REWARD_LABELS: Record<string, string> = {
  mining: "Mining Reward",
  daily_checkin: "Daily Check-in",
  lead_creation: "Job Creation Bonus",
  job_completion: "Job Completion",
  loyalty_booking: "Loyalty Reward",
  referral: "Referral Bonus",
  referral_request: "Referral Code Applied",
  referral_signup_bonus: "Referral Signup Bonus",
  referral_confirmed: "Referral Confirmed",
  signup_bonus: "Welcome Bonus",
};

function formatTokens(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysRemaining(endsAt: string) {
  const diff = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000));
  return diff;
}

function pendingStakeRewards(stake: Stake) {
  const daysSince = (Date.now() - new Date(stake.lastPayoutAt).getTime()) / 86400000;
  return parseFloat(stake.amount) * parseFloat(stake.dailyRate) * daysSince;
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed:   "border-green-500 text-green-400 bg-green-500/10",
    in_progress: "border-blue-500 text-blue-400 bg-blue-500/10",
    confirmed:   "border-purple-500 text-purple-400 bg-purple-500/10",
    cancelled:   "border-red-500 text-red-400 bg-red-500/10",
    pending:     "border-amber-500 text-amber-400 bg-amber-500/10",
  };
  return (
    <Badge variant="outline" className={`text-xs ${styles[status] || styles.pending}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}

export default function CustomerPortal() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const [activeTab, setActiveTab] = useState(urlParams.get("tab") || "jobs");
  const [animatedTokens, setAnimatedTokens] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet } = useQuery<WalletAccount>({ queryKey: ["/api/rewards/wallet"] });
  const { data: miningStatus } = useQuery<MiningStatus>({ queryKey: ["/api/mining/status"], refetchInterval: 5000 });
  const { data: rewardsHistory } = useQuery<RewardHistory[]>({ queryKey: ["/api/rewards/history"] });
  const { data: referralCode } = useQuery<{ referralCode: string }>({ queryKey: ["/api/referrals/my-code"] });
  const { data: referralStats } = useQuery<ReferralStats>({ queryKey: ["/api/referrals/stats"] });
  const { data: customerJobs = [], isLoading: jobsLoading } = useQuery<CustomerJob[]>({ queryKey: ["/api/leads/my-requests"] });
  const { data: stakes = [] } = useQuery<Stake[]>({ queryKey: ["/api/staking/my-stakes"] });

  useEffect(() => {
    if (!miningStatus?.currentSession) { setAnimatedTokens(0); return; }
    const server = parseFloat(miningStatus.accumulatedTokens || "0");
    setAnimatedTokens(server);
    const speed = parseFloat(miningStatus.miningSpeed || "1");
    const iv = setInterval(() => setAnimatedTokens(p => p + 0.0002 * speed), 100);
    return () => clearInterval(iv);
  }, [miningStatus?.currentSession, miningStatus?.accumulatedTokens, miningStatus?.miningSpeed]);

  const cycleProgress = useMemo(() => {
    if (!miningStatus?.currentSession || !miningStatus?.timeRemaining) return 0;
    const CYCLE = 24 * 60 * 60 * 1000;
    return Math.min(100, Math.max(0, ((CYCLE - miningStatus.timeRemaining) / CYCLE) * 100));
  }, [miningStatus?.timeRemaining, miningStatus?.currentSession]);

  const formatTimeRemaining = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const startMiningMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({ title: "Mining Started!", description: "Tokens are accumulating — claim them any time!" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/claim"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      toast({ title: "Tokens Claimed!", description: `+${parseFloat(data.tokensClaimed || "0").toFixed(2)} JCMOVES` });
    },
    onError: (e: any) => toast({ title: "Claim Failed", description: e.message, variant: "destructive" }),
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const totalEarned = parseFloat(wallet?.totalEarned || "0");
  const canClaim = !!miningStatus?.currentSession && parseFloat(miningStatus.accumulatedTokens || "0") > 0;
  const activeStakes = stakes.filter((s: Stake) => s.status === "active");

  const userTierKey = ((user as any)?.loyaltyTier as keyof typeof LOYALTY_TIERS) || "bronze";
  const tier = LOYALTY_TIERS[userTierKey] || LOYALTY_TIERS.bronze;
  const tierGradient = { bronze: "from-amber-900/30 to-amber-800/20", silver: "from-slate-700/30 to-slate-600/20", gold: "from-yellow-800/30 to-amber-700/20", vip: "from-purple-900/30 to-purple-800/20" }[userTierKey] ?? "from-amber-900/30 to-amber-800/20";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white pb-8">
      <div className="max-w-4xl mx-auto px-4 pt-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white">
              Welcome back, {user?.firstName || "Customer"} 👋
            </h1>
            <p className="text-slate-400 text-sm">{user?.email}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Balance</p>
            <p className="text-xl font-black text-orange-400">{formatTokens(tokenBalance)}</p>
            <p className="text-xs text-slate-500">JCMOVES</p>
          </div>
        </div>

        {/* ── Quick Stats ── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-black text-orange-400">{formatTokens(tokenBalance)}</p>
              <p className="text-slate-500 text-xs">Token Balance</p>
            </CardContent>
          </Card>
          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-black text-green-400">{customerJobs.length}</p>
              <p className="text-slate-500 text-xs">Total Jobs</p>
            </CardContent>
          </Card>
          <Card className={`border-white/5 bg-gradient-to-br ${tierGradient}`}>
            <CardContent className="p-3 text-center">
              <p className="text-lg font-black text-amber-400">{tier.label || userTierKey}</p>
              <p className="text-slate-500 text-xs">Loyalty Tier</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700/50 mb-6">
            <TabsTrigger value="jobs" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 text-xs sm:text-sm">
              <Briefcase className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">My Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="wallet" className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-orange-300 text-xs sm:text-sm">
              <Wallet className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Wallet</span>
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-300 text-xs sm:text-sm">
              <Gift className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Rewards</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-slate-600/20 data-[state=active]:text-slate-200 text-xs sm:text-sm">
              <User className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
          </TabsList>

          {/* ══ MY JOBS TAB ══ */}
          <TabsContent value="jobs" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">My Service Requests</h2>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 font-semibold"
                onClick={() => setQuoteOpen(true)}
              >
                + Request Quote
              </Button>
            </div>

            {jobsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
            ) : customerJobs.length === 0 ? (
              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="py-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400 mb-4">No service requests yet</p>
                  <Button className="bg-blue-600 hover:bg-blue-500" onClick={() => setQuoteOpen(true)}>
                    Request Your First Quote
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {customerJobs.map((job) => (
                  <Card key={job.id} className="border-white/5 bg-white/[0.03]">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <JobStatusBadge status={job.status} />
                          <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 text-xs">
                            {job.serviceType}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-500">{new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        {job.pickupAddress && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="text-slate-300">{job.pickupAddress}</span>
                          </div>
                        )}
                        {job.dropoffAddress && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                            <span className="text-slate-300">{job.dropoffAddress}</span>
                          </div>
                        )}
                        {job.moveDate && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-blue-400" />
                            <span className="text-slate-300">{new Date(job.moveDate).toLocaleDateString()}</span>
                          </div>
                        )}
                        {job.estimatedTotal && (
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                            <span className="text-slate-500 text-xs">Estimated</span>
                            <span className="text-green-400 font-bold">${job.estimatedTotal}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ══ WALLET TAB ══ */}
          <TabsContent value="wallet" className="space-y-4">

            {/* Balance Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Balance", value: formatTokens(tokenBalance), color: "text-orange-400" },
                { label: "Total Earned", value: formatTokens(totalEarned), color: "text-green-400" },
                { label: "Redeemed", value: formatTokens(parseFloat(wallet?.totalRedeemed || "0")), color: "text-blue-400" },
              ].map(s => (
                <Card key={s.label} className="border-white/5 bg-white/[0.03]">
                  <CardContent className="p-3 text-center">
                    <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                    <p className="text-slate-500 text-xs">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Mining Section */}
            <Card className="border-orange-500/20 bg-orange-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-orange-400" /> Daily Mining
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">Earn passive tokens every day — claim up to 3 times</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <div>
                    <p className="text-xs text-slate-400">Streak</p>
                    <p className="text-xl font-black text-orange-400">{miningStatus?.streakCount || 0} days</p>
                    {(miningStatus?.streakCount || 0) > 1 && (
                      <p className="text-xs text-green-400">+{miningStatus!.streakCount - 1}% bonus</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Available</p>
                    <p className="text-xl font-black text-green-400 tabular-nums">
                      {miningStatus?.currentSession ? animatedTokens.toFixed(4) : "0.0000"}
                    </p>
                    <p className="text-xs text-slate-500">JCMOVES</p>
                  </div>
                </div>

                {miningStatus?.currentSession && (
                  <div className="space-y-1.5 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                        </span>
                        Mining Active
                      </span>
                      <span className="text-orange-400">{formatTimeRemaining(miningStatus.timeRemaining)} left</span>
                    </div>
                    <Progress value={cycleProgress} className="h-2 bg-slate-700" />
                    <p className="text-xs text-slate-500 text-center">{miningStatus.claimsRemainingToday} of 3 claims remaining today</p>
                  </div>
                )}

                {!miningStatus?.currentSession ? (
                  <Button
                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 font-bold"
                    onClick={() => startMiningMutation.mutate()}
                    disabled={startMiningMutation.isPending}
                  >
                    {startMiningMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</> : <><Zap className="h-4 w-4 mr-2" />Start Mining</>}
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 font-bold"
                    onClick={() => claimMutation.mutate()}
                    disabled={!canClaim || claimMutation.isPending || (miningStatus?.claimsRemainingToday || 0) <= 0}
                  >
                    {claimMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Claiming...</> :
                     (miningStatus?.claimsRemainingToday || 0) <= 0 ? <><Clock className="h-4 w-4 mr-2" />Max Claims Today</> :
                     canClaim ? <><Coins className="h-4 w-4 mr-2" />Claim Tokens</> :
                     <><Clock className="h-4 w-4 mr-2" />Accumulating...</>}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Active Stakes */}
            {activeStakes.length > 0 && (
              <Card className="border-white/5 bg-white/[0.03]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white flex items-center gap-2 text-base">
                    <Lock className="h-4 w-4 text-blue-400" /> Active Stakes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeStakes.map((stake: Stake) => (
                    <div key={stake.id} className="p-3 bg-slate-900/50 rounded-lg border border-white/5">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-semibold text-white text-sm">{stake.tier?.name}</p>
                          <p className="text-xs text-slate-400">{formatTokens(parseFloat(stake.amount))} JCMOVES staked</p>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 text-sm font-bold">+{formatTokens(pendingStakeRewards(stake))}</p>
                          <p className="text-xs text-slate-500">pending</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>{daysRemaining(stake.endsAt)} days remaining</span>
                      </div>
                    </div>
                  ))}
                  <Link href="/staking">
                    <Button variant="outline" size="sm" className="w-full border-white/10 text-slate-400 hover:text-white mt-1">
                      Manage Staking <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {activeStakes.length === 0 && (
              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white text-sm">Token Staking</p>
                    <p className="text-slate-500 text-xs">Earn APR on your JCMOVES tokens</p>
                  </div>
                  <Link href="/staking">
                    <Button size="sm" variant="outline" className="border-white/10 text-slate-300 hover:text-white">
                      Stake <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Referral Code */}
            <Card className="border-blue-500/20 bg-blue-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-blue-400" /> Referral Program
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-slate-900/50 rounded-lg border border-white/5 font-mono text-base text-center text-white tracking-widest">
                    {referralCode?.referralCode || "Loading..."}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10"
                    onClick={() => {
                      if (referralCode?.referralCode) {
                        navigator.clipboard.writeText(referralCode.referralCode);
                        toast({ title: "Copied!", description: "Referral code copied to clipboard" });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-slate-900/50 rounded-lg border border-white/5">
                    <p className="text-blue-400 font-bold">{referralStats?.referralCount || 0}</p>
                    <p className="text-xs text-slate-500">Referrals</p>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded-lg border border-white/5">
                    <p className="text-green-400 font-bold">{formatTokens(referralStats?.totalEarned || 0)}</p>
                    <p className="text-xs text-slate-500">Earned</p>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between"><span>Friend signs up</span><span className="text-green-400">+50 JCMOVES</span></div>
                  <div className="flex justify-between"><span>Friend completes a job</span><span className="text-green-400">+2,500 JCMOVES</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Token History */}
            <Card className="border-white/5 bg-white/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-green-400" /> Earn History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!rewardsHistory?.length ? (
                  <p className="text-slate-500 text-sm text-center py-4">No history yet — start mining or book a job!</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {rewardsHistory.slice(0, 20).map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <div>
                          <p className="text-white text-sm">{REWARD_LABELS[r.rewardType] || r.rewardType}</p>
                          <p className="text-slate-500 text-xs">{new Date(r.earnedDate).toLocaleDateString()}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs ${r.status === "paid" || r.status === "completed"
                            ? "border-green-500 text-green-400"
                            : "border-slate-600 text-slate-400"}`}
                        >
                          +{parseFloat(r.tokenAmount).toFixed(2)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ MARKETPLACE TAB ══ */}
          <TabsContent value="marketplace" className="space-y-4">
            {/* Lottery Hero Card */}
            <Card
              className="border-yellow-500/30 bg-gradient-to-br from-yellow-950/60 via-amber-950/40 to-black cursor-pointer hover:border-yellow-500/60 transition-all"
              onClick={() => setLotteryOpen(true)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl">🎟️</div>
                    <div>
                      <p className="font-black text-white text-sm">JCMOVES Lottery</p>
                      <p className="text-yellow-400/70 text-xs">Weekly & Monthly Mega draws</p>
                    </div>
                  </div>
                  <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">10 JCMOVES/ticket</Badge>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="text-left">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Weekly Jackpot</p>
                    <p className="text-xl font-black text-yellow-400">1,000+ JCMOVES</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Mega Jackpot</p>
                    <p className="text-xl font-black text-purple-400">10,000+ JCMOVES</p>
                  </div>
                  <Button size="sm" className="bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xs">
                    Enter <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="text-center py-2">
              <h2 className="text-xl font-black text-white mb-1">Rewards Marketplace</h2>
              <p className="text-slate-400 text-sm mb-2">You have <span className="text-orange-400 font-bold">{formatTokens(tokenBalance)} JCMOVES</span> to spend</p>
              <Link href="/marketplace">
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-bold px-6">
                  Browse Marketplace <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Free Labor", sub: "30 min – 1 hr of service", icon: "🔧", tokens: "500+" },
                { label: "Gift Cards", sub: "Coffee, gas, grocery", icon: "🎁", tokens: "250+" },
                { label: "Moving Discount", sub: "25% off your next move", icon: "🚛", tokens: "1,500+" },
                { label: "Spin Wheel", sub: "Win tokens & prizes", icon: "🎡", tokens: "100" },
              ].map((item) => (
                <Card key={item.label} className="border-white/5 bg-white/[0.03]">
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl mb-2">{item.icon}</div>
                    <p className="font-bold text-white text-sm">{item.label}</p>
                    <p className="text-slate-500 text-xs mb-2">{item.sub}</p>
                    <Badge className="bg-orange-900/30 text-orange-300 border-orange-500/30 text-xs">{item.tokens} tokens</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Link href="/marketplace">
              <Button variant="outline" className="w-full border-white/10 text-slate-300 hover:text-white">
                See All Rewards <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </TabsContent>

          {/* ══ PROFILE TAB ══ */}
          <TabsContent value="profile" className="space-y-4">
            <Card className="border-white/5 bg-white/[0.03]">
              <CardContent className="p-5">
                <div className="flex items-center gap-4 mb-5">
                  <Avatar className="h-14 w-14 border-2 border-white/10">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-slate-700 text-white text-lg font-bold">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-white">{user?.firstName} {user?.lastName}</p>
                    <p className="text-slate-400 text-sm">{user?.email}</p>
                    <Badge className={`mt-1 bg-gradient-to-r ${tierGradient} text-white border-0 text-xs`}>
                      {tier.label || userTierKey} Member
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  {user?.phone && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="h-4 w-4" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-400">
                    <Mail className="h-4 w-4" />
                    <span>{user?.email}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Loyalty Tier Info */}
            <Card className="border-white/5 bg-white/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" /> Loyalty Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Current Tier</span>
                  <Badge className={`bg-gradient-to-r ${tierGradient} text-white border-0`}>
                    {tier.label || userTierKey}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Earn Rate</span>
                  <span className="text-green-400 font-semibold text-sm">{tier.tokensPerDollar || 50} tokens / $1 spent</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Lifetime Spend</span>
                  <span className="text-white font-semibold text-sm">${parseFloat(user?.totalCompletedSpend || "0").toFixed(2)}</span>
                </div>
                <Separator className="bg-white/5" />
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between"><span>Bronze</span><span>$0 spend</span></div>
                  <div className="flex justify-between"><span>Silver</span><span>$1,000 spend</span></div>
                  <div className="flex justify-between"><span>Gold</span><span>$2,500 spend</span></div>
                  <div className="flex justify-between"><span>VIP</span><span>$5,000 spend</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <div className="space-y-2">
              {[
                { href: "/profile", label: "Edit Profile & Wallet Settings", icon: User },
                { href: "/staking", label: "Manage Token Staking", icon: Lock },
                { href: "/marketplace", label: "Browse Rewards Marketplace", icon: Gift },
                { href: "/leave-review", label: "Leave a Review", icon: Star },
              ].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-300 text-sm">{label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                  </div>
                </Link>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={async () => {
                await apiRequest("POST", "/api/auth/logout", {});
                window.location.href = "/";
              }}
            >
              Sign Out
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Quote Dialog ── */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Request a Quote</DialogTitle>
          </DialogHeader>
          <QuoteForm variant="customer" onSuccess={() => { setQuoteOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/leads/my-requests"] }); }} showRewardsInfo />
        </DialogContent>
      </Dialog>

      {/* ── Lottery Panel ── */}
      <LotteryPanel open={lotteryOpen} onClose={() => setLotteryOpen(false)} />
    </div>
  );
}
