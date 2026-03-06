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
  Wrench, Crown, ShoppingBag, History
} from "lucide-react";
import { SpinWheelDialog } from "@/components/spin-wheel";

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
}

const CATEGORY_ICONS: Record<string, any> = {
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
  const lastRedeemedItemRef = useRef<RewardItem | null>(null);

  const { data: shopData, isLoading } = useQuery<{ items: ItemRow[]; walletBalance: number }>({
    queryKey: ["/api/reward-shop/items"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: categories } = useQuery<RewardCategory[]>({
    queryKey: ["/api/reward-shop/categories"],
    enabled: !!user,
  });

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
        toast({
          title: "🎁 Reward Redeemed!",
          description: `${redeemedItem?.name} — ${(data as any)?.redemption?.status === "pending" ? "Pending admin approval" : "Check your redemption history"}`,
        });
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

  function openRedeem(item: RewardItem) {
    if (!canAfford(item)) {
      const cost = item.salePriceTokens ?? item.tokenPrice;
      const need = cost - walletBalance;
      toast({ title: "Not enough JCMOVES", description: `You need ${formatTokens(Math.ceil(need))} more tokens`, variant: "destructive" });
      return;
    }
    setRedeemItem(item);
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero */}
      <div className="bg-gradient-to-br from-yellow-600/20 via-orange-600/10 to-background border-b border-border px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-5 w-5 text-yellow-500" />
                <h1 className="text-xl font-bold">JCMOVES Rewards Marketplace</h1>
              </div>
              <p className="text-sm text-muted-foreground">Spend your tokens on real local rewards, service credits & gift cards</p>
            </div>
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
                <div className="bg-card border border-border rounded-xl px-4 py-3 text-center min-w-[140px]">
                  <div className="text-xs text-muted-foreground mb-0.5">Almost There</div>
                  <div className="text-xs font-semibold truncate max-w-[130px]">{nextGoal.item.name}</div>
                  <div className="text-[10px] text-yellow-500 mt-0.5">
                    {formatTokens(Math.ceil((nextGoal.item.salePriceTokens ?? nextGoal.item.tokenPrice) - walletBalance))} more needed
                  </div>
                </div>
              )}
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
              myRedemptions.map(r => (
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
              ))
            )}
          </div>
        )}
      </div>

      {/* Redeem confirmation dialog */}
      <Dialog open={!!redeemItem} onOpenChange={open => !open && setRedeemItem(null)}>
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

              {/* Schedule date for service/schedule items */}
              {(redeemItem.requiresSchedule || redeemItem.scheduleRequired || redeemItem.createsServiceCredit) ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Preferred service date (optional)</label>
                  <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="h-9" />
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes for crew (optional)</label>
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
            <Button variant="outline" onClick={() => setRedeemItem(null)}>Cancel</Button>
            <Button
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold"
              onClick={() => redeemMutation.mutate({ itemId: redeemItem!.id, userNotes: userNotes || undefined, scheduledDate: scheduledDate || undefined })}
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

      {/* Spin Wheel — auto-launches after a Spin Wheel Entry redemption */}
      <SpinWheelDialog
        open={spinWheelOpen}
        redemptionId={spinRedemptionId}
        onClose={() => {
          setSpinWheelOpen(false);
          setSpinRedemptionId(undefined);
        }}
      />
    </div>
  );
}
