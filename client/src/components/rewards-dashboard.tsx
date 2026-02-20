import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Gift, 
  Coins, 
  TrendingUp, 
  TrendingDown,
  Clock, 
  CheckCircle, 
  Calendar,
  Zap,
  Award,
  Share2,
  Users,
  Copy,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  History,
  ChevronRight,
  X
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface WalletAccount {
  id: string;
  userId: string;
  tokenBalance: string;
  cashBalance: string;
  totalEarned: string;
  totalRedeemed: string;
  totalCashedOut: string;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
  cashValue: string;
  status: string;
  earnedDate: string;
  metadata?: any;
}

interface TokenInfo {
  price: number;
  symbol: string;
  name: string;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  fdv?: number;
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

interface MiningStatus {
  currentSession: any;
  accumulatedTokens: string;
  timeRemaining: number;
  totalClaimedToday: string;
  miningSpeed: string;
  streakCount: number;
  nextStreakBonus: string;
}

export default function RewardsDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [accumulatedTokens, setAccumulatedTokens] = useState("0.00000000");
  const [streakBonus, setStreakBonus] = useState("0.00000000");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [emberDialogOpen, setEmberDialogOpen] = useState(false);

  // Fetch wallet data
  const { data: wallet, isLoading: walletLoading } = useQuery<WalletAccount>({
    queryKey: ['/api/rewards/wallet'],
  });

  const PAGE_SIZE = 50;
  const [allLoadedRewards, setAllLoadedRewards] = useState<RewardHistory[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fetch first page of rewards history
  const { data: rewardsData } = useQuery<{ rewards: RewardHistory[]; total: number; totalTokensEarned: string; totalCashEarned: string }>({
    queryKey: ['/api/rewards/history'],
    queryFn: async () => {
      const res = await fetch(`/api/rewards/history?limit=${PAGE_SIZE}&offset=0`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAllLoadedRewards(data.rewards);
      setHistoryOffset(data.rewards.length);
      setHasMoreHistory(data.rewards.length < data.total);
      return data;
    },
  });

  const loadMoreHistory = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/rewards/history?limit=${PAGE_SIZE}&offset=${historyOffset}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAllLoadedRewards(prev => [...prev, ...data.rewards]);
      setHistoryOffset(prev => prev + data.rewards.length);
      setHasMoreHistory(historyOffset + data.rewards.length < data.total);
    } catch (err) {
      console.error('Failed to load more history:', err);
    }
    setLoadingMore(false);
  };

  const rewardsHistory = allLoadedRewards.length > 0 ? allLoadedRewards : rewardsData?.rewards;
  const totalRewards = rewardsData?.total || 0;
  const allTimeTokensEarned = parseFloat(rewardsData?.totalTokensEarned || "0");
  const allTimeCashEarned = parseFloat(rewardsData?.totalCashEarned || "0");

  // Fetch token info
  const { data: tokenInfo } = useQuery<TokenInfo>({
    queryKey: ['/api/rewards/token-info'],
  });

  // Fetch referral code
  const { data: referralCode } = useQuery<{ referralCode: string }>({
    queryKey: ['/api/referrals/my-code'],
  });

  // Fetch referral stats
  const { data: referralStats } = useQuery<ReferralStats>({
    queryKey: ['/api/referrals/stats'],
  });

  // Fetch mining status
  const { data: miningStatus } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
    refetchInterval: 5000,
  });

  // Fetch payout history
  const { data: payoutHistory } = useQuery<Array<{
    id: string;
    tokenAmount: string;
    recipientAddress: string;
    transactionHash: string | null;
    status: string;
    requestedAt: string;
    confirmedAt: string | null;
  }>>({
    queryKey: ["/api/wallet/payouts"],
  });

  // Fetch payout status (for pending payout info)
  const { data: payoutStatus } = useQuery<{
    hasPendingPayout: boolean;
    pendingPayout: {
      id: string;
      tokenAmount: string;
      recipientAddress: string;
      status: string;
      requestedAt: string;
    } | null;
  }>({
    queryKey: ["/api/wallet/payout/status"],
  });

  const { data: payoutConfig } = useQuery<{
    feePercent: number;
    minFee: number;
    minimumPayout: number;
    feeCurrency: string;
    feeDescription: string;
  }>({
    queryKey: ["/api/wallet/payout-config"],
  });

  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);

  // Start mining mutation
  const startMiningMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/mining/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({
        title: "Mining Started!",
        description: "Your passive token mining has begun. Earn 1,728 JCMOVES every 24 hours!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Mining",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Claim tokens mutation
  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mining/claim");
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      
      const streakInfo = data.streakCount > 0 
        ? ` (${data.streakCount}-day streak bonus: +${parseFloat(data.streakBonus || 0).toFixed(2)})` 
        : '';
      
      toast({
        title: "Tokens Claimed!",
        description: `You've earned ${parseFloat(data.tokensClaimed || 0).toFixed(2)} JCMOVES${streakInfo}! New balance: ${parseFloat(data.newBalance || 0).toFixed(2)}`,
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

  // Payout to wallet mutation - send tokens to personal Solana wallet
  const payoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wallet/payout");
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/payouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/payout/status"] });
      
      if (data.transactionHash) {
        toast({
          title: "Payout Successful!",
          description: `${data.amount?.toFixed(2)} JCMOVES sent to your wallet. TX: ${data.transactionHash.slice(0, 8)}...`,
        });
      } else if (data.pending) {
        toast({
          title: "Payout Requested",
          description: data.message || "Your payout will be processed soon.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payout Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Cancel payout mutation
  const cancelPayoutMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      const response = await apiRequest("POST", `/api/wallet/payout/${payoutId}/cancel`);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/payouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/payout/status"] });
      toast({
        title: "Payout Cancelled",
        description: `${data.refundedAmount?.toFixed(2) || ''} JCMOVES refunded to your balance.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cancel Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Apply referral code mutation
  const applyReferralMutation = useMutation({
    mutationFn: async (referralCode: string) => {
      const response = await apiRequest('POST', '/api/referrals/apply', {
        referralCode
      });
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Referral applied!",
          description: data.message,
        });
        setReferralCodeInput('');
        queryClient.invalidateQueries({ queryKey: ['/api/referrals/stats'] });
      } else {
        toast({
          title: "Failed to apply referral code",
          description: data.error,
          variant: "destructive"
        });
      }
    },
    onError: (error: Error) => {
      if (error.message.includes('401')) return;
      toast({
        title: "Error applying referral code",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Calculate accumulated tokens in real-time (2x speed: 0.02 JCMOVES/second = 1728/day)
  useEffect(() => {
    if (!miningStatus?.currentSession) return;

    const updateAccumulated = () => {
      const now = Date.now();
      const lastClaim = new Date(miningStatus.currentSession.lastClaimTime).getTime();
      const secondsElapsed = Math.floor((now - lastClaim) / 1000);
      
      const miningSpeed = parseFloat(miningStatus.miningSpeed || "1.00");
      const tokensPerSecond = 0.02; // 2x increase: 0.02 JCMOVES/second = 1728/day
      const tokensEarned = secondsElapsed * tokensPerSecond * miningSpeed;
      
      const previousAccumulated = parseFloat(miningStatus.currentSession.accumulatedTokens || "0");
      const totalAccumulated = previousAccumulated + tokensEarned;
      
      const maxTokens = 1728 * miningSpeed; // 2x increase from 864
      const cappedTokens = Math.min(totalAccumulated, maxTokens);
      
      setAccumulatedTokens(cappedTokens.toFixed(8));

      // Calculate streak bonus in real-time
      const streakCount = miningStatus.streakCount || 0;
      const bonusPercentage = (streakCount - 1) * 0.01; // Day 1: 0%, Day 2: 1%, Day 3: 2%, etc.
      const calculatedBonus = cappedTokens * bonusPercentage;
      setStreakBonus(calculatedBonus.toFixed(8));
    };

    updateAccumulated();
    const interval = setInterval(updateAccumulated, 100);

    return () => clearInterval(interval);
  }, [miningStatus]);

  // Countdown timer
  useEffect(() => {
    if (!miningStatus?.currentSession) return;

    const updateTimer = () => {
      const now = Date.now();
      const nextClaim = new Date(miningStatus.currentSession.nextClaimAt).getTime();
      const remaining = Math.max(0, nextClaim - now);
      
      setTimeRemaining(remaining);

      if (remaining === 0 && parseFloat(accumulatedTokens) > 0) {
        claimMutation.mutate();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [miningStatus, accumulatedTokens]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Copy referral code to clipboard
  const copyReferralCode = async () => {
    if (referralCode?.referralCode) {
      try {
        await navigator.clipboard.writeText(referralCode.referralCode);
        toast({
          title: "Copied!",
          description: "Referral code copied to clipboard",
        });
      } catch (error) {
        toast({
          title: "Copy failed",
          description: "Could not copy referral code",
          variant: "destructive"
        });
      }
    }
  };

  const getRewardTypeIcon = (type: string) => {
    switch (type) {
      case 'daily_checkin': return <Calendar className="h-4 w-4 text-blue-400" />;
      case 'mining_claim': return <Coins className="h-4 w-4 text-yellow-400" />;
      case 'booking': case 'booking_request': return <Award className="h-4 w-4 text-purple-400" />;
      case 'referral': case 'referral_request': return <Gift className="h-4 w-4 text-pink-400" />;
      case 'referral_confirmed': return <Gift className="h-4 w-4 text-green-400" />;
      case 'job_completion': case 'loyalty_booking': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'job_creation_bonus': case 'lead_creation': return <TrendingUp className="h-4 w-4 text-cyan-400" />;
      case 'staking_claim': return <TrendingUp className="h-4 w-4 text-yellow-400" />;
      default: return <Coins className="h-4 w-4 text-slate-400" />;
    }
  };

  const getRewardTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'daily_checkin': 'Daily Check-in',
      'mining_claim': 'Mining Claim',
      'booking': 'Booking Reward',
      'booking_request': 'Booking Request',
      'referral': 'Referral Bonus',
      'referral_request': 'Referral Submitted',
      'referral_confirmed': 'Referral Confirmed',
      'job_completion': 'Job Completed',
      'loyalty_booking': 'Loyalty Booking',
      'job_creation_bonus': 'Job Creation Bonus',
      'lead_creation': 'Lead Created',
      'staking_claim': 'Staking Reward',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
      case 'completed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
    }
  };

  const tokenBalance = parseFloat(wallet?.tokenBalance || '0');
  const cashValue = parseFloat(wallet?.cashBalance || '0');
  const hasActiveSession = !!miningStatus?.currentSession;

  // Generate simple mock chart data for holdings visualization
  const generateChartData = () => {
    const currentValue = tokenBalance * (tokenInfo?.price || 0);
    // Create a simple upward trending chart with some variation
    return Array.from({ length: 7 }, (_, i) => ({
      day: i,
      value: currentValue * (0.85 + (i * 0.025) + Math.random() * 0.05)
    }));
  };

  const chartData = generateChartData();
  const priceChange24h = tokenInfo?.priceChange24h || 0;
  const isPositiveChange = priceChange24h >= 0;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-orange-500/10 to-blue-600/20 blur-3xl -z-10"></div>
          <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-blue-400 via-orange-400 to-blue-400 bg-clip-text text-transparent tracking-tight">Rewards Center</h1>
          <p className="text-sm text-slate-400 mt-1">
            Earn {tokenInfo?.symbol || 'JCMOVES'} through mining and referrals
          </p>
        </div>
      </div>

      {/* Pending Payout Alert - Fancy Blue Design */}
      {payoutStatus?.hasPendingPayout && payoutStatus.pendingPayout && (
        <Card className="mb-4 border border-blue-500/50 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 shadow-lg shadow-blue-500/20" data-testid="card-pending-payout">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/20 border border-white/30 backdrop-blur-sm">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
                <div>
                  <p className="font-semibold text-white">Pending Payout Request</p>
                  <p className="text-sm text-white/90">
                    {parseFloat(payoutStatus.pendingPayout.tokenAmount).toFixed(2)} JCMOVES → {payoutStatus.pendingPayout.recipientAddress.slice(0, 6)}...{payoutStatus.pendingPayout.recipientAddress.slice(-4)}
                  </p>
                  <p className="text-xs text-white/70 mt-1">
                    Requested: {new Date(payoutStatus.pendingPayout.requestedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelPayoutMutation.mutate(payoutStatus.pendingPayout!.id)}
                disabled={cancelPayoutMutation.isPending}
                className="border-white/50 text-white hover:bg-white/20 hover:text-white bg-white/10"
                data-testid="button-cancel-payout"
              >
                {cancelPayoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout Confirmation Dialog */}
      <Dialog open={showPayoutConfirm} onOpenChange={setShowPayoutConfirm}>
        <DialogContent className="max-w-sm bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Confirm Wallet Transfer</DialogTitle>
            <DialogDescription className="text-slate-400">
              Review the details before transferring to your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Balance:</span>
              <span className="text-white font-semibold">{tokenBalance.toFixed(2)} JCMOVES</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Network Fee ({payoutConfig?.feePercent ?? 1}%):</span>
              <span className="text-amber-400 font-semibold">
                {Math.max(payoutConfig?.minFee || 10, Math.ceil(tokenBalance * (payoutConfig?.feePercent ?? 1) / 100)).toFixed(2)} JCMOVES
              </span>
            </div>
            <Separator className="bg-slate-700" />
            <div className="flex justify-between text-sm">
              <span className="text-slate-300 font-medium">You'll Receive:</span>
              <span className="text-green-400 font-bold text-lg">
                {Math.max(0, tokenBalance - Math.max(payoutConfig?.minFee || 10, Math.ceil(tokenBalance * (payoutConfig?.feePercent ?? 1) / 100))).toFixed(2)} JCMOVES
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              The {payoutConfig?.feePercent ?? 1}% fee supports the JCMOVES buyback program.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300"
              onClick={() => setShowPayoutConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
              disabled={payoutMutation.isPending}
              onClick={() => {
                payoutMutation.mutate();
                setShowPayoutConfirm(false);
              }}
            >
              {payoutMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
              ) : (
                "Confirm & Transfer"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Overview - Condensed to 2 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card 
          className="transition-all border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/20 cursor-pointer"
          data-testid="card-wallet-balance"
          onClick={() => setWalletModalOpen(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              Balance & Holdings
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Wallet className="h-4 w-4 text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-100" data-testid="token-balance">
              {tokenBalance.toFixed(2)} {tokenInfo?.symbol || 'JCMOVES'}
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center mb-3">
              Portfolio Value: <span className="font-bold text-orange-400 ml-1">${(tokenBalance * (tokenInfo?.price || 0)).toFixed(2)}</span>
            </p>
            <div className="flex gap-2">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPayoutConfirm(true);
                }}
                disabled={payoutMutation.isPending || tokenBalance <= (payoutConfig?.minimumPayout || 11)}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/20"
                size="sm"
                data-testid="button-claim-to-wallet"
              >
                <ArrowUpRight className="mr-1 h-4 w-4" />
                Claim to Wallet
              </Button>
              <Link href="/staking" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400"
                  size="sm"
                  data-testid="button-earn-staking"
                >
                  <TrendingUp className="mr-1 h-4 w-4" />
                  Earn Staking
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Streak & Earnings</CardTitle>
            <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30">
              <Zap className="h-4 w-4 text-orange-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-orange-400" data-testid="streak-count">
                {miningStatus?.streakCount || 0} days
              </span>
              {miningStatus?.streakCount && miningStatus.streakCount > 1 && (
                <Badge className="text-xs bg-green-500/20 text-green-300 border border-green-500/30">
                  +{((miningStatus.streakCount - 1) * 1)}% bonus
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Total Earned: <span className="font-bold text-green-400" data-testid="total-earned">{parseFloat(wallet?.totalEarned || '0').toFixed(2)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="mining" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 border border-slate-700/50 p-1">
          <TabsTrigger value="mining" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-300" data-testid="tab-mining">
            <Zap className="h-4 w-4 mr-2" />
            Mining
          </TabsTrigger>
          <TabsTrigger value="referrals" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300" data-testid="tab-referrals">
            <Users className="h-4 w-4 mr-2" />
            Referrals
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300" data-testid="tab-history">
            <Clock className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Mining Tab */}
        <TabsContent value="mining" className="space-y-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Balance Card - Gradient Style */}
            <Card className="p-6 bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 text-white border-0 shadow-xl shadow-purple-900/30 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90 font-medium">Mining Balance</p>
                  <p className="text-4xl font-black mt-1">
                    {parseFloat(accumulatedTokens).toFixed(2)}
                  </p>
                  <p className="text-xs opacity-75 mt-1 font-medium">JCMOVES</p>
                </div>
                <Coins className="h-14 w-14 opacity-90" />
              </div>
            </Card>

            {!hasActiveSession ? (
              <Card className="p-8 text-center border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <div className="p-4 rounded-full bg-orange-500/20 border border-orange-500/30 w-fit mx-auto mb-4">
                  <Zap className="h-12 w-12 text-orange-400" />
                </div>
                <h2 className="text-2xl font-black text-slate-100 mb-2">Start Mining JCMOVES</h2>
                <p className="text-slate-400 mb-6">
                  Begin earning passive tokens automatically. You'll receive 1,728 JCMOVES every 24 hours! (2x Boost Active)
                </p>
                <Button
                  onClick={() => startMiningMutation.mutate()}
                  disabled={startMiningMutation.isPending}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg shadow-orange-500/25"
                  data-testid="button-start-mining"
                >
                  {startMiningMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Start Mining
                    </>
                  )}
                </Button>
              </Card>
            ) : (
              <>
                <Card className="p-6 bg-gradient-to-br from-orange-400 to-red-500 text-white border-0 shadow-xl shadow-orange-900/30 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-sm opacity-90 font-medium">Next Claim In</p>
                      <p className="text-5xl font-black font-mono mt-1" data-testid="text-countdown-timer">
                        {formatTimeRemaining(timeRemaining)}
                      </p>
                    </div>

                    <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs opacity-90 font-medium">Base Tokens</p>
                          <p className="text-2xl font-black" data-testid="text-accumulated-tokens">
                            {parseFloat(accumulatedTokens).toFixed(4)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs opacity-90 font-medium">Speed</p>
                          <p className="text-2xl font-black" data-testid="text-mining-speed">
                            {parseFloat(miningStatus.miningSpeed || "1.00").toFixed(0)}X
                          </p>
                        </div>
                      </div>
                      
                      {miningStatus?.streakCount > 0 && (
                        <div className="border-t border-white/30 pt-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Award className="h-4 w-4" />
                              <span className="text-xs opacity-90 font-medium">
                                {miningStatus.streakCount} Day Streak Bonus
                              </span>
                            </div>
                            <span className="text-lg font-black" data-testid="text-streak-bonus">
                              +{parseFloat(streakBonus || "0").toFixed(4)}
                            </span>
                          </div>
                          <div className="mt-2 text-center">
                            <p className="text-sm font-black">
                              Total: {(parseFloat(accumulatedTokens) + parseFloat(streakBonus || "0")).toFixed(4)} JCMOVES
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      disabled
                      className="w-full bg-white/30 hover:bg-white/40 text-white border-white/50"
                      data-testid="button-speed-up"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      Speed Up (Coming Soon)
                    </Button>

                    <Button
                      onClick={() => claimMutation.mutate()}
                      disabled={claimMutation.isPending || parseFloat(accumulatedTokens) === 0}
                      className="w-full bg-white text-orange-600 hover:bg-gray-100 font-bold"
                      data-testid="button-claim-tokens"
                    >
                      {claimMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Claiming...
                        </>
                      ) : (
                        <>
                          <Coins className="mr-2 h-4 w-4" />
                          Claim Tokens Now
                        </>
                      )}
                    </Button>
                  </div>
                </Card>

                <Card className="p-4 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-black text-orange-400" data-testid="text-daily-rate">
                        1,728
                      </p>
                      <p className="text-xs text-slate-400">Tokens/Day (2X)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-orange-400" data-testid="text-claimed-today">
                        {parseFloat(miningStatus.totalClaimedToday || "0").toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-400">Claimed Today</p>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* TrustDice Faucet Widget */}
            <Card className="p-6 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 text-white border-0 shadow-xl">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="text-6xl">🏴‍☠️</div>
                </div>
                <h3 className="text-2xl font-bold">TrustDice Crypto Faucet</h3>
                <p className="text-sm opacity-90">
                  Claim free crypto every 6 hours! Earn Bitcoin, Ethereum, and more from the TrustDice faucet.
                </p>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 space-y-2">
                  <p className="text-xs opacity-75">Referral Code</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-black/30 px-3 py-2 rounded font-mono text-sm">
                      u_jconthemove
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText('u_jconthemove');
                        toast({
                          title: "Copied!",
                          description: "Referral code copied to clipboard",
                        });
                      }}
                      data-testid="button-copy-trustdice-code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  asChild
                  className="w-full bg-white text-purple-700 hover:bg-gray-100 font-semibold"
                  data-testid="button-trustdice-faucet"
                >
                  <a
                    href="https://trustdice.win/?ref=u_jconthemove"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Open TrustDice Faucet
                  </a>
                </Button>
                <p className="text-xs opacity-75">
                  Use our referral code when signing up to support JCMOVES!
                </p>
              </div>
            </Card>

            {/* EMBER App Widget */}
            <Card className="p-6 bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 text-white border-0 shadow-xl">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="text-6xl">₿</div>
                </div>
                <h3 className="text-2xl font-bold">EMBER - Earn Bitcoin</h3>
                <p className="text-sm opacity-90">
                  Earn Satoshis (Bitcoin) every hour! Play games, make predictions, and join tournaments.
                </p>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 space-y-2">
                  <p className="text-xs opacity-75">Referral Code</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-black/30 px-3 py-2 rounded font-mono text-sm">
                      MNG-POKER-LPG
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText('MNG-POKER-LPG');
                        toast({
                          title: "Copied!",
                          description: "EMBER referral code copied to clipboard",
                        });
                      }}
                      data-testid="button-copy-ember-code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setEmberDialogOpen(true)}
                  data-testid="button-ember-details"
                >
                  <ChevronRight className="mr-2 h-4 w-4" />
                  See More Details
                </Button>
                <Button
                  asChild
                  className="w-full bg-white text-orange-600 hover:bg-gray-100 font-semibold"
                  data-testid="button-ember-signup"
                >
                  <a
                    href="https://emberfund.onelink.me/ljTI/l4g18zii?mining_referrer_id=MNG-POKER-LPG"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Sign Up with Referral Link
                  </a>
                </Button>
                <p className="text-xs opacity-75">
                  Use our referral link to support JCMOVES and earn more Satoshis!
                </p>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4">
          <div className="grid gap-6">
            <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <Share2 className="h-5 w-5 text-blue-400" />
                  </div>
                  Your Referral Code
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Share your code and earn $10.00 worth of {tokenInfo?.symbol || 'tokens'} for each friend who signs up!
                </CardDescription>
              </CardHeader>
              <CardContent>
                {referralCode?.referralCode ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg font-mono text-lg text-center text-orange-400 font-bold">
                      {referralCode.referralCode}
                    </div>
                    <Button onClick={copyReferralCode} variant="outline" className="border-slate-600 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50" data-testid="copy-referral-code">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-400">Loading your referral code...</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                    <Gift className="h-5 w-5 text-green-400" />
                  </div>
                  Have a Referral Code?
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Enter a friend's referral code to help them earn rewards!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Input
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                    placeholder="Enter referral code"
                    className="font-mono bg-slate-800/50 border-slate-600 text-slate-100 placeholder:text-slate-500"
                    data-testid="input-referral-code"
                  />
                  <Button 
                    onClick={() => applyReferralMutation.mutate(referralCodeInput)}
                    disabled={!referralCodeInput || applyReferralMutation.isPending}
                    className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                    data-testid="apply-referral-code"
                  >
                    {applyReferralMutation.isPending ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                    <Users className="h-5 w-5 text-purple-400" />
                  </div>
                  Your Referral Stats
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Track your referral earnings and see who you've referred
                </CardDescription>
              </CardHeader>
              <CardContent>
                {referralStats ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                        <p className="text-3xl font-black text-blue-400">{referralStats.referralCount}</p>
                        <p className="text-sm text-slate-400">Friends Referred</p>
                      </div>
                      <div className="text-center p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                        <p className="text-3xl font-black text-green-400">${referralStats.totalEarned.toFixed(2)}</p>
                        <p className="text-sm text-slate-400">Total Earned</p>
                      </div>
                    </div>

                    {referralStats.referredUsers.length > 0 && (
                      <div>
                        <h4 className="font-bold mb-3 text-slate-200">Recent Referrals</h4>
                        <div className="space-y-2">
                          {referralStats.referredUsers.slice(0, 5).map((user) => (
                            <div key={user.id} className="flex items-center justify-between p-3 border border-slate-700/50 rounded-lg bg-slate-900/50">
                              <div>
                                <p className="font-medium text-slate-200">
                                  {user.firstName && user.lastName 
                                    ? `${user.firstName} ${user.lastName}` 
                                    : user.email || 'Anonymous User'}
                                </p>
                                <p className="text-sm text-slate-500">
                                  Joined {new Date(user.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">
                                <Award className="h-3 w-3 mr-1" />
                                $10.00
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">Loading referral stats...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Full Earnings History Tab */}
        <TabsContent value="history" className="space-y-4">
          {rewardsHistory && rewardsHistory.length > 0 && (
            <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                    <p className="text-xs text-slate-400">Total Earned (All Time)</p>
                    <p className="text-lg font-bold text-green-400">
                      {allTimeTokensEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-slate-500">JCMOVES</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                    <p className="text-xs text-slate-400">Total Transactions</p>
                    <p className="text-lg font-bold text-blue-400">{totalRewards}</p>
                    <p className="text-xs text-slate-500">records</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center col-span-2 md:col-span-1">
                    <p className="text-xs text-slate-400">Cash Value</p>
                    <p className="text-lg font-bold text-purple-400">
                      ${allTimeCashEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-slate-500">USD equivalent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                  <Clock className="h-5 w-5 text-green-400" />
                </div>
                Earnings Statement
              </CardTitle>
              <CardDescription className="text-slate-400">
                Complete history of all JCMOVES earned — jobs, mining, referrals, staking, and more
                {totalRewards > 0 && ` (showing ${rewardsHistory?.length || 0} of ${totalRewards})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rewardsHistory && rewardsHistory.length > 0 ? (
                <div className="space-y-3">
                  {rewardsHistory.map((reward) => (
                    <div key={reward.id} className="flex items-center justify-between p-3 md:p-4 border border-slate-700/50 rounded-lg bg-slate-900/50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                          {getRewardTypeIcon(reward.rewardType)}
                        </div>
                        <div>
                          <p className="font-medium text-sm md:text-base text-slate-200">{getRewardTypeLabel(reward.rewardType)}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(reward.earnedDate).toLocaleDateString()} {new Date(reward.earnedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-400 text-sm md:text-base">
                          +{parseFloat(reward.tokenAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} JCMOVES
                        </p>
                        <Badge className={`text-[10px] ${getStatusColor(reward.status)}`}>
                          {reward.status}
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {hasMoreHistory && rewardsHistory.length < totalRewards && (
                    <Button
                      variant="outline"
                      className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                      onClick={loadMoreHistory}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...</>
                      ) : (
                        <>Load More ({totalRewards - rewardsHistory.length} remaining)</>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Coins className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400">No rewards yet. Start mining to earn tokens!</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Wallet Payouts History */}
          {payoutHistory && payoutHistory.length > 0 && (
            <Card className="border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <ArrowUpRight className="h-5 w-5 text-blue-400" />
                  </div>
                  Wallet Payouts
                </CardTitle>
                <CardDescription className="text-slate-400">Tokens sent to your personal wallet</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {payoutHistory.slice(0, 10).map((payout) => (
                    <div key={payout.id} className="flex items-center justify-between p-4 border border-slate-700/50 rounded-lg bg-slate-900/50">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg border ${
                          payout.status === 'confirmed' 
                            ? 'bg-green-500/20 border-green-500/30' 
                            : payout.status === 'failed'
                            ? 'bg-red-500/20 border-red-500/30'
                            : 'bg-yellow-500/20 border-yellow-500/30'
                        }`}>
                          {payout.status === 'confirmed' ? (
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          ) : payout.status === 'failed' ? (
                            <Clock className="h-4 w-4 text-red-400" />
                          ) : (
                            <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">
                            Payout to {payout.recipientAddress.slice(0, 6)}...{payout.recipientAddress.slice(-4)}
                          </p>
                          <p className="text-sm text-slate-500">
                            {new Date(payout.requestedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-400">
                          -{parseFloat(payout.tokenAmount).toFixed(2)} JCMOVES
                        </p>
                        {payout.transactionHash && (
                          <a 
                            href={`https://solscan.io/tx/${payout.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline flex items-center justify-end gap-1"
                          >
                            View TX <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                        <Badge className={
                          payout.status === 'confirmed' 
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : payout.status === 'failed'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                        }>
                          {payout.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Wallet Details Modal */}
      <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                <Wallet className="h-5 w-5 text-blue-400" />
              </div>
              My Wallet
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              View your token balance and transaction history
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Wallet Balance Summary */}
            <Card className="border border-slate-700/50 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-200">Balance Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Token Balance</span>
                  <span className="text-2xl font-black text-slate-100">
                    {tokenBalance.toFixed(2)} {tokenInfo?.symbol || 'JCMOVES'}
                  </span>
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">USD Value</span>
                  <span className="text-xl font-black text-green-400">
                    ${cashValue.toFixed(2)}
                  </span>
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Total Earned</span>
                  <span className="font-bold text-orange-400">
                    {parseFloat(wallet?.totalEarned || '0').toFixed(2)} {tokenInfo?.symbol || 'JCMOVES'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Earnings Breakdown by Category */}
            <Card className="border border-slate-700/50 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-slate-200">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  Earnings Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rewardsHistory && rewardsHistory.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const breakdown: Record<string, number> = {};
                      rewardsHistory.forEach(reward => {
                        const type = reward.rewardType;
                        breakdown[type] = (breakdown[type] || 0) + parseFloat(reward.tokenAmount);
                      });
                      
                      const categoryConfig: Record<string, { icon: any; label: string; color: string }> = {
                        mining: { icon: <Zap className="h-4 w-4" />, label: 'Mining', color: 'text-orange-400' },
                        daily_checkin: { icon: <Calendar className="h-4 w-4" />, label: 'Daily Check-in', color: 'text-orange-400' },
                        lead_creation: { icon: <Gift className="h-4 w-4" />, label: 'Job Creation', color: 'text-green-400' },
                        job_completion: { icon: <CheckCircle className="h-4 w-4" />, label: 'Job Completion', color: 'text-green-400' },
                        loyalty_booking: { icon: <Award className="h-4 w-4" />, label: 'Loyalty Bonus', color: 'text-purple-400' },
                        referral: { icon: <Users className="h-4 w-4" />, label: 'Referrals', color: 'text-blue-400' },
                        referral_request: { icon: <Share2 className="h-4 w-4" />, label: 'Referral Signup', color: 'text-blue-400' },
                        referral_confirmed: { icon: <Users className="h-4 w-4" />, label: 'Referral Confirmed', color: 'text-blue-400' },
                        manual_adjustment: { icon: <Coins className="h-4 w-4" />, label: 'Adjustments', color: 'text-yellow-400' },
                        signup_bonus: { icon: <Gift className="h-4 w-4" />, label: 'Signup Bonus', color: 'text-pink-400' },
                      };

                      return Object.entries(breakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, amount]) => {
                          const config = categoryConfig[type] || { icon: <Coins className="h-4 w-4" />, label: type.replace(/_/g, ' '), color: 'text-slate-400' };
                          return (
                            <div key={type} className="flex items-center justify-between p-2.5 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <div className={`${config.color}`}>{config.icon}</div>
                                <span className="text-xs text-slate-300 capitalize">{config.label}</span>
                              </div>
                              <span className={`font-bold text-sm ${config.color}`}>
                                {amount.toFixed(2)}
                              </span>
                            </div>
                          );
                        });
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-400">No earnings yet. Start mining or refer friends!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card className="border border-slate-700/50 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-slate-200">
                  <History className="h-4 w-4 text-green-400" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] pr-4">
                  {rewardsHistory && rewardsHistory.length > 0 ? (
                    <div className="space-y-3">
                      {rewardsHistory.slice(0, 15).map((reward) => (
                        <div key={reward.id} className="flex items-start justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded bg-slate-800 border border-slate-700">
                              {getRewardTypeIcon(reward.rewardType)}
                            </div>
                            <div>
                              <p className="font-medium text-sm text-slate-200">{getRewardTypeLabel(reward.rewardType)}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(reward.earnedDate).toLocaleDateString()} {new Date(reward.earnedDate).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm text-green-400">
                              +{parseFloat(reward.tokenAmount).toFixed(4)}
                            </p>
                            <p className="text-xs text-slate-500">
                              ${parseFloat(reward.cashValue).toFixed(4)}
                            </p>
                            <Badge variant="outline" className={`mt-1 text-xs ${getStatusColor(reward.status)}`}>
                              {reward.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <History className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                      <p className="text-slate-400">No transactions yet</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* EMBER App Details Dialog */}
      <Dialog open={emberDialogOpen} onOpenChange={setEmberDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <span className="text-3xl">₿</span>
              EMBER - Earn Bitcoin Every Hour
            </DialogTitle>
            <DialogDescription>
              Download EMBER to earn Satoshis (Bitcoin) through games, predictions, and tournaments
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Home Screen */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Your Earnings Dashboard</h3>
              <div className="rounded-lg overflow-hidden border">
                <img 
                  src="/attached_assets/Screenshot_20251101-185111.Ember_1762041207489.png" 
                  alt="EMBER Home Screen - Earnings Dashboard showing 10,864 Satoshis"
                  className="w-full"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Track your Satoshi earnings in real-time. Boost +10 Sat/hr with each active referral!
              </p>
            </div>

            {/* Predictions */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Make Predictions on Sports</h3>
              <div className="rounded-lg overflow-hidden border">
                <img 
                  src="/attached_assets/Screenshot_20251101-185121.Ember_1762041207519.png" 
                  alt="EMBER Predictions - Sports betting with multipliers"
                  className="w-full"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Predict NBA, NFL, NHL, and more. Earn Bitcoin from your predictions with up to 4x multipliers!
              </p>
            </div>

            {/* Games */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Play Games & Microtasks</h3>
              <div className="rounded-lg overflow-hidden border">
                <img 
                  src="/attached_assets/Screenshot_20251101-185127.Ember_1762041207531.png" 
                  alt="EMBER Games - Blackjack, Mines, Spinner, Dice, and more"
                  className="w-full"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Play Blackjack, Mines, Spinner, and more. All games are provably fair!
              </p>
            </div>

            {/* Tournaments */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Join Free Tournaments</h3>
              <div className="rounded-lg overflow-hidden border">
                <img 
                  src="/attached_assets/Screenshot_20251101-185130.Ember_1762041207545.png" 
                  alt="EMBER Tournaments - Free entry tournaments with prizes"
                  className="w-full"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Enter free tournaments with thousands of tickets available. Win Bitcoin prizes!
              </p>
            </div>

            {/* Referral Info */}
            <Card className="bg-gradient-to-br from-orange-500 to-red-600 text-white border-0">
              <CardContent className="p-6 text-center space-y-4">
                <h3 className="text-xl font-bold">Ready to Start Earning?</h3>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <p className="text-sm opacity-90 mb-2">Use Referral Code:</p>
                  <code className="text-lg font-mono font-bold">MNG-POKER-LPG</code>
                </div>
                <Button
                  asChild
                  className="w-full bg-white text-orange-600 hover:bg-gray-100 font-semibold"
                >
                  <a
                    href="https://emberfund.onelink.me/ljTI/l4g18zii?mining_referrer_id=MNG-POKER-LPG"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Download EMBER & Start Earning
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Legal Disclaimer Footer */}
      <div className="mt-8 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <p className="text-xs text-slate-500 text-center">
          Rewards are internal company credits for participation in JC ON THE MOVE services. 
          Blockchain tokens are distributed only upon user request. 
          <Link href="/terms" className="text-blue-400 hover:underline ml-1">
            View Terms & Rewards Disclaimer
          </Link>
        </p>
      </div>
    </div>
    </div>
  );
}
