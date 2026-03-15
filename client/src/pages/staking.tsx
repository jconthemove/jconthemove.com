import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Lock, Unlock, Coins, Clock, ArrowLeft, Sparkles, Diamond, PartyPopper, Shield, AlertTriangle, Activity, Gauge, Copy, CheckCheck, ExternalLink, Wallet, Percent, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import type { StakingTier, Stake } from "@shared/schema";

interface DiamondCelebration {
  active: boolean;
  daysLeft: number;
  bonusPercent: number;
}

interface HealthData {
  healthScore: number;
  healthStatus: "critical" | "warning" | "healthy" | "strong";
  runwayDays: number;
  aprMultiplier: number;
  treasuryBalance: number;
  totalStaked: number;
  dailyObligations: number;
}

type EnrichedStake = Stake & { tier: StakingTier; diamondCelebration?: DiamondCelebration; autoCompound?: boolean };

interface PoolStats {
  totalStakers: number;
  totalActiveStaked: number;
  totalRewardsPaid: number;
  monthlyTreasuryInflow: number;
  treasuryBonusPct: number;
}

interface YieldSource {
  id: string;
  label: string;
  icon: string;
  monthlyUsd: number;
  enabled: boolean;
}

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

// ── ETH Staking types ──────────────────────────────────────────────────────
interface EthConfig {
  baseApy: number; validatorFeePct: number; userApy: number;
  minAmount: number; treasuryAddress: string; enabled: boolean;
}
interface EthStakeRow {
  id: number; amount: string; tx_hash: string | null; status: string;
  apy: string; validator_fee_pct: string; total_earned: string;
  last_payout_at: string; staked_at: string; unstake_requested_at: string | null;
}

function ethPending(stake: EthStakeRow): number {
  const now = new Date();
  const last = new Date(stake.last_payout_at);
  const days = (now.getTime() - last.getTime()) / 86400000;
  return parseFloat(stake.amount) * (parseFloat(stake.apy) / 100 / 365) * days;
}

function EthStakingView({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);
  const [, setLiveTime] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setLiveTime(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const { data: config } = useQuery<EthConfig>({
    queryKey: ["/api/eth-staking/config"],
    staleTime: 60000,
  });

  const { data: myStakes = [], refetch: refetchStakes } = useQuery<EthStakeRow[]>({
    queryKey: ["/api/eth-staking/my-stakes"],
    enabled: isAuthenticated,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const stakeMutation = useMutation({
    mutationFn: async (data: { amount: string; txHash: string }) => {
      const res = await apiRequest("POST", "/api/eth-staking/stake", { amount: data.amount, txHash: data.txHash || null });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "⟠ Stake submitted!", description: "Our team will verify your transaction and activate your stake within 24 hours." });
      setAmount(""); setTxHash("");
      refetchStakes();
    },
    onError: (e: Error) => toast({ title: "Staking failed", description: e.message, variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/eth-staking/${id}/claim`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Claim recorded!", description: data.message });
      refetchStakes();
    },
    onError: (e: Error) => toast({ title: "Claim failed", description: e.message, variant: "destructive" }),
  });

  const unstakeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/eth-staking/${id}/unstake`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Unstake requested", description: data.message });
      refetchStakes();
    },
    onError: (e: Error) => toast({ title: "Unstake failed", description: e.message, variant: "destructive" }),
  });

  const activeStakes = myStakes.filter(s => s.status === "active");
  const pendingStakes = myStakes.filter(s => s.status === "pending");
  const unstakingStakes = myStakes.filter(s => s.status === "unstaking");

  const totalEth = activeStakes.reduce((s, x) => s + parseFloat(x.amount), 0);
  const totalEarned = myStakes.reduce((s, x) => s + parseFloat(x.total_earned), 0);
  const totalPending = activeStakes.reduce((s, x) => s + ethPending(x), 0);
  const cfg = config ?? { baseApy: 5.0, validatorFeePct: 10, userApy: 4.50, minAmount: 0.01, treasuryAddress: "", enabled: true };

  function copyAddress() {
    if (!cfg.treasuryAddress) return;
    navigator.clipboard.writeText(cfg.treasuryAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
      active:  "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
      unstaking: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
      completed: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
      rejected: "bg-red-500/20 text-red-300 border border-red-500/30",
    };
    return map[s] || "bg-slate-600/20 text-slate-300";
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
          ⟠ Ethereum Staking
        </h1>
        <p className="text-muted-foreground mt-1">JC ON THE MOVE acts as your validator — you earn ETH rewards daily</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "ETH Staked", value: totalEth.toFixed(6), color: "blue", sub: "in active stakes" },
          { label: "Total Earned", value: totalEarned.toFixed(8), color: "emerald", sub: "ETH lifetime" },
          { label: "Pending Rewards", value: totalPending.toFixed(8), color: "purple", sub: "growing live" },
          { label: "Your APY", value: `${cfg.userApy.toFixed(2)}%`, color: "amber", sub: "annual return" },
        ].map(c => (
          <Card key={c.label} className={`border-${c.color}-500/30 bg-gradient-to-br from-${c.color}-500/10 to-${c.color}-900/5`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-xl font-bold mt-0.5">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* APY Breakdown */}
      <Card className="border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-indigo-950/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="h-5 w-5 text-blue-400" />
            <h3 className="font-bold text-lg text-blue-200">How Your Yield Works</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
              <p className="text-xs text-slate-400">Network Base APY</p>
              <p className="text-2xl font-black text-white mt-1">{cfg.baseApy.toFixed(2)}%</p>
              <p className="text-xs text-slate-500 mt-0.5">Ethereum PoS rate</p>
            </div>
            <div className="bg-red-950/30 rounded-xl p-3 border border-red-500/20 flex flex-col items-center justify-center">
              <p className="text-xs text-red-400">JC Validator Fee</p>
              <p className="text-2xl font-black text-red-300 mt-1">−{cfg.validatorFeePct.toFixed(0)}%</p>
              <p className="text-xs text-red-400/70 mt-0.5">Funds JC Treasury</p>
            </div>
            <div className="bg-emerald-950/30 rounded-xl p-3 border border-emerald-500/30">
              <p className="text-xs text-emerald-400">Your Net APY</p>
              <p className="text-2xl font-black text-emerald-300 mt-1">{cfg.userApy.toFixed(2)}%</p>
              <p className="text-xs text-emerald-500/80 mt-0.5">Paid to your wallet</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 border-t border-slate-700/40 pt-3">
            Example: Stake 1 ETH → earn ~{(cfg.userApy / 100 / 365).toFixed(8)} ETH/day · {(cfg.userApy / 100 / 12).toFixed(6)} ETH/month · {(cfg.userApy / 100).toFixed(6)} ETH/year
          </p>
          <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>JC ON THE MOVE functions as your liquid staking provider. Your ETH is pooled in the JC Treasury to operate as an Ethereum validator. Staking rewards are tracked on-platform and paid out manually on claim requests.</span>
          </div>
        </CardContent>
      </Card>

      {/* Stake form */}
      {isAuthenticated && (
        <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 to-blue-950/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-indigo-400" />
              <h3 className="font-bold text-lg text-indigo-200">Stake ETH</h3>
            </div>

            {cfg.treasuryAddress ? (
              <div className="bg-slate-900/70 rounded-xl border border-slate-700/60 p-3 space-y-2">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Step 1 — Send ETH to JC Treasury</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-blue-300 font-mono bg-slate-800/80 rounded-lg px-3 py-2 break-all border border-slate-700/40">
                    {cfg.treasuryAddress}
                  </code>
                  <Button variant="ghost" size="icon" onClick={copyAddress} className="h-8 w-8 shrink-0 text-slate-400 hover:text-white">
                    {copied ? <CheckCheck className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  {cfg.treasuryAddress.startsWith("0x") && (
                    <a href={`https://etherscan.io/address/${cfg.treasuryAddress}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-white">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500">Minimum stake: {cfg.minAmount} ETH · Only send ETH (ERC-20 tokens not accepted)</p>
              </div>
            ) : (
              <div className="bg-yellow-950/30 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
                Treasury address not yet configured. Contact JC ON THE MOVE to get started.
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Step 2 — Register Your Stake</p>
              <p className="text-xs text-slate-500">After sending, submit your stake details below for verification.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">ETH Amount Sent</label>
                <Input
                  type="number"
                  placeholder={`e.g. 0.5 (min ${cfg.minAmount})`}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white"
                  step="0.000001"
                  min={cfg.minAmount}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Transaction Hash (optional)</label>
                <Input
                  placeholder="0x..."
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white font-mono text-xs"
                />
              </div>
            </div>

            <Button
              onClick={() => stakeMutation.mutate({ amount, txHash })}
              disabled={!amount || parseFloat(amount) < cfg.minAmount || stakeMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold"
            >
              {stakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Stake — {amount ? `${amount} ETH` : "Enter Amount"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending stakes awaiting verification */}
      {pendingStakes.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-950/10">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-yellow-300 flex items-center gap-2"><Clock className="h-4 w-4" /> Pending Verification ({pendingStakes.length})</h3>
            {pendingStakes.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3 border border-yellow-500/20">
                <div>
                  <p className="font-semibold text-white">{parseFloat(s.amount).toFixed(6)} ETH</p>
                  <p className="text-xs text-slate-400 mt-0.5">Submitted {new Date(s.staked_at).toLocaleDateString()}</p>
                  {s.tx_hash && <p className="text-xs text-slate-500 font-mono mt-0.5">{s.tx_hash.slice(0, 20)}…</p>}
                </div>
                <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">Awaiting Verification</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active stakes */}
      {activeStakes.length > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-emerald-300 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active Stakes ({activeStakes.length})</h3>
            {activeStakes.map(s => {
              const pending = ethPending(s);
              return (
                <div key={s.id} className="bg-slate-900/50 rounded-xl px-4 py-4 border border-emerald-500/20 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white text-lg">{parseFloat(s.amount).toFixed(6)} ETH</p>
                      <p className="text-xs text-slate-400">Staked {new Date(s.staked_at).toLocaleDateString()} · {parseFloat(s.apy).toFixed(2)}% APY</p>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">Active</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-800/60 rounded-lg p-2.5">
                      <p className="text-slate-400 text-xs">Total Earned</p>
                      <p className="text-white font-semibold">{parseFloat(s.total_earned).toFixed(8)} ETH</p>
                    </div>
                    <div className="bg-purple-900/30 rounded-lg p-2.5 border border-purple-500/20">
                      <p className="text-purple-400 text-xs flex items-center gap-1"><Sparkles className="h-3 w-3" /> Pending Now</p>
                      <p className="text-purple-200 font-semibold">{pending.toFixed(8)} ETH</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => claimMutation.mutate(s.id)}
                      disabled={pending < 0.0001 || claimMutation.isPending}
                      className="flex-1 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/30"
                    >
                      {claimMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Coins className="h-3 w-3 mr-1" />}
                      Claim Rewards
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unstakeMutation.mutate(s.id)}
                      disabled={unstakeMutation.isPending}
                      className="flex-1 border-red-500/30 text-red-300 hover:bg-red-900/20"
                    >
                      {unstakeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
                      Request Unstake
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Unstaking */}
      {unstakingStakes.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-950/10">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-blue-300 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Unstaking ({unstakingStakes.length})</h3>
            {unstakingStakes.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3 border border-blue-500/20">
                <div>
                  <p className="font-semibold text-white">{parseFloat(s.amount).toFixed(6)} ETH</p>
                  <p className="text-xs text-slate-400 mt-0.5">Requested {s.unstake_requested_at ? new Date(s.unstake_requested_at).toLocaleDateString() : "—"}</p>
                </div>
                <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30">Processing 1–3 days</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Completed / empty state */}
      {isAuthenticated && myStakes.length === 0 && (
        <Card className="border-dashed border-slate-700/50">
          <CardContent className="p-8 text-center text-slate-500">
            <p className="text-4xl mb-3">⟠</p>
            <p className="font-semibold text-slate-400">No ETH stakes yet</p>
            <p className="text-sm mt-1">Send ETH to the treasury address above and submit your stake to start earning.</p>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="border-dashed border-slate-700/40">
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-slate-300">How ETH Staking Works</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-none">
            <li>1. JC ON THE MOVE pools staked ETH and runs Ethereum validator nodes on your behalf</li>
            <li>2. The Ethereum network pays ~{cfg.baseApy.toFixed(1)}% APY in staking rewards to validators</li>
            <li>3. JC takes a {cfg.validatorFeePct.toFixed(0)}% validator commission — this funds the JC Treasury for future business growth</li>
            <li>4. You receive {cfg.userApy.toFixed(2)}% APY on your staked ETH, claimable any time</li>
            <li>5. Claims are processed manually within 24 hours. Unstakes take 1–3 business days to process.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StakingPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"jcmoves" | "eth">("jcmoves");
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

  const { data: healthData } = useQuery<HealthData>({
    queryKey: ["/api/staking/health"],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: poolStats } = useQuery<PoolStats>({
    queryKey: ["/api/staking/pool-stats"],
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: yieldData } = useQuery<{ sources: YieldSource[]; treasuryBonusPct: number }>({
    queryKey: ["/api/staking/yield-sources"],
    staleTime: 60000,
  });

  const treasuryBonusPct = yieldData?.treasuryBonusPct ?? 0;
  const yieldSources = yieldData?.sources ?? [];
  const totalMonthlyInflow = yieldSources.filter(s => s.enabled).reduce((sum, s) => sum + (s.monthlyUsd || 0), 0);

  const toggleCompoundMutation = useMutation({
    mutationFn: async (stakeId: string) => {
      const res = await apiRequest("POST", `/api/staking/${stakeId}/toggle-compound`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staking/my-stakes"] });
    },
    onError: (err: Error) => {
      toast({ title: "Toggle failed", description: err.message, variant: "destructive" });
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
      if (data.autoCompounded) {
        toast({ title: "✨ Compounded!", description: data.message ?? `+${formatNumber(data.earned)} JCMOVES added back to your stake.` });
      } else {
        toast({ title: "Rewards claimed!", description: `+${formatNumber(data.earned)} JCMOVES added to your wallet.` });
      }
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
          <div className="flex-1">
            {/* Mode toggle — pill switch */}
            <div className="inline-flex items-center bg-slate-900/80 border border-slate-700/60 rounded-xl p-1 gap-1">
              <button
                onClick={() => setMode("jcmoves")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === "jcmoves"
                    ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🪙 JCMOVES Staking
              </button>
              <button
                onClick={() => setMode("eth")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  mode === "eth"
                    ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ⟠ Ethereum Staking
              </button>
            </div>
          </div>
        </div>

        {mode === "eth" && (
          <EthStakingView isAuthenticated={isAuthenticated} />
        )}

        {mode === "jcmoves" && (<>

        {/* ── Pool Statistics ── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Treasury Pool Statistics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Stakers", value: poolStats?.totalStakers ?? "—", sub: "active participants", icon: "👥", color: "from-violet-500/10 to-purple-500/10 border-violet-500/30" },
              { label: "Total Staked", value: poolStats ? `${formatNumber(poolStats.totalActiveStaked)} JCM` : "—", sub: "tokens locked", icon: "🔒", color: "from-yellow-500/10 to-orange-500/10 border-yellow-500/30" },
              { label: "Rewards Paid", value: poolStats ? `${formatNumber(poolStats.totalRewardsPaid)} JCM` : "—", sub: "all time", icon: "💰", color: "from-emerald-500/10 to-green-500/10 border-emerald-500/30" },
              { label: "Monthly Inflow", value: poolStats?.monthlyTreasuryInflow ? `$${poolStats.monthlyTreasuryInflow.toLocaleString()}` : "$0", sub: "from all sources", icon: "📈", color: "from-blue-500/10 to-cyan-500/10 border-blue-500/30" },
            ].map(c => (
              <Card key={c.label} className={`border bg-gradient-to-br ${c.color}`}>
                <CardContent className="p-3 text-center">
                  <p className="text-xl mb-0.5">{c.icon}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-bold mt-0.5 leading-tight">{c.value}</p>
                  <p className="text-[10px] text-muted-foreground">{c.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="text-2xl font-bold">{healthData ? formatNumber(healthData.treasuryBalance) : formatNumber(walletBalance)}</p>
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

        {healthData && (
          <Card className={`border-2 ${
            healthData.healthStatus === "strong" ? "border-green-500/40 bg-gradient-to-br from-green-950/30 to-emerald-950/20" :
            healthData.healthStatus === "healthy" ? "border-blue-500/40 bg-gradient-to-br from-blue-950/30 to-cyan-950/20" :
            healthData.healthStatus === "warning" ? "border-yellow-500/40 bg-gradient-to-br from-yellow-950/30 to-amber-950/20" :
            "border-red-500/40 bg-gradient-to-br from-red-950/30 to-rose-950/20"
          }`}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Treasury Health
                </h3>
                <Badge className={`text-xs font-bold ${
                  healthData.healthStatus === "strong" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                  healthData.healthStatus === "healthy" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                  healthData.healthStatus === "warning" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                  "bg-red-500/20 text-red-400 border-red-500/30"
                }`}>
                  {healthData.healthStatus === "strong" && <Shield className="h-3 w-3 mr-1" />}
                  {healthData.healthStatus === "warning" && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {healthData.healthStatus === "critical" && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {healthData.healthStatus.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-black/20 dark:bg-black/30 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">Health Score</p>
                  </div>
                  <p className={`text-2xl font-bold ${
                    healthData.healthScore >= 2 ? "text-green-400" :
                    healthData.healthScore >= 1.5 ? "text-blue-400" :
                    healthData.healthScore >= 1 ? "text-yellow-400" :
                    "text-red-400"
                  }`}>
                    {healthData.healthScore >= 999 ? "---" : `${healthData.healthScore.toFixed(1)}x`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Reserve / Staked</p>
                </div>

                <div className="rounded-lg bg-black/20 dark:bg-black/30 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">Runway</p>
                  </div>
                  <p className={`text-2xl font-bold ${
                    healthData.runwayDays > 365 ? "text-green-400" :
                    healthData.runwayDays > 180 ? "text-blue-400" :
                    healthData.runwayDays > 90 ? "text-yellow-400" :
                    "text-red-400"
                  }`}>
                    {healthData.runwayDays >= 99999 ? "---" :
                     healthData.runwayDays > 999 ? `${Math.floor(healthData.runwayDays / 365)}y+` :
                     `${healthData.runwayDays}d`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Days of payouts</p>
                </div>

                <div className="rounded-lg bg-black/20 dark:bg-black/30 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">APR Status</p>
                  </div>
                  <p className={`text-2xl font-bold ${
                    healthData.aprMultiplier >= 1 ? "text-green-400" :
                    healthData.aprMultiplier >= 0.75 ? "text-yellow-400" :
                    "text-red-400"
                  }`}>
                    {(healthData.aprMultiplier * 100).toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {healthData.aprMultiplier >= 1 ? "Full rates active" : "Rates adjusted"}
                  </p>
                </div>

                <div className="rounded-lg bg-black/20 dark:bg-black/30 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">Daily Payouts</p>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {healthData.dailyObligations > 0 ? formatNumber(healthData.dailyObligations) : "---"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">JCMOVES/day</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Treasury Reserve</span>
                  <span className="font-medium">{formatNumber(walletBalance)} JCMOVES</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total Staked (all users)</span>
                  <span className="font-medium text-green-400">{formatNumber(healthData.totalStaked)} JCMOVES</span>
                </div>
                <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      healthData.healthScore >= 2 ? "bg-gradient-to-r from-green-500 to-emerald-400" :
                      healthData.healthScore >= 1.5 ? "bg-gradient-to-r from-blue-500 to-cyan-400" :
                      healthData.healthScore >= 1 ? "bg-gradient-to-r from-yellow-500 to-amber-400" :
                      "bg-gradient-to-r from-red-500 to-rose-400"
                    }`}
                    style={{ width: `${Math.min(100, healthData.healthScore >= 999 ? 100 : (healthData.healthScore / 3) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0x</span>
                  <span className="text-yellow-500">1.5x</span>
                  <span className="text-green-500">2.0x</span>
                  <span>3.0x+</span>
                </div>
              </div>

              {healthData.aprMultiplier < 1 && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-2.5 text-xs text-yellow-400 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    APR rates are currently adjusted to {(healthData.aprMultiplier * 100).toFixed(0)}% of base rates due to treasury health.
                    Rates will return to full when the health score reaches 2.0x or above.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Treasury Yield Sources Dashboard ── */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 to-slate-950/10">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2 text-emerald-300">
                <TrendingUp className="h-5 w-5" /> Treasury Yield Sources
              </h3>
              {treasuryBonusPct > 0 && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-sm font-bold">
                  +{treasuryBonusPct.toFixed(2)}% Treasury Bonus Active
                </Badge>
              )}
            </div>

            {/* Dynamic APY breakdown */}
            {treasuryBonusPct > 0 && (
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                  <p className="text-xs text-slate-400">Base APR Range</p>
                  <p className="text-xl font-black text-white">5–30%</p>
                  <p className="text-xs text-slate-500">per tier</p>
                </div>
                <div className="bg-emerald-950/40 rounded-xl p-3 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400">Treasury Bonus</p>
                  <p className="text-xl font-black text-emerald-300">+{treasuryBonusPct.toFixed(2)}%</p>
                  <p className="text-xs text-emerald-500/70">from revenue</p>
                </div>
                <div className="bg-yellow-950/30 rounded-xl p-3 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400">Effective APR</p>
                  <p className="text-xl font-black text-yellow-300">{(5 + treasuryBonusPct).toFixed(2)}–{(30 + treasuryBonusPct).toFixed(2)}%</p>
                  <p className="text-xs text-yellow-500/70">total range</p>
                </div>
              </div>
            )}

            {/* Revenue source bars */}
            <div className="space-y-2.5">
              {yieldSources.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">Treasury yield sources will appear here as JC ON THE MOVE revenue grows.</p>
              )}
              {yieldSources.filter(s => s.enabled).map(src => {
                const pct = totalMonthlyInflow > 0 ? Math.round((src.monthlyUsd / totalMonthlyInflow) * 100) : 0;
                return (
                  <div key={src.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span className="text-base">{src.icon}</span>
                        {src.label}
                      </span>
                      <span className="text-slate-400 font-medium">
                        {src.monthlyUsd > 0 ? `$${src.monthlyUsd.toLocaleString()}/mo` : "Pending"}
                        {src.monthlyUsd > 0 && <span className="text-slate-600 ml-1">({pct}%)</span>}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {yieldSources.length > 0 && totalMonthlyInflow > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-700/40 text-sm font-semibold">
                  <span className="text-slate-300">Total Monthly Inflow</span>
                  <span className="text-emerald-300">${totalMonthlyInflow.toLocaleString()}/mo</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Revenue from moving services, digital products, ETH validator rewards, and token fees flows into the JC Treasury and funds staking rewards + treasury bonus APY.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-500" />
              Staking Tiers
            </CardTitle>
            <CardDescription>Tap a tier below to select it, then enter the amount you want to stake. Higher tiers earn better annual returns. Lockup tiers are locked until their timer expires.</CardDescription>
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
                const aprMultiplier = healthData?.aprMultiplier ?? 1;
                const effectiveApr = parseFloat(tier.annualRatePercent) * aprMultiplier;
                const totalApy = effectiveApr + treasuryBonusPct;
                const dailyRate = totalApy / 365;
                const isSelected = selectedTier === tier.id;
                const isFlexible = tier.durationDays === 0;
                const isDiamondTier = tier.name === "Diamond";
                const isAdjusted = aprMultiplier < 1;
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
                      <div className="text-xl font-bold text-yellow-500">
                        {totalApy.toFixed(1)}%
                      </div>
                      {isAdjusted ? (
                        <p className="text-[10px] text-muted-foreground line-through opacity-50">{tier.annualRatePercent}%</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">Base APR</p>
                      )}
                      {treasuryBonusPct > 0 && (
                        <div className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5">
                          +{treasuryBonusPct.toFixed(2)}% Bonus
                        </div>
                      )}
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
                  {selectedTierData.durationDays > 0 ? ` (locked for ${selectedTierData.durationDays} days - cannot withdraw early)` : " (no lockup - withdraw anytime)"}
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
                      <div className="space-y-1 mt-1">
                        <p className="text-green-500 font-medium">
                          ~{formatNumber(parseFloat(stakeAmount) * (parseFloat(selectedTierData.annualRatePercent) * (healthData?.aprMultiplier ?? 1) + treasuryBonusPct) / 365 / 100)} JCMOVES/day
                          {healthData && healthData.aprMultiplier < 1 && (
                            <span className="text-yellow-500 text-xs ml-1">(adjusted)</span>
                          )}
                        </p>
                        {treasuryBonusPct > 0 && (
                          <p className="text-xs text-emerald-400">Includes +{treasuryBonusPct.toFixed(2)}% treasury bonus</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Auto-compound toggle */}
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-700/60 bg-slate-900/50">
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-emerald-400" /> Auto-Compound Rewards
                      </p>
                      <p className="text-xs text-slate-500">When enabled, your daily rewards are automatically added back to your stake to maximize compounding growth.</p>
                    </div>
                    <p className="text-xs text-slate-500 italic mt-1">Enable per stake</p>
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
                        <span className={`font-bold text-sm ${style.accent}`}>
                          {(effectiveApr + treasuryBonusPct).toFixed(1)}% APR
                          {treasuryBonusPct > 0 && <span className="text-emerald-400 text-xs ml-1">(+{treasuryBonusPct.toFixed(2)}% bonus)</span>}
                        </span>
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

                    {/* Auto-compound toggle row */}
                    <button
                      type="button"
                      onClick={() => toggleCompoundMutation.mutate(stake.id)}
                      disabled={toggleCompoundMutation.isPending}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-sm ${
                        stake.autoCompound
                          ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-300"
                          : "border-slate-700/50 bg-slate-900/30 text-slate-400 hover:border-slate-600/70"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className={`h-3.5 w-3.5 ${stake.autoCompound ? "text-emerald-400" : "text-slate-500"}`} />
                        Auto-Compound Rewards
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        stake.autoCompound
                          ? "bg-emerald-500/30 text-emerald-300"
                          : "bg-slate-700/50 text-slate-500"
                      }`}>
                        {stake.autoCompound ? "ON" : "OFF"}
                      </span>
                    </button>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => claimMutation.mutate(stake.id)}
                        disabled={pending < 0.01 || claimMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                      >
                        {claimMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Coins className="h-3 w-3 mr-1" />}
                        {stake.autoCompound ? `Compound ${formatNumber(pending)}` : `Claim ${formatNumber(pending)}`}
                      </Button>
                      {(() => {
                        const isLocked = !isFlexible && remaining > 0;
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unstakeMutation.mutate(stake.id)}
                            disabled={unstakeMutation.isPending || isLocked}
                            className={isLocked 
                              ? "border-red-800/50 text-red-400/70 cursor-not-allowed opacity-60" 
                              : "border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"}
                            title={isLocked ? `Locked for ${remaining} more days` : "Withdraw your staked tokens"}
                          >
                            {unstakeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : isLocked ? <Lock className="h-3 w-3 mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
                            {isLocked ? `Locked (${remaining}d)` : "Unstake"}
                          </Button>
                        );
                      })()}
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
              <li>5. Lockup tiers (Bronze, Silver, Gold, Diamond) are locked until the timer expires. Flexible tier can be withdrawn anytime.</li>
              <li>6. APR rates adjust dynamically based on treasury health - ensuring long-term sustainability</li>
              <li className="text-cyan-500 font-medium">New Diamond tier celebration: earn 40% APR (30% + 10% bonus) for the first 90 days!</li>
            </ul>
          </CardContent>
        </Card>
        </>)}
      </div>
    </div>
  );
}
