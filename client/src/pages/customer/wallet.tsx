import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, TrendingUp, Lock, ArrowRight, Zap, Gift, ShoppingBag, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface WalletData {
  balance: string;
  stakedAmount: string;
  pendingRewards: string;
  totalEarned: string;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
  status: string;
  earnedDate: string;
}

export default function CustomerWalletPage() {
  const { user } = useAuth();

  const { data: wallet, isLoading } = useQuery<WalletData>({
    queryKey: ["/api/wallet/balance"],
  });

  const { data: historyData } = useQuery<RewardHistory[]>({
    queryKey: ["/api/rewards/history"],
  });

  const balance = parseFloat(wallet?.balance ?? "0");
  const staked = parseFloat(wallet?.stakedAmount ?? "0");
  const pending = parseFloat(wallet?.pendingRewards ?? "0");
  const history: RewardHistory[] = Array.isArray(historyData) ? historyData.slice(0, 10) : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold">Your Wallet</h1>
          <p className="text-sm text-muted-foreground">JCMOVES token balance & staking</p>
        </div>

        {/* Main Balance Card */}
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardContent className="pt-6 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Coins className="h-6 w-6 text-primary" />
              <span className="text-sm text-muted-foreground font-medium">Available Balance</span>
            </div>
            {isLoading ? (
              <div className="h-12 w-40 bg-muted animate-pulse rounded mx-auto my-2" />
            ) : (
              <p className="text-4xl font-black text-primary">{balance.toLocaleString()}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">JCMOVES tokens</p>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Lock className="h-4 w-4" />
                <span className="text-xs">Staked</span>
              </div>
              <p className="text-xl font-bold">{staked.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">JCMOVES</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-xs">Pending</span>
              </div>
              <p className="text-xl font-bold">{pending.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">JCMOVES</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Quick Actions</p>

          <Link href="/staking">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-xl">
                  <Lock className="h-5 w-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Stake Tokens</p>
                  <p className="text-xs text-muted-foreground">Earn yield on your JCMOVES</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>

          <Link href="/earn">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Zap className="h-5 w-5 text-amber-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Earn More Tokens</p>
                  <p className="text-xs text-muted-foreground">Mining, faucet & daily bonuses</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>

          <Link href="/rewards">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-xl">
                  <Gift className="h-5 w-5 text-green-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Redeem Rewards</p>
                  <p className="text-xs text-muted-foreground">Use tokens for discounts & perks</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>

          <Link href="/rewards-marketplace">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-xl">
                  <ShoppingBag className="h-5 w-5 text-purple-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Marketplace</p>
                  <p className="text-xs text-muted-foreground">Shop with your JCMOVES</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" /> Transaction History
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No transactions yet. Earn tokens by booking jobs or mining daily.</p>
            ) : (
              <div className="space-y-2">
                {history.map(h => {
                  const amount = parseFloat(h.tokenAmount ?? "0");
                  const isPositive = amount >= 0;
                  const date = h.earnedDate ? new Date(h.earnedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                  return (
                    <div key={h.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium capitalize">{h.rewardType?.replace(/_/g, " ") ?? "Reward"}</p>
                        <p className="text-xs text-muted-foreground">{date} · {h.status}</p>
                      </div>
                      <span className={`text-sm font-bold ${isPositive ? "text-green-600" : "text-red-500"}`}>
                        {isPositive ? "+" : ""}{amount.toLocaleString()} JCMOVES
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* How to earn */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> How to Earn JCMOVES
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {[
              { label: "Book a job", tokens: "+50", sub: "Per booking" },
              { label: "Job completed", tokens: "$1 = 15", sub: "Based on total cost" },
              { label: "Daily mining", tokens: "+100", sub: "Every 24 hours" },
              { label: "Referral bonus", tokens: "+500", sub: "Per new customer" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1">
                <span className="text-sm">{item.label}</span>
                <div className="text-right">
                  <Badge variant="secondary" className="text-xs">{item.tokens}</Badge>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
