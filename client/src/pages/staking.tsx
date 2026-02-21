import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Lock, Unlock, Coins, Clock, ArrowLeft, Sparkles, Diamond, PartyPopper } from "lucide-react";
import { Link } from "wouter";
import type { StakingTier, Stake } from "@shared/schema";

interface DiamondCelebration {
  active: boolean;
  daysLeft: number;
  bonusPercent: number;
}

type EnrichedStake = Stake & { tier: StakingTier; diamondCelebration?: DiamondCelebration };

function formatNumber(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function daysRemaining(endsAt: string | Date) {
  const end = new Date(endsAt);
  const now = new Date();
  const diff = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  return diff;
}

function pendingRewards(stake: Stake & { tier: StakingTier }) {
  const now = new Date();
  const lastPayout = new Date(stake.lastPayoutAt);
  const daysSince = (now.getTime() - lastPayout.getTime()) / (1000 * 60 * 60 * 24);
  const amount = parseFloat(stake.amount);
  const dailyRate = parseFloat(stake.dailyRate);
  return amount * dailyRate * daysSince;
}

export default function StakingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");

  const { data: tiers = [], isLoading: tiersLoading, isError: tiersError, refetch: refetchTiers } = useQuery<StakingTier[]>({
    queryKey: ["/api/staking/tiers"],
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });

  const { data: myStakes = [] } = useQuery<EnrichedStake[]>({
    queryKey: ["/api/staking/my-stakes"],
    enabled: isAuthenticated,
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });

  const { data: wallet } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/wallet/balance"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const res = await fetch("/api/wallet/balance", { credentials: "include" });
      if (!res.ok) return { tokenBalance: "0" };
      return res.json();
    },
  });

  const stakeMutation = useMutation({
    mutationFn: async ({ tierId, amount }: { tierId: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/staking/stake", { tierId, amount });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Staked successfully!", description: "Your tokens are now earning daily rewards." });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/my-stakes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      setStakeAmount("");
      setSelectedTier(null);
    },
    onError: (err: Error) => {
      toast({ title: "Staking failed", description: err.message, variant: "destructive" });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (stakeId: string) => {
      const res = await apiRequest("POST", `/api/staking/${stakeId}/claim`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Rewards claimed!", description: `+${formatNumber(data.earned)} JCMOVES added to your wallet.` });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/my-stakes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
    },
    onError: (err: Error) => {
      toast({ title: "Claim failed", description: err.message, variant: "destructive" });
    },
  });

  const unstakeMutation = useMutation({
    mutationFn: async (stakeId: string) => {
      const res = await apiRequest("POST", `/api/staking/${stakeId}/unstake`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Unstaked!", description: `${formatNumber(data.returned)} JCMOVES returned to your wallet.` });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/my-stakes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
    },
    onError: (err: Error) => {
      toast({ title: "Unstake failed", description: err.message, variant: "destructive" });
    },
  });

  const [liveTime, setLiveTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setLiveTime(Date.now()), 3000);
    return () => clearInterval(interval);
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const activeStakes = myStakes.filter(s => s.status === "active");
  const completedStakes = myStakes.filter(s => s.status !== "active");
  const totalStaked = activeStakes.reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const totalEarned = myStakes.reduce((sum, s) => sum + parseFloat(s.totalEarned || "0"), 0);
  const totalPending = activeStakes.reduce((sum, s) => sum + pendingRewards(s), 0);
  const walletBalance = parseFloat(wallet?.tokenBalance || "0");

  const selectedTierData = tiers.find(t => t.id === selectedTier);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
              JCMOVES Staking Treasury
            </h1>
            <p className="text-muted-foreground">Stake your tokens and earn 5%-30% annual returns paid daily</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-2xl font-bold">{formatNumber(walletBalance)}</p>
              <p className="text-xs text-muted-foreground">JCMOVES</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/10">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Staked</p>
              <p className="text-2xl font-bold">{formatNumber(totalStaked)}</p>
              <p className="text-xs text-muted-foreground">JCMOVES</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Earned</p>
              <p className="text-2xl font-bold">{formatNumber(totalEarned)}</p>
              <p className="text-xs text-muted-foreground">JCMOVES</p>
            </CardContent>
          </Card>
          <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/10">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Pending Rewards</p>
              <p className="text-2xl font-bold flex items-center justify-center gap-1">
                {formatNumber(totalPending)}
                {totalPending > 0 && <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />}
              </p>
              <p className="text-xs text-muted-foreground">JCMOVES {totalPending > 0 && "(growing live)"}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-500" />
              Staking Tiers
            </CardTitle>
            <CardDescription>Tap a tier below to select it, then enter the amount you want to stake. Higher tiers earn better annual returns. Unstake anytime.</CardDescription>
          </CardHeader>
          <CardContent>
            {tiersLoading && <div className="flex items-center justify-center py-8 gap-2"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-muted-foreground">Loading tiers...</span></div>}
            {!tiersLoading && (tiersError || tiers.length === 0) && (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground">Couldn't load staking tiers.</p>
                <Button variant="outline" onClick={() => refetchTiers()}>
                  Try Again
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {tiers.map(tier => {
                const dailyRate = parseFloat(tier.annualRatePercent) / 365;
                const isSelected = selectedTier === tier.id;
                const isFlexible = tier.durationDays === 0;
                const isDiamondTier = tier.name === "Diamond";
                const tierColors: Record<string, string> = {
                  "Flexible": "from-gray-500/20 to-slate-500/20",
                  "Bronze": "from-orange-800/20 to-amber-700/20",
                  "Silver": "from-gray-300/20 to-slate-300/20",
                  "Gold": "from-yellow-500/20 to-amber-400/20",
                  "Diamond": "from-cyan-400/20 to-blue-500/20",
                };
                return (
                  <button
                    type="button"
                    key={tier.id}
                    onClick={() => setSelectedTier(isSelected ? null : tier.id)}
                    className={`w-full text-left rounded-xl border-2 p-3 transition-all active:scale-95 bg-gradient-to-br ${tierColors[tier.name] || ""} ${
                      isSelected
                        ? "border-yellow-500 shadow-lg shadow-yellow-500/20 scale-[1.02] ring-2 ring-yellow-500/30"
                        : isDiamondTier ? "border-cyan-400/50 hover:border-cyan-400 hover:shadow-cyan-400/20 hover:shadow-md" : "border-muted-foreground/20 hover:border-yellow-500/50"
                    }`}
                  >
                    <div className="text-center space-y-1">
                      {isDiamondTier ? (
                        <Badge className="text-[10px] bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-0">
                          <Diamond className="h-3 w-3 mr-0.5" /> {tier.name}
                        </Badge>
                      ) : (
                        <Badge variant={isSelected ? "default" : "secondary"} className="text-[10px]">
                          {tier.name}
                        </Badge>
                      )}
                      <div className="text-xl font-bold text-yellow-500">{tier.annualRatePercent}%</div>
                      <p className="text-[10px] text-muted-foreground">APR</p>
                      {isDiamondTier && (
                        <div className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 rounded-full px-2 py-0.5 flex items-center justify-center gap-1">
                          <PartyPopper className="h-3 w-3" /> +10% Bonus (90 days)
                        </div>
                      )}
                      <div className="text-[10px] font-medium text-green-500">~{dailyRate.toFixed(4)}%/day</div>
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <p className="flex items-center justify-center gap-1">
                          {isFlexible ? (
                            <><Unlock className="h-3 w-3 text-green-500" /> No lockup</>
                          ) : (
                            <><Lock className="h-3 w-3" /> {tier.durationDays}d lockup</>
                          )}
                        </p>
                        <p>Min: {parseFloat(tier.minStake).toLocaleString()}</p>
                      </div>
                      <div className={`text-[10px] font-semibold mt-1 py-1 rounded ${isSelected ? "text-yellow-500" : "text-yellow-500/70"}`}>
                        {isSelected ? "Selected" : "Tap to Select"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {!selectedTier && tiers.length > 0 && isAuthenticated && (
              <div className="mt-4 p-4 rounded-lg border-2 border-dashed border-yellow-500/30 bg-yellow-500/5 text-center">
                <p className="text-muted-foreground flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                  Tap one of the tiers above to start staking your JCMOVES tokens
                </p>
              </div>
            )}
            {selectedTier && selectedTierData && !isAuthenticated && (
              <div className="mt-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-center">
                <p className="text-muted-foreground mb-3">Log in to start staking your JCMOVES tokens.</p>
                <Link href="/employee-login">
                  <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                    Log In to Stake
                  </Button>
                </Link>
              </div>
            )}
            {selectedTier && selectedTierData && isAuthenticated && (
              <div className="mt-6 p-5 rounded-xl border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-500/10 to-orange-500/5 shadow-lg shadow-yellow-500/10 animate-in fade-in slide-in-from-bottom-2">
                <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                  <Coins className="h-5 w-5 text-yellow-500" />
                  Deposit into {selectedTierData.name} Tier
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter how many JCMOVES you want to stake at {selectedTierData.annualRatePercent}% APR
                  {selectedTierData.durationDays > 0 ? ` (${selectedTierData.durationDays}-day lockup)` : " (no lockup - withdraw anytime)"}
                </p>
                {selectedTierData.name === "Diamond" && (
                  <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                      <PartyPopper className="h-4 w-4" />
                      Diamond Celebration Bonus
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      New Diamond stakers earn an extra +10% APR (40% total) for the first 90 days! After 90 days, your rate returns to the base 30% APR.
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        type="number"
                        placeholder={`Min ${parseFloat(selectedTierData.minStake).toLocaleString()} JCMOVES`}
                        value={stakeAmount}
                        onChange={e => setStakeAmount(e.target.value)}
                        min={parseFloat(selectedTierData.minStake)}
                        step="1"
                        className="text-lg h-12"
                      />
                    </div>
                    <Button
                      onClick={() => setStakeAmount(walletBalance.toFixed(2))}
                      variant="outline"
                      className="h-12 px-4"
                    >
                      Max
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Available: <span className="font-semibold text-foreground">{formatNumber(walletBalance)} JCMOVES</span></p>
                    {stakeAmount && parseFloat(stakeAmount) > 0 && (
                      <p className="text-green-500 font-medium mt-1">
                        Estimated daily earnings: ~{formatNumber(parseFloat(stakeAmount) * parseFloat(selectedTierData.annualRatePercent) / 365 / 100)} JCMOVES/day
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => stakeMutation.mutate({ tierId: selectedTier, amount: parseFloat(stakeAmount) })}
                    disabled={!stakeAmount || parseFloat(stakeAmount) <= 0 || stakeMutation.isPending}
                    className="w-full h-12 text-lg font-bold bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600"
                  >
                    {stakeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Lock className="h-5 w-5 mr-2" />}
                    Stake Tokens
                  </Button>
                </div>
              </div>
            )}

            {!isAuthenticated && (
              <div className="mt-6 p-4 rounded-lg border text-center">
                <p className="text-muted-foreground mb-2">Log in to start staking your JCMOVES tokens</p>
                <Link href="/employee-login">
                  <Button>Log In</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {activeStakes.length > 0 && (
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Active Stakes ({activeStakes.length})
            </h2>
            <div className="space-y-4">
              {activeStakes.map(stake => {
                const pending = pendingRewards(stake);
                const isFlexible = stake.tier.durationDays === 0;
                const remaining = isFlexible ? 0 : daysRemaining(stake.endsAt);
                const totalDays = stake.tier.durationDays;
                const startDate = new Date(stake.startedAt);
                const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                const elapsed = isFlexible ? daysSinceStart : totalDays - remaining;
                const progress = isFlexible ? 100 : Math.min(100, totalDays > 0 ? (elapsed / totalDays) * 100 : 100);

                const tierStyle: Record<string, { bg: string; border: string; accent: string; progressBar: string; badge: string; badgeText: string }> = {
                  "Diamond": {
                    bg: "bg-gradient-to-br from-cyan-950/80 via-blue-950/60 to-slate-950/80 dark:from-cyan-950/80 dark:via-blue-950/60 dark:to-slate-950/80",
                    border: "border-cyan-500/50",
                    accent: "text-cyan-300",
                    progressBar: "from-cyan-400 to-blue-500",
                    badge: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-0",
                    badgeText: "Diamond",
                  },
                  "Gold": {
                    bg: "bg-gradient-to-br from-yellow-950/80 via-amber-950/60 to-slate-950/80 dark:from-yellow-950/80 dark:via-amber-950/60 dark:to-slate-950/80",
                    border: "border-yellow-500/50",
                    accent: "text-yellow-300",
                    progressBar: "from-yellow-400 to-amber-500",
                    badge: "bg-gradient-to-r from-yellow-500 to-amber-600 text-white border-0",
                    badgeText: "Gold",
                  },
                  "Silver": {
                    bg: "bg-gradient-to-br from-slate-800/80 via-gray-800/60 to-slate-950/80 dark:from-slate-800/80 dark:via-gray-800/60 dark:to-slate-950/80",
                    border: "border-gray-400/50",
                    accent: "text-gray-200",
                    progressBar: "from-gray-300 to-slate-400",
                    badge: "bg-gradient-to-r from-gray-400 to-slate-500 text-white border-0",
                    badgeText: "Silver",
                  },
                  "Bronze": {
                    bg: "bg-gradient-to-br from-orange-950/80 via-amber-950/60 to-slate-950/80 dark:from-orange-950/80 dark:via-amber-950/60 dark:to-slate-950/80",
                    border: "border-orange-600/50",
                    accent: "text-orange-300",
                    progressBar: "from-orange-500 to-amber-700",
                    badge: "bg-gradient-to-r from-orange-700 to-amber-800 text-white border-0",
                    badgeText: "Bronze",
                  },
                  "Flexible": {
                    bg: "bg-gradient-to-br from-emerald-950/80 via-green-950/60 to-slate-950/80 dark:from-emerald-950/80 dark:via-green-950/60 dark:to-slate-950/80",
                    border: "border-emerald-500/50",
                    accent: "text-emerald-300",
                    progressBar: "from-emerald-400 to-green-500",
                    badge: "bg-gradient-to-r from-emerald-600 to-green-700 text-white border-0",
                    badgeText: "Flexible",
                  },
                };

                const style = tierStyle[stake.tier.name] || tierStyle["Flexible"];
                const effectiveApr = stake.diamondCelebration?.active 
                  ? parseFloat(stake.tier.annualRatePercent) + 10 
                  : parseFloat(stake.tier.annualRatePercent);

                return (
                  <div key={stake.id} className={`rounded-xl border-2 ${style.border} ${style.bg} p-4 space-y-3 shadow-lg`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className={style.badge}>
                          {stake.tier.name === "Diamond" && <Diamond className="h-3 w-3 mr-0.5" />}
                          {style.badgeText}
                        </Badge>
                        <span className="font-bold text-lg text-white">{formatNumber(parseFloat(stake.amount))} JCMOVES</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {stake.diamondCelebration?.active && (
                          <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-[10px]">
                            <PartyPopper className="h-3 w-3 mr-0.5" /> +10% Bonus ({stake.diamondCelebration.daysLeft}d)
                          </Badge>
                        )}
                        <span className={`font-bold text-sm ${style.accent}`}>{effectiveApr.toFixed(0)}% APR</span>
                      </div>
                    </div>

                    {!isFlexible && (
                      <>
                        <div className="w-full bg-black/30 rounded-full h-1.5">
                          <div
                            className={`bg-gradient-to-r ${style.progressBar} h-1.5 rounded-full transition-all`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Day {elapsed} of {totalDays}</span>
                          <span>{remaining} days remaining</span>
                        </div>
                      </>
                    )}
                    {isFlexible && (
                      <div className="text-xs text-emerald-400 flex items-center gap-1">
                        <Unlock className="h-3 w-3" /> No lockup - earning for {daysSinceStart} day{daysSinceStart !== 1 ? "s" : ""}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">Total Earned</p>
                        <p className="font-semibold text-green-400">{formatNumber(parseFloat(stake.totalEarned || "0"))}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Pending</p>
                        <p className="font-semibold text-yellow-400">{formatNumber(pending)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Daily Rate</p>
                        <p className="font-semibold text-white">{(parseFloat(stake.dailyRate) * 100).toFixed(4)}%</p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => claimMutation.mutate(stake.id)}
                        disabled={pending < 0.01 || claimMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                      >
                        {claimMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Coins className="h-3 w-3 mr-1" />}
                        Claim {formatNumber(pending)}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => unstakeMutation.mutate(stake.id)}
                        disabled={unstakeMutation.isPending}
                        className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                      >
                        {unstakeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
                        Unstake
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {completedStakes.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3 text-muted-foreground">Completed Stakes</h2>
            <div className="space-y-2">
              {completedStakes.map(stake => {
                const completedTierBorder: Record<string, string> = {
                  "Diamond": "border-cyan-800/30",
                  "Gold": "border-yellow-800/30",
                  "Silver": "border-gray-600/30",
                  "Bronze": "border-orange-800/30",
                  "Flexible": "border-emerald-800/30",
                };
                return (
                  <div key={stake.id} className={`flex flex-wrap items-center justify-between border ${completedTierBorder[stake.tier.name] || "border-muted"} rounded-lg p-3 opacity-60 gap-2 bg-muted/20`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{stake.tier.name}</Badge>
                      <span className="text-sm">{formatNumber(parseFloat(stake.amount))} JCMOVES</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Earned: <span className="text-green-500 font-medium">{formatNumber(parseFloat(stake.totalEarned || "0"))}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">Unstaked</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Card className="border-dashed">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">How Staking Works</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>1. Choose from 5 tiers - Flexible (5%), Bronze (10%), Silver (15%), Gold (20%), or Diamond (30%)</li>
              <li>2. Higher lockup periods earn better annual returns (5% to 30% APR)</li>
              <li>3. Stake your JCMOVES tokens to start earning daily rewards</li>
              <li>4. Claim your rewards anytime to add them to your wallet</li>
              <li>5. Unstake anytime with no penalty - your full deposit is always returned</li>
              <li className="text-cyan-500 font-medium">New Diamond tier celebration: earn 40% APR (30% + 10% bonus) for the first 90 days!</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
