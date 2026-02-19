import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Lock, Unlock, Coins, Clock, ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "wouter";
import type { StakingTier, Stake } from "@shared/schema";

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

  const { data: myStakes = [] } = useQuery<(Stake & { tier: StakingTier })[]>({
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
            <p className="text-muted-foreground">Stake your tokens and earn 10%+ annual returns paid daily</p>
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
            <CardDescription>Choose a tier to stake your JCMOVES tokens. Higher tiers earn better annual returns. Unstake anytime.</CardDescription>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {tiers.map(tier => {
                const dailyRate = parseFloat(tier.annualRatePercent) / 365;
                const isSelected = selectedTier === tier.id;
                return (
                  <button
                    type="button"
                    key={tier.id}
                    onClick={() => setSelectedTier(isSelected ? null : tier.id)}
                    className={`w-full text-left rounded-xl border-2 p-4 transition-all active:scale-95 ${
                      isSelected
                        ? "border-yellow-500 bg-yellow-500/15 shadow-lg shadow-yellow-500/20"
                        : "border-muted-foreground/30 bg-card hover:border-yellow-500/50"
                    }`}
                  >
                    <div className="text-center space-y-1.5">
                      <Badge variant={isSelected ? "default" : "secondary"} className="text-xs">
                        {tier.name}
                      </Badge>
                      <div className="text-2xl font-bold text-yellow-500">{tier.annualRatePercent}%</div>
                      <p className="text-[10px] text-muted-foreground">Annual Return</p>
                      <div className="text-xs font-medium text-green-500">~{dailyRate.toFixed(4)}%/day</div>
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <p className="flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" /> {tier.durationDays}d term
                        </p>
                        <p>Min: {parseFloat(tier.minStake).toLocaleString()}</p>
                        <p className="flex items-center justify-center gap-1 text-green-500">
                          <Unlock className="h-3 w-3" /> Unstake anytime
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

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
              <div className="mt-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                <h3 className="font-semibold mb-3">Stake in {selectedTierData.name} Tier</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder={`Min ${parseFloat(selectedTierData.minStake).toLocaleString()} JCMOVES`}
                      value={stakeAmount}
                      onChange={e => setStakeAmount(e.target.value)}
                      min={parseFloat(selectedTierData.minStake)}
                      step="1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Available: {formatNumber(walletBalance)} JCMOVES
                      {stakeAmount && parseFloat(stakeAmount) > 0 && (
                        <span className="text-green-500">
                          {" "}| Daily earnings: ~{formatNumber(parseFloat(stakeAmount) * parseFloat(selectedTierData.annualRatePercent) / 365 / 100)} JCMOVES
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    onClick={() => setStakeAmount(walletBalance.toFixed(2))}
                    variant="outline"
                    size="sm"
                  >
                    Max
                  </Button>
                  <Button
                    onClick={() => stakeMutation.mutate({ tierId: selectedTier, amount: parseFloat(stakeAmount) })}
                    disabled={!stakeAmount || parseFloat(stakeAmount) <= 0 || stakeMutation.isPending}
                    className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white"
                  >
                    {stakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Active Stakes ({activeStakes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeStakes.map(stake => {
                  const pending = pendingRewards(stake);
                  const remaining = daysRemaining(stake.endsAt);
                  const totalDays = stake.tier.durationDays;
                  const elapsed = totalDays - remaining;
                  const progress = Math.min(100, (elapsed / totalDays) * 100);

                  return (
                    <div key={stake.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{stake.tier.name}</Badge>
                          <span className="font-bold text-lg">{formatNumber(parseFloat(stake.amount))} JCMOVES</span>
                        </div>
                        <Badge className="bg-green-500/20 text-green-500">{stake.tier.annualRatePercent}% APR</Badge>
                      </div>

                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-yellow-500 to-green-500 h-2 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Day {elapsed} of {totalDays}</span>
                        <span>{remaining} days remaining</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Earned</p>
                          <p className="font-semibold text-green-500">{formatNumber(parseFloat(stake.totalEarned || "0"))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Pending</p>
                          <p className="font-semibold text-yellow-500">{formatNumber(pending)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Daily Rate</p>
                          <p className="font-semibold">{(parseFloat(stake.dailyRate) * 100).toFixed(4)}%</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => claimMutation.mutate(stake.id)}
                          disabled={pending < 0.01 || claimMutation.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {claimMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Coins className="h-3 w-3 mr-1" />}
                          Claim {formatNumber(pending)}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unstakeMutation.mutate(stake.id)}
                          disabled={unstakeMutation.isPending}
                        >
                          {unstakeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
                          Unstake
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {completedStakes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Completed Stakes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {completedStakes.map(stake => (
                  <div key={stake.id} className="flex flex-wrap items-center justify-between border rounded-lg p-3 opacity-70 gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{stake.tier.name}</Badge>
                      <span>{formatNumber(parseFloat(stake.amount))} JCMOVES</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Earned: <span className="text-green-500 font-medium">{formatNumber(parseFloat(stake.totalEarned || "0"))}</span>
                    </div>
                    <Badge variant="outline">Unstaked</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-dashed">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">How Staking Works</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>1. Choose a staking tier - higher tiers earn better annual returns</li>
              <li>2. Stake your JCMOVES tokens to start earning</li>
              <li>3. Rewards accumulate every day based on your daily rate</li>
              <li>4. Claim your rewards anytime to add them to your wallet</li>
              <li>5. Unstake anytime - your full principal is always returned</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
