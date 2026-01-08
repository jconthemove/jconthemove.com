import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, Wallet, User, Coins, ShoppingBag, Gift, Users, CheckCircle, Zap, Clock, Loader2, Copy, Calendar, TrendingUp, ArrowUpRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ShopItem {
  id: string;
  title: string;
  description?: string;
  price: string;
  photos: string[];
  status: string;
}

interface WalletAccount {
  id: string;
  userId: string;
  tokenBalance: string;
  cashBalance: string;
  totalEarned: string;
  totalRedeemed: string;
  totalCashedOut: string;
}

interface MiningStatus {
  currentSession: any;
  accumulatedTokens: string;
  timeRemaining: number;
  totalClaimedToday: string;
  miningSpeed: string;
  streakCount: number;
  nextStreakBonus: string;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
  cashValue: string;
  status: string;
  earnedDate: string;
}

interface ReferralStats {
  referralCount: number;
  totalEarned: number;
  referredUsers: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    createdAt: string;
  }>;
}

export default function CustomerPortal() {
  const [activeTab, setActiveTab] = useState("mining");
  const [animatedTokens, setAnimatedTokens] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: shopItems = [] } = useQuery<ShopItem[]>({
    queryKey: ["/api/shop"],
  });

  const { data: wallet } = useQuery<WalletAccount>({
    queryKey: ["/api/rewards/wallet"],
  });

  const { data: miningStatus } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
    refetchInterval: 5000,
  });

  const { data: rewardsHistory } = useQuery<RewardHistory[]>({
    queryKey: ["/api/rewards/history"],
  });

  const { data: referralCode } = useQuery<{ referralCode: string }>({
    queryKey: ["/api/referrals/my-code"],
  });

  const { data: referralStats } = useQuery<ReferralStats>({
    queryKey: ["/api/referrals/stats"],
  });

  // Real-time animated token counter
  useEffect(() => {
    if (!miningStatus?.currentSession) {
      setAnimatedTokens(0);
      return;
    }

    // Start from server value
    const serverTokens = parseFloat(miningStatus?.accumulatedTokens || '0');
    setAnimatedTokens(serverTokens);

    // Update every 100ms for smooth animation (0.02 tokens/second = 0.002 per 100ms)
    const TOKENS_PER_100MS = 0.002;
    const miningSpeed = parseFloat(miningStatus?.miningSpeed || '1.00');
    
    const interval = setInterval(() => {
      setAnimatedTokens(prev => prev + (TOKENS_PER_100MS * miningSpeed));
    }, 100);

    return () => clearInterval(interval);
  }, [miningStatus?.currentSession, miningStatus?.accumulatedTokens, miningStatus?.miningSpeed]);

  // Calculate 24-hour cycle progress
  const cycleProgress = useMemo(() => {
    if (!miningStatus?.currentSession || !miningStatus?.timeRemaining) return 0;
    const CYCLE_MS = 24 * 60 * 60 * 1000; // 24 hours
    const elapsed = CYCLE_MS - miningStatus.timeRemaining;
    return Math.min(100, Math.max(0, (elapsed / CYCLE_MS) * 100));
  }, [miningStatus?.timeRemaining, miningStatus?.currentSession]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const startMiningMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/mining/start");
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({
        title: "Mining Started!",
        description: "You're now earning tokens. Check back to claim them!",
      });
    },
    onError: (error: any) => {
      // Don't show error for session expiration - redirect handles it
      if (error.message?.includes("Session expired")) {
        return;
      }
      toast({
        title: "Failed to Start Mining",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/mining/claim");
    },
    onSuccess: async (response: any) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      toast({
        title: "Tokens Claimed!",
        description: `You've earned ${parseFloat(data.tokensClaimed).toFixed(2)} JCMOVES!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const activeShopItems = shopItems.filter(item => item.status === 'active');
  const tokenBalance = parseFloat(wallet?.tokenBalance || '0');
  const totalEarned = parseFloat(wallet?.totalEarned || '0');
  const canClaim = miningStatus?.currentSession && parseFloat(miningStatus?.accumulatedTokens || '0') > 0;

  const copyReferralCode = () => {
    if (referralCode?.referralCode) {
      navigator.clipboard.writeText(referralCode.referralCode);
      toast({ title: "Copied!", description: "Referral code copied to clipboard" });
    }
  };

  const getRewardTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      mining: 'Mining Reward',
      daily_checkin: 'Daily Check-in',
      lead_creation: 'Job Creation Bonus',
      job_completion: 'Job Completion',
      loyalty_booking: 'Loyalty Reward',
      referral: 'Referral Bonus',
      referral_request: 'Referral Signup',
      referral_confirmed: 'Referral Confirmed',
      signup_bonus: 'Welcome Bonus',
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome, {user?.firstName || 'Customer'}!</h1>
          <p className="text-slate-400">Your rewards dashboard</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-slate-300">Token Balance</p>
              <p className="text-2xl font-black text-orange-400" data-testid="text-token-balance">
                {tokenBalance.toFixed(2)} JCMOVES
              </p>
              <p className="text-xs text-slate-400">${(tokenBalance * 0.01).toFixed(2)} value</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-slate-300">Total Earned</p>
              <p className="text-2xl font-black text-green-400" data-testid="text-total-earned">
                {totalEarned.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400">Lifetime earnings</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="mining" className="data-[state=active]:bg-orange-500/20" data-testid="tab-mining">
              <Zap className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Mining</span>
            </TabsTrigger>
            <TabsTrigger value="referrals" className="data-[state=active]:bg-blue-500/20" data-testid="tab-referrals">
              <Users className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Referrals</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-green-500/20" data-testid="tab-history">
              <Clock className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
            <TabsTrigger value="shop" className="data-[state=active]:bg-purple-500/20" data-testid="tab-shop">
              <ShoppingBag className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Shop</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mining" className="space-y-4 mt-4">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 text-orange-400" />
                  Daily Mining
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Claim your daily tokens and build your streak!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <div>
                    <p className="text-sm text-slate-400">Current Streak</p>
                    <p className="text-2xl font-bold text-orange-400">{miningStatus?.streakCount || 0} days</p>
                    {(miningStatus?.streakCount || 0) > 1 && (
                      <p className="text-xs text-green-400">+{(miningStatus!.streakCount - 1)}% bonus active</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Available</p>
                    <p className="text-xl font-bold text-green-400 tabular-nums" data-testid="text-animated-tokens">
                      {miningStatus?.currentSession ? animatedTokens.toFixed(4) : '0.0000'} JCMOVES
                    </p>
                  </div>
                </div>

                {/* Animated Mining Progress Bar */}
                {miningStatus?.currentSession && (
                  <div className="space-y-2 p-4 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/30">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300 flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                        </span>
                        Mining in Progress
                      </span>
                      <span className="text-orange-400 font-medium">
                        {formatTimeRemaining(miningStatus?.timeRemaining || 0)} remaining
                      </span>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={cycleProgress} 
                        className="h-3 bg-slate-700"
                      />
                      <div 
                        className="absolute inset-0 h-3 rounded-full overflow-hidden"
                        style={{
                          background: `linear-gradient(90deg, transparent ${cycleProgress - 2}%, rgba(251, 146, 60, 0.5) ${cycleProgress}%, transparent ${cycleProgress + 2}%)`,
                          animation: 'shimmer 2s infinite',
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>0h</span>
                      <span className="text-orange-400 font-medium">+{(0.02 * parseFloat(miningStatus?.miningSpeed || '1')).toFixed(4)}/sec</span>
                      <span>24h</span>
                    </div>
                  </div>
                )}

                {!miningStatus?.currentSession ? (
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      startMiningMutation.mutate();
                    }}
                    disabled={startMiningMutation.isPending}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                    size="lg"
                    data-testid="button-start-mining"
                  >
                    {startMiningMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting...</>
                    ) : (
                      <><Zap className="h-4 w-4 mr-2" /> Start Mining</>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => claimMutation.mutate()}
                    disabled={!canClaim || claimMutation.isPending}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                    size="lg"
                    data-testid="button-claim-mining"
                  >
                    {claimMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Claiming...</>
                    ) : canClaim ? (
                      <><Coins className="h-4 w-4 mr-2" /> Claim Tokens</>
                    ) : (
                      <><Clock className="h-4 w-4 mr-2" /> Mining Active - Tokens Accumulating</>
                    )}
                  </Button>
                )}

                <Separator className="bg-slate-700" />

                <div>
                  <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-primary" />
                    Ways to Earn More
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-slate-900/30 rounded">
                      <span className="text-slate-300">Book a service</span>
                      <span className="text-green-400 font-semibold">+1,500 JCMOVES</span>
                    </div>
                    <div className="flex justify-between p-2 bg-slate-900/30 rounded">
                      <span className="text-slate-300">Refer a friend (signup)</span>
                      <span className="text-blue-400 font-semibold">+50 JCMOVES</span>
                    </div>
                    <div className="flex justify-between p-2 bg-slate-900/30 rounded">
                      <span className="text-slate-300">Referral completes job</span>
                      <span className="text-purple-400 font-semibold">+2,500 JCMOVES</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referrals" className="space-y-4 mt-4">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 text-blue-400" />
                  Your Referral Code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-slate-900/50 rounded-lg border border-slate-700 font-mono text-lg text-center text-white">
                    {referralCode?.referralCode || 'Loading...'}
                  </div>
                  <Button onClick={copyReferralCode} variant="outline" className="border-slate-600" data-testid="button-copy-referral">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-center">
                    <p className="text-2xl font-bold text-blue-400">{referralStats?.referralCount || 0}</p>
                    <p className="text-sm text-slate-400">Referrals</p>
                  </div>
                  <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-center">
                    <p className="text-2xl font-bold text-green-400">{referralStats?.totalEarned?.toFixed(0) || 0}</p>
                    <p className="text-sm text-slate-400">Tokens Earned</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-sm text-blue-200">
                    Share your code with friends! You earn <span className="font-bold">50 JCMOVES</span> when they sign up, 
                    and <span className="font-bold">2,500 JCMOVES</span> when their first job completes!
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-4">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  Reward History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rewardsHistory && rewardsHistory.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {rewardsHistory.slice(0, 20).map((reward) => (
                      <div key={reward.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                        <div>
                          <p className="font-medium text-white text-sm">{getRewardTypeLabel(reward.rewardType)}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(reward.earnedDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-400">+{parseFloat(reward.tokenAmount).toFixed(2)}</p>
                          <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                            {reward.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No rewards yet</p>
                    <p className="text-sm text-slate-500">Start mining to earn tokens!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shop" className="space-y-4 mt-4">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <ShoppingBag className="h-5 w-5 text-purple-400" />
                  Shop Marketplace
                </CardTitle>
                <CardDescription className="text-slate-400">Browse items available for purchase</CardDescription>
              </CardHeader>
              <CardContent>
                {activeShopItems.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400 mb-4">No items available at the moment</p>
                    <p className="text-sm text-slate-500">Check back soon for new listings!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeShopItems.slice(0, 4).map((item) => (
                      <Link href={`/shop/${item.id}`} key={item.id}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-slate-900/50 border-slate-700">
                          {item.photos.length > 0 && (
                            <div className="aspect-video overflow-hidden rounded-t-lg">
                              <img
                                src={item.photos[0]}
                                alt={item.title}
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <h4 className="font-semibold mb-1 line-clamp-1 text-white">{item.title}</h4>
                            <p className="text-lg text-primary font-bold">${item.price}</p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
                {activeShopItems.length > 4 && (
                  <div className="mt-4 text-center">
                    <Link href="/shop">
                      <Button variant="outline" className="border-slate-600" data-testid="button-view-all-shop">
                        View All Items <ArrowUpRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center">
          <Link href="/customer">
            <Button size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600" data-testid="button-get-quote">
              <Package className="h-5 w-5 mr-2" />
              Request a New Quote
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
