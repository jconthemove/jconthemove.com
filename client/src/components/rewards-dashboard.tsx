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
  Send,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  History,
  ChevronRight,
  ChevronDown,
  X,
  Sparkles,
  Trophy
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface WalletAccount {
  id: string;
  userId: string;
  tokenBalance: string;
  totalEarned: string;
  totalRedeemed: string;
}

interface RewardHistory {
  id: string;
  rewardType: string;
  tokenAmount: string;
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
  const [fitnessDialogOpen, setFitnessDialogOpen] = useState(false);
  const [fitnessType, setFitnessType] = useState<'pushups' | 'situps'>('pushups');
  const [fitnessCount, setFitnessCount] = useState('');

  // Push notifications state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [notifLoading, setNotifLoading] = useState(false);
  const [miningAlertSent, setMiningAlertSent] = useState(false);

  // Sync permission state on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // Send a local notification when the mining timer hits zero (and we haven't sent one yet this cycle)
  useEffect(() => {
    if (
      !miningAlertSent &&
      timeRemaining <= 0 &&
      parseFloat(accumulatedTokens) > 0 &&
      notifPermission === 'granted'
    ) {
      setMiningAlertSent(true);
      import('@/lib/notifications').then(({ notificationService }) => {
        notificationService.notifyCanClaim(parseFloat(accumulatedTokens));
      });
    }
    if (timeRemaining > 30000) {
      setMiningAlertSent(false);
    }
  }, [timeRemaining, accumulatedTokens, notifPermission, miningAlertSent]);

  const handleEnableNotifications = async () => {
    setNotifLoading(true);
    try {
      const { notificationService } = await import('@/lib/notifications');
      const permission = await notificationService.requestPermission();
      setNotifPermission(permission);
      if (permission === 'granted') {
        toast({ title: 'Notifications enabled!', description: "We'll alert you when your mining session completes." });
      } else {
        toast({ title: 'Notifications blocked', description: 'You can enable them in your browser settings.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not enable notifications.', variant: 'destructive' });
    } finally {
      setNotifLoading(false);
    }
  };

  // Fitness mutation
  const fitnessMutation = useMutation({
    mutationFn: async (data: { type: 'pushups' | 'situps', count: number }) => {
      return await apiRequest("POST", "/api/mining/fitness", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      setFitnessDialogOpen(false);
      setFitnessCount('');
      toast({
        title: "Fitness Logged!",
        description: `Your mining speed has been boosted!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to log fitness",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

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
  const { data: rewardsData } = useQuery<{ rewards: RewardHistory[]; total: number; totalTokensEarned: string }>({
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
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleSession = (id: string) => setExpandedSessions(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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
          title: data.bonusAwarded ? `+${data.bonusAwarded} JCMOVES Earned!` : "Referral applied!",
          description: data.message,
        });
        setReferralCodeInput('');
        queryClient.invalidateQueries({ queryKey: ['/api/referrals/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/wallet'] });
        queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/rewards/history'] });
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

  // Share referral code via native share sheet, SMS, or email
  const shareReferralCode = async () => {
    const code = referralCode?.referralCode;
    if (!code) return;
    const shareUrl = `${window.location.origin}/auth?ref=${code}`;
    const shareText = `Join me on JC ON THE MOVE! Use my referral code ${code} when you sign up and get +1,000 JCMOVES tokens instantly. Sign up here: ${shareUrl}`;

    // Try native Web Share API first (works great on Android/iOS)
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join JC ON THE MOVE",
          text: `Use my referral code ${code} and get +1,000 JCMOVES tokens when you sign up!`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        // User cancelled — do nothing
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fallback: open a share options dialog via mailto (email)
    const emailSubject = encodeURIComponent("Join me on JC ON THE MOVE");
    const emailBody = encodeURIComponent(shareText);
    const smsBody = encodeURIComponent(shareText);

    // On mobile without Web Share, open SMS
    const isMobile = /android|iphone|ipad/i.test(navigator.userAgent);
    if (isMobile) {
      window.open(`sms:?body=${smsBody}`, "_self");
    } else {
      window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`);
    }
  };

  const getRewardTypeIcon = (type: string) => {
    switch (type) {
      case 'daily_checkin': return <Calendar className="h-4 w-4 text-blue-400" />;
      case 'mining_claim': return <Coins className="h-4 w-4 text-yellow-400" />;
      case 'booking': case 'booking_request': return <Award className="h-4 w-4 text-purple-400" />;
      case 'referral': case 'referral_request': case 'referral_signup_bonus': return <Gift className="h-4 w-4 text-pink-400" />;
      case 'referral_confirmed': return <Gift className="h-4 w-4 text-green-400" />;
      case 'signup_bonus': return <Gift className="h-4 w-4 text-yellow-400" />;
      case 'job_completion': case 'loyalty_booking': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'job_creation_bonus': case 'lead_creation': return <TrendingUp className="h-4 w-4 text-cyan-400" />;
      case 'staking_claim': return <TrendingUp className="h-4 w-4 text-yellow-400" />;
      case 'jewelry_listing': return <span className="text-base">💎</span>;
      case 'shop_listing': return <span className="text-base">🛍️</span>;
      case 'shop_purchase': case 'shop_sale': case 'shop_sale_confirmed': return <span className="text-base">🛒</span>;
      case 'quantum_spin_win': return <Sparkles className="h-4 w-4 text-purple-400" />;
      default:
        if (type.includes('jackpot_win')) return <Trophy className="h-4 w-4 text-yellow-400" />;
        if (type.includes('spin')) return <Sparkles className="h-4 w-4 text-purple-400" />;
        return <Coins className="h-4 w-4 text-slate-400" />;
    }
  };

  const getRewardTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'daily_checkin': 'Daily Check-in',
      'mining_claim': 'Mining Claim',
      'booking': 'Booking Reward',
      'booking_request': 'Booking Request',
      'referral': 'Referral Bonus',
      'referral_request': 'Referral Code Applied',
      'referral_signup_bonus': 'Referral Signup Bonus',
      'referral_confirmed': 'Referral Confirmed',
      'signup_bonus': 'Welcome Bonus',
      'job_completion': 'Job Completed',
      'loyalty_booking': 'Loyalty Booking',
      'job_creation_bonus': 'Job Creation Bonus',
      'lead_creation': 'Lead Created',
      'staking_claim': 'Staking Reward',
      'jewelry_listing': 'Jewelry Listed',
      'shop_listing': 'Shop Item Listed',
      'shop_purchase': 'Shop Purchase',
      'shop_sale': 'Shop Sale',
      'shop_sale_confirmed': 'Sale Confirmed',
      'quantum_spin_win': 'Quantum Spin Win',
      'mini_jackpot_win': '🎰 Mini Jackpot!',
      'major_jackpot_win': '🏆 Major Jackpot!',
    };
    if (type.includes('jackpot_win')) {
      const prefix = type.replace('_jackpot_win', '');
      return `🏆 ${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Jackpot Win!`;
    }
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

  const historyFilterOptions = [
    { value: 'all', label: 'All', color: 'slate' },
    { value: 'mining_claim', label: 'Mining', color: 'cyan' },
    { value: 'referral', label: 'Referrals', color: 'violet' },
    { value: 'job', label: 'Jobs', color: 'emerald' },
    { value: 'staking', label: 'Staking', color: 'yellow' },
    { value: 'signup_bonus', label: 'Bonus', color: 'pink' },
  ];

  const filteredHistory = (rewardsHistory || []).filter(r => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'referral') return r.rewardType.includes('referral');
    if (historyFilter === 'job') return r.rewardType.includes('job') || r.rewardType.includes('lead') || r.rewardType.includes('booking');
    if (historyFilter === 'staking') return r.rewardType.includes('staking');
    if (historyFilter === 'signup_bonus') return r.rewardType.includes('signup') || r.rewardType.includes('admin') || r.rewardType === 'signup_bonus';
    return r.rewardType === historyFilter || r.rewardType.includes(historyFilter);
  });

  const miningFill = Math.min(100, (parseFloat(accumulatedTokens) / (1728 * parseFloat(miningStatus?.miningSpeed || "1"))) * 100);
  const canClaim = parseFloat(accumulatedTokens) > 0 && !claimMutation.isPending;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto p-3 md:p-6 max-w-2xl">
      {/* Futuristic Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 rounded-full bg-gradient-to-b from-cyan-400 to-blue-600 shadow-[0_0_12px_rgba(0,220,255,0.7)]" />
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">JCMOVES <span className="text-cyan-400">Rewards</span></h1>
        </div>
        <p className="text-xs text-slate-500 pl-5">Earn tokens every day — mine, refer, work, stake</p>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-slate-900 border border-cyan-500/20 p-3 text-center shadow-[0_0_12px_rgba(0,220,255,0.06)]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Spendable Balance</p>
          <p className="text-lg font-black text-cyan-400 leading-none">{tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-[9px] text-slate-600 mt-0.5">JCMOVES</p>
        </div>
        <div className="rounded-xl bg-slate-900 border border-orange-500/20 p-3 text-center shadow-[0_0_12px_rgba(251,146,60,0.06)]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Streak</p>
          <p className="text-lg font-black text-orange-400 leading-none">{miningStatus?.streakCount || 0}</p>
          <p className="text-[9px] text-slate-600 mt-0.5">days 🔥</p>
        </div>
        <div className="rounded-xl bg-slate-900 border border-emerald-500/20 p-3 text-center shadow-[0_0_12px_rgba(52,211,153,0.06)]">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Lifetime Earned</p>
          <p className="text-lg font-black text-emerald-400 leading-none">{parseFloat(wallet?.totalEarned || '0').toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-[9px] text-slate-600 mt-0.5">before spending or payouts</p>
        </div>
      </div>
      <p className="mb-4 px-1 text-[11px] text-slate-500">
        Spendable Balance is what you can use right now. Lifetime Earned includes tokens you have earned in total, even if some were already spent, paid out, or staked.
      </p>

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

      {/* Wallet Action Bar */}
      <div className="flex gap-2 mb-5">
        <Button
          onClick={() => setShowPayoutConfirm(true)}
          disabled={payoutMutation.isPending || tokenBalance <= (payoutConfig?.minimumPayout || 11)}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold shadow-[0_0_16px_rgba(52,211,153,0.3)] border-0"
          size="sm"
          data-testid="button-claim-to-wallet"
        >
          <ArrowUpRight className="mr-1.5 h-4 w-4" /> Send to Wallet
        </Button>
        <Link href="/staking">
          <Button variant="outline" size="sm" className="border-violet-500/40 text-violet-300 hover:bg-violet-500/20" data-testid="button-earn-staking">
            <TrendingUp className="mr-1.5 h-4 w-4" /> Stake
          </Button>
        </Link>
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white border border-slate-700/50" onClick={() => setWalletModalOpen(true)}>
          <Wallet className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="mining" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <TabsTrigger value="mining" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-amber-500/20 data-[state=active]:text-orange-300 data-[state=active]:border data-[state=active]:border-orange-500/30 text-slate-500" data-testid="tab-mining">
            <Zap className="h-4 w-4 mr-1.5" /> Mining
          </TabsTrigger>
          <TabsTrigger value="referrals" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/30 data-[state=active]:to-purple-500/20 data-[state=active]:text-violet-300 data-[state=active]:border data-[state=active]:border-violet-500/30 text-slate-500" data-testid="tab-referrals">
            <Users className="h-4 w-4 mr-1.5" /> Referrals
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/30 data-[state=active]:to-teal-500/20 data-[state=active]:text-emerald-300 data-[state=active]:border data-[state=active]:border-emerald-500/30 text-slate-500" data-testid="tab-history">
            <Clock className="h-4 w-4 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* Mining Tab */}
        <TabsContent value="mining" className="space-y-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* ── MINING CORE CARD ── */}
            <div className="rounded-2xl bg-slate-900 border border-orange-500/20 overflow-hidden shadow-[0_0_30px_rgba(251,146,60,0.1)]">
              {/* Top: accumulation */}
              <div className="p-5 pb-3">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">Accumulating</p>
                    <p className="text-4xl font-black text-white tabular-nums" data-testid="text-accumulated-tokens">
                      {parseFloat(accumulatedTokens).toFixed(2)}
                    </p>
                    <p className="text-xs text-orange-400 font-bold mt-0.5">JCMOVES</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">Speed</p>
                    <p className="text-2xl font-black text-cyan-400" data-testid="text-mining-speed">
                      {hasActiveSession ? `${parseFloat(miningStatus?.miningSpeed || "1").toFixed(0)}X` : '—'}
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2.5 rounded-full bg-slate-800 border border-slate-700 overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 transition-all duration-1000"
                    style={{ width: `${miningFill}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-600 text-right">{miningFill.toFixed(1)}% of daily max</p>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

              {/* Bottom: timer or start */}
              <div className="p-5 pt-4">
                {!hasActiveSession ? (
                  <div className="text-center space-y-4">
                    <div className="text-4xl">⛏️</div>
                    <div>
                      <p className="text-white font-black text-lg">Ready to Mine?</p>
                      <p className="text-slate-500 text-xs mt-1">Earn 1,728 JCMOVES every 24 hours — 2× boost active!</p>
                    </div>
                    <Button
                      onClick={() => startMiningMutation.mutate()}
                      disabled={startMiningMutation.isPending}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-base py-5 shadow-[0_0_20px_rgba(251,146,60,0.4)] border-0"
                      data-testid="button-start-mining"
                    >
                      {startMiningMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</> : <><Zap className="mr-2 h-5 w-5" />Activate Mining</>}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Countdown */}
                    <div className="text-center">
                      <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">
                        {timeRemaining > 0 ? 'Next Claim In' : '✅ Ready to Claim!'}
                      </p>
                      <p className="text-4xl font-black font-mono text-white" data-testid="text-countdown-timer">
                        {timeRemaining > 0 ? formatTimeRemaining(timeRemaining) : 'CLAIM NOW'}
                      </p>
                    </div>
                    {/* Streak bonus */}
                    {(miningStatus?.streakCount || 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <span className="text-xs text-amber-300 flex items-center gap-1.5">
                          <span>🔥</span> {miningStatus.streakCount}-Day Streak Bonus
                        </span>
                        <span className="text-sm font-black text-amber-400" data-testid="text-streak-bonus">
                          +{parseFloat(streakBonus || "0").toFixed(2)}
                        </span>
                      </div>
                    )}
                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl bg-slate-800/80 border border-slate-700/50 p-2">
                        <p className="text-lg font-black text-orange-400" data-testid="text-daily-rate">1,728</p>
                        <p className="text-[10px] text-slate-500">Tokens/Day (2×)</p>
                      </div>
                      <div className="rounded-xl bg-slate-800/80 border border-slate-700/50 p-2">
                        <p className="text-lg font-black text-orange-400" data-testid="text-claimed-today">{parseFloat(miningStatus?.totalClaimedToday || "0").toFixed(0)}</p>
                        <p className="text-[10px] text-slate-500">Claimed Today</p>
                      </div>
                    </div>
                    {/* Claim button */}
                    <Button
                      onClick={() => claimMutation.mutate()}
                      disabled={!canClaim}
                      className={`w-full font-black text-base py-5 border-0 transition-all ${canClaim
                        ? 'bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-[0_0_24px_rgba(251,146,60,0.5)] animate-pulse'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                      data-testid="button-claim-tokens"
                    >
                      {claimMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Claiming...</> : <><Coins className="mr-2 h-5 w-5" />Claim Tokens Now</>}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Push Notification Toggle */}
            {'Notification' in window && (
              <div className="px-5 pb-4">
                {notifPermission === 'granted' ? (
                  <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
                    <span className="text-emerald-400 text-lg">🔔</span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-emerald-400 leading-tight">Notifications On</p>
                      <p className="text-[10px] text-slate-500">You'll be alerted when tokens are ready to claim</p>
                    </div>
                  </div>
                ) : notifPermission === 'denied' ? (
                  <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
                    <span className="text-slate-500 text-lg">🔕</span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-400 leading-tight">Notifications Blocked</p>
                      <p className="text-[10px] text-slate-600">Enable in your browser or device settings</p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleEnableNotifications}
                    disabled={notifLoading}
                    className="w-full flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 hover:border-blue-400/60 hover:bg-blue-500/15 rounded-xl px-4 py-3 text-left transition-all active:scale-95 disabled:opacity-60"
                  >
                    {notifLoading ? (
                      <Loader2 className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" />
                    ) : (
                      <span className="text-lg">🔔</span>
                    )}
                    <div className="flex-1">
                      <p className="text-xs font-bold text-blue-400 leading-tight">Enable Mining Alerts</p>
                      <p className="text-[10px] text-slate-500">Get notified when your session completes or you earn tokens</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-blue-500/60 flex-shrink-0" />
                  </button>
                )}
              </div>
            )}

            {/* Fitness Boost Section */}
            <div className="px-5 pb-5">
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 pl-0.5">💪 Fitness Speed Boosts</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Push-ups card */}
                <button
                  onClick={(e) => { e.stopPropagation(); setFitnessType('pushups'); setFitnessDialogOpen(true); }}
                  className="group bg-slate-800/60 border border-cyan-500/20 hover:border-cyan-500/60 hover:bg-cyan-500/5 rounded-xl p-3 text-left transition-all active:scale-95"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xl leading-none">💪</span>
                    <span className="text-[10px] text-cyan-500/70 font-semibold uppercase tracking-wide">Tap to Log</span>
                  </div>
                  <p className="text-2xl font-black text-white leading-none">{miningStatus?.fitness?.pushups || 0}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Push-ups today</p>
                  <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                      style={{ width: `${Math.min(100, ((miningStatus?.fitness?.pushups || 0) / 61) * 100)}%` }} />
                  </div>
                </button>
                {/* Sit-ups card */}
                <button
                  onClick={(e) => { e.stopPropagation(); setFitnessType('situps'); setFitnessDialogOpen(true); }}
                  className="group bg-slate-800/60 border border-purple-500/20 hover:border-purple-500/60 hover:bg-purple-500/5 rounded-xl p-3 text-left transition-all active:scale-95"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xl leading-none">🔥</span>
                    <span className="text-[10px] text-purple-500/70 font-semibold uppercase tracking-wide">Tap to Log</span>
                  </div>
                  <p className="text-2xl font-black text-white leading-none">{miningStatus?.fitness?.situps || 0}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Sit-ups today</p>
                  <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                      style={{ width: `${Math.min(100, ((miningStatus?.fitness?.situps || 0) / 61) * 100)}%` }} />
                  </div>
                </button>
              </div>
            </div>

            {/* ── Partner Bonuses (compact 2-up) ── */}
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 pl-1">Partner Bonuses</p>
              <div className="grid grid-cols-2 gap-2">
                {/* TrustDice */}
                <div className="rounded-xl bg-purple-950/60 border border-purple-500/20 p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏴‍☠️</span>
                    <div>
                      <p className="text-xs font-bold text-purple-300 leading-tight">TrustDice</p>
                      <p className="text-[10px] text-slate-500">Free crypto every 6 hrs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/30 rounded-lg px-2 py-1">
                    <code className="text-[10px] text-purple-300 flex-1 truncate font-mono">u_jconthemove</code>
                    <button onClick={() => { navigator.clipboard.writeText('u_jconthemove'); toast({ title: "Copied!" }); }} className="text-slate-400 hover:text-white" data-testid="button-copy-trustdice-code">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <a href="https://trustdice.win/?ref=u_jconthemove" target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium" data-testid="button-trustdice-faucet">
                    Open Faucet <ArrowUpRight className="h-2.5 w-2.5" />
                  </a>
                </div>
                {/* EMBER */}
                <div className="rounded-xl bg-orange-950/60 border border-orange-500/20 p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">₿</span>
                    <div>
                      <p className="text-xs font-bold text-orange-300 leading-tight">EMBER</p>
                      <p className="text-[10px] text-slate-500">Bitcoin every hour</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/30 rounded-lg px-2 py-1">
                    <code className="text-[10px] text-orange-300 flex-1 truncate font-mono">MNG-POKER-LPG</code>
                    <button onClick={() => { navigator.clipboard.writeText('MNG-POKER-LPG'); toast({ title: "Copied!" }); }} className="text-slate-400 hover:text-white" data-testid="button-copy-ember-code">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setEmberDialogOpen(true)} className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-0.5 font-medium" data-testid="button-ember-details">
                      Details <ChevronRight className="h-2.5 w-2.5" />
                    </button>
                    <span className="text-slate-700">·</span>
                    <a href="https://emberfund.onelink.me/ljTI/l4g18zii?mining_referrer_id=MNG-POKER-LPG" target="_blank" rel="noopener noreferrer" className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-0.5 font-medium" data-testid="button-ember-signup">
                      Sign Up <ArrowUpRight className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* ── How to Earn More ── */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <p className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-yellow-400" /> Boost Your Earnings</p>
              <div className="space-y-2">
                {[
                  { icon: '📋', label: 'Post a job', amount: '+100 JCMOVES', color: 'text-cyan-400' },
                  { icon: '🎉', label: 'Job completion bonus', amount: '+1,500 JCMOVES', color: 'text-emerald-400' },
                  { icon: '💵', label: 'Per dollar spent on jobs', amount: '+15 JCMOVES', color: 'text-green-400' },
                  { icon: '⭐', label: 'Leave a review', amount: '+150 JCMOVES', color: 'text-amber-400' },
                  { icon: '👥', label: 'Refer a friend', amount: '+2,500 JCMOVES', color: 'text-violet-400' },
                  { icon: '🔗', label: 'Daily mining claim', amount: '+1,728 JCMOVES', color: 'text-orange-400' },
                  { icon: '💎', label: 'Stake JCMOVES', amount: 'Up to 18% APR*', color: 'text-yellow-400' },
                ].map(({ icon, label, amount, color }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-800/80 last:border-0">
                    <span className="text-xs text-slate-400 flex items-center gap-2"><span>{icon}</span>{label}</span>
                    <span className={`text-xs font-bold ${color}`}>{amount}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2.5 leading-snug">* Variable rewards based on company policy of distribution</p>
            </div>
          </div>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4">
          <div className="space-y-4">
            {/* Your code */}
            <div className="rounded-2xl bg-slate-900 border border-violet-500/20 p-5 shadow-[0_0_20px_rgba(139,92,246,0.07)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-violet-400" />
                  <p className="text-sm font-bold text-white">Your Referral Code</p>
                </div>
                <button
                  onClick={shareReferralCode}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  Share
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">Share this code — you earn <span className="text-violet-400 font-bold">+2,500 JCMOVES</span> when a friend signs up</p>
              {referralCode?.referralCode ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-3 bg-slate-800 border border-violet-500/30 rounded-xl font-mono text-xl text-center text-violet-300 font-black tracking-widest shadow-[0_0_12px_rgba(139,92,246,0.2)]">
                    {referralCode.referralCode}
                  </div>
                  <Button onClick={copyReferralCode} size="sm" className="bg-violet-600 hover:bg-violet-700 border-0 text-white" data-testid="copy-referral-code">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button onClick={shareReferralCode} size="sm" className="bg-blue-600 hover:bg-blue-700 border-0 text-white" title="Share via text or email">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="h-12 rounded-xl bg-slate-800 animate-pulse" />
              )}
            </div>

            {/* Referral stats */}
            {referralStats && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-900 border border-blue-500/20 p-4 text-center">
                  <p className="text-3xl font-black text-blue-400">{referralStats.referralCount}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Friends Recruited</p>
                </div>
                <div className="rounded-xl bg-slate-900 border border-emerald-500/20 p-4 text-center">
                  <p className="text-3xl font-black text-emerald-400">{referralStats.totalEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-[10px] text-slate-500 mt-1">JCMOVES Earned</p>
                </div>
              </div>
            )}

            {/* Apply a code */}
            <div className="rounded-2xl bg-slate-900 border border-emerald-500/20 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-bold text-white">Got a Referral Code?</p>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">Apply a friend's code and get <span className="text-emerald-400 font-bold">+1,000 JCMOVES</span> instantly</p>
              <div className="flex gap-2">
                <Input
                  value={referralCodeInput}
                  onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter code..."
                  className="font-mono bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600"
                  data-testid="input-referral-code"
                />
                <Button
                  onClick={() => applyReferralMutation.mutate(referralCodeInput)}
                  disabled={!referralCodeInput || applyReferralMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 border-0 text-white font-bold"
                  data-testid="apply-referral-code"
                >
                  {applyReferralMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            </div>

            {/* Recent referrals */}
            {referralStats && referralStats.referredUsers.length > 0 && (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                <p className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2"><Users className="h-3.5 w-3.5 text-violet-400" /> Recent Referrals</p>
                <div className="space-y-2">
                  {referralStats.referredUsers.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email || 'Anonymous'}
                        </p>
                        <p className="text-[10px] text-slate-600">{new Date(user.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px]">+2,500</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Earn ways card */}
            <div className="rounded-2xl overflow-hidden border border-slate-800">
              <div className="bg-gradient-to-r from-violet-900/60 to-purple-900/40 p-3 border-b border-slate-800">
                <p className="text-xs font-bold text-violet-300 flex items-center gap-1.5"><Award className="h-3.5 w-3.5" /> Referral Reward Tiers</p>
              </div>
              <div className="bg-slate-900 divide-y divide-slate-800">
                {[
                  { label: 'You apply a code', reward: '+1,000 JCMOVES', note: 'one time' },
                  { label: 'Friend signs up with your code', reward: '+2,500 JCMOVES', note: 'per person' },
                  { label: 'Friend completes first booking', reward: '+500 JCMOVES', note: 'bonus' },
                ].map(({ label, reward, note }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-slate-400">{label}</span>
                    <div className="text-right">
                      <span className="text-xs font-bold text-violet-400 block">{reward}</span>
                      <span className="text-[9px] text-slate-600">{note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-900 border border-emerald-500/20 p-3 text-center">
              <p className="text-lg font-black text-emerald-400">{allTimeTokensEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-[10px] text-slate-500">Lifetime Earned</p>
            </div>
            <div className="rounded-xl bg-slate-900 border border-blue-500/20 p-3 text-center">
              <p className="text-lg font-black text-blue-400">{totalRewards}</p>
              <p className="text-[10px] text-slate-500">Transactions</p>
            </div>
            <div className="rounded-xl bg-slate-900 border border-violet-500/20 p-3 text-center">
              <p className="text-lg font-black text-violet-400">{(rewardsHistory || []).filter(r => r.rewardType.includes('mining')).length}</p>
              <p className="text-[10px] text-slate-500">Mining Claims</p>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {historyFilterOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setHistoryFilter(value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  historyFilter === value
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                {label}
                {value !== 'all' && (
                  <span className="ml-1.5 opacity-60">
                    {(rewardsHistory || []).filter(r => {
                      if (value === 'referral') return r.rewardType.includes('referral');
                      if (value === 'job') return r.rewardType.includes('job') || r.rewardType.includes('lead') || r.rewardType.includes('booking');
                      if (value === 'staking') return r.rewardType.includes('staking');
                      if (value === 'signup_bonus') return r.rewardType.includes('signup') || r.rewardType.includes('admin');
                      return r.rewardType === value || r.rewardType.includes(value);
                    }).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Transaction list */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {filteredHistory.length > 0 ? (
              <div className="divide-y divide-slate-800/80">
                {filteredHistory.map((reward) => {
                  const isMining = reward.rewardType.includes('mining');
                  const isReferral = reward.rewardType.includes('referral');
                  const isJob = reward.rewardType.includes('job') || reward.rewardType.includes('lead');
                  const isStaking = reward.rewardType.includes('staking');
                  const borderColor = isMining ? 'border-l-orange-500' : isReferral ? 'border-l-violet-500' : isJob ? 'border-l-emerald-500' : isStaking ? 'border-l-yellow-500' : 'border-l-pink-500';
                  const amountColor = isMining ? 'text-orange-400' : isReferral ? 'text-violet-400' : isJob ? 'text-emerald-400' : isStaking ? 'text-yellow-400' : 'text-pink-400';
                  return (
                    <div key={reward.id} className={`flex items-center justify-between px-4 py-3 border-l-2 ${borderColor}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-lg flex-shrink-0">{getRewardTypeIcon(reward.rewardType)}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{getRewardTypeLabel(reward.rewardType)}</p>
                          <p className="text-[10px] text-slate-600">{new Date(reward.earnedDate).toLocaleDateString()} · {new Date(reward.earnedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className={`text-sm font-black ${amountColor}`}>+{parseFloat(reward.tokenAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        <p className={`text-[9px] uppercase tracking-wider ${reward.status === 'confirmed' ? 'text-emerald-600' : 'text-slate-600'}`}>{reward.status}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-slate-500 text-sm">No {historyFilter === 'all' ? '' : historyFilter} transactions yet</p>
                {historyFilter !== 'all' && (
                  <button onClick={() => setHistoryFilter('all')} className="text-xs text-emerald-400 hover:text-emerald-300 mt-2">Show all</button>
                )}
              </div>
            )}
          </div>

          {/* Load more */}
          {hasMoreHistory && rewardsHistory && rewardsHistory.length < totalRewards && (
            <Button
              variant="outline"
              className="w-full border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 bg-slate-900"
              onClick={loadMoreHistory}
              disabled={loadingMore}
            >
              {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...</> : <>Load More ({totalRewards - (rewardsHistory?.length || 0)} remaining)</>}
            </Button>
          )}

          {/* Payout history (compact) */}
          {payoutHistory && payoutHistory.length > 0 && (
            <div className="rounded-2xl bg-slate-900 border border-blue-500/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <ArrowUpRight className="h-3.5 w-3.5 text-blue-400" />
                <p className="text-xs font-bold text-blue-300">Wallet Payouts</p>
              </div>
              <div className="divide-y divide-slate-800/80">
                {payoutHistory.slice(0, 10).map((payout) => (
                  <div key={payout.id} className="flex items-center justify-between px-4 py-3 border-l-2 border-l-blue-500">
                    <div>
                      <p className="text-sm text-slate-300 font-medium">→ {payout.recipientAddress.slice(0, 6)}…{payout.recipientAddress.slice(-4)}</p>
                      <p className="text-[10px] text-slate-600">{new Date(payout.requestedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-blue-400">-{parseFloat(payout.tokenAmount).toFixed(0)}</p>
                      <div className="flex items-center gap-1.5 justify-end">
                        {payout.transactionHash && (
                          <a href={`https://solscan.io/tx/${payout.transactionHash}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500 hover:text-blue-400">TX ↗</a>
                        )}
                        <span className={`text-[9px] uppercase ${payout.status === 'confirmed' ? 'text-emerald-600' : payout.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>{payout.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

      {/* ── Fitness Boost Dialog ── */}
      <Dialog open={fitnessDialogOpen} onOpenChange={setFitnessDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <span>{fitnessType === 'pushups' ? '💪' : '🔥'}</span>
              {fitnessType === 'pushups' ? 'Log Push-ups' : 'Log Sit-ups'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Tap a set size each time you finish a round. Your daily total builds up all day.
            </DialogDescription>
          </DialogHeader>

          {/* Current daily total + speed badge */}
          {(() => {
            const current = fitnessType === 'pushups'
              ? (miningStatus?.fitness?.pushups || 0)
              : (miningStatus?.fitness?.situps || 0);
            const tiers = [
              { min: 61, boost: '+1.00x', label: 'MAX BOOST', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/40' },
              { min: 41, boost: '+0.75x', label: 'Elite', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/40' },
              { min: 31, boost: '+0.50x', label: 'Advanced', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/40' },
              { min: 21, boost: '+0.40x', label: 'Intermediate', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/40' },
              { min: 10, boost: '+0.25x', label: 'Starter', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/40' },
              { min: 0, boost: '+0.00x', label: 'No boost yet', color: 'text-slate-500', bg: 'bg-slate-800 border-slate-700' },
            ];
            const currentTier = tiers.find(t => current >= t.min)!;
            const nextTier = tiers.slice(0, tiers.indexOf(currentTier)).reverse()[0];
            const progressToNext = nextTier
              ? Math.min(100, Math.round(((current - currentTier.min) / (nextTier.min - currentTier.min)) * 100))
              : 100;
            return (
              <div className="space-y-4">
                {/* Total + tier badge */}
                <div className="flex items-center justify-between bg-slate-800/60 rounded-xl p-4">
                  <div>
                    <p className="text-3xl font-black text-white">{current}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Today's total</p>
                  </div>
                  <div className={`px-3 py-2 rounded-xl border text-right ${currentTier.bg}`}>
                    <p className={`text-lg font-black ${currentTier.color}`}>{currentTier.boost}</p>
                    <p className={`text-[10px] font-semibold ${currentTier.color} opacity-80`}>{currentTier.label}</p>
                  </div>
                </div>

                {/* Progress to next tier */}
                {nextTier && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>{current} reps</span>
                      <span>Next tier at {nextTier.min} reps</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${progressToNext}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{nextTier.min - current} more to reach {nextTier.boost} speed boost</p>
                  </div>
                )}
                {!nextTier && (
                  <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
                    <span className="text-xl">🏆</span>
                    <p className="text-sm font-bold text-yellow-400">MAX BOOST REACHED! Keep grinding!</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick-add set buttons */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Tap when you finish a set</p>
            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  disabled={fitnessMutation.isPending}
                  onClick={() => fitnessMutation.mutate({ type: fitnessType, count: amt })}
                  className="bg-slate-800/60 border-slate-600 text-white hover:bg-slate-700 hover:border-cyan-500/50 hover:text-cyan-300 font-bold text-base py-6 flex flex-col gap-0.5 h-auto transition-all active:scale-95"
                >
                  <span className="text-lg leading-none">+{amt}</span>
                  <span className="text-[10px] text-slate-400 font-normal">reps</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Custom count input */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Or enter a custom count</p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="e.g. 15"
                min={1}
                max={1000}
                value={fitnessCount}
                onChange={(e) => setFitnessCount(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-600 flex-1"
              />
              <Button
                disabled={!fitnessCount || parseInt(fitnessCount) < 1 || fitnessMutation.isPending}
                onClick={() => {
                  const n = parseInt(fitnessCount);
                  if (n > 0) fitnessMutation.mutate({ type: fitnessType, count: n });
                }}
                className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-bold px-5 border-0"
              >
                {fitnessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
          </div>

          {/* Speed tier chart */}
          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Speed Boost Tiers</p>
            <div className="space-y-1.5">
              {[
                { reps: '61+', boost: '+1.00x', color: 'text-yellow-400' },
                { reps: '41–60', boost: '+0.75x', color: 'text-purple-400' },
                { reps: '31–40', boost: '+0.50x', color: 'text-blue-400' },
                { reps: '21–30', boost: '+0.40x', color: 'text-cyan-400' },
                { reps: '10–20', boost: '+0.25x', color: 'text-emerald-400' },
              ].map(({ reps, boost, color }) => (
                <div key={reps} className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">{reps} reps</span>
                  <span className={`text-xs font-bold ${color}`}>{boost} mining speed</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">Each exercise counts separately. Max boost = +2.00x total.</p>
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
