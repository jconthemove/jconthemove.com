import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Coins, Search, Filter, CheckCircle2, Clock, ChevronRight,
  Star, Zap, Trophy, Package, Gift, MapPin, Snowflake, Gamepad2,
  Wrench, Crown, ShoppingBag, History, Calculator, Users, TrendingUp, Info, Flame, Sparkles,
  Copy, Check, Ticket, Coffee, Tag, CreditCard, ExternalLink
} from "lucide-react";
import { LOYALTY_TIERS, calculateJCMovesReward, getNextTier, formatTokens as fmtTokens, type LoyaltyTierKey } from "@/lib/loyalty";
import { SpinWheelDialog } from "@/components/spin-wheel";
import { LaborCalculatorDialog } from "@/components/labor-calculator-dialog";

interface RewardCategory {
  id: number;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

interface RewardItem {
  id: number;
  categoryId: number;
  name: string;
  shortDesc: string;
  fullDesc?: string;
  image?: string;
  tokenPrice: number;
  salePriceTokens?: number | null;
  cashValue?: string | null;
  status: string;
  featured: boolean;
  inventory?: number | null;
  maxPerUser: number;
  maxPerMonth: number;
  tierRequired: string;
  deliveryType: string;
  scheduleRequired: boolean;
  expirationDays?: number | null;
  promoBadge?: string | null;
  isLimitedTime: boolean;
  // Logic flags
  isInstant: boolean;
  requiresApproval: boolean;
  requiresSchedule: boolean;
  createsInvoiceCredit: boolean;
  createsServiceCredit: boolean;
  createsSpinCredit: boolean;
  usesMysteryPool: boolean;
  isBundle: boolean;
  fulfillmentNote?: string | null;
}

interface ItemRow {
  item: RewardItem;
  category: RewardCategory | null;
}

interface RedemptionRecord {
  id: number;
  itemName: string;
  tokenCost: number;
  status: string;
  createdAt: string;
  scheduledDate?: string | null;
  userNotes?: string | null;
  couponCode?: string | null;
}

const CATEGORY_ICONS: Record<string, any> = {
  "☕ Entry Tier":       Coffee,
  "🎟️ Discount Coupons": Tag,
  "🛠️ Service Credits":  Wrench,
  "🎁 Gift Cards":       CreditCard,
  "⚡ Quantum Spin":     Zap,
  // legacy
  "Quick Rewards": Zap,
  "Service Credits": Wrench,
  "Premium Rewards": Crown,
  "Local Deals": MapPin,
  "Seasonal Specials": Snowflake,
  "Digital & Fun": Gamepad2,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  pending_approval: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  redeemed_pending_schedule: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  approved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  scheduled: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  fulfilled: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  denied: "bg-red-500/20 text-red-400 border-red-500/30",
  refunded: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  expired: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  pending_approval: "Awaiting Approval",
  redeemed_pending_schedule: "Schedule Needed",
  approved: "Approved",
  scheduled: "Scheduled",
  completed: "Completed",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  denied: "Denied",
  refunded: "Refunded",
  expired: "Expired",
};

function getCtaLabel(item: RewardItem): string {
  if (item.createsSpinCredit) return "Spin for Prize";
  if (item.usesMysteryPool) return "Open Mystery Box";
  if (item.isBundle) return "Request VIP Bundle";
  if (item.requiresApproval) return "Request Approval";
  if (item.requiresSchedule || item.scheduleRequired) return "Redeem & Schedule";
  if (item.createsServiceCredit) return "Redeem Credit";
  if (item.createsInvoiceCredit) return "Apply Credit";
  if (item.isInstant) return "Redeem Instantly";
  return "Redeem Now";
}

function getFulfillmentBadge(item: RewardItem): { label: string; className: string } | null {
  if ((item as any).createsCouponCode) return { label: "🎟️ Instant Coupon Code", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
  if (item.createsSpinCredit) return { label: "Spin Wheel", className: "bg-pink-500/20 text-pink-400 border-pink-500/30" };
  if (item.usesMysteryPool) return { label: "Mystery", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
  if (item.isBundle) return { label: "Bundle", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
  if (item.requiresApproval) return { label: "Approval Required", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
  if (item.requiresSchedule || item.scheduleRequired) return { label: "Schedule Required", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
  if (item.createsInvoiceCredit) return { label: "Invoice Credit", className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" };
  if (item.createsServiceCredit) return { label: "Labor Credit", className: "bg-teal-500/20 text-teal-400 border-teal-500/30" };
  if (item.isInstant) return { label: "Instant", className: "bg-green-500/20 text-green-400 border-green-500/30" };
  return null;
}

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

export default function RewardsMarketplacePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"shop" | "history">("shop");
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [redeemItem, setRedeemItem] = useState<RewardItem | null>(null);
  const [userNotes, setUserNotes] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [spinWheelOpen, setSpinWheelOpen] = useState(false);
  const [spinRedemptionId, setSpinRedemptionId] = useState<number | undefined>(undefined);
  const [directSpinOpen, setDirectSpinOpen] = useState(false);
  const [autoBookingLeadId, setAutoBookingLeadId] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simAmount, setSimAmount] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [shipOption, setShipOption] = useState<"pickup" | "ship">("pickup");
  const [shipName, setShipName] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipPhone, setShipPhone] = useState("");
  const lastRedeemedItemRef = useRef<RewardItem | null>(null);

  const userTier = (((user as any)?.loyaltyTier) || 'bronze') as LoyaltyTierKey;
  const totalSpend = parseFloat((user as any)?.totalCompletedSpend || '0');
  const tierConfig = LOYALTY_TIERS[userTier];
  const nextTierKey = getNextTier(userTier);
  const nextTierConfig = nextTierKey ? LOYALTY_TIERS[nextTierKey] : null;
  const tierProgress = nextTierConfig
    ? Math.min(100, Math.round(((totalSpend - tierConfig.minSpend) / (nextTierConfig.minSpend - tierConfig.minSpend)) * 100))
    : 100;
  const simTokens = useMemo(() => {
    const v = parseFloat(simAmount);
    if (!v || v <= 0) return null;
    return {
      bronze: calculateJCMovesReward(v, 'bronze'),
      silver: calculateJCMovesReward(v, 'silver'),
      gold: calculateJCMovesReward(v, 'gold'),
      vip: calculateJCMovesReward(v, 'vip'),
    };
  }, [simAmount]);

  const { data: shopData, isLoading } = useQuery<{ items: ItemRow[]; walletBalance: number }>({
    queryKey: ["/api/reward-shop/items"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: categories } = useQuery<RewardCategory[]>({
    queryKey: ["/api/reward-shop/categories"],
    enabled: !!user,
  });

  const { data: jackpots = [] } = useQuery<any[]>({
    queryKey: ["/api/reward-shop/jackpots"],
    refetchInterval: 30000,
  });
  const miniJackpot = jackpots.find((j: any) => j.type === "mini");
  const majorJackpot = jackpots.find((j: any) => j.type === "major");

  const { data: myRedemptions } = useQuery<RedemptionRecord[]>({
    queryKey: ["/api/reward-shop/my-redemptions"],
    enabled: !!user && activeTab === "history",
  });

  const redeemMutation = useMutation({
    mutationFn: (data: { itemId: number; userNotes?: string; scheduledDate?: string }) =>
      apiRequest("POST", "/api/reward-shop/redeem", data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/my-redemptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      const redeemedItem = redeemItem;
      lastRedeemedItemRef.current = redeemItem;
      setRedeemItem(null);
      setUserNotes("");
      setScheduledDate("");
      // If this was a Spin Wheel Entry, launch the wheel immediately
      const isSpinEntry = redeemedItem?.name?.toLowerCase().includes("spin");
      if (isSpinEntry) {
        const rid = (data as any)?.redemption?.id;
        setSpinRedemptionId(rid);
        setSpinWheelOpen(true);
      } else {
        const leadId = (data as any)?.autoCreatedLeadId;
        if (leadId) {
          setAutoBookingLeadId(leadId);
          toast({
            title: "🎁 Reward Redeemed — Booking Created!",
            description: `${redeemedItem?.name} — A service request has been submitted with your reward applied.`,
          });
        } else {
          toast({
            title: "🎁 Reward Redeemed!",
            description: `${redeemedItem?.name} — ${(data as any)?.redemption?.status === "pending" ? "Pending admin approval" : "Check your redemption history"}`,
          });
        }
      }
    },
    onError: (err: any) => {
      toast({ title: "Redemption failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const walletBalance = shopData?.walletBalance ?? 0;
  const allItems = shopData?.items ?? [];

  const filtered = useMemo(() => {
    let list = allItems;
    if (activeCat) list = list.filter(r => r.item.categoryId === activeCat);
    if (maxTokens) list = list.filter(r => r.item.tokenPrice <= maxTokens);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.item.name.toLowerCase().includes(q) || r.item.shortDesc.toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.item.featured ? 1 : 0) - (a.item.featured ? 1 : 0));
  }, [allItems, activeCat, maxTokens, search]);

  const featured = useMemo(() => allItems.filter(r => r.item.featured).slice(0, 4), [allItems]);

  // Next item user is closest to affording
  const nextGoal = useMemo(() => {
    const affordable = allItems.filter(r => {
      const cost = r.item.salePriceTokens ?? r.item.tokenPrice;
      return cost > walletBalance;
    });
    if (!affordable.length) return null;
    return affordable.reduce((a, b) => {
      const ca = (a.item.salePriceTokens ?? a.item.tokenPrice) - walletBalance;
      const cb = (b.item.salePriceTokens ?? b.item.tokenPrice) - walletBalance;
      return ca < cb ? a : b;
    });
  }, [allItems, walletBalance]);

  function canAfford(item: RewardItem) {
    return walletBalance >= (item.salePriceTokens ?? item.tokenPrice);
  }

  function affordabilityPct(item: RewardItem) {
    const cost = item.salePriceTokens ?? item.tokenPrice;
    return Math.min(100, Math.round((walletBalance / cost) * 100));
  }

  const needsShipping = (item: RewardItem | null) =>
    item?.deliveryType === "manual" && !(item as any).createsInvoiceCredit && !(item as any).createsServiceCredit;

  function openRedeem(item: RewardItem) {
    if (!canAfford(item)) {
      const cost = item.salePriceTokens ?? item.tokenPrice;
      const need = cost - walletBalance;
      toast({ title: "Not enough JCMOVES", description: `You need ${formatTokens(Math.ceil(need))} more tokens`, variant: "destructive" });
      return;
    }
    // Pre-fill shipping from user profile
    const fullName = [(user as any)?.firstName, (user as any)?.lastName].filter(Boolean).join(" ");
    setShipName(fullName);
    setShipPhone((user as any)?.phone || "");
    setShipOption("pickup");
    setShipStreet("");
    setShipCity("");
    setShipState("");
    setShipZip("");
    setRedeemItem(item);
  }

  function buildRedemptionNotes(): string {
    if (!needsShipping(redeemItem)) return userNotes;
    let shippingLine = "";
    if (shipOption === "pickup") {
      shippingLine = "📍 DELIVERY: FREE Local Pickup — Ironwood, MI";
    } else {
      const addr = [shipStreet, shipCity, shipState, shipZip].filter(Boolean).join(", ");
      shippingLine = `📦 DELIVERY: Ship to Home — ${shipName || "(no name)"}, ${addr || "(no address)"}, Phone: ${shipPhone || "(no phone)"}`;
    }
    return [shippingLine, userNotes.trim()].filter(Boolean).join("\n\n");
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Auto-Booking Confirmation Banner */}
      {autoBookingLeadId && (
        <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎁</span>
              <div>
                <p className="font-semibold text-orange-400 text-sm">Service Request Submitted!</p>
                <p className="text-xs text-foreground/70">Your reward discount has been applied and your booking is in our pipeline. We'll be in touch to confirm your date.</p>
              </div>
            </div>
            <a href={`/lead/${autoBookingLeadId}`} className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-orange-600 transition-colors whitespace-nowrap">
              View Booking →
            </a>
          </div>
        </div>
      )}
      {/* Hero */}
      <div className="bg-gradient-to-br from-yellow-600/20 via-orange-600/10 to-background border-b border-border px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-5 w-5 text-yellow-500" />
                <h1 className="text-xl font-bold">JCMOVES Rewards Marketplace</h1>
              </div>
              <p className="text-sm text-muted-foreground">Spend your tokens on real local rewards, service credits & gift cards</p>
              {/* Tier Progress */}
              <div className={`mt-3 rounded-lg border ${tierConfig.border} ${tierConfig.bg} px-3 py-2 inline-flex flex-col gap-1.5 min-w-[220px]`}>
                <div className="flex items-center justify-between gap-4">
                  <span className={`text-xs font-semibold flex items-center gap-1 ${tierConfig.color}`}>
                    {tierConfig.emoji} {tierConfig.label} Member
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">· {Math.round(tierConfig.rate * 100)}% back</span>
                  </span>
                  {nextTierConfig && (
                    <span className="text-[10px] text-muted-foreground">{nextTierConfig.emoji} {nextTierConfig.label} at ${nextTierConfig.minSpend.toLocaleString()}</span>
                  )}
                </div>
                {nextTierConfig && (
                  <>
                    <Progress value={tierProgress} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">
                      ${totalSpend.toFixed(0)} spent · ${(nextTierConfig.minSpend - totalSpend).toFixed(0)} more to unlock {nextTierConfig.label}
                    </p>
                  </>
                )}
                {!nextTierConfig && (
                  <p className="text-[10px] text-purple-400">You're at the top tier — enjoy 100 JCMOVES per $1 spent!</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="bg-card border border-border rounded-xl px-4 py-3 text-center min-w-[120px]">
                  <div className="text-xs text-muted-foreground mb-0.5">Your Balance</div>
                  <div className="flex items-center justify-center gap-1.5">
                    <Coins className="h-4 w-4 text-yellow-500" />
                    <span className="text-lg font-bold text-yellow-500">{formatTokens(Math.floor(walletBalance))}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">JCMOVES</div>
                </div>
                {nextGoal && (
                  <div className="bg-card border border-border rounded-xl px-4 py-3 min-w-[160px]">
                    <div className="text-xs text-muted-foreground mb-1">Next Goal</div>
                    <div className="text-xs font-semibold truncate max-w-[140px]">{nextGoal.item.name}</div>
                    <Progress
                      value={affordabilityPct(nextGoal.item)}
                      className="h-1.5 mt-1.5 mb-1"
                    />
                    <div className="text-[10px] text-yellow-500">
                      {formatTokens(Math.ceil((nextGoal.item.salePriceTokens ?? nextGoal.item.tokenPrice) - walletBalance))} more needed
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSimOpen(true)}
                className="flex items-center justify-center gap-2 text-xs bg-card border border-yellow-500/30 hover:border-yellow-500/60 text-yellow-400 hover:text-yellow-300 rounded-lg px-3 py-2 transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Earnings Simulator
              </button>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab("shop")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === "shop" ? "bg-yellow-500 text-black" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              <ShoppingBag className="h-4 w-4" /> Browse Rewards
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === "history" ? "bg-yellow-500 text-black" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
            >
              <History className="h-4 w-4" /> My Redemptions
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* Shop tab */}
        {activeTab === "shop" && (
          <>

            {/* ⚡ Quantum Spin Feature Card */}
            {!search && !activeCat && (
              <div className="mb-6 relative overflow-hidden rounded-2xl border border-orange-500/25"
                style={{ background: "linear-gradient(135deg, #0c0a09 0%, #1c0a00 50%, #0c0a09 100%)" }}>
                {/* Background glow effect */}
                <div className="absolute inset-0 opacity-30"
                  style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(249,115,22,0.4) 0%, transparent 60%)" }} />
                <div className="relative p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Left: title + description */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-black text-white tracking-tight">Quantum Spin</span>
                        <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider">NEW</span>
                      </div>
                      <p className="text-xs text-orange-300/70 mb-3 italic">Instant rewards. Fast reveal. Big jackpots.</p>
                      {/* Jackpot meters */}
                      <div className="flex gap-2">
                        <div className="bg-orange-950/80 border border-orange-500/20 rounded-lg px-3 py-1.5 text-center min-w-[85px]">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Flame className="h-2.5 w-2.5 text-orange-400" />
                            <span className="text-[9px] font-bold text-orange-300 uppercase tracking-wider">Mini</span>
                          </div>
                          <div className="text-sm font-black text-orange-400 tabular-nums">
                            {miniJackpot ? parseInt(String(miniJackpot.current_value)).toLocaleString() : "5,000"}
                          </div>
                        </div>
                        <div className="bg-yellow-950/80 border border-yellow-500/20 rounded-lg px-3 py-1.5 text-center min-w-[85px]">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Crown className="h-2.5 w-2.5 text-yellow-400" />
                            <span className="text-[9px] font-bold text-yellow-300 uppercase tracking-wider">Major</span>
                          </div>
                          <div className="text-sm font-black text-yellow-400 tabular-nums">
                            {majorJackpot ? parseInt(String(majorJackpot.current_value)).toLocaleString() : "50,000"}
                          </div>
                        </div>
                        <div className="flex flex-col justify-center">
                          <div className="text-[9px] text-muted-foreground/60">Spin cost</div>
                          <div className="text-sm font-black text-orange-400">100</div>
                          <div className="text-[9px] text-orange-600 font-bold">JCMOVES</div>
                        </div>
                      </div>
                    </div>
                    {/* Right: CTA */}
                    <div className="flex flex-col items-center gap-1.5">
                      <Button
                        className="font-black text-black h-12 px-6 shrink-0"
                        style={{
                          background: "linear-gradient(135deg, #f97316, #eab308, #f97316)",
                          boxShadow: "0 0 20px rgba(249,115,22,0.5)",
                        }}
                        onClick={() => setDirectSpinOpen(true)}
                        disabled={!user}
                      >
                        <Zap className="h-4 w-4 mr-1.5" />
                        Open Quantum Spin
                      </Button>
                      <p className="text-[10px] text-muted-foreground/50">Fast 1.5 second instant reveal</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Featured strip */}
            {featured.length > 0 && !search && !activeCat && (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-yellow-500" /> Featured Rewards
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {featured.map(({ item, category }) => (
                    <button
                      key={item.id}
                      onClick={() => openRedeem(item)}
                      className="bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/30 rounded-xl p-3 text-left hover:border-yellow-500/60 transition-all group"
                    >
                      <div className="text-2xl mb-2">{category?.icon ?? "🎁"}</div>
                      <div className="text-xs font-bold leading-tight mb-1 group-hover:text-yellow-400 transition-colors">{item.name}</div>
                      <div className="flex items-center gap-1">
                        <Coins className="h-3 w-3 text-yellow-500" />
                        <span className="text-xs font-bold text-yellow-500">{formatTokens(item.salePriceTokens ?? item.tokenPrice)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
              <button
                onClick={() => setActiveCat(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${!activeCat ? "bg-yellow-500 text-black border-yellow-500" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                All
              </button>
              {(categories ?? []).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${activeCat === cat.id ? "bg-yellow-500 text-black border-yellow-500" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  <span>{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Search + filter bar */}
            <div className="flex gap-2 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rewards…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <select
                className="h-9 px-3 rounded-md border border-border bg-card text-sm text-foreground"
                value={maxTokens ?? ""}
                onChange={e => setMaxTokens(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">All prices</option>
                <option value="500">Under 500</option>
                <option value="1000">Under 1K</option>
                <option value="5000">Under 5K</option>
                <option value="10000">Under 10K</option>
                <option value="25000">Under 25K</option>
              </select>
            </div>

            {/* Item grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-48" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No rewards found. Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filtered.map(({ item, category }) => {
                  const cost = item.salePriceTokens ?? item.tokenPrice;
                  const affordable = canAfford(item);
                  const pct = affordabilityPct(item);
                  const onSale = !!item.salePriceTokens;
                  const outOfStock = item.inventory !== null && item.inventory === 0;

                  return (
                    <div
                      key={item.id}
                      className={`bg-card border rounded-xl overflow-hidden flex flex-col transition-all group hover:shadow-lg hover:shadow-yellow-500/5 ${item.featured ? "border-yellow-500/40" : "border-border"} ${outOfStock ? "opacity-60" : ""}`}
                    >
                      {/* Card header */}
                      <div className="relative h-24 bg-gradient-to-br from-card to-accent/30 flex items-center justify-center">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-4xl">{category?.icon ?? "🎁"}</span>
                        )}
                        <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                          {item.featured && <span className="bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">★ Featured</span>}
                          {item.promoBadge && <span className="bg-orange-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.promoBadge}</span>}
                          {onSale && <span className="bg-red-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">SALE</span>}
                          {outOfStock && <span className="bg-gray-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">Sold Out</span>}
                          {item.isLimitedTime && <span className="bg-purple-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">⏰ Limited</span>}
                          {item.tierRequired !== "none" && (
                            <span className="bg-blue-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize">{item.tierRequired}+</span>
                          )}
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="p-3 flex-1 flex flex-col">
                        <div className="text-xs text-muted-foreground mb-0.5">{category?.name ?? ""}</div>
                        <h3 className="text-sm font-bold leading-tight mb-1 group-hover:text-yellow-400 transition-colors">{item.name}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-2">{item.shortDesc}</p>

                        {/* Price */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5 text-yellow-500" />
                            <span className="text-sm font-bold text-yellow-500">{formatTokens(cost)}</span>
                            {onSale && (
                              <span className="text-xs text-muted-foreground line-through">{formatTokens(item.tokenPrice)}</span>
                            )}
                          </div>
                          {item.cashValue && (
                            <span className="text-[10px] text-muted-foreground">(${item.cashValue} value)</span>
                          )}
                        </div>

                        {/* Affordability progress */}
                        {!affordable && (
                          <div className="mb-2">
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                              <span>Progress</span>
                              <span className="text-yellow-500">{formatTokens(Math.ceil(cost - walletBalance))} needed</span>
                            </div>
                            <Progress value={pct} className="h-1.5 bg-muted" />
                          </div>
                        )}

                        {/* Fulfillment type badge + expiry */}
                        <div className="flex items-center justify-between mb-2">
                          {(() => {
                            const badge = getFulfillmentBadge(item);
                            return badge ? (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.className}`}>{badge.label}</span>
                            ) : <span />;
                          })()}
                          {item.expirationDays && (
                            <span className="text-[10px] text-muted-foreground">{item.expirationDays}d expiry</span>
                          )}
                        </div>

                        <Button
                          size="sm"
                          className={`w-full h-8 text-xs font-bold transition-all ${
                            outOfStock
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : affordable
                                ? "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black"
                                : "bg-card border border-border text-muted-foreground"
                          }`}
                          disabled={outOfStock}
                          onClick={() => openRedeem(item)}
                        >
                          {outOfStock ? "Out of Stock" : affordable ? (
                            <><Gift className="h-3 w-3 mr-1" />{getCtaLabel(item)}</>
                          ) : (
                            <><ChevronRight className="h-3 w-3 mr-1" />Need {formatTokens(Math.ceil(cost - walletBalance))} more</>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {!myRedemptions || myRedemptions.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">No redemptions yet</p>
                <p className="text-xs mt-1">Start earning JCMOVES and redeem your first reward!</p>
                <Button onClick={() => setActiveTab("shop")} className="mt-4 bg-yellow-500 hover:bg-yellow-600 text-black font-bold">
                  Browse Rewards
                </Button>
              </div>
            ) : (
              myRedemptions.map(r => {
                const isCoupon = !!r.couponCode;
                if (isCoupon) {
                  // ── Physical Coupon Card ──
                  const isCopied = copiedCode === r.couponCode;
                  return (
                    <div
                      key={r.id}
                      className="relative overflow-hidden rounded-2xl border-2 border-dashed border-purple-500/50"
                      style={{
                        background: "linear-gradient(135deg, #1e0a3c 0%, #0d0020 50%, #1a0030 100%)",
                        boxShadow: "0 0 20px rgba(147,51,234,0.15)",
                      }}
                    >
                      {/* Decorative perforations left */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-background rounded-r-full" />
                      {/* Decorative perforations right */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-background rounded-l-full" />

                      <div className="px-7 py-4">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                              <Ticket className="h-4.5 w-4.5 text-purple-400" />
                            </div>
                            <div>
                              <div className="text-xs font-black text-purple-300 uppercase tracking-wider">🎟️ Your Coupon</div>
                              <div className="text-sm font-bold text-white leading-tight">{r.itemName}</div>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[r.status] ?? STATUS_COLORS.pending}`}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </div>

                        {/* Promo code box */}
                        <div
                          className="bg-black/40 border border-purple-500/30 rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-3 cursor-pointer hover:border-purple-500/60 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(r.couponCode!);
                            setCopiedCode(r.couponCode!);
                            setTimeout(() => setCopiedCode(null), 2500);
                          }}
                        >
                          <div>
                            <div className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-0.5">Promo Code</div>
                            <div className="text-xl font-black text-white tracking-widest font-mono">{r.couponCode}</div>
                          </div>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${isCopied ? "bg-green-500/20 border-green-500/40" : "bg-purple-500/20 border-purple-500/30"}`}>
                            {isCopied
                              ? <Check className="h-4 w-4 text-green-400" />
                              : <Copy className="h-4 w-4 text-purple-400" />
                            }
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] text-purple-500/60">
                            {new Date(r.createdAt).toLocaleDateString()} · {r.tokenCost.toLocaleString()} JCMOVES
                          </div>
                          <a
                            href="/book"
                            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Book with this code
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Standard Redemption Card ──
                return (
                  <div key={r.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                      <Gift className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.itemName}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()} • {r.tokenCost.toLocaleString()} JCMOVES
                      </div>
                      {r.userNotes && <div className="text-xs text-muted-foreground italic mt-0.5">"{r.userNotes}"</div>}
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status] ?? STATUS_COLORS.pending}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Redeem confirmation dialog */}
      <Dialog open={!!redeemItem} onOpenChange={open => { if (!open) { setRedeemItem(null); setUserNotes(""); setScheduledDate(""); setShipOption("pickup"); setShipStreet(""); setShipCity(""); setShipState(""); setShipZip(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-yellow-500" />
              Confirm Redemption
            </DialogTitle>
          </DialogHeader>
          {redeemItem && (
            <div className="space-y-4 py-2">
              {/* Item summary */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {redeemItem.image && (
                    <img src={redeemItem.image} alt={redeemItem.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm leading-tight mb-0.5">{redeemItem.name}</div>
                    <div className="text-xs text-muted-foreground mb-2">{redeemItem.shortDesc}</div>
                    {(() => {
                      const badge = getFulfillmentBadge(redeemItem);
                      return badge ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.className}`}>{badge.label}</span> : null;
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-yellow-500/20">
                  <Coins className="h-4 w-4 text-yellow-500" />
                  <span className="font-bold text-yellow-500">{formatTokens(redeemItem.salePriceTokens ?? redeemItem.tokenPrice)} JCMOVES</span>
                  <span className="text-xs text-muted-foreground ml-auto">Balance after: {formatTokens(Math.floor(walletBalance - (redeemItem.salePriceTokens ?? redeemItem.tokenPrice)))}</span>
                </div>
              </div>

              {/* How it works */}
              {redeemItem.fulfillmentNote && (
                <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-blue-300 mb-0.5">How it works</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{redeemItem.fulfillmentNote}</p>
                  </div>
                </div>
              )}

              {/* ── Shipping Options (for manual-delivery gift cards) ── */}
              {needsShipping(redeemItem) && (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    📦 How would you like to receive your reward?
                  </label>

                  {/* Radio buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShipOption("pickup")}
                      className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                        shipOption === "pickup"
                          ? "border-green-500 bg-green-500/10"
                          : "border-border bg-card hover:border-green-500/50"
                      }`}
                    >
                      <div className="text-xs font-black text-green-400 mb-0.5">📍 Local Pickup</div>
                      <div className="text-[10px] text-muted-foreground">FREE — Ironwood, MI</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShipOption("ship")}
                      className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                        shipOption === "ship"
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-border bg-card hover:border-blue-500/50"
                      }`}
                    >
                      <div className="text-xs font-black text-blue-400 mb-0.5">🚚 Ship to Me</div>
                      <div className="text-[10px] text-muted-foreground">Fill in address below</div>
                    </button>
                  </div>

                  {/* Shipping address form */}
                  {shipOption === "ship" && (
                    <div className="space-y-2 bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-2">Shipping Details</p>
                      <Input
                        placeholder="Full Name *"
                        value={shipName}
                        onChange={e => setShipName(e.target.value)}
                        className="h-8 text-sm bg-card border-border"
                      />
                      <Input
                        placeholder="Street Address *"
                        value={shipStreet}
                        onChange={e => setShipStreet(e.target.value)}
                        className="h-8 text-sm bg-card border-border"
                      />
                      <div className="grid grid-cols-5 gap-2">
                        <Input
                          placeholder="City *"
                          value={shipCity}
                          onChange={e => setShipCity(e.target.value)}
                          className="h-8 text-sm col-span-2 bg-card border-border"
                        />
                        <Input
                          placeholder="ST"
                          value={shipState}
                          onChange={e => setShipState(e.target.value.toUpperCase().slice(0, 2))}
                          className="h-8 text-sm col-span-1 bg-card border-border"
                          maxLength={2}
                        />
                        <Input
                          placeholder="Zip *"
                          value={shipZip}
                          onChange={e => setShipZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                          className="h-8 text-sm col-span-2 bg-card border-border"
                          maxLength={5}
                        />
                      </div>
                      <Input
                        placeholder="Phone Number"
                        value={shipPhone}
                        onChange={e => setShipPhone(e.target.value)}
                        className="h-8 text-sm bg-card border-border"
                        type="tel"
                      />
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        Your info is sent directly to our team for fastest processing.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Schedule date for service/schedule items */}
              {(redeemItem.requiresSchedule || redeemItem.scheduleRequired || redeemItem.createsServiceCredit) ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Preferred service date (optional)</label>
                  <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="h-9" />
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Additional notes (optional)</label>
                <Textarea
                  placeholder="Any specific instructions or requests…"
                  value={userNotes}
                  onChange={e => setUserNotes(e.target.value)}
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRedeemItem(null); setUserNotes(""); setScheduledDate(""); }}>Cancel</Button>
            <Button
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold"
              onClick={() => {
                const notes = buildRedemptionNotes();
                const hasShipAddress = shipOption === "ship" && needsShipping(redeemItem);
                if (hasShipAddress && (!shipName.trim() || !shipStreet.trim() || !shipCity.trim() || !shipZip.trim())) {
                  toast({ title: "Address required", description: "Please fill in your full shipping address for home delivery.", variant: "destructive" });
                  return;
                }
                redeemMutation.mutate({ itemId: redeemItem!.id, userNotes: notes || undefined, scheduledDate: scheduledDate || undefined });
              }}
              disabled={redeemMutation.isPending}
            >
              {redeemMutation.isPending
                ? <><Zap className="h-4 w-4 animate-spin mr-2" />Processing…</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" />{redeemItem ? getCtaLabel(redeemItem) : "Confirm"}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Labor Calculator Dialog */}
      <LaborCalculatorDialog
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        walletBalance={walletBalance}
      />

      {/* Spin Wheel — auto-launches after a Spin Wheel Entry redemption */}
      <SpinWheelDialog
        open={spinWheelOpen}
        redemptionId={spinRedemptionId}
        onClose={() => {
          setSpinWheelOpen(false);
          setSpinRedemptionId(undefined);
        }}
      />

      {/* Direct spin — opened from the Spin the Wheel feature card (costs 100 JCMOVES) */}
      <SpinWheelDialog
        open={directSpinOpen}
        onClose={() => setDirectSpinOpen(false)}
      />

      {/* Earnings Simulator Dialog */}
      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-yellow-400" />
              JCMOVES Earnings Simulator
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              See how many JCMOVES tokens you'd earn on any job — and what higher tiers unlock for you.
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                placeholder="Enter job price (e.g. 500)"
                value={simAmount}
                onChange={e => setSimAmount(e.target.value)}
                className="pl-7"
                min="0"
              />
            </div>

            {simTokens ? (
              <div className="space-y-2">
                {(Object.keys(LOYALTY_TIERS) as LoyaltyTierKey[]).map(tier => {
                  const t = LOYALTY_TIERS[tier];
                  const tokens = simTokens[tier];
                  const isCurrentTier = tier === userTier;
                  return (
                    <div
                      key={tier}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-all ${isCurrentTier ? `${t.border} ${t.bg}` : 'border-border bg-card/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{t.emoji}</span>
                        <div>
                          <span className={`text-sm font-semibold ${isCurrentTier ? t.color : 'text-muted-foreground'}`}>
                            {t.label}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1.5">{Math.round(t.rate * 100)}% · {t.tokensPerDollar}/$ </span>
                          {isCurrentTier && <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 h-4">YOU</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Coins className="h-3.5 w-3.5 text-yellow-500" />
                        <span className={`font-bold text-sm ${isCurrentTier ? 'text-yellow-400' : 'text-foreground'}`}>
                          {fmtTokens(tokens)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 mt-1">
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400" />
                    Tokens are awarded after the job is marked complete. Your tier upgrades automatically as you spend more with JC ON THE MOVE.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card/50 px-4 py-6 text-center">
                <Coins className="h-8 w-8 text-yellow-500/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Enter a job price above to see your estimated token earnings across all tiers.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {[100, 250, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setSimAmount(String(amt))}
                      className="bg-muted/50 hover:bg-muted rounded-md px-2 py-1.5 transition-colors"
                    >
                      ${amt.toLocaleString()} job → {fmtTokens(calculateJCMovesReward(amt, userTier))} tokens
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimOpen(false)}>Close</Button>
            <Button className="bg-yellow-500 text-black hover:bg-yellow-400" onClick={() => { setSimOpen(false); setActiveTab("shop"); }}>
              Browse Rewards
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
