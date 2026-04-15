import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, TrendingUp, Lock, Unlock, Coins, Clock, ArrowLeft, Sparkles,
  Shield, AlertTriangle, Copy, CheckCheck, ExternalLink, Wallet, Percent,
  AlertCircle, Zap, Trophy, Star, Crown, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

function fmt(n: number, dp = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ── ETH Staking (unchanged) ─────────────────────────────────────────────────

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
  const days = (Date.now() - new Date(stake.last_payout_at).getTime()) / 86400000;
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

  const { data: config } = useQuery<EthConfig>({ queryKey: ["/api/eth-staking/config"], staleTime: 60000 });
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
      setAmount(""); setTxHash(""); refetchStakes();
    },
    onError: (e: Error) => toast({ title: "Staking failed", description: e.message, variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/eth-staking/${id}/claim`, {})).json(),
    onSuccess: (data) => { toast({ title: "Claim recorded!", description: data.message }); refetchStakes(); },
    onError: (e: Error) => toast({ title: "Claim failed", description: e.message, variant: "destructive" }),
  });

  const unstakeMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/eth-staking/${id}/unstake`, {})).json(),
    onSuccess: (data) => { toast({ title: "Unstake requested", description: data.message }); refetchStakes(); },
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
    navigator.clipboard.writeText(cfg.treasuryAddress).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">⟠ Ethereum Staking</h1>
        <p className="text-muted-foreground mt-1">JC ON THE MOVE acts as your validator — you earn ETH rewards daily</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-900/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">ETH Staked</p>
            <p className="text-xl font-bold mt-0.5">{totalEth.toFixed(6)}</p>
            <p className="text-xs text-muted-foreground">in active stakes</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-900/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Earned</p>
            <p className="text-xl font-bold mt-0.5">{totalEarned.toFixed(8)}</p>
            <p className="text-xs text-muted-foreground">ETH lifetime</p>
          </CardContent>
        </Card>
        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-900/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Pending Rewards</p>
            <p className="text-xl font-bold mt-0.5">{totalPending.toFixed(8)}</p>
            <p className="text-xs text-muted-foreground">growing live</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Your APY</p>
            <p className="text-xl font-bold mt-0.5">{cfg.userApy.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">annual return</p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-indigo-950/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2"><Percent className="h-5 w-5 text-blue-400" /><h3 className="font-bold text-lg text-blue-200">How Your Yield Works</h3></div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40"><p className="text-xs text-slate-400">Network Base APY</p><p className="text-2xl font-black text-white mt-1">{cfg.baseApy.toFixed(2)}%</p><p className="text-xs text-slate-500 mt-0.5">Ethereum PoS rate</p></div>
            <div className="bg-red-950/30 rounded-xl p-3 border border-red-500/20"><p className="text-xs text-red-400">JC Validator Fee</p><p className="text-2xl font-black text-red-300 mt-1">−{cfg.validatorFeePct.toFixed(0)}%</p><p className="text-xs text-red-400/70 mt-0.5">Funds JC Treasury</p></div>
            <div className="bg-emerald-950/30 rounded-xl p-3 border border-emerald-500/30"><p className="text-xs text-emerald-400">Your Net APY</p><p className="text-2xl font-black text-emerald-300 mt-1">{cfg.userApy.toFixed(2)}%</p><p className="text-xs text-emerald-500/80 mt-0.5">Paid to your wallet</p></div>
          </div>
          <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>JC ON THE MOVE functions as your liquid staking provider. Your ETH is pooled in the JC Treasury to operate as an Ethereum validator. Staking rewards are tracked on-platform and paid out manually on claim requests.</span>
          </div>
        </CardContent>
      </Card>
      {isAuthenticated && (
        <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 to-blue-950/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-indigo-400" /><h3 className="font-bold text-lg text-indigo-200">Stake ETH</h3></div>
            {cfg.treasuryAddress ? (
              <div className="bg-slate-900/70 rounded-xl border border-slate-700/60 p-3 space-y-2">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Step 1 — Send ETH to JC Treasury</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-blue-300 font-mono bg-slate-800/80 rounded-lg px-3 py-2 break-all border border-slate-700/40">{cfg.treasuryAddress}</code>
                  <Button variant="ghost" size="icon" onClick={copyAddress} className="h-8 w-8 shrink-0">
                    {copied ? <CheckCheck className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  {cfg.treasuryAddress.startsWith("0x") && (
                    <a href={`https://etherscan.io/address/${cfg.treasuryAddress}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><ExternalLink className="h-4 w-4" /></Button>
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500">Minimum stake: {cfg.minAmount} ETH · Only send ETH (ERC-20 tokens not accepted)</p>
              </div>
            ) : (
              <div className="bg-yellow-950/30 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />Treasury address not yet configured. Contact JC ON THE MOVE to get started.
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Step 2 — Register Your Stake</p>
              <p className="text-xs text-slate-500">After sending, submit your stake details below for verification.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">ETH Amount Sent</label>
                <Input type="number" placeholder={`e.g. 0.5 (min ${cfg.minAmount})`} value={amount} onChange={e => setAmount(e.target.value)} className="bg-slate-900 border-slate-600 text-white" step="0.000001" min={cfg.minAmount} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Transaction Hash (optional)</label>
                <Input placeholder="0x..." value={txHash} onChange={e => setTxHash(e.target.value)} className="bg-slate-900 border-slate-600 text-white font-mono text-xs" />
              </div>
            </div>
            <Button onClick={() => stakeMutation.mutate({ amount, txHash })} disabled={!amount || parseFloat(amount) < cfg.minAmount || stakeMutation.isPending} className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold">
              {stakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Stake — {amount ? `${amount} ETH` : "Enter Amount"}
            </Button>
          </CardContent>
        </Card>
      )}
      {pendingStakes.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-950/10"><CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-yellow-300 flex items-center gap-2"><Clock className="h-4 w-4" /> Pending Verification ({pendingStakes.length})</h3>
          {pendingStakes.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3 border border-yellow-500/20">
              <div><p className="font-semibold text-white">{parseFloat(s.amount).toFixed(6)} ETH</p><p className="text-xs text-slate-400 mt-0.5">Submitted {new Date(s.staked_at).toLocaleDateString()}</p>{s.tx_hash && <p className="text-xs text-slate-500 font-mono mt-0.5">{s.tx_hash.slice(0, 20)}…</p>}</div>
              <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">Awaiting Verification</Badge>
            </div>
          ))}
        </CardContent></Card>
      )}
      {activeStakes.length > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-950/10"><CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-emerald-300 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active Stakes ({activeStakes.length})</h3>
          {activeStakes.map(s => {
            const pending = ethPending(s);
            return (
              <div key={s.id} className="bg-slate-900/50 rounded-xl px-4 py-4 border border-emerald-500/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold text-white text-lg">{parseFloat(s.amount).toFixed(6)} ETH</p><p className="text-xs text-slate-400">Staked {new Date(s.staked_at).toLocaleDateString()} · {parseFloat(s.apy).toFixed(2)}% APY</p></div>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">Active</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-800/60 rounded-lg p-2.5"><p className="text-slate-400 text-xs">Total Earned</p><p className="text-white font-semibold">{parseFloat(s.total_earned).toFixed(8)} ETH</p></div>
                  <div className="bg-purple-900/30 rounded-lg p-2.5 border border-purple-500/20"><p className="text-purple-400 text-xs flex items-center gap-1"><Sparkles className="h-3 w-3" /> Pending Now</p><p className="text-purple-200 font-semibold">{pending.toFixed(8)} ETH</p></div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => claimMutation.mutate(s.id)} disabled={pending < 0.0001 || claimMutation.isPending} className="flex-1 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/30">
                    {claimMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Coins className="h-3 w-3 mr-1" />}Claim Rewards
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => unstakeMutation.mutate(s.id)} disabled={unstakeMutation.isPending} className="flex-1 border-red-500/30 text-red-300 hover:bg-red-900/20">
                    {unstakeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}Request Unstake
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent></Card>
      )}
      {unstakingStakes.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-950/10"><CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-blue-300 flex items-center gap-2"><Clock className="h-4 w-4" /> Unstaking ({unstakingStakes.length})</h3>
          {unstakingStakes.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3 border border-blue-500/20">
              <div><p className="font-semibold text-white">{parseFloat(s.amount).toFixed(6)} ETH</p><p className="text-xs text-slate-400 mt-0.5">Requested {s.unstake_requested_at ? new Date(s.unstake_requested_at).toLocaleDateString() : "—"}</p></div>
              <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30">Processing 1–3 days</Badge>
            </div>
          ))}
        </CardContent></Card>
      )}
      {isAuthenticated && myStakes.length === 0 && (
        <Card className="border-dashed border-slate-700/50"><CardContent className="p-8 text-center text-slate-500">
          <p className="text-4xl mb-3">⟠</p>
          <p className="font-semibold text-slate-400">No ETH stakes yet</p>
          <p className="text-sm mt-1">Send ETH to the treasury address above and submit your stake to start earning.</p>
        </CardContent></Card>
      )}
      <Card className="border-dashed border-slate-700/40"><CardContent className="p-4 space-y-2">
        <h3 className="font-semibold text-slate-300">How ETH Staking Works</h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-none">
          <li>1. JC ON THE MOVE pools staked ETH and runs Ethereum validator nodes on your behalf</li>
          <li>2. The Ethereum network pays ~{cfg.baseApy.toFixed(1)}% APY in staking rewards to validators</li>
          <li>3. JC takes a {cfg.validatorFeePct.toFixed(0)}% validator commission — this funds the JC Treasury for future business growth</li>
          <li>4. You receive {cfg.userApy.toFixed(2)}% APY on your staked ETH, claimable any time</li>
          <li>5. Claims are processed manually within 24 hours. Unstakes take 1–3 business days to process.</li>
        </ul>
      </CardContent></Card>
    </div>
  );
}

// ── JCMOVES staking types ────────────────────────────────────────────────────

interface PoolData {
  stakedBalance: number;
  freeBalance: number;
  unstakeCooldownUntil: string | null;
  discountPct: number;
}

interface PoolStats {
  totalStakers: number;
  totalActiveStaked: number;
  totalRewardsPaid: number;
  monthlyTreasuryInflow: number;
}

interface LeaderboardEntry {
  userId: string;
  stakedBalance: number;
  rank: number;
  displayName: string;
}

const STAKE_TIERS = [
  { threshold: 25_000,  label: "25K",  discount: "5%",  icon: "🥉" },
  { threshold: 100_000, label: "100K", discount: "10%", icon: "🥇" },
];

// ── JCMOVES Staking View ─────────────────────────────────────────────────────

function JcmovesStakingView({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { toast } = useToast();
  const [stakeInput, setStakeInput] = useState("");

  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useQuery<PoolData>({
    queryKey: ["/api/staking/my-pool"],
    enabled: isAuthenticated,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const { data: poolStats } = useQuery<PoolStats>({
    queryKey: ["/api/staking/pool-stats"],
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/staking/leaderboard"],
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const stakeMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", "/api/staking/stake", { amount });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Staked!", description: `Your tokens are now staked. 10% earnings bonus is active.` });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/my-pool"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/leaderboard"] });
      setStakeInput("");
    },
    onError: (e: Error) => toast({ title: "Staking failed", description: e.message, variant: "destructive" }),
  });

  const unstakeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staking/unstake", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Unstaked!", description: `${fmt(data.returned)} JCMOVES returned to your free balance.` });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/my-pool"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staking/leaderboard"] });
    },
    onError: (e: Error) => toast({ title: "Unstake failed", description: e.message, variant: "destructive" }),
  });

  const staked = poolData?.stakedBalance ?? 0;
  const free = poolData?.freeBalance ?? 0;
  const isStakingActive = staked > 0;
  const cooldownUntil = poolData?.unstakeCooldownUntil ? new Date(poolData.unstakeCooldownUntil) : null;
  const isCooldownActive = cooldownUntil && cooldownUntil > new Date();
  const cooldownHours = isCooldownActive ? Math.ceil((cooldownUntil.getTime() - Date.now()) / 3600000) : 0;
  const discountPct = poolData?.discountPct ?? 0;

  const nextTier = STAKE_TIERS.find(t => staked < t.threshold);
  const currentTier = [...STAKE_TIERS].reverse().find(t => staked >= t.threshold);
  const progressToNextTier = nextTier
    ? Math.min(100, ((staked - (currentTier?.threshold ?? 0)) / (nextTier.threshold - (currentTier?.threshold ?? 0))) * 100)
    : 100;

  const stakeAmt = parseFloat(stakeInput) || 0;

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <JcmovesPoolStatsCard poolStats={poolStats} />
        <StakingPerksCard staked={0} />
        <Card className="border-dashed border-slate-700/50">
          <CardContent className="p-8 text-center space-y-3">
            <Lock className="h-10 w-10 text-slate-500 mx-auto" />
            <p className="font-semibold text-slate-300">Sign in to stake JCMOVES</p>
            <p className="text-sm text-slate-500">Log in to your account to stake tokens and unlock the 10% earnings bonus.</p>
          </CardContent>
        </Card>
        <StakingLeaderboardCard leaderboard={leaderboard} currentUserId={null} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Pool stats */}
      <JcmovesPoolStatsCard poolStats={poolStats} />

      {/* 10% Bonus Status Card */}
      <Card className={`border-2 transition-all ${isStakingActive
        ? "border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 to-green-950/20"
        : "border-slate-700/40 bg-gradient-to-br from-slate-900/40 to-slate-800/20"
      }`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${isStakingActive ? "bg-emerald-500/20" : "bg-slate-700/40"}`}>
                {isStakingActive ? "⚡" : "🔒"}
              </div>
              <div>
                <h3 className={`font-bold text-lg ${isStakingActive ? "text-emerald-300" : "text-slate-400"}`}>
                  {isStakingActive ? "10% Earnings Bonus Active ✓" : "Stake to Unlock 10% Bonus"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isStakingActive
                    ? "Every JCMOVES reward you earn is automatically boosted +10%"
                    : "Stake any amount of JCMOVES to boost all future earnings by 10%"}
                </p>
              </div>
            </div>
            {isStakingActive && (
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-base px-3 py-1 font-bold">
                +10% ACTIVE
              </Badge>
            )}
          </div>
          {isStakingActive && discountPct > 0 && (
            <div className="mt-4 pt-4 border-t border-emerald-500/20 flex items-center gap-2 text-sm text-emerald-300">
              <Shield className="h-4 w-4" />
              <span className="font-semibold">{discountPct}% service discount unlocked</span>
              <span className="text-emerald-500/70">· {fmt(staked)} JCMOVES staked</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance cards */}
      {poolLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-slate-700/40 bg-gradient-to-br from-slate-800/40 to-slate-900/20">
            <CardContent className="p-4 text-center">
              <Wallet className="h-5 w-5 text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Free Balance</p>
              <p className="text-2xl font-bold text-white mt-0.5">{fmt(free)}</p>
              <p className="text-xs text-muted-foreground">JCMOVES available</p>
            </CardContent>
          </Card>
          <Card className={`border-2 ${isStakingActive ? "border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 to-green-950/10" : "border-slate-700/40 bg-gradient-to-br from-slate-800/40 to-slate-900/20"}`}>
            <CardContent className="p-4 text-center">
              <Lock className={`h-5 w-5 mx-auto mb-1 ${isStakingActive ? "text-emerald-400" : "text-slate-500"}`} />
              <p className="text-xs text-muted-foreground">Staked Balance</p>
              <p className={`text-2xl font-bold mt-0.5 ${isStakingActive ? "text-emerald-300" : "text-slate-400"}`}>{fmt(staked)}</p>
              <p className="text-xs text-muted-foreground">JCMOVES locked</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tier progress */}
      {isStakingActive && (
        <Card className="border-yellow-500/20 bg-gradient-to-br from-yellow-950/20 to-amber-950/10">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-yellow-300">
                {currentTier ? `${currentTier.icon} ${currentTier.label} Tier — ${currentTier.discount} discount` : "Stake 25K+ to unlock discounts"}
              </span>
              {nextTier && <span className="text-xs text-slate-400">Next: {nextTier.icon} {nextTier.label} ({nextTier.discount} off)</span>}
            </div>
            {nextTier && (
              <>
                <Progress value={progressToNextTier} className="h-2" />
                <p className="text-xs text-slate-500">{fmt(Math.max(0, nextTier.threshold - staked))} more JCMOVES to {nextTier.label} tier</p>
              </>
            )}
            {!nextTier && <p className="text-xs text-cyan-400 font-semibold">💎 Maximum discount tier reached — 10% off all services!</p>}
          </CardContent>
        </Card>
      )}

      {/* Stake form */}
      <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 to-slate-900/10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-5 w-5 text-yellow-400" /> Stake JCMOVES
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Amount to stake..."
              value={stakeInput}
              onChange={e => setStakeInput(e.target.value)}
              className="bg-slate-900 border-slate-600"
              min={1}
            />
            <Button
              variant="outline"
              className="shrink-0 text-xs border-slate-600"
              onClick={() => setStakeInput(String(Math.floor(free)))}
            >
              MAX
            </Button>
          </div>
          {stakeAmt > 0 && stakeAmt > free && (
            <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Insufficient free balance</p>
          )}
          {stakeAmt > 0 && stakeAmt <= free && (
            <div className="bg-slate-800/60 rounded-lg p-3 text-xs space-y-1 text-slate-300">
              <div className="flex justify-between"><span>Staking</span><span className="font-semibold text-white">{fmt(stakeAmt)} JCMOVES</span></div>
              <div className="flex justify-between text-emerald-400"><span>10% earnings bonus</span><span className="font-semibold">Active immediately</span></div>
              {STAKE_TIERS.find(t => (staked + stakeAmt) >= t.threshold && staked < t.threshold) && (
                <div className="flex justify-between text-yellow-400">
                  <span>New discount tier</span>
                  <span className="font-semibold">{STAKE_TIERS.find(t => (staked + stakeAmt) >= t.threshold)?.discount} off services</span>
                </div>
              )}
            </div>
          )}
          <Button
            onClick={() => stakeMutation.mutate(stakeAmt)}
            disabled={stakeAmt <= 0 || stakeAmt > free || stakeMutation.isPending}
            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold"
          >
            {stakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            Stake {stakeAmt > 0 ? `${fmt(stakeAmt)} JCMOVES` : "Tokens"}
          </Button>
        </CardContent>
      </Card>

      {/* Unstake */}
      {isStakingActive && (
        <Card className="border-red-500/20 bg-gradient-to-br from-red-950/10 to-slate-900/10">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 flex items-center gap-2"><Unlock className="h-4 w-4 text-red-400" /> Unstake All</h3>
                <p className="text-xs text-slate-400 mt-0.5">Returns {fmt(staked)} JCMOVES to your free balance · 24h cooldown applies</p>
              </div>
            </div>
            {isCooldownActive ? (
              <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg p-3 text-xs text-amber-300">
                <Clock className="h-4 w-4 shrink-0" />
                Unstake cooldown active — available in {cooldownHours} hour{cooldownHours !== 1 ? "s" : ""}
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => unstakeMutation.mutate()}
                disabled={unstakeMutation.isPending}
                className="w-full border-red-500/30 text-red-300 hover:bg-red-900/20"
              >
                {unstakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                Unstake {fmt(staked)} JCMOVES
              </Button>
            )}
            <p className="text-xs text-slate-500">⚠️ Unstaking removes your 10% earnings bonus and service discounts immediately.</p>
          </CardContent>
        </Card>
      )}

      {/* Perks table */}
      <StakingPerksCard staked={staked} />

      {/* Leaderboard */}
      <StakingLeaderboardCard leaderboard={leaderboard} currentUserId={null} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function JcmovesPoolStatsCard({ poolStats }: { poolStats?: PoolStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
        <CardContent className="p-3 text-center">
          <p className="text-xl mb-0.5">👥</p>
          <p className="text-xs text-muted-foreground">Total Stakers</p>
          <p className="text-base font-bold mt-0.5 leading-tight">{poolStats?.totalStakers?.toLocaleString() ?? "—"}</p>
        </CardContent>
      </Card>
      <Card className="border border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5">
        <CardContent className="p-3 text-center">
          <p className="text-xl mb-0.5">🔒</p>
          <p className="text-xs text-muted-foreground">Total Staked</p>
          <p className="text-base font-bold mt-0.5 leading-tight">{poolStats ? `${fmt(poolStats.totalActiveStaked / 1000, 1)}K JCM` : "—"}</p>
        </CardContent>
      </Card>
      <Card className="border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
        <CardContent className="p-3 text-center">
          <p className="text-xl mb-0.5">💰</p>
          <p className="text-xs text-muted-foreground">Rewards Paid</p>
          <p className="text-base font-bold mt-0.5 leading-tight">{poolStats ? `${fmt(poolStats.totalRewardsPaid / 1000, 1)}K JCM` : "—"}</p>
        </CardContent>
      </Card>
      <Card className="border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
        <CardContent className="p-3 text-center">
          <p className="text-xl mb-0.5">📈</p>
          <p className="text-xs text-muted-foreground">Monthly Inflow</p>
          <p className="text-base font-bold mt-0.5 leading-tight">{poolStats?.monthlyTreasuryInflow ? `$${poolStats.monthlyTreasuryInflow.toLocaleString()}` : "$0"}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StakingPerksCard({ staked }: { staked: number }) {
  return (
    <Card className="border-slate-700/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-5 w-5 text-yellow-400" /> Staking Perks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20">
          <Zap className="h-5 w-5 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-300">+10% Earnings Multiplier</p>
            <p className="text-xs text-slate-400">Applied to every JCMOVES reward — mining, jobs, referrals, shop</p>
          </div>
          <Badge className={staked > 0 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/40 text-slate-400 border-slate-600/30"}>
            {staked > 0 ? "Active" : "Stake any amount"}
          </Badge>
        </div>
        {STAKE_TIERS.map(tier => {
          const unlocked = staked >= tier.threshold;
          return (
            <div key={tier.label} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              unlocked ? "bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500/30" : "bg-slate-800/20 border-slate-700/30"
            }`}>
              <span className="text-xl shrink-0">{tier.icon}</span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${unlocked ? "text-white" : "text-slate-400"}`}>
                  {tier.discount} Off All Services
                </p>
                <p className="text-xs text-slate-400">{Number(tier.threshold).toLocaleString()} JCMOVES staked</p>
              </div>
              {unlocked
                ? <Badge className="bg-green-500/20 text-green-300 border-green-500/30 shrink-0">Unlocked</Badge>
                : <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
            </div>
          );
        })}
        <p className="text-xs text-slate-500 pt-1">Discount applies at checkout when staked balance meets the threshold. Staking bonus shown separately in transaction history.</p>
      </CardContent>
    </Card>
  );
}

function StakingLeaderboardCard({ leaderboard, currentUserId }: { leaderboard: LeaderboardEntry[]; currentUserId: string | null }) {
  if (leaderboard.length === 0) return null;
  const rankIcon = (rank: number) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  return (
    <Card className="border-slate-700/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-5 w-5 text-yellow-400" /> Top Stakers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {leaderboard.slice(0, 10).map(entry => (
          <div key={entry.userId} className={`flex items-center gap-3 p-2.5 rounded-lg ${entry.userId === currentUserId ? "bg-yellow-950/30 border border-yellow-500/20" : "bg-slate-800/30"}`}>
            <span className="text-sm w-8 text-center font-bold">{rankIcon(entry.rank)}</span>
            <span className="flex-1 text-sm text-slate-200 truncate">{entry.userId === currentUserId ? "You" : entry.displayName}</span>
            <span className="text-sm font-semibold text-yellow-300">{fmt(entry.stakedBalance / 1000, 1)}K JCM</span>
            {entry.rank <= 3 && <Crown className="h-4 w-4 text-yellow-400 shrink-0" />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StakingPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [mode, setMode] = useState<"jcmoves" | "eth">("jcmoves");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex-1">
            <div className="inline-flex items-center bg-slate-900/80 border border-slate-700/60 rounded-xl p-1 gap-1">
              <button
                onClick={() => setMode("jcmoves")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === "jcmoves" ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
              >
                🪙 JCMOVES Staking
              </button>
              <button
                onClick={() => setMode("eth")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${mode === "eth" ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
              >
                ⟠ Ethereum Staking
              </button>
            </div>
          </div>
        </div>

        {mode === "eth" && <EthStakingView isAuthenticated={isAuthenticated} />}
        {mode === "jcmoves" && <JcmovesStakingView isAuthenticated={isAuthenticated} />}
      </div>
    </div>
  );
}
